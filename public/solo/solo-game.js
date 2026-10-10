// Solo-Spiel auf /solo. Die Regeln laufen auf dem Server (lib/dungeon.js),
// diese Seite zeigt nur an, wuerfelt sichtbar und schickt Klicks.
const $ = (sel) => document.querySelector(sel);
const SPRITES = "/solo/sprites/";
const ROLL_MS = 900;
const FOE_MS = 900;

let game = null;
let busy = false;
let mods = { experiences: [], allIn: false };
let restPicks = [];
let levelPick = "";

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids) if (kid != null) node.append(kid);
  return node;
}

function sprite(name, cls = "") {
  return el("img", { class: `px ${cls}`.trim(), src: `${SPRITES}${name}.png`, alt: "" });
}

async function call(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: `Fehler ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

// Meldung (Fehler, Level-Up) bleibt oben im Log stehen, bis die naechste
// Aktion klappt. Sonst loescht renderLog() sie sofort wieder.
let notice = null;
function say(text, kind = "bad") {
  notice = { text, kind };
  $("#log").prepend(el("li", { class: kind, text }));
}

const run = () => game && game.save && game.save.run;
const room = () => run() && run().rooms.find((r) => r.id === run().at);

// ---------- Anzeige ----------

function renderLog() {
  const log = $("#log");
  const rows = (run() ? run().log.slice(0, 3) : []).map((row) => el("li", { class: row.kind, text: row.text }));
  if (notice) rows.unshift(el("li", { class: notice.kind, text: notice.text }));
  log.replaceChildren(...rows);
}

function icons(box, name, filled, total) {
  box.replaceChildren();
  for (let i = 0; i < total; i += 1) box.append(sprite(name, i < filled ? "" : "off"));
}

function renderHero() {
  const h = run().hero;
  $("#heroColor").style.background = h.color || "#e74806";
  $("#heroName").textContent = h.name;
  $("#heroSub").textContent = [h.ancestry, h.class, `Level ${h.level}`].filter(Boolean).join(" · ");
  icons($("#hp"), "heart", h.hpMax - h.hp, h.hpMax);
  $("#stress").replaceChildren(...Array.from({ length: h.stressMax }, (_, i) => el("i", { class: i < h.stress ? "on" : "" })));
  icons($("#hope"), "flame", h.hope, h.hopeMax);
  icons($("#armor"), "gear", h.armorMax - h.armor, h.armorMax);
  const traits = game.meta.traits;
  const facts = [
    ["Evasion", String(h.evasion + (h.defend ? 3 : 0))],
    ["Schwellen", `${h.major} / ${h.severe}`],
    ["Waffe", `${h.weapon.name} · ${traits[h.weapon.trait]} ${signed(h.traits[h.weapon.trait] || 0)} · ${h.weapon.dice[0] * h.proficiency}W${h.weapon.dice[1]}+${h.weapon.dice[2]}`],
    ["Experiences", h.experiences.map((e) => `${e.name} +${e.bonus}`).join(", ") || "—"],
  ];
  $("#facts").replaceChildren(...facts.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]));
  const inv = run().inventory;
  const usable = new Set(game.actions.filter((a) => a.id === "item").map((a) => a.item));
  const bag = Object.entries(game.meta.items).map(([key, item]) =>
    el("button", { class: "sg-item", type: "button", title: item.text, disabled: !usable.has(key) || busy, onclick: () => act({ id: "item", item: key }) },
      sprite(item.sprite), el("span", {}, `${item.name} `, el("b", { text: `×${inv[key] || 0}` }))));
  bag.push(el("div", { class: "sg-item", title: "Gold" }, sprite("cards"), el("span", {}, "Gold ", el("b", { text: String(inv.gold || 0) }))));
  $("#bag").replaceChildren(...bag);
}

function signed(n) {
  return n >= 0 ? `+${n}` : String(n);
}

function renderRoom() {
  const r = room();
  $("#roomName").textContent = r.name;
  $("#roomText").textContent = r.text;
  $("#props").replaceChildren(...r.props.map((p) => sprite(p)));
  const foe = $("#foe");
  if (r.enemy) {
    const e = r.enemy;
    const down = e.hp >= e.hpMax;
    foe.hidden = false;
    foe.className = `sg-foe${down ? " down" : ""}`;
    const pips = el("div", { class: "sg-pips" }, ...Array.from({ length: e.hpMax }, (_, i) => el("i", { class: i < e.hp ? "on" : "" })));
    foe.replaceChildren(
      sprite(e.sprite || "barrel"),
      el("h2", { text: down ? `${e.name} (besiegt)` : e.name }),
      el("p", { class: "sg-sub", text: `${e.role} · Difficulty ${e.difficulty} · Schwellen ${e.major}/${e.severe} · Angriff ${signed(e.attack)}` }),
      pips,
    );
  } else {
    foe.hidden = true;
  }
}

function renderMods() {
  const box = $("#mods");
  const combat = run().status === "combat";
  box.hidden = !combat;
  if (!combat) return;
  const h = run().hero;
  mods.experiences = mods.experiences.filter((id) => h.experiences.some((e) => e.id === id));
  if (mods.experiences.length > h.hope) mods.experiences = mods.experiences.slice(0, h.hope);
  if (mods.allIn && h.stress >= h.stressMax) mods.allIn = false;
  const kids = [el("span", { text: "Zum Angriff:" })];
  for (const xp of h.experiences) {
    const on = mods.experiences.includes(xp.id);
    const canPay = on || mods.experiences.length < h.hope;
    kids.push(el("button", {
      class: `sg-btn toggle${on ? " on" : ""}`, type: "button", disabled: !canPay || busy,
      title: "Kostet 1 Hope",
      onclick: () => { mods.experiences = on ? mods.experiences.filter((x) => x !== xp.id) : mods.experiences.concat(xp.id); renderMods(); },
    }, sprite("flame"), `${xp.name} +${xp.bonus}`));
  }
  kids.push(el("button", {
    class: `sg-btn toggle${mods.allIn ? " on" : ""}`, type: "button", disabled: (h.stress >= h.stressMax && !mods.allIn) || busy,
    title: "1 Stress markieren, Advantage (+W6)",
    onclick: () => { mods.allIn = !mods.allIn; renderMods(); },
  }, "Alles geben (1 Stress, +W6)"));
  box.replaceChildren(...kids);
}

function renderActions() {
  const box = $("#actions");
  const list = game.actions.filter((a) => a.id !== "item");
  box.replaceChildren(...list.map((a, i) => {
    const cls = a.id === "attack" || a.id === "fight" || a.id === "risk" ? "sg-btn primary" : a.id === "giveup" ? "sg-btn danger" : "sg-btn";
    let label = a.label;
    if (a.id === "attack") {
      const h = run().hero;
      label = `${a.label} (${game.meta.traits[h.weapon.trait]})`;
    }
    return el("button", { class: cls, type: "button", disabled: busy, "data-key": String(i + 1), onclick: () => choose(a) },
      i < 9 ? el("span", { class: "key", text: String(i + 1) }) : null, label);
  }));
}

// Zwei Raeume einer Ebene links und rechts, einer in der Mitte.
function mapX(r, n) {
  const row = r.rooms.filter((m) => m.layer === n.layer);
  return row.length === 1 ? 50 : 24 + (row.indexOf(n) * 52) / (row.length - 1);
}

function tally(s) {
  return `${s.wins} ${s.wins === 1 ? "Sieg" : "Siege"}, ${s.losses} ${s.losses === 1 ? "Niederlage" : "Niederlagen"}`;
}

function renderMap() {
  const r = run();
  const box = $("#map");
  const here = room();
  const exits = new Set(game.actions.filter((a) => a.id === "go").map((a) => a.to));
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  for (const a of r.rooms) {
    for (const id of a.exits) {
      const b = r.rooms.find((n) => n.id === id);
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", mapX(r, a)); line.setAttribute("y1", a.y);
      line.setAttribute("x2", mapX(r, b)); line.setAttribute("y2", b.y);
      if (a.visited && b.visited) line.setAttribute("class", "walked");
      svg.append(line);
    }
  }
  const nodes = r.rooms.map((n) => {
    const known = n.visited || here.exits.includes(n.id) || n.kind === "boss";
    const cls = ["sg-node", n.visited ? "visited" : "", n.id === here.id ? "here" : "", exits.has(n.id) ? "exit" : "", n.kind === "boss" ? "boss" : ""].join(" ").trim();
    const label = known ? n.name : "?";
    const node = el("button", { class: cls, type: "button", disabled: !exits.has(n.id) || busy, title: known ? n.name : "Unbekannt",
      onclick: () => act({ id: "go", to: n.id }) }, label);
    node.style.left = `${mapX(r, n)}%`;
    node.style.top = `${n.y}%`;
    return node;
  });
  box.replaceChildren(svg, ...nodes);
  const s = game.save.stats;
  const facts = [
    ["Lauf", `#${s.runs} · Tier ${r.tier}`],
    ["Bilanz", tally(s)],
    ["Kurze Rast", `${3 - r.shortRests} von 3 übrig`],
    ["Räume", `${r.rooms.filter((n) => n.visited).length} von 5 auf dem Weg`],
  ];
  $("#runFacts").replaceChildren(...facts.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]));
}

function renderDice(roll) {
  const hope = $("#dieHope");
  const fear = $("#dieFear");
  const out = $("#result");
  if (!roll) return;
  hope.querySelector("b").textContent = roll.hopeDie;
  fear.querySelector("b").textContent = roll.fearDie;
  hope.classList.toggle("win", roll.hopeDie >= roll.fearDie);
  fear.classList.toggle("win", roll.fearDie > roll.hopeDie);
  const o = roll.outcome || {};
  const head = roll.total != null
    ? `${roll.traitLabel || ""} ${roll.total}${roll.difficulty ? ` gegen ${roll.difficulty}` : ""}`
    : roll.spoken || "";
  out.replaceChildren(el("b", { text: head.trim() }), " · ", el("span", { class: o.success ? "good" : "bad", text: o.label || "" }),
    roll.damage ? ` · ${roll.damage} Schaden` : "");
}

function renderOverlays() {
  const r = run();
  const ended = r && (r.status === "won" || r.status === "lost");
  $("#endScreen").hidden = !ended;
  if (!ended) return;
  const won = r.status === "won";
  $("#endArt").src = `${SPRITES}${won ? "chest" : "lantern"}.png`;
  $("#endTitle").textContent = won ? "Sieg!" : "Gefallen";
  const s = game.save.stats;
  $("#endText").textContent = won
    ? `${r.hero.name} hat den Glutwächter besiegt und ${r.inventory.gold} Gold mitgebracht. Bilanz: ${tally(s)}.`
    : `${r.hero.name} fällt im Raum „${room().name}“. Der Held bleibt Level ${game.save.profile.level}; ein neuer Lauf beginnt frisch. Bilanz: ${tally(s)}.`;
  const pending = Boolean(game.save.pendingLevel);
  $("#levelBox").hidden = !pending;
  $("#btnNextRun").textContent = pending ? "Level-Up und neuer Lauf" : "Neuer Lauf";
  $("#btnNextRun").disabled = pending && !levelPick;
  if (pending) {
    $("#levelPicks").replaceChildren(...Object.entries(game.meta.levelPicks).map(([key, label]) =>
      el("button", { class: `sg-btn toggle${levelPick === key ? " on" : ""}`, type: "button",
        onclick: () => { levelPick = key; renderOverlays(); } }, label)));
    $("#xpField").hidden = levelPick !== "experience";
    $("#levelText").textContent = `Level ${game.save.profile.level} → ${game.save.profile.level + 1}. Dazu Schwellen +1, Hope voll, ab Level 2/5/8 Proficiency +1.`;
  }
}

function render() {
  if (!run()) return;
  $("#game").hidden = false;
  $("#fear").textContent = run().fear;
  renderLog();
  renderHero();
  renderRoom();
  renderMods();
  renderActions();
  renderMap();
  if (run().last) renderDice(run().last);
  renderOverlays();
}

function renderStart() {
  const save = game.save;
  const live = save.run && !["won", "lost"].includes(save.run.status);
  $("#continueBox").hidden = !save.profile;
  if (save.profile) {
    $("#btnContinue").textContent = live ? "Weiterspielen" : "Zum Lauf";
    $("#continueText").textContent = `${save.profile.name}, Level ${save.profile.level} · ${tally(save.stats)}`;
  }
  $("#heroes").replaceChildren(...game.heroes.map((h) => {
    const sw = el("span", { class: "sg-swatch" });
    sw.style.background = h.color || "#e74806";
    return el("button", { class: "sg-hero-card", type: "button", onclick: () => newGame(h) },
      sw, el("b", { text: h.name }), el("span", { text: `${h.from} · ${h.ancestry ? `${h.ancestry} · ` : ""}${h.class} · Level ${h.level}` }));
  }));
  $("#startScreen").hidden = false;
}

// ---------- Aktionen ----------

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function animate(roll) {
  const hope = $("#dieHope");
  const fear = $("#dieFear");
  hope.classList.remove("win"); fear.classList.remove("win");
  hope.classList.add("rolling"); fear.classList.add("rolling");
  $("#result").textContent = "Die Würfel rollen …";
  const end = Date.now() + ROLL_MS;
  while (Date.now() < end) {
    hope.querySelector("b").textContent = 1 + Math.floor(Math.random() * 12);
    fear.querySelector("b").textContent = 1 + Math.floor(Math.random() * 12);
    await wait(70);
  }
  hope.classList.remove("rolling"); fear.classList.remove("rolling");
  renderDice(roll);
}

// Gegenzug sichtbar spielen: Gegner springt vor, Held blinkt rot bei Treffer,
// eine Zeile unter den Würfeln sagt, was passiert ist.
function foeLine(turn) {
  return turn.rows.map((r) => {
    const head = `${r.label}: W20 ${r.d20} → ${r.total} gegen Evasion ${r.evasion}`;
    if (!r.hit) return `${head} — daneben.`;
    const hurt = r.marks ? `${r.marks} Hit Point${r.marks === 1 ? "" : "s"}` : "kein Hit Point";
    return `${head} — Treffer, ${r.damage} Schaden${r.armor ? ", Armor fängt eine Stufe" : ""}, ${hurt}.`;
  }).join(" ");
}

async function playFoeTurn(turn) {
  const box = $("#foeTurn");
  const foe = $("#foe");
  const hero = document.querySelector(".sg-hero");
  const hit = turn.rows.some((r) => r.hit);
  box.hidden = false;
  box.className = `sg-foe-turn ${hit ? "bad" : "good"}`;
  box.textContent = `Gegenzug · ${foeLine(turn)}`;
  foe.classList.remove("strike");
  void foe.offsetWidth;
  foe.classList.add("strike");
  if (hit && hero) {
    hero.classList.remove("hit");
    void hero.offsetWidth;
    hero.classList.add("hit");
  }
  await wait(FOE_MS);
  foe.classList.remove("strike");
}

async function act(action) {
  if (busy) return;
  busy = true;
  renderActions();
  const seqBefore = run() && run().foeTurn ? run().foeTurn.seq : 0;
  let turn = null;
  try {
    const data = await call("/api/solo/game/act", { action });
    notice = null;
    if (data.roll && data.roll.hopeDie) await animate(data.roll);
    game = data;
    const ft = run() && run().foeTurn;
    if (ft && ft.seq !== seqBefore) turn = ft;
    if (action.id === "attack") mods = { experiences: [], allIn: false };
  } catch (err) {
    say(err.message);
  }
  if (!turn) $("#foeTurn").hidden = true;
  if (turn) {
    // Erst der Raum mit dem Stand vor dem Treffer sichtbar, dann der Gegenzug.
    render();
    await playFoeTurn(turn);
  }
  busy = false;
  render();
}

function choose(a) {
  if (a.id === "attack") return act({ id: "attack", experiences: mods.experiences, allIn: mods.allIn });
  if (a.id === "rest") return openRest();
  if (a.id === "giveup" && !confirm("Wirklich aufgeben? Der Lauf ist dann verloren.")) return undefined;
  return act(a);
}

function openRest() {
  restPicks = [];
  renderRest();
  $("#restScreen").hidden = false;
}

function renderRest() {
  const moves = game.meta.restMoves;
  $("#restMoves").replaceChildren(...Object.entries(moves).map(([key, label]) => {
    const n = restPicks.filter((p) => p === key).length;
    return el("button", { class: `sg-btn toggle${n ? " on" : ""}`, type: "button", disabled: restPicks.length >= 2 && !n,
      onclick: () => { if (restPicks.length < 2) restPicks.push(key); else restPicks = restPicks.filter((p) => p !== key); renderRest(); } },
      n ? `${label} ×${n}` : label);
  }));
  $("#restPicked").textContent = restPicks.length ? restPicks.map((k) => moves[k]).join(" + ") : "Noch nichts gewählt.";
  $("#btnRestGo").disabled = restPicks.length !== 2;
}

async function newGame(h) {
  if (game.save.profile && game.save.run && !["won", "lost"].includes(game.save.run.status)
    && !confirm(`Laufendes Spiel mit ${game.save.profile.name} beenden und neu anfangen?`)) return;
  try {
    game = await call("/api/solo/game/new", { hero: h.key });
    notice = null;
    levelPick = "";
    $("#startScreen").hidden = true;
    resetDice();
    render();
  } catch (err) {
    say(err.message);
  }
}

function resetDice() {
  $("#dieHope").querySelector("b").textContent = "–";
  $("#dieFear").querySelector("b").textContent = "–";
  $("#dieHope").classList.remove("win");
  $("#dieFear").classList.remove("win");
  $("#result").textContent = "Noch kein Wurf.";
}

async function nextRun() {
  try {
    if (game.save.pendingLevel) {
      const res = await call("/api/solo/game/level", { pick: levelPick, experience: $("#xpName").value });
      say(res.text, "good");
      levelPick = "";
    }
    game = await call("/api/solo/game/run", {});
    resetDice();
    render();
  } catch (err) {
    say(err.message);
  }
}

$("#btnRestGo").addEventListener("click", async () => {
  $("#restScreen").hidden = true;
  await act({ id: "rest", moves: restPicks });
});
$("#btnRestCancel").addEventListener("click", () => { $("#restScreen").hidden = true; });
$("#btnContinue").addEventListener("click", () => { $("#startScreen").hidden = true; render(); });
$("#btnNextRun").addEventListener("click", nextRun);
$("#btnNewHero").addEventListener("click", () => { $("#endScreen").hidden = true; renderStart(); });
// ---------- Menü & Einstellungen ----------
// Schriftgrösse teilt sich das Solo mit der Startseite (ember.home.desk.v3,
// fontSize in px, Standard 18). Hier wirkt sie als Faktor auf die rem-Wurzel.
const DESK = "ember.home.desk.v3";
const FONT_BASE = 18;
function deskFont() {
  try {
    const n = Number((JSON.parse(localStorage.getItem(DESK) || "null") || {}).fontSize);
    return n >= 12 && n <= 28 ? n : FONT_BASE;
  } catch { return FONT_BASE; }
}
function setDeskFont(px) {
  let desk = {};
  try { desk = JSON.parse(localStorage.getItem(DESK) || "null") || {}; } catch {}
  desk.fontSize = Math.max(12, Math.min(28, px));
  localStorage.setItem(DESK, JSON.stringify(desk));
  applyFont();
}
function applyFont() {
  const px = deskFont();
  document.documentElement.style.setProperty("--sg-scale", String(px / FONT_BASE));
  const out = $("#fontValue");
  if (out) out.textContent = `${Math.round((px / FONT_BASE) * 100)} %`;
}
applyFont();
window.addEventListener("storage", (ev) => { if (ev.key === DESK) applyFont(); });

function openMenu() {
  $("#menuScreen").hidden = false;
  $("#btnMenuClose").focus();
}
function closeMenu() {
  $("#menuScreen").hidden = true;
}
$("#btnMenu").addEventListener("click", openMenu);
$("#btnStartMenu").addEventListener("click", openMenu);
$("#btnMenuClose").addEventListener("click", closeMenu);
$("#btnMenuHero").addEventListener("click", () => { closeMenu(); $("#endScreen").hidden = true; renderStart(); });
$("#btnFontDown").addEventListener("click", () => setDeskFont(deskFont() - 2));
$("#btnFontUp").addEventListener("click", () => setDeskFont(deskFont() + 2));
$("#btnMenuReset").addEventListener("click", async () => {
  if (!confirm("Spiel zurücksetzen? Held, Lauf und Bilanz werden gelöscht.")) return;
  try {
    game = await call("/api/solo/game/reset", {});
    closeMenu();
    $("#endScreen").hidden = true;
    $("#game").hidden = true;
    resetDice();
    $("#log").replaceChildren();
    say("Spiel zurückgesetzt. Wähle einen Helden.", "good");
    renderStart();
  } catch (err) {
    say(err.message);
  }
});
$("#btnMenuFull").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
});

document.addEventListener("keydown", (ev) => {
  if (ev.target.closest("input, textarea, select, [contenteditable]")) return;
  if (ev.key === "Escape") {
    document.querySelectorAll("#menuScreen, #restScreen").forEach((n) => { n.hidden = true; });
    return;
  }
  if (ev.key.toLowerCase() === "m") {
    if ($("#menuScreen").hidden) openMenu(); else closeMenu();
    return;
  }
  const open = [...document.querySelectorAll(".sg-overlay")].some((n) => !n.hidden);
  if (open) return;
  if (/^[1-9]$/.test(ev.key)) {
    const btn = document.querySelector(`#actions [data-key="${ev.key}"]`);
    if (btn && !btn.disabled) btn.click();
  }
  if (ev.key.toLowerCase() === "r") {
    const rest = game && game.actions.find((a) => a.id === "rest");
    if (rest) openRest();
  }
});

(async () => {
  try {
    game = await call("/api/solo/game");
  } catch (err) {
    say(`Server nicht erreichbar: ${err.message}`);
    return;
  }
  if (run()) render();
  if (!run() || !game.save.profile) renderStart();
  else if (["won", "lost"].includes(run().status)) renderOverlays();
})();
