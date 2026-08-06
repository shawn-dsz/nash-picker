import Link from "next/link";
import { CHANNEL_LABEL } from "@/lib/adapter";
import { loadReport } from "@/lib/ops";
import {
  OUTCOMES,
  OUTCOME_LABEL,
  type OutcomeCounts,
  type OutcomeKey,
  type Report,
} from "@/lib/metrics";

// Derived from live Nash data on every load. A cached dashboard is a lie with
// a timestamp on it.
export const dynamic = "force-dynamic";

/**
 * The fulfilment view. P5 - "we have no unified view of fulfillment".
 *
 * The cut that matters is BY CHANNEL. One store's overall fill rate is a number
 * a manager already has; web filling at 96% while marketplace fills at 89% is
 * the thing nobody at FreshMart can currently see, because the channels live on
 * three separate devices. That comparison is the entire argument for unifying
 * them, so it gets the most space.
 *
 * Colour was validated, not chosen by eye: the four outcome hues clear the
 * lightness band, chroma floor, colourblind separation and contrast against
 * this surface. Green never means "not found" - the assignment is semantic and
 * fixed, and yellow is deliberately never adjacent to orange in the stack,
 * because that specific pair is the one a deuteranope cannot separate.
 */

// Fixed. A colour must never move between loads or a filter would repaint it.
const OUTCOME_COLOUR: Record<OutcomeKey, string> = {
  picked: "#199e70",
  partially_picked: "#c98500",
  substituted: "#3987e5",
  not_picked: "#d95926",
};

/** Stack order: fully served → partly → swapped → not served. */
const STACK_ORDER: OutcomeKey[] = [
  "picked",
  "partially_picked",
  "substituted",
  "not_picked",
];

const BAR = "#3987e5"; // one series, so the heading names it and no legend is needed

const pct = (v: number | null) =>
  v === null ? "--" : `${Math.round(v * 100)}%`;

const sum = (o: OutcomeCounts) => OUTCOMES.reduce((n, k) => n + o[k], 0);

/** Coarse on purpose. The input is a modelled figure, so "12 min" is as much
 *  precision as it has earned - "11 min 44 s" would be false confidence. */
const duration = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  return mins < 90 ? `${mins} min` : `${(mins / 60).toFixed(1)} h`;
};

/** Seeded aisles are a mix of numbers ("4") and names ("Deli"). A bare number
 *  reads as a count next to a named aisle, so numbers get the noun back. */
const aisleLabel = (a: string) => (/^\d+$/.test(a) ? `Aisle ${a}` : a);

function StatTile({
  label,
  value,
  hint,
  hero = false,
}: {
  label: string;
  value: string;
  hint?: string;
  hero?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
        {label}
      </p>
      <p
        className={`mt-2 font-bold leading-none tracking-tight ${hero ? "text-[44px]" : "text-[28px]"}`}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-[12px] text-white/50">{hint}</p>}
    </div>
  );
}

/** One stacked bar. 2px surface gaps between segments carry identity when
 *  colour cannot - the mandatory secondary encoding for adjacent hues. */
function OutcomeBar({ counts }: { counts: OutcomeCounts }) {
  const total = sum(counts);
  if (total === 0) {
    return (
      <div className="h-7 rounded border border-dashed border-white/15" />
    );
  }

  return (
    <div className="flex h-7 gap-[2px] overflow-hidden rounded">
      {STACK_ORDER.filter((k) => counts[k] > 0).map((k) => {
        const share = counts[k] / total;
        return (
          <div
            key={k}
            style={{
              width: `${share * 100}%`,
              backgroundColor: OUTCOME_COLOUR[k],
            }}
            title={`${OUTCOME_LABEL[k]}: ${counts[k]} of ${total} lines`}
            className="flex items-center justify-center transition-opacity hover:opacity-80"
          >
            {/* Direct label only where it fits. A number on every segment is
                noise; a number on none of them makes colour load-bearing. */}
            {share > 0.12 && (
              <span className="text-[11px] font-bold text-black/70">
                {counts[k]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default async function OpsPage() {
  let report: (Report & { unreadable: number }) | null = null;
  let error: string | null = null;

  try {
    report = await loadReport();
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    /* The root layout caps the app at 420px for the handheld. A manager reads
       this at a desk, so the page breaks out of that frame rather than the
       shared layout being changed for one route. */
    <div className="relative left-1/2 w-screen -translate-x-1/2 px-5 py-7 sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-white/10 pb-5">
          <div>
            <h1 className="text-[28px] font-bold leading-none tracking-tight">
              Fulfilment
            </h1>
            <p className="mt-2 text-sm text-white/60">
              Carlton · every channel, one view
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-white/20 px-3 py-2 text-[12px] font-semibold text-white/70"
          >
            ← Queue
          </Link>
        </header>

        {error && (
          <p className="mt-6 rounded-xl border border-[#d95926]/40 bg-[#d95926]/10 px-5 py-4 text-sm">
            Cannot reach Nash. {error}
          </p>
        )}

        {report && (
          <>
            {report.unreadable > 0 && (
              <p className="mt-5 rounded-lg border border-[#c98500]/40 bg-[#c98500]/10 px-4 py-3 text-[13px]">
                {report.unreadable}{" "}
                {report.unreadable === 1 ? "order" : "orders"} could not be
                read. Every figure below understates by that much.
              </p>
            )}

            {report.ordersPicked === 0 ? (
              <p className="mt-8 rounded-xl border border-dashed border-white/15 px-5 py-10 text-center text-sm text-white/55">
                Nothing has been picked yet. Metrics appear once a run is
                completed — they are derived from Nash, not stored here, so
                there is nothing to show until something is written.
              </p>
            ) : (
              <>
                {/* Every metric names a decision. If nobody reads it to decide
                    something, it should not be on the page. */}
                <section className="mt-6 grid gap-3 sm:grid-cols-3">
                  <StatTile
                    hero
                    label="Order fill rate"
                    value={pct(report.fillRate)}
                    hint={`${report.unitsPicked} of ${report.unitsOrdered} units delivered`}
                  />
                  <StatTile
                    label="Short-pick rate"
                    value={pct(report.shortRate)}
                    hint={`${report.outcomes.not_picked + report.outcomes.partially_picked} of ${report.linesRecorded} lines · ${report.outcomes.substituted} substituted`}
                  />
                  <StatTile
                    label="Runs picked"
                    value={`${report.ordersPicked}`}
                    hint={`of ${report.ordersTotal} in the queue`}
                  />
                </section>

                {/* What sequencing bought, summed over the shift. It is off the
                    pick screen deliberately: a per-run percentage is noise to
                    the picker and absent whenever the basket was already
                    optimal. Here it is a budget line. Shown only when a walk
                    was measurable at all - a zero would be a claim about a
                    route nobody walked. */}
                {report.walk.runsMeasured > 0 && (
                  <section className="mt-3 grid gap-3 sm:grid-cols-3">
                    <StatTile
                      label="Walking saved"
                      value={duration(report.walk.secondsSaved)}
                      hint={`Across ${report.walk.runsMeasured} sequenced ${report.walk.runsMeasured === 1 ? "run" : "runs"}`}
                    />
                    <StatTile
                      label="Aisle crossings cut"
                      value={`${report.walk.positionsSaved}`}
                      hint={`${report.walk.positionsBefore} walking the basket as ordered · ${report.walk.positionsAfter} sequenced`}
                    />
                    {/* The assumption gets its own cell rather than a footnote,
                        because a time saving nobody can challenge is a time
                        saving nobody believes. */}
                    <div className="rounded-xl border border-dashed border-white/15 px-5 py-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
                        How that is worked out
                      </p>
                      <p className="mt-2 text-[12px] leading-relaxed text-white/50">
                        Crossings cut is measured. Turning it into time assumes{" "}
                        {report.walk.secondsPerPosition}s per crossing - nothing
                        times a picker yet, so that is a store constant. Time ten
                        runs and it becomes real.
                      </p>
                    </div>
                  </section>
                )}

                {/* Scan verification. Shown only once something has been
                    gated - a 0% override rate over zero gated lines is not a
                    good number, it is an absent one. */}
                {report.linesGated > 0 && (
                  <section className="mt-3 grid gap-3 sm:grid-cols-3">
                    <StatTile
                      label="Scan verified"
                      value={pct(
                        report.linesVerified / report.linesGated,
                      )}
                      hint={`${report.linesVerified} of ${report.linesGated} gated lines confirmed by barcode`}
                    />
                    <StatTile
                      label="Override rate"
                      value={pct(report.overrideRate)}
                      hint={`${report.linesOverridden} picked without a matching scan`}
                    />
                    <StatTile
                      label="Not gated"
                      value={`${report.outcomes.not_picked}`}
                      hint="Out-of-stock lines. Nothing to scan, so never counted as unverified"
                    />
                  </section>
                )}

                {/* One series, so the heading names it and there is no legend. */}
                <section className="mt-9">
                  <h2 className="text-[15px] font-semibold">
                    Fill rate by channel
                  </h2>
                  <p className="mt-1 text-[13px] text-white/50">
                    The comparison three separate devices cannot show.
                  </p>

                  <div className="mt-4 space-y-3">
                    {report.byChannel.map((c) => (
                      <div key={c.channel} className="flex items-center gap-4">
                        <span className="w-24 shrink-0 text-[13px] text-white/70">
                          {CHANNEL_LABEL[c.channel]}
                        </span>
                        <div className="flex-1">
                          <div className="h-6 w-full rounded bg-white/[0.06]">
                            <div
                              className="h-6 rounded transition-opacity hover:opacity-80"
                              style={{
                                width: `${(c.fillRate ?? 0) * 100}%`,
                                backgroundColor: BAR,
                              }}
                              title={`${CHANNEL_LABEL[c.channel]}: ${c.unitsPicked} of ${c.unitsOrdered} units`}
                            />
                          </div>
                        </div>
                        <span className="w-14 shrink-0 text-right font-mono text-[13px] font-semibold">
                          {pct(c.fillRate)}
                        </span>
                        <span className="w-24 shrink-0 text-right text-[12px] text-white/40">
                          {c.ordersPicked}/{c.ordersTotal} runs
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* The actionable cut. Channel tells a manager which channel
                    is hurting; aisle tells them what to change on Monday. A bay
                    that keeps coming up empty is a replenishment problem and it
                    has an owner. */}
                {report.byAisle.length > 0 && (
                  <section className="mt-9">
                    <h2 className="text-[15px] font-semibold">
                      Where picks fail, by aisle
                    </h2>
                    <p className="mt-1 text-[13px] text-white/50">
                      Worst first. This is the cut a store manager can act on -
                      channel says which channel hurts, aisle says what to fix.
                    </p>

                    <div className="mt-4 space-y-3">
                      {report.byAisle.map((a) => (
                        <div key={a.aisle} className="flex items-center gap-4">
                          <span className="w-24 shrink-0 truncate text-[13px] text-white/70">
                            {aisleLabel(a.aisle)}
                          </span>
                          <div className="flex-1">
                            <div className="h-6 w-full rounded bg-white/[0.06]">
                              <div
                                className="h-6 rounded transition-opacity hover:opacity-80"
                                style={{
                                  width: `${a.shortRate * 100}%`,
                                  backgroundColor: OUTCOME_COLOUR.not_picked,
                                }}
                                title={`${a.aisle}: ${a.shortLines} of ${a.lines} lines did not fill`}
                              />
                            </div>
                          </div>
                          <span className="w-14 shrink-0 text-right font-mono text-[13px] font-semibold">
                            {pct(a.shortRate)}
                          </span>
                          <span className="w-24 shrink-0 text-right text-[12px] text-white/40">
                            {a.shortLines}/{a.lines} lines
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="mt-9">
                  <h2 className="text-[15px] font-semibold">Outcome mix</h2>
                  <p className="mt-1 text-[13px] text-white/50">
                    Lines by what happened at the shelf.
                  </p>

                  {/* Legend: identity is never colour alone. */}
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {STACK_ORDER.map((k) => (
                      <span
                        key={k}
                        className="flex items-center gap-2 text-[12px] text-white/70"
                      >
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 rounded-[3px]"
                          style={{ backgroundColor: OUTCOME_COLOUR[k] }}
                        />
                        {OUTCOME_LABEL[k]}
                        <span className="text-white/40">
                          {report.outcomes[k]}
                        </span>
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 space-y-3">
                    {report.byChannel
                      .filter((c) => sum(c.outcomes) > 0)
                      .map((c) => (
                        <div key={c.channel} className="flex items-center gap-4">
                          <span className="w-24 shrink-0 text-[13px] text-white/70">
                            {CHANNEL_LABEL[c.channel]}
                          </span>
                          <div className="flex-1">
                            <OutcomeBar counts={c.outcomes} />
                          </div>
                          <span className="w-14 shrink-0 text-right text-[12px] text-white/40">
                            {sum(c.outcomes)} lines
                          </span>
                        </div>
                      ))}
                  </div>
                </section>

                {/* The table view. Required so no figure is colour-only, and it
                    doubles as the per-run audit trail. */}
                <section className="mt-9">
                  <h2 className="text-[15px] font-semibold">Runs</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.14em] text-white/45">
                          <th className="py-2 pr-4 font-medium">Reference</th>
                          <th className="py-2 pr-4 font-medium">Channel</th>
                          <th className="py-2 pr-4 text-right font-medium">
                            Fill
                          </th>
                          {STACK_ORDER.map((k) => (
                            <th
                              key={k}
                              className="py-2 pr-4 text-right font-medium"
                            >
                              {OUTCOME_LABEL[k]}
                            </th>
                          ))}
                          <th className="py-2 font-medium">Completed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {report.runs.map((r) => (
                          <tr key={r.id} className="text-white/80">
                            <td className="py-2 pr-4 font-mono text-[12px]">
                              {r.reference}
                            </td>
                            <td className="py-2 pr-4">
                              {CHANNEL_LABEL[r.channel]}
                            </td>
                            <td className="py-2 pr-4 text-right font-mono font-semibold text-white">
                              {pct(r.fillRate)}
                            </td>
                            {STACK_ORDER.map((k) => (
                              <td
                                key={k}
                                className="py-2 pr-4 text-right font-mono"
                              >
                                {r.outcomes[k] || (
                                  <span className="text-white/25">·</span>
                                )}
                              </td>
                            ))}
                            <td className="py-2 text-[12px] text-white/50">
                              {r.completedAt
                                ? new Date(r.completedAt).toLocaleTimeString(
                                    "en-AU",
                                    { hour: "2-digit", minute: "2-digit" },
                                  )
                                : "not picked"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {/* Naming the gaps is the point. A dashboard that shows a number it
                cannot substantiate is worse than one that admits the hole. */}
            <section className="mt-10 border-t border-white/10 pt-6">
              <h2 className="text-[15px] font-semibold">
                Not measured yet — and what each one costs
              </h2>
              <p className="mt-1 max-w-[70ch] text-[13px] text-white/50">
                Four metrics matter for picking: units per hour, pick accuracy,
                short-pick rate and cycle time. One of them is derivable from
                what picking writes today. The other three each need one missing
                field, named below. Showing a number this app cannot
                substantiate would be worse than showing the gap.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {report.notMeasured.map((g) => (
                  <div
                    key={g.metric}
                    className="rounded-xl border border-white/10 px-4 py-3"
                  >
                    <p className="text-[13px] font-semibold">{g.metric}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-white/55">
                      {g.why}
                    </p>
                    <p className="mt-2 text-[12px] text-white/40">
                      Needs: {g.needs}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <footer className="mt-8 border-t border-white/10 pt-4 text-[11px] text-white/35">
              Derived from Nash on load. No counters, no second copy of the
              truth.
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
