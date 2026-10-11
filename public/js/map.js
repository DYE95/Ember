const MapKit = { draggingId: null, lastSig: "", tool: "move", zoneStart: null, view: { scale: 1, x: 0, y: 0 } };

function gm(body) { return { as: "gm", ...body, gmKey: localStorage.getItem("ember.gmKey") || "" }; }

// Texte aus dem Spielstand (Token-Namen, Zonen) nie roh ins HTML: ein "<" im Namen
// zerlegte sonst die Karte.
function mapEsc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function initials(label) {
  return String(label || "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
function activeEnc(ses) {
  if (!ses) return null;
  const list = ses.encounters || [];
  return list.find((e) => e.id === ses.activeEncounterId) || list[0] || null;
}
function tokenStatus(token, state) {
  const ses = (state.sessions || []).find((s) => s.id === state.active?.sessionId);
  const queued = (ses?.spotlightQueue || []).some((q) => q.characterId === token.characterId);
  const spot = ses?.activeSpotlight && ses.activeSpotlight.characterId === token.characterId;
  const seat = (state.presence || []).find((p) => p.characterId === token.characterId);
  if (spot) return "spotlight";
  if (queued) return "queued";
  if (seat?.status && seat.status !== "online") return seat.status;
  if (ses?.narrating && token.kind === "pc") return "narrating";
  return seat ? "online" : "";
}
function worldOf(stage) {
  let world = stage.querySelector(":scope > .map-world");
  if (!world) {
    world = document.createElement("div");
    world.className = "map-world";
    while (stage.firstChild) world.appendChild(stage.firstChild);
    stage.appendChild(world);
    bindView(stage);
  }
  return world;
}
function applyView(stage) {
  const world = stage.querySelector(":scope > .map-world");
  if (!world) return;
  const v = MapKit.view;
  world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
}
function pct(el, clientX, clientY) {
  const box = el.getBoundingClientRect();
  return {
    x: box.width ? ((clientX - box.left) / box.width) * 100 : 0,
    y: box.height ? ((clientY - box.top) / box.height) * 100 : 0,
  };
}
function bindView(stage) {
  if (stage.dataset.view === "1") return;
  stage.dataset.view = "1";
  let hud = stage.querySelector(".map-zoom");
  if (!hud) {
    hud = document.createElement("div");
    hud.className = "map-zoom";
    hud.innerHTML = `<button type="button" data-z="in">+</button><button type="button" data-z="out">−</button><button type="button" data-z="reset">1:1</button>`;
    stage.appendChild(hud);
    hud.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      const box = stage.getBoundingClientRect();
      const next = b.dataset.z === "in" ? MapKit.view.scale * 1.2 : b.dataset.z === "out" ? MapKit.view.scale / 1.2 : 1;
      if (b.dataset.z === "reset") { MapKit.view.x = 0; MapKit.view.y = 0; MapKit.view.scale = 1; applyView(stage); return; }
      zoomAt(stage, box.left + box.width / 2, box.top + box.height / 2, next);
    });
  }
  stage.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const next = MapKit.view.scale * (ev.deltaY < 0 ? 1.12 : 0.9);
    zoomAt(stage, ev.clientX, ev.clientY, next);
  }, { passive: false });
  stage.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest(".map-zoom, .token, .door")) return;
    // Frage/Hope/Fear-Felder: Finger soll die Karte nicht verschieben.
    const focus = document.activeElement;
    if (focus && /^(INPUT|TEXTAREA|SELECT)$/.test(focus.tagName)) return;
    const pan = ev.button === 1 || ev.button === 2 || ev.altKey || (ev.button === 0 && MapKit.tool === "move");
    if (!pan) return;
    if (ev.button === 0 && MapKit.tool === "move" && ev.target.closest(".token")) return;
    ev.preventDefault();
    const start = { x: ev.clientX, y: ev.clientY, vx: MapKit.view.x, vy: MapKit.view.y };
    const move = (e) => {
      MapKit.view.x = start.vx + (e.clientX - start.x);
      MapKit.view.y = start.vy + (e.clientY - start.y);
      applyView(stage);
    };
    const up = () => {
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
    };
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
  });
  stage.addEventListener("contextmenu", (ev) => ev.preventDefault());
}
function zoomAt(stage, clientX, clientY, next) {
  const box = stage.getBoundingClientRect();
  const v = MapKit.view;
  const px = clientX - box.left;
  const py = clientY - box.top;
  const wx = (px - v.x) / v.scale;
  const wy = (py - v.y) / v.scale;
  v.scale = Math.max(1, Math.min(3.5, next));
  v.x = px - wx * v.scale;
  v.y = py - wy * v.scale;
  applyView(stage);
}
function showTokenCard(stage, token) {
  let card = stage.querySelector(".map-card");
  if (!card) {
    card = document.createElement("div");
    card.className = "map-card";
    stage.appendChild(card);
  }
  card.innerHTML = `<b>${mapEsc(token.label || "Token")}</b><span>${mapEsc(token.kind || "figur")} · ${Math.round(token.x || 0)}, ${Math.round(token.y || 0)}</span>`;
  card.classList.add("on");
}
function renderMap(stage, state, opts = {}) {
  if (!stage) return;
  const world = worldOf(stage);
  const ses = (state.sessions || []).find((s) => s.id === state.active?.sessionId);
  const map = ses?.map || { image: "", tokens: [] };
  world.style.backgroundImage = map.image ? `url("${map.image}")` : "";
  stage.style.backgroundImage = "none";
  let fog = stage.querySelector("canvas.fow");
  if (!fog) {
    fog = document.createElement("canvas");
    fog.className = "fow";
    fog.style.pointerEvents = "none";
    world.prepend(fog);
  }
  const tokens = map.tokens || [];
  const live = new Set(tokens.map((t) => t.id));
  [...stage.querySelectorAll(".token")].forEach((el) => { if (!live.has(el.dataset.id)) el.remove(); });
  tokens.forEach((token) => {
    let el = stage.querySelector(`.token[data-id="${token.id}"]`);
    if (!el) {
      el = document.createElement("button");
      el.type = "button";
      el.dataset.id = token.id;
      el.addEventListener("pointerdown", (ev) => startDrag(ev, el, token, opts));
      world.appendChild(el);
    }
    const turn = (ses?.initiative?.on && (ses.initiative.order || [])[ses.initiative.index]) || null;
    const onTurn = turn && (turn.tokenId === token.id || (turn.characterId && turn.characterId === token.characterId));
    el.className = `token ${token.kind || "pc"} ${tokenStatus(token, state)}${onTurn ? " turn" : ""}`;
    el.style.touchAction = "none";
    el.dataset.rev = String(token.rev || 0);
    if (MapKit.draggingId !== token.id) {
      el.style.left = token.x + "%";
      el.style.top = token.y + "%";
    }
    el.style.background = token.color || "#e85d04";
    const pc = token.characterId && (state.characters || []).find((c) => c.id === token.characterId);
    const face = token.portrait || pc?.portrait || "";
    if (pc?.color) el.style.background = pc.color;
    el.innerHTML = `<span class="ring"></span>${face ? `<img src="${mapEsc(face)}" alt="" draggable="false" />` : `<span>${mapEsc(initials(token.label))}</span>`}<span class="token-label">${mapEsc(token.label)}</span>`;
  });
  drawFog(fog, stage, map, opts);
  drawPing(stage, ses);

  drawRanges(world, stage, ses, state, opts);
  bindFieldTools(stage, opts);
}
// Ping-Dauer ab dem Moment, in dem DIESER Client den Ping zum ersten Mal sieht.
// So stoeren Uhr-Differenzen und Tunnel-Verzoegerung die Anzeige nicht.
const PING_MS = 8000;
function drawPing(stage, ses) {
  const world = worldOf(stage);
  const ping = ses?.ping;
  let el = world.querySelector(".ping");
  if (!ping) { if (el) el.remove(); MapKit.pingSig = ""; return; }
  const sig = String(ping.at) + ":" + ping.x + ":" + ping.y + ":" + (ping.name || "");
  if (MapKit.pingSig !== sig) {
    MapKit.pingSig = sig;
    MapKit.pingSeenAt = Date.now();
  }
  if (Date.now() - (MapKit.pingSeenAt || 0) > PING_MS) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.className = "ping";
    world.appendChild(el);
  }
  el.style.left = ping.x + "%";
  el.style.top = ping.y + "%";
  el.textContent = ping.name || "Ping";
  clearTimeout(MapKit.pingTimer);
  const left = Math.max(200, PING_MS - (Date.now() - MapKit.pingSeenAt));
  MapKit.pingTimer = setTimeout(() => { if (el && el.parentNode) el.remove(); }, left);
}
function segments(map) {
  const lines = (map.walls || []).map((w) => [w.x1, w.y1, w.x2, w.y2]);
  (map.doors || []).filter((d) => !d.open).forEach((d) => lines.push([d.x - 3, d.y, d.x + 3, d.y]));
  return lines;
}
function hit(x1, y1, x2, y2, lines) {
  let best = 1;
  for (const [ax, ay, bx, by] of lines) {
    const den = (x2 - x1) * (ay - by) - (y2 - y1) * (ax - bx);
    if (!den) continue;
    const t = ((ax - x1) * (ay - by) - (ay - y1) * (ax - bx)) / den;
    const u = ((ax - x1) * (y2 - y1) - (ay - y1) * (x2 - x1)) / den;
    if (t > 0.02 && t < best && u >= 0 && u <= 1) best = t;
  }
  return best;
}
function drawFog(canvas, stage, map, opts) {
  try {
  const fow = map.fow || {};
  const w = Math.max(1, stage.clientWidth);
  const h = Math.max(1, stage.clientHeight);
  if (w < 2 || h < 2) {
    if (!stage.dataset.redrawWait) {
      stage.dataset.redrawWait = "1";
      requestAnimationFrame(() => { stage.dataset.redrawWait = ""; drawFog(canvas, stage, map, opts); });
    }
    return;
  }
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const lines = segments(map);
  const sight = fow.on || (opts.viewer !== "gm" && lines.length);
  if (!sight) { canvas.style.opacity = "0"; return; }
  canvas.style.opacity = opts.viewer === "gm" ? "0.72" : "1";
  ctx.fillStyle = "rgba(4,2,2,0.88)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-out";
  const radiusPct = Number(fow.radius || 16);
  const stamps = [...(fow.explored || [])];
  (map.tokens || []).filter((t) => t.kind === "pc").forEach((t) => {
    if (opts.viewer !== "gm" && opts.characterId && t.characterId !== opts.characterId) return;
    const cx = (t.x / 100) * w;
    const cy = (t.y / 100) * h;
    const reach = (radiusPct / 100) * Math.min(w, h) * 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const far = hit(t.x, t.y, t.x + Math.cos(a) * radiusPct, t.y + Math.sin(a) * radiusPct, lines);
      const x = cx + Math.cos(a) * reach * far;
      const y = cy + Math.sin(a) * reach * far;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  });
  stamps.forEach((s) => {
    const x = (s.x / 100) * w;
    const y = (s.y / 100) * h;
    const r = ((s.r || radiusPct) / 100) * Math.min(w, h) * 1.6;
    const g = ctx.createRadialGradient(x, y, r * 0.35, x, y, r);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalCompositeOperation = "source-over";
  } catch {}
}
function drawOverlays(stage, ses, opts) {
  const enc = activeEnc(ses);
  [...stage.querySelectorAll(".zone,.trap-mark,.wall,.door")].forEach((n) => n.remove());
  if (!enc) return;
  const gm = opts.viewer === "gm";
  (enc.zones || []).forEach((z) => {
    if (!gm && z.secret && !z.sprung) return;
    const el = document.createElement("div");
    el.className = "zone" + (z.sprung ? " sprung" : "") + (z.secret ? " secret" : "");
    el.style.left = z.x + "%"; el.style.top = z.y + "%";
    el.style.width = z.w + "%"; el.style.height = z.h + "%";
    el.innerHTML = `<span>${mapEsc(z.label)}</span>`;
    worldOf(stage).appendChild(el);
  });
  const map = ses?.map || {};
  (map.walls || []).forEach((w) => {
    const el = document.createElement("div");
    el.className = "wall";
    el.style.left = w.x1 + "%";
    el.style.top = w.y1 + "%";
    el.style.width = Math.abs(w.x2 - w.x1) + "%";
    el.style.height = Math.max(2, Math.abs(w.y2 - w.y1)) + "%";
    worldOf(stage).appendChild(el);
  });
  (map.doors || []).forEach((d) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "door" + (d.open ? " open" : "");
    el.style.left = d.x + "%";
    el.style.top = d.y + "%";
    el.textContent = d.open ? "auf" : "zu";
    if (opts.actor === "gm") el.addEventListener("click", () => fetch("/api/session/map/door", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gm({ id: d.id })) }));
    worldOf(stage).appendChild(el);
  });
  (enc.traps || []).forEach((t) => {
    if (!gm && !t.sprung) return;
    const el = document.createElement("div");
    el.className = "trap-mark" + (t.sprung ? " sprung" : "");
    el.style.left = t.x + "%"; el.style.top = t.y + "%";
    el.textContent = t.sprung ? "!" : "▴";
    worldOf(stage).appendChild(el);
  });
}
function bindFieldTools(stage, opts) {
  if (stage.dataset.tools === "1") return;
  stage.dataset.tools = "1";
  stage.addEventListener("pointerdown", async (ev) => {
    if (ev.target.closest(".token")) return;
    if (opts.actor !== "gm") return;
    const point = pct(worldOf(stage), ev.clientX, ev.clientY);
    const x = point.x;
    const y = point.y;
    if (MapKit.tool === "brush") {
      await fetch("/api/session/map/brush", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gm({ x, y, r: 9 })) });
    } else if (MapKit.tool === "trap") {
      const label = prompt("Snare?", "Fallgrube") || "Snare";
      const note = prompt("Was geschieht?", "") || "";
      await fetch("/api/session/map/trap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gm({ x, y, r: 7, label, note })) });
    } else if (MapKit.tool === "ping") {
      await fetch("/api/session/ping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gm({ x, y, name: "SL" })) });
    } else if (MapKit.tool === "measure") {
      if (!MapKit.measureStart) { MapKit.measureStart = { x, y }; return; }
      const a = MapKit.measureStart; MapKit.measureStart = null;
      const dx = x - a.x, dy = y - a.y;
      const steps = Math.max(1, Math.round(Math.sqrt(dx * dx + dy * dy) / 5));
      const line = document.createElement("div");
      line.className = "measure-line";
      line.style.left = Math.min(a.x, x) + "%";
      line.style.top = Math.min(a.y, y) + "%";
      line.style.width = Math.abs(dx) + "%";
      line.style.height = Math.abs(dy) + "%";
      line.textContent = steps + (steps === 1 ? " Schritt" : " Schritte");
      stage.appendChild(line);
      setTimeout(() => line.remove(), 4000);
    } else if (MapKit.tool === "wall") {
      if (!MapKit.wallStart) { MapKit.wallStart = { x, y }; return; }
      const a = MapKit.wallStart; MapKit.wallStart = null;
      await fetch("/api/session/map/wall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gm({ x1: a.x, y1: a.y, x2: x, y2: y })) });
    } else if (MapKit.tool === "door") {
      await fetch("/api/session/map/door", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gm({ x, y })) });
    } else if (MapKit.tool === "zone") {
      if (!MapKit.zoneStart) { MapKit.zoneStart = { x, y }; return; }
      const a = MapKit.zoneStart; MapKit.zoneStart = null;
      const label = prompt("Threshold?", "Der Boden gibt nach") || "Threshold";
      const text = prompt("Wenn jemand eintritt?", "") || "";
      await fetch("/api/session/map/zone", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gm({ x: Math.min(a.x, x), y: Math.min(a.y, y), w: Math.max(6, Math.abs(a.x - x)), h: Math.max(6, Math.abs(a.y - y)), label, text, secret: true })),
      });
    }
  });
}
function startDrag(ev, el, token, opts) {
  if (MapKit.tool && MapKit.tool !== "move") return;
  if (opts && opts.canMove && !opts.canMove(token)) return;
  ev.preventDefault();
  try { el.setPointerCapture(ev.pointerId); } catch {}
  MapKit.draggingId = token.id;
  const stage = el.closest(".stage");
  const world = el.parentElement;
  let moved = false;
  const move = (e) => {
    moved = true;
    const point = pct(world, e.clientX, e.clientY);
    const x = Math.max(2, Math.min(98, point.x));
    const y = Math.max(4, Math.min(96, point.y));
    el.style.left = x + "%"; el.style.top = y + "%";
    el.dataset.x = String(x); el.dataset.y = String(y);
  };
  const up = async () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    MapKit.draggingId = null;
    if (!moved) { showTokenCard(stage, token); return; }
    const x = Number(el.dataset.x), y = Number(el.dataset.y);
    if (!Number.isFinite(x)) return;
    const res = await fetch("/api/session/map/move", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: token.id, x, y, rev: Number(el.dataset.rev || 0),
        as: opts.actor || "player",
        characterId: opts.characterId || token.characterId || null,
        gmKey: opts.actor === "gm" ? (localStorage.getItem("ember.gmKey") || "") : "",
      }),
    });
    if (res.status === 409) alert("Das Token hat schon jemand gezogen.");
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}
function statusLabel(code) {
  return ({ online: "am Tisch", queued: "Want Spotlight", spotlight: "im Spotlight", rolling: "würfelt", narrating: "lauscht" })[code] || "fort";
}
// Kleiner Hinweis unten links, wenn der Stream laenger als 4 s weg ist
// (Tunnel weg, Server neu gestartet). EventSource verbindet selbst neu.
function connectionBadge() {
  let timer = 0;
  let el = null;
  const show = () => {
    if (timer || (el && !el.hidden)) return;
    timer = setTimeout(() => {
      timer = 0;
      if (!el) {
        el = document.createElement("div");
        el.className = "ember-offline";
        el.setAttribute("role", "status");
        el.textContent = "Verbindung weg, verbinde neu …";
        el.style.cssText = "position:fixed;left:1rem;bottom:1rem;z-index:9999;padding:.5rem .9rem;border-radius:999px;"
          + "background:rgba(20,10,30,.88);color:#ffd6e8;border:1px solid #ff5fa2;font:600 1rem/1.2 system-ui,sans-serif;pointer-events:none";
        document.body.appendChild(el);
      }
      el.hidden = false;
    }, 4000);
  };
  const hide = () => {
    clearTimeout(timer);
    timer = 0;
    if (el) el.hidden = true;
  };
  return { show, hide };
}

// Ein Stream pro Seite. Andere Skripte hoeren auf "ember:state" statt einen eigenen zu oeffnen,
// sonst sind die sechs Verbindungen pro Adresse schnell weg.
function startStateFeed(apply) {
  let last = 0;
  let current = null;
  window.emberFeed = true;
  const share = (s) => {
    last = Date.now();
    current = s;
    apply(s);
    window.dispatchEvent(new CustomEvent("ember:state", { detail: s }));
  };
  const pull = () => fetch("/api/state", { cache: "no-store" }).then((r) => r.json()).then(share).catch(() => {});
  pull();
  const lost = connectionBadge();
  let es = null;
  let retry = 0;
  let retryTimer = 0;
  let hiddenAt = 0;
  const connect = () => {
    clearTimeout(retryTimer);
    retryTimer = 0;
    if (es) es.close();
    const src = new EventSource("/api/events");
    es = src;
    src.addEventListener("message", (ev) => {
      let next = null;
      try { next = JSON.parse(ev.data); } catch { return; }
      lost.hide();
      share(next);
    });
    // Der Server schickt "presence" nur, wenn jemand kommt, geht oder den Status wechselt.
    src.addEventListener("presence", (ev) => {
      let data = null;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (current) share({ ...current, presence: data.presence || [] });
    });
    src.addEventListener("open", () => { retry = 0; lost.hide(); });
    src.addEventListener("error", () => {
      if (src !== es || src.readyState === EventSource.OPEN) return;
      lost.show();
      // CLOSED heisst: der Browser gibt auf (z. B. Tunnel antwortet kurz mit 502).
      // Dann selbst neu verbinden, mit wachsender Pause bis 30 s.
      if (src.readyState === EventSource.CLOSED && !retryTimer) {
        retry += 1;
        retryTimer = setTimeout(() => { retryTimer = 0; pull(); connect(); }, Math.min(30000, 1000 * 2 ** Math.min(retry, 5)));
      }
    });
  };
  connect();
  // Handy-Bildschirm war aus oder App im Hintergrund: sofort frischen Stand holen
  // und nach laengerer Pause die Leitung neu aufbauen (sie kann still tot sein).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    pull();
    if (es.readyState !== EventSource.OPEN || Date.now() - hiddenAt > 20000) connect();
  });
  window.addEventListener("online", () => { pull(); if (es.readyState !== EventSource.OPEN) connect(); });
  // Zurueck-Taste aus dem Seitencache: der Stream wurde bei pagehide geschlossen.
  window.addEventListener("pageshow", (ev) => { if (ev.persisted) { pull(); connect(); } });
  window.addEventListener("pagehide", () => { clearTimeout(retryTimer); retryTimer = 0; if (es) es.close(); });
  // Nur noch Notnagel, falls der Stream still haengt.
  setInterval(() => { if (Date.now() - last > 45000) pull(); }, 10000);
}

const RANGE_CELL = 100 / 24;
const RANGE_BANDS = [
  { name: "Melee", feet: 5, cells: 1, fill: "rgba(232,93,4,.28)", stroke: "#e85d04" },
  { name: "Very Close", feet: 10, cells: 2, fill: "rgba(244,162,97,.22)", stroke: "#f4a261" },
  { name: "Close", feet: 30, cells: 6, fill: "rgba(233,196,106,.16)", stroke: "#e9c46a" },
  { name: "Far", feet: 100, cells: 20, fill: "rgba(42,157,143,.12)", stroke: "#2a9d8f" },
];
function cellCenter(pct) {
  const i = Math.max(0, Math.min(23, Math.floor(pct / RANGE_CELL)));
  return (i + 0.5) * RANGE_CELL;
}
function cellDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) / RANGE_CELL;
}
function bandFor(cells) {
  return RANGE_BANDS.find((b) => cells <= b.cells + 0.55) || null;
}
function activeActor(ses, state) {
  const turn = ses?.initiative?.on && ses.initiative.order?.length ? ses.initiative.order[ses.initiative.index] : null;
  if (!turn) return null;
  const token = (ses.map?.tokens || []).find((t) => t.id === turn.tokenId || (turn.characterId && t.characterId === turn.characterId));
  if (!token || token.kind === "foe") return null;
  return { turn, token };
}
function drawRanges(world, stage, ses, state, opts) {
  world.querySelectorAll(".range-layer").forEach((n) => n.remove());
  const actor = activeActor(ses, state);
  MapKit.intent = Boolean(actor && opts.actor === "player" && opts.characterId && actor.token.characterId === opts.characterId);
  if (!actor) return;
  const cx = cellCenter(actor.token.x);
  const cy = cellCenter(actor.token.y);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "range-layer");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  const grid = document.createElementNS("http://www.w3.org/2000/svg", "path");
  let d = "";
  for (let i = 0; i <= 24; i += 1) d += `M ${i * RANGE_CELL} 0 V 100 M 0 ${i * RANGE_CELL} H 100 `;
  grid.setAttribute("d", d);
  grid.setAttribute("class", "range-grid");
  svg.appendChild(grid);
  [...RANGE_BANDS].reverse().forEach((band) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const r = (band.cells + 0.5) * RANGE_CELL;
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", String(r));
    c.setAttribute("fill", band.fill);
    c.setAttribute("stroke", band.stroke);
    c.setAttribute("stroke-width", "0.35");
    svg.appendChild(c);
  });
  world.appendChild(svg);
  let legend = stage.querySelector(".range-legend");
  if (!legend) {
    legend = document.createElement("div");
    legend.className = "range-legend";
    stage.appendChild(legend);
  }
  legend.innerHTML = RANGE_BANDS.map((b) => `<i style="background:${b.stroke}"></i>${b.name} ${b.feet} Fuß`).join(" · ");
  if (!stage.dataset.intent) {
    stage.dataset.intent = "1";
    stage.addEventListener("click", (ev) => onIntent(ev, stage));
  }
  stage._intent = { actor, opts, state };
}
async function onIntent(ev) {
  const stage = ev.currentTarget;
  const pack = stage._intent;
  if (!pack || !MapKit.intent || MapKit.draggingId) return;
  if (ev.target.closest(".map-zoom, .door")) return;
  const world = worldOf(stage);
  const point = pct(world, ev.clientX, ev.clientY);
  const actor = pack.actor.token;
  const foeEl = ev.target.closest(".token.foe");
  const foe = foeEl && (pack.state.sessions || []).flatMap((s) => s.map?.tokens || []).find((t) => t.id === foeEl.dataset.id);
  const target = foe || { x: cellCenter(point.x), y: cellCenter(point.y) };
  const cells = cellDist(actor, target);
  const band = bandFor(cells);
  if (foe && !band) return;
  if (!foe && cells > 6.55) return;
  if (foe && cells > 6.55) {
    const step = 6 / cells;
    await postMove(actor, actor.x + (foe.x - actor.x) * step, actor.y + (foe.y - actor.y) * step, pack.opts);
  } else if (!foe) {
    await postMove(actor, target.x, target.y, pack.opts);
    return;
  }
  const trait = "agility";
  await fetch("/api/roll", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId: pack.opts.characterId, tokenId: foe.id, trait, action: "Angriff " + (band ? band.name : "Far"), seat: localStorage.getItem("ember.seat") || "" }),
  });
}
async function postMove(token, x, y, opts) {
  await fetch("/api/session/map/move", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: token.id, x, y, rev: token.rev || 0, as: "player", characterId: opts.characterId, gmKey: "" }),
  });
}
