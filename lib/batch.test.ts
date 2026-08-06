import { test } from "node:test";
import assert from "node:assert/strict";
import { formBatch, planBatch, SECONDS_PER_SORT } from "./batch.ts";
import type { BatchableRun } from "./batch.ts";
import type { PickRow } from "./types.ts";

/**
 * Batch formation. The ways this goes quietly wrong are all arithmetic that
 * still returns a plausible-looking plan: a line dropped from the combined
 * list, a tote number that moves, sortation charged to a picker carrying one
 * order, or a negative saving hidden so the batch always looks worth forming.
 *
 * None of those throw. They just make the store slower while the screen says
 * otherwise.
 */

const row = (aisle: string, bay = "B1"): PickRow =>
  ({
    subItemId: `${aisle}-${bay}-${Math.random()}`,
    sku: `SKU-${aisle}${bay}`,
    name: `Item ${aisle}${bay}`,
    requestedQuantity: 1,
    isWeighted: false,
    location: { aisle, bay, shelf: "1" },
    inStock: true,
  }) as PickRow;

const run = (reference: string, ...aisles: string[]): BatchableRun => ({
  reference,
  rows: aisles.map((a) => row(a)),
});

const refs = (batch: BatchableRun[]) => batch.map((b) => b.reference);

test("the widest-spread order seeds the batch", () => {
  // It already pays for the longest walk, so everything added inside its
  // aisles rides along free. Seeding on the narrowest order instead grows the
  // walk with every addition.
  const batch = formBatch(
    [run("narrow", "2"), run("wide", "Produce", "2", "Frozen"), run("mid", "2", "3")],
    1,
  );
  assert.deepEqual(refs(batch), ["wide"]);
});

test("extends by fewest NEW aisles, which is the whole algorithm", () => {
  // "overlap" lives entirely inside the seed's aisles and costs nothing to
  // add. "far" drags the picker into Frozen. Picking by line count, or by
  // arrival, or at random would take "far" here.
  const batch = formBatch(
    [
      run("seed", "Produce", "2", "3"),
      run("far", "Frozen"),
      run("overlap", "2", "3"),
    ],
    2,
  );
  assert.deepEqual(refs(batch), ["seed", "overlap"]);
});

test("capacity is a hard limit, because the trolley is", () => {
  const pool = [run("a", "1"), run("b", "2"), run("c", "3"), run("d", "4")];
  assert.equal(formBatch(pool, 2).length, 2);
  assert.equal(formBatch(pool, 99).length, 4);
  assert.deepEqual(formBatch(pool, 0), []);
});

test("the combined list never drops or duplicates a line", () => {
  // The failure that matters most: a customer is silently short an item and
  // nothing in the run says so.
  const pool = [run("a", "Produce", "2"), run("b", "2", "Frozen"), run("c", "3")];
  const plan = planBatch(pool, 3)!;

  const expected = pool.reduce((n, r) => n + r.rows.length, 0);
  assert.equal(plan.lines.length, expected);
  assert.equal(new Set(plan.lines.map((l) => l.subItemId)).size, expected);
});

test("every line carries the order it belongs to and one stable tote", () => {
  // Without this the picker has a perfect route and no idea which tote to put
  // anything in, which is the error class batching introduces.
  const plan = planBatch([run("a", "Produce", "Frozen"), run("b", "2")], 2)!;

  for (const line of plan.lines) {
    const order = plan.orders.find((o) => o.reference === line.reference);
    assert.ok(order, `line has no owning order: ${line.reference}`);
    assert.equal(line.tote, order.tote);
  }
  assert.equal(new Set(plan.orders.map((o) => o.tote)).size, plan.orders.length);
});

test("a batch of one is not charged sortation", () => {
  // One order means one tote means reach-and-drop. Charging put-to-tote here
  // would make single-order picking look worse than it is and bias every
  // comparison towards batching.
  const plan = planBatch([run("solo", "Produce", "Frozen")], 1)!;

  assert.equal(plan.cost.sortation, 0);
  assert.equal(plan.cost.total, plan.cost.batched);
  assert.equal(plan.cost.saved, 0);
});

test("sortation is charged per line, not per order", () => {
  const plan = planBatch([run("a", "Produce", "2"), run("b", "2", "Frozen")], 2)!;
  assert.equal(plan.cost.sortation, 4 * SECONDS_PER_SORT);
});

test("a batch that costs more reports a negative saving rather than hiding it", () => {
  // Two orders in the same single aisle save no walking at all, so the batch
  // is pure sortation cost. This is the common outcome at low order density
  // and it is the number that decides whether a store should batch. Clamping
  // it at zero would turn a decision tool into a sales tool.
  const plan = planBatch([run("a", "2"), run("b", "2")], 2)!;

  assert.equal(plan.cost.individual, 0);
  assert.equal(plan.cost.batched, 0);
  assert.equal(plan.cost.sortation, 2 * SECONDS_PER_SORT);
  assert.ok(plan.cost.saved < 0, "a worthless batch must report as worthless");
  // No walking to compare, so there is no honest fraction to report.
  assert.equal(plan.cost.savedFraction, null);
});

test("batching a spread-out pair beats picking them separately", () => {
  // Produce is index 0 and Frozen index 9 in the Carlton layout, so picking
  // these apart crosses the store twice.
  const plan = planBatch(
    [run("a", "Produce", "Frozen"), run("b", "Produce", "Frozen")],
    2,
  )!;

  assert.equal(plan.cost.individual, 18 * 8);
  assert.equal(plan.cost.batched, 9 * 8);
  assert.ok(plan.cost.saved > 0);
});

test("the combined list comes back in walk order, not order order", () => {
  // Interleaved by aisle, not grouped by customer. Grouping by customer is
  // exactly the behaviour batching exists to remove.
  const plan = planBatch([run("a", "Produce", "Frozen"), run("b", "2")], 2)!;
  const aisles = plan.lines.map((l) => l.location?.aisle);

  assert.deepEqual(aisles, ["Produce", "2", "Frozen"]);
});

test("an empty pool plans nothing rather than an empty batch", () => {
  assert.equal(planBatch([], 4), null);
});
