// ===================== Simple Flow — popup.js =====================

// DOM refs
const stepsEl = document.getElementById("steps");
const chart = document.getElementById("chart");
const autoStartEndEl = document.getElementById("autoStartEnd");
const syntaxEl = document.getElementById("syntax");

// Buttons
document.getElementById("render").addEventListener("click", render);
document.getElementById("sample").addEventListener("click", () => {
  stepsEl.value = [
    "1. I want a coffee",
    "D. Is the café open?",
    "Yes = Get coffee",
    "No = Make it at home"
  ].join("\n");
  render();
});
document.getElementById("downloadPng").addEventListener("click", downloadPNG);
document.getElementById("downloadSvg").addEventListener("click", downloadSVG);
const copyPngBtn = document.getElementById("copyPng");
if (copyPngBtn) copyPngBtn.addEventListener("click", copyPNGToClipboard);

// Colors (explicit so exports keep them)
const COLORS = {
  process: "#b7d2ff",
  startend: "#a7e0b3",
  decision: "#ffe08a",
  stroke: "#1f2933",
  arrow: "#4b5563",
  text: "#e5e7eb",
  label: "#9ca3af",
  branchUI: "#ffffff",
  branchExport: "#111111"
};

// ------------------------ Parsing ------------------------
// Supports:
// - "1. Step text" → process
// - "D. Question" + "Yes = ..." / "No = ..." → decision block
// - "[?] Question | Yes -> A | No -> B"   → inline decision
function parseLines(text, withStartEnd = true) {
  const rawLines = text.split(/\r?\n/);
  const nodes = [];

  const isNumbered = (s) => /^\s*\d+\.\s+/i.test(s);
  const isDecisionBlockStart = (s) => /^\s*D(\.|[\s])\s*/i.test(s);
  const isInlineDecision = (s) => s.trim().startsWith("[?]");

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Inline decision
    if (isInlineDecision(trimmed)) {
      const body = trimmed.slice(3).trim();
      const parts = body.split("|").map((p) => p.trim());
      const question = parts[0] || "Decision";
      const left = parseArrow(parts[1] || "Yes -> Option A");
      const right = parseArrow(parts[2] || "No -> Option B");
      nodes.push({ type: "decision", question, left, right });
      continue;
    }

    // Block decision
    if (isDecisionBlockStart(trimmed)) {
      const question =
        trimmed.replace(/^\s*D(\.|[\s])\s*/i, "").trim() || "Decision";
      const branches = [];
      let j = i + 1;
      while (j < rawLines.length) {
        const t = (rawLines[j] ?? "").trim();
        if (!t) break;
        if (isNumbered(t) || isDecisionBlockStart(t) || isInlineDecision(t))
          break;
        const br = parseBranchLine(t);
        if (br) branches.push(br);
        j++;
      }
      const left = branches[0] || { label: "Yes", text: "Option A" };
      const right = branches[1] || { label: "No", text: "Option B" };
      nodes.push({ type: "decision", question, left, right });
      if (branches.length) i = j - 1;
      continue;
    }

    // Regular step
    nodes.push({
      type: "process",
      text: trimmed.replace(/^\d+\.\s*/, "")
    });
  }

  if (withStartEnd) {
    nodes.unshift({ type: "startend", text: "Start" });
    nodes.push({ type: "startend", text: "End" });
  }

  return nodes;
}

function parseArrow(s) {
  const m = (s || "").split(/(?:->|=|:)/);
  return {
    label: (m[0] || "Yes").trim(),
    text: (m[1] || "Next step").trim()
  };
}

function parseBranchLine(s) {
  const m = s.match(
    /^\s*([A-Za-z][\w\/\+\- ]*)\s*(?:=|->|:)\s*(.+)\s*$/
  );
  return m ? { label: m[1].trim(), text: m[2].trim() } : null;
}

// ------------------------ Layout ------------------------
function layout(nodes) {
  const boxMinW = 220,
    boxMinH = 56,
    gapY = 50,
    gapX = 36,
    margin = 40;
  let y = margin;

  const placed = [];

  const measureText = (s) => {
    const lines = wrapText(s, 24).length;
    const w = Math.max(
      boxMinW,
      Math.min(420, 14 * Math.min((s || "").length, 38) + 40)
    );
    const h = Math.max(boxMinH, 24 * lines + 18);
    return { w, h };
  };

  const centerX = 500; // content center in SVG coords

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];

    if (n.type === "process" || n.type === "startend") {
      const { w, h } = measureText(n.text || n.question);
      placed.push({
        kind: n.type,
        text: n.text,
        x: centerX - w / 2,
        y,
        w,
        h,
        id: i
      });
      y += h + gapY;
      continue;
    }

    if (n.type === "decision") {
      y += gapY; // space above diamond

      const { w: qw, h: qh } = measureText(n.question);
      const diamondW = Math.max(qw, 180);
      const diamondH = Math.max(qh, 60);

      const dec = {
        kind: "decision",
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

      const leftBox = measureText(n.left.text);
      const rightBox = measureText(n.right.text);

      const childY = y + diamondH + gapY;
      placed.push({
        kind: "process",
        text: n.left.text,
        x: centerX - (leftBox.w + gapX),
        y: childY,
        w: leftBox.w,
        h: leftBox.h,
        id: i + ":L"
      });
      placed.push({
        kind: "process",
        text: n.right.text,
        x: centerX + gapX,
        y: childY,
        w: rightBox.w,
        h: rightBox.h,
        id: i + ":R"
      });

      y = childY + Math.max(leftBox.h, rightBox.h) + gapY;
      placed.push({ kind: "merge", x: centerX, y, id: i + ":M" });
    }
  }

  const height = y + margin;
  return { placed, height };
}

// ------------------------ Render SVG ------------------------
function renderSVG(layoutData) {
  const { placed, height } = layoutData;

  // Bounds of content
  const bounds = placed.reduce(
    (b, p) => {
      const left = p.kind === "decision" ? p.x - p.w / 2 : p.x;
      const right =
        p.kind === "decision" ? p.x + p.w / 2 : p.x + (p.w || 0);
      const top = p.kind === "decision" ? p.y - p.h / 2 : p.y;
      const bottom =
        p.kind === "decision" ? p.y + p.h / 2 : p.y + (p.h || 0);
      b.minX = Math.min(b.minX, left);
      b.maxX = Math.max(b.maxX, right);
      b.minY = Math.min(b.minY, top);
      b.maxY = Math.max(b.maxY, bottom);
      return b;
    },
    { minX: Infinity, maxX: -Infinity, minY: 0, maxY: height }
  );

  const PAD = 80;
  const vbX = Math.floor(bounds.minX - PAD);
  const vbY = Math.floor(bounds.minY - PAD);
  const vbW = Math.ceil(bounds.maxX - bounds.minX + PAD * 2);
  const vbH = Math.ceil(bounds.maxY - bounds.minY + PAD * 2);

  // Size to container
  const pane = chart.parentElement;
  const paneW = Math.max(400, pane.clientWidth || 800);
  const paneH = Math.max(300, pane.clientHeight || 600);

  chart.innerHTML = "";
  chart.setAttribute("width", paneW);
  chart.setAttribute("height", paneH);
  chart.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
  chart.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Arrowhead
  const defs = svg("defs", {});
  const marker = svg("marker", {
    id: "arrow",
    markerWidth: 10,
    markerHeight: 8,
    refX: 9,
    refY: 4,
    orient: "auto",
    markerUnits: "strokeWidth"
  });
  marker.appendChild(
    svg("path", { d: "M0,0 L10,4 L0,8 z", fill: COLORS.arrow })
  );
  defs.appendChild(marker);
  chart.appendChild(defs);

  const gRoot = svg("g", {});
  chart.appendChild(gRoot);

  const centers = new Map();

  const drawText = (group, cx, cy, textStr, isLabel = false) => {
    const lines = wrapText(textStr, 24);
    lines.forEach((line, i) => {
      group.appendChild(
        svg(
          "text",
          {
            x: cx,
            y: cy - (lines.length - 1) * 9 + i * 18,
            "font-size": isLabel ? 11 : 12,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            fill: isLabel ? COLORS.label : COLORS.text
          },
          line
        )
      );
    });
  };

  function drawBranchLabel(x, y, text) {
    const t = svg(
      "text",
      {
        x,
        y,
        "font-size": 12,
        "font-weight": "600",
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        fill: COLORS.branchUI,
        "data-role": "branch-label",
        "data-branch-y": y
      },
      text
    );
    t.setAttribute("paint-order", "stroke");
    t.setAttribute("stroke", "#00000080");
    t.setAttribute("stroke-width", "1");
    gRoot.appendChild(t);
  }

  function drawLabeledLine(a, b, label, sideBias = 0) {
    gRoot.appendChild(
      svg("line", {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stroke: COLORS.arrow,
        "stroke-width": 1.6,
        "marker-end": "url(#arrow)",
        class: "connector-line",
        "data-connector": "1"
      })
    );
    const midx = (a.x + b.x) / 2 + sideBias * 12;
    const midy = (a.y + b.y) / 2 - 10;
    drawBranchLabel(midx, midy, label);
  }

  // Nodes
  for (const p of placed) {
    if (p.kind === "process" || p.kind === "startend") {
      const centerY = p.y + p.h / 2;
      const group = svg("g", {
        class: `node-group node-${p.kind}`,
        "data-node-id": p.id,
        "data-node-y": centerY
      });

      const rect = svg("rect", {
        x: p.x,
        y: p.y,
        width: p.w,
        height: p.h,
        rx: p.kind === "startend" ? 28 : 18,
        ry: p.kind === "startend" ? 28 : 18,
        fill: p.kind === "startend" ? COLORS.startend : COLORS.process,
        stroke: COLORS.stroke,
        "stroke-width": 1.2
      });
      group.appendChild(rect);
      drawText(group, p.x + p.w / 2, p.y + p.h / 2, p.text || "");

      gRoot.appendChild(group);
      centers.set(p.id, {
        top: { x: p.x + p.w / 2, y: p.y },
        bottom: { x: p.x + p.w / 2, y: p.y + p.h }
      });
    }

    if (p.kind === "decision") {
      const centerY = p.y;
      const group = svg("g", {
        class: "node-group node-decision",
        "data-node-id": p.id,
        "data-node-y": centerY
      });

      const path = diamondPath(p.x, p.y, p.w, p.h);
      group.appendChild(
        svg("path", {
          d: path,
          fill: COLORS.decision,
          stroke: COLORS.stroke,
          "stroke-width": 1.2
        })
      );
      drawText(group, p.x, p.y, p.question || "");

      gRoot.appendChild(group);
      centers.set(p.id, {
        top: { x: p.x, y: p.y - p.h / 2 },
        bottom: { x: p.x, y: p.y + p.h / 2 },
        left: { x: p.x - p.w / 2, y: p.y },
        right: { x: p.x + p.w / 2, y: p.y }
      });
    }

    if (p.kind === "merge") {
      const centerY = p.y;
      const group = svg("g", {
        class: "merge-node",
        "data-node-id": p.id,
        "data-node-y": centerY
      });
      group.appendChild(
        svg("circle", {
          cx: p.x,
          cy: p.y,
          r: 4,
          fill: COLORS.stroke
        })
      );
      gRoot.appendChild(group);
      centers.set(p.id, {
        top: { x: p.x, y: p.y - 4 },
        bottom: { x: p.x, y: p.y + 4 }
      });
    }
  }

  // Connectors
  for (let i = 0; i < placed.length - 1; i++) {
    const cur = placed[i];
    const nxt = placed[i + 1];

    if (cur.kind === "decision") {
      const dec = centers.get(cur.id);
      const left = placed[i + 1];
      const right = placed[i + 2];
      const merge = placed[i + 3];

      if (left)
        drawLabeledLine(
          dec.left,
          centers.get(left.id).top,
          cur.leftLabel || "Yes",
          -1
        );
      if (right)
        drawLabeledLine(
          dec.right,
          centers.get(right.id).top,
          cur.rightLabel || "No",
          +1
        );

      if (merge && centers.get(left.id) && centers.get(merge.id)) {
        gRoot.appendChild(
          svg("line", {
            x1: centers.get(left.id).bottom.x,
            y1: centers.get(left.id).bottom.y,
            x2: centers.get(merge.id).top.x,
            y2: centers.get(merge.id).top.y,
            stroke: COLORS.arrow,
            "stroke-width": 1.6,
            "marker-end": "url(#arrow)",
            class: "connector-line",
            "data-connector": "1"
          })
        );
      }

      if (merge && centers.get(right.id) && centers.get(merge.id)) {
        gRoot.appendChild(
          svg("line", {
            x1: centers.get(right.id).bottom.x,
            y1: centers.get(right.id).bottom.y,
            x2: centers.get(merge.id).top.x,
            y2: centers.get(merge.id).top.y,
            stroke: COLORS.arrow,
            "stroke-width": 1.6,
            "marker-end": "url(#arrow)",
            class: "connector-line",
            "data-connector": "1"
          })
        );
      }

      const prev = placed[i - 1];
      if (prev) {
        const prevCenter = centers.get(prev.id);
        gRoot.appendChild(
          svg("line", {
            x1: prevCenter.bottom.x,
            y1: prevCenter.bottom.y,
            x2: dec.top.x,
            y2: dec.top.y,
            stroke: COLORS.arrow,
            "stroke-width": 1.6,
            "marker-end": "url(#arrow)",
            class: "connector-line",
            "data-connector": "1"
          })
        );
      }

      const afterMerge = placed[i + 4];
      if (afterMerge) {
        gRoot.appendChild(
          svg("line", {
            x1: centers.get(merge.id).bottom.x,
            y1: centers.get(merge.id).bottom.y,
            x2: centers.get(afterMerge.id).top.x,
            y2: centers.get(afterMerge.id).top.y,
            stroke: COLORS.arrow,
            "stroke-width": 1.6,
            "marker-end": "url(#arrow)",
            class: "connector-line",
            "data-connector": "1"
          })
        );
      }

      i += 3;
    } else {
      const a = centers.get(cur.id)?.bottom;
      const b = centers.get(nxt.id)?.top;
      if (a && b) {
        gRoot.appendChild(
          svg("line", {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            stroke: COLORS.arrow,
            "stroke-width": 1.6,
            "marker-end": "url(#arrow)",
            class: "connector-line",
            "data-connector": "1"
          })
        );
      }
    }
  }

  updateSyntax();
}

// ------------------------ Util ------------------------
function updateSyntax() {
  if (!syntaxEl) return;
  syntaxEl.innerHTML = `
    <strong>Key</strong> &nbsp;
    <code>1.</code> Step &nbsp;&middot;&nbsp;
    <code>D.</code> Decision with branches (e.g. <code>Yes = ...</code>, <code>No = ...</code>) &nbsp;&middot;&nbsp;
    <code>[?]</code> Inline decision (e.g. <code>[?] Question | Yes -> A | No -> B</code>)
  `;
}

function svg(tag, attrs, textContent) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (textContent != null) el.textContent = textContent;
  return el;
}

function diamondPath(cx, cy, w, h) {
  return `M ${cx} ${cy - h / 2} L ${cx + w / 2} ${cy} L ${cx} ${cy + h / 2} L ${
    cx - w / 2
  } ${cy} Z`;
}

function wrapText(s, maxWordsPerLine = 22) {
  const words = (s || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = [];
  for (const w of words) {
    if ((cur.join(" ").length + w.length + 1) > maxWordsPerLine * 1.2) {
      lines.push(cur.join(" "));
      cur = [w];
    } else {
      cur.push(w);
    }
  }
  if (cur.length) lines.push(cur.join(" "));
  return lines.length ? lines : [""];
}

// ------------------------ Orchestration ------------------------
function render() {
  const nodes = parseLines(stepsEl.value, autoStartEndEl.checked);
  const L = layout(nodes);
  renderSVG(L);
}

// initial render if there is text
window.addEventListener("load", () => {
  if (stepsEl.value.trim()) render();
});

// ------------------------ Cut + prune-by-drag ------------------------
let isCutDragging = false;
let activePointerId = null;

// hide everything below a Y cutoff
function hideBelow(cutoffY) {
  // nodes
  chart.querySelectorAll(".node-group, .merge-node").forEach((node) => {
    const y = parseFloat(node.getAttribute("data-node-y") || "0");
    if (y >= cutoffY) node.style.display = "none";
  });

  // lines
  chart.querySelectorAll("line").forEach((line) => {
    const y1 = parseFloat(line.getAttribute("y1") || "0");
    const y2 = parseFloat(line.getAttribute("y2") || "0");
    const midY = (y1 + y2) / 2;
    if (midY >= cutoffY) line.style.display = "none";
  });

  // branch labels
  chart.querySelectorAll("[data-branch-y]").forEach((lbl) => {
    const y = parseFloat(lbl.getAttribute("data-branch-y") || "0");
    if (y >= cutoffY) lbl.style.display = "none";
  });
}

function cutAtPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return;
  if (
    el.tagName &&
    el.tagName.toLowerCase() === "line" &&
    el.getAttribute("data-connector") === "1"
  ) {
    const y1 = parseFloat(el.getAttribute("y1") || "0");
    const y2 = parseFloat(el.getAttribute("y2") || "0");
    const cutoff = Math.max(y1, y2);
    el.remove();
    hideBelow(cutoff);
  }
}

chart.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return; // only primary
  isCutDragging = true;
  activePointerId = e.pointerId;
  chart.setPointerCapture(e.pointerId);
  cutAtPoint(e.clientX, e.clientY);
});

chart.addEventListener("pointermove", (e) => {
  if (!isCutDragging || e.pointerId !== activePointerId) return;
  cutAtPoint(e.clientX, e.clientY);
});

function endCutDrag(e) {
  if (!isCutDragging || e.pointerId !== activePointerId) return;
  isCutDragging = false;
  activePointerId = null;
  try {
    chart.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

chart.addEventListener("pointerup", endCutDrag);
chart.addEventListener("pointercancel", endCutDrag);

// ------------------------ Click → mark problem ------------------------
chart.addEventListener("click", (e) => {
  let el = e.target;
  while (el && el !== chart && !el.classList.contains("node-group")) {
    el = el.parentNode;
  }
  if (!el || el === chart) return;
  el.classList.toggle("problem-node");
});

// ------------------------ Export helpers ------------------------
function normalizeSVGForExport(srcSvg) {
  const vb = srcSvg.viewBox.baseVal;
  const clone = srcSvg.cloneNode(true);

  clone.setAttribute("width", vb.width);
  clone.setAttribute("height", vb.height);
  clone.setAttribute("viewBox", `0 0 ${vb.width} ${vb.height}`);

  const wrapper = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g"
  );
  wrapper.setAttribute(
    "transform",
    `translate(${-vb.x}, ${-vb.y})`
  );
  while (clone.firstChild) wrapper.appendChild(clone.firstChild);
  clone.appendChild(wrapper);

  // flip branch labels for white background
  const labels = clone.querySelectorAll("[data-role='branch-label']");
  labels.forEach((el) => {
    el.setAttribute("fill", COLORS.branchExport);
    el.setAttribute("stroke", "#ffffff00");
  });

  return { clone, width: vb.width, height: vb.height };
}

function downloadPNG() {
  const { clone, width, height } = normalizeSVGForExport(chart);

  const bg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  bg.setAttribute("x", 0);
  bg.setAttribute("y", 0);
  bg.setAttribute("width", width);
  bg.setAttribute("height", height);
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);

  const serializer = new XMLSerializer();
  const src = serializer.serializeToString(clone);
  const img = new Image();
  const url =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(src);

  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const objUrl = URL.createObjectURL(blob);
      triggerDownload(objUrl, "flowchart.png");
    });
  };
  img.src = url;
}

function downloadSVG() {
  const { clone, width, height } = normalizeSVGForExport(chart);

  const bg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  bg.setAttribute("x", 0);
  bg.setAttribute("y", 0);
  bg.setAttribute("width", width);
  bg.setAttribute("height", height);
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);

  const serializer = new XMLSerializer();
  const src = serializer.serializeToString(clone);
  const blob = new Blob([src], {
    type: "image/svg+xml;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, "flowchart.svg");
}

function copyPNGToClipboard() {
  if (!navigator.clipboard || !window.ClipboardItem) {
    alert(
      "Copying images is not supported in this browser. Please use Export PNG instead."
    );
    return;
  }

  const { clone, width, height } = normalizeSVGForExport(chart);

  const bg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  bg.setAttribute("x", 0);
  bg.setAttribute("y", 0);
  bg.setAttribute("width", width);
  bg.setAttribute("height", height);
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);

  const serializer = new XMLSerializer();
  const src = serializer.serializeToString(clone);
  const img = new Image();
  const url =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(src);

  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]);
        alert("Flowchart copied to clipboard as an image.");
      } catch (err) {
        console.error(err);
        alert(
          "Could not copy image. Please use Export PNG instead."
        );
      }
    });
  };
  img.src = url;
}

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// =====================================================
