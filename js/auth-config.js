(function() {
  "use strict";
  var REMOTE_AUTH = "https://cafe-core.onrender.com";
  var host = window.location.hostname;
  var proto = window.location.protocol;
  if (host === "fuziveer.github.io" || proto === "file:") {
    window.__CAFE_AUTH_ORIGIN = REMOTE_AUTH;
  }
})();
