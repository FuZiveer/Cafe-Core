(function () {
    'use strict';
    /** When the static site is on GitHub Pages, OAuth runs on Render (edit URL if yours changes). */
    if (window.location.hostname === 'fuziveer.github.io') {
        window.__CAFE_AUTH_ORIGIN = 'https://cafe-core.onrender.com';
    }
})();
