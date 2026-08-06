import { sequence, travel, SECONDS_PER_AISLE_POSITION } from "./sequence.ts";
import type { PickRow } from "./types.ts";

/**
 * Batch formation: one trolley, several orders, one walk.
 *
 * WHY THIS IS SEPARATE FROM `sequence()`
 * --------------------------------------
 * Batching does not change routing. The union of a batch's lines is just a
 * larger basket, and `sequence()` already serpentines any basket over the
 * store layout. This module decides WHICH orders travel together; `sequence`
 * decides the order they are walked in. Keeping that seam is what makes
 * batching a new input to the shipped algorithm rather than a rewrite of it.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not wave formation and it is not zone picking. There is no staging
 * capacity model here, no van departure, no merge. Those are the parts of
 * docs/BATCHING.md that need scheduling state this system does not have, and
 * a version of them that ignored the staging constraint would be worse than
 * nothing - the constraint is the entire reason the problem is interesting.
 *
 * This is the spatial half: given orders that are already eligible to be
 * picked together, which grouping is cheapest, and what does it cost.
 */

/**
 * Put-to-tote overhead, per line, when a picker carries more than one order.
 *
 * A STATED ASSUMPTION, NOT A MEASUREMENT - the same discipline as
 * SECONDS_PER_AISLE_POSITION, and exported for the same reason: a page that
 * quotes a saving has to be able to name the number that produced it.
 *
 * Picking into one tote is reach-and-drop. Picking into eight means reading a
 * tote position and placing deliberately, and that is paid on EVERY line,
 * including the ones that saved no walking at all. It is the term that decides
 * whether a batch is worth forming, so leaving it out would not simplify the
 * model, it would break it.
 */
export const SECONDS_PER_SORT = 4;

export type BatchableRun = {
  reference: string;
  rows: PickRow[];
};

/** One line of the combined pick list, carrying which order it belongs to. */
export type BatchLine = PickRow & {
  /** Which order this line is for. The picker needs this at the shelf. */
  reference: string;
  /** Tote position on the trolley, 1-based. Stable for the life of the batch. */
  tote: number;
};

export type BatchPlan = {
  orders: { reference: string; tote: number; lines: number }[];
  /** The combined pick list, sequenced once across every order in the batch. */
  lines: BatchLine[];
  cost: {
    /** Seconds walked picking these orders one at a time, each sequenced. */
    individual: number;
    /** Seconds walked picking them as one batch. */
    batched: number;
    /** Put-to-tote, paid per line. */
    sortation: number;
    /** batched + sortation. What the batch actually costs. */
    total: number;
    /** individual - total. Negative means the batch is not worth forming. */
    saved: number;
    /** 0 to 1, or null when there is no walking to compare. */
    savedFraction: number | null;
    /** Carried so the page can state the assumptions rather than imply them. */
    secondsPerPosition: number;
    secondsPerSort: number;
  };
};

const aislesOf = (run: BatchableRun) =>
  new Set(
    run.rows.map((r) => r.location?.aisle).filter(Boolean) as string[],
  );

const walkSeconds = (rows: PickRow[]) =>
  travel(sequence(rows)) * SECONDS_PER_AISLE_POSITION;

/**
 * Seed-and-extend on aisle overlap.
 *
 * The order touching the most aisles seeds the batch, because it already pays
 * for the longest walk - anything added that lives inside those aisles is
 * picked for free. Then repeatedly add whichever remaining order adds the
 * FEWEST NEW aisles, until the trolley is full.
 *
 * Greedy rather than optimal, deliberately. Batch composition is set
 * partitioning, which is NP-hard, and the gain of an exact solver over
 * greedy-on-overlap is smaller than the variance introduced by a picker
 * stopping to answer a question. Optimality here is a rounding error on a
 * noisy floor.
 *
 * Ties break towards the earlier order in the input, which is arrival order,
 * so an order does not get starved by a steady supply of better-overlapping
 * neighbours.
 */
export function formBatch(
  pool: BatchableRun[],
  capacity: number,
): BatchableRun[] {
  if (capacity < 1 || pool.length === 0) return [];

  const remaining = [...pool];
  // Widest spread first. Stable, so equal-spread orders keep arrival order.
  remaining.sort((a, b) => aislesOf(b).size - aislesOf(a).size);

  const batch = [remaining.shift()!];
  const covered = aislesOf(batch[0]);

  while (batch.length < capacity && remaining.length > 0) {
    let bestIndex = 0;
    let fewestNew = Infinity;

    remaining.forEach((run, i) => {
      let added = 0;
      for (const aisle of aislesOf(run)) if (!covered.has(aisle)) added++;
      if (added < fewestNew) {
        fewestNew = added;
        bestIndex = i;
      }
    });

    const [chosen] = remaining.splice(bestIndex, 1);
    for (const aisle of aislesOf(chosen)) covered.add(aisle);
    batch.push(chosen);
  }

  return batch;
}

/**
 * Form a batch and cost it.
 *
 * The cost model is deliberately whole: saved walking MINUS sortation, not
 * saved walking alone. A batching figure that counts only the benefit is the
 * figure a vendor quotes, and it is the reason batching gets deployed into
 * stores where it makes things slower.
 *
 * `saved` is allowed to come out negative and the caller is expected to show
 * it. A batch that costs more than picking the orders separately is a real
 * and common outcome at low order density, and hiding it would turn this from
 * a decision tool into a sales tool.
 */
export function planBatch(
  pool: BatchableRun[],
  capacity: number,
): BatchPlan | null {
  const batch = formBatch(pool, capacity);
  if (batch.length === 0) return null;

  const toteOf = new Map(batch.map((run, i) => [run.reference, i + 1]));

  const union: BatchLine[] = batch.flatMap((run) =>
    run.rows.map((row) => ({
      ...row,
      reference: run.reference,
      tote: toteOf.get(run.reference)!,
    })),
  );

  const individual = batch.reduce((t, run) => t + walkSeconds(run.rows), 0);
  const batched = walkSeconds(union);
  // Sortation only applies when the picker is carrying more than one order.
  const sortation = batch.length > 1 ? union.length * SECONDS_PER_SORT : 0;
  const total = batched + sortation;

  return {
    orders: batch.map((run) => ({
      reference: run.reference,
      tote: toteOf.get(run.reference)!,
      lines: run.rows.length,
    })),
    lines: sequence(union),
    cost: {
      individual,
      batched,
      sortation,
      total,
      saved: individual - total,
      // Null rather than zero when there was no walking to compare. A batch of
      // single-aisle orders genuinely has no routing opinion, and reporting
      // "0% saved" would imply one was formed and found worthless.
      savedFraction: individual > 0 ? (individual - total) / individual : null,
      secondsPerPosition: SECONDS_PER_AISLE_POSITION,
      secondsPerSort: SECONDS_PER_SORT,
    },
  };
}
