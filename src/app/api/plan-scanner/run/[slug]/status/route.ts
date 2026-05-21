import { NextRequest, NextResponse } from "next/server";
import { getPlanScannerUser } from "@/lib/planScanner/auth";
import { inferRunStatus } from "@/lib/planScanner/runs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const profile = await getPlanScannerUser(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;

  try {
    const status = inferRunStatus(slug);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get status" },
      { status: 500 }
    );
  }
}
