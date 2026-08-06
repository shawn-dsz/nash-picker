# Nash API - what I found before writing code

Read-only research against https://docs.usenash.com/. **No writes, no seeding, no portal login.**

---

## Auth

```
Authorization: Bearer <api key>
Nash-Org-Id: <org id>        # required when the account has multiple orgs
```

Both stay server-side. Never in the browser bundle.

---

## The finding that shapes the whole app

**Location is real, and it is structured.**

```json
"location": {
  "aisle": "string | null",   // "The aisle location of the product in the store"
  "bay":   "string | null",
  "shelf": "string | null"
}
```

**But it lives on inventory, not on the order.** The picker screen cannot be built from one call.

```
GET /v1/order/{id}
  items[] { description, count, barcode, weight, valueCents, category, metadata, subItems }
        │
        │  join on barcode / product identifier
        ▼
POST /v1/products                          (catalog)
  { name, sku, description, imageUrls[], weight, dimensions,
    identifiers[{ type: "UPC", value }],
    details.weightedItemInfo { weightPerItem, weightUnit },
    details.sizeSpecification, details.packSizeSpecification }
        │
        │  join on productId + storeLocationId
        ▼
POST /v1/inventory                         (per store)
  { quantity, available, valueCents, currency,
    location { aisle, bay, shelf },
    details.weightedItemInfo { valueCentsPerMeasurementUnit },
    providerConfigs[] }
```

**Three resources to render one row of the pick list.** That join is the core of the adapter, and it is worth saying out loud - *"the order knows what was bought, the catalog knows what it is, the inventory knows where it is in this store. The picker needs all three, so the app owns the join."*

---

## What the data model gives me for free

| Need | Field | Consequence |
|---|---|---|
| Item **name** | `product.name`, `orderItem.description` | R2 |
| Item **image** | `product.imageUrls[]` | The single biggest accuracy aid on a pick screen, and it costs nothing |
| **Quantity** | `orderItem.count` | R2 |
| **Location** | `inventory.location.{aisle,bay,shelf}` | R2, and it makes sequencing possible |
| **Barcode** | `orderItem.barcode`, `product.identifiers[{type:"UPC"}]` | **Scan verification.** Directly answers FreshMart's accuracy pain (P1) |
| Waypoint scanning | `order.pickupBarcodes[]`, `order.dropoffBarcodes[]` | Nash already expects barcode scanning in this workflow |
| **Weight** | `product.weight`, `weightedItemInfo.weightPerItem` + `weightUnit` | See below |
| Price per unit of measure | `inventory.details.weightedItemInfo.valueCentsPerMeasurementUnit` | See below |

### `weightedItemInfo` explains why "partial quantities" is in the brief

A weighted item is deli, produce, meat - **sold by weight, not by unit**. The customer orders 1kg of bananas; the picker puts 0.94kg on the scale. That is not a short pick and it is not a substitution. It is a **partial quantity**, and the price changes with it, which is what `valueCentsPerMeasurementUnit` is for.

**So partial quantity is not an edge case bolted onto the four scenarios - it is the weighted-item flow, and Nash's schema already models it.** A domain with a boolean `picked` flag cannot represent it.

---

## What is NOT in the API - and why that helps the pitch

| Missing | Consequence |
|---|---|
| **No channel or source field on the order** | Candidates: `tags`, `orderMetadata`, `externalGroupId`, `referenceId`. I normalise channel in the adapter |
| **No picking-specific endpoint** | Picking state is mine. Nash gets the outcome, not the keystrokes |
| **No partial-quantity or substitution field** | `subItems` is the nearest thing. Model it locally, push a final update |
| **Order status values not enumerated** | Only `needs_attention` appears in examples. **Ask Kareem** |
| **No documented GET for products or inventory** | Only `POST /v1/products` and `POST /v1/inventory` are in the docs. **This is the biggest unknown - see Q1** |

> **The absence of a channel field is the argument, not a problem.** Nash has no opinion about which channel an order came from, which is exactly why FreshMart's channels ended up on four different systems. Normalising it at the boundary *is* the product.

---

## Endpoints that matter

| | |
|---|---|
| `GET /v1/order/{id}` | Accepts `ord_...` **or** the `externalId`. Returns items, quotes, documents, tags, metadata |
| `PATCH /v1/order/{id}` | Partial update - only provided fields change. Can update `items`, `tags`, `metadata`, `weight`, `dimensions`, `valueCents`. **Likely the completion path** |
| `POST /v1/order` | Create. Includes `pickupStoreLocationId`, `deliveryMode`, `dropoffStartTime`/`EndTime` |
| `POST /v1/products` | Catalog upsert |
| `POST /v1/inventory` | Per-store inventory upsert, **carries `location`** |

**Also present in the nav and worth knowing exists:** Store Locations, Zones, Delivery Windows, Webhooks, **Event Timeline**, Optimization Strategies, Dispatch Strategies, Routes, Jobs.

`Event Timeline` is the observability story - *"Nash already keeps a timeline per order; my events are the picking half of that same story."*

---

## Questions for Kareem - now ranked, and Q1 is new

| # | Question | Why it gates the build |
|---|---|---|
| **Q1** | **Is there a read endpoint for products and inventory, or only the POST upserts?** | If read-only access does not exist, I must seed the catalog and hold my own copy - which changes step 2 of the plan entirely |
| **Q2** | Is the sandbox catalog already seeded with products, inventory and `location` values, or do I populate it? | Decides whether sequencing is nearly free or needs invented data |
| **Q3** | Where should channel live - `tags`, `orderMetadata`, or something internal? | P4/P5, the unified view |
| **Q4** | How should picking completion be signalled - `PATCH /v1/order`, a status transition, or something not in the docs? | R4 |
| **Q5** | What are the valid order status values? | Only `needs_attention` is documented |
| **Q6** | Any internal picking functionality not exposed in the docs? | The brief explicitly invites this |
| **Q7** | Anything you would consider out of scope or over-engineered? | Prioritisation |

---

## Consequences for the plan

1. **A1 is answered: location is structured.** Sequencing moves from "cut it" to "stretch goal, cheap if the data is seeded"
2. **Aisle, bay and shelf are strings, not integers.** `"A12"` will not sort numerically. Serpentine routing needs a parse-and-collate step, and a null-safe fallback to original order. Name the trade-off rather than pretending strings sort
3. **Scan verification is nearly free and directly answers P1.** Barcodes are on the order item *and* the product
4. **Item images are free** and are the highest-value pixel on a pick screen
5. **The adapter owns a three-way join.** It is the most likely place to lose an hour, so it gets built first, against real payloads
6. **Partial quantity must be modelled as a quantity, not a status.** `weightedItemInfo` proves the intent
