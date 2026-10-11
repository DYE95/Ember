const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

let state = { campaigns: [], characters: [], sessions: [], active: {}, lan: {} };
let selectedCampaignId = null;
let selectedCharacterId = null;

function applyState(next) {
  state = next;
  if (!selectedCampaignId) selectedCampaignId = state.active.campaignId;
  if (!selectedCharacterId) {
    const first = charsOf(activeCampaignId())[0];
    selectedCharacterId = first ? first.id : null;
  }
  render();
}
startStateFeed(applyState);
if (location.hash.replace("#", "")) emberGo(location.hash.replace("#", ""));
window.addEventListener("hashchange", () => {
  const name = location.hash.replace("#", "");
  if (name) emberGo(name);
});

function activeCampaignId() { return state.active?.campaignId || selectedCampaignId; }
function activeSession() { return (state.sessions || []).find((s) => s.id === state.active?.sessionId) || null; }
function campaignById(id) { return (state.campaigns || []).find((c) => c.id === id); }
function charsOf(campaignId) { return (state.characters || []).filter((c) => !campaignId || c.campaignId === campaignId); }
function currentEncounter() {
  const ses = activeSession();
  if (!ses) return null;
  return (ses.encounters || []).find((e) => e.id === ses.activeEncounterId) || (ses.encounters || [])[0] || null;
}

async function api(url, body, method = "POST") {
  const payload = { ...(body || {}), as: "gm", gmKey: localStorage.getItem("ember.gmKey") || "" };
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Fehler");
  return data;
}

function pips(count, marked, kind, onClick) {
  const wrap = document.createElement("div");
  wrap.className = "pips";
  for (let i = 0; i < count; i += 1) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pip ${kind}${i < marked ? " on" : ""}`;
    b.addEventListener("click", () => onClick(i < marked ? i : i + 1));
    wrap.appendChild(b);
  }
  return wrap;
}

function renderLan() {
  const urls = (state.lan?.addresses || []).map((a) => `http://${a.address}:${state.lan.port}/player`);
  const remote = state.lan?.remote ? `${state.lan.remote}/player` : "";
  $("#lanChip").textContent = remote ? `Zu Hause: ${remote}` : urls[0] ? `Tisch: ${urls[0]}` : "Kein Netzwerk gefunden";
  const box = $("#tunnelUrl");
  if (box) box.textContent = remote || (urls[0] ? "Tunnel wartet. Am Tisch: " + urls[0] : "Tunnel wartet. start.bat offen lassen.");
}

function renderHud() {
  const ses = activeSession();
  const q = ses?.spotlightQueue || [];
  const box = $("#hudQueue");
  if (!box) return;
  if (!q.length) {
    box.innerHTML = `<p class="hint">${ses?.narrating ? "Die Umbra lauscht. Noch keine Hand." : "Noch niemand hebt die Hand."}</p>`;
    return;
  }
  box.innerHTML = "";
  q.forEach((item) => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `<div class="name">${esc(item.name)}</div><div class="meta">${esc(item.action || "Want Spotlight")}<br>${esc(item.question)}</div>`;
    const ok = document.createElement("button");
    ok.className = "btn tiny primary";
    ok.textContent = "Gib ihnen das Licht";
    ok.addEventListener("click", () => api(`/api/session/spotlight/${item.id}/resolve`, { accept: true }));
    const no = document.createElement("button");
    no.className = "btn tiny ghost";
    no.textContent = "Später";
    no.addEventListener("click", () => api(`/api/session/spotlight/${item.id}/resolve`, { accept: false }));
    el.appendChild(ok); el.appendChild(no);
    box.appendChild(el);
  });
}

async function playEvent() {
  const ses = activeSession();
  if (!ses) { alert("Erst die Glut entfachen (Session öffnen)."); return; }
  let enc = currentEncounter();
  if (!enc) {
    const name = prompt("Name des Events?", "Der Boden gibt nach");
    if (!name) return;
    enc = await api("/api/session/encounter", { as: "gm", name });
  }
  await api("/api/session/encounter/status", { as: "gm", status: "live" });
  emberGo("encounter");
}

function renderCampaigns() {
  const list = $("#campaignList");
  if (!list) return;
  list.innerHTML = "";
  (state.campaigns || []).forEach((c) => {
    const b = document.createElement("button");
    b.className = `card${c.id === selectedCampaignId ? " active" : ""}`;
    b.innerHTML = `<div class="name">${esc(c.name)}</div><div class="meta">${esc(c.frame || "kein Frame")} · Fear ${c.gmFear}/${c.fearMax}</div>`;
    b.addEventListener("click", () => { selectedCampaignId = c.id; fillCampaignForm(c); renderCampaigns(); });
    list.appendChild(b);
  });
  const current = campaignById(selectedCampaignId) || state.campaigns[0];
  const busy = document.activeElement && $("#campaignForm")?.contains(document.activeElement);
  if (current && !busy) fillCampaignForm(current);
  const active = campaignById(activeCampaignId());
  const html = active
    ? `<p class="name" style="font-size:28px">${esc(active.name)}</p><p class="hint">${esc(active.frame || "kein Frame")}</p><p>${esc(active.notes || "")}</p>`
    : `<p class="hint">Noch keine Kampagne.</p>`;
  const view = $("#campaignView");
  if (view) view.innerHTML = html;
  const viewManager = $("#campaignViewManager");
  if (viewManager) viewManager.innerHTML = html;
}
function fillCampaignForm(c) {
  selectedCampaignId = c.id;
  const form = $("#campaignForm");
  if (!form) return;
  form.name.value = c.name || "";
  form.frame.value = c.frame || "";
  form.notes.value = c.notes || "";
}

function renderCharacters() {
  const list = $("#characterList");
  if (!list) return;
  list.innerHTML = "";
  charsOf(activeCampaignId()).forEach((c) => {
    const b = document.createElement("button");
    b.className = `card${c.id === selectedCharacterId ? " active" : ""}`;
    b.innerHTML = `<div class="name">${esc(c.name)}</div><div class="meta">${esc(c.class || "—")} · PIN ${esc(c.playerPin)}</div>`;
    b.addEventListener("click", () => { selectedCharacterId = c.id; fillCharacterForm(c); renderCharacters(); renderCharacterSheet(); });
    const tab = document.createElement("a");
    tab.className = "btn tiny";
    tab.href = "/player?as=" + encodeURIComponent(c.id) + "&tab=1";
    tab.target = "_blank";
    tab.rel = "noopener";
    tab.textContent = "Tab";
    tab.addEventListener("click", (ev) => ev.stopPropagation());
    b.appendChild(tab);
    list.appendChild(b);
  });
  const current = charsOf(activeCampaignId()).find((c) => c.id === selectedCharacterId) || charsOf(activeCampaignId())[0];
  const busy = document.activeElement && $("#characterForm")?.contains(document.activeElement);
  if (current && !busy) { selectedCharacterId = current.id; fillCharacterForm(current); }
  renderCharacterSheet();
}
function fillCharacterForm(c) {
  const form = $("#characterForm");
  if (!form) return;
  form.name.value = c.name || "";
  if (form.pronouns) form.pronouns.value = c.pronouns || "";
  form.ancestry.value = c.ancestry || "";
  form.community.value = c.community || "";
  form.level.value = c.level || 1;
  form.class.value = c.class || "";
  fillSubclass(form, c.class, c.subclass);
  ["agility","strength","finesse","instinct","presence","knowledge"].forEach((t) => { form[t].value = c.traits?.[t] ?? 0; });
  form.hope.value = c.hope ?? 2;
  form.stressMarked.value = c.stressMarked ?? 0;
  form.hpMarked.value = c.hpMarked ?? 0;
  form.stressMax.value = c.stressMax ?? 6;
  form.hpMax.value = c.hpMax ?? 6;
  form.evasion.value = c.evasion ?? 10;
  form.major.value = c.major ?? 7;
  form.severe.value = c.severe ?? 14;
  form.proficiency.value = c.proficiency ?? 1;
  form.experiencesText.value = (c.experiences || []).map((e) => `${e.name} | ${e.bonus}`).join("\n");
  form.featuresText.value = (c.features || []).map((f) => `${f.name} — ${f.text || ""}`).join("\n");
  if (form.notes) form.notes.value = c.notes || "";
  if ($("#playerPin")) $("#playerPin").textContent = c.playerPin || "—";
  if ($("#photoBox")) $("#photoBox").innerHTML = (c.sheetPhotos || []).map((p) => `<img src="/uploads/${p.file}" alt="" />`).join("");
  const frame = $("#tokenFrame");
  if (frame && frame.dataset.char !== c.id) {
    frame.dataset.char = c.id;
    frame.src = "/token?embed=1&char=" + encodeURIComponent(c.id);
  }
}
function renderCharacterSheet() {
  const c = (state.characters || []).find((x) => x.id === selectedCharacterId);
  const html = !c
    ? "<p class='hint'>Kein Bogen.</p>"
    : `<div class="menu-card" style="width:min(720px,96%);margin:20px auto;text-align:left;">
    <h1>${esc(c.name)}</h1>
    <p class="hint">${esc(c.class || "")} · PIN ${esc(c.playerPin)}</p>
    <div class="stat-grid">${["agility","strength","finesse","instinct","presence","knowledge"].map((t) =>
      `<div class="stat"><span>${t}</span><b>${c.traits?.[t] >= 0 ? "+" : ""}${c.traits?.[t] ?? 0}</b></div>`).join("")}</div>
    <p>Hope ${c.hope}/${c.hopeMax} · Stress ${c.stressMarked}/${c.stressMax} · HP ${c.hpMarked}/${c.hpMax}</p>
  </div>`;
  for (const sel of ["#characterView", "#characterViewManager"]) {
    const root = $(sel);
    if (root) root.innerHTML = html;
  }
}

function renderEncounter() {
  const ses = activeSession();
  const enc = currentEncounter();
  if ($("#encMeta")) $("#encMeta").textContent = !ses ? "Erst die Glut entfachen." : enc ? enc.name + " · " + enc.status : "Kein Event bereit.";
  const list = $("#encList");
  if (list) {
    list.innerHTML = "";
    (ses?.encounters || []).forEach((e) => {
      const b = document.createElement("button");
      b.className = "card" + (enc && e.id === enc.id ? " active" : "");
      b.innerHTML = `<div class="name">${esc(e.name)}</div><div class="meta">${esc(e.status)} · Snares ${(e.traps||[]).length} · Thresholds ${(e.zones||[]).length}</div>`;
      b.addEventListener("click", () => api("/api/session/encounter/select", { as: "gm", id: e.id }));
      list.appendChild(b);
    });
  }
  if ($("#encAlerts")) {
    $("#encAlerts").innerHTML = (enc?.alerts || []).map((a) =>
      `<div class="card"><div class="name">${a.kind}</div><div class="meta">${a.text}</div></div>`
    ).join("") || "<p class='hint'>Die Dunkelheit hält noch still.</p>";
  }
  renderMap($("#mapStage"), state, { viewer: "gm", actor: "gm", canMove: () => true });
  renderMap($("#hubMap"), state, { viewer: "gm", actor: "gm", canMove: () => true });
  if ($("#btnFow")) $("#btnFow").textContent = ses?.map?.fow?.on ? "Umbra: AN" : "Umbra: AUS";
  const tone = { ready: "liegt im Dunkeln bereit", live: "läuft — der Boden hat nachgegeben", ended: "ist verloschen" };
  if ($("#sessionEncName")) $("#sessionEncName").textContent = enc ? enc.name : "Kein Event bereit";
  if ($("#sessionEncStatus")) $("#sessionEncStatus").textContent = enc
    ? tone[enc.status] || enc.status
    : "Unter Events eine Karte bereitlegen. Dann, mitten in der Geschichte: Play Event.";
  const init = ses?.initiative;
  const who = init?.on && init.order?.length ? init.order[init.index] : null;
  if ($("#sessionTurn")) $("#sessionTurn").textContent = who ? "Initiative · Runde " + init.round + " · " + who.label : "";
  const meta = $("#initMeta");
  const initRows = $("#initList");
  if (meta) meta.textContent = who
    ? "Runde " + init.round + " · " + who.label + " ist dran." + (init.auto === false ? " Ablauf von Hand." : " Wurf gibt weiter.")
    : "Noch keine Reihenfolge. Play Event setzt sie aus den Tokens.";
  if (initRows) {
    initRows.innerHTML = "";
    (init?.order || []).forEach((row, i) => {
      const el = document.createElement("div");
      el.className = "card init-row" + (i === init.index && init.on ? " current" : "");
      const label = document.createElement("span");
      label.className = "grow";
      label.textContent = (i + 1) + " " + row.label;
      const up = document.createElement("button");
      up.type = "button"; up.className = "btn tiny"; up.textContent = "↑";
      up.addEventListener("click", () => api("/api/session/initiative", { as: "gm", action: "up", id: row.id }));
      const down = document.createElement("button");
      down.type = "button"; down.className = "btn tiny"; down.textContent = "↓";
      down.addEventListener("click", () => api("/api/session/initiative", { as: "gm", action: "down", id: row.id }));
      const go = document.createElement("button");
      go.type = "button"; go.className = "btn tiny"; go.textContent = "dran";
      go.addEventListener("click", () => api("/api/session/initiative", { as: "gm", action: "set", id: row.id }));
      el.appendChild(label); el.appendChild(up); el.appendChild(down); el.appendChild(go);
      initRows.appendChild(el);
    });
    if (!init?.order?.length) initRows.innerHTML = "<p class='hint'>Tokens auf die Karte, dann Aus Tokens.</p>";
  }
}

function renderSession() {
  const camp = campaignById(activeCampaignId());
  const ses = activeSession();
  if ($("#sessionMeta")) $("#sessionMeta").textContent = camp ? `${camp.name}${ses ? " · Glut offen" : ""}` : "Keine Kampagne.";
  const hub = $("#hubCampaign");
  if (hub) hub.textContent = camp ? camp.name : "Keine Kampagne";
  const loaded = document.getElementById("loadedStory");
  if (loaded) loaded.textContent = camp ? camp.name : "nichts geladen";
  const pick = $("#campaignPick");
  if (pick && document.activeElement !== pick) {
    pick.innerHTML = `<option value="">—</option>` + (state.campaigns || []).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    pick.value = activeCampaignId() || "";
  }
  const readyList = $("#readyList");
  const seated = charsOf(activeCampaignId()).filter((c) => Number.isInteger(c.tableSeat) || (state.presence || []).some((p) => p.characterId === c.id && p.status !== "offline"));
  const ready = ses?.ready || {};
  if (readyList) {
    readyList.innerHTML = "<p class='hint'>Wer ist on</p><p class='hint'>Bereit für die Geschichte</p>" + (seated.map((c) => `<div class="card seat-claim" data-id="${esc(c.id)}"><div class="name">${esc(c.name)}</div><div class="meta">${ready[c.id] ? "bereit" : "wartet"}</div></div>`).join("") || "<p class='hint'>Noch niemand sitzt.</p>");
    readyList.querySelectorAll(".seat-claim").forEach((card) => card.addEventListener("click", () => claimSeat(card.dataset.id, card.querySelector(".name").textContent)));
  }
  const enter = $("#btnEnter");
  if (enter && window.hubEnter) {
    const how = window.hubEnter({ hasCampaign: Boolean(camp), seated: seated.length, ready: seated.filter((c) => ready[c.id]).length });
    enter.disabled = how.disabled;
    enter.dataset.action = how.action;
    enter.textContent = how.label;
    const hint = $("#hubHint");
    if (hint) hint.textContent = how.hint;
    if (how.auto) {
      $("#sessionHub")?.classList.add("hidden");
      $("#sessionLive")?.classList.remove("hidden");
    }
  }
  if ($("#btnNarrate")) {
    $("#btnNarrate").textContent = ses?.narrating ? "Die Stimme senken" : "Speak the Dark";
    $("#btnNarrate").disabled = !ses;
  }
  if ($("#btnEndSession")) $("#btnEndSession").disabled = !ses;
  document.body.classList.toggle("narrating", Boolean(ses?.narrating));
  const fearBox = $("#fearPips");
  if (fearBox) {
    fearBox.innerHTML = "";
    if (camp) fearBox.appendChild(pips(camp.fearMax || 12, camp.gmFear || 0, "fear", (n) => api(`/api/campaigns/${camp.id}/fear`, { gmFear: n })));
  }
  const players = $("#sessionPlayers");
  if (players) {
    players.innerHTML = "";
    charsOf(activeCampaignId()).forEach((c) => {
      const seat = (state.presence || []).find((p) => p.characterId === c.id);
      const queued = (ses?.spotlightQueue || []).some((q) => q.characterId === c.id);
      const spot = ses?.activeSpotlight && ses.activeSpotlight.characterId === c.id;
      const code = spot ? "spotlight" : queued ? "queued" : (seat?.status || "");
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `<div class="name">${esc(c.name)}</div><div class="status"><span class="dot ${code}"></span>${statusLabel(code)}</div>`;
      const tab = document.createElement("a");
      tab.className = "btn tiny";
      tab.href = "/player?as=" + encodeURIComponent(c.id) + "&tab=1";
      tab.target = "_blank";
      tab.rel = "noopener";
      tab.textContent = "Tab";
      el.appendChild(tab);
      players.appendChild(el);
    });
  }
  const table = $("#tableIndicator");
  if (table && window.renderTableIndicator) renderTableIndicator(table, state);
  const harmFoe = $("#harmFoe");
  if (harmFoe) {
    const current = harmFoe.value;
    const foes = (ses?.map?.tokens || []).filter((t) => t.kind === "foe");
    harmFoe.innerHTML = `<option value="">Foe wählen</option>` + foes.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}${t.stressMax ? " " + (t.stress || 0) + "/" + t.stressMax : ""}</option>`).join("");
    if (current) harmFoe.value = current;
  }
  const log = $("#sessionLog");
  if (log) {
    log.innerHTML = "";
    const q = ($("#logQ")?.value || "").toLowerCase();
    const kind = $("#logKind")?.value || "";
    (ses?.log || []).filter((entry) => {
      const blob = (entry.author + " " + entry.text).toLowerCase();
      if (q && !blob.includes(q)) return false;
      if (kind === "spotlight") return /spotlight/.test(blob);
      if (kind === "initiative") return /initiative|runde /.test(blob);
      if (kind === "handout") return /handout/.test(blob);
      return !kind || entry.kind === kind;
    }).forEach((entry) => {
      const el = document.createElement("div");
      el.className = `log-item ${entry.kind}`;
      el.innerHTML = `<div class="who">${esc(entry.author)}</div><div class="txt">${esc(entry.text)}</div>`;
      log.appendChild(el);
    });
    log.scrollTop = log.scrollHeight;
  }
  const journal = $("#journalList");
  if (journal) {
    const notes = state._journal || ses?.journal || [];
    journal.innerHTML = [...notes].reverse().map((j) =>
      `<div class="card"><div class="name">${esc(j.title || "Notiz")}${j.secret ? " · geheim" : ""}</div><div class="meta">${esc(j.text || (j.secret ? "nur am SL-Tisch" : ""))}</div></div>`
    ).join("") || "<p class='hint'>Noch keine Notizen.</p>";
    const key = localStorage.getItem("ember.gmKey") || "";
    if (key && ses) {
      fetch("/api/session/journal?gmKey=" + encodeURIComponent(key)).then((r) => r.json()).then((data) => {
        if (!data.journal) return;
        state._journal = data.journal;
        journal.innerHTML = [...data.journal].reverse().map((j) =>
          `<div class="card"><div class="name">${esc(j.title)}${j.secret ? " · geheim" : ""}</div><div class="meta">${esc(j.text)}</div></div>`
        ).join("") || "<p class='hint'>Noch keine Notizen.</p>";
      }).catch(() => {});
    }
  }
  renderSpur(ses);
  const sel = $("#rollCharacter");
  if (sel) {
    const current = sel.value;
    sel.innerHTML = charsOf(activeCampaignId()).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    if (current) sel.value = current;
    fillExperiences();
  }
  renderEncounter();
  renderHud();
  renderGmRoles();
}

function renderGmRoles() {
  const menu = $("#roleMenu");
  if (!menu || document.activeElement && menu.contains(document.activeElement)) return;
  const chars = charsOf(activeCampaignId());
  menu.innerHTML = "<p class='hint'>Rollen am Tisch</p>" +
    `<button class="card" data-go="session"><div class="name">Spielleitung</div><div class="meta">diese Glut</div></button>` +
    chars.map((c) => `<a class="card" href="/player" data-sit="${c.id}"><div class="name">${c.name}</div><div class="meta">${c.class || "Spieler"}</div></a>`).join("") +
    `<a class="card" href="/player?gast=1"><div class="name">Gast</div><div class="meta">Karte, kein Bogen</div></a>` +
    `<a class="card" href="/player?watch=1"><div class="name">Zuschauer</div><div class="meta">schaut nur</div></a>` +
    `<a class="btn" href="/">Co-SL</a><a class="btn" href="/karten">Karten</a><a class="btn" href="/solo">Solo</a>`;
  menu.querySelectorAll("[data-sit]").forEach((link) => {
    link.addEventListener("click", () => localStorage.setItem("ember.characterId", link.getAttribute("data-sit")));
  });
}

function fillExperiences() {
  const pc = (state.characters || []).find((c) => c.id === $("#rollCharacter")?.value);
  const box = $("#rollExperience");
  if (!box) return;
  box.innerHTML = `<option value="">—</option>` + (pc?.experiences || []).map((e) => `<option value="${esc(e.id)}">${esc(e.name)} +${esc(e.bonus)}</option>`).join("");
}

function parseExperiences(text) {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, bonus] = line.split("|").map((s) => s.trim());
    return { id: "xp_" + Math.random().toString(16).slice(2), name, bonus: Number(bonus || 2) };
  });
}
function parseFeatures(text) {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, ...rest] = line.split("—");
    return { id: "feat_" + Math.random().toString(16).slice(2), name: name.trim(), text: rest.join("—").trim() };
  });
}

function tableFoeDifficulty() {
  const foe = (activeSession()?.map?.tokens || []).find((t) => t.id === $("#harmFoe")?.value && t.difficulty);
  return foe ? Number(foe.difficulty) : 0;
}
async function sendRoll(source) {
  const characterId = $("#rollCharacter").value;
  const pc = (state.characters || []).find((c) => c.id === characterId);
  const trait = $("#rollTrait").value;
  const expId = $("#rollExperience").value;
  const foes = (activeSession()?.map?.tokens || []).filter((t) => t.kind === "foe" && t.difficulty);
  const pick = $("#rollFoe");
  if (pick) {
    const prev = pick.value;
    pick.innerHTML = `<option value="">nächster</option>` + foes.map((t) => `<option value="${esc(t.id)}">${esc(t.label)} · ${t.difficulty}</option>`).join("");
    if (foes.some((t) => t.id === prev)) pick.value = prev;
  }
  const chosen = foes.find((t) => t.id === pick?.value) || foes[0];
  const who = $("#handoutWho");
  if (who) {
    const prev = who.value;
    who.innerHTML = `<option value="">ganzer Tisch</option>` + charsOf(activeCampaignId()).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    if ([...who.options].some((o) => o.value === prev)) who.value = prev;
  }
  const box = $("#foeDiff");
  if (box) box.textContent = chosen ? chosen.label + " schiebt " + chosen.difficulty + ", solange das Feld leer ist." : "Kein Foe mit Difficulty auf der Karte.";
  const payload = {
    characterId, source, trait,
    traitMod: trait && pc ? Number(pc.traits[trait] || 0) : 0,
    experiences: expId && pc ? pc.experiences.filter((e) => e.id === expId) : [],
    mode: $("#rollMode").value,
    tokenId: pick?.value || "",
  };
  const typed = $("#rollDifficulty")?.value;
  if (typed) payload.difficulty = Number(typed);
  if (source === "table") {
    payload.hopeDie = Number($("#tableHope").value);
    payload.fearDie = Number($("#tableFear").value);
  }
  const result = await api("/api/roll", payload);
  $("#lastRoll").textContent = result.roll.spoken;
}

async function renderChats() {
  const box = $("#chatList");
  if (!box) return;
  const rows = await fetch("/api/chats").then((r) => r.json()).catch(() => []);
  box.innerHTML = rows.map((c) => `<div class="card"><div class="name">${esc(c.title)}</div><div class="meta">${esc(c.text)}</div></div>`).join("") || "<p class='hint'>Noch keine Fäden.</p>";
}
function render() {
  try {
    renderLan();
    renderCampaigns();
    renderCharacters();
    renderSession();
    renderChats();
  } catch (err) {
    const box = $("#emberError");
    if (box) { box.hidden = false; box.textContent = err.message; }
  }
}

function renderSpur(ses) {
  const box = $("#spurLive");
  if (!box) return;
  const event = ses?.spur;
  const prepared = campaignById(activeCampaignId())?.spurs || [];
  const live = event
    ? `<div class="name">${esc(event.title)}</div><div class="meta">${esc(event.ask?.question || event.stake || event.blurb || "")}</div><div class="meta">${esc((event.scores || []).map((s) => s.name + (s.score ? " " + s.score : "")).join(", ") || "noch keine Meldung")}</div>`
    : "<p class='hint'>Keins am Tisch. Werfen, dann spielen alle kurz.</p>";
  const saved = prepared.map((s) => `<button class="btn tiny" type="button" data-spur="${esc(s.game)}" data-stake="${esc(s.stake || "")}">${esc(s.title)}</button>`).join(" ");
  box.innerHTML = live + (saved ? `<div class="meta" style="margin-top:8px;">In der Kampagne</div>${saved}` : "");
  box.querySelectorAll("[data-spur]").forEach((btn) => {
    btn.addEventListener("click", () => api("/api/session/spur", { game: btn.dataset.spur, stake: btn.dataset.stake, title: btn.textContent }).catch((err) => alert(err.message)));
  });
}

$("#spurGame")?.addEventListener("change", () => {
  $("#pulsAsk")?.classList.toggle("hidden", $("#spurGame")?.value !== "puls");
});
$("#btnSpur")?.addEventListener("click", () => {
  const game = $("#spurGame")?.value;
  const stake = $("#spurStake")?.value || "";
  api("/api/session/spur", {
    game,
    stake,
    payout: $("#spurPayout")?.value || "hope",
    seconds: Number($("#spurSeconds")?.value || 45),
    keep: Boolean($("#spurKeep")?.checked),
    question: $("#spurQuestion")?.value || "",
    a: $("#spurA")?.value || "",
    b: $("#spurB")?.value || "",
    c: $("#spurC")?.value || "",
    right: $("#spurRight")?.value || "a",
  }).catch((err) => alert(err.message));
});
$("#btnSpurEnd")?.addEventListener("click", () => api("/api/session/spur/end", {}).catch((err) => alert(err.message)));
$("#btnUmbra")?.addEventListener("click", () => api("/api/campaigns/import-umbra", {}).catch((err) => alert(err.message)));
$("#btnStartSession")?.addEventListener("click", () => api("/api/session/start", { campaignId: activeCampaignId() }).catch((err) => alert(err.message)));
$("#btnEndSession")?.addEventListener("click", () => api("/api/session/end", {}));
$("#btnNarrate")?.addEventListener("click", () => {
  const ses = activeSession();
  if (!ses) return;
  api("/api/session/narrate", { narrating: !ses.narrating });
});
$("#btnLog")?.addEventListener("click", () => {
  const text = $("#logText").value.trim();
  if (!text) return;
  api("/api/session/log", { text, author: "SL" });
  $("#logText").value = "";
});
$("#btnDigitalRoll")?.addEventListener("click", () => sendRoll("digital"));
$("#btnTableRoll")?.addEventListener("click", () => sendRoll("table"));
$("#btnShortRest")?.addEventListener("click", () => api("/api/session/rest", { characterId: $("#rollCharacter").value, kind: "short", spendHope: 1 }).catch((err) => alert(err.message)));
$("#btnLongRest")?.addEventListener("click", () => api("/api/session/rest", { characterId: $("#rollCharacter").value, kind: "long" }).catch((err) => alert(err.message)));
$("#btnFoeTurn")?.addEventListener("click", () => {
  const tokenId = $("#rollFoe")?.value || $("#harmFoe")?.value;
  if (!tokenId) return alert("Erst den Foe wählen.");
  api("/api/session/foe-turn", { tokenId, characterId: $("#rollCharacter").value }).catch((err) => alert(err.message));
});
$("#btnHarm")?.addEventListener("click", () => {
  const tokenId = $("#harmFoe")?.value;
  if (!tokenId) return alert("Erst den Foe wählen.");
  api("/api/session/harm", { as: "gm", tokenId, amount: Number($("#harmAmount").value || 1) });
});
$("#btnPlayEvent")?.addEventListener("click", playEvent);
$("#btnPlayEvent2")?.addEventListener("click", playEvent);
$("#btnInitNext")?.addEventListener("click", () => api("/api/session/initiative", { as: "gm", action: "next" }));
$("#btnInitPrev")?.addEventListener("click", () => api("/api/session/initiative", { as: "gm", action: "prev" }));
$("#btnInitSide")?.addEventListener("click", () => api("/api/session/initiative", { as: "gm", action: "side" }));
$("#btnInitSeed")?.addEventListener("click", () => api("/api/session/initiative", { as: "gm", action: "seed" }));
document.addEventListener("keydown", (ev) => {
  if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
  if (ev.key === "n" || ev.key === "N") {
    ev.preventDefault();
    api("/api/session/initiative", { as: "gm", action: ev.shiftKey ? "prev" : "next" });
  }
});
$("#btnNewEnc")?.addEventListener("click", async () => {
  const name = prompt("Name des Events?", "Der Boden gibt nach");
  if (!name) return;
  await api("/api/session/encounter", { as: "gm", name });
});
$("#btnEncEnd")?.addEventListener("click", () => api("/api/session/encounter/status", { as: "gm", status: "ended" }));
$("#btnVoice")?.addEventListener("click", () => api("/api/session/voice", { as: "gm" }));
$("#btnFear")?.addEventListener("click", () => api("/api/session/fear-spend", { as: "gm" }).catch((err) => alert(err.message)));
$("#btnUndo")?.addEventListener("click", () => api("/api/session/undo", { as: "gm" }).catch((err) => alert(err.message)));
$("#btnHandout")?.addEventListener("click", () => {
  const title = prompt("Handout?", "Die Kiste");
  if (!title) return;
  const text = prompt("Text?", "") || "";
  api("/api/session/handout", { as: "gm", title, text, toId: $("#handoutWho")?.value || "" });
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
  const box = $("#compList");
  const sel = $("#compKind");
  if (sel && sel.options.length < 2 && data.kinds) {
    data.kinds.forEach((k) => {
      const o = document.createElement("option");
      o.value = k.id; o.textContent = k.label;
      sel.appendChild(o);
    });
  }
  if (!box) return;
  box.innerHTML = (data.entries || []).map((e) => `<div class="card"><div class="name">${esc(e.name)}</div><div class="meta">${esc(e.kind)} · ${esc(e.text)}</div></div>`).join("") || "<p class='hint'>Nichts dazu.</p>";
}
let compTicket = 0;
let compTimer = 0;
$("#compQ")?.addEventListener("input", () => { clearTimeout(compTimer); compTimer = setTimeout(loadCompendium, 200); });
$("#compKind")?.addEventListener("change", loadCompendium);
$("#compScope")?.addEventListener("change", loadCompendium);
loadCompendium();
$("#logQ")?.addEventListener("input", render);
$("#logKind")?.addEventListener("change", render);
$("#btnDictate")?.addEventListener("click", () => {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const box = $("#logText");
  if (!Rec) {
    if (box) { box.focus(); box.placeholder = "Browser diktiert nicht. Satz hier, dann Ins Log."; }
    return;
  }
  const rec = new Rec();
  rec.lang = "de-DE";
  rec.onresult = (ev) => {
    const text = ev.results[0][0].transcript;
    if (box) box.value = (box.value ? box.value + " " : "") + text;
  };
  rec.onerror = () => { if (box) box.placeholder = "Diktat abgebrochen. Satz hier, dann Ins Log."; };
  rec.start();
});
$$("[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    MapKit.tool = btn.getAttribute("data-tool");
    MapKit.zoneStart = null;
    $$("[data-tool]").forEach((b) => b.classList.toggle("on", b === btn));
  });
});
$("#btnAddFoe")?.addEventListener("click", () => {
  const label = prompt("Foe?", "Ambusher");
  if (!label) return;
  const difficulty = Number(prompt("Difficulty?", "15") || 15);
  api("/api/session/map/token", { as: "gm", kind: "foe", label, color: "#6a040f", x: 55, y: 40, difficulty, stressMax: 4, thresholds: "5/11" });
});
$("#btnAddPin")?.addEventListener("click", () => {
  const label = prompt("Pin?", "Die Kiste");
  if (label) api("/api/session/map/token", { as: "gm", kind: "marker", label, color: "#e9c46a", x: 48, y: 48 });
});
$("#mapPick")?.addEventListener("change", async (ev) => {
  if (!ev.target.value) return;
  try {
    await api("/api/session/map/image", { as: "gm", image: ev.target.value });
  } catch (err) {
    alert("Boden nicht gesetzt: " + (err.message || "Unbekannter Fehler"));
  }
});
$("#btnJournal")?.addEventListener("click", () => api("/api/session/journal", {
  as: "gm",
  title: $("#journalTitle")?.value || "Notiz",
  text: $("#journalText")?.value || "",
  secret: Boolean($("#journalSecret")?.checked),
}));
$("#btnWall")?.addEventListener("click", () => document.getElementById("sceneWall")?.classList.toggle("hidden"));
$("#btnFow")?.addEventListener("click", () => api("/api/session/map/fow", { as: "gm", on: !activeSession()?.map?.fow?.on }));
$("#btnFowClear")?.addEventListener("click", () => { MapKit.draggingId = null; api("/api/session/map/fow", { as: "gm", clear: true, on: true }); });
$("#mapImage")?.addEventListener("change", (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const data = String(reader.result).split(",")[1] || "";
    const ext = /\.png$/i.test(file.name) ? "png" : "jpg";
    api("/api/session/map/image", { as: "gm", data, ext });
  };
  reader.readAsDataURL(file);
});
$("#btnNewCampaign")?.addEventListener("click", async () => {
  const name = prompt("Name?", "Neue Glut");
  if (!name) return;
  const c = await api("/api/campaigns", { name, frame: "Age of Umbra" });
  selectedCampaignId = c.id;
});
$("#campaignForm")?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!selectedCampaignId) return;
  const form = ev.target;
  await api(`/api/campaigns/${selectedCampaignId}`, { name: form.name.value, frame: form.frame.value, notes: form.notes.value }, "PATCH");
  await api("/api/active-campaign", { campaignId: selectedCampaignId });
});
$("#btnUseCampaign")?.addEventListener("click", () => selectedCampaignId && api("/api/active-campaign", { campaignId: selectedCampaignId }));
$("#campaignPick")?.addEventListener("change", (ev) => {
  if (ev.target.value) api("/api/active-campaign", { campaignId: ev.target.value });
});
$("#btnQuickstart")?.addEventListener("click", async () => {
  const res = await api("/api/quickstart/sablewood", {});
  selectedCampaignId = res.campaignId;
});
$("#btnNewCharacter")?.addEventListener("click", async () => {
  const name = prompt("Name?", "Neu");
  if (!name) return;
  const c = await api("/api/characters", { name, campaignId: activeCampaignId() });
  selectedCharacterId = c.id;
});
$("#characterForm")?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!selectedCharacterId) return;
  const form = ev.target;
  await api(`/api/characters/${selectedCharacterId}`, {
    name: form.name.value, pronouns: form.pronouns.value, ancestry: form.ancestry.value,
    community: form.community.value, level: Number(form.level.value || 1),
    class: form.class.value, subclass: form.subclass.value,
    traits: {
      agility: Number(form.agility.value||0), strength: Number(form.strength.value||0),
      finesse: Number(form.finesse.value||0), instinct: Number(form.instinct.value||0),
      presence: Number(form.presence.value||0), knowledge: Number(form.knowledge.value||0),
    },
    hope: Number(form.hope.value||0), stressMarked: Number(form.stressMarked.value||0),
    hpMarked: Number(form.hpMarked.value||0), stressMax: Number(form.stressMax.value||6),
    hpMax: Number(form.hpMax.value||6), evasion: Number(form.evasion.value||10),
    major: Number(form.major.value||7), severe: Number(form.severe.value||14),
    proficiency: Number(form.proficiency.value||1),
    experiences: parseExperiences(form.experiencesText.value),
    features: parseFeatures(form.featuresText.value),
    notes: form.notes.value,
  }, "PATCH");
});
window.addEventListener("message", async (ev) => {
  // Nur das eigene Tokenatelier (iframe) darf Tokens schicken, keine fremde Seite.
  if (ev.origin !== location.origin) return;
  const msg = ev.data;
  if (!msg || msg.type !== "ember-token") return;
  const id = msg.charId || selectedCharacterId;
  if (!id) return alert("Erst einen Bogen wählen.");
  await api(`/api/characters/${id}/portrait`, { data: msg.data, color: msg.color });
});
$("#photoInput")?.addEventListener("change", async (ev) => {
  const files = [...(ev.target.files || [])];
  if (!files.length || !selectedCharacterId) return;
  const photos = await Promise.all(files.map((file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: String(reader.result).split(",")[1] || "" });
    reader.readAsDataURL(file);
  })));
  await api(`/api/characters/${selectedCharacterId}/photos`, { photos });
});
$("#rollCharacter")?.addEventListener("change", fillExperiences);

// Alte start.bat-Staende schrieben "ECHO ist ausgeschaltet" in sl.pin; so ein
// Rest im Browser ist kein Schluessel.
if (/^ECHO\s/i.test(localStorage.getItem("ember.gmKey") || "")) localStorage.removeItem("ember.gmKey");
if (!localStorage.getItem("ember.gmKey")) localStorage.setItem("ember.gmKey", "gm_" + [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join(""));
// Sitz bleibt fest, der Schluessel wird jedes Mal frisch gelesen: /api/sl-pin
// kann ihn nach dem Laden noch auf die PIN aus data/sl.pin setzen.
const gmSeat = localStorage.getItem("ember.gmKey");
setInterval(() => {
  const key = localStorage.getItem("ember.gmKey") || gmSeat;
  fetch("/api/presence", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: gmSeat, role: "gm", name: "SL", gmKey: key, status: activeSession()?.narrating ? "narrating" : "online" }),
  }).catch(() => {});
}, 4000);

async function fillSubclass(form, className, current) {
  const sel = form?.subclass;
  if (!sel || sel.tagName !== "SELECT") return;
  const res = await fetch("/api/solo/subclasses?class=" + encodeURIComponent(className || ""));
  const data = await res.json();
  sel.innerHTML = `<option value="">—</option>` + (data.subclasses || []).map((n) => `<option value="${esc(n.name || n)}">${esc(n.name || n)}${n.feature ? " — " + esc(n.feature) : ""}</option>`).join("");
  if (current) sel.value = current;
}
document.querySelector("#characterForm [name=class]")?.addEventListener("change", (ev) => fillSubclass(ev.target.form, ev.target.value, ""));

$("#btnCopyTunnel")?.addEventListener("click", async () => {
  const text = $("#tunnelUrl")?.textContent || "";
  const note = $("#tunnelNote");
  if (!text.startsWith("http")) {
    if (note) note.textContent = "Noch keine Adresse. Tunnel offen lassen.";
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    if (note) note.textContent = "Kopiert.";
  } catch {
    if (note) note.textContent = text;
  }
});

const seats = {};
function claimSeat(id, name) {
  const taken = Object.entries(seats).find(([who, seat]) => seat === "fire" && who !== id);
  seats[id] = "fire";
  const tag = document.querySelector(".fire-figure");
  if (tag && !tag.querySelector(".name-tag")) {
    const el = document.createElement("div");
    el.className = "name-tag";
    el.textContent = name;
    tag.appendChild(el);
  }
  if (taken) {
    document.getElementById("seatDuel")?.classList.remove("hidden");
    const out = document.getElementById("duelOut");
    document.getElementById("btnDuel").onclick = () => {
      const a = name, b = taken[1] && taken[0];
      let left = 0;
      const stop = setTimeout(() => {
        const win = left % 2 ? a : b;
        if (out) out.textContent = win + " ist die Hauptfigur. Der andere ist Sidekick. Pause, wenn ihr wollt.";
      }, 4000);
      if (out) out.textContent = "Klickt, wer schneller ist.";
      document.getElementById("btnDuel").onclick = () => { left += 1; clearTimeout(stop); if (out) out.textContent = name + " hält den Stuhl. Hauptfigur heute."; };
    };
  }
}

fetch("/api/sl-pin").then((r) => r.ok ? r.json() : null).then((row) => {
  if (row && row.pin) {
    localStorage.setItem("ember.gmKey", row.pin);
    // Sofort Presence mit der PIN, damit Einstellungen und Browser denselben Schluessel haben.
    fetch("/api/presence", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: gmSeat, role: "gm", name: "SL", gmKey: row.pin, status: "online" }),
    }).catch(() => {});
  }
}).catch(() => {});
