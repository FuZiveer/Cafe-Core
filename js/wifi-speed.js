(function () {
  "use strict";

  const CLOUDFLARE_DOWNLOAD_ENDPOINT = "https://speed.cloudflare.com/__down";
  const CLOUDFLARE_UPLOAD_ENDPOINT = "https://speed.cloudflare.com/__up";
  const LATENCY_PROBE_BYTES = 1000;
  const PHASE_DURATION_MS = 5_000;
  const DOWNLOAD_CHUNK_BYTES = 1_000_000;
  const UPLOAD_CHUNK_BYTES = 2_000_000;
  const LIVE_SPEED_UPDATE_INTERVAL_MS = 200;

  function canRunNetworkTest() {
    const p = location.protocol;
    return p === "http:" || p === "https:";
  }

  const WIFI_SPEED_IDLE_DOWNLOAD = "0 Mbps";
  const WIFI_SPEED_IDLE_UPLOAD = "0 Mbps";
  const WIFI_SPEED_IDLE_LATENCY = "0 ms";

  function formatMbps(bitsPerSecond) {
    if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return WIFI_SPEED_IDLE_DOWNLOAD;
    const mbps = bitsPerSecond / 1e6;
    if (mbps >= 100) return `${Math.round(mbps)} Mbps`;
    if (mbps >= 10) return `${mbps.toFixed(1)} Mbps`;
    return `${mbps.toFixed(2)} Mbps`;
  }

  function formatLatency(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return WIFI_SPEED_IDLE_LATENCY;
    return `${Math.round(ms)} ms`;
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    });
  }

  function linkAbortWithTimeout(parentSignal, timeoutMs) {
    const ctrl = new AbortController();
    const ms = Math.max(0, timeoutMs);
    let timeoutId = setTimeout(() => ctrl.abort(), ms);
    const forwardAbort = () => {
      clearTimeout(timeoutId);
      ctrl.abort();
    };
    parentSignal?.addEventListener("abort", forwardAbort, { once: true });
    return {
      signal: ctrl.signal,
      cancel() {
        clearTimeout(timeoutId);
        parentSignal?.removeEventListener("abort", forwardAbort);
      }
    };
  }

  async function readResponseBytes(response, onChunk, shouldContinue) {
    if (!response.body || typeof response.body.getReader !== "function") {
      const buf = await response.arrayBuffer();
      onChunk?.(buf.byteLength);
      return buf.byteLength;
    }
    const reader = response.body.getReader();
    let total = 0;
    for (;;) {
      if (shouldContinue && !shouldContinue()) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      onChunk?.(value.byteLength);
    }
    return total;
  }

  async function measureLatency(signal) {
    const samples = [];
    for (let i = 0; i < 4; i += 1) {
      const start = performance.now();
      const res = await fetch(`${CLOUDFLARE_DOWNLOAD_ENDPOINT}?bytes=${LATENCY_PROBE_BYTES}`, {
        method: "GET",
        cache: "no-store",
        signal
      });
      if (!res.ok) throw new Error("Latency check failed");
      await res.arrayBuffer();
      samples.push(performance.now() - start);
      if (i < 3) await sleep(120, signal);
    }
    samples.sort((a, b) => a - b);
    const mid = Math.floor(samples.length / 2);
    return samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
  }

  async function measureDownload(signal, durationMs, onInstantMbps) {
    const started = performance.now();
    const deadline = started + durationMs;
    let totalBytes = 0;
    let lastTick = started;
    let windowBytes = 0;

    const pushTick = () => {
      const now = performance.now();
      const dt = now - lastTick;
      if (dt >= LIVE_SPEED_UPDATE_INTERVAL_MS && windowBytes > 0) {
        onInstantMbps?.((windowBytes * 8) / (dt / 1000));
        windowBytes = 0;
        lastTick = now;
      }
    };

    const stillMeasuring = () => performance.now() < deadline;

    while (stillMeasuring()) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const remaining = deadline - performance.now();
      if (remaining < 80) break;
      const linked = linkAbortWithTimeout(signal, remaining);
      try {
        const res = await fetch(`${CLOUDFLARE_DOWNLOAD_ENDPOINT}?bytes=${DOWNLOAD_CHUNK_BYTES}&r=${Math.random()}`, {
          method: "GET",
          cache: "no-store",
          signal: linked.signal
        });
        if (!res.ok) throw new Error("Download failed");
        const chunkBytes = await readResponseBytes(
          res,
          (increment) => {
            windowBytes += increment;
            pushTick();
          },
          stillMeasuring
        );
        totalBytes += chunkBytes;
        pushTick();
      } catch (err) {
        if (signal.aborted) throw err;
        if (stillMeasuring() && err?.name !== "AbortError") throw err;
        break;
      } finally {
        linked.cancel();
      }
    }

    const seconds = Math.max((performance.now() - started) / 1000, 0.001);
    return (totalBytes * 8) / seconds;
  }

  async function measureUpload(signal, durationMs, onInstantMbps) {
    const payload = new Uint8Array(UPLOAD_CHUNK_BYTES);
    const started = performance.now();
    const deadline = started + durationMs;
    let totalBytes = 0;
    let lastTick = started;
    let windowBytes = 0;

    const stillMeasuring = () => performance.now() < deadline;

    while (stillMeasuring()) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const remaining = deadline - performance.now();
      if (remaining < 80) break;
      const linked = linkAbortWithTimeout(signal, remaining);
      const chunkStart = performance.now();
      try {
        const res = await fetch(`${CLOUDFLARE_UPLOAD_ENDPOINT}?r=${Math.random()}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: payload,
          cache: "no-store",
          signal: linked.signal
        });
        if (!res.ok) throw new Error("Upload failed");
        await res.arrayBuffer();
        totalBytes += payload.byteLength;

        const chunkMs = performance.now() - chunkStart;
        windowBytes += payload.byteLength;
        const now = performance.now();
        if (now - lastTick >= LIVE_SPEED_UPDATE_INTERVAL_MS) {
          const bps = (windowBytes * 8) / ((now - lastTick) / 1000);
          onInstantMbps?.(bps);
          windowBytes = 0;
          lastTick = now;
        } else if (chunkMs > 0) {
          onInstantMbps?.((payload.byteLength * 8) / (chunkMs / 1000));
        }
      } catch (err) {
        if (signal.aborted) throw err;
        if (stillMeasuring() && err?.name !== "AbortError") throw err;
        break;
      } finally {
        linked.cancel();
      }
    }

    const seconds = Math.max((performance.now() - started) / 1000, 0.001);
    return (totalBytes * 8) / seconds;
  }

  function setArenaState(arena, state) {
    arena.classList.remove(
      "cps-tester-arena--idle",
      "cps-tester-arena--active",
      "cps-tester-arena--result",
      "wifi-speed-arena--download",
      "wifi-speed-arena--upload"
    );
    if (state === "idle") arena.classList.add("cps-tester-arena--idle");
    else if (state === "running") arena.classList.add("cps-tester-arena--active");
    else if (state === "done") arena.classList.add("cps-tester-arena--result");
  }

  function initWifiSpeedPage() {
    if (window.__wifiSpeedMounted) return;

    const arena = document.getElementById("wifi-speed-arena");
    const primary = document.getElementById("wifi-speed-primary");
    const secondary = document.getElementById("wifi-speed-secondary");
    const live = document.getElementById("wifi-speed-live");
    const progressWrap = document.getElementById("wifi-speed-progress");
    const progressBar = document.getElementById("wifi-speed-progress-bar");
    const downloadEl = document.getElementById("wifi-speed-download");
    const uploadEl = document.getElementById("wifi-speed-upload");
    const latencyEl = document.getElementById("wifi-speed-latency");

    if (!arena || !primary || !downloadEl || !uploadEl || !latencyEl) return;

    window.__wifiSpeedMountAbort?.abort();
    window.__wifiSpeedMountAbort = new AbortController();
    const mountSignal = window.__wifiSpeedMountAbort.signal;

    let activeTestAbortController = null;
    let isTestRunning = false;
    let phaseProgressTimer = null;

    const resetWifiSpeedStatsToIdle = () => {
      downloadEl.textContent = WIFI_SPEED_IDLE_DOWNLOAD;
      uploadEl.textContent = WIFI_SPEED_IDLE_UPLOAD;
      latencyEl.textContent = WIFI_SPEED_IDLE_LATENCY;
    };

    const resetProgressBarFill = () => {
      if (!progressBar) return;
      progressBar.style.transition = "none";
      progressBar.style.transform = "scaleX(0)";
    };

    const clearPhaseProgressTimer = () => {
      if (phaseProgressTimer == null) return;
      clearTimeout(phaseProgressTimer);
      phaseProgressTimer = null;
    };

    const startSmoothPhaseProgress = (durationMs) => {
      if (!progressBar) return;
      clearPhaseProgressTimer();
      resetProgressBarFill();
      const reducedMotion =
        typeof isReducedMotionEnabled === "function" && isReducedMotionEnabled();
      const ms = reducedMotion ? 0 : durationMs;
      if (ms <= 0) {
        progressBar.style.transform = "scaleX(1)";
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          progressBar.style.transition = `transform ${ms}ms linear`;
          progressBar.style.transform = "scaleX(1)";
        });
      });
      phaseProgressTimer = setTimeout(() => {
        phaseProgressTimer = null;
      }, ms);
    };

    const hideLiveSpeed = () => {
      if (!live) return;
      live.classList.add("hidden");
      live.classList.remove("cps-tester-primary--score");
      live.hidden = true;
      live.setAttribute("aria-hidden", "true");
    };

    const showLiveSpeed = (text, phaseLabel) => {
      if (!live) return;
      live.classList.remove("hidden");
      live.classList.add("cps-tester-primary--score");
      live.hidden = false;
      live.setAttribute("aria-hidden", "false");
      if (text != null) live.textContent = text;
      primary.classList.add("hidden");
      primary.hidden = true;
      if (secondary) {
        secondary.hidden = !phaseLabel;
        secondary.textContent = phaseLabel || "";
      }
    };

    const setPhaseLabel = (text, subtext) => {
      hideLiveSpeed();
      primary.hidden = false;
      primary.classList.remove("hidden");
      primary.textContent = text;
      if (secondary) {
        secondary.hidden = !subtext;
        secondary.textContent = subtext || "";
      }
    };

    const resetUiForRun = () => {
      downloadEl.textContent = "…";
      uploadEl.textContent = "…";
      latencyEl.textContent = "…";
      setPhaseLabel("Measuring latency…");
      progressWrap.hidden = false;
      progressWrap.setAttribute("aria-hidden", "false");
      resetProgressBarFill();
      hideLiveSpeed();
      setArenaState(arena, "running");
    };

    const returnArenaToIdle = (errorSubtext) => {
      isTestRunning = false;
      setArenaState(arena, "idle");
      clearPhaseProgressTimer();
      progressWrap.hidden = true;
      progressWrap.setAttribute("aria-hidden", "true");
      resetProgressBarFill();
      hideLiveSpeed();
      primary.hidden = false;
      primary.classList.remove("hidden");
      primary.textContent = "Click to start";
      if (secondary) {
        secondary.hidden = !errorSubtext;
        secondary.textContent = errorSubtext || "";
      }
    };

    const runTest = async () => {
      if (isTestRunning) return;
      if (!canRunNetworkTest()) {
        primary.textContent = "Open this site over HTTP(S) to run a speed test";
        secondary.hidden = false;
        secondary.textContent = "File:// and offline previews cannot reach the test servers.";
        return;
      }

      activeTestAbortController?.abort();
      activeTestAbortController = new AbortController();
      const testAbortSignal = activeTestAbortController.signal;

      isTestRunning = true;
      resetUiForRun();

      try {
        const latency = await measureLatency(testAbortSignal);
        latencyEl.textContent = formatLatency(latency);

        arena.classList.add("wifi-speed-arena--download");
        showLiveSpeed(WIFI_SPEED_IDLE_DOWNLOAD, "Measuring download");
        startSmoothPhaseProgress(PHASE_DURATION_MS);
        const downloadBps = await measureDownload(testAbortSignal, PHASE_DURATION_MS, (bps) =>
          showLiveSpeed(formatMbps(bps), "Measuring download")
        );
        downloadEl.textContent = formatMbps(downloadBps);

        arena.classList.remove("wifi-speed-arena--download");
        arena.classList.add("wifi-speed-arena--upload");
        showLiveSpeed(WIFI_SPEED_IDLE_UPLOAD, "Measuring upload");
        startSmoothPhaseProgress(PHASE_DURATION_MS);
        const uploadBps = await measureUpload(testAbortSignal, PHASE_DURATION_MS, (bps) =>
          showLiveSpeed(formatMbps(bps), "Measuring upload")
        );
        uploadEl.textContent = formatMbps(uploadBps);

        returnArenaToIdle();
      } catch (err) {
        if (err?.name === "AbortError") {
          resetWifiSpeedStatsToIdle();
          returnArenaToIdle();
          return;
        }
        const errorSubtext =
          err?.message === "Failed to fetch" || err?.message?.includes("fetch")
            ? "Network blocked or unreachable. Check connection, VPN, or ad blockers."
            : "Something went wrong during the test.";
        resetWifiSpeedStatsToIdle();
        returnArenaToIdle(errorSubtext);
      } finally {
        arena.classList.remove("wifi-speed-arena--download", "wifi-speed-arena--upload");
      }
    };

    const onArenaClick = () => {
      if (isTestRunning) return;
      void runTest();
    };

    arena.addEventListener("click", onArenaClick, { signal: mountSignal });

    const teardown = () => {
      clearPhaseProgressTimer();
      activeTestAbortController?.abort();
      activeTestAbortController = null;
      window.__wifiSpeedMountAbort?.abort();
      window.__wifiSpeedMountAbort = undefined;
      window.__wifiSpeedMounted = false;
      window.teardownWifiSpeedPage = undefined;
    };

    window.teardownWifiSpeedPage = teardown;
    window.__wifiSpeedMounted = true;
  }

  window.initWifiSpeedPage = initWifiSpeedPage;
})();