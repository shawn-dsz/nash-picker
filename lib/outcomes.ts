/**
 * The outcome model. Nash's four statuses, nothing invented.
 *
 * There is no `picked: boolean` anywhere, deliberately. A customer orders 1kg
 * of bananas and the picker weighs 0.94kg - that is neither picked nor
 * not-picked, and a boolean makes the most common real case unrepresentable.
 *
 * No "server-only" here: this is a pure module with no credentials and no
 * fetch, and the pick screen is a client component that needs the type.
 */

export type PickStatus =
  | "picked"
  | "partially_picked"
  | "not_picked"
  | "substituted";

export type Outcome = {
  subItemId: string;
  sku: string;
  status: PickStatus;
  requestedQuantity: number;
  /** What is physically in the tote. For weighted goods this is a weight. */
  quantity: number;
  /** Only set for products carrying the WEIGHTED attribute. */
  weight?: number;
  /** Only set on `substituted`. The SKU the customer pre-approved. */
  substituteSku?: string;
  /** What was actually scanned. Never the expected barcode. */
  scannedBarcode?: string;
  /**
   * True when the picker proceeded past a failed or missing scan.
   *
   * Recorded, never silent. An override that leaves no trace is worse than no
   * gate at all: it looks like verification happened. This is also the only
   * scan metric the system can honestly compute - see lib/metrics.ts.
   */
  scanOverride?: boolean;
};

export const STATUS_LABEL: Record<PickStatus, string> = {
  picked: "Picked",
  partially_picked: "Partial",
  not_picked: "Missing",
  substituted: "Swapped",
};

/**
 * Derives the status from quantities rather than trusting a caller to pass a
 * consistent pair. One rule, one place, so the UI cannot disagree with the
 * write path about what "partial" means.
 */
export function statusFor(
  requested: number,
  got: number,
  substituted = false,
): PickStatus {
  if (substituted) return "substituted";
  if (got <= 0) return "not_picked";
  if (got < requested) return "partially_picked";
  return "picked";
}

/** Units delivered over units ordered. The headline metric. */
export function fillRate(outcomes: Outcome[]): number {
  const ordered = outcomes.reduce((n, o) => n + o.requestedQuantity, 0);
  if (ordered === 0) return 0;
  const got = outcomes.reduce((n, o) => n + o.quantity, 0);
  return got / ordered;
}
