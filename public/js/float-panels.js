(function () {
  var KEY = "ember-float-panels";

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function place(panel, pos) {
    if (!pos) return;
    panel.style.left = pos.x + "px";
    panel.style.top = pos.y + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    if (pos.collapsed) panel.classList.add("is-collapsed");
  }

  function clamp(panel, x, y) {
    var maxX = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
    var maxY = Math.max(8, window.innerHeight - 48);
    return {
      x: Math.min(maxX, Math.max(8, x)),
      y: Math.min(maxY, Math.max(8, y))
    };
  }

  function bindDrag(panel) {
    var handle = panel.querySelector("[data-float-drag]");
    if (!handle) return;
    handle.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest("[data-float-collapse]")) return;
      ev.preventDefault();
      var startX = ev.clientX;
      var startY = ev.clientY;
      var rect = panel.getBoundingClientRect();
      panel.style.left = rect.left + "px";
      panel.style.top = rect.top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      function move(e) {
        var next = clamp(panel, rect.left + (e.clientX - startX), rect.top + (e.clientY - startY));
        panel.style.left = next.x + "px";
        panel.style.top = next.y + "px";
      }
      function up() {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        var box = panel.getBoundingClientRect();
        var state = load();
        state[panel.id] = {
          x: Math.round(box.left),
          y: Math.round(box.top),
          collapsed: panel.classList.contains("is-collapsed")
        };
        save(state);
      }
      // Zeiger festhalten: sonst reisst der Zug ab, sobald die Maus den Griff verlaesst,
      // und ein Loslassen daneben laesst das Fenster weiter an der Maus kleben.
      try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  function bindCollapse(panel) {
    var btn = panel.querySelector("[data-float-collapse]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      panel.classList.toggle("is-collapsed");
      btn.textContent = panel.classList.contains("is-collapsed") ? "+" : "–";
      var state = load();
      var box = panel.getBoundingClientRect();
      state[panel.id] = state[panel.id] || { x: box.left, y: box.top };
      state[panel.id].collapsed = panel.classList.contains("is-collapsed");
      save(state);
    });
  }

  function mirrorLog() {
    var source = document.getElementById("sessionLog");
    var target = document.getElementById("floatLog");
    if (!source || !target) return;
    target.innerHTML = source.innerHTML;
    target.scrollTop = target.scrollHeight;
  }

  function bindLog() {
    var source = document.getElementById("sessionLog");
    if (source && window.MutationObserver) {
      new MutationObserver(mirrorLog).observe(source, { childList: true, subtree: true });
      mirrorLog();
    }
    var form = document.getElementById("floatCompose");
    var input = document.getElementById("floatLogInput");
    if (!form || !input) return;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      var box = document.getElementById("logText");
      var send = document.getElementById("btnLog");
      if (!box || !send) return;
      box.value = text;
      input.value = "";
      send.click();
    });
  }

  function bindGrid() {
    var btn = document.getElementById("btnGrid");
    var stage = document.getElementById("mapStage");
    if (!btn || !stage) return;
    btn.addEventListener("click", function () {
      stage.classList.toggle("grid-off");
      btn.classList.toggle("on", !stage.classList.contains("grid-off"));
    });
  }

  function bindTitle() {
    var meta = document.getElementById("encMeta");
    var title = document.getElementById("floatDrawerTitle");
    if (!meta || !title || !window.MutationObserver) return;
    var paint = function () {
      var text = (meta.textContent || "").trim();
      title.textContent = text && text !== "Erst die Glut entfachen." ? text : "Tisch";
    };
    new MutationObserver(paint).observe(meta, { childList: true, characterData: true, subtree: true });
    paint();
  }

  function boot() {
    var saved = load();
    document.querySelectorAll(".float-panel").forEach(function (panel) {
      place(panel, saved[panel.id]);
      bindDrag(panel);
      bindCollapse(panel);
    });
    bindLog();
    bindGrid();
    bindTitle();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
