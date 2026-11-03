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
        tipsAndTricksPage: true,
    });

    const UiSound = (() => {
        const BUTTON_HOVER_SELECTOR = 'button.ui-interactive, .nav-btn, .flyout-item, label.lazer-toggle.ui-interactive';
        const MIN_INTERVAL_MS = 50;
        const PRESET_IDS = freeze(['standard', 'soft', 'bright']);
        const PRESETS = freeze({
            standard: freeze({
                hover: {
                    type: 'triangle',
                    freqStart: 1040,
                    freqEnd: 720,
                    duration: 0.065,
                    peakGain: 0.042,
                    filterHz: 2400,
                },
                toggleOn: {
                    type: 'sine',
                    freqStart: 640,
                    freqEnd: 980,
                    duration: 0.078,
                    peakGain: 0.052,
                    filterHz: 2800,
                },
                toggleOff: {
                    type: 'sine',
                    freqStart: 860,
                    freqEnd: 520,
                    duration: 0.072,
                    peakGain: 0.046,
                    filterHz: 2200,
                },
            }),
            soft: freeze({
                hover: {
                    type: 'sine',
                    freqStart: 520,
                    freqEnd: 400,
                    duration: 0.085,
                    peakGain: 0.03,
                    filterHz: 1800,
                },
                toggleOn: {
                    type: 'sine',
                    freqStart: 440,
                    freqEnd: 560,
                    duration: 0.09,
                    peakGain: 0.034,
                    filterHz: 2000,
                },
                toggleOff: {
                    type: 'sine',
                    freqStart: 540,
                    freqEnd: 380,
                    duration: 0.082,
                    peakGain: 0.03,
                    filterHz: 1800,
                },
            }),
            bright: freeze({
                hover: {
                    type: 'square',
                    freqStart: 1280,
                    freqEnd: 960,
                    duration: 0.048,
                    peakGain: 0.028,
                    filterHz: 3200,
                },
                toggleOn: {
                    type: 'triangle',
                    freqStart: 780,
                    freqEnd: 1180,
                    duration: 0.06,
                    peakGain: 0.045,
                    filterHz: 3000,
                },
                toggleOff: {
                    type: 'triangle',
                    freqStart: 1020,
                    freqEnd: 680,
                    duration: 0.055,
                    peakGain: 0.04,
                    filterHz: 2600,
                },
            }),
        });
        let audioContext = null;
        let lastHoverTarget = null;
        let lastPlayedAt = 0;

        function getActivePresetId() {
            const raw = document.documentElement.dataset.uiSoundPreset || 'standard';
            return PRESET_IDS.includes(raw) ? raw : 'standard';
        }

        function getActivePreset() {
            return PRESETS[getActivePresetId()];
        }

        function getAudioContext() {
            if (!audioContext) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return null;
                audioContext = new Ctx();
            }
            return audioContext;
        }

        function unlockAudio() {
            const ctx = getAudioContext();
            if (ctx && ctx.state === 'suspended') {
                void ctx.resume();
            }
        }

        function uiSoundsEnabled() {
            /* Muted only via Settings → System sounds (`ui-sounds-off`), never reduced motion. */
            return !document.documentElement.classList.contains('ui-sounds-off');
        }

        function playTone({
            type = 'triangle',
            freqStart,
            freqEnd,
            duration = 0.07,
            peakGain = 0.048,
            filterHz = 2600,
        }) {
            if (!uiSoundsEnabled()) return;
            const now = performance.now();
            if (now - lastPlayedAt < MIN_INTERVAL_MS) return;
            lastPlayedAt = now;

            const ctx = getAudioContext();
            if (!ctx) return;
            unlockAudio();

            try {
                const start = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();
                const rampEnd = Math.max(0.02, duration * 0.55);

                osc.type = type;
                osc.frequency.setValueAtTime(freqStart, start);
                osc.frequency.exponentialRampToValueAtTime(freqEnd, start + rampEnd);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(filterHz, start);
                filter.Q.setValueAtTime(0.55, start);

                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.005);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);

                osc.start(start);
                osc.stop(start + duration + 0.01);
            } catch {
                /* ignore audio failures */
            }
        }

        function playSidebarHover() {
            playTone({ ...getActivePreset().hover });
        }

        function playToggle(checked) {
            const preset = getActivePreset();
            playTone(checked ? preset.toggleOn : preset.toggleOff);
        }

        /** Aim trainer tones — independent of Settings → System sounds. */
        function playAimTone({
            type = 'triangle',
            freqStart,
            freqEnd,
            duration = 0.16,
            peakGain = 0.05,
            filterHz = 2600,
        }) {
            const ctx = getAudioContext();
            if (!ctx) return;
            unlockAudio();

            try {
                const start = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();
                const rampEnd = Math.max(0.02, duration * 0.55);

                osc.type = type;
                osc.frequency.setValueAtTime(freqStart, start);
                if (Math.abs(freqEnd - freqStart) < 1) {
                    osc.frequency.setValueAtTime(freqStart, start + rampEnd);
                } else {
                    osc.frequency.exponentialRampToValueAtTime(
                        Math.max(40, freqEnd),
                        start + rampEnd,
                    );
                }

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(filterHz, start);
                filter.Q.setValueAtTime(0.55, start);

                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.005);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);

                osc.start(start);
                osc.stop(start + duration + 0.01);
            } catch {
                /* ignore audio failures */
            }
        }

        function playAimHit() {
            playAimTone({
                type: 'sine',
                freqStart: 165,
                freqEnd: 310,
                duration: 0.2,
                peakGain: 0.065,
                filterHz: 1100,
            });
        }

        function playAimMiss() {
            playAimTone({
                type: 'sine',
                freqStart: 180,
                freqEnd: 90,
                duration: 0.16,
                peakGain: 0.05,
                filterHz: 1400,
            });
        }

        function playAimCountdownTick(label) {
            if (label === 'GO!') {
                playAimTone({
                    type: 'triangle',
                    freqStart: 520,
                    freqEnd: 980,
                    duration: 0.24,
                    peakGain: 0.065,
                    filterHz: 3200,
                });
                return;
            }
            playAimTone({
                type: 'sine',
                freqStart: 660,
                freqEnd: 660,
                duration: 0.09,
                peakGain: 0.042,
                filterHz: 2200,
            });
        }

        function previewPreset() {
            playSidebarHover();
        }

        function setPreset(presetId) {
            const id = PRESET_IDS.includes(presetId) ? presetId : 'standard';
            document.documentElement.dataset.uiSoundPreset = id;
        }

        function isButtonHoverSoundTarget(el) {
            if (!(el instanceof Element)) return false;
            if (!el.matches(BUTTON_HOVER_SELECTOR)) return false;
            if (el.matches('.lazer-toggle')) {
                const toggleInput = el.querySelector('input[type="checkbox"]');
                if (!toggleInput || toggleInput.disabled) return false;
            }
            if (el.disabled) return false;
            if (el.getAttribute('aria-disabled') === 'true') return false;
            if (el.classList.contains('is-nav-disabled')) return false;
            if (
                el.classList.contains('modal-backdrop')
                || el.classList.contains('mobile-nav-backdrop')
            ) {
                return false;
            }
            return true;
        }

        let buttonHoverSoundBound = false;

        function bindButtonHoverSounds() {
            if (buttonHoverSoundBound) return;
            buttonHoverSoundBound = true;

            document.addEventListener('pointerover', (event) => {
                if (event.pointerType && event.pointerType !== 'mouse') return;
                const btn = event.target.closest?.(BUTTON_HOVER_SELECTOR);
                if (!btn || !isButtonHoverSoundTarget(btn)) {
                    lastHoverTarget = null;
                    return;
                }
                if (btn === lastHoverTarget) return;
                lastHoverTarget = btn;
                playSidebarHover();
            });
        }

        let toggleSoundBound = false;

        function bindToggleSounds() {
            if (toggleSoundBound) return;
            toggleSoundBound = true;

            document.addEventListener(
                'change',
                (event) => {
                    const input = event.target;
                    if (!(input instanceof HTMLInputElement)) return;
                    if (input.type !== 'checkbox') return;
                    if (input.disabled) return;
                    if (!input.closest('.lazer-toggle')) return;
                    playToggle(input.checked);
                },
                { capture: true },
            );
        }

        let uiSoundUnlockBound = false;

        function initUiSoundUnlock() {
            if (uiSoundUnlockBound) return;
            uiSoundUnlockBound = true;
            document.addEventListener('pointerdown', unlockAudio, { capture: true });
            document.addEventListener('keydown', unlockAudio, { capture: true });
        }

        function initSidebarNavHoverSounds() {
            bindButtonHoverSounds();
            initUiSoundUnlock();
        }

        function initLazerToggleSounds() {
            bindToggleSounds();
            initUiSoundUnlock();
        }

        return freeze({
            PRESET_IDS,
            initSidebarNavHoverSounds,
            initLazerToggleSounds,
            playSidebarHover,
            playToggle,
            playAimHit,
            playAimMiss,
            playAimCountdownTick,
            previewPreset,
            setPreset,
            unlockAudio,
        });
    })();

    const UiRefresh = (() => {
        const VALID_HZ = freeze([60, 120, 240]);
        const DEFAULT_HZ = 240;

        function normalizeHz(value) {
            const n = Number(value);
            return VALID_HZ.includes(n) ? n : DEFAULT_HZ;
        }

        function getHz() {
            return normalizeHz(document.documentElement.dataset.uiRefreshHz);
        }

        function setHz(hz) {
            const n = normalizeHz(hz);
            document.documentElement.dataset.uiRefreshHz = String(n);
            document.documentElement.style.setProperty('--ui-refresh-hz', String(n));
            return n;
        }

        function frameIntervalMs(hz = getHz()) {
            return 1000 / hz;
        }

        function loop(callback) {
            let stopped = false;
            let rafId = 0;
            let lastEmit = 0;

            function onFrame(now) {
                if (stopped) return;
                rafId = 0;
                const interval = frameIntervalMs();
                if (!lastEmit || now - lastEmit >= interval - 0.5) {
                    lastEmit = now;
                    if (callback(now) === false) {
                        stopped = true;
                        return;
                    }
                }
                rafId = requestAnimationFrame(onFrame);
            }

            rafId = requestAnimationFrame(onFrame);
            return () => {
                stopped = true;
                if (rafId) cancelAnimationFrame(rafId);
            };
        }

        return freeze({
            VALID_HZ,
            DEFAULT_HZ,
            getHz,
            setHz,
            frameIntervalMs,
            loop,
        });
    })();

    const Toast = freeze({
        DEFAULT_MS: 4000,
        show() {},
    });

    global.CafeCore = freeze({
        Motion,
        Dom,
        Storage,
        Async,
        Features,
        UiSound,
        UiRefresh,
        Toast,
        createGenerationToken,
        mount,
        getModule,
        freeze,
    });
})(typeof window !== 'undefined' ? window : globalThis);
