import "server-only";
import { nash } from "./nash";
import type { NashOrderDetail, NashSubItem } from "./types";
import { fillRate, type Outcome } from "./outcomes";

/**
 * Writing picking outcomes back to Nash.
 *
 * WHAT WAS VERIFIED, AND WHAT IT COST
 * -----------------------------------
 * The plan assumed `pickedItems` was writable via PATCH /v1/order/{id}. It is
 * not: `pickedItems` is not an argument on update, and order `status` is not
 * writable either. Both were confirmed against the live sandbox before any
 * write code existed, rather than at 14:30 during L5.
 *
 * So outcomes land on `subItems[].metadata` and the run summary on
 * `orderMetadata`. Both persist.
 *
 * THE COST, STATED PLAINLY
 * ------------------------
 *   - A general-purpose metadata field is not a first-class picking field, so
 *     Nash's own systems cannot act on it. Completion is a convention this app
 *     defines, not a status the platform recognises, and dispatch will not
 *     trigger off it.
 *   - PATCH on `items` REPLACES rather than merges. The whole items array has
 *     to be sent every time, which means reading the order first. Sending a
 *     partial array silently destroys the rest of the basket.
 *
 * If a first-class picking write path exists, `toItemsPayload` is the only
 * function that changes. That is why the mapping is isolated here.
 */

/** Metadata values must be strings on the wire. */
const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

/**
 * Maps outcomes onto the order's existing items array.
 *
 * Takes the CURRENT items and returns a full replacement, because PATCH
 * replaces. Sub-items with no recorded outcome are passed through untouched
 * rather than dropped.
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
          ...(sub as { metadata?: Record<string, string> }).metadata,
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

export type WriteResult = {
  orderId: string;
  reference: string;
  written: number;
  fillRate: number;
  pickStatus: string;
  portalUrl: string | null;
};

/**
 * One PATCH per run, not one per tap.
 *
 * That is a deliberate consequence of PATCH replacing `items`: writing per tap
 * would mean a read-modify-write cycle on every single item, and any two of
 * them overlapping would lose an outcome. Batching at completion makes the
 * write atomic for the run.
 *
 * The cost is honest and worth naming: an outcome recorded mid-run is not
 * durable until the run completes. The fix is a write-ahead queue on the
 * device, not a per-tap write.
 */
export async function writeRun(
  orderId: string,
  outcomes: Outcome[],
): Promise<WriteResult> {
  // Read first. PATCH replaces the items array, so a partial send would
  // destroy every sub-item not included.
  const order = await nash.get<NashOrderDetail>(`/order/${orderId}`);

  const rate = fillRate(outcomes);
  const complete = outcomes.length === (order.items ?? []).flatMap((i) => i.subItems ?? []).length;

  const updated = await nash.patch<NashOrderDetail>(`/order/${orderId}`, {
    items: toItemsPayload(order.items, outcomes),
    orderMetadata: {
      ...(order.orderMetadata ?? {}),
      // Nash does not recognise this as a status. It is this app's convention,
      // and it is named as one rather than dressed up as a platform state.
      pick_status: complete ? "items_pick_complete" : "items_pick_partial",
      pick_fill_rate: rate.toFixed(2),
      pick_completed_at: new Date().toISOString(),
    },
  });

  return {
    orderId,
    reference: updated.externalId ?? orderId,
    written: outcomes.length,
    fillRate: rate,
    pickStatus: complete ? "items_pick_complete" : "items_pick_partial",
    portalUrl: (updated as { portalUrl?: string }).portalUrl ?? null,
  };
}
