const KEY = "heft-notes-v1";

const WELCOME = `Willkommen bei Heft

Die erste Zeile wird zum Titel. Darunter schreibst du in Markdown — **fett**, *kursiv*, Listen und Zitate.

Alles bleibt in diesem Browser gespeichert. Kein Konto, kein Server.`;

const LATER = `Morgen

- Einleitung noch einmal kürzen
- Zitat nachschlagen
- Vorschau prüfen, bevor es rausgeht`;

const $ = (id) => document.getElementById(id);

let notes = [];
let activeId = null;
let preview = false;
let query = "";
let undo = null;
let undoTimer = 0;
let saveTimer = 0;
let focusEditor = false;

function seed() {
  const now = Date.now();
  return {
    v: 1,
    notes: [
      { id: "welcome", body: WELCOME, createdAt: now - 1000 * 60 * 40, updatedAt: now - 1000 * 60 * 12 },
      { id: "morgen", body: LATER, createdAt: now - 1000 * 60 * 60 * 30, updatedAt: now - 1000 * 60 * 60 * 26 },
    ],
    activeId: "welcome",
    preview: false,
  };
}

function isNote(value) {
  return value && typeof value.id === "string" && typeof value.body === "string" &&
    typeof value.createdAt === "number" && typeof value.updatedAt === "number";
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return seed();
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.notes)) return seed();
    const rows = data.notes.filter(isNote);
    const id = rows.some((note) => note.id === data.activeId) ? data.activeId : (rows[0] ? rows[0].id : null);
    return { v: 1, notes: rows, activeId: id, preview: Boolean(data.preview) };
  } catch {
    return seed();
  }
}

function snapshot() {
  return { v: 1, notes, activeId, preview };
}

function writeNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch { /* voll */ }
}

function scheduleWrite() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 180);
}

function noteTitle(body) {
  const line = String(body || "").split("\n").map((row) => row.trim()).find(Boolean);
  if (!line) return "Ohne Titel";
  const cleaned = line.replace(/^#{1,6}\s+/, "").replace(/[*_`~[\]]/g, "").trim();
  return cleaned || "Ohne Titel";
}

function noteExcerpt(body) {
  const lines = String(body || "").split("\n").map((row) => row.trim()).filter(Boolean);
  return lines.slice(1).join(" ").replace(/[*_`~>#]/g, "").replace(/\s+/g, " ").trim();
}

function wordCount(body) {
  const trimmed = String(body || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function editedLabel(ts) {
  const mins = Math.max(0, Date.now() - ts) / 60000;
  if (mins < 1) return "gerade eben";
  if (mins < 60) {
    const n = Math.round(mins);
    return "vor " + n + (n === 1 ? " Minute" : " Minuten");
  }
  const hours = mins / 60;
  if (hours < 24) {
    const n = Math.round(hours);
    return "vor " + n + (n === 1 ? " Stunde" : " Stunden");
  }
  const days = hours / 24;
  if (days < 2) return "gestern";
  const n = Math.round(days);
  return "vor " + n + " Tagen";
}

function editedExact(ts) {
  return new Date(ts).toLocaleString("de-DE", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function active() {
  return notes.find((note) => note.id === activeId) || null;
}

function visible() {
  const needle = query.trim().toLowerCase();
  return notes
    .filter((note) => !needle || (noteTitle(note.body) + "\n" + note.body).toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function modLabel() {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Strg";
}

function setSidebar(open) {
  $("sidebar").classList.toggle("is-open", open);
  $("backdrop").hidden = !open;
  const desktop = window.matchMedia("(min-width: 768px)").matches;
  if (!desktop && !open) $("sidebar").setAttribute("inert", "");
  else $("sidebar").removeAttribute("inert");
}

// crypto.randomUUID gibt es nur auf https oder localhost, nicht ueber http://192.168…
function noteId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "n-" + Date.now().toString(36) + "-" + [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function createNote() {
  const note = { id: noteId(), body: "", createdAt: Date.now(), updatedAt: Date.now() };
  notes.unshift(note);
  activeId = note.id;
  preview = false;
  query = "";
  $("search").value = "";
  focusEditor = true;
  setSidebar(false);
  scheduleWrite();
  render();
}

function updateBody(id, body) {
  const note = notes.find((row) => row.id === id);
  if (!note || note.body === body) return;
  note.body = body;
  note.updatedAt = Date.now();
  scheduleWrite();
  render({ keepFocus: true });
}

function deleteActive() {
  if (!activeId) return;
  const index = notes.findIndex((note) => note.id === activeId);
  if (index < 0) return;
  const removed = notes[index];
  const sorted = visible();
  const at = sorted.findIndex((note) => note.id === removed.id);
  const neighbor = sorted[at + 1] || sorted[at - 1];
  notes.splice(index, 1);
  activeId = neighbor && neighbor.id !== removed.id ? neighbor.id : (notes[0] ? notes[0].id : null);
  undo = removed;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { undo = null; render({ keepFocus: true }); }, 6000);
  scheduleWrite();
  render();
}

function restore() {
  if (!undo) return;
  if (!notes.some((note) => note.id === undo.id)) notes.unshift(undo);
  activeId = undo.id;
  undo = null;
  clearTimeout(undoTimer);
  scheduleWrite();
  render();
}

function move(delta) {
  const rows = visible();
  if (!rows.length) return;
  const index = rows.findIndex((note) => note.id === activeId);
  const nextIndex = index < 0 ? (delta > 0 ? 0 : rows.length - 1) : (index + delta + rows.length) % rows.length;
  activeId = rows[nextIndex].id;
  scheduleWrite();
  render();
  const button = document.querySelector('[data-note-id="' + CSS.escape(activeId) + '"]');
  const desktop = window.matchMedia("(min-width: 768px)").matches;
  if (button && (desktop || $("sidebar").classList.contains("is-open"))) button.focus();
}

function selectNote(id) {
  activeId = id;
  setSidebar(false);
  if (!preview) focusEditor = true;
  scheduleWrite();
  render();
}

function togglePreview() {
  preview = !preview;
  if (!preview) focusEditor = true;
  scheduleWrite();
  render();
}

function highlight(text, needle) {
  const frag = document.createDocumentFragment();
  const q = needle.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }
  frag.appendChild(document.createTextNode(text.slice(0, at)));
  const mark = document.createElement("mark");
  mark.textContent = text.slice(at, at + q.length);
  frag.appendChild(mark);
  frag.appendChild(document.createTextNode(text.slice(at + q.length)));
  return frag;
}

function safeHref(raw) {
  const href = String(raw || "").trim();
  if (/^mailto:[^\s]+$/.test(href)) return href;
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") return href;
  } catch { /* ignore */ }
  return null;
}

function earliest(text) {
  const found = [];
  const code = /`([^`]+)`/.exec(text);
  if (code) found.push({ index: code.index, length: code[0].length, kind: "code", value: code[1] });
  const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(text);
  if (link) found.push({ index: link.index, length: link[0].length, kind: "link", label: link[1], href: safeHref(link[2]), raw: link[0] });
  const bold = /\*\*([^*]+)\*\*/.exec(text);
  if (bold) found.push({ index: bold.index, length: bold[0].length, kind: "bold", value: bold[1] });
  const strike = /~~([^~]+)~~/.exec(text);
  if (strike) found.push({ index: strike.index, length: strike[0].length, kind: "strike", value: strike[1] });
  const em = /(?:^|[^*])\*([^*\n]+)\*/.exec(text);
  if (em) {
    const lead = em[0].startsWith("*") ? 0 : 1;
    found.push({ index: em.index + lead, length: em[0].length - lead, kind: "em", value: em[1] });
  }
  if (!found.length) return null;
  found.sort((a, b) => a.index - b.index || b.length - a.length);
  return found[0];
}

function appendInline(parent, text) {
  let rest = text;
  while (rest) {
    const match = earliest(rest);
    if (!match) {
      parent.appendChild(document.createTextNode(rest));
      break;
    }
    if (match.index > 0) parent.appendChild(document.createTextNode(rest.slice(0, match.index)));
    if (match.kind === "code") {
      const code = document.createElement("code");
      code.textContent = match.value;
      parent.appendChild(code);
    } else if (match.kind === "bold" || match.kind === "em" || match.kind === "strike") {
      const el = document.createElement(match.kind === "bold" ? "strong" : match.kind === "em" ? "em" : "s");
      appendInline(el, match.value);
      parent.appendChild(el);
    } else if (match.kind === "link" && match.href) {
      const a = document.createElement("a");
      a.href = match.href;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = match.label;
      parent.appendChild(a);
    } else {
      parent.appendChild(document.createTextNode(match.raw || rest.slice(match.index, match.index + match.length)));
    }
    rest = rest.slice(match.index + match.length);
  }
}

function parseBlocks(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = (lines[i] || "").trim();
    if (trimmed.startsWith("```")) {
      const buf = [];
      i += 1;
      while (i < lines.length && !(lines[i] || "").trim().startsWith("```")) {
        buf.push(lines[i] || "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) { blocks.push({ type: "hr" }); i += 1; continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) { blocks.push({ type: "h", level: heading[1].length, text: heading[2] }); i += 1; continue; }
    if (/^>\s?/.test(trimmed)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test((lines[i] || "").trim())) {
        buf.push((lines[i] || "").trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: buf.join(" ") });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] || "").trim())) {
        items.push((lines[i] || "").trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] || "").trim())) {
        items.push((lines[i] || "").trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    if (!trimmed) { i += 1; continue; }
    const buf = [];
    while (i < lines.length) {
      const current = (lines[i] || "").trim();
      if (!current || current.startsWith("```") || /^(#{1,3})\s+/.test(current) || /^>\s?/.test(current) ||
        /^[-*]\s+/.test(current) || /^\d+\.\s+/.test(current) || /^(-{3,}|\*{3,})$/.test(current)) break;
      buf.push(current);
      i += 1;
    }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

function blockEl(block, asTitle) {
  if (block.type === "hr") return document.createElement("hr");
  if (block.type === "code") {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = block.text;
    pre.appendChild(code);
    return pre;
  }
  if (block.type === "ul" || block.type === "ol") {
    const list = document.createElement(block.type);
    block.items.forEach((item) => {
      const li = document.createElement("li");
      appendInline(li, item);
      list.appendChild(li);
    });
    return list;
  }
  const tag = block.type === "quote" ? "blockquote" : block.type === "h" ? "h" + block.level : asTitle ? "h1" : "p";
  const el = document.createElement(tag);
  appendInline(el, block.text);
  return el;
}

function renderPreview(source) {
  const root = $("preview");
  root.replaceChildren();
  if (!String(source || "").trim()) {
    const p = document.createElement("p");
    p.textContent = "Noch nichts geschrieben.";
    root.appendChild(p);
    return;
  }
  const blocks = parseBlocks(source);
  blocks.forEach((block, index) => root.appendChild(blockEl(block, index === 0 && block.type === "p")));
}

function render(opts) {
  const rows = visible();
  const note = active();
  const needle = query.trim();
  if (needle && rows.length && !rows.some((row) => row.id === activeId)) {
    activeId = rows[0].id;
    scheduleWrite();
    return render(opts);
  }

  $("count").textContent = needle
    ? (rows.length === 1 ? "1 Treffer" : rows.length + " Treffer")
    : (notes.length === 1 ? "1 Notiz" : notes.length + " Notizen");

  const list = $("list");
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "heft-brand";
    empty.textContent = needle ? "Nichts passt zu „" + needle + "“." : "Noch keine Notiz.";
    list.appendChild(empty);
  }
  rows.forEach((row) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "heft-note" + (row.id === activeId ? " is-on" : "");
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", row.id === activeId ? "true" : "false");
    button.dataset.noteId = row.id;
    const title = document.createElement("b");
    title.appendChild(highlight(noteTitle(row.body), query));
    const excerpt = document.createElement("span");
    const bits = noteExcerpt(row.body);
    excerpt.appendChild(bits ? highlight(bits, query) : document.createTextNode("Leer"));
    const time = document.createElement("time");
    time.dateTime = new Date(row.updatedAt).toISOString();
    time.title = editedExact(row.updatedAt);
    time.textContent = editedLabel(row.updatedAt);
    button.append(title, excerpt, time);
    button.addEventListener("click", () => selectNote(row.id));
    list.appendChild(button);
  });

  $("title").textContent = note ? noteTitle(note.body) : "Keine Notiz";
  const words = note ? wordCount(note.body) : 0;
  $("sub").textContent = note
    ? "Bearbeitet " + editedLabel(note.updatedAt) + " · " + (words === 1 ? "1 Wort" : words + " Wörter") + " · lokal gespeichert"
    : "Wähle eine Notiz oder leg eine neue an.";
  $("sub").title = note ? editedExact(note.updatedAt) + " · nur in diesem Browser" : "";

  $("previewBtn").setAttribute("aria-pressed", preview ? "true" : "false");
  $("previewBtn").classList.toggle("is-on", preview);
  $("previewBtn").textContent = preview ? "Schreiben" : "Vorschau";
  $("previewBtn").disabled = !note;
  $("deleteBtn").disabled = !note;

  const editor = $("editor");
  const showPreview = Boolean(note && preview);
  const showEmpty = !note;
  $("empty").hidden = !showEmpty;
  $("preview").hidden = !showPreview;
  editor.hidden = showEmpty || showPreview;
  if (note && !(opts && opts.keepFocus && editor.value === note.body)) editor.value = note.body;
  if (showPreview) renderPreview(note.body);

  $("undo").hidden = !undo;

  if (focusEditor && !preview && note) {
    focusEditor = false;
    editor.focus();
  }
}

function onKey(event) {
  const meta = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (meta && key === "n") { event.preventDefault(); createNote(); return; }
  if (meta && event.shiftKey && key === "p") { event.preventDefault(); togglePreview(); return; }
  if (meta && key === "f") {
    event.preventDefault();
    setSidebar(true);
    $("search").focus();
    $("search").select();
    return;
  }
  if (meta && (event.key === "Backspace" || event.key === "Delete")) { event.preventDefault(); deleteActive(); return; }
  if (meta && event.key === "ArrowDown") { event.preventDefault(); move(1); return; }
  if (meta && event.key === "ArrowUp") { event.preventDefault(); move(-1); }
}

function boot() {
  const data = load();
  notes = data.notes;
  activeId = data.activeId;
  preview = data.preview;
  writeNow();
  const mod = modLabel();
  $("keys").textContent = mod + " N neu · " + mod + " F Suche · " + mod + " ⇧P Vorschau · " + mod + " ↑↓ wechseln · " + mod + " ⌫ löschen";
  setSidebar(false);
  $("create").addEventListener("click", createNote);
  $("createMobile").addEventListener("click", createNote);
  $("createEmpty").addEventListener("click", createNote);
  $("previewBtn").addEventListener("click", togglePreview);
  $("deleteBtn").addEventListener("click", deleteActive);
  $("undoBtn").addEventListener("click", restore);
  $("openSide").addEventListener("click", () => setSidebar(true));
  $("closeSide").addEventListener("click", () => setSidebar(false));
  $("backdrop").addEventListener("click", () => setSidebar(false));
  $("search").addEventListener("input", (event) => { query = event.target.value; render({ keepFocus: true }); });
  $("search").addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const rows = visible();
      if (!rows.length) return;
      const index = rows.findIndex((note) => note.id === activeId);
      if (event.key === "ArrowDown" && document.activeElement === $("search")) {
        activeId = rows[index >= 0 ? index : 0].id;
        scheduleWrite();
        render();
        const button = document.querySelector('[data-note-id="' + CSS.escape(activeId) + '"]');
        if (button) button.focus();
      } else move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Escape") {
      if (query) { query = ""; $("search").value = ""; render({ keepFocus: true }); }
      else setSidebar(false);
    }
  });
  $("editor").addEventListener("input", (event) => updateBody(activeId, event.target.value));
  window.addEventListener("keydown", onKey);
  window.addEventListener("pagehide", writeNow);
  const desk = window.matchMedia("(min-width: 768px)");
  desk.addEventListener("change", () => setSidebar($("sidebar").classList.contains("is-open")));
  render();
}

boot();
