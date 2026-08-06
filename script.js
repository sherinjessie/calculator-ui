/* ==========================================================================
   Lumen Calculator — Application Logic
   Vanilla JS, no dependencies.
   ========================================================================== */

(() => {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* DOM references                                                      */
  /* ------------------------------------------------------------------ */
  const expressionEl = document.getElementById("expression");
  const resultEl = document.getElementById("result");
  const padEl = document.querySelector(".calculator__pad");
  const copyBtn = document.getElementById("copyBtn");

  const soundToggle = document.getElementById("soundToggle");
  const soundIconOn = document.getElementById("soundIconOn");
  const soundIconOff = document.getElementById("soundIconOff");

  const themeToggle = document.getElementById("themeToggle");
  const themeIconDark = document.getElementById("themeIconDark");
  const themeIconLight = document.getElementById("themeIconLight");

  const historyToggle = document.getElementById("historyToggle");
  const historyPanel = document.getElementById("historyPanel");
  const historyList = document.getElementById("historyList");
  const historyEmpty = document.getElementById("historyEmpty");
  const clearHistoryBtn = document.getElementById("clearHistory");

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  const state = {
    currentValue: "0", // string shown on the big display, unformatted digits
    previousValue: null, // number
    operator: null, // '+', '−', '×', '÷'
    expression: "", // small history line e.g. "4900 + 15910"
    justEvaluated: false, // true right after "=" was pressed
    overwrite: false, // next digit press should replace currentValue
  };

  const STORAGE_KEYS = {
    history: "lumen-calc-history",
    theme: "lumen-calc-theme",
    sound: "lumen-calc-sound",
  };

  const MAX_HISTORY = 30;
  const MAX_DIGITS = 15;

  /* ------------------------------------------------------------------ */
  /* Sound engine (tiny WebAudio beeps — no external assets)             */
  /* ------------------------------------------------------------------ */
  let audioCtx = null;
  let soundEnabled = localStorage.getItem(STORAGE_KEYS.sound) !== "off";

  function ensureAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playTick(freq = 720, duration = 0.045, gainValue = 0.045) {
    if (!soundEnabled) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function updateSoundIcon() {
    soundIconOn.hidden = !soundEnabled;
    soundIconOff.hidden = soundEnabled;
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  }

  soundToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem(STORAGE_KEYS.sound, soundEnabled ? "on" : "off");
    updateSoundIcon();
    if (soundEnabled) playTick(880, 0.05, 0.05);
  });

  updateSoundIcon();

  /* ------------------------------------------------------------------ */
  /* Theme                                                               */
  /* ------------------------------------------------------------------ */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeIconDark.hidden = theme === "light";
    themeIconLight.hidden = theme !== "light";
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }

  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || "dark";
  applyTheme(savedTheme);

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  /* ------------------------------------------------------------------ */
  /* Number formatting                                                   */
  /* ------------------------------------------------------------------ */
  function formatDisplay(rawValue) {
    if (rawValue === "Error") return "Error";

    const isNegative = rawValue.startsWith("-");
    const unsigned = isNegative ? rawValue.slice(1) : rawValue;
    const [intPart, decPart] = unsigned.split(".");

    const withCommas = Number(intPart || "0").toLocaleString("en-US");
    let out = withCommas;
    if (decPart !== undefined) out += "." + decPart;
    return (isNegative ? "-" : "") + out;
  }

  function render() {
    resultEl.textContent = formatDisplay(state.currentValue);
    expressionEl.textContent = state.expression || "\u00A0";

    resultEl.classList.remove("updated");
    // Force reflow to restart animation
    void resultEl.offsetWidth;
    resultEl.classList.add("updated");
  }

  /* ------------------------------------------------------------------ */
  /* Core calculator behavior                                            */
  /* ------------------------------------------------------------------ */
  function inputDigit(digit) {
    if (state.currentValue === "Error" || state.overwrite) {
      state.currentValue = digit === "." ? "0." : digit;
      state.overwrite = false;
      render();
      return;
    }

    if (state.currentValue.replace("-", "").replace(".", "").length >= MAX_DIGITS) return;

    if (state.currentValue === "0") {
      state.currentValue = digit;
    } else {
      state.currentValue += digit;
    }
    render();
  }

  function inputDecimal() {
    if (state.currentValue === "Error" || state.overwrite) {
      state.currentValue = "0.";
      state.overwrite = false;
      render();
      return;
    }
    if (!state.currentValue.includes(".")) {
      state.currentValue += ".";
      render();
    }
  }

  function clearAll() {
    state.currentValue = "0";
    state.previousValue = null;
    state.operator = null;
    state.expression = "";
    state.overwrite = false;
    setActiveOperatorKey(null);
    render();
  }

  function backspace() {
    if (state.overwrite || state.currentValue === "Error") {
      clearAll();
      return;
    }
    if (state.currentValue.length <= 1 || (state.currentValue.length === 2 && state.currentValue.startsWith("-"))) {
      state.currentValue = "0";
    } else {
      state.currentValue = state.currentValue.slice(0, -1);
    }
    render();
  }

  function toggleSign() {
    if (state.currentValue === "0" || state.currentValue === "Error") return;
    state.currentValue = state.currentValue.startsWith("-")
      ? state.currentValue.slice(1)
      : "-" + state.currentValue;
    render();
  }

  function toPercent() {
    if (state.currentValue === "Error") return;
    const value = parseFloat(state.currentValue) / 100;
    state.currentValue = trimFloat(value);
    render();
  }

  function trimFloat(num) {
    if (!isFinite(num)) return "Error";
    // Avoid floating point artefacts, keep reasonable precision
    const rounded = Math.round((num + Number.EPSILON) * 1e10) / 1e10;
    return String(rounded);
  }

  function compute(a, b, operator) {
    switch (operator) {
      case "+":
        return a + b;
      case "−":
        return a - b;
      case "×":
        return a * b;
      case "÷":
        return b === 0 ? NaN : a / b;
      default:
        return b;
    }
  }

  function setActiveOperatorKey(op) {
    document.querySelectorAll(".key--op[data-op]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.op === op);
    });
  }

  function chooseOperator(op) {
    if (state.currentValue === "Error") return;

    if (state.operator && !state.overwrite) {
      // Chain calculation: resolve pending op first
      const a = state.previousValue;
      const b = parseFloat(state.currentValue);
      const resultValue = compute(a, b, state.operator);
      if (isNaN(resultValue)) {
        showError();
        return;
      }
      state.previousValue = resultValue;
      state.currentValue = trimFloat(resultValue);
    } else {
      state.previousValue = parseFloat(state.currentValue);
    }

    state.operator = op;
    state.overwrite = true;
    state.expression = `${formatDisplay(trimFloat(state.previousValue))} ${op}`;
    setActiveOperatorKey(op);
    render();
  }

  function showError() {
    state.currentValue = "Error";
    state.previousValue = null;
    state.operator = null;
    state.overwrite = true;
    setActiveOperatorKey(null);
    render();
  }

  function evaluate() {
    if (state.operator === null || state.previousValue === null || state.currentValue === "Error") return;

    const a = state.previousValue;
    const b = parseFloat(state.currentValue);
    const resultValue = compute(a, b, state.operator);

    const fullExpression = `${formatDisplay(trimFloat(a))} ${state.operator} ${formatDisplay(
      state.currentValue
    )}`;

    if (isNaN(resultValue)) {
      showError();
      state.expression = fullExpression + " =";
      expressionEl.textContent = state.expression;
      return;
    }

    const formattedResult = trimFloat(resultValue);
    state.expression = fullExpression + " =";
    state.currentValue = formattedResult;
    state.previousValue = null;
    state.operator = null;
    state.overwrite = true;
    setActiveOperatorKey(null);
    render();

    addToHistory(fullExpression, formatDisplay(formattedResult));
  }

  /* ------------------------------------------------------------------ */
  /* History (persisted to localStorage)                                 */
  /* ------------------------------------------------------------------ */
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.history);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(items) {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(items));
  }

  function renderHistory(items) {
    historyList.innerHTML = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "history__empty";
      li.id = "historyEmpty";
      li.textContent = "No calculations yet";
      historyList.appendChild(li);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "history__item";
      li.innerHTML = `<span class="expr">${item.expr}</span><span class="res">${item.result}</span>`;
      li.addEventListener("click", () => {
        // Recall this result into the display
        state.currentValue = item.result.replace(/,/g, "");
        state.previousValue = null;
        state.operator = null;
        state.expression = "";
        state.overwrite = true;
        setActiveOperatorKey(null);
        render();
        if (window.innerWidth <= 700) closeHistory();
      });
      historyList.appendChild(li);
    });
  }

  function addToHistory(expr, result) {
    const items = loadHistory();
    items.unshift({ expr, result, ts: Date.now() });
    if (items.length > MAX_HISTORY) items.pop();
    saveHistory(items);
    renderHistory(items);
  }

  clearHistoryBtn.addEventListener("click", () => {
    saveHistory([]);
    renderHistory([]);
    playTick(400, 0.06, 0.04);
  });

  renderHistory(loadHistory());

  function openHistory() {
    historyPanel.classList.add("is-open");
    historyToggle.setAttribute("aria-expanded", "true");
  }
  function closeHistory() {
    historyPanel.classList.remove("is-open");
    historyToggle.setAttribute("aria-expanded", "false");
  }

  historyToggle.addEventListener("click", () => {
    const isOpen = historyPanel.classList.contains("is-open");
    isOpen ? closeHistory() : openHistory();
  });

  /* ------------------------------------------------------------------ */
  /* Copy result                                                         */
  /* ------------------------------------------------------------------ */
  copyBtn.addEventListener("click", async () => {
    const text = resultEl.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments without Clipboard API permission
      const temp = document.createElement("textarea");
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
    }
    copyBtn.classList.add("copied");
    setTimeout(() => copyBtn.classList.remove("copied"), 900);
  });

  /* ------------------------------------------------------------------ */
  /* Ripple effect                                                       */
  /* ------------------------------------------------------------------ */
  function spawnRipple(button, clientX, clientY) {
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height) * 1.3;
    const x = (clientX ?? rect.left + rect.width / 2) - rect.left - size / 2;
    const y = (clientY ?? rect.top + rect.height / 2) - rect.top - size / 2;

    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    button.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  }

  /* ------------------------------------------------------------------ */
  /* Button wiring (event delegation)                                    */
  /* ------------------------------------------------------------------ */
  padEl.addEventListener("click", (event) => {
    const button = event.target.closest(".key");
    if (!button) return;

    spawnRipple(button, event.clientX, event.clientY);

    const { digit, action, op } = button.dataset;

    if (digit !== undefined) {
      inputDigit(digit);
      playTick(620, 0.04, 0.035);
      return;
    }

    switch (action) {
      case "clear":
        clearAll();
        playTick(340, 0.08, 0.05);
        break;
      case "negate":
        toggleSign();
        playTick(560, 0.05, 0.04);
        break;
      case "percent":
        toPercent();
        playTick(560, 0.05, 0.04);
        break;
      case "decimal":
        inputDecimal();
        playTick(620, 0.04, 0.035);
        break;
      case "op":
        chooseOperator(op);
        playTick(760, 0.05, 0.045);
        break;
      case "equals":
        evaluate();
        playTick(920, 0.09, 0.06);
        break;
      default:
        break;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Keyboard support                                                    */
  /* ------------------------------------------------------------------ */
  const opKeyMap = { "+": "+", "-": "−", "*": "×", "/": "÷" };

  function flashKey(selector) {
    const btn = document.querySelector(selector);
    if (!btn) return;
    btn.classList.add("kbd-active");
    spawnRipple(btn);
    setTimeout(() => btn.classList.remove("kbd-active"), 120);
  }

  window.addEventListener("keydown", (event) => {
    const { key } = event;

    if (/^[0-9]$/.test(key)) {
      inputDigit(key);
      flashKey(`.key[data-digit="${key}"]`);
      playTick(620, 0.04, 0.035);
      return;
    }

    if (key === ".") {
      inputDecimal();
      flashKey('.key[data-action="decimal"]');
      playTick(620, 0.04, 0.035);
      return;
    }

    if (key in opKeyMap) {
      const op = opKeyMap[key];
      chooseOperator(op);
      flashKey(`.key--op[data-op="${op}"]`);
      playTick(760, 0.05, 0.045);
      return;
    }

    if (key === "Enter" || key === "=") {
      event.preventDefault();
      evaluate();
      flashKey('.key--equals');
      playTick(920, 0.09, 0.06);
      return;
    }

    if (key === "Backspace") {
      backspace();
      flashKey('.key--func[data-action="clear"]');
      return;
    }

    if (key === "Escape") {
      clearAll();
      flashKey('.key--func[data-action="clear"]');
      playTick(340, 0.08, 0.05);
      return;
    }

    if (key === "%") {
      toPercent();
      flashKey('.key--func[data-action="percent"]');
      return;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Initial paint                                                       */
  /* ------------------------------------------------------------------ */
  render();
})();
