import { NextResponse } from "next/server";
import { writeRun } from "@/lib/pick-write";
import type { Outcome } from "@/lib/outcomes";

/**
 * The write path. Server-side, so the API key never reaches the browser.
 *
 * One request per completed run rather than one per tap - see lib/pick-write.ts
 * for why, which comes down to PATCH replacing the items array rather than
 * merging into it.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      orderId?: string;
      outcomes?: Outcome[];
    };

    if (!body.orderId || !Array.isArray(body.outcomes)) {
      return NextResponse.json(
        { error: "orderId and outcomes are required" },
        { status: 400 },
      );
    }

    const result = await writeRun(body.orderId, body.outcomes);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
