import { test } from "node:test";
import assert from "node:assert/strict";
import { statusFor, fillRate } from "./outcomes.ts";

/**
 * The outcome mapping is the one piece of logic in this app that the customer
 * feels directly: it decides what a shopper is told happened to their order.
 * Everything else can be re-run. A wrong status is a wrong refund.
 */

test("statusFor covers Nash's four statuses from quantities alone", () => {
  assert.equal(statusFor(3, 3), "picked");
  assert.equal(statusFor(3, 1), "partially_picked");
  assert.equal(statusFor(3, 0), "not_picked");
  assert.equal(statusFor(3, 3, true), "substituted");
});

test("a substitution is substituted even when the quantity is complete", () => {
  // Two full jars went in the tote, but they are not the jars that were
  // ordered. Reporting this as `picked` would tell the customer they got what
  // they asked for, which is the mistake worth having a test for.
  assert.equal(statusFor(2, 2, true), "substituted");
  assert.equal(statusFor(2, 0, true), "substituted");
});

test("a weighted short-pick is partial, which a boolean could not express", () => {
  // 1kg of bananas ordered, 0.94kg on the scale. This is the single most
  // common real outcome in grocery picking and it is neither picked nor
  // not-picked. It is why there is no `picked: boolean` in the model.
  assert.equal(statusFor(1, 0.94), "partially_picked");
});

test("a weighted overshoot is picked, not an invented fifth status", () => {
  // 1.02kg on the scale for a 1kg order. Nash has four statuses and this is
  // one of them. Rounding up to a new state would put a value on the wire
  // that the platform does not accept.
  assert.equal(statusFor(1, 1.02), "picked");
});

test("negative quantity cannot produce a picked status", () => {
  assert.equal(statusFor(3, -1), "not_picked");
});

test("fillRate is units delivered over units ordered", () => {
  const rate = fillRate([
    { subItemId: "a", sku: "A", status: "picked", requestedQuantity: 2, quantity: 2 },
    { subItemId: "b", sku: "B", status: "not_picked", requestedQuantity: 2, quantity: 0 },
  ]);
  assert.equal(rate, 0.5);
});

test("fillRate on an empty run is 0, not NaN", () => {
  // A NaN here reaches Nash as the string "NaN" in orderMetadata and reads
  // back as a broken order forever, because metadata is not correctable
  // through any route this app has.
  assert.equal(fillRate([]), 0);
  assert.equal(
    fillRate([
      { subItemId: "a", sku: "A", status: "not_picked", requestedQuantity: 0, quantity: 0 },
    ]),
    0,
  );
});

test("fillRate counts weight, so a 0.94kg pick is not scored as a full one", () => {
  const rate = fillRate([
    { subItemId: "a", sku: "BAN", status: "partially_picked", requestedQuantity: 1, quantity: 0.94 },
  ]);
  assert.equal(rate, 0.94);
});
