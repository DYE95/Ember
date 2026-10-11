// Server merkt neuen Code (git pull bei laufendem Server) und meldet
// restartNeeded in /api/leitstelle; Hinweise statt nacktem 404.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-neu-"));
const code = path.join(dir, "code");
const port = 37000 + Math.floor(Math.random() * 2000);
const TUNNEL = { "cf-connecting-ip": "203.0.113.9" };
let child;

function request(method, url, headers = {}) {
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
    req.end();
  });
}

test.before(async () => {
  fs.mkdirSync(path.join(code, "lib"), { recursive: true });
  fs.writeFileSync(path.join(code, "server.js"), "// alt\n");
  fs.writeFileSync(path.join(code, "lib", "x.js"), "// alt\n");
  child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, EMBER_DATA: path.join(dir, "data"), EMBER_PORT: String(port), EMBER_HOST: "127.0.0.1", DYE_DEBUG_RUN_PFLICHT: "0", EMBER_CODE_ROOT: code, EMBER_CODE_TTL: "0" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i += 1) {
    try { await request("GET", "/api/state"); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error("Server startet nicht.");
});

test.after(() => {
  if (child) child.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("restartNeeded kippt, sobald server.js oder lib/*.js sich ändern", async () => {
  const before = await request("GET", "/api/leitstelle");
  assert.equal(before.status, 200);
  assert.equal(before.json.code.restartNeeded, false);
  // ohne neuen Code: nackte Antworten
  assert.equal((await request("GET", "/api/gibt-es-nicht")).json.error, "Unbekannte Route.");
  assert.equal((await request("GET", "/index")).text, "Nicht gefunden.");

  fs.writeFileSync(path.join(code, "lib", "x.js"), "// neu\n");
  const after = await request("GET", "/api/leitstelle");
  assert.equal(after.json.code.restartNeeded, true);
  assert.deepEqual(after.json.code.changed, ["lib/x.js"]);
  assert.ok(after.json.code.since);

  const api = await request("GET", "/api/gibt-es-nicht");
  assert.equal(api.status, 404);
  assert.equal(api.json.restartNeeded, true);
  assert.match(api.json.error, /Server neu starten\?/);

  // public/index.html hat keine eigene Route /index: Hinweis-Seite mit Knopf
  const page = await request("GET", "/index");
  assert.equal(page.status, 404);
  assert.match(page.headers["content-type"], /text\/html/);
  assert.match(page.text, /Server neu starten\?/);
  assert.match(page.text, /Jetzt neu starten/);

  // nur am SL-Rechner, nicht ueber den Tunnel
  assert.equal((await request("GET", "/index", TUNNEL)).text, "Nicht gefunden.");
  assert.equal((await request("GET", "/api/gibt-es-nicht", TUNNEL)).json.error, "Unbekannte Route.");
  assert.equal((await request("GET", "/api/leitstelle", TUNNEL)).status, 403);

  fs.writeFileSync(path.join(code, "lib", "x.js"), "// alt\n");
  assert.equal((await request("GET", "/api/leitstelle")).json.code.restartNeeded, false);
});
