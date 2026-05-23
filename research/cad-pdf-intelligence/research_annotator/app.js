/* Plan Scanner — Manual Training Annotator (Engine C v0.3, Slice 2)
 *
 * The marker/annotation tool is the CORE TEACHING INTERFACE of the Manual
 * Training Agent. Every marking captures geometry + label_type + a free
 * Hebrew description (`user_description`) + notes + scope. The user teaches
 * the scanner by marking objects on the plan and describing what they are.
 *
 * Slice 2 adds:
 *   - Detail panel (label_type editable, user_description, user_notes, scope,
 *     associated_pole_id, delete) — opens on create AND on selection
 *   - Selection (V tool, Shift+click while another tool is active)
 *   - Move/resize via Konva.Transformer (rects) or drag (points/polygons/lines)
 *   - Delete/Backspace removes selected; cascades to associations
 *   - Association tool (A): two-click pole↔code or pole↔symbol; dashed line
 *   - Polygon tool (G): sequential clicks; Enter/double-click to close;
 *     for ignore_region / noise_background
 *   - Persists all of the above in visual_training_examples.wizard.json
 */
'use strict';

// ====================================================================
// Wizard steps (mirrors PLAN_SCANNER_MANUAL_TRAINING_AGENT_SPEC.md §3)
// ====================================================================
const STEPS = [
  { id: 'step_2_teach_pole_appearance', short: 'עמודים',
    he: 'סמן 5–10 דוגמאות של עמודי תמרור בתוכנית.',
    en: 'Mark 5–10 examples of sign poles in the plan.',
    tool: 'point', labelType: 'pole_dot', geometryType: 'point',
    minExamples: 5, maxExamples: 10, idPrefix: 'te_pole_' },
  { id: 'step_3_teach_sign_count', short: 'כמות תמרורים',
    he: 'סמן 5–10 דוגמאות שמראות איך התוכנית מציינת כמה תמרורים נמצאים על עמוד.',
    en: 'Mark 5–10 examples of how the plan indicates how many signs are on a pole.',
    tool: 'line', labelType: 'sign_count_tick', geometryType: 'line',
    minExamples: 5, maxExamples: 10, idPrefix: 'te_tick_' },
  { id: 'step_4_teach_sign_code', short: 'מספרי תמרורים',
    he: 'סמן 5–10 דוגמאות של מספרי תמרורים ליד עמודים.',
    en: 'Mark 5–10 examples of sign code numbers near poles.',
    tool: 'rect_small', labelType: 'sign_code_text', geometryType: 'rectangle',
    minExamples: 5, maxExamples: 10, idPrefix: 'te_code_' },
  { id: 'step_5_teach_sign_symbol', short: 'סמלי תמרורים (אופציונלי)',
    he: 'סמן 5–10 דוגמאות של הסימון הגרפי של התמרור עצמו, אם הוא מופיע בתוכנית.',
    en: 'Mark 5–10 examples of the sign\'s visual symbol, if it appears on the plan.',
    tool: 'rect_medium', labelType: 'sign_symbol', geometryType: 'rectangle',
    minExamples: 0, maxExamples: 10, optional: true, idPrefix: 'te_symbol_' },
];

// Step 6 is the associations bucket (separate from the per-tool steps above).
const STEP6_ID = 'step_6_teach_associations';

// All label_types from the spec — the user can pick any of these from the
// per-marking dropdown.
const LABEL_TYPES = [
  'pole_dot', 'sign_count_tick', 'sign_code_text', 'sign_symbol',
  'pole_to_code_association', 'pole_to_symbol_association',
  'number_of_signs_on_pole',
  'ignore_region', 'noise_background', 'wrong_detection',
];

// Per-tool default colors (display only; label_type can be edited per marking)
const TOOL_COLORS = {
  point: '#00aa00',
  line:  '#dd9900',
  rect_small:  '#0066dd',
  rect_medium: '#9900cc',
  polygon: '#cc0000',
  association: '#c80',
};
// Default color when we don't know the tool (e.g. by label_type during hydration)
const LABEL_COLORS = {
  pole_dot:                       '#00aa00',
  sign_count_tick:                '#dd9900',
  sign_code_text:                 '#0066dd',
  sign_symbol:                    '#9900cc',
  pole_to_code_association:       '#c80',
  pole_to_symbol_association:     '#c80',
  number_of_signs_on_pole:        '#888',
  ignore_region:                  '#cc0000',
  noise_background:               '#c33',
  wrong_detection:                '#c33',
};

const TOOL_HOTKEYS = {
  V: 'select',
  P: 'point',
  T: 'line',
  C: 'rect_small',
  S: 'rect_medium',
  A: 'association',
  G: 'polygon',
};

// Which labels are pole-like (valid as the 1st step of association tool)
const POLE_LABELS = new Set(['pole_dot']);
const CODE_OR_SYMBOL_LABELS = new Set(['sign_code_text', 'sign_symbol']);

// ====================================================================
// State
// ====================================================================
const App = {
  imageInfo: null,
  konvaImage: null,

  stage: null,
  imageLayer: null,
  markingsLayer: null,
  uiLayer: null,
  transformer: null,

  // All examples by step bucket (steps 2-5 hold their typed examples; step 6
  // holds associations; supporting_examples.ignore_regions holds polygons)
  examples: {},                    // { stepId: [ex, ...] }
  associations: [],                // [ex, ...]
  ignoreRegions: [],               // [ex, ...]  (polygons go here)
  noiseRegions: [],                // [ex, ...]
  counters: {},                    // {prefix: lastUsedInt}

  currentTool: null,               // 'select' | 'point' | 'line' | 'rect_small' | ... | null
  currentStepId: STEPS[0].id,

  // Drawing state for tools that need a "start"
  drawing: false,
  startPos: null,
  tempShape: null,

  // Association tool state
  assocFirstId: null,              // training_example_id of 1st-clicked shape

  // Polygon tool state
  polygonPoints: [],               // [{x, y}, ...] in image px
  polygonPreviewLine: null,
  polygonPreviewVertices: null,

  // Selection
  selectedId: null,                // training_example_id of selected marking
  selectedKind: null,              // 'example' | 'association' | 'ignore' | 'noise'

  // Save state
  saveTimer: null,
  saveStatus: 'idle',

  // Modifier key tracking
  shiftHeld: false,
  spaceHeld: false,
  panStart: null,

  // ----- Slice 3 — Close the teaching loop -----
  mode: 'edit',                       // 'edit' | 'review'
  detection: null,                    // { jobId, status, currentStep, stdoutTail, exitCode, ... }
  detectionPollTimer: null,
  candidates: [],                     // visual_agent_candidates.json → candidates
  reviewQuestions: [],                // visual_review_questions.json → questions
  reviewAnswers: {},                  // {review_question_id: answerObj}
  activeQuestionIdx: 0,
  correctingQuestionId: null,         // when user clicked "Correct" — return to this Q after edits
};

// ====================================================================
// Boot
// ====================================================================
async function boot() {
  buildWizardPanel();
  buildToolbar();
  wireDetailPanel();
  wireReviewPanel();
  wireGlobalKeys();

  const info = await fetchJSON('/image-info');
  if (info && info.width > 0) App.imageInfo = info;

  const ex = await fetchJSON('/examples');
  if (ex && !ex.empty && (ex.steps || ex.supporting_examples)) {
    hydrateFromFile(ex);
  } else {
    initBlankExamples();
  }

  // Slice 3: hydrate any prior review session
  await hydrateReviewState();

  document.getElementById('loadImageBtn').addEventListener('click', loadImageAndInit);
  refreshWizard();
  refreshToolbar();
  refreshStageInfo();
  refreshRunButton();
}

async function loadImageAndInit() {
  document.getElementById('firstScreen').classList.add('hidden');
  const info = await fetchJSON('/image-info');
  if (!info || !info.width) {
    alert('לא נמצאה תמונה בתיקיית הריצה. בדוק את --plan-run-dir.');
    return;
  }
  App.imageInfo = info;
  await initStage(info);
  renderAllMarkings();
  refreshStageInfo();
  refreshAssocPoleDropdown();
}

// ====================================================================
// Konva stage
// ====================================================================
async function initStage(info) {
  const container = document.getElementById('stage-container');
  const cw = container.clientWidth, ch = container.clientHeight;

  App.stage = new Konva.Stage({
    container: 'stage-container',
    width: cw, height: ch,
    draggable: false,
  });
  App.imageLayer = new Konva.Layer({ listening: false });
  App.markingsLayer = new Konva.Layer();
  App.uiLayer = new Konva.Layer();
  App.stage.add(App.imageLayer, App.markingsLayer, App.uiLayer);

  // Load image
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    img.onload = resolve; img.onerror = reject; img.src = '/image';
  });
  App.konvaImage = new Konva.Image({
    image: img, x: 0, y: 0,
    width: info.width, height: info.height, listening: false,
  });
  App.imageLayer.add(App.konvaImage);

  // Transformer for selected shapes (only attached when something is selected)
  App.transformer = new Konva.Transformer({
    rotateEnabled: false,
    keepRatio: false,
    borderStroke: '#2a72d4',
    borderStrokeWidth: 2,
    anchorStroke: '#2a72d4',
    anchorFill: '#fff',
    anchorSize: 8,
  });
  App.uiLayer.add(App.transformer);

  // Fit to view
  const scale = Math.min(cw / info.width, ch / info.height) * 0.95;
  App.stage.scale({ x: scale, y: scale });
  App.stage.position({
    x: (cw - info.width * scale) / 2,
    y: (ch - info.height * scale) / 2,
  });
  App.stage.batchDraw();

  wireStageEvents();

  window.addEventListener('resize', () => {
    const c = document.getElementById('stage-container');
    App.stage.size({ width: c.clientWidth, height: c.clientHeight });
    App.stage.batchDraw();
  });
}

function wireStageEvents() {
  // Wheel zoom around cursor
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

  App.stage.on('mousedown touchstart', onPointerDown);
  App.stage.on('mousemove touchmove', onPointerMove);
  App.stage.on('mouseup touchend', onPointerUp);
  App.stage.on('dblclick dbltap', onDoubleClick);
}

// ====================================================================
// Pointer dispatch — handles every tool + Shift+click select shortcut
// ====================================================================
function onPointerDown(e) {
  // Space-pan
  if (App.spaceHeld) {
    App.panStart = App.stage.getPointerPosition();
    document.body.style.cursor = 'grabbing';
    return;
  }

  // Shift+click on any shape → select that shape, irrespective of active tool
  if (App.shiftHeld && e.target !== App.stage) {
    const id = shapeIdAt(e.target);
    if (id) {
      selectById(id);
      return;
    }
  }

  // Polygon tool: each click adds a vertex
  if (App.currentTool === 'polygon') {
    const pos = imagePos();
    if (!pos) return;
    pushPolygonVertex(pos);
    return;
  }

  // Association tool: each click picks a shape
  if (App.currentTool === 'association') {
    const id = shapeIdAt(e.target);
    if (!id) {
      flash('בחר סימון קיים (לא ריקות) לחיבור / Click an existing marking');
      return;
    }
    handleAssociationPick(id);
    return;
  }

  // Select tool: clicking a shape selects it; clicking empty deselects
  if (App.currentTool === 'select' || !App.currentTool) {
    if (e.target === App.stage || e.target === App.konvaImage) {
      deselectAll();
      return;
    }
    const id = shapeIdAt(e.target);
    if (id) {
      selectById(id);
    }
    return;
  }

  // Drawing tools (point/line/rect_small/rect_medium)
  const pos = imagePos();
  if (!pos) return;
  const tool = App.currentTool;
  if (tool === 'point') {
    addPointMarking(pos);
  } else {
    App.drawing = true;
    App.startPos = pos;
    const color = TOOL_COLORS[tool];
    if (tool === 'line') {
      App.tempShape = new Konva.Line({
        points: [pos.x, pos.y, pos.x, pos.y],
        stroke: color, strokeWidth: 2, dash: [4, 3], listening: false,
      });
    } else {
      App.tempShape = new Konva.Rect({
        x: pos.x, y: pos.y, width: 0, height: 0,
        stroke: color, strokeWidth: 2, dash: [4, 3], listening: false,
      });
    }
    App.markingsLayer.add(App.tempShape);
  }
}

function onPointerMove(e) {
  if (App.spaceHeld && App.panStart) {
    const p = App.stage.getPointerPosition();
    App.stage.position({
      x: App.stage.x() + (p.x - App.panStart.x),
      y: App.stage.y() + (p.y - App.panStart.y),
    });
    App.panStart = p;
    App.stage.batchDraw();
    return;
  }
  // Update temp draw shape
  if (App.drawing && App.tempShape) {
    const pos = imagePos(); if (!pos) return;
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
    return;
  }
  // Polygon preview (rubber-band from last vertex to cursor)
  if (App.currentTool === 'polygon' && App.polygonPoints.length > 0) {
    const pos = imagePos();
    if (pos && App.polygonPreviewLine) {
      const last = App.polygonPoints[App.polygonPoints.length - 1];
      App.polygonPreviewLine.points([last.x, last.y, pos.x, pos.y]);
      App.markingsLayer.batchDraw();
    }
  }
}

function onPointerUp(e) {
  if (App.spaceHeld) {
    App.panStart = null;
    document.body.style.cursor = 'grab';
    return;
  }
  if (!App.drawing || !App.tempShape) return;
  const tool = App.currentTool;
  const endPos = imagePos() || App.startPos;
  App.drawing = false;
  if (tool === 'line') {
    const dx = endPos.x - App.startPos.x, dy = endPos.y - App.startPos.y;
    if (dx * dx + dy * dy < 16) { App.tempShape.destroy(); App.tempShape = null; App.markingsLayer.draw(); return; }
    addLineMarking(App.startPos, endPos);
  } else {
    const w = Math.abs(endPos.x - App.startPos.x), h = Math.abs(endPos.y - App.startPos.y);
    if (w < 4 || h < 4) { App.tempShape.destroy(); App.tempShape = null; App.markingsLayer.draw(); return; }
    const x0 = Math.min(App.startPos.x, endPos.x), y0 = Math.min(App.startPos.y, endPos.y);
    addRectMarking(x0, y0, w, h);
  }
  App.tempShape.destroy(); App.tempShape = null;
  App.markingsLayer.draw();
}

function onDoubleClick(e) {
  if (App.currentTool === 'polygon') {
    closePolygon();
  }
}

// ====================================================================
// Adding markings
// ====================================================================
function addPointMarking(pos) {
  const step = currentStep();
  const id = nextId(step.idPrefix);
  const ex = newExample({
    id, step,
    geometry: { type: 'point', x: round(pos.x), y: round(pos.y), radius: 8 },
    labelType: step.labelType,
  });
  App.examples[step.id].push(ex);
  drawExample(ex);
  selectById(id);
  queueSave();
  refreshWizard();
  recordCorrectionIfPending(id, step.labelType);
}

function addLineMarking(p0, p1) {
  const step = currentStep();
  const id = nextId(step.idPrefix);
  const ex = newExample({
    id, step,
    geometry: { type: 'line', x0: round(p0.x), y0: round(p0.y), x1: round(p1.x), y1: round(p1.y) },
    labelType: step.labelType,
  });
  App.examples[step.id].push(ex);
  drawExample(ex);
  selectById(id);
  queueSave();
  refreshWizard();
  recordCorrectionIfPending(id, step.labelType);
}

function addRectMarking(x0, y0, w, h) {
  const step = currentStep();
  const id = nextId(step.idPrefix);
  const ex = newExample({
    id, step,
    geometry: { type: 'rectangle', x0: round(x0), y0: round(y0), x1: round(x0 + w), y1: round(y0 + h) },
    labelType: step.labelType,
  });
  App.examples[step.id].push(ex);
  drawExample(ex);
  selectById(id);
  queueSave();
  refreshWizard();
  recordCorrectionIfPending(id, step.labelType);
}

function newExample({ id, step, geometry, labelType }) {
  return {
    training_example_id: id,
    page_number: App.imageInfo?.page_number ?? 0,
    label_type: labelType,
    label_value: '',
    geometry_type: geometry.type,
    geometry: geometry,
    user_description: '',
    user_notes: '',
    associated_pole_id: null,
    confidence_source: 'human_labeled',
    scope: 'current_plan_only',
    created_at: nowIso(),
    audit_notes: [],
    _step_bucket: step ? step.id : null,  // private, not persisted to file directly
  };
}

// ====================================================================
// Drawing markings on the canvas
// ====================================================================
function colorForExample(ex) {
  return LABEL_COLORS[ex.label_type] || '#888';
}

function drawExample(ex) {
  const g = ex.geometry;
  const color = colorForExample(ex);
  const id = ex.training_example_id;
  let shape;
  if (g.type === 'point') {
    shape = new Konva.Circle({
      id, x: g.x, y: g.y, radius: g.radius || 8,
      stroke: color, strokeWidth: 2,
      fill: hexToRgba(color, 0.18),
      draggable: true,
    });
  } else if (g.type === 'line') {
    shape = new Konva.Line({
      id, points: [g.x0, g.y0, g.x1, g.y1],
      stroke: color, strokeWidth: 3,
      draggable: true,
    });
  } else if (g.type === 'rectangle') {
    shape = new Konva.Rect({
      id, x: g.x0, y: g.y0,
      width: g.x1 - g.x0, height: g.y1 - g.y0,
      stroke: color, strokeWidth: 2,
      fill: hexToRgba(color, 0.10),
      draggable: true,
    });
  }
  if (!shape) return;
  shape._kind = 'example';
  attachDragHandlers(shape, ex);
  App.markingsLayer.add(shape);
  App.markingsLayer.batchDraw();
  return shape;
}

function drawAssociation(ex) {
  const g = ex.geometry;
  const from = findShapeById(g.from?.ref);
  const to = findShapeById(g.to?.ref);
  // Use centroids of referenced shapes if available, else stored coords
  const fxy = from ? shapeCentroid(from) : { x: g.from.x, y: g.from.y };
  const txy = to ? shapeCentroid(to) : { x: g.to.x, y: g.to.y };
  const color = LABEL_COLORS[ex.label_type] || '#c80';
  const line = new Konva.Line({
    id: ex.training_example_id,
    points: [fxy.x, fxy.y, txy.x, txy.y],
    stroke: color, strokeWidth: 2, dash: [8, 4],
    listening: true,
  });
  line._kind = 'association';
  line._fromId = g.from?.ref;
  line._toId = g.to?.ref;
  // Selectable but not draggable directly (drag its endpoints by dragging the
  // referenced shapes — handled in attachDragHandlers).
  App.markingsLayer.add(line);
  App.markingsLayer.batchDraw();
  return line;
}

function drawPolygon(ex) {
  const g = ex.geometry;
  if (!g.points || g.points.length < 3) return;
  const color = LABEL_COLORS[ex.label_type] || '#cc0000';
  const flat = [];
  g.points.forEach(p => { flat.push(p[0], p[1]); });
  const poly = new Konva.Line({
    id: ex.training_example_id,
    points: flat,
    closed: true,
    stroke: color, strokeWidth: 2,
    fill: hexToRgba(color, 0.12),
    draggable: true,
  });
  poly._kind = ex.label_type === 'noise_background' ? 'noise' : 'ignore';
  attachDragHandlers(poly, ex);
  App.markingsLayer.add(poly);
  App.markingsLayer.batchDraw();
  return poly;
}

function renderAllMarkings() {
  if (!App.markingsLayer) return;
  App.markingsLayer.destroyChildren();
  // 1. Examples (per step)
  for (const step of STEPS) {
    for (const ex of (App.examples[step.id] || [])) drawExample(ex);
  }
  // 2. Ignore polygons + noise polygons
  for (const ex of App.ignoreRegions) drawPolygon(ex);
  for (const ex of App.noiseRegions) drawPolygon(ex);
  // 3. Associations LAST so they sit on top
  for (const ex of App.associations) drawAssociation(ex);
  App.markingsLayer.draw();
}

function findShapeById(id) {
  if (!id || !App.markingsLayer) return null;
  return App.markingsLayer.findOne('#' + id);
}

function shapeCentroid(shape) {
  const cls = shape.getClassName();
  if (cls === 'Circle') return { x: shape.x(), y: shape.y() };
  if (cls === 'Rect') return { x: shape.x() + shape.width() / 2, y: shape.y() + shape.height() / 2 };
  if (cls === 'Line') {
    const pts = shape.points();
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; n++; }
    return { x: cx / Math.max(1, n), y: cy / Math.max(1, n) };
  }
  return { x: 0, y: 0 };
}

function attachDragHandlers(shape, ex) {
  shape.on('dragmove', () => {
    syncGeometryFromShape(shape, ex);
    // Update any association line that references this shape
    App.markingsLayer.find(n => n._kind === 'association' &&
        (n._fromId === ex.training_example_id || n._toId === ex.training_example_id))
      .forEach(line => syncAssociationLine(line));
    App.markingsLayer.batchDraw();
  });
  shape.on('dragend', () => queueSave());
  // Transformer end handler (for rect resize)
  shape.on('transformend', () => {
    // Bake scale into geometry
    const cls = shape.getClassName();
    if (cls === 'Rect') {
      const sx = shape.scaleX(), sy = shape.scaleY();
      shape.width(Math.max(2, shape.width() * sx));
      shape.height(Math.max(2, shape.height() * sy));
      shape.scaleX(1); shape.scaleY(1);
    }
    syncGeometryFromShape(shape, ex);
    queueSave();
  });
}

function syncGeometryFromShape(shape, ex) {
  const cls = shape.getClassName();
  const g = ex.geometry;
  if (cls === 'Circle') {
    g.x = round(shape.x()); g.y = round(shape.y());
  } else if (cls === 'Rect') {
    g.x0 = round(shape.x()); g.y0 = round(shape.y());
    g.x1 = round(shape.x() + shape.width());
    g.y1 = round(shape.y() + shape.height());
  } else if (cls === 'Line' && g.type === 'line') {
    // For line markings: drag translates the whole line
    const dx = shape.x(), dy = shape.y();
    if (dx !== 0 || dy !== 0) {
      g.x0 = round(g.x0 + dx); g.y0 = round(g.y0 + dy);
      g.x1 = round(g.x1 + dx); g.y1 = round(g.y1 + dy);
      shape.x(0); shape.y(0);
      shape.points([g.x0, g.y0, g.x1, g.y1]);
    }
  } else if (cls === 'Line' && g.type === 'polygon') {
    const dx = shape.x(), dy = shape.y();
    if (dx !== 0 || dy !== 0) {
      g.points = g.points.map(([x, y]) => [round(x + dx), round(y + dy)]);
      shape.x(0); shape.y(0);
      const flat = []; g.points.forEach(p => { flat.push(p[0], p[1]); });
      shape.points(flat);
    }
  }
}

function syncAssociationLine(line) {
  const from = findShapeById(line._fromId);
  const to = findShapeById(line._toId);
  if (!from || !to) return;
  const f = shapeCentroid(from), t = shapeCentroid(to);
  line.points([f.x, f.y, t.x, t.y]);
}

// ====================================================================
// Selection
// ====================================================================
function shapeIdAt(node) {
  while (node && node !== App.stage) {
    if (node.id && node.id()) return node.id();
    node = node.getParent && node.getParent();
  }
  return null;
}

function selectById(id) {
  const ex = findExampleById(id);
  if (!ex) return;
  App.selectedId = id;
  App.selectedKind = ex._kind;
  // Attach transformer for rectangles + lines (skip points + polygons + associations)
  const shape = findShapeById(id);
  if (shape) {
    const cls = shape.getClassName();
    if (cls === 'Rect') {
      App.transformer.nodes([shape]);
      App.transformer.enabledAnchors([
        'top-left', 'top-center', 'top-right', 'middle-right',
        'bottom-right', 'bottom-center', 'bottom-left', 'middle-left',
      ]);
    } else {
      App.transformer.nodes([]);  // no resize handles
    }
    App.uiLayer.draw();
  }
  openDetailPanel(ex);
}

function deselectAll() {
  App.selectedId = null;
  App.selectedKind = null;
  App.transformer.nodes([]);
  App.uiLayer.draw();
  closeDetailPanel();
}

function findExampleById(id) {
  for (const step of STEPS) {
    const ex = (App.examples[step.id] || []).find(e => e.training_example_id === id);
    if (ex) { ex._kind = 'example'; ex._step_bucket = step.id; return ex; }
  }
  let ex = App.associations.find(e => e.training_example_id === id);
  if (ex) { ex._kind = 'association'; return ex; }
  ex = App.ignoreRegions.find(e => e.training_example_id === id);
  if (ex) { ex._kind = 'ignore'; return ex; }
  ex = App.noiseRegions.find(e => e.training_example_id === id);
  if (ex) { ex._kind = 'noise'; return ex; }
  return null;
}

// ====================================================================
// Detail panel
// ====================================================================
function wireDetailPanel() {
  const closeBtn = document.getElementById('detailClose');
  const doneBtn = document.getElementById('detailDone');
  const deleteBtn = document.getElementById('detailDelete');
  closeBtn.addEventListener('click', () => deselectAll());
  doneBtn.addEventListener('click', () => deselectAll());
  deleteBtn.addEventListener('click', onDetailDelete);

  const fields = ['detailLabelType', 'detailLabelValue', 'detailDescription',
                  'detailNotes', 'detailAssocPole', 'detailScope'];
  fields.forEach(fid => {
    const el = document.getElementById(fid);
    if (!el) return;
    const fire = () => onDetailFieldChange();
    el.addEventListener('change', fire);
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text')) {
      el.addEventListener('input', fire);
    }
  });
}

function openDetailPanel(ex) {
  const panel = document.getElementById('detailPanel');
  const layout = document.getElementById('layout');
  panel.classList.remove('hidden');
  layout.classList.add('detail-open');
  panel.setAttribute('aria-hidden', 'false');

  document.getElementById('detailGeom').textContent = describeGeometry(ex.geometry);
  document.getElementById('detailIdLong').textContent = ex.training_example_id;
  document.getElementById('detailCreatedAt').textContent = ex.created_at || '';
  document.getElementById('detailLabelType').value = ex.label_type || '';
  document.getElementById('detailLabelValue').value = ex.label_value || '';
  document.getElementById('detailDescription').value = ex.user_description || '';
  document.getElementById('detailNotes').value = ex.user_notes || '';
  document.getElementById('detailScope').value = ex.scope || 'current_plan_only';

  // Associated pole dropdown — only relevant for tick/code/symbol
  refreshAssocPoleDropdown();
  const assocSel = document.getElementById('detailAssocPole');
  assocSel.value = ex.associated_pole_id || '';
  const assocWrap = document.getElementById('detailAssocWrap');
  const hideAssoc = ex._kind === 'association' || ex.label_type === 'pole_dot'
                  || ex.label_type === 'ignore_region' || ex.label_type === 'noise_background';
  assocWrap.style.display = hideAssoc ? 'none' : '';

  // Focus the description field (the primary teaching field)
  setTimeout(() => document.getElementById('detailDescription').focus(), 50);
}

function closeDetailPanel() {
  const panel = document.getElementById('detailPanel');
  const layout = document.getElementById('layout');
  panel.classList.add('hidden');
  layout.classList.remove('detail-open');
  panel.setAttribute('aria-hidden', 'true');
}

function onDetailFieldChange() {
  if (!App.selectedId) return;
  const ex = findExampleById(App.selectedId);
  if (!ex) return;
  const newType = document.getElementById('detailLabelType').value;
  ex.label_type = newType;
  ex.label_value = document.getElementById('detailLabelValue').value;
  ex.user_description = document.getElementById('detailDescription').value;
  ex.user_notes = document.getElementById('detailNotes').value;
  ex.scope = document.getElementById('detailScope').value;
  ex.associated_pole_id = document.getElementById('detailAssocPole').value || null;
  // Re-color the shape to reflect new label_type
  const shape = findShapeById(ex.training_example_id);
  if (shape) {
    const color = colorForExample(ex);
    shape.stroke(color);
    if (shape.fill) {
      const cls = shape.getClassName();
      if (cls === 'Circle' || cls === 'Rect' || (cls === 'Line' && shape.closed())) {
        shape.fill(hexToRgba(color, 0.12));
      }
    }
    App.markingsLayer.batchDraw();
  }
  queueSave();
}

function onDetailDelete() {
  if (!App.selectedId) return;
  const ex = findExampleById(App.selectedId);
  if (!ex) return;
  const ok = confirm('למחוק את הסימון "' + ex.training_example_id + '"?');
  if (!ok) return;
  removeMarking(ex);
}

function refreshAssocPoleDropdown() {
  const sel = document.getElementById('detailAssocPole');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— ללא קישור / none —</option>';
  const poles = (App.examples[STEPS[0].id] || []).filter(e => e.label_type === 'pole_dot');
  poles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.training_example_id;
    const desc = p.user_description ? (' — ' + p.user_description.slice(0, 30)) : '';
    opt.textContent = p.training_example_id + desc;
    sel.appendChild(opt);
  });
  sel.value = current;
}

// ====================================================================
// Delete (cascade to associations)
// ====================================================================
function removeMarking(ex) {
  const id = ex.training_example_id;
  // Remove from data
  if (ex._kind === 'association' || App.associations.some(a => a.training_example_id === id)) {
    App.associations = App.associations.filter(a => a.training_example_id !== id);
  } else if (App.ignoreRegions.some(r => r.training_example_id === id)) {
    App.ignoreRegions = App.ignoreRegions.filter(r => r.training_example_id !== id);
  } else if (App.noiseRegions.some(r => r.training_example_id === id)) {
    App.noiseRegions = App.noiseRegions.filter(r => r.training_example_id !== id);
  } else {
    for (const step of STEPS) {
      App.examples[step.id] = (App.examples[step.id] || []).filter(e => e.training_example_id !== id);
    }
    // Cascade: remove any association that references this id
    App.associations = App.associations.filter(a => {
      const f = a.geometry?.from?.ref, t = a.geometry?.to?.ref;
      return f !== id && t !== id;
    });
  }
  // Remove canvas shapes
  const shape = findShapeById(id);
  if (shape) shape.destroy();
  // Remove orphaned association lines
  App.markingsLayer.find(n => n._kind === 'association' &&
      (n._fromId === id || n._toId === id))
    .forEach(line => line.destroy());
  App.markingsLayer.draw();

  if (App.selectedId === id) deselectAll();
  refreshWizard();
  refreshAssocPoleDropdown();
  queueSave();
}

// ====================================================================
// Association tool
// ====================================================================
function handleAssociationPick(id) {
  const ex = findExampleById(id);
  if (!ex || ex._kind !== 'example') {
    flash('בחר עמוד, מספר תמרור או סמל / Pick a pole, sign code or symbol');
    return;
  }
  if (!App.assocFirstId) {
    // First pick
    if (!POLE_LABELS.has(ex.label_type) && !CODE_OR_SYMBOL_LABELS.has(ex.label_type)) {
      flash('בחירה ראשונה חייבת להיות עמוד / מספר / סמל');
      return;
    }
    App.assocFirstId = id;
    flash('בחר עכשיו את הסימון השני (עמוד או מספר/סמל) / Now click the second marking');
    // Visually mark selection
    const shape = findShapeById(id);
    if (shape) { shape.shadowColor('#c80'); shape.shadowBlur(12); App.markingsLayer.batchDraw(); }
    return;
  }
  // Second pick
  if (id === App.assocFirstId) {
    flash('אי אפשר לקשר סימון לעצמו / Cannot associate a shape to itself');
    return;
  }
  const a = findExampleById(App.assocFirstId);
  const b = ex;
  let pole, target;
  if (POLE_LABELS.has(a.label_type) && CODE_OR_SYMBOL_LABELS.has(b.label_type)) {
    pole = a; target = b;
  } else if (POLE_LABELS.has(b.label_type) && CODE_OR_SYMBOL_LABELS.has(a.label_type)) {
    pole = b; target = a;
  } else {
    flash('הצימוד צריך להיות עמוד + מספר/סמל / Pair must be pole + code/symbol');
    clearAssocFirst();
    return;
  }
  const assocType = target.label_type === 'sign_code_text' ? 'pole_to_code_association'
                                                            : 'pole_to_symbol_association';
  const prefix = target.label_type === 'sign_code_text' ? 'te_assoc_code_' : 'te_assoc_symbol_';
  const id_ = nextId(prefix);
  const fromXY = shapeCentroid(findShapeById(target.training_example_id));
  const toXY = shapeCentroid(findShapeById(pole.training_example_id));
  const assocEx = {
    training_example_id: id_,
    page_number: App.imageInfo?.page_number ?? 0,
    label_type: assocType,
    label_value: '',
    geometry_type: 'association',
    geometry: {
      type: 'association',
      from: { type: 'point', x: round(fromXY.x), y: round(fromXY.y), ref: target.training_example_id },
      to:   { type: 'point', x: round(toXY.x),   y: round(toXY.y),   ref: pole.training_example_id },
    },
    user_description: '',
    user_notes: '',
    associated_pole_id: pole.training_example_id,
    confidence_source: 'human_labeled',
    scope: 'current_plan_only',
    created_at: nowIso(),
    audit_notes: [],
  };
  App.associations.push(assocEx);
  // Also set the target's associated_pole_id for hint
  if (!target.associated_pole_id) target.associated_pole_id = pole.training_example_id;
  // Draw + select
  drawAssociation(assocEx);
  clearAssocFirst();
  selectById(id_);
  queueSave();
  refreshWizard();
  flash('הקישור נוצר / Association created: ' + assocType);
}

function clearAssocFirst() {
  if (App.assocFirstId) {
    const s = findShapeById(App.assocFirstId);
    if (s) { s.shadowBlur(0); s.shadowColor(''); App.markingsLayer.batchDraw(); }
  }
  App.assocFirstId = null;
}

// ====================================================================
// Polygon tool
// ====================================================================
function pushPolygonVertex(pos) {
  App.polygonPoints.push({ x: round(pos.x), y: round(pos.y) });
  if (!App.polygonPreviewVertices) {
    App.polygonPreviewVertices = new Konva.Line({
      points: [pos.x, pos.y],
      stroke: '#cc0000', strokeWidth: 2, listening: false,
    });
    App.markingsLayer.add(App.polygonPreviewVertices);
  } else {
    const flat = [];
    App.polygonPoints.forEach(p => { flat.push(p.x, p.y); });
    App.polygonPreviewVertices.points(flat);
  }
  if (!App.polygonPreviewLine) {
    App.polygonPreviewLine = new Konva.Line({
      points: [pos.x, pos.y, pos.x, pos.y],
      stroke: '#cc0000', strokeWidth: 1, dash: [4, 3], listening: false,
    });
    App.markingsLayer.add(App.polygonPreviewLine);
  }
  App.markingsLayer.batchDraw();
}

function closePolygon() {
  if (App.polygonPoints.length < 3) {
    cancelPolygon();
    flash('פוליגון דורש לפחות 3 קודקודים / Polygon needs at least 3 vertices');
    return;
  }
  const id = nextId('te_ignore_');
  const xs = App.polygonPoints.map(p => p.x), ys = App.polygonPoints.map(p => p.y);
  const bbox = { type: 'rectangle', x0: Math.min(...xs), y0: Math.min(...ys),
                                     x1: Math.max(...xs), y1: Math.max(...ys) };
  const ex = {
    training_example_id: id,
    page_number: App.imageInfo?.page_number ?? 0,
    label_type: 'ignore_region',
    label_value: '',
    geometry_type: 'polygon',
    geometry: {
      type: 'polygon',
      points: App.polygonPoints.map(p => [p.x, p.y]),
      bbox: bbox,  // backward-compat for script 37
    },
    user_description: '',
    user_notes: '',
    associated_pole_id: null,
    confidence_source: 'human_labeled',
    scope: 'current_plan_only',
    created_at: nowIso(),
    audit_notes: [],
  };
  App.ignoreRegions.push(ex);
  cancelPolygon();  // clears preview, keeps the data
  drawPolygon(ex);
  selectById(id);
  queueSave();
  refreshWizard();
}

function cancelPolygon() {
  App.polygonPoints = [];
  if (App.polygonPreviewLine) { App.polygonPreviewLine.destroy(); App.polygonPreviewLine = null; }
  if (App.polygonPreviewVertices) { App.polygonPreviewVertices.destroy(); App.polygonPreviewVertices = null; }
  App.markingsLayer.batchDraw();
}

// ====================================================================
// Wizard panel
// ====================================================================
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
        const nextIdx = STEPS.findIndex(s => s.id === step.id) + 1;
        if (nextIdx < STEPS.length) setCurrentStep(STEPS[nextIdx].id);
      });
    }
    wiz.appendChild(div);
  });

  // Step 6 (associations) + supporting counts
  const assoc = document.createElement('div');
  assoc.className = 'step';
  assoc.innerHTML = `
    <div class="step-head"><span>6. קישורים / Associations</span><span class="count" id="assocCount">0</span></div>
    <div class="he">חבר עמוד למספר תמרור או לסמל גרפי (כלי A).</div>
    <div class="en">Link a pole to its sign code/symbol (press A).</div>
  `;
  wiz.appendChild(assoc);

  const ignore = document.createElement('div');
  ignore.className = 'step';
  ignore.innerHTML = `
    <div class="step-head"><span>+ אזורי התעלמות / Ignore</span><span class="count" id="ignoreCount">0</span></div>
    <div class="he">סמן פוליגון לאזורים כמו כותרת, מקרא, רעש (כלי G).</div>
    <div class="en">Polygon for title block, legend, noise (press G).</div>
  `;
  wiz.appendChild(ignore);

  // Apply hint
  const apply = document.createElement('div');
  apply.className = 'step';
  apply.innerHTML = `
    <div class="step-head"><span>7. החל דפוס נלמד</span></div>
    <div class="he">החל את הדפוס הנלמד והפעל את הסורק.</div>
    <pre style="font-size:11px;background:#f4f4f4;padding:6px;border-radius:4px;overflow-x:auto;">.venv/bin/python 37_manual_visual_training_poc.py \\
  --plan-run-dir &lt;run-dir&gt; \\
  --wizard-examples &lt;run-dir&gt;/outputs/manual_training/visual_training_examples.wizard.json</pre>
  `;
  wiz.appendChild(apply);
}

function setCurrentStep(stepId) {
  App.currentStepId = stepId;
  setTool(currentStep().tool);
  refreshWizard();
}

function refreshWizard() {
  const wiz = document.getElementById('wizard');
  STEPS.forEach(step => {
    const card = wiz.querySelector(`[data-step-id="${step.id}"]`);
    if (!card) return;
    const list = (App.examples[step.id] || []).filter(e => e.label_type === step.labelType);
    const n = list.length;
    const min = step.minExamples;
    const isActive = step.id === App.currentStepId;
    const isDone = (min === 0 && step.optional) || n >= min;
    card.classList.toggle('active', isActive);
    card.classList.toggle('done', isDone);
    card.querySelector('[data-count]').textContent =
      step.optional && min === 0 ? `${n} (optional)` : `${n}/${min}`;
    const bar = card.querySelector('[data-progress] .bar');
    bar.style.width = (min === 0 ? (n > 0 ? 100 : 0) : Math.min(100, (n / min) * 100)) + '%';
    card.querySelector('[data-progress]').classList.toggle('done', isDone);
    const log = card.querySelector('[data-log]');
    log.innerHTML = '';
    (App.examples[step.id] || []).forEach(ex => {
      const item = document.createElement('div');
      item.className = 'item';
      const desc = ex.user_description ? (' · ' + ex.user_description.slice(0, 24)) : '';
      item.innerHTML = `<span title="${escapeHtml(ex.user_description)}">${ex.training_example_id}${escapeHtml(desc)}</span>` +
                       `<button title="Delete">×</button>`;
      item.querySelector('button').addEventListener('click', () => {
        const e = findExampleById(ex.training_example_id);
        if (e) removeMarking(e);
      });
      log.appendChild(item);
    });
    const btn = card.querySelector('[data-activate]');
    btn.textContent = isActive ? '✓ Active' : 'Activate this step';
    btn.disabled = isActive;
  });
  const ac = document.getElementById('assocCount');
  if (ac) ac.textContent = String(App.associations.length);
  const ic = document.getElementById('ignoreCount');
  if (ic) ic.textContent = String(App.ignoreRegions.length + App.noiseRegions.length);
  refreshAssocPoleDropdown();
}

function describeGeometry(g) {
  if (g.type === 'point') return `point (${g.x}, ${g.y})`;
  if (g.type === 'line')  return `line (${g.x0}, ${g.y0}) → (${g.x1}, ${g.y1})`;
  if (g.type === 'rectangle') return `rect ${g.x1 - g.x0}×${g.y1 - g.y0}`;
  if (g.type === 'polygon') return `polygon (${g.points?.length || 0} vertices)`;
  if (g.type === 'association') return `assoc ${g.from?.ref || '?'} → ${g.to?.ref || '?'}`;
  return g.type;
}

function currentStep() {
  return STEPS.find(s => s.id === App.currentStepId) || STEPS[0];
}

// ====================================================================
// Toolbar
// ====================================================================
function buildToolbar() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = '';
  const tools = [
    { id: 'select',      label: 'V · בחירה' },
    { id: 'point',       label: 'P · עמוד' },
    { id: 'line',        label: 'T · טיק' },
    { id: 'rect_small',  label: 'C · קוד' },
    { id: 'rect_medium', label: 'S · סמל' },
    { id: 'association', label: 'A · קישור' },
    { id: 'polygon',     label: 'G · התעלם' },
  ];
  tools.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.tool = t.id;
    b.textContent = t.label;
    b.addEventListener('click', () => setTool(t.id));
    tb.appendChild(b);
  });
  const sep = document.createElement('div'); sep.className = 'sep'; tb.appendChild(sep);
  const hint = document.createElement('span'); hint.className = 'zoom';
  hint.textContent = 'Wheel = zoom · Space+drag = pan · Shift+click = select';
  tb.appendChild(hint);
  const zoom = document.createElement('span'); zoom.className = 'zoom'; zoom.id = 'zoomLabel';
  zoom.textContent = '100%'; tb.appendChild(zoom);
  const save = document.createElement('span'); save.className = 'save-status'; save.id = 'saveStatus';
  tb.appendChild(save);
  const download = document.createElement('button'); download.className = 'action';
  download.textContent = 'Download JSON';
  download.addEventListener('click', downloadJSON);
  tb.appendChild(download);

  // Slice 3: Run detection button + mode toggle
  const runBtn = document.createElement('button');
  runBtn.className = 'run-btn';
  runBtn.id = 'runDetectionBtn';
  runBtn.textContent = '▶ הפעל זיהוי';
  runBtn.addEventListener('click', startDetection);
  tb.appendChild(runBtn);

  const modeBtn = document.createElement('button');
  modeBtn.className = 'mode-toggle';
  modeBtn.id = 'modeToggleBtn';
  modeBtn.textContent = '📋 סקירה';
  modeBtn.addEventListener('click', () => {
    if (App.mode === 'review') setMode('edit');
    else setMode('review');
  });
  tb.appendChild(modeBtn);
}

function setTool(toolId) {
  // Leaving polygon mode mid-draw cancels the in-progress polygon
  if (App.currentTool === 'polygon' && toolId !== 'polygon') cancelPolygon();
  // Leaving association mode mid-pick clears the first selection
  if (App.currentTool === 'association' && toolId !== 'association') clearAssocFirst();
  App.currentTool = toolId;
  refreshToolbar();
  document.body.style.cursor = toolId && toolId !== 'select' ? 'crosshair' : '';
}

function refreshToolbar() {
  document.querySelectorAll('.toolbar .tool').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === App.currentTool);
  });
  const zoom = document.getElementById('zoomLabel');
  if (zoom && App.stage) zoom.textContent = Math.round(App.stage.scaleX() * 100) + '%';
}

// ====================================================================
// Stage info footer
// ====================================================================
function refreshStageInfo() {
  const el = document.getElementById('stageInfo');
  if (!el) return;
  if (!App.imageInfo) { el.textContent = 'No image loaded'; return; }
  const info = App.imageInfo;
  const total = STEPS.reduce((acc, s) => acc + (App.examples[s.id]?.length || 0), 0)
              + App.associations.length + App.ignoreRegions.length + App.noiseRegions.length;
  el.innerHTML =
    `<span>Plan: <b>${escapeHtml(info.plan_id)}</b></span>` +
    `<span>Page ${info.page_number} · ${info.width}×${info.height}px @ ${info.dpi} DPI</span>` +
    `<span>Total markings: ${total}</span>`;
}

// ====================================================================
// Keyboard
// ====================================================================
function wireGlobalKeys() {
  window.addEventListener('keydown', (e) => {
    // Always track modifiers (regardless of focus target)
    if (e.key === 'Shift') App.shiftHeld = true;
    if (e.code === 'Space') { App.spaceHeld = true; if (document.body.style.cursor === '') document.body.style.cursor = 'grab'; }

    // Don't fire other shortcuts while typing into a field
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toUpperCase();
    if (TOOL_HOTKEYS[key]) { setTool(TOOL_HOTKEYS[key]); e.preventDefault(); return; }

    if (e.key === 'Enter' && App.currentTool === 'polygon') {
      closePolygon(); e.preventDefault(); return;
    }
    if (e.key === 'Escape') {
      if (App.currentTool === 'polygon') { cancelPolygon(); }
      if (App.currentTool === 'association') { clearAssocFirst(); }
      deselectAll();
      setTool(null);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (App.selectedId) {
        const ex = findExampleById(App.selectedId);
        if (ex) removeMarking(ex);
        e.preventDefault();
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') App.shiftHeld = false;
    if (e.code === 'Space') {
      App.spaceHeld = false;
      App.panStart = null;
      if (document.body.style.cursor === 'grab' || document.body.style.cursor === 'grabbing') {
        document.body.style.cursor = App.currentTool && App.currentTool !== 'select' ? 'crosshair' : '';
      }
    }
  });
}

// ====================================================================
// Persistence — save to local Python helper
// ====================================================================
function buildPayload() {
  const stepsOut = {};
  STEPS.forEach((s, idx) => {
    // Strip private _step_bucket / _kind before saving
    const cleanExamples = (App.examples[s.id] || []).map(stripPrivate);
    stepsOut[s.id] = {
      order: idx + 2,
      label_type: s.labelType,
      geometry_type: s.geometryType,
      min_examples: s.minExamples,
      max_examples: s.maxExamples,
      optional: !!s.optional,
      prompt_he: s.he,
      prompt_en: s.en,
      examples: cleanExamples,
    };
  });
  // Step 6: associations
  stepsOut[STEP6_ID] = {
    order: 6,
    label_type: 'pole_to_code_association',
    geometry_type: 'association',
    min_examples: 1,
    max_examples: 20,
    prompt_he: 'חבר בין עמוד למספר התמרור / סימון תמרור / כמות תמרורים שלו.',
    prompt_en: 'Link a pole to its sign code / sign symbol / sign count.',
    examples: App.associations.map(stripPrivate),
  };
  // Completed steps
  const completed = STEPS.filter(s => {
    const n = (App.examples[s.id] || []).filter(e => e.label_type === s.labelType).length;
    return (s.optional && s.minExamples === 0) || n >= s.minExamples;
  }).map(s => s.id);
  if (App.associations.length > 0) completed.push(STEP6_ID);
  const required = STEPS.filter(s => !s.optional).map(s => s.id);
  required.push(STEP6_ID);
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
    author: 'research_annotator_slice2',
    purpose: 'Created by the local research annotator (Engine C v0.3 Slice 2). Manual marking with user_description.',
    wizard_state: {
      current_step: 'step_7_apply_learning',
      steps_completed: completed,
      ready_for_apply: readyForApply,
    },
    steps: stepsOut,
    supporting_examples: {
      ignore_regions: App.ignoreRegions.map(stripPrivate),
      noise_background: App.noiseRegions.map(stripPrivate),
    },
  };
}

function stripPrivate(ex) {
  const { _kind, _step_bucket, ...rest } = ex;
  return rest;
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
  a.href = url; a.download = 'visual_training_examples.wizard.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ====================================================================
// Hydration from existing file
// ====================================================================
function initBlankExamples() {
  App.examples = {};
  STEPS.forEach(s => { App.examples[s.id] = []; });
  App.associations = [];
  App.ignoreRegions = [];
  App.noiseRegions = [];
  App.counters = {};
}

function hydrateFromFile(file) {
  initBlankExamples();
  if (file.steps) {
    STEPS.forEach(step => {
      const fs = file.steps[step.id];
      if (fs && Array.isArray(fs.examples)) {
        App.examples[step.id] = fs.examples.slice();
      }
    });
    if (file.steps[STEP6_ID] && Array.isArray(file.steps[STEP6_ID].examples)) {
      App.associations = file.steps[STEP6_ID].examples.slice();
    }
  }
  if (file.supporting_examples) {
    if (Array.isArray(file.supporting_examples.ignore_regions))
      App.ignoreRegions = file.supporting_examples.ignore_regions.slice();
    if (Array.isArray(file.supporting_examples.noise_background))
      App.noiseRegions = file.supporting_examples.noise_background.slice();
  }
  // Advance counters past existing IDs
  const allIds = [
    ...Object.values(App.examples).flat(),
    ...App.associations, ...App.ignoreRegions, ...App.noiseRegions,
  ].map(e => e.training_example_id);
  allIds.forEach(id => {
    const m = id?.match(/^(.+_)(\d+)$/);
    if (m) {
      const prefix = m[1], n = parseInt(m[2], 10);
      App.counters[prefix] = Math.max(App.counters[prefix] || 0, n);
    }
  });
  // Patch missing fields onto pre-Slice2 entries
  const patch = (ex) => {
    if (ex.user_description === undefined) ex.user_description = '';
    if (ex.user_notes === undefined) ex.user_notes = '';
    if (ex.label_value === undefined) ex.label_value = '';
    if (ex.associated_pole_id === undefined) ex.associated_pole_id = null;
    if (ex.scope === undefined) ex.scope = 'current_plan_only';
    if (ex.audit_notes === undefined) ex.audit_notes = [];
    if (ex.page_number === undefined) ex.page_number = file.page_number ?? 0;
    if (!ex.geometry_type && ex.geometry?.type) ex.geometry_type = ex.geometry.type;
    if (!ex.label_type && ex._step_bucket) {
      const step = STEPS.find(s => s.id === ex._step_bucket);
      if (step) ex.label_type = step.labelType;
    }
  };
  Object.values(App.examples).flat().forEach(patch);
  App.associations.forEach(patch);
  App.ignoreRegions.forEach(patch);
  App.noiseRegions.forEach(patch);
}

// ====================================================================
// Helpers
// ====================================================================
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round(v) { return Math.round(v); }
function nowIso() { return new Date().toISOString(); }
function nextId(prefix) {
  App.counters[prefix] = (App.counters[prefix] || 0) + 1;
  return prefix + String(App.counters[prefix]).padStart(3, '0');
}
function imagePos() {
  const p = App.stage.getRelativePointerPosition();
  if (!p) return null;
  if (!App.imageInfo) return p;
  if (p.x < 0 || p.y < 0 || p.x > App.imageInfo.width || p.y > App.imageInfo.height) return null;
  return p;
}
async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
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
function flash(msg) {
  const old = document.querySelector('.flash-msg'); if (old) old.remove();
  const el = document.createElement('div'); el.className = 'flash-msg'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

// ====================================================================
// Slice 3 — Close the Teaching Loop
// (run detection → load candidates → review queue → save answers)
// ====================================================================

// --- Mode switching: 'edit' (detail panel) vs 'review' (review panel) ---
function setMode(newMode) {
  if (newMode === App.mode) return;
  if (newMode === 'review') {
    // Close edit panel; open review panel
    closeDetailPanel();
    openReviewPanel();
    deselectAll();
  } else {
    // Close review panel
    closeReviewPanel();
  }
  App.mode = newMode;
  refreshModeToggle();
}

function refreshModeToggle() {
  const btn = document.getElementById('modeToggleBtn');
  if (!btn) return;
  btn.classList.toggle('active', App.mode === 'review');
  const total = App.reviewQuestions.length;
  const answered = Object.keys(App.reviewAnswers).length;
  if (total > 0) {
    btn.textContent = `📋 סקירה (${answered}/${total})`;
  } else {
    btn.textContent = '📋 סקירה';
  }
}

function openReviewPanel() {
  const panel = document.getElementById('reviewPanel');
  const layout = document.getElementById('layout');
  panel.classList.remove('hidden');
  layout.classList.add('review-open');
  panel.setAttribute('aria-hidden', 'false');
  renderReviewPanel();
}

function closeReviewPanel() {
  const panel = document.getElementById('reviewPanel');
  const layout = document.getElementById('layout');
  panel.classList.add('hidden');
  layout.classList.remove('review-open');
  panel.setAttribute('aria-hidden', 'true');
}

// Override openDetailPanel/closeDetailPanel was unchanged; we just ensure
// the review panel toggles correctly through setMode().

// --- Run detection ---
function refreshRunButton() {
  const btn = document.getElementById('runDetectionBtn');
  if (!btn) return;
  // Disabled until enough examples exist (required steps met)
  const payload = buildPayload();
  const ready = payload.wizard_state?.ready_for_apply;
  const running = App.detection && App.detection.status === 'running';
  const failed = App.detection && App.detection.status === 'failed';
  btn.classList.toggle('running', !!running);
  btn.classList.toggle('failed', !!failed);
  btn.disabled = !ready || !!running;
  if (running) {
    btn.textContent = '⏳ זיהוי רץ…';
  } else if (failed) {
    btn.textContent = '⚠ נכשל — נסה שוב';
  } else if (ready) {
    btn.textContent = '▶ הפעל זיהוי';
  } else {
    btn.textContent = '▶ הפעל זיהוי (חסר דוגמאות)';
  }
}

async function startDetection() {
  if (!buildPayload().wizard_state?.ready_for_apply) {
    flash('עוד אין מספיק דוגמאות / Need more training examples first');
    return;
  }
  // Ensure the latest examples are flushed before starting
  await flushSaveNow();
  try {
    const res = await fetch('/run-detection', { method: 'POST' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      flash('שגיאה בהתחלת זיהוי: ' + (j.error || res.status));
      return;
    }
    const j = await res.json();
    App.detection = {
      jobId: j.job_id, status: j.status, currentStep: 'starting…',
      stdoutTail: [], exitCode: null, startedAt: j.started_at,
    };
    setMode('review');
    renderReviewPanel();  // show the live status
    refreshRunButton();
    startPollingDetection();
    flash('זיהוי התחיל / Detection started');
  } catch (e) {
    flash('שגיאה: ' + e.message);
  }
}

function startPollingDetection() {
  if (App.detectionPollTimer) clearInterval(App.detectionPollTimer);
  App.detectionPollTimer = setInterval(pollDetectionStatus, 1000);
}

function stopPollingDetection() {
  if (App.detectionPollTimer) { clearInterval(App.detectionPollTimer); App.detectionPollTimer = null; }
}

async function pollDetectionStatus() {
  try {
    const s = await fetchJSON('/run-status');
    if (!s || s.status === 'none') return;
    App.detection = {
      jobId: s.job_id, status: s.status, currentStep: s.current_step,
      stdoutTail: s.stdout_tail || [], exitCode: s.exit_code,
      startedAt: s.started_at, completedAt: s.completed_at, error: s.error,
      resultPaths: s.result_paths,
    };
    renderReviewPanel();
    refreshRunButton();
    if (s.status === 'complete') {
      stopPollingDetection();
      await loadDetectionResults();
      refreshModeToggle();
      flash('הזיהוי הסתיים / Detection complete — load review queue');
    } else if (s.status === 'failed') {
      stopPollingDetection();
      flash('הזיהוי נכשל / Detection failed: ' + (s.error || 'see status panel'));
    }
  } catch (e) {
    console.error('poll failed', e);
  }
}

async function loadDetectionResults() {
  const cands = await fetchJSON('/candidates');
  const qs = await fetchJSON('/review-questions');
  App.candidates = cands?.candidates || [];
  App.reviewQuestions = qs?.questions || [];
  await hydrateReviewState();
  App.activeQuestionIdx = 0;
  renderReviewPanel();
}

async function hydrateReviewState() {
  const ra = await fetchJSON('/review-answers');
  App.reviewAnswers = {};
  if (ra && !ra.empty && Array.isArray(ra.answers)) {
    ra.answers.forEach(a => { App.reviewAnswers[a.review_question_id] = a; });
  }
  // Try to also load any prior candidates + questions (in case the user
  // already ran detection in a previous session)
  if (!App.candidates.length) {
    const cands = await fetchJSON('/candidates');
    if (cands?.candidates) App.candidates = cands.candidates;
  }
  if (!App.reviewQuestions.length) {
    const qs = await fetchJSON('/review-questions');
    if (qs?.questions) App.reviewQuestions = qs.questions;
  }
}

// --- Render the review panel ---
function wireReviewPanel() {
  document.getElementById('reviewClose').addEventListener('click', () => setMode('edit'));
  document.getElementById('reviewPrev').addEventListener('click', () => navigateReview(-1));
  document.getElementById('reviewNext').addEventListener('click', () => navigateReview(+1));
  document.getElementById('answerConfirm').addEventListener('click', () => submitAnswer('confirm'));
  document.getElementById('answerReject').addEventListener('click', () => submitAnswer('reject'));
  document.getElementById('answerCorrect').addEventListener('click', () => startCorrectionFlow());
  document.getElementById('answerNoise').addEventListener('click', () => submitAnswer('noise'));
}

function renderReviewPanel() {
  if (App.mode !== 'review') return;
  const statusEl = document.getElementById('reviewStatus');
  const statusLabel = document.getElementById('reviewStatusLabel');
  const statusStep = document.getElementById('reviewStatusStep');
  const statusLog = document.getElementById('reviewStatusLog');
  const navEl = document.getElementById('reviewNav');
  const qEl = document.getElementById('reviewQuestion');
  const emptyEl = document.getElementById('reviewEmpty');

  // Status block: show while running OR if last run failed
  const det = App.detection;
  if (det && (det.status === 'running' || det.status === 'failed' || det.status === 'pending')) {
    statusEl.classList.remove('hidden');
    statusLabel.textContent = `Status: ${det.status}` + (det.jobId ? ` · ${det.jobId}` : '');
    statusStep.textContent = det.currentStep || '';
    statusLog.textContent = (det.stdoutTail || []).slice(-15).join('\n');
  } else {
    statusEl.classList.add('hidden');
  }

  const total = App.reviewQuestions.length;
  if (total === 0) {
    emptyEl.classList.remove('hidden');
    navEl.classList.add('hidden');
    qEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  navEl.classList.remove('hidden');
  qEl.classList.remove('hidden');

  // Clamp index
  if (App.activeQuestionIdx < 0) App.activeQuestionIdx = 0;
  if (App.activeQuestionIdx >= total) App.activeQuestionIdx = total - 1;

  document.getElementById('reviewCounter').textContent =
    `${App.activeQuestionIdx + 1} / ${total}`;
  document.getElementById('reviewPrev').disabled = App.activeQuestionIdx === 0;
  document.getElementById('reviewNext').disabled = App.activeQuestionIdx >= total - 1;

  renderActiveQuestion();
}

function renderActiveQuestion() {
  const q = App.reviewQuestions[App.activeQuestionIdx];
  if (!q) return;
  const cand = App.candidates.find(c => c.candidate_id === q.candidate_id);
  const meta = `candidate_id: ${q.candidate_id}` +
               `\ncandidate_type: ${cand?.candidate_type || '?'}` +
               `\nsystem_guess: ${q.system_guess || '?'}`;
  document.getElementById('qMeta').textContent = meta;
  document.getElementById('qIdLong').textContent = q.review_question_id;
  document.getElementById('qTextHe').textContent = q.question_text_he || '—';
  document.getElementById('qTextEn').textContent = q.question_text_en || '—';
  const conf = q.confidence ?? cand?.confidence ?? null;
  document.getElementById('qConfidence').textContent =
    conf !== null ? `confidence: ${(+conf).toFixed(3)}` : 'confidence: —';

  // Evidence crop image (lazy-loaded from /evidence-crop/<fn>)
  const cropContainer = document.getElementById('qCrop');
  cropContainer.innerHTML = '';
  let cropFn = null;
  const cropPath = q.evidence_crop_path || cand?.evidence_crop_path;
  if (cropPath) {
    // Take just the filename (we serve from a known dir)
    cropFn = cropPath.split('/').pop();
  }
  if (cropFn) {
    const img = document.createElement('img');
    img.src = '/evidence-crop/' + encodeURIComponent(cropFn);
    img.alt = q.candidate_id;
    img.onerror = () => {
      cropContainer.innerHTML = '<div class="q-crop-placeholder">crop not found</div>';
    };
    cropContainer.appendChild(img);
  } else {
    cropContainer.innerHTML = '<div class="q-crop-placeholder">no crop available</div>';
  }

  // Note field
  const prevAnswer = App.reviewAnswers[q.review_question_id];
  document.getElementById('answerNote').value = prevAnswer?.notes || '';
  document.getElementById('qAnswered').textContent = prevAnswer ? 'yes — ' + prevAnswer.user_answer : 'no';

  // Highlight which answer button was used (if already answered)
  ['confirm', 'reject', 'correct', 'noise'].forEach(kind => {
    const btn = document.getElementById('answer' + kind.charAt(0).toUpperCase() + kind.slice(1));
    if (!btn) return;
    btn.classList.toggle('answered', prevAnswer?.user_answer === answerToCanonical(kind, q));
  });
}

function navigateReview(delta) {
  // Save current note before moving
  saveNoteToCurrentAnswer();
  App.activeQuestionIdx += delta;
  renderReviewPanel();
}

function saveNoteToCurrentAnswer() {
  const q = App.reviewQuestions[App.activeQuestionIdx];
  if (!q) return;
  const note = document.getElementById('answerNote').value;
  const prev = App.reviewAnswers[q.review_question_id];
  if (prev && (prev.notes || '') !== note) {
    prev.notes = note;
    queueSaveReviewAnswers();
  }
}

// Map button kind → canonical user_answer string per question type
function answerToCanonical(kind, q) {
  // q.allowed_answers e.g. ['yes_pole', 'no_noise', 'no_dimension_mark', 'other']
  const allowed = q.allowed_answers || [];
  if (kind === 'confirm') {
    return allowed.find(a => a.startsWith('yes_')) || 'confirm';
  }
  if (kind === 'reject') {
    return allowed.find(a => a.startsWith('no_')) || 'reject';
  }
  if (kind === 'correct') return 'correct';
  if (kind === 'noise') {
    return allowed.find(a => a.includes('noise')) || 'noise';
  }
  return kind;
}

function submitAnswer(kind) {
  const q = App.reviewQuestions[App.activeQuestionIdx];
  if (!q) return;
  const cand = App.candidates.find(c => c.candidate_id === q.candidate_id);
  const userAnswer = answerToCanonical(kind, q);
  const note = document.getElementById('answerNote').value;

  const answer = {
    review_question_id: q.review_question_id,
    candidate_id: q.candidate_id,
    user_answer: userAnswer,
    answer_kind: kind,  // 'confirm' | 'reject' | 'correct' | 'noise'
    candidate_type: cand?.candidate_type || null,
    system_guess: q.system_guess || cand?.system_guess || null,
    confidence: q.confidence ?? cand?.confidence ?? null,
    corrected_label_type: null,
    corrected_geometry: null,
    corrected_training_example_id: null,
    notes: note,
    scope: 'current_plan_only',
    created_at: nowIso(),
  };

  // For "noise" — also create a wrong_detection example covering the candidate bbox
  if (kind === 'noise' && cand?.bbox) {
    const newId = nextId('te_wrong_');
    const wrongEx = {
      training_example_id: newId,
      page_number: App.imageInfo?.page_number ?? 0,
      label_type: 'wrong_detection',
      label_value: 'rejected_candidate:' + (cand.candidate_id || ''),
      geometry_type: 'rectangle',
      geometry: { type: 'rectangle',
                   x0: cand.bbox[0], y0: cand.bbox[1],
                   x1: cand.bbox[2], y1: cand.bbox[3] },
      user_description: note || 'נדחה כרעש — המערכת זיהתה בטעות / Rejected as noise',
      user_notes: '',
      associated_pole_id: null,
      confidence_source: 'human_labeled',
      scope: 'current_plan_only',
      created_at: nowIso(),
      audit_notes: [`auto-generated from review answer to ${q.review_question_id}`],
    };
    // Persist as an ignore_region-style entry under supporting_examples
    // (script 37 doesn't yet have a wrong_detection bucket, but we still record it)
    App.ignoreRegions.push(wrongEx);
    answer.corrected_training_example_id = newId;
    drawPolygon(wrongEx);  // visual feedback on canvas
    queueSave();
    refreshWizard();
  }

  App.reviewAnswers[q.review_question_id] = answer;
  queueSaveReviewAnswers();
  flash('תשובה נשמרה / Saved: ' + userAnswer);
  renderActiveQuestion();
  refreshModeToggle();

  // Auto-advance to next unanswered question
  setTimeout(() => {
    const nextIdx = findNextUnansweredIdx(App.activeQuestionIdx);
    if (nextIdx !== -1 && nextIdx !== App.activeQuestionIdx) {
      App.activeQuestionIdx = nextIdx;
      renderReviewPanel();
    }
  }, 350);
}

function findNextUnansweredIdx(fromIdx) {
  for (let i = fromIdx + 1; i < App.reviewQuestions.length; i++) {
    const q = App.reviewQuestions[i];
    if (!App.reviewAnswers[q.review_question_id]) return i;
  }
  return -1;
}

// --- Correction sub-flow ---
function startCorrectionFlow() {
  const q = App.reviewQuestions[App.activeQuestionIdx];
  if (!q) return;
  const cand = App.candidates.find(c => c.candidate_id === q.candidate_id);
  if (!cand) { flash('מועמד לא נמצא / Candidate not found'); return; }
  App.correctingQuestionId = q.review_question_id;
  // Switch to edit mode and ask the user to mark the corrected example.
  // Use the current wizard step's tool as the default, but the user can pick
  // any tool. The next marking they create will be linked to this question
  // as `corrected_training_example_id`.
  setMode('edit');
  flash('סמן את התיקון על התוכנית / Mark the correction on the plan');
}

// Hook into addExampleToBucket via the existing add functions to capture
// corrections. We patch them by checking App.correctingQuestionId after
// each marking is added.
function recordCorrectionIfPending(newExampleId, newLabelType) {
  if (!App.correctingQuestionId) return;
  const q = App.reviewQuestions.find(r => r.review_question_id === App.correctingQuestionId);
  if (!q) { App.correctingQuestionId = null; return; }
  const cand = App.candidates.find(c => c.candidate_id === q.candidate_id);
  const note = document.getElementById('answerNote').value || '';
  const answer = {
    review_question_id: q.review_question_id,
    candidate_id: q.candidate_id,
    user_answer: 'correct',
    answer_kind: 'correct',
    candidate_type: cand?.candidate_type || null,
    system_guess: q.system_guess || cand?.system_guess || null,
    confidence: q.confidence ?? cand?.confidence ?? null,
    corrected_label_type: newLabelType,
    corrected_geometry: null,  // referenced via training_example_id
    corrected_training_example_id: newExampleId,
    notes: note,
    scope: 'current_plan_only',
    created_at: nowIso(),
  };
  App.reviewAnswers[q.review_question_id] = answer;
  queueSaveReviewAnswers();
  App.correctingQuestionId = null;
  flash('תיקון נשמר / Correction saved → ' + newExampleId);
  refreshModeToggle();
  // Return to review mode at the same question
  setTimeout(() => { setMode('review'); }, 400);
}

// --- Save review answers ---
let _reviewSaveTimer = null;
function queueSaveReviewAnswers() {
  if (_reviewSaveTimer) clearTimeout(_reviewSaveTimer);
  _reviewSaveTimer = setTimeout(async () => {
    const payload = {
      schema_version: '1.0',
      engine: 'engine_c_v0.3_manual_first',
      annotator_version: 'slice3',
      plan_id: App.imageInfo?.plan_id || null,
      page_number: App.imageInfo?.page_number ?? 0,
      saved_at: nowIso(),
      answers: Object.values(App.reviewAnswers),
    };
    try {
      const res = await fetch('/review-answers', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (e) {
      console.error('saveReviewAnswers failed', e);
    }
  }, 250);
}

// Flush pending save NOW (used before kicking off detection)
function flushSaveNow() {
  return new Promise(async (resolve) => {
    if (App.saveTimer) { clearTimeout(App.saveTimer); App.saveTimer = null; }
    try {
      const payload = buildPayload();
      const res = await fetch('/examples', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) setSaveStatus('saved');
    } catch (e) {
      console.error('flushSaveNow failed', e);
    }
    resolve();
  });
}

// ====================================================================
document.addEventListener('DOMContentLoaded', boot);
