// lib/startablauf.js — reine Logik fuer den Start aus start.bat:
// Fenstertitel (Cloud ON/OFF), Tunnel-Zustand aus cloudflared-Zeilen,
// Browser nur einmal pro Start oeffnen.
const fs = require("fs");
const path = require("path");

function cloudTitle(up) {
  return up ? "DYE.TV - Cloud ON" : "DYE.TV - Cloud OFF";
}

// tools/tunnel.js schreibt data/public-url.txt nur, solange der Tunnel steht,
// und loescht sie, wenn er wegbricht. Die Datei ist also der Schalter.
function tunnelLive(dataDir) {
  try {
    return fs.readFileSync(path.join(dataDir, "public-url.txt"), "utf8").trim() !== "";
  } catch {
    return false;
  }
}

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const UP_RE = /Registered tunnel connection/i;
const DOWN_RE = /Unregistered tunnel connection|Connection terminated|Serve tunnel error|Lost connection/i;

function tunnelStart() {
  return { url: "", conns: [], live: false };
}

// Eine cloudflared-Logzeile weiterdenken. Live ist der Tunnel, sobald die
// Adresse da ist und keine bekannte Verbindung mehr fehlt: Fallen alle
// gemeldeten Verbindungen weg (Internet weg), ist er aus, bis eine zurueckkommt.
function tunnelStep(state, line) {
  const next = { url: state.url, conns: state.conns.slice(), live: state.live, seenConn: state.seenConn || false };
  const hit = String(line).match(URL_RE);
  // Offline meldet cloudflared Fehler mit https://api.trycloudflare.com: das ist keine Tunnel-Adresse.
  if (hit && !next.url && hit[0] !== "https://api.trycloudflare.com") next.url = hit[0];
  const idx = String(line).match(/connIndex=(\d+)/);
  // Erst "weg" pruefen: "Unregistered" enthaelt "Registered".
  if (idx && DOWN_RE.test(line)) {
    next.conns = next.conns.filter((c) => c !== idx[1]);
  } else if (idx && UP_RE.test(line)) {
    next.seenConn = true;
    if (!next.conns.includes(idx[1])) next.conns.push(idx[1]);
  }
  next.live = Boolean(next.url) && (!next.seenConn || next.conns.length > 0);
  return next;
}

function tunnelEnd(state) {
  return { ...state, conns: [], live: false };
}

// start.bat setzt DYE_FRISCHER_START=1 nur vor dem ersten Server-Lauf und
// loescht ihn vor einem Neustart (Exit 42). npm start setzt ihn nie.
function startPlan(env = {}, isTTY = false) {
  const fresh = env.DYE_FRISCHER_START === "1";
  return {
    anim: fresh && isTTY && env.DYE_NO_ANIM !== "1",
    browser: fresh && env.DYE_NO_BROWSER !== "1",
  };
}

// Zweite Sicherung im Prozess: oeffnet hoechstens einmal.
function openOnce(open) {
  let done = false;
  return (...args) => {
    if (done) return false;
    done = true;
    open(...args);
    return true;
  };
}

function browserCommand(url, platform = process.platform) {
  // cmd: start "" "<url>". Wortgetreu uebergeben, sonst maskiert Node die Anfuehrungszeichen.
  if (platform === "win32") return { cmd: "cmd", args: ["/d", "/s", "/c", `start "" "${url}"`], verbatim: true };
  if (platform === "darwin") return { cmd: "open", args: [url] };
  return { cmd: "xdg-open", args: [url] };
}

module.exports = { cloudTitle, tunnelLive, tunnelStart, tunnelStep, tunnelEnd, startPlan, openOnce, browserCommand };
