// ===================== Simple Flow – popup.js =====================

// DOM refs
const stepsEl        = document.getElementById('steps');
const chartEl        = document.getElementById('chart');
const chartEmptyEl   = document.getElementById('chartEmpty');
const autoStartEndEl = document.getElementById('autoStartEnd');
const syntaxEl       = document.getElementById('syntax');

// Saved flows DOM
const savedToggleEl = document.getElementById('savedToggle');
const savedBlockEl  = document.getElementById('savedBlock');
const saveFlowBtn   = document.getElementById('saveFlowBtn');
const deleteFlowBtn = document.getElementById('deleteFlowBtn');
const savedSelectEl = document.getElementById('savedSelect');

// Palette (explicit fills so PNG/SVG export preserves colours)
const COLORS = {
  process:  '#b7d2ff',
  startend: '#a7e0b3',
  decision: '#ffe08a',
  stroke:   '#1d2233',
  arrow:    '#333333',
  text:     '#111827'
};

// Layout
const NODE_WIDTH  = 180;
const NODE_HEIGHT = 60;
const VERT_GAP    = 40;
const H_PADDING   = 32;
const V_PADDING   = 32;

// ---------- Helpers: parse steps ----------

function getStepLines() {
  return stepsEl.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

function classifyStep(text) {
  const lower = text.toLowerCase();
  if (lower.startsWith('start') || lower.startsWith('begin') || lower.startsWith('end')) {
    return 'startend';
  }
  if (text.includes('?')) {
    return 'decision';
  }
  return 'process';
}

function ensureStartEnd(lines) {
  if (!autoStartEndEl || !autoStartEndEl.checked) return lines;

  const result = [...lines];

  if (!result.length) return result;

  const first = result[0].toLowerCase();
  if (!first.startsWith('start')) {
    result.unshift('Start');
  }

  const last = result[result.length - 1].toLowerCase();
  if (!last.startsWith('end')) {
    result.push('End');
  }

  return result;
}

// ---------- SVG node builders ----------

function createRectNode(x, y, text, type) {
  const fill = type === 'startend'
    ? COLORS.startend
    : COLORS.process;

  return `
    <g class="node">
      <rect x="${x}" y="${y}" rx="12" ry="12"
        width="${NODE_WIDTH}" height="${NODE_HEIGHT}"
        fill="${fill}" stroke="${COLORS.stroke}" />
      ${createCenteredText(x, y, NODE_WIDTH, NODE_HEIGHT, text)}
    </g>
  `;
}

function createDiamondNode(x, y, text) {
  const cx = x + NODE_WIDTH / 2;
  const cy = y + NODE_HEIGHT / 2;
  const halfW = NODE_WIDTH / 2;
  const halfH = NODE_HEIGHT / 2;

  const points = [
    `${cx},${cy - halfH}`, // top
    `${cx + halfW},${cy}`, // right
    `${cx},${cy + halfH}`, // bottom
    `${cx - halfW},${cy}`  // left
  ].join(' ');

  return `
    <g class="node">
      <polygon points="${points}"
        fill="${COLORS.decision}" stroke="${COLORS.stroke}" />
      ${createCenteredText(x, y, NODE_WIDTH, NODE_HEIGHT, text)}
    </g>
  `;
}

function createCenteredText(x, y, w, h, text) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const safeText = escapeXml(text);

  return `
    <text x="${cx}" y="${cy}" text-anchor="middle"
      dominant-baseline="middle"
      style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             font-size: 12px; fill: ${COLORS.text};">
      ${safeText}
    </text>
  `;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createArrow(fromX, fromY, toX, toY) {
  return `
    <line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}"
      stroke="${COLORS.arrow}" stroke-width="1.5"
      marker-end="url(#arrowhead)" />
  `;
}

// ---------- Render ----------

function render() {
  const rawLines = getStepLines();
  const lines = ensureStartEnd(rawLines);

  if (!lines.length) {
    chartEl.innerHTML = '';
    if (chartEmptyEl) chartEmptyEl.style.display = 'flex';
    return;
  }

  if (chartEmptyEl) chartEmptyEl.style.display = 'none';

  const count = lines.length;
  const svgHeight = V_PADDING * 2 + count * NODE_HEIGHT + (count - 1) * VERT_GAP;
  const svgWidth  = NODE_WIDTH + H_PADDING * 2;
  const centerX   = H_PADDING + NODE_WIDTH / 2;

  let nodesSvg = '';
  let arrowsSvg = '';

  let prevBottomX = null;
  let prevBottomY = null;

  lines.forEach((text, index) => {
    const type = classifyStep(text);
    const x = H_PADDING;
    const y = V_PADDING + index * (NODE_HEIGHT + VERT_GAP);

    if (type === 'decision') {
      nodesSvg += createDiamondNode(x, y, text);
    } else {
      nodesSvg += createRectNode(x, y, text, type);
    }

    const currentTopX = centerX;
    const currentTopY = y;

    if (index > 0 && prevBottomX != null && prevBottomY != null) {
      arrowsSvg += createArrow(prevBottomX, prevBottomY, currentTopX, currentTopY);
    }

    prevBottomX = centerX;
    prevBottomY = y + NODE_HEIGHT;
  });

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${svgWidth}" height="${svgHeight}"
         viewBox="0 0 ${svgWidth} ${svgHeight}">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8"
                refX="5" refY="3"
                orient="auto"
                markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L6,3 z" fill="${COLORS.arrow}" />
        </marker>
      </defs>

      ${arrowsSvg}
      ${nodesSvg}
    </svg>
  `;

  chartEl.innerHTML = svg;
}

// ---------- Saved flows (localStorage) ----------

const STORAGE_KEY = 'simpleFlow.savedFlows.v1';

function sfGetSavedFlows() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse saved flows', e);
    return [];
  }
}

function sfSetSavedFlows(flows) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
  } catch (e) {
    console.error('Failed to save flows', e);
  }
}

function sfRefreshSavedDropdown(activeId) {
  if (!savedSelectEl) return;

  const flows = sfGetSavedFlows();
  savedSelectEl.innerHTML = '';

  if (!flows.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No saved flows yet';
    savedSelectEl.appendChild(opt);
    return;
  }

  flows.forEach(flow => {
    const opt = document.createElement('option');
    opt.value = String(flow.id);

    const date = new Date(flow.timestamp);
    const dateLabel = isNaN(date.getTime())
      ? ''
      : ` – ${date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}`;

    opt.textContent = `${flow.name}${dateLabel}`;
    savedSelectEl.appendChild(opt);
  });

  if (activeId) {
    savedSelectEl.value = String(activeId);
  }
}

function sfSuggestNameFromSteps(stepsText) {
  const lines = stepsText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines.length) return 'Untitled flow';

  const first = lines[0].replace(/^\d+[\.\)]\s*/, '');
  return first || 'Untitled flow';
}

// ---------- Event wiring ----------

const renderBtn = document.getElementById('render');
if (renderBtn) {
  renderBtn.addEventListener('click', render);
}

// Quick Ctrl+Enter render from textarea
if (stepsEl) {
  stepsEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      render();
    }
  });
}

// Toggle saved panel
if (savedToggleEl && savedBlockEl) {
  savedToggleEl.addEventListener('change', () => {
    savedBlockEl.style.display = savedToggleEl.checked ? 'block' : 'none';
  });
}

// Save current flow
if (saveFlowBtn) {
  saveFlowBtn.addEventListener('click', () => {
    const stepsText = stepsEl.value.trim();
    if (!stepsText) {
      alert('Nothing to save – add some steps first.');
      return;
    }

    const flows = sfGetSavedFlows();
    const suggested = sfSuggestNameFromSteps(stepsText);
    const name = prompt('Name for this flowchart:', suggested) || suggested;

    const flow = {
      id: Date.now(),
      name,
      steps: stepsText,
      autoStartEnd: !!autoStartEndEl?.checked,
      timestamp: Date.now()
    };

    flows.push(flow);
    sfSetSavedFlows(flows);
    sfRefreshSavedDropdown(flow.id);
  });
}

// Load selected saved flow
if (savedSelectEl) {
  savedSelectEl.addEventListener('change', () => {
    const id = Number(savedSelectEl.value);
    if (!id) return;

    const flows = sfGetSavedFlows();
    const flow = flows.find(f => f.id === id);
    if (!flow) return;

    stepsEl.value = flow.steps;
    if (autoStartEndEl) {
      autoStartEndEl.checked = !!flow.autoStartEnd;
    }

    render();
  });
}

// Delete selected saved flow
if (deleteFlowBtn) {
  deleteFlowBtn.addEventListener('click', () => {
    const id = Number(savedSelectEl.value);
    if (!id) {
      alert('No saved flow selected.');
      return;
    }

    const flows = sfGetSavedFlows();
    const flow = flows.find(f => f.id === id);
    if (!flow) {
      alert('Could not find that saved flow.');
      return;
    }

    if (!confirm(`Delete saved flow "${flow.name}"?`)) return;

    const newFlows = flows.filter(f => f.id !== id);
    sfSetSavedFlows(newFlows);
    sfRefreshSavedDropdown();
  });
}

// Initialise on load
sfRefreshSavedDropdown();
render();
