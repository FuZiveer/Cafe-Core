(function() {
  "use strict";
  window.__cafeBlApi = {
    available: false,
    scrimCanEdit: false,
    scrim: { wins: 0, losses: 0 }
  };
  let scrimWs = null;
  let scrimWsReconnectTimer = null;
  let scrimWsManualClose = false;
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
    if (scrimWsManualClose || !window.__cafeBlApi.available) return;
    clearTimeout(scrimWsReconnectTimer);
    scrimWsReconnectTimer = setTimeout(() => {
      scrimWsReconnectTimer = null;
      window.connectCafeScrimWebSocket?.();
    }, 3e3);
  }
  window.connectCafeScrimWebSocket = function connectCafeScrimWebSocket() {
    if (!window.__cafeBlApi.available) return;
    const base = wsBase();
    if (!base) return;
    if (scrimWs && (scrimWs.readyState === WebSocket.OPEN || scrimWs.readyState === WebSocket.CONNECTING)) {
      return;
    }
    scrimWsManualClose = false;
    let ws;
    try {
      ws = new WebSocket(`${base}/ws/bl/scrim`);
    } catch {
      scheduleScrimWsReconnect();
      return;
    }
    scrimWs = ws;
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
    if (!ws) return;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
    }
  };
  window.refreshCafeBlApiState = async function refreshCafeBlApiState() {
    const state = window.__cafeBlApi;
    let scrimOk = false;
    try {
      const scrim = await fetchJson("/api/bl/scrim-record");
      scrimOk = true;
      state.scrim = {
        wins: Math.max(0, Math.round(Number(scrim.wins) || 0)),
        losses: Math.max(0, Math.round(Number(scrim.losses) || 0))
      };
      state.scrimCanEdit = scrim.canEdit === true;
    } catch {
      state.scrimCanEdit = false;
    }
    state.available = scrimOk;
    if (scrimOk) {
      window.connectCafeScrimWebSocket?.();
    } else {
      window.disconnectCafeScrimWebSocket?.();
    }
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
