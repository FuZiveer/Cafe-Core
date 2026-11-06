import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { R6_MAPS, localBlueprintPath, mapPublicId } from "./r6-maps-catalog.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "data", "r6-map-layouts.json");
function resolveImageUrl(mapId, floorIndex) {
  const rel = localBlueprintPath(mapId, floorIndex);
  const abs = path.join(root, rel.replace(/\//g, path.sep));
  return fs.existsSync(abs) ? rel : "";
}
const maps = Object.entries(R6_MAPS).map(([key, meta]) => {
  const id = mapPublicId(key, meta);
  return {
    id,
    name: meta.name,
    floors: meta.floors.map((floor) => ({
      index: floor.index,
      label: floor.label,
      imageUrl: resolveImageUrl(id, floor.index)
    }))
  };
});
maps.sort((a, b) => a.name.localeCompare(b.name, void 0, { sensitivity: "base" }));
const withImages = maps.filter((m) => m.floors.some((f) => f.imageUrl)).length;
const payload = {
  version: 2,
  source: withImages ? "local-blueprints" : "pending-images",
  imageCredit: withImages ? "Floor art synced from r6maps.com (Show All) and/or Ubisoft blueprints." : null,
  maps
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}
`, "utf8");
console.log("Wrote", path.relative(root, outPath), `(${maps.length} maps)`);
