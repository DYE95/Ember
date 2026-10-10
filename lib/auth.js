// lib/auth.js — SL-Schluessel für GM-Routen
const LOCAL = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"];

const PROXY_HEADERS = ["cf-connecting-ip", "cf-ray", "x-forwarded-for", "x-real-ip"];

// Ganz 127.0.0.0/8 ist dieser Rechner, auch als IPv4-in-IPv6 (::ffff:127.x).
function isLocalAddress(remote) {
  const value = String(remote || "");
  return LOCAL.includes(value) || /^(::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value);
}

// cloudflared spricht den Server ueber 127.0.0.1 an. Ohne Blick auf die
// Proxy-Header waere jeder Besucher des Tunnels "dieser Rechner".
function viaProxy(req) {
  const headers = (req && req.headers) || {};
  // Auch ein leerer Header heisst: da steht ein Proxy davor.
  return PROXY_HEADERS.some((name) => headers[name] != null);
}

// Adresse fuer alle Lokal-Pruefungen: "tunnel", sobald ein Proxy davorsteht.
function requestAddress(req) {
  if (viaProxy(req)) return "tunnel";
  return (req && req.socket && req.socket.remoteAddress) || "";
}

function isLocalRequest(req) {
  return isLocalAddress(requestAddress(req));
}

// Eine Anfrage gilt als SL, wenn sie as:"gm" setzt und den passenden gmKey
// mitbringt. Solange noch kein Schluessel bekannt ist, nur vom SL-Rechner
// selbst (req), sonst waere bis zum ersten SL-Ping jeder im LAN/Tunnel SL.
function isGm(state, body, req) {
  if (!body || body.as !== "gm") return false;
  if (!state || !state.settings) return false;
  const key = state.settings.gmKey;
  if (!key) return Boolean(req) && isLocalRequest(req);
  return typeof body.gmKey === "string" && body.gmKey.length > 0 && body.gmKey === key;
}

// Der Schluessel entsteht beim ersten GM-Presence-Ping vom SL-Rechner.
// Am SL-Rechner darf er der aktuellen Browser-PIN folgen (start.bat / sl.pin),
// sonst passen Boden/Ping und andere GM-Routen nicht mehr zum gespeicherten Key.
// Liefert true, wenn der Schluessel neu gesetzt oder geaendert wurde.
const MAX_GM_KEY = 200;

function recordGmKey(state, body, remote) {
  if (!state || !body || body.role !== "gm" || typeof body.gmKey !== "string" || !body.gmKey) return false;
  if (body.gmKey.length > MAX_GM_KEY) return false;
  if (!isLocalAddress(remote)) return false;
  if (!state.settings) state.settings = {};
  if (state.settings.gmKey === body.gmKey) return false;
  state.settings.gmKey = body.gmKey;
  return true;
}

module.exports = { isGm, isLocalAddress, isLocalRequest, requestAddress, recordGmKey, viaProxy };
