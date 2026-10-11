// Start aus start.bat: Titel Cloud ON/OFF, Tunnel-Zustand, Browser nur einmal.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const s = require("../lib/startablauf");
const glut = require("../lib/glut");

const feed = (lines) => lines.reduce((st, l) => s.tunnelStep(st, l), s.tunnelStart());
const URL_LINE = "INF |  https://glut-ember-test.trycloudflare.com                              |";

test("Titel heisst genau Cloud ON oder Cloud OFF", () => {
  assert.equal(s.cloudTitle(true), "DYE.TV - Cloud ON");
  assert.equal(s.cloudTitle(false), "DYE.TV - Cloud OFF");
});

test("tunnelLive liest data/public-url.txt, leer oder fehlend heisst OFF", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-cloud-"));
  try {
    assert.equal(s.tunnelLive(dir), false);
    fs.writeFileSync(path.join(dir, "public-url.txt"), "\n");
    assert.equal(s.tunnelLive(dir), false);
    fs.writeFileSync(path.join(dir, "public-url.txt"), "https://x.trycloudflare.com\n");
    assert.equal(s.tunnelLive(dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Tunnel: OFF bis die Adresse kommt, dann ON", () => {
  assert.equal(feed(["INF Requesting new quick Tunnel on trycloudflare.com..."]).live, false);
  const st = feed(["INF Requesting new quick Tunnel on trycloudflare.com...", URL_LINE]);
  assert.equal(st.live, true);
  assert.equal(st.url, "https://glut-ember-test.trycloudflare.com");
});

test("Tunnel offline: Fehler mit api.trycloudflare.com macht nicht ON", () => {
  const st = feed(['ERR Error requesting new tunnel error="Post \\"https://api.trycloudflare.com/tunnel\\": dial tcp: lookup api.trycloudflare.com: no such host"']);
  assert.equal(st.live, false);
  assert.equal(st.url, "");
});

test("Tunnel: alle Verbindungen weg heisst OFF, eine zurueck heisst wieder ON", () => {
  let st = feed([URL_LINE, "INF Registered tunnel connection connIndex=0 location=fra", "INF Registered tunnel connection connIndex=1 location=ams"]);
  assert.equal(st.live, true);
  st = s.tunnelStep(st, 'ERR Connection terminated error="no network" connIndex=0');
  assert.equal(st.live, true, "eine Verbindung steht noch");
  st = s.tunnelStep(st, "INF Unregistered tunnel connection connIndex=1");
  assert.equal(st.live, false);
  st = s.tunnelStep(st, "INF Registered tunnel connection connIndex=0 location=fra");
  assert.equal(st.live, true);
  assert.equal(s.tunnelEnd(st).live, false, "cloudflared beendet heisst OFF");
});

test("startPlan: nur der frische Lauf aus start.bat animiert und oeffnet den Browser", () => {
  assert.deepEqual(s.startPlan({}, true), { anim: false, browser: false }, "npm start und Neustart nach Exit 42");
  assert.deepEqual(s.startPlan({ DYE_FRISCHER_START: "1" }, true), { anim: true, browser: true });
  assert.deepEqual(s.startPlan({ DYE_FRISCHER_START: "1" }, false), { anim: false, browser: true }, "ohne Konsole keine Animation");
  assert.deepEqual(s.startPlan({ DYE_FRISCHER_START: "1", DYE_NO_ANIM: "1" }, true), { anim: false, browser: true });
  assert.deepEqual(s.startPlan({ DYE_FRISCHER_START: "1", DYE_NO_BROWSER: "1" }, true), { anim: true, browser: false });
});

test("openOnce oeffnet hoechstens einmal", () => {
  const calls = [];
  const open = s.openOnce((url) => calls.push(url));
  assert.equal(open("http://127.0.0.1:3478/"), true);
  assert.equal(open("http://127.0.0.1:3478/"), false);
  assert.deepEqual(calls, ["http://127.0.0.1:3478/"]);
});

test("Browser-Befehl: Windows nimmt cmd start mit leerem Titel", () => {
  const win = s.browserCommand("http://127.0.0.1:3478/", "win32");
  assert.equal(win.cmd, "cmd");
  assert.equal(win.args.at(-1), 'start "" "http://127.0.0.1:3478/"');
  assert.equal(win.verbatim, true);
  assert.equal(s.browserCommand("http://x/", "linux").cmd, "xdg-open");
});

test("Glut-Animation: jedes Bild hat feste Hoehe und nur ASCII", () => {
  const sparks = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const t of [0, 0.3, 0.7, 1]) {
    const lines = glut.frame(t, sparks, rnd);
    assert.equal(lines.length, glut.HEIGHT);
    const plain = lines.slice(0, -1).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    assert.match(plain, /^[\x20-\x7e\n]*$/);
  }
});
