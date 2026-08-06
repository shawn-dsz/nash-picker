/**
 * Fulfilment metrics for the operations manager.
 *
 * WHY THIS IS DERIVED, NEVER STORED
 * ---------------------------------
 * Every number here is computed from what picking actually wrote to Nash. There
 * is no counter, no event table, no second copy. That is deliberate: a counter
 * incremented alongside a write is a second source of truth, and the failure
 * mode of two sources is that they disagree silently - usually in front of the
 * person you are showing it to.
 *
 * The cost is honest: this recomputes on every load and it is O(orders) calls
 * to Nash, because the list endpoint returns a summary without items. At demo
 * scale that is fine. At a real store's volume it is not, and the fix is a
 * read model fed by webhooks, not a counter bolted onto the write path.
 *
 * WHAT CANNOT BE MEASURED, AND WHY IT IS SAID OUT LOUD
 * ---------------------------------------------------
 * A dashboard that shows a number it cannot substantiate is worse than one that
 * admits a gap. Two metrics a manager would reasonably expect are missing:
 *
 *   - Pick duration. `pick_completed_at` is written, but nothing records when a
 *     run STARTED, so elapsed time is not derivable. It needs a start stamp on
 *     the write path.
 *   - Scan accuracy. `scanned_barcode` is stored, but nothing records a REJECTED
 *     scan, so a mismatch rate cannot be computed. It needs scan verification.
 *
 * Both are surfaced on the page as gaps rather than filled with a plausible
 * number. See NOT_MEASURED.
 */

import type { Channel, NashOrderDetail, NashSubItem } from "./types";
import { toChannel } from "./adapter";

/** The four outcomes picking can record. Fixed order - charts depend on it. */
export const OUTCOMES = [
  "picked",
  "partially_picked",
  "not_picked",
  "substituted",
] as const;

export type OutcomeKey = (typeof OUTCOMES)[number];

export const OUTCOME_LABEL: Record<OutcomeKey, string> = {
  picked: "Picked",
  partially_picked: "Partial",
  not_picked: "Not found",
  substituted: "Substituted",
};

export type OutcomeCounts = Record<OutcomeKey, number>;

const zeroOutcomes = (): OutcomeCounts => ({
  picked: 0,
  partially_picked: 0,
  not_picked: 0,
  substituted: 0,
});

export type ChannelMetrics = {
  channel: Channel;
  /** Runs that have been picked. Waiting runs contribute nothing but a count. */
  ordersPicked: number;
  ordersTotal: number;
  unitsOrdered: number;
  unitsPicked: number;
  /** Null rather than 0 when nothing has been picked - 0% is a claim, null is not. */
  fillRate: number | null;
  outcomes: OutcomeCounts;
};

export type RunRow = {
  id: string;
  reference: string;
  channel: Channel;
  fillRate: number | null;
  completedAt: string | null;
  outcomes: OutcomeCounts;
  linesRecorded: number;
};

/**
 * The actionable cut.
 *
 * Channel answers "which channel is underperforming" - the unified-view
 * question. Aisle answers "what do I change on Monday", which is the only cut a
 * store manager can act on: a bay that keeps coming up empty is a replenishment
 * problem, and it has an owner. Picker and hour are interesting; aisle is
 * actionable.
 */
export type AisleMetrics = {
  aisle: string;
  lines: number;
  /** Lines that did not fully fill: not found plus partial. */
  shortLines: number;
  shortRate: number;
  outcomes: OutcomeCounts;
};

export type Report = {
  generatedAt: string;
  ordersTotal: number;
  ordersPicked: number;
  unitsOrdered: number;
  unitsPicked: number;
  fillRate: number | null;
  /** Lines that did not fully fill, over lines picked. The pain, not the score. */
  shortRate: number | null;
  linesRecorded: number;
  /**
   * Scan verification, derived the same way as everything else here.
   *
   * `linesGated` counts lines where verification was expected at all -
   * verified plus overridden. `not_picked` is never gated, so it is correctly
   * outside this denominator: you cannot scan an item that is not there, and
   * counting it as an unverified line would invent a failure.
   */
  linesGated: number;
  linesVerified: number;
  linesOverridden: number;
  /** Overrides over gated lines. Null until anything has been gated. */
  overrideRate: number | null;
  outcomes: OutcomeCounts;
  byChannel: ChannelMetrics[];
  byAisle: AisleMetrics[];
  runs: RunRow[];
  /** Named gaps. Rendered on the page, not hidden. */
  notMeasured: { metric: string; why: string; needs: string }[];
};

/**
 * The four operations metrics this product is supposed to move:
 * units per hour, pick accuracy, short-pick rate, cycle time.
 *
 * Exactly one of them - short-pick rate - is derivable from what picking writes
 * today. The other three all need a field that does not exist yet. They are
 * listed rather than quietly dropped, because "here are the four numbers, here
 * is the one I can prove, here is what the other three cost" is a roadmap. A
 * dashboard that shows only what happens to be easy is not.
 */
export const NOT_MEASURED: Report["notMeasured"] = [
  {
    metric: "Units per hour",
    why: "Throughput needs a run duration. Only a completion timestamp is written - nothing records when a run started.",
    needs: "A start stamp when the picker opens a run. One field on the existing write.",
  },
  {
    metric: "Cycle time",
    why: "Same gap. Seconds-per-item cannot be reconstructed after the fact from a single completion timestamp.",
    needs: "A per-line timestamp, which also makes the 200ms scan-to-next-item budget measurable.",
  },
  {
    metric: "Scan mismatch rate",
    why: "Verified scans and overrides now persist, so override rate is real. A REJECTED scan the picker then corrects is not written, so how often the wrong item was picked up cannot be computed - only how often verification was skipped.",
    needs: "A per-line reject counter on the write. The gate already knows the number; nothing carries it to Nash.",
  },
];

/** Sub-item metadata is written by the pick path; it is not on Nash's type. */
type PickedMeta = {
  pick_status?: string;
  picked_quantity?: string;
  requested_quantity?: string;
  scanned_barcode?: string;
  scan_override?: string;
};

const metaOf = (s: NashSubItem): PickedMeta =>
  ((s as { metadata?: PickedMeta }).metadata ?? {});

/** Metadata is strings on the wire. Anything unparseable is treated as absent. */
function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isOutcome(v: string | undefined): v is OutcomeKey {
  return (OUTCOMES as readonly string[]).includes(v ?? "");
}

const subItemsOf = (o: NashOrderDetail): NashSubItem[] =>
  (o.items ?? []).flatMap((i) => i.subItems ?? []);

/**
 * Fill rate is units delivered over units ordered.
 *
 * Deliberately the same formula the pick screen uses, so the two can never
 * report different numbers for the same run. It sums a weighted line's
 * kilograms alongside a unit line's count, which is dimensionally loose - a
 * 0.94kg line and a 2-unit line add to 2.94 over 3. It is the standard retail
 * simplification and it is named here rather than hidden, because the
 * alternative (averaging per-line ratios) makes a 12-unit line count the same
 * as a 1-unit one, which is worse.
 */
function rate(picked: number, ordered: number): number | null {
  return ordered > 0 ? picked / ordered : null;
}

/** A single recorded pick line. The grain everything else aggregates from. */
type Line = {
  sku: string | null;
  status: OutcomeKey;
  requested: number;
  picked: number;
  /** A barcode was read for this line, whether or not it matched. */
  scanned: boolean;
  /** The picker proceeded past a failed or missing scan. */
  overridden: boolean;
};

/** One order's recorded lines. Lines picking never touched are skipped. */
function readRun(o: NashOrderDetail): Line[] {
  const lines: Line[] = [];

  for (const sub of subItemsOf(o)) {
    const m = metaOf(sub);
    if (!isOutcome(m.pick_status)) continue;

    lines.push({
      sku: sub.sku ?? null,
      status: m.pick_status,
      // Fall back to the order line's own count if the write did not echo it,
      // so a partially written run still contributes an honest denominator.
      requested: num(m.requested_quantity) ?? sub.count ?? 0,
      picked: num(m.picked_quantity) ?? 0,
      scanned: m.scanned_barcode !== undefined,
      overridden: m.scan_override === "true",
    });
  }

  return lines;
}

/** A line is short if it did not fully fill. Substituted is NOT short - the
 *  customer pre-approved it, so it is a served line, not a failure. */
const isShort = (s: OutcomeKey) =>
  s === "not_picked" || s === "partially_picked";

const tally = (lines: Line[]) => {
  const outcomes = zeroOutcomes();
  let requested = 0;
  let picked = 0;
  for (const l of lines) {
    outcomes[l.status] += 1;
    requested += l.requested;
    picked += l.picked;
  }
  return { outcomes, requested, picked };
};

const addOutcomes = (a: OutcomeCounts, b: OutcomeCounts) => {
  for (const k of OUTCOMES) a[k] += b[k];
};

/** Channels always appear in this order so a colour never moves between loads. */
const CHANNEL_ORDER: Channel[] = ["web", "doordash", "uber_eats", "unknown"];

/**
 * @param aisleBySku maps a SKU to the aisle it lives in, from store inventory.
 *   Aisle is not on the order or on the pick outcome - it lives on inventory -
 *   so the actionable cut needs this join. Pass an empty map and the by-aisle
 *   section simply reports nothing rather than guessing.
 */
export function buildReport(
  orders: NashOrderDetail[],
  aisleBySku: Map<string, string> = new Map(),
  now = new Date(),
): Report {
  const totals = zeroOutcomes();
  const runs: RunRow[] = [];
  const perChannel = new Map<Channel, ChannelMetrics>();
  const perAisle = new Map<string, Line[]>();
  const allLines: Line[] = [];

  let unitsOrdered = 0;
  let unitsPicked = 0;
  let ordersPicked = 0;

  for (const o of orders) {
    const channel = toChannel(o.tags);
    const lines = readRun(o);
    const picked = lines.length > 0;
    const t = tally(lines);

    const c =
      perChannel.get(channel) ??
      {
        channel,
        ordersPicked: 0,
        ordersTotal: 0,
        unitsOrdered: 0,
        unitsPicked: 0,
        fillRate: null,
        outcomes: zeroOutcomes(),
      };

    c.ordersTotal += 1;
    if (picked) {
      c.ordersPicked += 1;
      ordersPicked += 1;
    }
    c.unitsOrdered += t.requested;
    c.unitsPicked += t.picked;
    addOutcomes(c.outcomes, t.outcomes);
    perChannel.set(channel, c);

    unitsOrdered += t.requested;
    unitsPicked += t.picked;
    addOutcomes(totals, t.outcomes);
    allLines.push(...lines);

    for (const l of lines) {
      const aisle = l.sku ? aisleBySku.get(l.sku) : undefined;
      if (!aisle) continue;
      const bucket = perAisle.get(aisle) ?? [];
      bucket.push(l);
      perAisle.set(aisle, bucket);
    }

    runs.push({
      id: o.id,
      reference: o.externalId ?? o.id,
      channel,
      fillRate: picked ? rate(t.picked, t.requested) : null,
      completedAt: o.orderMetadata?.pick_completed_at ?? null,
      outcomes: t.outcomes,
      linesRecorded: lines.length,
    });
  }

  for (const c of perChannel.values()) {
    c.fillRate = c.ordersPicked > 0 ? rate(c.unitsPicked, c.unitsOrdered) : null;
  }

  const byChannel = CHANNEL_ORDER.filter((ch) => perChannel.has(ch)).map(
    (ch) => perChannel.get(ch)!,
  );

  // Worst first. A manager reads the top of this list and nothing else.
  const byAisle: AisleMetrics[] = [...perAisle.entries()]
    .map(([aisle, lines]) => {
      const short = lines.filter((l) => isShort(l.status)).length;
      return {
        aisle,
        lines: lines.length,
        shortLines: short,
        shortRate: short / lines.length,
        outcomes: tally(lines).outcomes,
      };
    })
    .sort((a, b) => b.shortRate - a.shortRate || b.lines - a.lines);

  const shortLines = allLines.filter((l) => isShort(l.status)).length;

  // Only lines the gate actually applied to. not_picked is never gated.
  const overridden = allLines.filter((l) => l.overridden).length;
  const verified = allLines.filter((l) => l.scanned && !l.overridden).length;
  const gated = verified + overridden;

  return {
    generatedAt: now.toISOString(),
    ordersTotal: orders.length,
    ordersPicked,
    unitsOrdered,
    unitsPicked,
    fillRate: ordersPicked > 0 ? rate(unitsPicked, unitsOrdered) : null,
    shortRate: allLines.length > 0 ? shortLines / allLines.length : null,
    linesRecorded: allLines.length,
    linesGated: gated,
    linesVerified: verified,
    linesOverridden: overridden,
    overrideRate: gated > 0 ? overridden / gated : null,
    outcomes: totals,
    byChannel,
    byAisle,
    runs: runs.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    notMeasured: NOT_MEASURED,
  };
}
