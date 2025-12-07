// ===================== Flowchart From Steps - popup.js =====================

// DOM refs
const stepsEl = document.getElementById('steps');
const chart = document.getElementById('chart');
const autoStartEndEl = document.getElementById('autoStartEnd');
const syntaxEl = document.getElementById('syntax'); // syntax/key panel

// Saved flows DOM refs
const saveFlowBtn   = document.getElementById('saveFlowBtn');
const deleteFlowBtn = document.getElementById('deleteFlowBtn');
const savedSelectEl = document.getElementById('savedSelect');

// Compare-mode DOM refs
const singleChartWrapEl = document.getElementById('singleChartWrap');
const compareWrapEl     = document.getElementById('compareWrap');
const chartAEl          = document.getElementById('chartA');
const chartBEl          = document.getElementById('chartB');
const compareTitleAEl   = document.getElementById('compareTitleA');
const compareTitleBEl   = document.getElementById('compareTitleB');
const compareSelectAEl  = document.getElementById('compareSelectA');
const compareSelectBEl  = document.getElementById('compareSelectB');
const compareRunBtn     = document.getElementById('compareRunBtn');
const compareClearBtn   = document.getElementById('compareClearBtn');

// Palette (explicit fills so PNG/SVG export preserves colors)
const COLORS = {
  process:  '#b7d2ff',
  startend: '#a7e0b3',
  decision: '#ffe08a',
  stroke:   '#1d2233',
  arrow:    '#333',
  text:     '#111',
  label:    '#9aa3b2',      // normal helper labels (not branch)
  branchUI: '#ffffff',      // UI-only color for Yes/No (dark mode)
  branchExport: '#111111'   // Export color for Yes/No (white background)
};

// Keys for website persistence
const LAST_INPUT_KEY = 'simpleFlow.lastInput';
const LAST_AUTO_KEY  = 'simpleFlow.autoStartEnd';

// Buttons
document.getElementById('render').addEventListener('click', render);
const sampleBtn = document.getElementById('sample');
if (sampleBtn) sampleBtn.addEventListener('click', () => {
  // Neutral, non-work sample
  stepsEl.value = [
    "1. I want a coffee",
    "D. Is the cafe open?",
    "Yes = Get coffee",
    "No = Make it at home"
  ].join("\n");
  render();
});
document.getElementById('downloadPng').addEventListener('click', downloadPNG);
document.getElementById('downloadSvg').addEventListener('click', downloadSVG);

// NEW: copy image button (if present)
const copyPngBtn = document.getElementById('copyPng');
if (copyPngBtn) copyPngBtn.addEventListener('click', copyPNGToClipboard);

// ---------- Debounce ----------
function debounce(fn, delay = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
const debouncedRender = debounce(render, 250);

// ========== Website init: load last input & settings from localStorage ======
(function initFromLocalStorage() {
  try {
    const lastInput = window.localStorage.getItem(LAST_INPUT_KEY);
    if (typeof lastInput === 'string') {
      stepsEl.value = lastInput;
    }
    const lastAuto = window.localStorage.getItem(LAST_AUTO_KEY);
    if (lastAuto !== null) {
      autoStartEndEl.checked = lastAuto === '1';
    }
  } catch (e) {
    console.warn('Could not read last input/autoStartEnd from localStorage', e);
  }

  updateSyntax();
  if (stepsEl.value.trim()) {
    render();
  }
})();

// Live render while typing + persist (website)
stepsEl.addEventListener('input', () => {
  try {
    window.localStorage.setItem(LAST_INPUT_KEY, stepsEl.value);
  } catch (e) {
    console.warn('Could not persist last input', e);
  }
  debouncedRender();
});

// Toggle renders immediately + persist (website)
autoStartEndEl.addEventListener('change', () => {
  try {
    window.localStorage.setItem(LAST_AUTO_KEY, autoStartEndEl.checked ? '1' : '0');
  } catch (e) {
    console.warn('Could not persist autoStartEnd', e);
  }
  render();
});

// ============================== Parsing ====================================
// Supports steps, inline decisions "[?] Q | Yes -> A | No -> B",
// and block decisions "D. Question" then "Label = Action" lines.
function parseLines(text, withStartEnd = true) {
  const rawLines = text.split(/\r?\n/);
  const nodes = [];

  const isNumbered = (s) => /^\s*\d+\.\s+/i.test(s);
  const isDecisionBlockStart = (s) => /^\s*D(\.|[\s])\s*/i.test(s); // allow "d."
  const isInlineDecision = (s) => s.trim().startsWith('[?]');

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isInlineDecision(trimmed)) {
      const body = trimmed.slice(3).trim();
      const parts = body.split('|').map(p => p.trim());
      const question = parts[0] || 'Decision';
      const left = parseArrow(parts[1] || 'Yes -> Option A');
      const right = parseArrow(parts[2] || 'No -> Option B');
      nodes.push({ type: 'decision', question, left, right });
      continue;
    }

    if (isDecisionBlockStart(trimmed)) {
      const question = trimmed.replace(/^\s*D(\.|[\s])\s*/i, '').trim() || 'Decision';
      const branches = [];
      let j = i + 1;
      while (j < rawLines.length) {
        const t = (rawLines[j] ?? '').trim();
        if (!t) break;
        if (isNumbered(t) || isDecisionBlockStart(t) || isInlineDecision(t)) break;
        const br = parseBranchLine(t);
        if (br) branches.push(br);
        j++;
      }
      const left  = branches[0] || { label: 'Yes', text: 'Option A' };
      const right = branches[1] || { label: 'No',  text: 'Option B' };
      nodes.push({ type: 'decision', question, left, right });
      if (branches.length) i = j - 1; // skip consumed branch lines
      continue;
    }

    nodes.push({ type: 'process', text: trimmed.replace(/^\d+\.\s*/, '') });
  }

  if (withStartEnd) {
    nodes.unshift({ type: 'startend', text: 'Start' });
    nodes.push({ type: 'startend', text: 'End' });
  }

  return nodes;
}

function parseArrow(s) {
  const m = (s || '').split(/(?:->|=|:)/);
  return { label: (m[0] || 'Yes').trim(), text: (m[1] || 'Next step').trim() };
}
function parseBranchLine(s) {
  const m = s.match(/^\s*([A-Za-z][\w\/\+\- ]*)\s*(?:=|->|:)\s*(.+)\s*$/);
  return m ? { label: m[1].trim(), text: m[2].trim() } : null;
}

// ============================== Layout =====================================
function layout(nodes) {
  const boxMinW = 220, boxMinH = 56, gapY = 50, gapX = 36, margin = 20;
  let y = margin;

  const placed = [];
  const measureText = (s) => {
    const lines = wrapText(s, 24).length;
    const w = Math.max(boxMinW, Math.min(420, 14 * Math.min((s || '').length, 38) + 40));
    const h = Math.max(boxMinH, 24 * lines + 18);
    return { w, h };
  };

  const centerX = margin + 180;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];

    if (n.type === 'process' || n.type === 'startend') {
      const { w, h } = measureText(n.text || n.question);
      placed.push({ kind: n.type, text: n.text, x: centerX - w / 2, y, w, h, id: i });
      y += h + gapY;
      continue;
    }

    if (n.type === 'decision') {
      y += gapY; // equal space ABOVE the diamond

      const { w: qw, h: qh } = measureText(n.question);
      const diamondW = Math.max(qw, 180);
      const diamondH = Math.max(qh, 60);

      const dec = {
        kind: 'decision',
        question: n.question,
        x: centerX,
        y,
        w: diamondW,
        h: diamondH,
        id: i,
        leftLabel: n.left.label,
        rightLabel: n.right.label
      };
      placed.push(dec);

      const leftBox  = measureText(n.left.text);
      const rightBox = measureText(n.right.text);

      const childY = y + diamondH + gapY; // equal space BELOW
      placed.push({
        kind: 'process',
        text: n.left.text,
        x: centerX - (leftBox.w + gapX),
        y: childY,
        w: leftBox.w,
        h: leftBox.h,
        id: i + ':L'
      });
      placed.push({
        kind: 'process',
        text: n.right.text,
        x: centerX + gapX,
        y: childY,
        w: rightBox.w,
        h: rightBox.h,
        id: i + ':R'
      });

      y = childY + Math.max(leftBox.h, rightBox.h) + gapY;
      placed.push({ kind: 'merge', x: centerX, y, id: i + ':M' });
    }
  }

  const height = y + margin;
  return { placed, height, margin };
}

// ===================== Click-to-mark-problem helpers =======================

// Attach click handler to a node group
function attachNodeClick(nodeGroup) {
  nodeGroup.addEventListener('click', handleNodeClick);
}

// Actual click handler for marking/unmarking problem nodes
function handleNodeClick(e) {
  // Don't let this bubble up and interfere with chart pointer handlers
  e.stopPropagation();

  const el = e.currentTarget; // <g class="node-group ...">
  if (!el) return;

  // Main visible shape inside the node (rect for process/start/end, path for diamond)
  const shape = el.querySelector('rect, path');
  if (!shape) return;

  const isProblem = el.getAttribute('data-problem') === '1';

  if (!isProblem) {
    // Store original colours so we can restore later
    shape.setAttribute('data-original-fill', shape.getAttribute('fill') || '');
    shape.setAttribute('data-original-stroke', shape.getAttribute('stroke') || '');

    // Turn node red
    shape.setAttribute('fill', '#fecaca');
    shape.setAttribute('stroke', '#b91c1c');

    el.setAttribute('data-problem', '1');
    el.classList.add('problem-node');   // hook for CSS if you want
  } else {
    const origFill = shape.getAttribute('data-original-fill');
    const origStroke = shape.getAttribute('data-original-stroke');

    if (origFill) shape.setAttribute('fill', origFill);
    if (origStroke) shape.setAttribute('stroke', origStroke);

    el.setAttribute('data-problem', '0');
    el.classList.remove('problem-node');
  }
}

// ============================== Render =====================================
function renderSVG(targetSvg, layoutData, options = { interactive: true }) {
  const { placed, height } = layoutData;
  const interactive = !!options.interactive;

  // Compute content bounds
  const bounds = placed.reduce((b, p) => {
    const left   = p.kind === 'decision' ? (p.x - p.w / 2) : p.x;
    const right  = p.kind === 'decision' ? (p.x + p.w / 2) : (p.x + (p.w || 0));
    const top    = p.kind === 'decision' ? (p.y - p.h / 2) : p.y;
    const bottom = p.kind === 'decision' ? (p.y + p.h / 2) : (p.y + (p.h || 0));
    b.minX = Math.min(b.minX, left);
    b.maxX = Math.max(b.maxX, right);
    b.minY = Math.min(b.minY, top);
    b.maxY = Math.max(b.maxY, bottom);
    return b;
  }, { minX: Infinity, maxX: -Infinity, minY: 0, maxY: height });

  const PAD = 60;
  const vbX = Math.floor(bounds.minX - PAD);
  const vbY = Math.floor(bounds.minY - PAD);
  const vbW = Math.ceil((bounds.maxX - bounds.minX) + PAD * 2);
  const vbH = Math.ceil((bounds.maxY - bounds.minY) + PAD * 2);

  // Size SVG to its container
  const pane = targetSvg.parentElement;
  const paneW = Math.max(320, pane.clientWidth  || 800);
  const paneH = Math.max(240, pane.clientHeight || 600);

  targetSvg.innerHTML = '';
  targetSvg.setAttribute('width', paneW);
  targetSvg.setAttribute('height', paneH);
  targetSvg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
  targetSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  targetSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // Arrowhead marker
  const defs = svg('defs', {});
  const marker = svg('marker', {
    id: 'arrow',
    markerWidth: 10,
    markerHeight: 8,
    refX: 9,
    refY: 4,
    orient: 'auto',
    markerUnits: 'strokeWidth'
  });
  marker.appendChild(svg('path', { d: 'M0,0 L10,4 L0,8 z', fill: COLORS.arrow }));
  defs.appendChild(marker);
  targetSvg.appendChild(defs);

  const g = svg('g', {});
  targetSvg.appendChild(g);

  const centers = new Map();

  const drawText = (group, cx, cy, textStr, isLabel = false) => {
    const lines = wrapText(textStr, 24);
    lines.forEach((line, i) => {
      group.appendChild(svg('text', {
        x: cx,
        y: cy - (lines.length - 1) * 9 + i * 18,
        'font-size': isLabel ? 11 : 12,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: isLabel ? COLORS.label : COLORS.text,
        'font-family': 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      }, line));
    });
  };

  function drawBranchLabel(x, y, text) {
    const t = svg('text', {
      x, y,
      'font-size': 12,
      'font-weight': '600',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: COLORS.branchUI,                         // white on dark UI
      'data-role': 'branch-label',                   // so we can flip on export
      'data-branch-y': y,                            // for hideBelow()
      'font-family': 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    }, text);
    t.setAttribute('paint-order', 'stroke');
    t.setAttribute('stroke', '#00000080');
    t.setAttribute('stroke-width', '1');
    t.style.setProperty('fill', COLORS.branchUI, 'important');
    g.appendChild(t);
  }

  // Mark decision branch lines as connector-line
  function drawLabeledLine(a, b, label, sideBias = 0) {
    g.appendChild(svg('line', {
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      stroke: COLORS.arrow,
      'stroke-width': 1.6,
      'marker-end': 'url(#arrow)',
      class: 'connector-line',
      'data-connector': '1'
    }));
    const midx = (a.x + b.x) / 2 + (sideBias * 12);
    const midy = (a.y + b.y) / 2 - 10;
    drawBranchLabel(midx, midy, label);
  }

  // Nodes (wrapped in <g> so we can highlight + hide them)
  for (const p of placed) {
    if (p.kind === 'process' || p.kind === 'startend') {
      const centerY = p.y + p.h / 2;
      const nodeGroup = svg('g', {
        'data-node-id': p.id,
        'data-node-y': centerY,
        class: `node-group node-${p.kind}`
      });

      const rect = svg('rect', {
        x: p.x, y: p.y, width: p.w, height: p.h,
        rx: p.kind === 'startend' ? 24 : 12,
        ry: p.kind === 'startend' ? 24 : 12,
        fill: p.kind === 'startend' ? COLORS.startend : COLORS.process,
        stroke: COLORS.stroke, 'stroke-width': 1.2
      });
      nodeGroup.appendChild(rect);
      drawText(nodeGroup, p.x + p.w / 2, p.y + p.h / 2, p.text);

      if (interactive) {
        attachNodeClick(nodeGroup);
      }

      g.appendChild(nodeGroup);
      centers.set(p.id, {
        top: { x: p.x + p.w / 2, y: p.y },
        bottom: { x: p.x + p.w / 2, y: p.y + p.h }
      });
    }

    if (p.kind === 'decision') {
      const centerY = p.y;
      const nodeGroup = svg('g', {
        'data-node-id': p.id,
        'data-node-y': centerY,
        class: 'node-group node-decision'
      });

      const path = diamondPath(p.x, p.y, p.w, p.h);
      nodeGroup.appendChild(svg('path', {
        d: path,
        fill: COLORS.decision,
        stroke: COLORS.stroke,
        'stroke-width': 1.2
      }));
      drawText(nodeGroup, p.x, p.y, p.question);

      if (interactive) {
        attachNodeClick(nodeGroup);
      }

      g.appendChild(nodeGroup);
      centers.set(p.id, {
        top: { x: p.x, y: p.y - p.h / 2 },
        bottom: { x: p.x, y: p.y + p.h / 2 },
        left: { x: p.x - p.w / 2, y: p.y },
        right: { x: p.x + p.w / 2, y: p.y }
      });
    }

    if (p.kind === 'merge') {
      const centerY = p.y;
      const nodeGroup = svg('g', {
        'data-node-id': p.id,
        'data-node-y': centerY,
        class: 'node-merge'
      });

      nodeGroup.appendChild(svg('circle', {
        cx: p.x,
        cy: p.y + 6,
        r: 4,
        fill: COLORS.stroke
      }));

      g.appendChild(nodeGroup);

      centers.set(p.id, {
        top: { x: p.x, y: p.y - 1 },
        bottom: { x: p.x, y: p.y + 1 }
      });
    }
  }

  // Connectors (with Yes/No labels for decisions)
  for (let i = 0; i < placed.length - 1; i++) {
    const cur = placed[i], nxt = placed[i + 1];
    if (cur.kind === 'decision') {
      const dec = centers.get(cur.id);
      const left  = placed[i + 1];
      const right = placed[i + 2];
      const merge = placed[i + 3];

      if (left)  drawLabeledLine(dec.left,  centers.get(left.id).top,  (cur.leftLabel  || 'Yes'), -1);
      if (right) drawLabeledLine(dec.right, centers.get(right.id).top, (cur.rightLabel || 'No'),  +1);

      if (merge && centers.get(left.id) && centers.get(merge.id)) {
        g.appendChild(svg('line', {
          x1: centers.get(left.id).bottom.x,
          y1: centers.get(left.id).bottom.y,
          x2: centers.get(merge.id).top.x,
          y2: centers.get(merge.id).top.y,
          stroke: COLORS.arrow,
          'stroke-width': 1.6,
          'marker-end': 'url(#arrow)',
          class: 'connector-line',
          'data-connector': '1'
        }));
      }

      if (merge && centers.get(right.id) && centers.get(merge.id)) {
        g.appendChild(svg('line', {
          x1: centers.get(right.id).bottom.x,
          y1: centers.get(right.id).bottom.y,
          x2: centers.get(merge.id).top.x,
          y2: centers.get(merge.id).top.y,
          stroke: COLORS.arrow,
          'stroke-width': 1.6,
          'marker-end': 'url(#arrow)',
          class: 'connector-line',
          'data-connector': '1'
        }));
      }

      const prev = placed[i - 1];
      if (prev) {
        g.appendChild(svg('line', {
          x1: centers.get(prev.id).bottom.x,
          y1: centers.get(prev.id).bottom.y,
          x2: dec.top.x,
          y2: dec.top.y,
          stroke: COLORS.arrow,
          'stroke-width': 1.6,
          'marker-end': 'url(#arrow)',
          class: 'connector-line',
          'data-connector': '1'
        }));
      }

      const afterMerge = placed[i + 4];
      if (afterMerge) {
        g.appendChild(svg('line', {
          x1: centers.get(merge.id).bottom.x,
          y1: centers.get(merge.id).bottom.y,
          x2: centers.get(afterMerge.id).top.x,
          y2: centers.get(afterMerge.id).top.y,
          stroke: COLORS.arrow,
          'stroke-width': 1.6,
          'marker-end': 'url(#arrow)',
          class: 'connector-line',
          'data-connector': '1'
        }));
      }

      i += 3;
    } else {
      const a = centers.get(cur.id)?.bottom;
      const b = centers.get(nxt.id)?.top;
      if (a && b) {
        g.appendChild(svg('line', {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: COLORS.arrow,
          'stroke-width': 1.6,
          'marker-end': 'url(#arrow)',
          class: 'connector-line',
          'data-connector': '1'
        }));
      }
    }
  }

  // Only the main chart updates the syntax panel
  if (targetSvg === chart) {
    updateSyntax();
  }
}

// Render helper for the main chart
function render() {
  const nodes = parseLines(stepsEl.value, autoStartEndEl.checked);
  const L = layout(nodes);
  renderSVG(chart, L, { interactive: true });
}

// ============================= Utilities ===================================
function updateSyntax() {
  if (!syntaxEl) return;
  syntaxEl.innerHTML = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height:1.4;">
      <strong>Key</strong>
      <ul style="margin:6px 0 0 16px; padding:0;">
        <li><code>1.</code> = Step</li>
        <li><code>D.</code> = Decision &nbsp;<small>(use branches like <code>Yes = ...</code> / <code>No = ...</code>)</small></li>
        <li><code>[?]</code> = Inline decision &nbsp;<small>(e.g. <code>[?] Question | Yes -> A | No -> B</code>)</small></li>
        <li>Click any node to mark it as a problem.</li>
        <li>Drag across connector lines to cut and hide everything below.</li>
      </ul>
    </div>
  `;
}

function svg(tag, attrs, textContent) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (textContent != null) el.textContent = textContent;
  return el;
}
function diamondPath(cx, cy, w, h) {
  return `M ${cx} ${cy - h / 2} L ${cx + w / 2} ${cy} L ${cx} ${cy + h / 2} L ${cx - w / 2} ${cy} Z`;
}
function wrapText(s, maxCharsPerLine = 22) {
  const words = (s || '').split(/\s+/);
  const lines = [];
  let cur = [];
  for (const w of words) {
    const joined = cur.join(' ');
    const newLen = (joined ? joined.length + 1 : 0) + w.length;
    if (newLen > maxCharsPerLine * 1.2) {
      if (cur.length) lines.push(joined);
      cur = [w];
    } else {
      cur.push(w);
    }
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines;
}

// ================== Cut + prune-below-by-drag interaction ==================

let isCutDragging = false;
let activePointerId = null;

// Hide all nodes, lines, and branch labels below a Y cutoff
function hideBelow(cutoffY) {
  // Hide node groups (process/start/end/decisions)
  const groups = chart.querySelectorAll('.node-group');
  groups.forEach(node => {
    const y = parseFloat(node.getAttribute('data-node-y') || '0');
    if (y >= cutoffY) {
      node.style.display = 'none';
    }
  });

  // Hide connector lines below cutoff
  const lines = chart.querySelectorAll('line');
  lines.forEach(line => {
    const y1 = parseFloat(line.getAttribute('y1') || '0');
    const y2 = parseFloat(line.getAttribute('y2') || '0');
    const midY = (y1 + y2) / 2;
    if (midY >= cutoffY) {
      line.style.display = 'none';
    }
  });

  // Hide branch labels below cutoff
  const branchLabels = chart.querySelectorAll('[data-branch-y]');
  branchLabels.forEach(lbl => {
    const y = parseFloat(lbl.getAttribute('data-branch-y') || '0');
    if (y >= cutoffY) {
      lbl.style.display = 'none';
    }
  });
}

// Helper: if pointer is over a connector line, remove it and prune below it
function cutAtPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return;

  if (
    el.tagName &&
    el.tagName.toLowerCase() === 'line' &&
    el.getAttribute('data-connector') === '1'
  ) {
    const y1 = parseFloat(el.getAttribute('y1') || '0');
    const y2 = parseFloat(el.getAttribute('y2') || '0');
    const cutoff = Math.max(y1, y2); // everything visually "below" the line
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
    hideBelow(cutoff);
  }
}

// Start cutting ONLY when pointer goes down on a connector line
chart.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return; // only left/primary button

  const t = e.target;
  const isConnector =
    t &&
    t.tagName &&
    t.tagName.toLowerCase() === 'line' &&
    t.getAttribute('data-connector') === '1';

  // If not on a connector line, don't start cut-drag; allow normal node clicks
  if (!isConnector) return;

  isCutDragging = true;
  activePointerId = e.pointerId;
  chart.setPointerCapture(e.pointerId);

  cutAtPoint(e.clientX, e.clientY);
});

chart.addEventListener('pointermove', (e) => {
  if (!isCutDragging || e.pointerId !== activePointerId) return;
  cutAtPoint(e.clientX, e.clientY);
});

function endCutDrag(e) {
  if (!isCutDragging || e.pointerId !== activePointerId) return;
  isCutDragging = false;
  activePointerId = null;
  try {
    chart.releasePointerCapture(e.pointerId);
  } catch (_) {
    // ignore if capture wasn't set
  }
}

chart.addEventListener('pointerup', endCutDrag);
chart.addEventListener('pointercancel', endCutDrag);

// ============================== Export =====================================
// Normalize + color-flip branch labels so exports are centered and readable.
function normalizeSVGForExport(srcSvg) {
  const vb = srcSvg.viewBox.baseVal;
  const clone = srcSvg.cloneNode(true);

  // standardize geometry
  clone.setAttribute('width', vb.width);
  clone.setAttribute('height', vb.height);
  clone.setAttribute('viewBox', `0 0 ${vb.width} ${vb.height}`);

  // translate content to 0,0
  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wrapper.setAttribute('transform', `translate(${-vb.x}, ${-vb.y})`);
  while (clone.firstChild) wrapper.appendChild(clone.firstChild);
  clone.appendChild(wrapper);

  // flip branch label color to export color
  const labels = clone.querySelectorAll('[data-role="branch-label"]');
  labels.forEach(el => {
    el.setAttribute('fill', COLORS.branchExport);
    el.setAttribute('stroke', '#ffffff00'); // remove halo on export
    el.style.setProperty('fill', COLORS.branchExport, 'important');
  });

  return { clone, width: vb.width, height: vb.height };
}

// PNG: white background for export to avoid dark-mode inversion.
function downloadPNG() {
  const { clone, width, height } = normalizeSVGForExport(chart);

  // white background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', width); bg.setAttribute('height', height);
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  const serializer = new XMLSerializer();
  const src = serializer.serializeToString(clone);
  const img = new Image();
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(blob => triggerDownload(URL.createObjectURL(blob), 'flowchart.png'));
  };
  img.src = url;
}

function downloadSVG() {
  const { clone, width, height } = normalizeSVGForExport(chart);

  // white background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', width); bg.setAttribute('height', height);
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  const serializer = new XMLSerializer();
  const src = serializer.serializeToString(clone);
  const blob = new Blob([src], {type: 'image/svg+xml;charset=utf-8'});
  triggerDownload(URL.createObjectURL(blob), 'flowchart.svg');
}

// NEW: copy PNG directly to clipboard
function copyPNGToClipboard() {
  if (!navigator.clipboard || !window.ClipboardItem) {
    alert('Copying images is not supported in this browser. Please use Download PNG instead.');
    return;
  }

  const { clone, width, height } = normalizeSVGForExport(chart);

  // white background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', width); bg.setAttribute('height', height);
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  const serializer = new XMLSerializer();
  const src = serializer.serializeToString(clone);
  const img = new Image();
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(async blob => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        alert('Flowchart copied to clipboard as an image.');
      } catch (err) {
        console.error(err);
        alert('Could not copy image. Please use Download PNG instead.');
      }
    });
  };
  img.src = url;
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================== Saved flows ================================

const SAVED_FLOWS_KEY = 'simpleFlow.savedFlows.v1';

function sfGetSavedFlows() {
  try {
    const raw = window.localStorage.getItem(SAVED_FLOWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to read saved flows', e);
    return [];
  }
}

function sfSetSavedFlows(flows) {
  try {
    window.localStorage.setItem(SAVED_FLOWS_KEY, JSON.stringify(flows));
  } catch (e) {
    console.error('Failed to write saved flows', e);
  }
}

function sfFillSelect(selectEl, flows, placeholder) {
  if (!selectEl) return;
  selectEl.innerHTML = '';

  const baseOpt = document.createElement('option');
  baseOpt.value = '';
  baseOpt.textContent = placeholder;
  selectEl.appendChild(baseOpt);

  flows.forEach(flow => {
    const opt = document.createElement('option');
    opt.value = String(flow.id);
    const d = new Date(flow.timestamp);
    const dateLabel = isNaN(d.getTime())
      ? ''
      : ` – ${d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}`;
    opt.textContent = `${flow.name}${dateLabel}`;
    selectEl.appendChild(opt);
  });
}

function sfRefreshSavedDropdown(activeId) {
  const flows = sfGetSavedFlows();

  sfFillSelect(savedSelectEl, flows, flows.length ? 'Select a saved flow' : 'No saved flows yet');
  sfFillSelect(compareSelectAEl, flows, 'Pick first flow');
  sfFillSelect(compareSelectBEl, flows, 'Pick second flow');

  if (savedSelectEl && activeId) {
    savedSelectEl.value = String(activeId);
  }
}

function sfSuggestNameFromSteps(text) {
  const lines = (text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines.length) return 'Untitled flow';

  const first = lines[0].replace(/^\d+[\.\)]\s*/, '');
  return first || 'Untitled flow';
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

    stepsEl.value = flow.steps || '';
    if (autoStartEndEl) {
      autoStartEndEl.checked = !!flow.autoStartEnd;
    }

    // Persist as "last" input on website
    try {
      window.localStorage.setItem(LAST_INPUT_KEY, stepsEl.value);
      window.localStorage.setItem(LAST_AUTO_KEY, autoStartEndEl.checked ? '1' : '0');
    } catch (e) {
      console.warn('Could not persist last values from saved flow', e);
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

// Initialise saved dropdown
sfRefreshSavedDropdown();

// ============================== Compare mode ===============================

function showCompareMode() {
  if (!singleChartWrapEl || !compareWrapEl) return;
  singleChartWrapEl.style.display = 'none';
  compareWrapEl.style.display = 'block';
}

function clearCompareMode() {
  if (!singleChartWrapEl || !compareWrapEl) return;
  compareWrapEl.style.display = 'none';
  singleChartWrapEl.style.display = 'block';

  if (chartAEl) chartAEl.innerHTML = '';
  if (chartBEl) chartBEl.innerHTML = '';
  if (compareTitleAEl) compareTitleAEl.textContent = '';
  if (compareTitleBEl) compareTitleBEl.textContent = '';
}

function renderCompareChart(targetSvg, titleEl, flow) {
  if (!targetSvg || !flow) return;

  if (titleEl) {
    titleEl.textContent = flow.name || '';
  }

  const nodes = parseLines(flow.steps || '', !!flow.autoStartEnd);
  const L = layout(nodes);
  renderSVG(targetSvg, L, { interactive: false });
}

if (compareRunBtn) {
  compareRunBtn.addEventListener('click', () => {
    const idA = Number(compareSelectAEl?.value || '');
    const idB = Number(compareSelectBEl?.value || '');

    if (!idA || !idB) {
      alert('Please choose two saved flows to compare.');
      return;
    }
    if (idA === idB) {
      alert('Please choose two different flows.');
      return;
    }

    const flows = sfGetSavedFlows();
    const flowA = flows.find(f => f.id === idA);
    const flowB = flows.find(f => f.id === idB);

    if (!flowA || !flowB) {
      alert('Could not find one of the selected flows.');
      return;
    }

    showCompareMode();
    renderCompareChart(chartAEl, compareTitleAEl, flowA);
    renderCompareChart(chartBEl, compareTitleBEl, flowB);
  });
}

if (compareClearBtn) {
  compareClearBtn.addEventListener('click', () => {
    clearCompareMode();
  });
}
