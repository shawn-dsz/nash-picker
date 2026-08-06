/**
 * Written from real payloads pulled off the live sandbox, not from the docs.
 *
 * Two things the docs do not tell you, both found by probing:
 *
 *   1. GET /orders returns a SUMMARY. No items, no requirements, no
 *      orderMetadata. The pick list needs GET /order/{id}.
 *   2. itemsCount comes back as a string ("5"), not a number. Anything that
 *      does arithmetic on it silently concatenates.
 *
 * The Nash* types are Nash's shape. Everything below them is OnePick's, and
 * the adapter is the only thing that crosses between the two.
 */

// ---------------------------------------------------------------- Nash shapes

export type NashSubstitution = {
  preference?: "substitute" | "refund" | null;
  source?: string | null;
  substituteItems?: { id?: string; sku?: string; quantity?: number }[] | null;
};

export type NashSubItem = {
  id?: string | null;
  sku?: string | null;
  description?: string | null;
  count?: number | null;
  weight?: number | null;
  valueCents?: number | null;
  category?: string | null;
  barcode?: string | null;
  substitution?: NashSubstitution | null;
};

export type NashOrderSummary = {
  id: string;
  externalId?: string | null;
  status?: string | null;
  tags?: string[] | null;
  valueCents?: number | null;
  currency?: string | null;
  createdAt?: string | null;
  dropoff?: {
    firstName?: string | null;
    lastName?: string | null;
    address?: string | null;
    city?: string | null;
  } | null;
};

export type NashOrderDetail = NashOrderSummary & {
  requirements?: string[] | null;
  orderMetadata?: Record<string, string> | null;
  /** A string on the wire. Do not do arithmetic on it. */
  itemsCount?: string | number | null;
  description?: string | null;
  dropoffFirstName?: string | null;
  dropoffLastName?: string | null;
  dropoffAddress?: string | null;
  items?: { id?: string; subItems?: NashSubItem[] | null }[] | null;
};

export type NashProduct = {
  id: string;
  externalIdentifier?: string | null;
  sku?: string | null;
  name?: string | null;
  imageUrls?: string[] | null;
  attributes?: string[] | null;
  details?: {
    weightedItemInfo?: {
      weightPerItem?: number | null;
      weightUnit?: string | null;
    } | null;
  } | null;
};

export type NashInventory = {
  id: string;
  productId?: string | null;
  externalProductId?: string | null;
  quantity?: number | null;
  valueCents?: number | null;
  available?: boolean | null;
  location?: {
    aisle?: string | null;
    bay?: string | null;
    shelf?: string | null;
  } | null;
};

// ------------------------------------------------------------ OnePick shapes

/**
 * Nash has no channel field. Channel rides in on tags as `channel:<name>` and
 * is normalised here. It is deliberately absent from PickRow: the picker view
 * is channel-blind by construction, because it is never handed one.
 */
export type Channel = "web" | "doordash" | "uber_eats" | "unknown";

export type QueueOrder = {
  id: string;
  reference: string;
  customer: string;
  suburb: string | null;
  channel: Channel;
  itemCount: number;
  valueCents: number;
  currency: string;
  createdAt: string | null;
  /**
   * Read back from orderMetadata, which is where picking outcomes are written.
   *
   * The queue has to read what picking wrote, or a completed order looks
   * identical to an untouched one and the whole thing reads as a mock. This
   * is the round trip made visible.
   */
  pickStatus: "waiting" | "complete" | "partial";
  /** Units delivered over units ordered. Null until a run has been written. */
  fillRate: number | null;
};

/** One row of a pick list. The join of three Nash resources. */
export type PickRow = {
  subItemId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  requestedQuantity: number;
  /** From product.attributes. Drives weight entry instead of a stepper. */
  isWeighted: boolean;
  weightUnit: string | null;
  location: { aisle: string; bay: string; shelf: string } | null;
  /** From inventory. A real state, not a mocked branch. */
  inStock: boolean;
  onHand: number | null;
  barcode: string | null;
  substitution: {
    preference: "substitute" | "refund";
    source: string | null;
    /** Resolved against the catalog so the picker sees a name, not a SKU. */
    items: { sku: string; name: string; quantity: number; imageUrl: string | null }[];
  } | null;
};

export type PickRun = {
  id: string;
  reference: string;
  customer: string;
  channel: Channel;
  /** Sequenced into store walk order, not basket order. */
  rows: PickRow[];
  /** What sequencing bought, measured against the basket as ordered. */
  route: {
    before: { moves: number; travel: number };
    after: { moves: number; travel: number };
    saved: number | null;
  };
  /** Read back from Nash, so a finished run reopens read-only. */
  pickStatus: "waiting" | "complete";
  fillRate: number | null;
  completedAt: string | null;
  /** What was recorded last time, if anything. */
  recorded: {
    subItemId: string;
    status: string | null;
    quantity: number | null;
    substituteSku: string | null;
  }[];
};
