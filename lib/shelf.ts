import "server-only";
import { nash, unwrap } from "./nash";
import { STORE_LAYOUT } from "./sequence";
import type { NashInventory, NashProduct } from "./types";

/**
 * The store's shelf-edge labels.
 *
 * WHY THIS PAGE EXISTS
 * --------------------
 * The scan gate is the part of this app that is hardest to believe from a
 * description, because the interesting cases are the failures: the wrong
 * bottle, the item with no label, the substitute that is not the thing that
 * was ordered. Demonstrating those needs something to actually scan.
 *
 * So this renders the catalog as real Code 128 symbols. Point a phone at the
 * screen, or print it and stick it to a desk, and the gate is being driven by
 * an optical read of a barcode that came out of Nash - not by typing. The
 * three colas sit next to each other on purpose: picking up the wrong one is
 * the scenario the gate exists for.
 */
export type ShelfItem = {
  sku: string;
  name: string;
  barcode: string;
  aisle: string | null;
  bay: string | null;
  shelf: string | null;
  /** Out-of-stock items stay on the sheet - the shelf label does not vanish. */
  inStock: boolean;
  note: string | null;
};

const upcOf = (p: NashProduct) =>
  p.identifiers?.find((i) => i.type === "UPC")?.value ?? null;

/** Walk order, so the sheet reads the way the store is laid out. */
const rank = (aisle: string | null) => {
  if (!aisle) return STORE_LAYOUT.length + 1;
  const i = STORE_LAYOUT.findIndex(
    (a) => a.toLowerCase() === aisle.toLowerCase(),
  );
  return i === -1 ? STORE_LAYOUT.length : i;
};

export async function loadShelf(): Promise<ShelfItem[]> {
  const [rawProducts, rawInventory] = await Promise.all([
    nash.get<unknown>("/products", { limit: 200 }),
    nash.get<unknown>("/inventory", { limit: 200 }),
  ]);

  const stock = new Map<string, NashInventory>();
  for (const row of unwrap<NashInventory>(rawInventory, "inventory")) {
    if (row.externalProductId) stock.set(row.externalProductId, row);
  }

  const items: ShelfItem[] = [];

  for (const p of unwrap<NashProduct>(rawProducts, "products")) {
    const barcode = upcOf(p);
    // A product with no barcode has no shelf label to print. Rendering a
    // placeholder would put a symbol on the sheet that scans to nothing.
    if (!barcode || !p.sku) continue;

    const s = p.externalIdentifier ? stock.get(p.externalIdentifier) : undefined;

    items.push({
      sku: p.sku,
      name: p.name ?? p.sku,
      barcode,
      aisle: s?.location?.aisle ?? null,
      bay: s?.location?.bay ?? null,
      shelf: s?.location?.shelf ?? null,
      inStock: (s?.available ?? false) && (s?.quantity ?? 0) > 0,
      // The seed writes the scenario into the description. Carrying it through
      // saves explaining, mid-demo, why one item refuses to be picked.
      note: p.description?.includes("OUT OF STOCK")
        ? "Out of stock in the seed"
        : null,
    });
  }

  return items.sort(
    (a, b) =>
      rank(a.aisle) - rank(b.aisle) ||
      (a.bay ?? "").localeCompare(b.bay ?? "", undefined, { numeric: true }) ||
      a.name.localeCompare(b.name),
  );
}
