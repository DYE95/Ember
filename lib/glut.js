// lib/glut.js — Start-Animation fuer start.bat: DYE.TV glimmt aus der Glut auf.
// Nur ANSI-Farben (256er-Palette wie lib/spark.js) und ASCII-Zeichen, laeuft
// so in der Windows-10/11-Konsole. Blockiert nichts: der Server lauscht schon.
const RESET = "\x1b[0m";
const HIDE = "\x1b[?25l";
const SHOW = "\x1b[?25h";
const UP = (n) => `\x1b[${n}A`;
const CLEAR_LINE = "\x1b[2K";
const fg = (n) => `\x1b[38;5;${n}m`;

// Von kalt nach heiss: Dunkelrot, Rot, Ember-Orange (208), Gold (222), Weissgold.
const HEAT = [52, 88, 124, 160, 166, 202, 208, 214, 220, 222, 230];

const FONT = {
  D: ["#### ", "#   #", "#   #", "#   #", "#### "],
  Y: ["#   #", " # # ", "  #  ", "  #  ", "  #  "],
  E: ["#####", "#    ", "#### ", "#    ", "#####"],
  ".": ["  ", "  ", "  ", "  ", "# "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
  V: ["#   #", "#   #", "#   #", " # # ", "  #  "],
};

const WIDTH = 46;
const SKY = 3; // Funkenzeilen ueber dem Schriftzug
const BED = 2; // Glutbett unten
const HEIGHT = SKY + 5 + 1 + BED + 1; // + Leerzeile + Statuszeile

function banner(text) {
  const rows = ["", "", "", "", ""];
  for (const ch of text) {
    const g = FONT[ch];
    for (let r = 0; r < 5; r++) rows[r] += g[r] + " ";
  }
  return rows;
}

const BANNER = banner("DYE.TV");

function heat(v) {
  const i = Math.max(0, Math.min(HEAT.length - 1, Math.round(v * (HEAT.length - 1))));
  return HEAT[i];
}

// Ein Bild zum Zeitpunkt t (0..1). sparks wird fortgeschrieben, rnd ist Math.random.
function frame(t, sparks, rnd = Math.random) {
  const grid = [];
  for (let y = 0; y < HEIGHT - 1; y++) grid.push(new Array(WIDTH).fill(null));
  const put = (x, y, ch, color) => {
    if (y >= 0 && y < grid.length && x >= 0 && x < WIDTH) grid[y][x] = [ch, color];
  };

  // Glutbett: flackert, wird mit der Zeit heisser.
  const bedTop = HEIGHT - 1 - BED;
  for (let y = bedTop; y < bedTop + BED; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const v = Math.min(1, 0.25 + 0.35 * t + 0.3 * rnd() - (y === bedTop ? 0.2 : 0));
      put(x, y, " .:-=+*#%@"[Math.min(9, Math.floor(v * 10))], heat(v));
    }
  }

  // Funken steigen aus dem Bett auf und kuehlen ab.
  if (rnd() < 0.6 + 0.4 * t) sparks.push({ x: Math.floor(rnd() * WIDTH), y: bedTop - 1, life: 1 });
  for (const s of sparks) {
    s.y -= rnd() < 0.7 ? 1 : 0;
    s.x += rnd() < 0.2 ? (rnd() < 0.5 ? -1 : 1) : 0;
    s.life -= 0.09;
  }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0 || sparks[i].y < 0) sparks.splice(i, 1);
  for (const s of sparks) put(s.x, s.y, s.life > 0.6 ? "*" : s.life > 0.3 ? "+" : ".", heat(s.life));

  // Schriftzug: glimmt von links nach rechts auf (erste 40 %), danach Flackern.
  const left = Math.floor((WIDTH - BANNER[0].length) / 2);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < BANNER[r].length; c++) {
      if (BANNER[r][c] !== "#") continue;
      const reveal = Math.max(0, Math.min(1, (t / 0.4) * 1.3 - c / BANNER[r].length));
      if (reveal <= 0) continue;
      const v = Math.min(1, 0.35 + 0.55 * reveal + 0.1 * rnd() + 0.1 * Math.sin(t * 20 + c));
      put(left + c, SKY + r, "#", heat(v));
    }
  }

  const lines = grid.map((row) => {
    let out = "  ";
    let last = -1;
    for (const cell of row) {
      if (!cell) { out += " "; continue; }
      if (cell[1] !== last) { out += fg(cell[1]); last = cell[1]; }
      out += cell[0];
    }
    return out + RESET;
  });
  const bar = Math.round(t * 22);
  lines.push(`  ${fg(208)}[${"#".repeat(bar)}${"-".repeat(22 - bar)}]${RESET} \x1b[2mEmber zündet  (Taste überspringt)${RESET}`);
  return lines;
}

// Spielt die Animation ab. Endet nach duration ms oder bei Tastendruck.
// Ctrl+C beendet den Prozess wie gewohnt.
function play({ duration = 10000, fps = 15, out = process.stdout, input = process.stdin } = {}) {
  return new Promise((resolve) => {
    const sparks = [];
    const start = Date.now();
    let drawn = false;
    let timer = null;
    let raw = false;

    const draw = (t) => {
      const lines = frame(t, sparks);
      out.write((drawn ? UP(lines.length) : "") + lines.map((l) => CLEAR_LINE + l).join("\n") + "\n");
      drawn = true;
    };
    const finish = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      draw(1);
      out.write(SHOW);
      if (raw) {
        try { input.setRawMode(false); } catch {}
        input.pause();
        input.removeListener("data", onKey);
      }
      process.removeListener("exit", restore);
      resolve();
    };
    const restore = () => { try { out.write(SHOW + RESET); } catch {} };
    const onKey = (buf) => {
      if (buf && buf[0] === 3) { restore(); process.exit(0); }
      finish();
    };

    if (input && input.isTTY && typeof input.setRawMode === "function") {
      try {
        input.setRawMode(true);
        input.resume();
        input.on("data", onKey);
        raw = true;
      } catch {}
    }
    process.on("exit", restore);
    out.write(HIDE);
    timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / duration);
      if (t >= 1) return finish();
      draw(t);
    }, Math.round(1000 / fps));
    draw(0);
  });
}

module.exports = { frame, play, HEIGHT, WIDTH };
