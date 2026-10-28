const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8');

const start = html.indexOf('<div id="main-content"');
const end = html.indexOf('\n    </main>', start);
if (start < 0 || end < 0) throw new Error('markers not found');

const replacement = `        <div id="main-content" class="flex-1 overflow-auto"></div>`;

html = html.slice(0, start) + replacement + html.slice(end);

html = html.replace(
    '<script src="data/sensitivity-games.js" defer></script>\n    <script src="sensitivity-engine.js" defer></script>\n    <script src="script.js" defer></script>',
    '<script src="page-loader.js" defer></script>\n    <script src="script.js" defer></script>',
);

fs.writeFileSync(file, html);
console.log('slimmed index.html main-content');
