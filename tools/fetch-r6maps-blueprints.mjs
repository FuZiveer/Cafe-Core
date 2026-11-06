import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  R6_MAPS,
  localBlueprintPath,
  mapPublicId,
  r6mapsFloorImageUrl
} from "./r6-maps-catalog.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function mapsToProcess() {
  const only = process.argv.find((a) => a.startsWith("--map="))?.slice("--map=".length);
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
async function download(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "CafeCore-BL-Planner/1.0 (local asset sync)" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
async function processMap(key, meta) {
  const mapId = mapPublicId(key, meta);
  const mapOut = path.join(root, "images", "r6-blueprints", mapId);
  ensureDir(mapOut);
  let ok = 0;
  for (const floor of meta.floors) {
    const url = r6mapsFloorImageUrl(key, meta, floor);
    const dest = path.join(mapOut, `${floor.index}.jpg`);
    try {
      const buf = await download(url);
      if (buf.length < 1024) {
        console.warn(`  Skip ${mapId}/${floor.index}: file too small (${url})`);
        continue;
      }
      fs.writeFileSync(dest, buf);
      ok += 1;
      console.log(`  ${mapId}/${floor.index} \u2190 ${url}`);
    } catch (err) {
      console.warn(`  Missing ${mapId}/${floor.index}: ${err.message} (${url})`);
    }
  }
  console.log(`OK ${mapId}: ${ok}/${meta.floors.length} floors (r6maps)`);
  return ok > 0;
}
async function main() {
  const entries = mapsToProcess();
  let success = 0;
  for (const [key, meta] of entries) {
    if (await processMap(key, meta)) success += 1;
  }
  console.log(`Done. ${success}/${entries.length} map(s) from r6maps.com.`);
  console.log("Run: node tools/generate-r6-map-layouts.mjs");
}
await main();
