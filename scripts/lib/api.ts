/**
 * A standalone Nash client for the seed scripts.
 *
 * Deliberately not lib/nash.ts - that one imports "server-only", which is a
 * Next.js build-time guard and throws outside the framework. Seed scripts are
 * a CLI, not the app. Fifteen lines of duplication is cheaper than weakening
 * the guard that keeps the API key out of the browser bundle.
 *
 * Run with: node --env-file=.env scripts/seed/index.ts
 */

const BASE = process.env.NASH_API_BASE ?? "https://api.sandbox.usenash.com/v1";

export const STORE = process.env.NASH_EXTERNAL_STORE_ID ?? "001";

function key(): string {
  const k = process.env.NASH_API_KEY;
  if (!k) throw new Error("NASH_API_KEY missing. Run with --env-file=.env");
  return k;
}

export async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}\n${text.slice(0, 800)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export const ok = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
export const step = (msg: string) => console.log(`\n\x1b[1m${msg}\x1b[0m`);
export const warn = (msg: string) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);
