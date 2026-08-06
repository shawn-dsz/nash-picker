import { NextResponse } from "next/server";
import { getQueue } from "@/lib/adapter";

/** The queue, as JSON. Server-side, so the API key never leaves the server. */
export async function GET() {
  try {
    const orders = await getQueue();
    return NextResponse.json({ orders, count: orders.length });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502 },
    );
  }
}
