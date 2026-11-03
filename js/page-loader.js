(function () {
    const { Async, Dom, freeze } = window.CafeCore;

    const mainPagePaths = freeze({
        default: 'pages/default.html',
        apps: 'pages/apps.html',
        'find-team': 'pages/find-team.html',
        branding: 'pages/branding.html',
        fuziveer: 'pages/fuziveer.html',
        'black-listed': 'pages/black-listed.html',
        privacy: 'pages/privacy.html',
        terms: 'pages/terms.html',
        notes: 'pages/notes.html',
        bottleneck: 'pages/bottleneck.html',
        sensitivity: 'pages/sensitivity.html',
        edpi: 'pages/edpi.html',
        lineups: 'pages/lineups.html',
        'aim-trainer': 'pages/aim-trainer.html',
    });

    const htmlCache = new Map();
    const loadPromises = new Map();
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

    /**
     * On http(s), prefer live pages/*.html so edits show without rebuilding.
     * On file:// (or if fetch fails), use the embedded offline bundle.
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
                /* fall through to embedded bundle */
            }
        }

        const embedded = getEmbeddedPageHtml(pageKey);
        if (embedded) {
            htmlCache.set(pageKey, embedded);
            return embedded;
        }

        throw new Error('Failed to load ' + path + ' (offline bundle missing — run node tools/embed-offline-assets.mjs)');
    }

    async function ensureFindTeamScripts() {
        await loadScript('data/find-team-games.js');
        await loadScript('js/find-team.js');
    }

    async function ensureBlackListedScripts() {
        await loadScript('data/black-listed-roster.js');
        await loadScript('js/black-listed.js');
    }

    async function preparePageDependencies(pageKey) {
        if (pageKey === 'sensitivity' || pageKey === 'edpi') {
            await ensureSensitivityScripts();
        }
        if (pageKey === 'find-team') {
            await ensureFindTeamScripts();
        }
        if (pageKey === 'black-listed') {
            await ensureBlackListedScripts();
        }
        if (pageKey === 'aim-trainer') {
            await ensureAimTrainerScripts();
        }
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

        if (loadPromises.has(pageKey)) return loadPromises.get(pageKey);

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

        loadPromises.set(pageKey, promise);
        try {
            return await promise;
        } finally {
            loadPromises.delete(pageKey);
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
        // file:// URLs need a full path base; pathname alone can break hash updates on Windows.
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

    function prefetchAllPageHtml() {
        return Promise.all(
            Object.keys(mainPagePaths).map((key) => fetchPageHtml(key).catch(() => {}))
        );
    }

    function scheduleWarmup() {
        const warmAssets = () => {
            void prefetchAllPageHtml();
            void ensureSensitivityScripts().catch(() => {});
        };
        Async.runWhenIdle(() => {
            void fetchPageHtml('default').catch(() => {});
            Async.runWhenIdle(warmAssets, { timeout: 8000 });
        }, { timeout: 4000 });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleWarmup);
    } else {
        scheduleWarmup();
    }

    const pageLoader = freeze({
        mountMainPageElement,
        unmountMainPageElement,
        pageKeyFromHash,
        syncLocationHash,
        mainPagePaths,
        prefetchAllPageHtml,
    });

    window.pageLoader = pageLoader;
    window.CafeCore.mount('PageLoader', pageLoader);
})();
