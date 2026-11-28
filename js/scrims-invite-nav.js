(function () {
  "use strict";

  const BC_NAME = "cafe-core-scrims-invite";
  const HANDOFF_MS = 420;

  const TAB_ID = (() => {
    try {
      const key = "cafe-core-tab-id";
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch {
      return "tab";
    }
  })();

  function normalizeLobby(code) {
    if (!code) return "";
    return String(code)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);
  }

  function isScrimsInviteUrl(url) {
    const lobby = normalizeLobby(url.searchParams.get("lobby"));
    const hash = (url.hash || "").replace(/^#/, "").trim().toLowerCase();
    return Boolean(lobby) || hash === "scrims";
  }

  function canonicalScrimsInviteHref(url) {
    const next = new URL(url.href);
    if (!next.hash || next.hash === "#") next.hash = "#scrims";
    return `${next.pathname}${next.search}${next.hash}`;
  }

  function navigateScrimsInvite(href) {
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return false;
    }
    if (url.origin !== location.origin || !isScrimsInviteUrl(url)) return false;

    const nextHref = canonicalScrimsInviteHref(url);
    try {
      history.replaceState(null, "", nextHref);
    } catch {
      location.assign(nextHref);
      return true;
    }

    const onScrims =
      typeof window.applyScrimsLobbyFromUrl === "function" &&
      document.getElementById("page-scrims");

    if (onScrims) {
      window.applyScrimsLobbyFromUrl();
      window.pageLoader?.syncLocationHash?.("scrims");
    } else if (typeof window.navigateToMainPage === "function") {
      window.navigateToMainPage("scrims");
    } else {
      window.pageLoader?.syncLocationHash?.("scrims");
    }

    return true;
  }

  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(BC_NAME) : null;

  if (bc) {
    bc.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.type !== "scrims-invite-open" || !data.href) return;
      if (data.tabId === TAB_ID) return;
      navigateScrimsInvite(data.href);
      if (data.requestId) {
        bc.postMessage({ type: "scrims-invite-ack", requestId: data.requestId, tabId: TAB_ID });
      }
    });
  }

  document.addEventListener(
    "click",
    (event) => {
      const anchor = event.target.closest("a[href]");
      if (!anchor) return;
      const target = (anchor.target || "").toLowerCase();
      if (target === "_blank" || target === "_new") return;
      let url;
      try {
        url = new URL(anchor.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin || !isScrimsInviteUrl(url)) return;
      event.preventDefault();
      navigateScrimsInvite(url.href);
    },
    true
  );

  function requestHandoffIfDuplicateTab() {
    let url;
    try {
      url = new URL(location.href);
    } catch {
      return;
    }
    if (!isScrimsInviteUrl(url) || !bc || window.__cafeScrimsInviteHandoffDone) return;

    const requestId = crypto.randomUUID();
    let acked = false;

    const onAck = (event) => {
      const data = event.data;
      if (data?.type !== "scrims-invite-ack" || data.requestId !== requestId) return;
      acked = true;
      bc.removeEventListener("message", onAck);
      window.__cafeScrimsInviteHandoffDone = true;
      try {
        window.close();
      } catch {
      }
      if (!window.closed) {
        window.pushCafeNotification?.({
          title: "Lobby link opened",
          body: "Use your existing Café Core tab — the URL was updated there."
        });
      }
    };

    bc.addEventListener("message", onAck);
    bc.postMessage({
      type: "scrims-invite-open",
      href: location.href,
      requestId,
      tabId: TAB_ID
    });

    window.setTimeout(() => {
      bc.removeEventListener("message", onAck);
      if (!acked) {
        window.__cafeScrimsInviteHandoffDone = true;
      }
    }, HANDOFF_MS);
  }

  window.navigateScrimsInvite = navigateScrimsInvite;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", requestHandoffIfDuplicateTab);
  } else {
    requestHandoffIfDuplicateTab();
  }
})();