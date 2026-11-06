export const R6_MAPS = {};
export function mapPublicId(key, meta) {
  return meta.id || key;
}
export const UBISOFT_BLUEPRINT_ZIP_BASE = "https://ubistatic-a.ubisoft.com/0106/gamesites/rainbow6/blueprints";
export function ubisoftZipUrl(zipSlug) {
  return `${UBISOFT_BLUEPRINT_ZIP_BASE}/r6-maps-${zipSlug}-blueprints.zip`;
}
export function localBlueprintPath(mapId, floorIndex) {
  return `images/r6-blueprints/${mapId}/${floorIndex}.jpg`;
}
export function r6mapsSlug(key, meta) {
  if (meta.r6mapsSlug) return meta.r6mapsSlug;
  const id = mapPublicId(key, meta);
  return id;
}
export function r6mapsImageIndex(meta, floor) {
  if (Number.isInteger(floor.r6mapsIndex)) return floor.r6mapsIndex;
  const firstLabel = (meta.floors[0]?.label || "").toLowerCase();
  const zeroBased = firstLabel.includes("basement");
  return zeroBased ? floor.index : floor.index + 1;
}
export function r6mapsFloorImageUrl(key, meta, floor) {
  const slug = r6mapsSlug(key, meta);
  const imageIndex = r6mapsImageIndex(meta, floor);
  return `https://www.r6maps.com/img/${slug}/${slug}-${imageIndex}.jpg`;
}
