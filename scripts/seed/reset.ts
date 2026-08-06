import { call, STORE, ok, step, warn } from "../lib/api.ts";
import { ORDERS, orderPayload } from "./orders.ts";

/**
 * Reset the demo queue to four unpicked orders.
 *
 * WHY THIS IS NOT A DELETE
 * ------------------------
 * Nash orders are append-only over this API. All three teardown routes were
 * probed and all three refuse:
 *
 *   POST   /order/{id}/cancel  ->  404  route does not exist
 *   DELETE /order/{id}         ->  404  MISSING_RESOURCE
 *   PATCH  /order/{id}         ->  400  "Unknown argument 'status'"
 *
 * That is correct behaviour for a fulfilment system. An order is a commercial
 * record, and a customer's order is not something an integration should be
 * able to erase.
 *
 * SO RESET SUPERSEDES RATHER THAN REMOVES
 * ---------------------------------------
 * POST /order always creates, so re-posting FM-1001..FM-1004 mints four new
 * orders carrying the same externalId as the old ones. The queue dedupes on
 * externalId and keeps the newest, so the picked copies fall out of view
 * while remaining in Nash as history.
 *
 * This is the same shape as an event log with a compacted view, and it is
 * the only reset available when the system of record will not forget.
 *
 * The catalog is untouched. Products and inventory upsert idempotently and
 * picking never mutates them, so there is nothing there to restore.
 */

type OrderResponse = {
  id: string;
  externalId?: string;
  items?: { subItems?: { id?: string; metadata?: Record<string, string> }[] }[];
  orderMetadata?: Record<string, string>;
};

async function main() {
  step(`Resetting the demo queue in store ${STORE}`);

  const fresh: OrderResponse[] = [];

  for (const o of ORDERS) {
    const res = await call<OrderResponse>(
      "POST",
      "/order",
      orderPayload(o, STORE),
    );
    fresh.push(res);
    ok(`${o.externalId} ${o.channel.padEnd(10)} ${res.id}  ${o.demonstrates}`);
  }

  step("Verifying the queue the way the app reads it");

  // Same dedupe the adapter does: newest createdAt per externalId wins. If this
  // does not agree with the app, the reset silently did nothing and the demo
  // opens on picked orders.
  const list = await call<{
    results?: { id: string; externalId?: string; createdAt?: string }[];
    orders?: { id: string; externalId?: string; createdAt?: string }[];
  }>("GET", "/orders?limit=50");

  const all = list.results ?? list.orders ?? [];
  const newest = new Map<string, { id: string; createdAt?: string }>();
  for (const o of all) {
    if (!o.externalId) continue;
    const seen = newest.get(o.externalId);
    if (!seen || (o.createdAt ?? "") > (seen.createdAt ?? "")) {
      newest.set(o.externalId, o);
    }
  }

  let clean = 0;

  for (const o of ORDERS) {
    const winner = newest.get(o.externalId);

    if (!winner) {
      warn(`${o.externalId} is not in the queue at all`);
      continue;
    }

    const detail = await call<OrderResponse>("GET", `/order/${winner.id}`);
    const status = detail.orderMetadata?.pick_status;
    const marked = (detail.items ?? [])
      .flatMap((i) => i.subItems ?? [])
      .filter((s) => s.metadata?.pick_status).length;

    if (status || marked > 0) {
      // The newest copy carries outcomes, which means the POST above did not
      // win the dedupe. Reset has not worked and the demo is still dirty.
      warn(
        `${o.externalId} still reads as picked (${status ?? "-"}, ${marked} marked sub-items). ` +
          `The re-posted order did not win the dedupe.`,
      );
      continue;
    }

    clean++;
    ok(`${o.externalId} is unpicked and top of the dedupe`);
  }

  step(
    clean === ORDERS.length
      ? `Queue is clean. ${clean} orders ready to pick.`
      : `${clean}/${ORDERS.length} clean. Fix before demoing.`,
  );

  if (clean !== ORDERS.length) process.exit(1);
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗\x1b[0m ${e.message}\n`);
  process.exit(1);
});
