(function () {
    const { Dom, freeze } = window.CafeCore;

    const mainPagePaths = freeze({
        default: 'pages/default.html',
        apps: 'pages/apps.html',
        branding: 'pages/branding.html',
        fuziveer: 'pages/fuziveer.html',
        'black-listed': 'pages/black-listed.html',
        privacy: 'pages/privacy.html',
        terms: 'pages/terms.html',
        bottleneck: 'pages/bottleneck.html',
        sensitivity: 'pages/sensitivity.html',
        edpi: 'pages/edpi.html',
        lineups: 'pages/lineups.html',
        'aim-trainer': 'pages/aim-trainer.html',
    });

    const htmlCache = new Map();
    const mountPromises = new Map();
    const preparePromises = new Map();
    const chunkLoadPromises = new Map();
    const loadedScripts = new Set();

    function loadScript(src) {
        if (loadedScripts.has(src)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.defer = true;
            s.onload = () => {
                loadedScripts.add(src);
                resolve();
            };
            s.onerror = () => reject(new Error('Failed to load ' + src));
            document.body.appendChild(s);
        });
    }

    async function ensureSensitivityScripts() {
        await loadScript('data/sensitivity-games.js');
        await loadScript('js/sensitivity-engine.js');
    }

    function isHttpProtocol() {
        return location.protocol === 'http:' || location.protocol === 'https:';
    }

    function getEmbeddedPageHtml(pageKey) {
        const bundle = window.__CAFE_PAGE_HTML__;
        if (!bundle || typeof bundle !== 'object') return null;
        const html = bundle[pageKey];
        return typeof html === 'string' && html.length ? html : null;
    }

    async function ensureOfflinePageChunk(pageKey) {
        const cached = getEmbeddedPageHtml(pageKey);
        if (cached) return cached;

        if (chunkLoadPromises.has(pageKey)) {
            await chunkLoadPromises.get(pageKey);
            return getEmbeddedPageHtml(pageKey);
        }

        const src = `js/page-chunks/${pageKey}.js`;
        const promise = loadScript(src).finally(() => {
            chunkLoadPromises.delete(pageKey);
        });
        chunkLoadPromises.set(pageKey, promise);
        await promise;
        return getEmbeddedPageHtml(pageKey);
    }

    /**
     * On http(s), fetch only the requested pages/*.html.
     * On file:// (or if fetch fails), load one offline chunk at a time.
     */
    async function fetchPageHtml(pageKey) {
        if (htmlCache.has(pageKey)) return htmlCache.get(pageKey);
        const path = mainPagePaths[pageKey];
        if (!path) throw new Error('Unknown page: ' + pageKey);

        if (isHttpProtocol()) {
            try {
                const response = await fetch(path);
                if (response.ok) {
                    const text = await response.text();
                    htmlCache.set(pageKey, text);
                    return text;
                }
            } catch {
                /* fall through to offline chunk */
            }
        }

        const embedded = await ensureOfflinePageChunk(pageKey);
        if (embedded) {
            htmlCache.set(pageKey, embedded);
            return embedded;
        }

        throw new Error(
            'Failed to load ' + path + ' (offline chunk missing — run node tools/embed-offline-assets.mjs)'
        );
    }

    async function ensureBlackListedScripts() {
        await loadScript('data/black-listed-roster.js');
        await loadScript('js/black-listed.js');
    }

    async function preparePageDependencies(pageKey) {
        if (pageKey === 'sensitivity' || pageKey === 'edpi') {
            await ensureSensitivityScripts();
        }
        if (pageKey === 'black-listed') {
            await ensureBlackListedScripts();
        }
        if (pageKey === 'aim-trainer') {
            await ensureAimTrainerScripts();
        }
    }

    /** Fetch HTML + scripts ahead of mount (cached for instant swap). */
    async function preparePageForMount(pageKey) {
        if (!mainPagePaths[pageKey]) return;
        await preparePageDependencies(pageKey);
        await fetchPageHtml(pageKey);
    }

    function preparePageForMountWarm(pageKey) {
        if (!mainPagePaths[pageKey]) return Promise.resolve();
        if (htmlCache.has(pageKey)) return Promise.resolve();
        if (preparePromises.has(pageKey)) return preparePromises.get(pageKey);
        const promise = preparePageForMount(pageKey).catch(() => {}).finally(() => {
            preparePromises.delete(pageKey);
        });
        preparePromises.set(pageKey, promise);
        return promise;
    }

    async function ensureAimTrainerScripts() {
        if (typeof SENS_GAMES_CATALOG === 'undefined') {
            try {
                await loadScript('data/sensitivity-games.js');
            } catch {
                /* game list optional until settings opens */
            }
        }
        if (typeof gameDpc !== 'function') {
            try {
                await loadScript('js/sensitivity-engine.js');
            } catch {
                /* fallback sens math in aim-trainer */
            }
        }
        await loadScript('js/aim-trainer-settings.js');
        await loadScript('js/aim-trainer.js');
    }

    async function loadAimTrainerThree() {
        if (typeof window.THREE !== 'undefined') return;
        const sources = [
            'js/vendor/three.min.js',
            'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
        ];
        let lastError = null;
        for (const src of sources) {
            try {
                await loadScript(src);
                if (typeof window.THREE !== 'undefined') return;
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('Failed to load THREE');
    }

    window.loadAimTrainerThree = loadAimTrainerThree;

    async function mountMainPageElement(pageKey) {
        const id = window.mainPageIds && window.mainPageIds[pageKey];
        if (!id) throw new Error('Unknown page key: ' + pageKey);

        const existing = document.getElementById(id);
        if (existing) return existing;

        if (mountPromises.has(pageKey)) return mountPromises.get(pageKey);

        const promise = (async () => {
            await preparePageDependencies(pageKey);
            const html = await fetchPageHtml(pageKey);
            const host = Dom.byId('main-content');
            if (!host) throw new Error('#main-content missing');

            const tpl = document.createElement('template');
            tpl.innerHTML = html.trim();
            const el = tpl.content.firstElementChild;
            if (!el) throw new Error('Empty page fragment: ' + pageKey);
            host.appendChild(el);

            if (typeof window.initMainPage === 'function') {
                void window.initMainPage(pageKey);
            }
            return el;
        })();

        mountPromises.set(pageKey, promise);
        try {
            return await promise;
        } finally {
            mountPromises.delete(pageKey);
        }
    }

    function unmountMainPageElement(pageEl) {
        if (!pageEl || !pageEl.parentNode) return;
        let pageKey = null;
        if (window.mainPageIds) {
            for (const [key, id] of Object.entries(window.mainPageIds)) {
                if (pageEl.id === id) {
                    pageKey = key;
                    break;
                }
            }
        }
        pageEl.remove();
        if (pageKey) {
            if (typeof window.clearMainPageInitState === 'function') {
                window.clearMainPageInitState(pageKey);
            }
        }
    }

    function pageKeyFromHash() {
        const raw = (location.hash || '').replace(/^#/, '').trim().toLowerCase();
        if (!raw || raw === 'home') return 'default';
        if (window.mainPageIds && raw in window.mainPageIds) return raw;
        return null;
    }

    function hashForPageKey(pageKey) {
        if (pageKey === 'default') return '';
        return '#' + pageKey;
    }

    function syncLocationHash(pageKey) {
        const next = hashForPageKey(pageKey);
        const current = location.hash || '';
        if (next === current) return;
        const base = `${location.pathname}${location.search}` || location.href.split('#')[0];
        try {
            if (!next) {
                history.replaceState(null, '', base);
            } else {
                history.replaceState(null, '', base + next);
            }
        } catch {
            location.hash = next.replace(/^#/, '');
        }
    }

    const pageLoader = freeze({
        mountMainPageElement,
        unmountMainPageElement,
        preparePageForMount,
        preparePageForMountWarm,
        pageKeyFromHash,
        syncLocationHash,
        mainPagePaths,
    });

    window.pageLoader = pageLoader;
    window.CafeCore.mount('PageLoader', pageLoader);
})();
