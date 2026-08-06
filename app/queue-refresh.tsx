"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the queue current without the picker thinking about it.
 *
 * The page is already `force-dynamic` with `cache: "no-store"`, so every
 * render is live. What it lacked was any reason to re-render: a second picker
 * finishing an order on another device left this screen showing work that no
 * longer exists, and two pickers starting the same order is a real failure in
 * a real store rather than a cosmetic one.
 *
 * Two triggers, deliberately cheap:
 *
 *   1. On focus and on visibility change. A picker puts the device in a
 *      pocket, walks an aisle, pulls it out. That is the moment the queue is
 *      most likely to be wrong, and it costs nothing to catch.
 *   2. A slow interval as a backstop, for a device left awake on a bench.
 *
 * router.refresh() re-runs the server component, so the adapter re-joins
 * against Nash. It does not touch client state and it does not flash the
 * page. Polling every few seconds would be wasteful and would not make the
 * queue meaningfully more correct - the real answer at scale is a webhook
 * subscription on order updates, which is named in the architecture as a next
 * action rather than pretended at here.
 */
export default function QueueRefresh({ intervalMs = 30_000 }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, intervalMs);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [router, intervalMs]);

  return null;
}
