(function () {
  "use strict";

  const QUEUE_CAP = 10;
  const MOCK_PLAYERS = [
    {
      id: "mock-rawenge",
      displayName: "Rawenge",
      username: "rawenge",
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/1.png",
      mock: true
    },
    {
      id: "mock-rj",
      displayName: "RJWarrior",
      username: "rjwarrior",
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/3.png",
      mock: true
    },
    {
      id: "mock-kkv",
      displayName: "KKV",
      username: "kkv060",
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/5.png",
      mock: true
    },
    {
      id: "mock-two4",
      displayName: "Two4ne",
      username: "two4ne",
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/2.png",
      mock: true
    }
  ];

  let slots = Array.from({ length: QUEUE_CAP }, () => null);
  let userQueued = false;
  let root = null;
  let onToggleClick = null;
  let onSignInClick = null;
  let onAuthChange = null;
  let queueTimerId = null;
  let queueJoinedAt = null;
  let matchVoiceRequested = false;
  let lastMatchVoice = null;

  function getDiscordUser() {
    return typeof window.getDiscordAuthUser === "function" ? window.getDiscordAuthUser() : null;
  }

  function mapDiscordUser(user, { you = false } = {}) {
    if (!user?.id) return null;
    return {
      id: String(user.id),
      displayName: user.displayName || user.username || "Discord",
      username: user.username ? String(user.username) : "",
      avatarUrl: user.avatarUrl || "",
      you,
      mock: false
    };
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

  function seedMockQueueIfEmpty() {
    if (queueCount() > 0) return;
    const take = 1;
    const shuffled = [...MOCK_PLAYERS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < take && i < QUEUE_CAP; i++) {
      slots[i] = { ...shuffled[i] };
    }
  }

  function findYouSlotIndex() {
    return slots.findIndex((m) => m?.you);
  }

  function removeYouFromQueue() {
    const idx = findYouSlotIndex();
    if (idx !== -1) slots[idx] = null;
    userQueued = false;
  }

  function addYouToQueue() {
    const user = mapDiscordUser(getDiscordUser(), { you: true });
    if (!user) return false;
    if (queueCount() >= QUEUE_CAP) return false;
    if (findYouSlotIndex() !== -1) {
      userQueued = true;
      return true;
    }
    const empty = slots.findIndex((s) => !s);
    if (empty === -1) return false;
    slots[empty] = user;
    userQueued = true;
    return true;
  }

  function compactSlotsOptional() {
    const filled = slots.filter(Boolean);
    while (filled.length < QUEUE_CAP) filled.push(null);
    slots = filled.slice(0, QUEUE_CAP);
  }

  function renderDiscordChip() {
    const chip = root?.querySelector("#scrims-discord-chip");
    if (!chip) return;
    chip.replaceChildren();
    const user = mapDiscordUser(getDiscordUser());
    if (!user) {
      chip.classList.add("hidden");
      return;
    }
    chip.classList.remove("hidden");
    const avatar = document.createElement("img");
    avatar.className = "scrims-discord-chip-avatar";
    avatar.src = user.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
    avatar.alt = "";
    avatar.width = 36;
    avatar.height = 36;
    avatar.loading = "lazy";
    avatar.decoding = "async";

    const meta = document.createElement("div");
    meta.className = "scrims-discord-chip-meta";
    const name = document.createElement("span");
    name.className = "scrims-discord-chip-name";
    name.textContent = user.displayName;
    const handle = document.createElement("span");
    handle.className = "scrims-discord-chip-handle";
    handle.textContent = user.username ? `@${user.username}` : "Discord linked";
    meta.appendChild(name);
    meta.appendChild(handle);

    const status = document.createElement("span");
    status.className = "scrims-discord-chip-status";
    status.textContent = userQueued ? "In queue" : "Signed in";

    chip.appendChild(avatar);
    chip.appendChild(meta);
    chip.appendChild(status);
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

  function renderMatchVoiceUi() {
    const live = root?.querySelector("#scrims-matches-live");
    const emptyTitle = root?.querySelector(".scrims-matches-empty-title");
    const emptyDesc = root?.querySelector(".scrims-matches-empty-desc");
    if (!live || !emptyTitle) return;
    if (lastMatchVoice?.channels?.length) {
      live.textContent = `${lastMatchVoice.channels.length} live`;
      emptyTitle.textContent = "Match voice channels ready";
      if (emptyDesc) {
        const names = lastMatchVoice.channels.map((c) => c.channelName).join(", ");
        emptyDesc.textContent = `Open Discord → ${lastMatchVoice.categoryName || "MATCH CHANNELS"}: ${names}`;
      }
    }
  }

  function maybeProvisionMatchVoice(count) {
    if (count < QUEUE_CAP) {
      matchVoiceRequested = false;
      return;
    }
    if (matchVoiceRequested) return;
    const ids = [
      ...new Set(
        slots
          .filter((m) => m && !m.mock && /^\d{17,20}$/.test(String(m.id)))
          .map((m) => String(m.id))
      )
    ];
    if (ids.length < 2) return;
    matchVoiceRequested = true;
    const matchId = `scrim-${Date.now().toString(36)}`;
    void fetch("/api/match/voice-channels", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUserIds: ids, matchId })
    })
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok) {
          matchVoiceRequested = false;
          window.pushCafeNotification?.({
            title: "Match voice unavailable",
            body:
              data?.error === "bot_not_configured"
                ? "Discord match bot is not configured on the server."
                : "Could not create team voice channels. Check TEAM roles in Discord."
          });
          return;
        }
        lastMatchVoice = data;
        renderMatchVoiceUi();
        window.pushCafeNotification?.({
          title: "Match found",
          body: `Created ${data.channels?.length || 0} team voice channel(s) in Discord.`
        });
      })
      .catch(() => {
        matchVoiceRequested = false;
      });
  }

  function renderQueue() {
    if (!root) return;
    seedMockQueueIfEmpty();
    const count = queueCount();
    const discord = getDiscordUser();
    const countEl = root.querySelector("#scrims-queue-count");
    const fillEl = root.querySelector("#scrims-queue-fill");
    const standingEl = root.querySelector("#scrims-queue-standing");
    const badgeEl = root.querySelector("#scrims-queue-state-badge");
    const btn = root.querySelector("#scrims-queue-toggle");
    const signInBtn = root.querySelector("#scrims-queue-sign-in");
    const slotsEl = root.querySelector("#scrims-queue-slots");
    const progress = root.querySelector("#scrims-queue-progress");

    if (countEl) countEl.textContent = String(count);
    if (fillEl) fillEl.style.width = `${(count / QUEUE_CAP) * 100}%`;
    if (standingEl) standingEl.textContent = standingByCopy(count);
    if (progress) {
      progress.setAttribute("aria-valuenow", String(count));
      progress.setAttribute("aria-label", `${count} of ${QUEUE_CAP} players in queue`);
    }
    if (badgeEl) {
      const active = userQueued || count > 0;
      badgeEl.textContent = active ? "Queue active" : "Queue idle";
      badgeEl.classList.toggle("scrims-pill--active", active);
      badgeEl.classList.toggle("scrims-pill--idle", !active);
    }

    const full = count >= QUEUE_CAP && !userQueued;
    if (signInBtn) signInBtn.classList.toggle("hidden", Boolean(discord));
    if (btn) {
      btn.classList.toggle("hidden", !discord);
      if (discord) {
        btn.disabled = full && !userQueued;
        const label = userQueued
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
      slotsEl.replaceChildren();
      for (let i = 0; i < QUEUE_CAP; i++) {
        const slot = document.createElement("article");
        renderSlot(slot, i, slots[i]);
        slotsEl.appendChild(slot);
      }
    }

    syncQueueTimer();
    renderDiscordChip();
    maybeProvisionMatchVoice(count);
    renderMatchVoiceUi();
  }

  function handleToggle() {
    if (!getDiscordUser()) return;
    if (userQueued) {
      removeYouFromQueue();
      compactSlotsOptional();
    } else {
      addYouToQueue();
    }
    renderQueue();
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

  function handleAuthChange() {
    const wasQueued = userQueued;
    const youIdx = findYouSlotIndex();
    const discord = getDiscordUser();
    if (!discord) {
      if (youIdx !== -1) slots[youIdx] = null;
      userQueued = false;
    } else if (wasQueued || youIdx !== -1) {
      const next = mapDiscordUser(discord, { you: true });
      if (youIdx !== -1 && next) slots[youIdx] = next;
      else if (wasQueued) addYouToQueue();
      userQueued = findYouSlotIndex() !== -1;
    }
    compactSlotsOptional();
    renderQueue();
  }

  window.initScrimsPage = function initScrimsPage() {
    const page = document.getElementById("page-scrims");
    if (!page?.classList.contains("main-page-active")) return;

    if (root !== page) {
      teardownScrimsPage();
      root = page;
      if (!page.dataset.scrimsSeeded) {
        seedMockQueueIfEmpty();
        page.dataset.scrimsSeeded = "1";
      }
      onToggleClick = handleToggle;
      onSignInClick = handleSignInClick;
      onAuthChange = handleAuthChange;
      page.querySelector("#scrims-queue-toggle")?.addEventListener("click", onToggleClick);
      page.querySelector("#scrims-queue-sign-in")?.addEventListener("click", onSignInClick);
      window.addEventListener("cafe-discord-auth-change", onAuthChange);
    }

    userQueued = findYouSlotIndex() !== -1;
    renderQueue();
  };

  window.teardownScrimsPage = function teardownScrimsPage() {
    stopQueueTimer();
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