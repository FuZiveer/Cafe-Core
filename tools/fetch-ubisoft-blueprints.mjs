/**
 * Downloads official Ubisoft Siege blueprint ZIPs and extracts clean floor JPGs
 * into images/r6-blueprints/{mapId}/{floorIndex}.jpg
 *
 * Run once (or after Ubisoft updates): node tools/fetch-ubisoft-blueprints.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    R6_MAPS,
    mapPublicId,
    ubisoftZipUrl,
} from './r6-maps-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'images', 'r6-blueprints');
const tmpRoot = path.join(root, '.tmp', 'r6-blueprints');

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

async function download(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

function extractZip(zipPath, destDir) {
    ensureDir(destDir);
    if (process.platform === 'win32') {
        execFileSync('tar', ['-xf', zipPath, '-C', destDir], { stdio: 'pipe' });
    } else {
        execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'pipe' });
    }
}

function blueprintNumberFromName(name) {
    const match = /blueprint-(\d+)\.jpe?g$/i.exec(path.basename(name));
    return match ? Number(match[1]) : null;
}

function collectJpegFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('__MACOSX')) continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) collectJpegFiles(abs, out);
        else if (/\.jpe?g$/i.test(entry.name)) out.push(abs);
    }
    return out;
}

async function processMap(key, meta) {
    const mapId = mapPublicId(key, meta);
    const zipSlug = meta.ubisoftZip;
    const url = ubisoftZipUrl(zipSlug);
    const mapOut = path.join(outRoot, mapId);
    const mapTmp = path.join(tmpRoot, mapId);

    ensureDir(mapOut);
    fs.rmSync(mapTmp, { recursive: true, force: true });
    ensureDir(mapTmp);

    let zipBuf;
    try {
        zipBuf = await download(url);
    } catch (err) {
        console.warn(`Skip ${mapId}: ${err.message} (${url})`);
        return false;
    }

    const zipPath = path.join(mapTmp, 'bundle.zip');
    fs.writeFileSync(zipPath, zipBuf);
    extractZip(zipPath, mapTmp);

    const byBlueprint = new Map();
    for (const file of collectJpegFiles(mapTmp)) {
        const n = blueprintNumberFromName(file);
        if (n != null) byBlueprint.set(n, file);
    }

    let ok = 0;
    for (const floor of meta.floors) {
        const src = byBlueprint.get(floor.blueprint);
        if (!src) {
            console.warn(`  Missing blueprint-${floor.blueprint} for ${mapId} (${floor.label})`);
            continue;
        }
        const dest = path.join(mapOut, `${floor.index}.jpg`);
        fs.copyFileSync(src, dest);
        ok += 1;
    }

    console.log(`OK ${mapId}: ${ok}/${meta.floors.length} floors`);
    return ok > 0;
}

function mapsToProcess() {
    const only = process.argv.find((a) => a.startsWith('--map='))?.slice('--map='.length);
    const entries = Object.entries(R6_MAPS);
    if (!only) return entries;
    const match = entries.find(([key, meta]) => {
        const id = mapPublicId(key, meta);
        return key === only || id === only;
    });
    if (!match) {
        console.error(`Unknown map "${only}". Use catalog id (e.g. bank).`);
        process.exit(1);
    }
    return [match];
}

async function main() {
    ensureDir(outRoot);
    ensureDir(tmpRoot);

    const entries = mapsToProcess();
    let success = 0;
    for (const [key, meta] of entries) {
        if (await processMap(key, meta)) success += 1;
    }

    fs.rmSync(tmpRoot, { recursive: true, force: true });
    console.log(`Done. ${success}/${entries.length} map(s) with local blueprints.`);
    console.log('Run: node tools/generate-r6-map-layouts.mjs');
    console.log('Run: node tools/clean-r6-blueprints.mjs');
}

await main();
