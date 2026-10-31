(function () {
    'use strict';

    const STORAGE_KEY = 'cafe-aim-trainer-settings';
    const AIM_SECTIONS = ['session', 'game', 'sensitivity', 'target', 'crosshair', 'aspect'];
    const AIM_ASPECTS = Object.freeze(['native', '16:9', '16:10', '5:4', '4:3', '3:2']);
    const AIM_CH_THICK_MIN = 2;
    const AIM_CH_THICK_MAX = 6;

    const DEFAULTS = Object.freeze({
        section: 'session',
        game: 'Valorant',
        timer: 30,
        sens: 1,
        dpi: 800,
        spread: 'balanced',
        tsize: 'medium',
        tcolor: 'yellow',
        chcolor: '#00ff00',
        chdot: true,
        choutline: false,
        chsize: 10,
        chgap: 4,
        chthick: 2,
        aspect: 'native',
    });

    /** Preview backdrop colors so the crosshair can be checked on dark / mid / light. */
    const PREVIEW_BG_COLORS = Object.freeze(['#0a0a0c', '#6b7280', '#e5e7eb']);

    let settings = loadSettings();
    let changeListeners = [];
    let settingsModalCloseTimer = null;
    let closeSettingsModalFn = null;
    let previewBgIndex = 0;

    function settingsModalCloseDelayMs() {
        if (typeof isReducedMotionEnabled === 'function' && isReducedMotionEnabled()) return 0;
        if (typeof MOTION_MS === 'number') return MOTION_MS;
        return 300;
    }

    function portalSettingsModal(modal) {
        if (!modal || modal.parentElement === document.body) return;
        document.body.appendChild(modal);
    }

    function restoreSettingsModalToPage(modal) {
        if (!modal) return;
        const hub = byId('aim-trainer-hub');
        if (!hub || modal.parentElement === hub) return;
        hub.appendChild(modal);
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function parsePositive(value, fallback) {
        const n = Number(String(value ?? '').replace(',', '.'));
        return Number.isFinite(n) && n > 0 ? n : fallback;
    }

    function loadSettings() {
        const s = { ...DEFAULTS };
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) Object.assign(s, JSON.parse(raw));
        } catch {
            /* ignore */
        }
        s.sens = parsePositive(s.sens, DEFAULTS.sens);
        s.dpi = parsePositive(s.dpi, DEFAULTS.dpi);
        if (!AIM_SECTIONS.includes(s.section)) s.section = DEFAULTS.section;
        s.spread = DEFAULTS.spread;
        s.tsize = DEFAULTS.tsize;
        if (!['blue', 'red', 'yellow', 'purple'].includes(s.tcolor)) s.tcolor = DEFAULTS.tcolor;
        const timers = [15, 30, 60, 0];
        if (!timers.includes(Number(s.timer))) s.timer = DEFAULTS.timer;
        else s.timer = Number(s.timer);
        s.chdot = s.chdot === true || s.chdot === 'true';
        s.choutline = s.choutline === true || s.choutline === 'true';
        s.chsize = Math.min(30, Math.max(2, Math.round(Number(s.chsize) || DEFAULTS.chsize)));
        s.chgap = Math.min(20, Math.max(0, Math.round(Number(s.chgap) || DEFAULTS.chgap)));
        s.chthick = Math.min(AIM_CH_THICK_MAX, Math.max(AIM_CH_THICK_MIN, Math.round(Number(s.chthick) || DEFAULTS.chthick)));
        if (!AIM_ASPECTS.includes(s.aspect)) s.aspect = DEFAULTS.aspect;
        const catalog = getGamesCatalog();
        if (catalog.length && !catalog.some((g) => g.name === s.game)) s.game = DEFAULTS.game;
        return s;
    }

    function saveSettings() {
        try {
            const { section, ...rest } = settings;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
        } catch {
            /* ignore */
        }
    }

    function notifyChange() {
        saveSettings();
        applyCrosshairStyles();
        drawCrosshairPreview();
        changeListeners.forEach((fn) => {
            try { fn(settings); } catch { /* ignore */ }
        });
    }

    function getGamesCatalog() {
        if (typeof SENS_GAMES_CATALOG !== 'undefined' && Array.isArray(SENS_GAMES_CATALOG)) {
            return SENS_GAMES_CATALOG;
        }
        return [];
    }

    function syncGlide(root, value, { fromIndex } = {}) {
        if (!root || value == null) return;
        root.dataset.value = String(value);
        if (typeof syncGlideSelector === 'function') syncGlideSelector(root, { fromIndex });
    }

    function syncAimTrainerTabGlider({ instant = false, fromIndex } = {}) {
        const row = byId('aim-trainer-settings-tab-row');
        const glider = byId('aim-trainer-settings-tab-glider');
        if (typeof syncVerticalTabGlider === 'function') {
            syncVerticalTabGlider(row, glider, { instant, fromIndex });
            return;
        }
        const activeBtn = row?.querySelector('.settings-tab-btn.active');
        if (!row || !glider || !activeBtn) return;
        const reduceMotion = typeof isReducedMotionEnabled === 'function' && isReducedMotionEnabled();
        if (instant || reduceMotion) row.classList.add('is-instant');
        glider.style.top = `${activeBtn.offsetTop}px`;
        glider.style.height = `${activeBtn.offsetHeight}px`;
        if (instant || reduceMotion) {
            requestAnimationFrame(() => row.classList.remove('is-instant'));
        }
    }

    function syncSectionTabs(active, { instant = false, fromIndex } = {}) {
        document.querySelectorAll('#aim-trainer-settings-tab-row .settings-tab-btn[data-aim-section]').forEach((btn) => {
            const selected = btn.dataset.aimSection === active;
            btn.classList.toggle('active', selected);
            btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
        syncAimTrainerTabGlider({ instant, fromIndex });
    }

    function showSettingsSection(name, { skipTabSync = false, instant = false, fromIndex } = {}) {
        const active = AIM_SECTIONS.includes(name) ? name : DEFAULTS.section;
        settings.section = active;
        document.querySelectorAll('[data-aim-settings-section]').forEach((el) => {
            const on = el.dataset.aimSettingsSection === active;
            el.classList.toggle('hidden', !on);
            el.hidden = !on;
        });
        if (!skipTabSync) syncSectionTabs(active, { instant, fromIndex });
        else syncAimTrainerTabGlider({ instant, fromIndex });
        const previewRail = byId('aim-trainer-chpreview-rail');
        if (previewRail) {
            const showPreview = active === 'crosshair';
            previewRail.hidden = !showPreview;
            previewRail.setAttribute('aria-hidden', showPreview ? 'false' : 'true');
        }
        if (active === 'crosshair') drawCrosshairPreview();
    }

    function syncAimRangeFill(input) {
        if (!input) return;
        const wrap = input.closest('.aim-trainer-range-wrap');
        if (!wrap) return;
        const min = Number(input.min);
        const max = Number(input.max);
        const value = Number(input.value);
        const span = max - min;
        const ratio = span > 0 ? (value - min) / span : 0;
        wrap.style.setProperty('--aim-range-ratio', String(Math.max(0, Math.min(1, ratio))));
    }

    function syncRangeUi() {
        const size = byId('aim-trainer-ch-size');
        const gap = byId('aim-trainer-ch-gap');
        const thick = byId('aim-trainer-ch-thick');
        if (size) size.value = String(settings.chsize);
        if (gap) gap.value = String(settings.chgap);
        if (thick) thick.value = String(settings.chthick);
        const sizeVal = byId('aim-trainer-ch-size-val');
        const gapVal = byId('aim-trainer-ch-gap-val');
        const thickVal = byId('aim-trainer-ch-thick-val');
        if (sizeVal) sizeVal.textContent = String(settings.chsize);
        if (gapVal) gapVal.textContent = String(settings.chgap);
        if (thickVal) thickVal.textContent = String(settings.chthick);
        syncAimRangeFill(size);
        syncAimRangeFill(gap);
        syncAimRangeFill(thick);
    }

    function syncSettingsToUi() {
        syncGlide(byId('aim-trainer-settings-timer-glide'), String(settings.timer));
        syncGlide(byId('aim-trainer-settings-tcolor-glide'), settings.tcolor);
        syncGlide(byId('aim-trainer-settings-chcolor-glide'), settings.chcolor);
        syncGlide(byId('aim-trainer-settings-chdot-glide'), settings.chdot ? 'true' : 'false');
        syncGlide(byId('aim-trainer-settings-choutline-glide'), settings.choutline ? 'true' : 'false');
        syncGlide(byId('aim-trainer-settings-aspect-glide'), settings.aspect);
        syncRangeUi();

        const sensInput = byId('aim-trainer-settings-sens');
        const dpiInput = byId('aim-trainer-settings-dpi');
        if (sensInput) sensInput.value = String(settings.sens);
        if (dpiInput) dpiInput.value = String(settings.dpi);

        syncGamePicklistDisplay();
        showSettingsSection(settings.section, { instant: true });
        applyCrosshairStyles();
        drawCrosshairPreview();
    }

    function applyCrosshairStyles() {
        const crosshair = byId('aim-trainer-crosshair');
        if (!crosshair) return;
        crosshair.style.setProperty('--ch-color', settings.chcolor);
        crosshair.style.setProperty('--ch-size', `${settings.chsize}px`);
        crosshair.style.setProperty('--ch-gap', `${settings.chgap}px`);
        crosshair.style.setProperty('--ch-thick', `${settings.chthick}px`);
        crosshair.classList.toggle('has-dot', settings.chdot);
        crosshair.classList.toggle('has-outline', settings.choutline);
    }

    function cyclePreviewBackground(delta) {
        const count = PREVIEW_BG_COLORS.length;
        previewBgIndex = ((previewBgIndex + delta) % count + count) % count;
        drawCrosshairPreview();
    }

    function drawCrosshairPreview() {
        const canvas = byId('aim-trainer-crosshair-preview');
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || 140;
        const h = canvas.clientHeight || 140;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = PREVIEW_BG_COLORS[previewBgIndex] || PREVIEW_BG_COLORS[0];
        ctx.fillRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;
        const s = settings.chsize;
        const g = settings.chgap;
        const t = settings.chthick;
        const rects = [
            [cx - t / 2, cy - g - s, t, s],
            [cx + g, cy - t / 2, s, t],
            [cx - t / 2, cy + g, t, s],
            [cx - g - s, cy - t / 2, s, t],
        ];
        if (settings.chdot) rects.push([cx - t * 0.65, cy - t * 0.65, t * 1.3, t * 1.3]);
        if (settings.choutline) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.lineWidth = 1;
            rects.forEach((r) => ctx.strokeRect(r[0] - 0.5, r[1] - 0.5, r[2] + 1, r[3] + 1));
        }
        ctx.fillStyle = settings.chcolor;
        rects.forEach((r) => ctx.fillRect(r[0], r[1], r[2], r[3]));
    }

    function syncGamePicklistDisplay() {
        const root = byId('aim-trainer-settings-game-pick');
        if (!root) return;
        const catalog = getGamesCatalog();
        const parts = catalog.map((g) => ({ id: g.name, name: g.name }));
        const part = parts.find((p) => p.id === settings.game) || parts[0];
        if (part && typeof setToolPicklistValue === 'function') {
            setToolPicklistValue(root, part);
            settings.game = part.id;
        }
    }

    function initGamePicklist() {
        const root = byId('aim-trainer-settings-game-pick');
        if (!root) return;
        const catalog = getGamesCatalog();
        if (!catalog.length || typeof initToolPicklist !== 'function') return;

        const parts = catalog.map((g) => ({ id: g.name, name: g.name }));
        const onChange = () => {
            settings.game = root.dataset.value || DEFAULTS.game;
            notifyChange();
        };

        if (root.dataset.toolPicklistInit === '1') {
            root._picklistParts = parts;
            if (typeof renderToolPicklistMenu === 'function') {
                renderToolPicklistMenu(root, parts, root._picklistEmptyMessage || 'No matching game');
            }
            if (typeof bindToolPicklistMenuOptions === 'function') {
                bindToolPicklistMenuOptions(root, parts, onChange);
            }
            root._picklistOnChange = onChange;
        } else {
            initToolPicklist(root, parts, {
                emptyMessage: 'No matching game',
                onChange,
            });
            root.dataset.aimGamePickBound = '1';
        }
        syncGamePicklistDisplay();
    }

    function bindGlide(root, valueKey, apply, { persist = true } = {}) {
        if (!root || typeof initGlideSelectorRoot !== 'function') return;
        if (root.dataset.glideBound === '1') return;
        initGlideSelectorRoot(root, {
            valueKey,
            onChange: () => {
                apply(root.dataset.value);
                if (persist) notifyChange();
            },
        });
    }

    function bindSensInputs() {
        const sensInput = byId('aim-trainer-settings-sens');
        const dpiInput = byId('aim-trainer-settings-dpi');
        const applySens = (input, key, fallback) => {
            if (!input || input.dataset.aimSensBound === '1') return;
            input.dataset.aimSensBound = '1';
            const commit = () => {
                settings[key] = parsePositive(input.value, fallback);
                input.value = String(settings[key]);
                notifyChange();
            };
            input.addEventListener('change', commit);
            input.addEventListener('blur', commit);
        };
        applySens(sensInput, 'sens', DEFAULTS.sens);
        applySens(dpiInput, 'dpi', DEFAULTS.dpi);
    }

    function bindCrosshairRanges() {
        const bindRange = (id, key, min, max) => {
            const input = byId(id);
            if (!input || input.dataset.aimRangeBound === '1') return;
            input.dataset.aimRangeBound = '1';
            input.addEventListener('input', () => {
                settings[key] = Math.min(max, Math.max(min, Math.round(Number(input.value) || min)));
                syncRangeUi();
                notifyChange();
            });
        };
        bindRange('aim-trainer-ch-size', 'chsize', 2, 30);
        bindRange('aim-trainer-ch-gap', 'chgap', 0, 20);
        bindRange('aim-trainer-ch-thick', 'chthick', AIM_CH_THICK_MIN, AIM_CH_THICK_MAX);
    }

    function bindModal() {
        const modal = byId('aim-trainer-settings-modal');
        if (!modal || modal.dataset.aimSettingsModalBound === '1') return;
        modal.dataset.aimSettingsModalBound = '1';
        const openBtn = byId('aim-trainer-settings-open');
        const closeBtn = byId('aim-trainer-settings-close');
        const backdrop = byId('aim-trainer-settings-backdrop');

        const tabRow = byId('aim-trainer-settings-tab-row');
        if (tabRow && tabRow.dataset.aimTabsBound !== '1') {
            tabRow.dataset.aimTabsBound = '1';
            tabRow.querySelectorAll('.settings-tab-btn[data-aim-section]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    if (btn.classList.contains('active')) return;
                    const fromIndex = parseInt(tabRow.dataset.glideIndex ?? '0', 10);
                    showSettingsSection(btn.dataset.aimSection, { fromIndex });
                });
            });
            window.addEventListener('resize', () => syncAimTrainerTabGlider({ instant: true }));
        }
        bindGlide(byId('aim-trainer-settings-timer-glide'), 'aimTimer', (value) => {
            settings.timer = Number(value);
        });
        bindGlide(byId('aim-trainer-settings-tcolor-glide'), 'aimTcolor', (value) => {
            settings.tcolor = value;
        });
        bindGlide(byId('aim-trainer-settings-chcolor-glide'), 'aimChcolor', (value) => {
            settings.chcolor = value;
        });
        bindGlide(byId('aim-trainer-settings-chdot-glide'), 'aimChdot', (value) => {
            settings.chdot = value === 'true';
        });
        bindGlide(byId('aim-trainer-settings-choutline-glide'), 'aimChoutline', (value) => {
            settings.choutline = value === 'true';
        });
        bindGlide(byId('aim-trainer-settings-aspect-glide'), 'aimAspect', (value) => {
            settings.aspect = AIM_ASPECTS.includes(value) ? value : DEFAULTS.aspect;
        });
        bindSensInputs();
        bindCrosshairRanges();

        const prevBgBtn = byId('aim-trainer-chpreview-prev');
        const nextBgBtn = byId('aim-trainer-chpreview-next');
        if (prevBgBtn && prevBgBtn.dataset.aimPreviewBgBound !== '1') {
            prevBgBtn.dataset.aimPreviewBgBound = '1';
            prevBgBtn.addEventListener('click', () => cyclePreviewBackground(-1));
        }
        if (nextBgBtn && nextBgBtn.dataset.aimPreviewBgBound !== '1') {
            nextBgBtn.dataset.aimPreviewBgBound = '1';
            nextBgBtn.addEventListener('click', () => cyclePreviewBackground(1));
        }

        const open = () => {
            if (!modal) return;
            clearTimeout(settingsModalCloseTimer);
            settingsModalCloseTimer = null;
            portalSettingsModal(modal);
            initGamePicklist();
            syncSettingsToUi();
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('settings-modal-open');
            if (typeof isReducedMotionEnabled !== 'function' || !isReducedMotionEnabled()) void modal.offsetHeight;
            modal.classList.add('is-open');
            openBtn?.setAttribute('aria-expanded', 'true');
            closeBtn?.focus();
            requestAnimationFrame(() => {
                syncAimTrainerTabGlider({ instant: true });
                if (typeof syncGlideSelector !== 'function') return;
                document.querySelectorAll('#aim-trainer-settings-modal .glide-selector').forEach((root) => {
                    syncGlideSelector(root);
                });
            });
        };

        const close = () => {
            if (!modal) return;
            clearTimeout(settingsModalCloseTimer);
            settingsModalCloseTimer = null;
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('settings-modal-open');
            openBtn?.setAttribute('aria-expanded', 'false');
            if (typeof closeAllToolPicklists === 'function') closeAllToolPicklists();
            const closeDelay = settingsModalCloseDelayMs();
            settingsModalCloseTimer = setTimeout(() => {
                modal.classList.add('hidden');
                settingsModalCloseTimer = null;
            }, closeDelay);
        };

        closeSettingsModalFn = close;

        openBtn?.addEventListener('click', open);
        closeBtn?.addEventListener('click', close);
        backdrop?.addEventListener('click', close);
        modal?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });

        portalSettingsModal(modal);
        syncSettingsToUi();
    }

    function teardownSettingsModal() {
        if (typeof closeSettingsModalFn === 'function') closeSettingsModalFn();
        clearTimeout(settingsModalCloseTimer);
        settingsModalCloseTimer = null;
        restoreSettingsModalToPage(byId('aim-trainer-settings-modal'));
    }

    window.AimTrainerSettings = Object.freeze({
        get: () => settings,
        applyCrosshairStyles,
        onChange(fn) {
            if (typeof fn === 'function') changeListeners.push(fn);
        },
        init() {
            bindModal();
            initGamePicklist();
            applyCrosshairStyles();
            drawCrosshairPreview();
        },
        reloadFromStorage() {
            settings = loadSettings();
            syncSettingsToUi();
        },
        teardown: teardownSettingsModal,
        close() {
            if (typeof closeSettingsModalFn === 'function') closeSettingsModalFn();
        },
    });
})();
