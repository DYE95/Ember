const RAW = [
  ["Tinte", "#141210"], ["Umbra", "#3a312a"], ["Rinde", "#6d5646"], ["Sand", "#a78968"],
  ["Knochen", "#e4d2b0"], ["Pergament", "#f4efe4"], ["Wein", "#7c2832"], ["Glut", "#c4513a"],
  ["Ton", "#e39b62"], ["Kiefer", "#1f3326"], ["Moos", "#46633a"], ["Saft", "#86a85a"],
  ["Nacht", "#1c3142"], ["Schiefer", "#3e6578"], ["Nebel", "#8eb4c4"], ["Dämmerung", "#5a4d68"],
];
const SWATCHES = RAW.map(([name, hex], i) => {
  const n = parseInt(hex.slice(1), 16);
  return { id: i + 1, name, hex, r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
});
const BY_ID = new Map(SWATCHES.map((s) => [s.id, s]));
const INK = 1, UMBER = 2, BARK = 3, SAND = 4, BONE = 5, PAPER = 6, WINE = 7, EMBER = 8, CLAY = 9, NIGHT = 13, SLATE = 14, MIST = 15;
const CANVAS_SIZES = [16, 24, 32, 48, 64];
const BRUSH_SIZES = [1, 2, 3, 4];
const SCALES = [1, 4, 8, 16];

function createPaint(w, h) { return { w, h, data: new Uint8Array(w * h) }; }
function clonePaint(p) { return { w: p.w, h: p.h, data: p.data.slice() }; }
function inBounds(p, x, y) { return x >= 0 && y >= 0 && x < p.w && y < p.h; }
function stamp(p, x, y, brush, color) {
  const o = -Math.floor((brush - 1) / 2);
  for (let dy = 0; dy < brush; dy++) for (let dx = 0; dx < brush; dx++) {
    const px = x + o + dx, py = y + o + dy;
    if (inBounds(p, px, py)) p.data[py * p.w + px] = color;
  }
}
function line(x0, y0, x1, y1, plot) {
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function flood(p, x, y, color) {
  if (!inBounds(p, x, y)) return false;
  const start = y * p.w + x, target = p.data[start];
  if (target === color) return false;
  const stack = [start], { w, data } = p;
  while (stack.length) {
    const i = stack.pop();
    if (data[i] !== target) continue;
    data[i] = color;
    const px = i % w;
    if (px + 1 < w) stack.push(i + 1);
    if (px > 0) stack.push(i - 1);
    if (i >= w) stack.push(i - w);
    if (i + w < data.length) stack.push(i + w);
  }
  return true;
}
function resizePaint(p, w, h) {
  const next = createPaint(w, h);
  const ox = Math.floor((w - p.w) / 2), oy = Math.floor((h - p.h) / 2);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const nx = x + ox, ny = y + oy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) next.data[ny * w + nx] = p.data[y * p.w + x];
  }
  return next;
}
function drawSample(p) {
  p.data.fill(0);
  const { w, h, data } = p, cx = (w - 1) / 2, cy = (h - 1) / 2, rad = Math.min(w, h) / 2 - 0.35;
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) data[y * w + x] = c; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > rad) continue;
    if (d > rad - 1.15) put(x, y, INK);
    else if (d > rad * 0.78) put(x, y, NIGHT);
    else put(x, y, SLATE);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dist = Math.hypot(x - cx, y - cy);
    if (dist > rad - 1.15) continue;
    const nx = (x - cx) / rad, ny = (y - cy) / rad;
    if (ny >= -0.62 && ny <= 0.02) {
      const t = (ny + 0.62) / 0.64, half = 0.16 * Math.max(0.12, t);
      if (Math.abs(nx) <= half) {
        if (Math.abs(nx) > half - 0.035) put(x, y, INK);
        else if (nx < -half * 0.12) put(x, y, PAPER);
        else if (nx > half * 0.32) put(x, y, SAND);
        else put(x, y, BONE);
      }
    }
    if (ny >= -0.48 && ny <= -0.03 && Math.abs(nx) <= 0.028) put(x, y, MIST);
    if (ny >= 0.05 && ny <= 0.16 && Math.abs(nx) <= 0.4) put(x, y, (ny < 0.07 || ny > 0.14 || Math.abs(nx) > 0.35) ? INK : EMBER);
    if (ny >= 0.18 && ny <= 0.48 && Math.abs(nx) <= 0.09) put(x, y, Math.floor((ny - 0.18) / 0.065) % 2 === 0 ? BARK : UMBER);
    const pommel = Math.hypot(nx, ny - 0.56);
    if (pommel <= 0.135) put(x, y, pommel > 0.1 ? INK : CLAY);
    if (pommel <= 0.045) put(x, y, WINE);
  }
}
function blit(p, ctx) {
  const img = ctx.createImageData(p.w, p.h);
  for (let i = 0; i < p.data.length; i++) {
    const s = BY_ID.get(p.data[i]);
    if (!s) continue;
    const o = i * 4;
    img.data[o] = s.r; img.data[o + 1] = s.g; img.data[o + 2] = s.b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
function rasterize(p, scale, round) {
  const src = document.createElement("canvas");
  src.width = p.w; src.height = p.h;
  blit(p, src.getContext("2d"));
  const out = document.createElement("canvas");
  out.width = p.w * scale; out.height = p.h * scale;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  if (round) {
    ctx.beginPath();
    ctx.arc(out.width / 2, out.height / 2, out.width / 2, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

const Studio = {
  paint: createPaint(32, 32),
  tool: "pencil",
  color: 1,
  brush: 1,
  zoom: 12,
  grid: true,
  guide: true,
  shape: "round",
  scale: 8,
  hover: null,
  undo: [],
  redo: [],
  session: null,
};

function draw() {
  const canvas = document.getElementById("paintCanvas");
  const preview = document.getElementById("previewCanvas");
  const p = Studio.paint;
  const src = document.createElement("canvas");
  src.width = p.w; src.height = p.h;
  blit(p, src.getContext("2d"));
  const cssW = p.w * Studio.zoom, cssH = p.h * Studio.zoom;
  canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
  canvas.width = cssW; canvas.height = cssH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, cssW, cssH);
  if (Studio.grid && Studio.zoom >= 6) {
    ctx.strokeStyle = "rgba(12,10,8,.38)";
    ctx.beginPath();
    for (let x = 1; x < p.w; x++) { ctx.moveTo(x * Studio.zoom + 0.5, 0); ctx.lineTo(x * Studio.zoom + 0.5, cssH); }
    for (let y = 1; y < p.h; y++) { ctx.moveTo(0, y * Studio.zoom + 0.5); ctx.lineTo(cssW, y * Studio.zoom + 0.5); }
    ctx.stroke();
  }
  if (Studio.guide) {
    ctx.beginPath();
    ctx.arc(cssW / 2, cssH / 2, Math.min(cssW, cssH) / 2 - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(244,239,228,.72)";
    ctx.stroke();
  }
  preview.width = 160; preview.height = 160;
  const pctx = preview.getContext("2d");
  pctx.imageSmoothingEnabled = false;
  pctx.clearRect(0, 0, 160, 160);
  pctx.drawImage(src, 0, 0, 160, 160);
  const sw = BY_ID.get(Studio.color);
  document.getElementById("tokStatus").textContent =
    (Studio.hover ? Studio.hover.x + "," + Studio.hover.y : p.w + "×" + p.h) + " · " + (sw?.name || "Tinte");
}

function cellFrom(ev) {
  const canvas = ev.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - rect.left) / rect.width) * Studio.paint.w);
  const y = Math.floor(((ev.clientY - rect.top) / rect.height) * Studio.paint.h);
  if (!inBounds(Studio.paint, x, y)) return null;
  return { x, y };
}
function ink() { return Studio.tool === "eraser" ? 0 : Studio.color; }
function stroke(a, b) {
  line(a.x, a.y, b.x, b.y, (x, y) => stamp(Studio.paint, x, y, Studio.brush, ink()));
}
function pushHist() {
  Studio.undo.push(clonePaint(Studio.paint));
  if (Studio.undo.length > 80) Studio.undo.shift();
  Studio.redo = [];
}
function persist() {
  try {
    localStorage.setItem("ember.tokenatelier", JSON.stringify({
      name: document.getElementById("tokName").value,
      color: Studio.color,
      w: Studio.paint.w, h: Studio.paint.h,
      data: Array.from(Studio.paint.data),
    }));
  } catch {}
}

function boot() {
  const params = new URLSearchParams(location.search);
  const embed = params.get("embed") === "1" || params.has("char");
  if (embed) {
    document.getElementById("btnToSheet").classList.remove("hidden");
    document.getElementById("backHouse")?.classList.add("hidden");
  }
  try {
    const raw = JSON.parse(localStorage.getItem("ember.tokenatelier") || "null");
    if (raw && raw.data) {
      Studio.paint = { w: raw.w, h: raw.h, data: Uint8Array.from(raw.data) };
      Studio.color = raw.color || 1;
      if (raw.name) document.getElementById("tokName").value = raw.name;
    }
  } catch {}

  const sw = document.getElementById("swatches");
  SWATCHES.forEach((s) => {
    const b = document.createElement("button");
    b.title = s.name;
    b.style.background = s.hex;
    b.addEventListener("click", () => {
      Studio.color = s.id;
      if (Studio.tool === "eraser" || Studio.tool === "picker") Studio.tool = "pencil";
      syncTools(); persist();
    });
    sw.appendChild(b);
  });
  const brushes = document.getElementById("brushes");
  BRUSH_SIZES.forEach((n) => {
    const b = document.createElement("button");
    b.className = "btn tiny";
    b.textContent = n + "px";
    b.addEventListener("click", () => { Studio.brush = n; syncTools(); draw(); });
    brushes.appendChild(b);
  });
  const sizes = document.getElementById("sizes");
  CANVAS_SIZES.forEach((n) => {
    const b = document.createElement("button");
    b.className = "btn tiny";
    b.textContent = String(n);
    b.addEventListener("click", () => {
      if (Studio.paint.w === n) return;
      pushHist();
      Studio.paint = resizePaint(Studio.paint, n, n);
      persist(); draw();
    });
    sizes.appendChild(b);
  });
  const scales = document.getElementById("scales");
  SCALES.forEach((n) => {
    const b = document.createElement("button");
    b.className = "btn tiny";
    b.textContent = n + "×";
    b.addEventListener("click", () => { Studio.scale = n; syncTools(); });
    scales.appendChild(b);
  });

  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.addEventListener("click", () => { Studio.tool = b.getAttribute("data-tool"); syncTools(); });
  });
  document.querySelectorAll("[data-shape]").forEach((b) => {
    b.addEventListener("click", () => { Studio.shape = b.getAttribute("data-shape"); syncTools(); });
  });
  document.getElementById("btnGrid").addEventListener("click", () => { Studio.grid = !Studio.grid; syncTools(); draw(); });
  document.getElementById("btnGuide").addEventListener("click", () => { Studio.guide = !Studio.guide; syncTools(); draw(); });
  document.getElementById("btnUndo").addEventListener("click", () => {
    const prev = Studio.undo.pop(); if (!prev) return;
    Studio.redo.push(clonePaint(Studio.paint)); Studio.paint = prev; persist(); draw();
  });
  document.getElementById("btnRedo").addEventListener("click", () => {
    const next = Studio.redo.pop(); if (!next) return;
    Studio.undo.push(clonePaint(Studio.paint)); Studio.paint = next; persist(); draw();
  });
  document.getElementById("btnSample").addEventListener("click", () => {
    pushHist(); drawSample(Studio.paint);
    const name = document.getElementById("tokName");
    if (!name.value || name.value === "Token") name.value = "Klinge";
    persist(); draw();
  });
  document.getElementById("btnClear").addEventListener("click", () => {
    pushHist(); Studio.paint.data.fill(0); persist(); draw();
  });
  document.getElementById("btnPng").addEventListener("click", exportPng);
  document.getElementById("btnToSheet").addEventListener("click", saveToSheet);

  const canvas = document.getElementById("paintCanvas");
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (ev) => {
    const cell = cellFrom(ev);
    if (!cell) return;
    if (ev.button === 2) { pick(cell); return; }
    if (ev.button !== 0) return;
    canvas.setPointerCapture(ev.pointerId);
    if (Studio.tool === "picker") { pick(cell); Studio.tool = "pencil"; syncTools(); return; }
    if (Studio.tool === "fill") {
      pushHist();
      flood(Studio.paint, cell.x, cell.y, Studio.color);
      persist(); draw();
      return;
    }
    pushHist();
    Studio.session = { last: cell };
    stroke(cell, cell);
    draw();
  });
  canvas.addEventListener("pointermove", (ev) => {
    const cell = cellFrom(ev);
    Studio.hover = cell;
    if (Studio.session && cell) { stroke(Studio.session.last, cell); Studio.session.last = cell; }
    draw();
  });
  canvas.addEventListener("pointerup", () => { Studio.session = null; persist(); });
  window.addEventListener("keydown", (ev) => {
    const tag = ev.target && ev.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const k = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && k === "z") {
      ev.preventDefault();
      document.getElementById(ev.shiftKey ? "btnRedo" : "btnUndo").click();
    } else if (k === "b") Studio.tool = "pencil";
    else if (k === "e") Studio.tool = "eraser";
    else if (k === "f") Studio.tool = "fill";
    else if (k === "i") Studio.tool = "picker";
    else if (k === "g") Studio.grid = !Studio.grid;
    else if (k === "k") Studio.guide = !Studio.guide;
    syncTools(); draw();
  });
  syncTools();
  draw();
}

function pick(cell) {
  const v = Studio.paint.data[cell.y * Studio.paint.w + cell.x];
  if (v) Studio.color = v;
}

function syncTools() {
  document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-tool") === Studio.tool));
  document.querySelectorAll("[data-shape]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-shape") === Studio.shape));
  document.getElementById("btnGrid").classList.toggle("on", Studio.grid);
  document.getElementById("btnGuide").classList.toggle("on", Studio.guide);
  [...document.getElementById("brushes").children].forEach((b, i) => b.classList.toggle("on", BRUSH_SIZES[i] === Studio.brush));
  [...document.getElementById("scales").children].forEach((b, i) => b.classList.toggle("on", SCALES[i] === Studio.scale));
}

function exportPng() {
  const canvas = rasterize(Studio.paint, Studio.scale, Studio.shape === "round");
  const name = (document.getElementById("tokName").value || "token").replace(/\s+/g, "-");
  canvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name + "-" + (Studio.shape === "round" ? "token" : "sprite") + ".png";
    a.click();
  });
}

async function saveToSheet() {
  const params = new URLSearchParams(location.search);
  const charId = params.get("char");
  const canvas = rasterize(Studio.paint, 8, true);
  const data = canvas.toDataURL("image/png").split(",")[1];
  const color = BY_ID.get(Studio.color)?.hex || "#e85d04";
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "ember-token", data, color, charId }, location.origin);
    return;
  }
  if (!charId) { alert("Kein Bogen gewählt."); return; }
  // Portraits setzt nur der SL: Schluessel mitschicken und die Antwort pruefen.
  let res = null;
  try {
    res = await fetch("/api/characters/" + charId + "/portrait", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, color, as: "gm", gmKey: localStorage.getItem("ember.gmKey") || "" }),
    });
  } catch {}
  if (!res || !res.ok) { alert("Token nicht gespeichert. Nur am SL-Rechner, Server muss laufen."); return; }
  alert("Token liegt auf dem Bogen.");
}

boot();
