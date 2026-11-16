(function () {
  "use strict";

  const RENDER_AUTH_ORIGIN = "https://cafe-core.onrender.com";
  const hostname = window.location.hostname;
  const pageProtocol = window.location.protocol;
  const isLoopbackHost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  const needsRemoteAuthOrigin =
    !isLoopbackHost && (hostname === "fuziveer.github.io" || pageProtocol === "file:");

  if (needsRemoteAuthOrigin) {
    window.__CAFE_AUTH_ORIGIN = RENDER_AUTH_ORIGIN;
  }
})();