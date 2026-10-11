// Testlauf: Parser fuer docs/TESTLAUF.md, Bericht und Ablage-Ordner.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const tl = require("../lib/testlauf");

const SAMPLE = [
  "# Testlauf-Checkliste",
  "",
  "Zum Ausdrucken.",
  "",
  "## Vorbereitung",
  "",
  "- [ ] `node -v` zeigt eine LTS-Version: ______",
  "- [x] git pull",
  "  * [ ] eingerückt mit Stern",
  "- kein Kästchen, kein Punkt",
  "",
  "## Leer",
  "",
  "Nur Text.",
  "",
  "## Störfälle",
  "- [ ] Server neu starten",
  "",
  "## Notizen",
  "",
  "| Seite | Ergebnis |",
  "|-------|----------|",
  "- [ ] gehört nicht dazu",
].join("\n");

test("Parser: Abschnitte, Punkte, Notizen bleiben draußen", () => {
  const list = tl.parseChecklist(SAMPLE);
  assert.equal(list.title, "Testlauf-Checkliste");
  assert.deepEqual(list.sections.map((s) => s.title), ["Vorbereitung", "Störfälle"]);
  assert.deepEqual(list.sections[0].items.map((i) => i.text), ["`node -v` zeigt eine LTS-Version: ______", "git pull", "eingerückt mit Stern"]);
  assert.equal(list.sections[1].id, "stoerfaelle");
  assert.equal(list.notesTitle, "Notizen");
  const ids = list.sections.flatMap((s) => s.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[a-z0-9-]+$/.test(id)));
});

test("Parser: IDs hängen am Text, nicht an der Reihenfolge; Dubletten bekommen -2", () => {
  const a = tl.parseChecklist("## A\n- [ ] eins\n- [ ] zwei\n");
  const b = tl.parseChecklist("## A\n- [ ] zwei\n- [ ] neu\n- [ ] eins\n");
  assert.equal(a.sections[0].items[0].id, b.sections[0].items[2].id);
  const d = tl.parseChecklist("## A\n- [ ] gleich\n- [ ] gleich\r\n");
  assert.equal(d.sections[0].items[1].id, `${d.sections[0].items[0].id}-2`);
});

test("echte docs/TESTLAUF.md lässt sich lesen", () => {
  const list = tl.loadChecklist(path.join(__dirname, "..", "docs", "TESTLAUF.md"));
  assert.ok(list.sections.length >= 5);
  assert.ok(list.sections.every((s) => s.items.length));
  assert.ok(!list.sections.some((s) => /notizen/i.test(s.title)));
});

test("Bildnamen und Endungen", () => {
  assert.equal(tl.safeName("Größe Übersicht (1).JPG"), "groesse-uebersicht-1");
  assert.equal(tl.safeName("../../böse.png"), "boese");
  assert.equal(tl.safeName("....png"), "bild");
  assert.equal(tl.imageExt("a.JPEG"), "jpg");
  assert.equal(tl.imageExt("foto", "image/png"), "png");
  assert.equal(tl.imageExt("x.exe", "application/octet-stream"), "");
});

test("Entwurf, Bild, Ablegen: Ordner mit bericht.md, bericht.json und bilder/", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-tl-"));
  try {
    const list = tl.parseChecklist(SAMPLE);
    const [a, b, c] = list.sections[0].items;
    const d = list.sections[1].items[0];
    tl.saveDraft(dir, {
      tester: "Dave\nzweite Zeile", geraet: "TV über Hotspot", notizen: "Alles ruhig.",
      answers: { [a.id]: { mark: "o", note: "v20.19" }, [b.id]: { mark: "x", note: "Konflikt" }, [c.id]: { mark: "eigen", note: "anders" }, [d.id]: { mark: "kaputt" }, "BÖSE ID": { mark: "o" } },
    });
    const draft = tl.readDraft(dir);
    assert.equal(draft.tester, "Dave zweite Zeile");
    assert.equal(Object.keys(draft.answers).length, 3);

    const fake = (buf, name) => Object.assign(Readable.from([buf]), { headers: { "content-length": String(buf.length) }, complete: true });
    const img = await tl.addImage(dir, fake(Buffer.alloc(1000, 1)), { name: "Fehler Bild.png" });
    await tl.addImage(dir, fake(Buffer.alloc(10, 2)), { name: "zweites.jpg" });
    await assert.rejects(tl.addImage(dir, fake(Buffer.alloc(10)), { name: "x.exe" }), { status: 415 });
    await assert.rejects(tl.addImage(dir, fake(Buffer.alloc(2048)), { name: "gross.png", limit: 1024 }), { status: 413 });
    tl.saveDraft(dir, { images: [{ id: img.id, caption: "Konsole rot", itemId: b.id }] });

    const now = new Date(2026, 9, 10, 11, 5);
    const out = tl.finalize(dir, { list, version: { version: "v0.5.0", source: "git" }, now });
    assert.equal(out.name, "2026-10-10_11-05");
    assert.equal(out.folder, path.join(dir, "testlaeufe", "2026-10-10_11-05"));
    assert.deepEqual(fs.readdirSync(out.folder).sort(), ["bericht.json", "bericht.md", "bilder"]);
    assert.deepEqual(fs.readdirSync(path.join(out.folder, "bilder")).sort(), ["01_fehler-bild.png", "02_zweites.jpg"]);
    assert.equal(fs.statSync(path.join(out.folder, "bilder", "01_fehler-bild.png")).size, 1000);

    const json = JSON.parse(fs.readFileSync(path.join(out.folder, "bericht.json"), "utf8"));
    assert.deepEqual(json.summary, { total: 4, done: 3, ok: 1, fehler: 1, eigen: 1, offen: 1, ms: 0, timed: 0 });
    assert.equal(json.images[0].itemText, "git pull");
    assert.equal(json.version.version, "v0.5.0");

    const md = fs.readFileSync(path.join(out.folder, "bericht.md"), "utf8");
    assert.match(md, /^# Testlauf 10\.10\.2026, 11:05 Uhr/);
    assert.match(md, /- Gerät: TV über Hotspot/);
    assert.match(md, /- Ember-Version: v0\.5\.0 \(git\)/);
    assert.match(md, /3 von 4 erledigt, 1 offen/);
    assert.match(md, /## Fehler auf einen Blick\n\n- Vorbereitung: git pull — Konflikt/);
    assert.match(md, /- \[O\] `node -v` zeigt eine LTS-Version: ______ — Notiz: v20\.19/);
    assert.match(md, /- \[Eigen\] eingerückt mit Stern — Notiz: anders/);
    assert.match(md, /- \[ \] Server neu starten/);
    assert.match(md, /!\[Konsole rot\]\(bilder\/01_fehler-bild\.png\)/);
    assert.match(md, /- Zu: git pull/);
    assert.match(md, /## Notizen\n\nAlles ruhig\./);

    // Entwurf ist weg, zweiter Lauf in derselben Minute bekommt _2
    assert.equal(tl.readDraft(dir).images.length, 0);
    assert.ok(!fs.existsSync(path.join(dir, "testlaeufe", "_entwurf")));
    assert.equal(tl.finalize(dir, { list, version: null, now }).name, "2026-10-10_11-05_2");
    const runs = tl.listRuns(dir);
    assert.equal(runs.length, 2);
    assert.deepEqual(tl.lastRun(dir).fehler, 0);
    assert.equal(tl.readRun(dir, "2026-10-10_11-05").json.tester, "Dave zweite Zeile");
    assert.equal(tl.readRun(dir, "../ember"), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Testlauf 2026-10-10: „Bemesse trotzdem Timer pro Checklisten-Punkt.“
test("Zeit pro Punkt: Entwurf hält ms, Bericht zeigt mm:ss, Abschnitt und Summe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-tl-zeit-"));
  try {
    assert.equal(tl.duration(0), "00:00");
    assert.equal(tl.duration(75000), "01:15");
    assert.equal(tl.duration(3725000), "1:02:05");
    const list = tl.parseChecklist(SAMPLE);
    const [a, b, c] = list.sections[0].items;
    const d = list.sections[1].items[0];
    tl.saveDraft(dir, { answers: {
      [a.id]: { mark: "o", ms: 75400 },
      [b.id]: { mark: "x", note: "Konflikt", ms: 30000 },
      [c.id]: { mark: "", ms: 5000 }, // läuft noch, kein Ergebnis: Zeit bleibt trotzdem
      [d.id]: { mark: "o", ms: -5 },
    } });
    const draft = tl.readDraft(dir);
    assert.equal(draft.answers[a.id].ms, 75400);
    assert.equal(draft.answers[c.id].ms, 5000);
    assert.equal(draft.answers[d.id].ms, undefined, "negative Zeit fliegt raus");
    tl.saveDraft(dir, { answers: { ...draft.answers, [a.id]: { mark: "o", ms: 1e12 } } });
    assert.equal(tl.readDraft(dir).answers[a.id].ms, 24 * 60 * 60 * 1000, "höchstens 24 h");
    tl.saveDraft(dir, { answers: { ...draft.answers } });

    const out = tl.finalize(dir, { list, version: null, now: new Date(2026, 9, 10, 14, 43) });
    const json = JSON.parse(fs.readFileSync(path.join(out.folder, "bericht.json"), "utf8"));
    assert.equal(json.summary.ms, 110400);
    assert.equal(json.summary.timed, 3);
    assert.equal(json.sections[0].ms, 110400);
    assert.equal(json.sections[0].items[0].zeit, "01:15");
    assert.equal(json.sections[1].items[0].ms, 0);
    const md = fs.readFileSync(path.join(out.folder, "bericht.md"), "utf8");
    assert.match(md, /- Zeit gemessen: 01:50 \(an 3 von 4 Punkten\)/);
    assert.match(md, /## Vorbereitung \(01:50\)/);
    assert.match(md, /- \[O\] `node -v` zeigt eine LTS-Version: ______ · ⏱ 01:15\n/);
    assert.match(md, /- \[X\] git pull · ⏱ 00:30 — Notiz: Konflikt/);
    assert.match(md, /- \[O\] Server neu starten[^\n⏱]*\n/, "ohne Zeit kein ⏱");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Seite: Uhr-Knopf je Punkt, Gesamtzeit oben, Zeit geht mit in den Entwurf", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "js", "testlauf.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "testlauf.html"), "utf8");
  assert.match(js, /class="tl-timer" data-timer/);
  assert.match(js, /answers: liveAnswers\(\)/, "laufende Zeit wird mitgespeichert");
  assert.match(js, /stopTimer\(\);\n\s*await saveNow\(\);/, "vor dem Ablegen wird die Uhr gestoppt");
  assert.match(html, /id="timeTotal"/);
  assert.match(html, /testlauf\.js\?v=\d+/);
});

// DEBUG_Run-Tor (lib/debug-run.js) hat eine eigene Datei. Sie laeuft hier mit,
// damit package.json frei bleibt (offener PR #37 aendert dieselbe Zeile).
require("./debug-run.test");
