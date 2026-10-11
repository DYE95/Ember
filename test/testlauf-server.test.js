// Testlauf-Seite gegen einen echten Server: Entwurf, Bild-Upload (roh),
// Ablegen, alte Laeufe, und nur am SL-Rechner erreichbar.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-tls-"));
const port = 33000 + Math.floor(Math.random() * 2000);
const SAME = { "Sec-Fetch-Site": "same-origin" };
const TUNNEL = { "cf-connecting-ip": "203.0.113.9", "cf-ray": "abc" };
let child;

function request(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buf.toString("utf8")); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, buf, text: buf.toString("utf8"), json });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
const postJson = (url, data, headers = {}) =>
  request("POST", url, { headers: { "Content-Type": "application/json", ...SAME, ...headers }, body: JSON.stringify(data) });
const upload = (name, buf, headers = {}) =>
  request("POST", `/api/testlauf/bild?name=${encodeURIComponent(name)}`, {
    headers: { "Content-Type": "application/octet-stream", "Content-Length": buf.length, ...SAME, ...headers }, body: buf,
  });

test.before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, EMBER_DATA: dir, EMBER_PORT: String(port), EMBER_HOST: "127.0.0.1", DYE_DEBUG_RUN_PFLICHT: "0" },
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

test("Testlauf nur am SL-Rechner, fremde Seiten dürfen nicht posten", async () => {
  assert.equal((await request("GET", "/testlauf")).status, 200);
  for (const p of ["/testlauf", "/testlauf.html"]) {
    const res = await request("GET", p, { headers: { "x-forwarded-for": "198.51.100.4" } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/player");
  }
  assert.equal((await request("GET", "/api/testlauf", { headers: TUNNEL })).status, 403);
  assert.equal((await postJson("/api/testlauf/entwurf", { tester: "x" }, TUNNEL)).status, 403);
  assert.equal((await upload("a.png", Buffer.alloc(10), TUNNEL)).status, 403);
  assert.equal((await postJson("/api/testlauf/ablegen", {}, TUNNEL)).status, 403);
  const evil = await request("POST", "/api/testlauf/ablegen", {
    headers: { "Content-Type": "text/plain", Origin: "https://boese.example", "Sec-Fetch-Site": "cross-site" }, body: "{}",
  });
  assert.equal(evil.status, 403);
  assert.ok(!fs.existsSync(path.join(dir, "testlaeufe")));
});

test("Checkliste kommt aus docs/TESTLAUF.md, Entwurf wird gespeichert", async () => {
  const first = await request("GET", "/api/testlauf");
  assert.equal(first.status, 200);
  const items = first.json.checklist.sections.flatMap((s) => s.items);
  assert.ok(items.length > 20);
  const saved = await postJson("/api/testlauf/entwurf", {
    tester: "Dave", geraet: "TV über Hotspot",
    answers: { [items[0].id]: { mark: "o" }, [items[1].id]: { mark: "x", note: "Fehlermeldung" } },
  });
  assert.equal(saved.status, 200);
  const again = await request("GET", "/api/testlauf");
  assert.equal(again.json.draft.geraet, "TV über Hotspot");
  assert.equal(again.json.draft.answers[items[1].id].note, "Fehlermeldung");
  assert.ok(fs.existsSync(path.join(dir, "testlaeufe", "_entwurf", "entwurf.json")));
});

test("Bild-Upload roh: 3 MB landet unverändert, falscher Typ 415, zu groß 413, Löschen", async () => {
  const big = Buffer.alloc(3 * 1024 * 1024);
  for (let i = 0; i < big.length; i += 1) big[i] = i % 251;
  const res = await upload("Screenshot 1.PNG", big);
  assert.equal(res.status, 200);
  assert.equal(res.json.size, big.length);
  const pic = await request("GET", `/api/testlauf/entwurf/bilder/${res.json.file}`);
  assert.equal(pic.status, 200);
  assert.equal(pic.headers["content-type"], "image/png");
  assert.ok(pic.buf.equals(big));
  assert.equal((await request("GET", `/api/testlauf/entwurf/bilder/${res.json.file}`, { headers: TUNNEL })).status, 403);

  assert.equal((await upload("virus.exe", Buffer.alloc(10))).status, 415);
  const tooBig = await request("POST", "/api/testlauf/bild?name=riesig.jpg", {
    headers: { "Content-Type": "application/octet-stream", "Content-Length": String(60 * 1024 * 1024), ...SAME },
  }).catch((err) => ({ status: 0, err }));
  assert.equal(tooBig.status, 413);

  const extra = await upload("weg.jpg", Buffer.alloc(100, 7));
  assert.equal((await request("DELETE", `/api/testlauf/bild/${extra.json.id}`, { headers: SAME })).status, 200);
  const draft = (await request("GET", "/api/testlauf")).json.draft;
  assert.deepEqual(draft.images.map((i) => i.name), ["Screenshot 1.PNG"]);
  assert.equal(fs.readdirSync(path.join(dir, "testlaeufe", "_entwurf", "bilder")).length, 1);

  const items = (await request("GET", "/api/testlauf")).json.checklist.sections[0].items;
  await postJson("/api/testlauf/entwurf", { images: [{ id: res.json.id, caption: "Konsole", itemId: items[1].id }] });
});

test("Alles ablegen: Ordner mit Bericht und Bildern, Liste und Ansicht", async () => {
  const res = await postJson("/api/testlauf/ablegen", {});
  assert.equal(res.status, 200);
  assert.match(res.json.name, /^\d{4}-\d\d-\d\d_\d\d-\d\d$/);
  assert.equal(res.json.folder, path.join(dir, "testlaeufe", res.json.name));
  assert.deepEqual(fs.readdirSync(res.json.folder).sort(), ["bericht.json", "bericht.md", "bilder"]);
  assert.deepEqual(fs.readdirSync(path.join(res.json.folder, "bilder")), ["01_screenshot-1.png"]);
  assert.equal(res.json.summary.fehler, 1);
  assert.equal(res.json.summary.ok, 1);

  const md = fs.readFileSync(path.join(res.json.folder, "bericht.md"), "utf8");
  assert.match(md, /- Tester: Dave/);
  assert.match(md, /- Ember-Version: \S+/);
  assert.match(md, /!\[Konsole\]\(bilder\/01_screenshot-1\.png\)/);

  const fresh = (await request("GET", "/api/testlauf")).json;
  assert.equal(fresh.draft.tester, "");
  assert.equal(fresh.draft.images.length, 0);
  assert.equal(fresh.runs.length, 1);
  assert.equal(fresh.runs[0].summary.fehler, 1);

  const view = await request("GET", `/api/testlauf/lauf/${res.json.name}`);
  assert.equal(view.status, 200);
  assert.equal(view.json.md, md);
  const pic = await request("GET", `/api/testlauf/lauf/${res.json.name}/bilder/01_screenshot-1.png`);
  assert.equal(pic.status, 200);
  assert.equal(pic.buf.length, 3 * 1024 * 1024);
  assert.equal((await request("GET", "/api/testlauf/lauf/..%2Fember.json")).status, 404);
  assert.equal((await request("GET", `/api/testlauf/lauf/${res.json.name}`, { headers: TUNNEL })).status, 403);

  const ls = (await request("GET", "/api/leitstelle")).json;
  assert.equal(ls.testlauf.name, res.json.name);
  assert.equal(ls.testlauf.fehler, 1);
});

test("Neuer Testlauf leert den Entwurf samt Bildern", async () => {
  await postJson("/api/testlauf/entwurf", { tester: "Mia" });
  await upload("a.png", Buffer.alloc(50, 1));
  const res = await postJson("/api/testlauf/neu", {});
  assert.equal(res.status, 200);
  assert.equal(res.json.tester, "");
  assert.ok(!fs.existsSync(path.join(dir, "testlaeufe", "_entwurf")));
});
