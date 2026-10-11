const STORE = "ember.home.desk.v3";
const OLD_STORE = "ember.home.desk.v2";

const BUILTIN = [
  { id: "ember", title: "Ember", sub: "Die Glut · SL", href: "/ember" },
  { id: "player", title: "Spieler", sub: "Bogen antippen", href: "/player" },
  { id: "token", title: "Tokenatelier", sub: "Pixel-Maker", href: "/token" },
  { id: "pixelstube", title: "Pixelstube", sub: "Raster, Palette, PNG", href: "/pixelstube" },
  { id: "media", title: "Mediathek", sub: "Videos lokal abspielen", panel: "panelMedia" },
  { id: "bibliothek", title: "Bibliothek", sub: "PDFs und Regeln", href: "/bibliothek" },
  { id: "karten", title: "Karten", sub: "Print and Play", href: "/karten" },
  { id: "solo", title: "Solo", sub: "Dungeon-Lauf allein", href: "/solo" },
  { id: "heft", title: "Heft", sub: "Notizen · Markdown", href: "/heft" },
  { id: "testlauf", title: "DEBUG_Run", sub: "Checkliste · vor dem Online-Gang", href: "/debug-run" },
  { id: "ereignisse", title: "Ereignisse", sub: "Parcours, Fallwerk, Puls …", href: "/ereignisse" },
  { id: "settings", title: "Einstellungen", sub: "Leitstelle ⇄ Einstellungen", toggle: true },
];

// Masse in "Basis-Pixeln" (16 = 1rem). Die Seite rechnet sie in rem um,
// damit Kacheln auf dem 4K-TV mitwachsen. Drei Spalten passen neben die
// Einstellungen, grosse Flaechen fuer den Wii-Zeiger.
function defaults() {
  return {
    fontSize: 18,
    tileW: 272,
    tileH: 120,
    grid: 24,
    locked: false,
    panelMode: "leitstelle",
    tiles: {
      ember: { x: 24, y: 24 },
      player: { x: 320, y: 24 },
      token: { x: 616, y: 24 },
      pixelstube: { x: 24, y: 168 },
      media: { x: 320, y: 168 },
      bibliothek: { x: 616, y: 168 },
      karten: { x: 24, y: 312 },
      solo: { x: 320, y: 312 },
      heft: { x: 616, y: 312 },
      settings: { x: 24, y: 456 },
      testlauf: { x: 320, y: 456 },
      ereignisse: { x: 616, y: 456 },
    },
    custom: [],
    profiles: {},
    activeProfile: "",
  };
}

// Vom alten Tisch (v2) bleiben Profile, eigene Kacheln und Sperre.
// Die Positionen starten neu, weil die alten vier Spalten nicht neben
// die Seitenleiste passen.
function fromOld() {
  try {
    const old = JSON.parse(localStorage.getItem(OLD_STORE) || "null");
    if (!old) return null;
    return {
      ...defaults(),
      locked: Boolean(old.locked),
      custom: Array.isArray(old.custom) ? old.custom : [],
      profiles: old.profiles || {},
      activeProfile: old.activeProfile || "",
    };
  } catch {
    return null;
  }
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!raw) return fromOld() || defaults();
    return {
      ...defaults(),
      ...raw,
      tiles: { ...defaults().tiles, ...(raw.tiles || {}) },
      custom: Array.isArray(raw.custom) ? raw.custom : [],
    };
  } catch {
    return defaults();
  }
}

function save() {
  localStorage.setItem(STORE, JSON.stringify(state));
}

function snap(n) {
  const g = Math.max(8, Number(state.grid) || 24);
  return Math.round(n / g) * g;
}

function catalog() {
  return BUILTIN.concat(state.custom);
}

const U = (n) => `${Number(n) / 16}rem`;
const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

let state = load();
const desk = document.getElementById("desk");
const nodes = {};

function applyChrome() {
  document.body.style.setProperty("--fs", String(state.fontSize));
  desk.style.setProperty("--grid", U(state.grid));
  document.body.classList.toggle("locked", Boolean(state.locked));
  document.body.classList.toggle("mode-settings", state.panelMode === "settings");
  if (nodes.settings) nodes.settings.classList.toggle("on", state.panelMode === "settings");
  const font = document.getElementById("fontSize");
  const tileW = document.getElementById("tileW");
  const tileH = document.getElementById("tileH");
  const grid = document.getElementById("grid");
  const lock = document.getElementById("lockDesk");
  const readout = document.getElementById("layoutReadout");
  if (font) font.value = state.fontSize;
  if (tileW) tileW.value = state.tileW;
  if (tileH) tileH.value = state.tileH;
  if (grid) grid.value = state.grid;
  if (lock) lock.checked = Boolean(state.locked);
  if (readout) readout.textContent =
    state.fontSize + "px · Kachel " + state.tileW + "×" + state.tileH + " · Raster " + state.grid +
    (state.locked ? " · fest" : "");
}

function place(id) {
  const el = nodes[id];
  if (!el) return;
  const pos = state.tiles[id] || { x: 24, y: 24 };
  el.style.width = U(state.tileW);
  el.style.height = U(state.tileH);
  el.style.left = U(pos.x);
  el.style.top = U(pos.y);
}

function openPanel(id) {
  document.querySelectorAll(".desk-panel").forEach((p) => p.classList.add("hidden"));
  if (id) document.getElementById(id).classList.remove("hidden");
}

function activate(item) {
  if (item.href) {
    const href = String(item.href).trim();
    if (/^https?:/i.test(href)) window.open(href, "_blank", "noopener");
    // Eigene Kacheln: nur http(s) oder Pfade, kein javascript:/data: und Co.
    else if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) location.href = href;
  } else if (item.panel) openPanel(item.panel);
  else if (item.toggle) setPanelMode(state.panelMode === "settings" ? "leitstelle" : "settings");
}

// Rechte Spalte: Leitstelle (Standard) oder Einstellungen. Die Wahl bleibt gespeichert.
function setPanelMode(mode) {
  state.panelMode = mode === "settings" ? "settings" : "leitstelle";
  applyChrome();
  save();
  if (state.panelMode === "leitstelle" && window.Leitstelle) window.Leitstelle.refresh();
}

function bindDrag(el, item) {
  let drag = null;
  el.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    el.setPointerCapture(ev.pointerId);
    const pos = state.tiles[item.id] || { x: 24, y: 24 };
    drag = { x: ev.clientX, y: ev.clientY, ox: pos.x, oy: pos.y, moved: false };
  });
  el.addEventListener("pointermove", (ev) => {
    if (!drag || state.locked) return;
    const scale = 16 / remPx();
    const dx = (ev.clientX - drag.x) * scale;
    const dy = (ev.clientY - drag.y) * scale;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    state.tiles[item.id] = {
      x: snap(Math.max(0, drag.ox + dx)),
      y: snap(Math.max(0, drag.oy + dy)),
    };
    place(item.id);
  });
  el.addEventListener("pointerup", () => {
    if (!drag) return;
    const wasDrag = drag.moved && !state.locked;
    drag = null;
    if (wasDrag) save();
    else activate(item);
  });
}

function buildTiles() {
  desk.innerHTML = "";
  Object.keys(nodes).forEach((k) => delete nodes[k]);
  catalog().forEach((item) => {
    if (!state.tiles[item.id]) {
      const n = Object.keys(state.tiles).length;
      state.tiles[item.id] = { x: snap(24 + (n % 3) * (state.tileW + state.grid)), y: snap(24 + Math.floor(n / 3) * (state.tileH + state.grid)) };
    }
    const el = document.createElement("button");
    el.type = "button";
    el.className = "desk-tile";
    const title = document.createElement("b");
    title.textContent = item.title;
    const sub = document.createElement("span");
    sub.textContent = item.sub || "";
    el.append(title, sub);
    desk.appendChild(el);
    nodes[item.id] = el;
    bindDrag(el, item);
    place(item.id);
  });
  if (nodes.settings) nodes.settings.classList.toggle("on", state.panelMode === "settings");
}

function renderProfiles() {
  const list = document.getElementById("profileList");
  const names = Object.keys(state.profiles);
  list.innerHTML = names.length ? "" : "<p class='hint'>Noch kein Profil.</p>";
  names.forEach((name) => {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = name;
    const loadBtn = document.createElement("button");
    loadBtn.className = "btn tiny";
    loadBtn.textContent = "Laden";
    loadBtn.addEventListener("click", () => {
      const p = state.profiles[name];
      const profiles = state.profiles;
      state = { ...defaults(), ...p, profiles, custom: p.custom || [], activeProfile: name };
      applyChrome();
      buildTiles();
      save();
      renderProfiles();
    });
    const delBtn = document.createElement("button");
    delBtn.className = "btn tiny ghost";
    delBtn.textContent = "Weg";
    delBtn.addEventListener("click", () => {
      delete state.profiles[name];
      save();
      renderProfiles();
    });
    row.appendChild(label);
    row.appendChild(loadBtn);
    row.appendChild(delBtn);
    list.appendChild(row);
  });
}

["fontSize", "tileW", "tileH", "grid"].forEach((id) => {
  document.getElementById(id).addEventListener("input", (ev) => {
    state[id] = Number(ev.target.value);
    applyChrome();
    catalog().forEach((t) => place(t.id));
  });
  document.getElementById(id).addEventListener("change", save);
});

document.getElementById("lockDesk").addEventListener("change", (ev) => {
  state.locked = ev.target.checked;
  applyChrome();
  save();
});

document.getElementById("btnAddTile").addEventListener("click", () => {
  if (state.locked) return alert("Tisch ist fest.");
  const title = document.getElementById("newTitle").value.trim();
  if (!title) return alert("Titel fehlt.");
  const id = "c_" + Date.now().toString(36);
  state.custom.push({
    id,
    title,
    sub: document.getElementById("newSub").value.trim(),
    href: document.getElementById("newHref").value.trim(),
  });
  save();
  buildTiles();
  document.getElementById("newTitle").value = "";
  document.getElementById("newSub").value = "";
  document.getElementById("newHref").value = "";
});

document.getElementById("btnSaveProfile").addEventListener("click", () => {
  const name = document.getElementById("profileName").value.trim();
  if (!name) return alert("Profilnamen eintragen.");
  state.profiles[name] = {
    fontSize: state.fontSize,
    tileW: state.tileW,
    tileH: state.tileH,
    grid: state.grid,
    locked: state.locked,
    tiles: JSON.parse(JSON.stringify(state.tiles)),
    custom: JSON.parse(JSON.stringify(state.custom)),
  };
  state.activeProfile = name;
  save();
  renderProfiles();
});

document.getElementById("btnResetLayout").addEventListener("click", () => {
  if (state.locked) return alert("Tisch ist fest.");
  const keep = state.profiles;
  state = defaults();
  state.profiles = keep;
  applyChrome();
  buildTiles();
  save();
});

document.querySelectorAll("[data-close]").forEach((b) => {
  b.addEventListener("click", () => openPanel(null));
});

document.getElementById("btnSaveName").addEventListener("click", async () => {
  const houseName = document.getElementById("setHouseName").value.trim() || "Ember";
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ houseName }),
  });
  document.getElementById("houseTitle").textContent = houseName;
  document.title = houseName;
});

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const CRC = crcTable();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function u16(n) { return [n & 255, (n >>> 8) & 255]; }
function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

function zipFiles(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  files.forEach((file) => {
    const name = enc.encode(file.name);
    const data = typeof file.data === "string" ? enc.encode(file.data) : file.data;
    const crc = crc32(data);
    const local = [0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      .concat(u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
    const localBuf = new Uint8Array(local.concat([...name], [...data]));
    parts.push(localBuf);
    const cen = [0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      .concat(u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
    central.push(new Uint8Array(cen.concat([...name])));
    offset += localBuf.length;
  });
  const cenAll = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(
    [0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0]
      .concat(u16(files.length), u16(files.length), u32(cenAll), u32(offset), u16(0))
  );
  const total = offset + cenAll + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  parts.forEach((b) => { out.set(b, p); p += b.length; });
  central.forEach((b) => { out.set(b, p); p += b.length; });
  out.set(end, p);
  return out;
}

function packPayload() {
  return JSON.stringify({
    kind: "ember-home-pack",
    version: 1,
    houseName: document.getElementById("houseTitle").textContent,
    desk: state,
  }, null, 2);
}

document.getElementById("btnExport").addEventListener("click", () => {
  const zip = zipFiles([
    { name: "ember-home.json", data: packPayload() },
    { name: "liesmich.txt", data: "Ember Home-Paket. Unter Einstellungen → Paket laden wieder einspielen." },
  ]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
  a.download = "ember-home.zip";
  a.click();
});

document.getElementById("packFile").addEventListener("change", async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const text = await file.text();
  let payload = null;
  if (file.name.endsWith(".json") || text.trim().startsWith("{")) {
    payload = JSON.parse(text);
  } else {
    const idx = text.indexOf("ember-home.json");
    const brace = text.indexOf("{", idx);
    const end = text.lastIndexOf("}");
    if (brace >= 0 && end > brace) payload = JSON.parse(text.slice(brace, end + 1));
  }
  if (!payload || payload.kind !== "ember-home-pack" || !payload.desk) {
    alert("Kein Ember-Home-Paket.");
    return;
  }
  state = { ...defaults(), ...payload.desk, profiles: payload.desk.profiles || {} };
  applyChrome();
  buildTiles();
  save();
  renderProfiles();
  if (payload.houseName) {
    document.getElementById("setHouseName").value = payload.houseName;
    document.getElementById("houseTitle").textContent = payload.houseName;
    document.title = payload.houseName;
  }
});

buildTiles();
applyChrome();
renderProfiles();

document.getElementById("btnUpdate").addEventListener("click", async () => {
  const log = document.getElementById("updateLog");
  log.textContent = "Prüfe …";
  try {
    const res = await fetch("/api/update", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      log.textContent = "Fehler:\n" + (data.error || "unbekannt") + "\n" + (data.stdout || "") + (data.stderr || "");
      return;
    }
    if (!data.changed) {
      log.textContent = "Schon aktuell (" + data.after + ").";
      return;
    }
    log.textContent =
      "Neue Commits: " + data.before + " → " + data.after + "\n" +
      data.pullLog + "\n" +
      (data.installLog ? "npm install ausgeführt.\n" : "") +
      "\n➜ Klick auf „Server neu starten“, damit der neue Code lädt.";
  } catch (err) {
    log.textContent = "Konnte den Server nicht erreichen: " + err.message;
  }
});
document.getElementById("btnRestart").addEventListener("click", async () => {
  if (!confirm("Ember neu starten? Das Browserfenster verliert für ~2 Sekunden die Verbindung.")) return;
  const log = document.getElementById("updateLog");
  log.textContent = "Neustart läuft … nach ~2 Sekunden diese Seite neu laden (F5).";
  try { await fetch("/api/restart", { method: "POST" }); } catch {}
});
fetch("/api/state").then((r) => r.json()).then((s) => {
  const title = (s.settings && s.settings.houseName) || "Ember";
  document.getElementById("houseTitle").textContent = title;
  document.title = title;
  document.getElementById("setHouseName").value = title;
  applyChrome();
  const list = document.getElementById("clipList");
  const video = document.getElementById("homeVideo");
  const media = s.media || [];
  list.innerHTML = "";
  media.forEach((clip, i) => {
    const b = document.createElement("button");
    b.className = "card";
    b.textContent = clip.name;
    b.addEventListener("click", () => {
      video.src = "/uploads/" + clip.file;
      video.play().catch(() => {});
    });
    list.appendChild(b);
    if (i === 0 && !video.src) video.src = "/uploads/" + clip.file;
  });
  if (!media.length) list.innerHTML = "<p class='hint'>Noch kein Clip.</p>";
});

attachVideoDeck(document.getElementById("homeVideo"));
// Die Datei geht roh an den Server, der sie direkt auf die Platte schreibt.
// Kein base64 mehr: das hat bei grossen Videos Browser und Server ueberfordert.
document.getElementById("clipFile").addEventListener("change", (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const status = document.getElementById("clipStatus");
  const say = (text) => { if (status) status.textContent = text; };
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
  const q = new URLSearchParams({ name: file.name, ext });
  const xhr = new XMLHttpRequest();
  xhr.open("POST", `/api/media?${q}`);
  xhr.setRequestHeader("Content-Type", "application/octet-stream");
  xhr.setRequestHeader("X-Ember-GmKey", localStorage.getItem("ember.gmKey") || "");
  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) say(`Lädt hoch … ${Math.round((e.loaded / e.total) * 100)} %`);
  });
  xhr.addEventListener("load", () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      say("Fertig.");
      location.reload();
      return;
    }
    let msg = `Fehler ${xhr.status}`;
    try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
    if (xhr.status === 413) msg = "Zu groß für den Tunnel. Große Videos direkt am SL-Rechner hochladen.";
    say(`Upload fehlgeschlagen: ${msg}`);
  });
  xhr.addEventListener("error", () => say("Upload fehlgeschlagen: keine Verbindung zum Server."));
  say("Lädt hoch …");
  xhr.send(file);
  ev.target.value = "";
});

// Kopf- und Fusszeile: Logo, Uhr, Tunnel, Spieler-Adresse, Knoepfe.
const logo = document.getElementById("logo");
const showLogo = () => { if (logo.naturalWidth) logo.hidden = false; };
logo.addEventListener("load", showLogo);
logo.addEventListener("error", () => logo.remove());
if (logo.complete) { if (logo.naturalWidth) showLogo(); else logo.remove(); }

const clock = document.getElementById("clock");
const tick = () => {
  clock.textContent = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
};
tick();
setInterval(tick, 10000);

// DEBUG_Run-Tor zu (lan.online === false): Tunnel-Adresse gilt fuer Spieler noch nicht.
function renderStatus(s) {
  const lan = s.lan || {};
  const offline = lan.online === false;
  const remote = offline ? "" : lan.remote || "";
  const first = (lan.addresses || [])[0];
  const url = remote ? `${remote}/player` : first ? `http://${first.address}:${lan.port}/player` : "";
  document.getElementById("playerUrl").textContent = url || "Keine Spieler-Adresse";
  const tunnel = document.getElementById("tunnelState");
  tunnel.textContent = offline ? lan.gate || "Offline – erst DEBUG_Run" : remote ? "Tunnel an" : "Tunnel aus";
  tunnel.classList.toggle("on", Boolean(remote));
  tunnel.classList.toggle("gate", offline);
  renderCount(s.presence || []);
}

function renderCount(presence) {
  const n = presence.filter((row) => row.role !== "gm").length;
  document.getElementById("playerCount").textContent = n === 1 ? "1 Spieler" : `${n} Spieler`;
}

// Fusszeile: laeuft der Server, und laeuft er noch mit altem Code?
let serverOk = false;
let restartNeeded = false;
function serverState(ok) {
  serverOk = ok;
  const need = ok && restartNeeded;
  document.getElementById("serverDot").className = `dot ${need ? "lantern" : ok ? "ok" : "bad"}`;
  document.getElementById("serverState").textContent = need ? "Neustart nötig – neuer Code geladen" : ok ? "Server läuft" : "Server nicht erreichbar";
  document.querySelector(".foot-left").classList.toggle("restart", need);
  document.getElementById("btnRestartNow").hidden = !need;
}
window.addEventListener("ember:leitstelle", (ev) => {
  const s = ev.detail && ev.detail.state;
  restartNeeded = Boolean(s && !ev.detail.offline && s.code && s.code.restartNeeded);
  if (s && !ev.detail.offline && s.debugRun && current && current.lan) {
    const open = s.debugRun.open !== false;
    if (current.lan.online !== open) {
      current.lan.online = open;
      current.lan.gate = open ? "" : s.debugRun.text;
      renderStatus(current);
    }
  }
  serverState(!ev.detail.offline || serverOk);
});
document.getElementById("btnRestartNow").addEventListener("click", (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  if (window.Leitstelle) window.Leitstelle.ctx.restart((t) => { btn.textContent = t; });
});

let current = null;
const feed = new EventSource("/api/events");
feed.addEventListener("open", () => serverState(true));
feed.addEventListener("error", () => { if (feed.readyState !== EventSource.OPEN) serverState(false); });
feed.addEventListener("message", (ev) => {
  try { current = JSON.parse(ev.data); } catch { return; }
  serverState(true);
  renderStatus(current);
});
feed.addEventListener("presence", (ev) => {
  try { renderCount(JSON.parse(ev.data).presence || []); } catch {}
});
window.addEventListener("pagehide", () => feed.close());

document.getElementById("btnFullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
});
document.getElementById("btnReload").addEventListener("click", () => location.reload());
document.getElementById("btnServer").addEventListener("click", () => openPanel("panelEmber"));

window.addEventListener("ember:panel-mode", (ev) => setPanelMode(ev.detail));
document.getElementById("btnToLeitstelle").addEventListener("click", () => setPanelMode("leitstelle"));
