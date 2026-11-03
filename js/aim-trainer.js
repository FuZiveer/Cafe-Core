(function () {
    'use strict';

    const AIM_TYPE_LABELS = { flick: 'Flicking', track: 'Tracking', react: 'Reacting' };

    /** Morning Roast `AIM_MODES` (script.js) — hub cards for each training mode. */
    const TRAININGS = [
        {
            id: 'static',
            name: 'Static',
            description: 'Hit targets that stay still.',
            icon: 'fa-bullseye',
            types: ['flick'],
        },
        {
            id: 'wave',
            name: 'Wave',
            description: 'Clear every target on the range before they all respawn.',
            icon: 'fa-water',
            types: ['flick'],
        },
        {
            id: 'flick',
            name: 'Head Level',
            description: 'Camera and targets sit 25% off the floor, with targets lined up in one row.',
            icon: 'fa-bolt',
            types: ['flick'],
        },
        {
            id: 'track',
            name: 'Tracking (small movements)',
            description: 'One target spawns at a random height and slides left and right — click each time you land on it.',
            icon: 'fa-arrows-left-right',
            types: ['track'],
        },
        {
            id: 'track-mouse',
            name: 'Tracking (mouse control)',
            description: 'Hold fire at 400 RPM while tracking one slow target across ±60° — 25 points per hit.',
            icon: 'fa-computer-mouse',
            types: ['track'],
        },
        {
            id: 'react',
            name: 'Reacting',
            description: 'Shoot the center target, then chase a straight-line flyer for 1s — miss and the center returns.',
            icon: 'fa-crosshairs',
            types: ['react'],
        },
    ];

    const aimListFilters = {
        query: '',
        type: 'all',
    };

    const ROOM_DEFAULT = Object.freeze({ width: 15, depth: 15, height: 4.5 });
    /** Reacting uses a closed cube so vertical chase space matches the floor plan. */
    const ROOM_REACT = Object.freeze({ width: 12, depth: 12, height: 12 });
    /** Morning Roast aim room / target constants (adapted to this room size). */
    const AIM_SCENE_BG = 0x16181c;
    const AIM_WALL_COLOR = 0x1f2228;
    const AIM_SPREAD_WIDTH = { tight: 7, balanced: 14, far: 20 };
    const AIM_TARGET_RADIUS = { easy: 0.55, medium: 0.4, hard: 0.26 };
    const AIM_TARGET_GAP = 0.15;
    const AIM_TARGET_COLORS = { blue: 0x6f96c4, red: 0xe0877a, yellow: 0xe6d07d, purple: 0xc39ae0 };
    const AIM_PITCH_LIMIT = Math.PI / 2 - 0.01;
    const AIM_VIEW_LIMIT = Math.PI / 2;
    const AIM_COUNTDOWN_MS = 3000;
    const AIM_FALLBACK_YAW_DEG = 0.07;
    const AIM_TARGETS_BY_MODE = { static: 8, wave: 20, flick: 3, track: 1, 'track-mouse': 1, react: 1 };
    const AIM_TRACK_SPEED = 3.2;
    const AIM_REACT_SPEED = 5.0;
    const AIM_REACT_MOVE_MS = 1000;
    /** Hold-fire tracking: slow ±60° yaw sweep, 400 RPM, 25 points per hit. */
    const AIM_TRACK_MOUSE_YAW_DEG = 60;
    const AIM_TRACK_MOUSE_YAW_SPEED = (18 * Math.PI) / 180;
    const AIM_TRACK_FIRE_RPM = 400;
    const AIM_TRACK_FIRE_INTERVAL_MS = 60000 / AIM_TRACK_FIRE_RPM;
    const AIM_TRACK_HIT_POINTS = 25;
    /** Head Level (flick): fixed horizontal spawn width in meters. */
    const AIM_FLICK_SPREAD_M = 10;
    const AIM_PLACE_ATTEMPTS = 60;
    /** Walk bounds from spawn: ±1 m left/right, up to 1 m forward (toward targets). */
    const AIM_MOVE_LIMIT_M = 1;
    const AIM_MOVE_SPEED = 4.5;
    const AIM_MOVE_KEYS = new Set([
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ArrowUp',
        'ArrowLeft',
        'ArrowDown',
        'ArrowRight',
    ]);

    let activeTrainingId = null;
    let aimSessionHits = [];
    let aimSessionMisses = [];
    let aimSessionOffsets = [];
    let aimReactionTotal = 0;
    let aimReactionCount = 0;
    /** Timestamp of the last hit, or when the playing phase began (Morning Roast reaction metric). */
    let aimLastHitAt = 0;

    let pageBound = false;
    let fullscreenListenersBound = false;
    let sessionActive = false;
    let renderer = null;
    let scene = null;
    let camera = null;
    let raycaster = null;
    let animationId = 0;
    let resizeObserver = null;

    let yaw = 0;
    let pitch = 0;
    /** @type {import('three').Group | null} */
    let targetGroup = null;
    let hits = 0;
    let misses = 0;
    let score = 0;
    let timeLeft = 30;
    let sessionElapsed = 0;
    let lastAnimTime = 0;
    let fireHeld = false;
    let lastFireAt = 0;
    /** Reacting drill: center static shot, then a free-moving chase target. */
    let reactPhase = 'center';
    /** @type {'ready' | 'countdown' | 'playing' | 'done' | null} */
    let sessionPhase = null;
    let countdownEnd = 0;
    let lastCountdownLabel = '';
    /** Spawn X/Z for clamping movement (Y comes from `aimEyeHeight()`). */
    let cameraSpawn = { x: 0, z: 0 };
    const moveKeys = new Set();

    const pointer = { locked: false, rawMovement: false };
    const boundCanvas = {
        click: null,
        startOverlayClick: null,
        startOverlayKeydown: null,
        mouseup: null,
        mousedown: null,
        mousemove: null,
        pointerlockchange: null,
        keydown: null,
        keyup: null,
        contextmenu: null,
    };

    function byId(id) {
        return document.getElementById(id);
    }

    function getPageRoot() {
        return byId('page-aim-trainer');
    }

    function getCanvas() {
        return byId('aim-trainer-canvas');
    }

    function getSessionEl() {
        return byId('aim-trainer-session');
    }

    function getFullscreenElement() {
        return document.fullscreenElement
            || document.webkitFullscreenElement
            || document.msFullscreenElement
            || null;
    }

    function requestSessionFullscreen(sessionEl) {
        if (!sessionEl || getFullscreenElement()) return;
        const req = sessionEl.requestFullscreen
            || sessionEl.webkitRequestFullscreen
            || sessionEl.msRequestFullscreen;
        if (!req) return;
        try {
            const result = req.call(sessionEl);
            if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch {
            /* user denied or unsupported */
        }
    }

    function exitSessionFullscreen() {
        if (!getFullscreenElement()) return;
        const exit = document.exitFullscreen
            || document.webkitExitFullscreen
            || document.msExitFullscreen;
        if (!exit) return;
        try {
            const result = exit.call(document);
            if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch {
            /* already exited */
        }
    }

    function onSessionFullscreenChange() {
        if (!sessionActive) return;
        const session = getSessionEl();
        if (getFullscreenElement() === session) return;
        stopSession({ skipFullscreenExit: true });
    }

    function ensureThree() {
        if (typeof window.THREE === 'undefined') {
            throw new Error('THREE is not loaded');
        }
        return window.THREE;
    }

    function getAimSettings() {
        const cfg = window.AimTrainerSettings?.get?.() || {
            timer: 30,
            spread: 'balanced',
            tsize: 'medium',
            tcolor: 'yellow',
            game: 'Valorant',
            sens: 1,
            dpi: 800,
            aspect: 'native',
        };
        const sensEl = byId('aim-trainer-settings-sens');
        const dpiEl = byId('aim-trainer-settings-dpi');
        const gamePick = byId('aim-trainer-settings-game-pick');
        if (sensEl) cfg.sens = aimPositiveNumber(sensEl.value, cfg.sens);
        if (dpiEl) cfg.dpi = aimPositiveNumber(dpiEl.value, cfg.dpi);
        if (gamePick?.dataset.value) cfg.game = gamePick.dataset.value;
        return cfg;
    }

    function aimSpreadKey() {
        const spread = getAimSettings().spread;
        return AIM_SPREAD_WIDTH[spread] ? spread : 'balanced';
    }

    function aimTargetRadius() {
        if (aimActiveMode() === 'flick') return AIM_TARGET_RADIUS.medium;
        const tsize = getAimSettings().tsize;
        return AIM_TARGET_RADIUS[tsize] ?? AIM_TARGET_RADIUS.medium;
    }

    function aimTargetColorHex() {
        const tcolor = getAimSettings().tcolor;
        return AIM_TARGET_COLORS[tcolor] ?? AIM_TARGET_COLORS.yellow;
    }

    function aimActiveMode() {
        return activeTrainingId || 'static';
    }

    function aimTargetQuota() {
        return AIM_TARGETS_BY_MODE[aimActiveMode()] ?? AIM_TARGETS_BY_MODE.static;
    }

    function aimIsMovingTrack() {
        const m = aimActiveMode();
        return m === 'track' || m === 'track-mouse';
    }

    function aimIsHoldFireTrack() {
        return aimActiveMode() === 'track-mouse';
    }

    function aimIsReactMode() {
        return aimActiveMode() === 'react';
    }

    function aimRoom() {
        return aimIsReactMode() ? ROOM_REACT : ROOM_DEFAULT;
    }

    function aimCameraInset() {
        return aimRoom().depth * 0.1;
    }

    function aimCameraSpawnZ() {
        return aimRoom().depth / 2 - aimCameraInset();
    }

    function syncCameraSpawn() {
        cameraSpawn.x = 0;
        cameraSpawn.z = aimCameraSpawnZ();
    }

    function resetCameraPosition() {
        if (!camera) return;
        syncCameraSpawn();
        camera.position.set(cameraSpawn.x, aimEyeHeight(), cameraSpawn.z);
    }

    function clampCameraToMoveBounds() {
        if (!camera) return;
        const minZ = cameraSpawn.z - AIM_MOVE_LIMIT_M;
        camera.position.x = Math.max(
            cameraSpawn.x - AIM_MOVE_LIMIT_M,
            Math.min(cameraSpawn.x + AIM_MOVE_LIMIT_M, camera.position.x),
        );
        camera.position.z = Math.max(minZ, Math.min(cameraSpawn.z, camera.position.z));
        camera.position.y = aimEyeHeight();
    }

    function updateCameraMovement(dt) {
        if (!camera || sessionPhase !== 'playing' || moveKeys.size === 0) return;
        let forward = 0;
        let strafe = 0;
        if (moveKeys.has('KeyW') || moveKeys.has('ArrowUp')) forward += 1;
        if (moveKeys.has('KeyS') || moveKeys.has('ArrowDown')) forward -= 1;
        if (moveKeys.has('KeyA') || moveKeys.has('ArrowLeft')) strafe -= 1;
        if (moveKeys.has('KeyD') || moveKeys.has('ArrowRight')) strafe += 1;
        if (forward === 0 && strafe === 0) return;

        const len = Math.hypot(forward, strafe);
        forward /= len;
        strafe /= len;

        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        const step = AIM_MOVE_SPEED * dt;
        camera.position.x += (-sin * forward + cos * strafe) * step;
        camera.position.z += (-cos * forward - sin * strafe) * step;
        clampCameraToMoveBounds();
    }

    function aimTargetZ() {
        return -aimRoom().depth / 2 + aimCameraInset();
    }

    function aimBaseEyeHeight() {
        return aimRoom().height / 2;
    }

    function aimFlickLift() {
        return aimRoom().height * 0.25;
    }

    function aimLowRowMode() {
        const m = aimActiveMode();
        return m === 'flick' || m === 'track-mouse';
    }

    function aimEyeHeight() {
        return aimLowRowMode() ? aimFlickLift() : aimBaseEyeHeight();
    }

    function aimPointsPerHit() {
        return aimIsHoldFireTrack() ? AIM_TRACK_HIT_POINTS : 1;
    }

    function aimSessionSeconds() {
        const timer = Number(getAimSettings().timer);
        return timer > 0 ? timer : Infinity;
    }

    function aimPositiveNumber(value, fallback) {
        const n = Number(String(value ?? '').replace(',', '.'));
        return Number.isFinite(n) && n > 0 ? n : fallback;
    }

    function aimFindGame(name) {
        const catalog = typeof SENS_GAMES_CATALOG !== 'undefined' ? SENS_GAMES_CATALOG : [];
        return catalog.find((g) => g.name === name) || catalog.find((g) => g.name === 'Valorant') || null;
    }

    function aimResolveDpc(game, sens) {
        if (!game) return null;
        if (typeof gameDpc === 'function') return gameDpc(game, sens);
        const s = aimPositiveNumber(sens, 1);
        const yaw = Number(game.yaw) || AIM_FALLBACK_YAW_DEG;
        if (game.type === 'linear_offset') return yaw * (s + (Number(game.offset) || 0));
        return yaw * s;
    }

    /** Degrees-per-count at sens 1, in radians (Morning Roast `aimGameYawRadians`). */
    function aimGameYawRadians() {
        const cfg = getAimSettings();
        const game = aimFindGame(cfg.game);
        if (!game) return (AIM_FALLBACK_YAW_DEG * Math.PI) / 180;
        const sens = aimPositiveNumber(cfg.sens, 1);
        const dpc = aimResolveDpc(game, sens);
        const yawDeg = dpc != null && Number.isFinite(dpc) && sens > 0 ? dpc / sens : AIM_FALLBACK_YAW_DEG;
        return (yawDeg * Math.PI) / 180;
    }

    /** Turn scale per `movementX`/`movementY` count (Morning Roast `aimOnMouseMove`). */
    function aimMouseTurnScale() {
        const cfg = getAimSettings();
        const sens = aimPositiveNumber(cfg.sens, 1);
        const counts = pointer.rawMovement ? 1 : window.devicePixelRatio || 1;
        return aimGameYawRadians() * sens * counts;
    }

    function aimRequestPointerLock(canvas) {
        if (!canvas || document.pointerLockElement === canvas) return;
        pointer.rawMovement = false;
        let pending;
        try {
            pending = canvas.requestPointerLock({ unadjustedMovement: true });
        } catch {
            pending = undefined;
        }
        if (!pending || typeof pending.then !== 'function') {
            try {
                canvas.requestPointerLock();
            } catch {
                /* unsupported or denied */
            }
            return;
        }
        pending
            .then(() => {
                pointer.rawMovement = true;
            })
            .catch(() => {
                try {
                    canvas.requestPointerLock();
                } catch {
                    /* fallback failed */
                }
            });
    }

    function aimWrapAngle(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    function resetSessionAnalytics() {
        aimSessionHits = [];
        aimSessionMisses = [];
        aimSessionOffsets = [];
        aimReactionTotal = 0;
        aimReactionCount = 0;
        aimLastHitAt = 0;
    }

    function aimSessionAccuracy() {
        const total = hits + misses;
        return total ? Math.round((hits / total) * 100) : 0;
    }

    function aimSessionReactionMs() {
        return aimReactionCount ? Math.round(aimReactionTotal / aimReactionCount) : 0;
    }

    function aimRecordSpatial(didHit) {
        const clamp = (a) => Math.max(-AIM_VIEW_LIMIT, Math.min(AIM_VIEW_LIMIT, a));
        const point = {
            yaw: clamp(aimWrapAngle(-yaw)),
            pitch: clamp(-pitch),
        };
        if (!didHit && Math.abs(point.yaw) < 0.002 && Math.abs(point.pitch) < 0.002) return;
        (didHit ? aimSessionHits : aimSessionMisses).push(point);
    }

    function aimRecordPrecision(hit) {
        const v = hit.point.clone().sub(hit.object.position);
        v.applyQuaternion(camera.quaternion.clone().invert());
        const radius = hit.object.userData.radius || aimTargetRadius();
        aimSessionOffsets.push({
            x: Math.max(-1, Math.min(1, v.x / radius)),
            y: Math.max(-1, Math.min(1, v.y / radius)),
        });
    }

    function aimSpreadAngles() {
        const b = aimSpreadBounds();
        const depth = aimTrackDepth();
        const eye = aimBaseEyeHeight();
        return {
            yaw: Math.atan(Math.max(b.maxX, -b.minX) / depth),
            pitch: Math.atan(Math.max(b.maxY - eye, eye - b.minY) / depth),
        };
    }

    function aimSpatialView() {
        const spread = aimSpreadAngles();
        let maxYaw = spread.yaw;
        let maxPitch = spread.pitch;
        [...aimSessionHits, ...aimSessionMisses].forEach((point) => {
            maxYaw = Math.max(maxYaw, Math.abs(point.yaw));
            maxPitch = Math.max(maxPitch, Math.abs(point.pitch));
        });
        maxYaw = Math.max(1e-3, Math.min(maxYaw, AIM_VIEW_LIMIT));
        maxPitch = Math.max(1e-3, Math.min(maxPitch, AIM_VIEW_LIMIT));
        const project = (list) => list.map((point) => ({
            x: point.yaw / maxYaw,
            y: point.pitch / maxPitch,
        }));
        return { hits: project(aimSessionHits), misses: project(aimSessionMisses) };
    }

    function aimPaintResultMap(ctx, w, h, points, { misses = [], precision = false } = {}) {
        if (precision) {
            const cx = w / 2;
            const cy = h / 2;
            const R = Math.min(w, h) / 2 - 8;
            for (let i = 4; i >= 1; i -= 1) {
                ctx.beginPath();
                ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2);
                ctx.strokeStyle = i === 4 ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.1)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.strokeStyle = 'rgba(255,255,255,.16)';
            ctx.beginPath();
            ctx.moveTo(cx - R, cy);
            ctx.lineTo(cx + R, cy);
            ctx.moveTo(cx, cy - R);
            ctx.lineTo(cx, cy + R);
            ctx.stroke();
            const draw = (items, color) => {
                ctx.fillStyle = color;
                items.forEach((point) => {
                    ctx.beginPath();
                    ctx.arc(cx + point.x * R, cy + point.y * R, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                });
            };
            draw(points, '#ff1e43');
            draw(misses, 'rgba(255,255,255,.38)');
            return;
        }
        ctx.strokeStyle = 'rgba(255,255,255,.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        const draw = (items, color) => {
            ctx.fillStyle = color;
            items.forEach((point) => {
                const x = w / 2 + point.x * (w / 2);
                const y = h / 2 + point.y * (h / 2);
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            });
        };
        draw(points, '#ff1e43');
        draw(misses, 'rgba(255,255,255,.38)');
    }

    function aimDrawResultMap(canvas, points, opts = {}) {
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || 300;
        const h = canvas.clientHeight || 150;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        aimPaintResultMap(ctx, w, h, points, opts);
    }

    function setResultsVisible(visible) {
        const el = byId('aim-trainer-results');
        if (!el) return;
        el.hidden = !visible;
    }

    function setTargetsVisible(visible) {
        if (targetGroup) targetGroup.visible = visible;
    }

    function buildSessionResults() {
        const accuracy = aimSessionAccuracy();
        const reaction = aimSessionReactionMs();
        const hitsEl = byId('aim-trainer-result-hits');
        const missesEl = byId('aim-trainer-result-misses');
        const accEl = byId('aim-trainer-result-accuracy');
        const reactEl = byId('aim-trainer-result-reaction');
        if (hitsEl) {
            hitsEl.textContent = aimIsHoldFireTrack() ? String(score) : String(hits);
            const hitsLabel = hitsEl.previousElementSibling;
            if (hitsLabel) hitsLabel.textContent = aimIsHoldFireTrack() ? 'Score' : 'Hits';
        }
        if (missesEl) missesEl.textContent = String(misses);
        if (accEl) accEl.textContent = `${accuracy}%`;
        if (reactEl) reactEl.textContent = reaction ? `${reaction}ms` : '—';
        requestAnimationFrame(() => {
            const spatial = aimSpatialView();
            aimDrawResultMap(byId('aim-trainer-result-spatial'), spatial.hits, { misses: spatial.misses });
            aimDrawResultMap(byId('aim-trainer-result-precision'), aimSessionOffsets, { precision: true });
        });
    }

    function applyLiveTargetFromSettings() {
        if (!targetGroup?.children.length || typeof window.THREE === 'undefined') return;
        const THREE = window.THREE;
        const radius = aimTargetRadius();
        const color = aimTargetColorHex();
        targetGroup.children.forEach((mesh) => {
            if (!mesh.userData?.isTarget) return;
            mesh.userData.radius = radius;
            mesh.userData.baseColor = color;
            if (mesh.geometry) {
                mesh.geometry.dispose();
                mesh.geometry = new THREE.SphereGeometry(radius, 20, 20);
            }
            if (mesh.material?.color) mesh.material.color.setHex(color);
        });
        aimSeparateTargets();
    }

    function buildResultsShareImage() {
        const cfg = getAimSettings();
        const w = 760;
        const h = 404;
        const pad = 24;
        const scale = 3;
        const canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return canvas;
        ctx.scale(scale, scale);
        ctx.fillStyle = '#0c0c0e';
        ctx.fillRect(0, 0, w, h);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SESSION SUMMARY', w / 2, pad + 20);
        const timer = cfg.timer > 0 ? `${cfg.timer}s` : 'Endless';
        ctx.fillStyle = '#64748b';
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillText(`${cfg.game} · ${timer}`.toUpperCase(), w / 2, pad + 40);
        const reaction = aimSessionReactionMs();
        const stats = [
            [aimIsHoldFireTrack() ? 'Score' : 'Hits', aimIsHoldFireTrack() ? String(score) : String(hits)],
            ['Misses', String(misses)],
            ['Accuracy', `${aimSessionAccuracy()}%`],
            ['Reaction Time', reaction ? `${reaction}ms` : '—'],
        ];
        const gap = 12;
        const cardW = (w - pad * 2 - gap * 3) / 4;
        const cardY = pad + 56;
        const cardH = 68;
        stats.forEach(([label, value], i) => {
            const x = pad + i * (cardW + gap);
            ctx.fillStyle = '#0f0f12';
            ctx.strokeStyle = '#26262b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') ctx.roundRect(x + 0.5, cardY + 0.5, cardW - 1, cardH - 1, 9);
            else ctx.rect(x + 0.5, cardY + 0.5, cardW - 1, cardH - 1);
            ctx.fill();
            ctx.stroke();
            ctx.textAlign = 'left';
            ctx.fillStyle = '#64748b';
            ctx.font = '600 9px system-ui, sans-serif';
            ctx.fillText(label.toUpperCase(), x + 13, cardY + 25);
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '700 20px system-ui, sans-serif';
            ctx.fillText(value, x + 13, cardY + 51);
        });
        const mapGap = 16;
        const mapY = cardY + cardH + 26;
        const mapH = 150;
        const spatialW = mapH * (16 / 9);
        const precisionW = mapH;
        const mapsTotalW = spatialW + mapGap + precisionW;
        const mapsStartX = pad + Math.max(0, (w - pad * 2 - mapsTotalW) / 2);
        const spatial = aimSpatialView();
        [
            ['Spatial (Clicks)', spatial.hits, { misses: spatial.misses, width: spatialW }],
            ['Precision', aimSessionOffsets, { precision: true, width: precisionW }],
        ].forEach(([label, mapPoints, opts], i) => {
            const mapW = opts.width ?? mapH;
            const x = mapsStartX + (i === 0 ? 0 : spatialW + mapGap);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#64748b';
            ctx.font = '600 9px system-ui, sans-serif';
            ctx.fillText(String(label).toUpperCase(), x, mapY - 8);
            ctx.save();
            ctx.translate(x, mapY);
            aimPaintResultMap(ctx, mapW, mapH, mapPoints, opts);
            ctx.restore();
        });
        ctx.textAlign = 'center';
        ctx.fillStyle = '#64748b';
        ctx.font = '600 9px system-ui, sans-serif';
        ctx.fillText('CAFÉ CORE', w / 2, mapY + mapH + 24);
        return canvas;
    }

    function resultsShareBlob() {
        return new Promise((resolve) => {
            buildResultsShareImage().toBlob((blob) => resolve(blob), 'image/png');
        });
    }

    function flashShareButton(label) {
        const btn = byId('aim-trainer-results-share');
        if (!btn) return;
        const prev = btn.textContent;
        btn.textContent = label;
        window.setTimeout(() => {
            btn.textContent = prev;
        }, 1400);
    }

    async function copyResultsImage() {
        try {
            const blob = await resultsShareBlob();
            if (!blob) throw new Error('no blob');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            flashShareButton('Copied');
        } catch {
            flashShareButton('Copy failed');
        }
    }

    async function downloadResultsImage() {
        try {
            const blob = await resultsShareBlob();
            if (!blob) throw new Error('no blob');
            const cfg = getAimSettings();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `cafe-core-aim-${cfg.game.replace(/\s+/g, '-')}-${Date.now()}.png`;
            link.click();
            URL.revokeObjectURL(url);
            flashShareButton('Saved');
        } catch {
            flashShareButton('Save failed');
        }
    }

    function finishSessionShowResults() {
        sessionPhase = 'done';
        fireHeld = false;
        if (document.pointerLockElement === getCanvas()) {
            document.exitPointerLock();
        }
        setHudVisible(false);
        setCrosshairVisible(false);
        setStartOverlayVisible(false);
        setCountdownVisible(false);
        setTargetsVisible(false);
        buildSessionResults();
        setResultsVisible(true);
    }

    function normalizeSearchText(value) {
        return String(value ?? '').trim().toLowerCase();
    }

    function getAimSearchTerms(query) {
        return String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    }

    function escapeHtmlText(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /** Same mark ranges / styling as Tips & tricks (`highlightLineupsTitleHtml`). */
    function highlightAimSearchHtml(text, query) {
        const raw = String(text ?? '');
        const terms = getAimSearchTerms(query);
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

    function trainingMatchesFilters(training) {
        const terms = getAimSearchTerms(aimListFilters.query);
        if (terms.length) {
            const haystack = [
                training.name,
                training.description,
                ...(training.types || []).map((type) => AIM_TYPE_LABELS[type] || type),
            ].join(' ').toLowerCase();
            if (!terms.every((term) => haystack.includes(term))) return false;
        }
        if (aimListFilters.type && aimListFilters.type !== 'all') {
            const tags = training.types || [];
            if (!tags.includes(aimListFilters.type)) return false;
        }
        return true;
    }

    function getFilteredTrainings() {
        return TRAININGS.filter(trainingMatchesFilters);
    }

    function renderTrainingTypeBadges(types) {
        if (!types?.length) return '';
        return `<div class="aim-trainer-card-types" aria-hidden="true">${types.map((type) => `
            <span class="aim-trainer-card-type">${AIM_TYPE_LABELS[type] || type}</span>`).join('')}</div>`;
    }

    function syncAimTrainerSearchClear() {
        const searchInput = byId('aim-trainer-search');
        const clearBtn = byId('aim-trainer-search-clear');
        if (!searchInput || !clearBtn) return;
        clearBtn.hidden = normalizeSearchText(searchInput.value).length === 0;
    }

    function renderTrainingList() {
        const list = byId('aim-trainer-list');
        const empty = byId('aim-trainer-list-empty');
        if (!list) return;

        const filtered = getFilteredTrainings();
        const searchQuery = aimListFilters.query;
        list.innerHTML = filtered.map((t) => {
            const nameHtml = highlightAimSearchHtml(t.name, searchQuery);
            const descriptionHtml = highlightAimSearchHtml(t.description, searchQuery);
            return `
            <button type="button" class="aim-trainer-card ui-interactive bg-matte-950 rounded-lg border border-matte-800 p-5 text-left flex flex-col gap-3 min-h-[140px]" data-training-id="${t.id}" role="listitem">
                <div class="flex items-start gap-3">
                    <span class="w-10 h-10 rounded-lg bg-matte-900 border border-matte-800 flex items-center justify-center text-redneon-500 shrink-0">
                        <i class="fa-solid ${t.icon} text-sm" aria-hidden="true"></i>
                    </span>
                </div>
                <div class="min-w-0 mt-auto">
                    <div class="aim-trainer-card-title-row flex items-center gap-2 min-w-0 flex-wrap">
                        <h3 class="text-sm font-bold tracking-widest uppercase text-white shrink-0">${nameHtml}</h3>
                        ${renderTrainingTypeBadges(t.types)}
                    </div>
                    <p class="text-xs text-slate-400 mt-2 tracking-wide leading-snug">${descriptionHtml}</p>
                </div>
            </button>`;
        }).join('');

        if (empty) empty.hidden = filtered.length > 0;
        list.hidden = filtered.length === 0;
    }

    function bindAimTrainerListFilters() {
        const browser = byId('aim-trainer-browser');
        if (!browser || browser.dataset.aimFiltersBound === '1') return;
        browser.dataset.aimFiltersBound = '1';

        const searchInput = byId('aim-trainer-search');
        const clearBtn = byId('aim-trainer-search-clear');
        const typeGlide = byId('aim-trainer-type-glide');

        const applyFilters = () => {
            renderTrainingList();
            syncAimTrainerSearchClear();
        };

        searchInput?.addEventListener('input', () => {
            aimListFilters.query = searchInput.value;
            applyFilters();
        });
        searchInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                searchInput.value = '';
                aimListFilters.query = '';
                applyFilters();
            }
        });
        clearBtn?.addEventListener('click', () => {
            if (!searchInput) return;
            searchInput.value = '';
            aimListFilters.query = '';
            applyFilters();
            searchInput.focus();
        });

        if (typeGlide && typeof initGlideSelectorRoot === 'function') {
            if (!typeGlide.dataset.value) typeGlide.dataset.value = 'all';
            aimListFilters.type = typeGlide.dataset.value || 'all';
            initGlideSelectorRoot(typeGlide, {
                valueKey: 'aimType',
                onChange: () => {
                    aimListFilters.type = typeGlide.dataset.value || 'all';
                    applyFilters();
                },
            });
        }

        syncAimTrainerSearchClear();
    }

    function aimTimerLabel(seconds) {
        return Number.isFinite(seconds)
            ? String(Math.max(0, Math.ceil(seconds)))
            : aimClockLabel(0);
    }

    function aimClockLabel(seconds) {
        const total = Math.max(0, Math.floor(seconds));
        const parts = [
            Math.floor(total / 3600),
            Math.floor(total / 60) % 60,
            total % 60,
        ];
        return parts.map((n) => String(n).padStart(2, '0')).join(':');
    }

    function updateHud() {
        const scoreEl = byId('aim-trainer-score');
        const missesEl = byId('aim-trainer-misses');
        const accuracyEl = byId('aim-trainer-accuracy');
        if (scoreEl) scoreEl.textContent = String(score);
        if (missesEl) missesEl.textContent = String(misses);
        const total = hits + misses;
        if (accuracyEl) {
            accuracyEl.textContent = total ? `${Math.round((hits / total) * 100)}%` : '0%';
        }
    }

    function updateTimerDisplay() {
        const timerEl = byId('aim-trainer-timer');
        if (!timerEl) return;
        if (Number.isFinite(timeLeft)) {
            timerEl.textContent = aimTimerLabel(timeLeft);
        } else {
            timerEl.textContent = aimClockLabel(sessionElapsed);
        }
    }

    function setHudVisible(visible) {
        const hud = byId('aim-trainer-hud');
        if (!hud) return;
        hud.classList.toggle('is-visible', visible);
    }

    function aimUiSound() {
        return window.CafeCore?.UiSound;
    }

    function setCountdownVisible(visible) {
        const el = byId('aim-trainer-countdown');
        if (!el) return;
        el.hidden = !visible;
    }

    function setStartOverlayVisible(visible) {
        const overlay = byId('aim-trainer-start-overlay');
        if (!overlay) return;
        overlay.hidden = !visible;
        if (!visible) overlay.classList.remove('is-countdown');
    }

    function setStartOverlayTextVisible(visible) {
        const text = byId('aim-trainer-start-text');
        if (text) text.hidden = !visible;
    }

    function setCrosshairVisible(visible) {
        const crosshair = byId('aim-trainer-crosshair');
        if (!crosshair) return;
        crosshair.classList.toggle('is-visible', visible);
        crosshair.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function enterReadyPhase() {
        sessionPhase = 'ready';
        setCrosshairVisible(false);
        setStartOverlayVisible(true);
        setStartOverlayTextVisible(true);
        setHudVisible(false);
        setCountdownVisible(false);
    }

    function tryStartFromReady() {
        if (sessionPhase !== 'ready') return false;
        setStartOverlayTextVisible(false);
        setHudVisible(true);
        updateHud();
        updateTimerDisplay();
        beginCountdown();
        return true;
    }

    function beginCountdown() {
        sessionPhase = 'countdown';
        countdownEnd = performance.now() + AIM_COUNTDOWN_MS;
        lastCountdownLabel = '';
        const overlay = byId('aim-trainer-start-overlay');
        overlay?.classList.add('is-countdown');
        setCountdownVisible(true);
        const THREE = window.THREE;
        if (THREE && targetGroup) {
            setTargetsVisible(true);
            if (targetGroup.children.length === 0) fillTargets(THREE);
            if (camera) camera.position.y = aimEyeHeight();
        }
        const canvas = getCanvas();
        if (canvas && document.pointerLockElement !== canvas) {
            aimRequestPointerLock(canvas);
        }
    }

    function finishCountdown(now) {
        sessionPhase = 'playing';
        setCountdownVisible(false);
        setStartOverlayVisible(false);
        setCrosshairVisible(true);
        lastAnimTime = now;
        aimLastHitAt = now;
    }

    function tickCountdown(now) {
        const remain = countdownEnd - now;
        const label = remain > 2000 ? '2' : remain > 1000 ? '1' : 'GO!';
        if (label !== lastCountdownLabel) {
            lastCountdownLabel = label;
            const cdNum = byId('aim-trainer-cd-num');
            if (cdNum) {
                cdNum.textContent = label;
                cdNum.style.animation = 'none';
                void cdNum.offsetWidth;
                cdNum.style.animation = '';
            }
            aimUiSound()?.playAimCountdownTick?.(label);
        }
        if (remain <= 0) finishCountdown(now);
    }

    function buildRoom(THREE) {
        const dims = aimRoom();
        const room = new THREE.Group();
        const wallMat = new THREE.MeshLambertMaterial({
            color: AIM_WALL_COLOR,
            side: THREE.DoubleSide,
        });

        function makePanel(w, h, mat) {
            return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        }

        const backWall = makePanel(dims.width, dims.height, wallMat);
        backWall.position.set(0, dims.height / 2, -dims.depth / 2);
        room.add(backWall);

        const frontWall = makePanel(dims.width, dims.height, wallMat);
        frontWall.position.set(0, dims.height / 2, dims.depth / 2);
        frontWall.rotation.y = Math.PI;
        room.add(frontWall);

        const leftWall = makePanel(dims.depth, dims.height, wallMat);
        leftWall.position.set(-dims.width / 2, dims.height / 2, 0);
        leftWall.rotation.y = Math.PI / 2;
        room.add(leftWall);

        const rightWall = makePanel(dims.depth, dims.height, wallMat);
        rightWall.position.set(dims.width / 2, dims.height / 2, 0);
        rightWall.rotation.y = -Math.PI / 2;
        room.add(rightWall);

        const floor = makePanel(dims.width, dims.depth, wallMat);
        floor.position.set(0, 0, 0);
        floor.rotation.x = -Math.PI / 2;
        room.add(floor);

        const ceiling = makePanel(dims.width, dims.depth, wallMat);
        ceiling.position.set(0, dims.height, 0);
        ceiling.rotation.x = Math.PI / 2;
        room.add(ceiling);

        return room;
    }

    function aimTrackDepth() {
        return aimRoom().depth / 2 - aimCameraInset() - aimTargetZ();
    }

    /**
     * Places the hold-fire track target on the inside face of the room walls
     * (back, then sides) so ±60° stays visible instead of clipping into geometry.
     */
    function aimTrackMouseWorldFromYaw(yaw) {
        const dims = aimRoom();
        const camX = camera?.position.x ?? 0;
        const camZ = camera?.position.z ?? aimCameraSpawnZ();
        const eye = aimEyeHeight();
        const inset = Math.max(0.45, aimTargetRadius() + 0.12);
        const dx = Math.sin(yaw);
        const dz = -Math.cos(yaw);
        const minX = -dims.width / 2 + inset;
        const maxX = dims.width / 2 - inset;
        const minZ = -dims.depth / 2 + inset;
        const maxZ = dims.depth / 2 - inset;

        let bestT = Infinity;
        let hitX = 0;
        let hitZ = aimTargetZ();

        const consider = (t, x, z) => {
            if (!(t > 0.05) || t >= bestT) return;
            if (x < minX - 1e-4 || x > maxX + 1e-4) return;
            if (z < minZ - 1e-4 || z > maxZ + 1e-4) return;
            bestT = t;
            hitX = x;
            hitZ = z;
        };

        if (Math.abs(dz) > 1e-6) {
            const t = (minZ - camZ) / dz;
            consider(t, camX + dx * t, minZ);
        }
        if (Math.abs(dx) > 1e-6) {
            const tRight = (maxX - camX) / dx;
            consider(tRight, maxX, camZ + dz * tRight);
            const tLeft = (minX - camX) / dx;
            consider(tLeft, minX, camZ + dz * tLeft);
        }

        if (!Number.isFinite(bestT)) {
            const dist = aimTrackDepth();
            return {
                x: camX + Math.sin(yaw) * dist,
                y: eye,
                z: camZ - Math.cos(yaw) * dist,
            };
        }
        return { x: hitX, y: eye, z: hitZ };
    }

    /** Half-extents of the spawn area on the target wall (Morning Roast spread logic). */
    function aimSpreadBounds() {
        const spreadDeg = AIM_SPREAD_WIDTH[aimSpreadKey()] ?? AIM_SPREAD_WIDTH.balanced;
        const spread = spreadDeg * (Math.PI / 180);
        const depth = aimTrackDepth();
        const quota = aimTargetQuota();
        const cell = 2 * aimTargetRadius() + AIM_TARGET_GAP;

        if (aimIsHoldFireTrack()) {
            const halfX = Math.tan((AIM_TRACK_MOUSE_YAW_DEG * Math.PI) / 180) * depth;
            const y = aimEyeHeight();
            return { minX: -halfX, maxX: halfX, minY: y, maxY: y };
        }

        if (aimActiveMode() === 'flick') {
            const halfX = AIM_FLICK_SPREAD_M / 2;
            const y = aimEyeHeight();
            return { minX: -halfX, maxX: halfX, minY: y, maxY: y };
        }

        let halfX = Math.tan(spread) * depth;
        let halfY = Math.tan(spread * 0.55) * depth;
        const capacity = Math.max(
            1,
            Math.floor((2 * halfX) / cell) * Math.floor((2 * halfY) / cell),
        );
        if (capacity < quota) {
            const scale = Math.sqrt((quota * 1.5) / capacity);
            halfX *= scale;
            halfY *= scale;
        }

        const dims = aimRoom();
        const eye = aimBaseEyeHeight();
        const x = Math.min(halfX, dims.width / 2 - 0.5);
        return {
            minX: -x,
            maxX: x,
            minY: Math.max(0.35, eye - halfY),
            maxY: Math.min(dims.height - 0.5, eye + halfY),
        };
    }

    function aimRandomTargetPos() {
        const THREE = window.THREE;
        const b = aimSpreadBounds();
        return new THREE.Vector3(
            b.minX + Math.random() * (b.maxX - b.minX),
            b.minY + Math.random() * (b.maxY - b.minY),
            aimTargetZ(),
        );
    }

    function meshTargetRadius(mesh) {
        return (mesh.userData.radius || 0) * mesh.scale.x;
    }

    function aimClampToSpread(pos) {
        const b = aimSpreadBounds();
        pos.x = Math.max(b.minX, Math.min(b.maxX, pos.x));
        pos.y = Math.max(b.minY, Math.min(b.maxY, pos.y));
    }

    function aimClearanceAt(mesh, pos) {
        if (!targetGroup) return Infinity;
        let clearance = Infinity;
        for (const other of targetGroup.children) {
            if (other === mesh) continue;
            const need = meshTargetRadius(mesh) + meshTargetRadius(other) + AIM_TARGET_GAP;
            const gap = Math.hypot(pos.x - other.position.x, pos.y - other.position.y) - need;
            if (gap < clearance) clearance = gap;
        }
        return clearance;
    }

    /** Picks a wall position inside the spread cone (Morning Roast placement). */
    function aimPlaceTarget(mesh) {
        let best = null;
        let bestClearance = -Infinity;
        for (let i = 0; i < AIM_PLACE_ATTEMPTS; i++) {
            const pos = aimRandomTargetPos();
            const clearance = aimClearanceAt(mesh, pos);
            if (clearance >= 0) {
                mesh.position.copy(pos);
                return;
            }
            if (clearance > bestClearance) {
                bestClearance = clearance;
                best = pos;
            }
        }
        if (best) mesh.position.copy(best);
    }

    function aimSeparateTargets() {
        if (!targetGroup) return;
        const list = targetGroup.children;
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const a = list[i];
                const b = list[j];
                const need = meshTargetRadius(a) + meshTargetRadius(b) + AIM_TARGET_GAP;
                let dx = a.position.x - b.position.x;
                let dy = a.position.y - b.position.y;
                let dist = Math.hypot(dx, dy);
                if (dist >= need) continue;
                if (dist < 1e-4) {
                    dx = Math.random() - 0.5;
                    dy = Math.random() - 0.5;
                    dist = Math.hypot(dx, dy) || 1;
                }
                const push = (need - dist) / 2;
                const nx = (dx / dist) * push;
                const ny = (dy / dist) * push;
                a.position.x += nx;
                a.position.y += ny;
                b.position.x -= nx;
                b.position.y -= ny;
                aimClampToSpread(a.position);
                aimClampToSpread(b.position);
            }
        }
    }

    function clearTargets() {
        if (!targetGroup) return;
        for (const mesh of [...targetGroup.children]) {
            targetGroup.remove(mesh);
            mesh.geometry?.dispose();
            mesh.material?.dispose();
        }
    }

    function aimInitTrackTarget(mesh) {
        mesh.userData.trackDir = Math.random() < 0.5 ? -1 : 1;
        if (aimIsHoldFireTrack()) {
            mesh.userData.trackYaw = 0;
            const pos = aimTrackMouseWorldFromYaw(0);
            mesh.position.set(pos.x, pos.y, pos.z);
            return;
        }
        const b = aimSpreadBounds();
        const y = b.minY + Math.random() * Math.max(0, b.maxY - b.minY);
        mesh.position.set(0, y, aimTargetZ());
        mesh.userData.trackY = y;
    }

    function aimCenterWallPos() {
        const b = aimSpreadBounds();
        return {
            x: (b.minX + b.maxX) / 2,
            y: (b.minY + b.maxY) / 2,
            z: aimTargetZ(),
        };
    }

    function aimInitReactCenterTarget(mesh) {
        const pos = aimCenterWallPos();
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.userData.reactMoving = false;
        mesh.userData.vx = 0;
        mesh.userData.vy = 0;
    }

    function aimInitReactMovingTarget(mesh) {
        const pos = aimCenterWallPos();
        mesh.position.set(pos.x, pos.y, pos.z);
        const angle = Math.random() * Math.PI * 2;
        mesh.userData.reactMoving = true;
        mesh.userData.vx = Math.cos(angle) * AIM_REACT_SPEED;
        mesh.userData.vy = Math.sin(angle) * AIM_REACT_SPEED;
        mesh.userData.reactSpawnAt = performance.now();
    }

    function aimExpireReactMovingTarget(mesh) {
        if (!targetGroup || !mesh) return;
        targetGroup.remove(mesh);
        mesh.geometry?.dispose();
        mesh.material?.dispose();
        reactPhase = 'center';
        const THREE = window.THREE;
        if (THREE) spawnOneTarget(THREE);
    }

    function updateReactTargets(dt) {
        if (!aimIsReactMode() || !targetGroup || reactPhase !== 'moving') return;
        const now = performance.now();
        for (const mesh of [...targetGroup.children]) {
            if (!mesh.userData?.isTarget || !mesh.userData.reactMoving) continue;
            const spawnedAt = Number(mesh.userData.reactSpawnAt) || now;
            if (now - spawnedAt >= AIM_REACT_MOVE_MS) {
                aimExpireReactMovingTarget(mesh);
                continue;
            }
            const vx = Number(mesh.userData.vx) || 0;
            const vy = Number(mesh.userData.vy) || 0;
            mesh.position.set(
                mesh.position.x + vx * dt,
                mesh.position.y + vy * dt,
                aimTargetZ(),
            );
        }
    }

    function updateTrackTargets(dt) {
        if (!aimIsMovingTrack() || !targetGroup) return;

        if (aimIsHoldFireTrack()) {
            const maxYaw = (AIM_TRACK_MOUSE_YAW_DEG * Math.PI) / 180;
            for (const mesh of targetGroup.children) {
                if (!mesh.userData?.isTarget) continue;
                let dir = mesh.userData.trackDir;
                if (dir !== 1 && dir !== -1) dir = 1;
                let yaw = Number(mesh.userData.trackYaw) || 0;
                yaw += dir * AIM_TRACK_MOUSE_YAW_SPEED * dt;
                if (yaw >= maxYaw) {
                    yaw = maxYaw;
                    dir = -1;
                } else if (yaw <= -maxYaw) {
                    yaw = -maxYaw;
                    dir = 1;
                }
                mesh.userData.trackYaw = yaw;
                mesh.userData.trackDir = dir;
                const pos = aimTrackMouseWorldFromYaw(yaw);
                mesh.position.set(pos.x, pos.y, pos.z);
            }
            return;
        }

        const b = aimSpreadBounds();
        for (const mesh of targetGroup.children) {
            if (!mesh.userData?.isTarget) continue;
            let dir = mesh.userData.trackDir;
            if (dir !== 1 && dir !== -1) dir = 1;
            let x = mesh.position.x + dir * AIM_TRACK_SPEED * dt;
            if (x >= b.maxX) {
                x = b.maxX;
                dir = -1;
            } else if (x <= b.minX) {
                x = b.minX;
                dir = 1;
            }
            const y = Number.isFinite(mesh.userData.trackY)
                ? mesh.userData.trackY
                : mesh.position.y;
            mesh.position.set(x, y, aimTargetZ());
            aimClampToSpread(mesh.position);
            mesh.userData.trackDir = dir;
        }
    }

    function spawnOneTarget(THREE) {
        if (!targetGroup) return;
        const radius = aimTargetRadius();
        const color = aimTargetColorHex();
        const geo = new THREE.SphereGeometry(radius, 20, 20);
        const mat = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.isTarget = true;
        mesh.userData.baseColor = color;
        mesh.userData.radius = radius;
        if (aimIsMovingTrack()) {
            aimInitTrackTarget(mesh);
        } else if (aimIsReactMode()) {
            if (reactPhase === 'moving') aimInitReactMovingTarget(mesh);
            else aimInitReactCenterTarget(mesh);
        } else {
            aimPlaceTarget(mesh);
        }
        targetGroup.add(mesh);
    }

    function fillTargets(THREE) {
        if (!targetGroup) return;
        if (aimIsReactMode()) reactPhase = 'center';
        while (targetGroup.children.length < aimTargetQuota()) {
            spawnOneTarget(THREE);
        }
        if (targetGroup.children.length > 1) aimSeparateTargets();
    }

    function consumeTarget(mesh) {
        if (!targetGroup || !mesh) return;
        targetGroup.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        const THREE = window.THREE;
        if (aimActiveMode() === 'wave') {
            if (targetGroup.children.length === 0) fillTargets(THREE);
        } else if (aimIsReactMode()) {
            reactPhase = reactPhase === 'center' ? 'moving' : 'center';
            spawnOneTarget(THREE);
        } else {
            spawnOneTarget(THREE);
        }
        if (targetGroup.children.length > 1) aimSeparateTargets();
    }

    const AIM_ASPECT_RATIOS = Object.freeze({
        '16:9': 16 / 9,
        '16:10': 16 / 10,
        '5:4': 5 / 4,
        '4:3': 4 / 3,
        '3:2': 3 / 2,
    });

    function aimForcedAspectRatio() {
        const key = getAimSettings().aspect;
        if (!key || key === 'native') return null;
        const ratio = AIM_ASPECT_RATIOS[key];
        return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
    }

    function resizeRenderer() {
        const canvas = getCanvas();
        if (!canvas || !renderer || !camera) return;
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        renderer.setSize(w, h, false);
        // Forced ratios stretch into the display like in-game stretched res.
        camera.aspect = aimForcedAspectRatio() ?? (w / h);
        camera.updateProjectionMatrix();
    }

    function animate() {
        if (!sessionActive || !renderer || !scene || !camera) return;
        const now = performance.now();
        if (sessionPhase === 'countdown') {
            tickCountdown(now);
        } else if (sessionPhase === 'playing') {
            const dt = Math.min(0.1, (now - (lastAnimTime || now)) / 1000);
            lastAnimTime = now;
            updateCameraMovement(dt);
            if (aimIsMovingTrack()) {
                updateTrackTargets(dt);
                if (aimIsHoldFireTrack() && fireHeld) {
                    const fireNow = performance.now();
                    if (fireNow - lastFireAt >= AIM_TRACK_FIRE_INTERVAL_MS) {
                        lastFireAt = fireNow;
                        shoot();
                    }
                }
            } else if (aimIsReactMode()) {
                updateReactTargets(dt);
            } else if (targetGroup && targetGroup.children.length > 1) {
                aimSeparateTargets();
            }
            if (Number.isFinite(timeLeft)) {
                timeLeft -= dt;
                updateTimerDisplay();
                if (timeLeft <= 0) {
                    timeLeft = 0;
                    updateTimerDisplay();
                    renderer.render(scene, camera);
                    finishSessionShowResults();
                    animationId = requestAnimationFrame(animate);
                    return;
                }
            } else {
                sessionElapsed += dt;
                updateTimerDisplay();
            }
        } else if (sessionPhase === 'done') {
            renderer.render(scene, camera);
            animationId = requestAnimationFrame(animate);
            return;
        }
        camera.rotation.order = 'YXZ';
        camera.rotation.y = yaw;
        camera.rotation.x = pitch;
        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
    }

    function disposeSession() {
        sessionActive = false;
        sessionPhase = null;
        fireHeld = false;
        lastFireAt = 0;
        moveKeys.clear();
        setCountdownVisible(false);
        setStartOverlayVisible(false);
        setCrosshairVisible(false);
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = 0;
        }
        if (document.pointerLockElement === getCanvas()) {
            document.exitPointerLock();
        }
        pointer.locked = false;

        const canvas = getCanvas();
        const startOverlay = byId('aim-trainer-start-overlay');
        if (canvas) {
            if (boundCanvas.click) canvas.removeEventListener('click', boundCanvas.click);
            if (boundCanvas.mousedown) canvas.removeEventListener('mousedown', boundCanvas.mousedown);
            if (boundCanvas.mousemove) canvas.removeEventListener('mousemove', boundCanvas.mousemove);
            if (boundCanvas.contextmenu) canvas.removeEventListener('contextmenu', boundCanvas.contextmenu);
        }
        if (boundCanvas.mouseup) {
            document.removeEventListener('mouseup', boundCanvas.mouseup);
        }
        if (startOverlay) {
            if (boundCanvas.startOverlayClick) {
                startOverlay.removeEventListener('click', boundCanvas.startOverlayClick);
            }
            if (boundCanvas.startOverlayKeydown) {
                startOverlay.removeEventListener('keydown', boundCanvas.startOverlayKeydown);
            }
        }
        if (boundCanvas.pointerlockchange) {
            document.removeEventListener('pointerlockchange', boundCanvas.pointerlockchange);
        }
        if (boundCanvas.keydown) {
            document.removeEventListener('keydown', boundCanvas.keydown);
        }
        if (boundCanvas.keyup) {
            document.removeEventListener('keyup', boundCanvas.keyup);
        }
        Object.keys(boundCanvas).forEach((k) => { boundCanvas[k] = null; });

        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        clearTargets();
        if (targetGroup && scene) {
            scene.remove(targetGroup);
        }
        targetGroup = null;

        if (scene) {
            scene.traverse((obj) => {
                if (!obj.isMesh) return;
                obj.geometry?.dispose?.();
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
                else obj.material?.dispose?.();
            });
        }

        renderer?.dispose?.();
        renderer = null;
        scene = null;
        camera = null;
        raycaster = null;
    }

    function shoot() {
        if (sessionPhase !== 'playing' || !sessionActive || !camera || !raycaster || !targetGroup?.children.length) return;
        const THREE = window.THREE;
        if (!THREE) return;
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hitsList = raycaster.intersectObjects(targetGroup.children, false);
        const hitEntry = hitsList.find((entry) => entry.object?.userData?.isTarget);
        if (hitEntry) {
            const mesh = hitEntry.object;
            const now = performance.now();
            hits += 1;
            score += aimPointsPerHit();
            aimRecordSpatial(true);
            aimRecordPrecision(hitEntry);
            if (aimLastHitAt > 0) {
                aimReactionTotal += now - aimLastHitAt;
                aimReactionCount += 1;
            }
            aimLastHitAt = now;
            aimUiSound()?.playAimHit?.();
            if (!aimIsHoldFireTrack()) consumeTarget(mesh);
        } else {
            misses += 1;
            aimRecordSpatial(false);
            aimUiSound()?.playAimMiss?.();
        }
        updateHud();
    }

    function restartSessionInPlace() {
        if (!sessionActive || !activeTrainingId) return;
        setResultsVisible(false);
        hits = 0;
        misses = 0;
        score = 0;
        fireHeld = false;
        lastFireAt = 0;
        reactPhase = 'center';
        timeLeft = aimSessionSeconds();
        sessionElapsed = 0;
        yaw = 0;
        pitch = 0;
        resetSessionAnalytics();
        updateHud();
        updateTimerDisplay();
        const THREE = window.THREE;
        if (THREE && targetGroup) {
            clearTargets();
            setTargetsVisible(false);
        }
        if (camera) {
            resetCameraPosition();
            camera.rotation.order = 'YXZ';
            camera.rotation.set(0, 0, 0);
        }
        moveKeys.clear();
        enterReadyPhase();
    }

    async function startSession(trainingId) {
        const training = TRAININGS.find((t) => t.id === trainingId);
        if (!training) return;

        const page = getPageRoot();
        const hub = byId('aim-trainer-hub');
        const session = byId('aim-trainer-session');
        const canvas = getCanvas();
        if (!page || !hub || !session || !canvas) return;

        aimUiSound()?.unlockAudio?.();

        disposeSession();
        activeTrainingId = trainingId;
        setResultsVisible(false);
        resetSessionAnalytics();

        hits = 0;
        misses = 0;
        score = 0;
        fireHeld = false;
        lastFireAt = 0;
        reactPhase = 'center';
        timeLeft = aimSessionSeconds();
        sessionElapsed = 0;
        lastAnimTime = 0;
        yaw = 0;
        pitch = 0;
        updateHud();
        updateTimerDisplay();
        hub.classList.add('hidden');
        session.classList.remove('hidden');
        session.setAttribute('aria-hidden', 'false');
        page.classList.add('page-aim-trainer--session');
        requestSessionFullscreen(session);

        try {
            if (typeof window.loadAimTrainerThree === 'function') {
                await window.loadAimTrainerThree();
            } else if (typeof window.THREE === 'undefined') {
                throw new Error('THREE unavailable');
            }
        } catch {
            window.CafeCore?.Toast?.show('Could not load 3D engine');
            stopSession({ skipFullscreenExit: false });
            return;
        }

        let THREE;
        try {
            THREE = ensureThree();
        } catch {
            window.CafeCore?.Toast?.show('Could not load 3D engine');
            stopSession({ skipFullscreenExit: false });
            return;
        }

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        scene = new THREE.Scene();
        scene.background = new THREE.Color(AIM_SCENE_BG);
        scene.fog = new THREE.Fog(AIM_SCENE_BG, 8, 28);

        camera = new THREE.PerspectiveCamera(75, 1, 0.1, 80);
        camera.rotation.order = 'YXZ';
        resetCameraPosition();
        camera.rotation.set(0, 0, 0);

        scene.add(buildRoom(THREE));
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(4, 8, 6);
        scene.add(dirLight);

        raycaster = new THREE.Raycaster();
        targetGroup = new THREE.Group();
        targetGroup.visible = false;
        scene.add(targetGroup);
        resizeRenderer();

        sessionActive = true;
        enterReadyPhase();
        animate();

        const startOverlay = byId('aim-trainer-start-overlay');
        boundCanvas.click = () => {
            if (sessionPhase === 'ready' && tryStartFromReady()) return;
            if (sessionPhase !== 'playing') return;
            if (document.pointerLockElement !== canvas) {
                aimRequestPointerLock(canvas);
            }
        };
        if (startOverlay) {
            boundCanvas.startOverlayClick = (event) => {
                event.stopPropagation();
                if (sessionPhase === 'ready') tryStartFromReady();
            };
            startOverlay.addEventListener('click', boundCanvas.startOverlayClick);
            boundCanvas.startOverlayKeydown = (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                if (sessionPhase !== 'ready') return;
                event.preventDefault();
                tryStartFromReady();
            };
            startOverlay.addEventListener('keydown', boundCanvas.startOverlayKeydown);
            startOverlay.setAttribute('role', 'button');
            startOverlay.setAttribute('tabindex', '0');
            startOverlay.setAttribute('aria-label', 'Click to start');
        }
        boundCanvas.mousedown = (event) => {
            if (event.button !== 0) return;
            if (document.pointerLockElement !== canvas) return;
            event.preventDefault();
            if (sessionPhase !== 'playing') return;
            if (aimIsHoldFireTrack()) {
                fireHeld = true;
                lastFireAt = performance.now();
                shoot();
                return;
            }
            shoot();
        };
        boundCanvas.mouseup = (event) => {
            if (event.button !== 0) return;
            fireHeld = false;
        };
        boundCanvas.mousemove = (event) => {
            if (sessionPhase !== 'playing' || document.pointerLockElement !== canvas) return;
            const scale = aimMouseTurnScale();
            yaw -= event.movementX * scale;
            pitch -= event.movementY * scale;
            pitch = Math.max(-AIM_PITCH_LIMIT, Math.min(AIM_PITCH_LIMIT, pitch));
        };
        boundCanvas.pointerlockchange = () => {
            pointer.locked = document.pointerLockElement === canvas;
            if (document.pointerLockElement !== canvas) {
                pointer.rawMovement = false;
                fireHeld = false;
                moveKeys.clear();
            }
        };
        boundCanvas.keydown = (event) => {
            if (event.key === 'Escape' && sessionPhase === 'done') {
                stopSession();
                return;
            }
            if (event.key === 'Escape' && document.pointerLockElement === canvas) {
                document.exitPointerLock();
                return;
            }
            if (
                sessionPhase === 'playing'
                && document.pointerLockElement === canvas
                && AIM_MOVE_KEYS.has(event.code)
            ) {
                event.preventDefault();
                moveKeys.add(event.code);
            }
        };
        boundCanvas.keyup = (event) => {
            if (AIM_MOVE_KEYS.has(event.code)) {
                moveKeys.delete(event.code);
            }
        };
        boundCanvas.contextmenu = (event) => event.preventDefault();

        canvas.addEventListener('click', boundCanvas.click);
        canvas.addEventListener('mousedown', boundCanvas.mousedown);
        document.addEventListener('mouseup', boundCanvas.mouseup);
        canvas.addEventListener('mousemove', boundCanvas.mousemove);
        canvas.addEventListener('contextmenu', boundCanvas.contextmenu);
        document.addEventListener('pointerlockchange', boundCanvas.pointerlockchange);
        document.addEventListener('keydown', boundCanvas.keydown);
        document.addEventListener('keyup', boundCanvas.keyup);

        if (typeof ResizeObserver !== 'undefined') {
            const viewport = canvas.parentElement;
            resizeObserver = new ResizeObserver(() => resizeRenderer());
            if (viewport) resizeObserver.observe(viewport);
        } else {
            window.addEventListener('resize', resizeRenderer);
        }
    }

    function stopSession(options) {
        const skipFullscreenExit = options?.skipFullscreenExit === true;
        const page = getPageRoot();
        const hub = byId('aim-trainer-hub');
        const session = getSessionEl();
        activeTrainingId = null;
        setResultsVisible(false);
        disposeSession();
        if (!skipFullscreenExit) exitSessionFullscreen();
        session?.classList.add('hidden');
        session?.setAttribute('aria-hidden', 'true');
        hub?.classList.remove('hidden');
        page?.classList.remove('page-aim-trainer--session');
        setHudVisible(false);
    }

    function bindPageUi() {
        if (pageBound) return;
        pageBound = true;

        window.AimTrainerSettings?.init?.();
        window.AimTrainerSettings?.onChange?.(() => {
            window.AimTrainerSettings?.applyCrosshairStyles?.();
            if (sessionActive && sessionPhase !== 'done') {
                applyLiveTargetFromSettings();
                resizeRenderer();
            }
        });

        bindAimTrainerListFilters();
        renderTrainingList();

        const hub = byId('aim-trainer-hub');
        if (hub && hub.dataset.aimResultsBound !== '1') {
            hub.dataset.aimResultsBound = '1';
            byId('aim-trainer-results-exit')?.addEventListener('click', () => stopSession());
            byId('aim-trainer-results-restart')?.addEventListener('click', () => restartSessionInPlace());

            const shareWrap = byId('aim-trainer-results-share-wrap');
            const shareBtn = byId('aim-trainer-results-share');
            const shareMenu = byId('aim-trainer-results-share-menu');
            const setShareOpen = (open) => {
                shareWrap?.classList.toggle('is-open', open);
                shareBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (shareMenu) shareMenu.hidden = !open;
            };
            shareBtn?.addEventListener('click', () => setShareOpen(!shareWrap?.classList.contains('is-open')));
            shareMenu?.querySelectorAll('[data-aim-share]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    setShareOpen(false);
                    const mode = btn.getAttribute('data-aim-share');
                    if (mode === 'copy') void copyResultsImage();
                    else if (mode === 'download') void downloadResultsImage();
                });
            });
            document.addEventListener('click', (event) => {
                if (!shareWrap?.contains(event.target)) setShareOpen(false);
            });
        }
        byId('aim-trainer-list')?.addEventListener('click', (event) => {
            const card = event.target.closest?.('[data-training-id]');
            if (!card) return;
            void startSession(card.dataset.trainingId);
        });
        if (!fullscreenListenersBound) {
            fullscreenListenersBound = true;
            document.addEventListener('fullscreenchange', onSessionFullscreenChange);
            document.addEventListener('webkitfullscreenchange', onSessionFullscreenChange);
        }
    }

    window.initAimTrainerPage = function initAimTrainerPage() {
        pageBound = false;
        bindPageUi();
    };

    window.teardownAimTrainerPage = function teardownAimTrainerPage() {
        stopSession();
        window.AimTrainerSettings?.teardown?.();
        pageBound = false;
    };
})();
