import { NextResponse } from "next/server";
import { loadReport } from "@/lib/ops";

/** The fulfilment report, as JSON. Server-side, so the API key stays here. */
export async function GET() {
  try {
    return NextResponse.json(await loadReport());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
