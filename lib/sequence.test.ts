import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sequence,
  aisleChanges,
  travel,
  routeGain,
  walkSaving,
  SECONDS_PER_AISLE_POSITION,
} from "./sequence.ts";
import type { PickRow } from "./types.ts";

/**
 * Serpentine routing. Two of these tests cover the two ways this silently
 * goes wrong: a string sort that walks the picker past bay 10 to reach bay 2,
 * and an unknown aisle being slotted somewhere plausible instead of last.
 *
 * Both fail without an error. The picker just walks further, or walks
 * confidently to the wrong place.
 */

const row = (aisle: string, bay: string, shelf = "1"): PickRow =>
  ({
    subItemId: `${aisle}-${bay}-${shelf}`,
    sku: `SKU-${aisle}${bay}`,
    name: `Item ${aisle}${bay}`,
    requestedQuantity: 1,
    isWeighted: false,
    location: { aisle, bay, shelf },
    inStock: true,
  }) as PickRow;

const at = (rows: PickRow[]) =>
  rows.map((r) => `${r.location?.aisle}/${r.location?.bay}`);

test("bays sort naturally, so B2 comes before B10", () => {
  // A default string sort puts "B10" before "B2". The picker walks to the far
  // end of the aisle, back to bay 2, and out again - on every run, forever,
  // with nothing in any log to show it happened.
  const out = sequence([row("2", "B10"), row("2", "B2"), row("2", "B1")]);
  assert.deepEqual(at(out), ["2/B1", "2/B2", "2/B10"]);
});

test("direction alternates per visited aisle, which is the whole algorithm", () => {
  // First aisle walked forwards, second backwards, third forwards. The picker
  // finishes each aisle at the end nearest the next one.
  const out = sequence([
    row("1", "B1"),
    row("1", "B9"),
    row("2", "B1"),
    row("2", "B9"),
    row("3", "B1"),
    row("3", "B9"),
  ]);
  assert.deepEqual(at(out), [
    "1/B1",
    "1/B9",
    "2/B9",
    "2/B1",
    "3/B1",
    "3/B9",
  ]);
});

test("alternation counts aisles visited, not aisles that exist", () => {
  // Produce and Frozen are far apart in the layout but adjacent in this walk,
  // so Frozen is the second aisle visited and runs backwards. Keying the
  // alternation off layout position instead would make the reversal depend on
  // aisles the picker never enters.
  const out = sequence([
    row("Produce", "B1"),
    row("Produce", "B4"),
    row("Frozen", "B1"),
    row("Frozen", "B4"),
  ]);
  assert.deepEqual(at(out), [
    "Produce/B1",
    "Produce/B4",
    "Frozen/B4",
    "Frozen/B1",
  ]);
});

test("frozen is walked last even though it is not the furthest", () => {
  // Cold chain, not distance. A tub of ice cream picked first sits in the tote
  // for the length of the run.
  const out = sequence([
    row("Frozen", "B1"),
    row("Produce", "B1"),
    row("Chilled", "B1"),
    row("3", "B1"),
  ]);
  assert.deepEqual(at(out), ["Produce/B1", "3/B1", "Chilled/B1", "Frozen/B1"]);
});

test("an aisle the store layout does not know about goes last, never guessed", () => {
  // Stale location data is the real hazard: sequencing sends the picker
  // confidently to the wrong bay, so they look harder before giving up.
  // Unknown sorts to the end, where it reads as "find this one yourself".
  const out = sequence([
    row("Mezzanine", "B1"),
    row("Produce", "B1"),
    row("Frozen", "B1"),
  ]);
  assert.deepEqual(at(out), ["Produce/B1", "Frozen/B1", "Mezzanine/B1"]);
});

test("sequencing never adds or drops a row", () => {
  const rows = [
    row("Frozen", "B2"),
    row("2", "B10"),
    row("Produce", "B1"),
    row("2", "B2"),
  ];
  const out = sequence(rows);

  assert.equal(out.length, rows.length);
  assert.deepEqual(
    [...out.map((r) => r.subItemId)].sort(),
    [...rows.map((r) => r.subItemId)].sort(),
  );
});

test("aisleChanges counts moves and travel counts distance through the layout", () => {
  const walk = [row("Produce", "B1"), row("Produce", "B2"), row("Frozen", "B1")];

  assert.equal(aisleChanges(walk), 1);
  // Produce is index 0 and Frozen index 9 in the Carlton layout.
  assert.equal(travel(walk), 9);
});

test("routeGain reports null rather than inventing a saving", () => {
  // A single-aisle basket has nothing to optimise. Claiming a percentage here
  // would be a number the demo cannot defend.
  const gain = routeGain([row("2", "B1"), row("2", "B2")]);
  assert.equal(gain.saved, null);
  assert.equal(gain.before.travel, 0);
});

test("routeGain measures a real saving against basket order", () => {
  // Basket order bounces out of the chiller and back: Chilled, Frozen,
  // Chilled. Sequenced, both chilled items go together and frozen goes last.
  const basket = [row("Chilled", "B1"), row("Frozen", "B1"), row("Chilled", "B2")];
  const gain = routeGain(basket);

  assert.equal(gain.before.travel, 2);
  assert.equal(gain.after.travel, 1);
  assert.equal(gain.saved, 0.5);
});

/**
 * The shift total is the number that gets quoted out loud, so the ways it
 * could lie are worth pinning down: counting a run it never assessed, letting
 * an unplaceable line inflate the distance, or reporting a gain on a basket
 * that was already in walk order.
 */

// Produce is index 0 in the layout and Frozen is index 9, so out-and-back
// across the store is the clearest possible before/after.
const outAndBack = () => [
  row("Produce", "B1"),
  row("Frozen", "B1"),
  row("Produce", "B2"),
];

test("walkSaving converts saved crossings at the stated rate", () => {
  const walk = walkSaving([outAndBack()]);

  assert.equal(walk.runsMeasured, 1);
  assert.equal(walk.positionsBefore, 18);
  assert.equal(walk.positionsAfter, 9);
  assert.equal(walk.positionsSaved, 9);
  assert.equal(walk.secondsSaved, 9 * SECONDS_PER_AISLE_POSITION);
  // The assumption travels with the number so the page can state it.
  assert.equal(walk.secondsPerPosition, SECONDS_PER_AISLE_POSITION);
});

test("walkSaving sums across runs", () => {
  const walk = walkSaving([outAndBack(), outAndBack()]);

  assert.equal(walk.runsMeasured, 2);
  assert.equal(walk.positionsSaved, 18);
});

test("a basket already in walk order is a measured zero, not a gain", () => {
  const walk = walkSaving([
    [row("Produce", "B1"), row("Produce", "B2"), row("Frozen", "B1")],
  ]);

  assert.equal(walk.runsMeasured, 1);
  assert.equal(walk.positionsSaved, 0);
  assert.equal(walk.secondsSaved, 0);
});

test("a run with no measurable walk is excluded, not counted as zero saved", () => {
  // A single-aisle basket was never assessed. Counting it as a run that saved
  // nothing would drag the shift total down with a run the system had no
  // opinion about.
  const walk = walkSaving([[row("2", "B1"), row("2", "B2")]]);

  assert.equal(walk.runsMeasured, 0);
  assert.equal(walk.positionsBefore, 0);
  assert.equal(walk.secondsSaved, 0);
});

test("an unplaceable line drops out of the distance instead of inflating it", () => {
  // The reporting side joins SKU to aisle and misses sometimes. An earlier
  // version of aisleRank gave a missing location a huge sentinel, which made
  // the walk look enormous and produced a fabricated saving.
  const walk = walkSaving([
    [row("Produce", "B1"), { location: null }, row("Frozen", "B1")],
  ]);

  assert.equal(walk.positionsBefore, 9);
  assert.equal(walk.positionsSaved, 0);
});
