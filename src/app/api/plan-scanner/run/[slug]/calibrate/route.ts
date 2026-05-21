import { NextRequest, NextResponse } from "next/server";
import { getPlanScannerUser } from "@/lib/planScanner/auth";
import { getRunDir, saveCalibration, inferRunStatus, type ScaleCalibration } from "@/lib/planScanner/runs";
import fs from "fs";

// PDF point to meters: scale_ratio * (25.4 mm/inch / 72 pt/inch) / 1000 mm/m
const PT_TO_M_FACTOR = (25.4 / 72) / 1000;

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
  if (status.phase !== "outputs_generated" && status.phase !== "source_deleted") {
    return NextResponse.json({ error: "Calibration requires completed pipeline outputs" }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const method = body.calibration_method as string;
  if (method !== "direct_ratio" && method !== "two_point") {
    return NextResponse.json({ error: "calibration_method must be direct_ratio or two_point" }, { status: 400 });
  }

  // Determine scale_ratio_new and correction_factor
  let scale_ratio_new: number;
  let m_per_pt_new: number;
  let correction_factor: number;
  let two_point_known_m: number | null = null;
  let two_point_measured_m: number | null = null;

  // Read original scale from manifest or use default
  const manifestPath = require("path").join(runDir, "plan_manifest.json");
  let original_scale_ratio: number | undefined;
  let original_m_per_pt: number | undefined;
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      original_scale_ratio = m.scale_ratio_original ?? undefined;
      original_m_per_pt = m.scale_m_per_pt_original ?? undefined;
    } catch {}
  }
  // Fallback: read from scale_measurement/results.json
  if (!original_m_per_pt) {
    const scalePath = require("path").join(runDir, "outputs", "scale_measurement", "results.json");
    if (fs.existsSync(scalePath)) {
      try {
        const s = JSON.parse(fs.readFileSync(scalePath, "utf8"));
        const si = s.scale_info ?? s;
        original_m_per_pt = si.m_per_pt ?? si.derived_m_per_pt ?? undefined;
        original_scale_ratio = si.ratio ?? undefined;
      } catch {}
    }
  }

  if (method === "direct_ratio") {
    const ratio = Number(body.scale_ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return NextResponse.json({ error: "scale_ratio must be a positive number" }, { status: 400 });
    }
    scale_ratio_new = ratio;
    m_per_pt_new = ratio * PT_TO_M_FACTOR;
    const orig_mpp = original_m_per_pt ?? (500 * PT_TO_M_FACTOR);
    correction_factor = m_per_pt_new / orig_mpp;
  } else {
    // two_point
    const known_m = Number(body.known_m);
    const measured_m = Number(body.measured_m);
    if (!Number.isFinite(known_m) || known_m <= 0) {
      return NextResponse.json({ error: "known_m must be a positive number" }, { status: 400 });
    }
    if (!Number.isFinite(measured_m) || measured_m <= 0) {
      return NextResponse.json({ error: "measured_m must be a positive number" }, { status: 400 });
    }
    two_point_known_m = known_m;
    two_point_measured_m = measured_m;
    correction_factor = known_m / measured_m;
    const orig_mpp = original_m_per_pt ?? (500 * PT_TO_M_FACTOR);
    m_per_pt_new = orig_mpp * correction_factor;
    scale_ratio_new = m_per_pt_new / PT_TO_M_FACTOR;
  }

  const calibration: ScaleCalibration = {
    calibration_source: "human_manual",
    calibrated_at: new Date().toISOString(),
    calibration_method: method,
    scale_ratio_new: parseFloat(scale_ratio_new.toFixed(4)),
    m_per_pt_new: parseFloat(m_per_pt_new.toFixed(8)),
    correction_factor: parseFloat(correction_factor.toFixed(6)),
    original_scale_ratio: original_scale_ratio,
    original_m_per_pt: original_m_per_pt,
    two_point_known_m,
    two_point_measured_m,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : "",
  };

  try {
    saveCalibration(slug, calibration);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save calibration" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, calibration }, { status: 200 });
}
