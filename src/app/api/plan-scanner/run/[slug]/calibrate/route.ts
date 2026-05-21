import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getPlanScannerUser } from "@/lib/planScanner/auth";
import {
  getRunDir,
  saveCalibration,
  inferRunStatus,
  patchManifestWithScaleOrigin,
  type ScaleCalibration,
} from "@/lib/planScanner/runs";

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

  // Patch manifest with original scale (idempotent — reads scale_measurement/results.json once)
  const origin = patchManifestWithScaleOrigin(slug);

  // Variables for computed calibration
  let scale_ratio_new: number | undefined;
  let m_per_pt_new: number | undefined;
  let correction_factor: number;
  let two_point_known_m: number | null = null;
  let two_point_measured_m: number | null = null;
  let original_scale_basis: string | undefined;

  if (method === "direct_ratio") {
    const ratio = Number(body.scale_ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return NextResponse.json({ error: "scale_ratio must be a positive number" }, { status: 400 });
    }
    scale_ratio_new = ratio;
    m_per_pt_new = ratio * PT_TO_M_FACTOR;

    if (!origin.available) {
      // Original scale basis is missing — require explicit acknowledgment before proceeding
      if (!body.acknowledge_missing_scale) {
        return NextResponse.json({
          ok: false,
          warning: "original_scale_not_found",
          warning_message:
            "קנה המידה המקורי של הריצה אינו זמין" +
            (origin.reason ? ` (${origin.reason})` : "") +
            ". לא ניתן לחשב גורם תיקון מול הנחת המדידה המקורית. " +
            "הכיול יעדכן את מטא-דאטא קנה המידה בלבד — הכמויות לא ישתנו. " +
            "שלח שוב עם acknowledge_missing_scale: true כדי לאשר ולהמשיך.",
          origin_reason: origin.reason,
        }, { status: 200 });
      }
      // User acknowledged: set correction_factor = 1.0 — quantities unchanged, scale metadata updated
      correction_factor = 1.0;
      original_scale_basis = "not_available_user_acknowledged";
    } else {
      // Original scale is known — compute real correction
      correction_factor = m_per_pt_new / origin.m_per_pt!;
    }
  } else {
    // two_point: correction_factor independent of original scale
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

    if (origin.available) {
      m_per_pt_new = origin.m_per_pt! * correction_factor;
      scale_ratio_new = m_per_pt_new / PT_TO_M_FACTOR;
    } else {
      // Can still apply correction_factor to quantities; scale display unavailable
      original_scale_basis = "not_available_two_point_correction_applied";
    }
  }

  const calibration: ScaleCalibration = {
    calibration_source: "human_manual",
    calibrated_at: new Date().toISOString(),
    calibration_method: method,
    scale_ratio_new: scale_ratio_new !== undefined ? parseFloat(scale_ratio_new.toFixed(4)) : undefined,
    m_per_pt_new: m_per_pt_new !== undefined ? parseFloat(m_per_pt_new.toFixed(8)) : undefined,
    correction_factor: parseFloat(correction_factor.toFixed(6)),
    original_scale_ratio: origin.ratio,
    original_m_per_pt: origin.m_per_pt,
    two_point_known_m,
    two_point_measured_m,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : "",
    ...(original_scale_basis ? { original_scale_basis } : {}),
  };

  try {
    saveCalibration(slug, calibration);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save calibration" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, calibration }, { status: 200 });
}
