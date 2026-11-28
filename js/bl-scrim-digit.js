(function () {
  "use strict";

  const BL_SCRIM_DIGIT_TRANSITION = "transform 300ms ease-out";

  function digitMotionEnabled() {
    return !document.documentElement.classList.contains("reduce-motion");
  }

  function buildDigitStrip() {
    const strip = document.createElement("span");
    strip.className = "bl-scrim-digit-strip";
    for (let d = 0; d <= 9; d += 1) {
      const digit = document.createElement("span");
      digit.className = "bl-scrim-digit";
      digit.textContent = String(d);
      strip.appendChild(digit);
    }
    return strip;
  }

  function ensureDigitGroup(container, text) {
    const groupText = String(text || "0");
    let group = container.querySelector(".bl-scrim-digit-group");
    if (!group) {
      group = document.createElement("span");
      group.className = "bl-scrim-digit-group";
      group.setAttribute("aria-hidden", "true");
      container.replaceChildren(group);
    }
    while (group.children.length < groupText.length) {
      const slot = document.createElement("span");
      slot.className = "bl-scrim-digit-slot";
      slot.appendChild(buildDigitStrip());
      group.appendChild(slot);
    }
    while (group.children.length > groupText.length) {
      group.lastElementChild?.remove();
    }
    return { group, text: groupText };
  }

  function digitAtRight(text, posFromRight) {
    const idx = text.length - 1 - posFromRight;
    return idx >= 0 ? text.charAt(idx) : null;
  }

  function setDigitSlot(slot, digitChar, prevDigitChar, animate, delayMs) {
    const strip = slot.querySelector(".bl-scrim-digit-strip");
    if (!strip) return;
    const d = Math.max(0, Math.min(9, Number(digitChar) || 0));
    const hasPrev =
      prevDigitChar !== null && prevDigitChar !== undefined && prevDigitChar !== "";
    const fromD = hasPrev ? Math.max(0, Math.min(9, Number(prevDigitChar) || 0)) : d;
    const shouldAnimate =
      animate && digitMotionEnabled() && (hasPrev ? fromD !== d : false);
    if (!shouldAnimate) {
      strip.style.transition = "none";
      strip.style.transitionDelay = "0ms";
      strip.style.transform = `translate3d(0, calc(${-d} * var(--bl-scrim-digit-step, 1em)), 0)`;
      void strip.offsetHeight;
      strip.style.transition = BL_SCRIM_DIGIT_TRANSITION;
      return;
    }
    const rollFrom = hasPrev ? fromD : 0;
    const toTransform = `translate3d(0, calc(${-d} * var(--bl-scrim-digit-step, 1em)), 0)`;
    const fromTransform = `translate3d(0, calc(${-rollFrom} * var(--bl-scrim-digit-step, 1em)), 0)`;
    strip.style.transition = "none";
    strip.style.transitionDelay = "0ms";
    strip.style.transform = fromTransform;
    void strip.offsetHeight;
    window.requestAnimationFrame(() => {
      if (!slot.isConnected) return;
      const live = slot.querySelector(".bl-scrim-digit-strip");
      if (!live) return;
      live.style.transition = "none";
      live.style.transitionDelay = "0ms";
      live.style.transform = fromTransform;
      void live.offsetHeight;
      window.requestAnimationFrame(() => {
        if (!live.isConnected) return;
        live.style.transition = BL_SCRIM_DIGIT_TRANSITION;
        live.style.transitionDelay = `${delayMs}ms`;
        live.style.transform = toTransform;
      });
    });
  }

  /**
   * @param {HTMLElement} container — usually `.bl-scrim-counter-num`
   * @param {number} value
   * @param {number|null|undefined} previousValue
   * @param {{ minimumIntegerDigits?: number }} [options]
   */
  function paintAnimatedNumber(container, value, previousValue, options = {}) {
    const minDigits = Math.max(0, Math.round(Number(options.minimumIntegerDigits) || 0));
    const num = Math.max(0, Math.round(Number(value) || 0));
    let text = String(num);
    if (minDigits > 0) text = text.padStart(minDigits, "0");

    const motion = digitMotionEnabled();
    const hasPrevious =
      previousValue !== null && previousValue !== undefined && !Number.isNaN(Number(previousValue));
    const animate = motion && hasPrevious && Number(previousValue) !== num;

    const prevNum =
      previousValue === null || previousValue === undefined
        ? num
        : Math.max(0, Math.round(Number(previousValue) || 0));
    let prevText = String(prevNum);
    if (minDigits > 0) prevText = prevText.padStart(minDigits, "0");

    ensureDigitGroup(container, text);
    const slots = container.querySelectorAll(".bl-scrim-digit-slot");
    const maxLen = Math.max(text.length, prevText.length);
    text.split("").forEach((ch, index) => {
      const posFromRight = text.length - 1 - index;
      const prevCh = digitAtRight(prevText, posFromRight);
      const slotAnimate = animate && prevText !== text;
      const delay = slotAnimate ? (maxLen - 1 - index) * 45 : 0;
      const rollInNew = animate && prevCh === null;
      setDigitSlot(
        slots[index],
        ch,
        rollInNew ? "0" : prevCh,
        slotAnimate || rollInNew,
        delay
      );
    });
    container.setAttribute("aria-label", text);
  }

  window.CafeBlScrimDigit = {
    paintAnimatedNumber,
    digitMotionEnabled
  };
})();