import { NextResponse } from "next/server";
import { writeRun } from "@/lib/pick-write";
import { NashError } from "@/lib/nash";
import type { Outcome } from "@/lib/outcomes";

/**
 * The write path. Server-side, so the API key never reaches the browser.
 *
 * One request per completed run rather than one per tap - see lib/pick-write.ts
 * for why, which comes down to PATCH replacing the items array rather than
 * merging into it.
 *
 * WHY THE ERROR HANDLING LOOKS LIKE THIS
 * --------------------------------------
 * An earlier version returned `(e as Error).message` straight to the client.
 * `NashError` carries the upstream path and up to 300 characters of Nash's
 * response body, so a bad order id produced:
 *
 *   {"error":"Nash 404 on /order/ord_x: {\"error\":{\"code\":\"MISSING_RESOURCE\",
 *     ...},\"RequestID\":\"1-6a740be2-71e2d4f43059f6026df1790b\"}"}
 *
 * That hands a vendor's API surface, error codes and request ids to anyone who
 * can reach the endpoint. The detail belongs in the server log, where it is
 * useful; the client gets a reference it can quote and nothing else.
 *
 * The reference is the point. "Something went wrong" with no id is not safer,
 * it is just unsupportable - a picker on a shop floor needs something to read
 * out, and support needs something to grep for.
 */
export async function POST(req: Request) {
  const ref = crypto.randomUUID().slice(0, 8);

  try {
    const body = (await req.json()) as {
      orderId?: string;
      outcomes?: Outcome[];
    };

    if (!body.orderId || !Array.isArray(body.outcomes)) {
      return NextResponse.json(
        { error: "orderId and outcomes are required", ref },
        { status: 400 },
      );
    }

    const result = await writeRun(body.orderId, body.outcomes);
    return NextResponse.json(result);
  } catch (e) {
    const err = e as Error;

    // Full detail, server-side only, correlated to what the client was shown.
    console.error(
      JSON.stringify({
        ref,
        at: "POST /api/pick",
        name: err.name,
        message: err.message,
        ...(err instanceof NashError
          ? { upstreamStatus: err.status, upstreamPath: err.path }
          : {}),
      }),
    );

    // A 4xx from Nash is the caller's problem and a 5xx is ours, but neither
    // justifies forwarding the upstream body. The status is shaped, the
    // content is not.
    const upstream4xx =
      err instanceof NashError && err.status >= 400 && err.status < 500;

    return NextResponse.json(
      {
        error: upstream4xx
          ? "That order could not be updated. It may have changed or been removed."
          : "Could not write the run. Please try again.",
        ref,
      },
      { status: upstream4xx ? 400 : 502 },
    );
  }
}
