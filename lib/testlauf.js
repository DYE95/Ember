// lib/testlauf.js — Testlauf am SL-Rechner: Checkliste aus docs/TESTLAUF.md,
// Entwurf mit Bildern, am Ende ein Ordner data/testlaeufe/JJJJ-MM-TT_HH-MM/
// mit bericht.md, bericht.json und bilder/. Alles nur lokal (siehe server.js).
const fs = require("fs");
const path = require("path");

const MAX_IMAGE = 50 * 1024 * 1024;
const MAX_IMAGES = 200;
const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "heic", "heif"];
const TYPE_EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  "image/avif": "avif", "image/bmp": "bmp", "image/heic": "heic", "image/heif": "heif",
};
const MARKS = ["o", "x", "eigen"];
const MAX_MS = 24 * 60 * 60 * 1000;
const RUN_NAME = /^\d{4}-\d\d-\d\d_\d\d-\d\d(?:_\d+)?$/;
const FILE_NAME = /^[a-z0-9][a-z0-9_-]*\.[a-z0-9]+$/i;

// ---------- Checkliste ----------
function hash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function slug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Abschnitte = "## Überschrift", Punkte = "- [ ] Text". Der Abschnitt
// "Notizen" (Tabelle zum Ausdrucken) wird zum freien Notizfeld.
// Die ID eines Punkts haengt an Abschnitt und Text, nicht an der Reihenfolge,
// damit ein Entwurf auch nach kleinen Aenderungen an der Liste passt.
function parseChecklist(md) {
  const out = { title: "Testlauf", sections: [], notesTitle: "" };
  let section = null;
  const seen = new Set();
  for (const raw of String(md || "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h1 = line.match(/^#\s+(.+)/);
    if (h1 && !out.sections.length && !section) { out.title = h1[1].trim(); continue; }
    const h = line.match(/^#{2,3}\s+(.+)/);
    if (h) {
      const title = h[1].trim();
      if (/^notizen\b/i.test(title)) {
        out.notesTitle = title;
        section = null;
        continue;
      }
      section = { id: slug(title) || `abschnitt-${out.sections.length + 1}`, title, items: [] };
      out.sections.push(section);
      continue;
    }
    const item = line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+)/);
    if (item && section) {
      const text = item[1].trim();
      let id = `${section.id}-${hash(text)}`;
      for (let n = 2; seen.has(id); n += 1) id = `${section.id}-${hash(text)}-${n}`;
      seen.add(id);
      section.items.push({ id, text });
    }
  }
  out.sections = out.sections.filter((s) => s.items.length);
  return out;
}

let listCache = null;
function loadChecklist(file) {
  try {
    const st = fs.statSync(file);
    if (listCache && listCache.file === file && listCache.mtime === st.mtimeMs) return listCache.list;
    const list = parseChecklist(fs.readFileSync(file, "utf8"));
    listCache = { file, mtime: st.mtimeMs, list };
    return list;
  } catch {
    return { title: "Testlauf", sections: [], notesTitle: "", missing: true };
  }
}

// ---------- Ablage ----------
const rootDir = (dataDir) => path.join(dataDir, "testlaeufe");
const draftDir = (dataDir) => path.join(rootDir(dataDir), "_entwurf");
const draftFile = (dataDir) => path.join(draftDir(dataDir), "entwurf.json");
const draftImages = (dataDir) => path.join(draftDir(dataDir), "bilder");

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const clip = (v, n) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").slice(0, n);

function emptyDraft() {
  const now = new Date().toISOString();
  return { tester: "", geraet: "", notizen: "", answers: {}, images: [], startedAt: now, updatedAt: now };
}

function readDraft(dataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(draftFile(dataDir), "utf8"));
    return { ...emptyDraft(), ...raw, answers: raw.answers || {}, images: Array.isArray(raw.images) ? raw.images : [] };
  } catch {
    return emptyDraft();
  }
}

function cleanAnswers(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [id, row] of Object.entries(input).slice(0, 1000)) {
    if (!/^[a-z0-9-]{1,120}$/.test(id) || !row || typeof row !== "object") continue;
    const mark = MARKS.includes(row.mark) ? row.mark : "";
    const note = clip(row.note, 500).trim();
    // Zeit pro Punkt in ms (Uhr im Browser), höchstens 24 h.
    const ms = Math.max(0, Math.min(MAX_MS, Math.round(Number(row.ms) || 0)));
    if (mark || note || ms) out[id] = ms ? { mark, note, ms } : { mark, note };
  }
  return out;
}

// Der Browser schickt Felder und Antworten. Die Bilderliste gehoert dem
// Server; vom Browser kommen nur Bildunterschrift und verknuepfter Punkt.
function saveDraft(dataDir, input = {}) {
  const draft = readDraft(dataDir);
  if ("tester" in input) draft.tester = clip(input.tester, 120);
  if ("geraet" in input) draft.geraet = clip(input.geraet, 120);
  if ("notizen" in input) draft.notizen = String(input.notizen || "").slice(0, 20000);
  if ("answers" in input) draft.answers = cleanAnswers(input.answers);
  if (Array.isArray(input.images)) {
    const byId = new Map(input.images.filter((i) => i && i.id).map((i) => [i.id, i]));
    for (const img of draft.images) {
      const upd = byId.get(img.id);
      if (!upd) continue;
      if ("caption" in upd) img.caption = clip(upd.caption, 300);
      if ("itemId" in upd) img.itemId = /^[a-z0-9-]{0,120}$/.test(String(upd.itemId || "")) ? String(upd.itemId || "") : "";
    }
  }
  draft.updatedAt = new Date().toISOString();
  writeJsonAtomic(draftFile(dataDir), draft);
  return draft;
}

function imageExt(name, type) {
  const ext = path.extname(String(name || "")).slice(1).toLowerCase();
  if (IMAGE_EXT.includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  return TYPE_EXT[String(type || "").toLowerCase().split(";")[0].trim()] || "";
}

// Body roh auf die Platte, mit Obergrenze. Wird es zu gross, liest der
// Server den Rest leer, damit der Browser die Antwort 413 noch bekommt.
function receive(req, file, limit) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    let size = 0;
    let over = false;
    let done = false;
    const finish = (fn, val) => { if (!done) { done = true; fn(val); } };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (over) return;
      if (size > limit) {
        over = true;
        out.destroy();
        req.resume();
        return;
      }
      if (!out.write(chunk)) {
        req.pause();
        out.once("drain", () => req.resume());
      }
    });
    req.on("end", () => {
      if (over) return finish(resolve, { over: true, size });
      out.end(() => finish(resolve, { over: false, size }));
    });
    req.on("close", () => { if (!req.complete) { out.destroy(); finish(reject, new Error("Upload abgebrochen.")); } });
    req.on("error", (err) => { out.destroy(); finish(reject, err); });
    out.on("error", (err) => { if (!over) finish(reject, err); });
  });
}

async function addImage(dataDir, req, { name, type, limit = MAX_IMAGE } = {}) {
  const ext = imageExt(name, type);
  const fail = (status, error) => Object.assign(new Error(error), { status });
  if (!ext) { req.resume(); throw fail(415, "Nur Bilder (jpg, png, gif, webp, avif, bmp, heic)."); }
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > limit) { req.resume(); throw fail(413, `Bild zu groß (höchstens ${Math.round(limit / 1048576)} MB).`); }
  const draft = readDraft(dataDir);
  if (draft.images.length >= MAX_IMAGES) { req.resume(); throw fail(409, `Höchstens ${MAX_IMAGES} Bilder pro DEBUG_Run.`); }
  fs.mkdirSync(draftImages(dataDir), { recursive: true });
  const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const file = `${id}.${ext}`;
  const target = path.join(draftImages(dataDir), file);
  const part = `${target}.part`;
  let got;
  try {
    got = await receive(req, part, limit);
  } catch (err) {
    fs.rmSync(part, { force: true });
    throw fail(400, err.message || "Upload abgebrochen.");
  }
  if (got.over || !got.size) {
    fs.rmSync(part, { force: true });
    if (got.over) throw fail(413, `Bild zu groß (höchstens ${Math.round(limit / 1048576)} MB).`);
    throw fail(400, "Leere Datei.");
  }
  fs.renameSync(part, target);
  const image = {
    id, file, name: clip(path.basename(String(name || file)), 200), size: got.size,
    caption: "", itemId: "", addedAt: new Date().toISOString(),
  };
  // Frisch lesen: mehrere Uploads koennen gleichzeitig fertig werden.
  const fresh = readDraft(dataDir);
  fresh.images.push(image);
  fresh.updatedAt = new Date().toISOString();
  writeJsonAtomic(draftFile(dataDir), fresh);
  return image;
}

function removeImage(dataDir, id) {
  const draft = readDraft(dataDir);
  const img = draft.images.find((i) => i.id === id);
  if (!img) return false;
  draft.images = draft.images.filter((i) => i.id !== id);
  if (FILE_NAME.test(img.file)) fs.rmSync(path.join(draftImages(dataDir), img.file), { force: true });
  draft.updatedAt = new Date().toISOString();
  writeJsonAtomic(draftFile(dataDir), draft);
  return true;
}

function clearDraft(dataDir) {
  fs.rmSync(draftDir(dataDir), { recursive: true, force: true });
}

// ---------- Bericht ----------
const pad = (n, w = 2) => String(n).padStart(w, "0");
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
const deDate = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;

function safeName(name) {
  const base = slug(path.basename(String(name || ""), path.extname(String(name || "")))).slice(0, 40).replace(/-+$/, "");
  return base || "bild";
}

// 75 s → "01:15", 3725 s → "1:02:05".
function duration(ms) {
  const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const rest = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(rest)}` : `${pad(m)}:${pad(rest)}`;
}

function summarize(list, answers) {
  const s = { total: 0, done: 0, ok: 0, fehler: 0, eigen: 0, offen: 0, ms: 0, timed: 0 };
  for (const sec of list.sections) {
    for (const item of sec.items) {
      s.total += 1;
      const ms = Number((answers[item.id] || {}).ms) || 0;
      if (ms) { s.ms += ms; s.timed += 1; }
      const mark = (answers[item.id] || {}).mark;
      if (mark === "o") s.ok += 1;
      else if (mark === "x") s.fehler += 1;
      else if (mark === "eigen") s.eigen += 1;
      else { s.offen += 1; continue; }
      s.done += 1;
    }
  }
  return s;
}

const LABEL = { o: "[O]", x: "[X]", eigen: "[Eigen]", "": "[ ]" };
const oneLine = (t) => String(t || "").replace(/\s+/g, " ").trim();

function buildReport({ list, draft, version, now = new Date(), name, images }) {
  const answers = draft.answers || {};
  const summary = summarize(list, answers);
  const itemText = new Map();
  list.sections.forEach((sec) => sec.items.forEach((it) => itemText.set(it.id, { text: it.text, section: sec.title })));
  const sections = list.sections.map((sec) => ({
    id: sec.id,
    title: sec.title,
    items: sec.items.map((it) => {
      const a = answers[it.id] || {};
      const ms = Number(a.ms) || 0;
      return { id: it.id, text: it.text, mark: a.mark || "", note: a.note || "", ms, zeit: ms ? duration(ms) : "" };
    }),
  }));
  sections.forEach((sec) => { sec.ms = sec.items.reduce((n, it) => n + it.ms, 0); });
  const json = {
    schema: 1,
    name,
    createdAt: now.toISOString(),
    startedAt: draft.startedAt || null,
    tester: draft.tester || "",
    geraet: draft.geraet || "",
    version: version ? { version: version.version || "", source: version.source || "" } : null,
    summary,
    sections,
    notizen: draft.notizen || "",
    images: images.map((img) => ({
      file: img.file, original: img.name, caption: img.caption || "", size: img.size,
      itemId: img.itemId || "", itemText: img.itemId && itemText.has(img.itemId) ? itemText.get(img.itemId).text : "",
    })),
  };

  const md = [];
  md.push(`# Testlauf ${deDate(now)}`, "");
  md.push(`- Datum: ${deDate(now)}`);
  md.push(`- Tester: ${oneLine(draft.tester) || "–"}`);
  md.push(`- Gerät: ${oneLine(draft.geraet) || "–"}`);
  md.push(`- Ember-Version: ${version && version.version ? `${version.version} (${version.source === "git" ? "git" : "CHANGELOG.md"})` : "unbekannt"}`);
  md.push("", "## Zusammenfassung", "");
  md.push(`- ${summary.done} von ${summary.total} erledigt, ${summary.offen} offen`);
  md.push(`- O (ok): ${summary.ok} · X (Fehler): ${summary.fehler} · Eigen: ${summary.eigen}`);
  if (summary.ms) md.push(`- Zeit gemessen: ${duration(summary.ms)} (an ${summary.timed} von ${summary.total} Punkten)`);
  md.push(`- Bilder: ${images.length}`);
  const errors = [];
  sections.forEach((sec) => sec.items.forEach((it) => { if (it.mark === "x") errors.push({ sec, it }); }));
  if (errors.length) {
    md.push("", "## Fehler auf einen Blick", "");
    for (const { sec, it } of errors) md.push(`- ${sec.title}: ${it.text}${it.note ? ` — ${oneLine(it.note)}` : ""}`);
  }
  for (const sec of sections) {
    md.push("", `## ${sec.title}${sec.ms ? ` (${duration(sec.ms)})` : ""}`, "");
    for (const it of sec.items) {
      md.push(`- ${LABEL[it.mark]} ${it.text}${it.ms ? ` · ⏱ ${it.zeit}` : ""}${it.note ? ` — Notiz: ${oneLine(it.note)}` : ""}`);
    }
  }
  if (oneLine(draft.notizen)) {
    md.push("", "## Notizen", "", String(draft.notizen).trim());
  }
  if (images.length) {
    md.push("", "## Bilder", "");
    images.forEach((img, i) => {
      const caption = oneLine(img.caption);
      const linked = json.images[i].itemText;
      md.push(`### ${i + 1}. ${caption || img.name}`, "");
      md.push(`![${(caption || img.name).replace(/[[\]]/g, "")}](${img.file})`, "");
      md.push(`- Datei: \`${img.file}\` (Original: ${oneLine(img.name)})`);
      if (linked) md.push(`- Zu: ${linked}`);
      md.push("");
    });
  }
  return { md: md.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n", json };
}

// Entwurf in einen eigenen Ordner legen. Bilder werden verschoben,
// nummeriert und mit sauberem Namen versehen.
function finalize(dataDir, { list, version, now = new Date() } = {}) {
  const draft = readDraft(dataDir);
  const root = rootDir(dataDir);
  fs.mkdirSync(root, { recursive: true });
  let name = stamp(now);
  for (let n = 2; fs.existsSync(path.join(root, name)); n += 1) name = `${stamp(now)}_${n}`;
  const folder = path.join(root, name);
  const pics = path.join(folder, "bilder");
  fs.mkdirSync(folder);
  const width = draft.images.length > 99 ? 3 : 2;
  const images = [];
  draft.images.forEach((img, i) => {
    const src = path.join(draftImages(dataDir), path.basename(String(img.file || "")));
    if (!FILE_NAME.test(String(img.file || "")) || !fs.existsSync(src)) return;
    fs.mkdirSync(pics, { recursive: true });
    const ext = path.extname(img.file).toLowerCase();
    const file = `${pad(images.length + 1, width)}_${safeName(img.name)}${ext}`;
    fs.renameSync(src, path.join(pics, file));
    images.push({ ...img, file: `bilder/${file}` });
  });
  const { md, json } = buildReport({ list, draft, version, now, name, images });
  fs.writeFileSync(path.join(folder, "bericht.md"), md);
  fs.writeFileSync(path.join(folder, "bericht.json"), JSON.stringify(json, null, 2));
  clearDraft(dataDir);
  return { name, folder, summary: json.summary, images: images.length };
}

function listRuns(dataDir) {
  let names = [];
  try { names = fs.readdirSync(rootDir(dataDir)).filter((n) => RUN_NAME.test(n)); } catch { return []; }
  const runs = [];
  let marks = {};
  try { marks = JSON.parse(fs.readFileSync(path.join(rootDir(dataDir), "_hochgeladen.json"), "utf8")) || {}; } catch {}
  for (const name of names) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(rootDir(dataDir), name, "bericht.json"), "utf8"));
      runs.push({ name, createdAt: j.createdAt, tester: j.tester || "", geraet: j.geraet || "", summary: j.summary || {}, images: (j.images || []).length, uploaded: marks[name] || null });
    } catch {}
  }
  return runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.name.localeCompare(a.name));
}

function lastRun(dataDir) {
  const run = listRuns(dataDir)[0];
  return run ? { name: run.name, at: run.createdAt, fehler: run.summary.fehler || 0, done: run.summary.done || 0, total: run.summary.total || 0 } : null;
}

function readRun(dataDir, name) {
  if (!RUN_NAME.test(String(name))) return null;
  const folder = path.join(rootDir(dataDir), name);
  try {
    return {
      name,
      folder,
      md: fs.readFileSync(path.join(folder, "bericht.md"), "utf8"),
      json: JSON.parse(fs.readFileSync(path.join(folder, "bericht.json"), "utf8")),
    };
  } catch {
    return null;
  }
}

// ---------- API ----------
// ctx: { dataDir, docFile, send, readJson, serveFile, isLocal, version }
// Gibt true zurueck, wenn die Route hierher gehoert.
async function handleApi(req, res, url, ctx) {
  const p = url.pathname;
  if (p !== "/api/testlauf" && !p.startsWith("/api/testlauf/")) return false;
  const { send, dataDir } = ctx;
  const method = req.method;
  if (!ctx.isLocal(req)) {
    req.resume();
    send(res, 403, { error: "Nur dieser Rechner." });
    return true;
  }
  const list = () => loadChecklist(ctx.docFile);
  const version = () => { try { return ctx.version(); } catch { return null; } };

  if (method === "GET" && p === "/api/testlauf") {
    send(res, 200, { checklist: list(), draft: readDraft(dataDir), runs: listRuns(dataDir), version: version(), maxImage: MAX_IMAGE, folder: rootDir(dataDir) });
    return true;
  }
  if (method === "POST" && p === "/api/testlauf/entwurf") {
    const body = await ctx.readJson(req);
    send(res, 200, saveDraft(dataDir, body));
    return true;
  }
  if (method === "POST" && p === "/api/testlauf/bild") {
    try {
      const image = await addImage(dataDir, req, { name: url.searchParams.get("name") || "", type: url.searchParams.get("type") || req.headers["x-file-type"] || "" });
      send(res, 200, image);
    } catch (err) {
      if (res.headersSent || res.destroyed) return true;
      if (err.status === 413) res.setHeader("Connection", "close");
      send(res, err.status || 500, { error: err.message || "Upload fehlgeschlagen." });
    }
    return true;
  }
  const delImg = p.match(/^\/api\/testlauf\/bild\/([a-z0-9-]+)$/);
  if (method === "DELETE" && delImg) {
    send(res, removeImage(dataDir, delImg[1]) ? 200 : 404, { ok: true });
    return true;
  }
  const draftPic = p.match(/^\/api\/testlauf\/entwurf\/bilder\/([^/]+)$/);
  if (method === "GET" && draftPic) {
    if (!FILE_NAME.test(draftPic[1])) { send(res, 404, { error: "Nicht gefunden." }); return true; }
    ctx.serveFile(res, path.join(draftImages(dataDir), draftPic[1]), req);
    return true;
  }
  if (method === "POST" && p === "/api/testlauf/ablegen") {
    const result = finalize(dataDir, { list: list(), version: version() });
    send(res, 200, result);
    return true;
  }
  if (method === "POST" && p === "/api/testlauf/neu") {
    clearDraft(dataDir);
    send(res, 200, readDraft(dataDir));
    return true;
  }
  if (method === "GET" && p === "/api/testlauf/laeufe") {
    send(res, 200, listRuns(dataDir));
    return true;
  }
  const run = p.match(/^\/api\/testlauf\/lauf\/([^/]+)$/);
  if (method === "GET" && run) {
    const found = readRun(dataDir, run[1]);
    send(res, found ? 200 : 404, found || { error: "DEBUG_Run fehlt." });
    return true;
  }
  const runPic = p.match(/^\/api\/testlauf\/lauf\/([^/]+)\/bilder\/([^/]+)$/);
  if (method === "GET" && runPic) {
    if (!RUN_NAME.test(runPic[1]) || !FILE_NAME.test(runPic[2])) { send(res, 404, { error: "Nicht gefunden." }); return true; }
    ctx.serveFile(res, path.join(rootDir(dataDir), runPic[1], "bilder", runPic[2]), req);
    return true;
  }
  // Hochladen nach GitHub (Zweig testlaeufe) und Legion per Webhook Bescheid geben.
  if (method === "POST" && p === "/api/testlauf/hochladen") {
    const upload = require("./testlauf-upload");
    const body = await ctx.readJson(req);
    try {
      const out = await upload.uploadAndNotify(dataDir, String(body.name || ""), { repoRoot: ctx.repoRoot, env: ctx.env });
      // DEBUG_Run-Tor (lib/debug-run.js): Ein Fehler hier darf den Upload nicht kippen.
      if (typeof ctx.onUploaded === "function") { try { ctx.onUploaded(String(body.name || ""), out); } catch {} }
      send(res, 200, out);
    } catch (err) {
      send(res, err.stage === "lauf" ? 404 : 502, { error: err.message, stage: err.stage || "", hint: err.hint || "", detail: String(err.detail || "").slice(-800) });
    }
    return true;
  }
  if (p === "/api/testlauf/legion") {
    const upload = require("./testlauf-upload");
    if (method === "GET") {
      send(res, 200, upload.publicConfig(upload.readConfig(dataDir, ctx.env)));
      return true;
    }
    if (method === "POST") {
      try {
        send(res, 200, upload.publicConfig(upload.saveConfig(dataDir, await ctx.readJson(req))));
      } catch (err) {
        if (!err.status) throw err;
        send(res, err.status, { error: err.message });
      }
      return true;
    }
  }
  send(res, 404, { error: "Unbekannte Route." });
  return true;
}

module.exports = {
  MAX_IMAGE, parseChecklist, loadChecklist, readDraft, saveDraft, addImage, removeImage, clearDraft,
  summarize, duration, buildReport, finalize, listRuns, lastRun, readRun, safeName, imageExt, handleApi,
};
