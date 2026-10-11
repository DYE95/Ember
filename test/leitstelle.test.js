const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ls = require("../lib/leitstelle");

test("letzter Absturz aus crash.log", () => {
  const text = "2026-10-01T10:00:00.000Z uncaughtException\nError: alt\n    at x\n\n"
    + "2026-10-09T21:30:05.123Z unhandledRejection\nTypeError: neu kaputt\n    at y\n\n";
  assert.deepEqual(ls.parseCrash(text), { at: "2026-10-09T21:30:05.123Z", kind: "unhandledRejection", message: "TypeError: neu kaputt" });
  assert.equal(ls.parseCrash(""), null);
});

test("CHANGELOG.md wird gelesen", () => {
  const notes = ls.parseChangelog("# Änderungen\n\n## Unveröffentlicht\n- Neu\n\n## 2026-10-10\n- Solo-Spiel (#27)\n* Startseite (#26)\n");
  assert.deepEqual(notes.map((n) => [n.section, n.subject]), [["Unveröffentlicht", "Neu"], ["2026-10-10", "Solo-Spiel (#27)"], ["2026-10-10", "Startseite (#26)"]]);
});

test("ohne git: Version und Notizen aus CHANGELOG.md", () => {
  // Fixture statt echter Datei: neue Einträge im echten CHANGELOG dürfen den Test nicht brechen.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-cl-"));
  try {
    const neu = Array.from({ length: 12 }, (_, i) => `- Neu ${12 - i}`).join("\n");
    fs.writeFileSync(path.join(dir, "CHANGELOG.md"), `# Änderungen\n\n## Unveröffentlicht\n${neu}\n\n## 2026-10-10\n- Solo-Spiel (#27)\n\n## 2026-10-01\n- Alt\n`);
    const v = ls.version({ noGit: true, fresh: true, root: dir });
    assert.equal(v.source, "changelog");
    assert.equal(v.version, "2026-10-10");
    assert.equal(v.notes.length, 10);
    assert.equal(v.notes[0].subject, "Neu 12");
    assert.equal(v.notes[0].section, "Unveröffentlicht");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // Echte Datei: der neueste Eintrag steht vorne.
  const real = ls.version({ noGit: true, fresh: true });
  const first = ls.parseChangelog(fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md"), "utf8"))[0];
  assert.equal(real.source, "changelog");
  assert.deepEqual(real.notes[0], first);
});

test("mit git: Kurz-SHA und Commit-Titel", () => {
  const v = ls.version({ fresh: true });
  if (v.source !== "git") return; // ZIP ohne .git
  assert.match(v.sha, /^[0-9a-f]{7,}$/);
  assert.ok(v.notes.length > 0 && v.notes.length <= 10);
});

test("Status: Tunnel, Leute, Daten, Adressen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-ls-"));
  try {
    fs.writeFileSync(path.join(dir, "ember.json"), "{}");
    fs.writeFileSync(path.join(dir, "ember.json.bak"), "{}");
    fs.writeFileSync(path.join(dir, "public-url.txt"), "https://abc.trycloudflare.com");
    const s = ls.status({
      dataDir: dir, startedAt: Date.now() - 65000, port: 3478,
      presence: [{ role: "gm", name: "SL" }, { role: "player", name: "Mia" }],
      lan: [{ name: "WLAN", address: "192.168.0.5" }], remote: "https://abc.trycloudflare.com",
    });
    assert.ok(s.server.uptimeSec >= 64);
    assert.equal(s.tunnel.up, true);
    assert.ok(s.tunnel.ageSec >= 0);
    assert.deepEqual([s.people.players, s.people.gm], [1, 1]);
    assert.equal(s.data.size, 2);
    assert.ok(s.data.backupAt);
    assert.equal(s.crash, null);
    assert.equal(s.urls.player, "https://abc.trycloudflare.com/player");
    assert.equal(s.urls.lan, "http://192.168.0.5:3478/player");
    assert.equal(s.urls.gm, "http://127.0.0.1:3478/ember");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
