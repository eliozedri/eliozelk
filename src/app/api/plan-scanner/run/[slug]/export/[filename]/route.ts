import { NextRequest, NextResponse } from "next/server";
import { getPlanScannerUser } from "@/lib/planScanner/auth";
import { safeExportPath, markExportDownloaded } from "@/lib/planScanner/runs";
import fs from "fs";
import path from "path";

const MIME_MAP: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".json": "application/json",
  ".md":   "text/markdown; charset=utf-8",
  ".csv":  "text/csv; charset=utf-8",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; filename: string }> }
) {
  const profile = await getPlanScannerUser(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug, filename } = await params;

  let filePath: string;
  try {
    filePath = safeExportPath(slug, filename);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME_MAP[ext] ?? "application/octet-stream";

  const buffer = fs.readFileSync(filePath);
  // Side-effect: mark as downloaded for session state tracking
  markExportDownloaded(slug, filename);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
}
