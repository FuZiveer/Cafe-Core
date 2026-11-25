(function() {
  "use strict";
  const SCRIM_ADJUST_SELECTOR = ".bl-scrim-counter-adjust";
  let observer = null;
  let enforceTimer = 0;
  function canEditScrim() {
    return typeof window.canEditBlScrimRecord === "function" && window.canEditBlScrimRecord();
  }
  function removeScrimAdjustControls() {
    document.querySelectorAll(SCRIM_ADJUST_SELECTOR).forEach((el) => el.remove());
    document.querySelectorAll("#bl-scrim-counter").forEach((section) => {
      section.classList.remove("bl-scrim-counter--editable");
    });
  }
  function enforceRestrictedUi() {
    if (typeof window.syncBlScrimEditControls === "function") {
      window.syncBlScrimEditControls();
      return;
    }
    if (!canEditScrim()) {
      removeScrimAdjustControls();
    }
  }
  function onDomMutation() {
    if (canEditScrim()) return;
    if (document.querySelector(SCRIM_ADJUST_SELECTOR) || document.querySelector("#bl-scrim-counter.bl-scrim-counter--editable")) {
      enforceRestrictedUi();
    }
  }
  function startObserver() {
    if (observer) return;
    const root = document.getElementById("main-content");
    const targets = [root, document.body].filter(Boolean);
    if (!targets.length) return;
    observer = new MutationObserver(() => {
      onDomMutation();
    });
    targets.forEach((target) => {
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-hidden"]
      });
    });
  }
  function stopPeriodicEnforce() {
    if (!enforceTimer) return;
    window.clearInterval(enforceTimer);
    enforceTimer = 0;
  }
  function startPeriodicEnforce() {
    if (enforceTimer) return;
    if (document.visibilityState !== "visible") return;
    enforceTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      enforceRestrictedUi();
    }, 15e3);
  }
  function syncPeriodicEnforceWithVisibility() {
    if (document.visibilityState === "visible") startPeriodicEnforce();
    else stopPeriodicEnforce();
  }
  window.enforceCafeRestrictedUi = enforceRestrictedUi;
  window.initCafeAuthUiGuard = function initCafeAuthUiGuard() {
    enforceRestrictedUi();
    startObserver();
    syncPeriodicEnforceWithVisibility();
    document.addEventListener("visibilitychange", syncPeriodicEnforceWithVisibility);
    window.addEventListener("cafe-discord-auth-change", () => {
      enforceRestrictedUi();
    });
    window.addEventListener("cafe-bl-api-updated", () => {
      enforceRestrictedUi();
    });
  };
})();
