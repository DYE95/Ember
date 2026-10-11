// lib/debug-run.js — Tor vor dem Online-Gang.
//
// Spieler kommen ueber den Cloudflare-Tunnel erst an den Tisch, wenn der
// heutige DEBUG_Run abgelegt und erfolgreich hochgeladen wurde ("Hochladen &
// Legion Bescheid geben"). LAN und dieser Rechner sind nie betroffen.
//
// "Heute" ist der Spieltag nach lokaler Uhr. Er wechselt um 06:00 Uhr, nicht
// um Mitternacht: ein Spielabend ueber 0 Uhr hinaus wird nicht mittendrin
// ausgesperrt, und ein DEBUG_Run um 1 Uhr nachts zaehlt noch fuer den Abend.
// Ein Server-Neustart setzt das Tor nicht zurueck (Datei data/debug-run.json).
//
// Notausgang fuer den SL: "Ohne DEBUG_Run online gehen" (nur localhost),
// landet in data/debug-run.log. Fuer Tests: DYE_DEBUG_RUN_PFLICHT=0 schaltet
// das Tor ganz ab.
const fs = require("fs");
const path = require("path");

const DAY_START_HOUR = 6;
const RUN_NAME = /^(\d{4})-(\d\d)-(\d\d)_(\d\d)-(\d\d)(?:_\d+)?$/;
const OFFLINE_TEXT = "Offline – erst DEBUG_Run";

const pad = (n) => String(n).padStart(2, "0");
const stateFile = (dataDir) => path.join(dataDir, "debug-run.json");
const logFile = (dataDir) => path.join(dataDir, "debug-run.log");

// Spieltag als "JJJJ-MM-TT" (lokale Zeit, Wechsel um 06:00).
function spieltag(when = new Date()) {
  const d = new Date(when instanceof Date ? when.getTime() : when);
  if (Number.isNaN(d.getTime())) return "";
  d.setHours(d.getHours() - DAY_START_HOUR);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Ordnername eines Laufs (JJJJ-MM-TT_HH-MM, lokale Zeit) als Datum.
function runDate(name) {
  const m = String(name || "").match(RUN_NAME);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function enabled(env = process.env) {
  return String(env.DYE_DEBUG_RUN_PFLICHT || "").trim() !== "0";
}

function readRecord(dataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(dataDir), "utf8"));
    return raw && typeof raw === "object" && typeof raw.tag === "string" ? raw : null;
  } catch {
    return null;
  }
}

function writeRecord(dataDir, record) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = stateFile(dataDir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, file);
}

function log(dataDir, line, now = new Date()) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(logFile(dataDir), `${now.toISOString()} ${line}\n`);
  } catch {}
}

// { open, tag, via: "upload" | "notausgang" | "aus" | "", run, at, text }
function status(dataDir, { now = new Date(), env = process.env } = {}) {
  const tag = spieltag(now);
  if (!enabled(env)) return { open: true, tag, via: "aus", run: "", at: null, text: "" };
  const rec = readRecord(dataDir);
  if (rec && rec.tag === tag) {
    return { open: true, tag, via: rec.via === "notausgang" ? "notausgang" : "upload", run: rec.run || "", at: rec.at || null, text: "" };
  }
  return { open: false, tag, via: "", run: "", at: null, text: OFFLINE_TEXT };
}

// Ergebnis von "Hochladen & Legion Bescheid geben" auswerten.
// Geschafft heisst: auf GitHub gelandet und Legion hat Bescheid bekommen.
// Ist kein Webhook eingerichtet, reicht GitHub (sonst kaeme Dave nie online).
// Nur ein Lauf vom heutigen Spieltag oeffnet das Tor.
function uploadCounts(name, result, now = new Date()) {
  if (!result || !result.commit) return { ok: false, why: "nicht hochgeladen" };
  const hook = result.webhook || {};
  if (hook.configured && !hook.ok) return { ok: false, why: "Legion nicht erreicht" };
  const d = runDate(name);
  if (!d || spieltag(d) !== spieltag(now)) return { ok: false, why: "nicht von heute" };
  return { ok: true, why: "" };
}

// Nach erfolgreichem Upload aufrufen. Liefert true, wenn das Tor dadurch aufging.
function markUploaded(dataDir, name, result, { now = new Date() } = {}) {
  const check = uploadCounts(name, result, now);
  if (!check.ok) {
    log(dataDir, `upload ${name} oeffnet nicht: ${check.why}`, now);
    return false;
  }
  const before = readRecord(dataDir);
  const wasOpen = Boolean(before && before.tag === spieltag(now));
  writeRecord(dataDir, { tag: spieltag(now), via: "upload", run: String(name), commit: String(result.commit || ""), at: now.toISOString() });
  log(dataDir, `offen nach DEBUG_Run ${name} (Commit ${String(result.commit || "").slice(0, 7)})`, now);
  return !wasOpen;
}

// Notausgang: ohne DEBUG_Run online. Wird geloggt.
function override(dataDir, { now = new Date(), who = "localhost" } = {}) {
  const tag = spieltag(now);
  const before = readRecord(dataDir);
  if (before && before.tag === tag && before.via === "upload") return status(dataDir, { now });
  writeRecord(dataDir, { tag, via: "notausgang", run: "", at: now.toISOString() });
  log(dataDir, `NOTAUSGANG: ohne DEBUG_Run online gegangen (${who})`, now);
  return status(dataDir, { now });
}

// Text fuer Spieler, die ueber den Tunnel kommen, solange das Tor zu ist.
const WAIT_TEXT = "Der Tisch öffnet gleich – der Spielleiter macht noch seinen DEBUG_Run";

function waitPage() {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="20"><title>Gleich geht's los · DYE.TV</title>
<style>body{font:20px/1.5 Georgia,serif;background:#10151c;color:#e3eaf4;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}
main{max-width:30em;padding:1.5em 2em}h1{color:#fcbd36;font-weight:normal;font-size:1.6em}.glut{font-size:3em;animation:g 2.4s ease-in-out infinite}
@keyframes g{50%{opacity:.45}}p.k{color:#9fb0c8;font-size:.85em}</style></head>
<body><main><div class="glut" aria-hidden="true">🔥</div><h1>${WAIT_TEXT}.</h1>
<p>Bitte kurz warten. Die Seite lädt alle 20 Sekunden neu und lässt dich herein, sobald der Tisch offen ist.</p>
<p class="k">DYE.TV</p></main></body></html>`;
}

module.exports = {
  DAY_START_HOUR, OFFLINE_TEXT, WAIT_TEXT, spieltag, runDate, enabled, status, uploadCounts, markUploaded, override, waitPage, readRecord,
};
