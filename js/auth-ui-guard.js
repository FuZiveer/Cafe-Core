(function () {
    'use strict';

    const BL_PLANNER_FLYOUT_ID = 'strat-bl-planner';
    const SCRIM_ADJUST_SELECTOR = '.bl-scrim-counter-adjust';
    const BL_PLANNER_PAGE_ID = 'page-bl-planner';
    const PLAYLIST_WARMUP_SELECTOR = '[data-playlist-id="warmup-5m"]';

    let observer = null;
    let enforceTimer = 0;
    let tamperNoticeShown = false;

    function detectedIdentityLabel() {
        const user = typeof window.getDiscordAuthUser === 'function' ? window.getDiscordAuthUser() : null;
        const username = String(user?.username || '').trim();
        if (username) return `@${username}`;
        return 'Guest';
    }

    function canUseBlPlanner() {
        return typeof window.isBlPlannerAllowed === 'function' && window.isBlPlannerAllowed();
    }

    function canEditScrim() {
        return typeof window.canEditBlScrimRecord === 'function' && window.canEditBlScrimRecord();
    }

    function isFlyoutItemBlPlanner(el) {
        if (!el?.getAttribute) return false;
        const onclick = el.getAttribute('onclick') || '';
        return onclick.includes(`'${BL_PLANNER_FLYOUT_ID}'`) || onclick.includes(`"${BL_PLANNER_FLYOUT_ID}"`);
    }

    function buildRestrictedPanel(title, detail) {
        const identity = detectedIdentityLabel();
        return `
            <div class="auth-restricted-panel" role="alert">
                <div class="auth-restricted-panel-icon" aria-hidden="true"><i class="fa-solid fa-shield-halved"></i></div>
                <h2 class="auth-restricted-panel-title">${title}</h2>
                <p class="auth-restricted-panel-detail">${detail}</p>
                <p class="auth-restricted-panel-identity">Detected: <strong>${identity}</strong></p>
            </div>`;
    }

    function removeScrimAdjustControls() {
        document.querySelectorAll(SCRIM_ADJUST_SELECTOR).forEach((el) => el.remove());
        document.querySelectorAll('#bl-scrim-counter').forEach((section) => {
            section.classList.remove('bl-scrim-counter--editable');
        });
    }

    function removeBlPlannerFlyoutEntries() {
        document.querySelectorAll('#flyout-content .flyout-item, #flyout-content button, #flyout-content a').forEach((el) => {
            if (isFlyoutItemBlPlanner(el)) el.remove();
        });
    }

    function removeBlPlannerPlaylistCards() {
        document.querySelectorAll(PLAYLIST_WARMUP_SELECTOR).forEach((el) => el.remove());
    }

    function lockBlPlannerPage() {
        const page = document.getElementById(BL_PLANNER_PAGE_ID);
        if (!page) return;
        const active = page.classList.contains('main-page-active');
        if (!active) return;
        if (canUseBlPlanner()) {
            if (page.dataset.authRestricted === '1' && typeof window.pageLoader?.mountMainPageElement === 'function') {
                delete page.dataset.authRestricted;
                void window.pageLoader.mountMainPageElement('bl-planner');
            }
            return;
        }
        if (page.dataset.authRestricted === '1') return;
        page.dataset.authRestricted = '1';
        page.innerHTML = buildRestrictedPanel(
            'BL planner restricted',
            'This page is limited to authorized staff. The content was blocked on this device.',
        );
        if (typeof window.navigateToMainPage === 'function') {
            setTimeout(() => {
                if (!canUseBlPlanner() && document.getElementById(BL_PLANNER_PAGE_ID)?.classList.contains('main-page-active')) {
                    window.navigateToMainPage('default');
                }
            }, 120);
        }
    }

    function notifyTamperOnce() {
        if (tamperNoticeShown) return;
        tamperNoticeShown = true;
        const identity = detectedIdentityLabel();
        window.pushCafeNotification?.({
            title: 'Restricted controls blocked',
            body: `${identity} — staff-only UI cannot be enabled from the browser console.`,
        });
    }

    function enforceRestrictedUi(options = {}) {
        const tamper = options.reason === 'tamper';
        if (tamper) notifyTamperOnce();

        if (!canEditScrim()) {
            removeScrimAdjustControls();
            if (typeof window.syncBlScrimEditControls === 'function') {
                window.syncBlScrimEditControls();
            }
        } else if (typeof window.syncBlScrimEditControls === 'function') {
            window.syncBlScrimEditControls();
        }

        if (!canUseBlPlanner()) {
            removeBlPlannerFlyoutEntries();
            removeBlPlannerPlaylistCards();
            lockBlPlannerPage();
        }
    }

    function onDomMutation() {
        if (canUseBlPlanner() && canEditScrim()) return;

        let tampered = false;

        if (!canEditScrim()) {
            if (document.querySelector(SCRIM_ADJUST_SELECTOR)) tampered = true;
            if (document.querySelector('#bl-scrim-counter.bl-scrim-counter--editable')) tampered = true;
        }

        if (!canUseBlPlanner()) {
            document.querySelectorAll('#flyout-content .flyout-item, #flyout-content button').forEach((el) => {
                if (isFlyoutItemBlPlanner(el) && el.offsetParent !== null) tampered = true;
            });
            document.querySelectorAll(PLAYLIST_WARMUP_SELECTOR).forEach((el) => {
                if (el.offsetParent !== null) tampered = true;
            });
            const page = document.getElementById(BL_PLANNER_PAGE_ID);
            if (page?.classList.contains('main-page-active') && page.dataset.authRestricted !== '1') {
                const panel = page.querySelector('.auth-restricted-panel');
                if (!panel) tampered = true;
            }
        }

        if (tampered) enforceRestrictedUi({ reason: 'tamper' });
    }

    function startObserver() {
        if (observer) return;
        const root = document.getElementById('main-content');
        const flyout = document.getElementById('flyout-content');
        const targets = [root, flyout, document.body].filter(Boolean);
        if (!targets.length) return;

        observer = new MutationObserver(() => {
            onDomMutation();
        });

        targets.forEach((target) => {
            observer.observe(target, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
            });
        });
    }

    function startPeriodicEnforce() {
        if (enforceTimer) return;
        enforceTimer = window.setInterval(() => enforceRestrictedUi(), 2000);
    }

    window.enforceCafeRestrictedUi = enforceRestrictedUi;

    window.initCafeAuthUiGuard = function initCafeAuthUiGuard() {
        enforceRestrictedUi();
        startObserver();
        startPeriodicEnforce();
        window.addEventListener('cafe-discord-auth-change', () => {
            tamperNoticeShown = false;
            enforceRestrictedUi();
        });
    };
})();
