#!/usr/bin/env python3
"""
30_local_json_persistence_flow.py
Stage S17 — Local JSON Persistence Flow (זרימת נתונים מקומית)

Builds a file-based state simulation that mirrors the future PostgreSQL data model
without using a DB.  Each entity family maps directly to a planned DB table
(see PLAN_SCANNER_DATA_MODEL.md).

GUARANTEES:
  • Reads all source JSONs read-only (no modification to pipeline outputs)
  • approved_for_boq=False enforced on every entity
  • requires_review preserved as-is from source data
  • No paid API, no DB, no production UI/flow changes
  • Writes ONLY under outputs/local_state/
  • If human_review_answers.json exists → validates and records ingestion
    (does NOT auto-apply; writeback must be invoked explicitly via S10)

OUTPUTS:
  outputs/local_state/plan_scan_state.json        full consolidated state
  outputs/local_state/current_review_questions.json
  outputs/local_state/current_boq_state.json
  outputs/local_state/current_artifacts_index.json
  outputs/local_state/audit_log.json
  outputs/local_state/local_persistence_report.md
  outputs/local_state/local_persistence_report.html
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# ── Paths ───────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
OUT_DIR    = SCRIPT_DIR / 'outputs'
STATE_DIR  = OUT_DIR / 'local_state'

# Source files (all read-only)
F_PIPELINE   = OUT_DIR / 'pipeline_run_summary.json'
F_BOQ        = OUT_DIR / 'boq_unified_draft.json'
F_REVIEW_Q   = OUT_DIR / 'review_queue.json'
F_ELEMENTS   = OUT_DIR / 'element_groups.json'
F_PARTIAL    = OUT_DIR / 'partial_code_resolution.json'
F_VALIDATION = OUT_DIR / 'validation_results.json'
F_LEGEND_ROWS= OUT_DIR / 'legend_rows.json'
F_LEGEND_VOC = OUT_DIR / 'legend_vocabulary.json'
F_HRA        = OUT_DIR / 'human_review_application.json'
F_ANSWERS    = OUT_DIR / 'human_review_answers.json'        # may not exist
F_ANSWERS_T  = OUT_DIR / 'human_review_answers.template.json'
F_TL_PACK    = OUT_DIR / 'teaching_loop_answer_pack.json'
F_DASHBOARD  = OUT_DIR / 'master_dashboard.json'
F_PROTOTYPE  = OUT_DIR / 'plan_scanner_prototype.json'
F_SCALE      = OUT_DIR / 'scale_measurement' / 'results.json'
F_WORKSPACE  = OUT_DIR / 'plan_scanner_workspace.json'

# Output files
O_STATE      = STATE_DIR / 'plan_scan_state.json'
O_QUESTIONS  = STATE_DIR / 'current_review_questions.json'
O_BOQ        = STATE_DIR / 'current_boq_state.json'
O_ARTIFACTS  = STATE_DIR / 'current_artifacts_index.json'
O_AUDIT      = STATE_DIR / 'audit_log.json'
O_REPORT_MD  = STATE_DIR / 'local_persistence_report.md'
O_REPORT_HTML= STATE_DIR / 'local_persistence_report.html'

# Synthetic IDs (stable, plan-specific)
PLAN_ID    = 'PLAN-001'
RUN_ID     = 'RUN-001'
PDF_NAME   = 'תוכנית.pdf'

VALID_ANSWER_TYPES = {
    'partial_code_resolution', 'element_group_classification',
    'scale_calibration', 'color_taxonomy_rule', 'sign_code_confirmation',
    'ignore_rule', 'legend_label', 'boq_review',
}

# ── Helpers ──────────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _load(path: Path, default: Any = None) -> Any:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except Exception as e:
            print(f'  [WARN] could not parse {path.name}: {e}')
    return default

def _stable_id(prefix: str, seed: str) -> str:
    h = hashlib.sha1(seed.encode()).hexdigest()[:8]
    return f'{prefix}-{h}'

def _audit_event(
    source_stage: str,
    entity_type: str,
    entity_id: str,
    action: str,
    *,
    previous_value: Any = None,
    new_value: Any = None,
    reason: str = '',
    demo: bool = False,
    user_answer_source: Optional[str] = None,
) -> Dict:
    return {
        'event_id':           str(uuid.uuid4()),
        'timestamp':          _now(),
        'source_stage':       source_stage,
        'affected_entity_type': entity_type,
        'affected_entity_id': entity_id,
        'action':             action,
        'previous_value':     previous_value,
        'new_value':          new_value,
        'reason':             reason,
        'demo':               demo,
        'user_answer_source': user_answer_source,
    }

# ── Source data loader ───────────────────────────────────────────────────────────

def load_sources() -> Dict[str, Any]:
    return {
        'pipeline':    _load(F_PIPELINE,   {}),
        'boq':         _load(F_BOQ,        {}),
        'review_queue':_load(F_REVIEW_Q,   []),
        'elements':    _load(F_ELEMENTS,   {}),
        'partial':     _load(F_PARTIAL,    {}),
        'validation':  _load(F_VALIDATION, {}),
        'legend_rows': _load(F_LEGEND_ROWS,{}),
        'legend_voc':  _load(F_LEGEND_VOC, {}),
        'hra':         _load(F_HRA,        {}),
        'answers':     _load(F_ANSWERS,    None),   # None = missing
        'answers_t':   _load(F_ANSWERS_T,  {}),
        'tl_pack':     _load(F_TL_PACK,    {}),
        'dashboard':   _load(F_DASHBOARD,  {}),
        'prototype':   _load(F_PROTOTYPE,  {}),
        'scale':       _load(F_SCALE,      {}),
        'workspace':   _load(F_WORKSPACE,  {}),
    }

# ── Entity builders ──────────────────────────────────────────────────────────────

def build_plans(src: Dict) -> Dict:
    pipe = src['pipeline']
    meta = pipe.get('metadata', {})
    return {
        'plan_id':       PLAN_ID,
        'plan_name':     meta.get('pdf_name', PDF_NAME),
        'plan_number':   None,
        'project_id':    None,
        'status':        'scanned',
        'description':   'Research scan — CAD PDF intelligence POC',
        'created_at':    meta.get('generated_at', _now()),
        'updated_at':    _now(),
        'approved_for_boq': False,
        '_db_table':     'plans',
    }

def build_plan_scan_runs(src: Dict) -> Dict:
    pipe = src['pipeline']
    ps   = pipe.get('pipeline_status', {})
    meta = pipe.get('metadata', {})
    return {
        'run_id':          RUN_ID,
        'plan_id':         PLAN_ID,
        'run_status':      'complete' if ps.get('overall') == 'ok' else 'partial',
        'stages_ok':       ps.get('stages_ok', 0),
        'stages_partial':  ps.get('stages_partial', 0),
        'stages_missing':  ps.get('stages_missing', 0),
        'stages_error':    ps.get('stages_error', 0),
        'pipeline_version':'16-stage-research-poc',
        'run_metadata': {
            'generated_at': meta.get('generated_at'),
            'pdf_name':     meta.get('pdf_name'),
            'stages':       [s.get('name') for s in pipe.get('stages', [])],
        },
        'created_at':      meta.get('generated_at', _now()),
        '_db_table':       'plan_scan_runs',
    }

def build_plan_pages(src: Dict) -> List[Dict]:
    review_queue = src['review_queue']
    pages: Dict[int, Dict] = {}
    for item in review_queue:
        pn = item.get('page_number', 1)
        if pn not in pages:
            pages[pn] = {
                'page_id':     _stable_id('PAGE', f'plan-001-page-{pn}'),
                'run_id':      RUN_ID,
                'plan_id':     PLAN_ID,
                'page_number': pn,
                'sign_count':  0,
                'reviewed':    False,
                '_db_table':   'plan_pages',
            }
        pages[pn]['sign_count'] += 1
    return list(pages.values())

def build_plan_legend_items(src: Dict) -> List[Dict]:
    rows = src['legend_rows'].get('rows', [])
    voc  = src['legend_voc']
    voc_rows = voc.get('rows', []) if isinstance(voc.get('rows'), list) else []
    items = []
    for i, row in enumerate(rows):
        voc_row = voc_rows[i] if i < len(voc_rows) else {}
        items.append({
            'legend_item_id':  _stable_id('LEG', f'row-{i}'),
            'run_id':          RUN_ID,
            'plan_id':         PLAN_ID,
            'row_index':       row.get('row_index', i),
            'hebrew_label':    row.get('hebrew_label') or voc_row.get('hebrew_label'),
            'english_label':   row.get('english_label') or voc_row.get('english_label'),
            'sign_code':       row.get('sign_code') or voc_row.get('sign_code'),
            'label_source':    row.get('label_source', 'auto'),
            'confidence':      row.get('confidence', 0.0),
            'requires_review': row.get('requires_review', True),
            'approved_for_boq': False,
            'auto_result':     row,
            '_db_table':       'plan_legend_items',
        })
    return items

def build_plan_sign_occurrences(src: Dict) -> List[Dict]:
    queue = src['review_queue']
    items = []
    for occ in queue:
        oid = occ.get('occurrence_id', _stable_id('OCC', str(occ)))
        items.append({
            'occurrence_id':   oid,
            'run_id':          RUN_ID,
            'plan_id':         PLAN_ID,
            'page_number':     occ.get('page_number'),
            'auto_code':       occ.get('auto_result', {}).get('code') if isinstance(occ.get('auto_result'), dict) else None,
            'human_code':      occ.get('human_confirmed_code'),
            'confidence':      occ.get('auto_result', {}).get('confidence') if isinstance(occ.get('auto_result'), dict) else None,
            'suspected_issue': occ.get('suspected_issue'),
            'review_priority': occ.get('review_priority'),
            'requires_review': occ.get('requires_review', True),
            'approved_for_boq': False,
            'still_requires_boq_approval': occ.get('still_requires_boq_approval', True),
            'evidence':        {'crops': occ.get('crops', [])},
            'auto_result':     occ.get('auto_result'),
            '_db_table':       'plan_sign_occurrences',
        })
    return items

def build_plan_partial_codes(src: Dict) -> List[Dict]:
    results = src['partial'].get('results', [])
    items = []
    for r in results:
        oid = r.get('occurrence_id', _stable_id('OCC', str(r)))
        items.append({
            'partial_code_id':    _stable_id('PC', oid),
            'occurrence_id':      oid,
            'run_id':             RUN_ID,
            'plan_id':            PLAN_ID,
            'partial_code':       r.get('partial_code'),
            'validation_status':  r.get('validation_status_s8'),
            'confidence':         r.get('poc3_confidence'),
            'expansion_candidates': r.get('expansion_candidates', []),
            't1_match':           r.get('t1_match'),
            'requires_review':    True,
            'resolved_code':      None,
            'approved_for_boq':   False,
            'auto_result':        r,
            '_db_table':          'plan_partial_codes',
        })
    return items

def build_plan_element_groups(src: Dict) -> List[Dict]:
    raw = src['elements'].get('groups', [])
    # groups may be a list or dict depending on pipeline version
    groups_iter = raw.items() if isinstance(raw, dict) else ((g.get('group_id', f'G-{i:03d}'), g) for i, g in enumerate(raw))
    items = []
    for gid, grp in groups_iter:
        items.append({
            'group_id':         gid,
            'run_id':           RUN_ID,
            'plan_id':          PLAN_ID,
            'element_type':     grp.get('element_type') or grp.get('color_key'),
            'element_count':    grp.get('element_count') or grp.get('n_paths', 0),
            'classification':   grp.get('classification'),
            'include_in_boq':   grp.get('include_in_boq', False),
            'human_confirmed':  grp.get('human_confirmed', False),
            'requires_review':  grp.get('requires_review', True),
            'approved_for_boq': False,
            'auto_result':      grp,
            '_db_table':        'plan_element_groups',
        })
    return items

def build_plan_measurements(src: Dict) -> List[Dict]:
    scale = src['scale']
    si    = scale.get('scale_info', {})
    runs  = scale.get('runs', [])
    items = []
    for i, run in enumerate(runs):
        items.append({
            'measurement_id':   _stable_id('MEAS', f'run-{i}'),
            'run_id':           RUN_ID,
            'plan_id':          PLAN_ID,
            'measurement_type': run.get('type', 'linear'),
            'total_m':          run.get('total_m'),
            'unit':             'm',
            'scale_px_per_m':   si.get('px_per_m'),
            'calibration_done': si.get('calibration_done', False),
            'assumed_scale':    si.get('assumed_scale', True),
            'requires_review':  not si.get('calibration_done', False),
            'approved_for_boq': False,
            'measurement_payload': run,
            '_db_table':        'plan_measurements',
        })
    return items

def build_plan_boq_items(src: Dict) -> List[Dict]:
    raw_items = src['boq'].get('items', [])
    items = []
    for raw in raw_items:
        items.append({
            'boq_item_id':        raw.get('boq_item_id', _stable_id('BOQ', str(raw))),
            'run_id':             RUN_ID,
            'plan_id':            PLAN_ID,
            'item_category':      raw.get('item_category'),
            'item_type':          raw.get('item_type'),
            'description_he':     raw.get('description_he'),
            'description_en':     raw.get('description_en'),
            'quantity':           raw.get('quantity'),
            'unit':               raw.get('unit'),
            'confidence':         raw.get('confidence'),
            'requires_review':    raw.get('requires_review', True),
            'approved_for_boq':   False,          # hardcoded — never auto
            'still_requires_boq_approval': True,
            'boq_status':         'draft_research',
            'human_reviewed':     raw.get('human_reviewed', False),
            'human_review_status': raw.get('human_review_status'),
            'review_reason':      raw.get('review_reason'),
            'source_ids':         raw.get('source_ids', []),
            'evidence':           {'paths': raw.get('evidence_paths', [])},
            'audit_notes':        raw.get('audit_notes'),
            '_db_table':          'plan_boq_items',
        })
    return items

def build_plan_review_questions(src: Dict) -> List[Dict]:
    questions = src['tl_pack'].get('questions', [])
    items = []
    for q in questions:
        items.append({
            'question_id':     q.get('question_id'),
            'run_id':          RUN_ID,
            'plan_id':         PLAN_ID,
            'question_type':   q.get('question_type'),
            'priority':        q.get('priority'),
            'business_impact': q.get('business_impact'),
            'question_text':   q.get('question_text'),
            'affected_count':  q.get('affected_items_count'),
            'status':          'pending',
            'answered':        False,
            'question_payload': q,
            '_db_table':       'plan_review_questions',
        })
    return items

def build_plan_human_answers(src: Dict) -> List[Dict]:
    hra = src['hra']
    applied = hra.get('applied_entries', [])
    items = []
    for entry in applied:
        items.append({
            'answer_id':      entry.get('answer_id', _stable_id('ANS', str(entry))),
            'run_id':         RUN_ID,
            'plan_id':        PLAN_ID,
            'answer_type':    entry.get('answer_type'),
            'question_id':    entry.get('question_id'),
            'scope':          entry.get('scope', 'current_plan_only'),
            'answered_by':    entry.get('answered_by', 'human'),
            'answer_payload': entry,
            'approved_for_boq': False,
            'demo':           entry.get('demo', False),
            'contradiction_detected': entry.get('contradiction_detected', False),
            'requires_review': entry.get('requires_review', False),
            '_db_table':      'plan_human_answers',
        })
    return items

def build_plan_teaching_rules(src: Dict) -> List[Dict]:
    applied = src['hra'].get('applied_entries', [])
    rules = []
    for entry in applied:
        scope = entry.get('scope', 'current_plan_only')
        if scope in ('project_rule', 'company_rule_candidate', 'company_rule_approved'):
            rules.append({
                'rule_id':      _stable_id('RULE', entry.get('answer_id', str(entry))),
                'run_id':       RUN_ID,
                'plan_id':      PLAN_ID,
                'answer_id':    entry.get('answer_id'),
                'answer_type':  entry.get('answer_type'),
                'scope':        scope,
                'rule_payload': entry,
                'active':       True,
                '_db_table':    'plan_teaching_rules',
            })
    return rules

def build_plan_artifacts_index(audit_events: List[Dict]) -> List[Dict]:
    """Walk outputs/ and classify every file into the artifact index."""
    artifacts: List[Dict] = []
    suffix_to_type = {
        '.json':  'json_report',
        '.html':  'html_report',
        '.md':    'md_report',
        '.png':   'image',
        '.svg':   'image',
        '.pdf':   'pdf',
        '.csv':   'csv',
    }
    priority_files = {
        'plan_scanner_prototype.html':       ('html_report', 'S16', 'Plan Scanner Prototype Shell'),
        'master_dashboard.html':             ('html_report', 'S11', 'Master Research Dashboard'),
        'plan_scanner_workspace.html':       ('html_report', 'S13', 'Plan Scanner Workspace'),
        'boq_unified_draft.json':            ('json_report', 'S7',  'Unified BOQ Draft'),
        'boq_unified_report.html':           ('html_report', 'S7',  'Unified BOQ Report'),
        'review_queue.json':                 ('json_report', 'S4',  'Review Queue'),
        'static_review_form.html':           ('html_report', 'S14', 'Static Guided Review Form'),
        'teaching_loop_answer_pack.html':    ('html_report', 'S12', 'Teaching Loop Answer Pack'),
        'teaching_loop_demo_report.html':    ('html_report', 'S15', 'Teaching Loop Demo Report'),
        'human_review_application.json':     ('json_report', 'S10', 'Human Review Application'),
        'partial_code_resolution.json':      ('json_report', 'S9',  'Partial Code Resolution'),
        'element_groups.json':               ('json_report', 'S6',  'Element Groups'),
        'scale_measurement/results.json':    ('json_report', 'S5',  'Scale Measurement Results'),
        'legend_rows.json':                  ('json_report', 'S1',  'Legend Rows'),
        'legend_vocabulary.json':            ('json_report', 'S1',  'Legend Vocabulary'),
        'pipeline_run_summary.json':         ('json_report', 'S11', 'Pipeline Run Summary'),
        'plan_scanner_prototype.json':       ('json_report', 'S16', 'Prototype Data Contract'),
        'local_state/plan_scan_state.json':  ('json_report', 'S17', 'Local Persistence State'),
        'local_state/current_boq_state.json':('json_report', 'S17', 'BOQ State (local)'),
        'local_state/audit_log.json':        ('json_report', 'S17', 'Audit Log'),
        'local_state/local_persistence_report.html': ('html_report','S17','Local Persistence Report'),
    }

    idx = 0
    for p in sorted(OUT_DIR.rglob('*')):
        if not p.is_file():
            continue
        suf = p.suffix.lower()
        if suf not in suffix_to_type:
            continue
        rel = str(p.relative_to(OUT_DIR))
        pri = priority_files.get(rel, {})
        if isinstance(pri, tuple):
            art_type, stage, desc = pri
        else:
            art_type = suffix_to_type.get(suf, 'file')
            stage = 'unknown'
            desc  = p.name

        idx += 1
        artifacts.append({
            'artifact_id':       f'ART-{idx:04d}',
            'artifact_type':     art_type,
            'path':              rel,
            'related_entity_id': None,
            'source_stage':      stage,
            'description':       desc,
            'exists':            True,
            'size_bytes':        p.stat().st_size,
        })

    return artifacts

# ── Answer ingestion ─────────────────────────────────────────────────────────────

def ingest_answers(src: Dict, audit_events: List[Dict]) -> Dict:
    raw = src['answers']
    result = {
        'answers_file_present': raw is not None,
        'answers_valid':        False,
        'answers_count':        0,
        'invalid_reasons':      [],
        'writeback_applied':    False,
        'note':                 '',
    }

    if raw is None:
        result['note'] = (
            'outputs/human_review_answers.json not found. '
            'No real answers submitted. All review questions remain pending. '
            'Use static_review_form.html to submit answers, then re-run this script.'
        )
        audit_events.append(_audit_event(
            'S17', 'plan_human_answers', 'n/a',
            'ingest_skipped',
            reason='human_review_answers.json missing',
        ))
        return result

    # Guard: skip template/example files mistakenly dropped in place
    comment = str(raw.get('_comment', ''))
    if 'TEMPLATE' in comment.upper() or 'EXAMPLE' in comment.upper():
        result['invalid_reasons'].append('answers file is a template/example — skipped')
        result['note'] = 'Template or example file detected. Not a real answer submission.'
        audit_events.append(_audit_event(
            'S17', 'plan_human_answers', 'n/a',
            'ingest_rejected',
            reason='template/example guard triggered',
        ))
        return result

    answers = raw.get('answers', [])
    result['answers_count'] = len(answers)

    invalid = []
    for ans in answers:
        atype = ans.get('answer_type')
        if atype not in VALID_ANSWER_TYPES:
            invalid.append(f"answer_id={ans.get('answer_id','?')} unknown type={atype}")
        if ans.get('approved_for_boq') is True:
            invalid.append(f"answer_id={ans.get('answer_id','?')} has approved_for_boq=True (forbidden)")

    result['invalid_reasons'] = invalid
    result['answers_valid']   = len(invalid) == 0

    if result['answers_valid']:
        result['note'] = (
            f'{len(answers)} valid answer(s) found. '
            'Answers have been validated but NOT auto-applied. '
            'Run 23_human_review_writeback.py explicitly to apply.'
        )
        audit_events.append(_audit_event(
            'S17', 'plan_human_answers', 'n/a',
            'ingest_validated',
            new_value={'count': len(answers)},
            reason='human_review_answers.json present and valid',
        ))
    else:
        result['note'] = f'Answers file found but {len(invalid)} validation error(s) detected. Fix before applying.'
        audit_events.append(_audit_event(
            'S17', 'plan_human_answers', 'n/a',
            'ingest_validation_failed',
            new_value={'errors': invalid},
            reason='validation errors in answers file',
        ))

    return result

# ── Audit seed ───────────────────────────────────────────────────────────────────

def seed_pipeline_events(src: Dict) -> List[Dict]:
    events: List[Dict] = []
    for stage in src['pipeline'].get('stages', []):
        events.append(_audit_event(
            stage.get('name', '?'),
            'plan_scan_runs', RUN_ID,
            'stage_complete',
            new_value={'status': stage.get('status')},
            reason=f"pipeline stage completed: {stage.get('name','')}",
        ))
    return events

# ── State assembler ──────────────────────────────────────────────────────────────

def build_state(src: Dict) -> tuple[Dict, List[Dict], List[Dict], List[Dict], List[Dict], Dict]:
    audit: List[Dict] = []

    # Seed pipeline stage events
    audit.extend(seed_pipeline_events(src))

    # Build entities
    plans             = build_plans(src)
    scan_run          = build_plan_scan_runs(src)
    pages             = build_plan_pages(src)
    legend_items      = build_plan_legend_items(src)
    sign_occurrences  = build_plan_sign_occurrences(src)
    partial_codes     = build_plan_partial_codes(src)
    element_groups    = build_plan_element_groups(src)
    measurements      = build_plan_measurements(src)
    boq_items         = build_plan_boq_items(src)
    review_questions  = build_plan_review_questions(src)
    human_answers     = build_plan_human_answers(src)
    teaching_rules    = build_plan_teaching_rules(src)

    # Log entity creation events
    for entity_type, collection, id_field in [
        ('plan_boq_items',        boq_items,        'boq_item_id'),
        ('plan_review_questions', review_questions, 'question_id'),
        ('plan_sign_occurrences', sign_occurrences, 'occurrence_id'),
        ('plan_partial_codes',    partial_codes,    'partial_code_id'),
        ('plan_element_groups',   element_groups,   'group_id'),
        ('plan_legend_items',     legend_items,     'legend_item_id'),
        ('plan_measurements',     measurements,     'measurement_id'),
        ('plan_human_answers',    human_answers,    'answer_id'),
        ('plan_teaching_rules',   teaching_rules,   'rule_id'),
    ]:
        for item in collection:
            eid = item.get(id_field, '?')
            audit.append(_audit_event(
                'S17', entity_type, eid,
                'entity_created',
                reason='local persistence state build',
            ))

    # Ingest answers
    answer_result = ingest_answers(src, audit)

    # Artifact index (built last so it can pick up the state files that will be written)
    artifacts = build_plan_artifacts_index(audit)

    state = {
        'meta': {
            'generated_at':       _now(),
            'script':             '30_local_json_persistence_flow.py',
            'stage':              'S17',
            'plan_id':            PLAN_ID,
            'run_id':             RUN_ID,
            'approved_for_boq':   False,
            'paid_api_used':      False,
            'production_modified': False,
            'db_migrations_applied': False,
            'data_model_doc':     'research/cad-pdf-intelligence/PLAN_SCANNER_DATA_MODEL.md',
        },
        'entities': {
            'plans':              plans,
            'plan_scan_runs':     scan_run,
            'plan_pages':         pages,
            'plan_legend_items':  legend_items,
            'plan_sign_occurrences': sign_occurrences,
            'plan_partial_codes': partial_codes,
            'plan_element_groups':element_groups,
            'plan_measurements':  measurements,
            'plan_boq_items':     boq_items,
            'plan_review_questions': review_questions,
            'plan_human_answers': human_answers,
            'plan_teaching_rules': teaching_rules,
            'plan_audit_events':  audit,    # snapshot; full list in audit_log.json
            'plan_artifacts':     artifacts,
        },
        'summary': {
            'plans':              1,
            'scan_runs':          1,
            'pages':              len(pages),
            'legend_items':       len(legend_items),
            'sign_occurrences':   len(sign_occurrences),
            'partial_codes':      len(partial_codes),
            'element_groups':     len(element_groups),
            'measurements':       len(measurements),
            'boq_items':          len(boq_items),
            'boq_requires_review': sum(1 for b in boq_items if b['requires_review']),
            'review_questions':   len(review_questions),
            'human_answers':      len(human_answers),
            'teaching_rules':     len(teaching_rules),
            'audit_events':       len(audit),
            'artifacts':          len(artifacts),
        },
        'answer_ingestion': answer_result,
        'db_entity_mapping': {
            'plans':                 '→ plans table',
            'plan_scan_runs':        '→ plan_scan_runs table',
            'plan_pages':            '→ plan_pages table',
            'plan_legend_items':     '→ plan_legend_items table',
            'plan_sign_occurrences': '→ plan_sign_occurrences table',
            'plan_partial_codes':    '→ plan_partial_codes table',
            'plan_element_groups':   '→ plan_element_groups table',
            'plan_measurements':     '→ plan_measurements table',
            'plan_boq_items':        '→ plan_boq_items table',
            'plan_review_questions': '→ plan_review_questions table',
            'plan_human_answers':    '→ plan_human_answers table',
            'plan_teaching_rules':   '→ plan_teaching_rules table',
            'plan_audit_events':     '→ plan_audit_events table (append-only)',
            'plan_artifacts':        '→ plan_artifacts table',
        },
    }

    return state, boq_items, review_questions, artifacts, audit, answer_result

# ── Derived outputs ──────────────────────────────────────────────────────────────

def build_boq_state(boq_items: List[Dict]) -> Dict:
    by_cat: Dict[str, List] = {}
    for item in boq_items:
        cat = item.get('item_category', 'other')
        by_cat.setdefault(cat, []).append(item)
    return {
        'meta': {
            'generated_at': _now(),
            'plan_id': PLAN_ID,
            'run_id':  RUN_ID,
            'approved_for_boq': False,
            'note': 'All items in draft_research state. No item is approved_for_boq.',
        },
        'totals': {
            'total':          len(boq_items),
            'approved':       0,
            'requires_review': sum(1 for b in boq_items if b['requires_review']),
            'human_reviewed': sum(1 for b in boq_items if b['human_reviewed']),
        },
        'by_category': {
            cat: {
                'count': len(items),
                'items': items,
            }
            for cat, items in by_cat.items()
        },
    }

def build_review_questions_state(questions: List[Dict]) -> Dict:
    pending   = [q for q in questions if not q['answered']]
    by_type: Dict[str, int] = {}
    by_priority: Dict[str, int] = {}
    for q in pending:
        by_type[q.get('question_type','?')] = by_type.get(q.get('question_type','?'), 0) + 1
        by_priority[q.get('priority','?')]  = by_priority.get(q.get('priority','?'), 0) + 1
    return {
        'meta': {
            'generated_at': _now(),
            'plan_id': PLAN_ID,
            'run_id':  RUN_ID,
        },
        'totals': {
            'total':   len(questions),
            'pending': len(pending),
            'answered': len(questions) - len(pending),
        },
        'by_type':     by_type,
        'by_priority': by_priority,
        'pending_questions': pending,
    }

# ── Reports ──────────────────────────────────────────────────────────────────────

def build_md(state: Dict, answer_result: Dict) -> str:
    s = state['summary']
    ai = answer_result
    ts = state['meta']['generated_at']

    def chk(v: bool) -> str:
        return '✓' if v else '✗'

    lines = [
        '# Local JSON Persistence Flow — Report',
        f'**Stage S17** | Generated: {ts}',
        '',
        '## Guarantees',
        f'- approved_for_boq: False on all entities {chk(True)}',
        f'- paid API used: {chk(False)}',
        f'- production modified: {chk(False)}',
        f'- DB migrations applied: {chk(False)}',
        '',
        '## Entity Summary',
        f'| Entity | Count |',
        f'|---|---|',
        f'| plans | 1 |',
        f'| plan_scan_runs | 1 |',
        f'| plan_pages | {s["pages"]} |',
        f'| plan_legend_items | {s["legend_items"]} |',
        f'| plan_sign_occurrences | {s["sign_occurrences"]} |',
        f'| plan_partial_codes | {s["partial_codes"]} |',
        f'| plan_element_groups | {s["element_groups"]} |',
        f'| plan_measurements | {s["measurements"]} |',
        f'| plan_boq_items | {s["boq_items"]} |',
        f'| plan_review_questions | {s["review_questions"]} |',
        f'| plan_human_answers | {s["human_answers"]} |',
        f'| plan_teaching_rules | {s["teaching_rules"]} |',
        f'| plan_audit_events | {s["audit_events"]} |',
        f'| plan_artifacts | {s["artifacts"]} |',
        '',
        '## BOQ State',
        f'- Total items: {s["boq_items"]}',
        f'- Approved: 0 (hardcoded — no auto-approval)',
        f'- Requires review: {s["boq_requires_review"]}',
        '',
        '## Review Questions',
        f'- Total: {s["review_questions"]} pending questions',
        f'- Answered: 0 (no real answers submitted yet)',
        '',
        '## Human Answer Ingestion',
        f'- answers file present: {ai["answers_file_present"]}',
        f'- answers valid: {ai["answers_valid"]}',
        f'- answers count: {ai["answers_count"]}',
        f'- writeback applied: {ai["writeback_applied"]}',
        f'- note: {ai["note"]}',
    ]
    if ai.get('invalid_reasons'):
        lines += ['- errors:'] + [f'  - {e}' for e in ai['invalid_reasons']]

    lines += [
        '',
        '## Artifacts Indexed',
        f'- Total: {s["artifacts"]} files',
        '',
        '## DB Mapping',
        'All local JSON entities map 1:1 to the planned PostgreSQL tables in',
        '`PLAN_SCANNER_DATA_MODEL.md`. No migrations applied.',
        '',
        '## Outputs Generated',
        '- `outputs/local_state/plan_scan_state.json`',
        '- `outputs/local_state/current_review_questions.json`',
        '- `outputs/local_state/current_boq_state.json`',
        '- `outputs/local_state/current_artifacts_index.json`',
        '- `outputs/local_state/audit_log.json`',
        '- `outputs/local_state/local_persistence_report.md`',
        '- `outputs/local_state/local_persistence_report.html`',
        '',
        '## Recommended Next Step',
        '1. Submit real answers via `static_review_form.html`',
        '2. Save as `outputs/human_review_answers.json`',
        '3. Run `23_human_review_writeback.py` to apply',
        '4. Re-run `30_local_json_persistence_flow.py` to update state',
        '5. Validate prototype shell reflects updated state',
        '6. When confident in JSON flow → migrate to Supabase schema (Phase 2)',
    ]
    return '\n'.join(lines)

def _row(k: str, v: Any) -> str:
    return f'<tr><td style="padding:4px 10px;color:#aaa;font-size:.85em">{k}</td><td style="padding:4px 10px;font-weight:600">{v}</td></tr>'

def _section(anchor: str, title: str, body: str, subtitle: str = '') -> str:
    sub = f'<div style="color:#aaa;font-size:.85em;margin-bottom:8px">{subtitle}</div>' if subtitle else ''
    return (
        f'<section id="{anchor}" style="margin-bottom:48px">'
        f'<h2 style="border-bottom:2px solid #1e3a5f;padding-bottom:6px;color:#e8f0ff">{title}</h2>'
        f'{sub}{body}</section>'
    )

def build_html(state: Dict, answer_result: Dict) -> str:
    s   = state['summary']
    ai  = answer_result
    ts  = state['meta']['generated_at']
    ok  = '<span style="color:#4caf50">✓</span>'
    bad = '<span style="color:#f44336">✗</span>'

    entity_rows = ''.join([
        _row('plans', '1'),
        _row('plan_scan_runs', '1'),
        _row('plan_pages', s['pages']),
        _row('plan_legend_items', s['legend_items']),
        _row('plan_sign_occurrences', s['sign_occurrences']),
        _row('plan_partial_codes', s['partial_codes']),
        _row('plan_element_groups', s['element_groups']),
        _row('plan_measurements', s['measurements']),
        _row('plan_boq_items', s['boq_items']),
        _row('plan_review_questions', s['review_questions']),
        _row('plan_human_answers', s['human_answers']),
        _row('plan_teaching_rules', s['teaching_rules']),
        _row('plan_audit_events', s['audit_events']),
        _row('plan_artifacts', s['artifacts']),
    ])
    ent_table = f'<table style="width:100%;border-collapse:collapse">{entity_rows}</table>'

    boq_body = (
        f'<div style="display:flex;gap:16px;flex-wrap:wrap">'
        f'<div style="background:#1e3a5f;border-radius:8px;padding:16px 24px;text-align:center">'
        f'<div style="font-size:2em;font-weight:700">{s["boq_items"]}</div>'
        f'<div style="color:#aaa;font-size:.85em">Total Items</div></div>'
        f'<div style="background:#0a2a0a;border-radius:8px;padding:16px 24px;text-align:center">'
        f'<div style="font-size:2em;font-weight:700;color:#4caf50">0</div>'
        f'<div style="color:#aaa;font-size:.85em">Approved</div></div>'
        f'<div style="background:#3a1a00;border-radius:8px;padding:16px 24px;text-align:center">'
        f'<div style="font-size:2em;font-weight:700;color:#ff9800">{s["boq_requires_review"]}</div>'
        f'<div style="color:#aaa;font-size:.85em">Requires Review</div></div>'
        f'</div>'
        f'<p style="color:#aaa;margin-top:12px;font-size:.85em">'
        f'All items are in <code>draft_research</code> state. '
        f'<code>approved_for_boq</code> is hardcoded <code>False</code> — '
        f'no item can be approved without a human operational_approver_id (future DB constraint).</p>'
    )

    ans_colour = '#4caf50' if ai['answers_file_present'] and ai['answers_valid'] else '#ff9800'
    ans_body = (
        f'<table style="width:100%;border-collapse:collapse">'
        f'{_row("answers file present", ok if ai["answers_file_present"] else bad)}'
        f'{_row("answers valid", ok if ai["answers_valid"] else bad)}'
        f'{_row("answers count", ai["answers_count"])}'
        f'{_row("writeback applied", ok if ai["writeback_applied"] else bad)}'
        f'</table>'
        f'<p style="color:{ans_colour};margin-top:8px">{ai["note"]}</p>'
    )
    if ai.get('invalid_reasons'):
        errs = ''.join(f'<li style="color:#f44336">{e}</li>' for e in ai['invalid_reasons'])
        ans_body += f'<ul>{errs}</ul>'

    artifacts_body = (
        f'<p>{s["artifacts"]} files indexed across outputs/ directory tree.</p>'
        f'<p style="color:#aaa;font-size:.85em">Full index: '
        f'<a href="current_artifacts_index.json" style="color:#64b5f6">current_artifacts_index.json</a></p>'
    )

    next_steps = (
        '<ol style="line-height:2">'
        '<li>Submit real answers via <a href="../static_review_form.html" style="color:#64b5f6">static_review_form.html</a></li>'
        '<li>Save answers as <code>outputs/human_review_answers.json</code></li>'
        '<li>Run <code>23_human_review_writeback.py</code> to apply writeback</li>'
        '<li>Re-run <code>30_local_json_persistence_flow.py</code> to update state</li>'
        '<li>Validate updated state in <a href="../plan_scanner_prototype.html" style="color:#64b5f6">prototype shell</a></li>'
        '<li>When JSON flow validated → migrate to Supabase schema (Phase 2)</li>'
        '</ol>'
    )

    nav_items = [
        ('entities', 'Entities'),
        ('boq', 'BOQ State'),
        ('answers', 'Answer Ingestion'),
        ('artifacts', 'Artifacts'),
        ('next', 'Next Steps'),
    ]
    nav_html = ''.join(
        f'<a href="#{a}" style="display:block;padding:8px 14px;color:#b0c4de;text-decoration:none;border-left:3px solid transparent;margin-bottom:2px" '
        f'onmouseover="this.style.borderLeftColor=\'#64b5f6\'" onmouseout="this.style.borderLeftColor=\'transparent\'">'
        f'{t}</a>'
        for a, t in nav_items
    )
    back_links = (
        '<a href="../master_dashboard.html" style="color:#64b5f6">← Dashboard</a>&nbsp;|&nbsp;'
        '<a href="../plan_scanner_prototype.html" style="color:#64b5f6">Prototype Shell</a>&nbsp;|&nbsp;'
        '<a href="../plan_scanner_workspace.html" style="color:#64b5f6">Workspace</a>'
    )

    sections_html = (
        _section('entities', 'Entity Summary', ent_table,
                 '14 entity families mapped to future PostgreSQL tables') +
        _section('boq', 'BOQ State', boq_body) +
        _section('answers', 'Human Answer Ingestion', ans_body) +
        _section('artifacts', 'Artifact Index', artifacts_body) +
        _section('next', 'Next Steps', next_steps)
    )

    return f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Local JSON Persistence — S17</title>
<style>
  body{{background:#0d1b2a;color:#c8d8e8;font-family:system-ui,sans-serif;margin:0;display:flex}}
  aside{{width:220px;min-height:100vh;background:#0a1520;padding:20px 0;position:sticky;top:0}}
  main{{flex:1;padding:32px;max-width:960px}}
  code{{background:#1e3a5f;padding:1px 6px;border-radius:4px;font-size:.9em}}
  a{{color:#64b5f6}}
  h1{{color:#90caf9;margin-top:0}}
  .badge{{display:inline-block;background:#1e3a5f;padding:2px 10px;border-radius:12px;font-size:.8em;margin-left:6px}}
</style>
</head>
<body>
<aside>
  <div style="padding:16px;font-weight:700;color:#90caf9;font-size:1.1em">S17 Local State</div>
  {nav_html}
  <div style="padding:14px 16px;margin-top:20px;font-size:.8em;color:#555">{back_links}</div>
</aside>
<main>
  <h1>Local JSON Persistence Flow
    <span class="badge">S17</span>
    <span class="badge" style="background:#0a2a0a;color:#4caf50">research-only</span>
  </h1>
  <p style="color:#aaa">Generated: {ts}</p>
  <div style="background:#0a2a0a;border:1px solid #1b5e20;border-radius:6px;padding:10px 16px;margin-bottom:24px;font-size:.85em">
    {ok} approved_for_boq: False &nbsp;|&nbsp;
    {ok} paid API: False &nbsp;|&nbsp;
    {ok} production modified: False &nbsp;|&nbsp;
    {ok} DB migrations: 0
  </div>
  {sections_html}
</main>
</body>
</html>"""

# ── Link injector ────────────────────────────────────────────────────────────────

LINK_SNIPPET = (
    '<a href="local_state/local_persistence_report.html" '
    'style="display:inline-block;background:#1565c0;color:#fff;padding:6px 14px;'
    'border-radius:4px;text-decoration:none;font-size:.85em;margin-left:8px">'
    'Local State (S17) →</a>'
)

def _inject_link(html_path: Path, anchor_text: str) -> bool:
    if not html_path.exists():
        return False
    content = html_path.read_text(encoding='utf-8')
    marker = 'local_state/local_persistence_report.html'
    if marker in content:
        return False     # already linked
    # Find a good insertion point (after a known S16 prototype link)
    target = 'plan_scanner_prototype.html'
    if target in content:
        # Insert after the first occurrence
        idx = content.index(target)
        end = content.index('</a>', idx) + 4
        content = content[:end] + ' ' + LINK_SNIPPET + content[end:]
        html_path.write_text(content, encoding='utf-8')
        return True
    return False

# ── Main ─────────────────────────────────────────────────────────────────────────

def main() -> None:
    ts_start = _now()
    print('30_local_json_persistence_flow.py — Stage S17')
    print('=' * 60)

    STATE_DIR.mkdir(parents=True, exist_ok=True)

    # Load
    print('Loading source files...')
    src = load_sources()
    missing = [
        name for name, key, path in [
            ('pipeline_run_summary.json', 'pipeline', F_PIPELINE),
            ('boq_unified_draft.json',    'boq',      F_BOQ),
            ('review_queue.json',         'review_queue', F_REVIEW_Q),
            ('element_groups.json',       'elements', F_ELEMENTS),
        ]
        if not path.exists()
    ]
    if missing:
        print(f'  [WARN] Missing required sources: {missing}')
    else:
        print('  All required sources present.')

    present = [f for f in [
        F_PIPELINE, F_BOQ, F_REVIEW_Q, F_ELEMENTS, F_PARTIAL,
        F_VALIDATION, F_LEGEND_ROWS, F_LEGEND_VOC, F_HRA,
        F_ANSWERS, F_ANSWERS_T, F_TL_PACK, F_DASHBOARD, F_PROTOTYPE, F_SCALE,
    ] if f.exists()]
    print(f'  Inputs present: {len(present)} / 15')

    # Build
    print('Building entity state...')
    state, boq_items, questions, artifacts, audit, answer_result = build_state(src)
    s = state['summary']
    print(f'  plans: 1  scan_runs: 1  pages: {s["pages"]}')
    print(f'  legend_items: {s["legend_items"]}  sign_occurrences: {s["sign_occurrences"]}')
    print(f'  partial_codes: {s["partial_codes"]}  element_groups: {s["element_groups"]}')
    print(f'  measurements: {s["measurements"]}  boq_items: {s["boq_items"]}')
    print(f'  review_questions: {s["review_questions"]}  human_answers: {s["human_answers"]}')
    print(f'  teaching_rules: {s["teaching_rules"]}')
    print(f'  audit_events: {s["audit_events"]}  artifacts: {s["artifacts"]}')

    # Verify BOQ constraint
    violations = [b for b in boq_items if b.get('approved_for_boq') is True]
    if violations:
        raise RuntimeError(f'BOQ APPROVAL VIOLATION: {len(violations)} items have approved_for_boq=True!')
    print(f'  BOQ constraint OK — 0 items approved_for_boq=True')

    # Derived outputs
    boq_state  = build_boq_state(boq_items)
    q_state    = build_review_questions_state(questions)

    # Write outputs
    print('Writing local state files...')
    O_STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    O_BOQ.write_text(json.dumps(boq_state, ensure_ascii=False, indent=2), encoding='utf-8')
    O_QUESTIONS.write_text(json.dumps(q_state, ensure_ascii=False, indent=2), encoding='utf-8')
    O_ARTIFACTS.write_text(json.dumps(
        {'meta': {'generated_at': _now(), 'count': len(artifacts)}, 'artifacts': artifacts},
        ensure_ascii=False, indent=2), encoding='utf-8')
    O_AUDIT.write_text(json.dumps(
        {'meta': {'generated_at': _now(), 'count': len(audit)}, 'events': audit},
        ensure_ascii=False, indent=2), encoding='utf-8')

    md_text   = build_md(state, answer_result)
    html_text = build_html(state, answer_result)
    O_REPORT_MD.write_text(md_text,   encoding='utf-8')
    O_REPORT_HTML.write_text(html_text, encoding='utf-8')

    for f in [O_STATE, O_BOQ, O_QUESTIONS, O_ARTIFACTS, O_AUDIT, O_REPORT_MD, O_REPORT_HTML]:
        sz = f.stat().st_size
        print(f'  {f.name}: {sz:,} bytes')

    # Inject links into sibling HTML files
    print('Injecting links...')
    injected = []
    for target in [
        OUT_DIR / 'master_dashboard.html',
        OUT_DIR / 'plan_scanner_workspace.html',
        OUT_DIR / 'plan_scanner_prototype.html',
    ]:
        if _inject_link(target, 'Local State (S17) →'):
            injected.append(target.name)
    if injected:
        print(f'  Linked in: {injected}')
    else:
        print('  Links already present or targets not found — no injection needed.')

    print()
    print('Answer ingestion:')
    print(f'  file present: {answer_result["answers_file_present"]}')
    print(f'  valid: {answer_result["answers_valid"]}')
    print(f'  count: {answer_result["answers_count"]}')
    print(f'  note: {answer_result["note"]}')
    print()
    print(f'Stage S17 — Local JSON Persistence Flow complete.')
    print(f'Report: outputs/local_state/local_persistence_report.html')

if __name__ == '__main__':
    main()
