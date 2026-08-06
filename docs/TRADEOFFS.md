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

**Chose:** display it. Sequencing stays out.

**Cost:** the biggest available throughput win is left on the table on a day where speed is named pain P2.

**Flips when:** throughput rather than accuracy becomes the binding constraint. Cheap to add - though `"A12"` is a string and will not sort numerically (`A6`), so it is an hour, not ten minutes.

---

## T6 - Finishing the contract vs. fixing the loudest pain

**Tension:** accuracy is pain P1, and *"I ordered a Diet Coke and they gave me a Coke"* is fixed by scan verification. Scan verification is in none of the four requirements.

**Chose:** R1-R4 first, always. Scan verification is stretch, cut second.

**Cost:** the demo may close without demonstrating a fix for the pain the customer described most vividly.

**Flips when:** R1-R4 are stable before the freeze marker. The seed data is already built to make this land - three lookalike colas on one bay.

---

## T7 - Designed for the device vs. legible on the projector

**Tension:** pickers hold a handheld, so 360px with 56px targets and no hover states is the honest build. The presentation happens on a laptop, where that layout looks cramped and small.

**Chose:** build for the handheld. (`D1`)

**Cost:** a real presentation risk. The thing that makes it correct in the store makes it look sparse in the room.

**Flips when:** it does not. **Mitigate instead** - demo in a phone-sized viewport and name the choice before anyone wonders about it.

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

**Flips when:** it does not - the bet is already placed. It paid off if `pick_and_pack` really is the right model, because finding that at hour three would have cost the day. **Judged, not asserted:** the finding that Nash already models picking end to end came out of that block.

---
