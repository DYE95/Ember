// DEBUG_Run-Tor: Tunnel-Spieler erst nach dem heutigen DEBUG_Run.
// Logik (Spieltag, Upload, Notausgang) und gegen einen echten Server.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync, spawn } = require("child_process");
const gate = require("../lib/debug-run");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ember-dbg-"));
const ON = { DYE_DEBUG_RUN_PFLICHT: "" };
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi);
const pushed = (extra = {}) => ({ commit: "abc1234def", webhook: { configured: false, ok: false }, ...extra });

test("Spieltag nach lokaler Uhr, Wechsel um 6 Uhr", () => {
  assert.equal(gate.spieltag(at(2026, 10, 11, 20)), "2026-10-11");
  assert.equal(gate.spieltag(at(2026, 10, 12, 0, 30)), "2026-10-11"); // Spielabend ueber Mitternacht
  assert.equal(gate.spieltag(at(2026, 10, 12, 5, 59)), "2026-10-11");
  assert.equal(gate.spieltag(at(2026, 10, 12, 6, 0)), "2026-10-12");
  assert.equal(gate.spieltag(at(2026, 1, 1, 3)), "2025-12-31");
  assert.equal(gate.spieltag("kaputt"), "");
});

test("Ordnername eines Laufs wird zum Datum", () => {
  assert.deepEqual(gate.runDate("2026-10-11_19-05"), at(2026, 10, 11, 19, 5));
  assert.deepEqual(gate.runDate("2026-10-11_19-05_2"), at(2026, 10, 11, 19, 5));
  assert.equal(gate.runDate("../etc"), null);
  assert.equal(gate.runDate(""), null);
});

test("Ohne DEBUG_Run zu, Text für Leitstelle und Fusszeile", () => {
  const dir = tmp();
  try {
    const s = gate.status(dir, { now: at(2026, 10, 11, 18), env: ON });
    assert.equal(s.open, false);
    assert.equal(s.text, "Offline – erst DEBUG_Run");
    assert.equal(gate.status(dir, { env: { DYE_DEBUG_RUN_PFLICHT: "0" } }).open, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Nur ein erfolgreicher Upload vom heutigen Spieltag öffnet", () => {
  const now = at(2026, 10, 11, 19, 30);
  assert.equal(gate.uploadCounts("2026-10-11_19-05", pushed(), now).ok, true);
  assert.equal(gate.uploadCounts("2026-10-11_19-05", pushed({ webhook: { configured: true, ok: true } }), now).ok, true);
  // Legion eingerichtet, aber nicht erreicht: nicht geschafft
  assert.equal(gate.uploadCounts("2026-10-11_19-05", pushed({ webhook: { configured: true, ok: false } }), now).ok, false);
  assert.equal(gate.uploadCounts("2026-10-11_19-05", { webhook: {} }, now).ok, false);
  assert.equal(gate.uploadCounts("2026-10-10_19-05", pushed(), now).ok, false); // gestern
  assert.equal(gate.uploadCounts("unsinn", pushed(), now).ok, false);
  // Lauf um 1 Uhr nachts zaehlt noch fuer den Abend davor
  assert.equal(gate.uploadCounts("2026-10-12_01-00", pushed(), at(2026, 10, 12, 1, 10)).ok, true);
  assert.equal(gate.spieltag(gate.runDate("2026-10-12_01-00")), "2026-10-11");
});

test("Upload öffnet bis zum nächsten Spieltag, auch über einen Neustart", () => {
  const dir = tmp();
  try {
    const now = at(2026, 10, 11, 19, 30);
    assert.equal(gate.markUploaded(dir, "2026-10-10_19-05", pushed(), { now }), false);
    assert.equal(gate.status(dir, { now, env: ON }).open, false);
    assert.equal(gate.markUploaded(dir, "2026-10-11_19-05", pushed(), { now }), true);
    const s = gate.status(dir, { now, env: ON });
    assert.deepEqual([s.open, s.via, s.run], [true, "upload", "2026-10-11_19-05"]);
    // Noch einmal hochladen: bleibt offen, ist aber keine neue Oeffnung
    assert.equal(gate.markUploaded(dir, "2026-10-11_19-05", pushed(), { now }), false);
    // Datei ist der Stand: frisches Lesen (wie nach Neustart) bleibt offen
    assert.equal(gate.status(dir, { now: at(2026, 10, 12, 2), env: ON }).open, true);
    // Neuer Spieltag: wieder zu
    assert.equal(gate.status(dir, { now: at(2026, 10, 12, 6, 1), env: ON }).open, false);
    const log = fs.readFileSync(path.join(dir, "debug-run.log"), "utf8");
    assert.match(log, /oeffnet nicht: nicht von heute/);
    assert.match(log, /offen nach DEBUG_Run 2026-10-11_19-05/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Notausgang öffnet, wird geloggt, überschreibt keinen echten DEBUG_Run", () => {
  const dir = tmp();
  try {
    const now = at(2026, 10, 11, 19);
    const s = gate.override(dir, { now });
    assert.deepEqual([s.open, s.via], [true, "notausgang"]);
    assert.match(fs.readFileSync(path.join(dir, "debug-run.log"), "utf8"), /NOTAUSGANG: ohne DEBUG_Run online gegangen \(localhost\)/);
    // Spaeter doch noch hochgeladen: zaehlt als echter DEBUG_Run
    gate.markUploaded(dir, "2026-10-11_19-30", pushed(), { now: at(2026, 10, 11, 19, 40) });
    assert.equal(gate.status(dir, { now: at(2026, 10, 11, 20), env: ON }).via, "upload");
    assert.equal(gate.override(dir, { now: at(2026, 10, 11, 20) }).via, "upload");
    // Kaputte Datei: zu, kein Absturz
    fs.writeFileSync(path.join(dir, "debug-run.json"), "{kaputt");
    assert.equal(gate.status(dir, { now, env: ON }).open, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Warteseite für Spieler", () => {
  const html = gate.waitPage();
  assert.match(html, /Der Tisch öffnet gleich – der Spielleiter macht noch seinen DEBUG_Run/);
  assert.match(html, /http-equiv="refresh"/);
  assert.match(html, /lang="de"/);
});

// ---------- gegen einen echten Server ----------
const emptyConfig = path.join(tmp(), "gitconfig");
fs.writeFileSync(emptyConfig, "");
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: gitEnv }).trim();

test("Server: Tunnel wartet bis Hochladen, LAN und localhost laufen normal, Notausgang", async () => {
  const base = tmp();
  const origin = path.join(base, "origin.git");
  const repo = path.join(base, "repo");
  git(base, "init", "-q", "--bare", origin);
  git(base, "init", "-q", "-b", "main", repo);
  git(repo, "config", "user.name", "Test Leitung");
  git(repo, "config", "user.email", "sl@example.test");
  fs.writeFileSync(path.join(repo, "README.md"), "Ember\n");
  git(repo, "add", "README.md");
  git(repo, "commit", "-q", "-m", "Start");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "origin", "main");

  const dataDir = path.join(base, "data");
  const port = 37000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...gitEnv, EMBER_DATA: dataDir, EMBER_PORT: String(port), EMBER_HOST: "127.0.0.1", EMBER_TESTLAUF_REPO: repo, LEGION_WEBHOOK_URL: "", LEGION_WEBHOOK_KEY: "", DYE_DEBUG_RUN_PFLICHT: "" },
    stdio: "ignore",
  });
  const request = (method, url, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, json, text, headers: res.headers }); });
    });
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
  const tunnel = { "cf-connecting-ip": "203.0.113.9", "cf-ray": "abc" };
  try {
    for (let i = 0; i < 100; i += 1) {
      try { await request("GET", "/api/state"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    // Tor zu: Tunnel bekommt die Warteseite, API 503
    const page = await request("GET", "/player", { headers: tunnel });
    assert.equal(page.status, 503);
    assert.match(page.headers["content-type"], /text\/html/);
    assert.match(page.text, /Der Tisch öffnet gleich – der Spielleiter macht noch seinen DEBUG_Run/);
    const api = await request("GET", "/api/state", { headers: tunnel });
    assert.equal(api.status, 503);
    assert.equal(api.json.debugRun, true);
    // localhost (und damit LAN ohne Proxy) laeuft normal
    assert.equal((await request("GET", "/player")).status, 200);
    const state = (await request("GET", "/api/state")).json;
    assert.equal(state.lan.online, false);
    assert.equal(state.lan.gate, "Offline – erst DEBUG_Run");
    const ls = (await request("GET", "/api/leitstelle")).json;
    assert.equal(ls.debugRun.open, false);
    assert.equal(ls.debugRun.text, "Offline – erst DEBUG_Run");
    // Alte und neue Adresse
    assert.equal((await request("GET", "/testlauf")).status, 200);
    const alias = await request("GET", "/debug-run");
    assert.equal(alias.status, 200);
    assert.match(alias.text, /<h1>DEBUG_Run<\/h1>/);
    // Stand und Notausgang nur hier
    assert.equal((await request("GET", "/api/debug-run")).json.open, false);
    // Ueber den Tunnel: schon das Tor haelt an (503), sonst waere es 403
    assert.equal((await request("POST", "/api/debug-run/notausgang", { headers: { "x-forwarded-for": "198.51.100.4" }, body: {} })).status, 503);
    assert.equal((await request("POST", "/api/debug-run/notausgang", { headers: { Origin: "https://boese.example", "Sec-Fetch-Site": "cross-site" }, body: {} })).status, 403);
    assert.equal((await request("GET", "/api/debug-run")).json.open, false);

    // Ablegen + Hochladen eines heutigen Laufs oeffnet den Tisch
    const ablage = await request("POST", "/api/testlauf/ablegen", { body: {} });
    assert.equal(ablage.status, 200);
    const up = await request("POST", "/api/testlauf/hochladen", { body: { name: ablage.json.name } });
    assert.equal(up.status, 200, up.text);
    // Grenzfall um 6 Uhr: Lauf vor, Upload nach dem Wechsel zaehlt nicht. Dann ist der Test hier fertig.
    if (gate.spieltag(gate.runDate(ablage.json.name)) !== gate.spieltag(new Date())) return;
    const open = (await request("GET", "/api/debug-run")).json;
    assert.deepEqual([open.open, open.via, open.run], [true, "upload", ablage.json.name]);
    assert.equal((await request("GET", "/player", { headers: tunnel })).status, 200);
    assert.equal((await request("GET", "/api/state", { headers: tunnel })).status, 200);
    assert.equal((await request("GET", "/api/leitstelle")).json.debugRun.open, true);

    // Neuer Spieltag simuliert: Datei auf gestern, dann Notausgang
    fs.writeFileSync(path.join(dataDir, "debug-run.json"), JSON.stringify({ tag: "2000-01-01", via: "upload" }));
    await new Promise((r) => setTimeout(r, 1100)); // Speicher im Server haelt 1 s
    assert.equal((await request("GET", "/player", { headers: tunnel })).status, 503);
    const esc = await request("POST", "/api/debug-run/notausgang", { body: {} });
    assert.equal(esc.status, 200);
    assert.equal(esc.json.via, "notausgang");
    assert.equal((await request("GET", "/player", { headers: tunnel })).status, 200);
    assert.match(fs.readFileSync(path.join(dataDir, "debug-run.log"), "utf8"), /NOTAUSGANG/);
  } finally {
    child.kill();
    fs.rmSync(base, { recursive: true, force: true });
  }
});
