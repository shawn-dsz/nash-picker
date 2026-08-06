import Link from "next/link";
import { getQueue, getPickRun } from "@/lib/adapter";
import { planBatch, type BatchableRun } from "@/lib/batch";

export const dynamic = "force-dynamic";

/**
 * Trolley capacity: how many totes a picker can physically push.
 *
 * A STORE CONSTANT, and the honest upper bound on batch size. In production
 * the effective cap is the SMALLER of this and the staging slots free when the
 * batch lands - see docs/BATCHING.md section 3. Staging is not modelled here,
 * so this page shows the spatial half of the decision only, and says so.
 */
const TROLLEY_TOTES = 6;

/**
 * Batch planning view. READ ONLY, deliberately.
 *
 * WHAT THIS IS
 * ------------
 * Proof that the batch formation step in docs/BATCHING.md computes something
 * real against live orders, rather than a claim on a slide. It forms a batch
 * from whatever is waiting in the queue, sequences the combined list once, and
 * costs the result with put-to-tote sortation deducted.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not picking. Nothing here writes to Nash, nothing changes an order,
 * and there is no way to record an outcome. Wave formation, staging capacity,
 * zone splitting and merge are all absent - they need scheduling state this
 * system does not have, and a version that ignored the staging constraint
 * would be actively misleading, because that constraint is the entire reason
 * batching is hard.
 *
 * The single-order pick flow remains the shipped product. This is the next
 * algorithm, shown working on the current data.
 */
export default async function BatchPage() {
  const queue = await getQueue();
  const waiting = queue.filter((o) => o.pickStatus === "waiting");

  const runs = (
    await Promise.all(waiting.map((o) => getPickRun(o.id)))
  ).filter((r): r is NonNullable<typeof r> => r !== null);

  const pool: BatchableRun[] = runs.map((r) => ({
    reference: r.reference,
    rows: r.rows,
  }));

  const plan = planBatch(pool, TROLLEY_TOTES);

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <Link
          href="/"
          aria-label="Back to queue"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-2xl text-white/60 active:bg-white/10"
        >
          ‹
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight">
            Batch plan
          </p>
          <p className="text-[11px] text-white/45">
            Planning view · nothing here is picked
          </p>
        </div>
      </header>

      {!plan ? (
        <div className="flex-1 px-5 py-10">
          <p className="text-[15px] text-white/60">
            Nothing waiting to batch. Every order in the queue is already
            picked.
          </p>
        </div>
      ) : (
        <div className="flex-1 px-5 py-6">
          <Cost plan={plan} />
          <Totes plan={plan} />
          <CombinedList plan={plan} />
          <Assumptions plan={plan} />
        </div>
      )}
    </main>
  );
}

type Plan = NonNullable<Awaited<ReturnType<typeof planBatch>>>;

/**
 * The saving, or the loss.
 *
 * A negative result is rendered exactly as loudly as a positive one. At low
 * order density a batch genuinely costs more than picking separately, and that
 * is the number a store needs to see before deciding to batch at all.
 */
function Cost({ plan }: { plan: Plan }) {
  const { cost } = plan;
  const worthIt = cost.saved > 0;
  const pct =
    cost.savedFraction !== null ? Math.round(cost.savedFraction * 100) : null;

  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
        {plan.orders.length} orders · one walk
      </p>
      <h2
        className={`mt-2 text-[38px] font-bold leading-none tracking-tight ${
          worthIt ? "text-[#c9ff00]" : "text-[#ff6b6b]"
        }`}
      >
        {worthIt ? "-" : "+"}
        {Math.abs(cost.saved)}
        <span className="text-white/40">s</span>
      </h2>
      <p className="mt-2 text-[13px] text-white/55">
        {worthIt
          ? `${pct}% less walking than picking these one at a time`
          : "This batch costs more than picking these separately"}
      </p>

      <dl className="mt-5 divide-y divide-white/10 border-y border-white/10 font-mono text-[12px] tabular-nums">
        <Line label="One at a time, sequenced" value={`${cost.individual}s`} />
        <Line label="As one batch" value={`${cost.batched}s`} />
        <Line
          label={`Put-to-tote, ${plan.lines.length} lines`}
          value={`+${cost.sortation}s`}
          dim
        />
        <Line label="Batch, all in" value={`${cost.total}s`} strong />
      </dl>
    </section>
  );
}

function Line({
  label,
  value,
  dim,
  strong,
}: {
  label: string;
  value: string;
  dim?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className={dim ? "text-white/40" : "text-white/60"}>{label}</dt>
      <dd className={strong ? "font-semibold text-white" : "text-white/80"}>
        {value}
      </dd>
    </div>
  );
}

/** Which order goes in which tote. The picker needs this before they start. */
function Totes({ plan }: { plan: Plan }) {
  return (
    <section className="mt-7">
      <h3 className="text-[11px] uppercase tracking-[0.16em] text-white/45">
        Trolley
      </h3>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {plan.orders.map((o) => (
          <li
            key={o.reference}
            className="flex items-center gap-2.5 rounded-lg border border-white/15 px-3 py-2.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#c9ff00] font-mono text-[12px] font-bold text-[#01051E]">
              {o.tote}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[12px]">
                {o.reference}
              </span>
              <span className="block text-[10px] text-white/40">
                {o.lines} {o.lines === 1 ? "line" : "lines"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The combined pick list, interleaved by aisle rather than grouped by order.
 *
 * The interleaving IS the product. A list grouped by customer is what the
 * store does today, and walking it is what batching exists to stop.
 */
function CombinedList({ plan }: { plan: Plan }) {
  // Worked out up front rather than by mutating a cursor during render: an
  // aisle change is a property of the sequenced list, not of drawing it.
  const startsAisle = plan.lines.map(
    (line, i) =>
      i === 0 || line.location?.aisle !== plan.lines[i - 1].location?.aisle,
  );

  return (
    <section className="mt-7">
      <h3 className="text-[11px] uppercase tracking-[0.16em] text-white/45">
        One walk, {plan.lines.length} lines
      </h3>
      <ul className="mt-3 divide-y divide-white/10 border-y border-white/10">
        {plan.lines.map((line, i) => {
          const aisle = line.location?.aisle;
          const newAisle = startsAisle[i];

          return (
            <li key={line.subItemId} className="flex items-center gap-3 py-2.5">
              <span
                className={`w-16 shrink-0 font-mono text-[11px] ${
                  newAisle ? "font-bold text-[#c9ff00]" : "text-white/30"
                }`}
              >
                {aisle ?? "?"}
                <span className="text-white/30"> {line.location?.bay}</span>
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px]">
                {line.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/45">
                ×{line.requestedQuantity}
              </span>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#c9ff00] font-mono text-[11px] font-bold text-[#01051E]">
                {line.tote}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The assumptions, on the page rather than in a comment.
 *
 * A time saving whose assumptions are hidden is a number nobody can challenge,
 * which makes it worthless in the meeting where it matters.
 */
function Assumptions({ plan }: { plan: Plan }) {
  return (
    <section className="mt-7 rounded-lg border border-dashed border-white/20 px-4 py-4">
      <h3 className="text-[10px] uppercase tracking-[0.14em] text-white/40">
        What this assumes
      </h3>
      <ul className="mt-2.5 space-y-1.5 text-[12px] leading-snug text-white/55">
        <li>
          {plan.cost.secondsPerPosition}s to cross one aisle position, laden
          trolley
        </li>
        <li>
          {plan.cost.secondsPerSort}s per line to place into the right tote
        </li>
        <li>Trolley holds {TROLLEY_TOTES} totes</li>
      </ul>
      <p className="mt-3 text-[12px] leading-snug text-white/40">
        Staging capacity is <strong className="text-white/60">not</strong>{" "}
        modelled. In a real store the batch size is capped by the slots free
        when it lands, not just by the trolley, and release timing is driven by
        van departure. That is the half of the problem this view does not
        solve.
      </p>
    </section>
  );
}
