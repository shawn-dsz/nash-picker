/**
 * What batching would buy, measured on the four orders actually in the sandbox.
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * Batching is not built and should not be built inside a six hour window. But
 * "batching would help" is a claim, and a claim with no number attached is
 * indistinguishable from a slogan. This measures it against real seeded data
 * using the SAME `travel()` and `sequence()` the pick screen uses, so the
 * roadmap number and the shipped number come from one implementation.
 *
 * It is analysis, not product. Nothing here is imported by the app, it makes
 * no network calls, and it changes nothing in Nash.
 *
 * WHAT IT DOES NOT PROVE
 * ----------------------
 * n = 4. Four orders is a demonstration of the method, not a study. The
 * saving from batching grows with the number of orders in the wave and with
 * how much their aisle sets overlap, so a four order sample understates it.
 * The honest claim is "the method, and the direction, on real data" - not a
 * percentage anyone should quote at Coles.
 */

import { PRODUCTS } from "../seed/catalog.ts";
import { ORDERS } from "../seed/orders.ts";
import {
  sequence,
  travel,
  SECONDS_PER_AISLE_POSITION,
} from "../../lib/sequence.ts";

/**
 * Put-to-tote overhead, per line, when a picker carries more than one order.
 *
 * A STATED ASSUMPTION, NOT A MEASUREMENT - same discipline as
 * SECONDS_PER_AISLE_POSITION. Picking into one tote is reach-and-drop. Picking
 * into eight means reading a tote position and placing deliberately, and that
 * costs time on EVERY line, not just the ones that saved walking. It is the
 * term that decides whether a batch is worth forming, so it has to be in the
 * model rather than assumed away.
 */
const SECONDS_PER_SORT = 4;

type Row = {
  ext: string;
  location: { aisle: string; bay: string; shelf: string } | null;
};

const byExt = new Map(PRODUCTS.map((p) => [p.externalIdentifier, p]));

/** One order's pickable lines, located through the catalog exactly as the adapter does. */
function rowsFor(order: (typeof ORDERS)[number]): Row[] {
  return order.lines.map((l) => ({
    ext: l.ext,
    location: byExt.get(l.ext)?.location ?? null,
  }));
}

/** Seconds of walking for a basket, once sequenced. */
const walkSeconds = (rows: Row[]) =>
  travel(sequence(rows)) * SECONDS_PER_AISLE_POSITION;

/**
 * Batch formation: seed-and-extend on aisle-set overlap.
 *
 * The order with the widest aisle spread seeds the batch, because it already
 * pays for the longest walk - every order added to it that lives inside those
 * aisles is picked for free. Then repeatedly add whichever remaining order
 * adds the FEWEST new aisles, until the trolley is full.
 *
 * This is the whole idea: a batch is worth forming when its orders overlap in
 * space. Grouping by arrival time, or by customer, or at random, gets a much
 * worse answer for the same effort. The cost function it optimises against is
 * `travel()` - the one already shipped.
 */
function formBatch(pool: (typeof ORDERS)[number][], capacity: number) {
  const aislesOf = (o: (typeof ORDERS)[number]) =>
    new Set(rowsFor(o).map((r) => r.location?.aisle).filter(Boolean) as string[]);

  const remaining = [...pool];
  remaining.sort((a, b) => aislesOf(b).size - aislesOf(a).size);

  const batch = [remaining.shift()!];
  const covered = aislesOf(batch[0]);

  while (batch.length < capacity && remaining.length) {
    let best = 0;
    let bestNew = Infinity;
    remaining.forEach((o, i) => {
      const added = [...aislesOf(o)].filter((a) => !covered.has(a)).length;
      if (added < bestNew) {
        bestNew = added;
        best = i;
      }
    });
    const [chosen] = remaining.splice(best, 1);
    batch.push(chosen);
    aislesOf(chosen).forEach((a) => covered.add(a));
  }

  return batch;
}

// ---------------------------------------------------------------------------

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (s: string | number, n: number) => String(s).padStart(n);

console.log("\nBATCHING: measured on the seeded FreshMart orders\n");

const perOrder = ORDERS.map((o) => {
  const rows = rowsFor(o);
  return {
    ref: o.externalId,
    lines: rows.length,
    aisles: new Set(rows.map((r) => r.location?.aisle).filter(Boolean)).size,
    seconds: walkSeconds(rows),
  };
});

console.log(
  pad("  ORDER", 12) + num("LINES", 6) + num("AISLES", 8) + num("WALK s", 9),
);
for (const o of perOrder) {
  console.log(
    pad("  " + o.ref, 12) + num(o.lines, 6) + num(o.aisles, 8) + num(o.seconds, 9),
  );
}

/*
 * Sequencing on its own, before batching enters the picture.
 *
 * This is the number the customer conversation turns on: walking is the
 * largest controllable cost on a pick, and it is the one that software can
 * remove without moving a single shelf. Measured against basket order - the
 * order the customer happened to add things to the cart - because that is the
 * genuine counterfactual for a store with no picking system.
 */
const basketWalk = ORDERS.reduce(
  (t, o) => t + travel(rowsFor(o)) * SECONDS_PER_AISLE_POSITION,
  0,
);
const sequencedWalk = perOrder.reduce((t, o) => t + o.seconds, 0);

console.log("\n  --- sequencing alone, before any batching ---");
console.log(`  Basket order                ${num(basketWalk, 5)} s walking`);
console.log(`  Sequenced                   ${num(sequencedWalk, 5)} s walking`);
console.log(
  `  Saved                       ${num(basketWalk - sequencedWalk, 5)} s  (${Math.round(((basketWalk - sequencedWalk) / basketWalk) * 100)}%)`,
);

const batch = formBatch(ORDERS as unknown as (typeof ORDERS)[number][], ORDERS.length);
const allRows = batch.flatMap(rowsFor);

const sequential = perOrder.reduce((t, o) => t + o.seconds, 0);
const waveWalk = walkSeconds(allRows);
const sortCost = allRows.length * SECONDS_PER_SORT;
const waveTotal = waveWalk + sortCost;

const lines = allRows.length;

console.log("\n  ---");
console.log(`  Order by order, sequenced   ${num(sequential, 5)} s walking`);
console.log(`  One wave, sequenced once    ${num(waveWalk, 5)} s walking`);
console.log(`  Put-to-tote, ${lines} lines       ${num("+" + sortCost, 5)} s sortation`);
console.log(`  Wave, all in                ${num(waveTotal, 5)} s`);

const saved = sequential - waveTotal;
const pct = sequential > 0 ? Math.round((saved / sequential) * 100) : 0;

console.log(
  `\n  NET  ${saved >= 0 ? "-" : "+"}${Math.abs(saved)} s across ${batch.length} orders  (${pct}%)`,
);
console.log(
  `  Per line: ${(sequential / lines).toFixed(1)} s -> ${(waveTotal / lines).toFixed(1)} s  over ${lines} lines`,
);

console.log(`
  ASSUMPTIONS, so they can be argued with
    ${SECONDS_PER_AISLE_POSITION} s to cross one aisle position (laden trolley, ~1 m/s)
    ${SECONDS_PER_SORT} s per line to place into the right tote when batching
    Trolley capacity ${ORDERS.length}, which is the whole sample

  WHAT THIS SAMPLE CANNOT TELL YOU
    n = ${ORDERS.length}. The saving scales with wave size and with aisle
    overlap between orders, so four understates it. What it does show is the
    shape: walking is amortised across the wave, sortation is not, and the
    crossover is a property of the store layout rather than of the software.
`);
