import { NextResponse } from "next/server";
import { nash, NashError, unwrap, total } from "@/lib/nash";

/**
 * Proves auth works end to end before any feature depends on it.
 *
 * Two failure modes this catches, both of which look like something else:
 *   - Wrong region: the AU host returns MISSING_RESOURCE "API key not found",
 *     which reads as a bad credential rather than a wrong base URL.
 *   - Wrong store identifier: returns 200 with an empty list, which reads as
 *     unseeded data rather than a bad id.
 *
 * So this reports counts, not just ok/not-ok. An empty catalog is a valid
 * state today and it should be visible rather than indistinguishable from
 * a broken join.
 */

type Store = { id: string; externalId?: string; name?: string };

const EXTERNAL_STORE_ID = process.env.NASH_EXTERNAL_STORE_ID ?? "001";

export async function GET() {
  const started = Date.now();

  try {
    const [stores, products, inventory, orders] = await Promise.all([
      nash.get<unknown>("/store_locations"),
      nash.get<unknown>("/products"),
      nash.get<unknown>("/inventory", {
        externalStoreLocationId: EXTERNAL_STORE_ID,
      }),
      nash.get<unknown>("/orders"),
    ]);

    return NextResponse.json({
      ok: true,
      base: process.env.NASH_API_BASE,
      ms: Date.now() - started,
      stores: unwrap<Store>(stores, "storeLocations").map((s) => ({
        id: s.id,
        externalId: s.externalId,
        name: s.name,
      })),
      counts: {
        products: total(products),
        inventory: total(inventory),
        orders: total(orders),
      },
    });
  } catch (e) {
    const err = e as NashError;
    return NextResponse.json(
      {
        ok: false,
        base: process.env.NASH_API_BASE,
        ms: Date.now() - started,
        status: err.status ?? null,
        path: err.path ?? null,
        message: err.message,
        hint:
          err.status === 404 || err.status === 401
            ? 'A 404 with MISSING_RESOURCE "API key not found" usually means the wrong region, not a bad key. This org is US.'
            : undefined,
      },
      { status: 502 },
    );
  }
}
