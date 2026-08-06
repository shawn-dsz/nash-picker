"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PickRow, PickRun } from "@/lib/types";
import type { Outcome } from "@/lib/outcomes";
import { STATUS_LABEL, statusFor } from "@/lib/outcomes";

/**
 * One item at a time.
 *
 * A picker holds a device in one hand and a tote in the other, often in a cold
 * aisle. So: one decision per screen, a 64px primary action, nothing that
 * needs precision, and no hover states because there is no mouse.
 *
 * State is local for the duration of the run and flushed to Nash on
 * completion. That is not a second source of truth - it is a buffer, and it
 * exists so a picker never waits on a network call between items.
 */

export default function PickClient({ run }: { run: PickRun }) {
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  const row = run.rows[index];
  const done = index >= run.rows.length;

  function record(outcome: Outcome) {
    setOutcomes((prev) => ({ ...prev, [outcome.subItemId]: outcome }));
    setIndex((i) => i + 1);
  }

  if (done) {
    return <RunSummary run={run} outcomes={outcomes} />;
  }

  return (
    <>
      <Progress index={index} total={run.rows.length} />
      <PickItem
        key={row.subItemId}
        row={row}
        catalogByUpc={run.catalogByUpc}
        onRecord={record}
      />
    </>
  );
}

// ------------------------------------------------------------------ progress

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div className="border-b border-white/10 px-5 py-3">
      <div className="mb-2 flex items-baseline justify-between text-[11px] uppercase tracking-[0.14em] text-white/45">
        <span>
          Item {index + 1} of {total}
        </span>
        <span>{Math.round((index / total) * 100)}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#c9ff00] transition-all duration-300"
          style={{ width: `${(index / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- one item

/**
 * The primary action's label.
 *
 * "all" only earns its place when there is more than one of something. It is
 * there to make the partial below it read as a quantity rather than an
 * exception - "Picked all 3" against "Found fewer". At a quantity of one there
 * is no "all" to contrast with, and "Picked all 1" is just noise.
 *
 * Weighted items are the case that made this wrong rather than merely clumsy.
 * A 1kg order of loose bananas has requestedQuantity 1, so the button read
 * "Picked all 1" - which looks like one banana. The unit is the whole point of
 * a weighed item, so it is stated.
 */
function pickedAllLabel(row: PickRow): string {
  if (row.isWeighted) {
    return `Picked ${row.requestedQuantity}${row.weightUnit ?? "kg"}`;
  }
  return row.requestedQuantity > 1
    ? `Picked all ${row.requestedQuantity}`
    : "Picked";
}

/**
 * The scan gate.
 *
 * A TEXT INPUT, NOT A CAMERA, AND THAT IS THE PRODUCTION DESIGN
 * ------------------------------------------------------------
 * Store handhelds - Zebra, Honeywell - emulate a keyboard. They type the
 * digits into whatever is focused and send a carriage return. So a focused
 * input IS the mechanism a real device drives, not a stand-in for one. It also
 * costs no camera permission, no HTTPS caveat and no lighting risk.
 *
 * A phone camera would be the addition for stores without handhelds, and it
 * feeds this same resolution path.
 */
function ScanGate({
  scan,
  typed,
  expectedName,
  onType,
  onSubmit,
  onRescan,
  onOverride,
}: {
  scan: Scan;
  typed: string;
  expectedName: string;
  onType: (v: string) => void;
  onSubmit: (code: string) => void;
  onRescan: () => void;
  onOverride: (barcode: string | null) => void;
}) {
  if (scan.state === "verified") {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#c9ff00]/40 bg-[#c9ff00]/10 px-4 py-3">
        <span className="text-lg text-[#c9ff00]">✓</span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-[#c9ff00]">
            Barcode verified
          </span>
          <span className="block font-mono text-[11px] text-white/45">
            {scan.barcode}
          </span>
        </span>
      </div>
    );
  }

  if (scan.state === "overridden") {
    // Never silent. The override is visible for as long as the item is on
    // screen, and it is written to Nash - see scan_override in the payload.
    return (
      <div className="mt-5 rounded-xl border border-[#f0b429]/40 bg-[#f0b429]/10 px-4 py-3">
        <p className="text-[13px] font-semibold text-[#f0b429]">
          Recorded as unverified
        </p>
        <p className="mt-1 text-[12px] text-white/55">
          {scan.barcode
            ? `Scanned ${scan.barcode}, which is not this item.`
            : "No barcode was read."}{" "}
          This is written to the order, not dropped.
        </p>
      </div>
    );
  }

  if (scan.state === "wrong") {
    return (
      <div className="mt-5 rounded-xl border-2 border-[#ff4d4d] bg-[#ff4d4d]/15 px-4 py-4">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#ff4d4d]">
          ✗ Wrong item
        </p>
        <p className="mt-2 text-[15px] font-semibold leading-snug">
          {scan.actual ? (
            <>That is {scan.actual}</>
          ) : (
            <>That barcode is not in this store&rsquo;s catalog</>
          )}
        </p>
        <p className="mt-1 text-[14px] text-white/70">You need {expectedName}</p>
        <p className="mt-2 font-mono text-[11px] text-white/40">
          {scan.barcode}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onRescan}
            className="min-h-[48px] flex-1 rounded-lg bg-white text-[14px] font-semibold text-[#01051E] active:opacity-80"
          >
            Rescan
          </button>
          <button
            onClick={() => onOverride(scan.barcode)}
            className="min-h-[48px] flex-1 rounded-lg border border-white/25 text-[13px] font-semibold text-white/70 active:bg-white/10"
          >
            Override
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-white/15 px-4 py-4">
      <label
        htmlFor="scan"
        className="text-[11px] uppercase tracking-[0.14em] text-white/45"
      >
        Scan to confirm
      </label>
      <input
        id="scan"
        autoFocus
        inputMode="numeric"
        autoComplete="off"
        value={typed}
        onChange={(e) => onType(e.target.value)}
        // A wedge scanner types the digits then sends Enter, so Enter is the
        // real submit. Typing it by hand works identically.
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit(typed);
          }
        }}
        placeholder="Barcode"
        className="mt-2 h-14 w-full rounded-lg border border-white/20 bg-transparent px-4 font-mono text-xl tabular-nums outline-none focus:border-[#c9ff00]"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        {/* An item whose label is damaged or missing must still be pickable.
            A gate with no escape is one a picker works around, and the
            workaround is always worse than a recorded override. */}
        <button
          onClick={() => onOverride(null)}
          className="text-left text-[12px] text-white/45 underline underline-offset-2 active:text-white/70"
        >
          No barcode on the item
        </button>
        <button
          onClick={() => onSubmit(typed)}
          disabled={typed.trim() === ""}
          className="min-h-[44px] shrink-0 rounded-lg bg-white px-4 text-[13px] font-semibold text-[#01051E] disabled:opacity-30 active:opacity-80"
        >
          Check
        </button>
      </div>
    </div>
  );
}

/**
 * Scan state for one item.
 *
 * `overridden` is a real state rather than a flag on `verified`, because the
 * two are not the same thing and the record must not pretend they are: one
 * says the barcode matched, the other says a human decided to proceed anyway.
 */
type Scan =
  | { state: "waiting" }
  | { state: "verified"; barcode: string }
  | { state: "wrong"; barcode: string; actual: string | null }
  /**
   * Carries the barcode that was actually read, when there was one. "Scanned
   * Coca-Cola Classic and proceeded anyway" is a different fact from "the
   * label was missing", and only one of them is a training problem.
   */
  | { state: "overridden"; barcode: string | null };

function PickItem({
  row,
  catalogByUpc,
  onRecord,
}: {
  row: PickRow;
  catalogByUpc: Record<string, string>;
  onRecord: (o: Outcome) => void;
}) {
  const [quantity, setQuantity] = useState(row.requestedQuantity);
  const [weight, setWeight] = useState("");
  const [mode, setMode] = useState<"pick" | "short" | "substitute">("pick");
  const [chosen, setChosen] = useState(0);
  const [scan, setScan] = useState<Scan>({ state: "waiting" });
  const [typed, setTyped] = useState("");

  const refundOnly = row.substitution?.preference === "refund";
  const substitutes = row.substitution?.preference === "substitute"
    ? row.substitution.items
    : [];
  const canSubstitute = substitutes.length > 0;
  const sub = substitutes[chosen];

  // What has to be in the picker's hand right now. Taking a substitute changes
  // it: penne goes in the tote, so penne is what gets verified.
  const expected = mode === "substitute" ? sub?.barcode ?? null : row.barcode;
  const expectedName = mode === "substitute" ? sub?.name ?? row.name : row.name;

  /*
   * WHICH ACTIONS THE SCAN GATES, AND WHICH IT MUST NOT
   * ---------------------------------------------------
   *   picked / partial   gated. This is the accuracy claim.
   *   substituted        gated, against the SUBSTITUTE's barcode.
   *   not_picked         NOT gated. You cannot scan an item that is not there,
   *                      and gating it would make an out-of-stock item
   *                      unrecordable - turning a safety feature into the
   *                      reason the data is wrong.
   *
   * A row with no barcode on file is not gated either. The alternative is an
   * unpickable item, and a picker blocked by missing catalog data will find a
   * way around the app rather than stop.
   */
  const scannable = expected !== null;
  const cleared =
    !scannable || scan.state === "verified" || scan.state === "overridden";

  /** What was actually scanned, or undefined. Never the expected barcode. */
  const scannedBarcode =
    scan.state === "verified"
      ? scan.barcode
      : scan.state === "overridden"
        ? scan.barcode ?? undefined
        : undefined;
  const scanOverride = scan.state === "overridden" ? true : undefined;

  /** Resolve a read against the expected barcode, naming what was scanned. */
  const submitScan = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setTyped("");

    if (expected && code === expected) {
      setScan({ state: "verified", barcode: code });
      return;
    }
    // Naming the wrong item is the whole point. "That is Coca-Cola Classic,
    // you need Coke Zero" is actionable. "Wrong item" is not.
    setScan({ state: "wrong", barcode: code, actual: catalogByUpc[code] ?? null });
  };

  /** Choosing a substitute changes what must be scanned, so the gate resets. */
  const chooseSubstitute = (i: number) => {
    setChosen(i);
    setMode("substitute");
    setScan({ state: "waiting" });
    setTyped("");
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 px-5 py-5">
        {/* Location first. It is the only thing that matters until the picker
            is standing in front of the shelf. */}
        {row.location ? (
          <div className="mb-5 flex items-center gap-2 rounded-xl bg-white/[0.06] px-4 py-3">
            <Cell label="Aisle" value={row.location.aisle} />
            <Divider />
            <Cell label="Bay" value={row.location.bay} />
            <Divider />
            <Cell label="Shelf" value={row.location.shelf} />
          </div>
        ) : (
          <p className="mb-5 rounded-xl bg-white/[0.06] px-4 py-3 text-sm text-white/50">
            No location on file
          </p>
        )}

        <div className="flex gap-4">
          {row.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.imageUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold leading-tight tracking-tight">
              {row.name}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-white/40">{row.sku}</p>
            <p className="mt-2 text-[15px] text-white/70">
              <span className="text-2xl font-bold text-white">
                {row.requestedQuantity}
              </span>{" "}
              {row.isWeighted ? row.weightUnit ?? "kg" : "requested"}
            </p>
          </div>
        </div>

        {!row.inStock && (
          <p className="mt-5 rounded-lg border border-[#c9ff00]/30 bg-[#c9ff00]/10 px-4 py-3 text-[13px] font-semibold text-[#c9ff00]">
            Shows 0 on hand
          </p>
        )}

        {/* The customer already decided. This is where that decision surfaces. */}
        {refundOnly && (
          <div className="mt-5 rounded-xl border border-white/15 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">
              Customer preference
            </p>
            <p className="mt-2 text-[15px] font-semibold">
              Refund if unavailable
            </p>
            <p className="mt-1 text-[13px] text-white/55">
              Do not substitute. They asked for their money back instead.
            </p>
          </div>
        )}

        {/* The accuracy gate. Three lookalike colas sit on one shelf in this
            store, same aisle, same bay, same shelf. Location cannot tell them
            apart. The barcode is the only thing that can. */}
        {scannable && (
          <ScanGate
            scan={scan}
            typed={typed}
            expectedName={expectedName}
            onType={setTyped}
            onSubmit={submitScan}
            onRescan={() => setScan({ state: "waiting" })}
            onOverride={(barcode) => setScan({ state: "overridden", barcode })}
          />
        )}

        {mode === "short" && (
          <div className="mt-5 rounded-xl border border-white/15 px-4 py-4">
            {row.isWeighted ? (
              <>
                <label
                  htmlFor="weight"
                  className="text-[11px] uppercase tracking-[0.14em] text-white/45"
                >
                  Weight on the scale ({row.weightUnit ?? "kg"})
                </label>
                <input
                  id="weight"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder={row.requestedQuantity.toFixed(2)}
                  className="mt-2 h-14 w-full rounded-lg border border-white/20 bg-transparent px-4 text-2xl font-bold tabular-nums outline-none focus:border-[#c9ff00]"
                />
              </>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">
                  How many did you find?
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Step
                    label="−"
                    onClick={() => setQuantity((q) => Math.max(0, q - 1))}
                  />
                  <span className="min-w-[3ch] text-center text-3xl font-bold tabular-nums">
                    {quantity}
                  </span>
                  <Step
                    label="+"
                    onClick={() =>
                      setQuantity((q) => Math.min(row.requestedQuantity, q + 1))
                    }
                  />
                  <span className="ml-1 text-[13px] text-white/45">
                    of {row.requestedQuantity}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Actions pinned to the bottom, where a thumb is. */}
      <div className="space-y-2 border-t border-white/10 px-5 pb-6 pt-4">
        {mode === "pick" && (
          <>
            <Primary
              disabled={!cleared}
              onClick={() =>
                onRecord({
                  subItemId: row.subItemId,
                  sku: row.sku,
                  // Through statusFor, not asserted here. Every outcome in
                  // this file derives from the same rule, so the screen and
                  // the write path cannot drift apart on what "partial" means.
                  status: statusFor(
                    row.requestedQuantity,
                    row.requestedQuantity,
                  ),
                  requestedQuantity: row.requestedQuantity,
                  quantity: row.requestedQuantity,
                  scannedBarcode,
                  scanOverride,
                })
              }
            >
              {cleared ? pickedAllLabel(row) : "Scan to confirm"}
            </Primary>

            <div className="flex gap-2">
              <Secondary onClick={() => setMode("short")}>
                {row.isWeighted ? "Enter weight" : "Found fewer"}
              </Secondary>
              {/* Deliberately NOT gated. You cannot scan an item that is not
                  there, and blocking this would make an out-of-stock item
                  unrecordable - turning the safety feature into the reason
                  the data is wrong. */}
              <Secondary
                onClick={() =>
                  onRecord({
                    subItemId: row.subItemId,
                    sku: row.sku,
                    status: statusFor(row.requestedQuantity, 0),
                    requestedQuantity: row.requestedQuantity,
                    quantity: 0,
                  })
                }
              >
                Not on shelf
              </Secondary>
            </div>

            {/* Every substitute the customer pre-approved, in their order of
                preference. The picker is applying a decision, not making one -
                but a ranked fallback is still their decision, and offering
                only the first silently discards the rest. */}
            {canSubstitute &&
              substitutes.map((alt, i) => (
                <button
                  key={alt.sku}
                  onClick={() => chooseSubstitute(i)}
                  aria-label={`Take the customer approved substitute, ${alt.name}`}
                  className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-[#c9ff00]/40 bg-[#c9ff00]/10 px-4 text-left active:bg-[#c9ff00]/20"
                >
                  {alt.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={alt.imageUrl}
                      alt=""
                      className="h-11 w-11 rounded object-cover"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] uppercase tracking-[0.12em] text-[#c9ff00]">
                      {substitutes.length > 1
                        ? `Approved substitute ${i + 1} of ${substitutes.length}`
                        : "Customer approved substitute"}
                    </span>
                    <span className="block truncate text-[15px] font-semibold">
                      {alt.name}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-xl text-white/30">
                    ›
                  </span>
                </button>
              ))}
          </>
        )}

        {mode === "short" && (
          <>
            <Primary
              onClick={() => {
                const w = parseFloat(weight);
                const got = row.isWeighted ? (isNaN(w) ? 0 : w) : quantity;
                onRecord({
                  subItemId: row.subItemId,
                  sku: row.sku,
                  // A quantity, never a boolean. 0.94kg against a 1kg order is
                  // neither picked nor not-picked.
                  status: statusFor(row.requestedQuantity, got),
                  requestedQuantity: row.requestedQuantity,
                  quantity: got,
                  weight: row.isWeighted ? got : undefined,
                  scannedBarcode,
                  scanOverride,
                });
              }}
              // Finding fewer still means holding some of them, so the scan
              // applies. Zero found is the "Not on shelf" path, not this one.
              disabled={(row.isWeighted && weight === "") || !cleared}
            >
              {cleared ? "Confirm" : "Scan to confirm"}
            </Primary>
            <Secondary onClick={() => setMode("pick")} full>
              Back
            </Secondary>
          </>
        )}

        {mode === "substitute" && sub && (
          <>
            <Primary
              disabled={!cleared}
              onClick={() =>
                onRecord({
                  subItemId: row.subItemId,
                  sku: row.sku,
                  // The `true` is what makes this substituted. A full-count
                  // substitute is still not the thing the customer ordered.
                  status: statusFor(row.requestedQuantity, sub.quantity, true),
                  requestedQuantity: row.requestedQuantity,
                  quantity: sub.quantity,
                  substituteSku: sub.sku,
                  scannedBarcode,
                  scanOverride,
                })
              }
            >
              {cleared ? `Take ${sub.name}` : "Scan the substitute"}
            </Primary>
            <Secondary
              onClick={() => {
                setMode("pick");
                setScan({ state: "waiting" });
                setTyped("");
              }}
              full
            >
              Back
            </Secondary>
          </>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- summary

type SyncState =
  | { phase: "writing" }
  | { phase: "done"; pickStatus: string; portalUrl: string | null }
  | { phase: "failed"; message: string };

function RunSummary({
  run,
  outcomes,
}: {
  run: PickRun;
  outcomes: Record<string, Outcome>;
}) {
  const list = run.rows.map((r) => ({ row: r, outcome: outcomes[r.subItemId] }));
  const ordered = list.reduce((n, l) => n + l.row.requestedQuantity, 0);
  const got = list.reduce((n, l) => n + (l.outcome?.quantity ?? 0), 0);
  const fill = ordered === 0 ? 0 : Math.round((got / ordered) * 100);

  const [sync, setSync] = useState<SyncState>({ phase: "writing" });
  // React runs effects twice in dev StrictMode. A duplicate PATCH is
  // idempotent here, but firing it twice muddies the log during a demo.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    (async () => {
      try {
        const res = await fetch("/api/pick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: run.id,
            outcomes: Object.values(outcomes),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "write failed");
        setSync({
          phase: "done",
          pickStatus: data.pickStatus,
          portalUrl: data.portalUrl,
        });
      } catch (e) {
        setSync({ phase: "failed", message: (e as Error).message });
      }
    })();
  }, [run.id, outcomes]);

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">
        Run complete
      </p>
      <h2 className="mt-2 text-[32px] font-bold leading-none tracking-tight">
        {fill}
        <span className="text-white/40">% fill</span>
      </h2>
      <p className="mt-2 text-[13px] text-white/55">
        {got} of {ordered} units for {run.customer}
      </p>

      <ul className="mt-6 flex-1 divide-y divide-white/10 border-y border-white/10">
        {list.map(({ row, outcome }) => (
          <li key={row.subItemId} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1 truncate text-[14px]">
              {row.name}
            </span>
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-white/60">
              {outcome ? STATUS_LABEL[outcome.status] : "-"}
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-[12px] tabular-nums text-white/70">
              {outcome?.quantity ?? 0}/{row.requestedQuantity}
            </span>
          </li>
        ))}
      </ul>

      {/* The handoff, named on screen. Picking ends here and Nash takes over. */}
      <div className="mt-5 rounded-xl border border-white/15 px-4 py-4">
        {sync.phase === "writing" && (
          <p className="text-[14px] text-white/60">Writing outcomes to Nash…</p>
        )}

        {sync.phase === "done" && (
          <>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#c9ff00]">
              Saved to Nash
            </p>
            <p className="mt-2 text-[15px] font-semibold">
              Picking finished. Tote ready for handoff
            </p>
            {/*
              The raw convention string, labelled as one.
              `items_pick_complete` means the RUN finished, not that everything
              was found - it sits next to a 67% fill rate on a run with a
              missing item and reads as a contradiction otherwise.
            */}
            <p className="mt-1 text-[12px] text-white/50">
              Run status{" "}
              <span className="font-mono text-white/70">{sync.pickStatus}</span>
              <span className="text-white/40"> · the run finished, not that every item was found</span>
            </p>
            {/*
              Deliberately not "dispatched" or "ready for dispatch". This app
              writes a metadata convention that Nash does not act on - the
              order status is still `valid` and no quote has been requested.
              Claiming a handoff that has not happened would be the kind of
              detail a reviewer finds and stops trusting the rest over.
            */}
            <p className="mt-2 text-[12px] leading-snug text-white/45">
              Recorded against the order. Dispatch is a separate Nash step and
              is not triggered by this app.
            </p>
            {sync.portalUrl && (
              <a
                href={sync.portalUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[13px] font-semibold text-[#c9ff00] underline underline-offset-4"
              >
                Open in the Nash portal
              </a>
            )}
          </>
        )}

        {sync.phase === "failed" && (
          <>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">
              Not saved
            </p>
            <p className="mt-2 text-[14px] text-white/70">{sync.message}</p>
            <p className="mt-2 text-[12px] text-white/45">
              The run is still on this device. Reopening the order re-reads
              from Nash.
            </p>
          </>
        )}
      </div>

      <Link
        href="/"
        className="mt-4 flex min-h-[64px] items-center justify-center rounded-xl bg-[#c9ff00] text-[17px] font-bold text-[#01051E] active:bg-[#a8d400]"
      >
        Back to queue
      </Link>
    </div>
  );
}

// ------------------------------------------------------------------- atoms

const Cell = ({ label, value }: { label: string; value: string }) => (
  <div className="flex-1 text-center">
    <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">
      {label}
    </p>
    <p className="mt-0.5 text-xl font-bold leading-none">{value}</p>
  </div>
);

const Divider = () => <div className="h-8 w-px bg-white/10" />;

const Step = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="h-14 w-14 rounded-lg border border-white/20 text-2xl font-bold active:bg-white/10"
  >
    {label}
  </button>
);

function Primary({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[64px] w-full items-center justify-center rounded-xl bg-[#c9ff00] text-[17px] font-bold text-[#01051E] active:bg-[#a8d400] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Secondary({
  children,
  onClick,
  full,
}: {
  children: React.ReactNode;
  onClick: () => void;
  full?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[56px] items-center justify-center rounded-xl border border-white/20 px-4 text-[15px] font-semibold active:bg-white/10 ${full ? "w-full" : "flex-1"}`}
    >
      {children}
    </button>
  );
}
