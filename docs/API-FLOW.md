# API flow - every call, and why it exists

Four flows. The browser is in none of them - it only ever talks to this app's own route handlers, so the API key never leaves the server.

```
browser ──▶ route handler (BFF) ──▶ adapter ──▶ Nash
                  key lives here      knows Nash's shape
```

---

## The whole picture

```mermaid
flowchart LR
  classDef br   fill:#0f172a,stroke:#020617,stroke-width:2px,color:#f8fafc
  classDef bff  fill:#7c3aed,stroke:#3b0764,stroke-width:2px,color:#ffffff
  classDef mod  fill:#0e7490,stroke:#083344,stroke-width:2px,color:#ffffff
  classDef nash fill:#1d4ed8,stroke:#172554,stroke-width:2px,color:#ffffff
  classDef seed fill:#b45309,stroke:#451a03,stroke-width:2px,color:#ffffff

  subgraph browser["Browser - no key, no CORS, never touches Nash"]
    queue["Queue<br/>app/page.tsx"]:::br
    pick["Pick screen<br/>pick-client.tsx"]:::br
  end

  subgraph bff["Route handlers - the key stays here"]
    rOrders["GET /api/orders"]:::bff
    rOrder["GET /api/orders/[orderId]"]:::bff
    rPick["POST /api/pick"]:::bff
    rHealth["GET /api/health"]:::bff
  end

  subgraph lib["Modules"]
    adapter["lib/adapter.ts<br/>the three-way join<br/>+ channel normalisation"]:::mod
    write["lib/pick-write.ts<br/>outcomes to payload"]:::mod
    client["lib/nash.ts<br/>auth, base URL, envelopes"]:::mod
  end

  subgraph nashapi["Nash sandbox"]
    eOrders["GET /orders"]:::nash
    eOrder["GET /order/{id}"]:::nash
    eProducts["GET /products"]:::nash
    eInv["GET /inventory"]:::nash
    ePatch["PATCH /order/{id}"]:::nash
    eStores["GET /store_locations"]:::nash
  end

  seed["scripts/seed<br/>one-off, before the demo"]:::seed

  queue --> rOrders --> adapter
  pick  --> rOrder  --> adapter
  pick  --> rPick   --> write

  adapter --> client
  write   --> client
  rHealth --> client

  client --> eOrders & eOrder & eProducts & eInv & ePatch & eStores

  seed -.->|"POST /products ×14"| eProducts
  seed -.->|"POST /inventory ×14"| eInv
  seed -.->|"POST /order ×4"| eOrder
```

---

## Flow 1 - the queue

`GET /api/orders` → `getQueue()`

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant R as GET /api/orders
  participant A as adapter
  participant N as Nash

  B->>R: fetch queue
  R->>A: getQueue()
  A->>N: GET /orders?limit=50
  N-->>A: { results[] } - summaries only,<br/>no items, no requirements
  Note over A: filter: has externalId,<br/>not archived / cancelled<br/>dedupe on externalId
  loop once per surviving order
    A->>N: GET /order/{id}
    N-->>A: full order - requirements, items[], subItems[]
  end
  Note over A: keep only requirements ⊇ pick_and_pack<br/>channel ← tags "channel:*"<br/>itemCount ← subItems.length
  A-->>R: QueueOrder[]
  R-->>B: JSON
```

**Why the second call exists.** `GET /orders` is a summary endpoint - it returns no `items` and no `requirements`. Item count and the pick-and-pack filter both need the detail, so the queue costs `1 + N` calls.

**At four orders that is five calls.** It is the first thing that changes at real volume, and the fix is a list endpoint that returns `requirements` and an item count.

---

## Flow 2 - the pick run, and the three-way join

`GET /api/orders/[orderId]` → `getPickRun()`

**This is the core of the app.** Three resources are needed to render one pick row, and they are fetched in parallel.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant R as GET /api/orders/[orderId]
  participant A as adapter
  participant N as Nash

  B->>R: open order
  R->>A: getPickRun(orderId)
  par fetched together, not in sequence
    A->>N: GET /order/{orderId}
    N-->>A: items[].subItems[] - WHAT was bought
  and
    A->>N: GET /products?limit=500
    N-->>A: name, image, barcode, WEIGHTED - WHAT IT IS
  and
    A->>N: GET /inventory?externalStoreLocationId=001&limit=500
    N-->>A: location { aisle, bay, shelf }, quantity - WHERE IT IS
  end
  Note over A: index catalog by sku<br/>index inventory by externalProductId
  Note over A: subItem.sku → product<br/>product.externalIdentifier → inventory
  Note over A: channel resolved and DROPPED<br/>PickRow has no channel field
  A-->>R: PickRun { rows[] }
  R-->>B: JSON
```

**The join is two hops, not one.**

```
subItem.sku ──▶ product ──▶ product.externalIdentifier ──▶ inventory ──▶ location
```

Inventory keys on the product's *external* id, not its Nash id. That mismatch is the kind of thing that returns `200` with an empty result rather than an error, so a join miss is logged rather than swallowed - an empty aisle column reads as missing data, not as a bug.

**The catalog is fetched whole and indexed, not looked up per item.** Per-item lookup would turn one order into a dozen calls. Correct at 14 products, wrong at 40,000 - at which point `GET /products` takes a SKU filter and this is a one-function change.

---

## Flow 3 - writing the outcome back

`POST /api/pick` → `writeRun()`

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant R as POST /api/pick
  participant W as pick-write
  participant N as Nash

  B->>R: outcomes[] for the whole run
  R->>W: writeRun(orderId, outcomes)
  rect rgb(254, 242, 242)
    Note over W,N: PATCH REPLACES items[], it does not merge.<br/>Sending a partial array destroys the rest of the basket.
    W->>N: GET /order/{orderId}
    N-->>N: current items[] read first
  end
  Note over W: merge outcomes onto subItems[].metadata<br/>pick_status, picked_quantity,<br/>requested_quantity, picked_weight
  W->>N: PATCH /order/{orderId}
  Note right of W: items: FULL replacement array<br/>orderMetadata: pick_status,<br/>pick_fill_rate, pick_completed_at
  N-->>W: updated order + portalUrl
  W-->>R: { written, fillRate, pickStatus }
  R-->>B: confirmation
```

**Two things here are consequences of what the API actually does, not preferences.**

`pickedItems` does not exist - `updateOrder` rejects it - and order `status` is not writable. So outcomes land on `subItems[].metadata` and the run summary on `orderMetadata`. Completion is `pick_status: items_pick_complete`, which is **this app's convention, not a Nash state**. Dispatch will not trigger off it.

**One PATCH per run, not one per tap.** Because PATCH replaces `items`, a per-tap write would need a read-modify-write cycle every time, and two overlapping taps would lose an outcome. Batching makes the write atomic for the run. The cost: an outcome is not durable until the run completes.

---

## Flow 4 - health

`GET /api/health` proves auth and shows live counts, so "is the data really there" is answerable without opening the portal.

```
GET /store_locations · GET /products · GET /inventory · GET /orders   (parallel)
```

---

## Every endpoint, in one table

| Endpoint | Called by | Per what | Why |
|---|---|---|---|
| `GET /orders?limit=50` | `getQueue` | once per queue load | The order list. Summaries only |
| `GET /order/{id}` | `getQueue` | **once per order** | Summaries carry no `requirements` or `items` |
| `GET /order/{id}` | `getPickRun` | once per pick run | What was bought |
| `GET /products?limit=500` | `getPickRun` | once per pick run | Name, image, barcode, `WEIGHTED` |
| `GET /inventory?externalStoreLocationId` | `getPickRun` | once per pick run | **`location { aisle, bay, shelf }`** and stock |
| `GET /order/{id}` | `writeRun` | once per completion | Must read before PATCH replaces |
| `PATCH /order/{id}` | `writeRun` | **once per run** | Outcomes + run summary |
| `GET /store_locations` | health | on demand | Auth check |
| `POST /products` | seed | ×14, one-off | Catalog |
| `POST /inventory` | seed | ×14, one-off | Per-store location and stock |
| `POST /order` | seed | ×4, one-off | The demo storyline |

**A full run of one four-item order: 5 for the queue, 3 for the pick screen, 2 to write. Ten calls.**

---

## What the API would not let us do

Worth knowing, because it shaped the flows above.

| Wanted | Actual |
|---|---|
| `PATCH { pickedItems }` | `400 Unknown argument 'pickedItems' on field 'NashMutations.updateOrder'` |
| `PATCH { status: "items_pick_complete" }` | `400` - `status` is not an argument on update |
| `PATCH` a single sub-item's `status` or `substitution` | **`200`, silently dropped.** Only `metadata` persists |
| `PATCH` a partial `items` array | Succeeds, and **wipes** every field not sent |
| One list call with items | `GET /orders` is summary-only, hence `1 + N` |

The third row is the dangerous one: a write that reports success and persists nothing looks like a working feature until someone checks the portal.
