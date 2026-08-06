import type { PickRow } from "./types";

/**
 * Pick sequencing.
 *
 * WHY THIS IS NOT JUST A SORT
 * ---------------------------
 * `aisle` is a string, and the values in a real catalog are a mix:
 * "2", "4", "Produce", "Chilled", "Frozen", "Bakery", "Deli". There is no
 * comparison that orders those correctly. `"A12"` sorts before `"A6"`.
 *
 * So sequencing needs a per-store layout, not an algorithm. A store knows the
 * order of its own aisles because it is physically fixed. That is config, and
 * pretending it can be derived is the mistake.
 *
 * THE WALK ORDER IS NOT ARBITRARY
 * -------------------------------
 * Ambient goods first, chilled second, frozen last. That is how retail
 * picking actually works, and the reason is cold chain rather than distance:
 * a tub of ice cream picked first sits in a tote for the length of the run.
 * Optimising purely for walking distance produces a shorter route and warmer
 * frozen goods, which is a worse outcome.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * It does not solve travelling-salesman across a store, and it should not.
 * A supermarket is a set of parallel aisles walked in order, so a fixed
 * serpentine over a known layout captures nearly all of the available gain
 * with none of the fragility.
 *
 * THE RISK, NAMED
 * ---------------
 * Sequencing on stale planogram data sends the picker confidently to the
 * wrong bay, which is worse than no sequencing because they trust it. Nothing
 * in this system currently tells you when a bay moves. That is why a
 * planogram feed is the first item in the architecture's next actions, and it
 * is why an unknown aisle is placed at the END of the run rather than being
 * guessed at.
 */

/**
 * The Carlton walk order. Per store, because layout is per store.
 *
 * In production this comes from the store's own planogram rather than a
 * constant, and the shape of that config is exactly this: an ordered list.
 */
export const STORE_LAYOUT: string[] = [
  "Produce",
  "Bakery",
  "Deli",
  "1",
  "2",
  "3",
  "4",
  "5",
  "Chilled",
  "Frozen",
];

/**
 * Aisles not in the layout go last, in a stable order, never guessed at.
 *
 * The sentinels are deliberately adjacent to the layout rather than huge.
 * An earlier version returned Number.MAX_SAFE_INTEGER for a missing aisle,
 * which sorted correctly but made `travel()` - which takes differences
 * between ranks - return ~1.8e16 the moment one row failed the join. That in
 * turn made `routeGain` report a fabricated ~50% saving. A rank is a position
 * in a walk, so it has to stay within the walk.
 */
const RANK_UNKNOWN_AISLE = STORE_LAYOUT.length;
const RANK_NO_LOCATION = STORE_LAYOUT.length + 1;

function aisleRank(aisle: string | undefined): number {
  if (!aisle) return RANK_NO_LOCATION;
  const i = STORE_LAYOUT.findIndex(
    (a) => a.toLowerCase() === aisle.toLowerCase(),
  );
  return i === -1 ? RANK_UNKNOWN_AISLE : i;
}

/**
 * Natural comparison, so "B2" sorts before "B10" rather than after it.
 * This is the bug that makes a naive string sort quietly wrong.
 */
const natural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/**
 * Serpentine: alternate the bay direction each aisle, so the picker walks up
 * one and down the next instead of returning to the head of every aisle.
 */
export function sequence(rows: PickRow[]): PickRow[] {
  const byAisle = new Map<number, PickRow[]>();

  for (const row of rows) {
    const rank = aisleRank(row.location?.aisle);
    const bucket = byAisle.get(rank);
    if (bucket) bucket.push(row);
    else byAisle.set(rank, [row]);
  }

  const ordered: PickRow[] = [];

  [...byAisle.keys()]
    .sort((a, b) => a - b)
    .forEach((rank, aisleIndex) => {
      const rows = byAisle.get(rank)!;
      const reverse = aisleIndex % 2 === 1;

      rows.sort((x, y) => {
        const byBay = natural(x.location?.bay ?? "", y.location?.bay ?? "");
        if (byBay !== 0) return reverse ? -byBay : byBay;
        return natural(x.location?.shelf ?? "", y.location?.shelf ?? "");
      });

      ordered.push(...rows);
    });

  return ordered;
}

/** How many aisle changes the walk requires. The number sequencing reduces. */
export function aisleChanges(rows: PickRow[]): number {
  let changes = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].location?.aisle !== rows[i - 1].location?.aisle) changes++;
  }
  return changes;
}

/**
 * Distance proxy: total absolute movement through the layout, measured in
 * aisle positions.
 *
 * Not metres, deliberately. Real distance needs aisle lengths and cross-aisle
 * geometry, which is planogram data this system does not have. Aisle
 * positions are a proxy that is honest about its own precision and still
 * captures the thing that costs time: crossing the store.
 *
 * Rows with no location are EXCLUDED rather than assigned a position. Their
 * aisle is unknown, so any distance attributed to them is invented - and this
 * number exists to support a claim about a saving. Counting a guess towards
 * it would be the same mistake as sorting on a guess.
 */
export function travel(rows: PickRow[]): number {
  const located = rows.filter((r) => r.location?.aisle);

  let total = 0;
  for (let i = 1; i < located.length; i++) {
    total += Math.abs(
      aisleRank(located[i].location?.aisle) -
        aisleRank(located[i - 1].location?.aisle),
    );
  }
  return total;
}

export type RouteGain = {
  before: { moves: number; travel: number };
  after: { moves: number; travel: number };
  /** Reduction in travel, 0 to 1. Null when there is no honest number to give. */
  saved: number | null;
  /** Rows the join could not locate. They are excluded from `travel`. */
  unlocated: number;
};

/**
 * What sequencing actually bought, measured against the order as the customer
 * built it.
 *
 * The point of computing this rather than asserting it: on a four-item basket
 * the gain is sometimes zero, and a system that claims a saving it did not
 * make is worse than one that reports honestly. The number is real or it is
 * not shown.
 */
export function routeGain(basketOrder: PickRow[]): RouteGain {
  const sequenced = sequence(basketOrder);

  const before = {
    moves: aisleChanges(basketOrder),
    travel: travel(basketOrder),
  };
  const after = { moves: aisleChanges(sequenced), travel: travel(sequenced) };

  const unlocated = basketOrder.filter((r) => !r.location?.aisle).length;

  return {
    before,
    after,
    unlocated,
    // Null rather than zero when there is nothing to measure. A basket that
    // was already in walk order genuinely saved nothing, and a basket with
    // fewer than two locatable rows has no distance to compare - both are
    // "no number", not "0% improvement".
    saved:
      before.travel > 0 ? (before.travel - after.travel) / before.travel : null,
  };
}
