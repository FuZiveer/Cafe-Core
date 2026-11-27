import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { usesUpstashRedis, upstashRedisGetJson, upstashRedisSetJson } from "./upstash-redis.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function resolveQueueCap() {
  const raw = Number(process.env.SCRIM_QUEUE_CAP);
  if (Number.isFinite(raw) && raw >= 2) return Math.min(10, Math.round(raw));
  return 2;
}

export const QUEUE_CAP = resolveQueueCap();

const REDIS_KEY = String(process.env.SCRIM_QUEUE_REDIS_KEY || "cafe:scrim-queue").trim();

function resolveQueueDataPath() {
  const fromEnv = String(process.env.SCRIM_QUEUE_PATH || "").trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(ROOT, fromEnv);
  }
  return path.join(ROOT, "data", "scrim-queue.json");
}

export const QUEUE_DATA_PATH = resolveQueueDataPath();

let memoryQueue = null;

function emptyQueue() {
  return {
    version: 0,
    slots: Array.from({ length: QUEUE_CAP }, () => null),
    matchVoicePending: false,
    lastMatchVoice: null,
    matchVoiceError: null
  };
}

function normalizeMember(raw) {
  if (!raw?.id) return null;
  const id = String(raw.id);
  if (!/^\d{17,20}$/.test(id)) return null;
  return {
    id,
    displayName: String(raw.displayName || raw.username || "Discord"),
    username: String(raw.username || ""),
    avatarUrl: String(raw.avatarUrl || ""),
    teamName: raw.teamName ? String(raw.teamName) : "",
    teamRoleId: raw.teamRoleId ? String(raw.teamRoleId) : "",
    joinedAt: Math.max(0, Number(raw.joinedAt) || Date.now())
  };
}

export function normalizeScrimQueue(raw) {
  const base = emptyQueue();
  if (!raw || typeof raw !== "object") return base;
  const slots = Array.from({ length: QUEUE_CAP }, (_, i) => {
    const m = raw.slots?.[i];
    return m ? normalizeMember(m) : null;
  });
  return {
    version: Math.max(0, Math.round(Number(raw.version) || 0)),
    slots,
    matchVoicePending: Boolean(raw.matchVoicePending),
    lastMatchVoice:
      raw.lastMatchVoice && typeof raw.lastMatchVoice === "object" ? raw.lastMatchVoice : null,
    matchVoiceError:
      raw.matchVoiceError && typeof raw.matchVoiceError === "object" ? raw.matchVoiceError : null
  };
}

function readQueueFromFileSync() {
  try {
    if (!fs.existsSync(QUEUE_DATA_PATH)) {
      const initial = emptyQueue();
      fs.mkdirSync(path.dirname(QUEUE_DATA_PATH), { recursive: true });
      fs.writeFileSync(QUEUE_DATA_PATH, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
      return initial;
    }
    return normalizeScrimQueue(JSON.parse(fs.readFileSync(QUEUE_DATA_PATH, "utf8")));
  } catch {
    return emptyQueue();
  }
}

function writeQueueToFileSync(queue) {
  const normalized = normalizeScrimQueue(queue);
  fs.mkdirSync(path.dirname(QUEUE_DATA_PATH), { recursive: true });
  fs.writeFileSync(QUEUE_DATA_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function readScrimQueue() {
  if (!usesUpstashRedis()) {
    if (!memoryQueue) memoryQueue = readQueueFromFileSync();
    return normalizeScrimQueue(memoryQueue);
  }
  try {
    const fromRedis = await upstashRedisGetJson(REDIS_KEY);
    if (fromRedis != null && typeof fromRedis === "object") {
      return normalizeScrimQueue(fromRedis);
    }
    const fromFile = readQueueFromFileSync();
    memoryQueue = fromFile;
    try {
      await upstashRedisSetJson(REDIS_KEY, fromFile);
    } catch {
    }
    return fromFile;
  } catch {
    if (!memoryQueue) memoryQueue = readQueueFromFileSync();
    return normalizeScrimQueue(memoryQueue);
  }
}

export async function writeScrimQueue(queue) {
  const normalized = normalizeScrimQueue(queue);
  memoryQueue = normalized;
  if (!usesUpstashRedis()) {
    return writeQueueToFileSync(normalized);
  }
  try {
    await upstashRedisSetJson(REDIS_KEY, normalized);
    return normalized;
  } catch {
    return writeQueueToFileSync(normalized);
  }
}

export function queueCount(queue) {
  return queue.slots.filter(Boolean).length;
}

export function queueMemberIds(queue) {
  return [
    ...new Set(
      queue.slots
        .filter((m) => m?.id)
        .map((m) => String(m.id))
    )
  ];
}

function publicPlayer(m) {
  return {
    id: m.id,
    displayName: m.displayName,
    username: m.username,
    avatarUrl: m.avatarUrl,
    teamName: m.teamName || ""
  };
}

function playerTeamLabel(p, queue) {
  return p.teamName || teamNameForUser(queue, p.id) || p.displayName || "Unknown";
}

function teamNameForUser(queue, userId) {
  for (const ch of queue.lastMatchVoice?.channels || []) {
    const name = ch.teamName || ch.channelName || "";
    if (!name) continue;
    if ((ch.memberIds || []).some((id) => String(id) === String(userId))) return name;
  }
  return "";
}

export function computeActiveMatch(queue) {
  if (queueCount(queue) < QUEUE_CAP) return null;
  const players = queue.slots.filter(Boolean);
  if (players.length < QUEUE_CAP) return null;

  const matchId =
    queue.lastMatchVoice?.matchId || `scrim-v${queue.version}`;

  const grouped = new Map();
  for (const p of players) {
    const key = playerTeamLabel(p, queue);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(publicPlayer(p));
  }

  const teamEntries = [...grouped.entries()];

  if (teamEntries.length >= 2) {
    return {
      matchId,
      status: "live",
      teams: teamEntries.slice(0, 2).map(([name, roster], index) => ({
        side: index === 0 ? "left" : "right",
        name,
        players: roster
      }))
    };
  }

  if (players.length >= 2) {
    const [left, right] = players;
    return {
      matchId,
      status: "live",
      teams: [
        {
          side: "left",
          name: playerTeamLabel(left, queue),
          players: [publicPlayer(left)]
        },
        {
          side: "right",
          name: playerTeamLabel(right, queue),
          players: [publicPlayer(right)]
        }
      ]
    };
  }

  return null;
}

export function queuePayload(queue, viewerId) {
  const uid = viewerId ? String(viewerId) : "";
  const youIdx = uid ? queue.slots.findIndex((s) => s?.id === uid) : -1;
  return {
    version: queue.version,
    capacity: QUEUE_CAP,
    count: queueCount(queue),
    slots: queue.slots.map((m) =>
      m
        ? {
            id: m.id,
            displayName: m.displayName,
            username: m.username,
            avatarUrl: m.avatarUrl,
            joinedAt: m.joinedAt,
            teamName: m.teamName || ""
          }
        : null
    ),
    youInQueue: youIdx !== -1,
    yourJoinedAt: youIdx !== -1 ? queue.slots[youIdx].joinedAt : null,
    lastMatchVoice: queue.lastMatchVoice,
    matchVoiceError: queue.matchVoiceError,
    activeMatch: computeActiveMatch(queue),
    persistence: usesUpstashRedis() ? "redis" : "ephemeral"
  };
}

export async function mutateScrimQueue(mutator) {
  const current = await readScrimQueue();
  const draft = normalizeScrimQueue(JSON.parse(JSON.stringify(current)));
  const result = mutator(draft);
  if (result === null) {
    return { ok: false, error: "queue_full", queue: current };
  }
  if (!result || typeof result !== "object") {
    return { ok: false, error: "mutation_failed", queue: current };
  }
  result.version = (current.version || 0) + 1;
  const saved = await writeScrimQueue(result);
  return { ok: true, queue: saved };
}

export function memberFromSessionUser(user) {
  if (!user?.id) return null;
  return normalizeMember({
    id: user.id,
    displayName: user.displayName || user.globalName || user.username,
    username: user.username,
    avatarUrl: user.avatarUrl,
    joinedAt: Date.now()
  });
}

export async function joinScrimQueue(user) {
  const member = memberFromSessionUser(user);
  if (!member) return { ok: false, error: "invalid_user" };
  const uid = member.id;
  const outcome = await mutateScrimQueue((q) => {
    const existingIdx = q.slots.findIndex((s) => s?.id === uid);
    if (existingIdx !== -1) {
      q.slots[existingIdx] = {
        ...member,
        joinedAt: q.slots[existingIdx].joinedAt || member.joinedAt
      };
      return q;
    }
    const emptyIdx = q.slots.findIndex((s) => !s);
    if (emptyIdx === -1) return null;
    q.slots[emptyIdx] = member;
    return q;
  });
  return outcome;
}

export async function leaveScrimQueue(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return { ok: false, error: "invalid_user" };
  const outcome = await mutateScrimQueue((q) => {
    const idx = q.slots.findIndex((s) => s?.id === uid);
    if (idx === -1) return q;
    q.slots[idx] = null;
    if (queueCount(q) < QUEUE_CAP) {
      q.matchVoicePending = false;
      q.lastMatchVoice = null;
      q.matchVoiceError = null;
    }
    return q;
  });
  return outcome;
}