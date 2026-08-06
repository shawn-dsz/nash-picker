import { call, STORE, ok, step, warn } from "../lib/api.ts";
import { PRODUCTS, productsPayload, inventoryPayload } from "./catalog.ts";
import { ORDERS, orderPayload } from "./orders.ts";

/**
 * Idempotent, but by two different mechanisms.
 *
 * CATALOG - upsert. Nash keys products on externalIdentifier and inventory on
 * externalProductId + externalStoreLocationId, so re-running produces one
 * catalog no matter how many times it runs. There is no teardown either:
 * DELETE /products and DELETE /inventory both return 405. Reset restores
 * quantities rather than removing rows, which is how a real store catalog
 * behaves anyway - you do not delete a product because you sold out of it.
 *
 * ORDERS - delete then create. There is no upsert on externalId: POST /order
 * ALWAYS creates. So re-running used to leave a second FM-1001 behind, which
 * Nash then flagged `needs_attention` with
 *   validationErrors: { externalId: "'FM-1001' is used in other order(s)" }
 * and the queue could serve that invalid copy. Worse, the write-back would
 * land on the duplicate, so the portal would show the real order untouched.
 *
 * DELETE /order/{id} does work, unlike the catalog endpoints, so stale demo
 * orders are removed by externalId before seeding. Only references this script
 * owns are touched - anything else in the account is left alone.
 */

async function main() {
  step(`Seeding catalog into store ${STORE}`);

  const products = productsPayload();
  await call("POST", "/products", products);
  ok(`${products.products.length} products upserted`);

  const inventory = inventoryPayload(STORE);
  await call("POST", "/inventory", inventory);
  ok(`${inventory.inventory.length} inventory rows upserted`);

  step("Verifying the join");

  const gotProducts = await call<{ products: unknown[]; totalResults: number }>(
    "GET",
    "/products?limit=100",
  );
  const gotInventory = await call<{
    inventory: { externalProductId?: string; location?: unknown }[];
    totalResults: number;
  }>("GET", `/inventory?externalStoreLocationId=${STORE}&limit=100`);

  ok(`products readable: ${gotProducts.totalResults}`);
  ok(`inventory readable: ${gotInventory.totalResults}`);

  // The failure this catches is the quiet one. If externalProductId does not
  // match a product's externalIdentifier, both calls still return 200 and the
  // pick list renders empty - which reads as unseeded data, not a bad key.
  const withLocation = gotInventory.inventory.filter((i) => i.location).length;
  if (withLocation !== PRODUCTS.length) {
    warn(
      `${withLocation}/${PRODUCTS.length} inventory rows carry a location. ` +
        `A location is what puts an aisle on the pick row.`,
    );
  } else {
    ok(`all ${withLocation} rows carry aisle / bay / shelf`);
  }

  const outOfStock = PRODUCTS.filter((p) => p.quantity === 0);
  step("Storyline checks");
  ok(`${outOfStock.length} deliberately out of stock: ${outOfStock.map((p) => p.name).join(", ")}`);
  ok(
    `${PRODUCTS.filter((p) => p.weighted).length} WEIGHTED: ` +
      PRODUCTS.filter((p) => p.weighted).map((p) => p.name).join(", "),
  );

  const bay = PRODUCTS.filter(
    (p) => p.location.aisle === "4" && p.location.bay === "B2",
  );
  ok(`${bay.length} lookalikes on aisle 4 / bay B2 / shelf 3, distinct barcodes`);

  step("Clearing previous demo orders");

  // Only the references this script creates. Deleting anything else in the
  // account would make a seed script destructive, which it must never be.
  const owned = new Set(ORDERS.map((o) => o.externalId));

  const existing = await call<{
    results: { id: string; externalId: string | null; status?: string }[];
  }>("GET", "/orders?limit=100");

  const stale = (existing.results ?? []).filter(
    (o) => o.externalId && owned.has(o.externalId),
  );

  for (const o of stale) {
    // Two calls, and the first one is the load-bearing one.
    //
    // DELETE is a soft archive: the order stays in GET /orders with
    // status "archived" AND IT KEEPS ITS externalId. So a deleted FM-1001
    // still holds the reference, and the next create lands in
    // needs_attention with
    //   "'FM-1001' is used in other order(s): ord_..."
    //
    // Renaming to a tombstone first is what actually frees the reference.
    // The suffix keeps tombstones unique and stops them matching `owned` on
    // the next run, so they are swept once and never revisited.
    await call("PATCH", `/order/${o.id}`, {
      externalId: `${o.externalId}-void-${o.id.slice(-6)}`,
    });
    await call("DELETE", `/order/${o.id}`);
    ok(`released ${o.externalId}  ${o.id}`);
  }
  ok(
    stale.length === 0
      ? "nothing stale to clear"
      : `${stale.length} stale order(s) removed - seed is now repeatable`,
  );

  step("Seeding orders");

  for (const o of ORDERS) {
    const res = await call<{
      id: string;
      status: string;
      items?: { subItems?: { sku?: string; substitution?: unknown }[] }[];
    }>("POST", "/order", orderPayload(o, STORE));

    ok(`${o.externalId} ${o.channel.padEnd(10)} ${res.id}  ${o.demonstrates}`);

    // Whether substitution survives order create was the open question. It
    // decides whether orders C and D can exist at all, so it is asserted
    // rather than assumed.
    const subs = (res.items ?? [])
      .flatMap((i) => i.subItems ?? [])
      .filter((s) => s.substitution);
    const expected = o.lines.filter((l) => l.substitution).length;

    if (subs.length !== expected) {
      warn(
        `substitution did not round-trip: sent ${expected}, got back ${subs.length}. ` +
          `Orders C and D depend on this.`,
      );
    } else if (expected > 0) {
      ok(`  substitution round-tripped on ${expected} sub-item(s)`);
    }
  }

  // The duplicate this script exists to prevent is invisible until the queue
  // serves the wrong copy, so it is asserted rather than assumed.
  step("Verifying one order per reference");

  const after = await call<{
    results: { externalId: string | null; status?: string }[];
  }>("GET", "/orders?limit=100");

  for (const ref of owned) {
    // Archived copies are invisible to the queue - the adapter filters them -
    // but they are counted here anyway, because an archived order still
    // holding this reference is exactly what pushes the live one into
    // needs_attention.
    const all = (after.results ?? []).filter((o) => o.externalId === ref);
    const live = all.filter(
      (o) => o.status !== "archived" && o.status !== "cancelled",
    );

    if (live.length !== 1) {
      warn(`${ref}: ${live.length} live copies. The queue may serve the wrong one.`);
    } else if (live[0].status === "needs_attention") {
      warn(
        `${ref}: live copy is needs_attention` +
          (all.length > live.length
            ? ` - ${all.length - live.length} archived copy still holds the reference`
            : ""),
      );
    } else {
      ok(`${ref}: exactly one live copy, status ${live[0].status}`);
    }
  }
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗\x1b[0m ${e.message}\n`);
  process.exit(1);
});
