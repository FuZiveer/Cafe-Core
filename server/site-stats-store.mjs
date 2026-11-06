import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { usesUpstashRedis, upstashRedisGetJson, upstashRedisSetJson } from "./upstash-redis.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
function resolveSiteStatsPath() {
  const fromEnv = String(process.env.SITE_STATS_FILE_PATH || process.env.CAFE_SITE_STATS_PATH || "").trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(ROOT, fromEnv);
  }
  return path.join(ROOT, "data", "site-stats.json");
}
export const SITE_STATS_PATH = resolveSiteStatsPath();
const REDIS_KEY = String(process.env.SITE_STATS_REDIS_KEY || "cafe:site-stats").trim();
const MAX_DAYS = 400;
function emptyDayBuckets() {
  const out = {};
  for (let h = 0; h < 24; h++) out[String(h)] = 0;
  return out;
}
function normalizeStats(raw) {
  const daily = {};
  if (raw && typeof raw === "object" && raw.daily && typeof raw.daily === "object") {
    for (const [k, v] of Object.entries(raw.daily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      let total = 0;
      const buckets = emptyDayBuckets();
      if (v && typeof v === "object") {
        for (let h = 0; h < 24; h++) {
          const n = Math.max(0, Math.round(Number(v[String(h)]) || 0));
          buckets[String(h)] = n;
          total += n;
        }
      } else if (typeof v === "number") {
        total = Math.max(0, Math.round(v));
        buckets["12"] = total;
      }
      daily[k] = { total, buckets };
    }
  }
  return { daily };
}
function readSiteStatsFromFileSync() {
  try {
    if (!fs.existsSync(SITE_STATS_PATH)) {
      const initial = { daily: {} };
      fs.mkdirSync(path.dirname(SITE_STATS_PATH), { recursive: true });
      fs.writeFileSync(SITE_STATS_PATH, `${JSON.stringify(initial, null, 2)}
`, "utf8");
      return initial;
    }
    const parsed = JSON.parse(fs.readFileSync(SITE_STATS_PATH, "utf8"));
    return normalizeStats(parsed);
  } catch {
    return { daily: {} };
  }
}
function writeSiteStatsToFileSync(stats) {
  const normalized = normalizeStats(stats);
  fs.mkdirSync(path.dirname(SITE_STATS_PATH), { recursive: true });
  fs.writeFileSync(SITE_STATS_PATH, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
  return normalized;
}
function statsHasAnyViews(stats) {
  const d = stats?.daily;
  if (!d || typeof d !== "object") return false;
  return Object.keys(d).some((k) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
    const entry = d[k];
    return Math.max(0, Math.round(Number(entry?.total) || 0)) > 0;
  });
}
export async function readSiteStats() {
  if (!usesUpstashRedis()) {
    return readSiteStatsFromFileSync();
  }
  try {
    const fromRedis = await upstashRedisGetJson(REDIS_KEY);
    if (fromRedis != null && typeof fromRedis === "object") {
      const norm = normalizeStats(fromRedis);
      if (statsHasAnyViews(norm)) {
        return norm;
      }
    }
    const fromFile = readSiteStatsFromFileSync();
    if (statsHasAnyViews(fromFile)) {
      try {
        await upstashRedisSetJson(REDIS_KEY, fromFile);
      } catch {
      }
    }
    return fromFile;
  } catch {
    return readSiteStatsFromFileSync();
  }
}
export async function writeSiteStats(stats) {
  const normalized = normalizeStats(stats);
  if (!usesUpstashRedis()) {
    return writeSiteStatsToFileSync(normalized);
  }
  try {
    await upstashRedisSetJson(REDIS_KEY, normalized);
    return normalized;
  } catch {
    return writeSiteStatsToFileSync(normalized);
  }
}
function pruneDaily(daily) {
  const keys = Object.keys(daily).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (keys.length <= MAX_DAYS) return daily;
  const drop = keys.length - MAX_DAYS;
  for (let i = 0; i < drop; i++) {
    delete daily[keys[i]];
  }
  return daily;
}
export async function recordPageView(dateUtc, hourUtc) {
  const stats = await readSiteStats();
  const dayKey = dateUtc instanceof Date ? dateUtc.toISOString().slice(0, 10) : String(dateUtc || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return stats;
  let h = Math.floor(Number(hourUtc));
  if (!Number.isFinite(h)) h = ( new Date()).getUTCHours();
  h = Math.max(0, Math.min(23, h));
  if (!stats.daily[dayKey]) {
    stats.daily[dayKey] = { total: 0, buckets: emptyDayBuckets() };
  }
  const entry = stats.daily[dayKey];
  const hk = String(h);
  entry.buckets[hk] = Math.max(0, Math.round(Number(entry.buckets[hk]) || 0)) + 1;
  entry.total = Math.max(0, Math.round(Number(entry.total) || 0)) + 1;
  pruneDaily(stats.daily);
  return writeSiteStats(stats);
}
export async function getSiteStatsSummary({ days = 14 } = {}) {
  const stats = await readSiteStats();
  const n = Math.max(1, Math.min(90, Math.floor(Number(days) || 14)));
  const keys = Object.keys(stats.daily).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  const slice = keys.slice(-n);
  let totalAll = 0;
  const series = slice.map((k) => {
    const entry = stats.daily[k];
    const t = Math.max(0, Math.round(Number(entry?.total) || 0));
    totalAll += t;
    return { date: k, total: t };
  });
  return {
    totalAll,
    days: n,
    series
  };
}
