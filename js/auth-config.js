(function() {
  "use strict";
  var REMOTE_AUTH = "https://cafe-core.onrender.com";
  var host = window.location.hostname;
  var proto = window.location.protocol;
  var localDev = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (!localDev && (host === "fuziveer.github.io" || proto === "file:")) {
    window.__CAFE_AUTH_ORIGIN = REMOTE_AUTH;
  }
})();
