import {
  CELL, COLS, MAX_RANK, ROWS, START_GOLD, START_LIVES, TARGET_LABEL, TOWERS, WAVES, WORLD_H, WORLD_W,
} from "./balance.js";
import { setMuted, unlockAudio } from "./audio.js";
import { render } from "./draw.js";
import { Sim } from "./engine.js";

const TOWER_ORDER = ["mg", "sniper", "mortar"];
const sim = new Sim();
const canvas = document.getElementById("ssCanvas");
const brief = document.getElementById("ssBrief");
const notice = document.getElementById("ssNotice");
const end = document.getElementById("ssEnd");
const focus = document.getElementById("ssFocus");
const towersEl = document.getElementById("ssTowers");
let playing = false;
let muted = false;
let armed = false;
let view = { ox: 0, oy: 0, scale: 1 };
const ctx = canvas.getContext("2d");

function hud() { return sim.hud(); }

function show(el, on) { el.classList.toggle("hidden", !on); }

function paintHud() {
  const h = hud();
  document.getElementById("ssWave").textContent = "Welle " + h.wave + "/" + h.waves;
  document.getElementById("ssLives").textContent = "Leben " + h.lives;
  document.getElementById("ssGold").textContent = "Gold " + h.gold;
  document.getElementById("ssKills").textContent = String(h.kills);
  document.getElementById("ssSpeed").textContent = h.speed + "×";
  document.getElementById("ssPause").disabled = h.phase !== "combat";
  document.getElementById("ssPause").textContent = h.paused ? "Weiter" : "Pause";
  show(document.getElementById("ssPauseLabel"), h.paused && h.phase === "combat");
  show(notice, Boolean(h.notice));
  notice.textContent = h.notice || "";
  const start = document.getElementById("ssStart");
  show(start, playing && h.phase === "prep");
  start.textContent = "Welle " + h.wave + " starten";
  const prep = h.phase === "prep";
  document.getElementById("ssWaveText").textContent = prep
    ? "Nächste Welle: " + (h.nextText || "—") + ". Prämie +" + h.bonus + " Gold."
    : h.phase === "combat"
      ? "Angriff. Noch " + h.remaining + " Gegner."
      : "Die Stellung ist entschieden.";
  show(end, h.phase === "won" || h.phase === "lost");
  if (h.phase === "won" || h.phase === "lost") {
    document.getElementById("ssEndKicker").textContent = h.phase === "won" ? "Sieg" : "Spiel vorbei";
    document.getElementById("ssEndTitle").textContent = h.phase === "won" ? "Tal gehalten" : "Stellung gefallen";
    document.getElementById("ssEndText").textContent = h.phase === "won"
      ? "Keine Welle mehr. Das Tor steht."
      : "Durchbruch in Welle " + h.wave + " von " + h.waves + ".";
    document.getElementById("ssEndStats").textContent =
      h.kills + " Abschüsse · " + h.goldEarned + " Gold · " + h.score + " Punkte";
  }
  towersEl.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("on", h.placing === btn.dataset.type);
  });
  paintFocus(h);
}

function paintFocus(h) {
  const info = h.selected || h.placingInfo;
  if (!info) {
    focus.innerHTML = "<p class='hint'>Wähle ein Geschütz und setze es auf freies Gras.</p>";
    return;
  }
  const def = TOWERS[info.type];
  const rate = (1 / info.interval).toFixed(1);
  const placing = Boolean(h.placingInfo);
  let extra = "";
  if (placing) {
    extra = "<p class='hint'>Tippe auf freies Feld. Kosten " + def.cost + " Gold.</p>";
  } else {
    const dmgLabel = info.dmgRank >= MAX_RANK ? "Maximum" : info.dmgCost + " Gold";
    const rateLabel = info.rateRank >= MAX_RANK ? "Maximum" : info.rateCost + " Gold";
    extra =
      "<button class='btn' type='button' data-up='damage'" + (info.canDmg ? "" : " disabled") + ">Schaden " + info.dmgRank + "/" + MAX_RANK + " · " + dmgLabel + "</button>" +
      "<button class='btn' type='button' data-up='rate'" + (info.canRate ? "" : " disabled") + ">Feuerrate " + info.rateRank + "/" + MAX_RANK + " · " + rateLabel + "</button>" +
      "<button class='btn' type='button' data-act='target'>Ziel · " + TARGET_LABEL[info.mode] + "</button>" +
      "<button class='btn' type='button' data-act='sell'>" + (armed ? "Wirklich verkaufen · " : "Verkaufen · ") + info.sell + " Gold</button>";
  }
  focus.innerHTML =
    "<div class='ss-focus'><h2>" + info.name + "</h2><p class='hint'>" + info.blurb + "</p>" +
    "<div class='ss-stats'><div><span class='hint'>Schaden</span><b>" + info.damage + "</b></div>" +
    "<div><span class='hint'>Schuss/s</span><b>" + rate + "</b></div>" +
    "<div><span class='hint'>Reichweite</span><b>" + def.range + "</b></div></div>" + extra + "</div>";
}

function fit() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const scale = Math.min(w / WORLD_W, h / WORLD_H);
  view = { scale, ox: (w - WORLD_W * scale) / 2, oy: (h - WORLD_H * scale) / 2 };
}

function worldFrom(ev) {
  const rect = canvas.getBoundingClientRect();
  const sx = ((ev.clientX - rect.left) / rect.width) * canvas.width;
  const sy = ((ev.clientY - rect.top) / rect.height) * canvas.height;
  if (view.scale <= 0) return null;
  return { x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale };
}

TOWER_ORDER.forEach((id) => {
  const t = TOWERS[id];
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn";
  btn.dataset.type = id;
  btn.innerHTML = "<b>" + t.short + "</b><span class='hint'> " + t.cost + "</span>";
  btn.addEventListener("click", () => {
    unlockAudio();
    sim.togglePlace(id);
    armed = false;
    paintHud();
  });
  towersEl.appendChild(btn);
});

document.getElementById("ssPlay").addEventListener("click", () => {
  unlockAudio();
  playing = true;
  show(brief, false);
  paintHud();
});
document.getElementById("ssStart").addEventListener("click", () => {
  unlockAudio();
  sim.startWave();
  paintHud();
});
document.getElementById("ssSpeed").addEventListener("click", () => {
  sim.setSpeed(sim.speed === 1 ? 2 : 1);
  paintHud();
});
document.getElementById("ssPause").addEventListener("click", () => {
  sim.togglePause();
  paintHud();
});
document.getElementById("ssMute").addEventListener("click", () => {
  muted = !muted;
  setMuted(muted);
  document.getElementById("ssMute").textContent = muted ? "Stumm" : "Ton";
});
document.getElementById("ssRestart").addEventListener("click", () => {
  sim.reset();
  armed = false;
  show(end, false);
  paintHud();
});
focus.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  if (btn.dataset.up) {
    sim.upgrade(btn.dataset.up);
    armed = false;
  } else if (btn.dataset.act === "target") sim.cycleTarget();
  else if (btn.dataset.act === "sell") {
    if (!armed) armed = true;
    else { sim.sell(); armed = false; }
  }
  paintHud();
});
canvas.addEventListener("pointerdown", (ev) => {
  const h = hud();
  if (!playing || h.phase === "won" || h.phase === "lost") return;
  const p = worldFrom(ev);
  if (!p) return;
  const c = Math.floor(p.x / CELL);
  const r = Math.floor(p.y / CELL);
  sim.clickCell(c, r);
  armed = false;
  paintHud();
});
canvas.addEventListener("pointermove", (ev) => {
  const p = worldFrom(ev);
  if (!p) return;
  const c = Math.floor(p.x / CELL);
  const r = Math.floor(p.y / CELL);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) sim.setHover(null, null);
  else sim.setHover(c, r);
});
canvas.addEventListener("pointerleave", () => sim.setHover(null, null));
canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  sim.placing = null;
  paintHud();
});
window.addEventListener("keydown", (ev) => {
  if (!playing) return;
  // Fokus auf Knopf oder Eingabe: Leertaste/Ziffern gehoeren dem Element.
  if (ev.target && ev.target.closest && ev.target.closest("button, a, input, select, textarea")) return;
  if (ev.key === "1") sim.togglePlace("mg");
  else if (ev.key === "2") sim.togglePlace("sniper");
  else if (ev.key === "3") sim.togglePlace("mortar");
  else if (ev.key === "Escape") { sim.placing = null; sim.selectedId = null; }
  else if (ev.key === " ") {
    ev.preventDefault();
    if (sim.phase === "prep") sim.startWave();
    else sim.togglePause();
  } else return;
  paintHud();
});

let last = performance.now();
let acc = 0;
let lastKey = "";
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing) {
    acc += dt * sim.speed;
    let guard = 0;
    while (acc >= 1 / 60 && guard++ < 8) {
      sim.tick(1 / 60);
      acc -= 1 / 60;
    }
    if (acc > 1 / 30) acc = 0;
    fit();
    render(ctx, sim, view);
    const h = hud();
    const key = [h.phase, h.gold, h.lives, h.wave, h.kills, h.remaining, h.paused, h.speed, h.placing, h.selectedId, h.notice, h.selected && h.selected.dmgRank, h.selected && h.selected.rateRank, h.selected && h.selected.mode].join("|");
    if (key !== lastKey) { lastKey = key; paintHud(); }
  }
  requestAnimationFrame(frame);
}
paintHud();
document.getElementById("ssWaveText").textContent = "Startgold " + START_GOLD + ", Leben " + START_LIVES + ". Verkauf bringt 55 % zurück.";
requestAnimationFrame(frame);
