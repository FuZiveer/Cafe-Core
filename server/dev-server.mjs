import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
};

function safePath(urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    const relative = decoded === '/' ? '/index.html' : decoded;
    const resolved = path.normalize(path.join(ROOT, relative));
    if (!resolved.startsWith(ROOT)) return null;
    return resolved;
}

const server = http.createServer((req, res) => {
    const filePath = safePath(req.url || '/');
    if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
            res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use.`);
        console.error('Stop the other process, or run:');
        console.error(`  $env:PORT=8788; npm run dev`);
        console.error('On Windows, find and kill the listener:');
        console.error(`  netstat -ano | findstr :${PORT}`);
        console.error('  taskkill /PID <pid> /F');
        process.exit(1);
    }
    throw err;
});

server.listen(PORT, () => {
    console.log(`Café Core dev server: http://127.0.0.1:${PORT}`);
});
