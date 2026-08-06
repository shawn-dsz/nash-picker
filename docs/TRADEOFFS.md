# Trade-offs

`DECISIONS.md` records *what* was chosen. This records *what it cost*.

Every entry names two forces that genuinely fight, which one won, what was given up, and **what would flip it**. A trade-off with no cost is not a trade-off, it is a preference.

Written as they happen. Part 2 of the presentation has "Tradeoffs" as a literal heading - this is that section.

| | |
|---|---|
| **Tension** | The two forces, both real |
| **Chose** | Which won |
| **Cost** | What was actually given up. Stated plainly, no hedging |
| **Flips when** | The observation that would reverse it |

---

## T1 - Single source of truth vs. a responsive hand

**Tension:** Nash owning picking state means there is only ever one truth. It also means every outcome the picker records is a network round trip.

**Chose:** stateless. Nash holds it. (`D2`)

**Cost:** latency lands in the picker's hand, not hidden behind a local write. A supermarket dead spot stops the run. Offline durability is not merely unbuilt, it is unbuildable without reversing this.

**Flips when:** a pilot store has known dead spots, or a run needs to survive a device handoff mid-aisle.

---

## T2 - No translation layer vs. coupling to someone else's schema

**Tension:** driving Nash's `pick_and_pack` model means no domain to invent and no mapping to maintain. It also means a Nash schema change is a change in this app.

**Chose:** drive Nash's model, and contain the coupling in one adapter module. (`D3`, `D4`)

**Cost:** the adapter is a single point of schema coupling. That is deliberate - the coupling exists either way, this decides whether it is in one file or thirty.

**Flips when:** a second fulfilment platform appears. Then the translation layer earns its keep and the adapter becomes the seam it was designed to be.

---

## T3 - Honouring the customer's choice vs. rescuing the basket

**Tension:** the customer already picked their substitute at checkout. Letting the picker search for a replacement overrides a decision that was made with more information than the picker has. But if the pre-approved substitute is *also* out of stock, the picker has no path left except `not_picked`.

**Chose:** pre-authorised only. One tap, no search. (`D7`)

**Cost:** a real dead end. Double-out-of-stock becomes a lost unit and a disappointed customer, where a human in the aisle could have solved it.

**Resolved:** the case falls through to `not_picked`. Not built around, not seeded away - **named as a gap in Part 2**. It is a deferral, not an oversight, and the difference is whether it gets said before it gets asked.

**Flips when:** the fill-rate loss attributable to double-out-of-stock is measured and it is material. Then: ranked alternates, still customer-authorised, never picker-invented.

---

## T4 - A demo that tells a story vs. a demo that could surprise me

**Tension:** the sandbox starts empty, so the data is a design surface. Four orders each proving exactly one scenario makes the demo legible. It also means every payload the app sees was authored by the person demoing it.

**Chose:** seed the storyline. (`D8`)

**Cost:** the demo proves the app handles the cases I thought of. It is evidence of design, not evidence of robustness.

**Flips when:** never, for today. The correct response is to **say this out loud in Part 2** rather than let it be discovered.

---

## T5 - Showing the location vs. using it

**Tension:** `aisle / bay / shelf` is right there on inventory, and walking order is the single largest speed lever in picking. The brief says location is *displayed*.

**Chose:** display it first, then use it. Sequencing was planned out and built anyway once R1-R5 were stable. (`D11`)

**Reversed, and worth saying why:** the reason it was excluded was cost, and the cost turned out to be near zero - the three-way join already had `aisle / bay / shelf` on every line, so the ordering was a pure function over data already in hand. An exclusion should be re-tested when the thing it was priced against changes.

**Cost:** `"A12"` is a string and does not sort numerically against `"A6"`, so the collation is explicit and is the first thing that breaks on a store that names aisles differently. The route is also a heuristic, not an optimum - see `SEQUENCING.md` for what it does and does not claim.

**Flips when:** a real planogram exists. Then a solver beats a serpentine, and not before.

---

## T6 - Finishing the contract vs. fixing the loudest pain

**Tension:** accuracy is pain P1, and *"I ordered a Diet Coke and they gave me a Coke"* is fixed by scan verification. Scan verification is in none of the four requirements.

**Chose:** R1-R4 first, always. Scan verification stayed stretch and second on the cut list.

**Outcome:** R1-R4 went green with time left, so the condition below was met and scanning was built. It gates the primary action, names the wrong product on rejection, and records an override when a picker proceeds without a match. (`D12`)

**Cost:** it is the newest code in the repo and the least exercised. The demo path is rehearsed; the edge cases around a damaged label are reasoned about rather than proven.

**Flipped when:** R1-R4 were stable before the freeze marker - which is exactly the condition this entry named in advance. The seed data was already built to make it land: three lookalike colas on one bay, and the third item on FM-1002 is the Diet Coke from the briefing call.

---

## T7 - Designed for the device vs. legible on the projector

**Tension:** pickers hold a handheld, so 360px with 56px targets and no hover states is the honest build. The presentation happens on a laptop, where that layout looks cramped and small.

**Chose:** build for the handheld. (`D1`)

**Cost:** a real presentation risk. The thing that makes it correct in the store makes it look sparse in the room.

**Flips when:** it does not. **Mitigated instead** - demo at 360x800 in a phone-sized viewport, and name the choice in the opening line of Part 1 rather than let the room wonder:

> *"Pickers hold a chunky handheld, not a laptop. So I built it at handheld size - 56px targets, no hover states, because there is no mouse in an aisle. I'll demo it the way they'd hold it."*

No build cost. The layout stops looking sparse the moment it is framed as a device choice.

---

## T8 - A quantity model vs. a checkbox

**Tension:** `picked: boolean` is one tap and the fastest thing to build. It cannot represent 0.94kg of bananas against a 1kg order.

**Chose:** `requestedQuantity` + `quantity` + `weight`. No boolean anywhere. (`D6`)

**Cost:** every outcome control is more complex than a checkbox, and the weighted path needs its own UI on the busiest screen.

**Flips when:** it does not. Weighted items are the reason partial quantity is a requirement at all.

---

## T9 - Ten minutes vs. a key in a bundle

**Tension:** calling Nash straight from the client is faster to write. It also ships the API key to every browser.

**Chose:** route handlers as a thin BFF. (`D5`)

**Cost:** roughly ten minutes, and one more hop to reason about.

**Flips when:** it does not. This one is not really a trade-off, and it is listed to show which ones are.

---

## T10 - Hardcoding the picker vs. knowing who picked

**Tension:** no requirement today depends on identity, so auth is pure cost. But accuracy at 50 stores is a per-picker coaching problem, and events without a `pickerId` cannot answer it.

**Chose:** hardcode one picker. `pickerId` stays in the event schema regardless.

**Cost:** the fulfilment view can show *which channel* is underperforming, never *which picker*.

**Flips when:** accuracy becomes a coaching metric rather than a store metric. The event schema is already shaped for it, so this is a day, not a rewrite.

---

## T11 - Forty minutes of reading vs. forty minutes of building

**Tension:** at 11:50 there is no application code. The whole first block went to the brief, the API docs, the plan and the decision log.

**Chose:** read and plan first, no code before the domain is understood.

**Cost:** forty minutes of build time, on a four-hour clock, gone. If the plan is wrong it was spent for nothing.

**Flips when:** it does not - the bet is already placed. **Judged, not asserted:** it paid off on the read path and did not on the write path. `subItems` as the pickable unit and pre-authorised substitutions both came out of that block and both held up against the live API. `pickedItems` also came out of that block and does not exist. Reading the docs closely bought a correct domain model and a wrong write path, which is the honest scoreline - see `T12`.

---
## T12 - The model I planned against vs. the API that exists

**Tension:** the plan's central claim was that Nash models picking end to end - `pickedItems[]`, the four statuses, a transition to `items_pick_complete`. Probing the live sandbox at 12:30 showed `pickedItems` is not an argument on `updateOrder` and the order `status` is not writable at all. The read path survived the probe. The write path did not.

**Chose:** keep the domain model, change where it lands. Outcomes go to `subItems[].metadata`, the run summary to `orderMetadata`, both verified to persist. `D2` holds - Nash still owns the state.

**Cost:** the outcome is stored in a general-purpose metadata field rather than a first-class picking field, so Nash's own systems cannot act on it. Completion is a convention this app defines, not a status the platform recognises. Dispatch will not trigger off it.

**Flips when:** the picking write path is confirmed at check-in. If a first-class field exists, it is one adapter function to switch - which is precisely why the mapping was kept behind `toPickedItems()`.

**Worth saying out loud:** the probe cost fifteen minutes and moved this from an assumption to a fact. Finding it at 14:20, during L5, would have cost the write-back and the demo with it.

---

## T13 - Probing the live API vs. trusting the docs

**Tension:** the documented shape was coherent and the plan built on it cleanly. Verifying it meant spending build-block time writing throwaway curl commands that produce no product.

**Chose:** probe first, at the boundary between the read path and the write path.

**Cost:** fifteen minutes of L1's budget, and one scratch order's item payload overwritten - `PATCH` on `items` replaces rather than merges, which was itself only discovered by doing it.

**Flips when:** it does not. Three of the four assumptions the write path rested on were wrong, and one of them - `200 OK` with the field silently dropped - would not have surfaced through testing the app at all. It would have looked like a working L5.
