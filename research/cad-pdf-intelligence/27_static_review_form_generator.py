"""
Stage S14 — Static Guided Review Form Generator
Generates a self-contained static HTML form for answering Teaching Loop questions.

No server. No DB. No paid API. Vanilla HTML/CSS/JS only.
Output is compatible with 23_human_review_writeback.py.

Outputs:
  outputs/static_review_form.html
  outputs/static_review_form.json
  outputs/static_review_form_report.md
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPT_DIR = Path(__file__).parent
OUT_DIR    = SCRIPT_DIR / 'outputs'

OUT_HTML = OUT_DIR / 'static_review_form.html'
OUT_JSON = OUT_DIR / 'static_review_form.json'
OUT_MD   = OUT_DIR / 'static_review_form_report.md'

F_PACK     = OUT_DIR / 'teaching_loop_answer_pack.json'
F_TEMPLATE = OUT_DIR / 'human_review_answers.template.json'

# Types fully supported by 23_human_review_writeback.py
WRITEBACK_SUPPORTED = {
    'partial_code_resolution',
    'element_group_classification',
    'scale_calibration',
    'color_taxonomy_rule',
    'sign_code_confirmation',
    'ignore_rule',
    'legend_label',
    'boq_review',
}

# Valid values from writeback
VALID_ELEMENT_CLASSIFICATIONS = [
    'work_zone', 'guardrail', 'barrier', 'marking', 'pavement_marking',
    'road_edge', 'drainage', 'signage', 'background', 'noise', 'unknown',
]
VALID_ACTION_TYPES = [
    'existing', 'new', 'remove', 'cover', 'temporary', 'permanent', 'unknown',
]
VALID_TARGET_TYPES = ['group', 'color', 'path_class', 'region']
VALID_SCOPES = ['current_plan_only', 'project_rule', 'company_rule_candidate']


def load_json(path: Path) -> Optional[Any]:
    if not path.exists():
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def build_summary(questions: List[Dict]) -> Dict:
    from collections import Counter
    return {
        'meta': {
            'generated_at': datetime.now().isoformat(),
            'source_script': '27_static_review_form_generator.py',
            'approved_for_boq': False,
            'paid_api_used': False,
            'production_modified': False,
        },
        'questions': {
            'total': len(questions),
            'by_priority': dict(Counter(q['priority'] for q in questions)),
            'by_type': dict(Counter(q['question_type'] for q in questions)),
            'writeback_supported': len([q for q in questions if q['question_type'] in WRITEBACK_SUPPORTED]),
            'pending_writeback_extension': len([q for q in questions if q['question_type'] not in WRITEBACK_SUPPORTED]),
        },
        'writeback_supported_types': sorted(WRITEBACK_SUPPORTED),
        'pending_extension_types': [],
        'output_compatible_with': '23_human_review_writeback.py',
    }


def build_markdown(summary: Dict) -> str:
    now = summary['meta']['generated_at']
    qs  = summary['questions']
    lines = [
        '# Static Review Form — Generator Report',
        f'Generated: {now}',
        '',
        '> Research-only. No paid API. No production changes.',
        '',
        '## Purpose',
        'Turns the Teaching Loop Answer Pack into a browser-fillable form.',
        'Human fills the form → downloads JSON → runs 23_human_review_writeback.py.',
        '',
        '## Question Coverage',
        f'- Total questions in form: {qs["total"]}',
        f'- Writeback-supported types: {qs["writeback_supported"]}',
        f'- Pending writeback extension: {qs["pending_writeback_extension"]} (legend_label, boq_review)',
        '',
        '### By priority',
    ]
    for p in ['critical', 'high', 'medium', 'low']:
        lines.append(f'- {p.upper()}: {qs["by_priority"].get(p, 0)}')
    lines += ['', '### By type']
    for t, c in sorted(qs['by_type'].items(), key=lambda x: -x[1]):
        supported = '✅' if t in WRITEBACK_SUPPORTED else '⚠ (future)'
        lines.append(f'- {t}: {c} {supported}')
    lines += [
        '',
        '## Workflow',
        '1. Open outputs/static_review_form.html in a browser',
        '2. Answer CRITICAL questions first, then HIGH',
        '3. Click "Download Answers JSON"',
        '4. Save as outputs/human_review_answers.json',
        '5. Run: .venv/bin/python3 23_human_review_writeback.py',
        '6. Re-run pipeline to see updated dashboard',
        '',
        '## Audit Guarantees',
        '- approved_for_boq: false — never set by form',
        '- No auto-apply — download only',
        '- Form tracks answered/skipped per question',
        '- Template guard preserved (no _comment=TEMPLATE in output)',
    ]
    return '\n'.join(lines)


JS = r"""
const PRIO_ORDER = {critical:0, high:1, medium:2, low:3};
const PRIO_COLOR = {critical:'#b71c1c', high:'#e65100', medium:'#f57c00', low:'#388e3c'};
const TYPE_LABEL = {
  partial_code_resolution:'Partial Code Resolution',
  scale_calibration:'Scale Calibration',
  element_group_classification:'Element Group Classification',
  color_taxonomy_rule:'Color Taxonomy Rule',
  legend_label:'Legend Label',
  sign_code_confirmation:'Sign Code Confirmation',
  ignore_rule:'Ignore Rule',
  boq_review:'BOQ Review',
};
const WRITEBACK_SUPPORTED = new Set([
  'partial_code_resolution','element_group_classification','scale_calibration',
  'color_taxonomy_rule','sign_code_confirmation','ignore_rule',
  'legend_label','boq_review'
]);
const ELEMENT_CLASSIFICATIONS = [
  'work_zone','guardrail','barrier','marking','pavement_marking',
  'road_edge','drainage','signage','background','noise','unknown'
];
const ACTION_TYPES = ['existing','new','remove','cover','temporary','permanent','unknown'];
const TARGET_TYPES = ['group','color','path_class','region'];
const SCOPES = ['current_plan_only','project_rule','company_rule_candidate'];

// ── State ───────────────────────────────────────────────────────────────────
const state = {};  // qid -> {status: 'pending'|'answered'|'skipped', answers: [...]}
const subState = {}; // `${qid}::${sub_key}` -> answer object

function initState() {
  QUESTIONS.forEach(q => { state[q.question_id] = {status:'pending', answers:[]}; });
  updateProgress();
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function sel(opts, name, val, cls) {
  const options = opts.map(o =>
    `<option value="${esc(o)}" ${val===o?'selected':''}>${esc(o)}</option>`
  ).join('');
  return `<select name="${esc(name)}" class="${cls||'f-sel'}">${options}</select>`;
}
function inp(type, name, val, placeholder, cls) {
  return `<input type="${type}" name="${esc(name)}" value="${esc(val??'')}" placeholder="${esc(placeholder??'')}" class="${cls||'f-inp'}">`;
}
function textarea(name, val, placeholder, rows) {
  return `<textarea name="${esc(name)}" rows="${rows||2}" class="f-area" placeholder="${esc(placeholder??'')}">${esc(val??'')}</textarea>`;
}
function label(text, required) {
  return `<label class="f-label">${esc(text)}${required?' <span class="req">*</span>':''}</label>`;
}
function row(lbl, field, required) {
  return `<div class="f-row">${label(lbl,required)}${field}</div>`;
}

// ── Form field builders ──────────────────────────────────────────────────────
function buildFields(q) {
  const t = q.question_type;
  const ctx = q.context || {};

  if (t === 'partial_code_resolution') {
    const suffix = ctx.suffix || '';
    const cands = (ctx.expansion_candidates || []);
    const candOpts = cands.length
      ? cands.map(c => `<option value="${c}">${c}</option>`).join('')
      : `<option value="">No valid candidates</option>`;
    return `
      ${row('Suffix (read-only)', `<input type="text" class="f-inp f-ro" value="${esc(suffix)}" readonly>`, false)}
      ${row('Resolved full code', `<select name="resolved_full_code" class="f-sel">
        <option value="">-- select or type below --</option>
        ${candOpts}
      </select>
      <input type="number" name="resolved_full_code_manual" class="f-inp" placeholder="or type code (101-999)" min="101" max="999" style="margin-top:4px">`, true)}
      ${row('Scope', sel(SCOPES,'scope','current_plan_only'), true)}
      ${row('Notes', textarea('notes','','Optional note about which crop image confirms the code'))}
    `;
  }

  if (t === 'scale_calibration') {
    return `
      ${row('Calibration method', sel(['confirmed_fallback','known_distance','scale_bar_manual'],'calibration_method','confirmed_fallback'), true)}
      ${row('Point A — PDF coords [x, y]',
        `<input type="number" name="point_a_x" class="f-inp f-half" placeholder="x (pt)">
         <input type="number" name="point_a_y" class="f-inp f-half" placeholder="y (pt)" style="margin-left:4px">`)}
      ${row('Point B — PDF coords [x, y]',
        `<input type="number" name="point_b_x" class="f-inp f-half" placeholder="x (pt)">
         <input type="number" name="point_b_y" class="f-inp f-half" placeholder="y (pt)" style="margin-left:4px">`)}
      ${row('Known real-world distance (m)', inp('number','real_world_distance_m','','e.g. 50.0'))}
      <div class="hint">If confirming the 1:500 fallback without coordinates: choose "confirmed_fallback", leave coords blank, distance blank.</div>
      ${row('Notes', textarea('notes','','e.g. Confirmed 1:500 per municipal standard'))}
    `;
  }

  if (t === 'element_group_classification') {
    const gid = ctx.group_id || '';
    const rgb = ctx.color_rgb_str || '';
    return `
      ${row('Group ID (read-only)', `<input type="text" class="f-inp f-ro" value="${esc(gid)}" readonly>`)}
      ${row('Color', `<span class="color-swatch" style="background:${esc(rgb)};display:inline-block;width:20px;height:20px;border-radius:4px;vertical-align:middle;border:1px solid #ccc"></span>
        <input type="text" class="f-inp f-ro" value="${esc(rgb)}" readonly style="display:inline-block;width:160px;margin-left:6px">`)}
      ${row('Classification', sel(ELEMENT_CLASSIFICATIONS,'classification','unknown'), true)}
      ${row('Description (Hebrew)', inp('text','confirmed_description_he','','e.g. סימון כביש'))}
      ${row('Description (English)', inp('text','confirmed_description_en','','e.g. Road marking'))}
      ${row('Include in BOQ',
        `<select name="include_in_boq" class="f-sel">
          <option value="">-- choose --</option>
          <option value="true">Yes — count in BOQ</option>
          <option value="false">No — exclude</option>
        </select>`, true)}
      ${row('BOQ category (if included)', inp('text','boq_category','','e.g. road_markings_m'))}
      ${row('Scope', sel(SCOPES,'scope','current_plan_only'), true)}
      ${row('Notes', textarea('notes','',''))}
    `;
  }

  if (t === 'color_taxonomy_rule') {
    const rgb = ctx.color_rgb8 || [];
    const rgbStr = rgb.length ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : '';
    return `
      ${row('Color RGB (read-only)',
        `<span class="color-swatch" style="background:${esc(rgbStr)};display:inline-block;width:20px;height:20px;border-radius:4px;vertical-align:middle;border:1px solid #ccc"></span>
        <input type="text" class="f-inp f-ro" value="${esc(JSON.stringify(rgb))}" readonly style="display:inline-block;width:160px;margin-left:6px">`)}
      ${row('Element type', sel(ELEMENT_CLASSIFICATIONS,'element_type','unknown'), true)}
      ${row('Action type', sel(ACTION_TYPES,'action_type','existing'), true)}
      ${row('Description (Hebrew)', inp('text','confirmed_description_he','','e.g. מעקה'))}
      ${row('Description (English)', inp('text','confirmed_description_en','','e.g. Guardrail'))}
      ${row('Scope', sel(SCOPES,'scope','current_plan_only'), true)}
      ${row('Notes', textarea('notes','',''))}
    `;
  }

  if (t === 'sign_code_confirmation') {
    const occIds = ctx.occurrence_ids || [];
    if (occIds.length === 0) return '<div class="hint">No occurrence IDs in context.</div>';
    return occIds.map((occ, i) => `
      <div class="sub-row" id="sub-${esc(q.question_id)}-${i}">
        <div class="sub-label">Occurrence: <code>${esc(occ)}</code>
          <a href="review_items/${esc(occ)}.png" target="_blank" class="ev-link">→ crop</a>
        </div>
        ${row('Confirmed code (101–999)',
          `<input type="number" name="confirmed_code_${i}" class="f-inp f-half" min="101" max="999" placeholder="e.g. 433">
           <span class="hint-inline">null = cannot read</span>`, true)}
        ${row('Notes', textarea(`notes_${i}`,'','Optional note for this occurrence', 1))}
        <input type="hidden" name="occurrence_id_${i}" value="${esc(occ)}">
      </div>
    `).join('<hr class="sub-hr">');
  }

  if (t === 'ignore_rule') {
    const gids = ctx.group_ids || [];
    const checkboxes = gids.map((gid, i) =>
      `<label class="cb-label">
        <input type="checkbox" name="ignore_gid_${i}" value="${esc(gid)}" checked>
        ${esc(gid)}
      </label>`
    ).join(' ');
    return `
      ${row('Groups to ignore', `<div class="cb-group">${checkboxes}</div>`, true)}
      ${row('Decision', sel(['ignore_all','investigate_individually'],'decision','ignore_all'), true)}
      ${row('Reason', inp('text','reason','','e.g. Rendering artifact from PDF export'), true)}
      ${row('Scope', sel(SCOPES,'scope','current_plan_only'), true)}
      ${row('Notes', textarea('notes','',''))}
    `;
  }

  if (t === 'legend_label') {
    const ri = ctx.row_index ?? '';
    return `
      ${row('Row index (read-only)', `<input type="text" class="f-inp f-ro" value="${esc(ri)}" readonly>`)}
      ${row('Hebrew label', inp('text','hebrew_label','','e.g. תמרור אזהרה'), true)}
      ${row('English label', inp('text','english_label','','e.g. Warning sign'))}
      ${row('Sign code (if applicable)', inp('number','sign_code','','e.g. 133'))}
      ${row('Quantity (if shown in legend)', inp('number','quantity','','e.g. 6'))}
      ${row('Notes', textarea('notes','',''))}
    `;
  }

  if (t === 'boq_review') {
    const boqIds = ctx.boq_item_ids || [];
    if (boqIds.length === 0) return '<div class="hint">No BOQ item IDs in context.</div>';
    const blocker = ctx.blocked_by ? `<div class="hint warn-hint">⚠ This question is blocked by ${esc(ctx.blocked_by)} — answer that first.</div>` : '';
    return blocker + boqIds.map((bid, i) => `
      <div class="sub-row" id="sub-${esc(q.question_id)}-${i}">
        <div class="sub-label">BOQ item: <code>${esc(bid)}</code></div>
        ${row('Review decision',
          `<select name="review_decision_${i}" class="f-sel">
            <option value="">-- choose --</option>
            <option value="accept_quantity">Accept quantity</option>
            <option value="reject_quantity">Reject quantity</option>
            <option value="flag_for_site_survey">Flag for site survey</option>
          </select>`, false)}
        ${row('Override quantity (if rejecting)', inp('number',`override_qty_${i}`,'',''))}
        ${row('Notes', textarea(`notes_${i}`,'','', 1))}
        <input type="hidden" name="boq_item_id_${i}" value="${esc(bid)}">
      </div>
    `).join('<hr class="sub-hr">');
  }

  return '<div class="hint">Unknown question type — no form fields available.</div>';
}

// ── Card renderer ────────────────────────────────────────────────────────────
function renderCard(q) {
  const pcolor = PRIO_COLOR[q.priority] || '#555';
  const supported = WRITEBACK_SUPPORTED.has(q.question_type);
  const suppBadge = supported
    ? '<span class="sup-badge sup-ok">✓ writeback</span>'
    : '<span class="sup-badge sup-warn">⚠ future</span>';
  const typeLabel = TYPE_LABEL[q.question_type] || q.question_type;

  const evLinks = (q.evidence_paths||[]).slice(0,5).map(p =>
    `<a href="${esc(p)}" target="_blank" class="ev-link">${esc(p.split('/').pop())}</a>`
  ).join(' ');

  const qtext = (q.question_text||'').replace(/\n/g,'<br>');
  const appliedTo = q.applied_to || '';

  // Example answer
  const exJson = JSON.stringify(q.example_answer||{}, null, 2);

  const fields = buildFields(q);
  const qid = q.question_id;

  return `
<div class="q-card" id="card-${esc(qid)}" data-qid="${esc(qid)}" data-type="${esc(q.question_type)}" data-prio="${esc(q.priority)}">
  <div class="q-header" style="border-left:5px solid ${pcolor}">
    <div class="q-id-row">
      <span class="q-id">${esc(qid)}</span>
      <span class="prio-badge" style="background:${pcolor}">${q.priority.toUpperCase()}</span>
      <span class="type-badge">${esc(typeLabel)}</span>
      ${suppBadge}
      <span class="q-status-tag" id="stag-${esc(qid)}">pending</span>
    </div>
  </div>
  <div class="q-body">
    <div class="impact-box">${esc(q.business_impact||'')}</div>
    <div class="q-meta-row">
      <span><b>Items:</b> ${esc(String(q.affected_items_count||0))}</span>
      ${q.affected_quantity_if_known!=null?`<span><b>Qty:</b> ${esc(String(q.affected_quantity_if_known))}</span>`:''}
    </div>
    <div class="q-text">${qtext}</div>
    ${evLinks ? `<div class="ev-row"><b>Evidence:</b> ${evLinks}</div>` : ''}
    ${appliedTo ? `<div class="applied-row"><b>Applied to:</b> ${esc(appliedTo)}</div>` : ''}
    <details class="ex-block">
      <summary>Example answer</summary>
      <pre class="ex-pre">${esc(exJson)}</pre>
    </details>
    <div class="form-area" id="form-${esc(qid)}">
      <form id="f-${esc(qid)}" class="q-form" onsubmit="return false">
        ${fields}
        <div class="form-buttons">
          <button type="button" class="btn-answer" onclick="markAnswered('${esc(qid)}')">Mark Answered</button>
          <button type="button" class="btn-skip" onclick="markSkipped('${esc(qid)}')">Skip</button>
          <button type="button" class="btn-reset" onclick="resetQ('${esc(qid)}')">Reset</button>
        </div>
      </form>
    </div>
  </div>
</div>`;
}

// ── Status management ────────────────────────────────────────────────────────
function markAnswered(qid) {
  state[qid].status = 'answered';
  document.getElementById(`stag-${qid}`).textContent = '✓ answered';
  document.getElementById(`stag-${qid}`).className = 'q-status-tag st-answered';
  updateProgress();
}
function markSkipped(qid) {
  state[qid].status = 'skipped';
  document.getElementById(`stag-${qid}`).textContent = '— skipped';
  document.getElementById(`stag-${qid}`).className = 'q-status-tag st-skipped';
  updateProgress();
}
function resetQ(qid) {
  state[qid].status = 'pending';
  document.getElementById(`stag-${qid}`).textContent = 'pending';
  document.getElementById(`stag-${qid}`).className = 'q-status-tag';
  const form = document.getElementById(`f-${qid}`);
  if (form) form.reset();
  updateProgress();
}
function updateProgress() {
  const total = QUESTIONS.length;
  const answered = Object.values(state).filter(s=>s.status==='answered').length;
  const skipped  = Object.values(state).filter(s=>s.status==='skipped').length;
  const pending  = total - answered - skipped;
  document.getElementById('prog-answered').textContent = answered;
  document.getElementById('prog-skipped').textContent  = skipped;
  document.getElementById('prog-pending').textContent  = pending;
  document.getElementById('prog-bar').style.width = Math.round(answered/total*100)+'%';
}

// ── Answer collection ────────────────────────────────────────────────────────
function getFormVal(form, name) {
  const el = form.elements[name];
  if (!el) return null;
  if (el.type === 'checkbox') return el.checked;
  return el.value === '' ? null : el.value;
}
function getFormNum(form, name) {
  const v = getFormVal(form, name);
  if (v === null || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function getFormInt(form, name) {
  const v = getFormVal(form, name);
  if (v === null || v === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function collectAnswersForQuestion(q) {
  const form = document.getElementById(`f-${q.question_id}`);
  if (!form) return [];
  const t = q.question_type;
  const ctx = q.context || {};
  const ts = new Date().toISOString();
  const baseId = `ANS-${q.question_id}-${Date.now()}`;

  if (t === 'partial_code_resolution') {
    let code = getFormInt(form, 'resolved_full_code') || getFormInt(form, 'resolved_full_code_manual');
    return [{
      answer_id: baseId,
      answer_type: 'partial_code_resolution',
      question_id: q.question_id,
      partial_code: ctx.suffix || '',
      resolved_full_code: code,
      scope: getFormVal(form,'scope') || 'current_plan_only',
      notes: getFormVal(form,'notes') || '',
      _timestamp: ts,
    }];
  }

  if (t === 'scale_calibration') {
    const ax = getFormNum(form,'point_a_x'), ay = getFormNum(form,'point_a_y');
    const bx = getFormNum(form,'point_b_x'), by = getFormNum(form,'point_b_y');
    return [{
      answer_id: baseId,
      answer_type: 'scale_calibration',
      calibration_id: `CAL-${Date.now()}`,
      calibration_method: getFormVal(form,'calibration_method') || 'confirmed_fallback',
      point_a: (ax != null && ay != null) ? [ax, ay] : null,
      point_b: (bx != null && by != null) ? [bx, by] : null,
      real_world_distance_m: getFormNum(form,'real_world_distance_m'),
      notes: getFormVal(form,'notes') || '',
      _timestamp: ts,
    }];
  }

  if (t === 'element_group_classification') {
    const incRaw = getFormVal(form,'include_in_boq');
    const inc = incRaw === 'true' ? true : incRaw === 'false' ? false : null;
    return [{
      answer_id: baseId,
      answer_type: 'element_group_classification',
      group_id: ctx.group_id || '',
      classification: getFormVal(form,'classification') || 'unknown',
      confirmed_description_he: getFormVal(form,'confirmed_description_he'),
      confirmed_description_en: getFormVal(form,'confirmed_description_en'),
      include_in_boq: inc,
      boq_category: getFormVal(form,'boq_category'),
      scope: getFormVal(form,'scope') || 'current_plan_only',
      notes: getFormVal(form,'notes') || '',
      _timestamp: ts,
    }];
  }

  if (t === 'color_taxonomy_rule') {
    return [{
      answer_id: baseId,
      answer_type: 'color_taxonomy_rule',
      color: ctx.color_rgb8 || [],
      element_type: getFormVal(form,'element_type') || 'unknown',
      action_type: getFormVal(form,'action_type') || 'existing',
      confirmed_description_he: getFormVal(form,'confirmed_description_he'),
      confirmed_description_en: getFormVal(form,'confirmed_description_en'),
      scope: getFormVal(form,'scope') || 'current_plan_only',
      notes: getFormVal(form,'notes') || '',
      _timestamp: ts,
    }];
  }

  if (t === 'sign_code_confirmation') {
    const occIds = ctx.occurrence_ids || [];
    return occIds.map((occ, i) => {
      const code = getFormInt(form, `confirmed_code_${i}`);
      return {
        answer_id: `${baseId}-${i}`,
        answer_type: 'sign_code_confirmation',
        occurrence_id: occ,
        confirmed_code: code,
        source: 'human_manual',
        notes: getFormVal(form, `notes_${i}`) || '',
        _timestamp: ts,
      };
    }).filter(a => a.confirmed_code !== null);
  }

  if (t === 'ignore_rule') {
    const gids = ctx.group_ids || [];
    const checkedGids = gids.filter((g, i) => {
      const el = form.elements[`ignore_gid_${i}`];
      return el && el.checked;
    });
    return [{
      answer_id: baseId,
      answer_type: 'ignore_rule',
      target_type: 'group',
      target_id: checkedGids.join(','),
      group_ids: checkedGids,
      decision: getFormVal(form,'decision') || 'ignore_all',
      reason: getFormVal(form,'reason') || '',
      scope: getFormVal(form,'scope') || 'current_plan_only',
      notes: getFormVal(form,'notes') || '',
      _timestamp: ts,
    }];
  }

  if (t === 'legend_label') {
    return [{
      answer_id: baseId,
      answer_type: 'legend_label',
      row_index: ctx.row_index,
      hebrew_label: getFormVal(form,'hebrew_label'),
      english_label: getFormVal(form,'english_label'),
      sign_code: getFormInt(form,'sign_code'),
      quantity: getFormNum(form,'quantity'),
      scope: 'current_plan_only',
      notes: getFormVal(form,'notes') || '',
      _timestamp: ts,
    }];
  }

  if (t === 'boq_review') {
    const boqIds = ctx.boq_item_ids || [];
    return boqIds.map((bid, i) => {
      const dec = getFormVal(form, `review_decision_${i}`);
      if (!dec) return null;
      return {
        answer_id: `${baseId}-${i}`,
        answer_type: 'boq_review',
        boq_item_id: bid,
        review_decision: dec,
        override_quantity: getFormNum(form, `override_qty_${i}`),
        approved_for_boq: false,
        notes: getFormVal(form, `notes_${i}`) || '',
        _timestamp: ts,
      };
    }).filter(Boolean);
  }

  return [];
}

// ── Download ─────────────────────────────────────────────────────────────────
function downloadAnswers() {
  const allAnswers = [];
  let nAnswered = 0, nSkipped = 0, nEmpty = 0;
  QUESTIONS.forEach(q => {
    const s = state[q.question_id];
    if (s.status === 'answered') {
      const ans = collectAnswersForQuestion(q);
      if (ans.length) { allAnswers.push(...ans); nAnswered++; }
      else nEmpty++;
    } else if (s.status === 'skipped') {
      nSkipped++;
    }
  });

  if (allAnswers.length === 0) {
    alert('No answers collected yet. Mark at least one question as "Answered" before downloading.');
    return;
  }

  const result = {
    _comment: (
      'Generated by static_review_form.html — ' +
      'process with: .venv/bin/python3 23_human_review_writeback.py. ' +
      'Do NOT rename this file to human_review_answers.template.json. ' +
      'Save as: outputs/human_review_answers.json'
    ),
    meta: {
      generated_at: new Date().toISOString(),
      source: 'static_review_form.html (27_static_review_form_generator.py)',
      n_answers: allAnswers.length,
      n_questions_answered: nAnswered,
      n_questions_skipped: nSkipped,
      n_questions_empty: nEmpty,
      approved_for_boq: false,
    },
    answers: allAnswers,
  };

  const blob = new Blob([JSON.stringify(result, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'human_review_answers.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  document.getElementById('dl-status').textContent =
    `Downloaded: ${allAnswers.length} answer(s) from ${nAnswered} question(s). Save to outputs/ and run writeback.`;
}

// ── Filter / navigation ──────────────────────────────────────────────────────
function filterPriority(prio) {
  document.querySelectorAll('.q-card').forEach(el => {
    el.style.display = (prio === 'all' || el.dataset.prio === prio) ? '' : 'none';
  });
  document.querySelectorAll('.prio-section').forEach(el => {
    const secPrio = el.dataset.prio;
    el.style.display = (prio === 'all' || secPrio === prio) ? '' : 'none';
  });
}
function filterStatus(status) {
  document.querySelectorAll('.q-card').forEach(el => {
    const qid = el.dataset.qid;
    const s = state[qid] ? state[qid].status : 'pending';
    el.style.display = (status === 'all' || s === status) ? '' : 'none';
  });
}
function collapseAll() {
  document.querySelectorAll('.q-body').forEach(el => el.style.display='none');
}
function expandAll() {
  document.querySelectorAll('.q-body').forEach(el => el.style.display='');
}

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initState();
  const container = document.getElementById('questions-container');

  // Group by priority
  const PRIOS = ['critical','high','medium','low'];
  PRIOS.forEach(prio => {
    const qs = QUESTIONS.filter(q => q.priority === prio);
    if (!qs.length) return;
    const section = document.createElement('div');
    section.className = 'prio-section';
    section.dataset.prio = prio;
    const pcolor = PRIO_COLOR[prio];
    section.innerHTML = `<h2 class="prio-heading" style="color:${pcolor};border-left:6px solid ${pcolor}">
      ${prio.toUpperCase()} — ${qs.length} question(s)
    </h2>`;
    qs.forEach(q => {
      const div = document.createElement('div');
      div.innerHTML = renderCard(q);
      section.appendChild(div.firstElementChild);
    });
    container.appendChild(section);
  });
  updateProgress();
});
"""


CSS = """
:root{--bg:#f0f4f8;--card:#fff;--border:#e2e8f0;--ink:#111}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--ink)}
.topbar{background:#1e3a5f;color:#fff;padding:0 28px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:200;min-height:52px;flex-wrap:wrap}
.topbar-title{font-size:1rem;font-weight:700;flex:1}
.topbar-nav a{color:#93c5fd;font-size:0.8rem;text-decoration:none;padding:0 8px}
.topbar-nav a:hover{color:#fff}
.page{max-width:1100px;margin:0 auto;padding:24px 16px 60px}
.warn-banner{background:#fef2f2;border:2px solid #fca5a5;border-radius:8px;padding:12px 16px;font-size:0.83rem;font-weight:600;color:#991b1b;margin-bottom:20px}
.progress-bar{background:#e2e8f0;border-radius:4px;height:10px;margin-bottom:20px}
#prog-bar{background:#15803d;height:10px;border-radius:4px;transition:width .3s}
.prog-stats{display:flex;gap:20px;font-size:0.82rem;color:#555;margin-bottom:8px}
.prog-stat b{font-weight:700}
.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:20px}
.tb-btn{padding:5px 12px;border:1.5px solid #d1d5db;border-radius:6px;background:#fff;font-size:0.8rem;cursor:pointer;color:#374151}
.tb-btn:hover{background:#f3f4f6}
.tb-btn.active{background:#1e3a5f;color:#fff;border-color:#1e3a5f}
.btn-download{background:#1e3a5f;color:#fff;border:none;padding:8px 18px;border-radius:7px;font-size:0.88rem;font-weight:600;cursor:pointer}
.btn-download:hover{background:#1e4d8c}
#dl-status{font-size:0.8rem;color:#15803d;margin-top:6px;font-weight:600}
.prio-heading{font-size:1rem;padding-left:12px;margin:24px 0 12px;font-weight:700}
.q-card{background:var(--card);border-radius:8px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,0.09);overflow:hidden}
.q-header{padding:10px 14px;background:#fafafa;cursor:pointer}
.q-id-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.q-id{font-family:monospace;font-weight:700;font-size:0.95rem}
.prio-badge{color:#fff;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:700}
.type-badge{background:#e8eaf6;color:#3949ab;padding:2px 8px;border-radius:10px;font-size:0.72rem}
.sup-badge{padding:2px 7px;border-radius:8px;font-size:0.7rem;font-weight:600}
.sup-ok{background:#dcfce7;color:#166534}
.sup-warn{background:#fef9c3;color:#854d0e}
.q-status-tag{font-size:0.72rem;color:#9ca3af;padding:2px 7px;border-radius:8px;background:#f3f4f6;margin-left:auto}
.st-answered{color:#166534;background:#dcfce7}
.st-skipped{color:#6b7280;background:#f3f4f6}
.q-body{padding:14px 16px}
.impact-box{background:#fff8e1;border-left:4px solid #f9a825;padding:8px 12px;border-radius:4px;font-size:0.82rem;margin-bottom:10px}
.q-meta-row{display:flex;gap:16px;font-size:0.8rem;color:#6b7280;margin-bottom:8px}
.q-text{background:#f5f5f5;padding:10px 12px;border-radius:6px;font-size:0.83rem;line-height:1.6;white-space:pre-wrap;margin-bottom:10px}
.ev-row,.applied-row{font-size:0.78rem;margin-bottom:6px;color:#555}
.ev-link{color:#1d4ed8;text-decoration:none;background:#e0f2fe;padding:1px 6px;border-radius:8px;margin:1px;font-size:0.75rem}
.ev-link:hover{background:#bae6fd}
.ex-block{margin-bottom:12px}
.ex-block summary{font-size:0.8rem;cursor:pointer;color:#1565c0;padding:3px 0}
.ex-pre{background:#263238;color:#80cbc4;padding:10px;border-radius:6px;font-size:0.75rem;max-height:250px;overflow:auto}
.q-form{margin-top:10px;padding:12px;background:#f9fafb;border-radius:6px;border:1.5px solid #e2e8f0}
.f-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.f-label{min-width:200px;font-size:0.82rem;font-weight:600;padding-top:5px;color:#374151}
.req{color:#dc2626}
.f-inp{border:1.5px solid #d1d5db;border-radius:5px;padding:5px 8px;font-size:0.83rem;flex:1;min-width:120px}
.f-inp:focus{outline:none;border-color:#3b82f6}
.f-ro{background:#f3f4f6;color:#6b7280}
.f-half{flex:0 0 calc(50% - 10px)}
.f-sel{border:1.5px solid #d1d5db;border-radius:5px;padding:5px 8px;font-size:0.83rem;flex:1}
.f-area{border:1.5px solid #d1d5db;border-radius:5px;padding:5px 8px;font-size:0.82rem;flex:1;resize:vertical}
.hint{font-size:0.78rem;color:#6b7280;margin-bottom:8px;font-style:italic}
.hint-inline{font-size:0.75rem;color:#9ca3af;margin-left:6px}
.warn-hint{color:#92400e;background:#fffbeb;border-left:3px solid #d97706;padding:6px 10px;border-radius:0 4px 4px 0;font-style:normal;margin-bottom:8px}
.cb-group{display:flex;flex-wrap:wrap;gap:8px}
.cb-label{font-size:0.82rem;display:flex;align-items:center;gap:4px;cursor:pointer}
.form-buttons{display:flex;gap:8px;margin-top:10px}
.btn-answer{background:#15803d;color:#fff;border:none;padding:6px 14px;border-radius:5px;cursor:pointer;font-size:0.82rem;font-weight:600}
.btn-answer:hover{background:#166534}
.btn-skip{background:#f3f4f6;color:#374151;border:1.5px solid #d1d5db;padding:6px 12px;border-radius:5px;cursor:pointer;font-size:0.82rem}
.btn-reset{background:#fff;color:#dc2626;border:1.5px solid #fca5a5;padding:6px 10px;border-radius:5px;cursor:pointer;font-size:0.82rem}
.sub-row{padding:10px;background:#fff;border-radius:6px;margin-bottom:6px;border:1px solid #e2e8f0}
.sub-label{font-size:0.8rem;font-weight:600;margin-bottom:8px;color:#374151}
.sub-hr{border:none;border-top:1px dashed #d1d5db;margin:8px 0}
.color-swatch{border-radius:4px;border:1px solid #ccc}
.footer{background:#1e3a5f;color:#93c5fd;font-size:0.73rem;padding:10px 24px;margin-top:32px}
"""


def build_html(questions: List[Dict], now: str) -> str:
    questions_json = json.dumps(questions, ensure_ascii=False)
    total = len(questions)
    from collections import Counter
    by_prio = dict(Counter(q['priority'] for q in questions))
    prio_nav = ''.join(
        f'<a href="#" onclick="filterPriority(\'{p}\');return false" class="topbar-nav-link">'
        f'{p[0].upper()}: {by_prio.get(p,0)}</a>'
        for p in ['critical','high','medium','low']
    )

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Plan Scanner — Review Form</title>
<style>{CSS}</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-title">סורק תוכניות — Guided Review Form (S14)</div>
  <nav class="topbar-nav">
    <a href="plan_scanner_workspace.html">Workspace</a>
    <a href="teaching_loop_answer_pack.html">Answer Pack</a>
    <a href="master_dashboard.html">Dashboard</a>
    {prio_nav}
  </nav>
</div>

<div class="page">
  <div class="warn-banner">
    ⚠ RESEARCH-ONLY — answers must be processed by <code>23_human_review_writeback.py</code>
    before taking effect &nbsp;|&nbsp; approved_for_boq remains false &nbsp;|&nbsp;
    No paid API · No production changes
  </div>

  <div class="toolbar">
    <b style="font-size:0.85rem">Filter:</b>
    <button class="tb-btn" onclick="filterPriority('all')">All ({total})</button>
    <button class="tb-btn" onclick="filterPriority('critical')" style="color:#b71c1c">Critical ({by_prio.get('critical',0)})</button>
    <button class="tb-btn" onclick="filterPriority('high')" style="color:#e65100">High ({by_prio.get('high',0)})</button>
    <button class="tb-btn" onclick="filterPriority('medium')" style="color:#f57c00">Medium ({by_prio.get('medium',0)})</button>
    <button class="tb-btn" onclick="filterPriority('low')" style="color:#388e3c">Low ({by_prio.get('low',0)})</button>
    <span style="margin-left:8px;border-left:1px solid #e2e8f0;padding-left:8px"></span>
    <button class="tb-btn" onclick="filterStatus('pending')">Pending only</button>
    <button class="tb-btn" onclick="filterStatus('all')">Show all</button>
    <button class="tb-btn" onclick="collapseAll()">Collapse all</button>
    <button class="tb-btn" onclick="expandAll()">Expand all</button>
  </div>

  <div class="prog-stats">
    <span class="prog-stat"><b style="color:#15803d" id="prog-answered">0</b> answered</span>
    <span class="prog-stat"><b id="prog-skipped">0</b> skipped</span>
    <span class="prog-stat"><b id="prog-pending">{total}</b> pending</span>
  </div>
  <div class="progress-bar"><div id="prog-bar" style="width:0%"></div></div>

  <div style="margin-bottom:20px">
    <button class="btn-download" onclick="downloadAnswers()">⬇ Download Answers JSON</button>
    <div id="dl-status"></div>
    <div style="font-size:0.77rem;color:#6b7280;margin-top:4px">
      Save as <code>outputs/human_review_answers.json</code> then run:
      <code>.venv/bin/python3 23_human_review_writeback.py</code>
    </div>
  </div>

  <div id="questions-container"></div>

</div>

<div class="footer">
  Generated by 27_static_review_form_generator.py &nbsp;|&nbsp;
  {now} &nbsp;|&nbsp;
  Research-only · No paid API · No production changes &nbsp;|&nbsp;
  Process answers with: 23_human_review_writeback.py
</div>

<script>
const QUESTIONS = {questions_json};
{JS}
</script>
</body>
</html>'''


def main() -> None:
    print('Stage S14 — Static Review Form Generator')
    print('=' * 50)

    pack = load_json(F_PACK)
    if pack is None:
        print('ERROR: teaching_loop_answer_pack.json not found. Run 25_teaching_loop_answer_pack.py first.')
        return

    questions = pack.get('questions', [])
    print(f'Loaded {len(questions)} questions from answer pack.')

    now = datetime.now().isoformat()
    summary = build_summary(questions)
    summary['meta']['generated_at'] = now

    print('Writing JSON summary...')
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f'  {OUT_JSON}')

    print('Writing Markdown report...')
    with open(OUT_MD, 'w', encoding='utf-8') as f:
        f.write(build_markdown(summary))
    print(f'  {OUT_MD}')

    print('Writing HTML form...')
    with open(OUT_HTML, 'w', encoding='utf-8') as f:
        f.write(build_html(questions, now))
    print(f'  {OUT_HTML}')

    qs = summary['questions']
    print()
    print(f'Questions in form:    {qs["total"]}')
    print(f'Writeback-supported:  {qs["writeback_supported"]} questions (8 types)')
    print(f'Pending extension:    {qs["pending_writeback_extension"]} questions')
    print()
    print('Answer types with full writeback support:')
    for t in sorted(WRITEBACK_SUPPORTED):
        print(f'  ✓ {t}')
    print()
    print('Workflow:')
    print('  1. open outputs/static_review_form.html')
    print('  2. fill form, click "Download Answers JSON"')
    print('  3. save as outputs/human_review_answers.json')
    print('  4. run .venv/bin/python3 23_human_review_writeback.py')
    print()
    print('Stage S14 complete.')


if __name__ == '__main__':
    main()
