// /solo/werkstatt: Knöpfe ohne Bogen erklären sich statt tot zu sein,
// alle Ids aus solo.js gibt es im HTML, der SL-Schlüssel kommt aus sl.pin.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const js = fs.readFileSync(path.join(ROOT, "public", "js", "solo.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public", "solo-werkstatt.html"), "utf8");

test("jede Id, die solo.js anspricht, steht in solo-werkstatt.html", () => {
  const ids = new Set([...js.matchAll(/\$\("#([\w-]+)"\)/g)].map((m) => m[1]));
  const needs = JSON.parse(js.match(/const NEEDS_PC = (\[[^\]]+\])/)[1]);
  needs.forEach((id) => ids.add(id));
  const missing = [...ids].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, []);
});

test("ohne Bogen: Knöpfe gedimmt per aria-disabled, Klick erklärt es", () => {
  assert.doesNotMatch(js, /b\.disabled = !pcs\.length/, "disabled-Knöpfe sahen aus wie kaputt");
  assert.match(js, /setAttribute\("aria-disabled", "true"\)/);
  assert.match(js, /button\[aria-disabled='true'\]/);
  assert.match(js, /Noch kein Bogen\./);
  assert.match(html, /\.btn\[aria-disabled="true"\]\s*\{[^}]*opacity/);
  assert.match(html, /solo\.js\?v=([4-9]|\d\d+)"/, "Cache-Version hochgezählt");
});

test("solo.js nimmt die PIN aus /api/sl-pin vor einem alten Browser-Schlüssel", () => {
  const body = js.slice(js.indexOf("async function gmBody"), js.indexOf("function note("));
  assert.match(body, /\/api\/sl-pin/);
  assert.ok(body.indexOf("/api/sl-pin") < body.indexOf('localStorage.getItem("ember.gmKey")'), "erst PIN, dann Browser");
  assert.match(body, /ECHO/);
});

function post(port, url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: url, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(text || "null") }));
    });
    req.on("error", reject);
    req.end(data);
  });
}

test("Server: Beispielkampagne laden geht mit der PIN, nicht mit einem alten Schlüssel", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-werk-"));
  fs.writeFileSync(path.join(dir, "sl.pin"), "4711\r\n");
  const port = 39000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, EMBER_DATA: dir, EMBER_PORT: String(port), EMBER_HOST: "127.0.0.1" }, stdio: "ignore",
  });
  try {
    let ok = false;
    for (let i = 0; i < 100 && !ok; i += 1) {
      try { ok = (await post(port, "/api/campaigns/import-schwelle", { as: "gm", gmKey: "ECHO ist ausgeschaltet (OFF)." })).status === 403; } catch {}
      if (!ok) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ok, "alter Schlüssel wird abgelehnt");
    const good = await post(port, "/api/campaigns/import-schwelle", { as: "gm", gmKey: "4711" });
    assert.equal(good.status, 200);
    assert.ok(good.json.campaignId);
    const start = await post(port, "/api/solo/start", {});
    assert.equal(start.status, 200);
    assert.match(start.json.text, /Übungskarte/);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
