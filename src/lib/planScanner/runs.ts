import fs from "fs";
import path from "path";
import { createHash } from "crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

const RESEARCH_BASE = path.join(process.cwd(), "research", "cad-pdf-intelligence");

export const RUNS_BASE: string = (() => {
  if (process.env.PLAN_SCANNER_RUNS_DIR) return process.env.PLAN_SCANNER_RUNS_DIR;
  if (process.env.VERCEL) return "/tmp/plan-scanner-runs";
  return path.join(RESEARCH_BASE, "runs");
})();

export const VENV_PYTHON = path.join(RESEARCH_BASE, ".venv", "bin", "python3");
const ORCHESTRATOR_SCRIPT = path.join(RESEARCH_BASE, "34_ui_plan_scan_orchestrator.py");
const PIPELINE_SCRIPT     = path.join(RESEARCH_BASE, "19_run_plan_scanner_pipeline.py");
const EXPORT_SCRIPT       = path.join(RESEARCH_BASE, "33_worker_operations_export.py");

export const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50 MB
const SLUG_MAX_LEN = 200;
const EXPORT_WHITELIST = new Set([".html", ".xlsx", ".json", ".md", ".csv"]);

// ── Types ─────────────────────────────────────────────────────────────────────

export type RunPhase =
  | "intake_created"
  | "running"
  | "outputs_generated"
  | "source_deleted"
  | "failed";

export type CalibrationMethod = "direct_ratio" | "two_point";

export interface ScaleCalibration {
  calibration_source: "human_manual";
  calibrated_at: string;
  calibration_method: CalibrationMethod;
  scale_ratio_new?: number;       // undefined for two_point when original scale unavailable
  m_per_pt_new?: number;          // undefined for two_point when original scale unavailable
  correction_factor: number;
  original_scale_ratio?: number;
  original_m_per_pt?: number;
  two_point_known_m?: number | null;
  two_point_measured_m?: number | null;
  notes?: string;
  original_scale_basis?: string;  // "not_available_user_acknowledged" when original was missing
}

export interface ScaleOriginResult {
  available: boolean;
  m_per_pt?: number;
  ratio?: number;
  source?: string;
  status?: string;
  reason?: string;
}

export interface RunProgress {
  elapsed_seconds: number;
  estimated_pct: number;
  stage_label: string;
  started_at: string;
  // Real-progress fields (populated when scan_progress.json is present)
  scan_mode?: "fast_scan" | "deep_scan";
  current_script?: string;
  stage_index?: number;
  total_stages?: number;
  completed_count?: number;
  is_real_progress?: boolean;
}

// Internal type matching scan_progress.json written by 34_
interface ScanProgressFile {
  scan_mode?: string;
  status: "running" | "completed" | "failed";
  current_script?: string | null;
  current_stage_index?: number;
  current_stage_label?: string;
  completed_count?: number;
  total_stages?: number;
  progress_pct?: number;
  started_at?: string;
  error?: string | null;
  failed_script?: string | null;
}

export interface ExportEntry {
  filename: string;
  type: string;
  description: string;
  exists: boolean;
  size: number;
}

export interface RunStatus {
  phase: RunPhase;
  source_present: boolean;
  outputs_generated: boolean;
  exports: ExportEntry[];
  plan_name?: string;
  created_at?: string;
  error?: string;
  export_downloaded: boolean;
  export_downloaded_at?: string;
  calibration?: ScaleCalibration;
  exports_generated_at?: string;
  progress?: RunProgress;
  scan_mode?: "fast_scan" | "deep_scan";
}

export type ReexportResult =
  | { status: "started"; pid: number }
  | { status: "execution_not_supported"; message: string; manual_command: string }
  | { status: "not_ready"; reason: string };

// ── Slug helpers ──────────────────────────────────────────────────────────────

function sanitizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function createRunSlug(originalFilename: string): string {
  const base = sanitizeName(path.parse(originalFilename).name) || "plan";
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `ui_${base}_${ts}`;
}

export function sanitizeStoredFilename(original: string): string {
  const ext = path.extname(original).toLowerCase();
  const name = path.parse(original).name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  return `${name}${ext}`;
}

// ── Path safety ───────────────────────────────────────────────────────────────

export function getRunDir(slug: string): string {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(slug)) {
    throw new Error("Invalid run slug");
  }
  const resolved = path.resolve(RUNS_BASE, slug);
  if (!resolved.startsWith(path.resolve(RUNS_BASE) + path.sep)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export function safeExportPath(slug: string, filename: string): string {
  if (!/^[a-zA-Z0-9_.\-]{1,255}$/.test(filename)) {
    throw new Error("Invalid filename");
  }
  if (filename.length > 255) throw new Error("Filename too long");
  const ext = path.extname(filename).toLowerCase();
  if (!EXPORT_WHITELIST.has(ext)) {
    throw new Error("File type not served: " + ext);
  }
  const runDir = getRunDir(slug);
  const exportsDir = path.join(runDir, "outputs", "exports");
  const filePath = path.join(exportsDir, filename);
  if (!filePath.startsWith(exportsDir + path.sep)) {
    throw new Error("Path traversal detected");
  }
  return filePath;
}

// ── Run creation ──────────────────────────────────────────────────────────────

export interface CreateRunOptions {
  slug: string;
  originalFilename: string;
  buffer: Buffer;
  planName: string;
}

export function createRun({ slug, originalFilename, buffer, planName }: CreateRunOptions): {
  runDir: string;
  storedFilename: string;
  sourcePath: string;
} {
  const runDir = getRunDir(slug);
  const subdirs = ["source", "outputs", "artifacts", "logs", "state"];
  for (const sub of subdirs) {
    fs.mkdirSync(path.join(runDir, sub), { recursive: true });
  }

  const storedFilename = sanitizeStoredFilename(originalFilename);
  const sourcePath = path.join(runDir, "source", storedFilename);
  fs.writeFileSync(sourcePath, buffer);

  const checksum = createHash("sha256").update(buffer).digest("hex");
  const planId = crypto.randomUUID();
  const now = new Date().toISOString();

  const planManifest = {
    _warning: "RESEARCH ONLY — not for operational use without human review.",
    plan_id: planId,
    plan_slug: slug,
    plan_name: planName,
    original_filename: originalFilename,
    stored_pdf_path: path.join("runs", slug, "source", storedFilename),
    file_size_bytes: buffer.length,
    file_size_mb: parseFloat((buffer.length / (1024 * 1024)).toFixed(2)),
    checksum_sha256: checksum,
    created_at: now,
    status: "ready_for_pipeline",
    intake_mode: "ui_upload",
    run_dir: runDir,
    subdirs,
    retention_policy: "keep_outputs_only",
    source_storage_status: "present",
  };

  const planConfig = {
    _purpose: "Plan-scoped pipeline configuration.",
    plan_id: planId,
    plan_slug: slug,
    plan_name: planName,
    pdf_path: sourcePath,
    source_pdf_path: sourcePath,
    stored_pdf_path: path.join("runs", slug, "source", storedFilename),
    outputs_dir: path.join(runDir, "outputs"),
    artifacts_dir: path.join(runDir, "artifacts"),
    logs_dir: path.join(runDir, "logs"),
    state_dir: path.join(runDir, "state"),
    retention_policy: "keep_outputs_only",
    storage_status: "temporary",
    created_at: now,
  };

  fs.writeFileSync(path.join(runDir, "plan_manifest.json"), JSON.stringify(planManifest, null, 2));
  fs.writeFileSync(path.join(runDir, "plan_config.json"), JSON.stringify(planConfig, null, 2));

  return { runDir, storedFilename, sourcePath };
}

// ── Status inference ──────────────────────────────────────────────────────────

export function inferRunStatus(slug: string): RunStatus {
  let runDir: string;
  try {
    runDir = getRunDir(slug);
  } catch {
    return { phase: "failed", source_present: false, outputs_generated: false, exports: [], error: "Invalid slug", export_downloaded: false };
  }

  if (!fs.existsSync(runDir)) {
    return { phase: "failed", source_present: false, outputs_generated: false, exports: [], error: "Run directory not found", export_downloaded: false };
  }

  // Plan name from manifest
  let plan_name: string | undefined;
  let created_at: string | undefined;
  const manifestPath = path.join(runDir, "plan_manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      plan_name = m.plan_name;
      created_at = m.created_at;
    } catch {}
  }

  // Source PDF presence
  const sourceDir = path.join(runDir, "source");
  const sourcePdfs = fs.existsSync(sourceDir)
    ? fs.readdirSync(sourceDir).filter((f) => f.toLowerCase().endsWith(".pdf"))
    : [];
  const source_present = sourcePdfs.length > 0;

  // Export manifest = outputs generated
  const exportManifestPath = path.join(runDir, "outputs", "exports", "export_manifest.json");
  const outputs_generated = fs.existsSync(exportManifestPath);

  // Available export files
  const exports: ExportEntry[] = [];
  if (outputs_generated) {
    try {
      const mf = JSON.parse(fs.readFileSync(exportManifestPath, "utf8"));
      for (const ef of mf.export_files ?? []) {
        if (!ef.filename) continue;
        const filePath = path.join(runDir, "outputs", "exports", ef.filename);
        const exists = fs.existsSync(filePath);
        if (ef.generated !== false || exists) {
          exports.push({
            filename: ef.filename,
            type: ef.type ?? "unknown",
            description: ef.description ?? "",
            exists,
            size: exists ? fs.statSync(filePath).size : 0,
          });
        }
      }
    } catch {}
  }

  // Pipeline started marker
  const startedPath = path.join(runDir, "state", "pipeline_started.json");
  const pipelineStarted = fs.existsSync(startedPath);

  // Phase determination
  let phase: RunPhase;
  let progress: RunProgress | undefined;
  let phaseError: string | undefined;
  let scan_mode: "fast_scan" | "deep_scan" | undefined;

  if (!source_present && outputs_generated) {
    phase = "source_deleted";
  } else if (outputs_generated) {
    phase = "outputs_generated";
  } else if (pipelineStarted) {
    try {
      const st = JSON.parse(fs.readFileSync(startedPath, "utf8"));
      const startedAt: string = st.started_at;
      const elapsedMs = Date.now() - new Date(startedAt).getTime();

      // Read real progress from scan_progress.json (written by 34_ui_plan_scan_orchestrator.py)
      const scanProgressPath = path.join(runDir, "state", "scan_progress.json");
      let sp: ScanProgressFile | null = null;
      if (fs.existsSync(scanProgressPath)) {
        try {
          sp = JSON.parse(fs.readFileSync(scanProgressPath, "utf8")) as ScanProgressFile;
        } catch {}
      }

      if (sp?.scan_mode) {
        scan_mode = sp.scan_mode as "fast_scan" | "deep_scan";
      } else if (st.scan_mode) {
        scan_mode = st.scan_mode as "fast_scan" | "deep_scan";
      }

      if (sp?.status === "failed") {
        phase = "failed";
        phaseError = sp.error ?? "הסריקה נכשלה";
      } else if (elapsedMs > 20 * 60 * 1000) {
        phase = "failed";
        phaseError = sp?.error ?? "הסריקה חרגה מהזמן המוקצב (20 דקות)";
      } else {
        phase = "running";
        const elapsedSeconds = Math.floor(elapsedMs / 1000);

        if (sp?.status === "running" && typeof sp.progress_pct === "number") {
          // Real progress from orchestrator
          progress = {
            elapsed_seconds: elapsedSeconds,
            estimated_pct: sp.progress_pct,
            stage_label: sp.current_stage_label ?? "מעבד...",
            started_at: startedAt,
            scan_mode: sp.scan_mode as "fast_scan" | "deep_scan" | undefined,
            current_script: sp.current_script ?? undefined,
            stage_index: sp.current_stage_index,
            total_stages: sp.total_stages,
            completed_count: sp.completed_count,
            is_real_progress: true,
          };
        } else {
          // Fallback: time-based estimate (orchestrator not yet started or progress unreadable)
          const estimated_pct = Math.min(95, Math.round((elapsedSeconds / 900) * 100));
          const stage_label =
            estimated_pct < 10 ? "הכנה" :
            estimated_pct < 25 ? "קריאת PDF וחילוץ וקטורים" :
            estimated_pct < 45 ? "ניתוח אלמנטים גרפיים" :
            estimated_pct < 65 ? "מדידת מרחקים וכמויות" :
            estimated_pct < 80 ? "בניית כמויות" :
            estimated_pct < 92 ? "יצוא ודוחות" :
            "כמעט מוכן...";
          progress = { elapsed_seconds: elapsedSeconds, estimated_pct, stage_label, started_at: startedAt };
        }
      }
    } catch {
      phase = "running";
    }
  } else {
    phase = "intake_created";
  }

  // Export downloaded marker
  const downloadedPath = path.join(runDir, "state", "export_downloaded.json");
  let export_downloaded = false;
  let export_downloaded_at: string | undefined;
  if (fs.existsSync(downloadedPath)) {
    try {
      const d = JSON.parse(fs.readFileSync(downloadedPath, "utf8"));
      export_downloaded = true;
      export_downloaded_at = d.downloaded_at;
    } catch {
      export_downloaded = true;
    }
  }

  // Calibration
  const calibration = readCalibration(slug) ?? undefined;

  // Export manifest generated_at (for reexport polling)
  let exports_generated_at: string | undefined;
  if (outputs_generated) {
    try {
      const mf = JSON.parse(fs.readFileSync(exportManifestPath, "utf8"));
      exports_generated_at = mf.generated_at;
    } catch {}
  }

  return { phase, source_present, outputs_generated, exports, plan_name, created_at, error: phaseError, export_downloaded, export_downloaded_at, calibration, exports_generated_at, progress, scan_mode };
}

// ── Export listing ────────────────────────────────────────────────────────────

export function listExports(slug: string): ExportEntry[] {
  const { exports } = inferRunStatus(slug);
  return exports;
}

// ── Pipeline spawn ────────────────────────────────────────────────────────────

export type StartResult =
  | { status: "started"; pid: number }
  | { status: "already_running_or_done"; phase: RunPhase }
  | { status: "execution_not_supported"; message: string; manual_command: string };

export function startPipeline(slug: string, mode: "fast" | "deep" = "fast"): StartResult {
  const status = inferRunStatus(slug);
  if (status.phase === "running" || status.phase === "outputs_generated" || status.phase === "source_deleted") {
    return { status: "already_running_or_done", phase: status.phase };
  }

  const isVercel = !!process.env.VERCEL;
  const venvExists = fs.existsSync(VENV_PYTHON);
  const runDir = getRunDir(slug);
  const scanMode = mode === "fast" ? "fast_scan" : "deep_scan";
  const manual = `cd research/cad-pdf-intelligence && .venv/bin/python3 34_ui_plan_scan_orchestrator.py --plan-run-dir "${runDir}" --mode ${mode}`;

  if (isVercel || !venvExists) {
    return {
      status: "execution_not_supported",
      message: isVercel
        ? "Pipeline execution is not available in cloud deployments. Run the pipeline locally from the terminal."
        : "Python venv not found. Set up the environment first.",
      manual_command: manual,
    };
  }

  // Write started marker (includes scan_mode so inferRunStatus can read it before scan_progress.json exists)
  const stateDir = path.join(runDir, "state");
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  const startedMarker = { started_at: new Date().toISOString(), run_dir: runDir, trigger: "api", scan_mode: scanMode };
  fs.writeFileSync(path.join(stateDir, "pipeline_started.json"), JSON.stringify(startedMarker, null, 2));

  // Spawn orchestrator — replaces the old `19_ && 33_` command
  const cmd = `"${VENV_PYTHON}" "${ORCHESTRATOR_SCRIPT}" --plan-run-dir "${runDir}" --mode ${mode}`;
  const logPath = path.join(runDir, "logs", "api_run.log");

  // Lazy import to avoid bundling child_process on Vercel paths
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawn } = require("child_process") as typeof import("child_process");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn("bash", ["-c", cmd], {
    detached: true,
    stdio: ["ignore", logStream, logStream],
    cwd: RESEARCH_BASE,
  });

  if (!child.pid) {
    throw new Error("Failed to spawn pipeline process");
  }

  child.unref();

  // Update marker with pid
  fs.writeFileSync(
    path.join(stateDir, "pipeline_started.json"),
    JSON.stringify({ ...startedMarker, pid: child.pid }, null, 2)
  );

  return { status: "started", pid: child.pid };
}

// ── Scale calibration ─────────────────────────────────────────────────────────

export function saveCalibration(slug: string, calibration: ScaleCalibration): void {
  const runDir = getRunDir(slug);
  const stateDir = path.join(runDir, "state");
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, "scale_calibration.json"),
    JSON.stringify(calibration, null, 2)
  );
  const manifestPath = path.join(runDir, "plan_manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      m.scale_calibration_status = "human_calibrated";
      m.scale_calibrated_at = calibration.calibrated_at;
      m.scale_correction_factor = calibration.correction_factor;
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
    } catch {}
  }
}

export function readCalibration(slug: string): ScaleCalibration | null {
  try {
    const runDir = getRunDir(slug);
    const calibPath = path.join(runDir, "state", "scale_calibration.json");
    if (!fs.existsSync(calibPath)) return null;
    return JSON.parse(fs.readFileSync(calibPath, "utf8")) as ScaleCalibration;
  } catch {
    return null;
  }
}

export function patchManifestWithScaleOrigin(slug: string): ScaleOriginResult {
  const runDir = getRunDir(slug);
  const manifestPath = path.join(runDir, "plan_manifest.json");
  if (!fs.existsSync(manifestPath)) return { available: false, reason: "plan_manifest.json not found" };

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return { available: false, reason: "Failed to parse plan_manifest.json" };
  }

  // Idempotent: return cached values if already patched
  if (manifest.original_scale_available === true) {
    return {
      available: true,
      m_per_pt: manifest.scale_m_per_pt_original as number,
      ratio: manifest.scale_ratio_original as number,
      source: manifest.scale_source_original as string,
      status: manifest.scale_status_original as string,
    };
  }
  if (manifest.original_scale_available === false) {
    return { available: false, reason: manifest.original_scale_missing_reason as string };
  }

  // Not yet patched — read from scale_measurement/results.json
  const scalePath = path.join(runDir, "outputs", "scale_measurement", "results.json");

  function writeAndReturn(patch: Record<string, unknown>, result: ScaleOriginResult): ScaleOriginResult {
    try {
      Object.assign(manifest, patch);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    } catch {}
    return result;
  }

  if (!fs.existsSync(scalePath)) {
    const reason = "scale_measurement/results.json not found";
    return writeAndReturn({ original_scale_available: false, original_scale_missing_reason: reason }, { available: false, reason });
  }

  try {
    const s = JSON.parse(fs.readFileSync(scalePath, "utf8")) as Record<string, unknown>;
    const si = ((s.scale_info ?? s) as Record<string, unknown>);
    const ratio = si.ratio as number | undefined;
    const m_per_pt = (si.m_per_pt ?? si.derived_m_per_pt) as number | undefined;
    const source = (si.source as string | undefined) ?? "unknown";
    const calib = si.calibration as Record<string, unknown> | undefined;
    const status = (si.status as string | undefined) ?? (calib?.status as string | undefined) ?? "unverified";

    if (typeof m_per_pt === "number" && m_per_pt > 0) {
      return writeAndReturn({
        original_scale_available: true,
        scale_ratio_original: ratio,
        scale_m_per_pt_original: m_per_pt,
        scale_source_original: source,
        scale_status_original: status,
      }, { available: true, m_per_pt, ratio, source, status });
    }

    const reason = "scale_measurement/results.json has no valid m_per_pt";
    return writeAndReturn({ original_scale_available: false, original_scale_missing_reason: reason }, { available: false, reason });
  } catch (err) {
    const reason = `Failed to parse scale_measurement/results.json: ${err instanceof Error ? err.message : "unknown"}`;
    return writeAndReturn({ original_scale_available: false, original_scale_missing_reason: reason }, { available: false, reason });
  }
}

export function reexportWithCalibration(slug: string): ReexportResult {
  const status = inferRunStatus(slug);
  if (!status.outputs_generated && status.phase !== "source_deleted") {
    return { status: "not_ready", reason: "Pipeline outputs not yet generated" };
  }

  const isVercel = !!process.env.VERCEL;
  const venvExists = fs.existsSync(VENV_PYTHON);
  const runDir = getRunDir(slug);
  const manual = `cd research/cad-pdf-intelligence && .venv/bin/python3 33_worker_operations_export.py --plan-run-dir "${runDir}"`;

  if (isVercel || !venvExists) {
    return {
      status: "execution_not_supported",
      message: isVercel
        ? "Re-export not available in cloud deployments. Run the export script locally."
        : "Python venv not found. Set up the environment first.",
      manual_command: manual,
    };
  }

  const logPath = path.join(runDir, "logs", "reexport.log");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawn } = require("child_process") as typeof import("child_process");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn(
    VENV_PYTHON,
    [EXPORT_SCRIPT, "--plan-run-dir", runDir],
    { detached: true, stdio: ["ignore", logStream, logStream], cwd: RESEARCH_BASE }
  );

  if (!child.pid) throw new Error("Failed to spawn re-export process");
  child.unref();

  return { status: "started", pid: child.pid };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export function cleanupSourcePdf(slug: string): boolean {
  const runDir = getRunDir(slug);
  const sourceDir = path.join(runDir, "source");

  if (!fs.existsSync(sourceDir)) return false;

  const pdfs = fs.readdirSync(sourceDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  for (const f of pdfs) {
    fs.unlinkSync(path.join(sourceDir, f));
  }

  // Update manifest
  const manifestPath = path.join(runDir, "plan_manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      m.status = "source_deleted";
      m.source_storage_status = "deleted";
      m.source_deleted_at = new Date().toISOString();
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
    } catch {}
  }

  return true;
}

// ── Export downloaded marker ──────────────────────────────────────────────────

export function markExportDownloaded(slug: string, filename: string): void {
  try {
    const runDir = getRunDir(slug);
    const stateDir = path.join(runDir, "state");
    if (!fs.existsSync(stateDir)) return;
    const marker = {
      downloaded_at: new Date().toISOString(),
      filename,
    };
    fs.writeFileSync(path.join(stateDir, "export_downloaded.json"), JSON.stringify(marker, null, 2));
  } catch {}
}

// ── Slug extraction (for RUNS_BASE / slug_list) ───────────────────────────────

export { ORCHESTRATOR_SCRIPT, PIPELINE_SCRIPT, EXPORT_SCRIPT, RESEARCH_BASE, SLUG_MAX_LEN };
