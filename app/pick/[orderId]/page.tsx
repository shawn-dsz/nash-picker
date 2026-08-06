import Link from "next/link";
import { notFound } from "next/navigation";
import { getPickRun } from "@/lib/adapter";
import { aisleChanges } from "@/lib/sequence";
import { STATUS_LABEL, type PickStatus } from "@/lib/outcomes";
import PickClient from "./pick-client";

export const dynamic = "force-dynamic";

export default async function PickPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const run = await getPickRun(orderId);
  if (!run) notFound();

  const header = (
    <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
      <Link
        href="/"
        aria-label="Back to queue"
        className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-2xl text-white/60 active:bg-white/10"
      >
        ‹
      </Link>
      <div className="min-w-0">
        {/* Deliberately no channel here. The picker view is channel-blind. */}
        <p className="truncate text-[15px] font-semibold leading-tight">
          {run.customer}
        </p>
        <p className="font-mono text-[11px] text-white/45">{run.reference}</p>
      </div>
    </header>
  );

  /*
   * A finished run reopens read-only rather than being re-pickable.
   *
   * Re-picking would let a second run silently overwrite the first, and
   * PATCH replaces rather than merges, so there would be no trace of what
   * was overwritten. Hiding it entirely would be worse: the record is the
   * point.
   */
  if (run.pickStatus === "complete") {
    const byId = new Map(run.recorded.map((r) => [r.subItemId, r]));
    return (
      <main className="flex min-h-dvh flex-col">
        {header}
        <div className="flex-1 px-5 py-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
            Already picked
          </p>
          <h2 className="mt-2 text-[32px] font-bold leading-none tracking-tight">
            {run.fillRate !== null ? Math.round(run.fillRate * 100) : "-"}
            <span className="text-white/40">% fill</span>
          </h2>
          {run.completedAt && (
            <p className="mt-2 text-[13px] text-white/50">
              {new Date(run.completedAt).toLocaleString("en-AU")}
            </p>
          )}

          <ul className="mt-6 divide-y divide-white/10 border-y border-white/10">
            {run.rows.map((row) => {
              const rec = byId.get(row.subItemId);
              return (
                <li key={row.subItemId} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">
                      {row.name}
                    </span>
                    {rec?.substituteSku && (
                      <span className="block font-mono text-[11px] text-[#c9ff00]">
                        → {rec.substituteSku}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    {rec?.status
                      ? STATUS_LABEL[rec.status as PickStatus] ?? rec.status
                      : "-"}
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-[12px] tabular-nums text-white/70">
                    {rec?.quantity ?? 0}/{row.requestedQuantity}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-[12px] leading-snug text-white/45">
            Read-only. Re-picking would overwrite this record, and the write
            replaces rather than merges, so there would be no trace of what
            was here.
          </p>

          <Link
            href="/"
            className="mt-6 flex min-h-[64px] items-center justify-center rounded-xl border border-white/20 text-[15px] font-semibold active:bg-white/10"
          >
            Back to queue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col">
      {header}
      <SequenceBanner run={run} />
      <PickClient run={run} />
    </main>
  );
}

/**
 * Names the walk order, because a picker who does not know the list is
 * sequenced will assume it is basket order and second-guess it.
 */
function SequenceBanner({ run }: { run: Awaited<ReturnType<typeof getPickRun>> }) {
  if (!run) return null;
  const aisles = [
    ...new Set(run.rows.map((r) => r.location?.aisle).filter(Boolean)),
  ];
  return (
    <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-5 py-2.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c9ff00]">
        Route
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-white/60">
        {aisles.join(" → ")}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-white/40">
        {aisleChanges(run.rows)} moves
      </span>
    </div>
  );
}
