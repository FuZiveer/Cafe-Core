(function (global) {
    'use strict';

    const modules = Object.create(null);

    const freeze = Object.freeze;

    const Motion = freeze({
        MS: 150,
        EASE: 'ease-out',
        get duration() {
            return `${this.MS}ms`;
        },
        transition(properties) {
            const dur = this.duration;
            const ease = this.EASE;
            return properties.map((prop) => `${prop} ${dur} ${ease}`).join(', ');
        },
        get standardTransition() {
            return this.transition(['transform', 'width', 'height', 'left', 'opacity']);
        },
        get indicatorLayoutTransition() {
            return this.transition(['width', 'height', 'left']);
        },
    });

    const Dom = freeze({
        byId(id) {
            return document.getElementById(id);
        },
        qs(selector, root = document) {
            return root.querySelector(selector);
        },
        qsa(selector, root = document) {
            return Array.from(root.querySelectorAll(selector));
        },
    });

    const Storage = freeze({
        readJson(key, fallback = null) {
            try {
                const raw = localStorage.getItem(key);
                if (raw == null) return fallback;
                return JSON.parse(raw);
            } catch {
                return fallback;
            }
        },
        writeJson(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch {
                return false;
            }
        },
    });

    const Async = freeze({
        runWhenIdle(task, options = {}) {
            const timeout = options.timeout ?? 4000;
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(task, { timeout });
            } else {
                setTimeout(task, Math.min(800, timeout));
            }
        },
        memoizePromise(factory) {
            let pending = null;
            return (...args) => {
                if (pending) return pending;
                pending = Promise.resolve()
                    .then(() => factory(...args))
                    .finally(() => {
                        pending = null;
                    });
                return pending;
            };
        },
    });

    function createGenerationToken() {
        let generation = 0;
        return freeze({
            bump() {
                generation += 1;
                return generation;
            },
            invalidate() {
                generation += 1;
            },
            isCurrent(token) {
                return token === generation;
            },
            value() {
                return generation;
            },
        });
    }

    function mount(name, exports) {
        if (!name || typeof exports !== 'object' || exports === null) {
            throw new TypeError('CafeCore.mount requires a module name and export object');
        }
        modules[name] = freeze(exports);
    }

    function getModule(name) {
        return modules[name] ?? null;
    }

    const Features = freeze({
        tipsAndTricksPage: false,
    });

    global.CafeCore = freeze({
        Motion,
        Dom,
        Storage,
        Async,
        Features,
        createGenerationToken,
        mount,
        getModule,
        freeze,
    });
})(typeof window !== 'undefined' ? window : globalThis);
