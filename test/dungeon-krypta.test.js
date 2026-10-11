// Zweiter Solo-Dungeon: Die versunkene Krypta. Aufbau, Gegner, Boss,
// Auswahl beim Start und eine grobe Balance gegen den ersten Dungeon.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const d = require("../lib/dungeon");
const soloGame = require("../lib/solo-game");
const { sablewoodPregens } = require("../lib/catalog");

const SPRITES = path.join(__dirname, "..", "public", "solo", "sprites");

// Fester Zufall (mulberry32), damit die Balance-Pruefung nicht flackert.
function seeded(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { die: (sides) => 1 + Math.floor(next() * sides) };
}

const hero = (cls = "Warrior") => d.heroFromSheet(sablewoodPregens().find((s) => s.class === cls));

test("Zwei Dungeons zur Wahl, mit deutschem Namen und Boss", () => {
  const list = d.dungeonList();
  assert.deepEqual(list.map((x) => x.id), ["glut", "krypta"]);
  const k = list.find((x) => x.id === "krypta");
  assert.equal(k.name, "Die versunkene Krypta");
  assert.equal(k.boss, "Schleusenwärter");
  assert.equal(k.sprite, "key");
});

test("Krypta: acht Räume in fünf Ebenen, Weg über fünf, Boss am Ende", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const run = d.newRun(hero(), seeded(seed), "krypta");
    assert.equal(run.dungeon, "krypta");
    assert.equal(run.dungeonName, "Die versunkene Krypta");
    assert.equal(run.rooms.length, 8);
    assert.deepEqual([0, 1, 2, 3, 4].map((l) => run.rooms.filter((r) => r.layer === l).length), [1, 2, 3, 1, 1]);
    const boss = run.rooms[run.rooms.length - 1];
    assert.equal(boss.kind, "boss");
    assert.equal(boss.enemy.name, "Schleusenwärter");
    assert.equal(boss.enemy.boss, true);
    assert.equal(boss.enemy.special, "Flutwelle");
    for (const r of run.rooms) {
      assert.deepEqual(r.exits, run.rooms.filter((n) => n.layer === r.layer + 1).map((n) => n.id));
    }
    // Ebene 2 hat immer einen Rastplatz und mindestens einen Kampf
    const l2 = run.rooms.filter((r) => r.layer === 2).map((r) => r.kind);
    assert.ok(l2.includes("rast") && l2.includes("kampf"), l2.join());
    assert.ok(run.rooms.filter((r) => r.layer === 1).some((r) => r.kind === "kampf"));
    assert.match(run.log[0].text, /versunkene Krypta/);
  }
});

test("Krypta: eigene und alte Gegner, nur vorhandene Sprites", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed += 1) {
    const run = d.newRun(hero(), seeded(seed), "krypta");
    for (const r of run.rooms) if (r.enemy) seen.add(r.enemy.id);
    for (const r of run.rooms) for (const p of r.props) assert.ok(fs.existsSync(path.join(SPRITES, `${p}.png`)), p);
  }
  const fresh = Object.keys(d.DEEP_FOES);
  assert.ok(fresh.length >= 2 && fresh.length <= 3);
  for (const id of fresh) assert.ok(seen.has(id), `${id} kommt vor`);
  assert.ok(seen.has("barnacle") && seen.has("bramble"), "alte Gegner sind dabei");
  assert.ok(!seen.has("hound"), "der Aschehund bleibt in der Glut");
  for (const foe of [...Object.values(d.DEEP_FOES), d.DEEP_BOSS]) {
    assert.ok(fs.existsSync(path.join(SPRITES, `${foe.sprite}.png`)), foe.sprite);
    assert.ok(foe.name && foe.text);
  }
});

test("Balance: neue Gegner im Rahmen der alten, Boss so stark wie der Glutwächter", () => {
  const old = Object.keys(d.FOES).map((id) => ({ ...d.FOES[id] }));
  const range = (key) => [Math.min(...old.map((f) => f[key])), Math.max(...old.map((f) => f[key]))];
  for (const foe of Object.values(d.DEEP_FOES)) {
    for (const key of ["hp", "major", "severe"]) {
      const [lo, hi] = range(key);
      assert.ok(foe[key] >= lo && foe[key] <= hi, `${foe.name} ${key} ${foe[key]} in ${lo}..${hi}`);
    }
    assert.ok(foe.difficulty >= 10 && foe.difficulty <= 12, foe.name);
    assert.ok(foe.attack >= 0 && foe.attack <= 3, foe.name);
  }
  for (const key of ["difficulty", "attack", "hp", "major", "severe"]) assert.equal(d.DEEP_BOSS[key], d.BOSS[key], key);
  assert.deepEqual(d.DEEP_BOSS.dmg, d.BOSS.dmg);
});

// Einfache Spielweise: kaempfen, durchsuchen, Heiltrank bei Not, erst die Rast,
// dann den ersten Ausgang. Gleiche Wuerfelfolgen fuer beide Dungeons.
function autoplay(dungeonId, seed) {
  const rng = seeded(seed);
  const run = d.newRun(hero(seed % 2 ? "Warrior" : "Guardian"), rng, dungeonId);
  for (let step = 0; step < 400; step += 1) {
    if (run.status === "won" || run.status === "lost") return run.status;
    const acts = d.actions(run);
    const has = (id) => acts.find((a) => a.id === id);
    const h = run.hero;
    let a;
    if (run.status === "dying") a = has("risk");
    else if (run.status === "combat") a = h.hp >= h.hpMax - 2 && has("item") && acts.find((x) => x.item === "heiltrank") ? acts.find((x) => x.item === "heiltrank") : has("attack");
    else if (has("fight")) a = has("fight");
    else if (has("search")) a = has("search");
    else if (h.hp >= h.hpMax - 2 && acts.find((x) => x.item === "heiltrank")) a = acts.find((x) => x.item === "heiltrank");
    else if (has("rest") && (h.hp >= 2 || h.stress >= 3)) a = { id: "rest", moves: ["hp", "stress"] };
    else {
      const exits = acts.filter((x) => x.id === "go");
      a = exits.find((x) => run.rooms.find((r) => r.id === x.to).kind === "rast") || exits[0];
    }
    if (!a) return "stuck";
    const res = d.act(run, a, rng);
    if (res.error) return `fehler: ${res.error}`;
  }
  return "zu lang";
}

test("Balance: Siegquote der Krypta nah an der Glut (feste Würfel)", () => {
  const N = 300;
  const rate = (id) => {
    let won = 0;
    for (let seed = 1; seed <= N; seed += 1) {
      const out = autoplay(id, seed);
      assert.ok(out === "won" || out === "lost", `${id} #${seed}: ${out}`);
      if (out === "won") won += 1;
    }
    return won / N;
  };
  const glut = rate("glut");
  const krypta = rate("krypta");
  assert.ok(Math.abs(glut - krypta) <= 0.1, `Glut ${Math.round(glut * 100)} % · Krypta ${Math.round(krypta * 100)} %`);
});

test("Alter Spielstand ohne Dungeon und unbekannte Namen fallen auf die Glut", () => {
  const run = d.newRun(hero(), seeded(3));
  assert.equal(run.dungeon, "glut");
  assert.equal(run.rooms.length, 7);
  assert.equal(d.newRun(hero(), seeded(3), "__proto__").dungeon, "glut");
  assert.equal(d.newRun(hero(), seeded(3), "constructor").dungeon, "glut");
  assert.equal(d.dungeonOf(undefined).id, "glut");
  // Glut-Boss behaelt seinen Glutstoss
  assert.equal(run.rooms[run.rooms.length - 1].enemy.special, "Glutstoß");
});

test("API: Dungeon beim Start wählen, nächster Lauf bleibt dabei oder wechselt", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-krypta-"));
  try {
    const ctx = { dir, characters: [], rng: seeded(9) };
    const meta = soloGame.route("GET", "/api/solo/game", {}, ctx).body.meta;
    assert.equal(meta.dungeons.length, 2);
    let res = soloGame.route("POST", "/api/solo/game/new", { hero: "cat:0", dungeon: "krypta" }, ctx);
    assert.equal(res.status, 200);
    assert.equal(res.body.save.run.dungeon, "krypta");
    // Lauf beenden und ohne Angabe neu: bleibt in der Krypta
    const data = soloGame.load(dir);
    data.run.status = "lost";
    soloGame.save(dir, data);
    res = soloGame.route("POST", "/api/solo/game/run", {}, ctx);
    assert.equal(res.body.save.run.dungeon, "krypta");
    const again = soloGame.load(dir);
    again.run.status = "lost";
    soloGame.save(dir, again);
    res = soloGame.route("POST", "/api/solo/game/run", { dungeon: "glut" }, ctx);
    assert.equal(res.body.save.run.dungeon, "glut");
    // Unsinn: Standard
    res = soloGame.route("POST", "/api/solo/game/new", { hero: "cat:0", dungeon: { x: 1 } }, ctx);
    assert.equal(res.body.save.run.dungeon, "glut");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
