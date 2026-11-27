(function () {
  "use strict";

  const RENDER_AUTH_ORIGIN = "https://cafe-core.onrender.com";
  const hostname = window.location.hostname;
  const pageProtocol = window.location.protocol;
  const port = window.location.port || "";
  const isLoopbackHost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  const isLocalDevServer = isLoopbackHost && port === "8787";
  const needsRemoteAuthOrigin =
    !isLocalDevServer &&
    (hostname === "fuziveer.github.io" || pageProtocol === "file:" || isLoopbackHost);

  if (needsRemoteAuthOrigin) {
    window.__CAFE_AUTH_ORIGIN = RENDER_AUTH_ORIGIN;
  }
})();