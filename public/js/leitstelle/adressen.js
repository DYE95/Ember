// Modul "adressen": die drei Adressen als Text mit Kopier-Knopf.
Leitstelle.register({
  id: "adressen",
  title: "Adressen zum Kopieren",
  area: "mitte",
  mount(el, ctx) {
    this.rows = {};
    const list = ctx.el("div", { class: "ls-addr" });
    for (const [key, label] of [["tunnel", "Tunnel (Spieler)"], ["lan", "WLAN (Spieler)"], ["gm", "SL hier"]]) {
      const text = ctx.el("code", { text: "–" });
      const btn = ctx.el("button", {
        class: "ls-btn", type: "button", disabled: true,
        onclick: async () => {
          const ok = await ctx.copy(text.textContent);
          btn.textContent = ok ? "Kopiert ✓" : "Markieren";
          if (!ok) window.getSelection().selectAllChildren(text);
          setTimeout(() => { btn.textContent = "Kopieren"; }, 1800);
        },
      }, "Kopieren");
      this.rows[key] = { text, btn };
      list.append(ctx.el("span", { class: "ls-addr-label", text: label }), text, btn);
    }
    el.append(list);
  },
  update(s) {
    if (!this.rows || !s) return;
    for (const [key, row] of Object.entries(this.rows)) {
      const url = s.urls[key] || "";
      const offline = key === "tunnel" && s.debugRun && s.debugRun.open === false;
      row.text.textContent = url || (offline ? s.debugRun.text || "Offline – erst DEBUG_Run" : key === "tunnel" ? "Tunnel aus" : "–");
      row.text.title = url;
      row.btn.disabled = !url;
    }
  },
});
