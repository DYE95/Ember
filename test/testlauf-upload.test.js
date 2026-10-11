// Upload eines Testlaufs: eigener Worktree, Zweig testlaeufe, Push nach
// origin (hier ein leeres Bare-Repo) und Webhook an einen Test-Server.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync, spawn } = require("child_process");
const tl = require("../lib/testlauf");
const up = require("../lib/testlauf-upload");

// Eigene git-Umgebung: keine globale Identitaet, kein gpgsign, kein Hook
// vom Rechner, auf dem die Tests laufen.
const emptyConfig = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ember-gitcfg-")), "gitconfig");
fs.writeFileSync(emptyConfig, "");
process.env.GIT_CONFIG_GLOBAL = emptyConfig;
process.env.GIT_CONFIG_NOSYSTEM = "1";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).trim();
const LIST = tl.parseChecklist("## A\n- [ ] eins\n- [ ] zwei\n");

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ember-up-"));
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
  fs.writeFileSync(path.join(repo, "offen.txt"), "nicht committet\n");
  return { base, origin, repo };
}

async function makeRun(dataDir, minute, withImage = true) {
  const [a, b] = LIST.sections[0].items;
  tl.saveDraft(dataDir, { tester: "Dave", geraet: "TV über Hotspot", answers: { [a.id]: { mark: "o" }, [b.id]: { mark: "x", note: "kaputt" } } });
  if (withImage) {
    const { Readable } = require("stream");
    const buf = Buffer.alloc(2048, 3);
    await tl.addImage(dataDir, Object.assign(Readable.from([buf]), { headers: { "content-length": String(buf.length) }, complete: true }), { name: "Bild 1.png" });
  }
  return tl.finalize(dataDir, { list: LIST, version: { version: "v0.6.0", source: "git" }, now: new Date(2026, 9, 10, 11, minute) });
}

function mockWebhook(status = 200) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      calls.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}/hook` })));
}

test("erster Upload: verwaister Zweig testlaeufe, Arbeitsordner bleibt unberührt", async () => {
  const { base, origin, repo } = setup();
  try {
    const dataDir = path.join(base, "data");
    const run = await makeRun(dataDir, 5);
    const out = await up.publishRun(dataDir, run.name, { repoRoot: repo, summary: run.summary });
    assert.equal(out.branch, "testlaeufe");
    assert.equal(out.folder, `testlaeufe/${run.name}/`);
    assert.equal(out.commit, git(origin, "rev-parse", "testlaeufe"));
    const files = git(origin, "ls-tree", "-r", "--name-only", "testlaeufe").split("\n").sort();
    assert.deepEqual(files, [`testlaeufe/${run.name}/bericht.json`, `testlaeufe/${run.name}/bericht.md`, `testlaeufe/${run.name}/bilder/01_bild-1.png`]);
    // verwaist: kein Ember-Code, keine gemeinsame Geschichte mit main
    assert.equal(git(origin, "rev-list", "--count", "testlaeufe"), "1");
    const msg = git(origin, "log", "-1", "--format=%an <%ae>%n%B", "testlaeufe");
    assert.match(msg, /^Test Leitung <sl@example\.test>/);
    assert.match(msg, /Testlauf 2026-10-10_11-05: 2\/2 erledigt, 1 Fehler/);
    assert.match(msg, /Signed-off-by: Test Leitung <sl@example\.test>/);
    // Arbeitsordner: gleicher Zweig, gleiche Datei offen, nichts dazu
    assert.equal(git(repo, "symbolic-ref", "--short", "HEAD"), "main");
    assert.equal(git(repo, "status", "--porcelain"), "?? offen.txt");
    assert.equal(git(repo, "log", "-1", "--format=%s"), "Start");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("zweiter Upload spult vor; frischer Rechner holt origin/testlaeufe zuerst", async () => {
  const { base, origin, repo } = setup();
  try {
    const dataDir = path.join(base, "data");
    const r1 = await makeRun(dataDir, 5);
    await up.publishRun(dataDir, r1.name, { repoRoot: repo });
    const r2 = await makeRun(dataDir, 6, false);
    await up.publishRun(dataDir, r2.name, { repoRoot: repo });
    assert.equal(git(origin, "rev-list", "--count", "testlaeufe"), "2");
    // Gleicher Lauf nochmal: kein leerer Commit, Push geht trotzdem
    const again = await up.publishRun(dataDir, r2.name, { repoRoot: repo });
    assert.equal(again.committed, false);
    assert.equal(git(origin, "rev-list", "--count", "testlaeufe"), "2");

    // Zweiter Klon ohne lokalen Zweig und ohne Worktree
    const clone = path.join(base, "clone");
    git(base, "clone", "-q", origin, clone);
    git(clone, "checkout", "-q", "main");
    const data2 = path.join(base, "data2");
    const r3 = await makeRun(data2, 7, false);
    const out = await up.publishRun(data2, r3.name, { repoRoot: clone });
    assert.equal(git(origin, "rev-list", "--count", "testlaeufe"), "3");
    assert.equal(out.author.name, "DYE95");
    assert.equal(out.author.email, "182445851+DYE95@users.noreply.github.com");
    const names = git(origin, "ls-tree", "--name-only", "testlaeufe:testlaeufe").split("\n");
    assert.deepEqual(names, [r1.name, r2.name, r3.name]);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("git-Fehler kommen mit Stufe und Hinweis zurück", async () => {
  const { base, repo } = setup();
  try {
    const dataDir = path.join(base, "data");
    const run = await makeRun(dataDir, 5, false);
    git(repo, "remote", "set-url", "origin", path.join(base, "gibt-es-nicht.git"));
    await assert.rejects(up.publishRun(dataDir, run.name, { repoRoot: repo }), (err) => {
      assert.equal(err.stage, "fetch");
      assert.match(err.message, /git fetch fehlgeschlagen/);
      return true;
    });
    git(repo, "remote", "remove", "origin");
    await assert.rejects(up.publishRun(dataDir, run.name, { repoRoot: repo }), { stage: "remote" });
    await assert.rejects(up.publishRun(dataDir, "../boese", { repoRoot: repo }), { stage: "lauf" });
    assert.match(up.hintFor("fatal: could not read Username for 'https://github.com': terminal prompts disabled"), /Zugangsdaten/);
    assert.match(up.hintFor("fatal: '/x.git' does not appear to be a git repository"), /origin nicht gefunden/);
    assert.match(up.hintFor("error: No such remote 'origin'"), /Kein Remote/);
    assert.equal(up.repoSlug("https://github.com/DYE95/DYE.TV"), "DYE95/DYE.TV");
    assert.equal(up.repoSlug("git@github.com:DYE95/DYE.TV.git"), "DYE95/DYE.TV");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("Webhook: Bearer und X-Webhook-Key, eigener Header-Name, Schlüssel bleibt geheim", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ember-hook-"));
  const hook = await mockWebhook();
  try {
    assert.deepEqual(up.publicConfig(up.readConfig(base, {})), { url: "", header: "Authorization", keySet: false, source: "" });
    assert.equal(up.readConfig(base, { LEGION_WEBHOOK_URL: "http://x.test/h", LEGION_WEBHOOK_KEY: "k1" }).source, "umgebung");
    up.saveConfig(base, { url: hook.url, key: "geheim-123" });
    assert.throws(() => up.saveConfig(base, { url: "ftp://x" }), /http/);
    assert.throws(() => up.saveConfig(base, { header: "Böse: x" }), /Header/);
    up.saveConfig(base, { url: hook.url, key: "" }); // leerer Schluessel behaelt den alten
    const cfg = up.readConfig(base, {});
    assert.equal(cfg.key, "geheim-123");
    assert.ok(!JSON.stringify(up.publicConfig(cfg)).includes("geheim"));

    const payload = { repo: "DYE95/DYE.TV", branch: "testlaeufe", folder: "testlaeufe/x/", commit: "abc", summary: { done: 1, total: 2, fehler: 1, eigen: 0, bilder: 0 }, version: "v1" };
    assert.equal((await up.notify(cfg, payload)).ok, true);
    assert.equal(hook.calls[0].headers.authorization, "Bearer geheim-123");
    assert.equal(hook.calls[0].headers["x-webhook-key"], "geheim-123");
    assert.deepEqual(hook.calls[0].body, payload);

    up.saveConfig(base, { header: "X-Legion-Key" });
    await up.notify(up.readConfig(base, {}), payload);
    assert.equal(hook.calls[1].headers["x-legion-key"], "geheim-123");
    assert.equal(hook.calls[1].headers.authorization, undefined);

    const down = await up.notify({ url: "http://127.0.0.1:1/x", key: "", header: "Authorization" }, payload, { timeout: 2000 });
    assert.equal(down.ok, false);
    assert.match(down.error, /nicht erreichbar/);
  } finally {
    hook.server.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("Legion: eingefügte Header-Zeilen und Bearer-Vorsatz werden aufgeräumt", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ember-hook-"));
  const hook = await mockWebhook();
  try {
    assert.deepEqual(up.cleanAuth("Authorization: Bearer abc", ""), { header: "Authorization", key: "abc" });
    assert.deepEqual(up.cleanAuth("Authorization", "Bearer abc"), { header: "Authorization", key: "abc" });
    assert.deepEqual(up.cleanAuth("Authorization", "Authorization: Bearer abc"), { header: "Authorization", key: "abc" });
    assert.deepEqual(up.cleanAuth("Bearer abc", ""), { header: "Authorization", key: "abc" });
    assert.deepEqual(up.cleanAuth("X-Legion-Key: abc", ""), { header: "X-Legion-Key", key: "abc" });
    assert.deepEqual(up.cleanAuth("Authorization: Bearer alt", "neu"), { header: "Authorization", key: "neu" });
    assert.deepEqual(up.cleanAuth("Authorization: Bearer", ""), { header: "Authorization", key: "" });
    assert.deepEqual(up.cleanAuth("", ' "abc"\r\n'), { header: "Authorization", key: "abc" });

    // Ganze Zeile ins Feld Header-Name, Schluesselfeld leer: wie am 10.10.
    up.saveConfig(base, { url: hook.url, header: "Authorization: Bearer geheim-9", key: "" });
    let cfg = up.readConfig(base, {});
    assert.equal(cfg.header, "Authorization");
    assert.equal(cfg.key, "geheim-9");
    const payload = { repo: "DYE95/DYE.TV" };
    assert.equal((await up.notify(cfg, payload)).ok, true);
    assert.equal(hook.calls[0].headers.authorization, "Bearer geheim-9");

    // "Bearer <key>" ins Schluesselfeld: kein doppeltes Bearer.
    up.saveConfig(base, { header: "Authorization", key: "Bearer geheim-10" });
    cfg = up.readConfig(base, {});
    assert.equal(cfg.key, "geheim-10");
    await up.notify(cfg, payload);
    assert.equal(hook.calls[1].headers.authorization, "Bearer geheim-10");

    // Von Hand verbogene Datei: kein Absturz, sondern Authorization.
    fs.writeFileSync(path.join(base, "legion-webhook.json"), JSON.stringify({ url: hook.url, header: "Authorization: Bearer x y", key: "" }));
    cfg = up.readConfig(base, {});
    assert.equal(cfg.header, "Authorization");
    assert.equal(cfg.key, "x y");
    fs.writeFileSync(path.join(base, "legion-webhook.json"), JSON.stringify({ url: hook.url, header: "Bö se", key: "k" }));
    assert.equal(up.readConfig(base, {}).header, "Authorization");

    // Ungueltiger Header direkt an notify: Fehlermeldung statt Ausnahme.
    const bad = await up.notify({ url: hook.url, key: "k", header: "Bö se" }, payload);
    assert.equal(bad.ok, false);
    assert.match(bad.error, /nicht gesendet/);

    // 401 mit Hinweis
    const strict = await mockWebhook(401);
    const denied = await up.notify({ url: strict.url, key: "falsch", header: "Authorization" }, payload);
    strict.server.close();
    assert.equal(denied.status, 401);
    assert.match(denied.error, /Bearer/);
  } finally {
    hook.server.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("Server: /api/testlauf/hochladen schiebt und meldet, nur am SL-Rechner", async () => {
  const { base, origin, repo } = setup();
  const hook = await mockWebhook();
  const dataDir = path.join(base, "data");
  const port = 35000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, EMBER_DATA: dataDir, EMBER_PORT: String(port), EMBER_HOST: "127.0.0.1", DYE_DEBUG_RUN_PFLICHT: "0", EMBER_TESTLAUF_REPO: repo, LEGION_WEBHOOK_URL: "", LEGION_WEBHOOK_KEY: "" },
    stdio: "ignore",
  });
  const request = (method, url, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, json, text }); });
    });
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
  try {
    for (let i = 0; i < 100; i += 1) {
      try { await request("GET", "/api/state"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    const tunnel = { "cf-connecting-ip": "203.0.113.9" };
    assert.equal((await request("GET", "/api/testlauf/legion", { headers: tunnel })).status, 403);
    assert.equal((await request("POST", "/api/testlauf/legion", { headers: tunnel, body: { url: "http://evil.test" } })).status, 403);
    assert.equal((await request("POST", "/api/testlauf/hochladen", { headers: tunnel, body: { name: "x" } })).status, 403);
    const evil = await request("POST", "/api/testlauf/legion", { headers: { Origin: "https://boese.example", "Sec-Fetch-Site": "cross-site" }, body: { url: "http://evil.test" } });
    assert.equal(evil.status, 403);

    const ablage = await request("POST", "/api/testlauf/ablegen", { body: {} });
    assert.equal(ablage.status, 200);

    // ohne Webhook: Push klappt, webhook.configured = false
    const first = await request("POST", "/api/testlauf/hochladen", { body: { name: ablage.json.name } });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.json.webhook.configured, false);
    assert.equal(first.json.commit, git(origin, "rev-parse", "testlaeufe"));

    const saved = await request("POST", "/api/testlauf/legion", { body: { url: hook.url, key: "s3cret", header: "Authorization" } });
    assert.deepEqual(saved.json, { url: hook.url, header: "Authorization", keySet: true, source: "datei" });
    assert.ok(!(await request("GET", "/api/testlauf/legion")).text.includes("s3cret"));

    const second = await request("POST", "/api/testlauf/hochladen", { body: { name: ablage.json.name } });
    assert.equal(second.status, 200, second.text);
    assert.equal(second.json.webhook.ok, true);
    const call = hook.calls[0];
    assert.equal(call.headers.authorization, "Bearer s3cret");
    assert.equal(call.headers["x-webhook-key"], "s3cret");
    assert.equal(call.body.branch, "testlaeufe");
    assert.equal(call.body.folder, `testlaeufe/${ablage.json.name}/`);
    assert.equal(call.body.commit, git(origin, "rev-parse", "testlaeufe"));
    assert.equal(call.body.repo, "DYE95/DYE.TV");
    assert.deepEqual(Object.keys(call.body.summary), ["done", "total", "fehler", "eigen", "bilder"]);

    const runs = (await request("GET", "/api/testlauf/laeufe")).json;
    assert.equal(runs[0].uploaded.commit, call.body.commit);
    assert.equal(git(repo, "symbolic-ref", "--short", "HEAD"), "main");

    git(repo, "remote", "set-url", "origin", path.join(base, "weg.git"));
    const broken = await request("POST", "/api/testlauf/hochladen", { body: { name: ablage.json.name } });
    assert.equal(broken.status, 502);
    assert.equal(broken.json.stage, "fetch");
    assert.ok(broken.json.error);
  } finally {
    child.kill();
    hook.server.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
});
