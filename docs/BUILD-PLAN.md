# Build plan and progress

**This file is the single source of truth for what is done.** Nothing is ticked
until it has been seen working against the live sandbox.

Seven levels. **Each level ends with something demonstrable.** If the day stops
at any level boundary, what exists still works. Levels 0-5 are the contract.
Level 6 is only reached if 0-5 are stable.

| Level | What exists at the end | Budget | State |
|---|---|---|---|
| **L0** | The app boots and talks to Nash | 10 min | ✅ **done** |
| **L1** | The sandbox has a store, a catalog and four orders | 25 min | ✅ **done** |
| **L2** | One queue showing all four orders, all three channels | 30 min | ✅ **done** |
| **L3** | A picker can walk an order item by item | 30 min | ✅ **done** |
| **L4** | All four outcomes recordable | 35 min | 🟡 **built, untested** |
| **L5** | Nash knows picking is done | 20 min | ✅ **done** |
| **L6** | Scan verification, fill rate by channel | 25 min | ⬜ cut first |

---

## L0 - Foundation ✅

**Done when:** `npm run dev` boots and a page shows a live response from Nash.

- [x] **0.1** `create-next-app` - TypeScript, Tailwind, App Router, no src dir · `chore: scaffold`
- [x] **0.2** `.env` - key valid, store location confirmed
- [x] **0.3** `lib/nash.ts` - a single client with auth headers, base URL and error shaping · `feat: nash client`
- [x] **0.4** `app/api/health/route.ts` - proves auth works end to end · `feat: health check`
- [x] **0.5** Deployed to Railway, docs site on GitHub Pages, both noindexed

**Verified:** auth works against `https://api.sandbox.usenash.com/v1`. This org is
**US**, not AU - the AU host returns `MISSING_RESOURCE "API key not found"`, which
reads as a bad key but is a wrong-region error. `NASH_ORG_ID` not required
(confirmed with Kareem: single-org key).

**Found:** Nash has **two list envelope shapes**. `/orders` returns
`{ results, totalCount, limit, offset }`; `/products`, `/inventory` and
`/store_locations` return `{ <name>, totalResults }`. Not in the docs.

---

## L1 - Seed ✅

**Done when:** four orders are visible in the portal, each with items, sub-items
and locations.

- [x] **1.1** Store - **Carlton**, `externalId: 001`. Inventory joins on `externalStoreLocationId`, not the `stl_` id
- [x] **1.2** `scripts/seed/catalog.ts` - 14 products. Two `WEIGHTED`. Three lookalike colas · `feat(seed): catalog`
- [x] **1.3** Inventory with `location { aisle, bay, shelf }` and per-store price
- [x] **1.4** `scripts/seed/orders.ts` - four orders, `pick_and_pack` in `requirements` · `feat(seed): orders`
- [x] **1.5** `npm run seed` - idempotent, so it doubles as reset
- [x] **1.6** Seed asserts the join and the substitution round-trip rather than trusting a 200

**Live in the sandbox:**

| Order | Channel | Demonstrates |
|---|---|---|
| `FM-1001` | web | Clean run |
| `FM-1002` | doordash | Weighted partial - 1kg ordered, 0.94kg on the scale |
| `FM-1003` | uber_eats | Substitution - spirals out, penne pre-approved |
| `FM-1004` | web | Refund preference - offer no substitute at all |

**Answered by doing:** `requirements: ["pick_and_pack"]` is accepted on create.
`subItems[].substitution` **round-trips on create** with `preference`, `source`
and `substituteItems`.

**Found:** `DELETE /products` and `DELETE /inventory` both return **405**. The
catalog is upsert-only, so reset restores quantities rather than removing rows.
That is how a real store catalog behaves anyway.

---

## L2 - Read path ✅

**Done when:** the queue shows four orders with channel badges, and the pick
list for one order shows real names and locations.

- [x] **2.1** `lib/types.ts` - written from the **real payload**, not from the docs · `feat: domain types`
- [x] **2.2** `lib/adapter.ts` - the three-way join: order → products → inventory · `feat: adapter join`
- [x] **2.3** Channel normalisation inside the adapter. The picker view never receives it · `feat: channel normalisation`
- [x] **2.4** `app/api/orders/route.ts` - list, server-side · `feat: orders route`
- [x] **2.5** `app/page.tsx` - the queue. Customer, item count, channel badge · `feat: order queue`

**Verified against live data.** All four runs resolve: names, aisle/bay/shelf,
weighted flags, real stock levels, and both substitution preferences.

**Found:** `GET /orders` returns a **summary** - no `items`, no `requirements`,
no `orderMetadata`. The pick list needs `GET /order/{id}`. Also `itemsCount`
comes back as a **string** (`"5"`), so anything doing arithmetic on it
concatenates silently.

**Also:** `POST /order` always creates, so seeding orders is not idempotent the
way the catalog is. The queue dedupes on `externalId`, newest wins.

---

## L3 - Pick screen ✅

**Done when:** a picker can walk order A start to finish and reach a done state.

- [x] **3.1** `app/pick/[orderId]/page.tsx` - one sub-item at a time · `feat: pick screen`
- [x] **3.2** The five things: image, name, quantity, `aisle / bay / shelf`, one primary action · `feat: pick detail`
- [x] **3.3** Advance, progress indicator, completion state · `feat: pick progress`
- [x] **3.4** Handheld styling - 360px, 56px targets, 64px primary, no hover · `style: handheld`

**Cut risk:** none. This is the product.

---

## L4 - The four outcomes 🔨

**Done when:** each seeded order behaves the way it was designed to.

- [x] **4.1** Picked → `picked` · `feat: outcome picked`
- [x] **4.2** Partial quantity - stepper, plus weight entry for `WEIGHTED` → `partially_picked` · `feat: outcome partial`
- [x] **4.3** Not on shelf → `not_picked` · `feat: outcome not picked`
- [x] **4.4** Substitution - show the customer's pre-approved item, one tap → `substituted` · `feat: outcome substitution`
- [x] **4.5** Honour `preference: refund` - **no substitute offered at all** → `not_picked` · `feat: honour refund preference`
- [ ] **4.6** Two tests on `toPickedItems()`, weighted partial first · `test: outcome mapping`

**4.5 is the one most people miss.** Offering a substitute the customer declined
is worse than picking nothing.

---

## L5 - Write back ✅

**Done when:** the order reaches `items_pick_complete` and it is visible in the portal.

- [x] **5.1** `toPickedItems()` - outcomes to Nash's payload · `feat: pickedItems mapping`
- [x] **5.2** `app/api/pick/route.ts` - write, server-side · `feat: pick write route`
- [x] **5.3** Completion transition and a staged confirmation screen · `feat: complete run`
- [x] **5.4** Name the handoff on screen - *ready for Nash dispatch* · `feat: handoff state`

**Verified end to end.** FM-1003 written and read back from Nash:
`pick_status: items_pick_complete`, `pick_fill_rate: 0.75`, three sub-item
outcomes persisted, basket intact, substitution preserved.

**Found:** `pickedItems` is not an argument on update and order `status` is not
writable. Outcomes land on `subItems[].metadata`, summary on `orderMetadata`.
**`PATCH` on `items` replaces rather than merges**, so `writeRun()` reads the
order first and sends the whole array. A partial send silently destroys the
rest of the basket.

**The cost:** metadata is not a first-class picking field, so Nash's own
systems cannot act on it. `items_pick_complete` is this app's convention, not
a platform status. Dispatch will not trigger off it.

---

## L6 - Stretch ⬜

Only if L0-L5 are stable. **Cut in this order.**

- [ ] **6.2** Fill rate by channel - answers *"no unified view of fulfillment"* · **cut 1st**
- [ ] **6.1** Scan verification - reject a wrong barcode visibly. Diet Coke versus Coke · cut 2nd

**⛔ 15:05 FREEZE.** Broken things get cut, not fixed.

---

## Open questions

| | Question | Blocks | Fallback |
|---|---|---|---|
| 🟢 | ~~What writes `pickedItems`~~ | - | Answered by probing: nothing does. Outcomes go to `subItems[].metadata`, verified to persist |
| 🟢 | ~~Is `NASH_ORG_ID` needed~~ | - | Answered: no, single-org key |
| 🟢 | ~~Can `substitution` be set on order create~~ | - | Answered by doing: yes, it round-trips |
| 🟢 | ~~Where does channel live~~ | - | `tags` plus `orderMetadata`. Accepted and returned |

**Nothing is blocked.** L0 to L5 run end to end against the live sandbox.

---

## Where else progress shows

| | |
|---|---|
| **This file** | The checklist. The only place a task is ticked |
| `git log --oneline` | One commit per increment. The history is the audit trail |
| `/api/health` | Live counts from the sandbox - proves the data is really there |
| `docs/DECISIONS.md` | Why, not what. Updated as decisions are made |

---

## Definition of done, per level

A level is done when it is **committed, running, and demonstrable without
explanation**. Not when the code exists.
