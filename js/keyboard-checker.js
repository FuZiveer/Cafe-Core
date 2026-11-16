(function () {
  "use strict";

  function defineKey(code, label, widthUnits, heightUnits, layoutFlags) {
    return Object.assign(
      { code, label, w: widthUnits == null ? 1 : widthUnits, h: heightUnits == null ? 1 : heightUnits },
      layoutFlags || {}
    );
  }

  const FUNCTION_ROW_KEY_WIDTH = 1.1;
  const NAV_CLUSTER_KEY_WIDTH = 1.125;

  const ROWS = [
    {
      keys: [
        defineKey("Escape", "Esc", 1.35, 1, { small: true, grow: true }),
        defineKey("F1", "F1", FUNCTION_ROW_KEY_WIDTH), defineKey("F2", "F2", FUNCTION_ROW_KEY_WIDTH), defineKey("F3", "F3", FUNCTION_ROW_KEY_WIDTH), defineKey("F4", "F4", FUNCTION_ROW_KEY_WIDTH),
        defineKey("F5", "F5", FUNCTION_ROW_KEY_WIDTH), defineKey("F6", "F6", FUNCTION_ROW_KEY_WIDTH), defineKey("F7", "F7", FUNCTION_ROW_KEY_WIDTH), defineKey("F8", "F8", FUNCTION_ROW_KEY_WIDTH),
        defineKey("F9", "F9", FUNCTION_ROW_KEY_WIDTH),
        defineKey("F10", "F10", NAV_CLUSTER_KEY_WIDTH), defineKey("F11", "F11", NAV_CLUSTER_KEY_WIDTH), defineKey("F12", "F12", NAV_CLUSTER_KEY_WIDTH),
        defineKey("PrintScreen", "Prt\nSc", NAV_CLUSTER_KEY_WIDTH, 1, { small: true }),
        defineKey("ScrollLock", "Scr\nLk", NAV_CLUSTER_KEY_WIDTH, 1, { small: true }),
        defineKey("Pause", "Pau\nse", NAV_CLUSTER_KEY_WIDTH, 1, { small: true }),
        defineKey("Home", "Ho\nme", NAV_CLUSTER_KEY_WIDTH, 1, { small: true })
      ]
    },
    {
      keys: [
        defineKey("Backquote", "`"),
        defineKey("Digit1", "1"), defineKey("Digit2", "2"), defineKey("Digit3", "3"), defineKey("Digit4", "4"), defineKey("Digit5", "5"),
        defineKey("Digit6", "6"), defineKey("Digit7", "7"), defineKey("Digit8", "8"), defineKey("Digit9", "9"), defineKey("Digit0", "0"),
        defineKey("Minus", "-"), defineKey("Equal", "="),
        defineKey("Backspace", "←", 1.5, 1, { grow: true }),
        defineKey("PageUp", "Pg\nUp", NAV_CLUSTER_KEY_WIDTH, 1, { small: true }),
        defineKey("NumLock", "Num\nLk", NAV_CLUSTER_KEY_WIDTH, 1, { small: true }),
        defineKey("NumpadDivide", "/", NAV_CLUSTER_KEY_WIDTH),
        defineKey("NumpadMultiply", "*", NAV_CLUSTER_KEY_WIDTH)
      ]
    },
    {
      keys: [
        defineKey("Tab", "Tab", 1.5, 1, { small: true, grow: true }),
        defineKey("KeyQ", "Q"), defineKey("KeyW", "W"), defineKey("KeyE", "E"), defineKey("KeyR", "R"), defineKey("KeyT", "T"),
        defineKey("KeyY", "Y"), defineKey("KeyU", "U"), defineKey("KeyI", "I"), defineKey("KeyO", "O"), defineKey("KeyP", "P"),
        defineKey("BracketLeft", "["), defineKey("BracketRight", "]"), defineKey("Backslash", "\\"),
        defineKey("PageDown", "Pg\nDn", NAV_CLUSTER_KEY_WIDTH, 1, { small: true }),
        defineKey("Numpad7", "7", NAV_CLUSTER_KEY_WIDTH), defineKey("Numpad8", "8", NAV_CLUSTER_KEY_WIDTH), defineKey("Numpad9", "9", NAV_CLUSTER_KEY_WIDTH)
      ]
    },
    {
      keys: [
        defineKey("CapsLock", "Caps", 1.8125, 1, { small: true }),
        defineKey("KeyA", "A"), defineKey("KeyS", "S"), defineKey("KeyD", "D"), defineKey("KeyF", "F"), defineKey("KeyG", "G"),
        defineKey("KeyH", "H"), defineKey("KeyJ", "J"), defineKey("KeyK", "K"), defineKey("KeyL", "L"),
        defineKey("Semicolon", ";"), defineKey("Quote", "'"),
        defineKey("Enter", "Enter", 1.8125, 1, { small: true, grow: true }),
        defineKey("Insert", "Ins", NAV_CLUSTER_KEY_WIDTH, 1, { small: true }),
        defineKey("Numpad4", "4", NAV_CLUSTER_KEY_WIDTH), defineKey("Numpad5", "5", NAV_CLUSTER_KEY_WIDTH), defineKey("Numpad6", "6", NAV_CLUSTER_KEY_WIDTH)
      ]
    },
    {
      keys: [
        defineKey("ShiftLeft", "Shift", 2.375, 1, { small: true }),
        defineKey("KeyZ", "Z"), defineKey("KeyX", "X"), defineKey("KeyC", "C"), defineKey("KeyV", "V"), defineKey("KeyB", "B"),
        defineKey("KeyN", "N"), defineKey("KeyM", "M"), defineKey("Comma", ","), defineKey("Period", "."), defineKey("Slash", "/"),
        defineKey("ShiftRight", "Shift", 2.375, 1, { small: true, grow: true }),
        defineKey("Delete", "Del", NAV_CLUSTER_KEY_WIDTH, 1, { small: true }),
        defineKey("Numpad1", "1", NAV_CLUSTER_KEY_WIDTH), defineKey("Numpad2", "2", NAV_CLUSTER_KEY_WIDTH), defineKey("Numpad3", "3", NAV_CLUSTER_KEY_WIDTH)
      ]
    },
    {
      keys: [
        defineKey("ControlLeft", "Ctrl", 2, 1, { small: true }),
        defineKey("MetaLeft", "Win", 1.2, 1, { small: true }),
        defineKey("AltLeft", "Alt", 1.15, 1, { small: true }),
        defineKey("Space", "", 5.925, 1, { gapW: 6, grow: true }),
        defineKey("AltRight", "Alt", 1.15, 1, { small: true }),
        defineKey("ContextMenu", "☰", 1.2),
        defineKey("ControlRight", "Ctrl", 2, 1, { small: true }),
        defineKey("ArrowUp", "↑", NAV_CLUSTER_KEY_WIDTH),
        defineKey("Numpad0", "0", 2.375),
        defineKey("NumpadDecimal", ".", NAV_CLUSTER_KEY_WIDTH)
      ]
    },
    {
      arrows: true,
      keys: [
        defineKey("ArrowLeft", "←", NAV_CLUSTER_KEY_WIDTH),
        defineKey("ArrowDown", "↓", NAV_CLUSTER_KEY_WIDTH),
        defineKey("ArrowRight", "→", NAV_CLUSTER_KEY_WIDTH)
      ]
    }
  ];

  const LAST_COL = [
    defineKey("End", "End", NAV_CLUSTER_KEY_WIDTH, 1, { small: true }),
    defineKey("NumpadSubtract", "-", NAV_CLUSTER_KEY_WIDTH),
    defineKey("NumpadAdd", "+", NAV_CLUSTER_KEY_WIDTH),
    defineKey("NumpadEnter", "Ent\ner", NAV_CLUSTER_KEY_WIDTH, 3, { small: true })
  ];

  function formatKeyLabel(code, key) {
    if (!code) return key || "—";
    const el = document.querySelector(`[data-code="${CSS.escape(code)}"] .keyboard-checker-key-label`);
    if (el) {
      const text = el.textContent.replace(/\s+/g, " ").trim();
      if (text) return text;
    }
    const named = {
      Space: "Space",
      Enter: "Enter",
      Tab: "Tab",
      Backspace: "Bksp",
      Escape: "Esc",
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→"
    };
    if (named[code]) return named[code];
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad")) return "Num " + code.slice(6);
    return key && key.length === 1 ? key.toUpperCase() : code;
  }

  function appendKey(parent, item, keyMap, layoutCodes) {
    const keyEl = document.createElement("div");
    keyEl.className = "keyboard-checker-key";
    keyEl.dataset.code = item.code;
    keyEl.style.setProperty("--key-w", String(item.w == null ? 1 : item.w));
    keyEl.style.setProperty("--key-h", String(item.h == null ? 1 : item.h));
    if (item.gapW) keyEl.style.setProperty("--key-gap-w", String(item.gapW));
    if (item.code === "Space") keyEl.classList.add("keyboard-checker-key--space");
    if (item.h > 1) keyEl.classList.add("keyboard-checker-key--tall");
    if (item.small) keyEl.classList.add("keyboard-checker-key--small");
    if (item.grow) keyEl.classList.add("keyboard-checker-key--grow");
    keyEl.setAttribute("role", "presentation");
    const label = document.createElement("span");
    label.className = "keyboard-checker-key-label";
    label.textContent = item.label;
    keyEl.appendChild(label);
    parent.appendChild(keyEl);
    if (!keyMap.has(item.code)) {
      keyMap.set(item.code, keyEl);
      layoutCodes.add(item.code);
    }
  }

  function appendRow(parent, row, keyMap, layoutCodes) {
    const rowEl = document.createElement("div");
    rowEl.className = "keyboard-checker-row";
    if (row.arrows) rowEl.classList.add("keyboard-checker-row--arrows");
    row.keys.forEach((item) => appendKey(rowEl, item, keyMap, layoutCodes));
    parent.appendChild(rowEl);
  }

  function buildVisualKeyboard(boardEl) {
    const keyMap = new Map();
    const layoutCodes = new Set();
    boardEl.replaceChildren();
    const main = document.createElement("div");
    main.className = "keyboard-checker-main";
    ROWS.forEach((row) => appendRow(main, row, keyMap, layoutCodes));
    const last = document.createElement("div");
    last.className = "keyboard-checker-last";
    LAST_COL.forEach((item) => appendKey(last, item, keyMap, layoutCodes));
    boardEl.append(main, last);
    return { keyMap, layoutCodes, totalKeys: layoutCodes.size };
  }

  function isModalOpen(target) {
    return target && target.closest && target.closest(".settings-modal.is-open");
  }

  function blockPageKeyboardActions(event) {
    if (isModalOpen(event.target)) return false;
    return true;
  }

  const MODIFIER_KEY_CODES = new Set([
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight",
    "ShiftLeft",
    "ShiftRight"
  ]);

  function isStandaloneModifierEvent(event) {
    const code = event.code || "";
    return MODIFIER_KEY_CODES.has(code);
  }

  function shouldTrapModifierCombo(event) {
    if (!(event.metaKey || event.ctrlKey || event.altKey)) return false;
    return !isStandaloneModifierEvent(event);
  }

  function initKeyboardCheckerPage() {
    if (window.__keyboardCheckerMounted) return;

    const heldCountElement = document.getElementById("keyboard-checker-active");
    const peakRolloverElement = document.getElementById("keyboard-checker-peak");
    const lastKeyElement = document.getElementById("keyboard-checker-last");
    const testedCountElement = document.getElementById("keyboard-checker-tested");
    const boardElement = document.getElementById("keyboard-checker-board");
    const resetButton = document.getElementById("keyboard-checker-reset");
    const captureZoneElement = document.getElementById("keyboard-checker-zone");

    if (!heldCountElement || !peakRolloverElement || !lastKeyElement || !testedCountElement || !boardElement) return;

    const { keyMap, totalKeys } = buildVisualKeyboard(boardElement);

    window.__keyboardCheckerMountAbort?.abort();
    window.__keyboardCheckerMountAbort = new AbortController();
    const mountAbortSignal = window.__keyboardCheckerMountAbort.signal;

    const keysCurrentlyHeld = new Map();
    const testedKeyCodes = new Set();
    let peakSimultaneousKeys = 0;

    const syncTestedStat = () => {
      testedCountElement.innerHTML = `${testedKeyCodes.size}<span class="text-slate-500 text-base font-semibold"> / ${totalKeys}</span>`;
    };

    const syncResetButton = () => {
      if (!resetButton) return;
      resetButton.disabled = testedKeyCodes.size === 0 && peakSimultaneousKeys === 0;
    };

    const setKeyPressed = (code, isPressed) => {
      const keyElement = keyMap.get(code);
      if (!keyElement) return;
      keyElement.classList.toggle("is-pressed", isPressed);
      if (isPressed) {
        keyElement.classList.add("is-tested");
        testedKeyCodes.add(code);
        syncTestedStat();
      }
    };

    const clearKeyHighlights = () => {
      keysCurrentlyHeld.forEach((_entry, code) => setKeyPressed(code, false));
      keysCurrentlyHeld.clear();
      heldCountElement.textContent = "0";
    };

    const syncHeldStat = () => {
      heldCountElement.textContent = String(keysCurrentlyHeld.size);
      peakRolloverElement.textContent = String(peakSimultaneousKeys);
      syncResetButton();
    };

    const onKeyDown = (event) => {
      if (blockPageKeyboardActions(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (isModalOpen(event.target)) return;

      const code = event.code || "";
      if (!code) return;

      if (!event.repeat) {
        const label = formatKeyLabel(code, event.key);
        keysCurrentlyHeld.set(code, { code, label });
        peakSimultaneousKeys = Math.max(peakSimultaneousKeys, keysCurrentlyHeld.size);
        lastKeyElement.textContent = label;
      }

      setKeyPressed(code, true);
      syncHeldStat();
    };

    const onKeyUp = (event) => {
      if (blockPageKeyboardActions(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (isModalOpen(event.target)) return;

      const code = event.code || "";
      if (!code) return;
      keysCurrentlyHeld.delete(code);
      setKeyPressed(code, false);
      syncHeldStat();
    };

    const onWindowBlur = () => {
      clearKeyHighlights();
    };

    const onReset = () => {
      peakSimultaneousKeys = 0;
      testedKeyCodes.clear();
      keyMap.forEach((keyElement) => {
        keyElement.classList.remove("is-tested", "is-pressed");
      });
      clearKeyHighlights();
      syncTestedStat();
      peakRolloverElement.textContent = "0";
      lastKeyElement.textContent = "—";
      syncResetButton();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") clearKeyHighlights();
    };

    const trapModifierCombos = (event) => {
      if (!blockPageKeyboardActions(event)) return;
      if (!shouldTrapModifierCombo(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    captureZoneElement?.focus({ preventScroll: true });

    window.addEventListener("keydown", trapModifierCombos, { capture: true, signal: mountAbortSignal });
    window.addEventListener("keydown", onKeyDown, { capture: true, signal: mountAbortSignal });
    window.addEventListener("keyup", onKeyUp, { capture: true, signal: mountAbortSignal });
    window.addEventListener("blur", onWindowBlur, { signal: mountAbortSignal });
    document.addEventListener("visibilitychange", onVisibility, { signal: mountAbortSignal });
    resetButton?.addEventListener("click", onReset, { signal: mountAbortSignal });

    syncTestedStat();
    syncHeldStat();
    syncResetButton();

    const teardown = () => {
      window.__keyboardCheckerMountAbort?.abort();
      window.__keyboardCheckerMountAbort = undefined;
      window.__keyboardCheckerMounted = false;
      window.teardownKeyboardCheckerPage = undefined;
    };

    window.teardownKeyboardCheckerPage = teardown;
    window.__keyboardCheckerMounted = true;
  }

  window.initKeyboardCheckerPage = initKeyboardCheckerPage;
})();