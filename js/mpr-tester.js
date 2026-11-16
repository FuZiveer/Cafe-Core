(function () {
  "use strict";

  const MPR_INGEST_WARMUP_MS = 500;

  const timingPresets = [
    { prep: 2, test: 6000 },
    { prep: 3, test: 10000 },
    { prep: 4, test: 10000 }
  ];

  function mprHzInt(value) {
    return Number.isFinite(value) && value > 0 ? `${Math.round(value)} Hz` : "0 Hz";
  }
  function mprPctInt(value) {
    return Number.isFinite(value) ? `${Math.round(value)}%` : "0%";
  }
  function mprLiveHzInt(value) {
    return Number.isFinite(value) && value > 0 ? String(Math.round(value)) : "0";
  }
  function mprClockGrain() {
    const ua = navigator.userAgent;
    let grain = /Firefox\/|Version\/.*Safari\//.test(ua) ? 1 : 0.1;
    if (window.crossOriginIsolated) grain = /Firefox\/|Version\/.*Safari\//.test(ua) ? 0.02 : 0.005;
    let previous = performance.now();
    let smallest = Infinity;
    for (let i = 0; i < 4096; i++) {
      const t = performance.now();
      if (t > previous) smallest = Math.min(smallest, t - previous);
      previous = t;
    }
    return Number.isFinite(smallest) ? Math.max(grain, smallest) : Infinity;
  }

  function initMprTesterPage() {
    if (window.__mprTesterMounted) return;
    if (typeof window.MprPollingEngine === "undefined") return;

    const zone = document.getElementById("mpr-tester-zone");
    const primaryEl = document.getElementById("mpr-tester-primary");
    const secondaryEl = document.getElementById("mpr-tester-secondary");
    const readoutEl = document.getElementById("mpr-tester-zone-readout");
    const liveRate = document.getElementById("mpr-tester-live-rate");
    const zoneDisplay = document.getElementById("mpr-tester-zone-display");
    const avgEl = document.getElementById("mpr-tester-avg");
    const peakEl = document.getElementById("mpr-tester-peak");
    const stabilityEl = document.getElementById("mpr-tester-stability");
    const jitterEl = document.getElementById("mpr-tester-jitter");
    const timerEl = document.getElementById("mpr-tester-timer");

    if (!zone || !primaryEl || !readoutEl || !window.MprPollingEngine?.Capture) return;

    window.__mprTesterMountAbort?.abort();
    window.__mprTesterMountAbort = new AbortController();
    const signal = window.__mprTesterMountAbort.signal;

    const capture = new window.MprPollingEngine.Capture();
    const state = {
      running: false,
      preparing: false,
      completed: false,
      startTime: null,
      endTime: null,
      sampleCount: 0
    };

    let timingIndex = 1;
    let prepSeconds = timingPresets[timingIndex].prep;
    let testDurationMs = timingPresets[timingIndex].test;
    let countdownTimer = null;
    let autoStopTimer = null;
    let ingestOpenAt = 0;
    let sampleEndAt = 0;

    const rawSupported = "onpointerrawupdate" in window;
    const moveEvent = rawSupported ? "pointerrawupdate" : "pointermove";

    function syncZoneInteractable() {
      const canActivate = !state.running;
      zone.classList.toggle("mpr-tester-zone--clickable", canActivate);
      zone.tabIndex = canActivate ? 0 : -1;
      zone.setAttribute("aria-disabled", canActivate ? "false" : "true");
      if (!canActivate) return;
      if (state.preparing) {
        zone.setAttribute("aria-label", "Cancel countdown");
      } else if (state.completed || state.endTime !== null) {
        zone.setAttribute("aria-label", "Run mouse polling rate test again");
      } else {
        zone.setAttribute("aria-label", "Start mouse polling rate test");
      }
    }

    function syncZonePresentation(stats) {
      const idle = !state.running && !state.preparing && state.endTime === null;
      const hasResult = !state.running && !state.preparing && state.endTime !== null;

      if (idle) {
        readoutEl.hidden = true;
        primaryEl.hidden = false;
        if (secondaryEl) {
          secondaryEl.hidden = true;
          secondaryEl.textContent = "";
        }
        primaryEl.textContent = "Click anywhere to start";
        primaryEl.classList.remove("cps-tester-primary--score");
        zone.setAttribute("aria-labelledby", "mpr-tester-primary");
        return;
      }

      if (state.preparing || state.running) {
        readoutEl.hidden = false;
        primaryEl.hidden = true;
        if (secondaryEl) {
          secondaryEl.hidden = true;
          secondaryEl.textContent = "";
        }
        zone.setAttribute("aria-labelledby", "mpr-tester-zone-heading");
        return;
      }

      if (hasResult) {
        readoutEl.hidden = true;
        primaryEl.hidden = false;
        const label = stats.count ? `${Math.round(stats.avgRate)} Hz` : "0 Hz";
        primaryEl.textContent = label;
        primaryEl.classList.toggle("cps-tester-primary--score", Boolean(stats.count));
        if (secondaryEl) {
          secondaryEl.hidden = false;
          secondaryEl.textContent = "Click to continue";
        }
        zone.setAttribute("aria-labelledby", "mpr-tester-primary");
      }
    }

    function onZoneActivate(event) {
      if (event.type === "pointerdown" && event.button !== 0) return;
      if (state.running) return;
      if (state.preparing) {
        event.preventDefault();
        stopTest();
        return;
      }
      event.preventDefault();
      startTest();
    }

    function clearTimers() {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      if (autoStopTimer) {
        clearTimeout(autoStopTimer);
        autoStopTimer = null;
      }
    }

    function syncTimerDisplay() {
      if (!timerEl) return;
      if (!state.running || sampleEndAt <= 0) {
        timerEl.textContent = "0";
        return;
      }
      const secondsLeft = Math.max(0, (sampleEndAt - performance.now()) / 1000);
      timerEl.textContent = secondsLeft <= 0 ? "0" : String(Math.ceil(secondsLeft));
    }

    function calculateStats() {
      const now = state.endTime ?? performance.now();
      const stats = capture.snapshot(now, state.running || state.endTime !== null);
      state.sampleCount = stats.count;
      return stats;
    }

    function renderMetrics(stats) {
      avgEl.textContent = mprHzInt(stats.avgRate);
      peakEl.textContent = mprHzInt(stats.peakRate);
      stabilityEl.textContent = mprPctInt(stats.stability);
      jitterEl.textContent = mprPctInt(stats.jitter);
      syncTimerDisplay();
    }

    function render() {
      const now = performance.now();
      if (state.running) capture.frame(now);
      const stats = calculateStats();
      if (state.preparing) {
        zoneDisplay?.classList.add("is-ready");
      } else if (state.running) {
        liveRate.textContent = mprLiveHzInt(stats.avgRate);
        zoneDisplay?.classList.toggle("is-ready", stats.count <= 0);
      } else if (state.endTime !== null) {
        liveRate.textContent = mprLiveHzInt(stats.avgRate);
      }

      renderMetrics(stats);
      syncZonePresentation(stats);
      syncZoneInteractable();

      if (state.running) requestAnimationFrame(render);
    }

    function finishTest(_statusLabel, _hintText, markComplete) {
      clearTimers();
      state.running = false;
      state.preparing = false;
      state.completed = Boolean(markComplete);
      zone.classList.toggle("mpr-tester-zone--complete", state.completed);
      state.endTime = performance.now();
      zone.classList.remove("mpr-tester-zone--active", "mpr-tester-zone--flash");
      syncZoneInteractable();
      render();
    }

    function beginSampling() {
      readoutEl.classList.remove("mpr-tester-zone-readout--countdown");
      capture.reset({ source: moveEvent, clockGrain: mprClockGrain() });
      ingestOpenAt = performance.now() + MPR_INGEST_WARMUP_MS;
      sampleEndAt = performance.now() + testDurationMs;
      state.running = true;
      state.preparing = false;
      state.completed = false;
      state.startTime = performance.now();
      state.endTime = null;
      zone.classList.add("mpr-tester-zone--active");
      zone.classList.remove("mpr-tester-zone--flash");
      requestAnimationFrame(() => {
        zone.classList.add("mpr-tester-zone--flash");
      });
      requestAnimationFrame(render);
      autoStopTimer = setTimeout(() => finishTest("Complete", null, true), testDurationMs);
    }

    function updateCountdownUI(remaining) {
      liveRate.textContent = String(remaining);
      zoneDisplay?.classList.add("is-ready");
      readoutEl.classList.toggle("mpr-tester-zone-readout--countdown", true);
    }

    function startTest() {
      if (state.running || state.preparing) return;
      clearTimers();
      if (state.completed || state.sampleCount > 0) resetTest();
      state.preparing = true;
      sampleEndAt = 0;
      syncZoneInteractable();
      let remaining = prepSeconds;
      syncZonePresentation(capture.snapshot(performance.now(), true));
      if (timerEl) timerEl.textContent = "0";
      updateCountdownUI(remaining);
      countdownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          countdownTimer = null;
          beginSampling();
          return;
        }
        updateCountdownUI(remaining);
      }, 1000);
    }

    function stopTest() {
      if (state.preparing) {
        clearTimers();
        state.preparing = false;
        syncZoneInteractable();
        liveRate.textContent = "0";
        zoneDisplay?.classList.add("is-ready");
        readoutEl.classList.remove("mpr-tester-zone-readout--countdown");
        if (timerEl) timerEl.textContent = "0";
        syncZonePresentation(capture.snapshot(performance.now(), true));
        return;
      }
      if (!state.running) return;
      finishTest("Stopped", null, false);
    }

    function resetTest() {
      capture.reset({ source: moveEvent, clockGrain: capture.clockGrain || mprClockGrain() });
      clearTimers();
      state.running = false;
      state.preparing = false;
      state.completed = false;
      zone.classList.remove("mpr-tester-zone--complete");
      state.startTime = null;
      state.endTime = null;
      state.sampleCount = 0;
      ingestOpenAt = 0;
      sampleEndAt = 0;
      if (timerEl) timerEl.textContent = "0";
      liveRate.textContent = "0";
      zoneDisplay?.classList.add("is-ready");
      zone.classList.remove("mpr-tester-zone--active", "mpr-tester-zone--flash");
      readoutEl.classList.remove("mpr-tester-zone-readout--countdown");
      syncZoneInteractable();
      const stats = capture.snapshot(performance.now(), true);
      renderMetrics(stats);
      syncZonePresentation(stats);
    }

    function recordEvent(event) {
      if (!state.running || event.isTrusted !== true || event.pointerType !== "mouse") return;
      if (performance.now() < ingestOpenAt) return;
      if (event.type !== capture.source) {
        if (event.type !== "pointermove" || capture.samples.length || performance.now() - state.startTime < 300) return;
        capture.source = "pointermove";
      }
      capture.ingest(event, performance.now());
    }

    function interruptCapture(reason) {
      if (state.preparing) {
        stopTest();
        return;
      }
      if (!state.running) return;
      capture.interrupt(reason);
      finishTest("Interrupted", null, false);
    }

    const onVisibility = () => {
      if (document.hidden) interruptCapture("hidden");
    };
    const onBlur = () => interruptCapture("blur");

    window.addEventListener(moveEvent, recordEvent, { passive: true, capture: true, signal });
    if (rawSupported) {
      window.addEventListener("pointermove", recordEvent, { passive: true, capture: true, signal });
    }
    document.addEventListener("visibilitychange", onVisibility, { signal });
    window.addEventListener("blur", onBlur, { signal });

    zone.addEventListener(
      "mouseenter",
      () => {
        if (state.running) zone.classList.add("mpr-tester-zone--active");
      },
      { signal }
    );
    zone.addEventListener(
      "mouseleave",
      () => {
        if (!state.running) zone.classList.remove("mpr-tester-zone--active");
      },
      { signal }
    );

    zone.addEventListener("pointerdown", onZoneActivate, { signal });
    zone.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      onZoneActivate(event);
    }, { signal });

    resetTest();
    renderMetrics(capture.snapshot(performance.now(), true));

    const teardown = () => {
      clearTimers();
      window.__mprTesterMountAbort?.abort();
      window.__mprTesterMountAbort = undefined;
      window.__mprTesterMounted = false;
      window.teardownMprTesterPage = undefined;
      resetTest();
    };
    window.teardownMprTesterPage = teardown;
    window.__mprTesterMounted = true;
  }

  window.initMprTesterPage = initMprTesterPage;
})();