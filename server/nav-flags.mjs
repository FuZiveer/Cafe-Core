import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyCors, getSessionUser, sendJson } from "./discord-auth.mjs";
import { usesUpstashRedis, upstashRedisGetJson, upstashRedisSetJson } from "./upstash-redis.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "nav-flags.json");
const REDIS_KEY = "cafe:nav-flags";

function defaultNavFlags() {
  return { scrims: false, mouseCompare: false };
}

export function normalizeNavFlags(raw) {
  return {
    scrims: raw?.scrims === true,
    mouseCompare: raw?.mouseCompare === true
  };
}

function readNavFlagsFromFile() {
  try {
    if (!fs.existsSync(DATA_PATH)) return defaultNavFlags();
    return normalizeNavFlags(JSON.parse(fs.readFileSync(DATA_PATH, "utf8")));
  } catch {
    return defaultNavFlags();
  }
}

function writeNavFlagsToFile(flags) {
  const normalized = normalizeNavFlags(flags);
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function readNavFlags() {
  if (usesUpstashRedis()) {
    try {
      const stored = await upstashRedisGetJson(REDIS_KEY);
      if (stored && typeof stored === "object") return normalizeNavFlags(stored);
    } catch {
    }
  }
  return readNavFlagsFromFile();
}

export async function writeNavFlags(flags) {
  const normalized = normalizeNavFlags(flags);
  if (usesUpstashRedis()) {
    try {
      await upstashRedisSetJson(REDIS_KEY, normalized);
      return normalized;
    } catch {
    }
  }
  return writeNavFlagsToFile(normalized);
}

function isNavAdmin(user) {
  return String(user?.username || "").trim().toLowerCase() === "fuziveer";
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function handleNavFlagsApiRequest(req, res, url, cfg) {
  if (url.pathname !== "/api/nav-flags") return false;
  if (req.method === "OPTIONS") {
    applyCors(req, res, cfg);
    res.writeHead(204);
    res.end();
    return true;
  }
  if (req.method === "GET") {
    applyCors(req, res, cfg);
    const flags = await readNavFlags();
    sendJson(res, 200, { ok: true, ...flags });
    return true;
  }
  if (req.method === "POST") {
    applyCors(req, res, cfg);
    const user = getSessionUser(req);
    if (!isNavAdmin(user)) {
      sendJson(res, 403, { error: "not_authorized" });
      return true;
    }
    const body = await readJsonBody(req);
    if (body === null) {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const flags = await writeNavFlags(body);
    sendJson(res, 200, { ok: true, ...flags });
    return true;
  }
  return false;
}
