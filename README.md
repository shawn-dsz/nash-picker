# OnePick

A lightweight web picking app for FreshMart, built on Nash's `pick_and_pack` model.

**Live:** https://onepick-production.up.railway.app
**Health:** https://onepick-production.up.railway.app/api/health

---

## The problem

A picker in a FreshMart store today carries three devices - one for Uber, one for
DoorDash, one for the first-party site. Three queues, three interfaces, and no
single view of what the store owes anyone.

> "Orders come from multiple channels managed on different systems. Our pickers
> juggle multiple screens and we have no unified view of fulfillment."

**OnePick is one web app, one queue, one device.**

---

## The one decision everything else follows from

Nash already models picking end to end. The exercise's four scenarios map exactly
onto statuses that already exist:

| Scenario | Nash status |
|---|---|
| Mark picked | `picked` |
| Partial quantity | `partially_picked` |
| Out of stock | `not_picked` |
| Substitution | `substituted` |

So this is a **mapping problem, not a domain design problem**. OnePick drives
Nash's model rather than inventing a parallel one, which is also why it is
**stateless** - there is no database, Nash holds the state, and closing the tab
loses nothing.

---

## Docs

Read in this order.

| | |
|---|---|
| [`docs/plan.html`](docs/plan.html) | The shareable one-pager. Problem, scope, storyline, metrics |
| [`docs/dataflow.html`](docs/dataflow.html) | Where every field comes from and where every outcome goes |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The shape, key decisions, analytics, NFRs, tradeoffs, current state |
| [`docs/SCOPE.md`](docs/SCOPE.md) | What is built, what is stretch, what is deliberately not built - and what would change my mind |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | D1-D9 with rationale, what was rejected, and how reversible each one is |
| [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) | Seven levels, each ending in something demonstrable |
| [`AGENTS.md`](AGENTS.md) | Working agreements - micro-commits, scope discipline, boundaries |

The HTML docs are self-contained. Open them in a browser.

---

## Running it

```bash
npm install
cp .env.example .env     # then fill in NASH_API_KEY
npm run dev              # http://localhost:3010
```

Confirm the connection before anything else:

```bash
curl -s localhost:3010/api/health | jq
```

```json
{
  "ok": true,
  "stores": [{ "id": "stl_...", "externalId": "001", "name": "Carlton" }],
  "counts": { "products": 0, "inventory": 0, "orders": 2 }
}
```

Health reports **counts**, not just ok/not-ok. Both likely failures here succeed
quietly: the wrong region returns a 404 that reads as a bad key, and a wrong
store id returns 200 with an empty list.

### Environment

All server-side. **Never prefix any of these with `NEXT_PUBLIC_`** - that would
ship the credential in the browser bundle.

| | |
|---|---|
| `NASH_API_KEY` | Sandbox key |
| `NASH_API_BASE` | `https://api.sandbox.usenash.com/v1` - **US, not AU** |
| `NASH_STORE_LOCATION_ID` | `stl_...` - the store's Nash id |
| `NASH_EXTERNAL_STORE_ID` | `001` - **inventory joins on this, not the `stl_` id** |
| `NASH_ORG_ID` | Not required. Only needed when a key spans multiple orgs |

---

## Notes from the live sandbox

Things verified by calling the API that are not in the published docs.

| | |
|---|---|
| **Region** | The AU host returns `MISSING_RESOURCE "API key not found"`, which reads as a bad key but is a wrong-region error. This org is US |
| **Two list shapes** | `/orders` returns `{ results, totalCount, limit, offset }`. `/products`, `/inventory` and `/store_locations` return `{ <name>, totalResults }`. Code that assumes one shape reads `undefined` and renders an empty page - which looks like unseeded data rather than a bug |
| **`GET /orders`** | Works, and is not in the public docs |
| **Inventory join** | Joins on `externalStoreLocationId: "001"`, not the `stl_` id |

---

## Deploying

```bash
railway up
```

Environment variables live in the Railway service, not in the repo.
`.railwayignore` matters: Railway uploads the working directory and only honours
`.gitignore`, so anything excluded via `.git/info/exclude` has to be named again
there.

---

## Current state

Nothing is claimed here until it has been seen working against the live sandbox.

- [x] **L0** - the app boots and talks to Nash
- [ ] **L1** - store, catalog and four orders seeded
- [ ] **L2** - one queue, all four orders, all three channels
- [ ] **L3** - a picker can walk an order item by item
- [ ] **L4** - all four outcomes recordable
- [ ] **L5** - Nash knows picking is done
- [ ] **L6** - stretch: fill rate by channel, scan verification
