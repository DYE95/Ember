const fs = require("fs");
const path = require("path");
const { id, pin } = require("./ids");

// EMBER_DATA erlaubt einen anderen Datenordner (Tests, zweite Runde).
const ROOT = process.env.EMBER_DATA ? path.resolve(process.env.EMBER_DATA) : path.join(__dirname, "..", "data");
const FILE = path.join(ROOT, "ember.json");

function defaultFow() {
  return { on: false, radius: 16, persist: false, gmSeesAll: true, explored: [] };
}

function makeEncounter(name, map) {
  return {
    id: id("enc"),
    name: name || "Prepared Event",
    status: "ready",
    map: map || { image: "", tokens: [], fow: defaultFow() },
    traps: [],
    zones: [],
    alerts: [],
  };
}

function activeEncounter(session) {
  if (!session) return null;
  if (!session.encounters) session.encounters = [];
  if (!session.map) session.map = { image: "", tokens: [], fow: defaultFow() };
  if (!session.map.fow) session.map.fow = defaultFow();
  if (!session.encounters.length) {
    const enc = makeEncounter("", session.map);
    enc.hidden = true;
    session.encounters.push(enc);
    session.activeEncounterId = enc.id;
  }
  let enc = session.encounters.find((e) => e.id === session.activeEncounterId) || session.encounters[0];
  session.activeEncounterId = enc.id;
  if (!enc.map) enc.map = session.map;
  if (!enc.map.fow) enc.map.fow = defaultFow();
  enc.traps = enc.traps || [];
  enc.zones = enc.zones || [];
  enc.alerts = enc.alerts || [];
  session.map = enc.map;
  return enc;
}

function blankState() {
  return {
    version: 2,
    settings: {
      language: "de",
      houseName: "Ember",
      github: "",
      probesSeeded: true,
    },
    campaigns: [],
    profiles: [],
    characters: [],
    sessions: [],
    media: [],
    active: { campaignId: null, sessionId: null },
  };
}

function makeCampaign(name) {
  return {
    id: id("cmp"),
    name: name || "Neue Glut",
    frame: "",
    notes: "",
    gmFear: 0,
    fearMax: 12,
    createdAt: new Date().toISOString(),
  };
}

function makeCharacter(partial = {}) {
  return {
    id: id("pc"),
    campaignId: partial.campaignId || null,
    playerPin: pin(),
    name: partial.name || "Unbenannt",
    pronouns: partial.pronouns || "",
    ancestry: partial.ancestry || "",
    community: partial.community || "",
    class: partial.class || partial.klass || "",
    subclass: partial.subclass || "",
    level: partial.level || 1,
    traits: partial.traits || { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 },
    experiences: partial.experiences || [],
    hope: 2,
    hopeMax: 6,
    stressMarked: 0,
    stressMax: 6,
    hpMarked: 0,
    hpMax: 6,
    major: 7,
    severe: 14,
    evasion: 10,
    armorScore: 0,
    armorMarked: 0,
    proficiency: 1,
    portrait: partial.portrait || "",
    color: partial.color || "#e85d04",
    hopeFeature: "",
    features: [],
    weapons: [],
    armor: { name: "", thresholds: "", score: 0, feature: "" },
    notes: "",
    sheetPhotos: [],
    createdAt: new Date().toISOString(),
    ...partial,
    id: partial.id || id("pc"),
    playerPin: partial.playerPin || pin(),
  };
}

function makeSession(campaignId) {
  return {
    id: id("ses"),
    campaignId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    narrating: false,
    log: [{
      id: id("log"),
      at: new Date().toISOString(),
      kind: "system",
      author: "Ember",
      text: "Die Glut ist klein. Jemand muss sprechen, bevor die Umbra näherkommt.",
      meta: {},
    }],
    spotlightQueue: [],
    activeSpotlight: null,
    sceneClock: 0,
    map: { image: "", tokens: [], fow: defaultFow() },
    encounters: [],
    activeEncounterId: null,
  };
}

function migrate(state) {
  if (!state.settings) state.settings = {};
  if (!state.settings.houseName) state.settings.houseName = "Ember";
  if (state.settings.github == null) state.settings.github = "";
  if (!state.media) state.media = [];
  if (!state.active || typeof state.active !== "object") state.active = { campaignId: null, sessionId: null };
  if (!state.campaigns) state.campaigns = [];
  if (!state.profiles) state.profiles = [];
  if (!state.characters) state.characters = [];
  if (!state.sessions) state.sessions = [];
  for (const s of state.sessions || []) {
    activeEncounter(s);
    if (s.sceneClock == null) s.sceneClock = 0;
  }
  return state;
}

function ensure() {
  fs.mkdirSync(path.join(ROOT, "uploads"), { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify(blankState(), null, 2));
  }
}

// Einmal beim Start: letzte gute ember.json als ember.json.bak sichern.
// Nur wenn sie sich lesen laesst, damit eine kaputte Datei die Sicherung
// nicht ueberschreibt.
function backup() {
  try {
    if (!fs.existsSync(FILE)) return false;
    JSON.parse(fs.readFileSync(FILE, "utf8"));
    fs.copyFileSync(FILE, `${FILE}.bak`);
    return true;
  } catch {
    return false;
  }
}

function dedupeProbes(state) {
  const names = ["Die zweite Glut", "Asche über der Lichtung"];
  let changed = false;
  for (const name of names) {
    const hits = (state.campaigns || []).filter((c) => c.name === name);
    if (hits.length <= 1) continue;
    const keep = hits.slice().sort((a, b) => (b.probeRevision || 0) - (a.probeRevision || 0))[0];
    const drop = new Set(hits.filter((c) => c.id !== keep.id).map((c) => c.id));
    state.campaigns = state.campaigns.filter((c) => !drop.has(c.id));
    state.characters = (state.characters || []).filter((c) => !drop.has(c.campaignId));
    state.sessions = (state.sessions || []).filter((s) => !drop.has(s.campaignId));
    if (drop.has(state.active?.campaignId)) state.active.campaignId = keep.id;
    if ((state.sessions || []).every((s) => s.id !== state.active?.sessionId)) state.active.sessionId = null;
    changed = true;
  }
  return changed;
}

function publicView(state) {
  const copy = JSON.parse(JSON.stringify(state || {}));
  if (copy.settings) delete copy.settings.gmKey;
  for (const profile of copy.profiles || []) delete profile.pin;
  for (const session of copy.sessions || []) {
    session.journal = (session.journal || []).map((note) => (
      note.secret ? { id: note.id, secret: true, at: note.at } : note
    ));
    session.handouts = (session.handouts || []).map((note) => (
      note.toId ? { id: note.id, title: note.title, toId: note.toId, toName: note.toName, sealed: true, at: note.at } : note
    ));
    if (session.seats) delete session.seats;
    if (session.spur && session.spur.ask) {
      session.spur.ask = {
        question: session.spur.ask.question,
        options: (session.spur.ask.options || []).map((o) => ({ id: o.id, label: o.label })),
      };
    }
  }
  return copy;
}

function importProbe(state, seed, campaignName) {
  const revision = seed.revision || 1;
  const have = (state.campaigns || []).find((c) => c.name === campaignName);
  if (have && (have.probeRevision || 0) >= revision) return false;
  const oldId = have && have.id;
  state.campaigns = (state.campaigns || []).filter((c) => c.name !== campaignName);
  if (oldId) {
    state.characters = (state.characters || []).filter((c) => c.campaignId !== oldId);
    state.sessions = (state.sessions || []).filter((s) => s.campaignId !== oldId);
  }
  for (const c of seed.campaigns || []) {
    if (c.name === campaignName) c.probeRevision = revision;
  }
  state.campaigns.push(...(seed.campaigns || []));
  state.characters.push(...(seed.characters || []));
  state.sessions.push(...(seed.sessions || []));
  const live = (state.sessions || []).find((s) => s.id === state.active?.sessionId && !s.endedAt);
  const liveIsProbe = live && (seed.campaigns || []).some((c) => c.id === live.campaignId);
  if (!live || liveIsProbe) {
    if (seed.active) state.active = seed.active;
  }
  return true;
}

// ember.json laesst sich nicht lesen: kaputte Datei beiseitelegen und mit der
// Sicherung vom letzten Start weitermachen, statt bei jeder Anfrage zu scheitern.
function parseOrRecover() {
  const raw = fs.readFileSync(FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    let backup;
    try { backup = JSON.parse(fs.readFileSync(`${FILE}.bak`, "utf8")); } catch { throw err; }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    try { fs.copyFileSync(FILE, `${FILE}.kaputt-${stamp}`); } catch {}
    fs.writeFileSync(FILE, JSON.stringify(backup, null, 2));
    try { process.stderr.write(`\n  data/ember.json war kaputt, Stand aus ember.json.bak geladen (kaputte Datei: ember.json.kaputt-${stamp}).\n`); } catch {}
    return backup;
  }
}

function read() {
  ensure();
  const state = migrate(parseOrRecover());
  let dirty = false;
  if (!state.settings.probesDeduped) {
    if (dedupeProbes(state)) dirty = true;
    state.settings.probesDeduped = true;
    dirty = true;
  }
  if (!state.settings.probesSeeded) {
    state.settings.probesSeeded = true;
    dirty = true;
  }
  if (dirty) write(state);
  return state;
}

function write(state) {
  fs.mkdirSync(ROOT, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, FILE);
}

function patchById(list, itemId, patch) {
  const i = list.findIndex((x) => x.id === itemId);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id: list[i].id };
  return list[i];
}

module.exports = {
  read, write, makeCampaign, makeCharacter, makeSession,
  makeEncounter, activeEncounter, defaultFow, patchById, importProbe, dedupeProbes, publicView, backup, ROOT, FILE,
};
