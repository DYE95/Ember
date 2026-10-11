const test = require("node:test");
const assert = require("node:assert/strict");
const d = require("../lib/dungeon");
const { sablewoodPregens } = require("../lib/catalog");

// Wuerfel nach Drehbuch: jede Zahl kommt der Reihe nach, danach immer 1.
function script(...values) {
  const queue = values.slice();
  return { die: (sides) => Math.min(sides, queue.length ? queue.shift() : 1), left: () => queue.length };
}

function sheet(cls) {
  return sablewoodPregens().find((s) => s.class === cls);
}

function freshRun(cls = "Warrior") {
  return d.newRun(d.heroFromSheet(sheet(cls)));
}

// Setzt den Helden in einen Raum mit Gegner und startet den Kampf.
function inFight(run, foeId = "hound") {
  const room = run.rooms.find((r) => r.kind === "kampf");
  room.enemy = { ...room.enemy, ...d.FOES[foeId], id: foeId, name: "Testgegner", difficulty: 12, attack: 1, hp: 0, hpMax: 3, major: 6, severe: 10, dmg: [1, 6, 2], boss: false };
  run.at = room.id;
  room.visited = true;
  run.status = "combat";
  run.combat = { round: 1 };
  return room;
}

test("Held aus dem Katalog: Waffe und Armor nach Klasse", () => {
  const hero = d.heroFromSheet(sheet("Guardian"));
  assert.equal(hero.weapon.trait, "strength");
  assert.deepEqual(hero.weapon.dice, [1, 10, 3]);
  assert.equal(hero.armorMax, 4);
  assert.equal(hero.hpMax, 8);
});

test("Lauf: sieben Räume, fünf Ebenen, Boss am Ende", () => {
  const run = freshRun();
  assert.equal(run.rooms.length, 7);
  assert.equal(run.rooms[0].kind, "start");
  assert.equal(run.rooms.at(-1).kind, "boss");
  assert.ok(run.rooms.at(-1).enemy.boss);
  assert.equal(run.rooms.filter((r) => r.kind === "kampf").length >= 2, true);
  for (const r of run.rooms) {
    for (const exit of r.exits) assert.equal(run.rooms.find((n) => n.id === exit).layer, r.layer + 1);
  }
  assert.equal(run.hero.hope, 2);
  assert.equal(run.status, "explore");
});

test("am lebenden Gegner geht es nicht vorbei", () => {
  const run = freshRun();
  const room = inFight(run);
  run.status = "explore";
  run.combat = null;
  const ids = d.actions(run).map((a) => a.id);
  assert.ok(ids.includes("fight"));
  assert.ok(ids.includes("sneak"));
  assert.ok(!ids.includes("go"));
  assert.equal(d.act(run, { id: "go", to: room.exits[0] }).error, "Das geht gerade nicht.");
});

test("Treffer mit Hope: Schaden gegen Schwellen, Spotlight bleibt", () => {
  const run = freshRun();
  const room = inFight(run);
  // Hope 10, Fear 3 (+1 Agility = 14 gegen 12), Schaden W10 = 5 +3 = 8 → Major, 2 HP
  const res = d.act(run, { id: "attack" }, script(10, 3, 5));
  assert.equal(res.roll.outcome.success, true);
  assert.equal(res.roll.damage, 8);
  assert.equal(room.enemy.hp, 2);
  assert.equal(run.hero.hope, 3);
  assert.equal(res.roll.enemy, undefined);
  assert.equal(run.status, "combat");
});

test("Fehlschlag mit Fear: Gegner ist dran, Armor fängt eine Stufe ab", () => {
  const run = freshRun();
  inFight(run);
  // Hope 2, Fear 5 = 8 gegen 12; Gegner W20 15 +1 trifft Evasion 9; Schaden W6 6 +2 = 8 → Major → Armor → 1 HP
  const res = d.act(run, { id: "attack" }, script(2, 5, 15, 6));
  assert.equal(res.roll.outcome.success, false);
  assert.equal(run.fear, 1);
  assert.equal(res.roll.enemy[0].hit, true);
  assert.equal(run.hero.armor, 1);
  assert.equal(run.hero.hp, 1);
});

test("Experience ohne Hope wird abgelehnt", () => {
  const run = freshRun();
  inFight(run);
  run.hero.hope = 0;
  const xp = run.hero.experiences[0].id;
  assert.equal(d.act(run, { id: "attack", experiences: [xp] }).error, "Zu wenig Hope für die Experience.");
  run.hero.hope = 1;
  const res = d.act(run, { id: "attack", experiences: [xp] }, script(9, 4, 3));
  assert.equal(res.roll.total, 9 + 4 + 1 + 2);
  assert.equal(run.hero.hope, 1); // 1 bezahlt, 1 aus dem Wurf
});

test("Gegner besiegt räumt den Raum, Boss besiegt gewinnt", () => {
  const run = freshRun();
  const room = inFight(run);
  room.enemy.hp = 2;
  d.act(run, { id: "attack" }, script(10, 3, 5, 6, 3));
  assert.equal(room.cleared, true);
  assert.equal(run.status, "explore");
  const boss = run.rooms.at(-1);
  run.at = boss.id;
  run.status = "combat";
  run.combat = { round: 1 };
  boss.enemy.hp = boss.enemy.hpMax - 1;
  d.act(run, { id: "attack" }, script(11, 4, 10, 1));
  assert.equal(run.status, "won");
});

test("zu Boden: Alles riskieren mit Fear verliert, mit Hope steht man auf", () => {
  const run = freshRun();
  inFight(run);
  run.hero.hp = run.hero.hpMax;
  run.status = "dying";
  assert.deepEqual(d.actions(run).map((a) => a.id), ["risk", "giveup"]);
  const copy = JSON.parse(JSON.stringify(run));
  d.act(run, { id: "risk" }, script(3, 9));
  assert.equal(run.status, "lost");
  d.act(copy, { id: "risk" }, script(5, 2));
  assert.equal(copy.status, "combat");
  assert.equal(copy.hero.hp, copy.hero.hpMax - 5);
});

test("kurze Rast: zwei Aktionen, Fear für den Dungeon, höchstens drei", () => {
  const run = freshRun();
  run.hero.hp = 4;
  run.hero.stress = 3;
  assert.equal(d.act(run, { id: "rest", moves: ["hp"] }).error, "Zwei Rast-Aktionen wählen.");
  d.act(run, { id: "rest", moves: ["hp", "stress"] }, script(2, 1, 3));
  assert.equal(run.hero.hp, 1);
  assert.equal(run.hero.stress, 1);
  assert.equal(run.fear, 3);
  d.act(run, { id: "rest", moves: ["hope", "hope"] });
  d.act(run, { id: "rest", moves: ["hope", "hope"] });
  assert.ok(!d.actions(run).some((a) => a.id === "rest"));
});

test("Falle beim Betreten: Reaktion daneben kostet Hit Points", () => {
  const run = freshRun();
  const trap = run.rooms[1];
  Object.assign(trap, { kind: "falle", enemy: null, trap: { difficulty: 11, trait: "agility", dmg: [1, 8, 2] } });
  // Hope 2, Fear 4 +1 = 7 gegen 11; Schaden W8 8 +2 = 10 → Major → Armor → 1 HP
  d.act(run, { id: "go", to: trap.id }, script(2, 4, 8));
  assert.equal(run.at, trap.id);
  assert.equal(run.hero.hp, 1);
  assert.equal(run.hero.armor, 1);
});

test("Heiltrank räumt Hit Points und ist dann weg", () => {
  const run = freshRun();
  run.hero.hp = 3;
  d.act(run, { id: "item", item: "heiltrank" }, script(2));
  assert.equal(run.hero.hp, 1);
  assert.equal(run.inventory.heiltrank, 0);
  assert.equal(d.act(run, { id: "item", item: "heiltrank" }).error, "Das geht gerade nicht.");
});

test("Level-Up nach dem Sieg: Level, Schwellen und Wahl", () => {
  const hero = d.heroFromSheet(sheet("Ranger"));
  const res = d.levelUpProfile(hero, { pick: "experience", experience: "Glutläufer" });
  assert.equal(res.ok, true);
  assert.equal(res.profile.level, 2);
  assert.equal(res.profile.proficiency, 2);
  assert.equal(res.profile.major, hero.major + 1);
  assert.ok(res.profile.experiences.some((e) => e.name === "Glutläufer" && e.bonus === 2));
  const hp = d.levelUpProfile(hero, { pick: "hp" });
  assert.equal(hp.profile.hpMax, hero.hpMax + 1);
  assert.equal(hero.level, 1); // Original bleibt unberuehrt
});

test("ein ganzer Lauf mit einfacher Strategie endet immer", () => {
  for (let i = 0; i < 50; i += 1) {
    const run = freshRun(["Warrior", "Rogue", "Sorcerer", "Guardian", "Ranger"][i % 5]);
    for (let steps = 0; steps < 300 && !["won", "lost"].includes(run.status); steps += 1) {
      const acts = d.actions(run);
      const has = (id) => acts.find((a) => a.id === id);
      let a = has("risk") || has("attack") || has("fight") || has("search") || acts.find((x) => x.id === "go");
      if (!a) a = has("giveup");
      assert.ok(a, `keine Aktion in Status ${run.status}`);
      const res = d.act(run, a);
      assert.equal(res.error, undefined, res.error);
    }
    assert.ok(["won", "lost"].includes(run.status));
  }
});

// Testlauf 2026-10-10: „Solo läuft, aber keiner greift zurück an.“
test("Gegenzug bei Fehlschlag: Logzeile, foeTurn für die Animation, auch wenn Armor alles fängt", () => {
  const run = freshRun();
  inFight(run);
  // Hope 2, Fear 5 → Fehlschlag; W20 15 +1 trifft; Schaden W6 1 +2 = 3 → 1 Stufe → Armor fängt sie, 0 HP
  const res = d.act(run, { id: "attack" }, script(2, 5, 15, 1));
  assert.equal(res.roll.enemy.length, 1);
  const row = res.roll.enemy[0];
  assert.deepEqual([row.hit, row.damage, row.marks, row.armor], [true, 3, 0, true]);
  assert.equal(run.hero.hp, 0, "kein Herz weg …");
  assert.equal(run.hero.armor, 1, "… aber ein Armor-Slot");
  assert.equal(run.foeTurn.foe, "Testgegner");
  assert.equal(run.foeTurn.rows.length, 1);
  const texts = run.log.slice(0, 4).map((l) => l.text);
  assert.ok(texts.some((t) => /Testgegner greift an: W20 15\+1 = 16 .* Treffer/.test(t)), texts.join(" | "));
  const dmgLine = run.log.find((l) => /Testgegner: 3 Schaden/.test(l.text));
  assert.equal(dmgLine.kind, "bad", "abgefangener Treffer ist trotzdem rot");
  assert.ok(run.log.some((l) => /Gegenzug!/.test(l.text) && l.kind === "bad"));
});

test("Gegenzug bei Erfolg mit Fear, nicht bei Erfolg mit Hope", () => {
  const run = freshRun();
  const room = inFight(run);
  room.enemy.hpMax = 9;
  // Hope 6, Fear 9 +1 = 16 gegen 12 → Erfolg mit Fear; Schaden 1+3; Gegner W20 2 → daneben
  const res = d.act(run, { id: "attack" }, script(6, 9, 1, 2));
  assert.equal(res.roll.outcome.success, true);
  assert.equal(res.roll.outcome.withHope, false);
  assert.equal(res.roll.enemy.length, 1);
  assert.equal(res.roll.enemy[0].hit, false);
  const seq = run.foeTurn.seq;
  const calm = d.act(run, { id: "attack" }, script(10, 3, 1));
  assert.equal(calm.roll.enemy, undefined);
  assert.equal(run.foeTurn.seq, seq, "kein neuer Gegenzug");
});

test("Verteidigen und misslungenes Schleichen lösen einen Gegenzug aus", () => {
  const run = freshRun();
  inFight(run);
  const def = d.act(run, { id: "defend" }, script(19, 4));
  assert.equal(def.enemy.length, 1);
  assert.ok(run.foeTurn);
  const run2 = freshRun();
  inFight(run2);
  run2.status = "explore";
  run2.combat = null;
  const sn = d.act(run2, { id: "sneak" }, script(1, 2, 18, 3));
  assert.equal(run2.status === "combat" || run2.status === "dying", true);
  assert.equal(sn.roll.enemy.length, 1);
  assert.ok(run2.log.some((l) => /entdeckt dich/.test(l.text)));
});

test("über viele Läufe greifen Gegner wirklich an (echte Würfel)", () => {
  let counters = 0;
  let attacks = 0;
  for (let n = 0; n < 40; n += 1) {
    const run = freshRun();
    for (let guard = 0; guard < 120 && !["won", "lost"].includes(run.status); guard += 1) {
      const acts = d.actions(run);
      const a = acts.find((x) => x.id === "attack") || acts.find((x) => x.id === "fight") || acts.find((x) => x.id === "risk") || acts.find((x) => x.id === "go");
      if (!a) break;
      const res = d.act(run, a);
      if (a.id === "attack") { attacks += 1; if (res.roll && res.roll.enemy) counters += 1; }
    }
  }
  assert.ok(attacks > 50);
  assert.ok(counters / attacks > 0.3, `${counters} Gegenzüge bei ${attacks} Angriffen`);
});

// Zweiter Dungeon (Versunkene Krypta) hat eine eigene Datei. Sie laeuft hier mit,
// damit package.json frei bleibt (offener PR #37 aendert dieselbe Zeile).
require("./dungeon-krypta.test");
