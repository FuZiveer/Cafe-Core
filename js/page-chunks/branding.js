(function () {
  'use strict';
  var store = window.__CAFE_PAGE_HTML__;
  if (!store || typeof store !== 'object') {
    store = window.__CAFE_PAGE_HTML__ = Object.create(null);
  }
  store["branding"] = "<div id=\"page-branding\" class=\"main-page w-full max-w-5xl mx-auto p-8\">\n                <div class=\"page-intro mb-8\">\n                    <h2 class=\"text-xl font-bold tracking-widest uppercase text-white\">Brand Colors</h2>\n                    <p class=\"text-sm text-slate-400 mt-2 tracking-wide\">View the core colors used across Café Core</p>\n                </div>\n                <div id=\"brand-color-list\" class=\"grid grid-cols-3 gap-3\"></div>\n                <div class=\"mt-3\">\n                    <div class=\"page-intro mb-8\">\n                        <h2 class=\"text-xl font-bold tracking-widest uppercase text-white\">Logo</h2>\n                        <p class=\"text-sm text-slate-400 mt-2 tracking-wide\">Preview the logo on brand background colors</p>\n                    </div>\n                    <div id=\"brand-logo-list\" class=\"grid grid-cols-3 gap-3\"></div>\n                </div>\n            </div>\n";
})();
