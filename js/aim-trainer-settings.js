(function () {
    'use strict';

    const STORAGE_KEY = 'cafe-aim-trainer-settings';
    const AIM_SECTIONS = ['session', 'game', 'sensitivity', 'target', 'crosshair', 'aspect'];
    const AIM_ASPECTS = Object.freeze(['native', '16:9', '16:10', '5:4', '4:3', '3:2']);
    const AIM_CH_PRESETS = Object.freeze(['#ff0000', '#00ff00', '#0000ff']);
    const AIM_CH_CUSTOM = 'custom';
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
        chcustom: '#ff1e43',
        chcolorcustom: false,
        chlines: true,
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
    let chPickerHsv = hexToHsv(DEFAULTS.chcustom);
    let chPickerDragging = null;

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

    function normalizeHexColor(value, fallback) {
        const raw = String(value ?? '').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.slice(1).toLowerCase()}`;
        if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
            return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
        }
        return fallback;
    }

    function isPresetChColor(color) {
        return AIM_CH_PRESETS.includes(normalizeHexColor(color, ''));
    }

    function clamp01(n) {
        return Math.max(0, Math.min(1, n));
    }

    function hexToHsv(hex) {
        const normalized = normalizeHexColor(hex, DEFAULTS.chcustom);
        const r = parseInt(normalized.slice(1, 3), 16) / 255;
        const g = parseInt(normalized.slice(3, 5), 16) / 255;
        const b = parseInt(normalized.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
        }
        const s = max === 0 ? 0 : d / max;
        return { h, s, v: max };
    }

    function hsvToRgb(h, s, v) {
        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;
        let r = 0;
        let g = 0;
        let b = 0;
        if (h < 60) { r = c; g = x; }
        else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; b = x; }
        else if (h < 240) { g = x; b = c; }
        else if (h < 300) { r = x; b = c; }
        else { r = c; b = x; }
        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255),
        };
    }

    function hsvToHex(h, s, v) {
        const { r, g, b } = hsvToRgb(h, s, v);
        return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    }

    function hueCss(h) {
        const { r, g, b } = hsvToRgb(h, 1, 1);
        return `rgb(${r}, ${g}, ${b})`;
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
        s.chcolor = normalizeHexColor(s.chcolor, DEFAULTS.chcolor);
        s.chcustom = normalizeHexColor(s.chcustom, DEFAULTS.chcustom);
        if (!isPresetChColor(s.chcolor)) s.chcustom = s.chcolor;
        s.chcolorcustom = s.chcolorcustom === true || s.chcolorcustom === 'true' || !isPresetChColor(s.chcolor);
        s.chlines = s.chlines !== false && s.chlines !== 'false';
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

    function isCrosshairSectionActive() {
        return settings.section === 'crosshair';
    }

    function syncChColorUi() {
        const root = byId('aim-trainer-settings-chcolor-glide');
        const glideValue = settings.chcolorcustom ? AIM_CH_CUSTOM : settings.chcolor;
        syncGlide(root, glideValue);
        if (settings.chcolorcustom) {
            chPickerHsv = hexToHsv(settings.chcustom);
            // Custom selected → keep picker open while on the Crosshair tab.
            if (isCrosshairSectionActive()) setChColorPickerOpen(true);
            else updateChColorPickerChrome();
        } else {
            setChColorPickerOpen(false);
        }
    }

    function isChColorPickerOpen() {
        const picker = byId('aim-trainer-chcolor-picker');
        return Boolean(picker && !picker.hidden);
    }

    function setChColorPickerOpen(open) {
        const picker = byId('aim-trainer-chcolor-picker');
        if (!picker) return;
        const wasOpen = !picker.hidden;
        picker.hidden = !open;
        picker.classList.toggle('is-open', open);
        if (open) {
            if (!wasOpen) chPickerHsv = hexToHsv(settings.chcustom || DEFAULTS.chcustom);
            drawChColorSvCanvas();
            updateChColorPickerChrome();
        }
    }

    function openCustomChColorPicker() {
        setChColorPickerOpen(true);
    }

    function applyCustomChColor(value, { openPicker = false } = {}) {
        const hex = normalizeHexColor(value, settings.chcustom || DEFAULTS.chcustom);
        settings.chcolorcustom = true;
        settings.chcustom = hex;
        settings.chcolor = hex;
        chPickerHsv = hexToHsv(hex);
        // Keep picker open whenever Custom is the active glide choice.
        syncChColorUi();
        if (openPicker) setChColorPickerOpen(true);
        notifyChange();
    }

    function commitChPickerHsv({ openPicker = false } = {}) {
        applyCustomChColor(hsvToHex(chPickerHsv.h, chPickerHsv.s, chPickerHsv.v), { openPicker });
    }

    function drawChColorSvCanvas() {
        const canvas = byId('aim-trainer-chcolor-sv-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        const hue = hueCss(chPickerHsv.h);
        ctx.clearRect(0, 0, w, h);
        const sat = ctx.createLinearGradient(0, 0, w, 0);
        sat.addColorStop(0, '#ffffff');
        sat.addColorStop(1, hue);
        ctx.fillStyle = sat;
        ctx.fillRect(0, 0, w, h);
        const val = ctx.createLinearGradient(0, 0, 0, h);
        val.addColorStop(0, 'rgba(0, 0, 0, 0)');
        val.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.fillStyle = val;
        ctx.fillRect(0, 0, w, h);
    }

    function updateChColorPickerChrome() {
        const hex = hsvToHex(chPickerHsv.h, chPickerHsv.s, chPickerHsv.v);
        const preview = byId('aim-trainer-chcolor-preview');
        const hexInput = byId('aim-trainer-chcolor-hex');
        const svThumb = byId('aim-trainer-chcolor-sv-thumb');
        const hueThumb = byId('aim-trainer-chcolor-hue-thumb');
        const hueTrack = byId('aim-trainer-chcolor-hue');
        if (preview) preview.style.backgroundColor = hex;
        if (hexInput && document.activeElement !== hexInput) hexInput.value = hex.toUpperCase();
        if (svThumb) {
            svThumb.style.left = `${clamp01(chPickerHsv.s) * 100}%`;
            svThumb.style.top = `${(1 - clamp01(chPickerHsv.v)) * 100}%`;
        }
        if (hueThumb) hueThumb.style.left = `${(chPickerHsv.h / 360) * 100}%`;
        if (hueTrack) hueTrack.style.setProperty('--aim-ch-hue', hueCss(chPickerHsv.h));
    }

    function setChPickerFromSvPointer(clientX, clientY) {
        const sv = byId('aim-trainer-chcolor-sv');
        if (!sv) return;
        const rect = sv.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        chPickerHsv.s = clamp01((clientX - rect.left) / rect.width);
        chPickerHsv.v = clamp01(1 - ((clientY - rect.top) / rect.height));
        updateChColorPickerChrome();
        commitChPickerHsv();
    }

    function setChPickerFromHuePointer(clientX) {
        const hue = byId('aim-trainer-chcolor-hue');
        if (!hue) return;
        const rect = hue.getBoundingClientRect();
        if (!rect.width) return;
        chPickerHsv.h = clamp01((clientX - rect.left) / rect.width) * 360;
        drawChColorSvCanvas();
        updateChColorPickerChrome();
        commitChPickerHsv();
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
        if (active === 'crosshair') {
            drawCrosshairPreview();
            if (settings.chcolorcustom) setChColorPickerOpen(true);
        } else {
            setChColorPickerOpen(false);
        }
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
        syncChColorUi();
        syncGlide(byId('aim-trainer-settings-chlines-glide'), settings.chlines ? 'true' : 'false');
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
        crosshair.classList.toggle('has-lines', settings.chlines);
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
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = PREVIEW_BG_COLORS[previewBgIndex] || PREVIEW_BG_COLORS[0];
        ctx.fillRect(0, 0, w, h);
        const cx = Math.round(w / 2);
        const cy = Math.round(h / 2);
        const s = settings.chsize;
        const g = settings.chgap;
        const t = settings.chthick;
        const outline = settings.choutline;
        const color = settings.chcolor;
        const rects = [];
        if (settings.chlines) {
            rects.push(
                [cx - Math.floor(t / 2), cy - g - s, t, s],
                [cx + g, cy - Math.floor(t / 2), s, t],
                [cx - Math.floor(t / 2), cy + g, t, s],
                [cx - g - s, cy - Math.floor(t / 2), s, t],
            );
        }
        // Crisp 1px outline: paint a black expanded shape, then the color on top.
        if (outline) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
            rects.forEach(([x, y, rw, rh]) => ctx.fillRect(x - 1, y - 1, rw + 2, rh + 2));
        }
        ctx.fillStyle = color;
        rects.forEach(([x, y, rw, rh]) => ctx.fillRect(x, y, rw, rh));

        if (settings.chdot) {
            const size = Math.max(1, t);
            const x = cx - Math.floor(size / 2);
            const y = cy - Math.floor(size / 2);
            if (outline) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
                ctx.fillRect(x - 1, y - 1, size + 2, size + 2);
            }
            ctx.fillStyle = color;
            ctx.fillRect(x, y, size, size);
        }
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

    function bindChColorControls() {
        const root = byId('aim-trainer-settings-chcolor-glide');
        const picker = byId('aim-trainer-chcolor-picker');
        const sv = byId('aim-trainer-chcolor-sv');
        const hue = byId('aim-trainer-chcolor-hue');
        const hexInput = byId('aim-trainer-chcolor-hex');

        if (root && root.dataset.aimChcolorBound !== '1') {
            root.dataset.aimChcolorBound = '1';
            if (typeof initGlideSelectorRoot === 'function' && root.dataset.glideBound !== '1') {
                initGlideSelectorRoot(root, {
                    valueKey: 'aimChcolor',
                    onChange: () => {
                        const value = root.dataset.value;
                        if (value === AIM_CH_CUSTOM) {
                            applyCustomChColor(settings.chcustom, { openPicker: true });
                            return;
                        }
                        settings.chcolorcustom = false;
                        settings.chcolor = normalizeHexColor(value, DEFAULTS.chcolor);
                        setChColorPickerOpen(false);
                        syncChColorUi();
                        notifyChange();
                    },
                });
            }
            const customBtn = root.querySelector('[data-aim-chcolor="custom"]');
            if (customBtn && customBtn.dataset.aimCustomBound !== '1') {
                customBtn.dataset.aimCustomBound = '1';
                customBtn.addEventListener('click', () => {
                    if (root.dataset.value !== AIM_CH_CUSTOM) return;
                    openCustomChColorPicker();
                });
            }
        }

        if (picker && picker.dataset.aimChcolorPickerBound !== '1') {
            picker.dataset.aimChcolorPickerBound = '1';

            const onPointerMove = (event) => {
                if (!chPickerDragging) return;
                if (chPickerDragging === 'sv') setChPickerFromSvPointer(event.clientX, event.clientY);
                else if (chPickerDragging === 'hue') setChPickerFromHuePointer(event.clientX);
            };
            const onPointerUp = () => {
                chPickerDragging = null;
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
            };

            if (sv) {
                sv.addEventListener('pointerdown', (event) => {
                    event.preventDefault();
                    chPickerDragging = 'sv';
                    setChPickerFromSvPointer(event.clientX, event.clientY);
                    window.addEventListener('pointermove', onPointerMove);
                    window.addEventListener('pointerup', onPointerUp);
                });
            }
            if (hue) {
                hue.addEventListener('pointerdown', (event) => {
                    event.preventDefault();
                    chPickerDragging = 'hue';
                    setChPickerFromHuePointer(event.clientX);
                    window.addEventListener('pointermove', onPointerMove);
                    window.addEventListener('pointerup', onPointerUp);
                });
            }
            if (hexInput) {
                const commitHex = () => {
                    const next = normalizeHexColor(hexInput.value, settings.chcustom);
                    hexInput.value = next.toUpperCase();
                    applyCustomChColor(next, { openPicker: true });
                };
                hexInput.addEventListener('change', commitHex);
                hexInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commitHex();
                    }
                });
            }
        }
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
        bindChColorControls();
        bindGlide(byId('aim-trainer-settings-chlines-glide'), 'aimChlines', (value) => {
            settings.chlines = value === 'true';
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
            setChColorPickerOpen(false);
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
