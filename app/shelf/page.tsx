import Link from "next/link";
import { loadShelf } from "@/lib/shelf";
import { BarcodeSvg } from "./barcode-svg";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shelf labels · OnePick",
  description: "Scannable Code 128 labels for every product in the store",
};

const locationOf = (i: { aisle: string | null; bay: string | null; shelf: string | null }) =>
  [
    i.aisle && (/^\d+$/.test(i.aisle) ? `Aisle ${i.aisle}` : i.aisle),
    i.bay,
    i.shelf && `Shelf ${i.shelf}`,
  ]
    .filter(Boolean)
    .join(" · ") || "No shelf location";

export default async function ShelfPage() {
  let items: Awaited<ReturnType<typeof loadShelf>> = [];
  let error: string | null = null;

  try {
    items = await loadShelf();
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    // Breaks out of the handheld frame the picker views live in. A shelf is
    // not a handheld screen - this is meant to be looked at from across a
    // desk, or printed.
    <div className="relative left-1/2 w-screen -translate-x-1/2 px-5 py-7 sm:px-8">
      <header className="border-b border-white/10 pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[26px] font-bold tracking-tight">Shelf labels</h1>
          <Link
            href="/"
            className="text-[13px] text-white/45 underline underline-offset-2 hover:text-white/80"
          >
            Back to queue
          </Link>
        </div>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-white/55">
          Every barcode below came out of Nash. Point the pick screen&rsquo;s
          camera at one, or scan it with a handheld - either way the gate is
          reading an optical symbol, not accepting typed digits.{" "}
          <span className="text-white/40">
            Code 128, because the seeded codes are twelve digits with UPC-A
            check digits that do not verify; a real scanner would reject them
            as UPCs.
          </span>
        </p>
      </header>

      {error && (
        <p className="mt-6 rounded-xl border border-[#ff4d4d]/40 bg-[#ff4d4d]/10 px-4 py-3 text-[13px] text-white/80">
          Could not load the catalog: {error}
        </p>
      )}

      {!error && items.length === 0 && (
        <p className="mt-6 text-[14px] text-white/55">
          No products with barcodes in the catalog. Run the seed first.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.sku}
            className="rounded-xl border border-white/12 bg-white/[0.03] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold leading-snug">
                  {item.name}
                </h2>
                <p className="mt-1 text-[12px] text-white/45">
                  {locationOf(item)}
                </p>
              </div>
              {/* Out of stock is on the label rather than hidden, because two
                  of the four demo scenarios depend on an item not being
                  there, and hunting for which one wastes the room's time. */}
              {item.note && (
                <span className="shrink-0 rounded bg-[#f0b429]/15 px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#f0b429]">
                  {item.note}
                </span>
              )}
            </div>

            <div className="mt-3 flex justify-center rounded-lg bg-white p-3">
              <BarcodeSvg value={item.barcode} />
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-3">
              <p className="font-mono text-[12px] tabular-nums text-white/60">
                {item.barcode}
              </p>
              <p className="font-mono text-[11px] text-white/35">{item.sku}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
