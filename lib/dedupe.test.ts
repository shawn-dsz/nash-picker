import { test } from "node:test";
import assert from "node:assert/strict";
import { newestByReference } from "./dedupe.ts";
import type { NashOrderSummary } from "./types.ts";

const order = (id: string, externalId: string | null, createdAt?: string) =>
  ({ id, externalId, createdAt }) as NashOrderSummary;

test("newest wins per reference", () => {
  const out = newestByReference([
    order("old", "FM-1001", "Thu, 06 Aug 2026 02:00:00 GMT"),
    order("new", "FM-1001", "Thu, 06 Aug 2026 09:00:00 GMT"),
  ]);

  assert.equal(out.length, 1);
  assert.equal(out[0].id, "new");
});

test("dates are compared as time, not as text", () => {
  // Nash returns RFC-1123 with the weekday first, so a string comparison
  // sorts by day name: "Fri, 07 Aug" < "Thu, 06 Aug". The bug reads correctly
  // for a whole day and inverts at midnight, so it works while you build it
  // and serves the stale, already-picked copy the next morning.
  const out = newestByReference([
    order("wednesday", "FM-1001", "Wed, 05 Aug 2026 23:00:00 GMT"),
    order("thursday", "FM-1001", "Thu, 06 Aug 2026 23:00:00 GMT"),
    order("friday", "FM-1001", "Fri, 07 Aug 2026 01:00:00 GMT"),
  ]);

  assert.equal(out.length, 1);
  assert.equal(out[0].id, "friday");
});

test("month rollover is compared as time too", () => {
  // "Mon, 01 Sep" versus "Sun, 31 Aug". Both the weekday and the month name
  // sort wrong as text.
  const out = newestByReference([
    order("august", "FM-1001", "Sun, 31 Aug 2026 23:00:00 GMT"),
    order("september", "FM-1001", "Mon, 01 Sep 2026 01:00:00 GMT"),
  ]);

  assert.equal(out[0].id, "september");
});

test("different references are all kept", () => {
  const out = newestByReference([
    order("a", "FM-1001", "Thu, 06 Aug 2026 02:00:00 GMT"),
    order("b", "FM-1002", "Thu, 06 Aug 2026 02:00:00 GMT"),
    order("c", "FM-1003", "Thu, 06 Aug 2026 02:00:00 GMT"),
  ]);

  assert.deepEqual(out.map((o) => o.id).sort(), ["a", "b", "c"]);
});

test("orders with no externalId are dropped", () => {
  // The sandbox carries orders this app did not create. It can only recognise
  // its own references, and an order it cannot name is not one to pick.
  const out = newestByReference([
    order("mine", "FM-1001", "Thu, 06 Aug 2026 02:00:00 GMT"),
    order("theirs", null, "Thu, 06 Aug 2026 09:00:00 GMT"),
  ]);

  assert.equal(out.length, 1);
  assert.equal(out[0].id, "mine");
});

test("a missing createdAt never beats a real one", () => {
  const out = newestByReference([
    order("dated", "FM-1001", "Thu, 06 Aug 2026 02:00:00 GMT"),
    order("undated", "FM-1001", undefined),
  ]);

  assert.equal(out[0].id, "dated");
});
