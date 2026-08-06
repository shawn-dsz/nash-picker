/**
 * All anything here needs is a shelf location, so that is all it asks for.
 *
 * The pick screen passes full `PickRow`s. The reporting side has only a
 * SKU-to-aisle join and no bay or shelf, and it still needs the same distance
 * maths - a second copy of `STORE_LAYOUT` and `aisleRank` living in the metrics
 * module is exactly how the walk order and the reported saving drift apart.
 */
type Located = {
  location?: {
    aisle?: string | null;
    bay?: string | null;
    shelf?: string | null;
  } | null;
};

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

function aisleRank(aisle: string | null | undefined): number {
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
export function sequence<T extends Located>(rows: T[]): T[] {
  const byAisle = new Map<number, T[]>();

  for (const row of rows) {
    const rank = aisleRank(row.location?.aisle);
    const bucket = byAisle.get(rank);
    if (bucket) bucket.push(row);
    else byAisle.set(rank, [row]);
  }

  const ordered: T[] = [];

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
export function aisleChanges(rows: Located[]): number {
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
export function travel(rows: Located[]): number {
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

/**
 * Seconds spent crossing one aisle position, used to turn saved travel into
 * saved time on the operations report.
 *
 * IT IS A STORE CONSTANT, NOT A MEASUREMENT. Nothing in this system times a
 * picker. The figure is a laden-trolley walk across one aisle width at roughly
 * a metre a second, and it is exported rather than inlined so the report can
 * name it on the page - a time saving whose assumption is hidden is a number
 * nobody can challenge, which makes it worthless in the meeting where it
 * matters. A store that wants the real figure times ten runs and changes this
 * line.
 */
export const SECONDS_PER_AISLE_POSITION = 8;

/**
 * What sequencing bought across a set of runs, summed.
 *
 * WHY THE SUM AND NOT THE PER-RUN PERCENTAGE
 * ------------------------------------------
 * A picker cannot act on "23% less walking" - it is absent whenever the basket
 * was already optimal, and a badge that appears on some runs and not others
 * reads as decoration. Summed over a shift it becomes a budget line: hours the
 * store did not spend walking. Different audience, different number.
 *
 * A basket with no measurable walk - nothing locatable, or everything in one
 * aisle - is EXCLUDED rather than counted as a run that saved nothing. It was
 * never assessed, and counting it would drag the total down with a run the
 * system had no opinion about.
 */
export function walkSaving(baskets: Located[][]): WalkSaving {
  let runsMeasured = 0;
  let positionsBefore = 0;
  let positionsAfter = 0;

  for (const basket of baskets) {
    const before = travel(basket);
    if (before <= 0) continue;
    runsMeasured += 1;
    positionsBefore += before;
    positionsAfter += travel(sequence(basket));
  }

  return {
    runsMeasured,
    positionsBefore,
    positionsAfter,
    positionsSaved: positionsBefore - positionsAfter,
    secondsSaved: (positionsBefore - positionsAfter) * SECONDS_PER_AISLE_POSITION,
    secondsPerPosition: SECONDS_PER_AISLE_POSITION,
  };
}

export type WalkSaving = {
  /** Runs where a before/after comparison was possible at all. */
  runsMeasured: number;
  positionsBefore: number;
  positionsAfter: number;
  positionsSaved: number;
  secondsSaved: number;
  /** The conversion, carried so the page can state it rather than imply it. */
  secondsPerPosition: number;
};

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
export function routeGain(basketOrder: Located[]): RouteGain {
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
