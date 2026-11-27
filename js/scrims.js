(function () {
  "use strict";

  let queueCapacity = 2;

  let slots = Array.from({ length: queueCapacity }, () => null);
  let userQueued = false;
  let queueVersion = 0;
  let root = null;
  let onToggleClick = null;
  let onSignInClick = null;
  let onAuthChange = null;
  let queueTimerId = null;
  let queueJoinedAt = null;
  let lastMatchVoice = null;
  let activeMatch = null;
  let queueActionPending = false;
  let queuePendingAction = null;
  let queueToggleGeneration = 0;
  let queuePendingSafetyTimer = null;
  let queueWs = null;
  let queueWsReconnectTimer = null;
  let queueWsManualClose = false;
  let queuePollTimer = null;
  let lastQueueFetchAt = 0;

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

  async function fetchQueueJson(path, options = {}, { timeoutMs = 15e3 } = {}) {
    const ctrl = new AbortController();
    const ms = Math.max(3e3, Number(timeoutMs) || 15e3);
    const tid = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(apiUrl(path), {
        credentials: "include",
        ...options,
        signal: ctrl.signal,
        headers: {
          Accept: "application/json",
          ...options.headers || {}
        }
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        const err = new Error(`scrim_queue_${res.status}`);
        err.status = res.status;
        err.body = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err?.name === "AbortError") {
        const timeoutErr = new Error("scrim_queue_timeout");
        timeoutErr.code = "timeout";
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(tid);
    }
  }

  function amInQueueFromPayload(payload) {
    if (payload?.youInQueue === true) return true;
    const uid = myDiscordId();
    if (!uid || !Array.isArray(payload?.slots)) return false;
    return payload.slots.some((s) => s?.id && String(s.id) === uid);
  }

  function clearQueuePendingState() {
    queueActionPending = false;
    queuePendingAction = null;
    if (queuePendingSafetyTimer != null) {
      clearTimeout(queuePendingSafetyTimer);
      queuePendingSafetyTimer = null;
    }
  }

  function beginQueuePending(action) {
    queueActionPending = true;
    queuePendingAction = action === "leave" ? "leave" : "join";
    if (queuePendingSafetyTimer != null) clearTimeout(queuePendingSafetyTimer);
    queuePendingSafetyTimer = window.setTimeout(() => {
      queuePendingSafetyTimer = null;
      clearQueuePendingState();
      void refreshScrimQueue({ force: true });
      if (root) renderQueue();
    }, 22e3);
  }

  function settleQueuePendingFromPayload(payload) {
    if (!queueActionPending || !queuePendingAction) return;
    const inQueue = amInQueueFromPayload(payload);
    const matched =
      (queuePendingAction === "leave" && !inQueue) ||
      (queuePendingAction === "join" && inQueue);
    if (!matched) return;
    clearQueuePendingState();
  }

  function getDiscordUser() {
    return typeof window.getDiscordAuthUser === "function" ? window.getDiscordAuthUser() : null;
  }

  function myDiscordId() {
    const id = getDiscordUser()?.id;
    return id ? String(id) : "";
  }

  function mapSlotFromServer(entry, index) {
    if (!entry?.id) return null;
    const you = myDiscordId() && String(entry.id) === myDiscordId();
    return {
      id: String(entry.id),
      displayName: entry.displayName || entry.username || "Discord",
      username: entry.username ? String(entry.username) : "",
      avatarUrl: entry.avatarUrl || "",
      joinedAt: entry.joinedAt || null,
      you,
      mock: false
    };
  }

  function applyServerQueuePayload(payload) {
    if (!payload || !Array.isArray(payload.slots)) return;
    const nextVersion = Number(payload.version) || 0;
    if (nextVersion < queueVersion) return;
    queueVersion = nextVersion;
    if (Number(payload.capacity) >= 2) {
      queueCapacity = Math.min(10, Math.round(Number(payload.capacity)));
    }
    slots = Array.from({ length: queueCapacity }, (_, i) =>
      mapSlotFromServer(payload.slots[i], i)
    );
    userQueued = payload.youInQueue === true || slots.some((m) => m?.you);
    if (payload.yourJoinedAt) {
      queueJoinedAt = Number(payload.yourJoinedAt) || queueJoinedAt;
    } else if (!userQueued) {
      queueJoinedAt = null;
    }
    lastMatchVoice = payload.lastMatchVoice || null;
    activeMatch = payload.activeMatch || null;
    settleQueuePendingFromPayload(payload);
    renderQueue();
  }

  function queueCount() {
    return slots.filter(Boolean).length;
  }

  function standingByCopy(count) {
    if (count === 0) return "0 players standing by in queue";
    if (count === 1) return "1 player currently in queue";
    return `${count} players standing by in queue`;
  }

  function formatQueueElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function stopQueueTimer() {
    if (queueTimerId == null) return;
    clearInterval(queueTimerId);
    queueTimerId = null;
  }

  function syncQueueTimer() {
    const wrap = root?.querySelector("#scrims-queue-timer-wrap");
    const label = root?.querySelector("#scrims-queue-timer");
    if (!userQueued) {
      stopQueueTimer();
      queueJoinedAt = null;
      wrap?.classList.add("hidden");
      return;
    }
    if (!queueJoinedAt) queueJoinedAt = Date.now();
    wrap?.classList.remove("hidden");
    const tick = () => {
      if (label && queueJoinedAt) {
        label.textContent = formatQueueElapsed(Date.now() - queueJoinedAt);
      }
    };
    tick();
    if (queueTimerId == null) {
      queueTimerId = window.setInterval(tick, 1000);
    }
  }

  function renderSlot(el, index, member) {
    el.className = "scrims-roster-slot";
    el.replaceChildren();

    if (!member) {
      el.classList.add("scrims-roster-slot--empty");
      el.setAttribute("aria-label", `Slot ${index + 1} awaiting player`);
      const icon = document.createElement("div");
      icon.className = "scrims-roster-slot-empty-icon";
      icon.innerHTML = '<i class="fa-solid fa-user" aria-hidden="true"></i>';
      const title = document.createElement("span");
      title.className = "scrims-roster-slot-empty-title";
      title.textContent = "Awaiting…";
      const sub = document.createElement("span");
      sub.className = "scrims-roster-slot-empty-sub";
      sub.textContent = `Slot #${index + 1}`;
      el.appendChild(icon);
      el.appendChild(title);
      el.appendChild(sub);
      return;
    }

    el.classList.add("scrims-roster-slot--filled");
    if (member.you) el.classList.add("scrims-roster-slot--you");
    el.setAttribute("aria-label", `${member.displayName}, slot ${index + 1}`);

    const avatar = document.createElement("img");
    avatar.className = "scrims-roster-slot-avatar";
    avatar.src = member.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
    avatar.alt = "";
    avatar.width = 44;
    avatar.height = 44;
    avatar.loading = "lazy";
    avatar.decoding = "async";

    const name = document.createElement("span");
    name.className = "scrims-roster-slot-name";
    name.textContent = member.you ? "You" : member.displayName;

    const sub = document.createElement("span");
    sub.className = "scrims-roster-slot-sub";
    sub.textContent = member.username ? `@${member.username}` : "Queued";

    el.appendChild(avatar);
    el.appendChild(name);
    el.appendChild(sub);
  }

  function renderTeamRoster(teamEl, team) {
    teamEl.replaceChildren();
    const header = document.createElement("p");
    header.className = "scrims-match-team-name";
    header.textContent = team.name || "Team";
    teamEl.appendChild(header);
    const list = document.createElement("ul");
    list.className = "scrims-match-team-players";
    for (const p of team.players || []) {
      const li = document.createElement("li");
      li.className = "scrims-match-player";
      const img = document.createElement("img");
      img.className = "scrims-match-player-avatar";
      img.src = p.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
      img.alt = "";
      img.width = 40;
      img.height = 40;
      img.loading = "lazy";
      const label = document.createElement("span");
      label.className = "scrims-match-player-name";
      const you = myDiscordId() && String(p.id) === myDiscordId();
      label.textContent = you ? "You" : p.displayName || p.username || "Player";
      li.appendChild(img);
      li.appendChild(label);
      list.appendChild(li);
    }
    teamEl.appendChild(list);
  }

  function renderMatchesPanel() {
    const live = root?.querySelector("#scrims-matches-live");
    const emptyWrap = root?.querySelector("#scrims-matches-empty");
    const activeWrap = root?.querySelector("#scrims-matches-active");
    if (!live) return;

    const hasMatch = Boolean(activeMatch?.teams?.length >= 2);
    if (hasMatch) {
      live.textContent = "1 live";
      emptyWrap?.classList.add("hidden");
      if (emptyWrap) emptyWrap.hidden = true;
      activeWrap?.classList.remove("hidden");
      if (activeWrap) activeWrap.hidden = false;
      if (!activeWrap) return;

      const [left, right] = activeMatch.teams;
      activeWrap.replaceChildren();
      const card = document.createElement("article");
      card.className = "scrims-match-card";
      card.setAttribute("aria-label", `${left.name} versus ${right.name}`);

      const kicker = document.createElement("p");
      kicker.className = "scrims-match-kicker";
      kicker.textContent = "Live scrim";

      const versus = document.createElement("div");
      versus.className = "scrims-match-versus";

      const leftEl = document.createElement("div");
      leftEl.className = "scrims-match-side scrims-match-side--left";
      const vs = document.createElement("div");
      vs.className = "scrims-match-vs";
      vs.setAttribute("aria-hidden", "true");
      vs.textContent = "VS";
      const rightEl = document.createElement("div");
      rightEl.className = "scrims-match-side scrims-match-side--right";

      renderTeamRoster(leftEl, left);
      renderTeamRoster(rightEl, right);
      versus.appendChild(leftEl);
      versus.appendChild(vs);
      versus.appendChild(rightEl);

      const meta = document.createElement("p");
      meta.className = "scrims-match-meta";
      if (lastMatchVoice?.channels?.length) {
        const names = lastMatchVoice.channels.map((c) => c.channelName).join(", ");
        meta.textContent = `Discord voice: ${lastMatchVoice.categoryName || "MATCH CHANNELS"} — ${names}`;
      } else {
        meta.textContent = `Match ${activeMatch.matchId || ""}. Confirm lineups in Discord.`.trim();
      }

      card.appendChild(kicker);
      card.appendChild(versus);
      card.appendChild(meta);
      activeWrap.appendChild(card);
      return;
    }

    live.textContent = "0 live";
    activeWrap?.classList.add("hidden");
    if (activeWrap) {
      activeWrap.hidden = true;
      activeWrap.replaceChildren();
    }
    emptyWrap?.classList.remove("hidden");
    if (emptyWrap) emptyWrap.hidden = false;
  }

  function renderQueue() {
    if (!root) return;
    const count = queueCount();
    const discord = getDiscordUser();
    const countEl = root.querySelector("#scrims-queue-count");
    const capLabel = root.querySelector("#scrims-queue-cap-label");
    const standingEl = root.querySelector("#scrims-queue-standing");
    const badgeEl = root.querySelector("#scrims-queue-state-badge");
    const btn = root.querySelector("#scrims-queue-toggle");
    const signInBtn = root.querySelector("#scrims-queue-sign-in");
    const slotsEl = root.querySelector("#scrims-queue-slots");
    const progress = root.querySelector("#scrims-queue-progress");

    if (countEl) countEl.textContent = String(count);
    if (capLabel) capLabel.textContent = `/ ${queueCapacity} players`;
    if (standingEl) standingEl.textContent = standingByCopy(count);
    if (progress) {
      progress.setAttribute("aria-valuemax", String(queueCapacity));
      progress.setAttribute("aria-valuenow", String(count));
      progress.setAttribute("aria-label", `${count} of ${queueCapacity} players in queue`);
    }
    if (badgeEl) {
      const active = userQueued || count > 0;
      badgeEl.textContent = active ? "Queue active" : "Queue idle";
      badgeEl.classList.toggle("scrims-pill--active", active);
      badgeEl.classList.toggle("scrims-pill--idle", !active);
    }

    const full = count >= queueCapacity && !userQueued;
    const signedIn = Boolean(discord);
    if (signInBtn) {
      signInBtn.classList.toggle("hidden", signedIn);
      signInBtn.hidden = signedIn;
    }
    if (btn) {
      btn.classList.toggle("hidden", !signedIn);
      btn.hidden = !signedIn;
      if (discord) {
        btn.disabled = queueActionPending || (full && !userQueued);
        const label = queueActionPending
          ? queuePendingAction === "leave"
            ? "Leaving…"
            : "Joining…"
          : userQueued
            ? "Leave queue"
            : full
              ? "Queue full"
              : "Join queue";
        btn.textContent = label;
        btn.classList.toggle("scrims-cta--leave", userQueued);
        btn.classList.toggle("scrims-cta--join", !userQueued);
        btn.setAttribute("aria-pressed", userQueued ? "true" : "false");
      }
    }

    if (slotsEl) {
      slotsEl.style.setProperty("--scrims-roster-cols", String(queueCapacity));
      slotsEl.setAttribute("aria-label", `Queue slots (${queueCapacity})`);
      slotsEl.replaceChildren();
      for (let i = 0; i < queueCapacity; i++) {
        const slot = document.createElement("article");
        renderSlot(slot, i, slots[i]);
        slotsEl.appendChild(slot);
      }
    }

    syncQueueTimer();
    renderMatchesPanel();
  }

  async function refreshScrimQueue({ force } = {}) {
    if (!apiBase()) return;
    const now = Date.now();
    if (!force && now - lastQueueFetchAt < 800) return;
    lastQueueFetchAt = now;
    try {
      const data = await fetchQueueJson("/api/scrims/queue");
      applyServerQueuePayload(data);
    } catch {
      if (!force) return;
    }
  }

  function scheduleQueueWsReconnect() {
    if (queueWsManualClose) return;
    clearTimeout(queueWsReconnectTimer);
    queueWsReconnectTimer = setTimeout(() => {
      queueWsReconnectTimer = null;
      connectScrimQueueWebSocket();
    }, 3e3);
  }

  function stopQueuePoll() {
    if (queuePollTimer == null) return;
    clearInterval(queuePollTimer);
    queuePollTimer = null;
  }

  function startQueuePollFallback() {
    if (queuePollTimer != null) return;
    queuePollTimer = window.setInterval(() => {
      if (!root) return;
      void refreshScrimQueue();
    }, 4e3);
  }

  function connectScrimQueueWebSocket() {
    const base = wsBase();
    if (!base || !root) return;
    if (
      queueWs &&
      (queueWs.readyState === WebSocket.OPEN || queueWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    queueWsManualClose = false;
    let ws;
    try {
      ws = new WebSocket(`${base}/ws/scrims/queue`);
    } catch {
      scheduleQueueWsReconnect();
      startQueuePollFallback();
      return;
    }
    queueWs = ws;
    ws.onopen = () => {
      if (queueWs !== ws) return;
      stopQueuePoll();
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data || ""));
        if (msg?.type !== "scrim_queue") return;
        applyServerQueuePayload(msg);
      } catch {
      }
    };
    ws.onclose = () => {
      if (queueWs === ws) queueWs = null;
      if (!queueWsManualClose && root) {
        scheduleQueueWsReconnect();
        startQueuePollFallback();
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
      }
    };
  }

  function disconnectScrimQueueWebSocket() {
    queueWsManualClose = true;
    clearTimeout(queueWsReconnectTimer);
    queueWsReconnectTimer = null;
    stopQueuePoll();
    const ws = queueWs;
    queueWs = null;
    if (!ws) return;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
    }
  }

  async function handleToggle() {
    if (!getDiscordUser() || queueActionPending || !apiBase()) return;
    const gen = ++queueToggleGeneration;
    const action = userQueued ? "leave" : "join";
    beginQueuePending(action);
    renderQueue();
    const path = action === "leave" ? "/api/scrims/queue/leave" : "/api/scrims/queue/join";
    const timeoutMs = action === "join" ? 45e3 : 12e3;
    try {
      const data = await fetchQueueJson(
        path,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        },
        { timeoutMs }
      );
      if (gen !== queueToggleGeneration) return;
      applyServerQueuePayload(data);
      if (action === "join" && data.activeMatch) {
        const teams = data.activeMatch.teams || [];
        const body =
          data.lastMatchVoice?.channels?.length
            ? `Created ${data.lastMatchVoice.channels.length} team voice channel(s) in Discord.`
            : teams.length >= 2
              ? `${teams[0].name} vs ${teams[1].name} — check Active matches.`
              : "Queue full — match is live.";
        window.pushCafeNotification?.({ title: "Match found", body });
      }
    } catch (err) {
      if (gen !== queueToggleGeneration) return;
      const body = err.body;
      if (body && Array.isArray(body.slots)) {
        applyServerQueuePayload(body);
      } else {
        void refreshScrimQueue({ force: true });
      }
      const code = body?.error;
      if (code === "queue_full") {
        window.pushCafeNotification?.({ title: "Queue full", body: "All queue slots are taken." });
      } else if (err.status === 401) {
        window.pushCafeNotification?.({ title: "Sign in required", body: "Use Discord sign-in to join the queue." });
      } else if (err.code === "timeout") {
        window.pushCafeNotification?.({
          title: "Queue request timed out",
          body: "Your queue state may still update — try again if the button looks stuck."
        });
      }
    } finally {
      if (gen === queueToggleGeneration) {
        clearQueuePendingState();
        renderQueue();
      }
    }
  }

  function handleSignInClick() {
    const topbar = document.getElementById("discord-sign-in-btn");
    if (topbar) {
      topbar.click();
      return;
    }
    const host = document.getElementById("discord-auth-host");
    const link = host?.querySelector("a[href]");
    if (link) link.click();
  }

  async function handleAuthChange() {
    const discord = getDiscordUser();
    if (!discord && userQueued) {
      try {
        await fetchQueueJson("/api/scrims/queue/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
      } catch {
      }
    }
    void refreshScrimQueue({ force: true });
  }

  function onDiscordAuthChange() {
    if (!root) return;
    void handleAuthChange();
  }

  window.initScrimsPage = function initScrimsPage() {
    const page = document.getElementById("page-scrims");
    if (!page) return;

    if (root !== page) {
      teardownScrimsPage();
      root = page;
      onToggleClick = () => {
        void handleToggle();
      };
      onSignInClick = handleSignInClick;
      onAuthChange = onDiscordAuthChange;
      page.querySelector("#scrims-queue-toggle")?.addEventListener("click", onToggleClick);
      page.querySelector("#scrims-queue-sign-in")?.addEventListener("click", onSignInClick);
      window.addEventListener("cafe-discord-auth-change", onAuthChange);
    }

    renderQueue();
    void refreshScrimQueue({ force: true });
    connectScrimQueueWebSocket();
    if (!getDiscordUser() && typeof window.refreshDiscordAuthUi === "function") {
      void window.refreshDiscordAuthUi();
    }
  };

  window.teardownScrimsPage = function teardownScrimsPage() {
    stopQueueTimer();
    queueToggleGeneration += 1;
    clearQueuePendingState();
    disconnectScrimQueueWebSocket();
    if (!root) return;
    root.querySelector("#scrims-queue-toggle")?.removeEventListener("click", onToggleClick);
    root.querySelector("#scrims-queue-sign-in")?.removeEventListener("click", onSignInClick);
    if (onAuthChange) window.removeEventListener("cafe-discord-auth-change", onAuthChange);
    onToggleClick = null;
    onSignInClick = null;
    onAuthChange = null;
    root = null;
  };
})();