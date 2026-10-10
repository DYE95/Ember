const $ = (sel) => document.querySelector(sel);
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
let state = { characters: [], sessions: [], active: {}, media: [] };
const seatParams = new URLSearchParams(location.search);
const askedId = seatParams.get("as") || seatParams.get("bogen") || "";
const tabSeat = seatParams.get("tab") === "1" || Boolean(askedId) || sessionStorage.getItem("ember.tab") === "1";
if (tabSeat) sessionStorage.setItem("ember.tab", "1");
const seatBox = tabSeat ? sessionStorage : localStorage;
let meId = askedId || seatBox.getItem("ember.characterId") || "";
let guest = seatParams.get("gast") === "1" || seatBox.getItem("ember.guest") === "1";

function tabToken() {
  let token = sessionStorage.getItem("ember.tabToken");
  if (!token) {
    token = Math.random().toString(16).slice(2, 10);
    sessionStorage.setItem("ember.tabToken", token);
  }
  return token;
}
function playerHref(id, asGuest) {
  const q = new URLSearchParams();
  q.set("tab", "1");
  if (asGuest) q.set("gast", "1");
  else if (id) q.set("as", id);
  return "/player?" + q.toString();
}
function me() { return (state.characters || []).find((c) => c.id === meId); }

function sit(id, asGuest) {
  meId = id || "";
  guest = Boolean(asGuest);
  if (meId) seatBox.setItem("ember.characterId", meId);
  else seatBox.removeItem("ember.characterId");
  seatBox.setItem("ember.guest", guest ? "1" : "0");
  if (tabSeat) {
    const url = new URL(location.href);
    url.searchParams.set("tab", "1");
    if (meId) url.searchParams.set("as", meId);
    else url.searchParams.delete("as");
    if (guest && !meId) url.searchParams.set("gast", "1");
    else url.searchParams.delete("gast");
    history.replaceState(null, "", url.pathname + url.search);
  }
  if (meId) {
    fetch("/api/session/sit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: meId }),
    }).then((r) => r.json()).then((data) => {
      if (data.seat) seatBox.setItem("ember.seat", data.seat);
    }).catch(() => {});
  }
  render();
}

function restoreSeatFromStorage() {
  const storedId = seatBox.getItem("ember.characterId") || "";
  const storedGuest = seatBox.getItem("ember.guest") === "1";
  if (!meId && storedId) meId = storedId;
  if (!meId && !guest && storedGuest) guest = true;
  return Boolean(meId || guest);
}

function claimSeatIfNeeded() {
  if (!meId) return;
  fetch("/api/session/sit", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId: meId }),
  }).then((r) => r.json()).then((data) => {
    if (data.seat) seatBox.setItem("ember.seat", data.seat);
  }).catch(() => {});
}

function applyState(next) {
  state = next;
  // Nach Entsperren/Neuladen: Sitz aus dem Speicher holen, bevor die Gate aufgeht.
  restoreSeatFromStorage();
  if (meId && state.characters && state.characters.length && !state.characters.some((c) => c.id === meId)) {
    // Bogen wirklich weg (andere Kampagne) — Speicher mitraeumen.
    meId = "";
    seatBox.removeItem("ember.characterId");
  }
  const typing = document.activeElement && ["question", "hopeDie", "fearDie", "compQ", "playLogQ"].includes(document.activeElement.id);
  if (!typing) render();
  else {
    const pc = me();
    renderMap($("#mapStage"), state, {
      viewer: pc ? pc.id : "guest",
      actor: "player",
      characterId: pc ? pc.id : null,
      canMove: (t) => pc && t.characterId === pc.id,
    });
  }
}
startStateFeed(applyState);
// Beim ersten Laden und nach dem Entsperren den Sitz am Server erneut anmelden.
claimSeatIfNeeded();
window.emberSit = (id) => sit(id, false);
window.addEventListener("ember:sit", (ev) => {
  const id = ev.detail && ev.detail.characterId;
  if (id) sit(id, false);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  restoreSeatFromStorage();
  claimSeatIfNeeded();
  render();
});

function renderClips() {
  const box = $("#playVideoBox");
  const list = $("#playClips");
  const video = $("#playVideo");
  if (video && typeof attachVideoDeck === "function") attachVideoDeck(video);
  if (!box || !list) return;
  const media = state.media || [];
  if (!media.length) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  list.innerHTML = "";
  media.forEach((clip) => {
    const b = document.createElement("button");
    b.className = "card";
    b.textContent = clip.name;
    b.addEventListener("click", () => {
      video.src = "/uploads/" + clip.file;
      video.play().catch(() => {});
    });
    list.appendChild(b);
  });
}

function renderRoles() {
  const menu = $("#roleMenu");
  if (!menu) return;
  const chars = profileChars();
  menu.innerHTML = "<p class='hint'>Rolle in diesem Tab. Tab öffnet denselben Bogen daneben, ohne diesen Sitz zu übernehmen.</p>" + chars.map((c) => `<button class="card" data-role="${c.id}"><div class="name">${c.name}</div><div class="meta">${c.class || "Spieler"}</div></button><a class="btn tiny" data-tab="${c.id}" href="${playerHref(c.id)}" target="_blank" rel="noopener">Tab</a>`).join("") + `<button class="card" data-role="guest"><div class="name">Gast</div><div class="meta">Karte, kein Bogen</div></button><a class="btn tiny" data-tab="guest" href="${playerHref("", true)}" target="_blank" rel="noopener">Gast-Tab</a><a class="btn" href="/">Spielleitung</a>`;
  menu.querySelectorAll("[data-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = btn.getAttribute("data-role");
      if (role === "guest") sit("", true);
      else sit(role, false);
      menu.classList.add("hidden");
    });
  });
}
$("#btnRoles")?.addEventListener("click", () => $("#roleMenu")?.classList.toggle("hidden"));
let profile = null;
try { profile = JSON.parse(sessionStorage.getItem("ember.profile") || "null"); } catch (err) { profile = null; }
function profileChars() {
  const chars = state.characters || [];
  if (!profile) return [];
  const mine = new Set(profile.characterIds || []);
  return chars.filter((c) => mine.has(c.id));
}
let profileBusy = false;
async function saveProfile(path) {
  if (profileBusy) return;
  const name = $("#profileName")?.value.trim();
  const pin = $("#profilePin")?.value.trim();
  const note = $("#profileNote");
  profileBusy = true;
  if (note) note.textContent = "Einen Moment …";
  let res = null;
  let data = {};
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, pin }) });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    if (note) note.textContent = "Keine Verbindung. Netz prüfen und noch einmal tippen.";
    return;
  } finally {
    profileBusy = false;
  }
  if (!res.ok) { if (note) note.textContent = data.error || "Profil abgelehnt."; return; }
  profile = data;
  sessionStorage.setItem("ember.profile", JSON.stringify({ id: data.id, name: data.name, pin, characterIds: data.characterIds || [] }));
  if (note) note.textContent = data.name + " sitzt. Bögen: " + (data.characterIds || []).length;
  renderGate();
}
$("#btnProfileEnter")?.addEventListener("click", () => saveProfile("/api/profiles/enter"));
$("#btnProfileCreate")?.addEventListener("click", () => saveProfile("/api/profiles"));
function renderGate() {
  const list = $("#seatList");
  if (!list) return;
  list.innerHTML = "";
  const note = $("#profileNote");
  if (note && profile) note.textContent = profile.name + " · " + (profile.characterIds || []).length + " Bögen";
  const chars = profileChars();
  if (!profile) {
    list.innerHTML = "<p class='hint'>Erst Profil anlegen oder eintreten. Ohne PIN kein eigener Bogen.</p>";
    return;
  }
  if (!chars.length) {
    list.innerHTML = "<p class='hint'>Profil steht, noch kein Bogen. Der Spielleiter merkt einen Bogen diesem Namen.</p>";
    return;
  }
  chars.forEach((c) => {
    const b = document.createElement("button");
    b.className = "card";
    b.innerHTML = `<div class="name">${c.name}</div><div class="meta">${c.class || "—"} · Hope ${c.hope}</div>`;
    b.addEventListener("click", () => sit(c.id, false));
    list.appendChild(b);
    const tab = document.createElement("a");
    tab.className = "btn tiny";
    tab.href = playerHref(c.id);
    tab.target = "_blank";
    tab.rel = "noopener";
    tab.textContent = "Neuer Tab";
    tab.addEventListener("click", (ev) => ev.stopPropagation());
    list.appendChild(tab);
  });
}

function render() {
  const pc = me();
  const open = Boolean(pc || guest);
  document.body.classList.toggle("narrating", Boolean(
    (state.sessions || []).find((s) => s.id === state.active?.sessionId)?.narrating
  ));
  if (!open) {
    $("#gate").classList.remove("hidden");
    $("#sheet").classList.add("hidden");
    $("#playActions").classList.add("hidden");
    $("#mapStage")?.classList.add("hidden");
    $("#playVideoBox")?.classList.add("hidden");
    $("#who").textContent = "offen";
  renderGate();
  renderRoles();
  return;
  }
  $("#gate").classList.add("hidden");
  $("#mapStage")?.classList.remove("hidden");
  const watching = location.search.includes("watch=1");
  if (watching) localStorage.setItem("ember.watch", "1");
  else localStorage.removeItem("ember.watch");
  document.body.classList.toggle("seated", open);
  document.querySelector(".player-shell")?.classList.toggle("seated", open);
  $("#playActions")?.classList.toggle("hidden", !pc || watching);
  if (pc && !watching) $("#sheet")?.classList.remove("hidden");
  $("#who").textContent = pc ? pc.name : "Gast";
  renderRoles();
  const sesTurn = (state.sessions || []).find((s) => s.id === state.active?.sessionId);
  const init = sesTurn?.initiative;
  const whoTurn = init?.on && init.order?.length ? init.order[init.index] : null;
  const chip = $("#turnChip");
  if (chip) chip.textContent = whoTurn ? "R" + init.round + " " + whoTurn.label : "keine Reihenfolge";
  const encNow = (sesTurn?.encounters || []).find((e) => e.id === sesTurn.activeEncounterId) || (sesTurn?.encounters || [])[0] || null;
  const doorsSig = (sesTurn?.map?.doors || []).map((d) => d.id + (d.open ? "o" : "z")).join(",");
  const zoneSig = (encNow?.zones || []).map((z) => z.id + (z.sprung ? "1" : "0")).join(",");
  const trapSig = (encNow?.traps || []).map((t) => t.id + (t.sprung ? "1" : "0")).join(",");
  const mapKey = (sesTurn?.map?.tokens || []).map((t) => t.id + ":" + t.x + ":" + t.y + ":" + (t.rev || 0)).join("|")
    + "|" + (sesTurn?.map?.fow?.on ? "1" : "0")
    + "|img:" + (sesTurn?.map?.image || "")
    + "|p:" + (sesTurn?.ping?.at || 0)
    + "|d:" + doorsSig + "|z:" + zoneSig + "|t:" + trapSig;
  if ($("#mapStage")) {
    $("#mapStage").dataset.key = mapKey;
    renderMap($("#mapStage"), state, {
      viewer: pc ? pc.id : "guest",
      actor: "player",
      characterId: pc ? pc.id : null,
      canMove: (token) => pc && token.characterId === pc.id,
    });
  }
  renderClips();
  renderSpur(sesTurn, pc);
  if (!pc) {
    $("#sheet").innerHTML = "<p class='hint'>Gast: Karte und Video. Bogen über „Anderen Bogen“.</p>";
    return;
  }
  const fmt = (n) => { const v = Number(n || 0); return (v >= 0 ? "+" : "") + v; };
  const traits = ["agility","strength","finesse","instinct","presence","knowledge"]
    .map((t) => `<div class="stat"><span>${t}</span><b>${fmt(pc.traits?.[t])}</b></div>`).join("");
  const exp = (pc.experiences || []).map((e) => e.name + " +" + (e.bonus || 0)).join(" · ") || "keine";
  $("#sheet").innerHTML = `
    <p class="hint">${pc.class || "ohne Klasse"} · Lv ${pc.level} · Evasion ${pc.evasion || 10} · Armor ${pc.armorMarked || 0}/${pc.armorScore || 0}</p>
    <h1 style="font-size:24px;margin:0 0 10px;">${pc.name}</h1>
    <p class="hint">Experiences: ${exp}</p>
    <div class="stat-grid">${traits}</div>
    <div class="mark-row" data-mark="hope"></div>
    <div class="mark-row" data-mark="stress"></div>
    <div class="mark-row" data-mark="hp"></div>`;
  const marks = { hope: ["Hope", pc.hope, pc.hopeMax], stress: ["Stress", pc.stressMarked, pc.stressMax], hp: ["HP", pc.hpMarked, pc.hpMax] };
  document.querySelectorAll(".mark-row").forEach((row) => {
    const key = row.dataset.mark;
    const [label, val, max] = marks[key];
    row.innerHTML = `<span>${label}</span>`;
    for (let i = 1; i <= (max || 6); i += 1) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pip" + (i <= val ? " on" : "");
      b.addEventListener("click", () => fetch("/api/characters/" + pc.id, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign(key === "hope" ? { hope: i === val ? i - 1 : i } : key === "stress" ? { stressMarked: i === val ? i - 1 : i } : { hpMarked: i === val ? i - 1 : i }, { seat: seatBox.getItem("ember.seat") || "" })),
      }));
      row.appendChild(b);
    }
  });
  const hands = $("#handouts");
  if (hands) {
    const list = (state._handouts || sesTurn?.handouts || []).filter((h) => !h.sealed && (!h.toId || h.toId === pc.id));
    hands.classList.toggle("hidden", !list.length);
    hands.innerHTML = list.map((h) => `<div class="card"><div class="name">${h.toName ? h.toName + " · " : ""}${h.title}</div><div class="meta">${h.text}</div></div>`).join("");
    fetch("/api/session/handouts?characterId=" + encodeURIComponent(pc.id)).then((r) => r.json()).then((data) => {
      state._handouts = data.handouts || [];
      const mine = state._handouts.filter((h) => !h.toId || h.toId === pc.id);
      hands.classList.toggle("hidden", !mine.length);
      hands.innerHTML = mine.map((h) => `<div class="card"><div class="name">${h.toName ? h.toName + " · " : ""}${h.title}</div><div class="meta">${h.text || ""}</div></div>`).join("");
    }).catch(() => {});
  }
  const playLog = $("#playLog");
  if (playLog) {
    const q = ($("#playLogQ")?.value || "").toLowerCase();
    const kind = $("#playLogKind")?.value || "";
    const rows = (sesTurn?.log || []).filter((e) => (e.kind === "roll" || e.kind === "note") && (!kind || e.kind === kind) && (!q || (e.text + e.author).toLowerCase().includes(q))).slice(-8);
    playLog.classList.toggle("hidden", !rows.length);
    playLog.innerHTML = rows.map((e) => `<div class="log-item ${esc(e.kind)}"><div class="who">${esc(e.author)}</div><div class="txt">${esc(e.text)}</div></div>`).join("");
  }
  const actions = ["— Aktion —",
    ...["Agility","Strength","Finesse","Instinct","Presence","Knowledge"].map((t) => `Action Roll · ${t}`),
    ...(pc.experiences || []).map((e) => `Experience · ${e.name}`),
    "Frage stellen", "Help an Ally"];
  const pick = $("#actionPick");
  const prev = pick?.value;
  if (pick) {
    pick.innerHTML = actions.map((a) => `<option>${a}</option>`).join("");
    if (actions.includes(prev)) pick.value = prev;
  }
  const expPick = $("#expPick");
  if (expPick) {
    const prevExp = expPick.value;
    expPick.innerHTML = `<option value="">—</option>` + (pc.experiences || []).map((e, i) => `<option value="${i}">${e.name} +${e.bonus || 0}</option>`).join("");
    if (prevExp) expPick.value = prevExp;
  }
}

function renderSpur(ses, pc) {
  const box = $("#spurBanner");
  if (!box) return;
  const event = ses?.spur;
  if (!event) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  const left = event.endsAt ? Math.max(0, Math.ceil((event.endsAt - Date.now()) / 1000)) : 0;
  const href = event.href + "?spur=1&back=" + encodeURIComponent("/player");
  box.innerHTML = `<div class="name">Ereignis · ${event.title}</div><div class="meta">${event.ask?.question || event.stake || event.blurb || ""} · ${left}s · ${event.payout === "fear" ? "Fear an den Tisch" : "Hope an den Besten"}</div><a class="btn tiny" href="${href}">Spielen</a>`;
}

$("#btnGuest")?.addEventListener("click", () => sit("", true));
$("#btnLeaveSeat")?.addEventListener("click", () => sit("", false));
$("#rolePick")?.addEventListener("change", (ev) => {
  if (ev.target.value.includes("gast")) localStorage.setItem("ember.guest", "1");
  if (ev.target.value) location.href = ev.target.value;
});
$("#btnSheet")?.addEventListener("click", () => $("#sheet")?.classList.toggle("hidden"));
$("#btnReady")?.addEventListener("click", async () => {
  if (!meId) return;
  const res = await fetch("/api/session/ready", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId: meId, ready: true }),
  });
  const data = await res.json().catch(() => ({}));
  if ($("#tableNote")) $("#tableNote").textContent = res.ok ? "Ready." : (data.error || "Nicht ready.");
});
$("#btnSpotlight")?.addEventListener("click", async () => {
  if (!meId) return;
  const btn = $("#btnSpotlight");
  btn.disabled = true;
  const out = $("#rollOut");
  try {
    const res = await fetch("/api/session/spotlight", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characterId: meId,
        action: ($("#actionPick")?.value || "").startsWith("—") ? "" : $("#actionPick").value,
        question: $("#question").value.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    const note = data.error || (res.ok ? "Spotlight ist beim Tisch." : "Nicht angekommen.");
    if (out) out.textContent = note;
    if ($("#tableNote")) $("#tableNote").textContent = note;
    if (res.ok) $("#question").value = "";
  } catch (err) {
    if (out) out.textContent = "Keine Verbindung.";
    if ($("#tableNote")) $("#tableNote").textContent = "Keine Verbindung.";
  }
  btn.disabled = false;
});
async function playerRoll(table) {
  const pc = me();
  if (!pc) return;
  const action = $("#actionPick").value || "";
  const trait = $("#traitPick")?.value || ["agility","strength","finesse","instinct","presence","knowledge"].find((t) => action.toLowerCase().includes(t));
  const expIndex = $("#expPick")?.value;
  const exp = expIndex !== "" && expIndex != null ? pc.experiences?.[Number(expIndex)] : null;
  const ses = (state.sessions || []).find((s) => s.id === state.active?.sessionId);
  const foes = (ses?.map?.tokens || []).filter((t) => t.kind === "foe" && t.difficulty);
  const pick = $("#foePick");
  if (pick && pick.options.length !== foes.length + 1) {
    const prev = pick.value;
    pick.innerHTML = `<option value="">nächster</option>` + foes.map((t) => `<option value="${t.id}">${t.label} · ${t.difficulty}</option>`).join("");
    if (foes.some((t) => t.id === prev)) pick.value = prev;
  }
  const payload = {
    characterId: pc.id,
    trait,
    traitMod: trait ? Number(pc.traits?.[trait] || 0) : 0,
    experiences: exp ? [{ name: exp.name, bonus: exp.bonus || 0 }] : [],
    tokenId: pick?.value || "",
  };
  if (table) {
    payload.hopeDie = Number($("#hopeDie").value);
    payload.fearDie = Number($("#fearDie").value);
  }
  const out = $("#rollOut");
  try {
    const res = await fetch("/api/roll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (out) out.textContent = data.roll?.spoken || data.error || (res.ok ? "" : "Wurf nicht angekommen.");
  } catch (err) {
    if (out) out.textContent = "Keine Verbindung. Wurf nicht angekommen, bitte noch einmal.";
  }
}
// Langsames Handynetz: Doppeltipp nicht als zweiten Wurf zaehlen.
let rolling = false;
async function rollOnce(table) {
  if (rolling) return;
  rolling = true;
  const btns = [$("#btnRoll"), $("#btnTableRoll")].filter(Boolean);
  btns.forEach((b) => { b.disabled = true; });
  try { await playerRoll(table); } finally {
    rolling = false;
    btns.forEach((b) => { b.disabled = false; });
  }
}
$("#btnRoll")?.addEventListener("click", () => rollOnce(false));
$("#btnTableRoll")?.addEventListener("click", () => rollOnce(true));
$("#btnHarm")?.addEventListener("click", () => {
  if (!meId) return;
  fetch("/api/session/harm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId: meId, amount: Number($("#harmAmount").value || 1) }),
  });
});
$("#btnPing")?.addEventListener("click", () => {
  const pc = me();
  const ses = (state.sessions || []).find((s) => s.id === state.active?.sessionId);
  const token = (ses?.map?.tokens || []).find((t) => t.characterId === pc?.id);
  fetch("/api/session/ping", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: token?.x ?? 50, y: token?.y ?? 50, name: pc?.name || "Gast" }),
  });
});
async function loadCompendium() {
  const q = $("#compQ")?.value || "";
  const kind = $("#compKind")?.value || "";
  const scope = $("#compScope")?.value || "";
  const ticket = ++compTicket;
  let data;
  try {
    const res = await fetch("/api/compendium?q=" + encodeURIComponent(q) + "&kind=" + encodeURIComponent(kind) + "&scope=" + encodeURIComponent(scope));
    data = await res.json();
  } catch { return; }
  // Eine spaetere Suche ist schon unterwegs: alte Antwort nicht mehr malen.
  if (ticket !== compTicket) return;
  const sel = $("#compKind");
  if (sel && sel.options.length < 2 && data.kinds) {
    data.kinds.forEach((k) => {
      const o = document.createElement("option");
      o.value = k.id; o.textContent = k.label;
      sel.appendChild(o);
    });
  }
  const box = $("#compList");
  if (!box) return;
  box.innerHTML = (data.entries || []).map((e) => `<div class="card"><div class="name">${esc(e.name)}</div><div class="meta">${esc(e.kind)} · ${esc(e.text)}</div></div>`).join("") || "<p class='hint'>Nichts dazu.</p>";
}
let compTicket = 0;
let compTimer = 0;
$("#compQ")?.addEventListener("input", () => { clearTimeout(compTimer); compTimer = setTimeout(loadCompendium, 200); });
$("#compKind")?.addEventListener("change", loadCompendium);
$("#compScope")?.addEventListener("change", loadCompendium);
$("#playLogQ")?.addEventListener("input", render);
$("#playLogKind")?.addEventListener("change", render);

setInterval(() => {
  const pc = me();
  fetch("/api/presence", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: (pc ? "seat_" + pc.id : "guest") + (tabSeat ? "_" + tabToken() : ""),
      role: "player",
      name: pc ? pc.name : "Gast",
      characterId: pc ? pc.id : null,
      status: "online",
    }),
  }).catch(() => {});
}, 4000);
