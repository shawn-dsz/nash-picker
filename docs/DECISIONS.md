# Decision log

Written as decisions are made, not reconstructed afterwards.

Each entry: what was decided, why, what was rejected, and **how reversible it is** - because reversibility is what should govern how long a decision deserves.

| Reversibility | Meaning |
|---|---|
| **Cheap** | One file, minutes. Decide fast, move on |
| **Moderate** | A few files, an hour. Worth a short think |
| **Expensive** | Shape of the app. Worth getting right |

---

## D1 - Web app, designed for a handheld

**Decided:** a mobile-first web app at a 360px layout, 56px touch targets, 64px for the primary action, high contrast, no hover states.

**Why:** real stores run picking on rugged handhelds. The exercise asks for the lightweight web equivalent, so it should be *designed for* that form factor rather than shrunk from a desktop layout. Hover states in particular are a trap - there is no mouse, so anything that only appears on hover is invisible in the store.

**Rejected:** a desktop layout with responsive breakpoints. It optimises for the screen the developer is looking at rather than the one the picker holds.

**Reversibility:** moderate. CSS-level, but it drives every component's shape.

---

## D2 - Stateless. Nash holds the state.

**Decided:** no database, no session store. Picking outcomes are written back to the order in Nash; `pick_status: items_pick_complete` is the completion signal.

**Amended 12:30** - the original wording said outcomes go to Nash's `pickedItems`. That field is not writable. The decision held; only its landing place changed. See `D10`.

**Why:** the state already has an owner. A local store would be a second copy of the truth, and two copies eventually disagree - silently, and usually mid-demo. Statelessness also means closing the tab does not lose a run.

**Rejected:** Postgres or SQLite for run state. It would need reconciling with Nash forever, and reconciliation bugs are the expensive kind.

**Cost, stated plainly:** every outcome is a network round trip. The UI has to stay responsive while writes are in flight, and a slow network is felt by the picker rather than hidden.

**Reversibility:** expensive. This is the shape of the app.

---

## D3 - Drive Nash's pick-and-pack model rather than invent a domain

**Decided:** map the four picking scenarios directly onto Nash's existing statuses - `picked`, `partially_picked`, `not_picked`, `substituted` - and use `items[].subItems[]` as the pickable unit.

**Why:** Nash already models picking end to end, including pre-authorised substitutions and weighted items. A parallel domain would need translating at every boundary, and translation layers are where meaning gets lost.

**Rejected:** a bespoke `PickTask` domain with a translation layer at the edge. Cleaner in isolation, worse in practice.

**Reversibility:** expensive.

---

## D4 - The adapter owns the three-way join

**Decided:** one module knows Nash's payload shape. It joins order → product catalog → per-store inventory, and it is the only place channel is normalised.

**Why:** `location { aisle, bay, shelf }` lives on inventory, not on the order, so rendering one pick row needs three resources. Concentrating that in one file means a schema surprise at hour four is one file, not a refactor. Normalising channel there makes the picker view channel-blind **by construction** rather than by discipline - a later component cannot accidentally leak the channel, because it never receives it.

**Rejected:** joining in the view layer. Faster to write, and it spreads Nash's payload shape through every component.

**Reversibility:** moderate.

---

## D5 - Route handlers as a thin BFF

**Decided:** the browser never talks to Nash. Route handlers proxy, holding `NASH_API_KEY` and `NASH_ORG_ID` server-side.

**Why:** a key in a browser bundle is a real leak, not a demo shortcut. It also removes CORS as a possible failure at exactly the wrong moment.

**Rejected:** calling Nash directly from the client with a public env var. Faster by about ten minutes, and wrong.

**Reversibility:** cheap.

---

## D6 - Partial quantity is a quantity, never a boolean

**Decided:** the outcome model carries `requestedQuantity` and `quantity`, plus `weight` for `WEIGHTED` products. There is no `picked: boolean` anywhere.

**Why:** weighted items - deli, produce, meat - are why partial quantity is a requirement at all. A customer orders 1kg of bananas and the picker weighs 0.94kg. That is neither picked nor not-picked, and a boolean makes it unrepresentable. Nash's schema already models it via `attributes: ["WEIGHTED"]` and `valueCentsPerMeasurementUnit`, which is the tell that this is the intended reading.

**Rejected:** `picked: boolean` plus a nullable quantity. It works until the first weighted item, then quietly reports wrong.

**Reversibility:** expensive once anything reads the flag. Hence deciding it before writing code.

---

## D7 - Substitutions are applied, not chosen

**Decided:** the picker sees the customer's pre-authorised substitute from `subItems[].substitution.substituteItems[]` and confirms it in one tap. They never search for a replacement.

**Why:** the substitution decision is made at checkout by the customer, the same pattern as Uber Eats and DoorDash. `preference` is `substitute` or `refund`, and honouring `refund` matters as much as honouring `substitute` - picking a replacement the customer declined is worse than picking nothing.

**Rejected:** a picker-driven substitution search. It looks like a richer feature and it overrides a decision the customer already made.

**Reversibility:** moderate.

---

## D8 - Seed data is designed as the demo storyline

**Decided:** four orders across three channels, each demonstrating exactly one scenario. Three lookalike cola SKUs on the same bay.

**Why:** the sandbox account starts empty, so the data is a design surface rather than a given. Lookalike SKUs make scan verification visibly necessary instead of theoretical - the accuracy failure described on the briefing call was picking a regular Coke for a Diet Coke.

**Rejected:** randomly generated catalog data. Faster, and it demonstrates nothing.

**Reversibility:** cheap.

---

## D9 - Micro-commits

**Decided:** one commit per working increment, each independently revertible, each message saying what changed and why.

**Why:** the git history is part of the technical review. It should read as a sequence of decisions rather than a single dump, and it makes any wrong turn cost minutes rather than the afternoon.

**Reversibility:** cheap, and it never needs reversing.

---

## D10 - Outcomes land on metadata, because the field they were planned for does not exist

**Decided:** write per-line outcomes to `subItems[].metadata` and the run summary to `orderMetadata`. Keep the domain model exactly as `D3` set it.

**Why:** `pickedItems` is not an argument on the order update and order `status` is not writable. Both were established by probing the live sandbox at 12:30 rather than by reading, which matters because the API returns **200 for the version that silently persists nothing**. Testing the app would not have caught it - it would have looked like a working write path until someone opened the portal.

**Rejected:** inventing a local store to hold outcomes until a real write path appears. That reverses `D2` to work around a gap that is one adapter function wide.

**Cost, stated plainly:** this is my schema in a general-purpose field. Nash's own systems cannot act on it, `items_pick_complete` is this app's convention rather than a platform state, and dispatch will not trigger off it.

**Reversibility:** cheap, and deliberately so. The mapping is behind `toPickedItems()`, so a first-class picking field is one function to switch.

---

## D11 - Sequence the pick list, do not just display the location

**Decided:** reorder each run serpentine by aisle, ambient before chilled and frozen.

**Why:** the three-way join already had `aisle / bay / shelf` for every line, so the ordering was nearly free once the data was in hand. The temperature rule is the part that is not obvious: the shortest walk is not the best walk if ice cream picked first melts for the rest of the run.

**Rejected:** shortest-path optimisation. A real solver on a real planogram, none of which exists here, to beat a heuristic that is already most of the win.

**Cost:** aisle values are strings, so `"A12"` does not sort numerically against `"A6"`. The collation is explicit and it is the part most likely to be wrong on a store that names aisles differently.

**Reversibility:** cheap. One pure function, covered by tests.

---

## D12 - The scan gate has a recorded exit, not a hard block

**Decided:** the primary action stays unavailable until the barcode matches. "No barcode on the item" proceeds anyway and persists `scan_override`. "Not on shelf" is not gated at all.

**Why:** you cannot scan an item that is not there. A gate with no exit makes an out-of-stock line unrecordable, and the picker's only remaining move is to abandon the run - which is how a safety feature becomes the reason the data is wrong. An override that leaves no trace is worse than no gate, because it looks like verification happened.

**Rejected:** a hard block. It fails the first time a label is damaged, and it fails silently in the data rather than loudly on the screen.

**Cost:** the scan-verified number is now a rate rather than a guarantee, which is the honest version but a weaker headline.

**Reversibility:** cheap.

---

## D13 - Real product photographs, committed to the repo

**Decided:** replace the `placehold.co` tiles with CC-licensed photographs of the actual packs, held in `public/products` and seeded as same-origin paths.

**Why:** the catalog's whole argument is that three colas sit on one shelf and a picker cannot tell them apart by looking. Three grey squares with the product name typed on them prove the opposite - they are trivially distinguishable, which is exactly what the barcode is supposed to be needed for. A red bottle, a silver one and a black one make the case the scan gate exists to answer.

Committing them removes the last third-party host from the render path: a demo that fetches fourteen thumbnails live has fourteen ways to show a broken image in front of a room.

**Rejected:** hotlinking a retailer CDN, which is both fragile and someone else's bandwidth; and generated images, which would be placeholders wearing a better costume.

**Cost:** 452kB of binaries in the repo, provenance to maintain in `public/products/CREDITS.md`, and a seeded `imageUrls` value that only resolves inside this app - the Nash portal cannot render it. A retailer would put a CDN origin in `img()`, which is one line.

**Reversibility:** cheap. `scripts/images/build.mjs` records every source URL, so the set is rebuildable, and `img()` is a single function.
