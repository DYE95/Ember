// Testlauf: fehlender Legion-Webhook ist nicht zu übersehen und führt
// mit einem Klick zum Kasten „Legion-Verbindung“.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const js = fs.readFileSync(path.join(ROOT, "public", "js", "testlauf.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public", "testlauf.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public", "css", "testlauf.css"), "utf8");

test("Ergebnis ohne Webhook: Warnkasten mit Sprung-Knopf zur Legion-Verbindung", () => {
  const branch = js.slice(js.indexOf("if (!out.webhook.configured)"), js.indexOf("} else if (out.webhook.ok)"));
  assert.match(branch, /class="tl-alert" role="alert"/);
  assert.match(branch, /href="#legionCard" data-goto-legion/);
  assert.match(branch, /Legion-Verbindung einrichten/);
  assert.match(js, /"alert"/, "Ergebnis-Kasten bekommt eigene Alarm-Klasse");
});

test("Sprungziel und Feld existieren, Sprung schliesst Ansicht und fokussiert", () => {
  assert.match(html, /<section class="tl-card" id="legionCard">/);
  assert.match(html, /id="legionUrl"/);
  const fn = js.slice(js.indexOf("function gotoLegion()"), js.indexOf("function showLegion("));
  assert.match(fn, /\$\("viewer"\)\.hidden = true/);
  assert.match(fn, /scrollIntoView/);
  assert.match(fn, /\$\("legionUrl"\)\.focus/);
  assert.match(fn, /tl-flash/);
  assert.match(js, /closest\("\[data-goto-legion\]"\)/);
});

test("schon vor dem Hochladen: Hinweis beim Abschliessen, wenn Webhook fehlt", () => {
  assert.match(html, /id="legionMissing" hidden[^>]*>[^<]*<a href="#legionCard" data-goto-legion>/);
  const fn = js.slice(js.indexOf("function showLegion("), js.indexOf("async function loadLegion"));
  assert.match(fn, /tl-missing/);
  assert.match(fn, /legionMissing/);
});

test("Stile vorhanden, Cache-Versionen hochgezählt", () => {
  for (const sel of [".tl-alert", ".tl-upload.alert", "#legionCard.tl-flash", "#legionCard.tl-missing"]) {
    assert.ok(css.includes(sel), sel);
  }
  assert.match(html, /testlauf\.css\?v=([4-9]|\d\d+)"/); // mindestens 4
  assert.match(html, /testlauf\.js\?v=([4-9]|\d\d+)"/); // mindestens 4
});
