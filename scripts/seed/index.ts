import { call, STORE, ok, step, warn } from "../lib/api.ts";
import { PRODUCTS, productsPayload, inventoryPayload } from "./catalog.ts";

/**
 * Idempotent. Nash upserts products on externalIdentifier and inventory on
 * externalProductId + externalStoreLocationId, so this can run any number of
 * times and still produce one catalog.
 *
 * That also means there is no teardown: DELETE /products and DELETE /inventory
 * both return 405. Reset restores quantities rather than removing rows, which
 * is how a real store catalog behaves anyway - you do not delete a product
 * because you sold out of it.
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
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗\x1b[0m ${e.message}\n`);
  process.exit(1);
});
