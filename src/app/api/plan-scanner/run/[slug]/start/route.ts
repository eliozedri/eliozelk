import { NextRequest, NextResponse } from "next/server";
import { getPlanScannerUser } from "@/lib/planScanner/auth";
import { startPipeline } from "@/lib/planScanner/runs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const profile = await getPlanScannerUser(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;

  try {
    const result = startPipeline(slug);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start pipeline" },
      { status: 500 }
    );
  }
}
