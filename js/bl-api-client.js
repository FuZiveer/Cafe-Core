(function() {
  "use strict";
  window.__cafeBlApi = {
    available: false,
    scrimCanEdit: false,
    scrim: { wins: 0, losses: 0 },
    rosterStats: null
  };
  let scrimWs = null;
  let scrimWsReconnectTimer = null;
  let scrimWsManualClose = false;
  let scrimWsConnected = false;
  function dispatchScrimWsStatus() {
    window.__cafeBlApi.scrimWsConnected = scrimWsConnected;
    window.dispatchEvent(
      new CustomEvent("cafe-scrim-ws-status", {
        detail: { connected: scrimWsConnected }
      })
    );
  }
  let topBarWakeupDotsTimer = null;
  let topBarWakeupDotsPhase = 0;
  function stopTopBarWakeupDots() {
    clearInterval(topBarWakeupDotsTimer);
    topBarWakeupDotsTimer = null;
  }
  function tickTopBarWakeupDots() {
    const dotsEl = document.getElementById("topbar-bl-wakeup-dots");
    if (!dotsEl) return;
    topBarWakeupDotsPhase = (topBarWakeupDotsPhase + 1) % 4;
    dotsEl.textContent = topBarWakeupDotsPhase === 0 ? "" : ".".repeat(topBarWakeupDotsPhase);
  }
  window.syncTopBarServerWakeup = function syncTopBarServerWakeup() {
    const wrap = document.getElementById("topbar-bl-wakeup");
    if (!wrap) return;
    const show = !scrimWsConnected && Boolean(wsBase());
    wrap.classList.toggle("hidden", !show);
    wrap.setAttribute("aria-hidden", show ? "false" : "true");
    if (!show) {
      stopTopBarWakeupDots();
      return;
    }
    if (!topBarWakeupDotsTimer) {
      tickTopBarWakeupDots();
      topBarWakeupDotsTimer = setInterval(tickTopBarWakeupDots, 420);
    }
  };
  function setScrimWsConnected(connected) {
    const next = Boolean(connected);
    if (scrimWsConnected === next) return;
    scrimWsConnected = next;
    dispatchScrimWsStatus();
    syncTopBarServerWakeup();
  }
  window.isCafeScrimWsConnected = function isCafeScrimWsConnected() {
    return scrimWsConnected;
  };
  function authOriginOverride() {
    const o = window.__CAFE_AUTH_ORIGIN;
    return typeof o === "string" && o.trim() ? o.trim().replace(/\/$/, "") : "";
  }
  function apiBase() {
    const override = authOriginOverride();
    if (override) return override;
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      return window.location.origin;
    }
    return "";
  }
  function wsBase() {
    const base = apiBase();
    if (!base) return "";
    if (base.startsWith("https://")) return `wss://${base.slice(8)}`;
    if (base.startsWith("http://")) return `ws://${base.slice(7)}`;
    return "";
  }
  function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    const base = apiBase();
    return base ? `${base}${p}` : p;
  }
  async function fetchJson(path, options = {}) {
    const res = await fetch(apiUrl(path), {
      credentials: "include",
      ...options,
      headers: {
        Accept: "application/json",
        ...options.headers || {}
      }
    });
    if (!res.ok) {
      const err = new Error(`bl_api_${res.status}`);
      err.status = res.status;
      try {
        err.body = await res.json();
      } catch {
        err.body = null;
      }
      throw err;
    }
    return res.json();
  }
  function dispatchBlApiUpdated() {
    window.dispatchEvent(
      new CustomEvent("cafe-bl-api-updated", { detail: { ...window.__cafeBlApi } })
    );
  }
  function applyScrimPayload(wins, losses) {
    const state = window.__cafeBlApi;
    const nextWins = Math.max(0, Math.round(Number(wins) || 0));
    const nextLosses = Math.max(0, Math.round(Number(losses) || 0));
    if (
      state.scrim?.wins === nextWins &&
      state.scrim?.losses === nextLosses
    ) {
      return;
    }
    state.scrim = { wins: nextWins, losses: nextLosses };
    state.available = true;
    dispatchBlApiUpdated();
  }
  function scheduleScrimWsReconnect() {
    if (scrimWsManualClose) return;
    clearTimeout(scrimWsReconnectTimer);
    scrimWsReconnectTimer = setTimeout(() => {
      scrimWsReconnectTimer = null;
      window.connectCafeScrimWebSocket?.();
    }, 3e3);
  }
  window.connectCafeScrimWebSocket = function connectCafeScrimWebSocket() {
    const base = wsBase();
    if (!base) return;
    if (scrimWs && (scrimWs.readyState === WebSocket.OPEN || scrimWs.readyState === WebSocket.CONNECTING)) {
      return;
    }
    scrimWsManualClose = false;
    if (!scrimWsConnected) syncTopBarServerWakeup();
    let ws;
    try {
      ws = new WebSocket(`${base}/ws/bl/scrim`);
    } catch {
      scheduleScrimWsReconnect();
      return;
    }
    scrimWs = ws;
    ws.onopen = () => {
      if (scrimWs !== ws) return;
      setScrimWsConnected(true);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data || ""));
        if (msg?.type !== "scrim") return;
        applyScrimPayload(msg.wins, msg.losses);
      } catch {
      }
    };
    ws.onclose = () => {
      if (scrimWs === ws) scrimWs = null;
      setScrimWsConnected(false);
      scheduleScrimWsReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
      }
    };
  };
  window.disconnectCafeScrimWebSocket = function disconnectCafeScrimWebSocket() {
    scrimWsManualClose = true;
    clearTimeout(scrimWsReconnectTimer);
    scrimWsReconnectTimer = null;
    const ws = scrimWs;
    scrimWs = null;
    setScrimWsConnected(false);
    syncTopBarServerWakeup();
    if (!ws) return;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
    }
  };
  const ROSTER_STATS_CLIENT_MIN_MS = 20 * 60 * 1000;
  const ROSTER_STATS_AUTO_REFRESH_MS = 20 * 60 * 1000;
  let lastRosterStatsFetchedAt = 0;
  function shouldFetchRosterStats(options) {
    if (options?.forceRoster === true) return true;
    if (!document.getElementById("page-black-listed")) return false;
    if (lastRosterStatsFetchedAt === 0) return true;
    if (Date.now() - lastRosterStatsFetchedAt < ROSTER_STATS_CLIENT_MIN_MS) {
      return false;
    }
    return true;
  }
  window.refreshCafeBlApiState = async function refreshCafeBlApiState(options) {
    const state = window.__cafeBlApi;
    let scrimOk = false;
    let rosterStatsOk = false;
    const fetchRoster = shouldFetchRosterStats(options);
    const scrimPromise = fetchJson("/api/bl/scrim-record");
    const rosterPath = options?.forceRoster
      ? "/api/bl/roster-stats?force=1"
      : "/api/bl/roster-stats";
    const rosterPromise = fetchRoster ? fetchJson(rosterPath) : null;
    const [scrimSettled, rosterStatsSettled] = await Promise.allSettled([
      scrimPromise,
      rosterPromise || Promise.resolve(null)
    ]);
    if (scrimSettled.status === "fulfilled") {
      const scrim = scrimSettled.value;
      scrimOk = true;
      state.scrim = {
        wins: Math.max(0, Math.round(Number(scrim.wins) || 0)),
        losses: Math.max(0, Math.round(Number(scrim.losses) || 0))
      };
      state.scrimCanEdit = scrim.canEdit === true;
    } else {
      state.scrimCanEdit = false;
    }
    if (fetchRoster) {
      if (rosterStatsSettled.status === "fulfilled" && rosterStatsSettled.value) {
        state.rosterStats = rosterStatsSettled.value;
        rosterStatsOk = state.rosterStats?.configured === true;
        lastRosterStatsFetchedAt = Date.now();
      } else if (rosterStatsSettled.status === "rejected") {
        state.rosterStats = null;
      }
    } else if (state.rosterStats?.configured) {
      rosterStatsOk = true;
    }
    state.available = scrimOk || rosterStatsOk;
    window.connectCafeScrimWebSocket?.();
    dispatchBlApiUpdated();
    return state;
  };
  let blApiResumeBound = false;
  function bindBlApiResumeRefresh() {
    if (blApiResumeBound) return;
    blApiResumeBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      void window.refreshCafeBlApiState?.();
    });
    window.addEventListener("online", () => {
      void window.refreshCafeBlApiState?.();
    });
  }
  bindBlApiResumeRefresh();
  setInterval(() => {
    if (!document.getElementById("page-black-listed")) return;
    void window.refreshCafeBlApiState?.();
  }, ROSTER_STATS_AUTO_REFRESH_MS);
  window.addEventListener("cafe-scrim-ws-status", syncTopBarServerWakeup);
  syncTopBarServerWakeup();
  if (wsBase()) {
    window.connectCafeScrimWebSocket();
  }
  window.patchCafeScrimRecord = async function patchCafeScrimRecord(record) {
    const wins = Math.max(0, Math.round(Number(record?.wins) || 0));
    const losses = Math.max(0, Math.round(Number(record?.losses) || 0));
    const data = await fetchJson("/api/bl/scrim-record", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wins, losses })
    });
    window.__cafeBlApi.available = true;
    window.__cafeBlApi.scrim = { wins: data.wins, losses: data.losses };
    window.__cafeBlApi.scrimCanEdit = data.canEdit === true;
    dispatchBlApiUpdated();
    return data;
  };
})();
