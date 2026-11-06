(function() {
  "use strict";
  let pollTimer = null;
  let abortCtl = null;
  function authBaseGuess() {
    const o = window.__CAFE_AUTH_ORIGIN;
    if (typeof o === "string" && o.trim()) return o.trim().replace(/\/$/, "");
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      return window.location.origin;
    }
    return "";
  }
  function apiUrl(path) {
    const base = authBaseGuess();
    const p = path.startsWith("/") ? path : `/${path}`;
    return base ? `${base}${p}` : p;
  }
  function escapeText(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function formatDayLabel(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    return `${m[2]}/${m[3]}`;
  }
  function renderChart(svgEl, labelsEl, series) {
    if (!svgEl || !labelsEl) return;
    svgEl.innerHTML = "";
    labelsEl.innerHTML = "";
    const empty = document.getElementById("server-stats-chart-empty");
    if (!series || !series.length) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    const vals = series.map((x) => Math.max(0, Number(x.total) || 0));
    const max = Math.max(1, ...vals);
    const n = vals.length;
    const w = 640;
    const h = 200;
    const pad = 24;
    const gw = w - pad * 2;
    const gh = h - pad * 2;
    const step = n <= 1 ? gw : gw / (n - 1);
    const pts = vals.map((v, i) => {
      const x = pad + (n <= 1 ? gw / 2 : i * step);
      const y = pad + gh - v / max * gh;
      return { x, y, v };
    });
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const fillD = `${d} L${pts[pts.length - 1].x.toFixed(1)},${(pad + gh).toFixed(1)} L${pts[0].x.toFixed(1)},${(pad + gh).toFixed(1)} Z`;
    const grid = 4;
    for (let g = 0; g <= grid; g++) {
      const gy = pad + gh * g / grid;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(pad));
      line.setAttribute("x2", String(w - pad));
      line.setAttribute("y1", gy.toFixed(1));
      line.setAttribute("y2", gy.toFixed(1));
      line.setAttribute("stroke", "#26262b");
      line.setAttribute("stroke-width", "1");
      svgEl.appendChild(line);
    }
    const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
    area.setAttribute("d", fillD);
    area.setAttribute("fill", "rgba(255, 30, 67, 0.12)");
    svgEl.appendChild(area);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#ff1e43");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    svgEl.appendChild(path);
    pts.forEach((p) => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", "3");
      c.setAttribute("fill", "#ff1e43");
      svgEl.appendChild(c);
    });
    const labelEvery = n <= 10 ? 1 : Math.ceil(n / 10);
    series.forEach((row, i) => {
      if (i % labelEvery !== 0 && i !== n - 1) return;
      const span = document.createElement("span");
      span.className = "shrink-0";
      span.textContent = formatDayLabel(row.date);
      span.title = escapeText(row.date);
      labelsEl.appendChild(span);
    });
  }
  async function loadSummary() {
    const daysSel = document.getElementById("server-stats-days");
    const totalEl = document.getElementById("server-stats-total");
    const svgEl = document.getElementById("server-stats-chart");
    const labelsEl = document.getElementById("server-stats-labels");
    const days = Math.max(1, Math.min(90, Math.round(Number(daysSel?.value) || 14)));
    if (daysSel) daysSel.value = String(days);
    abortCtl?.abort();
    abortCtl = new AbortController();
    const tid = window.setTimeout(() => abortCtl.abort(), 12e3);
    try {
      const res = await fetch(apiUrl(`/api/site-stats/summary?days=${days}`), {
        credentials: "include",
        signal: abortCtl.signal,
        cache: "no-store"
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error("stats_http");
      const data = await res.json();
      const total = Math.max(0, Math.round(Number(data?.totalAll) || 0));
      if (totalEl) totalEl.textContent = String(total);
      const series = Array.isArray(data?.series) ? data.series : [];
      renderChart(svgEl, labelsEl, series);
    } catch {
      clearTimeout(tid);
      if (totalEl) totalEl.textContent = "\u2014";
      renderChart(svgEl, labelsEl, []);
      const empty = document.getElementById("server-stats-chart-empty");
      if (empty) {
        empty.classList.remove("hidden");
        empty.textContent = "Could not load stats. Stay signed in as the server owner on the API host.";
      }
    }
  }
  function bindOnce() {
    const root = document.getElementById("page-server-stats");
    if (!root || root.dataset.serverStatsBound === "1") return;
    root.dataset.serverStatsBound = "1";
    document.getElementById("server-stats-days")?.addEventListener("change", () => void loadSummary());
    document.getElementById("server-stats-refresh")?.addEventListener("click", () => void loadSummary());
  }
  function startPolling() {
    stopPolling();
    pollTimer = window.setInterval(() => void loadSummary(), 6e4);
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }
  window.initServerStatsPage = function initServerStatsPage() {
    bindOnce();
    void loadSummary();
    startPolling();
    document.addEventListener("visibilitychange", onVis);
  };
  function onVis() {
    if (document.visibilityState === "visible") void loadSummary();
  }
  window.teardownServerStatsPage = function teardownServerStatsPage() {
    stopPolling();
    document.removeEventListener("visibilitychange", onVis);
    abortCtl?.abort();
  };
})();
