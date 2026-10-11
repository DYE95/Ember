// lib/dungeon.js — Solo-Spiel: ein kurzer Dungeon-Lauf nach Daggerheart-Art.
// Reine Logik ohne Server und ohne DOM, damit sie testbar bleibt.
// Wuerfel kommen ueber rng.die(seiten); Standard ist crypto (lib/dice.js).
const { resolveActionRoll, applyPools, rollDie, canPayExperiences } = require("./dice");
const solo = require("./solo");

const DEFAULT_RNG = { die: (sides) => rollDie(sides) };
const LOG_MAX = 40;
const SHORT_RESTS = 3;
const FEAR_MAX = 12;

// Gegner aus den Solo-Bots, ergaenzt um Hit Points, Schwellen und Schaden.
const FOES = {
  bramble: { hp: 3, major: 5, severe: 9, dmg: [1, 6, 2], sprite: "leaf", text: "Dornige Ranken greifen nach deinen Knöcheln." },
  hound: { hp: 4, major: 6, severe: 10, dmg: [1, 8, 2], sprite: "flame", text: "Ein Hund aus Glut und Asche, die Augen wie Kohlen." },
  thistle: { hp: 4, major: 6, severe: 11, dmg: [1, 8, 3], sprite: "leaf", text: "Etwas lauert zwischen den Disteln und wartet auf deinen Fehler." },
  barnacle: { hp: 5, major: 8, severe: 14, dmg: [1, 10, 3], sprite: "barrel", text: "Ein Brocken aus Muscheln und Wut. Langsam, aber er trifft hart." },
};
// Neue Gegner fuer die Versunkene Krypta. Nur vorhandene Sprites, Werte
// zwischen Bramble/Hound (schwach), Thistlefolk (mittel) und Barnacle (hart).
const DEEP_FOES = {
  irrlicht: { name: "Moorlicht", difficulty: 11, attack: 1, role: "Skulk", hp: 3, major: 5, severe: 9, dmg: [1, 6, 2], sprite: "lamp", text: "Ein kaltes Licht tanzt über dem Wasser und lockt dich vom Steg." },
  schlick: { name: "Schlickranke", difficulty: 12, attack: 2, role: "Skulk", hp: 4, major: 6, severe: 11, dmg: [1, 8, 3], sprite: "plant", text: "Grüne Fäden treiben im Wasser. Dann ziehen sie sich um deine Beine zusammen." },
  treibgut: { name: "Treibgut-Koloss", difficulty: 11, attack: 2, role: "Bruiser", hp: 5, major: 7, severe: 13, dmg: [1, 10, 2], sprite: "crate", text: "Kisten, Bretter und Knochen, vom Wasser zu einem Körper zusammengeschoben." },
};

const BOSS = {
  id: "warden", name: "Glutwächter", difficulty: 14, attack: 4, role: "Boss",
  hp: 8, major: 9, severe: 16, dmg: [2, 6, 3], sprite: "lantern", special: "Glutstoß",
  text: "Eine Rüstung voller Glut hütet die letzte Kammer. Wo sie geht, flackert die Luft.",
};
// Boss der Versunkenen Krypta: gleiche Werte wie der Glutwächter.
const DEEP_BOSS = {
  id: "schleuse", name: "Schleusenwärter", difficulty: 14, attack: 4, role: "Boss",
  hp: 8, major: 9, severe: 16, dmg: [2, 6, 3], sprite: "key", special: "Flutwelle",
  text: "Ein Hüne aus nassem Stein, am Gürtel der rostige Schlüssel zur Schleuse. Das Wasser steigt, wenn er sich bewegt.",
};

// Waffen grob nach den SRD-Vorschlaegen der Klassen.
const WEAPONS = {
  warrior: { name: "Langschwert", trait: "agility", dice: [1, 10, 3] },
  guardian: { name: "Streitaxt", trait: "strength", dice: [1, 10, 3] },
  rogue: { name: "Dolch", trait: "finesse", dice: [1, 8, 1] },
  ranger: { name: "Kurzbogen", trait: "agility", dice: [1, 6, 3] },
  sorcerer: { name: "Zauberstab", trait: "instinct", dice: [1, 6, 3] },
  wizard: { name: "Großstab", trait: "knowledge", dice: [1, 6, 3] },
  bard: { name: "Rapier", trait: "presence", dice: [1, 8, 1] },
  druid: { name: "Kampfstab", trait: "instinct", dice: [1, 8, 1] },
  seraph: { name: "Hammer", trait: "strength", dice: [1, 8, 3] },
};
const ARMOR = { guardian: 4, warrior: 3, seraph: 3, ranger: 3, rogue: 3, bard: 3, druid: 3, sorcerer: 2, wizard: 2 };

const TRAITS = { agility: "Agility", strength: "Strength", finesse: "Finesse", instinct: "Instinct", presence: "Presence", knowledge: "Knowledge" };

const ITEMS = {
  heiltrank: { name: "Heiltrank", sprite: "heart", text: "Räumt 1W4 Hit Points." },
  ausdauertrank: { name: "Ausdauertrank", sprite: "leaf", text: "Räumt 1W4 Stress." },
  glutstein: { name: "Glutstein", sprite: "flame", text: "+2 Hope." },
  werkzeug: { name: "Rüstungsflicken", sprite: "gear", text: "Repariert alle Armor-Slots." },
};

const ROOMS = {
  start: [{ name: "Die Schwelle", text: "Kalte Asche liegt auf den Stufen. Hinter dir fällt das Tageslicht weg, vor dir glimmt es rot.", props: ["lantern", "crate"] }],
  kampf: [
    { name: "Aschekammer", text: "Ruß hängt in der Luft. Etwas bewegt sich zwischen umgestürzten Kisten.", props: ["crate", "barrel"] },
    { name: "Krypta", text: "Steinerne Särge, die Deckel verschoben. Kratzen aus der Dunkelheit.", props: ["chest", "chair"] },
    { name: "Galerie", text: "Verblasste Bilder, leere Rahmen. Ein Schatten löst sich von der Wand.", props: ["bookshelf", "lamp"] },
    { name: "Riss", text: "Der Boden ist aufgesprungen, warme Luft steigt herauf. Du bist nicht allein.", props: ["barrel", "plant"] },
  ],
  falle: [
    { name: "Schmaler Gang", text: "Die Fliesen sind ungleich hoch. Eine davon klickt unter deinem Fuß.", props: ["chair"] },
    { name: "Glutrinne", text: "Ein Kanal voller Glut. Der Steg darüber knarrt verdächtig.", props: ["barrel"] },
  ],
  schatz: [
    { name: "Vorratskammer", text: "Regale, Fässer, eine schwere Truhe. Hier hat jemand gelagert und ist nie zurückgekommen.", props: ["chest", "barrel", "crate"] },
    { name: "Bibliothek", text: "Bücher, aufgequollen und schief. Zwischen den Seiten steckt vielleicht noch etwas.", props: ["bookshelf", "lamp"] },
  ],
  rast: [
    { name: "Stiller Brunnen", text: "Klares Wasser in einem alten Becken. Die Glut kommt hier nicht hin. Ein guter Ort zum Durchatmen.", props: ["plant", "lantern"] },
  ],
  boss: [{ name: "Herz der Glut", text: "Eine runde Halle, in der Mitte ein Thron aus Schlacke. Etwas erhebt sich.", props: ["lantern", "chest"] }],
};

const DEEP_ROOMS = {
  start: [{ name: "Die Schleuse", text: "Eine verrostete Schleuse, dahinter Stufen ins Dunkle. Das Wasser steht dir schon bis zu den Knöcheln.", props: ["lamp", "barrel"] }],
  kampf: [
    { name: "Überflutete Gruft", text: "Särge treiben wie Boote. Einer stößt gegen die Wand, dann noch einmal, von innen.", props: ["chest", "plant"] },
    { name: "Ossarium", text: "Knochen in Nischen, grün vom Schlick. Zwischen den Schädeln bewegt sich etwas.", props: ["bookshelf", "crate"] },
    { name: "Kapelle unter Wasser", text: "Nur die Bankreihen schauen noch heraus. Am Altar flackert ein Licht, das nicht brennen dürfte.", props: ["chair", "lamp"] },
    { name: "Brunnenschacht", text: "Ein Schacht, aus dem es tropft und gluckert. Etwas klettert herauf.", props: ["barrel", "plant"] },
  ],
  falle: [
    { name: "Rutschige Stufen", text: "Die Treppe ist mit Algen überzogen. Ein falscher Schritt, und es geht abwärts.", props: ["crate"] },
    { name: "Strudel", text: "Mitten im Gang dreht sich das Wasser. Der Sog zieht an deinen Stiefeln.", props: ["barrel"] },
  ],
  schatz: [
    { name: "Opferkammer", text: "Kupferschalen auf einem Sims über der Wasserlinie. Jemand hat hier Gaben für die Toten gelassen.", props: ["chest", "lamp"] },
    { name: "Sakristei", text: "Schränke, aufgequollen und verzogen. Ganz oben ist es trocken geblieben.", props: ["bookshelf", "crate", "chest"] },
  ],
  rast: [
    { name: "Trockene Empore", text: "Eine Galerie über dem Wasser, Stein, der noch warm ist. Hier kannst du Luft holen.", props: ["chair", "lantern"] },
  ],
  boss: [{ name: "Schleusenkammer", text: "Die große Kammer mit dem Schleusenrad. Das Wasser rauscht, dann steht es still. Etwas wartet auf dich.", props: ["chest", "barrel"] }],
};

// Waehlbare Dungeons. Ein Lauf geht immer ueber fuenf Raeume, der letzte ist der Boss.
// pools: Gegner je Ebene (1, 2, ab 3).
const DUNGEONS = {
  glut: {
    id: "glut", name: "Asche unter der Schwelle", short: "Glut",
    text: "Sieben Räume voller Glut und Asche. Am Ende wartet der Glutwächter.",
    intro: "steigt in den Dungeon hinab.",
    win: "löscht die Glut im Herzen des Dungeons.",
    rooms: ROOMS, boss: BOSS,
    pools: [["bramble", "hound"], ["hound", "thistle", "bramble"], ["barnacle", "thistle"]],
  },
  krypta: {
    id: "krypta", name: "Die versunkene Krypta", short: "Krypta",
    text: "Acht Räume unter Wasser, Moorlichter und Schlick. Am Ende wartet der Schleusenwärter.",
    intro: "watet durch die Schleuse in die versunkene Krypta.",
    win: "dreht das Schleusenrad. Das Wasser fließt ab, die Krypta liegt still.",
    rooms: DEEP_ROOMS, boss: DEEP_BOSS,
    pools: [["irrlicht", "bramble"], ["schlick", "irrlicht", "bramble"], ["barnacle", "treibgut", "schlick"]],
  },
};
const DEFAULT_DUNGEON = "glut";

function dungeonOf(id) {
  return Object.prototype.hasOwnProperty.call(DUNGEONS, id) ? DUNGEONS[id] : DUNGEONS[DEFAULT_DUNGEON];
}

// Kurzfassung fuer die Oberflaeche (Auswahl beim Start).
function dungeonList() {
  return Object.values(DUNGEONS).map((d) => ({ id: d.id, name: d.name, short: d.short, text: d.text, boss: d.boss.name, sprite: d.boss.sprite }));
}

function pick(list, rng) {
  return list[rng.die(list.length) - 1];
}

function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.die(i + 1) - 1;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function rollDice(spec, rng) {
  const [count, sides, bonus] = spec;
  const rolls = [];
  for (let i = 0; i < count; i += 1) rolls.push(rng.die(sides));
  return { rolls, bonus, total: rolls.reduce((s, n) => s + n, 0) + bonus };
}

function severity(damage, major, severe) {
  if (damage >= severe) return 3;
  if (damage >= major) return 2;
  return damage > 0 ? 1 : 0;
}

function signed(n) {
  return n >= 0 ? `+${n}` : String(n);
}

// Aus einem Bogen (Katalog oder Kampagne) wird ein Solo-Held.
function heroFromSheet(sheet) {
  const cls = String(sheet.class || "").toLowerCase();
  const traits = { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0, ...(sheet.traits || {}) };
  let weapon = WEAPONS[cls];
  if (!weapon) {
    const best = Object.keys(TRAITS).sort((a, b) => traits[b] - traits[a])[0];
    weapon = { name: "Waffe", trait: best, dice: [1, 8, 1] };
  }
  return {
    name: sheet.name || "Held",
    class: sheet.class || "",
    subclass: sheet.subclass || "",
    ancestry: sheet.ancestry || "",
    color: sheet.color || "#e0561b",
    level: Number(sheet.level || 1),
    traits,
    experiences: (sheet.experiences || []).map((e, i) => ({ id: e.id || `xp${i}`, name: e.name, bonus: Number(e.bonus || 2) })),
    features: (sheet.features || []).map((f) => ({ name: f.name, text: f.text })),
    hpMax: Number(sheet.hpMax || 6),
    stressMax: Number(sheet.stressMax || 6),
    hopeMax: Number(sheet.hopeMax || 6),
    major: Number(sheet.major || 7),
    severe: Number(sheet.severe || 14),
    evasion: Number(sheet.evasion || 10),
    armorMax: Number(sheet.armorScore || ARMOR[cls] || 3),
    proficiency: Number(sheet.proficiency || 1),
    weapon: { ...weapon, dice: weapon.dice.slice() },
  };
}

function makeFoe(base, tier) {
  const up = Math.max(0, tier - 1);
  return {
    id: base.id,
    name: base.name,
    role: base.role || "Foe",
    difficulty: Number(base.difficulty || 11) + up,
    attack: Number(base.attack || 0) + up,
    hp: 0,
    hpMax: base.hp + up,
    major: base.major + up * 3,
    severe: base.severe + up * 5,
    dmg: [base.dmg[0], base.dmg[1], base.dmg[2] + up * 2],
    sprite: base.sprite,
    text: base.text,
    boss: Boolean(base.boss),
    special: base.special || "",
  };
}

// Gegner aus den Solo-Bots (Name, Difficulty, Angriff) oder ganz aus DEEP_FOES.
function foeFor(botId, tier) {
  if (DEEP_FOES[botId]) return makeFoe({ ...DEEP_FOES[botId], id: botId }, tier);
  const bot = solo.find(botId);
  return makeFoe({ ...bot, ...FOES[bot.id], id: bot.id }, tier);
}

function room(id, kind, layer, slot, slots, rng, tier, dg = DUNGEONS.glut) {
  const data = pick(dg.rooms[kind], rng);
  const row = {
    id, kind, layer, name: data.name, text: data.text, props: data.props.slice(),
    x: Math.round(((slot + 1) / (slots + 1)) * 100), y: 0,
    exits: [], visited: false, cleared: false, searched: false, sneaked: false,
    enemy: null, trap: null, loot: [],
    searchDifficulty: 10 + rng.die(3) + (tier - 1),
  };
  if (kind === "kampf") {
    const pool = dg.pools[Math.min(2, Math.max(0, layer - 1))];
    row.enemy = foeFor(pick(pool, rng), tier);
  }
  if (kind === "boss") row.enemy = makeFoe({ ...dg.boss, boss: true }, tier);
  if (kind === "falle") row.trap = { difficulty: 11 + (tier - 1), trait: "agility", dmg: [1, 8, 1 + tier] };
  if (kind === "schatz") row.loot = shuffle(["heiltrank", "glutstein", "werkzeug", "ausdauertrank"], rng).slice(0, 2);
  if (kind === "rast") row.loot = ["ausdauertrank"];
  return row;
}

// Glut: sieben Raeume in fuenf Ebenen; jeder Raum fuehrt zu allen Raeumen der naechsten.
// Krypta: acht Raeume, Ebene 2 hat drei Wege (Kampf, Rast, Kampf oder Schatz).
// Ein Lauf geht in beiden ueber fuenf Raeume, der letzte ist der Boss.
function makeLayers(rng, dg) {
  if (dg.id === "krypta") {
    return [
      ["start"],
      shuffle(["kampf", pick(["falle", "schatz"], rng)], rng),
      shuffle(["kampf", "rast", pick(["kampf", "schatz"], rng)], rng),
      [pick(["kampf", "falle"], rng)],
      ["boss"],
    ];
  }
  const layers = [
    ["start"],
    shuffle(["kampf", pick(["falle", "schatz"], rng)], rng),
    shuffle(["kampf", "rast"], rng),
    [pick(["kampf", "schatz", "falle"], rng)],
    ["boss"],
  ];
  if (layers[3][0] !== "kampf" && !layers[1].includes("kampf")) layers[3][0] = "kampf";
  return layers;
}

function makeRooms(rng, tier, dg = DUNGEONS.glut) {
  const layers = makeLayers(rng, dg);
  const rooms = [];
  layers.forEach((kinds, layer) => {
    kinds.forEach((kind, slot) => {
      const row = room(`r${rooms.length}`, kind, layer, slot, kinds.length, rng, tier, dg);
      row.y = Math.round((layer / (layers.length - 1)) * 100);
      rooms.push(row);
    });
  });
  for (const r of rooms) r.exits = rooms.filter((n) => n.layer === r.layer + 1).map((n) => n.id);
  return rooms;
}

function log(run, text, kind = "info") {
  run.log.unshift({ text, kind, at: Date.now() });
  if (run.log.length > LOG_MAX) run.log.length = LOG_MAX;
}

function newRun(profile, rng = DEFAULT_RNG, dungeonId = DEFAULT_DUNGEON) {
  const tier = solo.tierOf(profile.level);
  const dg = dungeonOf(dungeonId);
  const rooms = makeRooms(rng, tier, dg);
  const run = {
    version: 1,
    status: "explore",
    dungeon: dg.id,
    dungeonName: dg.name,
    bossName: dg.boss.name,
    tier,
    hero: {
      ...JSON.parse(JSON.stringify(profile)),
      hp: 0, stress: 0, hope: 2, armor: 0, defend: false,
    },
    fear: 0,
    rooms,
    at: rooms[0].id,
    inventory: { heiltrank: 1, ausdauertrank: 0, glutstein: 0, werkzeug: 0, gold: 0 },
    shortRests: 0,
    combat: null,
    log: [],
    last: null,
    startedAt: new Date().toISOString(),
  };
  rooms[0].visited = true;
  rooms[0].cleared = true;
  log(run, `${run.hero.name} ${dg.intro} ${rooms[0].text}`, "story");
  return run;
}

function current(run) {
  return run.rooms.find((r) => r.id === run.at);
}

function enemyAlive(r) {
  return Boolean(r && r.enemy && r.enemy.hp < r.enemy.hpMax);
}

function blocked(r) {
  return enemyAlive(r) && !r.sneaked;
}

// Welche Knoepfe gerade gehen. Die Oberflaeche zeigt genau diese.
function actions(run) {
  const out = [];
  if (!run || run.status === "won" || run.status === "lost") return out;
  const hero = run.hero;
  const r = current(run);
  if (run.status === "dying") return [{ id: "risk", label: "Alles riskieren" }, { id: "giveup", label: "Aufgeben" }];
  if (run.status === "combat") {
    out.push({ id: "attack", label: `Angriff · ${hero.weapon.name}` });
    out.push({ id: "defend", label: "Verteidigen" });
  } else {
    if (enemyAlive(r) && !r.sneaked) {
      out.push({ id: "fight", label: r.enemy.boss ? "Kampf gegen den Boss" : "Kampf" });
      if (!r.enemy.boss) out.push({ id: "sneak", label: "Vorbeischleichen" });
    }
    if (!blocked(r) && !r.searched && r.kind !== "start") out.push({ id: "search", label: "Durchsuchen" });
    if (!blocked(r) && run.shortRests < SHORT_RESTS) out.push({ id: "rest", label: `Rasten (${SHORT_RESTS - run.shortRests} übrig)` });
    if (!blocked(r)) for (const exit of r.exits) out.push({ id: "go", to: exit, label: `Weiter: ${run.rooms.find((n) => n.id === exit).name}` });
  }
  for (const [key, item] of Object.entries(ITEMS)) {
    if (run.inventory[key] > 0) out.push({ id: "item", item: key, label: item.name });
  }
  return out;
}

function markStress(run, n, why) {
  const hero = run.hero;
  for (let i = 0; i < n; i += 1) {
    if (hero.stress < hero.stressMax) hero.stress += 1;
    else {
      hero.hp = Math.min(hero.hpMax, hero.hp + 1);
      log(run, "Stress ist voll, stattdessen 1 Hit Point.", "bad");
    }
  }
  if (why) log(run, `${why} ${hero.name} markiert ${n} Stress.`, "bad");
}

// Schaden gegen den Helden: Schwellen, Armor-Slot nimmt eine Stufe.
function hurtHero(run, damage, source) {
  const hero = run.hero;
  let marks = severity(damage, hero.major, hero.severe);
  let armorText = "";
  if (marks > 0 && hero.armor < hero.armorMax) {
    hero.armor += 1;
    marks -= 1;
    armorText = " Armor fängt eine Stufe ab.";
  }
  hero.hp = Math.min(hero.hpMax, hero.hp + marks);
  // Auch ein ganz abgefangener Treffer ist ein Treffer: rot im Log, damit man
  // sieht, dass der Gegner zurückschlägt (Armor-Slot weg statt Herz).
  log(run, `${source}: ${damage} Schaden gegen ${hero.major}/${hero.severe}.${armorText} ${marks} Hit Point${marks === 1 ? "" : "s"}.`, "bad");
  if (hero.hp >= hero.hpMax) {
    run.status = "dying";
    log(run, `${hero.name} geht zu Boden. Alles riskieren oder aufgeben?`, "bad");
  }
  return marks;
}

function enemyTurn(run, rng) {
  const r = current(run);
  const foe = r.enemy;
  const hero = run.hero;
  const attacks = [{ label: foe.name, bonus: 0 }];
  if (foe.boss && run.fear >= 2) {
    run.fear -= 2;
    attacks.push({ label: `${foe.name} (${foe.special || "Glutstoß"}, 2 Fear)`, bonus: 0 });
  }
  const results = [];
  for (const atk of attacks) {
    if (run.status !== "combat") break;
    const d20 = rng.die(20);
    const evasion = hero.evasion + (hero.defend ? 3 : 0);
    const total = d20 + foe.attack + atk.bonus;
    const hit = d20 === 20 || (d20 !== 1 && total >= evasion);
    const row = { d20, total, evasion, hit, label: atk.label, damage: 0, marks: 0, armor: false };
    if (hit) {
      const dmg = rollDice(foe.dmg, rng);
      row.damage = d20 === 20 ? foe.dmg[0] * foe.dmg[1] + dmg.total : dmg.total;
      log(run, `${atk.label} greift an: W20 ${d20}${signed(foe.attack)} = ${total} gegen Evasion ${evasion} — Treffer.`, "bad");
      const armorBefore = hero.armor;
      row.marks = hurtHero(run, row.damage, atk.label);
      row.armor = hero.armor > armorBefore;
    } else {
      log(run, `${atk.label} greift an: W20 ${d20}${signed(foe.attack)} = ${total} gegen Evasion ${evasion} — daneben.`, "good");
      if (hero.defend && hero.hope < hero.hopeMax) {
        hero.hope += 1;
        log(run, "Gut gedeckt: +1 Hope.", "good");
      }
    }
    results.push(row);
  }
  if (run.status === "combat" && !foe.boss && run.fear >= 3) {
    run.fear -= 1;
    markStress(run, 1, `${foe.name} nutzt 1 Fear.`);
    if (run.hero.hp >= run.hero.hpMax) {
      run.status = "dying";
      log(run, `${hero.name} geht zu Boden. Alles riskieren oder aufgeben?`, "bad");
    }
  }
  hero.defend = false;
  // Für die Oberfläche: der Gegenzug wird sichtbar gespielt (solo-game.js).
  run.foeTurn = { at: Date.now(), seq: (run.foeTurn && run.foeTurn.seq ? run.foeTurn.seq : 0) + 1, foe: foe.name, rows: results };
  return results;
}

function dualityFor(run, trait, difficulty, opts, rng) {
  const hero = run.hero;
  const chosen = (opts.experiences || [])
    .map((xid) => hero.experiences.find((e) => e.id === xid))
    .filter(Boolean);
  if (!canPayExperiences(hero.hope, chosen)) return { error: "Zu wenig Hope für die Experience." };
  const allIn = Boolean(opts.allIn);
  if (allIn && hero.stress >= hero.stressMax) return { error: "Stress ist voll, Alles geben geht nicht." };
  if (allIn) markStress(run, 1);
  const roll = resolveActionRoll({
    hopeDie: rng.die(12),
    fearDie: rng.die(12),
    traitMod: Number(hero.traits[trait] || 0),
    experiences: chosen,
    advantageDie: allIn ? rng.die(6) : 0,
    mode: allIn ? "advantage" : "none",
    difficulty,
  });
  const pools = applyPools({ hope: hero.hope, hopeMax: hero.hopeMax, fear: run.fear, fearMax: FEAR_MAX }, roll);
  hero.hope = pools.hope;
  run.fear = pools.fear;
  if (roll.outcome.critical && hero.stress > 0) hero.stress -= 1;
  roll.trait = trait;
  roll.traitLabel = TRAITS[trait];
  roll.difficulty = difficulty;
  roll.experiences = chosen.map((e) => e.name);
  return { roll };
}

function rollText(roll) {
  const xp = roll.experiences.length ? ` mit ${roll.experiences.join(", ")}` : "";
  return `${roll.traitLabel}${xp}: ${roll.spoken}`;
}

function attack(run, opts, rng) {
  const r = current(run);
  const foe = r.enemy;
  const hero = run.hero;
  const res = dualityFor(run, hero.weapon.trait, foe.difficulty, opts, rng);
  if (res.error) return res;
  const { roll } = res;
  log(run, `Angriff, ${rollText(roll)}`, roll.outcome.success ? "good" : "bad");
  if (roll.outcome.success) {
    const dice = hero.weapon.dice;
    const dmg = rollDice([dice[0] * hero.proficiency, dice[1], dice[2]], rng);
    let damage = dmg.total;
    if (roll.outcome.critical) damage += dice[0] * hero.proficiency * dice[1];
    const marks = severity(damage, foe.major, foe.severe);
    foe.hp = Math.min(foe.hpMax, foe.hp + marks);
    roll.damage = damage;
    log(run, `${hero.weapon.name}: ${damage} Schaden gegen ${foe.major}/${foe.severe} — ${foe.name} markiert ${marks} Hit Point${marks === 1 ? "" : "s"} (${foe.hp}/${foe.hpMax}).`, "good");
    if (foe.hp >= foe.hpMax) return defeat(run, rng, roll);
  }
  const shift = !roll.outcome.success || !roll.outcome.withHope;
  if (roll.outcome.critical || !shift) {
    log(run, "Du behältst das Spotlight.", "info");
    return { roll };
  }
  log(run, `Das Spotlight wandert zu ${foe.name}. Gegenzug!`, "bad");
  roll.enemy = enemyTurn(run, rng);
  return { roll };
}

function defeat(run, rng, roll) {
  const r = current(run);
  const foe = r.enemy;
  r.cleared = true;
  run.combat = null;
  const gold = rng.die(6) + (foe.boss ? 10 : 0);
  run.inventory.gold += gold;
  log(run, `${foe.name} ist besiegt. ${gold} Gold.`, "good");
  if (foe.boss) {
    run.status = "won";
    run.endedAt = new Date().toISOString();
    log(run, `Sieg! ${run.hero.name} ${dungeonOf(run.dungeon).win}`, "story");
  } else {
    run.status = "explore";
    if (rng.die(3) === 1) {
      run.inventory.heiltrank += 1;
      log(run, "Bei den Resten liegt ein Heiltrank.", "good");
    }
  }
  return { roll };
}

function enter(run, to, rng) {
  const from = current(run);
  if (!from.exits.includes(to)) return { error: "Da geht es nicht hin." };
  if (blocked(from)) return { error: "Der Gegner lässt dich nicht vorbei." };
  run.at = to;
  const r = current(run);
  r.visited = true;
  log(run, `${r.name}. ${r.text}`, "story");
  if (r.trap && !r.trap.sprung) {
    r.trap.sprung = true;
    const res = dualityFor(run, r.trap.trait, r.trap.difficulty, {}, rng);
    const { roll } = res;
    log(run, `Falle! Reaktion, ${rollText(roll)}`, roll.outcome.success ? "good" : "bad");
    if (!roll.outcome.success) {
      const dmg = rollDice(r.trap.dmg, rng);
      hurtHero(run, dmg.total, "Falle");
    } else {
      log(run, "Du springst rechtzeitig zur Seite.", "good");
    }
    if (run.status === "explore") r.cleared = true;
    return { roll };
  }
  if (!r.enemy) r.cleared = true;
  else log(run, `${r.enemy.name} (Difficulty ${r.enemy.difficulty}). ${r.enemy.text}`, "bad");
  return {};
}

function search(run, rng) {
  const r = current(run);
  if (r.searched) return { error: "Hier ist nichts mehr." };
  r.searched = true;
  const res = dualityFor(run, "instinct", r.searchDifficulty, {}, rng);
  const { roll } = res;
  log(run, `Durchsuchen, ${rollText(roll)}`, roll.outcome.success ? "good" : "bad");
  if (roll.outcome.success) {
    const found = r.loot.length ? r.loot.splice(0) : [pick(["heiltrank", "ausdauertrank", "glutstein"], rng)];
    found.forEach((key) => { run.inventory[key] = (run.inventory[key] || 0) + 1; });
    const gold = rng.die(4);
    run.inventory.gold += gold;
    log(run, `Gefunden: ${found.map((k) => ITEMS[k].name).join(", ")} und ${gold} Gold.`, "good");
  } else if (!roll.outcome.withHope) {
    markStress(run, 1, "Rostige Kanten und Spinnweben.");
  } else {
    log(run, "Nichts Brauchbares.", "info");
  }
  return { roll };
}

function sneak(run, rng) {
  const r = current(run);
  const foe = r.enemy;
  const res = dualityFor(run, "finesse", foe.difficulty, {}, rng);
  const { roll } = res;
  log(run, `Schleichen, ${rollText(roll)}`, roll.outcome.success ? "good" : "bad");
  if (roll.outcome.success) {
    r.sneaked = true;
    log(run, `${foe.name} bemerkt dich nicht.`, "good");
    return { roll };
  }
  run.status = "combat";
  run.combat = { round: 1 };
  log(run, `${foe.name} entdeckt dich und greift zuerst an!`, "bad");
  roll.enemy = enemyTurn(run, rng);
  return { roll };
}

const REST_MOVES = {
  hp: "Wunden versorgen",
  stress: "Durchatmen",
  armor: "Rüstung flicken",
  hope: "Vorbereiten",
};

function rest(run, moves, rng) {
  if (run.shortRests >= SHORT_RESTS) return { error: "Keine kurze Rast mehr übrig." };
  const picks = (Array.isArray(moves) ? moves : []).filter((m) => REST_MOVES[m]).slice(0, 2);
  if (picks.length !== 2) return { error: "Zwei Rast-Aktionen wählen." };
  const hero = run.hero;
  run.shortRests += 1;
  const done = [];
  for (const move of picks) {
    const n = rng.die(4) + run.tier;
    if (move === "hp") { const c = Math.min(n, hero.hp); hero.hp -= c; done.push(`${c} Hit Points geräumt`); }
    if (move === "stress") { const c = Math.min(n, hero.stress); hero.stress -= c; done.push(`${c} Stress geräumt`); }
    if (move === "armor") { const c = Math.min(n, hero.armor); hero.armor -= c; done.push(`${c} Armor repariert`); }
    if (move === "hope") { hero.hope = Math.min(hero.hopeMax, hero.hope + 1); done.push("+1 Hope"); }
  }
  const fear = rng.die(4);
  run.fear = Math.min(FEAR_MAX, run.fear + fear);
  log(run, `Kurze Rast: ${done.join(", ")}. Der Dungeon sammelt ${fear} Fear.`, "info");
  return {};
}

function useItem(run, key, rng) {
  if (!ITEMS[key] || !(run.inventory[key] > 0)) return { error: "Nicht im Rucksack." };
  const hero = run.hero;
  run.inventory[key] -= 1;
  if (key === "heiltrank") { const c = Math.min(rng.die(4), hero.hp); hero.hp -= c; log(run, `Heiltrank: ${c} Hit Points geräumt.`, "good"); }
  if (key === "ausdauertrank") { const c = Math.min(rng.die(4), hero.stress); hero.stress -= c; log(run, `Ausdauertrank: ${c} Stress geräumt.`, "good"); }
  if (key === "glutstein") { hero.hope = Math.min(hero.hopeMax, hero.hope + 2); log(run, "Glutstein: +2 Hope.", "good"); }
  if (key === "werkzeug") { hero.armor = 0; log(run, "Rüstungsflicken: alle Armor-Slots repariert.", "good"); }
  return {};
}

function riskItAll(run, rng) {
  const hero = run.hero;
  const hope = rng.die(12);
  const fear = rng.die(12);
  const roll = { hopeDie: hope, fearDie: fear, outcome: { critical: hope === fear, withHope: hope > fear, success: hope >= fear, label: "" }, spoken: `Hope ${hope} · Fear ${fear}` };
  if (hope === fear) {
    hero.hp = 0;
    hero.stress = 0;
    roll.outcome.label = "Critical Success";
    log(run, `Alles riskieren: ${roll.spoken} — Critical! Alle Hit Points und Stress geräumt.`, "good");
  } else if (hope > fear) {
    hero.hp = Math.max(0, hero.hp - hope);
    roll.outcome.label = "Success with Hope";
    log(run, `Alles riskieren: ${roll.spoken} — du stehst wieder auf und räumst ${hope} Hit Points.`, "good");
  } else {
    roll.outcome.label = "Failure with Fear";
    log(run, `Alles riskieren: ${roll.spoken} — die Dunkelheit gewinnt.`, "bad");
    return lose(run, roll);
  }
  run.status = run.combat ? "combat" : "explore";
  return { roll };
}

function lose(run, roll) {
  run.status = "lost";
  run.combat = null;
  run.endedAt = new Date().toISOString();
  log(run, `${run.hero.name} fällt im Dungeon.`, "story");
  return { roll };
}

// Ein Schritt im Spiel. Liefert { roll?, error? } und veraendert run.
function act(run, action, rng = DEFAULT_RNG) {
  if (!run) return { error: "Kein Lauf." };
  const a = action || {};
  const allowed = actions(run);
  const ok = allowed.some((x) => x.id === a.id && (a.id !== "go" || x.to === a.to) && (a.id !== "item" || x.item === a.item));
  if (!ok) return { error: "Das geht gerade nicht." };
  let res = {};
  if (a.id === "fight") {
    run.status = "combat";
    run.combat = { round: 1 };
    log(run, `Kampf gegen ${current(run).enemy.name}! Du hast das Spotlight.`, "bad");
  } else if (a.id === "attack") res = attack(run, a, rng);
  else if (a.id === "defend") {
    run.hero.defend = true;
    log(run, "Du gehst in Deckung: +3 Evasion gegen den nächsten Angriff.", "info");
    res = { roll: null, enemy: enemyTurn(run, rng) };
  } else if (a.id === "go") res = enter(run, a.to, rng);
  else if (a.id === "search") res = search(run, rng);
  else if (a.id === "sneak") res = sneak(run, rng);
  else if (a.id === "rest") res = rest(run, a.moves, rng);
  else if (a.id === "item") res = useItem(run, a.item, rng);
  else if (a.id === "risk") res = riskItAll(run, rng);
  else if (a.id === "giveup") res = lose(run, null);
  if (!res.error) run.last = res.roll ? { ...res.roll, at: Date.now() } : null;
  return res;
}

// Nach einem Sieg: Level-Up mit der Solo-Logik plus eine Wahl.
const LEVEL_PICKS = {
  hp: "+1 Hit Point",
  stress: "+1 Stress",
  evasion: "+1 Evasion",
  experience: "Neue Experience +2",
};

function levelUpProfile(profile, choice = {}) {
  const pickId = LEVEL_PICKS[choice.pick] ? choice.pick : "hp";
  const sheet = { ...profile, experiences: profile.experiences.map((e) => ({ ...e })) };
  const name = pickId === "experience" ? String(choice.experience || "").trim() || "Dungeon-Erfahrung" : "";
  const res = solo.levelUp(sheet, { experience: name, note: pickId !== "experience" ? LEVEL_PICKS[pickId] : "" });
  if (!res.ok) return res;
  if (pickId === "hp") sheet.hpMax += 1;
  if (pickId === "stress") sheet.stressMax += 1;
  if (pickId === "evasion") sheet.evasion += 1;
  sheet.major += 1;
  sheet.severe += 1;
  sheet.experiences = sheet.experiences.map((e, i) => ({ id: e.id || `xp${i}`, name: e.name, bonus: Number(e.bonus || 2) }));
  delete sheet.hope;
  return { ok: true, profile: sheet, text: `${res.text} Schwellen +1.` };
}

module.exports = {
  heroFromSheet, newRun, act, actions, levelUpProfile, current,
  ITEMS, REST_MOVES, LEVEL_PICKS, TRAITS, FOES, BOSS, SHORT_RESTS,
  DUNGEONS, DEFAULT_DUNGEON, DEEP_FOES, DEEP_BOSS, dungeonList, dungeonOf,
};
