const test = require("node:test");
const assert = require("node:assert/strict");
const spur = require("../lib/spur");
const store = require("../lib/store");

test("capScore deckelt Fremdzahlen", () => {
  assert.equal(spur.capScore("pastell", 40), 8);
  assert.equal(spur.capScore("fallwerk", 999), 64);
  assert.equal(spur.capScore("puls", 9), 1);
  assert.equal(spur.capScore("runner", -4), 0);
});

test("grade zählt nur die richtige Stimme", () => {
  const ask = { options: [{ id: "a", label: "Asche", right: true }, { id: "b", label: "Gold", right: false }] };
  assert.equal(spur.grade(ask, "a").score, 1);
  assert.equal(spur.grade(ask, "b").score, 0);
  assert.equal(spur.grade(ask, "").label, "keine Stimme");
});

test("settle zahlt Hope an den Besten und schließt das Ereignis", () => {
  const state = {
    campaigns: [{ id: "c", gmFear: 0, fearMax: 12 }],
    characters: [
      { id: "a", campaignId: "c", name: "Lykos", hope: 2, hopeMax: 6 },
      { id: "b", campaignId: "c", name: "Neris", hope: 2, hopeMax: 6 },
    ],
  };
  const session = {
    campaignId: "c",
    spur: { title: "Parcours", payout: "hope", endsAt: Date.now() - 1000, scores: [{ characterId: "a", name: "Lykos", score: "9" }, { characterId: "b", name: "Neris", score: "4" }] },
  };
  const line = spur.settle(state, session);
  assert.match(line, /Hope an Lykos/);
  assert.equal(state.characters[0].hope, 3);
  assert.equal(state.characters[1].hope, 2);
  assert.equal(session.spur, null);
});

test("adressiertes Handout ist im öffentlichen Blick versiegelt", () => {
  const view = store.publicView({
    settings: {},
    sessions: [{ handouts: [{ id: "h", title: "Seite", text: "nur Ivo", toId: "ivo", toName: "Ivo" }] }],
  });
  assert.equal(view.sessions[0].handouts[0].sealed, true);
  assert.equal(view.sessions[0].handouts[0].text, undefined);
});

test("defaultFow hat alle Felder und ist aus", () => {
  const fow = store.defaultFow();
  assert.deepEqual(Object.keys(fow).sort(), ["explored", "gmSeesAll", "on", "persist", "radius"]);
  assert.equal(fow.on, false);
  assert.equal(fow.persist, false);
});

test("patchById überschreibt nur gegebene Felder und behält die id", () => {
  const list = [{ id: "a", name: "Alt", notes: "bleibt" }];
  const patched = store.patchById(list, "a", { name: "Neu", extra: 1 });
  assert.equal(patched.name, "Neu");
  assert.equal(patched.notes, "bleibt");
  assert.equal(patched.id, "a");
  assert.equal(list.length, 1);
  assert.equal(store.patchById(list, "b", { name: "X" }), null);
});

test("makeEncounter startet bereit mit leeren Fallen und Zonen", () => {
  const enc = store.makeEncounter("Test", { image: "", tokens: [] });
  assert.equal(enc.status, "ready");
  assert.deepEqual(enc.traps, []);
  assert.deepEqual(enc.zones, []);
  assert.deepEqual(enc.alerts, []);
});

test("importProbe legt eine Probe nur einmal an und klaut keine offene Session", () => {
  const seed = {
    revision: 4,
    campaigns: [{ id: "cmp_probe", name: "Asche über der Lichtung" }],
    characters: [{ id: "pc_probe", campaignId: "cmp_probe", name: "Mira" }],
    sessions: [{ id: "ses_probe", campaignId: "cmp_probe" }],
    active: { campaignId: "cmp_probe", sessionId: "ses_probe" },
  };
  const state = {
    campaigns: [{ id: "cmp_live", name: "Weg zum Olymp" }],
    characters: [],
    sessions: [{ id: "ses_live", campaignId: "cmp_live", endedAt: null }],
    active: { campaignId: "cmp_live", sessionId: "ses_live" },
  };
  assert.equal(store.importProbe(state, seed, "Asche über der Lichtung"), true);
  assert.equal(store.importProbe(state, seed, "Asche über der Lichtung"), false);
  assert.equal(state.campaigns.filter((c) => c.name === "Asche über der Lichtung").length, 1);
  assert.equal(state.active.sessionId, "ses_live");
  assert.equal(state.campaigns.find((c) => c.name === "Asche über der Lichtung").probeRevision, 4);
});

test("publicView streicht Schlüssel und geheimen Text", () => {
  const view = store.publicView({
    settings: { gmKey: "geheim", houseName: "Ember" },
    sessions: [{ journal: [{ id: "n1", title: "Wahrheit", text: "leer", secret: true }, { id: "n2", title: "Offen", text: "sichtbar" }] }],
  });
  assert.equal(view.settings.gmKey, undefined);
  assert.equal(view.settings.houseName, "Ember");
  assert.equal(view.sessions[0].journal[0].text, undefined);
  assert.equal(view.sessions[0].journal[0].secret, true);
  assert.equal(view.sessions[0].journal[1].text, "sichtbar");
});

test("dedupeProbes behält eine Probe und wirft Kopien weg", () => {
  const state = {
    campaigns: [
      { id: "a", name: "Die zweite Glut", probeRevision: 1 },
      { id: "b", name: "Die zweite Glut", probeRevision: 2 },
      { id: "live", name: "Weg zum Olymp" },
    ],
    characters: [{ id: "pc", campaignId: "a" }, { id: "keep", campaignId: "b" }],
    sessions: [{ id: "s", campaignId: "a" }],
    active: { campaignId: "a", sessionId: "s" },
  };
  assert.equal(store.dedupeProbes(state), true);
  assert.equal(state.campaigns.filter((c) => c.name === "Die zweite Glut").length, 1);
  assert.equal(state.campaigns.find((c) => c.name === "Die zweite Glut").id, "b");
  assert.equal(state.characters.length, 1);
  assert.equal(state.active.campaignId, "b");
});

test("makeCharacter setzt Standardwerte und eine vierstellige PIN", () => {
  const c = store.makeCharacter({ name: "Sable", campaignId: "camp1" });
  assert.equal(c.name, "Sable");
  assert.equal(c.campaignId, "camp1");
  assert.equal(c.hope, 2);
  assert.equal(c.hopeMax, 6);
  assert.match(c.playerPin, /^\d{4}$/);
});

test("kaputte ember.json: Stand kommt aus ember.json.bak, kaputte Datei bleibt liegen", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const { execFileSync } = require("child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-kaputt-"));
  try {
    fs.writeFileSync(path.join(dir, "ember.json.bak"), JSON.stringify({ settings: { houseName: "Gerettet" }, campaigns: [], characters: [], sessions: [] }));
    fs.writeFileSync(path.join(dir, "ember.json"), "{ halb");
    const out = execFileSync(process.execPath, ["-e", "process.stdout.write(require('./lib/store').read().settings.houseName)"], {
      cwd: path.join(__dirname, ".."), env: { ...process.env, EMBER_DATA: dir }, stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    assert.equal(out, "Gerettet");
    assert.ok(fs.readdirSync(dir).some((f) => f.startsWith("ember.json.kaputt-")));
    JSON.parse(fs.readFileSync(path.join(dir, "ember.json"), "utf8"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Solo-Spielstand mit stats: null stuerzt nicht ab", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const soloGame = require("../lib/solo-game");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-solo-"));
  try {
    fs.writeFileSync(path.join(dir, "solo.json"), JSON.stringify({ profile: null, run: null, stats: null }));
    assert.deepEqual(soloGame.load(dir).stats, { wins: 0, losses: 0, runs: 0 });
    fs.writeFileSync(path.join(dir, "solo.json"), "null");
    assert.deepEqual(soloGame.load(dir).stats, { wins: 0, losses: 0, runs: 0 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
