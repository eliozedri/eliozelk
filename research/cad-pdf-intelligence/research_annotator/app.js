/* Plan Scanner — Manual Training Annotator (Engine C v0.3, Slice 1)
 *
 * Uses Konva (vendored locally at /static/vendor/konva.min.js) to render the
 * plan image and capture user markings.
 *
 * Slice 1 tools:
 *   P — point (pole_dot)
 *   T — line (sign_count_tick)
 *   C — rectangle small (sign_code_text)
 *   S — rectangle medium (sign_symbol)
 *
 * Markings are stored in IMAGE-PIXEL space (not screen px). Zoom/pan only
 * affects display; the saved coordinates are stable. Every change auto-saves
 * to the run dir via PUT /examples.
 *
 * Slice 2 will add: select/edit/delete, drag handles, polygon for ignore_region,
 * association lines, review-queue panel.
 */
'use strict';

// ---------------------------------------------------------------
// Wizard step definitions (mirrors PLAN_SCANNER_MANUAL_TRAINING_AGENT_SPEC.md §3)
// ---------------------------------------------------------------

const STEPS = [
  {
    id: 'step_2_teach_pole_appearance',
    short: 'עמודים',
    he: 'סמן 5–10 דוגמאות של עמודי תמרור בתוכנית.',
    en: 'Mark 5–10 examples of sign poles in the plan.',
    tool: 'point',
    labelType: 'pole_dot',
    geometryType: 'point',
    minExamples: 5,
    maxExamples: 10,
    idPrefix: 'te_pole_',
  },
  {
    id: 'step_3_teach_sign_count',
    short: 'כמות תמרורים',
    he: 'סמן 5–10 דוגמאות שמראות איך התוכנית מציינת כמה תמרורים נמצאים על עמוד.',
    en: 'Mark 5–10 examples of how the plan indicates how many signs are on a pole.',
    tool: 'line',
    labelType: 'sign_count_tick',
    geometryType: 'line',
    minExamples: 5,
    maxExamples: 10,
    idPrefix: 'te_tick_',
  },
  {
    id: 'step_4_teach_sign_code',
    short: 'מספרי תמרורים',
    he: 'סמן 5–10 דוגמאות של מספרי תמרורים ליד עמודים.',
    en: 'Mark 5–10 examples of sign code numbers near poles.',
    tool: 'rect_small',
    labelType: 'sign_code_text',
    geometryType: 'rectangle',
    minExamples: 5,
    maxExamples: 10,
    idPrefix: 'te_code_',
  },
  {
    id: 'step_5_teach_sign_symbol',
    short: 'סמלי תמרורים (אופציונלי)',
    he: 'סמן 5–10 דוגמאות של הסימון הגרפי של התמרור עצמו, אם הוא מופיע בתוכנית.',
    en: 'Mark 5–10 examples of the sign\'s visual symbol, if it appears on the plan.',
    tool: 'rect_medium',
    labelType: 'sign_symbol',
    geometryType: 'rectangle',
    minExamples: 0,
    maxExamples: 10,
    optional: true,
    idPrefix: 'te_symbol_',
  },
];

const TOOL_COLORS = {
  point: '#00aa00',
  line: '#dd9900',
  rect_small: '#0066dd',
  rect_medium: '#9900cc',
};

const TOOL_HOTKEYS = {
  P: 'point',
  T: 'line',
  C: 'rect_small',
  S: 'rect_medium',
};

// ---------------------------------------------------------------
// Application state
// ---------------------------------------------------------------

const App = {
  // Image
  imageInfo: null,           // {width, height, dpi, plan_id, page_number, filename}
  konvaImage: null,          // Konva.Image instance

  // Konva
  stage: null,
  imageLayer: null,
  markingsLayer: null,

  // Wizard
  currentStepId: STEPS[0].id,
  examples: {},              // { stepId: [exampleObj, ...] }

  // Active tool
  currentTool: null,         // 'point' | 'line' | 'rect_small' | 'rect_medium' | null

  // Drawing state
  drawing: false,
  startPos: null,            // {x, y} in image-px
  tempShape: null,

  // Save state
  saveTimer: null,
  saveStatus: 'idle',        // 'idle' | 'saving' | 'saved' | 'error'

  // Counters (per id prefix) for stable example IDs
  counters: {},
};

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------

async function boot() {
  buildWizardPanel();
  buildToolbar();

  // Load image-info first
  const info = await fetchJSON('/image-info');
  if (info && info.width > 0) {
    App.imageInfo = info;
  }

  // Try to load existing examples; if file empty, initialize blank
  const ex = await fetchJSON('/examples');
  if (ex && !ex.empty && ex.steps) {
    // Hydrate state from existing file
    hydrateFromFile(ex);
    renderAllMarkings();
  } else {
    initBlankExamples();
  }

  // Wire first-screen button
  document.getElementById('loadImageBtn').addEventListener('click', loadImageAndInit);

  // Keyboard shortcuts
  window.addEventListener('keydown', onKeyDown);

  refreshWizard();
  refreshToolbar();
  refreshStageInfo();
}

async function loadImageAndInit() {
  document.getElementById('firstScreen').classList.add('hidden');
  // Refresh info in case it was rendered between page load and click
  const info = await fetchJSON('/image-info');
  if (!info || !info.width) {
    alert('לא נמצאה תמונה בתיקיית הריצה. בדוק את --plan-run-dir.');
    return;
  }
  App.imageInfo = info;
  await initStage(info);
  refreshStageInfo();
}

// ---------------------------------------------------------------
// Konva stage setup
// ---------------------------------------------------------------

async function initStage(info) {
  const container = document.getElementById('stage-container');
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  App.stage = new Konva.Stage({
    container: 'stage-container',
    width: cw,
    height: ch,
    draggable: false,  // we control panning manually via tools
  });

  App.imageLayer = new Konva.Layer({ listening: false });
  App.markingsLayer = new Konva.Layer();
  App.stage.add(App.imageLayer);
  App.stage.add(App.markingsLayer);

  // Load the plan image
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = '/image';
  });
  App.konvaImage = new Konva.Image({
    image: img, x: 0, y: 0,
    width: info.width, height: info.height,
    listening: false,
  });
  App.imageLayer.add(App.konvaImage);

  // Fit to view
  const scale = Math.min(cw / info.width, ch / info.height) * 0.95;
  App.stage.scale({ x: scale, y: scale });
  App.stage.position({
    x: (cw - info.width * scale) / 2,
    y: (ch - info.height * scale) / 2,
  });
  App.stage.batchDraw();

  // Wire interactions
  wireStageEvents();

  // Render any pre-existing markings (from hydrated file)
  renderAllMarkings();

  // Resize handler
  window.addEventListener('resize', () => {
    const c = document.getElementById('stage-container');
    App.stage.size({ width: c.clientWidth, height: c.clientHeight });
    App.stage.batchDraw();
  });
}

// ---------------------------------------------------------------
// Mouse + tool dispatcher
// ---------------------------------------------------------------

function wireStageEvents() {
  // Wheel zoom — zoom around cursor
  App.stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const oldScale = App.stage.scaleX();
    const pointer = App.stage.getPointerPosition();
    const stagePoint = {
      x: (pointer.x - App.stage.x()) / oldScale,
      y: (pointer.y - App.stage.y()) / oldScale,
    };
    const factor = e.evt.deltaY > 0 ? 1 / 1.12 : 1.12;
    const newScale = clamp(oldScale * factor, 0.05, 10);
    App.stage.scale({ x: newScale, y: newScale });
    App.stage.position({
      x: pointer.x - stagePoint.x * newScale,
      y: pointer.y - stagePoint.y * newScale,
    });
    App.stage.batchDraw();
    refreshToolbar();
  });

  // Mouse handlers — route based on currentTool
  App.stage.on('mousedown touchstart', onPointerDown);
  App.stage.on('mousemove touchmove', onPointerMove);
  App.stage.on('mouseup touchend', onPointerUp);

  // Pan when no tool active (right-button or middle-button drag, OR primary
  // drag if currentTool is null). To keep Slice 1 simple, pan is achieved by
  // holding Space and dragging.
  let spaceHeld = false;
  let panStart = null;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { spaceHeld = true; document.body.style.cursor = 'grab'; }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceHeld = false; document.body.style.cursor = ''; panStart = null; }
  });
  App.stage.on('mousedown', (e) => {
    if (spaceHeld) {
      panStart = App.stage.getPointerPosition();
      document.body.style.cursor = 'grabbing';
    }
  });
  App.stage.on('mousemove', (e) => {
    if (spaceHeld && panStart) {
      const p = App.stage.getPointerPosition();
      App.stage.position({
        x: App.stage.x() + (p.x - panStart.x),
        y: App.stage.y() + (p.y - panStart.y),
      });
      panStart = p;
      App.stage.batchDraw();
    }
  });
  App.stage.on('mouseup', () => {
    if (spaceHeld) { panStart = null; document.body.style.cursor = 'grab'; }
  });
}

function onPointerDown(e) {
  if (!App.currentTool || isPanning()) return;
  const pos = imagePos();
  if (!pos) return;
  const tool = App.currentTool;
  if (tool === 'point') {
    // Single-click commit
    addPointMarking(pos);
  } else {
    // Drag-based tools: start a temp shape
    App.drawing = true;
    App.startPos = pos;
    const color = TOOL_COLORS[tool];
    if (tool === 'line') {
      App.tempShape = new Konva.Line({
        points: [pos.x, pos.y, pos.x, pos.y],
        stroke: color, strokeWidth: 2,
        listening: false,
      });
    } else { // rect_small / rect_medium
      App.tempShape = new Konva.Rect({
        x: pos.x, y: pos.y, width: 0, height: 0,
        stroke: color, strokeWidth: 2,
        dash: [4, 3],
        listening: false,
      });
    }
    App.markingsLayer.add(App.tempShape);
  }
}

function onPointerMove(e) {
  if (!App.drawing || !App.tempShape) return;
  const pos = imagePos();
  if (!pos) return;
  const tool = App.currentTool;
  if (tool === 'line') {
    App.tempShape.points([App.startPos.x, App.startPos.y, pos.x, pos.y]);
  } else if (tool === 'rect_small' || tool === 'rect_medium') {
    App.tempShape.position({
      x: Math.min(App.startPos.x, pos.x),
      y: Math.min(App.startPos.y, pos.y),
    });
    App.tempShape.size({
      width: Math.abs(pos.x - App.startPos.x),
      height: Math.abs(pos.y - App.startPos.y),
    });
  }
  App.markingsLayer.batchDraw();
}

function onPointerUp(e) {
  if (!App.drawing || !App.tempShape) return;
  const tool = App.currentTool;
  const endPos = imagePos() || App.startPos;
  App.drawing = false;
  // Validate minimum size
  if (tool === 'line') {
    const dx = endPos.x - App.startPos.x;
    const dy = endPos.y - App.startPos.y;
    if (dx * dx + dy * dy < 16) {
      App.tempShape.destroy(); App.tempShape = null; App.markingsLayer.draw();
      return;
    }
    addLineMarking(App.startPos, endPos);
  } else {
    const w = Math.abs(endPos.x - App.startPos.x);
    const h = Math.abs(endPos.y - App.startPos.y);
    if (w < 4 || h < 4) {
      App.tempShape.destroy(); App.tempShape = null; App.markingsLayer.draw();
      return;
    }
    const x0 = Math.min(App.startPos.x, endPos.x);
    const y0 = Math.min(App.startPos.y, endPos.y);
    addRectMarking(x0, y0, w, h);
  }
  // Discard the temp shape; the marking is re-rendered as a permanent shape.
  App.tempShape.destroy(); App.tempShape = null;
  App.markingsLayer.draw();
}

// ---------------------------------------------------------------
// Marking adders — push to App.examples + render permanent shape + save
// ---------------------------------------------------------------

function addPointMarking(pos) {
  const step = currentStep();
  if (step.tool !== 'point') return;
  const id = nextId(step.idPrefix);
  const ex = {
    training_example_id: id,
    geometry: { type: 'point', x: round(pos.x), y: round(pos.y), radius: 8 },
    confidence_source: 'human_labeled',
    scope: 'current_plan_only',
    created_at: nowIso(),
    audit_notes: '',
  };
  pushExample(step.id, ex);
  drawMarking(step, ex);
  queueSave();
}

function addLineMarking(p0, p1) {
  const step = currentStep();
  if (step.tool !== 'line') return;
  const id = nextId(step.idPrefix);
  const ex = {
    training_example_id: id,
    geometry: { type: 'line', x0: round(p0.x), y0: round(p0.y), x1: round(p1.x), y1: round(p1.y) },
    confidence_source: 'human_labeled',
    scope: 'current_plan_only',
    created_at: nowIso(),
    audit_notes: '',
  };
  pushExample(step.id, ex);
  drawMarking(step, ex);
  queueSave();
}

function addRectMarking(x0, y0, w, h) {
  const step = currentStep();
  if (step.tool !== 'rect_small' && step.tool !== 'rect_medium') return;
  const id = nextId(step.idPrefix);
  const ex = {
    training_example_id: id,
    geometry: { type: 'rectangle', x0: round(x0), y0: round(y0), x1: round(x0 + w), y1: round(y0 + h) },
    confidence_source: 'human_labeled',
    scope: 'current_plan_only',
    created_at: nowIso(),
    audit_notes: '',
  };
  pushExample(step.id, ex);
  drawMarking(step, ex);
  queueSave();
}

function pushExample(stepId, ex) {
  if (!App.examples[stepId]) App.examples[stepId] = [];
  App.examples[stepId].push(ex);
  refreshWizard();
}

function removeExample(stepId, exampleId) {
  if (!App.examples[stepId]) return;
  App.examples[stepId] = App.examples[stepId].filter(e => e.training_example_id !== exampleId);
  // Remove the shape from the canvas
  const shape = App.markingsLayer.findOne('#' + exampleId);
  if (shape) shape.destroy();
  App.markingsLayer.draw();
  refreshWizard();
  queueSave();
}

function drawMarking(step, ex) {
  const color = TOOL_COLORS[step.tool];
  const id = ex.training_example_id;
  const g = ex.geometry;
  let shape;
  if (g.type === 'point') {
    shape = new Konva.Circle({
      id, x: g.x, y: g.y, radius: g.radius || 8,
      stroke: color, strokeWidth: 2,
      fill: hexToRgba(color, 0.18),
    });
  } else if (g.type === 'line') {
    shape = new Konva.Line({
      id, points: [g.x0, g.y0, g.x1, g.y1],
      stroke: color, strokeWidth: 3,
    });
  } else if (g.type === 'rectangle') {
    shape = new Konva.Rect({
      id, x: g.x0, y: g.y0,
      width: g.x1 - g.x0, height: g.y1 - g.y0,
      stroke: color, strokeWidth: 2,
      fill: hexToRgba(color, 0.10),
    });
  }
  if (!shape) return;
  shape.listening(false); // Slice 1: no selection/edit yet
  App.markingsLayer.add(shape);
  App.markingsLayer.batchDraw();
}

function renderAllMarkings() {
  if (!App.markingsLayer) return;
  App.markingsLayer.destroyChildren();
  for (const step of STEPS) {
    const list = App.examples[step.id] || [];
    for (const ex of list) drawMarking(step, ex);
  }
  App.markingsLayer.draw();
}

// ---------------------------------------------------------------
// Wizard panel
// ---------------------------------------------------------------

function buildWizardPanel() {
  const wiz = document.getElementById('wizard');
  wiz.innerHTML = '';
  STEPS.forEach((step, idx) => {
    const div = document.createElement('div');
    div.className = 'step';
    div.dataset.stepId = step.id;
    div.innerHTML = `
      <div class="step-head"><span>${idx + 2}. ${step.short}</span><span class="count" data-count></span></div>
      <div class="he">${step.he}</div>
      <div class="en">${step.en}${step.optional ? ' <i>(optional)</i>' : ''}</div>
      <div class="progress" data-progress><div class="bar"></div></div>
      <div class="marking-log" data-log></div>
      <button class="primary" data-activate>Activate this step</button>
      ${step.optional ? '<button class="secondary" data-skip>Skip</button>' : ''}
    `;
    div.querySelector('[data-activate]').addEventListener('click', () => setCurrentStep(step.id));
    if (step.optional) {
      div.querySelector('[data-skip]').addEventListener('click', () => {
        // Mark complete via UI by advancing past it
        const nextIdx = STEPS.findIndex(s => s.id === step.id) + 1;
        if (nextIdx < STEPS.length) setCurrentStep(STEPS[nextIdx].id);
      });
    }
    wiz.appendChild(div);
  });

  // "Run detection" hint
  const apply = document.createElement('div');
  apply.className = 'step';
  apply.innerHTML = `
    <div class="step-head"><span>7. החל דפוס נלמד</span></div>
    <div class="he">החל את הדפוס הנלמד והפעל את הסורק.</div>
    <div class="en">When ready_for_apply=true, run script 37 in a terminal:</div>
    <pre style="font-size:11px;background:#f4f4f4;padding:6px;border-radius:4px;overflow-x:auto;">.venv/bin/python 37_manual_visual_training_poc.py \\
  --plan-run-dir &lt;run-dir&gt; \\
  --wizard-examples &lt;run-dir&gt;/outputs/manual_training/visual_training_examples.wizard.json</pre>
  `;
  wiz.appendChild(apply);
}

function setCurrentStep(stepId) {
  App.currentStepId = stepId;
  const step = currentStep();
  setTool(step.tool);
  refreshWizard();
}

function refreshWizard() {
  const wiz = document.getElementById('wizard');
  STEPS.forEach(step => {
    const card = wiz.querySelector(`[data-step-id="${step.id}"]`);
    if (!card) return;
    const list = App.examples[step.id] || [];
    const n = list.length;
    const min = step.minExamples;
    const isActive = step.id === App.currentStepId;
    const isDone = (min === 0 && step.optional) || n >= min;
    card.classList.toggle('active', isActive);
    card.classList.toggle('done', isDone);
    card.querySelector('[data-count]').textContent =
      step.optional && min === 0
        ? `${n} (optional)`
        : `${n}/${min}`;
    const bar = card.querySelector('[data-progress] .bar');
    const pct = min === 0 ? (n > 0 ? 100 : 0) : Math.min(100, (n / min) * 100);
    bar.style.width = pct + '%';
    card.querySelector('[data-progress]').classList.toggle('done', isDone);
    const log = card.querySelector('[data-log]');
    log.innerHTML = '';
    list.forEach(ex => {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `<span>${ex.training_example_id} ${describeGeometry(ex.geometry)}</span>` +
                       `<button title="Delete">×</button>`;
      item.querySelector('button').addEventListener('click', () => removeExample(step.id, ex.training_example_id));
      log.appendChild(item);
    });
    const btn = card.querySelector('[data-activate]');
    btn.textContent = isActive ? '✓ Active' : 'Activate this step';
    btn.disabled = isActive;
  });
}

function describeGeometry(g) {
  if (g.type === 'point') return `point (${g.x}, ${g.y})`;
  if (g.type === 'line')  return `line (${g.x0}, ${g.y0}) → (${g.x1}, ${g.y1})`;
  if (g.type === 'rectangle') return `rect ${g.x1 - g.x0}×${g.y1 - g.y0}`;
  return g.type;
}

function currentStep() {
  return STEPS.find(s => s.id === App.currentStepId) || STEPS[0];
}

// ---------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------

function buildToolbar() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = '';
  const tools = [
    { id: 'point', label: 'P · עמוד (point)' },
    { id: 'line', label: 'T · טיק (line)' },
    { id: 'rect_small', label: 'C · קוד (rect)' },
    { id: 'rect_medium', label: 'S · סמל (rect)' },
  ];
  tools.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.tool = t.id;
    b.textContent = t.label;
    b.addEventListener('click', () => setTool(t.id));
    tb.appendChild(b);
  });
  const sep = document.createElement('div');
  sep.className = 'sep';
  tb.appendChild(sep);
  const hint = document.createElement('span');
  hint.className = 'zoom';
  hint.textContent = 'Wheel = zoom · Space+drag = pan';
  tb.appendChild(hint);
  const zoom = document.createElement('span');
  zoom.className = 'zoom';
  zoom.id = 'zoomLabel';
  zoom.textContent = '100%';
  tb.appendChild(zoom);

  const save = document.createElement('span');
  save.className = 'save-status';
  save.id = 'saveStatus';
  save.textContent = '';
  tb.appendChild(save);

  const download = document.createElement('button');
  download.className = 'action';
  download.textContent = 'Download JSON';
  download.addEventListener('click', downloadJSON);
  tb.appendChild(download);
}

function setTool(toolId) {
  App.currentTool = toolId;
  refreshToolbar();
  // Cursor hint
  if (toolId) document.body.style.cursor = 'crosshair';
  else document.body.style.cursor = '';
}

function refreshToolbar() {
  document.querySelectorAll('.toolbar .tool').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === App.currentTool);
  });
  const zoom = document.getElementById('zoomLabel');
  if (zoom && App.stage) zoom.textContent = Math.round(App.stage.scaleX() * 100) + '%';
}

// ---------------------------------------------------------------
// Stage info footer
// ---------------------------------------------------------------

function refreshStageInfo() {
  const el = document.getElementById('stageInfo');
  if (!el) return;
  if (!App.imageInfo) {
    el.textContent = 'No image loaded';
    return;
  }
  const info = App.imageInfo;
  const total = STEPS.reduce((acc, s) => acc + (App.examples[s.id]?.length || 0), 0);
  el.innerHTML =
    `<span>Plan: <b>${escapeHtml(info.plan_id)}</b></span>` +
    `<span>Page ${info.page_number} · ${info.width}×${info.height}px @ ${info.dpi} DPI</span>` +
    `<span>Total markings: ${total}</span>`;
}

// ---------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------

function onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toUpperCase();
  if (TOOL_HOTKEYS[key]) {
    setTool(TOOL_HOTKEYS[key]);
    e.preventDefault();
  } else if (key === 'ESCAPE') {
    setTool(null);
  }
}

// ---------------------------------------------------------------
// Persistence — save to local Python helper
// ---------------------------------------------------------------

function buildPayload() {
  const stepsOut = {};
  STEPS.forEach((s, idx) => {
    stepsOut[s.id] = {
      order: idx + 2,
      label_type: s.labelType,
      geometry_type: s.geometryType,
      min_examples: s.minExamples,
      max_examples: s.maxExamples,
      optional: !!s.optional,
      prompt_he: s.he,
      prompt_en: s.en,
      examples: App.examples[s.id] || [],
    };
  });
  // Wizard state
  const completed = STEPS.filter(s => {
    const n = (App.examples[s.id] || []).length;
    return (s.optional && s.minExamples === 0) || n >= s.minExamples;
  }).map(s => s.id);
  const required = STEPS.filter(s => !s.optional).map(s => s.id);
  const readyForApply = required.every(id => completed.includes(id));
  return {
    schema_version: '3.0',
    engine: 'engine_c_v0.3_manual_first',
    wizard_version: '2.0',
    plan_id: App.imageInfo?.plan_id || null,
    page_number: App.imageInfo?.page_number ?? 0,
    image_dpi: App.imageInfo?.dpi ?? 150,
    image_path: App.imageInfo?.path || null,
    image_size_px: App.imageInfo ? [App.imageInfo.width, App.imageInfo.height] : null,
    image_source: 'rendered_from_pdf',
    author: 'research_annotator_slice1',
    purpose: 'Created by the local research annotator (Engine C v0.3 Slice 1). Mark-and-save workflow.',
    wizard_state: {
      current_step: 'step_7_apply_learning',
      steps_completed: completed,
      ready_for_apply: readyForApply,
    },
    steps: stepsOut,
    supporting_examples: { ignore_regions: [], noise_background: [] },
  };
}

function queueSave() {
  if (App.saveTimer) clearTimeout(App.saveTimer);
  setSaveStatus('saving');
  App.saveTimer = setTimeout(async () => {
    try {
      const payload = buildPayload();
      const res = await fetch('/examples', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setSaveStatus('saved');
    } catch (e) {
      console.error('save failed', e);
      setSaveStatus('error');
    }
  }, 250);
}

function setSaveStatus(s) {
  App.saveStatus = s;
  const el = document.getElementById('saveStatus');
  if (!el) return;
  if (s === 'saving') el.textContent = '· saving…';
  else if (s === 'saved') el.textContent = '· saved ✓';
  else if (s === 'error') el.textContent = '· save error';
  else el.textContent = '';
}

function downloadJSON() {
  const payload = buildPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'visual_training_examples.wizard.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------
// Existing-file hydration
// ---------------------------------------------------------------

function initBlankExamples() {
  App.examples = {};
  STEPS.forEach(s => { App.examples[s.id] = []; });
  App.counters = {};
}

function hydrateFromFile(file) {
  initBlankExamples();
  if (!file.steps) return;
  STEPS.forEach(step => {
    const fileStep = file.steps[step.id];
    if (fileStep && Array.isArray(fileStep.examples)) {
      App.examples[step.id] = fileStep.examples.slice();
      // Update counter so new IDs don't collide
      fileStep.examples.forEach(ex => {
        const m = ex.training_example_id?.match(/_(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          App.counters[step.idPrefix] = Math.max(App.counters[step.idPrefix] || 0, n);
        }
      });
    }
  });
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function isPanning() { return document.body.style.cursor === 'grab' || document.body.style.cursor === 'grabbing'; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round(v) { return Math.round(v); }
function nowIso() { return new Date().toISOString(); }

function nextId(prefix) {
  App.counters[prefix] = (App.counters[prefix] || 0) + 1;
  return prefix + String(App.counters[prefix]).padStart(3, '0');
}

function imagePos() {
  // Pointer in image-pixel space (stage local coords)
  const p = App.stage.getRelativePointerPosition();
  if (!p) return null;
  if (!App.imageInfo) return p;
  // Clip to image bounds (we don't want markings outside the image)
  if (p.x < 0 || p.y < 0 || p.x > App.imageInfo.width || p.y > App.imageInfo.height) {
    return null;
  }
  return p;
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------------------------------------------------------------
// Go
// ---------------------------------------------------------------

document.addEventListener('DOMContentLoaded', boot);
