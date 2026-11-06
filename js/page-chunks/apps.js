(function () {
  'use strict';
  var store = window.__CAFE_PAGE_HTML__;
  if (!store || typeof store !== 'object') {
    store = window.__CAFE_PAGE_HTML__ = Object.create(null);
  }
  store["apps"] = "<div id=\"page-apps\" class=\"main-page w-full max-w-5xl mx-auto p-8\">\n                <div class=\"page-intro mb-8\">\n                    <h2 class=\"text-xl font-bold tracking-widest uppercase text-white\">Apps</h2>\n                    <p class=\"text-sm text-slate-400 mt-2 tracking-wide\">Apps for setup and optimization</p>\n                </div>\n                <div id=\"apps-catalog\" class=\"grid grid-cols-3 gap-3\"></div>\n            </div>\n";
})();
