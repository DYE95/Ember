const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const file = path.join(root, "data", "public-url.txt");
const logFile = path.join(root, "data", "tunnel.log");
const port = process.env.EMBER_PORT || process.env.PORT || "3478";
const startablauf = require("../lib/startablauf");
let state = startablauf.tunnelStart();

function paintTitle() {
  process.title = startablauf.cloudTitle(state.live);
}

// data/public-url.txt gibt es nur, solange der Tunnel steht. Server, Titel
// und Leitstelle lesen daran ab, ob Cloud ON ist.
function apply(next) {
  const was = state.live;
  state = next;
  if (state.live && !was) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, state.url + "\n");
  } else if (!state.live && was) {
    try { fs.unlinkSync(file); } catch {}
  }
  if (state.live !== was) paintTitle();
}

// Die Adresse vom letzten Start ist tot. Weg damit, sonst stuende der Titel auf Cloud ON.
try { fs.unlinkSync(file); } catch {}

const bin = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const log = fs.createWriteStream(logFile, { flags: "a" });
const child = spawn(bin, ["tunnel", "--protocol", "http2", "--url", `http://127.0.0.1:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
let rest = "";
function take(chunk) {
  const text = chunk.toString();
  log.write(text);
  const lines = (rest + text).split(/\r?\n/);
  rest = lines.pop();
  if (rest.length > 4000) rest = rest.slice(-4000);
  for (const line of lines) apply(startablauf.tunnelStep(state, line));
}
child.stdout.on("data", take);
child.stderr.on("data", take);
child.on("error", () => {
  console.log("cloudflared fehlt. Cloud bleibt OFF, am Tisch geht alles.");
  console.log("https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
  process.exit(1);
});
child.on("exit", (code) => process.exit(code || 0));
// Tunnel weg, Datei weg: sonst bliebe der Titel auf Cloud ON.
process.on("exit", () => { if (state.live) { try { fs.unlinkSync(file); } catch {} } });
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, () => { try { child.kill(); } catch {} process.exit(0); });
paintTitle();
