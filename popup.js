// ===================== Flowchart From Steps - popup.js =====================

// DOM refs
const stepsEl = document.getElementById('steps');
const chart = document.getElementById('chart');
const autoStartEndEl = document.getElementById('autoStartEnd');
const syntaxEl = document.getElementById('syntax'); // syntax/key panel

// Palette (explicit fills so PNG/SVG export preserves colors)
const COLORS = {
  process:  '#b7d2ff',
  startend: '#a7e0b3',
  decision: '#ffe08a',
  stroke:   '#1d2233',
  arrow:    '#333',
  text:     '#111',
  branchUI: '#ffffff',  // on-screen branch label text
  branchExport: '#333333' // export (PNG/SVG) branch label text
};

// ============================ Parsing ======================================
// Parse text into a richer node model that supports branching.
function parseLines(raw, autoStartEnd) {
  const lines = raw.split('\n')
    .map(l => l.trim())
    .filter(l => l.length);

  const nodes = [];
  let counter = 1;

  // auto-inject Start/End if requested
  function addStartEndIfNeeded() {
    if (!autoStartEnd || !lines.length) return;
    const first = lines[0];
    const last  = lines[lines.length - 1];

    if (!/^\d+\./.test(first) && !/^D\./i.test(first)) {
      nodes.push({
        type: 'startend',
        label: `0. Start`,
        text: first.replace(/^\d+\.\s*/, ''),
      });
    }
    if (!/^\d+\./.test(last) && !/^D\./i.test(last)) {
      const text = last.replace(/^\d+\.\s*/, '');
      // We'll just append "End" as a final node later
      // but for now treat as normal process
      // (simpler mental model; layout will treat kind === 'startend' specially)
    }
  }

  addStartEndIfNeeded();

  for (const line of lines) {
    // Decision lines: D. Question? Yes = Go here, No = Go there
    if (/^D\./i.test(line)) {
      const withoutPrefix = line.replace(/^D\.\s*/, '');
      const qMatch = withoutPrefix.split('?');
      const question = (qMatch[0] || '').trim() + '?';
      const rest = (qMatch[1] || '').trim();

      let leftText = 'Yes path';
      let rightText = 'No path';
      let leftLabel = 'Yes';
      let rightLabel = 'No';

      // Parse "Yes = X | No = Y" or "Yes -> X | No -> Y"
      const parts = rest.split('|').map(p => p.trim());
      for (const p of parts) {
        const m = /^(Yes|No)\s*(=|->)\s*(.+)$/i.exec(p);
        if (m) {
          const side = m[1].toLowerCase();
          const text = m[3].trim();
          if (side === 'yes') {
            leftText = text;
            leftLabel = 'Yes';
          } else {
            rightText = text;
            rightLabel = 'No';
          }
        }
      }

      nodes.push({
        type: 'decision',
        label: `D.`,
        question,
        left:  { text: leftText,  label: leftLabel },
        right: { text: rightText, label: rightLabel }
      });
    } else if (/^\d+\./.test(line)) {
      // Numbered process step
      const m = /^(\d+)\.\s*(.+)$/.exec(line);
      if (m) {
        const num = m[1];
        const text = m[2];
        nodes.push({
          type: 'process',
          label: `${num}.`,
          text
        });
        counter = Math.max(counter, Number(num) + 1);
      }
    } else {
      // Fallback: treat as a process step with implicit counter
      nodes.push({
        type: 'process',
        label: `${counter++}.`,
        text: line
      });
    }
  }

  if (autoStartEnd && nodes.length) {
    // ensure first and last are start/end style if not already
    if (nodes[0].type !== 'startend') {
      nodes[0] = {
        ...nodes[0],
        type: 'startend'
      };
    }
    const lastIdx = nodes.length - 1;
    if (nodes[lastIdx].type !== 'startend') {
      nodes[lastIdx] = {
        ...nodes[lastIdx],
        type: 'startend'
      };
    }
  }

  return nodes;
}

// ============================ Layout =======================================
// Simple vertical layout with decisions + branches
function layout(nodes) {
  const margin = 40;
  const centerX = 300; // fixed center for now
  const gapY = 40;
  const gapX = 120;

  const placed = [];
  let y = margin;

  function measureText(str) {
    // Approximate text measure so layout is stable without canvas
    const baseWidth = 8; // px per char
    const maxLineChars = 24;
    const words = str.split(/\s+/);
    const lines = [];
    let cur = [];
    let len = 0;

    for (const w of words) {
      if (len + w.length + (cur.length ? 1 : 0) > maxLineChars) {
        lines.push(cur.join(' '));
        cur = [w];
        len = w.length;
      } else {
        cur.push(w);
        len += w.length + (cur.length > 1 ? 1 : 0);
      }
    }
    if (cur.length) lines.push(cur.join(' '));

    const longest = Math.max(...lines.map(l => l.length), 10);
    return {
      w: longest * baseWidth + 20,
      h: lines.length * 18 + 16,
      lines
    };
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];

    if (n.type === 'process' || n.type === 'startend') {
      const { w, h } = measureText(n.text);
      placed.push({
        kind: n.type === 'startend' ? 'startend' : 'process',
        text: n.text,
        label: n.label,
        x: centerX - w / 2,
        y,
        w,
        h,
        id: i
      });
      y += h + gapY;
    } else if (n.type === 'decision') {
      y += gapY; // equal space ABOVE the diamond

      const { w: qw, h: qh } = measureText(n.question);
      const diamondW = Math.max(qw, 180);
      const diamondH = Math.max(qh, 60);

      const dec = {
        kind: 'decision',
        question: n.question,
        x: centerX,
        y: y + diamondH / 2,
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
        label: '',
        x: centerX - (leftBox.w + gapX),
        y: childY,
        w: leftBox.w,
        h: leftBox.h,
        id: i + ':L'
      });
      placed.push({
        kind: 'process',
        text: n.right.text,
        label: '',
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

// ============================== Render =====================================
function renderSVG(layoutData) {
  const { placed, height } = layoutData;

  while (chart.firstChild) chart.removeChild(chart.firstChild);

  if (!placed.length) return;

  const width = 600;

  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.setAttribute('width', width);
  chart.setAttribute('height', height);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  chart.appendChild(g);

  // Precompute centers
  const centers = new Map();
  for (const p of placed) {
    if (p.kind === 'process' || p.kind === 'startend') {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      centers.set(p.id, {
        top:    { x: cx, y: p.y },
        bottom: { x: cx, y: p.y + p.h }
      });
    } else if (p.kind === 'decision') {
      const cx = p.x;
      const cy = p.y;
      centers.set(p.id, {
        top:    { x: cx, y: cy - p.h / 2 },
        bottom: { x: cx, y: cy + p.h / 2 },
        left:   { x: cx - p.w / 2, y: cy },
        right:  { x: cx + p.w / 2, y: cy }
      });
    } else if (p.kind === 'merge') {
      centers.set(p.id, {
        top:    { x: p.x, y: p.y },
        bottom: { x: p.x, y: p.y + 10 }
      });
    }
  }

  // Define arrow marker
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const markerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  markerPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  markerPath.setAttribute('fill', COLORS.arrow);
  marker.appendChild(markerPath);
  defs.appendChild(marker);
  chart.appendChild(defs);

  function drawText(group, x, y, w, measure, label) {
    const { lines } = measure;
    const lineHeight = 18;
    const totalHeight = lines.length * lineHeight;
    let curY = y + (measure.h - totalHeight) / 2 + lineHeight / 2;

    if (label) {
      const labelEl = svg('text', {
        x: x + 8,
        y: y + 14,
        'text-anchor': 'start',
        'dominant-baseline': 'hanging',
        fill: COLORS.text,
        'font-weight': 'bold',
        'font-size': '12',
        'font-family': 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      }, label);
      group.appendChild(labelEl);
      curY += 6;
    }

    for (const line of lines) {
      const t = svg('text', {
        x: x + w / 2,
        y: curY,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: COLORS.text,
        'font-size': '13',
        'font-family': 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
      }, line);
      group.appendChild(t);
      curY += lineHeight;
    }
  }

  function drawBranchLabel(x, y, text) {
    const t = svg('text', {
      x,
      y,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: COLORS.branchUI,                         // white on dark UI
      'data-role': 'branch-label',                   // so we can flip on export
      'font-family': 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    }, text);
    // subtle dark halo for readability on varied backgrounds
    t.setAttribute('paint-order', 'stroke');
    t.setAttribute('stroke', '#00000080');
    t.setAttribute('stroke-width', '1');

    // force fill with !important so popup.css can't override
    t.style.setProperty('fill', COLORS.branchUI, 'important');

    g.appendChild(t);
  }

  function drawDecision(p) {
    const path = svg('path', {
      d: diamondPath(p.x, p.y, p.w, p.h),
      fill: COLORS.decision,
      stroke: COLORS.stroke,
      'stroke-width': 1.2
    });
    g.appendChild(path);

    const measure = {
      lines: [p.question],
      h: 24,
      w: p.w
    };
    drawText(g, p.x - p.w / 2, p.y - p.h / 2, p.w, measure, p.label);
  }

  function drawMerge(p) {
    const circle = svg('circle', {
      cx: p.x,
      cy: p.y + 6,
      r: 4,
      fill: COLORS.stroke
    });
    g.appendChild(circle);
  }

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

  // Nodes
  for (const p of placed) {
    if (p.kind === 'process' || p.kind === 'startend') {
      const rect = svg('rect', {
        x: p.x, y: p.y, width: p.w, height: p.h,
        rx: p.kind === 'startend' ? 24 : 12,
        ry: p.kind === 'startend' ? 24 : 12,
        fill: p.kind === 'startend' ? COLORS.startend : COLORS.process,
        stroke: COLORS.stroke, 'stroke-width': 1.2
      });
      g.appendChild(rect);
      drawText(g, p.x, p.y, p.w, {
        lines: wrapText(p.text, 24),
        h: p.h,
        w: p.w
      }, p.label);
    } else if (p.kind === 'decision') {
      drawDecision(p);
    } else if (p.kind === 'merge') {
      drawMerge(p);
    }
  }

  // Connectors (with Yes/No labels for decisions)
  for (let i = 0; i < placed.length - 1; i++) {
    const cur = placed[i], nxt = placed[i + 1];

    if (cur.kind === 'decision') {
      const dec   = centers.get(cur.id);
      const left  = placed[i + 1];
      const right = placed[i + 2];
      const merge = placed[i + 3];

      // Branch lines (Yes / No) – use drawLabeledLine so they get data-connector
      if (left && centers.get(left.id)) {
        drawLabeledLine(dec.left, centers.get(left.id).top, (cur.leftLabel || 'Yes'), -1);
      }
      if (right && centers.get(right.id)) {
        drawLabeledLine(dec.right, centers.get(right.id).top, (cur.rightLabel || 'No'), +1);
      }

      // Left/right branches into merge node
      if (merge && centers.get(left?.id) && centers.get(merge.id)) {
        const leftBottom = centers.get(left.id).bottom;
        const mergeTop   = centers.get(merge.id).top;
        g.appendChild(svg('line', {
          x1: leftBottom.x,
          y1: leftBottom.y,
          x2: mergeTop.x,
          y2: mergeTop.y,
          stroke: COLORS.arrow,
          'stroke-width': 1.6,
          'marker-end': 'url(#arrow)',
          class: 'connector-line',
          'data-connector': '1'
        }));
      }

      if (merge && centers.get(right?.id) && centers.get(merge.id)) {
        const rightBottom = centers.get(right.id).bottom;
        const mergeTop    = centers.get(merge.id).top;
        g.appendChild(svg('line', {
          x1: rightBottom.x,
          y1: rightBottom.y,
          x2: mergeTop.x,
          y2: mergeTop.y,
          stroke: COLORS.arrow,
          'stroke-width': 1.6,
          'marker-end': 'url(#arrow)',
          class: 'connector-line',
          'data-connector': '1'
        }));
      }

      // Line from previous node into the decision node
      const prev = placed[i - 1];
      if (prev && centers.get(prev.id)) {
        const prevBottom = centers.get(prev.id).bottom;
        const decTop     = dec.top;
        g.appendChild(svg('line', {
          x1: prevBottom.x,
          y1: prevBottom.y,
          x2: decTop.x,
          y2: decTop.y,
          stroke: COLORS.arrow,
          'stroke-width': 1.6,
          'marker-end': 'url(#arrow)',
          class: 'connector-line',
          'data-connector': '1'
        }));
      }

      // Line from merge node back into the main flow
      const afterMerge = placed[i + 4];
      if (afterMerge && merge && centers.get(merge.id) && centers.get(afterMerge.id)) {
        const mergeBottom   = centers.get(merge.id).bottom;
        const afterMergeTop = centers.get(afterMerge.id).top;
        g.appendChild(svg('line', {
          x1: mergeBottom.x,
          y1: mergeBottom.y,
          x2: afterMergeTop.x,
          y2: afterMergeTop.y,
          stroke: COLORS.arrow,
          'stroke-width': 1.6,
          'marker-end': 'url(#arrow)',
          class: 'connector-line',
          'data-connector': '1'
        }));
      }

      // Skip over left, right, merge in the placed[] sequence
      i += 3;
    } else {
      // Simple linear connectors
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

  // Update syntax panel with the Key
  updateSyntax();
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
        <li><code>auto Start/End</code> = First &amp; last steps styled as Start / End</li>
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
  return `M ${cx} ${cy - h/2} L ${cx + w/2} ${cy} L ${cx} ${cy + h/2} L ${cx - w/2} ${cy} Z`;
}
function wrapText(str, maxChars) {
  const words = str.split(/\s+/);
  const lines = [];
  let cur = [];
  let len = 0;
  for (const w of words) {
    if (len + w.length + (cur.length ? 1 : 0) > maxChars) {
      lines.push(cur.join(' '));
      cur = [w];
      len = w.length;
    } else {
      cur.push(w);
      len += w.length + (cur.length > 1 ? 1 : 0);
    }
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines;
}

// ============================== Orchestration ===============================
function render() {
  const nodes = parseLines(stepsEl.value, autoStartEndEl.checked);
  const L = layout(nodes);
  renderSVG(L);
}

// ================== Cut-connectors-by-drag interaction ==================

let isCutDragging = false;
let activePointerId = null;

// Helper: if pointer is over a connector line, remove it
function cutAtPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return;

  if (
    el.tagName &&
    el.tagName.toLowerCase() === 'line' &&
    el.getAttribute('data-connector') === '1'
  ) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
}

// Start cutting on primary-button down inside the chart
chart.addEventListener('pointerdown', (e) => {
  // Optional: require Shift to be held while cutting
  // if (!e.shiftKey) return;

  if (e.button !== 0) return; // only left/primary button
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
  });

  return clone;
}

function downloadPNG() {
  const srcSvg = chart;
  if (!srcSvg) return;

  const clone = normalizeSVGForExport(srcSvg);
  const vb = clone.viewBox.baseVal;
  const canvas = document.createElement('canvas');
  const scale = 2; // retina-ish
  canvas.width  = vb.width  * scale;
  canvas.height = vb.height * scale;

  const ctx = canvas.getContext('2d');
  const serializer = new XMLSerializer();
  const src = serializer.serializeToString(clone);
  const blob = new Blob([src], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = function() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, vb.width, vb.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob((pngBlob) => {
      const pngUrl = URL.createObjectURL(pngBlob);
      triggerDownload(pngUrl, 'flowchart.png');
    }, 'image/png');
  };
  img.src = url;
}

function downloadSVG() {
  const srcSvg = chart;
  if (!srcSvg) return;

  const clone = normalizeSVGForExport(srcSvg);
  const vb = clone.viewBox.baseVal;

  clone.setAttribute('width', vb.width);
  clone.setAttribute('height', vb.height);
  clone.setAttribute('viewBox', `0 0 ${vb.width} ${vb.height}`);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', vb.width);
  bg.setAttribute('height', vb.height);
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  const serializer = new XMLSerializer();
  const src = serializer.serializeToString(clone);
  const blob = new Blob([src], {type: 'image/svg+xml;charset=utf-8'});
  triggerDownload(URL.createObjectURL(blob), 'flowchart.svg');
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// ===========================================================================
