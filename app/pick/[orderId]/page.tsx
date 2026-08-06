import Link from "next/link";
import { notFound } from "next/navigation";
import { getPickRun } from "@/lib/adapter";
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
          {/* Deliberately no channel here. The picker view is channel-blind. */}
          <p className="truncate text-[15px] font-semibold leading-tight">
            {run.customer}
          </p>
          <p className="font-mono text-[11px] text-white/45">{run.reference}</p>
        </div>
      </header>

      <PickClient run={run} />
    </main>
  );
}
