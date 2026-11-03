(function () {
    /** Vector icons: r6operators (MIT) — https://github.com/marcopixel/r6operators */
    const R6_OPERATOR_ICON_BASE =
        'https://cdn.jsdelivr.net/npm/r6operators@2.12.0/dist/icons';

    const R6_OPERATOR_ICON_EXTRA_BASE =
        'https://cdn.jsdelivr.net/npm/@zerobertoo/r6operators@2.0.0/dist/icons';

    const R6_OPERATOR_SLUG_ALIASES = {
        jager: 'jager',
        jäger: 'jager',
        chanka: 'tachanka',
        tachanka: 'tachanka',
        lion: 'lion',
        dokkaebi: 'dokkaebi',
        'solid snake': 'solid_snake',
        solidsnake: 'solid_snake',
    };

    const R6_OPERATOR_ICON_SLUGS_EXTRA = new Set(['solid_snake']);

    function operatorNameToSlug(name) {
        const raw = String(name)
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, '');
        if (R6_OPERATOR_SLUG_ALIASES[raw]) return R6_OPERATOR_SLUG_ALIASES[raw];
        const compact = raw.replace(/[^a-z0-9]/g, '');
        if (R6_OPERATOR_SLUG_ALIASES[compact]) return R6_OPERATOR_SLUG_ALIASES[compact];
        return compact;
    }

    function operatorIconUrl(name) {
        const slug = operatorNameToSlug(name);
        if (!slug) return '';
        const base = R6_OPERATOR_ICON_SLUGS_EXTRA.has(slug)
            ? R6_OPERATOR_ICON_EXTRA_BASE
            : R6_OPERATOR_ICON_BASE;
        return `${base}/${encodeURIComponent(slug)}.svg`;
    }

    function bindOperatorIconFallback(root) {
        if (!root) return;
        root.querySelectorAll('.bl-roster-op-icon').forEach((img) => {
            img.addEventListener(
                'error',
                () => {
                    img.remove();
                },
                { once: true }
            );
        });
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderCardAvatar(member, recruiting, name) {
        const baseClass = recruiting
            ? 'bl-roster-avatar bl-roster-avatar--recruiting'
            : 'bl-roster-avatar';
        const n = Number(member.teamRank);
        if (!recruiting && Number.isFinite(n) && n >= 1) {
            return `<div class="${baseClass} bl-roster-avatar--team-rank" title="Team rank #${n}" aria-hidden="true">#${n}</div>`;
        }
        return `<div class="${baseClass}" aria-hidden="true">${escapeHtml(initialsFromName(name))}</div>`;
    }

    function formatPlayerName(name) {
        const raw = String(name);
        const match = raw.match(/^(.+?)(\.BL)$/i);
        if (!match) return escapeHtml(raw);
        return `${escapeHtml(match[1])}<span class="bl-roster-handle">${escapeHtml(match[2])}</span>`;
    }

    function rolePartSlug(label) {
        return String(label)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function formatRolePart(part) {
        const text = String(part || '').trim();
        if (!text) return '';
        const slug = rolePartSlug(text);
        const slugClass = ['support', 'flex', 'fragger', 'intel', 'roamer'].includes(slug)
            ? ` bl-roster-role-part--${slug}`
            : '';
        return `<span class="bl-roster-role-part${slugClass}">${escapeHtml(text)}</span>`;
    }

    /** Left-to-right on cards; Intel always after Support when both are present. */
    const ROLE_PART_DISPLAY_ORDER = ['fragger', 'flex', 'support', 'intel', 'roamer'];

    function sortRolePartsForDisplay(parts) {
        return [...parts].sort((a, b) => {
            const ia = ROLE_PART_DISPLAY_ORDER.indexOf(rolePartSlug(a));
            const ib = ROLE_PART_DISPLAY_ORDER.indexOf(rolePartSlug(b));
            const oa = ia === -1 ? ROLE_PART_DISPLAY_ORDER.length : ia;
            const ob = ib === -1 ? ROLE_PART_DISPLAY_ORDER.length : ib;
            if (oa !== ob) return oa - ob;
            return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
        });
    }

    function formatRoleDisplay(role) {
        const raw = String(role || '').trim();
        if (!raw) return '';
        const parts = sortRolePartsForDisplay(raw.split(/\s*\/\s*/).filter(Boolean));
        if (!parts.length) return '';
        if (parts.length === 1) return formatRolePart(parts[0]);
        return parts
            .map((part) => formatRolePart(part))
            .join('<span class="bl-roster-role-dot" aria-hidden="true">·</span>');
    }

    function initialsFromName(name) {
        const parts = String(name).trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function renderOperatorPills(operators, side) {
        const list = (Array.isArray(operators) ? operators.filter(Boolean) : [])
            .slice()
            .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }));
        if (!list.length) {
            return '<span class="bl-roster-op-empty">—</span>';
        }
        return list
            .map((op) => {
                const iconUrl = operatorIconUrl(op);
                const iconMarkup = iconUrl
                    ? `<img class="bl-roster-op-icon" src="${escapeHtml(iconUrl)}" alt="" width="18" height="18" loading="lazy" decoding="async">`
                    : '';
                return `<span class="bl-roster-op-pill bl-roster-op-pill--${side}">${iconMarkup}<span class="bl-roster-op-name">${escapeHtml(op)}</span></span>`;
            })
            .join('');
    }

    function renderMemberCard(member) {
        const recruiting = Boolean(member.recruiting);
        const captain = Boolean(member.captain);
        const name = member.name || 'TBD';
        const role = member.role || 'Role';
        const badges = [];
        if (captain) {
            badges.push('<span class="bl-roster-badge bl-roster-badge--captain">Captain</span>');
        }
        if (recruiting) {
            badges.push('<span class="bl-roster-badge bl-roster-badge--recruiting">Recruiting</span>');
        }
        if (member.igl) {
            badges.push('<span class="bl-roster-badge bl-roster-badge--igl">IGL</span>');
        }
        if (member.coIgl) {
            badges.push('<span class="bl-roster-badge bl-roster-badge--co-igl">Co-IGL</span>');
        }

        let cardClass = 'bl-roster-card';
        if (member.substitute) cardClass += ' bl-roster-card--sub';
        const iglFocus = Boolean(member.igl && member.gridCenter);
        if (iglFocus) cardClass += ' bl-roster-card--igl-focus';
        else if (member.gridCenter) cardClass += ' bl-roster-card--grid-center';

        const cardHtml = `
        <article class="${cardClass}">
            <div class="bl-roster-card-accent" aria-hidden="true"></div>
            <div class="bl-roster-card-body">
                <header class="bl-roster-card-head">
                    <div class="bl-roster-card-head-main">
                        ${renderCardAvatar(member, recruiting, name)}
                        <div class="bl-roster-card-meta min-w-0 flex-1">
                            <div class="bl-roster-name-row">
                                <h3 class="bl-roster-player-name">${formatPlayerName(name)}</h3>
                                ${badges.length ? `<div class="bl-roster-badges">${badges.join('')}</div>` : ''}
                            </div>
                            <p class="bl-roster-role">${formatRoleDisplay(role)}</p>
                        </div>
                    </div>
                    <button type="button" class="bl-roster-more-btn ui-interactive" data-bl-member-id="${escapeHtml(member.id || '')}" aria-haspopup="dialog">More</button>
                </header>
                ${renderMemberOps(member)}
            </div>
        </article>`;

        if (!iglFocus) return cardHtml;

        const iglOrnament = (side) => `
            <div class="bl-roster-igl-ornament bl-roster-igl-ornament--${side}" aria-hidden="true">
                <span class="bl-roster-igl-ornament-line"></span>
                <span class="bl-roster-igl-ornament-mark">
                    <i class="fa-solid fa-crown"></i>
                </span>
                <span class="bl-roster-igl-ornament-line"></span>
            </div>`;

        return `
        <div class="bl-roster-igl-focus-row">
            ${iglOrnament('left')}
            ${cardHtml}
            ${iglOrnament('right')}
        </div>`;
    }

    function renderApplyToJoinSlot() {
        return `
        <button
            type="button"
            class="bl-roster-card bl-roster-card--sub bl-roster-card--apply bl-roster-card--apply-disabled"
            disabled
            aria-disabled="true"
            aria-label="Apply to join Black-Listed roster (currently unavailable)"
        >
            <div class="bl-roster-card-body bl-roster-card-body--apply">
                <p class="bl-roster-apply-label">Apply to join</p>
            </div>
        </button>`;
    }

    function getRoster() {
        const roster = window.BLACK_LISTED_ROSTER;
        return Array.isArray(roster) ? roster : [];
    }

    function findMemberById(memberId) {
        if (!memberId) return null;
        return getRoster().find((entry) => entry.id === memberId) || null;
    }

    function renderMemberOps(member) {
        return `
                <div class="bl-roster-ops">
                    <div class="bl-roster-ops-side bl-roster-ops-side--atk">
                        <p class="bl-roster-ops-label bl-roster-ops-label--atk">
                            <i class="fa-solid fa-crosshairs" aria-hidden="true"></i>
                            Attack
                        </p>
                        <div class="bl-roster-op-list">${renderOperatorPills(member.attackers, 'atk')}</div>
                    </div>
                    <div class="bl-roster-ops-side bl-roster-ops-side--def">
                        <p class="bl-roster-ops-label bl-roster-ops-label--def">
                            <i class="fa-solid fa-shield" aria-hidden="true"></i>
                            Defense
                        </p>
                        <div class="bl-roster-op-list">${renderOperatorPills(member.defenders, 'def')}</div>
                    </div>
                </div>`;
    }

    /** Rank badge PNGs — Kaapo38/r6ranks (Ubisoft-style rank IDs 0–36) */
    const R6_RANK_ICON_CDN = 'https://cdn.jsdelivr.net/gh/Kaapo38/r6ranks@main';

    const R6_RANK_TIER_BASE_ID = {
        copper: 1,
        bronze: 6,
        silver: 11,
        gold: 16,
        platinum: 21,
        emerald: 26,
        diamond: 31,
    };

    function peakRankRawLabel(member) {
        const raw = member.peakRank;
        if (raw == null || raw === '') return '';
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'object' && raw.rank) return String(raw.rank).trim();
        return '';
    }

    function formatPeakRank(member) {
        const label = peakRankRawLabel(member);
        if (!label) return '';
        const raw = member.peakRank;
        if (typeof raw === 'object' && raw.season) {
            const season = String(raw.season).trim();
            if (season) return `${label} · ${season}`;
        }
        return label;
    }

    function parseRankDivision(part) {
        const token = String(part || '')
            .trim()
            .toLowerCase()
            .replace(/\./g, '');
        if (!token) return null;
        const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
        if (roman[token] != null) return roman[token];
        const n = Number.parseInt(token, 10);
        if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
        return null;
    }

    function peakRankLabelToIconId(label) {
        let text = String(label)
            .trim()
            .toLowerCase()
            .replace(/\./g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text) return null;
        if (text === 'unranked') return 0;
        if (text.startsWith('champion')) return 36;

        const match = text.match(/^(copper|bronze|silver|gold|platinum|emerald|diamond)\s*(.*)$/);
        if (!match) return null;

        const base = R6_RANK_TIER_BASE_ID[match[1]];
        if (!base) return null;

        const division = parseRankDivision(match[2]);
        if (division == null) return base + 2;
        return base + (5 - division);
    }

    function peakRankIconUrl(member) {
        const explicit = Number(member.peakRankIconId);
        if (Number.isFinite(explicit) && explicit >= 0 && explicit <= 36) {
            return `${R6_RANK_ICON_CDN}/${explicit}.png`;
        }
        const id = peakRankLabelToIconId(peakRankRawLabel(member));
        if (id == null) return '';
        return `${R6_RANK_ICON_CDN}/${id}.png`;
    }

    function bindPeakRankIconFallback(root) {
        if (!root) return;
        root.querySelectorAll('.bl-roster-modal-peak-icon').forEach((img) => {
            if (img.dataset.fallbackBound === '1') return;
            img.dataset.fallbackBound = '1';
            img.addEventListener('error', () => {
                img.hidden = true;
            });
        });
    }

    function renderTeamRankRail(member) {
        const railEl = document.getElementById('bl-roster-player-modal-team-rank');
        if (!railEl) return;

        const n = Number(member.teamRank);
        if (!Number.isFinite(n) || n < 1) {
            railEl.hidden = true;
            railEl.innerHTML = '';
            return;
        }

        railEl.hidden = false;
        railEl.innerHTML = `
            <div class="bl-roster-modal-peak-rail-inner">
                <p class="bl-roster-modal-peak-label">Team rank</p>
                <p class="bl-roster-modal-peak-value"><span class="text-redneon-500">#${escapeHtml(String(n))}</span></p>
            </div>`;
    }

    function renderPeakRankRail(member) {
        const peakEl = document.getElementById('bl-roster-player-modal-peak');
        if (!peakEl) return;

        const peakLabel = formatPeakRank(member);
        if (!peakLabel) {
            peakEl.hidden = true;
            peakEl.innerHTML = '';
            return;
        }

        const iconUrl = peakRankIconUrl(member);
        const iconMarkup = iconUrl
            ? `<img class="bl-roster-modal-peak-icon" src="${escapeHtml(iconUrl)}" alt="" width="56" height="56" loading="lazy" decoding="async">`
            : '';

        peakEl.hidden = false;
        peakEl.innerHTML = `
            <div class="bl-roster-modal-peak-rail-inner">
                ${iconMarkup}
                <p class="bl-roster-modal-peak-label">Peak rank</p>
                <p class="bl-roster-modal-peak-value">${escapeHtml(peakLabel)}</p>
            </div>`;
        bindPeakRankIconFallback(peakEl);
    }

    function renderPlayerModalContent(member) {
        const notes = member.notes || member.more || '';
        const notesBlock = notes
            ? `<div class="bl-roster-modal-notes mt-4 pt-4 border-t border-matte-800 text-slate-400 text-xs tracking-wide leading-relaxed">${escapeHtml(notes)}</div>`
            : '';

        return `
            ${renderMemberOps(member)}
            ${notesBlock}`;
    }

    let blRosterModalBound = false;
    let blRosterModalCloseTimer = null;

    function portalModalToBody() {
        const modal = document.getElementById('bl-roster-player-modal');
        if (modal && modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
    }

    function setBlRosterPlayerModalOpen(open) {
        const modal = document.getElementById('bl-roster-player-modal');
        const closeBtn = document.getElementById('bl-roster-player-modal-close');
        if (!modal) return;

        clearTimeout(blRosterModalCloseTimer);
        blRosterModalCloseTimer = null;

        if (open) {
            portalModalToBody();
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('bl-roster-player-modal-open');
            void modal.offsetHeight;
            modal.classList.add('is-open');
            closeBtn?.focus();
            return;
        }

        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('bl-roster-player-modal-open');
        blRosterModalCloseTimer = setTimeout(() => {
            modal.classList.add('hidden');
            blRosterModalCloseTimer = null;
        }, 150);
    }

    function openBlRosterPlayerModal(memberId) {
        const member = findMemberById(memberId);
        if (!member) return;

        const modal = document.getElementById('bl-roster-player-modal');
        const title = document.getElementById('bl-roster-player-modal-title');
        const roleEl = document.getElementById('bl-roster-player-modal-role');
        const body = document.getElementById('bl-roster-player-modal-body');
        if (!modal || !title || !body) return;

        title.innerHTML = formatPlayerName(member.name || 'Player');
        if (roleEl) {
            const role = member.role || '';
            roleEl.innerHTML = role ? formatRoleDisplay(role) : '';
            roleEl.hidden = !role;
        }
        body.innerHTML = renderPlayerModalContent(member);
        renderTeamRankRail(member);
        renderPeakRankRail(member);
        bindOperatorIconFallback(body);
        setBlRosterPlayerModalOpen(true);
    }

    function initBlRosterPlayerModal() {
        const modal = document.getElementById('bl-roster-player-modal');
        const backdrop = document.getElementById('bl-roster-player-modal-backdrop');
        const closeBtn = document.getElementById('bl-roster-player-modal-close');
        if (!modal) return;

        portalModalToBody();

        if (blRosterModalBound) return;
        blRosterModalBound = true;

        const close = () => setBlRosterPlayerModalOpen(false);
        backdrop?.addEventListener('click', close);
        closeBtn?.addEventListener('click', close);
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            const liveModal = document.getElementById('bl-roster-player-modal');
            if (!liveModal?.classList.contains('is-open')) return;
            close();
        });
    }

    function bindBlRosterMoreButtons() {
        const page = document.getElementById('page-black-listed');
        if (!page || page.dataset.blMoreBound === '1') return;
        page.dataset.blMoreBound = '1';
        page.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-bl-member-id]');
            if (!btn || !page.contains(btn)) return;
            const memberId = btn.getAttribute('data-bl-member-id');
            if (!memberId) return;
            openBlRosterPlayerModal(memberId);
        });
    }

    function renderBlackListedRoster() {
        const host = document.getElementById('black-listed-roster');
        const subsHost = document.getElementById('black-listed-subs');
        const subsSection = document.getElementById('black-listed-subs-section');
        if (!host) return;

        const roster = getRoster();
        const starters = roster.filter((member) => !member.substitute);
        const subs = roster.filter((member) => member.substitute);

        if (!starters.length && !subs.length) {
            host.innerHTML =
                '<p class="text-sm text-slate-500 tracking-wide text-center col-span-full">Roster coming soon.</p>';
            if (subsSection) subsSection.classList.add('hidden');
            return;
        }

        host.innerHTML = starters.length
            ? starters.map((member) => renderMemberCard(member)).join('')
            : '<p class="text-sm text-slate-500 tracking-wide text-center col-span-full">Starters coming soon.</p>';

        if (subsHost && subsSection) {
            if (subs.length) {
                subsSection.classList.remove('hidden');
                subsHost.innerHTML =
                    subs.map((member) => renderMemberCard(member)).join('') + renderApplyToJoinSlot();
            } else {
                subsSection.classList.add('hidden');
                subsHost.innerHTML = '';
            }
        }

        bindOperatorIconFallback(host);
        bindOperatorIconFallback(subsHost);
    }

    window.teardownBlackListedPage = function teardownBlackListedPage() {
        clearTimeout(blRosterModalCloseTimer);
        blRosterModalCloseTimer = null;
        document.querySelectorAll('#bl-roster-player-modal').forEach((el) => el.remove());
        document.body.classList.remove('bl-roster-player-modal-open');
        blRosterModalBound = false;
    };

    window.initBlackListedPage = function initBlackListedPage() {
        initBlRosterPlayerModal();
        bindBlRosterMoreButtons();
        renderBlackListedRoster();
    };
})();
