import { NextRequest, NextResponse } from "next/server";
import { getPlanScannerUser } from "@/lib/planScanner/auth";
import { getRunDir, reexportWithCalibration, inferRunStatus } from "@/lib/planScanner/runs";
import fs from "fs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const profile = await getPlanScannerUser(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;

  let runDir: string;
  try {
    runDir = getRunDir(slug);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid slug" }, { status: 400 });
  }

  if (!fs.existsSync(runDir)) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const status = inferRunStatus(slug);
  if (!status.calibration) {
    return NextResponse.json({ error: "No calibration saved — save calibration before re-exporting" }, { status: 409 });
  }

  try {
    const result = reexportWithCalibration(slug);
    if (result.status === "not_ready") {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to start re-export" }, { status: 500 });
  }
}
