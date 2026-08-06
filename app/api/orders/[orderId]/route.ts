import { NextResponse } from "next/server";
import { getPickRun } from "@/lib/adapter";

/** One pick run: the three-way join, resolved. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  try {
    const run = await getPickRun(orderId);
    if (!run) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
