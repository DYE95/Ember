// public/js/leitstelle/registry.js — kleines Modul-System fuer die Leitstelle.
// Ein Modul ist ein Objekt { id, title, area, mount(el, ctx), update(state, ctx) }
// und meldet sich mit Leitstelle.register({...}) an (siehe docs/MODULE.md).
// Welche Box welches Modul zeigt, steht im Layout (localStorage).
(function () {
  "use strict";
  const LAYOUT_KEY = "ember.leitstelle.layout.v1";
  const POLL_MS = 5000;
  const VERSION_MS = 10 * 60 * 1000;
  // Boxen nach Daves Skizze: gross oben links, klein oben rechts,
  // quadrat darunter, mitte und breit ueber die ganze Breite.
  const SLOTS = ["gross", "klein", "quadrat", "mitte", "breit"];
  const DEFAULT_LAYOUT = { gross: "status", klein: "kurz", quadrat: "qr", mitte: "adressen", breit: "notizen" };

  const modules = new Map();
  const mounted = [];
  let root = null;
  let timer = 0;
  let versionTimer = 0;
  const ctx = { state: null, version: null };

  function register(def) {
    if (!def || !def.id || typeof def.mount !== "function") throw new Error("Leitstelle: Modul braucht id und mount()");
    modules.set(def.id, def);
  }

  function layout() {
    try {
      return { ...DEFAULT_LAYOUT, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}") };
    } catch {
      return { ...DEFAULT_LAYOUT };
    }
  }

  // Leitstelle.setLayout({ klein: "adressen", mitte: "kurz" }) tauscht Boxen.
  function setLayout(next) {
    const merged = { ...layout(), ...(next || {}) };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(merged));
    if (root) build();
    return merged;
  }

  function resetLayout() {
    localStorage.removeItem(LAYOUT_KEY);
    if (root) build();
  }

  // ---------- Helfer fuer Module ----------
  function el(tag, attrs = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids) if (kid != null) node.append(kid);
    return node;
  }

  function duration(sec) {
    if (sec == null) return "–";
    const s = Math.max(0, Math.round(sec));
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} h ${m % 60} min`;
    return `${Math.floor(h / 24)} Tage`;
  }

  function ago(iso) {
    if (!iso) return "–";
    return `vor ${duration((Date.now() - Date.parse(iso)) / 1000)}`;
  }

  function clock(iso) {
    if (!iso) return "–";
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return today ? time : `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${time}`;
  }

  function bytes(n) {
    if (!n) return "0 B";
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  // Kopieren: Clipboard-API, sonst (http ohne sicheren Kontext) altes execCommand.
  async function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
    }
    const area = el("textarea", { readonly: true, style: "position:fixed;left:-9999px;top:0;opacity:0" });
    area.value = text;
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    area.remove();
    return ok;
  }

  // Neustart ueber die lokale Route; start.bat startet bei Exit 42 neu.
  // Danach warten, bis der Server wieder antwortet, und die Seite neu laden.
  let restarting = false;
  async function restart(onStatus) {
    if (restarting) return;
    restarting = true;
    const say = typeof onStatus === "function" ? onStatus : () => {};
    say("Neustart …");
    // Startzeit vorher merken. Ohne bekannten Stand: neu laden, sobald der Server nach ein paar Sekunden antwortet.
    const before = ctx.state && ctx.state.server ? ctx.state.server.startedAt : null;
    try { await fetch("/api/restart", { method: "POST" }); } catch {}
    let down = false;
    for (let i = 0; i < 90; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await fetch("/api/leitstelle", { cache: "no-store" });
        if (res.ok) {
          const s = await res.json();
          const fresh = before == null ? i >= 2 : Boolean(s.server && s.server.startedAt !== before);
          if (fresh || down) { location.reload(); return; }
        }
      } catch {
        down = true;
        say("Server startet neu …");
      }
    }
    restarting = false;
    say("Server kommt nicht wieder. Läuft start.bat?");
  }

  Object.assign(ctx, { el, duration, ago, clock, bytes, copy, restart });

  // ---------- Aufbau und Daten ----------
  function build() {
    const map = layout();
    mounted.length = 0;
    root.replaceChildren();
    for (const slot of SLOTS) {
      const def = modules.get(map[slot]);
      if (!def) continue;
      const box = el("section", { class: `ls-box ls-${slot}`, "data-module": def.id, "aria-label": def.title });
      if (def.title) box.append(el("h3", { class: "ls-title", text: def.title }));
      const body = el("div", { class: "ls-body" });
      box.append(body);
      root.append(box);
      // Jede Box bekommt eine eigene Instanz: "this" ist pro Aufbau frisch,
      // auch wenn dasselbe Modul nach setLayout() neu oder doppelt erscheint.
      const inst = Object.create(def);
      try {
        inst.mount(body, ctx);
        mounted.push({ def: inst, body });
      } catch (err) {
        body.textContent = `Modul ${def.id} kaputt: ${err.message}`;
      }
    }
    if (ctx.state) push();
  }

  function push() {
    for (const { def, body } of mounted) {
      if (typeof def.update !== "function") continue;
      try {
        def.update(ctx.state, ctx, body);
      } catch (err) {
        console.warn("Leitstelle", def.id, err);
      }
    }
  }

  async function poll() {
    clearTimeout(timer);
    // Auch bei ausgeblendeter Leitstelle (Einstellungen) weiter fragen:
    // die Fusszeile braucht den Stand fuer "Neustart nötig".
    if (!root || document.hidden) {
      timer = setTimeout(poll, POLL_MS);
      return;
    }
    try {
      const res = await fetch("/api/leitstelle", { cache: "no-store" });
      if (res.ok) {
        ctx.state = await res.json();
        ctx.offline = false;
      } else ctx.offline = true;
    } catch {
      ctx.offline = true;
    }
    push();
    window.dispatchEvent(new CustomEvent("ember:leitstelle", { detail: { state: ctx.state, offline: ctx.offline } }));
    timer = setTimeout(poll, POLL_MS);
  }

  async function loadVersion() {
    clearTimeout(versionTimer);
    try {
      const res = await fetch("/api/leitstelle/version", { cache: "no-store" });
      if (res.ok) ctx.version = await res.json();
    } catch {}
    push();
    versionTimer = setTimeout(loadVersion, VERSION_MS);
  }

  function start(container) {
    root = container;
    build();
    loadVersion();
    poll();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  }

  window.Leitstelle = { register, start, setLayout, resetLayout, layout, refresh: poll, modules, SLOTS, ctx };
})();
