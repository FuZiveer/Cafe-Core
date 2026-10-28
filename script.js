const { Motion: CoreMotion, Storage: CoreStorage, freeze: coreFreeze } = window.CafeCore;
const MOTION_MS = CoreMotion.MS;
const MOTION_DURATION = CoreMotion.duration;
const MOTION_EASE = CoreMotion.EASE;
const motionTransition = (properties) => CoreMotion.transition(properties);
const MOTION_TRANSITION = CoreMotion.standardTransition;
const INDICATOR_LAYOUT_TRANSITION = CoreMotion.indicatorLayoutTransition;
let indicatorAnimToken = 0;

const TIPS_AND_TRICKS_PAGE_ENABLED = window.CafeCore.Features.tipsAndTricksPage;

const STRATS_FLYOUT_ITEMS = [
    { id: 'strat-tips', name: 'Tips & tricks', icon: 'fa-lightbulb' },
];

const flyoutData = coreFreeze({
    tools: {
        title: 'Tools Menu',
        items: [
            { id: 'tool-sens', name: 'Sensitivity Converter', icon: 'fa-bolt' },
            { id: 'tool-edpi', name: 'EDPI Calculator', icon: 'fa-calculator' },
            { id: 'tool-aim', name: 'Aim Trainer', icon: 'fa-crosshairs' },
            { id: 'tool-bottleneck', name: 'Bottleneck Checker', icon: 'fa-microchip' },
            { id: 'tool-notes', name: 'Note Creator', icon: 'fa-pen-to-square' }
        ]
    },
    strats: {
        title: 'Strats Menu',
        items: STRATS_FLYOUT_ITEMS,
    },
    more: {
        title: 'More Menu',
        items: [
            { id: 'more-connect', name: 'Connect', icon: 'fa-envelope', href: 'mailto:svitserk.morningstar@gmail.com' },
            { id: 'more-discord', name: 'Discord', icon: 'fa-discord', iconFamily: 'fa-brands', href: 'https://discord.gg/3r2sMRq4Jy' },
            { id: 'more-branding', name: 'Branding', icon: 'fa-paintbrush' },
            { id: 'more-fuziveer', name: 'FuZiveer', icon: 'fa-user' },
        ]
    }
});

const topBarLabels = coreFreeze({
    home: 'Home',
    apps: 'Apps',
    tools: 'Tools',
    strats: 'Strats',
    more: 'More',
});

let activeFlyoutType = null;
let activeFlyoutParentBtn = null;
let selectedSidebarBtn = null;
let selectedFlyoutItem = null;
let isCollapsed = false;

const brandColors = [
    { name: 'Raven', hex: '#0a0a0c', usage: 'App background' },
    { name: 'Cursed Black', hex: '#121215', usage: 'Sidebar, header, panels' },
    { name: 'Gluon Grey', hex: '#1a1a1e', usage: 'Borders, hover surfaces' },
    { name: 'Closed Shutter', hex: '#26262b', usage: 'Strong borders, controls' },
    { name: 'Future Fuchsia', hex: '#ff1e43', usage: 'Primary accent' },
    { name: 'Spanish Red', hex: '#e60026', usage: 'Accent pressed / darker' },
    { name: 'Bellflower Blue', hex: '#e2e8f0', usage: 'Body text' },
    { name: 'Blue Blouse', hex: '#94a3b8', usage: 'Secondary text, icons' },
];

const BRAND_LOGO_SRC = 'images/Caf%C3%A9%20Core.png';
const BRAND_LOGO_FALLBACK = '';

const brandLogoBackgrounds = [
    { name: 'Raven', hex: '#0a0a0c' },
    { name: 'Cursed Black', hex: '#121215' },
    { name: 'Blue Blouse', hex: '#94a3b8' },
];

const appsCatalog = [
    {
        id: 'resolution-switcher',
        name: 'Resolution Switcher',
        icon: 'fa-display',
        status: 'In Developement',
        summary: 'Instantly swap display modes with a single hotkey.',
        features: [
            'Toggle between a native resolution and a stretched resolution you choose',
            'Pick both targets once — switch in-game without digging through Windows settings',
            'Global hotkey works on the desktop and in full-screen games',
        ],
    },
    {
        id: 'color-manager',
        name: 'Color Manager',
        icon: 'fa-palette',
        status: 'In development',
        summary: 'Full control over how your display looks — per game, with every slider that matters in one place.',
        features: [
            'Set color management individually for each game — own profiles, own look',
            'Gamma, brightness, contrast, vibrance, hue, and more in one panel',
            'Fine-tune the full range of desktop color options, not a single knob',
        ],
    },
    {
        id: 'pc-optimizer',
        name: 'PC Optimizer',
        icon: 'fa-gauge-high',
        status: 'In development',
        summary: 'Tune your system for stable frames and lower input lag.',
        features: [
            'Guided tweaks for gaming-focused Windows performance',
            'Clear before/after view of what each change affects',
            'Built for players who want speed without breaking their setup',
        ],
    },
];

const mainPageIds = coreFreeze({
    default: 'page-default',
    apps: 'page-apps',
    branding: 'page-branding',
    fuziveer: 'page-fuziveer',
    privacy: 'page-privacy-policy',
    terms: 'page-terms-of-service',
    notes: 'page-notes',
    bottleneck: 'page-bottleneck',
    sensitivity: 'page-sensitivity',
    edpi: 'page-edpi',
    lineups: 'page-lineups',
});

window.mainPageIds = mainPageIds;

function normalizeMainPageKey(pageKey) {
    if (pageKey === 'lineups' && !TIPS_AND_TRICKS_PAGE_ENABLED) return 'default';
    return pageKey in mainPageIds ? pageKey : 'default';
}

const SENS_GAME_BY_ID = new Map();

function getSensGamesCatalog() {
    return typeof SENS_GAMES_CATALOG !== 'undefined' && Array.isArray(SENS_GAMES_CATALOG)
        ? SENS_GAMES_CATALOG
        : [];
}

function buildSensGamePicklistParts() {
    SENS_GAME_BY_ID.clear();
    return getSensGamesCatalog().map((game, index) => {
        const id = `sens-game-${index}`;
        SENS_GAME_BY_ID.set(id, game);
        return { id, name: game.name, score: 0 };
    });
}

function getSensGameFromPick(root) {
    if (!root) return null;
    const catalog = getSensGamesCatalog();
    const input = root.querySelector('.tool-picklist-input');
    const selected = root.dataset.value ? SENS_GAME_BY_ID.get(root.dataset.value) : null;
    return bnResolvePart(catalog, input && input.value, selected);
}

function picklistPartForSensGame(game) {
    if (!game) return null;
    const catalog = getSensGamesCatalog();
    const index = catalog.findIndex((entry) => entry === game || entry.name === game.name);
    if (index < 0) return null;
    return { id: `sens-game-${index}`, name: game.name, score: 0 };
}

function setSensPicklistGame(root, game, fallbackText) {
    if (!root) return;
    const part = picklistPartForSensGame(game);
    if (part) {
        setToolPicklistValue(root, part);
        return;
    }
    const input = root.querySelector('.tool-picklist-input');
    root.dataset.value = '';
    if (input) input.value = fallbackText || '';
    root.querySelectorAll('.tool-picklist-option').forEach((btn) => {
        btn.classList.remove('is-selected');
        btn.setAttribute('aria-selected', 'false');
    });
}

function swapSensitivityGamesAndDpi() {
    closeAllToolPicklists();

    const fromPick = document.getElementById('sens-from-pick');
    const toPick = document.getElementById('sens-to-pick');
    const valueInput = document.getElementById('sens-from-value');
    const fromDpiInput = document.getElementById('sens-from-dpi');
    const toDpiInput = document.getElementById('sens-to-dpi');
    if (!fromPick || !toPick) return;

    const from = getSensGameFromPick(fromPick);
    const to = getSensGameFromPick(toPick);
    const sens = parseDecimalInput(valueInput && valueInput.value);
    const fromDpiNum = Math.max(1, parseFloat(fromDpiInput && fromDpiInput.value) || 0);
    const toDpiNum = Math.max(1, parseFloat(toDpiInput && toDpiInput.value) || 0);

    let swappedSens = null;
    if (from && to && Number.isFinite(sens) && sens > 0 && fromDpiNum > 0 && toDpiNum > 0) {
        let raw = convertSensitivity(sens, from, to, fromDpiNum, toDpiNum);
        if (raw != null && Number.isFinite(raw)) {
            if (raw < 0 && raw > -1e-9) raw = 0;
            if (raw >= 0) swappedSens = snapToSensStep(raw, to.sens && to.sens.step);
        }
    }

    const nextFrom = to;
    const nextTo = from;
    const fromText = fromPick.querySelector('.tool-picklist-input')?.value || '';
    const toText = toPick.querySelector('.tool-picklist-input')?.value || '';
    const fromDpi = fromDpiInput ? fromDpiInput.value : '';
    const toDpi = toDpiInput ? toDpiInput.value : '';

    setSensPicklistGame(fromPick, nextFrom, toText);
    setSensPicklistGame(toPick, nextTo, fromText);

    if (fromDpiInput) fromDpiInput.value = toDpi;
    if (toDpiInput) toDpiInput.value = fromDpi;

    if (valueInput && swappedSens != null && Number.isFinite(swappedSens) && to) {
        valueInput.value = formatConvertedSensitivity(swappedSens, to);
    }

    updateSensitivityConversion();
}

function initToolPicklistDismiss() {
    if (window.__toolPicklistDismissBound) return;
    document.addEventListener('click', (event) => {
        if (event.target.closest('.tool-picklist')) return;
        closeAllToolPicklists();
    });
    window.__toolPicklistDismissBound = true;
}

const BOTTLENECK_PARTS_URL = 'data/bottleneck-parts.json';

let bottleneckCpus = [];
let bottleneckGpus = [];

function normalizeBottleneckPartsList(parts) {
    if (!Array.isArray(parts)) return [];
    return parts
        .filter((p) => p && p.id && p.name)
        .map((p) => ({
            id: String(p.id),
            name: String(p.name).trim(),
            score: Math.round(Number(p.score) || 50),
        }));
}

async function fetchBottleneckParts() {
    const response = await fetch(BOTTLENECK_PARTS_URL);
    if (!response.ok) {
        throw new Error(`Failed to load bottleneck parts (${response.status})`);
    }
    const data = await response.json();
    return {
        cpus: normalizeBottleneckPartsList(data.cpus),
        gpus: normalizeBottleneckPartsList(data.gpus),
    };
}

function setBottleneckPartsLoading(loading) {
    ['bottleneck-cpu-input', 'bottleneck-gpu-input'].forEach((inputId) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        if (loading) {
            if (!input.dataset.savedPlaceholder) {
                input.dataset.savedPlaceholder = input.placeholder || '';
            }
            input.placeholder = 'Loading…';
            input.readOnly = true;
            input.classList.add('tool-picklist-input--loading');
        } else {
            input.placeholder = input.dataset.savedPlaceholder || input.placeholder;
            input.readOnly = false;
            input.classList.remove('tool-picklist-input--loading');
        }
    });
}

function mountBottleneckPicklist(root, parts, emptyMessage) {
    if (!root) return;
    const onChange = () => updateBottleneckChart();
    if (root.dataset.toolPicklistInit === '1') {
        const prev = root.dataset.value || '';
        const selectedId = parts.some((p) => p.id === prev) ? prev : '';
        updateToolPicklistOptions(root, parts, selectedId);
        return;
    }
    initToolPicklist(root, parts, { onChange, emptyMessage });
}

function mountBottleneckPicklists() {
    mountBottleneckPicklist(
        document.getElementById('bottleneck-cpu-pick'),
        bottleneckCpus,
        "Couldn't find that CPU",
    );
    mountBottleneckPicklist(
        document.getElementById('bottleneck-gpu-pick'),
        bottleneckGpus,
        "Couldn't find that GPU",
    );
}

function getWebGLRendererString() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl')
            || canvas.getContext('experimental-webgl');
        if (!gl) return '';

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            if (renderer) return String(renderer).trim();
        }
        const fallback = gl.getParameter(gl.RENDERER);
        return fallback ? String(fallback).trim() : '';
    } catch {
        return '';
    }
}

function normalizeBottleneckGpuDetectText(text) {
    return String(text ?? '')
        .toLowerCase()
        .replace(/\(tm\)|\(r\)/gi, '')
        .replace(/\b(nvidia|geforce|amd|radeon|intel|graphics|direct3d|direct3d11|vs_5_0|ps_5_0|opengl|vulkan|angle|d3d11|microsoft|basic|render|driver|llvmpipe|swiftshader)\b/gi, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function matchBottleneckGpuFromRenderer(renderer, gpus) {
    if (!renderer || !Array.isArray(gpus) || !gpus.length) return null;

    const rendererNorm = normalizeBottleneckGpuDetectText(renderer);
    if (!rendererNorm) return null;

    let best = null;
    let bestScore = 0;

    const consider = (gpu, label) => {
        const norm = normalizeBottleneckGpuDetectText(label);
        if (!norm || norm.length < 3) return;
        if (!rendererNorm.includes(norm)) return;
        const score = norm.length;
        if (score > bestScore) {
            best = gpu;
            bestScore = score;
        }
    };

    gpus.forEach((gpu) => {
        consider(gpu, gpu.name);
        consider(gpu, gpu.id.replace(/-/g, ' '));
    });

    return best;
}

function selectBottleneckGpuPart(part) {
    const gpuPick = document.getElementById('bottleneck-gpu-pick');
    if (!gpuPick || !part) return false;
    setToolPicklistValue(gpuPick, part);
    filterToolPicklistOptions(gpuPick, '');
    closeAllToolPicklists();
    if (typeof gpuPick._picklistOnChange === 'function') gpuPick._picklistOnChange();
    return true;
}

function initBottleneckHardwareDetect() {
    const btn = document.getElementById('bottleneck-detect-gpu-btn');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', () => {
        if (!bottleneckGpus.length) return;

        const renderer = getWebGLRendererString();
        if (!renderer) return;

        const part = matchBottleneckGpuFromRenderer(renderer, bottleneckGpus);
        if (part) selectBottleneckGpuPart(part);
    });
}

let currentMainPageKey = 'default';
let mainPageAnimToken = 0;
let mainPageTransitionHandler = null;

function resetMainPageMotion(pageEl) {
    if (!pageEl) return;
    pageEl.classList.remove('main-page-exit', 'main-page-enter-prep');
}

function applyMainPageInstant(nextPage) {
    mainPageAnimToken += 1;
    document.querySelectorAll('.main-page').forEach((el) => {
        if (mainPageTransitionHandler) {
            el.removeEventListener('transitionend', mainPageTransitionHandler);
        }
        resetMainPageMotion(el);
        el.classList.remove('main-page-active');
    });
    mainPageTransitionHandler = null;
    nextPage.classList.add('main-page-active');
}

function waitForMainPageExit(prevPage, token) {
    return new Promise((resolve) => {
        const onExitEnd = (e) => {
            if (token !== mainPageAnimToken) return;
            if (e && e.propertyName !== 'transform') return;
            prevPage.removeEventListener('transitionend', onExitEnd);
            if (mainPageTransitionHandler === onExitEnd) {
                mainPageTransitionHandler = null;
            }
            resolve();
        };
        mainPageTransitionHandler = onExitEnd;
        prevPage.addEventListener('transitionend', onExitEnd);
        setTimeout(() => {
            if (token !== mainPageAnimToken) return;
            if (mainPageTransitionHandler !== onExitEnd) return;
            onExitEnd({ propertyName: 'transform' });
        }, motionTimeoutMs(MOTION_MS + 40));
    });
}

function revealMainPage(prevPage, nextPage, nextKey, token) {
    if (token !== mainPageAnimToken) return;
    resetMainPageMotion(nextPage);
    prevPage.classList.remove('main-page-active', 'main-page-exit');
    nextPage.classList.add('main-page-active', 'main-page-enter-prep');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (token !== mainPageAnimToken) return;
            nextPage.classList.remove('main-page-enter-prep');
        });
    });
    currentMainPageKey = nextKey;
    if (window.pageLoader) window.pageLoader.syncLocationHash(nextKey);
    syncPlaceholderPageView(nextKey);
    if (nextKey === 'default') initHomeFeatureCardTilt();
}

async function animateDefaultPageInPlace() {
    const page = document.getElementById('page-default');
    if (!page || !page.classList.contains('main-page-active')) {
        syncDefaultPageView();
        initHomeFeatureCardTilt();
        return;
    }
    if (isReducedMotionEnabled()) {
        syncDefaultPageView();
        initHomeFeatureCardTilt();
        return;
    }

    mainPageAnimToken += 1;
    const token = mainPageAnimToken;

    if (mainPageTransitionHandler) {
        page.removeEventListener('transitionend', mainPageTransitionHandler);
        mainPageTransitionHandler = null;
    }

    resetMainPageMotion(page);
    void page.offsetHeight;
    page.classList.add('main-page-exit');
    await waitForMainPageExit(page, token);
    if (token !== mainPageAnimToken) return;

    syncDefaultPageView();
    resetMainPageMotion(page);
    page.classList.remove('main-page-exit');
    page.classList.add('main-page-enter-prep');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (token !== mainPageAnimToken) return;
            page.classList.remove('main-page-enter-prep');
        });
    });
    initHomeFeatureCardTilt();
}

let mainPageNavQueue = Promise.resolve();

function setMainPage(pageKey, options = {}) {
    mainPageNavQueue = mainPageNavQueue
        .then(() => setMainPageInternal(normalizeMainPageKey(pageKey), options))
        .catch((error) => console.error('Main page navigation failed:', error));
    return mainPageNavQueue;
}

async function setMainPageInternal(pageKey, options = {}) {
    const nextKey = normalizeMainPageKey(pageKey);
    if (nextKey === currentMainPageKey && document.getElementById(mainPageIds[nextKey])) {
        const defaultStubToHub = nextKey === 'default'
            && (options.defaultStubToHub || isDefaultPageShowingStub());
        if (defaultStubToHub) {
            await animateDefaultPageInPlace();
            if (window.pageLoader) window.pageLoader.syncLocationHash(nextKey);
        } else {
            syncPlaceholderPageView(nextKey);
            if (nextKey === 'default') initHomeFeatureCardTilt();
        }
        return;
    }

    if (!window.pageLoader) {
        console.error('page-loader.js must load before script.js');
        return;
    }

    const prevKey = currentMainPageKey;
    const prevPage = document.querySelector('.main-page.main-page-active')
        || document.getElementById(mainPageIds[prevKey]);

    if (prevKey === 'default' && nextKey !== 'default') {
        destroyHomeFeatureCardTilt();
    }

    const mountPromise = window.pageLoader.mountMainPageElement(nextKey);

    if (isReducedMotionEnabled() || !prevPage) {
        const nextPage = await mountPromise;
        if (!nextPage) return;
        applyMainPageInstant(nextPage);
        currentMainPageKey = nextKey;
        window.pageLoader.syncLocationHash(nextKey);
        syncPlaceholderPageView(nextKey);
        if (nextKey === 'default') initHomeFeatureCardTilt();
        return;
    }

    mainPageAnimToken += 1;
    const token = mainPageAnimToken;

    if (mainPageTransitionHandler && prevPage) {
        prevPage.removeEventListener('transitionend', mainPageTransitionHandler);
        mainPageTransitionHandler = null;
    }

    resetMainPageMotion(prevPage);
    void prevPage.offsetHeight;
    prevPage.classList.add('main-page-exit');

    const exitPromise = waitForMainPageExit(prevPage, token);
    const nextPage = await mountPromise;
    if (!nextPage) return;

    if (prevPage === nextPage) {
        resetMainPageMotion(prevPage);
        prevPage.classList.remove('main-page-exit');
        currentMainPageKey = nextKey;
        window.pageLoader.syncLocationHash(nextKey);
        syncPlaceholderPageView(nextKey);
        if (nextKey === 'default') initHomeFeatureCardTilt();
        return;
    }

    resetMainPageMotion(nextPage);
    await exitPromise;
    revealMainPage(prevPage, nextPage, nextKey, token);
}

const mainPageInitOnce = new Set();

window.clearMainPageInitState = function clearMainPageInitState(pageKey) {
    mainPageInitOnce.delete(pageKey);
    if (pageKey === 'sensitivity') window.__sensitivityConverterMounted = false;
    if (pageKey === 'edpi') window.__edpiCalculatorMounted = false;
    if (pageKey === 'bottleneck') window.__bottleneckPicklistsMounted = false;
};

function destroyHomeFeatureCardTilt() {
    const root = document.getElementById('page-default');
    if (!root) return;
    root.querySelectorAll('.home-feature-card').forEach((card) => {
        if (card.vanillaTilt && typeof card.vanillaTilt.destroy === 'function') {
            card.vanillaTilt.destroy();
        }
    });
}

let vanillaTiltLoadPromise = null;

function ensureVanillaTiltScript() {
    if (typeof window.VanillaTilt !== 'undefined') return Promise.resolve();
    if (vanillaTiltLoadPromise) return vanillaTiltLoadPromise;
    vanillaTiltLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'vanilla-tilt.js';
        script.onload = () => resolve();
        script.onerror = () => {
            vanillaTiltLoadPromise = null;
            reject(new Error('Failed to load vanilla-tilt.js'));
        };
        document.body.appendChild(script);
    });
    return vanillaTiltLoadPromise;
}

function initHomeFeatureCardTilt() {
    void ensureVanillaTiltScript().then(() => {
        if (typeof window.VanillaTilt === 'undefined') return;

        const root = document.getElementById('page-default');
        if (!root) return;

        if (isReducedMotionEnabled()) {
            destroyHomeFeatureCardTilt();
            return;
        }

        const cards = root.querySelectorAll('.home-feature-card');
        window.VanillaTilt.init(cards, {
            max: 5,
            reverse: true,
            speed: MOTION_MS,
            easing: MOTION_EASE,
            perspective: 900,
            scale: 1,
            transition: true,
            reset: true,
            glare: true,
            'max-glare': 0.2,
            gyroscope: false,
        });
    }).catch(() => {});
}

window.initMainPage = async function initMainPage(pageKey) {
    if (mainPageInitOnce.has(pageKey)) return;
    mainPageInitOnce.add(pageKey);

    switch (pageKey) {
        case 'apps':
            renderAppsCatalog();
            break;
        case 'branding':
            renderBrandColorList();
            renderBrandLogoList();
            break;
        case 'bottleneck':
            await initBottleneckChecker();
            break;
        case 'sensitivity':
            initSensitivityConverter();
            break;
        case 'edpi':
            initEdpiCalculator();
            break;
        case 'lineups':
            initLineupsPage();
            break;
        case 'default':
            syncDefaultPageView();
            initHomeFeatureCardTilt();
            applyEmptyPageNavDisabledState(document.getElementById('page-default') || document);
            break;
        default:
            break;
    }
};

function mainPageKeyForFlyoutItem(itemId) {
    if (itemId === 'more-branding') return 'branding';
    if (itemId === 'more-fuziveer') return 'fuziveer';
    if (itemId === 'more-privacy-policy') return 'privacy';
    if (itemId === 'more-terms-of-service') return 'terms';
    if (itemId === 'tool-notes') return 'notes';
    if (itemId === 'tool-bottleneck') return 'bottleneck';
    if (itemId === 'tool-sens') return 'sensitivity';
    if (itemId === 'tool-edpi') return 'edpi';
    if (itemId === 'strat-tips' || itemId === 'strat-lineups') {
        return TIPS_AND_TRICKS_PAGE_ENABLED ? 'lineups' : 'default';
    }
    return 'default';
}

function isFlyoutItemNavDisabled(itemId) {
    if (itemId === 'tool-notes' || itemId === 'tool-aim') return true;
    if ((itemId === 'strat-tips' || itemId === 'strat-lineups') && !TIPS_AND_TRICKS_PAGE_ENABLED) {
        return true;
    }
    return false;
}

function isMainPageNavDisabled(pageKey) {
    if (pageKey === 'notes') return true;
    if (pageKey === 'lineups' && !TIPS_AND_TRICKS_PAGE_ENABLED) return true;
    return false;
}

function setNavControlDisabled(control, disabled) {
    if (!control || control.tagName !== 'BUTTON') return;
    control.disabled = disabled;
    control.classList.toggle('is-nav-disabled', disabled);
    control.setAttribute('aria-disabled', disabled ? 'true' : 'false');
}

function applyEmptyPageNavDisabledState(root = document) {
    root.querySelectorAll('[data-nav-flyout]').forEach((control) => {
        const itemId = control.getAttribute('data-nav-flyout');
        if (!itemId) return;
        setNavControlDisabled(control, isFlyoutItemNavDisabled(itemId));
        if (!control.classList.contains('home-feature-card')) return;
        const badge = control.querySelector('.home-badge');
        if (!badge) return;
        if (isFlyoutItemNavDisabled(itemId)) {
            badge.className = 'home-badge home-badge--soon';
            badge.textContent = 'coming soon';
        } else if (itemId === 'strat-tips') {
            badge.className = 'home-badge home-badge--live';
            badge.textContent = 'Functional';
        }
    });
    root.querySelectorAll('[data-nav-page]').forEach((control) => {
        const pageKey = control.getAttribute('data-nav-page');
        if (!pageKey) return;
        setNavControlDisabled(control, isMainPageNavDisabled(pageKey));
    });
}

const mainPageKeyToFlyoutItemId = {
    edpi: 'tool-edpi',
    sensitivity: 'tool-sens',
    bottleneck: 'tool-bottleneck',
    notes: 'tool-notes',
    branding: 'more-branding',
    fuziveer: 'more-fuziveer',
    privacy: 'more-privacy-policy',
    terms: 'more-terms-of-service',
    lineups: 'strat-tips',
};

const flyoutNavExtras = {
    'more-privacy-policy': {
        flyoutType: 'more',
        name: 'Privacy Policy',
        iconFamily: 'fa-solid',
        icon: 'fa-shield-halved',
    },
    'more-terms-of-service': {
        flyoutType: 'more',
        name: 'Terms of Service',
        iconFamily: 'fa-solid',
        icon: 'fa-list',
    },
};

function findNavBtnForSidebarTab(tabType) {
    if (tabType === 'home') return document.getElementById('btn-home');
    if (tabType === 'more') return document.getElementById('btn-more');
    const buttons = document.querySelectorAll('.nav-btn');
    for (const btn of buttons) {
        const onClick = btn.getAttribute('onclick') || '';
        if (onClick.includes(`'${tabType}'`)) return btn;
    }
    return null;
}

function findFlyoutItemDefinition(itemId) {
    for (const [flyoutType, menu] of Object.entries(flyoutData)) {
        const item = menu.items.find((entry) => entry.id === itemId);
        if (item) return { flyoutType, item };
    }
    const extra = flyoutNavExtras[itemId];
    if (extra) return { flyoutType: extra.flyoutType, item: extra };
    return null;
}

function resolveComingSoonLabel(pageKey) {
    if (pageKey === 'notes') return 'Note Creator';
    if (pageKey !== 'default') return null;
    if (selectedFlyoutItem) {
        const found = findFlyoutItemDefinition(selectedFlyoutItem);
        if (found?.item?.name) return found.item.name;
    }
    return 'Home';
}

function updateComingSoonMessage(pageKey) {
    const label = resolveComingSoonLabel(pageKey);
    if (!label) return;
    const pageId = mainPageIds[pageKey];
    if (!pageId) return;
    const el = document.querySelector(`#${pageId} [data-coming-soon-label]`);
    if (el) el.textContent = `${label} coming soon`;
}

function isDefaultPageStubView() {
    return Boolean(
        selectedFlyoutItem
        && mainPageKeyForFlyoutItem(selectedFlyoutItem) === 'default'
    );
}

function isDefaultPageShowingStub() {
    const page = document.getElementById('page-default');
    if (!page || !page.classList.contains('main-page-active')) return false;
    const soonWrap = page.querySelector('[data-home-coming-soon]');
    return Boolean(soonWrap && !soonWrap.classList.contains('hidden'));
}

function syncDefaultPageView() {
    const page = document.getElementById('page-default');
    if (!page) return;
    const hub = page.querySelector('[data-home-hub]');
    const soonWrap = page.querySelector('[data-home-coming-soon]');
    const stub = isDefaultPageStubView();
    if (hub) hub.classList.toggle('hidden', stub);
    if (soonWrap) soonWrap.classList.toggle('hidden', !stub);
    page.classList.toggle('main-page-viewport-fill', stub);
    page.classList.toggle('main-page-coming-soon', stub);
    if (stub) updateComingSoonMessage('default');
}

function syncPlaceholderPageView(pageKey) {
    if (pageKey === 'default') syncDefaultPageView();
    else if (pageKey === 'notes') updateComingSoonMessage('notes');
}

function navigateToMainPage(pageKey) {
    pageKey = normalizeMainPageKey(pageKey);
    if (isMainPageNavDisabled(pageKey)) return;
    if (!(pageKey in mainPageIds)) return;
    closeFlyout();
    closeMobileNav();
    const defaultStubToHub = pageKey === 'default'
        && currentMainPageKey === 'default'
        && isDefaultPageStubView();
    if (pageKey === 'default') selectedFlyoutItem = null;
    setMainPage(pageKey, { defaultStubToHub }).then(() => {
        syncNavUiForMainPage(pageKey, { animate: true });
        if (!defaultStubToHub) syncPlaceholderPageView(pageKey);
    });
}

function navigateToFlyoutItem(itemId) {
    if (isFlyoutItemNavDisabled(itemId)) return;
    const found = findFlyoutItemDefinition(itemId);
    if (!found) return;
    selectedFlyoutItem = itemId;
    closeFlyout();

    const parentBtn = findNavBtnForSidebarTab(found.flyoutType);
    setSidebarNavActive(parentBtn, { animate: true });
    setTopBarTitle(found.item.name, {
        animate: true,
        iconClasses: getFlyoutItemIconClasses(found.item),
    });

    const pageKey = mainPageKeyForFlyoutItem(itemId);
    setMainPage(pageKey).then(() => syncPlaceholderPageView(pageKey));
    closeMobileNav();
}

window.navigateToMainPage = navigateToMainPage;
window.navigateToFlyoutItem = navigateToFlyoutItem;

function getFlyoutItemIconClasses(item) {
    if (!item) return 'fa-solid fa-house';
    const family = item.iconFamily || 'fa-solid';
    return `${family} ${item.icon}`.trim();
}

function setSidebarNavActive(clickedBtn, { animate = false } = {}) {
    if (!clickedBtn) return;
    const prevSelectedBtn = selectedSidebarBtn;

    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.classList.remove('text-redneon-500', 'active-tab');
        btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-matte-800');
        const icon = btn.querySelector('i');
        if (icon) icon.classList.remove('text-redneon-500');
    });

    updateIndicator(clickedBtn, { fromEl: prevSelectedBtn, animate });
    selectedSidebarBtn = clickedBtn;

    clickedBtn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-matte-800');
    clickedBtn.classList.add('text-redneon-500', 'active-tab');
    const activeIcon = clickedBtn.querySelector('i');
    if (activeIcon) activeIcon.classList.add('text-redneon-500');
}

function syncNavUiForMainPage(pageKey, { animate = false } = {}) {
    if (pageKey === 'default') {
        selectedFlyoutItem = null;
        const homeBtn = document.getElementById('btn-home');
        setSidebarNavActive(homeBtn, { animate });
        setTopBarTitle(topBarLabels.home, {
            animate,
            iconClasses: getTopBarIconClassesFromEl(homeBtn),
        });
        return;
    }

    if (pageKey === 'apps') {
        selectedFlyoutItem = null;
        const appsBtn = findNavBtnForSidebarTab('apps');
        setSidebarNavActive(appsBtn, { animate });
        setTopBarTitle(topBarLabels.apps, {
            animate,
            iconClasses: getTopBarIconClassesFromEl(appsBtn),
        });
        return;
    }

    const flyoutItemId = mainPageKeyToFlyoutItemId[pageKey];
    if (!flyoutItemId) return;

    const found = findFlyoutItemDefinition(flyoutItemId);
    if (!found) return;

    selectedFlyoutItem = flyoutItemId;
    const parentBtn = findNavBtnForSidebarTab(found.flyoutType);
    setSidebarNavActive(parentBtn, { animate });
    setTopBarTitle(found.item.name, {
        animate,
        iconClasses: getFlyoutItemIconClasses(found.item),
    });
}

const BottleneckModel = (() => {
    const RESOLUTION_WEIGHTS = coreFreeze({
        '1080p': coreFreeze({ cpu: 0.6, gpu: 0.4, label: '1080p' }),
        '1440p': coreFreeze({ cpu: 0.4, gpu: 0.6, label: '1440p' }),
        '2160p': coreFreeze({ cpu: 0.2, gpu: 0.8, label: '4K' }),
    });
    const BALANCED_THRESHOLD_PCT = 10;
    const SEVERITY_CAP = 50;
    const SEVERITY_SCALE = 1.5;

    const resolveWeights = (resolutionKey = '1080p') =>
        RESOLUTION_WEIGHTS[resolutionKey] ?? RESOLUTION_WEIGHTS['1080p'];

    const scaledSeverity = (absScoreDiff, limitSideWeight) =>
        Math.min(Math.round(absScoreDiff * limitSideWeight * SEVERITY_SCALE), SEVERITY_CAP);

    const compute = (cpuScore, gpuScore, resolutionKey = '1080p') => {
        const { cpu: wCpu, gpu: wGpu, label } = resolveWeights(resolutionKey);
        const scoreDiff = cpuScore - gpuScore;
        const absDiff = Math.abs(scoreDiff);
        const cpuIsWeaker = scoreDiff < 0;
        const limitWeight = cpuIsWeaker ? wCpu : wGpu;
        const bottleneckPct = scaledSeverity(absDiff, limitWeight);

        let limitSide = 'balanced';
        if (bottleneckPct > BALANCED_THRESHOLD_PCT) {
            limitSide = cpuIsWeaker ? 'cpu' : 'gpu';
        }

        let cpuPct = 0;
        let gpuPct = 0;
        if (limitSide === 'cpu') cpuPct = bottleneckPct;
        else if (limitSide === 'gpu') gpuPct = bottleneckPct;

        const cpuWeightLabel = Math.round(wCpu * 100);
        const gpuWeightLabel = Math.round(wGpu * 100);
        let summary;
        if (limitSide === 'balanced') {
            summary = `Well balanced at ${label} (CPU weight ${cpuWeightLabel}% / GPU weight ${gpuWeightLabel}%).`;
        } else if (limitSide === 'cpu') {
            summary = `The CPU is limiting performance by about ${bottleneckPct}% at ${label}.`;
        } else {
            summary = `The GPU is limiting performance by about ${bottleneckPct}% at ${label}.`;
        }

        return {
            cpuPct,
            gpuPct,
            bottleneckPct,
            limitSide,
            summary,
            weights: { cpu: wCpu, gpu: wGpu },
        };
    };

    return coreFreeze({
        RESOLUTION_WEIGHTS,
        BALANCED_THRESHOLD_PCT,
        resolveWeights,
        scaledSeverity,
        compute,
    });
})();

const BOTTLENECK_RESOLUTION_WEIGHTS = BottleneckModel.RESOLUTION_WEIGHTS;
const BOTTLENECK_BALANCED_PCT = BottleneckModel.BALANCED_THRESHOLD_PCT;

function getBottleneckResolutionKey() {
    const glide = document.getElementById('bottleneck-resolution-glide');
    const value = glide?.dataset.value || '1080p';
    return value in BOTTLENECK_RESOLUTION_WEIGHTS ? value : '1080p';
}

function getBottleneckResolutionWeights(resolutionKey = '1080p') {
    return BottleneckModel.resolveWeights(resolutionKey);
}

function scaledBottleneckSeverity(absScoreDiff, limitSideWeight) {
    return BottleneckModel.scaledSeverity(absScoreDiff, limitSideWeight);
}

function calculateBottleneck(cpuScore, gpuScore, resolutionKey = '1080p') {
    return BottleneckModel.compute(cpuScore, gpuScore, resolutionKey);
}

const BOTTLENECK_BALANCE_TARGET_RATIO = 1;

function findBottleneckUpgradePart(parts, current, targetScore) {
    if (!current || !Array.isArray(parts) || !parts.length) return null;
    const minScore = Math.max(current.score + 1, targetScore);
    let best = null;
    for (const part of parts) {
        if (part.id === current.id) continue;
        if (part.score < minScore) continue;
        if (!best || part.score < best.score) best = part;
    }
    return best;
}

function getBottleneckPairingRecommendation(cpu, gpu, bottleneckResult) {
    const { label } = getBottleneckResolutionWeights(getBottleneckResolutionKey());
    const limitSide = bottleneckResult?.limitSide || 'balanced';

    if (limitSide === 'cpu') {
        const targetCpuScore = Math.ceil(gpu.score * BOTTLENECK_BALANCE_TARGET_RATIO);
        const upgrade = findBottleneckUpgradePart(bottleneckCpus, cpu, targetCpuScore);
        if (upgrade) {
            return {
                kind: 'Suggested CPU',
                name: upgrade.name,
                detail: `Pairs closer to your ${gpu.name} at ${label}. A stronger CPU should reduce the CPU-side limit shown in the estimate.`,
            };
        }
        return {
            kind: 'Suggested CPU',
            name: 'No upgrade found',
            detail: 'We could not find a higher-tier CPU in the catalog that better matches this GPU.',
        };
    }

    if (limitSide === 'gpu') {
        const targetGpuScore = Math.ceil(cpu.score / BOTTLENECK_BALANCE_TARGET_RATIO);
        const upgrade = findBottleneckUpgradePart(bottleneckGpus, gpu, targetGpuScore);
        if (upgrade) {
            return {
                kind: 'Suggested GPU',
                name: upgrade.name,
                detail: `Pairs closer to your ${cpu.name} at ${label}. A stronger GPU should reduce the GPU-side limit shown in the estimate.`,
            };
        }
        return {
            kind: 'Suggested GPU',
            name: 'No upgrade found',
            detail: 'We could not find a higher-tier GPU in the catalog that better matches this CPU.',
        };
    }

    return {
        kind: 'Balanced',
        name: 'No change needed',
        detail: `Your CPU and GPU look well matched for gaming at ${label}.`,
    };
}

function updateBottleneckRecommendation(cpu, gpu, bottleneckResult) {
    const kindEl = document.getElementById('bottleneck-recommend-kind');
    const nameEl = document.getElementById('bottleneck-recommend-name');
    const detailEl = document.getElementById('bottleneck-recommend-detail');
    if (!kindEl || !nameEl || !detailEl) return;

    if (!cpu || !gpu) {
        kindEl.textContent = '—';
        nameEl.textContent = '—';
        detailEl.textContent = 'Select a CPU and GPU to get a part that pairs better with the weaker side of your build.';
        return;
    }

    const rec = getBottleneckPairingRecommendation(cpu, gpu, bottleneckResult);
    kindEl.textContent = rec.kind;
    nameEl.textContent = rec.name;
    detailEl.textContent = rec.detail;
}

let glideSelectorAnimToken = 0;

function getGlideThumbStepPx(track) {
    const thumb = track.querySelector('.glide-selector-thumb');
    if (!thumb) return 0;
    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
    return thumb.offsetWidth + gap;
}

function finishManualGlide(track, thumb, toIndex) {
    if (!track) return;
    track.classList.remove('glide-selector-track--manual-thumb');
    if (thumb) {
        thumb.style.transition = '';
        thumb.style.transform = '';
    }
    track.style.setProperty('--glide-index', String(toIndex));
}

function animateGlideCross(track, thumb, fromIndex, toIndex, count) {
    const token = ++glideSelectorAnimToken;
    const step = getGlideThumbStepPx(track);
    if (!step) {
        track.style.setProperty('--glide-index', String(toIndex));
        return;
    }

    const transition = `transform ${MOTION_MS}ms ${MOTION_EASE}`;
    const fromX = fromIndex * step;
    const toX = toIndex * step;
    const exitLeft = toIndex > fromIndex;
    const exitX = exitLeft ? -step : count * step;
    const enterX = exitLeft ? count * step : -step;

    track.classList.add('glide-selector-track--manual-thumb');
    thumb.style.transition = 'none';
    thumb.style.transform = `translateX(${fromX}px)`;
    void thumb.offsetHeight;
    thumb.style.transition = transition;
    thumb.style.transform = `translateX(${exitX}px)`;

    const onExitEnd = (e) => {
        if (e.propertyName !== 'transform') return;
        if (token !== glideSelectorAnimToken) return;
        thumb.removeEventListener('transitionend', onExitEnd);

        thumb.style.transition = 'none';
        thumb.style.transform = `translateX(${enterX}px)`;
        void thumb.offsetHeight;

        requestAnimationFrame(() => {
            if (token !== glideSelectorAnimToken) return;
            thumb.style.transition = transition;
            thumb.style.transform = `translateX(${toX}px)`;

            const onEnterEnd = (e2) => {
                if (e2.propertyName !== 'transform') return;
                if (token !== glideSelectorAnimToken) return;
                thumb.removeEventListener('transitionend', onEnterEnd);
                finishManualGlide(track, thumb, toIndex);
            };
            thumb.addEventListener('transitionend', onEnterEnd);
        });
    };
    thumb.addEventListener('transitionend', onExitEnd);
}

function applyGlideSelection(root, activeIndex, options) {
    options.forEach((btn, index) => {
        const selected = index === activeIndex;
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    const active = options[activeIndex];
    if (active) root.dataset.value = active.dataset.resolution || root.dataset.value;
    root.dataset.glideIndex = String(activeIndex);
}

function syncGlideSelector(root, { fromIndex } = {}) {
    if (!root) return;
    const track = root.querySelector('.glide-selector-track');
    const thumb = track?.querySelector('.glide-selector-thumb');
    const options = [...root.querySelectorAll('.glide-selector-option')];
    if (!track || !options.length) return;

    const activeValue = root.dataset.value || options[0].dataset.resolution;
    let activeIndex = options.findIndex((btn) => btn.dataset.resolution === activeValue);
    if (activeIndex < 0) activeIndex = 0;

    track.style.setProperty('--glide-count', String(options.length));

    const prevIndex = fromIndex ?? parseInt(root.dataset.glideIndex ?? String(activeIndex), 10);
    applyGlideSelection(root, activeIndex, options);

    const skipJump = Math.abs(activeIndex - prevIndex) > 1;
    if (skipJump && !isReducedMotionEnabled() && thumb && prevIndex !== activeIndex) {
        animateGlideCross(track, thumb, prevIndex, activeIndex, options.length);
        return;
    }

    if (prevIndex !== activeIndex) glideSelectorAnimToken += 1;
    finishManualGlide(track, thumb, activeIndex);
}

function initBottleneckResolutionGlide() {
    const root = document.getElementById('bottleneck-resolution-glide');
    if (!root || root.dataset.glideBound === '1') return;
    root.dataset.glideBound = '1';

    syncGlideSelector(root);

    root.querySelectorAll('.glide-selector-option').forEach((btn) => {
        btn.addEventListener('click', () => {
            const prevIndex = parseInt(root.dataset.glideIndex ?? '0', 10);
            root.dataset.value = btn.dataset.resolution || '1080p';
            syncGlideSelector(root, { fromIndex: prevIndex });
            updateBottleneckChart();
        });
    });
}

const LINEUPS_DEFAULT_GAME = 'siege';
const LINEUPS_FILTER_ALL_VALUE = 'all';
const LINEUPS_DIFFICULTY_MIN = 1;
const LINEUPS_DIFFICULTY_MAX = 5;
const LINEUPS_DIFFICULTY_LEGACY = { easy: 2, medium: 3, hard: 4 };

const LINEUPS_SIEGE_MAPS = [
    'Bank',
    'Bartlett University',
    'Border',
    'Calypso Casino',
    'Chalet',
    'Close Quarter',
    'Clubhouse',
    'Coastline',
    'Consulate',
    'District',
    'Emerald Plains',
    'Favela',
    'Fort Truth',
    'Fortress',
    'Hereford Base',
    'House',
    'Kafe Dostoyevsky',
    'Kanal',
    'Lair',
    'Neighborhood',
    'Nighthaven Labs',
    'Oregon',
    'Outback',
    'Presidential Plane',
    'Skyscraper',
    'Stadium Alpha',
    'Stadium Bravo',
    'Theme Park',
    'Tower',
    'Villa',
    'Yacht',
];

const LINEUPS_VIDEO_LIBRARY = {
    siege: [],
};

const LINEUPS_REQUIREMENT_ROWS = [
    { key: 'map', label: 'Map', icon: 'fa-map' },
    { key: 'spot', label: 'Spot', icon: 'fa-location-crosshairs' },
    { key: 'needed', label: 'Operator', icon: 'fa-helmet-safety' },
];

const DEFAULT_LINEUPS_REQUIREMENTS = {
    map: 'Same as in the clip title',
    spot: 'Follow the video for positioning',
    needed: 'Standard ranked loadout',
};

let lineupsPendingClip = null;

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function escapeHtmlText(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatLineupsMediaTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    const s = whole % 60;
    const m = Math.floor(whole / 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

let lineupsVideoModalCloseTimer = null;
let lineupsPlayerProgressDragging = false;
let lineupsPlayerWasPlayingBeforeScrub = false;
let lineupsScrubPendingTime = null;
let lineupsScrubVideoSeeking = false;
let lineupsVolumeDragging = false;
let lineupsProgressRafId = 0;
let lineupsSpeedMenuOpen = false;
let lineupsSpeedMenuOutsideListener = null;

const LINEUPS_PROGRESS_MIN_MAX = 10000;
const LINEUPS_PROGRESS_STEPS_PER_SECOND = 120;
const LINEUPS_DEFAULT_PLAYBACK_SPEED = 2;

function computeLineupsProgressMaxForDuration(durationSec) {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return LINEUPS_PROGRESS_MIN_MAX;
    return Math.max(LINEUPS_PROGRESS_MIN_MAX, Math.ceil(durationSec * LINEUPS_PROGRESS_STEPS_PER_SECOND));
}

function applyLineupsProgressRangeForDuration(durationSec) {
    const progress = document.getElementById('lineups-player-progress');
    if (!progress) return;
    const max = computeLineupsProgressMaxForDuration(durationSec);
    const maxStr = String(max);
    if (progress.max !== maxStr) progress.max = maxStr;
}

function getLineupsProgressMax() {
    const progress = document.getElementById('lineups-player-progress');
    const max = Number(progress?.max);
    return Number.isFinite(max) && max > 0 ? max : LINEUPS_PROGRESS_MIN_MAX;
}

function lineupsProgressRatioFromValue(value) {
    return Number(value) / getLineupsProgressMax();
}

function lineupsProgressRatioFromProgressElement(progress) {
    const min = Number(progress.min);
    const max = Number(progress.max);
    const val = Number(progress.value);
    const span = max - min;
    return span > 0 ? Math.min(1, Math.max(0, (val - min) / span)) : 0;
}

function syncLineupsProgressTrackFill(progress, { force = false } = {}) {
    if (!progress) return;
    const wrap = progress.closest('.lineups-player-progress-wrap');
    if (!wrap) return;
    const ratio = lineupsProgressRatioFromProgressElement(progress);
    const prev = Number(wrap.dataset.progressRatio);
    if (!force && Number.isFinite(prev) && Math.abs(prev - ratio) < 1e-6) return;
    wrap.dataset.progressRatio = String(ratio);
    wrap.style.setProperty('--lineups-progress-ratio', String(ratio));
}

function syncLineupsProgressThumbVisuals(progress, options) {
    syncLineupsProgressTrackFill(progress, options);
    if (lineupsPlayerProgressDragging) {
        positionLineupsScrubPreview(progress);
    }
}

function setLineupsProgressValue(progress, value) {
    if (!progress) return;
    const numNext = Number(value);
    const numCur = Number(progress.value);
    if (!Number.isFinite(numNext)) return;
    if (!Number.isFinite(numCur) || Math.abs(numCur - numNext) > 1e-7) {
        progress.value = String(numNext);
    }
    syncLineupsProgressTrackFill(progress);
    if (lineupsPlayerProgressDragging) {
        positionLineupsScrubPreview(progress);
    }
}

function syncLineupsProgressFromVideo() {
    const video = getLineupsModalVideo();
    const progress = document.getElementById('lineups-player-progress');
    if (!video || !progress || lineupsPlayerProgressDragging) return;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    applyLineupsProgressRangeForDuration(duration);
    const max = getLineupsProgressMax();
    if (video.ended) {
        setLineupsProgressValue(progress, max);
        return;
    }
    setLineupsProgressValue(progress, (video.currentTime / duration) * max);
}

function initLineupsProgressLayoutSync() {
    const progress = document.getElementById('lineups-player-progress');
    const wrap = progress?.closest('.lineups-player-progress-wrap');
    if (!wrap || wrap.dataset.layoutBound === '1') return;
    wrap.dataset.layoutBound = '1';

    let layoutSyncRaf = 0;
    const sync = () => {
        invalidateLineupsRangeThumbSizeCache();
        if (progress) syncLineupsProgressThumbVisuals(progress, { force: true });
    };
    const scheduleSync = () => {
        if (layoutSyncRaf) return;
        layoutSyncRaf = requestAnimationFrame(() => {
            layoutSyncRaf = 0;
            sync();
        });
    };
    if (typeof ResizeObserver !== 'undefined') {
        let lastWidth = 0;
        const observer = new ResizeObserver(() => {
            const width = wrap.getBoundingClientRect().width;
            if (Math.abs(width - lastWidth) < 0.5) return;
            lastWidth = width;
            scheduleSync();
        });
        observer.observe(wrap);
        lastWidth = wrap.getBoundingClientRect().width;
    }
    window.addEventListener('resize', scheduleSync);
}

function stopLineupsProgressSmoothTick() {
    if (!lineupsProgressRafId) return;
    cancelAnimationFrame(lineupsProgressRafId);
    lineupsProgressRafId = 0;
}

function tickLineupsProgressSmooth() {
    lineupsProgressRafId = 0;
    syncLineupsProgressFromVideo();
    const video = getLineupsModalVideo();
    if (video && !video.paused && !video.ended && !lineupsPlayerProgressDragging) {
        lineupsProgressRafId = requestAnimationFrame(tickLineupsProgressSmooth);
    }
}

function startLineupsProgressSmoothTick() {
    if (lineupsProgressRafId) return;
    lineupsProgressRafId = requestAnimationFrame(tickLineupsProgressSmooth);
}

function syncLineupsPlayerPlaybackClass() {
    const player = document.getElementById('lineups-player');
    const video = getLineupsModalVideo();
    if (!player || !video) return;
    player.classList.toggle('lineups-player--playing', Boolean(video.src) && !video.paused && !video.ended);
}

function getLineupsModalVideo() {
    return document.getElementById('lineups-modal-video');
}

function getLineupsScrubVideo() {
    return document.getElementById('lineups-modal-video-scrub');
}

function syncLineupsScrubVideoSource(src) {
    const scrubVideo = getLineupsScrubVideo();
    if (!scrubVideo) return;
    if (src) {
        scrubVideo.src = src;
        scrubVideo.load();
    } else {
        scrubVideo.pause();
        scrubVideo.removeAttribute('src');
        scrubVideo.load();
    }
}

let lineupsRangeThumbSizePxCache = null;

function invalidateLineupsRangeThumbSizeCache() {
    lineupsRangeThumbSizePxCache = null;
}

function getLineupsRangeThumbSizePx(input) {
    if (lineupsRangeThumbSizePxCache !== null) return lineupsRangeThumbSizePxCache;
    if (!input) return 10;
    const size = getComputedStyle(input).getPropertyValue('--lineups-range-thumb-size').trim();
    if (!size) return 10;
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;width:${size};`;
    document.body.appendChild(probe);
    const px = probe.offsetWidth;
    probe.remove();
    lineupsRangeThumbSizePxCache = px || 10;
    return lineupsRangeThumbSizePxCache;
}

function getLineupsProgressTrackMetrics(input) {
    const width = input.getBoundingClientRect().width;
    const thumb = getLineupsRangeThumbSizePx(input);
    const travel = Math.max(0, width - thumb);
    return { width, thumb, travel };
}

function lineupsProgressRatioFromPointer(input, clientX) {
    const rect = input.getBoundingClientRect();
    const { thumb, travel } = getLineupsProgressTrackMetrics(input);
    if (travel <= 0) return 0;
    const x = clientX - rect.left - thumb / 2;
    return Math.min(1, Math.max(0, x / travel));
}

function getLineupsRangeThumbCenterX(input) {
    const { thumb, travel } = getLineupsProgressTrackMetrics(input);
    const min = Number(input.min);
    const max = Number(input.max);
    const val = Number(input.value);
    const span = max - min;
    const ratio = span > 0 ? (val - min) / span : 0;
    const clamped = Math.min(1, Math.max(0, ratio));
    return clamped * travel + thumb / 2;
}

function positionLineupsScrubPreview(progress) {
    const preview = document.getElementById('lineups-player-scrub-preview');
    if (!preview || !progress) return;
    preview.style.left = `${getLineupsRangeThumbCenterX(progress)}px`;
}

function drawLineupsScrubPreviewFrame(sourceVideo) {
    const canvas = document.getElementById('lineups-player-scrub-canvas');
    if (!canvas || !sourceVideo) return;
    const w = sourceVideo.videoWidth;
    const h = sourceVideo.videoHeight;
    if (!w || !h) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
}

function flushLineupsScrubPreview() {
    const scrubVideo = getLineupsScrubVideo();
    if (!scrubVideo || !Number.isFinite(scrubVideo.duration)) return;
    if (lineupsScrubPendingTime === null) return;
    if (lineupsScrubVideoSeeking) return;

    const target = lineupsScrubPendingTime;
    lineupsScrubPendingTime = null;
    lineupsScrubVideoSeeking = true;
    try {
        scrubVideo.currentTime = target;
    } catch {
        lineupsScrubVideoSeeking = false;
    }
}

function queueLineupsScrubPreview(time) {
    lineupsScrubPendingTime = time;
    flushLineupsScrubPreview();
}

function setLineupsScrubPreviewVisible(visible) {
    const preview = document.getElementById('lineups-player-scrub-preview');
    if (!preview) return;
    preview.hidden = !visible;
}

function setLineupsVolumeTooltipVisible(visible) {
    const tooltip = document.getElementById('lineups-player-volume-tooltip');
    if (!tooltip) return;
    tooltip.hidden = !visible;
    tooltip.classList.toggle('hidden', !visible);
}

function positionLineupsVolumeTooltip(volumeInput) {
    const tooltip = document.getElementById('lineups-player-volume-tooltip');
    if (!tooltip || !volumeInput) return;
    tooltip.style.left = `${getLineupsRangeThumbCenterX(volumeInput)}px`;
}

function syncLineupsVolumeLevelUi(volumeInput) {
    if (!volumeInput) return;
    const wrap = volumeInput.closest('.lineups-player-volume-wrap');
    if (!wrap) return;
    const min = Number(volumeInput.min);
    const max = Number(volumeInput.max);
    const val = Number(volumeInput.value);
    const span = max - min;
    const ratio = span > 0 ? Math.min(1, Math.max(0, (val - min) / span)) : 0;
    wrap.style.setProperty('--lineups-volume-ratio', String(ratio));
}

function updateLineupsVolumeTooltipUi(volumeInput) {
    if (!volumeInput) return;
    const percent = Math.min(100, Math.max(0, Math.round(Number(volumeInput.value))));
    const tooltip = document.getElementById('lineups-player-volume-tooltip');
    if (tooltip) tooltip.textContent = `${percent}%`;
    syncLineupsVolumeLevelUi(volumeInput);
    positionLineupsVolumeTooltip(volumeInput);
}

function beginLineupsVolumeAdjust(volumeInput) {
    closeLineupsSpeedMenu();
    lineupsVolumeDragging = true;
    setLineupsVolumeTooltipVisible(true);
    updateLineupsVolumeTooltipUi(volumeInput);
}

function endLineupsVolumeAdjust() {
    lineupsVolumeDragging = false;
    setLineupsVolumeTooltipVisible(false);
}

function getLineupsPlaybackSpeed() {
    const video = getLineupsModalVideo();
    const rate = video?.playbackRate;
    return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function applyLineupsPlaybackSpeed(rate) {
    const video = getLineupsModalVideo();
    if (!video) return;
    const parsed = Number(rate);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    video.playbackRate = parsed;
    syncLineupsSpeedMenuUi();
}

function syncLineupsSpeedMenuUi() {
    const menu = document.getElementById('lineups-player-speed-menu');
    if (!menu) return;
    const current = getLineupsPlaybackSpeed();
    menu.querySelectorAll('.lineups-player-speed-option[data-speed]').forEach((btn) => {
        const speed = Number(btn.dataset.speed);
        const selected = Math.abs(speed - current) < 0.001;
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
}

function setLineupsSpeedMenuOpen(open) {
    const menu = document.getElementById('lineups-player-speed-menu');
    const settingsBtn = document.getElementById('lineups-player-settings');
    if (!menu || !settingsBtn) return;
    if (lineupsSpeedMenuOpen === open) return;

    lineupsSpeedMenuOpen = open;
    menu.hidden = !open;
    settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    settingsBtn.classList.toggle('is-active', open);

    if (open) {
        syncLineupsSpeedMenuUi();
        lineupsSpeedMenuOutsideListener = (event) => {
            const wrap = settingsBtn.closest('.lineups-player-settings-wrap');
            if (wrap?.contains(event.target)) return;
            setLineupsSpeedMenuOpen(false);
        };
        document.addEventListener('pointerdown', lineupsSpeedMenuOutsideListener, true);
        return;
    }

    if (lineupsSpeedMenuOutsideListener) {
        document.removeEventListener('pointerdown', lineupsSpeedMenuOutsideListener, true);
        lineupsSpeedMenuOutsideListener = null;
    }
}

function closeLineupsSpeedMenu() {
    setLineupsSpeedMenuOpen(false);
}

function resetLineupsPlaybackSpeed() {
    applyLineupsPlaybackSpeed(LINEUPS_DEFAULT_PLAYBACK_SPEED);
}

function exitLineupsPlayerFullscreenIfActive() {
    const player = document.getElementById('lineups-player');
    if (player && document.fullscreenElement === player) {
        document.exitFullscreen?.();
    }
}

function updateLineupsScrubPreviewUi(ratio) {
    const video = getLineupsModalVideo();
    const progress = document.getElementById('lineups-player-progress');
    const scrubTimeEl = document.getElementById('lineups-player-scrub-time');
    const timeEl = document.getElementById('lineups-player-time');
    if (!video || !progress || !Number.isFinite(video.duration) || video.duration <= 0) return;

    const clamped = Math.min(1, Math.max(0, ratio));
    const previewTime = clamped * video.duration;
    if (scrubTimeEl) scrubTimeEl.textContent = formatLineupsMediaTime(previewTime);
    if (timeEl) {
        timeEl.textContent = `${formatLineupsMediaTime(previewTime)} / ${formatLineupsMediaTime(video.duration)}`;
    }
    setLineupsProgressValue(progress, clamped * getLineupsProgressMax());
    queueLineupsScrubPreview(previewTime);
}

function beginLineupsProgressScrub() {
    const video = getLineupsModalVideo();
    if (!video?.src || !Number.isFinite(video.duration)) return;

    closeLineupsSpeedMenu();
    lineupsPlayerProgressDragging = true;
    lineupsPlayerWasPlayingBeforeScrub = !video.paused && !video.ended;
    if (lineupsPlayerWasPlayingBeforeScrub) video.pause();

    setLineupsScrubPreviewVisible(true);
    syncLineupsPlayerUi();
}

function endLineupsProgressScrub(commit) {
    const video = getLineupsModalVideo();
    const progress = document.getElementById('lineups-player-progress');
    if (!lineupsPlayerProgressDragging) return;

    lineupsPlayerProgressDragging = false;
    lineupsScrubPendingTime = null;
    lineupsScrubVideoSeeking = false;
    setLineupsScrubPreviewVisible(false);

    if (video && progress && commit && Number.isFinite(video.duration)) {
        const ratio = lineupsProgressRatioFromValue(progress.value);
        const target = ratio * video.duration;
        video.currentTime = target;
    }

    syncLineupsPlayerUi();

    if (video && commit && lineupsPlayerWasPlayingBeforeScrub) {
        video.play().catch(() => {});
    } else if (video && commit) {
        syncLineupsProgressFromVideo();
    }
    lineupsPlayerWasPlayingBeforeScrub = false;
}

function pauseLineupsVideos() {
    document.querySelectorAll('#lineups-video-grid video').forEach((video) => {
        video.pause();
    });
    const modalVideo = getLineupsModalVideo();
    if (modalVideo) modalVideo.pause();
}

function syncLineupsPlayerTimeLabel() {
    const video = getLineupsModalVideo();
    const timeEl = document.getElementById('lineups-player-time');
    if (!video || !timeEl) return;
    const duration = video.duration;
    timeEl.textContent = `${formatLineupsMediaTime(video.currentTime)} / ${formatLineupsMediaTime(duration)}`;
}

function handleLineupsVideoTimeUpdate() {
    const video = getLineupsModalVideo();
    if (video && !video.paused && !video.ended) {
        syncLineupsPlayerTimeLabel();
        return;
    }
    syncLineupsPlayerUi();
}

function syncLineupsPlayerUi() {
    const video = getLineupsModalVideo();
    const playBtn = document.getElementById('lineups-player-play');
    const centerPlay = document.getElementById('lineups-player-center-play');
    const timeEl = document.getElementById('lineups-player-time');
    const progress = document.getElementById('lineups-player-progress');
    const volume = document.getElementById('lineups-player-volume');
    if (!video || !playBtn) return;

    syncLineupsPlayerPlaybackClass();

    const playing = !video.paused && !video.ended;
    playBtn.querySelector('.lineups-icon-play')?.classList.toggle('hidden', playing);
    playBtn.querySelector('.lineups-icon-pause')?.classList.toggle('hidden', !playing);
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');

    if (centerPlay) {
        const showCenter = video.paused || video.ended;
        centerPlay.hidden = !showCenter;
        centerPlay.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    }

    const duration = video.duration;
    const current = video.currentTime;
    if (timeEl) {
        timeEl.textContent = `${formatLineupsMediaTime(current)} / ${formatLineupsMediaTime(duration)}`;
    }
    if (progress && !lineupsPlayerProgressDragging && Number.isFinite(duration) && duration > 0) {
        if (video.paused || video.ended) {
            syncLineupsProgressFromVideo();
        }
    }

    if (volume && document.activeElement !== volume) {
        const level = video.muted || video.volume === 0 ? 0 : video.volume;
        volume.value = String(level * 100);
        syncLineupsVolumeLevelUi(volume);
    }
}

function normalizeLineupsRequirementsPayload(requirements) {
    const empty = { map: '', spot: '', needed: '' };

    if (requirements && typeof requirements === 'object' && !Array.isArray(requirements)) {
        return {
            map: String(requirements.map ?? '').trim(),
            spot: String(requirements.spot ?? '').trim(),
            needed: String(requirements.needed ?? '').trim(),
        };
    }

    if (Array.isArray(requirements)) {
        const mapRaw = String(requirements[0] ?? '').trim();
        return {
            map: mapRaw.replace(/^map:\s*/i, '').trim(),
            spot: String(requirements[1] ?? '').trim(),
            needed: String(requirements[2] ?? '').trim(),
        };
    }

    return { ...empty };
}

function resolveLineupsRequirementsDisplay(requirements) {
    const normalized = normalizeLineupsRequirementsPayload(requirements);
    const hasAny = normalized.map || normalized.spot || normalized.needed;
    if (!hasAny) return { ...DEFAULT_LINEUPS_REQUIREMENTS };
    return {
        map: normalized.map || '—',
        spot: normalized.spot || '—',
        needed: normalized.needed || '—',
    };
}

function parseLineupsRequirementsAttr(raw) {
    if (!raw) return normalizeLineupsRequirementsPayload(null);
    try {
        return normalizeLineupsRequirementsPayload(JSON.parse(raw));
    } catch {
        return normalizeLineupsRequirementsPayload(null);
    }
}

function renderLineupsRequirementsList(requirements) {
    const listEl = document.getElementById('lineups-requirements-list');
    if (!listEl) return;
    const data = resolveLineupsRequirementsDisplay(requirements);
    listEl.innerHTML = LINEUPS_REQUIREMENT_ROWS.map(({ key, label, icon }) => (
        `<li class="lineups-requirements-item">
            <span class="lineups-requirements-key">
                <i class="fa-solid ${icon} lineups-requirements-key-icon" aria-hidden="true"></i>
                ${label}
            </span>
            <span class="lineups-requirements-value">${escapeHtmlAttr(data[key] || '—')}</span>
        </li>`
    )).join('');
}

function setLineupsModalStep(step) {
    const requirementsEl = document.getElementById('lineups-video-requirements');
    const playerEl = document.getElementById('lineups-player');
    const backBtn = document.getElementById('lineups-video-modal-back');
    const showRequirements = step === 'requirements';
    if (requirementsEl) requirementsEl.classList.toggle('hidden', !showRequirements);
    if (playerEl) playerEl.classList.toggle('hidden', showRequirements);
    if (backBtn) {
        backBtn.hidden = showRequirements;
        backBtn.classList.toggle('hidden', showRequirements);
    }
}

function returnToLineupsRequirements() {
    if (!lineupsPendingClip) return;

    exitLineupsPlayerFullscreenIfActive();
    closeLineupsSpeedMenu();
    endLineupsProgressScrub(false);
    endLineupsVolumeAdjust();
    const video = getLineupsModalVideo();
    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }
    syncLineupsScrubVideoSource('');
    resetLineupsPlaybackSpeed();

    setLineupsModalStep('requirements');
    document.getElementById('lineups-watch-video-btn')?.focus();
}

function resetLineupsModalContent() {
    lineupsPendingClip = null;
    setLineupsModalStep('requirements');
    renderLineupsRequirementsList([]);
    const listEl = document.getElementById('lineups-requirements-list');
    if (listEl) listEl.innerHTML = '';
}

function startLineupsVideoWatch() {
    const clip = lineupsPendingClip;
    const video = getLineupsModalVideo();
    if (!clip?.src || !video) return;

    pauseLineupsVideos();
    setLineupsModalStep('player');

    video.src = clip.src;
    syncLineupsScrubVideoSource(clip.src);
    video.muted = false;
    video.volume = 1;
    video.playbackRate = LINEUPS_DEFAULT_PLAYBACK_SPEED;
    video.currentTime = 0;
    const volume = document.getElementById('lineups-player-volume');
    if (volume) volume.value = '100';
    closeLineupsSpeedMenu();
    syncLineupsSpeedMenuUi();

    syncLineupsPlayerUi();
    video.play().catch(() => {
        syncLineupsPlayerUi();
    });
}

function setLineupsVideoModalOpen(open) {
    const modal = document.getElementById('lineups-video-modal');
    const closeBtn = document.getElementById('lineups-video-modal-close');
    if (!modal) return;

    clearTimeout(lineupsVideoModalCloseTimer);
    lineupsVideoModalCloseTimer = null;

    if (open) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('lineups-video-modal-open');
        if (!isReducedMotionEnabled()) void modal.offsetHeight;
        modal.classList.add('is-open');
        closeBtn?.focus();
        return;
    }

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lineups-video-modal-open');

    exitLineupsPlayerFullscreenIfActive();
    closeLineupsSpeedMenu();
    stopLineupsProgressSmoothTick();
    endLineupsProgressScrub(false);
    endLineupsVolumeAdjust();
    document.getElementById('lineups-player')?.classList.remove('lineups-player--playing');

    const video = getLineupsModalVideo();
    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }
    syncLineupsScrubVideoSource('');
    resetLineupsPlaybackSpeed();

    const closeDelay = isReducedMotionEnabled() ? 0 : MOTION_MS;
    lineupsVideoModalCloseTimer = setTimeout(() => {
        modal.classList.add('hidden');
        resetLineupsModalContent();
        lineupsVideoModalCloseTimer = null;
    }, closeDelay);
}

function openLineupsVideoModal({ title, src, requirements }) {
    const video = getLineupsModalVideo();
    const titleEl = document.getElementById('lineups-video-modal-title');
    const watchBtn = document.getElementById('lineups-watch-video-btn');
    if (!src) return;

    pauseLineupsVideos();
    closeLineupsSpeedMenu();
    endLineupsProgressScrub(false);
    endLineupsVolumeAdjust();

    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }
    syncLineupsScrubVideoSource('');

    const reqPayload = typeof requirements === 'string'
        ? parseLineupsRequirementsAttr(requirements)
        : normalizeLineupsRequirementsPayload(requirements);
    lineupsPendingClip = {
        title: title || 'Lineup',
        src,
        requirements: reqPayload,
    };

    if (titleEl) titleEl.textContent = lineupsPendingClip.title;
    renderLineupsRequirementsList(lineupsPendingClip.requirements);
    setLineupsModalStep('requirements');

    setLineupsVideoModalOpen(true);
    watchBtn?.focus();
}

function closeLineupsVideoModal() {
    setLineupsVideoModalOpen(false);
}

function initLineupsVideoModal() {
    const modal = document.getElementById('lineups-video-modal');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    const backdrop = document.getElementById('lineups-video-modal-backdrop');
    const closeBtn = document.getElementById('lineups-video-modal-close');
    const video = getLineupsModalVideo();
    const playBtn = document.getElementById('lineups-player-play');
    const centerPlay = document.getElementById('lineups-player-center-play');
    const progress = document.getElementById('lineups-player-progress');
    const volume = document.getElementById('lineups-player-volume');
    const fullscreenBtn = document.getElementById('lineups-player-fullscreen');
    const settingsBtn = document.getElementById('lineups-player-settings');
    const speedMenu = document.getElementById('lineups-player-speed-menu');

    backdrop?.addEventListener('click', closeLineupsVideoModal);
    closeBtn?.addEventListener('click', closeLineupsVideoModal);
    document.getElementById('lineups-watch-video-btn')?.addEventListener('click', startLineupsVideoWatch);
    document.getElementById('lineups-video-modal-back')?.addEventListener('click', returnToLineupsRequirements);

    const togglePlay = () => {
        if (!video?.src) return;
        if (video.paused || video.ended) {
            video.play().catch(() => {});
        } else {
            video.pause();
        }
        syncLineupsPlayerUi();
    };

    playBtn?.addEventListener('click', togglePlay);
    centerPlay?.addEventListener('click', togglePlay);
    video?.addEventListener('click', togglePlay);

    video?.addEventListener('play', () => {
        syncLineupsPlayerUi();
        startLineupsProgressSmoothTick();
    });
    video?.addEventListener('pause', () => {
        stopLineupsProgressSmoothTick();
        syncLineupsPlayerUi();
    });
    video?.addEventListener('timeupdate', handleLineupsVideoTimeUpdate);
    video?.addEventListener('loadedmetadata', syncLineupsPlayerUi);
    video?.addEventListener('volumechange', syncLineupsPlayerUi);
    video?.addEventListener('ended', () => {
        stopLineupsProgressSmoothTick();
        if (progress) {
            setLineupsProgressValue(progress, getLineupsProgressMax());
        }
        syncLineupsPlayerUi();
    });

    const scrubVideo = getLineupsScrubVideo();
    scrubVideo?.addEventListener('seeked', () => {
        lineupsScrubVideoSeeking = false;
        drawLineupsScrubPreviewFrame(scrubVideo);
        flushLineupsScrubPreview();
    });
    scrubVideo?.addEventListener('loadeddata', () => {
        if (lineupsPlayerProgressDragging) flushLineupsScrubPreview();
    });

    progress?.addEventListener('pointerdown', (event) => {
        beginLineupsProgressScrub();
        try {
            progress.setPointerCapture(event.pointerId);
        } catch {}
        updateLineupsScrubPreviewUi(lineupsProgressRatioFromPointer(progress, event.clientX));
    });
    progress?.addEventListener('pointermove', (event) => {
        if (!lineupsPlayerProgressDragging) return;
        updateLineupsScrubPreviewUi(lineupsProgressRatioFromPointer(progress, event.clientX));
    });
    progress?.addEventListener('input', () => {
        if (!lineupsPlayerProgressDragging) return;
        updateLineupsScrubPreviewUi(lineupsProgressRatioFromValue(progress.value));
    });
    progress?.addEventListener('pointerup', (event) => {
        if (progress.hasPointerCapture?.(event.pointerId)) {
            try {
                progress.releasePointerCapture(event.pointerId);
            } catch {}
        }
        endLineupsProgressScrub(true);
    });
    progress?.addEventListener('pointercancel', (event) => {
        if (progress.hasPointerCapture?.(event.pointerId)) {
            try {
                progress.releasePointerCapture(event.pointerId);
            } catch {}
        }
        endLineupsProgressScrub(true);
    });

    volume?.addEventListener('pointerdown', (event) => {
        beginLineupsVolumeAdjust(volume);
        try {
            volume.setPointerCapture(event.pointerId);
        } catch {}
        updateLineupsVolumeTooltipUi(volume);
        requestAnimationFrame(() => updateLineupsVolumeTooltipUi(volume));
    });
    volume?.addEventListener('input', () => {
        syncLineupsVolumeLevelUi(volume);
        if (lineupsVolumeDragging) updateLineupsVolumeTooltipUi(volume);
        if (!video) return;
        const level = Number(volume.value) / 100;
        video.volume = level;
        video.muted = level === 0;
        syncLineupsPlayerUi();
    });
    volume?.addEventListener('pointerup', (event) => {
        if (volume.hasPointerCapture?.(event.pointerId)) {
            try {
                volume.releasePointerCapture(event.pointerId);
            } catch {}
        }
        endLineupsVolumeAdjust();
    });
    volume?.addEventListener('pointercancel', (event) => {
        if (volume.hasPointerCapture?.(event.pointerId)) {
            try {
                volume.releasePointerCapture(event.pointerId);
            } catch {}
        }
        endLineupsVolumeAdjust();
    });

    settingsBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        setLineupsSpeedMenuOpen(!lineupsSpeedMenuOpen);
    });
    speedMenu?.addEventListener('click', (event) => {
        const option = event.target.closest('.lineups-player-speed-option[data-speed]');
        if (!option) return;
        applyLineupsPlaybackSpeed(option.dataset.speed);
        setLineupsSpeedMenuOpen(false);
    });

    const player = document.getElementById('lineups-player');
    fullscreenBtn?.addEventListener('click', () => {
        closeLineupsSpeedMenu();
        if (!player) return;
        if (document.fullscreenElement === player) {
            document.exitFullscreen?.();
            return;
        }
        if (document.fullscreenElement) return;
        player.requestFullscreen?.().catch(() => {});
    });

    document.addEventListener('fullscreenchange', () => {
        const icon = fullscreenBtn?.querySelector('i');
        const playerFs = document.fullscreenElement?.id === 'lineups-player';
        if (icon) {
            icon.classList.toggle('fa-expand', !playerFs);
            icon.classList.toggle('fa-compress', playerFs);
        }
        invalidateLineupsRangeThumbSizeCache();
        if (progress) {
            requestAnimationFrame(() => {
                syncLineupsProgressThumbVisuals(progress, { force: true });
            });
        }
    });

    initLineupsProgressLayoutSync();
    syncLineupsVolumeLevelUi(volume);
}

function initLineupsVideoGridDelegation() {
    const grid = document.getElementById('lineups-video-grid');
    if (!grid || grid.dataset.videoBound === '1') return;
    grid.dataset.videoBound = '1';

    grid.addEventListener('click', (event) => {
        const opener = event.target.closest('.lineups-video-open');
        if (!opener) return;
        const src = opener.dataset.src || '';
        const title = opener.dataset.title || 'Lineup';
        if (!src) return;
        openLineupsVideoModal({
            title,
            src,
            requirements: opener.getAttribute('data-requirements') || '{}',
        });
    });
}

function getLineupsClipsForGame(gameKey) {
    const key = gameKey in LINEUPS_VIDEO_LIBRARY ? gameKey : LINEUPS_DEFAULT_GAME;
    return LINEUPS_VIDEO_LIBRARY[key] || [];
}

function getLineupsClipMap(clip) {
    const req = clip?.requirements;
    if (req && typeof req === 'object' && !Array.isArray(req)) {
        return String(req.map ?? '').trim();
    }
    return String(clip?.map ?? '').trim();
}

function clampLineupsDifficultyStars(value) {
    const n = typeof value === 'number' ? value : parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(n)) return LINEUPS_DIFFICULTY_MIN;
    return Math.max(LINEUPS_DIFFICULTY_MIN, Math.min(LINEUPS_DIFFICULTY_MAX, n));
}

function normalizeLineupsDifficultyStars(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return String(clampLineupsDifficultyStars(raw));
    }
    const text = String(raw ?? '').trim();
    if (!text) return String(Math.ceil((LINEUPS_DIFFICULTY_MIN + LINEUPS_DIFFICULTY_MAX) / 2));
    const asNum = parseInt(text, 10);
    if (Number.isFinite(asNum) && asNum >= LINEUPS_DIFFICULTY_MIN && asNum <= LINEUPS_DIFFICULTY_MAX) {
        return String(asNum);
    }
    const legacy = LINEUPS_DIFFICULTY_LEGACY[text.toLowerCase()];
    if (legacy != null) return String(legacy);
    return String(Math.ceil((LINEUPS_DIFFICULTY_MIN + LINEUPS_DIFFICULTY_MAX) / 2));
}

function getLineupsClipDifficulty(clip) {
    return normalizeLineupsDifficultyStars(clip?.difficulty);
}

function formatLineupsDifficultyPlain(stars) {
    const count = clampLineupsDifficultyStars(stars);
    return `${'★'.repeat(count)}${'☆'.repeat(LINEUPS_DIFFICULTY_MAX - count)}`;
}

function formatLineupsDifficultyHtml(stars) {
    const count = clampLineupsDifficultyStars(stars);
    const icons = [];
    for (let i = 1; i <= LINEUPS_DIFFICULTY_MAX; i += 1) {
        const style = i <= count ? 'solid' : 'regular';
        icons.push(`<i class="fa-${style} fa-star lineups-difficulty-star" aria-hidden="true"></i>`);
    }
    return `<span class="lineups-difficulty-stars" aria-hidden="true">${icons.join('')}</span>`;
}

function buildLineupsDifficultyPicklistPart(stars) {
    const id = String(clampLineupsDifficultyStars(stars));
    return {
        id,
        name: formatLineupsDifficultyPlain(stars),
        labelHtml: formatLineupsDifficultyHtml(stars),
        searchText: `${id} star stars difficulty`,
        ariaLabel: `${id} out of ${LINEUPS_DIFFICULTY_MAX} stars`,
    };
}

function getLineupsSearchTerms(query) {
    return String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function clipMatchesLineupsSearch(clip, terms) {
    if (!terms.length) return true;
    const haystack = String(clip.title ?? '').toLowerCase();
    return terms.every((term) => haystack.includes(term));
}

function highlightLineupsTitleHtml(title, query) {
    const raw = String(title ?? '');
    const terms = getLineupsSearchTerms(query);
    if (!terms.length) return escapeHtmlText(raw);

    const lower = raw.toLowerCase();
    const ranges = [];
    terms.forEach((term) => {
        let start = 0;
        while (start < lower.length) {
            const idx = lower.indexOf(term, start);
            if (idx === -1) break;
            ranges.push([idx, idx + term.length]);
            start = idx + term.length;
        }
    });
    if (!ranges.length) return escapeHtmlText(raw);

    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach(([start, end]) => {
        const last = merged[merged.length - 1];
        if (last && start <= last[1]) {
            last[1] = Math.max(last[1], end);
        } else {
            merged.push([start, end]);
        }
    });

    let html = '';
    let pos = 0;
    merged.forEach(([start, end]) => {
        html += escapeHtmlText(raw.slice(pos, start));
        html += `<mark class="lineups-video-card-title-mark">${escapeHtmlText(raw.slice(start, end))}</mark>`;
        pos = end;
    });
    html += escapeHtmlText(raw.slice(pos));
    return html;
}

function getLineupsVideoSearchQuery() {
    return document.getElementById('lineups-video-search')?.value ?? '';
}

function filterLineupsClips(clips, { map, difficulty, search }) {
    const terms = getLineupsSearchTerms(search);
    return clips.filter((clip) => {
        const clipMap = getLineupsClipMap(clip);
        const clipDifficulty = getLineupsClipDifficulty(clip);
        if (map && map !== LINEUPS_FILTER_ALL_VALUE && clipMap.toLowerCase() !== map.toLowerCase()) {
            return false;
        }
        if (difficulty && difficulty !== LINEUPS_FILTER_ALL_VALUE && clipDifficulty !== difficulty) {
            return false;
        }
        if (!clipMatchesLineupsSearch(clip, terms)) {
            return false;
        }
        return true;
    });
}

function getLineupsMapsForGame(gameKey) {
    const key = gameKey in LINEUPS_VIDEO_LIBRARY ? gameKey : LINEUPS_DEFAULT_GAME;
    if (key === 'siege') return [...LINEUPS_SIEGE_MAPS];
    const clips = getLineupsClipsForGame(key);
    return [...new Set(clips.map(getLineupsClipMap).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function buildLineupsMapPicklistParts(gameKey) {
    const key = gameKey in LINEUPS_VIDEO_LIBRARY ? gameKey : LINEUPS_DEFAULT_GAME;
    const roster = getLineupsMapsForGame(key);
    const clipMaps = getLineupsClipsForGame(key).map(getLineupsClipMap).filter(Boolean);
    const maps = [...new Set([...roster, ...clipMaps])].sort((a, b) => a.localeCompare(b));
    return [
        { id: LINEUPS_FILTER_ALL_VALUE, name: 'All maps' },
        ...maps.map((map) => ({ id: map, name: map })),
    ];
}

function buildLineupsDifficultyPicklistParts(_gameKey) {
    const starLevels = [];
    for (let stars = LINEUPS_DIFFICULTY_MIN; stars <= LINEUPS_DIFFICULTY_MAX; stars += 1) {
        starLevels.push(buildLineupsDifficultyPicklistPart(stars));
    }
    return [
        { id: LINEUPS_FILTER_ALL_VALUE, name: 'All difficulties' },
        ...starLevels,
    ];
}

function getLineupsFilterValues() {
    const mapPick = document.getElementById('lineups-filter-map-pick');
    const difficultyPick = document.getElementById('lineups-filter-difficulty-pick');
    return {
        map: mapPick?.dataset.value || LINEUPS_FILTER_ALL_VALUE,
        difficulty: difficultyPick?.dataset.value || LINEUPS_FILTER_ALL_VALUE,
    };
}

function resetLineupsFilters() {
    const mapPick = document.getElementById('lineups-filter-map-pick');
    const difficultyPick = document.getElementById('lineups-filter-difficulty-pick');
    if (mapPick) {
        const part = mapPick._picklistParts?.find((p) => p.id === LINEUPS_FILTER_ALL_VALUE)
            || { id: LINEUPS_FILTER_ALL_VALUE, name: 'All maps' };
        setToolPicklistValue(mapPick, part);
    }
    if (difficultyPick) {
        const part = difficultyPick._picklistParts?.find((p) => p.id === LINEUPS_FILTER_ALL_VALUE)
            || { id: LINEUPS_FILTER_ALL_VALUE, name: 'All difficulties' };
        setToolPicklistValue(difficultyPick, part);
    }
    const searchInput = document.getElementById('lineups-video-search');
    if (searchInput) searchInput.value = '';
    syncLineupsVideoSearchClearButton();
}

function syncLineupsFilterPicklists(gameKey) {
    const mapPick = document.getElementById('lineups-filter-map-pick');
    const difficultyPick = document.getElementById('lineups-filter-difficulty-pick');
    if (!mapPick || !difficultyPick) return;

    const prevMap = mapPick.dataset.value || LINEUPS_FILTER_ALL_VALUE;
    const prevDifficulty = difficultyPick.dataset.value || LINEUPS_FILTER_ALL_VALUE;

    const mapParts = buildLineupsMapPicklistParts(gameKey);
    const difficultyParts = buildLineupsDifficultyPicklistParts(gameKey);

    const mapIds = new Set(mapParts.map((p) => p.id));
    const difficultyIds = new Set(difficultyParts.map((p) => p.id));

    updateToolPicklistOptions(mapPick, mapParts, mapIds.has(prevMap) ? prevMap : LINEUPS_FILTER_ALL_VALUE);
    updateToolPicklistOptions(
        difficultyPick,
        difficultyParts,
        difficultyIds.has(prevDifficulty) ? prevDifficulty : LINEUPS_FILTER_ALL_VALUE,
    );
}

function renderLineupsVideoGrid(gameKey) {
    const grid = document.getElementById('lineups-video-grid');
    if (!grid) return;

    pauseLineupsVideos();
    closeLineupsVideoModal();

    const key = gameKey in LINEUPS_VIDEO_LIBRARY ? gameKey : LINEUPS_DEFAULT_GAME;
    const searchQuery = getLineupsVideoSearchQuery();
    const clips = filterLineupsClips(getLineupsClipsForGame(key), {
        ...getLineupsFilterValues(),
        search: searchQuery,
    });

    if (!clips.length) {
        grid.innerHTML = '<p class="lineups-video-grid-empty text-sm text-slate-500 tracking-wide col-span-full">No clips match these filters.</p>';
        return;
    }

    grid.innerHTML = clips.map((clip, index) => {
        const title = clip.title || `Lineup ${index + 1}`;
        const safeTitle = escapeHtmlAttr(title);
        const titleHtml = highlightLineupsTitleHtml(title, searchQuery);
        const src = clip.src ? String(clip.src) : '';
        const titleAttr = escapeHtmlAttr(title);
        const mapName = escapeHtmlAttr(getLineupsClipMap(clip));
        const difficultyHtml = formatLineupsDifficultyHtml(getLineupsClipDifficulty(clip));
        const actionInner = src
            ? `<button type="button" class="lineups-video-open topbar-action-btn ui-interactive w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-redneon-500 hover:bg-matte-800 shrink-0" data-src="${escapeHtmlAttr(src)}" data-title="${titleAttr}" data-requirements="${escapeHtmlAttr(JSON.stringify(clip.requirements || {}))}" aria-label="Open video: ${safeTitle}">
                    <i class="fa-solid fa-circle-play text-sm" aria-hidden="true"></i>
               </button>`
            : `<button type="button" class="topbar-action-btn ui-interactive w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 shrink-0 opacity-40 pointer-events-none" disabled aria-disabled="true" aria-label="No video yet">
                    <i class="fa-solid fa-circle-play text-sm" aria-hidden="true"></i>
               </button>`;
        return `
            <article class="lineups-video-card min-w-0">
                <div class="lineups-video-card-surface">
                    <div class="lineups-video-card-body">
                        <header class="lineups-video-card-head">
                            <h3 class="lineups-video-card-title">${titleHtml}</h3>
                            <div class="lineups-video-card-meta">
                                ${mapName ? `<span class="lineups-video-card-map"><i class="fa-solid fa-map" aria-hidden="true"></i>${mapName}</span>` : ''}
                                <span class="lineups-video-card-difficulty">${difficultyHtml}</span>
                            </div>
                        </header>
                        <div class="lineups-video-card-actions">
                            ${actionInner}
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function updateLineupsGamePanel({ resetFilters = false, syncFilters = true } = {}) {
    const root = document.getElementById('lineups-game-glide');
    if (!root) return;
    const key = root.dataset.value || LINEUPS_DEFAULT_GAME;
    if (resetFilters) resetLineupsFilters();
    if (syncFilters) syncLineupsFilterPicklists(key);
    renderLineupsVideoGrid(key);
}

function initLineupsGameGlide() {
    const root = document.getElementById('lineups-game-glide');
    if (!root || root.dataset.glideBound === '1') return;
    root.dataset.glideBound = '1';

    syncGlideSelector(root);

    root.querySelectorAll('.glide-selector-option').forEach((btn) => {
        btn.addEventListener('click', () => {
            const prevIndex = parseInt(root.dataset.glideIndex ?? '0', 10);
            root.dataset.value = btn.dataset.resolution || LINEUPS_DEFAULT_GAME;
            syncGlideSelector(root, { fromIndex: prevIndex });
            updateLineupsGamePanel({ resetFilters: true });
        });
    });
}

function syncLineupsVideoSearchClearButton() {
    const searchInput = document.getElementById('lineups-video-search');
    const clearBtn = document.getElementById('lineups-video-search-clear');
    if (!searchInput || !clearBtn) return;
    const hasQuery = String(searchInput.value ?? '').trim().length > 0;
    clearBtn.hidden = !hasQuery;
}

function runLineupsVideoSearch() {
    updateLineupsGamePanel({ syncFilters: false });
    syncLineupsVideoSearchClearButton();
}

function initLineupsVideoSearch() {
    const searchInput = document.getElementById('lineups-video-search');
    const clearBtn = document.getElementById('lineups-video-search-clear');
    if (!searchInput || searchInput.dataset.lineupsSearchBound === '1') return;
    searchInput.dataset.lineupsSearchBound = '1';

    searchInput.addEventListener('input', () => {
        runLineupsVideoSearch();
    });
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            searchInput.blur();
            runLineupsVideoSearch();
        }
    });
    clearBtn?.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.blur();
        runLineupsVideoSearch();
    });
    syncLineupsVideoSearchClearButton();
}

function initLineupsFilters() {
    const mapPick = document.getElementById('lineups-filter-map-pick');
    const difficultyPick = document.getElementById('lineups-filter-difficulty-pick');
    if (!mapPick || !difficultyPick || mapPick.dataset.lineupsFilterBound === '1') return;
    mapPick.dataset.lineupsFilterBound = '1';

    const gameKey = document.getElementById('lineups-game-glide')?.dataset.value || LINEUPS_DEFAULT_GAME;
    const onFilterChange = () => updateLineupsGamePanel({ syncFilters: false });

    initToolPicklist(mapPick, buildLineupsMapPicklistParts(gameKey), {
        onChange: onFilterChange,
        emptyMessage: "Couldn't find that map",
    });
    initToolPicklist(difficultyPick, buildLineupsDifficultyPicklistParts(gameKey), {
        onChange: onFilterChange,
        emptyMessage: "Couldn't find that difficulty",
    });

    setToolPicklistValue(mapPick, { id: LINEUPS_FILTER_ALL_VALUE, name: 'All maps' });
    setToolPicklistValue(difficultyPick, { id: LINEUPS_FILTER_ALL_VALUE, name: 'All difficulties' });
}

function initLineupsPage() {
    initToolPicklistDismiss();
    initLineupsVideoGridDelegation();
    initLineupsGameGlide();
    initLineupsVideoSearch();
    initLineupsFilters();
    updateLineupsGamePanel();
}

function setToolPicklistMenuOpen(menu, open) {
    if (!menu) return;
    menu.classList.toggle('dropdown-open', open);
    menu.classList.toggle('dropdown-closed', !open);
}

function syncToolPicklistEmptyState(root, query) {
    const menu = root.querySelector('.tool-picklist-menu');
    const emptyEl = menu?.querySelector('.tool-picklist-empty');
    if (!emptyEl) return;
    const q = String(query ?? root.querySelector('.tool-picklist-input')?.value ?? '').trim();
    const visibleCount = getToolPicklistVisibleOptionCount(menu);
    const show = q.length > 0 && visibleCount === 0;
    emptyEl.classList.toggle('hidden', !show);
}

function filterToolPicklistOptions(root, query) {
    const q = String(query || '').trim().toLowerCase();
    root.querySelectorAll('.tool-picklist-option').forEach((btn) => {
        const search = (btn.dataset.search || '').trim().toLowerCase();
        const label = (btn.textContent || '').trim().toLowerCase();
        const haystack = `${search} ${label}`.trim();
        btn.classList.toggle('is-filtered-out', q.length > 0 && !haystack.includes(q));
    });
    syncToolPicklistEmptyState(root, query);
}

function syncToolPicklistInputDisplay(root) {
    const input = root.querySelector('.tool-picklist-input');
    const parts = root._picklistParts;
    if (!input || !Array.isArray(parts)) return;
    const part = parts.find((p) => p.id === root.dataset.value);
    input.value = part ? part.name : '';
}

function beginToolPicklistEdit(root, onChange) {
    if (!root.dataset.value) return;
    root._picklistRevertId = root.dataset.value;
    root._picklistEditing = true;
    const input = root.querySelector('.tool-picklist-input');
    root.dataset.value = '';
    if (input) input.value = '';
    root.querySelectorAll('.tool-picklist-option').forEach((btn) => {
        btn.classList.remove('is-selected');
        btn.setAttribute('aria-selected', 'false');
    });
    filterToolPicklistOptions(root, '');
    if (onChange) onChange();
}

function revertToolPicklistIfAborted(root) {
    if (!root._picklistRevertId || root.dataset.value) {
        root._picklistRevertId = '';
        root._picklistEditing = false;
        return;
    }
    const parts = root._picklistParts;
    const part = parts?.find((p) => p.id === root._picklistRevertId);
    if (part) setToolPicklistValue(root, part);
    root._picklistRevertId = '';
    root._picklistEditing = false;
    if (root._picklistOnChange) root._picklistOnChange();
}

function getToolPicklistScrollStep(menu) {
    const opt = menu.querySelector('.tool-picklist-option:not(.is-filtered-out)');
    if (!opt) return 0;
    const gapPx = parseFloat(getComputedStyle(menu).rowGap || getComputedStyle(menu).gap) || 0;
    return opt.offsetHeight + gapPx;
}

function getToolPicklistVisibleOptionCount(menu) {
    return menu.querySelectorAll('.tool-picklist-option:not(.is-filtered-out)').length;
}

function getToolPicklistVisibleOptions(menu) {
    return [...menu.querySelectorAll('.tool-picklist-option:not(.is-filtered-out)')];
}

function clearToolPicklistActive(root) {
    root.querySelectorAll('.tool-picklist-option.is-active').forEach((btn) => {
        btn.classList.remove('is-active');
    });
}

function setToolPicklistActive(root, menu, optionBtn, { scrollIntoView = false } = {}) {
    clearToolPicklistActive(root);
    if (!optionBtn) return;
    optionBtn.classList.add('is-active');
    if (scrollIntoView) {
        optionBtn.scrollIntoView({ block: 'nearest' });
    }
}

function syncToolPicklistActiveHighlight(root, menu, { preferSelected = true } = {}) {
    const options = getToolPicklistVisibleOptions(menu);
    if (!options.length) {
        clearToolPicklistActive(root);
        return;
    }
    let target = null;
    if (preferSelected) {
        target = options.find((btn) => btn.classList.contains('is-selected'));
    }
    const current = menu.querySelector('.tool-picklist-option.is-active:not(.is-filtered-out)');
    if (!target && current && options.includes(current)) {
        target = current;
    }
    if (!target) target = options[0];
    setToolPicklistActive(root, menu, target);
}

function moveToolPicklistActive(root, menu, delta) {
    const options = getToolPicklistVisibleOptions(menu);
    if (!options.length) return;
    let index = options.findIndex((btn) => btn.classList.contains('is-active'));
    if (index < 0) {
        index = delta > 0 ? -1 : options.length;
    }
    index = Math.max(0, Math.min(options.length - 1, index + delta));
    setToolPicklistActive(root, menu, options[index], { scrollIntoView: true });
}

function commitToolPicklistOption(root, parts, optionBtn, onChange) {
    const part = parts.find((p) => p.id === optionBtn.dataset.value);
    root._picklistRevertId = '';
    root._picklistEditing = false;
    setToolPicklistValue(root, part);
    filterToolPicklistOptions(root, '');
    clearToolPicklistActive(root);
    closeAllToolPicklists();
    const input = root.querySelector('.tool-picklist-input');
    if (input) input.blur();
    if (onChange) onChange();
}

function bindToolPicklistMenuScroll(menu) {
    if (!menu || menu.dataset.picklistScrollBound === '1') return;
    menu.dataset.picklistScrollBound = '1';

    menu.addEventListener('wheel', (event) => {
        const visibleSlots = parseFloat(getComputedStyle(menu).getPropertyValue('--picklist-visible-count')) || 5;
        const count = getToolPicklistVisibleOptionCount(menu);
        if (count <= visibleSlots) return;

        const step = getToolPicklistScrollStep(menu);
        if (!step) return;

        event.preventDefault();
        const maxScroll = Math.max(0, (count - visibleSlots) * step);
        const dir = event.deltaY > 0 ? 1 : -1;
        const next = Math.max(0, Math.min(maxScroll, menu.scrollTop + dir * step));
        menu.scrollTo({ top: next, behavior: 'auto' });
    }, { passive: false });
}

function openToolPicklist(root) {
    const menu = root.querySelector('.tool-picklist-menu');
    closeAllToolPicklists(root);
    root.classList.add('is-open');
    setToolPicklistMenuOpen(menu, true);
}

function closeAllToolPicklists(exceptRoot = null) {
    document.querySelectorAll('.tool-picklist.is-open').forEach((root) => {
        if (exceptRoot && root === exceptRoot) return;
        revertToolPicklistIfAborted(root);
        root.classList.remove('is-open');
        setToolPicklistMenuOpen(root.querySelector('.tool-picklist-menu'), false);
        clearToolPicklistActive(root);
        syncToolPicklistInputDisplay(root);
        filterToolPicklistOptions(root, '');
    });
}

function setToolPicklistValue(root, part) {
    if (!root) return;
    const input = root.querySelector('.tool-picklist-input');
    root.dataset.value = part ? part.id : '';
    if (input) {
        input.value = part ? part.name : '';
        input.placeholder = input.getAttribute('data-placeholder') || input.placeholder;
    }
    root.querySelectorAll('.tool-picklist-option').forEach((btn) => {
        const selected = part && btn.dataset.value === part.id;
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
}

function bindToolPicklistMenuOptions(root, parts, onChange) {
    const menu = root.querySelector('.tool-picklist-menu');
    if (!menu) return;
    menu.querySelectorAll('.tool-picklist-option').forEach((btn) => {
        btn.addEventListener('mouseenter', () => {
            if (!root.classList.contains('is-open')) return;
            setToolPicklistActive(root, menu, btn);
        });
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            commitToolPicklistOption(root, parts, btn, onChange);
        });
    });
}

function renderToolPicklistMenu(root, parts, emptyMessage) {
    const menu = root.querySelector('.tool-picklist-menu');
    if (!menu) return;
    menu.innerHTML = parts.map((part) => {
        const searchAttr = part.searchText
            ? ` data-search="${escapeHtmlAttr(part.searchText)}"`
            : '';
        const ariaLabel = part.ariaLabel
            ? ` aria-label="${escapeHtmlAttr(part.ariaLabel)}"`
            : '';
        const body = part.labelHtml != null ? part.labelHtml : part.name;
        return `
        <button type="button" class="tool-picklist-option ui-interactive w-full text-left px-4 h-11 flex items-center text-sm font-semibold tracking-wide text-slate-300 hover:text-white hover:bg-matte-800 rounded-lg" data-value="${escapeHtmlAttr(part.id)}" role="option" aria-selected="false"${searchAttr}${ariaLabel}>
            ${body}
        </button>
    `;
    }).join('');

    const emptyEl = document.createElement('div');
    emptyEl.className = 'tool-picklist-empty hidden';
    emptyEl.setAttribute('role', 'status');
    emptyEl.textContent = emptyMessage;
    menu.appendChild(emptyEl);

    bindToolPicklistMenuScroll(menu);
    syncToolPicklistEmptyState(root, '');
}

function updateToolPicklistOptions(root, parts, selectedId) {
    if (!root) return;
    const onChange = root._picklistOnChange;
    const emptyMessage = root._picklistEmptyMessage || "Couldn't find that part";
    root._picklistParts = parts;
    closeAllToolPicklists();
    renderToolPicklistMenu(root, parts, emptyMessage);
    bindToolPicklistMenuOptions(root, parts, onChange);
    let selected = null;
    if (selectedId) {
        selected = parts.find((p) => p.id === selectedId) || null;
    } else if (parts.some((p) => p.id === LINEUPS_FILTER_ALL_VALUE)) {
        selected = parts.find((p) => p.id === LINEUPS_FILTER_ALL_VALUE) || null;
    }
    setToolPicklistValue(root, selected);
}

function initToolPicklist(root, parts, { onChange, emptyMessage = "Couldn't find that part" } = {}) {
    if (!root) return;
    if (root.dataset.toolPicklistInit === '1') return;
    const menu = root.querySelector('.tool-picklist-menu');
    const input = root.querySelector('.tool-picklist-input');
    const chevron = root.querySelector('.tool-picklist-chevron');
    if (!menu || !input) return;

    root.dataset.toolPicklistInit = '1';
    root._picklistParts = parts;
    root._picklistOnChange = onChange;
    root._picklistEmptyMessage = emptyMessage;
    root._picklistRevertId = '';
    root._picklistEditing = false;

    if (input.placeholder) input.setAttribute('data-placeholder', input.placeholder);

    renderToolPicklistMenu(root, parts, emptyMessage);
    bindToolPicklistMenuOptions(root, parts, onChange);

    input.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (root.dataset.value && !root._picklistEditing) {
            beginToolPicklistEdit(root, onChange);
        }
    });

    input.addEventListener('focus', () => {
        openToolPicklist(root);
        filterToolPicklistOptions(root, input.value);
        syncToolPicklistActiveHighlight(root, menu);
    });

    input.addEventListener('input', () => {
        if (!root.classList.contains('is-open')) openToolPicklist(root);
        filterToolPicklistOptions(root, input.value);
        syncToolPicklistActiveHighlight(root, menu, { preferSelected: false });

        const selected = parts.find((p) => p.id === root.dataset.value);
        const query = input.value.trim().toLowerCase();
        const stillMatches = selected && selected.name.toLowerCase().includes(query);
        if (root.dataset.value && !stillMatches) {
            root.dataset.value = '';
            root.querySelectorAll('.tool-picklist-option').forEach((btn) => {
                btn.classList.remove('is-selected');
                btn.setAttribute('aria-selected', 'false');
            });
            if (onChange) onChange();
        }
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            revertToolPicklistIfAborted(root);
            closeAllToolPicklists();
            input.blur();
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!root.classList.contains('is-open')) {
                openToolPicklist(root);
                filterToolPicklistOptions(root, input.value);
            }
            if (event.key === 'ArrowDown') {
                moveToolPicklistActive(root, menu, 1);
            } else {
                moveToolPicklistActive(root, menu, -1);
            }
            return;
        }

        if (event.key === 'Enter') {
            if (!root.classList.contains('is-open')) {
                openToolPicklist(root);
                filterToolPicklistOptions(root, input.value);
                syncToolPicklistActiveHighlight(root, menu);
                return;
            }
            const active = menu.querySelector('.tool-picklist-option.is-active:not(.is-filtered-out)');
            if (active) {
                event.preventDefault();
                commitToolPicklistOption(root, parts, active, onChange);
            }
        }
    });

    if (chevron) {
        chevron.addEventListener('click', (event) => {
            event.stopPropagation();
            if (root.classList.contains('is-open')) {
                closeAllToolPicklists();
                input.blur();
            } else {
                input.focus();
            }
        });
    }
}

function updateBottleneckChart() {
    const cpuPick = document.getElementById('bottleneck-cpu-pick');
    const gpuPick = document.getElementById('bottleneck-gpu-pick');
    const cpuBar = document.getElementById('bottleneck-cpu-bar');
    const gpuBar = document.getElementById('bottleneck-gpu-bar');
    const cpuPctEl = document.getElementById('bottleneck-cpu-pct');
    const gpuPctEl = document.getElementById('bottleneck-gpu-pct');
    const summaryEl = document.getElementById('bottleneck-summary');
    if (!cpuPick || !gpuPick || !cpuBar || !gpuBar || !cpuPctEl || !gpuPctEl || !summaryEl) return;

    const cpu = bottleneckCpus.find((p) => p.id === cpuPick.dataset.value);
    const gpu = bottleneckGpus.find((p) => p.id === gpuPick.dataset.value);

    if (!cpu || !gpu) {
        cpuBar.style.width = '0%';
        gpuBar.style.width = '0%';
        cpuPctEl.textContent = '0%';
        gpuPctEl.textContent = '0%';
        summaryEl.textContent = 'Select a CPU and GPU to see an estimate.';
        updateBottleneckRecommendation(null, null, { cpuPct: 0, gpuPct: 0 });
        return;
    }

    const bottleneckResult = calculateBottleneck(cpu.score, gpu.score, getBottleneckResolutionKey());
    const { cpuPct, gpuPct, summary } = bottleneckResult;
    cpuBar.style.width = `${cpuPct}%`;
    gpuBar.style.width = `${gpuPct}%`;
    cpuPctEl.textContent = `${cpuPct}%`;
    gpuPctEl.textContent = `${gpuPct}%`;
    summaryEl.textContent = summary;
    updateBottleneckRecommendation(cpu, gpu, bottleneckResult);
}

function parseDpiValue(raw) {
    const normalized = String(raw || '').trim().replace(',', '.');
    if (!normalized) return null;
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
}

function sanitizeToolNumericInput(raw, { allowDecimal = false } = {}) {
    const str = String(raw ?? '');
    let out = '';
    let hasDot = false;

    for (let i = 0; i < str.length; i += 1) {
        const ch = str[i];
        if (ch >= '0' && ch <= '9') {
            out += ch;
            continue;
        }
        if (ch === '-') {
            if (out.length === 0) out += ch;
            continue;
        }
        if (allowDecimal && (ch === '.' || ch === ',') && !hasDot) {
            out += '.';
            hasDot = true;
        }
    }

    return out;
}

function bindToolFieldLiveUpdate(input, handler) {
    if (!input || !handler) return;
    input.addEventListener('input', handler);
    input.addEventListener('keyup', handler);
}

function bindNumericToolFieldLiveUpdate(input, handler, options = {}) {
    if (!input || !handler) return;
    const onInput = () => {
        const prev = input.value;
        const next = sanitizeToolNumericInput(prev, options);
        if (next !== prev) {
            const pos = input.selectionStart;
            input.value = next;
            const newPos = Math.max(0, Math.min(typeof pos === 'number' ? pos : next.length, next.length));
            try {
                input.setSelectionRange(newPos, newPos);
            } catch {}
        }
        handler();
    };
    input.addEventListener('input', onInput);
    input.addEventListener('keyup', handler);
}

function sensitivityFeelLabel(cm360) {
    if (cm360 == null || !Number.isFinite(cm360)) return '—';
    if (cm360 < 30) return 'High sens';
    if (cm360 <= 50) return 'Medium sens';
    return 'Slow sens';
}

function sensFmt(n, digits = 4) {
    if (!Number.isFinite(n)) return '—';
    const fixed = n.toFixed(digits);
    return fixed.replace(/\.?0+$/, '');
}

function resetSensitivityResults(message) {
    const resultEl = document.getElementById('sens-result-value');
    const labelsRow = document.getElementById('sens-game-labels');
    const fromLabel = document.getElementById('sens-from-label');
    const toLabel = document.getElementById('sens-to-label');
    const analysisEl = document.getElementById('sens-analysis');
    const edpiEl = document.getElementById('sens-edpi-from');
    const cm360El = document.getElementById('sens-cm360');
    const feelEl = document.getElementById('sens-feel');
    if (resultEl) resultEl.textContent = '—';
    if (labelsRow) labelsRow.classList.add('hidden');
    if (fromLabel) fromLabel.textContent = '';
    if (toLabel) toLabel.textContent = '';
    if (analysisEl) analysisEl.textContent = message;
    if (edpiEl) edpiEl.textContent = '—';
    if (cm360El) cm360El.textContent = '—';
    if (feelEl) feelEl.textContent = '—';
    syncToolResultCopyButton('sens-result-value', 'sens-result-copy-btn');
}

function updateSensitivityConversion() {
    const fromPick = document.getElementById('sens-from-pick');
    const toPick = document.getElementById('sens-to-pick');
    const valueInput = document.getElementById('sens-from-value');
    const fromDpiInput = document.getElementById('sens-from-dpi');
    const toDpiInput = document.getElementById('sens-to-dpi');
    const resultEl = document.getElementById('sens-result-value');
    const labelsRow = document.getElementById('sens-game-labels');
    const fromLabel = document.getElementById('sens-from-label');
    const toLabel = document.getElementById('sens-to-label');
    const analysisEl = document.getElementById('sens-analysis');
    const edpiEl = document.getElementById('sens-edpi-from');
    const cm360El = document.getElementById('sens-cm360');
    const feelEl = document.getElementById('sens-feel');
    if (!fromPick || !toPick || !valueInput || !resultEl || !analysisEl) return;

    const fromGame = getSensGameFromPick(fromPick);
    const toGame = getSensGameFromPick(toPick);
    const fromSens = parseDecimalInput(valueInput.value);
    const fromDpiRaw = fromDpiInput ? parseDpiValue(fromDpiInput.value) : null;
    const toDpiRaw = toDpiInput ? parseDpiValue(toDpiInput.value) : null;

    if (!fromGame || !toGame) {
        resetSensitivityResults('Choose a source and target game to convert.');
        return;
    }

    if (labelsRow) labelsRow.classList.remove('hidden');
    if (fromLabel) fromLabel.textContent = fromGame.name;
    if (toLabel) toLabel.textContent = toGame.name;

    if (!Number.isFinite(fromSens) || fromSens <= 0) {
        resetSensitivityResults(`Enter your ${fromGame.name} sensitivity to convert to ${toGame.name}.`);
        if (labelsRow) labelsRow.classList.remove('hidden');
        if (fromLabel) fromLabel.textContent = fromGame.name;
        if (toLabel) toLabel.textContent = toGame.name;
        return;
    }

    if (fromDpiRaw == null) {
        resetSensitivityResults(
            fromDpiInput && String(fromDpiInput.value || '').trim()
                ? 'Enter a valid From DPI (positive number).'
                : 'Enter From DPI to convert.',
        );
        if (labelsRow) labelsRow.classList.remove('hidden');
        if (fromLabel) fromLabel.textContent = fromGame.name;
        if (toLabel) toLabel.textContent = toGame.name;
        return;
    }
    if (toDpiRaw == null) {
        resetSensitivityResults(
            toDpiInput && String(toDpiInput.value || '').trim()
                ? 'Enter a valid To DPI (positive number).'
                : 'Enter To DPI to convert.',
        );
        if (labelsRow) labelsRow.classList.remove('hidden');
        if (fromLabel) fromLabel.textContent = fromGame.name;
        if (toLabel) toLabel.textContent = toGame.name;
        return;
    }

    const fromDpi = fromDpiRaw;
    const toDpi = toDpiRaw;

    let toSensRaw = convertSensitivity(fromSens, fromGame, toGame, fromDpi, toDpi);
    if (toSensRaw == null || !Number.isFinite(toSensRaw)) {
        resetSensitivityResults('Could not convert with the selected games.');
        if (labelsRow) labelsRow.classList.remove('hidden');
        if (fromLabel) fromLabel.textContent = fromGame.name;
        if (toLabel) toLabel.textContent = toGame.name;
        return;
    }
    if (toSensRaw < 0 && toSensRaw > -1e-9) toSensRaw = 0;
    if (toSensRaw < 0) {
        resetSensitivityResults('Could not convert with the selected games.');
        if (labelsRow) labelsRow.classList.remove('hidden');
        if (fromLabel) fromLabel.textContent = fromGame.name;
        if (toLabel) toLabel.textContent = toGame.name;
        return;
    }

    const toSens = snapToSensStep(toSensRaw, toGame.sens && toGame.sens.step);
    const edpiFrom = fromSens * fromDpi;
    const fromDpc = gameDpc(fromGame, fromSens);
    let cm360 = fromDpc != null ? cm360FromDpc(fromDpc, fromDpi) : null;
    if (cm360 == null) cm360 = calculateGameCm360Value(toGame, toSens, toDpi);
    const feel = sensitivityFeelLabel(cm360);

    resultEl.textContent = formatConvertedSensitivity(toSens, toGame);
    if (analysisEl) {
        analysisEl.textContent = cm360 == null
            ? `Same feel at ${Math.round(toDpi)} DPI`
            : `Same feel at ${Math.round(toDpi)} DPI · ${formatCm360Number(cm360)} cm per 360°`;
    }
    if (edpiEl) edpiEl.textContent = sensFmt(edpiFrom, 2);
    if (cm360El) cm360El.textContent = formatCm360Number(cm360);
    if (feelEl) feelEl.textContent = feel;
    syncToolResultCopyButton('sens-result-value', 'sens-result-copy-btn');
}

function initSensitivityConverter() {
    initToolPicklistDismiss();

    if (window.__sensitivityConverterMounted) return;

    const onChange = () => updateSensitivityConversion();
    const picklistGames = buildSensGamePicklistParts();

    initToolPicklist(document.getElementById('sens-from-pick'), picklistGames, {
        onChange,
        emptyMessage: "Couldn't find that game",
    });
    initToolPicklist(document.getElementById('sens-to-pick'), picklistGames, {
        onChange,
        emptyMessage: "Couldn't find that game",
    });

    const valueInput = document.getElementById('sens-from-value');
    const fromDpiInput = document.getElementById('sens-from-dpi');
    const toDpiInput = document.getElementById('sens-to-dpi');
    bindNumericToolFieldLiveUpdate(valueInput, onChange, { allowDecimal: true });
    bindNumericToolFieldLiveUpdate(fromDpiInput, onChange);
    bindNumericToolFieldLiveUpdate(toDpiInput, onChange);

    const swapBtn = document.getElementById('sens-swap-btn');
    if (swapBtn) swapBtn.addEventListener('click', swapSensitivityGamesAndDpi);

    window.__sensitivityConverterMounted = true;
    updateSensitivityConversion();
}

function resetEdpiResults(message) {
    const resultEl = document.getElementById('edpi-result-value');
    const gameLabel = document.getElementById('edpi-game-label');
    const analysisEl = document.getElementById('edpi-analysis');
    const formulaEl = document.getElementById('edpi-formula');
    const cm360El = document.getElementById('edpi-cm360');
    const feelEl = document.getElementById('edpi-feel');
    if (resultEl) resultEl.textContent = '—';
    if (gameLabel) gameLabel.textContent = '';
    if (analysisEl) analysisEl.textContent = message;
    if (formulaEl) formulaEl.textContent = '—';
    if (cm360El) cm360El.textContent = '—';
    if (feelEl) feelEl.textContent = '—';
    syncToolResultCopyButton('edpi-result-value', 'edpi-result-copy-btn');
}

function updateEdpiCalculation() {
    const gamePick = document.getElementById('edpi-game-pick');
    const sensInput = document.getElementById('edpi-sens-value');
    const dpiInput = document.getElementById('edpi-dpi-value');
    const resultEl = document.getElementById('edpi-result-value');
    const gameLabel = document.getElementById('edpi-game-label');
    const analysisEl = document.getElementById('edpi-analysis');
    const formulaEl = document.getElementById('edpi-formula');
    const cm360El = document.getElementById('edpi-cm360');
    const feelEl = document.getElementById('edpi-feel');
    if (!sensInput || !dpiInput || !resultEl || !analysisEl) return;

    const game = gamePick ? getSensGameFromPick(gamePick) : null;
    const sens = parseDecimalInput(sensInput.value);
    const dpiRaw = parseDpiValue(dpiInput.value);

    if (dpiRaw == null) {
        resetEdpiResults(
            String(dpiInput.value || '').trim()
                ? 'Enter a valid DPI (positive number).'
                : 'Enter DPI and sensitivity to calculate eDPI.',
        );
        return;
    }

    if (!Number.isFinite(sens) || sens <= 0) {
        resetEdpiResults(
            String(sensInput.value || '').trim()
                ? 'Enter a valid sensitivity (positive number).'
                : 'Enter DPI and sensitivity to calculate eDPI.',
        );
        return;
    }

    const dpi = dpiRaw;
    const edpi = sens * dpi;
    const cm360 = game ? calculateGameCm360Value(game, sens, dpi) : null;
    const feel = sensitivityFeelLabel(cm360);

    resultEl.textContent = sensFmt(edpi, 2);
    if (gameLabel) gameLabel.textContent = game ? game.name : 'No game selected';
    if (formulaEl) formulaEl.textContent = `${Math.round(dpi)} × ${sensFmt(sens, 5)}`;
    if (cm360El) cm360El.textContent = formatCm360Number(cm360);
    if (feelEl) feelEl.textContent = feel;
    if (analysisEl) {
        analysisEl.textContent = cm360 == null
            ? 'eDPI = DPI × sensitivity. Pick a game to unlock cm/360 and feel.'
            : `${formatCm360Number(cm360)} cm per 360° · ${feel}`;
    }

    syncToolResultCopyButton('edpi-result-value', 'edpi-result-copy-btn');
}

function initEdpiCalculator() {
    initToolPicklistDismiss();

    if (window.__edpiCalculatorMounted) return;

    const onChange = () => updateEdpiCalculation();
    const picklistGames = buildSensGamePicklistParts();

    initToolPicklist(document.getElementById('edpi-game-pick'), picklistGames, {
        onChange,
        emptyMessage: "Couldn't find that game",
    });

    const sensInput = document.getElementById('edpi-sens-value');
    const dpiInput = document.getElementById('edpi-dpi-value');
    bindNumericToolFieldLiveUpdate(sensInput, onChange, { allowDecimal: true });
    bindNumericToolFieldLiveUpdate(dpiInput, onChange);

    window.__edpiCalculatorMounted = true;
    updateEdpiCalculation();
}

async function initBottleneckChecker() {
    initBottleneckResolutionGlide();
    initToolPicklistDismiss();

    if (window.__bottleneckPicklistsMounted) return;

    setBottleneckPartsLoading(true);
    try {
        const parts = await fetchBottleneckParts();
        bottleneckCpus = parts.cpus;
        bottleneckGpus = parts.gpus;
    } catch (error) {
        console.error(error);
        bottleneckCpus = [];
        bottleneckGpus = [];
    } finally {
        setBottleneckPartsLoading(false);
        mountBottleneckPicklists();
        initBottleneckHardwareDetect();
        updateBottleneckChart();
        window.__bottleneckPicklistsMounted = true;
    }
}

function mainPageKeyForSidebarTab(tabType) {
    if (tabType === 'apps') return 'apps';
    return 'default';
}

function renderAppCard(app) {
    return `
        <article class="app-card bg-matte-900 rounded-lg p-5 flex flex-col gap-3 h-full">
            <div class="flex items-start justify-between gap-3">
                <div class="w-11 h-11 rounded-lg bg-matte-800 border border-matte-700 flex items-center justify-center shrink-0 text-redneon-500">
                    <i class="fa-solid ${app.icon} text-lg" aria-hidden="true"></i>
                </div>
                <span class="text-[10px] font-bold tracking-widest uppercase text-slate-500 border border-matte-700 rounded-lg px-2 py-1 shrink-0">${app.status}</span>
            </div>
            <div class="min-w-0">
                <h3 class="text-sm font-bold tracking-widest uppercase text-white">${app.name}</h3>
                <p class="text-xs text-slate-400 mt-2 tracking-wide leading-snug">${app.summary}</p>
            </div>
            <ul class="text-xs text-slate-300 space-y-2 tracking-wide leading-snug list-none pl-0">
                ${app.features.map((line) => `
                    <li class="flex gap-2">
                        <span class="text-redneon-500 shrink-0" aria-hidden="true">—</span>
                        <span>${line}</span>
                    </li>
                `).join('')}
            </ul>
        </article>`;
}

function renderAppsCatalog() {
    const catalogEl = document.getElementById('apps-catalog');
    if (!catalogEl) return;
    catalogEl.innerHTML = appsCatalog.map((app) => renderAppCard(app)).join('');
}

function renderBrandColorRow(color) {
    return `
        <div class="brand-color-row bg-matte-900 rounded-lg p-4 flex flex-col gap-3 h-full">
            <div class="w-full h-16 rounded-lg border border-matte-700 shrink-0" style="background-color: ${color.hex};" aria-hidden="true"></div>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-bold tracking-widest uppercase text-white">${color.name}</p>
                <p class="text-xs text-slate-500 mt-1 tracking-wide leading-snug">${color.usage}</p>
            </div>
            <div class="flex items-center justify-between gap-2 mt-auto">
                <p class="text-sm text-slate-300 font-semibold tracking-wider uppercase truncate">${color.hex}</p>
                <span class="brand-copy-btn-host shrink-0">
                    <button type="button" onclick="copyBrandColor('${color.hex}', this)" class="brand-copy-btn ui-interactive w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-redneon-500 hover:bg-matte-800" aria-label="Copy ${color.hex}">
                    <i class="fa-solid fa-copy text-sm"></i>
                </button>
                </span>
            </div>
        </div>`;
}

function renderBrandColorCenteredRow(colors) {
    if (!colors.length) return '';
    return `<div class="brand-color-list-centered-row col-span-3">${colors.map((color) => renderBrandColorRow(color)).join('')}</div>`;
}

function renderBrandColorList() {
    const listEl = document.getElementById('brand-color-list');
    if (!listEl) return;
    const topRow = brandColors.slice(0, 3);
    const middleRow = brandColors.slice(3, 5);
    const bottomRow = brandColors.slice(5, 8);
    listEl.innerHTML = topRow.map((color) => renderBrandColorRow(color)).join('')
        + renderBrandColorCenteredRow(middleRow)
        + renderBrandColorCenteredRow(bottomRow);
}

function slugifyBrandName(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

let brandLogoPreviewIndex = null;
let brandLogoModalCloseTimer = null;
let brandLogoImageCache = null;
let brandLogoImageLoading = null;

function setBrandLogoModalOpen(open) {
    const modal = document.getElementById('brand-logo-modal');
    const closeBtn = document.getElementById('brand-logo-modal-close');
    if (!modal) return;

    clearTimeout(brandLogoModalCloseTimer);
    brandLogoModalCloseTimer = null;

    if (open) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('brand-logo-modal-open');
        if (!isReducedMotionEnabled()) void modal.offsetHeight;
        modal.classList.add('is-open');
        if (closeBtn) closeBtn.focus();
        return;
    }

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('brand-logo-modal-open');
    brandLogoPreviewIndex = null;

    const closeDelay = isReducedMotionEnabled() ? 0 : MOTION_MS;
    brandLogoModalCloseTimer = setTimeout(() => {
        modal.classList.add('hidden');
        brandLogoModalCloseTimer = null;
    }, closeDelay);
}

function loadBrandLogoImage() {
    if (brandLogoImageCache) return Promise.resolve(brandLogoImageCache);
    if (brandLogoImageLoading) return brandLogoImageLoading;
    brandLogoImageLoading = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            brandLogoImageCache = img;
            brandLogoImageLoading = null;
            resolve(img);
        };
        img.onerror = () => {
            if (!BRAND_LOGO_FALLBACK) {
                brandLogoImageLoading = null;
                reject(new Error('Logo failed to load'));
                return;
            }
            const fallback = new Image();
            fallback.crossOrigin = 'anonymous';
            fallback.onload = () => {
                brandLogoImageCache = fallback;
                brandLogoImageLoading = null;
                resolve(fallback);
            };
            fallback.onerror = () => {
                brandLogoImageLoading = null;
                reject(new Error('Logo failed to load'));
            };
            fallback.src = BRAND_LOGO_FALLBACK;
        };
        img.src = decodeURIComponent(BRAND_LOGO_SRC);
    });
    return brandLogoImageLoading;
}

function openBrandLogoPreview(index) {
    const surface = brandLogoBackgrounds[index];
    if (!surface) return;
    brandLogoPreviewIndex = index;

    const modal = document.getElementById('brand-logo-modal');
    const preview = document.getElementById('brand-logo-modal-preview');
    const img = document.getElementById('brand-logo-modal-img');
    const title = document.getElementById('brand-logo-modal-title');
    if (!modal || !preview || !img) return;

    if (title) title.textContent = `${surface.name} — Logo preview`;
    preview.style.backgroundColor = surface.hex;
    img.src = decodeURIComponent(BRAND_LOGO_SRC);
    img.alt = `Café Core logo on ${surface.name}`;
    img.onerror = () => {
        img.onerror = null;
        if (BRAND_LOGO_FALLBACK) img.src = BRAND_LOGO_FALLBACK;
        else img.hidden = true;
    };

    setBrandLogoModalOpen(true);
}

function closeBrandLogoPreview() {
    setBrandLogoModalOpen(false);
}

function drawBrandLogoComposite(ctx, surface, img, width, height) {
    ctx.fillStyle = surface.hex;
    ctx.fillRect(0, 0, width, height);
    const logoBox = height * (80 / 128);
    const scale = Math.min(logoBox / img.naturalWidth, logoBox / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const x = (width - drawW) / 2;
    const y = (height - drawH) / 2;
    ctx.drawImage(img, x, y, drawW, drawH);
}

async function downloadBrandLogoPreview() {
    if (brandLogoPreviewIndex === null) return;
    const surface = brandLogoBackgrounds[brandLogoPreviewIndex];
    if (!surface) return;

    let img;
    try {
        img = await loadBrandLogoImage();
    } catch {
        return;
    }

    const width = 960;
    const height = 384;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
        drawBrandLogoComposite(ctx, surface, img, width, height);
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png');
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cafe-core-logo-${slugifyBrandName(surface.name)}.png`;
        link.click();
        URL.revokeObjectURL(url);
    } catch {
        const link = document.createElement('a');
        link.href = img.src;
        link.download = `cafe-core-logo-${slugifyBrandName(surface.name)}.png`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.click();
    }
}

function initBrandLogoPreviewModal() {
    const modal = document.getElementById('brand-logo-modal');
    const backdrop = document.getElementById('brand-logo-modal-backdrop');
    const closeBtn = document.getElementById('brand-logo-modal-close');
    const downloadBtn = document.getElementById('brand-logo-download-btn');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    document.addEventListener('click', (event) => {
        const btn = event.target.closest('.brand-logo-preview-btn');
        if (!btn) return;
        const index = Number.parseInt(btn.getAttribute('data-logo-index'), 10);
        if (!Number.isNaN(index)) openBrandLogoPreview(index);
    });

    if (backdrop) backdrop.addEventListener('click', closeBrandLogoPreview);
    if (closeBtn) closeBtn.addEventListener('click', closeBrandLogoPreview);
    if (downloadBtn) downloadBtn.addEventListener('click', () => downloadBrandLogoPreview());
}

function renderBrandLogoRow(surface, index) {
    return `
        <div class="brand-logo-row bg-matte-900 rounded-lg p-4 flex flex-col gap-3">
            <div class="brand-logo-preview w-full h-32 rounded-lg border border-matte-700 flex items-center justify-center" style="background-color: ${surface.hex};">
                <img src="${BRAND_LOGO_SRC}" alt="Café Core logo on ${surface.name}" class="brand-logo-preview-img w-20 h-20 object-contain" onerror="this.onerror=null; this.src='${BRAND_LOGO_FALLBACK}';">
        </div>
            <button type="button" class="brand-logo-preview-btn ui-interactive w-full h-10 rounded-lg bg-matte-800 border border-matte-700 text-sm font-bold tracking-widest uppercase text-slate-300 hover:text-white hover:border-matte-700 hover:bg-matte-700" data-logo-index="${index}">
                Preview
            </button>
        </div>`;
}

function renderBrandLogoCenteredRow(surfaces, startIndex) {
    if (!surfaces.length) return '';
    return `<div class="brand-logo-list-centered-row col-span-3">${surfaces.map((surface, i) => renderBrandLogoRow(surface, startIndex + i)).join('')}</div>`;
}

function renderBrandLogoList() {
    const listEl = document.getElementById('brand-logo-list');
    if (!listEl) return;
    const topRow = brandLogoBackgrounds.slice(0, 2);
    const bottomRow = brandLogoBackgrounds.slice(2, 3);
    listEl.innerHTML = renderBrandLogoCenteredRow(topRow, 0) + renderBrandLogoCenteredRow(bottomRow, 2);
}

function setBrandCopyBtnCopied(buttonEl, copied) {
    if (!buttonEl) return;
    const icon = buttonEl.querySelector('i');
    const label = buttonEl.querySelector('.tool-result-copy-label');
    buttonEl.classList.toggle('copied', copied);
    if (label) {
        const defaultLabel = label.dataset.defaultLabel || label.textContent.trim() || 'Copy result';
        if (!label.dataset.defaultLabel) label.dataset.defaultLabel = defaultLabel;
        label.textContent = copied ? 'Copied' : defaultLabel;
    }
    if (!icon) return;
    icon.classList.toggle('fa-copy', !copied);
    icon.classList.toggle('fa-check', copied);
}

function copyTextWithButtonFeedback(text, buttonEl) {
    if (!buttonEl || buttonEl.disabled || buttonEl.classList.contains('copied')) return;

    setBrandCopyBtnCopied(buttonEl, true);
    const resetTimer = window.setTimeout(() => setBrandCopyBtnCopied(buttonEl, false), 1500);

    const finishCopy = () => {};

    const onCopyFail = () => {
        window.clearTimeout(resetTimer);
        setBrandCopyBtnCopied(buttonEl, false);
    };

    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(finishCopy).catch(() => {
            try {
                fallbackCopy(text);
                finishCopy();
            } catch {
                onCopyFail();
            }
        });
    } else {
        try {
            fallbackCopy(text);
            finishCopy();
        } catch {
            onCopyFail();
        }
    }
}

function copyBrandColor(hex, buttonEl) {
    copyTextWithButtonFeedback(hex, buttonEl);
}

function isToolResultCopyable(resultElementId) {
    const resultEl = document.getElementById(resultElementId);
    const text = resultEl?.textContent?.trim();
    return Boolean(text && text !== '—');
}

function syncToolResultCopyButton(resultElementId, buttonId) {
    const buttonEl = document.getElementById(buttonId);
    if (!buttonEl) return;
    const copyable = isToolResultCopyable(resultElementId);
    buttonEl.disabled = !copyable;
    if (!copyable) setBrandCopyBtnCopied(buttonEl, false);
}

function syncToolResultCopyButtons() {
    syncToolResultCopyButton('sens-result-value', 'sens-result-copy-btn');
    syncToolResultCopyButton('edpi-result-value', 'edpi-result-copy-btn');
}

function copyToolResultValue(resultElementId, buttonEl) {
    if (!buttonEl || buttonEl.disabled) return;
    const resultEl = document.getElementById(resultElementId);
    const text = resultEl?.textContent?.trim();
    if (!text || text === '—') return;
    copyTextWithButtonFeedback(text, buttonEl);
}

function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try {
        document.execCommand('copy');
    } finally {
        document.body.removeChild(area);
    }
}
let currentTopBarTitle = 'Home';
let currentTopBarIconClasses = 'fa-solid fa-house';
let topBarTitleAnimToken = 0;
let topBarTitleTransitionHandler = null;
const TOPBAR_ICON_UTILITIES = 'w-5 text-center shrink-0 text-sm text-redneon-500';

function getTopBarIconClassesFromEl(el) {
    if (!el) return 'fa-solid fa-house';
    const icon = el.tagName === 'I' ? el : el.querySelector('i:not(.chevron-icon)');
    if (!icon) return 'fa-solid fa-house';
    const skipPrefix = ['w-', 'h-', 'text-', 'flex-', 'min-', 'max-', 'opacity-', 'transition', 'group-'];
    const skipExact = new Set(['text-center', 'shrink-0', 'flex-shrink-0']);
    const faClasses = [...icon.classList].filter((c) => {
        if (skipExact.has(c)) return false;
        if (skipPrefix.some((p) => c.startsWith(p))) return false;
        return c.startsWith('fa-');
    });
    return faClasses.length ? faClasses.join(' ') : 'fa-solid fa-house';
}

function applyTopBarIcon(iconEl, iconClasses) {
    if (!iconEl) return;
    iconEl.className = `${TOPBAR_ICON_UTILITIES} ${iconClasses}`.trim();
    currentTopBarIconClasses = iconClasses;
}

function resetTopBarTitleMotion(titleRowEl) {
    if (!titleRowEl) return;
    titleRowEl.classList.remove('topbar-title-exit', 'topbar-title-enter-prep');
    titleRowEl.style.transform = '';
    titleRowEl.style.opacity = '';
}

function applyTopBarContent(titleEl, iconEl, title, iconClasses) {
    if (titleEl) titleEl.textContent = title;
    applyTopBarIcon(iconEl, iconClasses);
    currentTopBarTitle = title;
}

function setTopBarTitle(title, { animate = true, iconClasses = 'fa-solid fa-house' } = {}) {
    const titleRowEl = document.getElementById('topbar-title-row');
    const titleEl = document.getElementById('topbar-title');
    const iconEl = document.getElementById('topbar-icon');
    if (!titleRowEl || !titleEl) return;

    if (isReducedMotionEnabled()) animate = false;

    const nextTitle = title;
    const sameContent = nextTitle === currentTopBarTitle && iconClasses === currentTopBarIconClasses;
    if (!animate || sameContent) {
        topBarTitleAnimToken += 1;
        if (topBarTitleTransitionHandler) {
            titleRowEl.removeEventListener('transitionend', topBarTitleTransitionHandler);
            topBarTitleTransitionHandler = null;
        }
        applyTopBarContent(titleEl, iconEl, nextTitle, iconClasses);
        resetTopBarTitleMotion(titleRowEl);
        return;
    }

    topBarTitleAnimToken += 1;
    const token = topBarTitleAnimToken;

    if (topBarTitleTransitionHandler) {
        titleRowEl.removeEventListener('transitionend', topBarTitleTransitionHandler);
        topBarTitleTransitionHandler = null;
    }

    resetTopBarTitleMotion(titleRowEl);
    void titleRowEl.offsetHeight;
    titleRowEl.classList.add('topbar-title-exit');

    const finishExit = (e) => {
        if (token !== topBarTitleAnimToken) return;
        if (e && e.propertyName !== 'transform') return;
        titleRowEl.removeEventListener('transitionend', finishExit);
        topBarTitleTransitionHandler = null;

        applyTopBarContent(titleEl, iconEl, nextTitle, iconClasses);
        titleRowEl.classList.remove('topbar-title-exit');
        titleRowEl.classList.add('topbar-title-enter-prep');

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (token !== topBarTitleAnimToken) return;
                titleRowEl.classList.remove('topbar-title-enter-prep');
            });
        });
    };

    topBarTitleTransitionHandler = finishExit;
    titleRowEl.addEventListener('transitionend', finishExit);
    setTimeout(() => {
        if (token !== topBarTitleAnimToken) return;
        if (topBarTitleTransitionHandler !== finishExit) return;
        finishExit({ propertyName: 'transform' });
    }, motionTimeoutMs(MOTION_MS + 40));
}
let chevronRevealTimer = null;

function scheduleChevronFadeIn() {
    const aside = document.querySelector('aside');
    if (!aside) return;

    clearTimeout(chevronRevealTimer);

    if (isReducedMotionEnabled()) {
        document.body.classList.remove('chevrons-wait');
        return;
    }

    const finish = () => {
        document.body.classList.remove('chevrons-wait');
    };

    const onWidthDone = (e) => {
        if (e.target !== aside || e.propertyName !== 'width') return;
        aside.removeEventListener('transitionend', onWidthDone);
        finish();
    };

    aside.addEventListener('transitionend', onWidthDone);
    chevronRevealTimer = setTimeout(() => {
        aside.removeEventListener('transitionend', onWidthDone);
        finish();
    }, motionTimeoutMs(MOTION_MS + 20));
}

function setSidebarCollapsed(collapsed) {
    if (isCollapsed === collapsed) return;
    toggleSidebarCollapse();
}

function toggleSidebarCollapse() {
    isCollapsed = !isCollapsed;

    if (isCollapsed) {
        clearTimeout(chevronRevealTimer);
        document.body.classList.remove('chevrons-wait');
        document.body.classList.add('sidebar-collapsed');
    } else {
        document.body.classList.add('chevrons-wait');
        document.body.classList.remove('sidebar-collapsed');
        scheduleChevronFadeIn();
    }

    const toggleIcon = document.getElementById('toggle-icon');
    if (isCollapsed) {
        toggleIcon.classList.remove('fa-chevron-left');
        toggleIcon.classList.add('fa-chevron-right');
    } else {
        toggleIcon.classList.remove('fa-chevron-right');
        toggleIcon.classList.add('fa-chevron-left');
    }

    if (isCollapsed) {
        closeFlyout();
    }
    syncIndicatorWithSidebarToggle();
}

function getSidebarNavIndicatorRoot() {
    return document.getElementById('sidebar-nav-viewport');
}

function getIndicatorY(element) {
    const root = getSidebarNavIndicatorRoot();
    if (!root || !element) return 0;
    const rootRect = root.getBoundingClientRect();
    const elRect = element.getBoundingClientRect();
    return Math.round(elRect.top - rootRect.top);
}

function getIndicatorTopExitY() {
    const indicator = document.getElementById('nav-indicator');
    return indicator ? -indicator.offsetHeight : -48;
}

function getIndicatorBottomExitY() {
    const root = getSidebarNavIndicatorRoot();
    return root ? root.clientHeight : 1000;
}

function isBottomNavLink(el) {
    const bottomNav = document.getElementById('sidebar-bottom-nav');
    return !!(el && bottomNav && bottomNav.contains(el));
}

function isPrimaryNavLink(el) {
    const sidebarPrimaryNav = document.getElementById('sidebar-primary-nav');
    return !!(el && sidebarPrimaryNav && sidebarPrimaryNav.contains(el));
}

function isNavCrossGroup(fromEl, toEl) {
    if (!fromEl || !toEl || fromEl === toEl) return false;
    return (isBottomNavLink(fromEl) && isPrimaryNavLink(toEl))
        || (isPrimaryNavLink(fromEl) && isBottomNavLink(toEl));
}

function applyIndicatorSize() {
    const navIndicator = document.getElementById('nav-indicator');
    if (!navIndicator) return;
    navIndicator.style.width = '';
    navIndicator.style.left = '';
    navIndicator.style.right = '';
}

function setIndicatorY(y, { animate = true } = {}) {
    const navIndicator = document.getElementById('nav-indicator');
    if (!navIndicator) return;
    const yPx = Math.round(y);
    if (!animate) {
        navIndicator.style.transition = INDICATOR_LAYOUT_TRANSITION;
        navIndicator.style.transform = `translate3d(0, ${yPx}px, 0)`;
        void navIndicator.offsetHeight;
        navIndicator.style.transition = MOTION_TRANSITION;
    } else {
        navIndicator.style.transform = `translate3d(0, ${yPx}px, 0)`;
    }
}

function syncIndicatorWithSidebarToggle() {
    const navIndicator = document.getElementById('nav-indicator');
    const aside = document.getElementById('sidebar');
    const currentActive = selectedSidebarBtn
        || document.querySelector('.nav-btn.active-tab');
    if (!navIndicator || !currentActive) return;

    navIndicator.style.opacity = '1';
    updateIndicator(currentActive, { animate: true });

    if (!aside) return;

    const settle = () => {
        updateIndicator(currentActive, { animate: false });
    };

    if (isReducedMotionEnabled()) {
        settle();
        return;
    }

    const onWidthDone = (e) => {
        if (e.target !== aside || e.propertyName !== 'width') return;
        aside.removeEventListener('transitionend', onWidthDone);
        settle();
    };

    aside.addEventListener('transitionend', onWidthDone);
    setTimeout(() => {
        aside.removeEventListener('transitionend', onWidthDone);
        settle();
    }, motionTimeoutMs(MOTION_MS + 20));
}

function updateIndicator(element, options = {}) {
    const navIndicator = document.getElementById('nav-indicator');
    if (!navIndicator || !element) return;
    let { fromEl = null, animate = true } = options;
    if (isReducedMotionEnabled()) animate = false;
    const targetY = getIndicatorY(element);
    navIndicator.style.height = `${element.offsetHeight}px`;
    applyIndicatorSize();

    const crossing = animate && isNavCrossGroup(fromEl, element);
    if (!crossing) {
        indicatorAnimToken += 1;
        setIndicatorY(targetY, { animate });
        return;
    }

    const token = ++indicatorAnimToken;
    const goingToBottom = isBottomNavLink(element);
    const exitY = goingToBottom ? getIndicatorTopExitY() : getIndicatorBottomExitY();
    const enterY = goingToBottom ? getIndicatorBottomExitY() : getIndicatorTopExitY();

    setIndicatorY(exitY, { animate: true });

    const onExitEnd = (e) => {
        if (e.propertyName && e.propertyName !== 'transform') return;
        navIndicator.removeEventListener('transitionend', onExitEnd);
        if (token !== indicatorAnimToken) return;
        applyIndicatorSize();
        setIndicatorY(enterY, { animate: false });
        requestAnimationFrame(() => {
            if (token !== indicatorAnimToken) return;
            setIndicatorY(getIndicatorY(element), { animate: true });
        });
    };
    navIndicator.addEventListener('transitionend', onExitEnd);
}

function getFlyoutIndicatorY(element) {
    return Math.round(element.offsetTop);
}

const FLYOUT_LEGAL_ITEM_BUTTON_IDS = {
    'more-privacy-policy': 'flyout-privacy-policy',
    'more-terms-of-service': 'flyout-terms-of-service',
};

function setFlyoutItemActiveVisual(itemEl, active) {
    if (!itemEl) return;
    const icon = itemEl.querySelector('i');
    if (active) {
        itemEl.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-matte-800');
        itemEl.classList.add('active-flyout', 'text-redneon-500');
        if (icon) {
            icon.classList.remove('text-slate-400', 'group-hover:text-white');
            icon.classList.add('text-redneon-500');
        }
        return;
    }
    itemEl.classList.remove('active-flyout', 'text-redneon-500');
    itemEl.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-matte-800');
    if (icon) {
        icon.classList.remove('text-redneon-500');
        icon.classList.add('text-slate-400', 'group-hover:text-white');
    }
}

function updateFlyoutIndicator(element) {
    const flyoutContent = document.getElementById('flyout-content');
    const flyoutIndicator = document.getElementById('flyout-indicator');
    if (!flyoutContent || !flyoutIndicator) return;

    if (!element) {
        flyoutContent.classList.remove('has-flyout-selection');
        return;
    }

    flyoutContent.classList.add('has-flyout-selection');
    flyoutIndicator.style.height = `${element.offsetHeight}px`;
    flyoutIndicator.style.transform = `translate3d(0, ${getFlyoutIndicatorY(element)}px, 0)`;
}

function updateFlyoutFooterIndicator(element) {
    const flyoutFooter = document.getElementById('flyout-footer');
    const flyoutFooterIndicator = document.getElementById('flyout-footer-indicator');
    if (!flyoutFooter || !flyoutFooterIndicator) return;

    if (!element) {
        flyoutFooter.classList.remove('has-flyout-selection');
        return;
    }

    flyoutFooter.classList.add('has-flyout-selection');
    flyoutFooterIndicator.style.height = `${element.offsetHeight}px`;
    flyoutFooterIndicator.style.transform = `translate3d(0, ${getFlyoutIndicatorY(element)}px, 0)`;
}

function syncFlyoutFooterLegalSelection() {
    const flyoutFooter = document.getElementById('flyout-footer');
    if (!flyoutFooter) return;

    flyoutFooter.querySelectorAll('.flyout-item').forEach((item) => {
        setFlyoutItemActiveVisual(item, false);
    });
    updateFlyoutFooterIndicator(null);

    const buttonId = FLYOUT_LEGAL_ITEM_BUTTON_IDS[selectedFlyoutItem];
    if (!buttonId) return;

    const activeBtn = document.getElementById(buttonId);
    if (!activeBtn) return;

    setFlyoutItemActiveVisual(activeBtn, true);
    updateFlyoutFooterIndicator(activeBtn);
}

function setFlyoutLegalFooterVisible(visible) {
    const footer = document.getElementById('flyout-footer');
    if (!footer) return;
    footer.classList.toggle('hidden', !visible);
}

function quoteJsSingleQuoted(value) {
    return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function openFlyout(type, parentBtn) {
    const flyout = document.getElementById('flyout-panel');
    const titleEl = document.getElementById('flyout-title');
    const contentEl = document.getElementById('flyout-content');
    const flyoutIndicator = document.getElementById('flyout-indicator');

    if (!flyoutData[type]) return;

    setFlyoutLegalFooterVisible(type === 'more');

    titleEl.textContent = flyoutData[type].title;
    const indicatorMarkup = flyoutIndicator ? flyoutIndicator.outerHTML : '';
    contentEl.innerHTML = indicatorMarkup + flyoutData[type].items.map(item => {
        const navDisabled = !item.href && isFlyoutItemNavDisabled(item.id);
        const isSelected = !item.href && !navDisabled && selectedFlyoutItem === item.id;
        const iconFamily = item.iconFamily || 'fa-solid';
        const itemClasses = `flyout-item group relative z-10 w-full h-12 flex items-center space-x-2 px-4 rounded-lg text-slate-400 hover:text-white hover:bg-matte-800 text-left${navDisabled ? ' flyout-item--disabled is-nav-disabled' : ''}${isSelected ? ' active-flyout' : ''}`;
        const iconMarkup = `<i class="${iconFamily} ${item.icon} w-5 text-center flex-shrink-0 ${isSelected ? 'text-redneon-500' : 'text-slate-400 group-hover:text-white'}"></i>`;
        if (item.href) {
            return `
            <a href="${item.href}" target="_blank" rel="noopener noreferrer" onclick="closeFlyout()" class="${itemClasses}">
                ${iconMarkup}
                <span>${item.name}</span>
            </a>
        `;
        }
        if (navDisabled) {
            return `
            <button type="button" disabled class="${itemClasses}" aria-disabled="true">
                ${iconMarkup}
                <span>${escapeHtmlAttr(item.name)}</span>
            </button>
        `;
        }
        return `
            <button type="button" onclick="selectFlyoutItem('${item.id}', ${quoteJsSingleQuoted(item.name)})" class="${itemClasses}">
                ${iconMarkup}
                <span>${escapeHtmlAttr(item.name)}</span>
            </button>
        `;
    }).join('');

    const selectedBtn = selectedFlyoutItem
        ? contentEl.querySelector('.flyout-item.active-flyout')
        : null;
    if (type === 'more') {
        syncFlyoutFooterLegalSelection();
        if (FLYOUT_LEGAL_ITEM_BUTTON_IDS[selectedFlyoutItem]) {
            updateFlyoutIndicator(null);
        } else {
            updateFlyoutFooterIndicator(null);
    updateFlyoutIndicator(selectedBtn || null);
        }
    } else {
        updateFlyoutFooterIndicator(null);
        updateFlyoutIndicator(selectedBtn || null);
    }

    flyout.classList.remove('-translate-x-full', 'opacity-0', 'pointer-events-none');
    flyout.classList.add('translate-x-0', 'opacity-100');
    flyout.setAttribute('aria-hidden', 'false');
    
    activeFlyoutType = type;
    activeFlyoutParentBtn = parentBtn;

    const chevron = parentBtn.querySelector('.chevron-icon');
    if (chevron) chevron.classList.add('rotate-90');
}

function closeFlyout() {
    const flyout = document.getElementById('flyout-panel');
    setFlyoutLegalFooterVisible(false);
    flyout.classList.add('-translate-x-full', 'opacity-0', 'pointer-events-none');
    flyout.classList.remove('translate-x-0', 'opacity-100');
    flyout.setAttribute('aria-hidden', 'true');

    if (activeFlyoutParentBtn) {
        const chevron = activeFlyoutParentBtn.querySelector('.chevron-icon');
        if (chevron) chevron.classList.remove('rotate-90');
    }

    activeFlyoutType = null;
    activeFlyoutParentBtn = null;
}

const SETTINGS_STORAGE_KEY = 'cafeCoreSettings';

const defaultSettings = {
    compactSidebar: null,
    reducedMotion: false,
};

let appSettings = { ...defaultSettings };
let settingsModalOpen = false;
let settingsModalCloseTimer = null;

function isReducedMotionEnabled() {
    return !!appSettings.reducedMotion;
}

function motionTimeoutMs(fallbackMs = MOTION_MS) {
    return isReducedMotionEnabled() ? 0 : fallbackMs;
}

function snapUiMotionInstant() {
    document.body.classList.remove('chevrons-wait');
    resetTopBarTitleMotion(document.getElementById('topbar-title-row'));
    const currentActive = selectedSidebarBtn || document.querySelector('.nav-btn.active-tab');
    if (currentActive) updateIndicator(currentActive, { animate: false });
}

function loadAppSettings() {
    const parsed = CoreStorage.readJson(SETTINGS_STORAGE_KEY);
    if (!parsed || typeof parsed !== 'object') return { ...defaultSettings };
    return {
        compactSidebar: typeof parsed.compactSidebar === 'boolean' ? parsed.compactSidebar : null,
        reducedMotion: !!parsed.reducedMotion,
    };
}

function saveAppSettings() {
    CoreStorage.writeJson(SETTINGS_STORAGE_KEY, appSettings);
}

function syncSettingsToggle(buttonEl, enabled) {
    if (!buttonEl) return;
    buttonEl.setAttribute('aria-checked', enabled ? 'true' : 'false');
    buttonEl.classList.toggle('settings-toggle-on', enabled);
}

function applyAppSettings() {
    syncSettingsToggle(document.getElementById('settings-compact-sidebar'), appSettings.compactSidebar === true);
    syncSettingsToggle(document.getElementById('settings-reduced-motion'), appSettings.reducedMotion);
    document.documentElement.classList.toggle('reduce-motion', appSettings.reducedMotion);
    if (appSettings.reducedMotion) snapUiMotionInstant();
    if (currentMainPageKey === 'default') {
        if (appSettings.reducedMotion) destroyHomeFeatureCardTilt();
        else initHomeFeatureCardTilt();
    }
    if (isMobileLayout()) {
        document.body.classList.remove('sidebar-collapsed');
    } else if (appSettings.compactSidebar === true) {
        setSidebarCollapsed(true);
    } else if (appSettings.compactSidebar === false) {
        setSidebarCollapsed(false);
    }
}

const MOBILE_LAYOUT_MQ = window.matchMedia('(max-width: 767px)');

function isMobileLayout() {
    return MOBILE_LAYOUT_MQ.matches;
}

function syncMobileMenuButton() {
    const btn = document.getElementById('mobile-menu-btn');
    const icon = document.getElementById('mobile-menu-icon');
    const open = document.body.classList.contains('mobile-nav-open');
    if (btn) {
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    if (icon) {
        icon.classList.toggle('fa-bars', !open);
        icon.classList.toggle('fa-xmark', open);
    }
}

function setMobileNavOpen(open) {
    if (!isMobileLayout()) {
        document.body.classList.remove('mobile-nav-open');
        syncMobileMenuButton();
        return;
    }
    document.body.classList.toggle('mobile-nav-open', open);
    const backdrop = document.getElementById('mobile-nav-backdrop');
    if (backdrop) backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    syncMobileMenuButton();
    if (!open) closeFlyout();
    if (open) {
        requestAnimationFrame(() => syncIndicatorWithSidebarToggle());
    }
}

function closeMobileNav() {
    setMobileNavOpen(false);
}

function toggleMobileNav() {
    setMobileNavOpen(!document.body.classList.contains('mobile-nav-open'));
}

function applyResponsiveLayout() {
    const mobile = isMobileLayout();
    document.body.classList.toggle('layout-mobile', mobile);
    if (!mobile) {
        closeMobileNav();
        if (appSettings.compactSidebar === true) {
            setSidebarCollapsed(true);
        } else if (appSettings.compactSidebar === false) {
            setSidebarCollapsed(false);
        }
    } else {
        document.body.classList.remove('sidebar-collapsed');
        closeMobileNav();
    }
    syncIndicatorWithSidebarToggle();
    syncMobileMenuButton();
}

function initResponsiveLayout() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const backdrop = document.getElementById('mobile-nav-backdrop');
    if (menuBtn) menuBtn.addEventListener('click', toggleMobileNav);
    if (backdrop) backdrop.addEventListener('click', closeMobileNav);

    applyResponsiveLayout();
    if (typeof MOBILE_LAYOUT_MQ.addEventListener === 'function') {
        MOBILE_LAYOUT_MQ.addEventListener('change', applyResponsiveLayout);
    } else if (typeof MOBILE_LAYOUT_MQ.addListener === 'function') {
        MOBILE_LAYOUT_MQ.addListener(applyResponsiveLayout);
    }
}

function setSettingsModalOpen(open) {
    const modal = document.getElementById('settings-modal');
    const settingsBtn = document.getElementById('btn-settings');
    if (!modal) return;

    clearTimeout(settingsModalCloseTimer);
    settingsModalCloseTimer = null;

    settingsModalOpen = open;

    if (open) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('settings-modal-open');
        if (!isReducedMotionEnabled()) void modal.offsetHeight;
        modal.classList.add('is-open');

        if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'true');

        const closeBtn = document.getElementById('settings-modal-close');
        if (closeBtn) closeBtn.focus();
        return;
    }

    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('settings-modal-open');

    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');

    const closeDelay = isReducedMotionEnabled() ? 0 : MOTION_MS;
    settingsModalCloseTimer = setTimeout(() => {
        modal.classList.add('hidden');
        settingsModalCloseTimer = null;
    }, closeDelay);
}

function closeSettingsModal() {
    if (!settingsModalOpen) return;
    setSettingsModalOpen(false);
}

function toggleSettingsModal() {
    setSettingsModalOpen(!settingsModalOpen);
}

function handleSettingsClick() {
    closeFlyout();
    closeMobileNav();
    closeLineupsVideoModal();
    toggleSettingsModal();
}

function initSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const backdrop = document.getElementById('settings-modal-backdrop');
    const closeBtn = document.getElementById('settings-modal-close');
    const compactToggle = document.getElementById('settings-compact-sidebar');
    const motionToggle = document.getElementById('settings-reduced-motion');
    if (!modal) return;

    if (backdrop) backdrop.addEventListener('click', closeSettingsModal);
    if (closeBtn) closeBtn.addEventListener('click', closeSettingsModal);

    if (compactToggle) {
        compactToggle.addEventListener('click', () => {
            if (appSettings.compactSidebar === null) {
                appSettings.compactSidebar = true;
            } else {
                appSettings.compactSidebar = !appSettings.compactSidebar;
            }
            saveAppSettings();
            applyAppSettings();
        });
    }

    if (motionToggle) {
        motionToggle.addEventListener('click', () => {
            appSettings.reducedMotion = !appSettings.reducedMotion;
            saveAppSettings();
            applyAppSettings();
        });
    }
}

function initModalEscapeClose() {
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const lineupsVideoModal = document.getElementById('lineups-video-modal');
        if (lineupsVideoModal && !lineupsVideoModal.classList.contains('hidden')) {
            const speedMenuEl = document.getElementById('lineups-player-speed-menu');
            if (speedMenuEl && !speedMenuEl.hidden) {
                closeLineupsSpeedMenu();
                return;
            }
            closeLineupsVideoModal();
            return;
        }
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal && !settingsModal.classList.contains('hidden')) {
            closeSettingsModal();
            return;
        }
        if (isMobileLayout() && document.body.classList.contains('mobile-nav-open')) {
            if (activeFlyoutType) {
                closeFlyout();
                return;
            }
            closeMobileNav();
            return;
        }
        const brandLogoModal = document.getElementById('brand-logo-modal');
        if (brandLogoModal && !brandLogoModal.classList.contains('hidden')) {
            closeBrandLogoPreview();
        }
    });
}

function handleSidebarClick(clickedBtn, tabType) {
    closeSettingsModal();
    closeLineupsVideoModal();

    if (tabType === 'tools' || tabType === 'strats' || tabType === 'more') {
        if (isMobileLayout() && !document.body.classList.contains('mobile-nav-open')) {
            setMobileNavOpen(true);
        }
        if (activeFlyoutType === tabType) {
            closeFlyout();
        } else {
            if (activeFlyoutType) closeFlyout();
            openFlyout(tabType, clickedBtn);
        }
        return;
    }

    closeFlyout();
    closeMobileNav();
    const pageKey = mainPageKeyForSidebarTab(tabType);
    const defaultStubToHub = pageKey === 'default' && isDefaultPageShowingStub();
    selectedFlyoutItem = null;

    const prevSelectedBtn = selectedSidebarBtn;

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-redneon-500', 'active-tab');
        btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-matte-800');
        const icon = btn.querySelector('i');
        if (icon) icon.classList.remove('text-redneon-500');
    });

    updateIndicator(clickedBtn, { fromEl: prevSelectedBtn, animate: true });
    selectedSidebarBtn = clickedBtn;

    clickedBtn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-matte-800');
    clickedBtn.classList.add('text-redneon-500', 'active-tab');
    const activeIcon = clickedBtn.querySelector('i');
    if (activeIcon) activeIcon.classList.add('text-redneon-500');

    setTopBarTitle(topBarLabels[tabType] || tabType, {
        iconClasses: getTopBarIconClassesFromEl(clickedBtn),
    });
    setMainPage(pageKey, { defaultStubToHub }).then(() => {
        if (!defaultStubToHub) syncPlaceholderPageView(pageKey);
    });
}

function selectFlyoutItem(itemId, itemName) {
    if (isFlyoutItemNavDisabled(itemId)) return;
    selectedFlyoutItem = itemId;

    if (activeFlyoutParentBtn) {
        const prevSelectedBtn = selectedSidebarBtn;

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('text-redneon-500', 'active-tab');
            btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-matte-800');
            const icon = btn.querySelector('i');
            if (icon) icon.classList.remove('text-redneon-500');
        });

        updateIndicator(activeFlyoutParentBtn, { fromEl: prevSelectedBtn, animate: true });
        selectedSidebarBtn = activeFlyoutParentBtn;

        selectedSidebarBtn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-matte-800');
        selectedSidebarBtn.classList.add('text-redneon-500', 'active-tab');
        const activeIcon = selectedSidebarBtn.querySelector('i');
        if (activeIcon) activeIcon.classList.add('text-redneon-500');
    }

    document.querySelectorAll('.flyout-item').forEach((btn) => {
        setFlyoutItemActiveVisual(btn, false);
    });

    const flyoutTarget = event && event.currentTarget;
    if (flyoutTarget) {
        setFlyoutItemActiveVisual(flyoutTarget, true);
        if (flyoutTarget.closest('#flyout-footer')) {
            updateFlyoutIndicator(null);
            updateFlyoutFooterIndicator(flyoutTarget);
        } else {
            updateFlyoutFooterIndicator(null);
            updateFlyoutIndicator(flyoutTarget);
        }
    }

    const flyoutBtn = flyoutTarget;
    setTopBarTitle(itemName, {
        iconClasses: getTopBarIconClassesFromEl(flyoutBtn),
    });
    const pageKey = mainPageKeyForFlyoutItem(itemId);
    setMainPage(pageKey).then(() => syncPlaceholderPageView(pageKey));
    closeFlyout();
    closeMobileNav();
}

let notifications = [];
let notificationTimeRefreshTimer = null;

function formatTimeAgo(createdAt) {
    const then = typeof createdAt === 'number' ? createdAt : Date.parse(createdAt);
    if (!then || Number.isNaN(then)) return '0s';
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    const years = Math.floor(months / 12);
    return `${years}y`;
}

function ensureNotificationCreatedAt(n) {
    if (typeof n.createdAt !== 'number' || Number.isNaN(n.createdAt)) {
        n.createdAt = Date.now();
    }
}

function updateNotificationRelativeTimes() {
    document.querySelectorAll('.notification-time[data-created-at]').forEach((el) => {
        const createdAt = Number(el.getAttribute('data-created-at'));
        el.textContent = formatTimeAgo(createdAt);
    });
}

function stopNotificationTimeRefresh() {
    if (notificationTimeRefreshTimer) {
        clearInterval(notificationTimeRefreshTimer);
        notificationTimeRefreshTimer = null;
    }
}

function startNotificationTimeRefresh() {
    stopNotificationTimeRefresh();
    updateNotificationRelativeTimes();
    notificationTimeRefreshTimer = setInterval(updateNotificationRelativeTimes, 1000);
}

function hasUnreadNotifications() {
    return notifications.some((n) => !n.read);
}

function updateNotificationDot() {
    const dotEl = document.getElementById('notification-dot');
    if (!dotEl) return;
    dotEl.classList.toggle('hidden', !hasUnreadNotifications());
}

function updateMarkAllReadButton() {
    const markReadBtn = document.getElementById('mark-notifications-read-btn');
    const clearBtn = document.getElementById('clear-notifications-btn');
    const empty = notifications.length === 0;
    if (markReadBtn) {
        markReadBtn.disabled = empty || !hasUnreadNotifications();
    }
    if (clearBtn) {
        clearBtn.disabled = empty;
    }
}

function renderNotifications() {
    const listEl = document.getElementById('notification-list');
    if (!listEl) return;

    if (notifications.length === 0) {
        listEl.innerHTML = '<div class="px-4 py-6 text-center text-xs text-slate-500">No notifications</div>';
        updateNotificationDot();
        updateMarkAllReadButton();
        return;
    }

    listEl.innerHTML = notifications.map((n) => {
        ensureNotificationCreatedAt(n);
        return `
        <button type="button" data-notification-id="${n.id}" class="notification-item ui-interactive w-full text-left px-4 py-3 hover:bg-matte-800 ${n.read ? 'opacity-60' : ''}">
            <p class="text-sm font-semibold ${n.read ? 'text-slate-400' : 'text-white'}">${n.title}</p>
            <p class="text-xs text-slate-400 mt-1 leading-relaxed">${n.body}</p>
            <p class="notification-time text-[10px] text-slate-500 mt-2 tracking-wide" data-created-at="${n.createdAt}">${formatTimeAgo(n.createdAt)}</p>
        </button>
    `;
    }).join('');

    updateNotificationDot();
    updateMarkAllReadButton();
}

function markAllNotificationsRead() {
    notifications.forEach((n) => {
        n.read = true;
    });
    renderNotifications();
}

function setNotificationDropdownOpen(open) {
    const dropdown = document.getElementById('notification-dropdown');
    const btn = document.getElementById('notification-btn');
    if (!dropdown || !btn) return;
    dropdown.classList.toggle('dropdown-open', open);
    dropdown.classList.toggle('dropdown-closed', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && notifications.length > 0) {
        startNotificationTimeRefresh();
    } else {
        stopNotificationTimeRefresh();
    }
}

function initNotifications() {
    const notificationBtn = document.getElementById('notification-btn');
    const notificationDropdown = document.getElementById('notification-dropdown');
    const clearNotificationsBtn = document.getElementById('clear-notifications-btn');
    const markNotificationsReadBtn = document.getElementById('mark-notifications-read-btn');
    const listEl = document.getElementById('notification-list');

    renderNotifications();

    listEl?.addEventListener('click', (event) => {
        const btn = event.target.closest('.notification-item[data-notification-id]');
        if (!btn) return;
        const id = btn.getAttribute('data-notification-id');
        const item = notifications.find((n) => n.id === id);
        if (item) item.read = true;
        renderNotifications();
    });

    if (notificationBtn && notificationDropdown) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = notificationDropdown.classList.contains('dropdown-open');
            setNotificationDropdownOpen(!isOpen);
        });
    }

    if (markNotificationsReadBtn) {
        markNotificationsReadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            markAllNotificationsRead();
        });
    }

    if (clearNotificationsBtn) {
        clearNotificationsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notifications = [];
            renderNotifications();
        });
    }

    document.addEventListener('click', (e) => {
        if (!notificationBtn || !notificationDropdown) return;
        if (!notificationBtn.contains(e.target) && !notificationDropdown.contains(e.target)) {
            setNotificationDropdownOpen(false);
        }
    });
}

function isTypingTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const field = el.closest('input, textarea, select');
    if (!field) return false;
    if (field.tagName === 'SELECT') return true;
    if (field.tagName === 'TEXTAREA') return true;
    const type = (field.type || 'text').toLowerCase();
    const nonTyping = new Set([
        'button', 'submit', 'reset', 'checkbox', 'radio',
        'file', 'image', 'range', 'color', 'hidden',
    ]);
    return !nonTyping.has(type);
}

function removeFromTabOrder(root = document) {
    root.querySelectorAll('a[href], button, select, summary, [tabindex]').forEach((el) => {
        if (el.matches('input, textarea')) return;
        el.setAttribute('tabindex', '-1');
    });
}

function stripHtmlTitleAttributes(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.hasAttribute('title')) root.removeAttribute('title');
    if (typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('[title]').forEach((el) => {
        el.removeAttribute('title');
    });
}

function initKeyboardRestrictions() {
    stripHtmlTitleAttributes(document.documentElement);
    removeFromTabOrder(document);

    document.addEventListener('focusin', (e) => {
        if (isTypingTarget(e.target)) return;
        if (typeof e.target.blur === 'function') e.target.blur();
    }, true);

    document.addEventListener('keydown', (e) => {
        if (isTypingTarget(e.target)) return;
        if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
        }
    }, true);

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName === 'title' && m.target?.nodeType === 1) {
                m.target.removeAttribute('title');
                continue;
            }
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                removeFromTabOrder(node);
                stripHtmlTitleAttributes(node);
            }
        }
    });
    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['title'],
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initKeyboardRestrictions();
    appSettings = loadAppSettings();
    applyAppSettings();
    initResponsiveLayout();
    initSettingsModal();
    initLineupsVideoModal();
    initModalEscapeClose();
    initBrandLogoPreviewModal();

    let initialKey = (window.pageLoader && window.pageLoader.pageKeyFromHash())
        || 'default';
    initialKey = normalizeMainPageKey(initialKey);
    if (initialKey === 'default' && (location.hash || '').replace(/^#/, '').trim().toLowerCase() === 'lineups') {
        selectedFlyoutItem = null;
        if (window.pageLoader) window.pageLoader.syncLocationHash('default');
    }

    setMainPage(initialKey).then(() => {
        syncNavUiForMainPage(initialKey, { animate: false });
        syncPlaceholderPageView(initialKey);
    });

    window.addEventListener('hashchange', () => {
        if (!window.pageLoader) return;
        let key = window.pageLoader.pageKeyFromHash() || 'default';
        key = normalizeMainPageKey(key);
        const syncNav = () => {
            syncNavUiForMainPage(key, { animate: false });
            syncPlaceholderPageView(key);
        };
        if (key !== currentMainPageKey) {
            setMainPage(key).then(syncNav);
        } else {
            syncNav();
        }
    });

    initNotifications();
});

window.CafeCore.mount('App', {
    mainPageIds,
    navigateToMainPage,
    navigateToFlyoutItem,
    BottleneckModel,
    tipsAndTricksPageEnabled: TIPS_AND_TRICKS_PAGE_ENABLED,
});
