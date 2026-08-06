import Link from "next/link";
import { getQueue, CHANNEL_LABEL } from "@/lib/adapter";
import type { Channel } from "@/lib/types";
import QueueRefresh from "./queue-refresh";

// Picking is live data. A cached queue is a wrong queue.
export const dynamic = "force-dynamic";

/**
 * The queue. One store, every channel, one list.
 *
 * The channel badge is the only place channel is ever shown. It lives here
 * because this screen is where "three devices became one" is proven. It is
 * absent from the pick screen, where the channel has no bearing on taking a
 * jar off a shelf.
 */

const CHANNEL_STYLE: Record<Channel, string> = {
  web: "bg-[#c9ff00] text-[#01051E]",
  doordash: "bg-[#d7f0ee] text-[#01051E]",
  uber_eats: "bg-[#314868] text-white",
  unknown: "bg-white/10 text-white/70",
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(
    cents / 100,
  );

export default async function QueuePage() {
  let orders;
  try {
    orders = await getQueue();
  } catch (e) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Cannot reach Nash</h1>
        <p className="mt-3 text-sm text-white/70">{(e as Error).message}</p>
      </main>
    );
  }

  const channels = new Set(orders.map((o) => o.channel));
  const waiting = orders.filter((o) => o.pickStatus === "waiting");

  return (
    <main className="flex min-h-dvh flex-col">
      <QueueRefresh />
      <header className="border-b border-white/10 px-5 pb-5 pt-7">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[28px] font-bold leading-none tracking-tight">
            One<span className="text-[#c9ff00]">Pick</span>
          </h1>
          <span className="text-[11px] uppercase tracking-[0.16em] text-white/45">
            Carlton
          </span>
        </div>
        <p className="mt-3 text-sm text-white/70">
          <span className="font-semibold text-white">{waiting.length}</span>{" "}
          {waiting.length === 1 ? "order" : "orders"} to pick across{" "}
          <span className="font-semibold text-white">{channels.size}</span>{" "}
          {channels.size === 1 ? "channel" : "channels"}
          {orders.length > waiting.length && (
            <>
              {" · "}
              <span className="text-white/45">
                {orders.length - waiting.length} done
              </span>
            </>
          )}
        </p>
        {/* The two views that are not the picker's. Findable rather than
            memorised - a demo where the presenter types a URL from memory is
            a demo with a pause in it. */}
        <nav className="mt-4 flex gap-2">
          <Link
            href="/ops"
            className="rounded-lg border border-white/15 px-3 py-2 text-[12px] font-semibold text-white/70 active:bg-white/10"
          >
            Fulfilment report
          </Link>
          <Link
            href="/shelf"
            className="rounded-lg border border-white/15 px-3 py-2 text-[12px] font-semibold text-white/70 active:bg-white/10"
          >
            Shelf labels
          </Link>
        </nav>
      </header>

      <div className="flex-1 divide-y divide-white/10">
        {orders.length === 0 && (
          <p className="px-5 py-10 text-sm text-white/60">
            Nothing to pick. Run <code>npm run seed</code> to load the demo
            orders.
          </p>
        )}

        {orders.map((o) => {
          const done = o.pickStatus !== "waiting";
          // A finished order is not re-pickable. Re-picking would let a second
          // run silently overwrite the first, and the write replaces rather
          // than merges, so there would be no trace of what was overwritten.
          // It stays openable through View, because the record is the point.
          const body = (
            <>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider ${CHANNEL_STYLE[o.channel]}`}
                  >
                    {CHANNEL_LABEL[o.channel]}
                  </span>
                  <span className="font-mono text-[11px] text-white/45">
                    {o.reference}
                  </span>
                </div>

                <p className="mt-2 truncate text-[17px] font-semibold leading-tight">
                  {o.customer}
                </p>

                {/* Read back from Nash, not held locally. Reload the page and
                    this survives, which is the point. */}
                {done ? (
                  <p className="mt-1 text-[13px] text-white/55">
                    <span className="font-semibold text-[#c9ff00]">
                      ✓ Picked
                    </span>
                    {o.fillRate !== null && (
                      <> · {Math.round(o.fillRate * 100)}% fill</>
                    )}
                    {" · "}
                    {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                  </p>
                ) : (
                  <p className="mt-1 text-[13px] text-white/55">
                    {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                    {o.suburb ? ` · ${o.suburb}` : ""} ·{" "}
                    {money(o.valueCents, o.currency)}
                  </p>
                )}
              </div>

              <span aria-hidden className="shrink-0 text-2xl text-white/30">
                {done ? "" : "›"}
              </span>
            </>
          );

          const cls = `flex min-h-[88px] items-center gap-4 px-5 py-4 ${done ? "opacity-50 active:bg-transparent" : "active:bg-white/5"}`;

          return done ? (
            <Link key={o.id} href={`/pick/${o.id}`} className={cls}>
              {body}
              <span className="shrink-0 rounded-lg border border-white/20 px-3 py-2 text-[12px] font-semibold text-white/70">
                View
              </span>
            </Link>
          ) : (
            <Link key={o.id} href={`/pick/${o.id}`} className={cls}>
              {body}
            </Link>
          );
        })}
      </div>

      <footer className="border-t border-white/10 px-5 py-4 text-[11px] text-white/35">
        Live from Nash. No local database.
      </footer>
    </main>
  );
}
