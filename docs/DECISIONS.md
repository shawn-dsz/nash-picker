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

**Decided:** no database, no session store. Picking outcomes are written to Nash's `pickedItems`; the order's transition to `items_pick_complete` is the completion signal.

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
