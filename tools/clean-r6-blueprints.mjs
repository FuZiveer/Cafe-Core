/**
 * Strips the Ubisoft tactical legend box (BREAKABLE WALLS key) from blueprint JPGs.
 * Does not fetch external sites. Yellow/red hatch marks on some sheets remain
 * (they are baked into Ubisoft's art).
 *
 * Run after fetch: node tools/clean-r6-blueprints.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { R6_MAPS, mapPublicId } from './r6-maps-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imgRoot = path.join(root, 'images', 'r6-blueprints');

async function legendScore(buf) {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: ch } = info;
    let dark = 0;
    let total = 0;
    for (let y = Math.floor(h * 0.82); y < h; y += 1) {
        for (let x = Math.floor(w * 0.72); x < w; x += 1) {
            const i = (y * w + x) * ch;
            const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
            total += 1;
            if (lum < 55) dark += 1;
        }
    }
    return total ? dark / total : 0;
}

async function stripLegendCorner(inputPath) {
    const meta = await sharp(inputPath).metadata();
    const w = meta.width;
    const h = meta.height;
    if (!w || !h) return false;

    const legW = Math.max(32, Math.round(w * 0.245));
    const legH = Math.max(32, Math.round(h * 0.175));
    const left = w - legW;
    const top = h - legH;
    const sampleTop = Math.max(0, top - 6);

    const { channels } = await sharp(inputPath)
        .extract({ left, top: sampleTop, width: legW, height: Math.min(4, h - sampleTop) })
        .stats();

    const r = Math.round(channels[0].mean);
    const g = Math.round(channels[1].mean);
    const b = Math.round(channels[2].mean);

    const patch = await sharp({
        create: { width: legW, height: legH, channels: 3, background: { r, g, b } },
    })
        .jpeg()
        .toBuffer();

    const tmp = `${inputPath}.tmp.jpg`;
    await sharp(inputPath)
        .composite([{ input: patch, left, top }])
        .jpeg({ quality: 93, mozjpeg: true })
        .toFile(tmp);
    fs.renameSync(tmp, inputPath);
    return true;
}

async function cleanFile(mapId, floorIndex, filePath) {
    const buf = fs.readFileSync(filePath);
    const score = await legendScore(buf);
    if (score <= 0.08) return;
    await stripLegendCorner(filePath);
    console.log(`  ${mapId}/${floorIndex}: legend removed`);
}

async function main() {
    for (const [key, meta] of Object.entries(R6_MAPS)) {
        const mapId = mapPublicId(key, meta);
        const dir = path.join(imgRoot, mapId);
        if (!fs.existsSync(dir)) continue;

        for (const floor of meta.floors) {
            const filePath = path.join(dir, `${floor.index}.jpg`);
            if (!fs.existsSync(filePath)) continue;
            await cleanFile(mapId, floor.index, filePath);
        }
    }
    console.log('Legend strip pass finished.');
}

await main();
