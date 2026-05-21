import { NextRequest, NextResponse } from "next/server";
import { getPlanScannerUser } from "@/lib/planScanner/auth";
import { createRun, createRunSlug, MAX_PDF_SIZE } from "@/lib/planScanner/runs";
import path from "path";

const ALLOWED_MIME = new Set(["application/pdf"]);

export async function POST(req: NextRequest) {
  const profile = await getPlanScannerUser(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not parse form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `Only PDF files are accepted. Received: ${file.type}` },
      { status: 400 }
    );
  }

  if (file.size > MAX_PDF_SIZE) {
    return NextResponse.json(
      { error: `File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum: ${MAX_PDF_SIZE / (1024 * 1024)} MB` },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Derive plan name from filename (without extension)
  const planName = path.parse(file.name).name
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .trim() || "Plan";

  const slug = createRunSlug(file.name);

  try {
    const { runDir: _runDir } = createRun({
      slug,
      originalFilename: file.name,
      buffer,
      planName,
    });

    return NextResponse.json({ slug, planName }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create run" },
      { status: 500 }
    );
  }
}
