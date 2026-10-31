(function () {
    'use strict';

    const STORAGE_QUEUE = 'cafecore.findteam.queue';
    const STORAGE_PARTY_PREFIX = 'cafecore.findteam.party.';
    const STORAGE_MEMBER_ID = 'cafecore.findteam.memberId';
    const STORAGE_DISPLAY_NAME = 'cafecore.findteam.displayName';
    const MATCH_TICK_MS = 1500;
    const MAX_PARTY_SIZE = 5;

    const picklist = window.__cafeCorePicklist;
    const glideApi = window.__cafeCoreGlide;
    const RANKS_WITHOUT_DIVISION = new Set(['any', 'radiant']);
    const COMPETITIVE_MODE_ID = 'competitive';
    const FILTER_RANK_OPTIONAL = 'rank-optional';

    function getCatalog() {
        if (Array.isArray(window.FIND_TEAM_CATALOG)) return window.FIND_TEAM_CATALOG;
        if (typeof FIND_TEAM_CATALOG !== 'undefined' && Array.isArray(FIND_TEAM_CATALOG)) {
            return FIND_TEAM_CATALOG;
        }
        return [];
    }

    let pollTimer = null;
    let partyCode = null;
    let queueEntryId = null;
    let uiBound = false;
    let rankFilterBootstrapped = false;
    let catalogRetryCount = 0;
    let applyingFilterSnapshot = false;
    let pendingFilterSnapshot = null;

    function byId(id) {
        return document.getElementById(id);
    }

    function getMemberId() {
        let id = sessionStorage.getItem(STORAGE_MEMBER_ID);
        if (!id) {
            id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            sessionStorage.setItem(STORAGE_MEMBER_ID, id);
        }
        return id;
    }

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw == null) return fallback;
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    function gameById(id) {
        return getCatalog().find((g) => g.id === id) || null;
    }

    function partsFromEntries(entries, prefix) {
        return entries.map((entry) => ({ id: entry.id, name: entry.name }));
    }

    function getSelectedGameId() {
        return byId('find-team-game-pick')?.dataset.value || '';
    }

    function getSelectedModeId() {
        return byId('find-team-mode-pick')?.dataset.value || '';
    }

    function getSelectedRankId() {
        return byId('find-team-rank-pick')?.dataset.value || '';
    }

    function rankUsesDivision(rankId) {
        return Boolean(rankId && !RANKS_WITHOUT_DIVISION.has(rankId));
    }

    function getSelectedDivision() {
        if (!rankUsesDivision(getSelectedRankId())) return '';
        const glide = byId('find-team-division-glide');
        return glide?.dataset.value || '1';
    }

    function getDisplayName() {
        const input = byId('find-team-display-name');
        const name = (input?.value || '').trim();
        return name || 'Player';
    }

    function filterKey(gameId, modeId, rankId, divisionId, rankOptional) {
        if (rankOptional) {
            return `${gameId}|${modeId}|${FILTER_RANK_OPTIONAL}`;
        }
        const divisionPart = rankUsesDivision(rankId) ? (divisionId || '1') : '';
        return `${gameId}|${modeId}|${rankId}|${divisionPart}`;
    }

    function filterKeyFromEntry(entry) {
        return filterKey(
            entry.gameId,
            entry.modeId,
            entry.rankId,
            entry.divisionId,
            entry.rankOptional,
        );
    }

    function parseFilterKey(key) {
        const [gameId, modeId, rankId, divisionId = ''] = String(key || '').split('|');
        if (rankId === FILTER_RANK_OPTIONAL) {
            return {
                gameId,
                modeId,
                rankId: 'any',
                divisionId: '',
                rankOptional: true,
            };
        }
        return { gameId, modeId, rankId, divisionId, rankOptional: false };
    }

    function getRankIncludeButton() {
        return byId('find-team-rank-include-btn');
    }

    function getRankIncludeWrap() {
        return byId('find-team-rank-include-wrap');
    }

    function isRankIncludeControlVisible() {
        const wrap = getRankIncludeWrap();
        return Boolean(wrap && !wrap.classList.contains('hidden'));
    }

    function setRankIncludeControlVisible(show) {
        const wrap = getRankIncludeWrap();
        if (!wrap) return;
        wrap.classList.toggle('hidden', !show);
        if (show) {
            wrap.removeAttribute('hidden');
        } else {
            wrap.setAttribute('hidden', '');
        }
    }

    function syncRankIncludeToggleVisual(input, include) {
        if (!input) return;
        input.checked = Boolean(include);
        input.setAttribute('aria-checked', include ? 'true' : 'false');
    }

    function isIncludeRankActive() {
        const input = getRankIncludeButton();
        if (!isRankIncludeControlVisible() || !input) return false;
        return input.checked;
    }

    function setIncludeRankActive(include, { userSet = false } = {}) {
        const input = getRankIncludeButton();
        if (!input) return;
        syncRankIncludeToggleVisual(input, include);
        if (userSet) input.dataset.userSet = '1';
    }

    function isRankOptionalActive() {
        const modeId = getSelectedModeId();
        if (!modeId || modeId === COMPETITIVE_MODE_ID) return false;
        return !isIncludeRankActive();
    }

    function syncRankOptionalForMode({ preferDefault = false } = {}) {
        const btn = getRankIncludeButton();
        const onFindTeam = Boolean(byId('page-find-team'));
        const modeId = getSelectedModeId();
        const show = onFindTeam && Boolean(modeId && modeId !== COMPETITIVE_MODE_ID);
        setRankIncludeControlVisible(show);
        if (!show) {
            setIncludeRankActive(false);
        } else if (preferDefault && btn && btn.dataset.userSet !== '1') {
            setIncludeRankActive(false);
        }
        syncRankOptionalFieldState();
    }

    function syncRankOptionalFieldState() {
        const optional = isRankOptionalActive();
        byId('find-team-rank-field-controls')
            ?.classList.toggle('find-team-rank-field-controls--bypassed', optional);
    }

    function setModeRankEnabled(enabled) {
        ['find-team-mode-input', 'find-team-rank-input'].forEach((id) => {
            const el = byId(id);
            if (el) el.disabled = !enabled;
        });
    }

    function getCurrentFilterSnapshot() {
        const rankOptional = isRankOptionalActive();
        return {
            gameId: getSelectedGameId(),
            modeId: getSelectedModeId(),
            rankId: rankOptional ? 'any' : getSelectedRankId(),
            divisionId: rankOptional ? '' : getSelectedDivision(),
            rankOptional,
        };
    }

    function applyFilterSnapshot(snapshot) {
        if (!snapshot?.gameId || !picklist) return;
        const gamePick = byId('find-team-game-pick');
        if (!gamePick || gamePick.dataset.toolPicklistInit !== '1') {
            pendingFilterSnapshot = snapshot;
            return;
        }
        pendingFilterSnapshot = null;
        const game = gameById(snapshot.gameId);
        if (!game) return;

        applyingFilterSnapshot = true;
        try {
            rankFilterBootstrapped = true;
            picklist.setValue(gamePick, { id: game.id, name: game.name });
            syncDependentPicklists();
            const modePick = byId('find-team-mode-pick');
            const rankPick = byId('find-team-rank-pick');
            const mode = game.modes.find((m) => m.id === snapshot.modeId);
            if (mode && modePick) {
                picklist.setValue(modePick, { id: mode.id, name: mode.name });
            }
            const rank = game.ranks.find((r) => r.id === snapshot.rankId);
            if (rank && rankPick) {
                picklist.setValue(rankPick, { id: rank.id, name: rank.name });
            }
            syncDivisionGlide();
            const glide = byId('find-team-division-glide');
            if (glide && snapshot.divisionId && rankUsesDivision(snapshot.rankId)) {
                glide.dataset.value = String(snapshot.divisionId);
                glideApi?.sync?.(glide);
            }
            const includeBtn = getRankIncludeButton();
            if (snapshot.rankOptional != null) {
                setIncludeRankActive(!snapshot.rankOptional);
                if (includeBtn) includeBtn.dataset.userSet = '1';
            }
            syncRankOptionalForMode();
        } finally {
            applyingFilterSnapshot = false;
        }
    }

    function syncActiveSessionFilters() {
        if (applyingFilterSnapshot || !filtersComplete()) return;
        const filters = getCurrentFilterSnapshot();
        const memberId = getMemberId();
        const meta = formatPartyMeta(
            filters.gameId,
            filters.modeId,
            filters.rankId,
            filters.divisionId,
            filters.rankOptional,
        );

        if (queueEntryId) {
            const queue = readQueue();
            const entry = queue.find((e) => e.memberId === memberId);
            if (!entry) {
                queueEntryId = null;
                return;
            }
            Object.assign(entry, filters);
            writeQueue(queue);
            const summary = byId('find-team-search-summary');
            if (summary) summary.textContent = meta;
        }

        if (partyCode) {
            const party = readParty(partyCode);
            if (!party?.members.some((m) => m.id === memberId)) return;
            party.gameId = filters.gameId;
            party.modeId = filters.modeId;
            party.rankId = filters.rankId;
            party.divisionId = filters.divisionId || undefined;
            party.rankOptional = Boolean(filters.rankOptional);
            writeParty(partyCode, party);
            const hostedLabel = party.hosted ? ' · Hosted party' : '';
            const partyMeta = byId('find-team-party-meta');
            if (partyMeta) partyMeta.textContent = meta + hostedLabel;
        }
    }

    function syncPartyMemberDisplayName() {
        if (!partyCode) return;
        const party = readParty(partyCode);
        if (!party) return;
        const memberId = getMemberId();
        const member = party.members.find((m) => m.id === memberId);
        if (!member) return;
        const name = getDisplayName();
        if (!name || member.name === name) return;
        member.name = name;
        writeParty(partyCode, party);
    }

    function onFindTeamRankChange() {
        syncDivisionGlide();
        syncActiveSessionFilters();
        syncActionButtonState();
    }

    function syncDependentPicklists() {
        if (!picklist) return;
        const gamePick = byId('find-team-game-pick');
        const modePick = byId('find-team-mode-pick');
        const rankPick = byId('find-team-rank-pick');
        if (gamePick?._picklistEditing && !getSelectedGameId()) return;

        const game = gameById(getSelectedGameId());
        if (!game) {
            setModeRankEnabled(false);
            picklist.updateOptions(modePick, [], '');
            picklist.updateOptions(rankPick, [], '');
            return;
        }
        setModeRankEnabled(true);
        picklist.updateOptions(modePick, partsFromEntries(game.modes), getSelectedModeId());
        if (!modePick.dataset.value && game.modes[0] && !modePick._picklistEditing) {
            picklist.setValue(modePick, { id: game.modes[0].id, name: game.modes[0].name });
        }
        const rankParts = partsFromEntries(game.ranks);
        const currentRankId = getSelectedRankId();
        const bootstrapRank = !rankFilterBootstrapped && !currentRankId;
        const initialRank = game.ranks.find((r) => r.id === 'any') || game.ranks[0];
        picklist.updateOptions(
            rankPick,
            rankParts,
            bootstrapRank && initialRank ? initialRank.id : currentRankId,
        );
        if (bootstrapRank && initialRank) {
            picklist.setValue(rankPick, { id: initialRank.id, name: initialRank.name });
            rankFilterBootstrapped = true;
        }
        syncRankOptionalForMode();
        syncDivisionGlide();
        syncActiveSessionFilters();
        syncActionButtonState();
    }

    function onFindTeamModeChange() {
        syncRankOptionalForMode({ preferDefault: true });
        syncActiveSessionFilters();
        syncActionButtonState();
    }

    function onFindTeamRankIncludeToggle() {
        const input = getRankIncludeButton();
        if (!input || input.disabled || !isRankIncludeControlVisible()) return;
        setIncludeRankActive(input.checked, { userSet: true });
        syncRankOptionalFieldState();
        syncActiveSessionFilters();
        syncActionButtonState();
    }

    function syncDivisionGlide() {
        const wrap = byId('find-team-division-wrap');
        const glide = byId('find-team-division-glide');
        const show = rankUsesDivision(getSelectedRankId());
        wrap?.classList.toggle('hidden', !show);
        if (!show || !glide) return;
        if (glideApi?.sync) glideApi.sync(glide);
    }

    function mountDivisionGlide() {
        const glide = byId('find-team-division-glide');
        if (!glide || !glideApi?.init) return;
        if (glide.dataset.glideBound !== '1') {
            glideApi.init(glide, {
                valueKey: 'division',
                onChange: () => {
                    syncActiveSessionFilters();
                    syncActionButtonState();
                },
            });
        }
        syncDivisionGlide();
    }

    function filtersComplete() {
        if (!getSelectedGameId() || !getSelectedModeId()) return false;
        if (isRankOptionalActive()) return true;
        return Boolean(getSelectedRankId());
    }

    function isBusyInFindTeam() {
        return Boolean(queueEntryId || partyCode);
    }

    function showJoinError(message) {
        if (!message) return;
        window.CafeCore?.Toast?.show(message);
    }

    function closeFindTeamPicklistMenus() {
        if (picklist?.closeAll) {
            picklist.closeAll();
            return;
        }
        ['find-team-game-menu', 'find-team-mode-menu', 'find-team-rank-menu'].forEach((id) => {
            const menu = byId(id);
            if (!menu) return;
            menu.classList.remove('dropdown-open');
            menu.classList.add('dropdown-closed');
        });
        ['find-team-game-pick', 'find-team-mode-pick', 'find-team-rank-pick'].forEach((id) => {
            byId(id)?.classList.remove('is-open');
        });
    }

    function syncFilterLockState() {
        const locked = isBusyInFindTeam();
        const filtersPanel = document.querySelector('#page-find-team .find-team-panel');
        filtersPanel?.classList.toggle('find-team-filters--locked', locked);

        const nameInput = byId('find-team-display-name');
        if (nameInput) {
            nameInput.readOnly = locked;
            nameInput.setAttribute('aria-readonly', locked ? 'true' : 'false');
        }

        ['find-team-game-input', 'find-team-mode-input', 'find-team-rank-input'].forEach((id) => {
            const input = byId(id);
            if (!input) return;
            input.readOnly = locked;
            input.setAttribute('aria-readonly', locked ? 'true' : 'false');
            if (locked) {
                input.tabIndex = -1;
            } else {
                input.removeAttribute('tabIndex');
            }
        });

        ['find-team-game-pick', 'find-team-mode-pick', 'find-team-rank-pick'].forEach((id) => {
            const pick = byId(id);
            if (!pick) return;
            pick.classList.toggle('find-team-picklist--locked', locked);
            pick.setAttribute('aria-disabled', locked ? 'true' : 'false');
        });

        const divisionGlide = byId('find-team-division-glide');
        divisionGlide?.classList.toggle('find-team-glide--locked', locked);
        divisionGlide?.querySelectorAll('.glide-selector-option').forEach((btn) => {
            btn.disabled = locked;
        });

        const includeBtn = getRankIncludeButton();
        if (includeBtn) {
            includeBtn.disabled = locked;
            includeBtn.setAttribute('aria-disabled', locked ? 'true' : 'false');
        }

        if (locked) closeFindTeamPicklistMenus();
    }

    function syncFindTeamActionSlots() {
        const inQueue = Boolean(queueEntryId && !partyCode);
        const inParty = Boolean(partyCode);
        const queueBtn = byId('find-team-queue-btn');
        const hostBtn = byId('find-team-host-btn');
        const cancelQueue = byId('find-team-cancel-queue-btn');
        const cancelHost = byId('find-team-cancel-host-btn');
        queueBtn?.classList.toggle('hidden', inQueue);
        cancelQueue?.classList.toggle('hidden', !inQueue);
        hostBtn?.classList.toggle('hidden', inParty);
        cancelHost?.classList.toggle('hidden', !inParty);
    }

    function syncActionButtonState() {
        const busy = isBusyInFindTeam();
        const filtersOk = filtersComplete();
        const queueBtn = byId('find-team-queue-btn');
        const hostBtn = byId('find-team-host-btn');
        const joinBtn = byId('find-team-join-btn');
        const joinInput = byId('find-team-join-code');
        if (queueBtn) queueBtn.disabled = !filtersOk || busy;
        if (hostBtn) hostBtn.disabled = !filtersOk || busy;
        if (joinBtn) joinBtn.disabled = busy;
        if (joinInput) joinInput.disabled = busy;
        syncFindTeamActionSlots();
        syncFilterLockState();
    }

    function showPartyView(view) {
        const idle = byId('find-team-idle');
        const searching = byId('find-team-searching');
        const active = byId('find-team-active');
        idle?.classList.toggle('hidden', view !== 'idle');
        searching?.classList.toggle('hidden', view !== 'searching');
        active?.classList.toggle('hidden', view !== 'party');
    }

    function formatRankLabel(game, rankId, divisionId) {
        const rank = game?.ranks.find((r) => r.id === rankId);
        if (!rank) return '';
        if (!rankUsesDivision(rankId) || !divisionId) return rank.name;
        return `${rank.name} ${divisionId}`;
    }

    function formatPartyMeta(gameId, modeId, rankId, divisionId, rankOptional) {
        const game = gameById(gameId);
        const mode = game?.modes.find((m) => m.id === modeId);
        const rankLabel = rankOptional
            ? 'Rank optional'
            : formatRankLabel(game, rankId, divisionId);
        return [game?.name, mode?.name, rankLabel].filter(Boolean).join(' · ');
    }

    function readParty(code) {
        return readJson(STORAGE_PARTY_PREFIX + code, null);
    }

    function writeParty(code, party) {
        writeJson(STORAGE_PARTY_PREFIX + code, party);
    }

    function readQueue() {
        return readJson(STORAGE_QUEUE, []);
    }

    function writeQueue(entries) {
        writeJson(STORAGE_QUEUE, entries);
    }

    function partyFilterKey(party) {
        return filterKey(
            party.gameId,
            party.modeId,
            party.rankId,
            party.divisionId,
            party.rankOptional,
        );
    }

    function listHostedParties() {
        const parties = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const storageKey = localStorage.key(i);
            if (!storageKey?.startsWith(STORAGE_PARTY_PREFIX)) continue;
            const code = storageKey.slice(STORAGE_PARTY_PREFIX.length);
            const party = readParty(code);
            if (party) parties.push({ code, party });
        }
        return parties;
    }

    function generatePartyCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i += 1) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    function removeFromQueue(memberId) {
        const next = readQueue().filter((e) => e.memberId !== memberId);
        writeQueue(next);
        queueEntryId = null;
    }

    function leavePartyAndQueue() {
        const memberId = getMemberId();
        removeFromQueue(memberId);
        if (partyCode) {
            const code = partyCode;
            const party = readParty(code);
            if (party) {
                const wasHost = party.hostId === memberId;
                party.members = party.members.filter((m) => m.id !== memberId);
                party.messages.push({
                    id: `sys-${Date.now()}`,
                    type: 'system',
                    text: `${getDisplayName()} left the party`,
                    at: Date.now(),
                });
                if (party.members.length === 0) {
                    localStorage.removeItem(STORAGE_PARTY_PREFIX + code);
                } else {
                    if (wasHost) {
                        party.hostId = party.members[0].id;
                        party.messages.push({
                            id: `sys-${Date.now()}-host`,
                            type: 'system',
                            text: `${party.members[0].name} is now the host`,
                            at: Date.now(),
                        });
                    }
                    writeParty(code, party);
                }
            }
            partyCode = null;
        }
        stopPolling();
        showPartyView('idle');
        syncActionButtonState();
    }

    function renderPartyUI(party) {
        if (!party) return;
        showPartyView('party');
        const hostedLabel = party.hosted ? ' · Hosted party' : '';
        byId('find-team-party-meta').textContent = formatPartyMeta(
            party.gameId,
            party.modeId,
            party.rankId,
            party.divisionId,
            party.rankOptional,
        ) + hostedLabel;
        byId('find-team-party-code').textContent = `Party code: ${party.code}`;
        const copyBtn = byId('find-team-copy-code');
        if (copyBtn) {
            copyBtn.classList.toggle('hidden', !party.code);
            copyBtn.dataset.code = party.code || '';
        }
        const lockBtn = byId('find-team-lock-party-btn');
        if (lockBtn) {
            const isHost = party.hostId === getMemberId();
            const showLock = Boolean(party.hosted && isHost);
            lockBtn.classList.toggle('hidden', !showLock);
            if (showLock) {
                const locked = Boolean(party.locked);
                lockBtn.textContent = locked ? 'Unlock party' : 'Lock party';
                lockBtn.setAttribute('aria-pressed', locked ? 'true' : 'false');
                lockBtn.classList.toggle('find-team-lock-party-btn--locked', locked);
            }
        }
        const membersEl = byId('find-team-members');
        if (membersEl) {
            membersEl.innerHTML = party.members.map((m) => {
                const isHost = m.id === party.hostId;
                const hostSuffix = isHost ? ' · Host' : '';
                const hostClass = isHost ? ' find-team-member-pill--host' : '';
                return `<span class="find-team-member-pill${hostClass}">${escapeHtml(m.name)}${hostSuffix}</span>`;
            }).join('');
        }
        const log = byId('find-team-chat-log');
        if (log) {
            log.innerHTML = renderChatLog(party.messages);
            log.scrollTop = log.scrollHeight;
        }
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function chatSenderKey(msg) {
        return msg.memberId || msg.author || '';
    }

    function splitChatLines(text) {
        return String(text || '')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }

    function renderChatLog(messages) {
        const parts = [];
        let index = 0;
        while (index < messages.length) {
            const msg = messages[index];
            if (msg.type === 'system') {
                parts.push(
                    `<p class="find-team-chat-system text-[11px] text-slate-500 tracking-wide text-center">${escapeHtml(msg.text)}</p>`
                );
                index += 1;
                continue;
            }
            const key = chatSenderKey(msg);
            const group = [];
            while (index < messages.length) {
                const current = messages[index];
                if (current.type === 'system' || chatSenderKey(current) !== key) break;
                group.push(current);
                index += 1;
            }
            parts.push(renderChatGroup(group));
        }
        return parts.join('');
    }

    function renderChatGroup(group) {
        if (!group.length) return '';
        const author = group[0].author || 'Player';
        const lines = group.flatMap((entry) => splitChatLines(entry.text));
        if (!lines.length) return '';
        const stack = lines.map((line) => (
            `<p class="find-team-chat-line text-sm text-slate-300 tracking-wide leading-snug">${escapeHtml(line)}</p>`
        )).join('');
        return `
            <div class="find-team-chat-group">
                <span class="find-team-chat-author text-xs font-bold tracking-wide text-redneon-500">${escapeHtml(author)}</span>
                <div class="find-team-chat-stack">${stack}</div>
            </div>`;
    }

    function joinParty(code, party) {
        partyCode = code;
        queueEntryId = null;
        removeFromQueue(getMemberId());
        applyFilterSnapshot(party);
        renderPartyUI(party);
        syncActionButtonState();
        startPolling();
    }

    function createHostedParty() {
        if (!filtersComplete() || isBusyInFindTeam()) return;
        const memberId = getMemberId();
        const displayName = getDisplayName();
        localStorage.setItem(STORAGE_DISPLAY_NAME, displayName);
        removeFromQueue(memberId);
        let code = generatePartyCode();
        while (readParty(code)) code = generatePartyCode();
        const filters = getCurrentFilterSnapshot();
        const party = {
            code,
            gameId: filters.gameId,
            modeId: filters.modeId,
            rankId: filters.rankId,
            divisionId: filters.divisionId || undefined,
            rankOptional: Boolean(filters.rankOptional),
            hosted: true,
            hostId: memberId,
            open: true,
            locked: false,
            createdAt: Date.now(),
            members: [{ id: memberId, name: displayName }],
            messages: [{
                id: `sys-${Date.now()}`,
                type: 'system',
                text: 'Party hosted — share the code so teammates can join',
                at: Date.now(),
            }],
        };
        writeParty(code, party);
        joinParty(code, party);
    }

    function normalizePartyCode(raw) {
        return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function joinPartyByCodeInput() {
        if (isBusyInFindTeam()) return;
        const code = normalizePartyCode(byId('find-team-join-code')?.value);
        if (code.length < 4) {
            showJoinError('Enter a valid party code');
            return;
        }
        const party = readParty(code);
        if (!party) {
            showJoinError('No party found for that code');
            return;
        }
        const memberId = getMemberId();
        const displayName = getDisplayName();
        localStorage.setItem(STORAGE_DISPLAY_NAME, displayName);
        if (party.members.length >= MAX_PARTY_SIZE && !party.members.some((m) => m.id === memberId)) {
            showJoinError('Party is full');
            return;
        }
        removeFromQueue(memberId);
        if (!party.members.some((m) => m.id === memberId)) {
            party.members.push({ id: memberId, name: displayName });
            party.messages.push({
                id: `sys-${Date.now()}`,
                type: 'system',
                text: `${displayName} joined the party`,
                at: Date.now(),
            });
            writeParty(code, party);
        }
        const joinInput = byId('find-team-join-code');
        if (joinInput) joinInput.value = '';
        joinParty(code, party);
    }

    function tryFillHostedPartiesFromQueue(queue) {
        if (!queue.length) return queue;
        const removedIds = new Set();
        const hosted = listHostedParties().filter(({ party }) => (
            party.hosted
            && !party.locked
            && party.members.length < MAX_PARTY_SIZE
        ));

        hosted.forEach(({ code, party }) => {
            const matchKey = partyFilterKey(party);
            queue.forEach((entry) => {
                if (removedIds.has(entry.id)) return;
                if (party.members.length >= MAX_PARTY_SIZE) return;
                if (filterKeyFromEntry(entry) !== matchKey) return;
                if (party.members.some((m) => m.id === entry.memberId)) {
                    removedIds.add(entry.id);
                    return;
                }
                party.members.push({ id: entry.memberId, name: entry.displayName });
                party.messages.push({
                    id: `sys-${Date.now()}-${entry.memberId}`,
                    type: 'system',
                    text: `${entry.displayName} joined from matchmaking`,
                    at: Date.now(),
                });
                removedIds.add(entry.id);
                writeParty(code, party);
            });
        });

        if (!removedIds.size) return queue;
        return queue.filter((entry) => !removedIds.has(entry.id));
    }

    function togglePartyLock() {
        if (!partyCode) return;
        const memberId = getMemberId();
        const party = readParty(partyCode);
        if (!party || !party.hosted || party.hostId !== memberId) return;
        party.locked = !party.locked;
        party.messages.push({
            id: `sys-${Date.now()}-lock`,
            type: 'system',
            text: party.locked
                ? 'Party locked — teammates must join with the party code'
                : 'Party unlocked — matchmaking can fill open slots',
            at: Date.now(),
        });
        writeParty(partyCode, party);
        renderPartyUI(party);
    }

    function tryMatchQueue() {
        let queue = tryFillHostedPartiesFromQueue(readQueue());
        writeQueue(queue);
        const groups = new Map();
        queue.forEach((entry) => {
            const key = filterKeyFromEntry(entry);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(entry);
        });

        groups.forEach((entries, key) => {
            if (entries.length < 2) return;
            const chunk = entries.slice(0, MAX_PARTY_SIZE);
            const { gameId, modeId, rankId, divisionId, rankOptional } = parseFilterKey(key);
            let code = generatePartyCode();
            while (readParty(code)) code = generatePartyCode();
            const party = {
                code,
                gameId,
                modeId,
                rankId,
                divisionId: divisionId || undefined,
                rankOptional: Boolean(rankOptional),
                hosted: false,
                hostId: chunk[0].memberId,
                open: true,
                createdAt: Date.now(),
                members: chunk.map((e) => ({ id: e.memberId, name: e.displayName })),
                messages: [{
                    id: `sys-${Date.now()}`,
                    type: 'system',
                    text: 'Party formed — share in-game usernames in chat',
                    at: Date.now(),
                }],
            };
            writeParty(code, party);
            const memberIds = new Set(chunk.map((e) => e.memberId));
            const remaining = queue.filter((e) => !memberIds.has(e.memberId));
            writeQueue(remaining);
        });
    }

    function refreshFromStorage() {
        const memberId = getMemberId();
        if (partyCode) {
            const party = readParty(partyCode);
            if (!party || !party.members.some((m) => m.id === memberId)) {
                partyCode = null;
                showPartyView('idle');
                syncActionButtonState();
                return;
            }
            applyFilterSnapshot(party);
            renderPartyUI(party);
            return;
        }

        const queue = readQueue();
        const myEntry = queue.find((e) => e.memberId === memberId);
        if (myEntry) {
            queueEntryId = myEntry.id;
            showPartyView('searching');
            applyFilterSnapshot(myEntry);
            byId('find-team-search-summary').textContent = formatPartyMeta(
                myEntry.gameId,
                myEntry.modeId,
                myEntry.rankId,
                myEntry.divisionId,
                myEntry.rankOptional,
            );
            syncActionButtonState();
        }

        for (const key of Object.keys(localStorage)) {
            if (!key.startsWith(STORAGE_PARTY_PREFIX)) continue;
            const code = key.slice(STORAGE_PARTY_PREFIX.length);
            const party = readParty(code);
            if (!party?.members.some((m) => m.id === memberId)) continue;
            joinParty(code, party);
            return;
        }
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(() => {
            tryMatchQueue();
            refreshFromStorage();
        }, MATCH_TICK_MS);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function joinQueue() {
        if (!filtersComplete()) return;
        const memberId = getMemberId();
        const displayName = getDisplayName();
        sessionStorage.setItem(STORAGE_DISPLAY_NAME, displayName);
        const filters = getCurrentFilterSnapshot();
        const entry = {
            id: `q-${Date.now().toString(36)}`,
            memberId,
            displayName,
            gameId: filters.gameId,
            modeId: filters.modeId,
            rankId: filters.rankId,
            divisionId: filters.divisionId,
            rankOptional: Boolean(filters.rankOptional),
            queuedAt: Date.now(),
        };
        queueEntryId = entry.id;
        const queue = readQueue().filter((e) => e.memberId !== memberId);
        queue.push(entry);
        writeQueue(queue);
        showPartyView('searching');
        byId('find-team-search-summary').textContent = formatPartyMeta(
            entry.gameId,
            entry.modeId,
            entry.rankId,
            entry.divisionId,
            entry.rankOptional,
        );
        syncActionButtonState();
        tryMatchQueue();
        refreshFromStorage();
        startPolling();
    }

    function clearPartyChat() {
        if (!partyCode) return;
        const party = readParty(partyCode);
        if (!party) return;
        const memberId = getMemberId();
        if (!party.members.some((m) => m.id === memberId)) return;
        const displayName = getDisplayName();
        party.messages = [{
            id: `sys-${Date.now()}-cleared`,
            type: 'system',
            text: `${displayName} cleared the chat`,
            at: Date.now(),
        }];
        writeParty(partyCode, party);
        renderPartyUI(party);
    }

    function sendChatMessage(text) {
        if (!partyCode || !text.trim()) return;
        const party = readParty(partyCode);
        if (!party) return;
        const memberId = getMemberId();
        if (!party.members.some((m) => m.id === memberId)) return;
        party.messages.push({
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'chat',
            author: getDisplayName(),
            memberId,
            text: text.trim(),
            at: Date.now(),
        });
        writeParty(partyCode, party);
        renderPartyUI(party);
    }

    function bindUi() {
        if (uiBound) return;
        uiBound = true;

        const nameInput = byId('find-team-display-name');
        const savedName = localStorage.getItem(STORAGE_DISPLAY_NAME);
        if (nameInput && savedName) nameInput.value = savedName;
        nameInput?.addEventListener('input', () => {
            localStorage.setItem(STORAGE_DISPLAY_NAME, nameInput.value.trim());
            syncPartyMemberDisplayName();
            syncActionButtonState();
        });

        getRankIncludeButton()?.addEventListener('change', onFindTeamRankIncludeToggle);

        byId('find-team-host-btn')?.addEventListener('click', createHostedParty);
        byId('find-team-queue-btn')?.addEventListener('click', joinQueue);
        byId('find-team-join-btn')?.addEventListener('click', joinPartyByCodeInput);
        byId('find-team-join-code')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                joinPartyByCodeInput();
            }
        });
        byId('find-team-cancel-queue-btn')?.addEventListener('click', leavePartyAndQueue);
        byId('find-team-cancel-host-btn')?.addEventListener('click', leavePartyAndQueue);
        byId('find-team-lock-party-btn')?.addEventListener('click', togglePartyLock);
        byId('find-team-clear-chat-btn')?.addEventListener('click', clearPartyChat);
        byId('find-team-copy-code')?.addEventListener('click', async (event) => {
            event.stopPropagation();
            const code = byId('find-team-copy-code')?.dataset.code || partyCode;
            if (!code) return;
            const notify = () => window.CafeCore?.Toast?.show(`${code} copied`);
            if (navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(code);
                    notify();
                } catch {
                    /* ignore */
                }
            }
        });

        const chatInput = byId('find-team-chat-input');
        byId('find-team-chat-send')?.addEventListener('click', () => {
            sendChatMessage(chatInput?.value || '');
            if (chatInput) chatInput.value = '';
        });
        chatInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                sendChatMessage(chatInput.value || '');
                chatInput.value = '';
            }
        });

        window.addEventListener('storage', (event) => {
            if (!event.key) return;
            if (event.key === STORAGE_QUEUE || event.key?.startsWith(STORAGE_PARTY_PREFIX)) {
                refreshFromStorage();
            }
        });
    }

    function getFindTeamGameCatalog() {
        const catalog = getCatalog();
        const valorant = catalog.filter((game) => game.id === 'valorant');
        return valorant.length ? valorant : catalog.slice(0, 1);
    }

    function resetPicklistMountState() {
        ['find-team-game-pick', 'find-team-mode-pick', 'find-team-rank-pick'].forEach((id) => {
            const root = byId(id);
            if (!root) return;
            delete root.dataset.toolPicklistInit;
        });
        const glide = byId('find-team-division-glide');
        if (glide) delete glide.dataset.glideBound;
    }

    function mountPicklists() {
        if (!picklist) {
            console.error('find-team.js requires __cafeCorePicklist from script.js');
            return;
        }
        picklist.ensureDismiss?.();
        const gamePick = byId('find-team-game-pick');
        const modePick = byId('find-team-mode-pick');
        const rankPick = byId('find-team-rank-pick');
        if (!gamePick || !modePick || !rankPick) return;

        const gameParts = partsFromEntries(getFindTeamGameCatalog());
        if (!gameParts.length) return;

        if (gamePick.dataset.toolPicklistInit !== '1') {
            picklist.init(gamePick, gameParts, {
                onChange: syncDependentPicklists,
                emptyMessage: 'No matching game',
            });
            picklist.init(modePick, [], { onChange: onFindTeamModeChange, emptyMessage: 'No matching mode' });
            picklist.init(rankPick, [], {
                onChange: onFindTeamRankChange,
                emptyMessage: 'No matching rank',
            });
        }

        picklist.setValue(gamePick, gameParts[0]);
        syncDependentPicklists();
        mountDivisionGlide();
        if (pendingFilterSnapshot) applyFilterSnapshot(pendingFilterSnapshot);
    }

    function ensureFindTeamFiltersReady() {
        const gamePick = byId('find-team-game-pick');
        if (!gamePick) return;
        if (!getCatalog().length) {
            if (catalogRetryCount < 8) {
                catalogRetryCount += 1;
                requestAnimationFrame(ensureFindTeamFiltersReady);
            }
            return;
        }
        catalogRetryCount = 0;
        if (gamePick.dataset.toolPicklistInit !== '1') {
            mountPicklists();
        } else {
            syncDependentPicklists();
            mountDivisionGlide();
        }
    }

    window.initFindTeamPage = function initFindTeamPage() {
        bindUi();
        ensureFindTeamFiltersReady();
        refreshFromStorage();
        if (queueEntryId || partyCode) startPolling();
        syncRankOptionalForMode();
        syncActionButtonState();
    };

    window.teardownFindTeamPage = function teardownFindTeamPage() {
        stopPolling();
        resetPicklistMountState();
        rankFilterBootstrapped = false;
        catalogRetryCount = 0;
        pendingFilterSnapshot = null;
        uiBound = false;
    };
})();
