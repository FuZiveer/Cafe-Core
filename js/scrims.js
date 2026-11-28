(function () {
  "use strict";

  let queueCapacity = 2;
  let adminCapacity = 2;
  const MATCH_TEAM_SLOTS = 5;
  const MATCH_LIVE_TIMER_MS = 5000;

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
  let onStartMatchClick = null;
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
  let youAsAdmin = false;
  let lobbyRequestInFlight = false;
  let queuePendingAction = null;
  let queueToggleGeneration = 0;
  let queuePendingSafetyTimer = null;
  let queueWs = null;
  let queueWsLobbyId = "";
  let queueWsReconnectTimer = null;
  let queueWsManualClose = false;
  let queuePollTimer = null;
  let lastQueueFetchAt = 0;
  let publicActiveMatches = [];
  let publicMatchesPollTimer = null;
  let lastPublicMatchesFetchAt = 0;
  let matchLiveTimerAlignId = null;
  let matchLiveTimerTickId = null;
  let matchLiveTimerActive = false;
  let lastMatchPanelSignature = "";
  const matchTimerLastSecond = new WeakMap();
  let matchesActiveScrollAbort = null;
  let matchesActiveScrollbarDrag = false;
  let matchesActiveScrollSnapOn = true;

  function scrimsMatchScrollBehavior() {
    return document.documentElement.classList.contains("reduce-motion") ? "auto" : "smooth";
  }

  function getScrimsMatchesScrollStep(listEl) {
    const card = listEl?.querySelector(".scrims-match-card");
    if (!card) return 0;
    const gapPx = parseFloat(getComputedStyle(listEl).rowGap || getComputedStyle(listEl).gap) || 0;
    return card.offsetHeight + gapPx;
  }

  function getScrimsMatchCardCount(listEl) {
    return listEl?.querySelectorAll(".scrims-match-card").length || 0;
  }

  function matchesActiveVisibleSlots(listEl) {
    return parseFloat(getComputedStyle(listEl).getPropertyValue("--scrims-matches-visible-count")) || 2;
  }

  function matchesActiveMaxScroll(listEl) {
    const visibleSlots = matchesActiveVisibleSlots(listEl);
    const count = getScrimsMatchCardCount(listEl);
    const step = getScrimsMatchesScrollStep(listEl);
    if (!step || count <= visibleSlots) return 0;
    return Math.max(0, (count - visibleSlots) * step);
  }

  function matchesActiveScrollbarGutterPx(listEl) {
    return Math.max(0, listEl.offsetWidth - listEl.clientWidth);
  }

  function matchesActivePointerOnScrollbar(listEl, clientX) {
    const gutter = matchesActiveScrollbarGutterPx(listEl);
    if (gutter <= 0) return false;
    const rect = listEl.getBoundingClientRect();
    return clientX >= rect.right - gutter - 1;
  }

  function disableMatchesActiveScrollSnap(listEl) {
    matchesActiveScrollSnapOn = false;
    listEl.classList.add("scrims-matches-active--no-snap");
  }

  function enableMatchesActiveScrollSnap(listEl) {
    matchesActiveScrollSnapOn = true;
    listEl.classList.remove("scrims-matches-active--no-snap");
  }

  function snapScrimsMatchesActiveScroll(listEl, { behavior } = {}) {
    if (!matchesActiveScrollSnapOn) return;
    const step = getScrimsMatchesScrollStep(listEl);
    const maxScroll = matchesActiveMaxScroll(listEl);
    if (!step) {
      if (listEl.scrollTop) listEl.scrollTop = 0;
      return;
    }
    let target = Math.round(listEl.scrollTop / step) * step;
    target = Math.max(0, Math.min(maxScroll, target));
    if (Math.abs(listEl.scrollTop - target) < 1) {
      if (listEl.scrollTop !== target) listEl.scrollTop = target;
      return;
    }
    listEl.scrollTo({ top: target, behavior: behavior ?? scrimsMatchScrollBehavior() });
  }

  function bindScrimsMatchesActiveScroll(listEl) {
    if (!listEl) return;
    matchesActiveScrollAbort?.abort();
    matchesActiveScrollAbort = null;
    matchesActiveScrollAbort = new AbortController();
    const { signal } = matchesActiveScrollAbort;
    let scrollSettleTimer = null;
    const onScrollSettle = () => {
      if (matchesActiveScrollbarDrag || !matchesActiveScrollSnapOn) return;
      snapScrimsMatchesActiveScroll(listEl);
    };
    const endMatchesActiveScrollbarDrag = () => {
      if (!matchesActiveScrollbarDrag) return;
      matchesActiveScrollbarDrag = false;
    };
    listEl.addEventListener(
      "mousedown",
      (event) => {
        if (event.button !== 0) return;
        if (!matchesActivePointerOnScrollbar(listEl, event.clientX)) return;
        matchesActiveScrollbarDrag = true;
        disableMatchesActiveScrollSnap(listEl);
      },
      { signal }
    );
    window.addEventListener("mouseup", endMatchesActiveScrollbarDrag, { signal });
    listEl.addEventListener(
      "wheel",
      (event) => {
        const visibleSlots = matchesActiveVisibleSlots(listEl);
        const count = getScrimsMatchCardCount(listEl);
        if (count <= visibleSlots) return;
        const step = getScrimsMatchesScrollStep(listEl);
        if (!step) return;
        enableMatchesActiveScrollSnap(listEl);
        event.preventDefault();
        const maxScroll = matchesActiveMaxScroll(listEl);
        const dir = event.deltaY > 0 ? 1 : -1;
        const next = Math.max(0, Math.min(maxScroll, listEl.scrollTop + dir * step));
        listEl.scrollTo({ top: next, behavior: scrimsMatchScrollBehavior() });
      },
      { passive: false, signal }
    );
    listEl.addEventListener(
      "scroll",
      () => {
        if (matchesActiveScrollbarDrag || !matchesActiveScrollSnapOn) return;
        if (scrollSettleTimer) clearTimeout(scrollSettleTimer);
        scrollSettleTimer = window.setTimeout(() => {
          scrollSettleTimer = null;
          onScrollSettle();
        }, 100);
      },
      { passive: true, signal }
    );
    listEl.addEventListener("scrollend", onScrollSettle, { signal });
    enableMatchesActiveScrollSnap(listEl);
  }

  function scrimsToast(message) {
    const text = String(message || "").trim();
    if (!text) return;
    window.CafeCore?.Toast?.show?.(text);
  }

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
    lobbyRequestInFlight = false;
    queuePendingAction = null;
    joinRolePending = null;
    if (queuePendingSafetyTimer != null) {
      clearTimeout(queuePendingSafetyTimer);
      queuePendingSafetyTimer = null;
    }
  }

  function beginQueuePending(action, role = null) {
    queuePendingAction =
      action === "leave" ? "leave" : action === "start" ? "start" : "join";
    joinRolePending = role;
    if (queuePendingSafetyTimer != null) clearTimeout(queuePendingSafetyTimer);
    queuePendingSafetyTimer = window.setTimeout(() => {
      queuePendingSafetyTimer = null;
      clearQueuePendingState();
      void refreshScrimQueue({ force: true });
      if (root) renderQueue();
    }, 22e3);
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
    youAsAdmin = false;
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

  function announceMatchFound(match, lastMatchVoice) {
    const teams = match?.teams || [];
    let toastShort =
      teams.length >= 2 ? `${teams[0].name} vs ${teams[1].name}` : "Match is live.";
    if (lastMatchVoice?.channels?.length) {
      toastShort += ` — ${lastMatchVoice.channels.length} team voice channel(s) in Discord`;
    }
    scrimsToast(`Match found — ${toastShort}`);
  }

  function applyServerQueuePayload(payload) {
    if (!payload || !Array.isArray(payload.slots)) return;
    const nextVersion = Number(payload.version) || 0;
    if (nextVersion < queueVersion) return;
    const prevQueueVersion = queueVersion;
    const wasLive = hasLiveMatch();
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
      adminSlots.some((m) => m?.you) ||
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
    const myId = myDiscordId();
    youAreHost =
      payload.youAreHost === true ||
      Boolean(myId && payload.hostId && String(payload.hostId) === myId);
    youAsAdmin = payload.youAsAdmin === true || adminSlots.some((m) => m?.you);
    const nowLive = hasLiveMatch() || payload.matchLive === true;
    if (nowLive && !wasLive && prevQueueVersion > 0) {
      announceMatchFound(activeMatch, payload.lastMatchVoice);
    }
    renderQueue();
  }

  function queueCount() {
    return slots.filter(Boolean).length;
  }

  function lobbyOccupantCount() {
    return queueCount() + adminCount();
  }

  function elapsedHmsParts(ms) {
    const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
    return {
      h: Math.floor(totalSec / 3600),
      m: Math.floor((totalSec % 3600) / 60),
      s: totalSec % 60
    };
  }

  function formatMatchElapsedHms(ms) {
    const { h, m, s } = elapsedHmsParts(ms);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function paintMatchTimerDigits(container, value, previousValue) {
    const paint = window.CafeBlScrimDigit?.paintAnimatedNumber;
    if (typeof paint === "function") {
      paint(container, value, previousValue, { minimumIntegerDigits: 2 });
      return;
    }
    container.textContent = String(Math.max(0, Math.round(Number(value) || 0))).padStart(2, "0");
  }

  function ensureMatchTimerShell(timeEl) {
    if (timeEl.querySelector(".scrims-match-timer-display")) return;
    timeEl.replaceChildren();
    const display = document.createElement("span");
    display.className = "scrims-match-timer-display";
    display.setAttribute("aria-hidden", "true");
    ["h", "m", "s"].forEach((seg, index) => {
      if (index > 0) {
        const colon = document.createElement("span");
        colon.className = "scrims-match-timer-colon";
        colon.textContent = ":";
        colon.setAttribute("aria-hidden", "true");
        display.appendChild(colon);
      }
      const segEl = document.createElement("span");
      segEl.className = "bl-scrim-counter-num scrims-match-timer-digit";
      segEl.dataset.timerSeg = seg;
      display.appendChild(segEl);
    });
    timeEl.appendChild(display);
  }

  function updateMatchTimerElement(timeEl, elapsedSec) {
    ensureMatchTimerShell(timeEl);
    const sec = Math.max(0, Math.floor(Number(elapsedSec) || 0));
    const prevSec = matchTimerLastSecond.get(timeEl);
    if (prevSec === sec) return;
    const { h, m, s } = elapsedHmsParts(sec * 1000);
    const prevHms =
      prevSec !== null && prevSec !== undefined
        ? elapsedHmsParts(Math.max(0, prevSec) * 1000)
        : null;
    const display = timeEl.querySelector(".scrims-match-timer-display");
    const segH = display?.querySelector('[data-timer-seg="h"]');
    const segM = display?.querySelector('[data-timer-seg="m"]');
    const segS = display?.querySelector('[data-timer-seg="s"]');
    if (segH) paintMatchTimerDigits(segH, h, prevHms ? prevHms.h : null);
    if (segM) paintMatchTimerDigits(segM, m, prevHms ? prevHms.m : null);
    if (segS) paintMatchTimerDigits(segS, s, prevHms ? prevHms.s : null);
    const label = formatMatchElapsedHms(sec * 1000);
    timeEl.setAttribute("aria-label", label);
    matchTimerLastSecond.set(timeEl, sec);
  }

  function syncMatchLiveTimers() {
    if (!root) return;
    const now = Date.now();
    root.querySelectorAll(".scrims-match-timer[data-match-started-at]").forEach((el) => {
      const started = Number(el.dataset.matchStartedAt) || 0;
      if (!started) {
        updateMatchTimerElement(el, 0);
        return;
      }
      const elapsedSec = Math.max(0, Math.floor((now - started) / 1000));
      updateMatchTimerElement(el, elapsedSec);
    });
  }

  function stopMatchLiveTimer() {
    matchLiveTimerActive = false;
    if (matchLiveTimerAlignId != null) {
      clearTimeout(matchLiveTimerAlignId);
      matchLiveTimerAlignId = null;
    }
    if (matchLiveTimerTickId != null) {
      clearInterval(matchLiveTimerTickId);
      matchLiveTimerTickId = null;
    }
  }

  function startMatchLiveTimer() {
    if (matchLiveTimerActive) return;
    if (!root?.querySelector(".scrims-match-timer[data-match-started-at]")) return;
    matchLiveTimerActive = true;
    syncMatchLiveTimers();
    const alignMs = Math.max(1, MATCH_LIVE_TIMER_MS - (Date.now() % MATCH_LIVE_TIMER_MS));
    matchLiveTimerAlignId = window.setTimeout(() => {
      matchLiveTimerAlignId = null;
      syncMatchLiveTimers();
      matchLiveTimerTickId = window.setInterval(() => {
        if (!root?.querySelector(".scrims-match-timer[data-match-started-at]")) {
          stopMatchLiveTimer();
          return;
        }
        syncMatchLiveTimers();
      }, MATCH_LIVE_TIMER_MS);
    }, alignMs);
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
      el.appendChild(icon);
      el.appendChild(title);
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

  function activeMatchesForPanel() {
    if (activeMatch?.teams?.length >= 2) return [activeMatch];
    const fromPublic = publicActiveMatches
      .map((entry) => entry?.activeMatch)
      .filter((match) => match?.teams?.length >= 2);
    if (fromPublic.length > 0) return fromPublic;
    return [];
  }

  function createMatchCardElement(match) {
    const [left, right] = match.teams;
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

    const rightCol = document.createElement("div");
    rightCol.className = "scrims-match-team-names-right";

    const rightName = document.createElement("p");
    rightName.className = "scrims-match-team-name scrims-match-team-name--right";
    rightName.textContent = right.name || "Team";

    const matchTimer = document.createElement("time");
    matchTimer.className = "scrims-match-timer";
    const startedAt = Math.max(0, Number(match.startedAt) || 0);
    matchTimer.dataset.matchStartedAt = String(startedAt);
    matchTimer.setAttribute("datetime", startedAt ? new Date(startedAt).toISOString() : "");
    matchTimer.setAttribute("title", "Match duration");
    const initialSec = startedAt
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : 0;
    updateMatchTimerElement(matchTimer, initialSec);

    rightCol.appendChild(rightName);
    rightCol.appendChild(matchTimer);

    namesRow.appendChild(leftName);
    namesRow.appendChild(namesVs);
    namesRow.appendChild(rightCol);

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
    return card;
  }

  function matchPanelSignature(matches) {
    return matches
      .map((match) => {
        const started = Math.max(0, Number(match?.startedAt) || 0);
        const teams = match?.teams || [];
        const left = teams[0]?.name || "";
        const right = teams[1]?.name || "";
        const leftIds = (teams[0]?.players || []).map((p) => p?.id || "").join(",");
        const rightIds = (teams[1]?.players || []).map((p) => p?.id || "").join(",");
        return `${started}|${left}|${right}|${leftIds}|${rightIds}`;
      })
      .join(";;");
  }

  function renderMatchesPanel() {
    const live = root?.querySelector("#scrims-matches-live");
    const emptyWrap = root?.querySelector("#scrims-matches-empty");
    const activeWrap = root?.querySelector("#scrims-matches-active");
    if (!live) return;

    const matches = activeMatchesForPanel();
    const hasMatch = matches.length > 0;
    if (hasMatch) {
      live.textContent = matches.length === 1 ? "1 live" : `${matches.length} live`;
      emptyWrap?.classList.add("hidden");
      if (emptyWrap) emptyWrap.hidden = true;
      activeWrap?.classList.remove("hidden");
      if (activeWrap) activeWrap.hidden = false;
      if (!activeWrap) return;

      const sig = matchPanelSignature(matches);
      if (sig !== lastMatchPanelSignature || !activeWrap.children.length) {
        lastMatchPanelSignature = sig;
        activeWrap.replaceChildren();
        for (const match of matches) {
          activeWrap.appendChild(createMatchCardElement(match));
        }
        activeWrap.scrollTop = 0;
      }
      startMatchLiveTimer();
      stopPublicMatchesPoll();
      return;
    }

    lastMatchPanelSignature = "";
    stopMatchLiveTimer();
    live.textContent = "0 live";
    activeWrap?.classList.add("hidden");
    if (activeWrap) {
      activeWrap.hidden = true;
      activeWrap.replaceChildren();
    }
    emptyWrap?.classList.remove("hidden");
    if (emptyWrap) emptyWrap.hidden = false;
    syncPublicMatchesPoll();
  }

  function renderQueue() {
    if (!root) return;
    const matchLive = hasLiveMatch();
    const count = matchLive ? 0 : queueCount();
    const discord = getDiscordUser();
    const queueSection = root.querySelector("#scrims-queue");
    const liveNotice = root.querySelector("#scrims-queue-live-notice");
    const lobbyBody = root.querySelector("#scrims-queue-lobby-body");
    const badgeEl = root.querySelector("#scrims-queue-state-badge");
    const createBtn = root.querySelector("#scrims-create-lobby");
    const inviteJoin = root.querySelector("#scrims-invite-join");
    const inviteJoinTitle = root.querySelector("#scrims-invite-join-title");
    const inviteJoinDesc = root.querySelector(".scrims-invite-join-desc");
    const inviteJoinActions = root.querySelector(".scrims-invite-join-actions");
    const joinPlayerBtn = root.querySelector("#scrims-join-as-player");
    const joinAdminBtn = root.querySelector("#scrims-join-as-admin");
    const inviteManaged = root.querySelector("#scrims-invite-join-managed");
    const leaveBtn = root.querySelector("#scrims-leave-lobby");
    const startMatchBtn = root.querySelector("#scrims-start-match");
    const adminSlotsEl = root.querySelector("#scrims-admin-slots");
    const adminCapLabel = root.querySelector("#scrims-admin-cap-label");
    const inviteWrap = root.querySelector("#scrims-lobby-invite");
    const inviteInput = root.querySelector("#scrims-lobby-link");
    const inviteCode = root.querySelector("#scrims-lobby-code");
    const signInBtn = root.querySelector("#scrims-queue-sign-in");
    const slotsEl = root.querySelector("#scrims-queue-slots");
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
      inviteJoin.classList.toggle("hidden", !showJoinChoices);
      inviteJoin.hidden = !showJoinChoices;
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
      joinPlayerBtn.disabled = lobbyRequestInFlight || playersFull;
      const joiningPlayer =
        lobbyRequestInFlight && queuePendingAction === "join" && joinRolePending === "player";
      joinPlayerBtn.textContent = joiningPlayer ? "Joining…" : "Join as player";
    }
    if (joinAdminBtn) {
      joinAdminBtn.disabled = lobbyRequestInFlight || adminsFull;
      const joiningAdmin =
        lobbyRequestInFlight && queuePendingAction === "join" && joinRolePending === "admin";
      joinAdminBtn.textContent = joiningAdmin ? "Joining…" : "Join as admin";
    }
    if (createBtn) {
      const hideCreate =
      matchLive || !signedIn || userQueued || Boolean(lobbyContext);
      createBtn.classList.toggle("hidden", hideCreate);
      createBtn.hidden = hideCreate;
      createBtn.disabled = lobbyRequestInFlight;
      const creating =
        lobbyRequestInFlight && queuePendingAction === "join" && !joinRolePending;
      createBtn.textContent = creating ? "Creating…" : "Create lobby";
    }
    const showManaged = Boolean(
      signedIn && userQueued && Boolean(activeLobbyId) && !matchLive
    );
    if (inviteManaged) {
      inviteManaged.classList.toggle("hidden", !showManaged);
      inviteManaged.hidden = !showManaged;
    }
    if (leaveBtn) {
      leaveBtn.disabled = lobbyRequestInFlight;
      leaveBtn.textContent =
        lobbyRequestInFlight && queuePendingAction === "leave" ? "Leaving…" : "Leave lobby";
    }
    const showStartMatch = Boolean(
      showManaged && (youAsAdmin || youAreHost) && !matchLive
    );
    if (startMatchBtn) {
      startMatchBtn.classList.toggle("hidden", !showStartMatch);
      startMatchBtn.hidden = !showStartMatch;
      startMatchBtn.setAttribute("aria-hidden", showStartMatch ? "false" : "true");
      startMatchBtn.disabled = lobbyRequestInFlight || matchLive || lobbyOccupantCount() < 2;
      const starting = lobbyRequestInFlight && queuePendingAction === "start";
      startMatchBtn.textContent = starting ? "Starting…" : "Start match";
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

  const PUBLIC_MATCHES_POLL_MS = 1e3;

  function activeMatchesPanelIsPopulated() {
    return activeMatchesForPanel().length > 0;
  }

  async function refreshPublicMatches({ force } = {}) {
    if (!apiBase() || !root) return;
    if (activeMatchesPanelIsPopulated()) {
      stopPublicMatchesPoll();
      return;
    }
    const now = Date.now();
    if (!force && now - lastPublicMatchesFetchAt < PUBLIC_MATCHES_POLL_MS) return;
    lastPublicMatchesFetchAt = now;
    try {
      const data = await fetchQueueJson("/api/scrims/matches");
      publicActiveMatches = Array.isArray(data?.matches) ? data.matches : [];
    } catch {
      if (force) publicActiveMatches = [];
    }
    renderMatchesPanel();
  }

  function stopPublicMatchesPoll() {
    if (publicMatchesPollTimer == null) return;
    clearInterval(publicMatchesPollTimer);
    publicMatchesPollTimer = null;
  }

  function syncPublicMatchesPoll() {
    if (!root || !apiBase()) return;
    if (activeMatchesPanelIsPopulated()) {
      stopPublicMatchesPoll();
      return;
    }
    if (publicMatchesPollTimer != null) return;
    void refreshPublicMatches({ force: true });
    publicMatchesPollTimer = window.setInterval(() => {
      if (!root) return;
      if (activeMatchesPanelIsPopulated()) {
        stopPublicMatchesPoll();
        return;
      }
      void refreshPublicMatches();
    }, PUBLIC_MATCHES_POLL_MS);
  }

  async function refreshScrimQueue({ force } = {}) {
    if (!apiBase()) {
      if (root) renderQueue();
      return;
    }
    const lobby = activeLobbyId || getLobbyCodeFromUrl();
    if (!lobby) {
      renderQueue();
      void refreshPublicMatches({ force });
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

  const LOBBY_STATE_POLL_MS = 1200;

  function stopLobbyStatePoll() {
    if (queuePollTimer == null) return;
    clearInterval(queuePollTimer);
    queuePollTimer = null;
  }

  function syncLobbyStatePoll() {
    const lobby = activeLobbyId || getLobbyCodeFromUrl();
    if (!root || !lobby || !apiBase()) {
      stopLobbyStatePoll();
      return;
    }
    if (queuePollTimer != null) return;
    queuePollTimer = window.setInterval(() => {
      if (!root) return;
      void refreshScrimQueue();
    }, LOBBY_STATE_POLL_MS);
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
      syncLobbyStatePoll();
      return;
    }
    queueWs = ws;
    queueWsLobbyId = lobby;
    ws.onopen = () => {
      if (queueWs !== ws) return;
      syncLobbyStatePoll();
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
        syncLobbyStatePoll();
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
    stopLobbyStatePoll();
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
    if (!getDiscordUser()) {
      scrimsToast("Sign in with Discord first.");
      return;
    }
    if (!apiBase()) return;
    if (lobbyRequestInFlight) return;
    lobbyRequestInFlight = true;
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
        syncLobbyStatePoll();
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
      } else if (code === "not_authorized") {
        scrimsToast("Only lobby admins can start the match.");
      } else if (code === "not_enough_players") {
        scrimsToast("Need at least 2 players in the lobby to start.");
      } else if (code === "not_enough_lobby_members") {
        scrimsToast("Need at least 2 people in the lobby to start.");
      } else if (code === "lobby_not_found") {
        scrimsToast("Lobby not found — This invite link is invalid or expired.");
        setLobbyInUrl("");
      } else if (err.status === 401) {
        window.pushCafeNotification?.({ title: "Sign in required", body: "Sign in with Discord first." });
      } else if (err.code === "timeout") {
        window.pushCafeNotification?.({ title: "Request timed out", body: "Try again if the button looks stuck." });
      }
    } finally {
      lobbyRequestInFlight = false;
      clearQueuePendingState();
      if (root) renderQueue();
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
    if (!code) {
      scrimsToast("Open a lobby invite link first.");
      return;
    }
    activeLobbyId = code;
    void lobbyRequest(`/api/scrims/lobbies/${encodeURIComponent(code)}/join`, "join", { role: "player" });
  }

  function handleJoinAsAdmin() {
    const code = lobbyCodeForJoin();
    if (!code) {
      scrimsToast("Open a lobby invite link first.");
      return;
    }
    activeLobbyId = code;
    void lobbyRequest(`/api/scrims/lobbies/${encodeURIComponent(code)}/join`, "join", { role: "admin" });
  }

  function handleLeaveLobby() {
    if (!activeLobbyId) return;
    void lobbyRequest(`/api/scrims/lobbies/${encodeURIComponent(activeLobbyId)}/leave`, "leave");
  }

  function handleStartMatch() {
    if (!activeLobbyId) return;
    if (lobbyOccupantCount() < 2 || queueCount() < 2) {
      scrimsToast("Need at least 2 people and 2 players in the lobby to start.");
      return;
    }
    void lobbyRequest(`/api/scrims/lobbies/${encodeURIComponent(activeLobbyId)}/start`, "start");
  }

  function handleCopyLobbyLink() {
    const input = root?.querySelector("#scrims-lobby-link");
    const url = input?.value || (activeLobbyId ? buildLobbyInviteUrl(activeLobbyId) : "");
    if (!url) return;
    const done = () => {
      scrimsToast("Link copied");
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
    syncLobbyStatePoll();
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
      onStartMatchClick = () => {
        void handleStartMatch();
      };
      onCopyLinkClick = handleCopyLobbyLink;
      onSignInClick = handleSignInClick;
      onAuthChange = onDiscordAuthChange;
      page.querySelector("#scrims-create-lobby")?.addEventListener("click", onCreateLobbyClick);
      page.querySelector("#scrims-join-as-player")?.addEventListener("click", onJoinAsPlayerClick);
      page.querySelector("#scrims-join-as-admin")?.addEventListener("click", onJoinAsAdminClick);
      page.querySelector("#scrims-leave-lobby")?.addEventListener("click", onLeaveLobbyClick);
      page.querySelector("#scrims-start-match")?.addEventListener("click", onStartMatchClick);
      page.querySelector("#scrims-copy-lobby-link")?.addEventListener("click", onCopyLinkClick);
      page.querySelector("#scrims-queue-sign-in")?.addEventListener("click", onSignInClick);
      window.addEventListener("cafe-discord-auth-change", onAuthChange);
      onLobbyPopState = () => {
        applyScrimsLobbyFromUrl();
      };
      window.addEventListener("popstate", onLobbyPopState);
      bindScrimsMatchesActiveScroll(page.querySelector("#scrims-matches-active"));
    }

    const fromUrl = getLobbyCodeFromUrl();
    if (fromUrl) activeLobbyId = fromUrl;
    renderQueue();
    syncPublicMatchesPoll();
    void refreshScrimQueue({ force: true });
    connectScrimQueueWebSocket();
    syncLobbyStatePoll();
    if (!getDiscordUser() && typeof window.refreshDiscordAuthUi === "function") {
      void window.refreshDiscordAuthUi();
    }
  };

  window.teardownScrimsPage = function teardownScrimsPage() {
    matchesActiveScrollAbort?.abort();
    matchesActiveScrollAbort = null;
    matchesActiveScrollbarDrag = false;
    matchesActiveScrollSnapOn = true;
    stopQueueTimer();
    queueToggleGeneration += 1;
    clearQueuePendingState();
    disconnectScrimQueueWebSocket();
    stopPublicMatchesPoll();
    stopMatchLiveTimer();
    publicActiveMatches = [];
    if (!root) return;
    root.querySelector("#scrims-create-lobby")?.removeEventListener("click", onCreateLobbyClick);
    root.querySelector("#scrims-join-as-player")?.removeEventListener("click", onJoinAsPlayerClick);
    root.querySelector("#scrims-join-as-admin")?.removeEventListener("click", onJoinAsAdminClick);
    root.querySelector("#scrims-leave-lobby")?.removeEventListener("click", onLeaveLobbyClick);
    root.querySelector("#scrims-start-match")?.removeEventListener("click", onStartMatchClick);
    root.querySelector("#scrims-copy-lobby-link")?.removeEventListener("click", onCopyLinkClick);
    root.querySelector("#scrims-queue-sign-in")?.removeEventListener("click", onSignInClick);
    if (onAuthChange) window.removeEventListener("cafe-discord-auth-change", onAuthChange);
    if (onLobbyPopState) window.removeEventListener("popstate", onLobbyPopState);
    onCreateLobbyClick = null;
    onJoinAsPlayerClick = null;
    onJoinAsAdminClick = null;
    onLeaveLobbyClick = null;
    onStartMatchClick = null;
    onCopyLinkClick = null;
    onSignInClick = null;
    onAuthChange = null;
    onLobbyPopState = null;
    root = null;
    delete window.applyScrimsLobbyFromUrl;
  };
})();