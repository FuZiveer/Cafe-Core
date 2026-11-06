(function() {
  "use strict";
  const BL_PLANNER_DISCORD_USERNAME = "fuziveer";
  const BL_SCRIM_RECORD_EDITORS = new Set(["fuziveer", "rawenge", "rjwarrior", "jobless___"]);
  let currentDiscordUser = null;
  function byId(id) {
    return document.getElementById(id);
  }
  function setCurrentDiscordUser(user) {
    currentDiscordUser = user && typeof user === "object" ? user : null;
    window.dispatchEvent(new CustomEvent("cafe-discord-auth-change", {
      detail: { user: currentDiscordUser }
    }));
  }
  function discordUsernameKey(user) {
    return String(user?.username || "").trim().toLowerCase();
  }
  function isBlPlannerAllowedForUser(user) {
    if (!user) return false;
    return discordUsernameKey(user) === BL_PLANNER_DISCORD_USERNAME;
  }
  function canEditBlScrimRecordForUser(user) {
    if (!user) return false;
    return BL_SCRIM_RECORD_EDITORS.has(discordUsernameKey(user));
  }
  window.getDiscordAuthUser = function getDiscordAuthUser() {
    return currentDiscordUser;
  };
  window.isBlPlannerAllowed = function isBlPlannerAllowed() {
    if (window.__cafeBlApi?.available) return window.__cafeBlApi.plannerAllowed === true;
    return isBlPlannerAllowedForUser(currentDiscordUser);
  };
  window.canEditBlScrimRecord = function canEditBlScrimRecord() {
    if (window.__cafeBlApi?.available) return window.__cafeBlApi.scrimCanEdit === true;
    return canEditBlScrimRecordForUser(currentDiscordUser);
  };
  let discordMenuPositionBound = false;
  function portalDiscordProfileMenu() {
    const menu = byId("discord-profile-menu");
    if (!menu) return;
    if (menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
    menu.dataset.discordMenuPortaled = "1";
  }
  function layoutDiscordProfileMenu() {
    const menu = byId("discord-profile-menu");
    const btn = byId("discord-profile-btn");
    if (!menu || !btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = 4;
    menu.style.top = `${Math.round(rect.bottom + gap)}px`;
    menu.style.right = `${Math.round(window.innerWidth - rect.right)}px`;
    menu.style.left = "auto";
    menu.style.bottom = "auto";
  }
  function bindDiscordMenuPositionListeners() {
    if (discordMenuPositionBound) return;
    discordMenuPositionBound = true;
    const reposition = () => {
      const menu = byId("discord-profile-menu");
      if (menu?.classList.contains("dropdown-open")) layoutDiscordProfileMenu();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.getElementById("main-content")?.addEventListener("scroll", reposition, { passive: true });
  }
  window.closeDiscordProfileMenu = function closeDiscordProfileMenu() {
    const menu = byId("discord-profile-menu");
    const btn = byId("discord-profile-btn");
    if (!menu || !btn || !menu.classList.contains("dropdown-open")) return;
    menu.classList.remove("dropdown-open");
    menu.classList.add("dropdown-closed");
    btn.setAttribute("aria-expanded", "false");
  };
  window.setDiscordProfileMenuOpen = function setDiscordProfileMenuOpen(open) {
    const menu = byId("discord-profile-menu");
    const btn = byId("discord-profile-btn");
    if (!menu || !btn) return;
    portalDiscordProfileMenu();
    bindDiscordMenuPositionListeners();
    if (open) {
      window.closeNotificationDropdown?.();
      layoutDiscordProfileMenu();
      menu.classList.remove("dropdown-open");
      menu.classList.add("dropdown-closed");
      void menu.offsetHeight;
      requestAnimationFrame(() => {
        menu.classList.remove("dropdown-closed");
        menu.classList.add("dropdown-open");
        btn.setAttribute("aria-expanded", "true");
        layoutDiscordProfileMenu();
      });
    } else {
      menu.classList.remove("dropdown-open");
      menu.classList.add("dropdown-closed");
      btn.setAttribute("aria-expanded", "false");
    }
  };
  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function authOriginOverride() {
    const o = window.__CAFE_AUTH_ORIGIN;
    return typeof o === "string" && o.trim() ? o.trim().replace(/\/$/, "") : "";
  }
  function resolveAuthBase(configAuthOrigin) {
    const override = authOriginOverride();
    if (override) return override;
    const fromConfig = configAuthOrigin?.trim?.().replace(/\/$/, "");
    if (fromConfig && fromConfig !== window.location.origin) return fromConfig;
    return "";
  }
  function apiUrl(authBase, path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return authBase ? `${authBase}${p}` : p;
  }
  function currentReturnTo() {
    if (window.location.protocol === "file:") {
      return "https://fuziveer.github.io/Cafe-Core/";
    }
    return `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
  }
  function currentReturnToForLogout() {
    if (window.location.protocol === "file:") {
      return "https://fuziveer.github.io/Cafe-Core/";
    }
    const u = new URL(window.location.href);
    u.searchParams.delete("discord_partition_handoff");
    return `${u.origin}${u.pathname}${u.search}${u.hash}`;
  }
  function buildLoginUrl(authBase, loginPath) {
    const base = authBase || window.location.origin;
    const path = loginPath || "/auth/discord/login";
    const url = new URL(path, `${base}/`);
    url.searchParams.set("return_to", currentReturnTo());
    return url.toString();
  }
  function buildLogoutUrl(authBase) {
    const base = authBase || window.location.origin;
    const url = new URL("/auth/discord/logout", `${base}/`);
    url.searchParams.set("return_to", currentReturnToForLogout());
    return url.toString();
  }
  function clearAuthQueryFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("auth")) return;
    const auth = params.get("auth");
    if (auth && auth !== "discord_ok") {
      try {
        sessionStorage.removeItem("cafe_discord_signin_pending");
      } catch {
      }
    }
    params.delete("auth");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }
  function markDiscordSignInPending() {
    try {
      sessionStorage.setItem("cafe_discord_signin_pending", "1");
    } catch {
    }
  }
  function notifyDiscordSignInIfPending(user) {
    if (!user) return;
    try {
      if (sessionStorage.getItem("cafe_discord_signin_pending") !== "1") return;
      sessionStorage.removeItem("cafe_discord_signin_pending");
    } catch {
      return;
    }
    const name = user.displayName || user.username || "there";
    window.pushCafeNotification?.({
      title: "Signed in with Discord",
      body: `Welcome, ${name}. Your profile is linked to Caf\xE9 Core.`
    });
  }
  function bindDiscordSignInPending(linkEl) {
    if (!linkEl || linkEl.dataset.signinPendingBound === "1") return;
    linkEl.dataset.signinPendingBound = "1";
    linkEl.addEventListener("click", () => markDiscordSignInPending());
  }
  async function fetchMe(authBase) {
    const res = await fetch(apiUrl(authBase, "/api/auth/me"), { credentials: "include" });
    if (!res.ok) throw new Error("auth_me_failed");
    const data = await res.json();
    return data?.user ?? null;
  }
  async function consumePartitionHandoffIfPresent(authBase) {
    if (!authBase) return false;
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("discord_partition_handoff");
    if (!tok) return false;
    try {
      const res = await fetch(apiUrl(authBase, "/api/auth/discord/claim-handoff"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tok })
      });
      if (!res.ok) return false;
      params.delete("discord_partition_handoff");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", next);
      return true;
    } catch {
      return false;
    }
  }
  function renderSignedOut(host, loginUrl) {
    host.innerHTML = `
            <a
                href="${escapeHtml(loginUrl)}"
                id="discord-sign-in-btn"
                class="discord-auth-signin topbar-action-btn ui-interactive inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-slate-400 hover:text-white hover:bg-matte-800 border border-matte-800 hover:border-matte-700"
                aria-label="Sign in with Discord"
            >
                <i class="fa-brands fa-discord text-sm text-[#5865F2]" aria-hidden="true"></i>
                <span class="discord-auth-signin-label text-[10px] font-bold tracking-widest uppercase hidden sm:inline">Sign in</span>
            </a>`;
  }
  function renderSignedIn(host, user, authBase) {
    const name = user.displayName || user.username || "Discord";
    host.innerHTML = `
            <div class="discord-auth-profile relative">
                <button
                    type="button"
                    id="discord-profile-btn"
                    class="discord-auth-profile-btn topbar-action-btn ui-interactive flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg text-slate-300 hover:text-white hover:bg-matte-800 border border-matte-800 hover:border-matte-700 max-w-[11rem]"
                    aria-expanded="false"
                    aria-haspopup="menu"
                    aria-controls="discord-profile-menu"
                >
                    <img
                        class="discord-auth-avatar w-7 h-7 rounded-lg object-cover shrink-0 bg-matte-800"
                        src="${escapeHtml(user.avatarUrl)}"
                        alt=""
                        width="28"
                        height="28"
                        loading="lazy"
                        decoding="async"
                    />
                    <span class="discord-auth-name text-[10px] font-bold tracking-wide uppercase truncate min-w-0">${escapeHtml(name)}</span>
                    <i class="discord-auth-chevron fa-solid fa-chevron-down text-[9px] opacity-60 shrink-0" aria-hidden="true"></i>
                </button>
                <div
                    id="discord-profile-menu"
                    class="discord-auth-menu dropdown-closed absolute right-0 top-full mt-1 w-56 bg-matte-900 border border-matte-800 rounded-lg overflow-hidden"
                    role="menu"
                >
                    <div class="px-4 py-3 border-b border-matte-800">
                        <p class="text-sm font-bold tracking-wide text-white truncate">${escapeHtml(name)}</p>
                        <p class="text-xs text-slate-500 truncate mt-0.5">${escapeHtml(user.username ? `@${user.username}` : "Discord account")}</p>
                    </div>
                    <button
                        type="button"
                        id="discord-sign-out-btn"
                        class="discord-auth-signout ui-interactive w-full text-left px-4 py-3 text-xs font-bold tracking-widest uppercase text-slate-400 hover:text-redneon-500 hover:bg-matte-800"
                        role="menuitem"
                    >
                        Sign out
                    </button>
                </div>
            </div>`;
    const btn = byId("discord-profile-btn");
    const menu = byId("discord-profile-menu");
    const signOut = byId("discord-sign-out-btn");
    btn?.addEventListener("click", (event) => {
      event.stopPropagation();
      window.closeNotificationDropdown?.();
      const isOpen = menu.classList.contains("dropdown-open");
      window.setDiscordProfileMenuOpen(!isOpen);
    });
    signOut?.addEventListener("click", async () => {
      window.closeDiscordProfileMenu();
      setCurrentDiscordUser(null);
      try {
        await fetch(apiUrl(authBase || "", "/api/auth/logout"), {
          method: "POST",
          credentials: "include"
        });
      } catch {
      }
      window.location.assign(buildLogoutUrl(authBase));
    });
    portalDiscordProfileMenu();
  }
  async function loadAuthConfig(authBaseGuess) {
    const bases = [];
    if (authBaseGuess) bases.push(authBaseGuess);
    if (!bases.includes("")) bases.push("");
    for (const base of bases) {
      try {
        const res = await fetch(apiUrl(base, "/api/auth/discord/config"), { credentials: "include" });
        if (res.ok) return res.json();
      } catch {
      }
    }
    if (authBaseGuess) {
      return {
        configured: true,
        authOrigin: authBaseGuess,
        loginPath: "/auth/discord/login"
      };
    }
    return { configured: false, loginPath: "/auth/discord/login" };
  }
  async function refreshDiscordAuthUi() {
    const host = byId("discord-auth-host");
    if (!host) return;
    const override = authOriginOverride();
    const config = await loadAuthConfig(override);
    const authBase = resolveAuthBase(config.authOrigin);
    if (!config.configured) {
      host.innerHTML = "";
      host.hidden = true;
      setCurrentDiscordUser(null);
      return;
    }
    host.hidden = false;
    await consumePartitionHandoffIfPresent(authBase);
    const loginUrl = buildLoginUrl(authBase, config.loginPath);
    try {
      const user = await fetchMe(authBase);
      if (user) {
        setCurrentDiscordUser(user);
        notifyDiscordSignInIfPending(user);
        renderSignedIn(host, user, authBase);
      } else {
        setCurrentDiscordUser(null);
        renderSignedOut(host, loginUrl);
        bindDiscordSignInPending(byId("discord-sign-in-btn"));
      }
    } catch {
      setCurrentDiscordUser(null);
      renderSignedOut(host, loginUrl);
      bindDiscordSignInPending(byId("discord-sign-in-btn"));
    }
    if (typeof window.refreshCafeBlApiState === "function") {
      void window.refreshCafeBlApiState();
    }
  }
  window.initDiscordAuth = function initDiscordAuth() {
    clearAuthQueryFromUrl();
    refreshDiscordAuthUi();
  };
  window.refreshDiscordAuthUi = refreshDiscordAuthUi;
})();
