(function () {
  "use strict";

  let queueCapacity = 2;
  let adminCapacity = 2;
  const MATCH_TEAM_SLOTS = 5;

  let slots = Array.from({ length: queueCapacity }, () => null);
  let adminSlots = Array.from({ length: adminCapacity }, () => null);
  let userQueued = false;
  let joinRolePending = null;
  let queueVersion = 0;
  let root = null;
  let onCreateLobbyClick = null;
  let onJoinAsPlayerClick = null;
  let onJoinAsAdminClick = null;
  let onLeaveLobbyClick = null;
  let onCopyLinkClick = null;
  let onSignInClick = null;
  let onAuthChange = null;
  let onLobbyPopState = null;
  let queueTimerId = null;
  let queueJoinedAt = null;
  let lastMatchVoice = null;
  let activeMatch = null;
  let matchVoiceError = null;
  let activeLobbyId = "";
  let youAreHost = false;
  let queueActionPending = false;
  let queuePendingAction = null;
  let queueToggleGeneration = 0;
  let queuePendingSafetyTimer = null;
  let queueWs = null;
  let queueWsLobbyId = "";
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

  function normalizeLobbyCode(raw) {
    return String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);
  }

  function getLobbyCodeFromUrl() {
    return normalizeLobbyCode(new URLSearchParams(window.location.search).get("lobby"));
  }

  function setLobbyInUrl(code) {
    const url = new URL(window.location.href);
    const norm = normalizeLobbyCode(code);
    if (norm) url.searchParams.set("lobby", norm);
    else url.searchParams.delete("lobby");
    if (!url.hash || url.hash === "#") url.hash = "#scrims";
    history.replaceState(null, "", url.toString());
  }

  function buildLobbyInviteUrl(code) {
    const norm = normalizeLobbyCode(code);
    const path = window.location.pathname || "/";
    const url = new URL(`${window.location.origin}${path}`);
    url.searchParams.set("lobby", norm);
    url.hash = "scrims";
    return url.toString();
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

  function amInActiveMatchFromPayload(payload) {
    const uid = myDiscordId();
    if (!uid || !payload?.activeMatch?.teams?.length) return false;
    for (const team of payload.activeMatch.teams) {
      for (const p of team.players || []) {
        if (p?.id && String(p.id) === uid) return true;
      }
    }
    return false;
  }

  function hasLiveMatch() {
    return Boolean(activeMatch?.teams?.length >= 2);
  }

  function amInQueueFromPayload(payload) {
    if (payload?.youInQueue === true) return true;
    if (amInActiveMatchFromPayload(payload)) return true;
    const uid = myDiscordId();
    if (!uid) return false;
    if (Array.isArray(payload?.slots) && payload.slots.some((s) => s?.id && String(s.id) === uid)) {
      return true;
    }
    if (Array.isArray(payload?.adminSlots) && payload.adminSlots.some((s) => s?.id && String(s.id) === uid)) {
      return true;
    }
    return false;
  }

  function clearQueuePendingState() {
    queueActionPending = false;
    queuePendingAction = null;
    joinRolePending = null;
    if (queuePendingSafetyTimer != null) {
      clearTimeout(queuePendingSafetyTimer);
      queuePendingSafetyTimer = null;
    }
  }

  function beginQueuePending(action, role = null) {
    queueActionPending = true;
    queuePendingAction = action === "leave" ? "leave" : "join";
    joinRolePending = role;
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
      teamName: entry.teamName ? String(entry.teamName) : "",
      joinedAt: entry.joinedAt || null,
      you,
      mock: false
    };
  }

  function resetScrimsLobbyView() {
    queueToggleGeneration += 1;
    clearQueuePendingState();
    disconnectScrimQueueWebSocket();
    activeLobbyId = "";
    userQueued = false;
    youAreHost = false;
    activeMatch = null;
    lastMatchVoice = null;
    matchVoiceError = null;
    queueJoinedAt = null;
    queueVersion = 0;
    slots = Array.from({ length: queueCapacity }, () => null);
    adminSlots = Array.from({ length: adminCapacity }, () => null);
    setLobbyInUrl("");
    if (root) renderQueue();
  }

  function applyServerQueuePayload(payload) {
    if (!payload || !Array.isArray(payload.slots)) return;
    const nextVersion = Number(payload.version) || 0;
    if (nextVersion < queueVersion) return;
    queueVersion = nextVersion;
    if (Number(payload.capacity) >= 2) {
      queueCapacity = Math.min(10, Math.round(Number(payload.capacity)));
    }
    if (Number(payload.adminCapacity) >= 1) {
      adminCapacity = Math.min(4, Math.round(Number(payload.adminCapacity)));
    }
    activeMatch = payload.activeMatch || null;
    const matchLive = hasLiveMatch() || payload.matchLive === true;
    if (matchLive) {
      slots = Array.from({ length: queueCapacity }, () => null);
      adminSlots = Array.from({ length: adminCapacity }, () => null);
    } else {
      slots = Array.from({ length: queueCapacity }, (_, i) =>
        mapSlotFromServer(payload.slots[i], i)
      );
      const srcAdmin = Array.isArray(payload.adminSlots) ? payload.adminSlots : [];
      adminSlots = Array.from({ length: adminCapacity }, (_, i) => mapSlotFromServer(srcAdmin[i], i));
    }
    userQueued =
      payload.youInQueue === true ||
      slots.some((m) => m?.you) ||
      amInActiveMatchFromPayload(payload);
    if (payload.yourJoinedAt) {
      queueJoinedAt = Number(payload.yourJoinedAt) || queueJoinedAt;
    } else if (!userQueued) {
      queueJoinedAt = null;
    }
    lastMatchVoice = payload.lastMatchVoice || null;
    matchVoiceError = payload.matchVoiceError || null;
    const lobbyCode = payload.lobbyId ? normalizeLobbyCode(payload.lobbyId) : "";
    const tiedToLobby =
      payload.youInQueue === true ||
      payload.youAreHost === true ||
      amInQueueFromPayload(payload);
    if (lobbyCode && tiedToLobby) {
      activeLobbyId = lobbyCode;
      setLobbyInUrl(activeLobbyId);
    }
    youAreHost = payload.youAreHost === true;
    settleQueuePendingFromPayload(payload);
    renderQueue();
  }

  function queueCount() {
    return slots.filter(Boolean).length;
  }

  function standingByCopy(count) {
    if (count === 0) return "0 players in lobby";
    if (count === 1) return "1 player in lobby";
    return `${count} players in lobby`;
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

  function adminCount() {
    return adminSlots.filter(Boolean).length;
  }

  function renderSlot(el, index, member, { kind = "player", showSub = true } = {}) {
    el.className = "scrims-roster-slot";
    if (kind === "admin") el.classList.add("scrims-roster-slot--admin");
    el.replaceChildren();

    if (!member) {
      el.classList.add("scrims-roster-slot--empty");
      const roleLabel = kind === "admin" ? "admin" : "player";
      el.setAttribute("aria-label", `${roleLabel} slot ${index + 1} open`);
      const icon = document.createElement("div");
      icon.className = "scrims-roster-slot-empty-icon";
      icon.innerHTML =
        kind === "admin"
          ? '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>'
          : '<i class="fa-solid fa-user" aria-hidden="true"></i>';
      const title = document.createElement("span");
      title.className = "scrims-roster-slot-empty-title";
      title.textContent = "Open";
      const sub = document.createElement("span");
      sub.className = "scrims-roster-slot-empty-sub";
      sub.textContent = kind === "admin" ? `Admin #${index + 1}` : `Player #${index + 1}`;
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

    el.appendChild(avatar);
    el.appendChild(name);
    if (showSub) {
      const sub = document.createElement("span");
      sub.className = "scrims-roster-slot-sub";
      sub.textContent =
        kind === "admin"
          ? "Admin"
          : member.teamName || (member.username ? `@${member.username}` : "Player");
      el.appendChild(sub);
    }
  }

  function matchPlayerToMember(p) {
    if (!p?.id) return null;
    const id = String(p.id);
    return {
      id,
      displayName: p.displayName || p.username || "Player",
      username: p.username ? String(p.username) : "",
      avatarUrl: p.avatarUrl || "",
      teamName: p.teamName ? String(p.teamName) : "",
      you: Boolean(myDiscordId() && id === myDiscordId())
    };
  }

  function renderMatchTeamSide(sideEl, team, side = "left") {
    sideEl.replaceChildren();
    sideEl.className = `scrims-match-side scrims-match-side--${side}`;

    const grid = document.createElement("div");
    grid.className = "scrims-roster-grid scrims-match-roster-grid";
    grid.style.setProperty("--scrims-roster-cols", String(MATCH_TEAM_SLOTS));
    grid.setAttribute("aria-label", `${team.name || "Team"} slots (${MATCH_TEAM_SLOTS})`);

    const players = Array.isArray(team.players) ? team.players : [];
    for (let i = 0; i < MATCH_TEAM_SLOTS; i++) {
      const slot = document.createElement("article");
      renderSlot(slot, i, matchPlayerToMember(players[i]), { kind: "player", showSub: false });
      grid.appendChild(slot);
    }

    sideEl.appendChild(grid);
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

      const namesRow = document.createElement("div");
      namesRow.className = "scrims-match-team-names";

      const leftName = document.createElement("p");
      leftName.className = "scrims-match-team-name scrims-match-team-name--left";
      leftName.textContent = left.name || "Team";

      const namesVs = document.createElement("div");
      namesVs.className = "scrims-match-team-names-gap";
      namesVs.setAttribute("aria-hidden", "true");

      const rightName = document.createElement("p");
      rightName.className = "scrims-match-team-name scrims-match-team-name--right";
      rightName.textContent = right.name || "Team";

      namesRow.appendChild(leftName);
      namesRow.appendChild(namesVs);
      namesRow.appendChild(rightName);

      const versus = document.createElement("div");
      versus.className = "scrims-match-versus";

      const leftSide = document.createElement("div");
      const vs = document.createElement("div");
      vs.className = "scrims-match-vs";
      vs.setAttribute("aria-hidden", "true");
      vs.textContent = "VS";
      const rightSide = document.createElement("div");

      renderMatchTeamSide(leftSide, left, "left");
      renderMatchTeamSide(rightSide, right, "right");
      versus.appendChild(leftSide);
      versus.appendChild(vs);
      versus.appendChild(rightSide);

      card.appendChild(namesRow);
      card.appendChild(versus);
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
    const matchLive = hasLiveMatch();
    const count = matchLive ? 0 : queueCount();
    const discord = getDiscordUser();
    const queueSection = root.querySelector("#scrims-queue");
    const liveNotice = root.querySelector("#scrims-queue-live-notice");
    const lobbyBody = root.querySelector("#scrims-queue-lobby-body");
    const countEl = root.querySelector("#scrims-queue-count");
    const capLabel = root.querySelector("#scrims-queue-cap-label");
    const standingEl = root.querySelector("#scrims-queue-standing");
    const badgeEl = root.querySelector("#scrims-queue-state-badge");
    const createBtn = root.querySelector("#scrims-create-lobby");
    const inviteJoin = root.querySelector("#scrims-invite-join");
    const inviteJoinTitle = root.querySelector("#scrims-invite-join-title");
    const inviteJoinDesc = root.querySelector(".scrims-invite-join-desc");
    const inviteJoinActions = root.querySelector(".scrims-invite-join-actions");
    const joinPlayerBtn = root.querySelector("#scrims-join-as-player");
    const joinAdminBtn = root.querySelector("#scrims-join-as-admin");
    const leaveBtn = root.querySelector("#scrims-leave-lobby");
    const adminSlotsEl = root.querySelector("#scrims-admin-slots");
    const adminCapLabel = root.querySelector("#scrims-admin-cap-label");
    const inviteWrap = root.querySelector("#scrims-lobby-invite");
    const inviteInput = root.querySelector("#scrims-lobby-link");
    const inviteCode = root.querySelector("#scrims-lobby-code");
    const signInBtn = root.querySelector("#scrims-queue-sign-in");
    const slotsEl = root.querySelector("#scrims-queue-slots");
    const progress = root.querySelector("#scrims-queue-progress");

    if (countEl) countEl.textContent = String(count);
    if (capLabel) capLabel.textContent = `/ ${queueCapacity} players`;
    if (standingEl) standingEl.textContent = standingByCopy(count);
    if (progress) {
      progress.setAttribute("aria-valuemax", String(queueCapacity));
      progress.setAttribute("aria-valuenow", String(count));
      progress.setAttribute("aria-label", `${count} of ${queueCapacity} players in lobby`);
    }
    if (queueSection) {
      queueSection.classList.toggle("scrims-glass--queue-live", matchLive);
    }
    if (liveNotice) {
      liveNotice.classList.toggle("hidden", !matchLive);
      liveNotice.hidden = !matchLive;
    }
    if (lobbyBody) {
      lobbyBody.classList.toggle("hidden", matchLive);
      lobbyBody.hidden = matchLive;
    }
    if (badgeEl) {
      if (matchLive) {
        badgeEl.textContent = "Match live";
        badgeEl.classList.add("scrims-pill--active");
        badgeEl.classList.remove("scrims-pill--idle");
      } else {
        const inLobby = Boolean(activeLobbyId);
        const active = userQueued || count > 0 || adminCount() > 0;
        badgeEl.textContent = inLobby ? (active ? "Lobby active" : "Lobby open") : "No lobby";
        badgeEl.classList.toggle("scrims-pill--active", inLobby && active);
        badgeEl.classList.toggle("scrims-pill--idle", !inLobby || !active);
      }
    }

    const playersFull = !matchLive && count >= queueCapacity;
    const adminsFull = !matchLive && adminCount() >= adminCapacity;
    const signedIn = Boolean(discord);
    const urlLobby = getLobbyCodeFromUrl();
    const viewingInviteLobby = Boolean(urlLobby && !userQueued);
    const lobbyContext = urlLobby || activeLobbyId;
    const showJoinChoices = Boolean(
      signedIn && lobbyContext && !userQueued && !matchLive
    );
    const showLobbyPanel = Boolean(
      signedIn && (showJoinChoices || (userQueued && Boolean(activeLobbyId)))
    );

    if (signInBtn) {
      signInBtn.classList.toggle("hidden", signedIn);
      signInBtn.hidden = signedIn;
    }
    if (inviteWrap && inviteInput && inviteCode) {
      const showInvite = Boolean(!matchLive && activeLobbyId && userQueued);
      inviteWrap.classList.toggle("hidden", !showInvite);
      inviteWrap.hidden = !showInvite;
      if (showInvite) {
        inviteInput.value = buildLobbyInviteUrl(activeLobbyId);
        inviteCode.textContent = `Lobby code: ${activeLobbyId}`;
      }
    }
    if (inviteJoin) {
      inviteJoin.classList.toggle("hidden", !showLobbyPanel);
      inviteJoin.hidden = !showLobbyPanel;
    }
    if (inviteJoinTitle) {
      inviteJoinTitle.classList.toggle("hidden", !showJoinChoices);
      inviteJoinTitle.hidden = !showJoinChoices;
    }
    if (inviteJoinDesc) {
      inviteJoinDesc.classList.toggle("hidden", !showJoinChoices);
      inviteJoinDesc.hidden = !showJoinChoices;
    }
    if (inviteJoinActions) {
      inviteJoinActions.classList.toggle("hidden", !showJoinChoices);
      inviteJoinActions.hidden = !showJoinChoices;
    }
    if (joinPlayerBtn) {
      joinPlayerBtn.disabled = queueActionPending || playersFull;
      const joiningPlayer =
        queueActionPending && queuePendingAction === "join" && joinRolePending === "player";
      joinPlayerBtn.textContent = joiningPlayer ? "Joining…" : "Join as player";
    }
    if (joinAdminBtn) {
      joinAdminBtn.disabled = queueActionPending || adminsFull;
      const joiningAdmin =
        queueActionPending && queuePendingAction === "join" && joinRolePending === "admin";
      joinAdminBtn.textContent = joiningAdmin ? "Joining…" : "Join as admin";
    }
    if (createBtn) {
      const hideCreate =
      matchLive || !signedIn || userQueued || Boolean(lobbyContext);
      createBtn.classList.toggle("hidden", hideCreate);
      createBtn.hidden = hideCreate;
      createBtn.disabled = queueActionPending;
      createBtn.textContent = queueActionPending && queuePendingAction === "join" ? "Creating…" : "Create lobby";
    }
    if (leaveBtn) {
      const showLeave = Boolean(showLobbyPanel && userQueued);
      leaveBtn.classList.toggle("hidden", !showLeave);
      leaveBtn.hidden = !showLeave;
      leaveBtn.disabled = queueActionPending;
      leaveBtn.textContent =
        queueActionPending && queuePendingAction === "leave" ? "Leaving…" : "Leave lobby";
    }

    if (slotsEl && !matchLive) {
      slotsEl.style.setProperty("--scrims-roster-cols", String(queueCapacity));
      slotsEl.setAttribute("aria-label", `Player slots (${queueCapacity})`);
      slotsEl.replaceChildren();
      for (let i = 0; i < queueCapacity; i++) {
        const slot = document.createElement("article");
        renderSlot(slot, i, slots[i], { kind: "player" });
        slotsEl.appendChild(slot);
      }
    } else if (slotsEl && matchLive) {
      slotsEl.replaceChildren();
    }
    const adminsInLobby = matchLive ? 0 : adminCount();
    if (adminCapLabel) adminCapLabel.textContent = `(${adminsInLobby} / ${adminCapacity})`;
    if (adminSlotsEl && !matchLive) {
      adminSlotsEl.style.setProperty("--scrims-roster-cols", String(adminCapacity));
      adminSlotsEl.setAttribute("aria-label", `Admin slots (${adminCapacity})`);
      adminSlotsEl.replaceChildren();
      for (let i = 0; i < adminCapacity; i++) {
        const slot = document.createElement("article");
        renderSlot(slot, i, adminSlots[i], { kind: "admin" });
        adminSlotsEl.appendChild(slot);
      }
    } else if (adminSlotsEl && matchLive) {
      adminSlotsEl.replaceChildren();
    }

    if (matchLive) {
      stopQueueTimer();
      const timerWrap = root.querySelector("#scrims-queue-timer-wrap");
      timerWrap?.classList.add("hidden");
      if (timerWrap) timerWrap.hidden = true;
    } else {
      syncQueueTimer();
    }
    renderMatchesPanel();
  }

  async function refreshScrimQueue({ force } = {}) {
    if (!apiBase()) {
      if (root) renderQueue();
      return;
    }
    const lobby = activeLobbyId || getLobbyCodeFromUrl();
    if (!lobby) {
      renderQueue();
      return;
    }
    const now = Date.now();
    if (!force && now - lastQueueFetchAt < 800) return;
    lastQueueFetchAt = now;
    try {
      const data = await fetchQueueJson(`/api/scrims/lobbies/${encodeURIComponent(lobby)}`);
      applyServerQueuePayload(data);
    } catch (err) {
      if (err.status === 404) {
        activeLobbyId = "";
        slots = Array.from({ length: queueCapacity }, () => null);
        userQueued = false;
        renderQueue();
      }
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
    const lobby = activeLobbyId || getLobbyCodeFromUrl();
    if (!base || !root || !lobby) return;
    if (
      queueWs &&
      queueWsLobbyId === lobby &&
      (queueWs.readyState === WebSocket.OPEN || queueWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (queueWs) disconnectScrimQueueWebSocket();
    queueWsManualClose = false;
    let ws;
    try {
      ws = new WebSocket(`${base}/ws/scrims/lobby/${encodeURIComponent(lobby)}`);
    } catch {
      scheduleQueueWsReconnect();
      startQueuePollFallback();
      return;
    }
    queueWs = ws;
    queueWsLobbyId = lobby;
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
    queueWsLobbyId = "";
    if (!ws) return;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
    }
  }

  async function lobbyRequest(path, action, { timeoutMs = 15e3, role = null } = {}) {
    if (!getDiscordUser() || queueActionPending || !apiBase()) return;
    const gen = ++queueToggleGeneration;
    beginQueuePending(action, role);
    renderQueue();
    const joinBody =
      role === "admin" || role === "player" ? JSON.stringify({ role }) : "{}";
    try {
      const data = await fetchQueueJson(
        path,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: joinBody
        },
        { timeoutMs: action === "join" ? 45e3 : timeoutMs }
      );
      if (gen !== queueToggleGeneration) return;
      if (action === "leave") {
        resetScrimsLobbyView();
        return;
      }
      if (data.lobbyClosed) {
        resetScrimsLobbyView();
        return;
      }
      applyServerQueuePayload(data);
      if (data.lobbyId) {
        activeLobbyId = normalizeLobbyCode(data.lobbyId);
        disconnectScrimQueueWebSocket();
        connectScrimQueueWebSocket();
      }
      if (data.activeMatch) {
        const teams = data.activeMatch.teams || [];
        const body =
          data.lastMatchVoice?.channels?.length
            ? `Created ${data.lastMatchVoice.channels.length} team voice channel(s) in Discord.`
            : teams.length >= 2
              ? `${teams[0].name} vs ${teams[1].name} — check Active matches.`
              : "Lobby full — match is live.";
        window.pushCafeNotification?.({ title: "Match found", body });
      }
    } catch (err) {
      if (gen !== queueToggleGeneration) return;
      const body = err.body;
      if (body && Array.isArray(body.slots)) applyServerQueuePayload(body);
      else void refreshScrimQueue({ force: true });
      const code = body?.error;
      if (code === "queue_full") {
        window.pushCafeNotification?.({ title: "Players full", body: "All player slots are taken." });
      } else if (code === "admin_full") {
        window.pushCafeNotification?.({ title: "Admins full", body: "All 2 admin slots are taken." });
      } else if (code === "already_in_lobby") {
        window.pushCafeNotification?.({
          title: "Already in lobby",
          body: "Leave your current role before choosing another."
        });
      } else if (code === "lobby_not_found") {
        window.pushCafeNotification?.({ title: "Lobby not found", body: "This invite link is invalid or expired." });
        setLobbyInUrl("");
      } else if (err.status === 401) {
        window.pushCafeNotification?.({ title: "Sign in required", body: "Sign in with Discord first." });
      } else if (err.code === "timeout") {
        window.pushCafeNotification?.({ title: "Request timed out", body: "Try again if the button looks stuck." });
      }
    } finally {
      if (gen === queueToggleGeneration) {
        clearQueuePendingState();
        renderQueue();
      }
    }
  }

  function handleCreateLobby() {
    void lobbyRequest("/api/scrims/lobbies", "join");
  }

  function lobbyCodeForJoin() {
    return activeLobbyId || getLobbyCodeFromUrl();
  }

  function handleJoinAsPlayer() {
    const code = lobbyCodeForJoin();
    if (!code) return;
    activeLobbyId = code;
    void lobbyRequest(`/api/scrims/lobbies/${encodeURIComponent(code)}/join`, "join", { role: "player" });
  }

  function handleJoinAsAdmin() {
    const code = lobbyCodeForJoin();
    if (!code) return;
    activeLobbyId = code;
    void lobbyRequest(`/api/scrims/lobbies/${encodeURIComponent(code)}/join`, "join", { role: "admin" });
  }

  function handleLeaveLobby() {
    if (!activeLobbyId) return;
    void lobbyRequest(`/api/scrims/lobbies/${encodeURIComponent(activeLobbyId)}/leave`, "leave");
  }

  function handleCopyLobbyLink() {
    const input = root?.querySelector("#scrims-lobby-link");
    const url = input?.value || (activeLobbyId ? buildLobbyInviteUrl(activeLobbyId) : "");
    if (!url) return;
    const done = () => {
      window.pushCafeNotification?.({ title: "Link copied", body: "Share it so others can join your lobby." });
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url).then(done).catch(() => {});
      return;
    }
    if (input) {
      input.select();
      try {
        document.execCommand("copy");
        done();
      } catch {
      }
    }
  }

  function applyScrimsLobbyFromUrl() {
    if (!root) return;
    const fromUrl = getLobbyCodeFromUrl();
    if (!fromUrl) return;
    const lobbyChanged = fromUrl !== activeLobbyId;
    activeLobbyId = fromUrl;
    renderQueue();
    if (lobbyChanged) {
      disconnectScrimQueueWebSocket();
      connectScrimQueueWebSocket();
    }
    void refreshScrimQueue({ force: true });
  }

  window.applyScrimsLobbyFromUrl = applyScrimsLobbyFromUrl;

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
    if (!discord && userQueued && activeLobbyId) {
      try {
        await fetchQueueJson(`/api/scrims/lobbies/${encodeURIComponent(activeLobbyId)}/leave`, {
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
      onCreateLobbyClick = () => {
        void handleCreateLobby();
      };
      onJoinAsPlayerClick = () => {
        handleJoinAsPlayer();
      };
      onJoinAsAdminClick = () => {
        handleJoinAsAdmin();
      };
      onLeaveLobbyClick = () => {
        void handleLeaveLobby();
      };
      onCopyLinkClick = handleCopyLobbyLink;
      onSignInClick = handleSignInClick;
      onAuthChange = onDiscordAuthChange;
      page.querySelector("#scrims-create-lobby")?.addEventListener("click", onCreateLobbyClick);
      page.querySelector("#scrims-join-as-player")?.addEventListener("click", onJoinAsPlayerClick);
      page.querySelector("#scrims-join-as-admin")?.addEventListener("click", onJoinAsAdminClick);
      page.querySelector("#scrims-leave-lobby")?.addEventListener("click", onLeaveLobbyClick);
      page.querySelector("#scrims-copy-lobby-link")?.addEventListener("click", onCopyLinkClick);
      page.querySelector("#scrims-queue-sign-in")?.addEventListener("click", onSignInClick);
      window.addEventListener("cafe-discord-auth-change", onAuthChange);
      onLobbyPopState = () => {
        applyScrimsLobbyFromUrl();
      };
      window.addEventListener("popstate", onLobbyPopState);
    }

    const fromUrl = getLobbyCodeFromUrl();
    if (fromUrl) activeLobbyId = fromUrl;
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
    root.querySelector("#scrims-create-lobby")?.removeEventListener("click", onCreateLobbyClick);
    root.querySelector("#scrims-join-as-player")?.removeEventListener("click", onJoinAsPlayerClick);
    root.querySelector("#scrims-join-as-admin")?.removeEventListener("click", onJoinAsAdminClick);
    root.querySelector("#scrims-leave-lobby")?.removeEventListener("click", onLeaveLobbyClick);
    root.querySelector("#scrims-copy-lobby-link")?.removeEventListener("click", onCopyLinkClick);
    root.querySelector("#scrims-queue-sign-in")?.removeEventListener("click", onSignInClick);
    if (onAuthChange) window.removeEventListener("cafe-discord-auth-change", onAuthChange);
    if (onLobbyPopState) window.removeEventListener("popstate", onLobbyPopState);
    onCreateLobbyClick = null;
    onJoinAsPlayerClick = null;
    onJoinAsAdminClick = null;
    onLeaveLobbyClick = null;
    onCopyLinkClick = null;
    onSignInClick = null;
    onAuthChange = null;
    onLobbyPopState = null;
    root = null;
    delete window.applyScrimsLobbyFromUrl;
  };
})();