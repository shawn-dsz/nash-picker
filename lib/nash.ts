/**
 * The only module that talks to Nash over the wire.
 *
 * Everything above this file works in OnePick's own types. Everything below
 * it is Nash's payload shape. Keeping the boundary in one place means a
 * schema surprise at hour four is one file, not a refactor.
 *
 * Server-side only. Importing this from a client component is a bug - it
 * would pull NASH_API_KEY into the browser bundle.
 */

import "server-only";

const BASE = process.env.NASH_API_BASE ?? "https://api.sandbox.usenash.com/v1";

/** Thrown for any non-2xx. Carries enough to debug without a network tab. */
export class NashError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`Nash ${status} on ${path}: ${body.slice(0, 300)}`);
    this.name = "NashError";
  }
}

function headers(): HeadersInit {
  const key = process.env.NASH_API_KEY;
  if (!key) {
    throw new Error(
      "NASH_API_KEY is not set. Copy .env.example to .env and fill it in.",
    );
  }

  const h: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  // Only needed when a key spans multiple orgs. Verified with the customer
  // 2026-08-06: single-org key, so this stays empty and unsent.
  const org = process.env.NASH_ORG_ID;
  if (org) h["X-Nash-Org-Id"] = org;

  return h;
}

type Query = Record<string, string | number | undefined>;

function url(path: string, query?: Query): string {
  const u = new URL(BASE + (path.startsWith("/") ? path : `/${path}`));
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(url(path, opts.query), {
    method,
    headers: headers(),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    // Picking is live data. A cached pick list is a wrong pick list.
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new NashError(res.status, path, text);

  return (text ? JSON.parse(text) : null) as T;
}

export const nash = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, { body }),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, { body }),
};

/**
 * Nash has two list envelope shapes, not one. Verified against the live
 * sandbox 2026-08-06 - this is not in the docs.
 *
 *   /orders           -> { results, totalCount, limit, offset }
 *   /products         -> { products, totalResults }
 *   /inventory        -> { inventory, totalResults }
 *   /store_locations  -> { storeLocations, totalResults }
 *
 * The catalog endpoints name their own collection key. Anything that treats
 * every list the same silently reads `undefined` and renders an empty page,
 * which looks like unseeded data rather than a bug. Hence `unwrap`.
 */
export type PagedEnvelope<T> = {
  results: T[];
  totalCount: number;
  limit: number;
  offset: number;
};

export type NamedEnvelope<T> = Record<string, T[] | number> & {
  totalResults: number;
};

/** Pulls the array out of either envelope. Throws rather than returning []. */
export function unwrap<T>(payload: unknown, key: string): T[] {
  const p = payload as Record<string, unknown>;
  const list = p?.results ?? p?.[key];
  if (!Array.isArray(list)) {
    throw new Error(
      `Expected an array at "results" or "${key}", got ${JSON.stringify(payload).slice(0, 200)}`,
    );
  }
  return list as T[];
}

/** Total across either envelope. */
export function total(payload: unknown): number {
  const p = payload as Record<string, unknown>;
  return (p?.totalCount as number) ?? (p?.totalResults as number) ?? 0;
}
