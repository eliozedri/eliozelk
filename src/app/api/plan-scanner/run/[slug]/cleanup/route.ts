import { NextRequest, NextResponse } from "next/server";
import { getPlanScannerUser } from "@/lib/planScanner/auth";
import { cleanupSourcePdf } from "@/lib/planScanner/runs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const profile = await getPlanScannerUser(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;

  try {
    const cleaned = cleanupSourcePdf(slug);
    return NextResponse.json({ cleaned, source_deleted: cleaned });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cleanup failed" },
      { status: 500 }
    );
  }
}
