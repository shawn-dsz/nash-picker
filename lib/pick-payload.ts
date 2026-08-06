import type { NashOrderDetail, NashSubItem } from "./types";
import type { Outcome } from "./outcomes";

/**
 * The outcome-to-Nash mapping. Pure, and separated from the write on purpose.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * `lib/pick-write.ts` imports "server-only", which is a build-time guard that
 * throws outside the Next runtime. That guard is worth keeping: it is what
 * makes an accidental client import of the Nash credential fail the build.
 *
 * But it also makes the module unloadable from a plain `node --test` process,
 * and the mapping is the part most worth testing. So the I/O keeps the guard
 * and the transform moves here, where it has no credentials, no fetch, and
 * nothing to protect.
 *
 * The split is not a testing workaround. It is the same boundary `outcomes.ts`
 * already draws: pure rules on one side, the network on the other.
 */

/** Metadata values must be strings on the wire. */
const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

/**
 * Maps outcomes onto the order's existing items array.
 *
 * Takes the CURRENT items and returns a full replacement, because PATCH on
 * `items` replaces rather than merges. Sub-items with no recorded outcome are
 * passed through untouched rather than dropped - dropping them is not a
 * rendering bug, it deletes them from the customer's order.
 */
export function toItemsPayload(
  current: NashOrderDetail["items"],
  outcomes: Outcome[],
) {
  const byId = new Map(outcomes.map((o) => [o.subItemId, o]));

  return (current ?? []).map((item) => ({
    ...item,
    subItems: (item.subItems ?? []).map((sub: NashSubItem) => {
      const o = sub.id ? byId.get(sub.id) : undefined;
      if (!o) return sub;

      return {
        ...sub,
        metadata: {
          // Spread, not replace. The order can arrive carrying metadata this
          // app did not write, and overwriting the object deletes it.
          ...sub.metadata,
          pick_status: o.status,
          picked_quantity: s(o.quantity)!,
          requested_quantity: s(o.requestedQuantity)!,
          ...(o.weight !== undefined ? { picked_weight: s(o.weight)! } : {}),
          ...(o.substituteSku ? { substitute_sku: o.substituteSku } : {}),
          ...(o.scannedBarcode ? { scanned_barcode: o.scannedBarcode } : {}),
        },
      };
    }),
  }));
}
