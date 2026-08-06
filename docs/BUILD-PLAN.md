# Build plan

Seven levels. **Each level ends with something demonstrable.** If the day stops at any level boundary, what exists still works.

Levels 0-5 are the contract. Level 6 is only reached if 0-5 are stable.

| Level | What exists at the end | Budget | Cut? |
|---|---|---|---|
| **L0** | The app boots and talks to Nash | 10 min | Never |
| **L1** | The sandbox has a store, a catalog and four orders | 25 min | Never |
| **L2** | One queue showing all four orders, all three channels | 30 min | Never |
| **L3** | A picker can walk an order item by item | 30 min | Never |
| **L4** | All four outcomes recordable | 35 min | Never |
| **L5** | Nash knows picking is done | 20 min | Never |
| **L6** | Scan verification, fill rate by channel | 25 min | **First** |

---

## L0 - Foundation

**Done when:** `npm run dev` boots and a page shows a live response from Nash.

| | Task | Commit |
|---|---|---|
| 0.1 | `create-next-app` - TypeScript, Tailwind, App Router, no src dir | `chore: scaffold` |
| 0.2 | ~~`.env`~~ **done** - key valid, store location `stl_FHRyQgmDr9DwC8qhkD3r75` | *(not committed)* |
| 0.3 | `lib/nash.ts` - a single `nashFetch()` with auth headers, base URL and error shaping | `feat: nash client` |
| 0.4 | `app/api/health/route.ts` - proves auth works end to end | `feat: health check` |

**Verified 2026-08-06:** auth works against `https://api.sandbox.usenash.com/v1`. This org is **US**, not AU - the AU host returns `MISSING_RESOURCE "API key not found"`, which reads as a bad key but is a wrong-region error. `NASH_ORG_ID` is not required; the key is single-org.

---

## L1 - Seed

**Done when:** four orders are visible in the portal, each with items, sub-items and locations.

| | Task | Commit |
|---|---|---|
| 1.1 | ~~Create the store~~ **already exists** - **Carlton**, `externalId: 001`. Inventory joins on `externalStoreLocationId: "001"`, not the `stl_` id | - |
| 1.2 | `scripts/seed/products.ts` - ~14 products. Two `WEIGHTED`. Three lookalike colas | `feat(seed): catalog` |
| 1.3 | `scripts/seed/inventory.ts` - per-store inventory with `location { aisle, bay, shelf }` | `feat(seed): inventory` |
| 1.4 | `scripts/seed/orders.ts` - four orders, `pick_and_pack` in `requirements` | `feat(seed): orders` |
| 1.5 | `npm run seed` and `npm run reset` - reset matters, the demo runs twice | `chore: seed scripts` |

**The seed is the demo storyline.** Order A clean, B partial weighted, C substitution, D refund-preference.

**Risk:** the order payload is large and the substitution shape is unproven. **Seed order A first and confirm it round-trips** before writing B, C and D.

---

## L2 - Read path

**Done when:** the queue shows four orders with channel badges, and the pick list for one order shows real names and locations.

| | Task | Commit |
|---|---|---|
| 2.1 | `lib/types.ts` - written from the **real payload**, not from the docs | `feat: domain types` |
| 2.2 | `lib/adapter.ts` - the three-way join: order → products → inventory | `feat: adapter join` |
| 2.3 | Channel normalisation inside the adapter. The picker view never receives it | `feat: channel normalisation` |
| 2.4 | `app/api/orders/route.ts` - list, server-side | `feat: orders route` |
| 2.5 | `app/page.tsx` - the queue. Customer, item count, channel badge | `feat: order queue` |

**This is the highest-risk level.** The join is where an hour disappears. Build it against a real payload and log the raw response the first time.

---

## L3 - Pick screen

**Done when:** a picker can walk order A start to finish and reach a done state.

| | Task | Commit |
|---|---|---|
| 3.1 | `app/pick/[orderId]/page.tsx` - one sub-item at a time | `feat: pick screen` |
| 3.2 | The five things: image, name, quantity, `aisle / bay / shelf`, one primary action | `feat: pick detail` |
| 3.3 | Advance, progress indicator, completion state | `feat: pick progress` |
| 3.4 | Handheld styling - 360px, 56px targets, 64px primary, no hover | `style: handheld` |

**Cut risk:** none. This is the product.

---

## L4 - The four outcomes

**Done when:** each seeded order behaves the way it was designed to.

| | Task | Nash status | Commit |
|---|---|---|---|
| 4.1 | Picked | `picked` | `feat: outcome picked` |
| 4.2 | Partial quantity - stepper, plus weight entry for `WEIGHTED` | `partially_picked` | `feat: outcome partial` |
| 4.3 | Not on shelf | `not_picked` | `feat: outcome not picked` |
| 4.4 | Substitution - show the customer's pre-approved item, one tap | `substituted` | `feat: outcome substitution` |
| 4.5 | Honour `preference: refund` - **no substitute offered at all** | `not_picked` | `feat: honour refund preference` |
| 4.6 | Two tests on `toPickedItems()`, weighted partial first | | `test: outcome mapping` |

**4.5 is the one most people miss.** Offering a substitute the customer declined is worse than picking nothing.

---

## L5 - Write back

**Done when:** the order reaches `items_pick_complete` and it is visible in the portal.

| | Task | Commit |
|---|---|---|
| 5.1 | `toPickedItems()` - outcomes to Nash's payload | `feat: pickedItems mapping` |
| 5.2 | `app/api/pick/route.ts` - write, server-side | `feat: pick write route` |
| 5.3 | Completion transition and a staged confirmation screen | `feat: complete run` |
| 5.4 | Name the handoff on screen - *ready for Nash dispatch* | `feat: handoff state` |

**⛔ 14:40 - everything above must run end to end.** If it does not, stop adding and finish it.

---

## L6 - Stretch

Only if L0-L5 are stable. **Cut in this order.**

| | Task | Why it is worth it | Cut first |
|---|---|---|---|
| 6.1 | Scan verification - reject a wrong barcode visibly | Answers the accuracy pain directly. Diet Coke versus Coke | 2nd |
| 6.2 | Fill rate by channel | Answers *"no unified view of fulfillment"* | **1st** |

**⛔ 15:05 FREEZE.** Broken things get cut, not fixed.

---

## Verified against the live sandbox, 2026-08-06

Probed directly rather than assumed. **The write path is not what the docs implied.**

| | Field / behaviour | Verdict |
|---|---|---|
| ✅ | `requirements: ["pick_and_pack"]` | Accepted and persists |
| ✅ | `items[].subItems[]` with `sku`, `count`, `barcode`, `description` | Round-trips intact. **`subItems` is the pickable unit** - A1 confirmed |
| ✅ | `subItems[].substitution { preference, substituteItems[{sku, quantity}] }` | **Persists on `POST /order`.** The substitution storyline is seedable |
| ✅ | `orderMetadata` (object) and `tags` (array) | Both persist on create and update. **Channel has a home** |
| ✅ | `subItems[].metadata` (object) | Persists on update. The only writable per-sub-item field |
| ❌ | `pickedItems` | **Does not exist.** `Unknown argument 'pickedItems' on field 'NashMutations.updateOrder'` |
| ❌ | `status` on the order | **Not an argument on updateOrder.** No `items_pick_complete` transition available |
| ❌ | `subItems[].status`, `subItems[].substitution` **on update** | Returns `200` and is **silently dropped**. Only `metadata` survives a PATCH |
| ⚠️ | `PATCH` on `items` | **Replaces the array, does not merge.** A partial item payload wipes `count`, `barcode`, `sku` and `description` |
| ⚠️ | `deliveryMode` | Required, and must be `now` or `scheduled` |
| ⚠️ | `valueCents` | Required, or the order sits in `needs_attention` |

**The `200`-but-dropped behaviour is the dangerous one.** A write that reports success and persists nothing would have looked like a working L5 until someone checked the portal.

---

## Blocked right now

| | Blocker | Needed for | Status |
|---|---|---|---|
| ✅ | ~~Sandbox credentials~~ | - | Key verified, store confirmed, catalog empty |
| ✅ | ~~Where channel should live~~ | L1.4, L2.3 | **Resolved by probe: `orderMetadata.channel`.** Structured, and `tags` carries a mirror for filtering |
| ✅ | ~~Whether substitutions can be seeded~~ | L1.4 | **Resolved by probe: yes, on create** |
| 🔴 | **Where does a picking outcome get written?** | **L4, L5, R4** | `pickedItems` rejected, order `status` not writable. **Ask at the next check-in - the brief invites exactly this** |

**One real blocker, and it does not stop L1-L3.** Seeding, the queue and the pick screen are all read-path work and are unaffected.

**Fallback if the answer is "there is no picking field":** write outcomes to `subItems[].metadata` and a run summary to `orderMetadata`. Both are verified to persist. Completion becomes `orderMetadata.pickStatus` rather than a first-class order status. That keeps D2 intact - Nash still holds the state - and costs one adapter function, not the architecture.

**Do not wait on the answer. Build L1-L3 and keep `toPickedItems()` behind one function.**

---

## Definition of done, per level

A level is done when it is **committed, running, and demonstrable without explanation**. Not when the code exists.
