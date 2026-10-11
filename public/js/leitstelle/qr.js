// Modul "qr": QR-Code der Spieler-Adresse (Tunnel, sonst LAN). Braucht /js/qr.js.
Leitstelle.register({
  id: "qr",
  title: "Spieler-QR",
  area: "quadrat",
  mount(el, ctx) {
    this.art = ctx.el("div", { class: "ls-qr" });
    this.label = ctx.el("p", { class: "ls-qr-label", text: "…" });
    this.shown = null;
    el.append(this.art, this.label);
  },
  update(s) {
    if (!this.art || !s) return;
    const url = s.urls.player;
    if (url === this.shown) return;
    this.shown = url;
    if (!url) {
      this.art.innerHTML = "";
      this.label.textContent = "Keine Adresse. Tunnel starten oder WLAN prüfen.";
      return;
    }
    this.art.innerHTML = window.EmberQR.toSvg(window.EmberQR.encode(url), { dark: "#10151c", light: "#eef2f8", label: `QR-Code ${url}` });
    this.label.textContent = s.tunnel.open ? "Spieler über den Tunnel" : "Spieler im WLAN";
  },
});
