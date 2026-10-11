// lib/solo-game.js — Spielstand und API fuer das Solo-Spiel auf /solo.
// Der Stand liegt in data/solo.json (eigene Datei, nicht in ember.json),
// damit er Neuladen, Server-Neustart und wechselnde Tunnel-Adressen uebersteht.
const fs = require("fs");
const path = require("path");
const dungeon = require("./dungeon");
const catalog = require("./catalog");

function blank() {
  return { profile: null, run: null, stats: { wins: 0, losses: 0, runs: 0 }, pendingLevel: false };
}

function load(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "solo.json"), "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return blank();
    const data = { ...blank(), ...raw };
    // Halb kaputte Datei (z. B. "stats": null): Zaehler nicht abstuerzen lassen.
    const stats = data.stats && typeof data.stats === "object" ? data.stats : {};
    data.stats = { wins: Number(stats.wins) || 0, losses: Number(stats.losses) || 0, runs: Number(stats.runs) || 0 };
    return data;
  } catch {
    return blank();
  }
}

function save(dir, data) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "solo.json");
  const tmp = `${file}.tmp`;
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

// Waehlbare Helden: die fuenf Quickstart-Boegen und alle Boegen der Kampagne.
function heroChoices(characters) {
  const pre = catalog.sablewoodPregens().map((c, i) => ({
    key: `cat:${i}`, from: "Quickstart", name: c.name, class: c.class, ancestry: c.ancestry, level: c.level || 1, color: c.color,
  }));
  const own = (characters || []).map((c) => ({
    key: `pc:${c.id}`, from: "Kampagne", name: c.name, class: c.class || "", ancestry: c.ancestry || "", level: c.level || 1, color: c.color,
  }));
  return own.concat(pre);
}

function sheetFor(key, characters) {
  const [kind, ref] = String(key || "").split(":");
  if (kind === "cat") return catalog.sablewoodPregens()[Number(ref)] || null;
  if (kind === "pc") return (characters || []).find((c) => c.id === ref) || null;
  return null;
}

function payload(data, characters, extra = {}) {
  return {
    save: data,
    actions: dungeon.actions(data.run),
    heroes: heroChoices(characters),
    meta: { items: dungeon.ITEMS, restMoves: dungeon.REST_MOVES, levelPicks: dungeon.LEVEL_PICKS, traits: dungeon.TRAITS, dungeons: dungeon.dungeonList() },
    ...extra,
  };
}

// Dungeon aus dem Body; Unbekanntes faellt auf den letzten oder den ersten zurueck.
function pickDungeon(body, last) {
  const want = body && typeof body.dungeon === "string" ? body.dungeon : "";
  const known = (id) => Object.prototype.hasOwnProperty.call(dungeon.DUNGEONS, id);
  if (known(want)) return want;
  return known(last) ? last : dungeon.DEFAULT_DUNGEON;
}

// Liefert { status, body } oder null, wenn die Route nicht passt.
function route(method, p, body, ctx) {
  const dir = ctx.dir;
  const characters = ctx.characters || [];
  const rng = ctx.rng;
  const data = load(dir);
  const ok = (extra) => ({ status: 200, body: payload(data, characters, extra) });
  const fail = (status, error) => ({ status, body: { error } });

  if (method === "GET" && p === "/api/solo/game") return ok();

  if (method === "POST" && p === "/api/solo/game/new") {
    const sheet = sheetFor(body.hero, characters);
    if (!sheet) return fail(400, "Diesen Helden gibt es nicht.");
    const fresh = blank();
    fresh.profile = dungeon.heroFromSheet(sheet);
    fresh.run = dungeon.newRun(fresh.profile, rng, pickDungeon(body));
    fresh.stats.runs = 1;
    Object.assign(data, fresh);
    save(dir, data);
    return ok();
  }

  if (method === "POST" && p === "/api/solo/game/run") {
    if (!data.profile) return fail(400, "Erst einen Helden wählen.");
    if (data.pendingLevel) return fail(409, "Erst das Level-Up nach dem Sieg.");
    if (data.run && !["won", "lost"].includes(data.run.status)) return fail(409, "Der Lauf ist noch nicht vorbei.");
    // Ohne Angabe: derselbe Dungeon wie beim letzten Lauf.
    data.run = dungeon.newRun(data.profile, rng, pickDungeon(body, data.run && data.run.dungeon));
    data.stats.runs += 1;
    save(dir, data);
    return ok();
  }

  if (method === "POST" && p === "/api/solo/game/act") {
    if (!data.run) return fail(400, "Kein Lauf.");
    const before = data.run.status;
    const res = dungeon.act(data.run, body.action || {}, rng);
    if (res.error) return fail(400, res.error);
    const after = data.run.status;
    if (after !== before && after === "won") {
      data.stats.wins += 1;
      data.pendingLevel = true;
    }
    if (after !== before && after === "lost") data.stats.losses += 1;
    save(dir, data);
    return ok({ roll: res.roll || null });
  }

  if (method === "POST" && p === "/api/solo/game/level") {
    if (!data.pendingLevel || !data.profile) return fail(409, "Gerade kein Level-Up.");
    const res = dungeon.levelUpProfile(data.profile, body);
    if (!res.ok) {
      data.pendingLevel = false;
      save(dir, data);
      return fail(400, res.text);
    }
    data.profile = res.profile;
    data.pendingLevel = false;
    save(dir, data);
    return ok({ text: res.text });
  }

  if (method === "POST" && p === "/api/solo/game/reset") {
    Object.assign(data, blank());
    save(dir, data);
    return ok();
  }
  return null;
}

module.exports = { route, load, save, heroChoices };
