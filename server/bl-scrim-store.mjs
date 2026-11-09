import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { usesUpstashRedis, upstashRedisGetJson, upstashRedisSetJson } from "./upstash-redis.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
function resolveScrimDataPath() {
  const fromEnv = String(process.env.BL_SCRIM_RECORD_PATH || process.env.CAFE_SCRIM_RECORD_PATH || "").trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(ROOT, fromEnv);
  }
  return path.join(ROOT, "data", "bl-scrim-record.json");
}
export const SCRIM_DATA_PATH = resolveScrimDataPath();
const REDIS_KEY = String(process.env.BL_SCRIM_REDIS_KEY || "cafe:bl:scrim-record").trim();
export function normalizeScrimRecord(raw) {
  return {
    wins: Math.max(0, Math.round(Number(raw?.wins) || 0)),
    losses: Math.max(0, Math.round(Number(raw?.losses) || 0))
  };
}
function readScrimRecordFromFileSync() {
  try {
    if (!fs.existsSync(SCRIM_DATA_PATH)) {
      const initial = { wins: 0, losses: 0 };
      fs.mkdirSync(path.dirname(SCRIM_DATA_PATH), { recursive: true });
      fs.writeFileSync(SCRIM_DATA_PATH, `${JSON.stringify(initial, null, 2)}
`, "utf8");
      return initial;
    }
    const parsed = JSON.parse(fs.readFileSync(SCRIM_DATA_PATH, "utf8"));
    return normalizeScrimRecord(parsed);
  } catch {
    return { wins: 0, losses: 0 };
  }
}
function writeScrimRecordToFileSync(record) {
  const normalized = normalizeScrimRecord(record);
  fs.mkdirSync(path.dirname(SCRIM_DATA_PATH), { recursive: true });
  fs.writeFileSync(SCRIM_DATA_PATH, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
  return normalized;
}
export async function readScrimRecord() {
  if (!usesUpstashRedis()) {
    return readScrimRecordFromFileSync();
  }
  try {
    const fromRedis = await upstashRedisGetJson(REDIS_KEY);
    if (fromRedis != null && typeof fromRedis === "object") {
      return normalizeScrimRecord(fromRedis);
    }
    const fromFile = readScrimRecordFromFileSync();
    try {
      await upstashRedisSetJson(REDIS_KEY, fromFile);
    } catch {
    }
    return fromFile;
  } catch {
    return readScrimRecordFromFileSync();
  }
}
export async function writeScrimRecord(record) {
  const normalized = normalizeScrimRecord(record);
  if (!usesUpstashRedis()) {
    return writeScrimRecordToFileSync(normalized);
  }
  try {
    await upstashRedisSetJson(REDIS_KEY, normalized);
    return normalized;
  } catch {
    return writeScrimRecordToFileSync(normalized);
  }
}
