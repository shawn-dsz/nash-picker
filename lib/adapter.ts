import "server-only";
import { nash, unwrap } from "./nash";
import { sequence, routeGain } from "./sequence";
import { newestByReference } from "./dedupe";
import type {
  Channel,
  NashInventory,
  NashOrderDetail,
  NashOrderSummary,
  NashProduct,
  NashSubItem,
  PickRow,
  PickRun,
  QueueOrder,
} from "./types";

/**
 * The only module that knows Nash's payload shape.
 *
 * It does two jobs:
 *   1. The three-way join. An order knows WHAT was bought, the catalog knows
 *      WHAT IT IS, and per-store inventory knows WHERE IT IS. Rendering one
 *      pick row needs all three, and location lives on inventory.
 *   2. Channel normalisation. Nash has no channel field, so it arrives on
 *      tags and is resolved here. PickRow has no channel property, which is
 *      what makes the picker view channel-blind by construction.
 *
 * Every identity mismatch in this join returns HTTP 200 with an empty result,
 * never an error. So the join is instrumented rather than trusted.
 */

const STORE = process.env.NASH_EXTERNAL_STORE_ID ?? "001";

// ------------------------------------------------------------------- channel

export function toChannel(tags?: string[] | null): Channel {
  const tag = (tags ?? []).find((t) => t.startsWith("channel:"));
  const raw = tag?.slice("channel:".length);
  if (raw === "web" || raw === "doordash" || raw === "uber_eats") return raw;
  return "unknown";
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  web: "Web",
  doordash: "DoorDash",
  uber_eats: "Uber Eats",
  unknown: "Other",
};

// --------------------------------------------------------------------- queue

/**
 * The queue.
 *
 * GET /orders is a summary endpoint - no items, no requirements - so item
 * count comes from the detail fetch. Four orders is four extra calls, which
 * is fine at this size and is the first thing to change at real volume.
 *
 * Deduped on externalId because seeding is idempotent for the catalog but not
 * for orders: POST /order always creates. The newest wins.
 */
export async function getQueue(): Promise<QueueOrder[]> {
  const raw = await nash.get<unknown>("/orders", { limit: 50 });
  const summaries = unwrap<NashOrderSummary>(raw, "orders");

  // Archived copies are the seed's tombstones. Newest-wins is in its own pure
  // module so the date comparison can be tested - it is on time rather than on
  // text, because Nash returns RFC-1123 and the weekday leads the string.
  const live = newestByReference(
    summaries.filter(
      (o) => o.status !== "archived" && o.status !== "cancelled",
    ),
  );

  const details = await Promise.allSettled(
    live.map((o) => nash.get<NashOrderDetail>(`/order/${o.id}`)),
  );

  const orders: QueueOrder[] = [];

  for (const [i, o] of live.entries()) {
    const result = details[i];
    const detail = result.status === "fulfilled" ? result.value : null;

    // Only pick-and-pack orders belong in a picking queue. A delivery-only
    // order in this list would be a picker staring at an empty pick list.
    if (!detail?.requirements?.includes("pick_and_pack")) continue;

    // Reading back what picking wrote. Without this a completed order is
    // indistinguishable from an untouched one, which makes a working round
    // trip look like a mock.
    const meta = detail.orderMetadata ?? {};
    const written = meta.pick_status;
    const rate = meta.pick_fill_rate ? Number(meta.pick_fill_rate) : null;

    orders.push({
      id: o.id,
      reference: o.externalId!,
      customer:
        [o.dropoff?.firstName, o.dropoff?.lastName].filter(Boolean).join(" ") ||
        "Customer",
      suburb: o.dropoff?.city ?? null,
      channel: toChannel(o.tags),
      itemCount: subItemsOf(detail).length,
      valueCents: o.valueCents ?? 0,
      currency: o.currency ?? "AUD",
      createdAt: o.createdAt ?? null,
      pickStatus:
        written === "items_pick_complete"
          ? "complete"
          : written === "items_pick_partial"
            ? "partial"
            : "waiting",
      fillRate: rate !== null && !Number.isNaN(rate) ? rate : null,
    });
  }

  // Work to do first. A picker opening the app should see what is outstanding,
  // not scroll past this morning's finished runs.
  const rank = { waiting: 0, partial: 1, complete: 2 } as const;
  return orders.sort(
    (a, b) =>
      rank[a.pickStatus] - rank[b.pickStatus] ||
      a.reference.localeCompare(b.reference),
  );
}

const subItemsOf = (d: NashOrderDetail | null): NashSubItem[] =>
  (d?.items ?? []).flatMap((i) => i.subItems ?? []);

// ---------------------------------------------------------------- the join

/**
 * The three-way join, for one order.
 *
 * The catalog is fetched whole and indexed by SKU rather than looked up per
 * item. Per-item lookup is an N+1 that turns one order into a dozen calls.
 * Correct at 14 products, wrong at 40,000 - at which point GET /products
 * takes a SKU filter and this becomes a one-function change. That is the
 * reason the join lives in one place.
 */
export async function getPickRun(orderId: string): Promise<PickRun | null> {
  const [order, productsRaw, inventoryRaw] = await Promise.all([
    nash.get<NashOrderDetail>(`/order/${orderId}`),
    nash.get<unknown>("/products", { limit: 500 }),
    nash.get<unknown>("/inventory", {
      externalStoreLocationId: STORE,
      limit: 500,
    }),
  ]);

  if (!order) return null;

  const products = unwrap<NashProduct>(productsRaw, "products");
  const inventory = unwrap<NashInventory>(inventoryRaw, "inventory");

  // sku -> product, and externalIdentifier -> inventory. Two hops, because
  // inventory joins on the product's external id rather than its Nash id.
  const bySku = new Map<string, NashProduct>();
  for (const p of products) if (p.sku) bySku.set(p.sku, p);

  const stockByExternalId = new Map<string, NashInventory>();
  for (const i of inventory) {
    if (i.externalProductId) stockByExternalId.set(i.externalProductId, i);
  }

  /** Nash returns the barcode as identifiers[], never as a `upc` field. */
  const upcOf = (p?: NashProduct) =>
    p?.identifiers?.find((i) => i.type === "UPC")?.value ?? null;

  // UPC -> name, built from the catalog already fetched above. No extra call.
  // This is what lets a wrong scan name the thing in the picker's hand.
  const catalogByUpc: Record<string, string> = {};
  for (const p of products) {
    const upc = upcOf(p);
    if (upc && p.name) catalogByUpc[upc] = p.name;
  }

  const resolve = (sku: string) => {
    const product = bySku.get(sku);
    const stock = product?.externalIdentifier
      ? stockByExternalId.get(product.externalIdentifier)
      : undefined;
    return { product, stock };
  };

  const rows: PickRow[] = subItemsOf(order).map((s, index) => {
    const sku = s.sku ?? "";
    const { product, stock } = resolve(sku);

    // A row with no location is the visible symptom of a broken join. It is
    // logged rather than swallowed, because the alternative is an empty aisle
    // column that reads as missing data.
    if (!product || !stock) {
      console.warn(
        `[adapter] join miss on sku=${sku} product=${!!product} inventory=${!!stock}`,
      );
    }

    const sub = s.substitution;
    const preference = sub?.preference;

    return {
      subItemId: s.id ?? `${orderId}-${index}`,
      sku,
      name: product?.name ?? s.description ?? sku,
      imageUrl: product?.imageUrls?.[0] ?? null,
      requestedQuantity: s.count ?? 1,
      isWeighted: (product?.attributes ?? []).includes("WEIGHTED"),
      weightUnit: product?.details?.weightedItemInfo?.weightUnit ?? null,
      location: stock?.location
        ? {
            aisle: stock.location.aisle ?? "?",
            bay: stock.location.bay ?? "?",
            shelf: stock.location.shelf ?? "?",
          }
        : null,
      inStock: (stock?.available ?? false) && (stock?.quantity ?? 0) > 0,
      onHand: stock?.quantity ?? null,
      // Product first. The sub-item's own barcode is null on every order in
      // the sandbox, so reading it alone left every row unscannable.
      barcode: upcOf(product) ?? s.barcode ?? null,
      substitution:
        preference === "substitute" || preference === "refund"
          ? {
              preference,
              source: sub?.source ?? null,
              // Resolved against the catalog so the picker sees a product,
              // not a SKU string. Empty for a refund preference, which is the
              // point: there is nothing to offer.
              items: (sub?.substituteItems ?? [])
                .map((alt) => {
                  const p = alt.sku ? bySku.get(alt.sku) : undefined;
                  return {
                    sku: alt.sku ?? "",
                    name: p?.name ?? alt.sku ?? "Substitute",
                    quantity: alt.quantity ?? 1,
                    imageUrl: p?.imageUrls?.[0] ?? null,
                    // The substitute's own barcode. A picker taking penne
                    // scans penne, not the spirals that were out of stock.
                    barcode: upcOf(p),
                  };
                })
                .filter((a) => a.sku),
            }
          : null,
    };
  });

  // Read back any outcome already written, so a completed run can be reopened
  // read-only rather than picked a second time.
  const meta = order.orderMetadata ?? {};
  const alreadyPicked = meta.pick_status === "items_pick_complete";

  return {
    id: order.id,
    reference: order.externalId ?? order.id,
    customer:
      [order.dropoffFirstName, order.dropoffLastName].filter(Boolean).join(" ") ||
      "Customer",
    channel: toChannel(order.tags),
    // Serpentine traversal over the store layout, rather than basket order.
    rows: sequence(rows),
    // Measured, not asserted. On a small basket the gain is sometimes zero,
    // and claiming a saving that was not made is worse than reporting none.
    route: routeGain(rows),
    catalogByUpc,
    pickStatus: alreadyPicked ? "complete" : "waiting",
    fillRate: meta.pick_fill_rate ? Number(meta.pick_fill_rate) : null,
    completedAt: meta.pick_completed_at ?? null,
    recorded: subItemsOf(order).map((s) => {
      const m = s.metadata ?? {};
      return {
        subItemId: s.id ?? "",
        status: m.pick_status ?? null,
        quantity: m.picked_quantity ? Number(m.picked_quantity) : null,
        substituteSku: m.substitute_sku ?? null,
      };
    }),
  };
}
