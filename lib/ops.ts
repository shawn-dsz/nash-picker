import "server-only";
import { nash, unwrap } from "./nash";
import { getQueue } from "./adapter";
import { buildReport, type Report } from "./metrics";
import type { NashInventory, NashOrderDetail } from "./types";

/**
 * Loads everything the fulfilment view needs.
 *
 * Order SELECTION is delegated to getQueue() rather than reimplemented. The
 * queue already knows the rules - drop archived and cancelled, dedupe on
 * externalId because POST /order always creates, keep only pick_and_pack - and
 * a second copy of those rules would drift the moment one changed. The cost is
 * a second detail fetch per order, which is the right trade at this size.
 *
 * The inventory call is what makes the by-aisle cut possible at all: aisle
 * lives on inventory, not on the order and not on the pick outcome, so the
 * actionable breakdown needs this join. If inventory is unreachable the report
 * still renders - it just reports no aisles rather than inventing them.
 */
export async function loadReport(): Promise<Report & { unreadable: number }> {
  const queue = await getQueue();

  const [settled, aisleBySku] = await Promise.all([
    Promise.allSettled(
      queue.map((o) => nash.get<NashOrderDetail>(`/order/${o.id}`)),
    ),
    loadAisles(),
  ]);

  const details = settled
    .filter(
      (r): r is PromiseFulfilledResult<NashOrderDetail> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);

  return {
    ...buildReport(details, aisleBySku),
    // A partial read would understate every number without saying so.
    unreadable: settled.length - details.length,
  };
}

/** SKU to aisle, from store inventory. Empty on failure, never guessed. */
async function loadAisles(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const raw = await nash.get<unknown>("/inventory", { limit: 200 });
    for (const row of unwrap<NashInventory>(raw, "inventory")) {
      const sku = row.externalProductId ?? null;
      const aisle = row.location?.aisle ?? null;
      if (sku && aisle) map.set(sku, aisle);
    }
  } catch {
    // Inventory being unreachable costs the aisle cut, not the whole page.
  }
  return map;
}
