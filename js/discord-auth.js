(function () {
    'use strict';

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function clearAuthQueryFromUrl() {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('auth')) return;
        params.delete('auth');
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
        window.history.replaceState(null, '', next);
    }

    async function fetchMe() {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (res.status === 401) return null;
        if (!res.ok) throw new Error('auth_me_failed');
        const data = await res.json();
        return data?.user ?? null;
    }

    function renderSignedOut(host, loginPath) {
        host.innerHTML = `
            <a
                href="${escapeHtml(loginPath)}"
                id="discord-sign-in-btn"
                class="discord-auth-signin topbar-action-btn ui-interactive inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-slate-400 hover:text-white hover:bg-matte-800 border border-matte-800 hover:border-matte-700"
                aria-label="Sign in with Discord"
            >
                <i class="fa-brands fa-discord text-sm text-[#5865F2]" aria-hidden="true"></i>
                <span class="discord-auth-signin-label text-[10px] font-bold tracking-widest uppercase hidden sm:inline">Sign in</span>
            </a>`;
    }

    function renderSignedIn(host, user) {
        const name = user.displayName || user.username || 'Discord';
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
                    <i class="fa-solid fa-chevron-down text-[9px] opacity-60 shrink-0" aria-hidden="true"></i>
                </button>
                <div
                    id="discord-profile-menu"
                    class="discord-auth-menu dropdown-closed absolute right-0 top-full mt-1 w-56 bg-matte-900 border border-matte-800 rounded-lg overflow-hidden z-50"
                    role="menu"
                    hidden
                >
                    <div class="px-4 py-3 border-b border-matte-800">
                        <p class="text-sm font-bold tracking-wide text-white truncate">${escapeHtml(name)}</p>
                        <p class="text-xs text-slate-500 truncate mt-0.5">${escapeHtml(user.username ? `@${user.username}` : 'Discord account')}</p>
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

        const btn = byId('discord-profile-btn');
        const menu = byId('discord-profile-menu');
        const signOut = byId('discord-sign-out-btn');

        const closeMenu = () => {
            if (!menu || !btn) return;
            menu.classList.remove('dropdown-open');
            menu.classList.add('dropdown-closed');
            menu.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
        };

        const openMenu = () => {
            if (!menu || !btn) return;
            menu.hidden = false;
            menu.classList.remove('dropdown-closed');
            menu.classList.add('dropdown-open');
            btn.setAttribute('aria-expanded', 'true');
        };

        btn?.addEventListener('click', (event) => {
            event.stopPropagation();
            const open = btn.getAttribute('aria-expanded') === 'true';
            if (open) closeMenu();
            else openMenu();
        });

        signOut?.addEventListener('click', async () => {
            closeMenu();
            try {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
            } catch {
                /* ignore */
            }
            await refreshDiscordAuthUi();
        });

        if (!window.__discordProfileDocBound) {
            window.__discordProfileDocBound = true;
            document.addEventListener('click', (event) => {
                const liveBtn = byId('discord-profile-btn');
                const liveMenu = byId('discord-profile-menu');
                if (!liveBtn || !liveMenu || liveMenu.hidden) return;
                if (liveBtn.contains(event.target) || liveMenu.contains(event.target)) return;
                liveMenu.classList.remove('dropdown-open');
                liveMenu.classList.add('dropdown-closed');
                liveMenu.hidden = true;
                liveBtn.setAttribute('aria-expanded', 'false');
            });
        }
    }

    async function refreshDiscordAuthUi() {
        const host = byId('discord-auth-host');
        if (!host) return;

        let config = { configured: false, loginPath: '/auth/discord/login' };
        try {
            const res = await fetch('/api/auth/discord/config', { credentials: 'same-origin' });
            if (res.ok) config = await res.json();
        } catch {
            host.innerHTML = '';
            host.hidden = true;
            return;
        }

        if (!config.configured) {
            host.innerHTML = '';
            host.hidden = true;
            return;
        }

        host.hidden = false;

        try {
            const user = await fetchMe();
            if (user) renderSignedIn(host, user);
            else renderSignedOut(host, config.loginPath || '/auth/discord/login');
        } catch {
            renderSignedOut(host, config.loginPath || '/auth/discord/login');
        }
    }

    window.initDiscordAuth = function initDiscordAuth() {
        clearAuthQueryFromUrl();
        refreshDiscordAuthUi();
    };

    window.refreshDiscordAuthUi = refreshDiscordAuthUi;
})();
