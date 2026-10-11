// Modul "status": alles Wichtige auf einen Blick (grosse Box).
Leitstelle.register({
  id: "status",
  title: "Status",
  area: "gross",
  mount(el, ctx) {
    this.list = ctx.el("dl", { class: "ls-status" });
    el.append(this.list);
  },
  update(s, ctx) {
    if (!this.list) return;
    if (ctx.offline || !s) {
      this.list.replaceChildren(ctx.el("dt", { class: "bad", text: "Server" }), ctx.el("dd", { text: "nicht erreichbar" }));
      return;
    }
    const v = ctx.version;
    const gate = s.debugRun || { open: true };
    const gateOpen = gate.open !== false;
    const crash = s.crash;
    const recentCrash = crash && Date.now() - Date.parse(crash.at) < 24 * 3600 * 1000;
    const rows = [
      ["ok", "Server", `läuft seit ${ctx.duration(s.server.uptimeSec)} · Port ${s.server.port} · ${s.server.memoryMb} MB`],
      ["", "Version", v ? `${v.version}${v.source === "changelog" ? " (CHANGELOG)" : ""}` : "…"],
      [s.tunnel.up && gateOpen ? "ok" : "warn", "Tunnel", !gateOpen ? `${gate.text || "Offline – erst DEBUG_Run"}${s.tunnel.up ? " · Tunnel steht, Spieler warten" : ""}` : s.tunnel.up ? `an · Adresse ${ctx.ago(s.tunnel.since)}${gate.via === "notausgang" ? " · ohne DEBUG_Run" : ""}` : "aus · start.bat starten"],
      [s.people.gm ? "ok" : "", "Am Tisch", `${s.people.players} Spieler${s.people.names.length ? ` (${s.people.names.join(", ")})` : ""} · ${s.people.gm ? "SL da" : "kein SL"}`],
      ["", "Daten", `${ctx.bytes(s.data.size)} · gespeichert ${ctx.clock(s.data.savedAt)} · Sicherung ${s.data.backupAt ? ctx.clock(s.data.backupAt) : "keine"}`],
      [recentCrash ? "bad" : "ok", "Absturz", crash ? `${ctx.clock(crash.at)} · ${crash.kind}${crash.message ? ` · ${crash.message}` : ""}` : "keiner"],
      ["", "DEBUG_Run", (() => {
        const t = s.testlauf;
        if (!t) return "noch keiner · Kachel DEBUG_Run";
        const when = t.at ? ctx.clock(t.at) : t.name;
        return `${when} · ${t.done || 0}/${t.total || 0}${t.fehler ? ` · X ${t.fehler}` : ""}`;
      })()],
      [s.lan.length ? "" : "warn", "LAN", s.lan.length ? s.lan.map((a) => a.address).join(", ") : "kein Netzwerk"],
      ["", "Node", `${s.server.node} · ${s.server.platform}`],
    ];
    const nodes = rows.flatMap(([cls, k, val]) => [
      ctx.el("dt", { class: cls }, ctx.el("i", { class: "ls-dot" }), k),
      ctx.el("dd", { text: val, title: val }),
    ]);
    // Neuer Code auf der Platte: ganz oben, mit Knopf.
    const code = s.code;
    if (code && code.restartNeeded) {
      const files = code.changed && code.changed.length ? code.changed.join(", ") : "Code";
      const head = code.headChanged ? ` · ${code.startedHead} → ${code.currentHead}` : "";
      const btn = ctx.el("button", { class: "ls-btn ls-restart", type: "button" }, "Jetzt neu starten");
      btn.addEventListener("click", () => ctx.restart((t) => { btn.textContent = t; btn.disabled = true; }));
      nodes.unshift(
        ctx.el("dt", { class: "lantern" }, ctx.el("i", { class: "ls-dot" }), "Neustart"),
        ctx.el("dd", { class: "ls-restart-row", title: files }, ctx.el("span", { text: `nötig – neuer Code geladen${head}` }), btn),
      );
    }
    // DEBUG_Run-Tor zu: Notausgang fuer den SL, mit zweitem Klick.
    if (!gateOpen) {
      const btn = ctx.el("button", { class: "ls-btn ls-notausgang", type: "button" }, this.armed ? "Wirklich? Nochmal klicken" : "Ohne DEBUG_Run online gehen");
      btn.addEventListener("click", async () => {
        if (!this.armed) {
          this.armed = true;
          btn.textContent = "Wirklich? Nochmal klicken";
          clearTimeout(this.armTimer);
          this.armTimer = setTimeout(() => { this.armed = false; btn.textContent = "Ohne DEBUG_Run online gehen"; }, 6000);
          return;
        }
        clearTimeout(this.armTimer);
        this.armed = false;
        btn.disabled = true;
        btn.textContent = "Geht online …";
        try {
          const res = await fetch("/api/debug-run/notausgang", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          if (!res.ok) throw new Error(String(res.status));
        } catch {
          btn.textContent = "Ging nicht";
        }
        if (window.Leitstelle) window.Leitstelle.refresh();
      });
      nodes.unshift(
        ctx.el("dt", { class: "lantern" }, ctx.el("i", { class: "ls-dot" }), "Online"),
        ctx.el("dd", { class: "ls-restart-row" }, ctx.el("span", { text: gate.text || "Offline – erst DEBUG_Run" }), ctx.el("a", { class: "ls-btn", href: "/debug-run" }, "Zum DEBUG_Run"), btn),
      );
    }
    this.list.replaceChildren(...nodes);
  },
});
