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
    if (!canEditScrim()) {
      removeScrimAdjustControls();
    }
    if (typeof window.syncBlScrimEditControls === "function") {
      window.syncBlScrimEditControls();
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
  function startPeriodicEnforce() {
    if (enforceTimer) return;
    enforceTimer = window.setInterval(() => enforceRestrictedUi(), 2e3);
  }
  window.enforceCafeRestrictedUi = enforceRestrictedUi;
  window.initCafeAuthUiGuard = function initCafeAuthUiGuard() {
    enforceRestrictedUi();
    startObserver();
    startPeriodicEnforce();
    window.addEventListener("cafe-discord-auth-change", () => {
      enforceRestrictedUi();
    });
    window.addEventListener("cafe-bl-api-updated", () => {
      enforceRestrictedUi();
    });
  };
})();
