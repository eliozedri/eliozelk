import { NextRequest, NextResponse } from "next/server";
import { getPlanScannerUser } from "@/lib/planScanner/auth";
import { listExports } from "@/lib/planScanner/runs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const profile = await getPlanScannerUser(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;

  try {
    const exports = listExports(slug);
    return NextResponse.json(exports);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list exports" },
      { status: 500 }
    );
  }
}
