(function () {
    const { Async, Dom, freeze } = window.CafeCore;

    const mainPagePaths = freeze({
        default: 'pages/default.html',
        apps: 'pages/apps.html',
        branding: 'pages/branding.html',
        fuziveer: 'pages/fuziveer.html',
        privacy: 'pages/privacy.html',
        terms: 'pages/terms.html',
        notes: 'pages/notes.html',
        bottleneck: 'pages/bottleneck.html',
        sensitivity: 'pages/sensitivity.html',
        edpi: 'pages/edpi.html',
        lineups: 'pages/lineups.html',
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
        await loadScript('sensitivity-engine.js');
    }

    async function ensureEdpiProGraphScript() {
        await loadScript('edpi-pro-graph.js');
    }

    async function fetchPageHtml(pageKey) {
        if (htmlCache.has(pageKey)) return htmlCache.get(pageKey);
        const path = mainPagePaths[pageKey];
        if (!path) throw new Error('Unknown page: ' + pageKey);
        const response = await fetch(path);
        if (!response.ok) throw new Error('Failed to load ' + path + ' (' + response.status + ')');
        const text = await response.text();
        htmlCache.set(pageKey, text);
        return text;
    }

    async function preparePageDependencies(pageKey) {
        if (pageKey === 'sensitivity' || pageKey === 'edpi') {
            await ensureSensitivityScripts();
        }
        if (pageKey === 'edpi') {
            await ensureEdpiProGraphScript();
        }
    }

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
        if (!next) {
            history.replaceState(null, '', location.pathname + location.search);
        } else {
            history.replaceState(null, '', location.pathname + location.search + next);
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
