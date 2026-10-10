(function () {
  const SEATS = [
    { x: 35.6, y: 78 },
    { x: 43.0, y: 78 },
    { x: 50.4, y: 78 },
    { x: 57.8, y: 78 },
    { x: 65.2, y: 78 },
  ];

  function svg(body) {
    return "data:image/svg+xml;utf8," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 80'>" + body + "</svg>"
    );
  }
  const SPRITE = {
    wizard: svg("<path d='M32 4 L48 36 H16 Z' fill='#2456b0'/><circle cx='26' cy='22' r='2' fill='#f4d65a'/><circle cx='38' cy='28' r='2' fill='#f4d65a'/><rect x='22' y='36' width='20' height='28' fill='#1e4a9a'/>"),
    warrior: svg("<rect x='10' y='16' width='6' height='16' fill='#f4efe4'/><rect x='48' y='16' width='6' height='16' fill='#f4efe4'/><rect x='20' y='24' width='24' height='16' fill='#c48e2a'/><rect x='18' y='40' width='28' height='24' fill='#a84e24'/>"),
    guardian: svg("<rect x='18' y='18' width='28' height='20' fill='#9aafb8'/><rect x='24' y='26' width='16' height='4' fill='#243038'/><rect x='16' y='38' width='32' height='26' fill='#5e727c'/>"),
    seraph: svg("<path d='M32 4 L42 28 H22 Z' fill='#f4efe4'/><rect x='31' y='6' width='2' height='22' fill='#d4a840'/><rect x='18' y='28' width='28' height='34' fill='#703c8c'/>"),
    druid: svg("<path d='M14 22 L22 10 L28 22 Z' fill='#a8a49c'/><path d='M36 22 L42 10 L50 22 Z' fill='#a8a49c'/><rect x='18' y='20' width='28' height='18' fill='#968f86'/><rect x='16' y='38' width='32' height='26' fill='#3e6230'/>"),
    gm: svg("<circle cx='32' cy='22' r='10' fill='#c4513a'/><rect x='22' y='34' width='20' height='18' fill='#6a432c'/><rect x='24' y='40' width='16' height='10' fill='#2456b0'/>"),
  };
  SPRITE.ranger = SPRITE.druid;
  SPRITE.bard = SPRITE.seraph;
  SPRITE.rogue = SPRITE.warrior;
  SPRITE.sorcerer = SPRITE.wizard;

  function spriteFor(cls) {
    return SPRITE[String(cls || "").toLowerCase()] || SPRITE.guardian;
  }
  function online(presence, characterId) {
    return (presence || []).some((p) => p.characterId === characterId && p.status && p.status !== "offline");
  }
  function gmOnline(presence) {
    return (presence || []).some((p) => p.role === "gm");
  }
  // Sitzplatz am Tisch setzt nur der SL (der Server lehnt alles andere mit 403 ab).
  // Darum der SL-Schluessel; auf der Spielerseite gar nicht erst schicken.
  function assign(id, seat, root) {
    if (!root || root.dataset.table !== "gm") return Promise.resolve(null);
    return fetch("/api/characters/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableSeat: seat, as: "gm", gmKey: localStorage.getItem("ember.gmKey") || "" }),
    }).then((res) => {
      if (!res.ok) console.warn("Sitz nicht gespeichert:", res.status);
      return res;
    });
  }

  function renderTableIndicator(root, state, opts) {
    if (!root || !state) return;
    opts = opts || {};
    const campaignId = state.active && state.active.campaignId;
    const chars = (state.characters || []).filter((c) => !campaignId || c.campaignId === campaignId);
    const selected = root.dataset.seat ? Number(root.dataset.seat) : 0;
    const taken = {};
    chars.forEach((c) => {
      if (Number.isInteger(c.tableSeat) && c.tableSeat >= 0 && c.tableSeat < 5 && taken[c.tableSeat] == null) taken[c.tableSeat] = c;
    });
    let spare = 0;
    chars.filter((c) => !Number.isInteger(c.tableSeat)).forEach((c) => {
      while (spare < 5 && taken[spare]) spare += 1;
      if (spare < 5) taken[spare] = c;
    });
    const current = taken[selected] || null;
    root.className = "table-indicator";
    root.innerHTML = "";
    const plate = document.createElement("div");
    plate.className = "plate";
    plate.innerHTML = "<div class='trunk left'></div><div class='trunk right'></div><div class='board'></div>";
    const gm = document.createElement("img");
    gm.className = "gm" + (gmOnline(state.presence) ? " on" : "");
    gm.src = SPRITE.gm;
    gm.alt = "";
    plate.appendChild(gm);
    SEATS.forEach((pos, i) => {
      const c = taken[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seat" + (i === selected ? " selected" : "") + (c && !online(state.presence, c.id) ? " off" : "");
      btn.style.left = pos.x + "%";
      btn.style.top = pos.y + "%";
      const cap = document.createElement("span");
      cap.className = "cap";
      cap.textContent = c ? c.name : "Sitz " + (i + 1);
      btn.appendChild(cap);
      const marker = document.createElement("span");
      marker.className = "marker";
      btn.appendChild(marker);
      if (c) {
        const img = document.createElement("img");
        img.className = "who";
        img.src = spriteFor(c.class);
        img.alt = c.class || c.name;
        btn.appendChild(img);
      }
      btn.addEventListener("click", () => {
        root.dataset.seat = String(i);
        renderTableIndicator(root, state, opts);
      });
      plate.appendChild(btn);
    });
    root.appendChild(plate);
    const bar = document.createElement("div");
    bar.className = "bar";
    const readout = document.createElement("div");
    readout.className = "readout";
    readout.textContent = "Sitz " + (selected + 1) + " · " + (current ? current.name : "leer");
    bar.appendChild(readout);
    chars.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.name;
      b.setAttribute("aria-pressed", current && current.id === c.id ? "true" : "false");
      b.addEventListener("click", () => {
        assign(c.id, selected, root).catch(() => {});
        if (opts.onSit) opts.onSit(c.id);
      });
      bar.appendChild(b);
    });
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Leeren";
    clear.disabled = !current;
    clear.addEventListener("click", () => { if (current) assign(current.id, null, root).catch(() => {}); });
    bar.appendChild(clear);
    if (!chars.length) {
      const hint = document.createElement("span");
      hint.className = "readout";
      hint.textContent = "Noch keine Bögen.";
      bar.appendChild(hint);
    }
    root.appendChild(bar);
  }

  window.renderTableIndicator = renderTableIndicator;

  function boot() {
    const roots = [...document.querySelectorAll("[data-table]")];
    if (!roots.length) return;
    const apply = (state) => {
      roots.forEach((root) => renderTableIndicator(root, state, {
        onSit: root.dataset.table === "player" ? (id) => {
          localStorage.setItem("ember.characterId", id);
          localStorage.setItem("ember.guest", "0");
          // player.js hoert darauf und ruft sit() — Sitz bleibt auch nach Entsperren.
          window.dispatchEvent(new CustomEvent("ember:sit", { detail: { characterId: id } }));
          // Fallback, falls die Seite die Sitz-Logik noch nicht geladen hat.
          if (typeof window.emberSit !== "function") location.reload();
        } : null,
      }));
    };
    window.addEventListener("ember:state", (ev) => apply(ev.detail));
    if (window.emberFeed) return;
    // Seite ohne map.js: eigener Stream, aber nur dieser eine.
    fetch("/api/state").then((r) => r.json()).then(apply).catch(() => {});
    const es = new EventSource("/api/events");
    es.addEventListener("message", (ev) => { try { apply(JSON.parse(ev.data)); } catch {} });
    window.addEventListener("pagehide", () => es.close());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
