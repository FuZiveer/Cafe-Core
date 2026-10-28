const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const map = {
  default: 'page-default',
  apps: 'page-apps',
  branding: 'page-branding',
  bottleneck: 'page-bottleneck',
  sensitivity: 'page-sensitivity',
  edpi: 'page-edpi',
  notes: 'page-notes',
  privacy: 'page-privacy-policy',
  terms: 'page-terms-of-service',
  fuziveer: 'page-fuziveer',
};

function extractFrom(open) {
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html.slice(i, i + 4) === '<div') depth++;
    if (html.slice(i, i + 6) === '</div>') {
      depth--;
      if (depth === 0) return html.slice(open, i + 6);
    }
  }
  throw new Error('unclosed div at ' + open);
}

function extractDiv(id) {
  const marker = `id="${id}"`;
  const open = html.indexOf(marker);
  if (open < 0) throw new Error('missing ' + id);
  const divStart = html.lastIndexOf('<div', open);
  return extractFrom(divStart);
}

const pagesDir = path.join(root, 'pages');
fs.mkdirSync(pagesDir, { recursive: true });

for (const [key, id] of Object.entries(map)) {
  const chunk = extractDiv(id);
  fs.writeFileSync(path.join(pagesDir, key + '.html'), chunk.trim() + '\n');
  console.log('wrote', key, chunk.length);
}
