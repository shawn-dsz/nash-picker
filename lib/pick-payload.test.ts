import { test } from "node:test";
import assert from "node:assert/strict";
import { toItemsPayload } from "./pick-payload.ts";
import type { Outcome } from "./outcomes.ts";
import type { NashOrderDetail } from "./types.ts";

/**
 * These tests exist because PATCH on `items` REPLACES rather than merges.
 *
 * That turns an ordinary mapping bug into data loss: whatever this function
 * leaves out is deleted from the customer's order, and Nash returns 200 for
 * the destructive version exactly as it does for the correct one. There is no
 * error to notice and no undo.
 */

const order = (): NashOrderDetail["items"] => [
  {
    subItems: [
      { id: "si_1", sku: "CHL-MLK-300", count: 2, description: "Milk 2L" },
      { id: "si_2", sku: "DRY-PAS-200", count: 1, description: "Pasta 500g" },
      { id: "si_3", sku: "FRZ-PEA-400", count: 1, description: "Peas 1kg" },
    ],
  },
];

const outcome = (over: Partial<Outcome> = {}): Outcome => ({
  subItemId: "si_1",
  sku: "CHL-MLK-300",
  status: "picked",
  requestedQuantity: 2,
  quantity: 2,
  ...over,
});

const subItems = (items: ReturnType<typeof toItemsPayload>) =>
  items.flatMap((i) => i.subItems ?? []);

const meta = (items: ReturnType<typeof toItemsPayload>, at = 0) =>
  subItems(items)[at].metadata ?? {};

test("sub-items with no outcome survive the replacement untouched", () => {
  // THE test. One outcome recorded, three sub-items must come back. Dropping
  // the other two is not a rendering glitch, it removes two products from a
  // paid order.
  const out = subItems(toItemsPayload(order(), [outcome()]));

  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((s) => s.id),
    ["si_1", "si_2", "si_3"],
  );
  assert.equal(out[1].metadata, undefined);
  assert.equal(out[2].sku, "FRZ-PEA-400");
});

test("the recorded outcome lands on that sub-item's metadata", () => {
  const m = meta(
    toItemsPayload(order(), [outcome({ status: "partially_picked", quantity: 1 })]),
  );

  assert.equal(m.pick_status, "partially_picked");
  assert.equal(m.picked_quantity, "1");
  assert.equal(m.requested_quantity, "2");
});

test("every metadata value is a string, because the wire requires it", () => {
  // Numbers are accepted by JSON.stringify and rejected or silently coerced by
  // Nash. Asserting the type here is cheaper than reading it back.
  const m = meta(toItemsPayload(order(), [outcome({ quantity: 0.94, weight: 0.94 })]));

  for (const [k, v] of Object.entries(m)) {
    assert.equal(typeof v, "string", `${k} is ${typeof v}, not string`);
  }
  assert.equal(m.picked_weight, "0.94");
});

test("optional keys are absent rather than undefined", () => {
  // `substitute_sku: undefined` survives an object literal but disappears
  // through JSON.stringify, so the two look identical on the wire and only
  // differ when something reads the object in process. Absent is the honest
  // shape: there was no substitute.
  const m = meta(toItemsPayload(order(), [outcome()]));

  assert.equal("substitute_sku" in m, false);
  assert.equal("picked_weight" in m, false);
  assert.equal("scanned_barcode" in m, false);
});

test("a substitution records the SKU that actually went in the tote", () => {
  const m = meta(
    toItemsPayload(order(), [
      outcome({ status: "substituted", substituteSku: "DRY-PAS-201" }),
    ]),
  );

  assert.equal(m.pick_status, "substituted");
  assert.equal(m.substitute_sku, "DRY-PAS-201");
});

test("existing metadata is preserved, not clobbered", () => {
  // The order arrives with metadata this app did not write. Replacing the
  // object instead of spreading it would quietly delete another system's data.
  const withMeta: NashOrderDetail["items"] = [
    {
      subItems: [
        { id: "si_1", sku: "CHL-MLK-300", count: 2, metadata: { source_system: "web" } },
      ],
    },
  ];

  const m = meta(toItemsPayload(withMeta, [outcome()]));

  assert.equal(m.source_system, "web");
  assert.equal(m.pick_status, "picked");
});

test("an outcome for an unknown sub-item does not invent one", () => {
  const out = subItems(
    toItemsPayload(order(), [outcome({ subItemId: "si_does_not_exist" })]),
  );

  assert.equal(out.length, 3);
  assert.equal(out.every((s) => !s.metadata), true);
});

test("an empty items array produces an empty payload, not a crash", () => {
  assert.deepEqual(toItemsPayload(undefined, [outcome()]), []);
  assert.deepEqual(toItemsPayload([], [outcome()]), []);
});
