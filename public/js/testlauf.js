// public/js/testlauf.js — Testlauf am SL-Rechner: Checkliste abhaken (O/X/Eigen),
// Bilder dazulegen, am Ende alles in data/testlaeufe/ ablegen und auf Wunsch
// nach GitHub hochladen und Legion Bescheid geben.
// Der Entwurf liegt doppelt: sofort in localStorage, kurz danach beim Server.
(function () {
  "use strict";
  const LOCAL_KEY = "ember.testlauf.entwurf.v1";
  const $ = (id) => document.getElementById(id);

  let checklist = { sections: [] };
  let draft = { tester: "", geraet: "", notizen: "", answers: {}, images: [], updatedAt: "" };
  let maxImage = 50 * 1024 * 1024;
  let locked = false;
  let lastRun = "";
  let viewerRun = "";
  let saveTimer = 0;
  let saving = Promise.resolve();
  const openNotes = new Set();
  const itemIndex = new Map();

  // ---------- Helfer ----------
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function inline(text) {
    return esc(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/_{4,}/g, '<span class="tl-blank" aria-label="Lücke"></span>');
  }
  const hasBlank = (text) => /_{4,}/.test(text);
  const pad = (n) => String(n).padStart(2, "0");
  function when(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "–";
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const clock = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  async function api(path, opts = {}) {
    const res = await fetch(path, { cache: "no-store", ...opts });
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok) throw Object.assign(new Error((body && body.error) || `Fehler ${res.status}`), { body: body || {} });
    return body;
  }
  const postJson = (path, data) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}) });

  // ---------- Entwurf speichern ----------
  function payload() {
    return {
      tester: draft.tester, geraet: draft.geraet, notizen: draft.notizen, answers: liveAnswers(),
      images: draft.images.map((i) => ({ id: i.id, caption: i.caption || "", itemId: i.itemId || "" })),
    };
  }
  function writeLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...payload(), updatedAt: draft.updatedAt })); } catch {}
  }
  function changed() {
    if (locked) return;
    draft.updatedAt = new Date().toISOString();
    writeLocal();
    $("saveState").textContent = "Speichert …";
    $("saveState").className = "tl-save";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 700);
    renderProgress();
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    saving = saving.then(async () => {
      try {
        const res = await postJson("/api/testlauf/entwurf", payload());
        draft.updatedAt = res.updatedAt;
        writeLocal();
        $("saveState").textContent = `Entwurf gesichert ${clock()}`;
        $("saveState").className = "tl-save ok";
      } catch {
        $("saveState").textContent = "Nur im Browser gesichert";
        $("saveState").className = "tl-save warn";
      }
    });
    return saving;
  }
  window.addEventListener("pagehide", () => {
    if (!saveTimer || locked) return;
    try {
      fetch("/api/testlauf/entwurf", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
    } catch {}
  });

  // ---------- Checkliste ----------
  function itemRow(item) {
    const row = document.createElement("div");
    row.className = "tl-item";
    row.dataset.id = item.id;
    row.innerHTML = `
      <div class="tl-text">${inline(item.text)}</div>
      <div class="tl-marks" role="group" aria-label="Ergebnis">
        <button type="button" class="tl-timer" data-timer title="Zeit für diesen Punkt. Läuft ab dem ersten Klick, stoppt bei O/X/Eigen. Klick: Pause/Weiter">00:00</button>
        <button type="button" class="tl-mark m-o" data-m="o" title="ja / ok">O</button>
        <button type="button" class="tl-mark m-x" data-m="x" title="nein / Fehler">X</button>
        <button type="button" class="tl-mark m-eigen" data-m="eigen" title="eigene Angabe">Eigen</button>
        <button type="button" class="tl-mark m-note" data-note title="Notiz">✎</button>
      </div>
      <input class="tl-note" type="text" maxlength="500" placeholder="${hasBlank(item.text) ? "Wert eintragen …" : "Eigene Notiz …"}" />`;
    return row;
  }

  function renderChecklist() {
    const root = $("checklist");
    root.replaceChildren();
    if (!checklist.sections.length) {
      root.innerHTML = '<section class="tl-card"><p>docs/TESTLAUF.md fehlt oder hat keine Punkte.</p></section>';
      return;
    }
    for (const sec of checklist.sections) {
      const card = document.createElement("section");
      card.className = "tl-card tl-section";
      card.dataset.section = sec.id;
      card.innerHTML = `<h2>${esc(sec.title)} <span class="tl-count"></span></h2>`;
      for (const item of sec.items) card.append(itemRow(item));
      root.append(card);
    }
    if (checklist.notesTitle) $("notesTitle").textContent = checklist.notesTitle;
    syncRows();
  }

  function syncRow(row) {
    const id = row.dataset.id;
    const a = draft.answers[id] || {};
    const item = itemIndex.get(id);
    row.dataset.mark = a.mark || "";
    row.querySelectorAll("[data-m]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === a.mark)));
    const input = row.querySelector(".tl-note");
    if (document.activeElement !== input) input.value = a.note || "";
    const show = a.mark === "x" || a.mark === "eigen" || Boolean(a.note) || openNotes.has(id) || Boolean(item && hasBlank(item.text));
    input.hidden = !show;
    row.querySelector("[data-note]").setAttribute("aria-pressed", String(show));
    paintTimer(row);
  }
  function syncRows() { document.querySelectorAll(".tl-item").forEach(syncRow); renderProgress(); }

  function setAnswer(id, patch) {
    const cur = { mark: "", note: "", ...(draft.answers[id] || {}), ...patch };
    if (!cur.mark && !cur.note && !cur.ms) delete draft.answers[id];
    else draft.answers[id] = cur;
  }

  // ---------- Uhr pro Punkt ----------
  // Immer nur ein Punkt läuft. Start beim ersten Klick/Fokus in der Zeile
  // (oder automatisch für den nächsten offenen Punkt, sobald einer O/X/Eigen
  // bekommt), Stopp bei O/X/Eigen. Gespeichert wird die Summe in ms.
  let running = null; // { id, since }
  let paused = false;
  let pausedId = "";
  const fmt = (ms) => {
    const sec = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h ? `${h}:${pad(m)}:${pad(sec % 60)}` : `${pad(m)}:${pad(sec % 60)}`;
  };
  const elapsed = (id) => (Number((draft.answers[id] || {}).ms) || 0) + (running && running.id === id ? Date.now() - running.since : 0);
  function liveAnswers() {
    if (!running) return draft.answers;
    const out = { ...draft.answers };
    out[running.id] = { mark: "", note: "", ...(out[running.id] || {}), ms: elapsed(running.id) };
    return out;
  }
  function stopTimer() {
    if (!running) return;
    const { id } = running;
    setAnswer(id, { ms: elapsed(id) });
    running = null;
    const row = document.querySelector(`.tl-item[data-id="${CSS.escape(id)}"]`);
    if (row) paintTimer(row);
  }
  function startTimer(id) {
    if (locked || (draft.answers[id] || {}).mark) return;
    if (running && running.id === id) return;
    stopTimer();
    paused = false;
    running = { id, since: Date.now() };
    const row = document.querySelector(`.tl-item[data-id="${CSS.escape(id)}"]`);
    if (row) paintTimer(row);
    renderTotal();
  }
  function nextOpen(afterId) {
    const rows = [...document.querySelectorAll(".tl-item")];
    const i = rows.findIndex((r) => r.dataset.id === afterId);
    const next = rows.slice(i + 1).find((r) => !(draft.answers[r.dataset.id] || {}).mark);
    return next ? next.dataset.id : "";
  }
  function paintTimer(row) {
    const chip = row.querySelector(".tl-timer");
    if (!chip) return;
    const id = row.dataset.id;
    const ms = elapsed(id);
    const on = Boolean(running && running.id === id);
    chip.textContent = fmt(ms);
    chip.classList.toggle("on", on);
    chip.classList.toggle("paused", !on && paused && pausedId === id);
    chip.classList.toggle("zero", !ms && !on);
    chip.setAttribute("aria-pressed", String(on));
  }
  function renderTotal() {
    let total = 0;
    for (const sec of checklist.sections) for (const it of sec.items) total += elapsed(it.id);
    const el = $("timeTotal");
    if (el) {
      el.textContent = `⏱ ${fmt(total)}`;
      el.classList.toggle("on", Boolean(running));
    }
  }
  setInterval(() => {
    if (!running) return;
    const row = document.querySelector(`.tl-item[data-id="${CSS.escape(running.id)}"]`);
    if (row) paintTimer(row);
    renderTotal();
  }, 1000);
  // Klick oder Fokus irgendwo in der Zeile: dieser Punkt ist jetzt dran.
  $("checklist").addEventListener("focusin", (ev) => {
    const row = ev.target.closest(".tl-item");
    if (row && !ev.target.closest("[data-timer]") && !ev.target.closest("[data-m]")) startTimer(row.dataset.id);
  });
  $("checklist").addEventListener("pointerdown", (ev) => {
    const row = ev.target.closest(".tl-item");
    if (row && !ev.target.closest("[data-timer]") && !ev.target.closest("[data-m]")) startTimer(row.dataset.id);
  });

  $("checklist").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    const row = ev.target.closest(".tl-item");
    if (!btn || !row || locked) return;
    const id = row.dataset.id;
    if (btn.hasAttribute("data-timer")) {
      if (running && running.id === id) { stopTimer(); paused = true; pausedId = id; }
      else startTimer(id);
      paintTimer(row);
      renderTotal();
      changed();
      return;
    }
    if (btn.hasAttribute("data-note")) {
      if (openNotes.has(id)) openNotes.delete(id); else openNotes.add(id);
      syncRow(row);
      if (openNotes.has(id)) row.querySelector(".tl-note").focus();
      return;
    }
    const mark = btn.dataset.m;
    const cur = (draft.answers[id] || {}).mark;
    if (!cur && running && running.id !== id && !elapsed(id)) {
      // Direkt O/X/Eigen ohne vorher zu klicken: die Zeit seit dem letzten Punkt gehört hierher.
      running.id = id;
    }
    setAnswer(id, { mark: cur === mark ? "" : mark });
    if (cur !== mark) {
      if (running && running.id === id) stopTimer();
      const next = nextOpen(id);
      if (next && !paused) startTimer(next);
    } else startTimer(id);
    syncRow(row);
    renderTotal();
    if (mark === "eigen" && cur !== mark) row.querySelector(".tl-note").focus();
    changed();
  });
  $("checklist").addEventListener("input", (ev) => {
    const input = ev.target.closest(".tl-note");
    if (!input) return;
    const row = input.closest(".tl-item");
    setAnswer(row.dataset.id, { note: input.value });
    openNotes.add(row.dataset.id);
    changed();
  });

  function counts() {
    const c = { total: 0, done: 0, fehler: 0 };
    for (const sec of checklist.sections) for (const it of sec.items) {
      c.total += 1;
      const m = (draft.answers[it.id] || {}).mark;
      if (m) c.done += 1;
      if (m === "x") c.fehler += 1;
    }
    return c;
  }
  function renderProgress() {
    renderTotal();
    const c = counts();
    $("progressText").textContent = `${c.done} von ${c.total} erledigt`;
    $("errorText").textContent = `${c.fehler} Fehler`;
    $("errorText").classList.toggle("bad", c.fehler > 0);
    $("bar").style.width = c.total ? `${(c.done / c.total) * 100}%` : "0";
    document.querySelectorAll(".tl-section[data-section]").forEach((card) => {
      const sec = checklist.sections.find((s) => s.id === card.dataset.section);
      const done = sec.items.filter((it) => (draft.answers[it.id] || {}).mark).length;
      const bad = sec.items.filter((it) => (draft.answers[it.id] || {}).mark === "x").length;
      const el = card.querySelector(".tl-count");
      el.textContent = `${done}/${sec.items.length}${bad ? ` · ${bad} X` : ""}`;
      el.classList.toggle("full", done === sec.items.length);
    });
  }

  // ---------- Felder ----------
  for (const key of ["tester", "geraet", "notizen"]) {
    $(key).addEventListener("input", () => { draft[key] = $(key).value; changed(); });
  }
  function renderFields() {
    for (const key of ["tester", "geraet", "notizen"]) $(key).value = draft[key] || "";
  }

  // ---------- Bilder ----------
  function itemOptions(selected) {
    let html = '<option value="">– zu keinem Punkt –</option>';
    for (const sec of checklist.sections) {
      html += `<optgroup label="${esc(sec.title)}">`;
      for (const it of sec.items) {
        const text = it.text.replace(/`/g, "").replace(/_{4,}/g, "…");
        html += `<option value="${esc(it.id)}"${it.id === selected ? " selected" : ""}>${esc(text.length > 70 ? `${text.slice(0, 68)}…` : text)}</option>`;
      }
      html += "</optgroup>";
    }
    return html;
  }

  function renderThumbs() {
    const root = $("thumbs");
    root.replaceChildren();
    draft.images.forEach((img, i) => {
      const fig = document.createElement("figure");
      fig.className = "tl-thumb";
      fig.dataset.id = img.id;
      fig.innerHTML = `
        <div class="tl-pic"><img alt="" loading="lazy" decoding="async" src="/api/testlauf/entwurf/bilder/${encodeURIComponent(img.file)}" />
          <span class="tl-picname">${esc(img.name)}</span>
          <button type="button" class="tl-remove" title="Bild entfernen" aria-label="Bild entfernen">✕</button></div>
        <figcaption>
          <span class="tl-hint">${i + 1}. ${esc(img.name)} · ${mb(img.size)}</span>
          <input class="tl-caption" type="text" maxlength="300" placeholder="Bildunterschrift" value="${esc(img.caption || "")}" />
          <select class="tl-link" aria-label="Zu Punkt">${itemOptions(img.itemId)}</select>
        </figcaption>`;
      fig.querySelector("img").addEventListener("error", () => fig.classList.add("noimg"));
      root.append(fig);
    });
  }
  function thumbEdit(ev) {
    const fig = ev.target.closest(".tl-thumb");
    const img = fig && draft.images.find((i) => i.id === fig.dataset.id);
    if (!img) return;
    if (ev.target.classList.contains("tl-caption")) img.caption = ev.target.value;
    if (ev.target.classList.contains("tl-link")) img.itemId = ev.target.value;
    changed();
  }
  $("thumbs").addEventListener("input", thumbEdit);
  $("thumbs").addEventListener("change", (ev) => { if (ev.target.classList.contains("tl-link")) thumbEdit(ev); });
  $("thumbs").addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".tl-remove");
    if (!btn || locked) return;
    const fig = btn.closest(".tl-thumb");
    btn.disabled = true;
    try {
      await api(`/api/testlauf/bild/${encodeURIComponent(fig.dataset.id)}`, { method: "DELETE" });
      draft.images = draft.images.filter((i) => i.id !== fig.dataset.id);
      renderThumbs();
      writeLocal();
    } catch (err) {
      btn.disabled = false;
      $("uploadState").textContent = `Entfernen ging nicht: ${err.message}`;
    }
  });

  const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif)$/i.test(f.name);
  let queue = Promise.resolve();
  // Roh als application/octet-stream, wie der Mediathek-Upload: kein base64.
  function uploadOne(file, index, total, batch) {
    return new Promise((resolve) => {
      const say = (t) => { $("uploadState").textContent = t; };
      const fail = (t) => { batch.failed.push(t); say(t); resolve(); };
      if (file.size > maxImage) return fail(`${file.name}: zu groß (höchstens ${Math.round(maxImage / 1048576)} MB)`);
      const q = new URLSearchParams({ name: file.name || "foto.jpg", type: file.type || "" });
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/testlauf/bild?${q}`);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) say(`Bild ${index} von ${total}: ${Math.round((e.loaded / e.total) * 100)} % (${file.name})`);
      });
      xhr.addEventListener("load", () => {
        let body = null;
        try { body = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && body) {
          draft.images.push(body);
          renderThumbs();
          writeLocal();
          batch.ok += 1;
          say(`Bild ${index} von ${total} fertig.`);
          resolve();
        } else fail(`${file.name}: ${(body && body.error) || `Fehler ${xhr.status}`}`);
      });
      xhr.addEventListener("error", () => fail(`${file.name}: keine Verbindung zum Server`));
      say(`Bild ${index} von ${total}: lädt …`);
      xhr.send(file);
    });
  }
  function uploadFiles(list) {
    if (locked) return;
    const files = [...(list || [])].filter(isImage);
    if (!files.length) { $("uploadState").textContent = "Keine Bilder dabei."; return; }
    const batch = { ok: 0, failed: [] };
    files.forEach((f, i) => { queue = queue.then(() => uploadOne(f, i + 1, files.length, batch)); });
    queue = queue.then(() => {
      const done = `${batch.ok} von ${files.length} ${files.length === 1 ? "Bild" : "Bildern"} hochgeladen.`;
      $("uploadState").textContent = batch.failed.length ? `${done} Nicht dabei: ${batch.failed.join("; ")}.` : done;
    });
  }
  for (const id of ["pick", "camera"]) {
    $(id).addEventListener("change", (ev) => { uploadFiles(ev.target.files); ev.target.value = ""; });
  }
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (ev) => { ev.preventDefault(); ev.stopPropagation(); uploadFiles(ev.dataTransfer && ev.dataTransfer.files); });
  // Bild daneben fallen gelassen: nicht im Browser oeffnen, sonst ist die Seite weg.
  window.addEventListener("dragover", (ev) => ev.preventDefault());
  window.addEventListener("drop", (ev) => { ev.preventDefault(); uploadFiles(ev.dataTransfer && ev.dataTransfer.files); });

  // ---------- Ablegen ----------
  // Zwei Schritte statt confirm(): mit dem Wii-Zeiger sind Browser-Dialoge muehsam.
  let armed = "";
  let armTimer = 0;
  const FINISH_LABEL = { btnFinish: "Alles ablegen", btnFinishUpload: "Hochladen & Legion Bescheid geben" };
  function disarm() {
    armed = "";
    for (const [id, label] of Object.entries(FINISH_LABEL)) {
      $(id).classList.remove("confirm");
      $(id).disabled = false;
      $(id).textContent = label;
    }
  }
  async function finish(btnId) {
    if (locked) return;
    const btn = $(btnId);
    const c = counts();
    if (armed !== btnId && c.done < c.total) {
      disarm();
      armed = btnId;
      btn.classList.add("confirm");
      btn.textContent = `Wirklich? ${c.total - c.done} Punkte offen`;
      clearTimeout(armTimer);
      armTimer = setTimeout(disarm, 6000);
      return;
    }
    clearTimeout(armTimer);
    $("btnFinish").disabled = true;
    $("btnFinishUpload").disabled = true;
    btn.textContent = "Lege ab …";
    try {
      stopTimer();
      await saveNow();
      await queue;
      const res = await postJson("/api/testlauf/ablegen", {});
      locked = true;
      lastRun = res.name;
      document.body.classList.add("tl-locked");
      try { localStorage.removeItem(LOCAL_KEY); } catch {}
      $("finishResult").hidden = false;
      $("resultPath").textContent = res.folder;
      $("finishHint").textContent = `${res.summary.done} von ${res.summary.total} erledigt · ${res.summary.fehler} Fehler · ${res.images} Bilder`;
      document.querySelector(".tl-finish").hidden = true;
      $("saveState").textContent = "Abgelegt";
      $("saveState").className = "tl-save ok";
      document.querySelectorAll(".tl-list input, .tl-list textarea, #imageCard input, #imageCard select, #tester, #geraet").forEach((el) => { el.disabled = true; });
      loadRuns();
      if (btnId === "btnFinishUpload") await uploadRun(res.name, $("uploadResult"), $("btnUploadResult"));
    } catch (err) {
      $("finishHint").textContent = `Ablegen ging nicht: ${err.message}`;
      disarm();
    }
  }
  $("btnFinish").addEventListener("click", () => finish("btnFinish"));
  $("btnFinishUpload").addEventListener("click", () => finish("btnFinishUpload"));
  $("btnUploadResult").addEventListener("click", (ev) => uploadRun(lastRun, $("uploadResult"), ev.currentTarget));
  $("btnNew").addEventListener("click", async () => {
    try { await postJson("/api/testlauf/neu", {}); } catch {}
    try { localStorage.removeItem(LOCAL_KEY); } catch {}
    location.reload();
  });
  $("btnViewResult").addEventListener("click", () => openRun(lastRun));

  // ---------- Hochladen nach GitHub + Legion ----------
  async function uploadRun(name, box, btn) {
    if (!name) return;
    box.hidden = false;
    box.className = "tl-upload busy";
    box.innerHTML = "<p>Lädt nach GitHub (Zweig testlaeufe) …</p>";
    if (btn) btn.disabled = true;
    try {
      const out = await postJson("/api/testlauf/hochladen", { name });
      const link = out.payload && out.payload.url ? `<a href="${esc(out.payload.url)}" target="_blank" rel="noopener">${esc(out.folder)}</a>` : esc(out.folder);
      let hook;
      if (!out.webhook.configured) {
        hook = `<div class="tl-alert" role="alert">
            <p class="tl-alert-head">⚠ Legion weiß noch nichts davon</p>
            <p>Der Bericht liegt auf GitHub, aber der Legion-Webhook ist nicht eingerichtet. Adresse und Schlüssel eintragen, dann den Bericht noch einmal hochladen.</p>
            <a class="tl-btn tl-big tl-primary" href="#legionCard" data-goto-legion>Legion-Verbindung einrichten ↓</a>
          </div>`;
      } else if (out.webhook.ok) {
        hook = "<p class=\"ok\">Legion hat Bescheid bekommen.</p>";
      } else {
        hook = `<p class="warn">Hochgeladen, aber Legion nicht erreicht: ${esc(out.webhook.error || "unbekannt")}</p>`;
      }
      box.className = `tl-upload ${out.webhook.ok ? "ok" : out.webhook.configured ? "warn" : "alert"}`;
      if (!out.webhook.configured) $("legionMissing").hidden = true; // der Warnkasten sagt es schon
      box.innerHTML = `<p class="ok">Hochgeladen: ${link} · Commit <code>${esc(String(out.commit).slice(0, 7))}</code></p>${hook}`;
      loadRuns();
    } catch (err) {
      const b = err.body || {};
      box.className = "tl-upload bad";
      box.innerHTML = `<p class="bad">Hochladen fehlgeschlagen${b.stage ? ` (Schritt ${esc(b.stage)})` : ""}: ${esc(err.message)}</p>`
        + (b.hint ? `<p>${esc(b.hint)}</p>` : "")
        + (b.detail ? `<details><summary>git-Ausgabe</summary><pre>${esc(b.detail)}</pre></details>` : "");
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  $("btnUploadViewer").addEventListener("click", (ev) => uploadRun(viewerRun, $("viewerUpload"), ev.currentTarget));

  // ---------- Legion-Verbindung ----------
  // Zur Legion-Verbindung springen: Bericht-Ansicht schliessen, Kasten
  // aufleuchten lassen, Cursor ins Adressfeld.
  function gotoLegion() {
    $("viewer").hidden = true;
    const card = $("legionCard");
    card.classList.remove("tl-flash");
    void card.offsetWidth;
    card.classList.add("tl-flash");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => $("legionUrl").focus({ preventScroll: true }), 400);
  }
  document.addEventListener("click", (ev) => {
    const link = ev.target.closest("[data-goto-legion]");
    if (!link) return;
    ev.preventDefault();
    gotoLegion();
  });
  if (location.hash === "#legionCard") setTimeout(gotoLegion, 600);

  function showLegion(cfg) {
    const missing = !cfg.url;
    $("legionCard").classList.toggle("tl-missing", missing);
    const pre = $("legionMissing");
    if (pre) pre.hidden = !missing;
    $("legionUrl").value = cfg.url || "";
    $("legionHeader").value = cfg.header || "Authorization";
    $("legionKey").value = "";
    $("legionKey").placeholder = cfg.keySet ? "gesetzt – leer lassen zum Behalten" : "Schlüssel einfügen";
    const src = cfg.source === "umgebung" ? " (aus Umgebungsvariablen)" : "";
    $("legionState").textContent = cfg.url
      ? `Eingerichtet${src}: Schlüssel ${cfg.keySet ? "gesetzt" : "fehlt"}, Header ${cfg.header}.`
      : "Nicht eingerichtet. Hochladen geht trotzdem, nur ohne Nachricht an Legion.";
  }
  async function loadLegion() {
    try { showLegion(await api("/api/testlauf/legion")); } catch (err) { $("legionState").textContent = err.message; }
  }
  async function saveLegion(extra) {
    try {
      const body = { url: $("legionUrl").value, header: $("legionHeader").value, ...extra };
      if (!extra && $("legionKey").value.trim()) body.key = $("legionKey").value;
      // Eingefuegte Zeilen wie "Authorization: Bearer …" teilt der Server auf.
      const pasted = /:|^\s*bearer\s/i.test(body.header || "") || /^\s*(authorization\s*:|bearer\s)/i.test(body.key || "");
      showLegion(await postJson("/api/testlauf/legion", body));
      $("legionState").textContent += pasted ? " Gespeichert (Header-Zeile erkannt: Name und Schlüssel getrennt)." : " Gespeichert.";
    } catch (err) {
      $("legionState").textContent = `Nicht gespeichert: ${err.message}`;
    }
  }
  $("legionForm").addEventListener("submit", (ev) => { ev.preventDefault(); saveLegion(); });
  $("btnLegionClearKey").addEventListener("click", () => saveLegion({ clearKey: true }));

  // ---------- Fruehere Laeufe ----------
  function renderRuns(runs) {
    const root = $("runs");
    root.replaceChildren();
    if (!runs.length) { root.innerHTML = '<li class="tl-hint">Noch keiner abgelegt.</li>'; return; }
    for (const run of runs.slice(0, 30)) {
      const s = run.summary || {};
      const li = document.createElement("li");
      li.innerHTML = `
        <div><strong>${esc(when(run.createdAt))}</strong>${run.uploaded ? ' <span class="tl-up" title="auf GitHub">↑ GitHub</span>' : ""}
        <span class="tl-hint">${esc([run.tester, run.geraet].filter(Boolean).join(" · ") || "ohne Angaben")}</span>
        <span>${s.done || 0}/${s.total || 0} erledigt · <span class="${s.fehler ? "bad" : ""}">${s.fehler || 0} Fehler</span> · ${run.images} Bilder</span></div>
        <button class="tl-btn" type="button">Ansehen</button>`;
      li.querySelector("button").addEventListener("click", () => openRun(run.name));
      root.append(li);
    }
  }
  async function loadRuns() {
    try { renderRuns(await api("/api/testlauf/laeufe")); } catch {}
  }

  // Kleiner Markdown-Leser fuer bericht.md: Ueberschriften, Listen, Bilder, Absaetze.
  function renderMarkdown(md, base) {
    const out = [];
    let list = false;
    let para = [];
    const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
    const closeList = () => { if (list) out.push("</ul>"); list = false; };
    const badge = (html) => html.replace(/^\[(O|X|Eigen| )\]\s*/, (_, m) => `<span class="tl-badge b-${m === " " ? "offen" : m.toLowerCase()}">${m === " " ? "–" : m}</span> `);
    for (const line of String(md).split(/\r?\n/)) {
      const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
      const h = line.match(/^(#{1,3})\s+(.+)/);
      const li = line.match(/^\s*-\s+(.+)/);
      if (img) {
        flushPara(); closeList();
        const src = /^bilder\/[\w.-]+$/.test(img[2]) ? `${base}/${img[2]}` : "";
        if (src) out.push(`<figure><a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(img[1])}" decoding="async" /></a></figure>`);
      } else if (h) {
        flushPara(); closeList();
        out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      } else if (li) {
        flushPara();
        if (!list) { out.push("<ul>"); list = true; }
        out.push(`<li>${badge(inline(li[1]))}</li>`);
      } else if (!line.trim()) {
        flushPara(); closeList();
      } else {
        closeList();
        para.push(line);
      }
    }
    flushPara(); closeList();
    return out.join("\n");
  }
  async function openRun(name) {
    if (!name) return;
    try {
      const run = await api(`/api/testlauf/lauf/${encodeURIComponent(name)}`);
      viewerRun = name;
      $("viewerPath").textContent = `${run.folder}/bericht.md`;
      $("viewerBody").innerHTML = renderMarkdown(run.md, `/api/testlauf/lauf/${encodeURIComponent(name)}`);
      $("viewerUpload").hidden = true;
      $("viewer").hidden = false;
      $("btnCloseViewer").focus();
    } catch (err) {
      $("finishHint").textContent = `Bericht nicht lesbar: ${err.message}`;
    }
  }
  $("btnCloseViewer").addEventListener("click", () => { $("viewer").hidden = true; });
  $("viewer").addEventListener("click", (ev) => { if (ev.target === $("viewer")) $("viewer").hidden = true; });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") $("viewer").hidden = true; });

  // ---------- Start ----------
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); } catch { return null; }
  }
  async function start() {
    let data;
    try {
      data = await api("/api/testlauf");
    } catch (err) {
      $("checklist").innerHTML = `<section class="tl-card"><p>Server nicht erreichbar: ${esc(err.message)}. Nur am SL-Rechner, nicht über den Tunnel.</p></section>`;
      return;
    }
    checklist = data.checklist;
    checklist.sections.forEach((s) => s.items.forEach((it) => itemIndex.set(it.id, it)));
    draft = data.draft;
    maxImage = data.maxImage || maxImage;
    // Browser-Stand gewinnt, wenn er neuer ist (z. B. Server war kurz weg).
    const local = readLocal();
    let pushLocal = false;
    if (local && local.updatedAt && (!draft.updatedAt || local.updatedAt > draft.updatedAt)) {
      draft.tester = local.tester || "";
      draft.geraet = local.geraet || "";
      draft.notizen = local.notizen || "";
      draft.answers = local.answers || {};
      const meta = new Map((local.images || []).map((i) => [i.id, i]));
      draft.images.forEach((img) => { const m = meta.get(img.id); if (m) { img.caption = m.caption; img.itemId = m.itemId; } });
      draft.updatedAt = local.updatedAt;
      pushLocal = true;
    }
    const v = data.version;
    $("versionText").textContent = v && v.version ? `Ember ${v.version} (${v.source === "git" ? "git" : "CHANGELOG.md"}) · Ablage: ${data.folder}` : `Ablage: ${data.folder}`;
    renderFields();
    renderChecklist();
    renderThumbs();
    renderRuns(data.runs || []);
    loadLegion();
    $("saveState").textContent = pushLocal ? "Browser-Stand übernommen" : (Object.keys(draft.answers).length ? `Entwurf geladen ${clock()}` : "Neuer Testlauf");
    if (pushLocal) saveNow();
  }
  start();
})();
