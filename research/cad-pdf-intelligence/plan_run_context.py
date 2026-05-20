#!/usr/bin/env python3
"""
plan_run_context.py
Shared context helper for plan-scoped pipeline runs.

Two modes:
  legacy      — no --plan-run-dir provided; paths resolve to SCRIPT_DIR/outputs/
                source PDF defaults to the hardcoded research path
  plan-scoped — --plan-run-dir provided; paths resolve under runs/<plan_slug>/
                source PDF located in source/ subdirectory or from plan_config.json

Usage:
    import argparse
    from plan_run_context import PlanRunContext

    parser = argparse.ArgumentParser()
    parser.add_argument('--plan-run-dir', default=None,
                        help='Path to a plan-scoped run directory (created by 31_upload_intake_wrapper.py)')
    args = parser.parse_args()
    ctx = PlanRunContext.from_args(args, script_dir=SCRIPT_DIR)

    out_dir   = ctx.outputs_dir   # write all outputs here
    state_dir = ctx.state_dir     # write local state here
    pdf_path  = ctx.source_pdf_path
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# Default hardcoded PDF path — used in legacy mode only
_LEGACY_PDF_PATH = Path('/Users/eliozedri/Downloads/50-448-02-400.pdf')


@dataclass
class PlanRunContext:
    """
    Resolved path context for a single pipeline run.

    Do not construct directly — use PlanRunContext.from_args().
    """
    plan_run_dir: Optional[Path]
    script_dir: Path

    _plan_id: str          = field(default='PLAN-001',        repr=False)
    _run_id: str           = field(default='RUN-001',         repr=False)
    _source_pdf: Optional[str] = field(default=None,          repr=False)
    _retention_policy: str = field(default='keep_outputs_only', repr=False)
    _storage_status: str   = field(default='temporary',       repr=False)

    # ── Mode ────────────────────────────────────────────────────────────────────

    @property
    def is_legacy(self) -> bool:
        return self.plan_run_dir is None

    @property
    def is_plan_scoped(self) -> bool:
        return self.plan_run_dir is not None

    # ── Directory properties ────────────────────────────────────────────────────

    @property
    def outputs_dir(self) -> Path:
        """Where pipeline output JSON/HTML/MD files should be written."""
        if self.is_legacy:
            return self.script_dir / 'outputs'
        return self.plan_run_dir / 'outputs'

    @property
    def artifacts_dir(self) -> Path:
        """Where large/binary artifacts (crops, overlays) should be written."""
        if self.is_legacy:
            return self.script_dir / 'outputs'  # legacy: no separate artifacts dir
        return self.plan_run_dir / 'artifacts'

    @property
    def logs_dir(self) -> Path:
        if self.is_legacy:
            return self.script_dir / 'outputs'
        return self.plan_run_dir / 'logs'

    @property
    def state_dir(self) -> Path:
        """Where local JSON state (S17) files should be written."""
        if self.is_legacy:
            return self.script_dir / 'outputs' / 'local_state'
        return self.plan_run_dir / 'state'

    @property
    def source_dir(self) -> Path:
        """Where source PDF is stored in plan-scoped mode."""
        if self.is_legacy:
            return self.script_dir
        return self.plan_run_dir / 'source'

    # ── File properties ─────────────────────────────────────────────────────────

    @property
    def plan_manifest_path(self) -> Optional[Path]:
        if self.is_legacy:
            return None
        return self.plan_run_dir / 'plan_manifest.json'

    @property
    def plan_config_path(self) -> Optional[Path]:
        if self.is_legacy:
            return None
        return self.plan_run_dir / 'plan_config.json'

    @property
    def source_pdf_path(self) -> Optional[Path]:
        """Resolved path to the source PDF file."""
        if self._source_pdf:
            return Path(self._source_pdf)
        if self.is_plan_scoped:
            candidates = sorted((self.plan_run_dir / 'source').glob('*.pdf'))
            return candidates[0] if candidates else None
        return _LEGACY_PDF_PATH

    # ── Retention properties ────────────────────────────────────────────────────

    @property
    def retention_policy(self) -> str:
        """
        One of: ephemeral_scan_only, keep_outputs_only (default),
        keep_source_until_export, keep_source_for_project_archive,
        manual_delete_after_scan
        """
        return self._retention_policy

    @property
    def storage_status(self) -> str:
        """One of: temporary, retained, deleted, export_only"""
        return self._storage_status

    @property
    def source_file_lifecycle(self) -> str:
        """Human-readable summary of the source file retention state."""
        if self.is_legacy:
            return 'legacy-mode: source file managed outside the run directory'
        return f'retention={self._retention_policy}, status={self._storage_status}'

    # ── IDs ─────────────────────────────────────────────────────────────────────

    @property
    def plan_id(self) -> str:
        return self._plan_id

    @property
    def run_id(self) -> str:
        return self._run_id

    # ── Factory ─────────────────────────────────────────────────────────────────

    @classmethod
    def from_args(cls, args, script_dir: Optional[Path] = None) -> 'PlanRunContext':
        """
        Build context from a parsed argparse Namespace.

        args must expose: args.plan_run_dir (str | None)
        Add to your parser: parser.add_argument('--plan-run-dir', default=None)
        """
        sd = script_dir or Path(__file__).parent
        raw = getattr(args, 'plan_run_dir', None)
        prd = Path(raw).resolve() if raw else None

        if prd is None:
            return cls(plan_run_dir=None, script_dir=sd)

        plan_id   = 'PLAN-001'
        run_id    = 'RUN-001'
        source_pdf_str: Optional[str] = None
        retention = 'keep_outputs_only'
        status    = 'temporary'

        cfg_path = prd / 'plan_config.json'
        if cfg_path.exists():
            try:
                cfg = json.loads(cfg_path.read_text(encoding='utf-8'))
                plan_id        = cfg.get('plan_id', plan_id)
                run_id         = cfg.get('run_id', run_id)
                source_pdf_str = cfg.get('source_pdf_path') or cfg.get('source_pdf')
                retention      = cfg.get('retention_policy', retention)
                status         = cfg.get('storage_status', status)
            except Exception:
                pass  # malformed config — fall through to defaults

        ctx = cls(plan_run_dir=prd, script_dir=sd)
        ctx._plan_id          = plan_id
        ctx._run_id           = run_id
        ctx._source_pdf       = source_pdf_str
        ctx._retention_policy = retention
        ctx._storage_status   = status
        return ctx

    # ── Utility ─────────────────────────────────────────────────────────────────

    def describe(self) -> str:
        mode = 'plan-scoped' if self.is_plan_scoped else 'legacy'
        lines = [
            f'PlanRunContext [{mode}]',
            f'  outputs_dir        : {self.outputs_dir}',
            f'  state_dir          : {self.state_dir}',
            f'  source_pdf_path    : {self.source_pdf_path}',
        ]
        if self.is_plan_scoped:
            lines += [
                f'  plan_id            : {self._plan_id}',
                f'  run_id             : {self._run_id}',
                f'  retention_policy   : {self._retention_policy}',
                f'  storage_status     : {self._storage_status}',
                f'  plan_manifest      : {self.plan_manifest_path}',
                f'  plan_config        : {self.plan_config_path}',
            ]
        return '\n'.join(lines)

    def ensure_dirs(self) -> None:
        """Create all run-directory subdirs if in plan-scoped mode."""
        for d in [self.outputs_dir, self.state_dir]:
            d.mkdir(parents=True, exist_ok=True)
        if self.is_plan_scoped:
            for d in [self.artifacts_dir, self.logs_dir, self.source_dir]:
                d.mkdir(parents=True, exist_ok=True)
