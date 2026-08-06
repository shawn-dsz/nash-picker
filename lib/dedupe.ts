import type { NashOrderSummary } from "./types";

/**
 * Choosing which copy of an order the queue shows.
 *
 * WHY THERE ARE COPIES AT ALL
 * ---------------------------
 * `POST /order` has no upsert on `externalId` - it always creates. The seed
 * clears its own references before re-creating them, but a queue that assumed
 * uniqueness would still be one manual POST away from serving two FM-1001s,
 * and the write-back would land on whichever one it happened to pick.
 *
 * So the rule is explicit: newest wins, per reference.
 *
 * WHY THE COMPARISON IS ON TIME AND NOT ON TEXT
 * ---------------------------------------------
 * Nash returns RFC-1123, not ISO 8601:
 *
 *     Thu, 06 Aug 2026 02:40:56 GMT
 *
 * The weekday leads the string, so a lexicographic comparison sorts by day
 * name. "Fri, 07 Aug" < "Thu, 06 Aug" as text, which is exactly backwards.
 * It reads correctly for a whole day and then inverts at midnight, which is
 * the worst possible failure shape: it works while you are building it and
 * breaks the next morning.
 *
 * Pure and separate from lib/adapter.ts because that module imports
 * "server-only" and cannot be loaded by a test process.
 */

const at = (s?: string | null) => (s ? new Date(s).getTime() : 0);

/**
 * One order per `externalId`, newest first by `createdAt`.
 *
 * Orders with no `externalId` are dropped: this app can only recognise its own
 * references, and an order it cannot name is not one it should be picking.
 * Ties keep the copy seen first, so the result is stable.
 */
export function newestByReference(
  orders: NashOrderSummary[],
): NashOrderSummary[] {
  const newest = new Map<string, NashOrderSummary>();

  for (const o of orders) {
    if (!o.externalId) continue;
    const seen = newest.get(o.externalId);
    if (!seen || at(o.createdAt) > at(seen.createdAt)) {
      newest.set(o.externalId, o);
    }
  }

  return [...newest.values()];
}
