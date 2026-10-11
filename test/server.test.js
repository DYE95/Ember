// Server-Tests: echter node server.js mit eigenem Datenordner und Port.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-srv-"));
const port = 31000 + Math.floor(Math.random() * 2000);
let child;

function request(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const postJson = (url, data, headers = {}) =>
  request("POST", url, { headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data) });

test.before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, EMBER_DATA: dir, EMBER_PORT: String(port), EMBER_HOST: "127.0.0.1", DYE_DEBUG_RUN_PFLICHT: "0" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i += 1) {
    try {
      await request("GET", "/api/state");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("Server startet nicht.");
});

test.after(() => {
  if (child) child.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Zustand kommt als JSON, mit Schutz-Headern", async () => {
  const res = await request("GET", "/api/state");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.characters));
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.ok(fs.existsSync(path.join(dir, "ember.json")));
});

test("Spielerseite wird ausgeliefert", async () => {
  const res = await request("GET", "/player");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/html/);
});

test("Profil anlegen, doppelter Name gibt 409", async () => {
  const first = await postJson("/api/profiles", { name: "Testi", pin: "1234" }, { "Sec-Fetch-Site": "same-origin" });
  assert.equal(first.status, 200);
  const again = await postJson("/api/profiles", { name: "testi", pin: "9999" });
  assert.equal(again.status, 409);
});

test("fremde Seite darf nicht posten", async () => {
  const res = await request("POST", "/api/restart", {
    headers: { "Content-Type": "text/plain", Origin: "https://boese.example", "Sec-Fetch-Site": "cross-site" },
    body: "{}",
  });
  assert.equal(res.status, 403);
});

test("kaputtes JSON gibt 400, zu grosses 413", async () => {
  const bad = await request("POST", "/api/profiles", { headers: { "Content-Type": "application/json" }, body: "{ nein" });
  assert.equal(bad.status, 400);
  const big = await request("POST", "/api/profiles", {
    headers: { "Content-Type": "application/json", "Content-Length": String(65 * 1024 * 1024) },
  }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);
});

test("Tunnel-Besucher bekommt die SL-PIN nicht", async () => {
  const local = await request("GET", "/api/sl-pin");
  assert.equal(local.status, 200);
  const tunnel = await request("GET", "/api/sl-pin", { headers: { "cf-connecting-ip": "203.0.113.9" } });
  assert.equal(tunnel.status, 403);
});

test("Range: Teil gibt 206, Unsinn gibt 416", async () => {
  const part = await request("GET", "/css/ember.css", { headers: { Range: "bytes=0-9" } });
  assert.equal(part.status, 206);
  assert.equal(part.text.length, 10);
  const bad = await request("GET", "/css/ember.css", { headers: { Range: "bytes=999999999-" } });
  assert.equal(bad.status, 416);
  assert.equal(bad.headers["content-length"], String(Buffer.byteLength(bad.text)));
});

test("Pfade aus dem public-Ordner heraus sind gesperrt", async () => {
  const res = await request("GET", "/docs/regeln/..%2f..%2fserver.js");
  assert.notEqual(res.status, 200);
});

test("Solo-Spiel: neuer Lauf, Aktion, Stand bleibt in solo.json", async () => {
  const start = await request("GET", "/api/solo/game");
  assert.equal(start.status, 200);
  assert.ok(start.json.heroes.length >= 5);
  const fresh = await postJson("/api/solo/game/new", { hero: "cat:2" });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.json.save.run.hero.name, "Garrick Reed");
  const go = fresh.json.actions.find((a) => a.id === "go");
  const moved = await postJson("/api/solo/game/act", { action: go });
  assert.equal(moved.status, 200);
  assert.equal(moved.json.save.run.at, go.to);
  const bad = await postJson("/api/solo/game/act", { action: { id: "attack" } });
  assert.equal(bad.status, 400);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, "solo.json"), "utf8"));
  assert.equal(saved.run.at, go.to);
  const early = await postJson("/api/solo/game/run", {});
  assert.equal(early.status, 409);
});

test("Leitstelle nur am SL-Rechner", async () => {
  const local = await request("GET", "/api/leitstelle");
  assert.equal(local.status, 200);
  assert.ok(local.json.server.uptimeSec >= 0);
  assert.ok(local.json.urls.gm.endsWith("/ember"));
  const tunnel = await request("GET", "/api/leitstelle", { headers: { "cf-connecting-ip": "203.0.113.9" } });
  assert.equal(tunnel.status, 403);
  const version = await request("GET", "/api/leitstelle/version");
  assert.equal(version.status, 200);
  assert.ok(Array.isArray(version.json.notes));
  const remoteVersion = await request("GET", "/api/leitstelle/version", { headers: { "x-forwarded-for": "203.0.113.9" } });
  assert.equal(remoteVersion.status, 403);
});

test("ohne SL-Schluessel ist ueber den Tunnel niemand SL", async () => {
  const tunnel = await postJson("/api/session/log", { as: "gm", text: "x" }, { "cf-connecting-ip": "203.0.113.9" });
  assert.equal(tunnel.status, 403);
  const lan = await postJson("/api/quickstart/sablewood", { as: "gm" }, { "x-forwarded-for": "" });
  assert.equal(lan.status, 403);
  const local = await postJson("/api/session/log", { as: "gm", text: "x" });
  assert.notEqual(local.status, 403);
});

test("Presence kuerzt fremde Texte", async () => {
  const res = await postJson("/api/presence", { key: "k".repeat(500), name: "N".repeat(5000), detail: "d".repeat(5000) }, { "cf-connecting-ip": "203.0.113.9" });
  assert.equal(res.status, 200);
  assert.equal(res.json.key.length, 80);
  const state = await request("GET", "/api/state");
  const row = state.json.presence.find((p) => p.key === res.json.key);
  assert.equal(row.name.length, 80);
  assert.equal(row.detail.length, 200);
});

test("Karten und Errata kommen als Liste", async () => {
  const cards = await request("GET", "/api/cards");
  assert.equal(cards.status, 200);
  assert.ok(Array.isArray(cards.json.cards));
  const errata = await request("GET", "/api/errata");
  assert.equal(errata.status, 200);
  assert.ok(Array.isArray(errata.json.notes));
});

test("Update fragt nie nach einem Passwort und hat eine Frist", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const block = src.slice(src.indexOf('p === "/api/update"'), src.indexOf('p === "/api/solo/game"'));
  assert.ok(/updateExecOptions\(/.test(block));
  assert.ok(!/execSync\([^)]*\{ cwd \}\)/.test(block), "kein execSync ohne Frist");
  assert.ok(/GIT_TERMINAL_PROMPT: "0"/.test(src));
  assert.ok(/timeout: 60000/.test(src));
});

// Politur: kaputte Anfragen geben 4xx statt 500.
test("Kaputte Adresse, Host und Prozent-Zeichen: kein 500", async () => {
  const slash = await request("GET", "//");
  assert.notEqual(slash.status, 500, slash.text);
  assert.equal((await request("GET", "//player")).status, 200);
  const host = await request("GET", "/api/state", { headers: { Host: "a b" } });
  assert.equal(host.status, 200, host.text);
  assert.equal((await request("GET", "/docs/bibliothek/%ZZ")).status, 403);
  assert.equal((await request("GET", "/docs/regeln/%ZZ")).status, 403);
});

test("JSON-Körper muss ein Objekt sein: null, Liste, Zahl geben 400", async () => {
  const same = { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" };
  for (const body of ["null", "[1]", "5", "\"x\""]) {
    for (const url of ["/api/roll", "/api/presence", "/api/settings", "/api/maps"]) {
      const res = await request("POST", url, { headers: same, body });
      assert.equal(res.status, 400, `${url} ${body}: ${res.text}`);
      assert.equal(res.json.error, "Kaputtes JSON.");
    }
  }
});

test("Namen aus dem Spielstand gehen escaped ins HTML", () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, "..", "public", "js", f), "utf8");
  const raw = /innerHTML = .*\$\{(c|e|t|h)\.(name|label|title|text)\}/;
  for (const f of ["gm.js", "player.js", "map.js", "solo.js"]) {
    const bad = read(f).split("\n").filter((line) => raw.test(line));
    assert.deepEqual(bad, [], f);
  }
  assert.match(read("map.js"), /function mapEsc\(/);
  assert.match(read("solo.js"), /function esc\(/);
});
