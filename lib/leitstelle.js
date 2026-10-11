// lib/leitstelle.js — Daten fuer die Leitstelle auf der Startseite.
// Nur lesend. Der Server ruft status() bei /api/leitstelle auf (nur lokal).
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const testlauf = require("./testlauf");

const ROOT = path.join(__dirname, "..");
const VERSION_TTL = 60 * 1000;
let versionCache = null;

function fileInfo(file) {
  try {
    const st = fs.statSync(file);
    return { size: st.size, mtime: st.mtime.toISOString() };
  } catch {
    return null;
  }
}

// Letzter Eintrag aus data/crash.log: "ISO-Zeit art\nstack\n\n"
function lastCrash(file) {
  let text = "";
  try {
    const st = fs.statSync(file);
    const fd = fs.openSync(file, "r");
    const len = Math.min(st.size, 16 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    text = buf.toString("utf8");
  } catch {
    return null;
  }
  return parseCrash(text);
}

function parseCrash(text) {
  const entries = String(text || "").split(/\n\s*\n/).map((e) => e.trim()).filter(Boolean);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const lines = entries[i].split("\n");
    const head = lines[0].match(/^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s+(\S+)/);
    if (!head) continue;
    return { at: head[1], kind: head[2], message: (lines[1] || "").trim().slice(0, 200) };
  }
  return null;
}

// "## Abschnitt" und "- Eintrag" aus CHANGELOG.md
function parseChangelog(text) {
  const notes = [];
  let section = "";
  for (const line of String(text || "").split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+)/);
    if (h) { section = h[1].trim(); continue; }
    const item = line.match(/^[-*]\s+(.+)/);
    if (item && section) notes.push({ sha: "", subject: item[1].trim(), date: "", section });
  }
  return notes;
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, timeout: 3000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).toString().trim();
}

// Version und Patchnotes: erst git, sonst CHANGELOG.md. 60 s im Speicher.
function version(opts = {}) {
  const now = Date.now();
  if (!opts.fresh && versionCache && now - versionCache.at < VERSION_TTL) return versionCache.value;
  let pkg = "0.0.0";
  try { pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version || pkg; } catch {}
  let value = null;
  if (!opts.noGit) {
    try {
      const describe = git(["describe", "--tags", "--always", "--dirty"]);
      const log = git(["log", "-10", "--format=%h%x09%cI%x09%s"]);
      const notes = log.split("\n").filter(Boolean).map((row) => {
        const [sha, date, ...rest] = row.split("\t");
        return { sha, date, subject: rest.join("\t"), section: "" };
      });
      value = { source: "git", version: describe, sha: notes[0] ? notes[0].sha : "", pkg, notes };
    } catch {
      value = null;
    }
  }
  if (!value) {
    let notes = [];
    try { notes = parseChangelog(fs.readFileSync(path.join(opts.root || ROOT, "CHANGELOG.md"), "utf8")); } catch {}
    const latest = notes.find((n) => !/unveröffentlicht/i.test(n.section));
    value = { source: notes.length ? "changelog" : "none", version: latest ? latest.section : pkg, sha: "", pkg, notes: notes.slice(0, 10) };
  }
  versionCache = { at: now, value };
  return value;
}

// ctx: { dataDir, startedAt, port, presence, lan, remote, gate }
// gate: Stand des DEBUG_Run-Tors (lib/debug-run.js). Ohne gate gilt es als offen.
function status(ctx) {
  const dataDir = ctx.dataDir;
  const now = Date.now();
  const urlFile = fileInfo(path.join(dataDir, "public-url.txt"));
  const tunnelUrl = ctx.remote || "";
  const gate = ctx.gate || { open: true, via: "", text: "" };
  // Fuer Spieler zaehlt der Tunnel erst, wenn das Tor offen ist.
  const remote = gate.open ? tunnelUrl : "";
  const lan = (ctx.lan || [])[0];
  const lanUrl = lan ? `http://${lan.address}:${ctx.port}/player` : "";
  const presence = ctx.presence || [];
  const data = fileInfo(path.join(dataDir, "ember.json"));
  const backup = fileInfo(path.join(dataDir, "ember.json.bak"));
  return {
    now: new Date(now).toISOString(),
    server: {
      startedAt: new Date(ctx.startedAt).toISOString(),
      uptimeSec: Math.round((now - ctx.startedAt) / 1000),
      node: process.version,
      platform: `${os.type()} ${os.release()}`,
      port: ctx.port,
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    },
    tunnel: {
      up: Boolean(tunnelUrl),
      open: Boolean(remote),
      url: tunnelUrl,
      since: urlFile ? urlFile.mtime : null,
      ageSec: urlFile ? Math.round((now - Date.parse(urlFile.mtime)) / 1000) : null,
    },
    people: {
      players: presence.filter((p) => p.role !== "gm").length,
      gm: presence.filter((p) => p.role === "gm").length,
      names: presence.filter((p) => p.role !== "gm").map((p) => p.name).slice(0, 8),
    },
    data: {
      size: data ? data.size : 0,
      savedAt: data ? data.mtime : null,
      backupAt: backup ? backup.mtime : null,
    },
    crash: lastCrash(path.join(dataDir, "crash.log")),
    code: ctx.code || null,
    testlauf: testlauf.lastRun(dataDir),
    debugRun: { open: Boolean(gate.open), via: gate.via || "", run: gate.run || "", at: gate.at || null, text: gate.text || "" },
    urls: {
      tunnel: remote ? `${remote.replace(/\/+$/, "")}/player` : "",
      lan: lanUrl,
      gm: `http://127.0.0.1:${ctx.port}/ember`,
      player: remote ? `${remote.replace(/\/+$/, "")}/player` : lanUrl,
    },
    lan: (ctx.lan || []).map((a) => ({ name: a.name, address: a.address })),
  };
}

module.exports = { status, version, parseCrash, parseChangelog };
