// Modul "kurz": eine Zeile Zusammenfassung plus Umschalter zu den Einstellungen.
Leitstelle.register({
  id: "kurz",
  title: "",
  area: "klein",
  mount(el, ctx) {
    // Die Pille ist ein Knopf: bei "Neustart nötig" startet ein Klick neu.
    this.pill = ctx.el("button", {
      class: "ls-pill", type: "button", role: "status", disabled: true,
      onclick: () => { if (this.needsRestart) ctx.restart((t) => { this.pill.lastChild.textContent = t; }); },
    }, ctx.el("i", { class: "ls-dot" }), ctx.el("span", { text: "Prüfe …" }));
    const toggle = ctx.el("button", {
      class: "ls-btn ls-round", type: "button", title: "Einstellungen", "aria-label": "Einstellungen",
      onclick: () => window.dispatchEvent(new CustomEvent("ember:panel-mode", { detail: "settings" })),
    }, "⚙");
    el.append(this.pill, toggle);
  },
  update(s, ctx) {
    if (!this.pill) return;
    let cls = "ok";
    let text = "Alles bereit";
    this.needsRestart = Boolean(s && !ctx.offline && s.code && s.code.restartNeeded);
    if (ctx.offline || !s) { cls = "bad"; text = "Server weg"; }
    else if (this.needsRestart) { cls = "lantern"; text = "Neustart nötig – neuer Code geladen"; }
    else if (s.crash && Date.now() - Date.parse(s.crash.at) < 3600 * 1000) { cls = "bad"; text = `Absturz ${ctx.ago(s.crash.at)}`; }
    else if (s.debugRun && s.debugRun.open === false) { cls = "warn"; text = s.debugRun.text || "Offline – erst DEBUG_Run"; }
    else if (!s.tunnel.up) { cls = "warn"; text = "Tunnel aus"; }
    else if (s.people.players) text = `${s.people.players} am Tisch`;
    this.pill.className = `ls-pill ${cls}`;
    this.pill.disabled = !this.needsRestart;
    this.pill.title = this.needsRestart ? "Jetzt neu starten" : text;
    this.pill.lastChild.textContent = text;
  },
});
