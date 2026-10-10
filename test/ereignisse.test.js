// Ereignis-Seiten sind auffindbar: Kachel auf der Startseite, Eingang in /ember,
// Übersicht /ereignisse mit allen fünf Spielen.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const PAGES = ["/runner", "/fallwerk", "/pastellpfad", "/scharfschuss", "/puls"];

test("Startseite: Kachel Ereignisse mit eigenem Platz", () => {
  const js = read("public/js/home-desk.js");
  assert.match(js, /\{ id: "ereignisse", title: "Ereignisse",[^}]*href: "\/ereignisse" \}/);
  assert.match(js, /ereignisse: \{ x: \d+, y: \d+ \}/);
  assert.match(read("public/home.html"), /home-desk\.js\?v=(19|2\d)/);
});

test("/ember: Eingang im Startmenü und Link beim Ereignis in der Session", () => {
  const html = read("public/index.html");
  assert.match(html, /<a class="start-item" href="\/ereignisse">/);
  assert.match(html, /href="\/ereignisse" target="_blank"/);
});

test("ereignisse.html verlinkt alle fünf Spiele", () => {
  const html = read("public/ereignisse.html");
  for (const p of PAGES) assert.match(html, new RegExp(`href="${p}"`), p);
  assert.match(html, /href="\/"/);
});

function get(port, url) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: url }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); }).on("error", reject);
  });
}

test("Server liefert /ereignisse und alle Ereignis-Seiten", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-ev-"));
  const port = 39000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, EMBER_DATA: dir, EMBER_PORT: String(port), EMBER_HOST: "127.0.0.1" }, stdio: "ignore",
  });
  try {
    let up = false;
    for (let i = 0; i < 100 && !up; i += 1) {
      try { up = (await get(port, "/ereignisse")) === 200; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(up);
    for (const p of PAGES) assert.equal(await get(port, p), 200, p);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
