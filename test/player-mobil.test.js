// Spieler am Handy über den Tunnel: Live-Stream verbindet sich selbst neu,
// Würfeln und Eintreten überstehen ein wackliges Netz, Layout passt hochkant.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

// map.js in einer kleinen Schein-Umgebung laden: EventSource, document, window.
function feedSandbox() {
  const sources = [];
  const timers = [];
  const listeners = { window: {}, document: {} };
  const on = (bag) => (type, fn) => { (bag[type] = bag[type] || []).push(fn); };
  const fire = (bag, type, ev = {}) => (bag[type] || []).forEach((fn) => fn(ev));
  class FakeSource {
    constructor(url) { this.url = url; this.readyState = 0; this.handlers = {}; this.closed = false; sources.push(this); }
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
    emit(type, ev = {}) { (this.handlers[type] || []).forEach((fn) => fn(ev)); }
    close() { this.closed = true; this.readyState = 2; }
  }
  FakeSource.CONNECTING = 0; FakeSource.OPEN = 1; FakeSource.CLOSED = 2;
  const pulls = [];
  const document = {
    hidden: false,
    addEventListener: on(listeners.document),
    createElement: () => ({ setAttribute() {}, style: {}, hidden: false }),
    body: { appendChild() {} },
  };
  const ctx = {
    console, JSON, Math, Date, Promise,
    EventSource: FakeSource,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    document,
    fetch: (url) => { pulls.push(url); return Promise.resolve({ json: () => Promise.resolve({ characters: [] }) }); },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    setInterval: () => 0,
  };
  ctx.window = { addEventListener: on(listeners.window), dispatchEvent() {} };
  vm.createContext(ctx);
  vm.runInContext(read("public", "js", "map.js"), ctx);
  return { ctx, sources, timers, pulls, document, fireWin: (t, ev) => fire(listeners.window, t, ev), fireDoc: (t, ev) => fire(listeners.document, t, ev) };
}

test("Stream: nach endgültigem Abbruch (z. B. 502 vom Tunnel) verbindet Ember selbst neu", () => {
  const box = feedSandbox();
  box.ctx.startStateFeed(() => {});
  assert.equal(box.sources.length, 1);
  const first = box.sources[0];
  first.readyState = 2; // Browser gibt auf
  first.emit("error");
  const retry = box.timers.find((t) => t.ms === 2000); // erste Pause 2 s (Hinweis-Timer hat 4 s)
  assert.ok(retry, "Neuverbindung ist geplant");
  retry.fn();
  assert.equal(box.sources.length, 2, "neuer EventSource");
  assert.equal(first.closed, true);
});

test("Stream: Handy entsperrt oder Seite aus dem Zurück-Cache holt frischen Stand und neue Leitung", () => {
  const box = feedSandbox();
  box.ctx.startStateFeed(() => {});
  box.sources[0].readyState = 1;
  const pullsBefore = box.pulls.length;
  box.document.hidden = true;
  box.fireDoc("visibilitychange");
  box.document.hidden = false;
  box.fireDoc("visibilitychange");
  assert.ok(box.pulls.length > pullsBefore, "Stand wird neu geholt");
  box.fireWin("pagehide");
  assert.equal(box.sources.at(-1).closed, true);
  const count = box.sources.length;
  box.fireWin("pageshow", { persisted: true });
  assert.equal(box.sources.length, count + 1, "nach bfcache neu verbunden");
});

test("Spieler: Würfeln und Eintreten fangen Netzfehler ab, kein Doppelwurf", () => {
  const js = read("public", "js", "player.js");
  const roll = js.slice(js.indexOf("async function playerRoll"), js.indexOf("$(\"#btnHarm\")"));
  assert.match(roll, /catch \(err\)/);
  assert.match(roll, /Keine Verbindung/);
  assert.match(roll, /if \(rolling\) return/);
  const profile = js.slice(js.indexOf("async function saveProfile"), js.indexOf("$(\"#btnProfileEnter\")"));
  assert.match(profile, /catch \(err\)/);
  assert.match(profile, /if \(profileBusy\) return/);
});

test("Spieler hochkant: Seite scrollt statt Karte über den Knöpfen, 16px-Felder", () => {
  const html = read("public", "player.html");
  const narrow = html.slice(html.indexOf("@media (max-width: 959px)"), html.indexOf("@media (min-width: 960px)"));
  assert.match(narrow, /overflow: visible/);
  assert.match(narrow, /font-size: 16px/);
  assert.match(html, /\/js\/map\.js\?v=(1[4-9]|[2-9]\d)"/); // mindestens 14
});

test("Ping: Anzeige haengt an der Empfangszeit, nicht an der Serveruhr", () => {
  const js = read("public", "js", "map.js");
  assert.match(js, /PING_MS\s*=\s*8000/);
  assert.match(js, /pingSeenAt/);
  assert.match(js, /MapKit\.pingSig/);
});

test("Spieler: Sitz wird nach Entsperren aus dem Speicher geholt und neu angemeldet", () => {
  const js = read("public", "js", "player.js");
  assert.match(js, /function restoreSeatFromStorage/);
  assert.match(js, /function claimSeatIfNeeded/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /ember:sit/);
  assert.match(js, /img:/);
});

test("Spieler: map.js und CSS-Versionen sind hochgezählt", () => {
  const html = read("public", "player.html");
  assert.match(html, /\/js\/map\.js\?v=(1[4-9]|[2-9]\d)"/); // mindestens 14
  assert.match(html, /\/css\/ember\.css\?v=14/);
  assert.match(html, /\/js\/player\.js\?v=(2\d)/);
});

// Aus der Code-Review: fremder Text landet nie als HTML auf SL- oder Spielerseite.
test("Log und Spotlight-Wünsche werden escaped (Spieler können sie frei schreiben)", () => {
  const gm = read("public/js/gm.js");
  assert.match(gm, /<div class="who">\$\{esc\(entry\.author\)\}<\/div><div class="txt">\$\{esc\(entry\.text\)\}/);
  assert.match(gm, /\$\{esc\(item\.name\)\}<\/div><div class="meta">\$\{esc\(item\.action \|\| "Want Spotlight"\)\}<br>\$\{esc\(item\.question\)\}/);
  const player = read("public/js/player.js");
  assert.match(player, /^function esc\(/m);
  assert.match(player, /\$\{esc\(e\.author\)\}<\/div><div class="txt">\$\{esc\(e\.text\)\}/);
  assert.match(read("public/karten.html"), /\$\{esc\(c\.text\)\}/);
});

test("Tokens per postMessage nur von der eigenen Seite", () => {
  assert.match(read("public/js/gm.js"), /if \(ev\.origin !== location\.origin\) return;/);
  const studio = read("public/js/pixel-studio.js");
  assert.match(studio, /postMessage\(\{ type: "ember-token", data, color, charId \}, location\.origin\)/);
  assert.match(studio, /if \(!res \|\| !res\.ok\)/);
  assert.doesNotMatch(read("public/js/gm.js"), /gm_" \+ Math\.random/);
});

test("Sitzplatz am Tisch: SL schickt seinen Schlüssel, Spielerseite schickt nichts", () => {
  const src = read("public/js/table-indicator.js");
  const sent = [];
  const sandbox = {
    window: {}, document: { readyState: "complete", querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (k === "ember.gmKey" ? "1234" : null) },
    fetch: (url, opts) => { sent.push({ url, body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true }); },
    console,
  };
  vm.runInNewContext(src.replace(/function assign\(/, "window.__assign = assign;\n  function assign("), sandbox);
  sandbox.window.__assign("pc1", 2, { dataset: { table: "player" } });
  assert.equal(sent.length, 0);
  sandbox.window.__assign("pc1", 2, { dataset: { table: "gm" } });
  assert.deepEqual(sent[0].body, { tableSeat: 2, as: "gm", gmKey: "1234" });
});

test("Heft braucht kein crypto.randomUUID (LAN über http)", () => {
  const src = read("public/js/heft.js");
  const fn = src.match(/function noteId\(\) \{[\s\S]*?\n\}/)[0];
  const id = vm.runInNewContext(`${fn}; noteId()`, { crypto: { getRandomValues: (a) => a.fill(7) }, Date });
  assert.match(id, /^n-[a-z0-9]+-(07){8}$/);
});

test("Eigene Kacheln öffnen kein javascript:", () => {
  assert.match(read("public/js/home-desk.js"), /else if \(!\/\^\[a-z\]\[a-z0-9\+\.-\]\*:\/i\.test\(href\)\) location\.href = href;/);
});

test("/ember lädt keine Schriften aus dem Internet", () => {
  const html = read("public/index.html");
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(html, /\/css\/fonts\.css\?v=\d+/);
  const css = read("public/css/fonts.css");
  for (const m of css.matchAll(/url\("\/fonts\/([^"]+)"\)/g)) assert.ok(fs.existsSync(path.join(ROOT, "public", "fonts", m[1])), m[1]);
  assert.match(read("server.js"), /"\.woff2": "font\/woff2"/);
});
