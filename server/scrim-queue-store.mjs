import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  usesUpstashRedis,
  upstashRedisCommand,
  upstashRedisGetJson,
  upstashRedisSetJson
} from "./upstash-redis.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function resolveQueueCap() {
  const raw = Number(process.env.SCRIM_QUEUE_CAP);
  if (Number.isFinite(raw) && raw >= 2) return Math.min(10, Math.round(raw));
  return 2;
}

export const QUEUE_CAP = resolveQueueCap();
export const ADMIN_CAP = 2;

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
const memoryLobbies = new Map();

const LOBBY_KEY_PREFIX = String(process.env.SCRIM_LOBBY_REDIS_PREFIX || "cafe:scrim-lobby:").trim();

export function normalizeLobbyId(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

export function generateLobbyCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

function lobbyRedisKey(lobbyId) {
  return `${LOBBY_KEY_PREFIX}${normalizeLobbyId(lobbyId)}`;
}

function emptyQueue() {
  return {
    version: 0,
    slots: Array.from({ length: QUEUE_CAP }, () => null),
    adminSlots: Array.from({ length: ADMIN_CAP }, () => null),
    matchVoicePending: false,
    lastMatchVoice: null,
    matchVoiceError: null,
    forceMatchLive: false,
    matchStartedAt: 0,
    lobbyId: "",
    hostId: "",
    createdAt: 0
  };
}

function normalizeLobbyMeta(raw, queue) {
  return {
    ...queue,
    lobbyId: raw?.lobbyId ? normalizeLobbyId(raw.lobbyId) : "",
    hostId: raw?.hostId ? String(raw.hostId) : "",
    createdAt: Math.max(0, Number(raw?.createdAt) || 0)
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
  const adminSlots = Array.from({ length: ADMIN_CAP }, (_, i) => {
    const m = raw.adminSlots?.[i];
    return m ? normalizeMember(m) : null;
  });
  const core = {
    version: Math.max(0, Math.round(Number(raw.version) || 0)),
    slots,
    adminSlots,
    matchVoicePending: Boolean(raw.matchVoicePending),
    lastMatchVoice:
      raw.lastMatchVoice && typeof raw.lastMatchVoice === "object" ? raw.lastMatchVoice : null,
    matchVoiceError:
      raw.matchVoiceError && typeof raw.matchVoiceError === "object" ? raw.matchVoiceError : null,
    forceMatchLive: Boolean(raw.forceMatchLive),
    matchStartedAt: Math.max(0, Number(raw.matchStartedAt) || 0)
  };
  return normalizeLobbyMeta(raw, core);
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

export function adminCount(queue) {
  return (queue.adminSlots || []).filter(Boolean).length;
}

function lobbyOccupantCount(queue) {
  return queueCount(queue) + adminCount(queue);
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
  if (queue.forceMatchLive !== true) return null;
  const players = queue.slots.filter(Boolean);
  if (players.length < 2) return null;

  const matchId =
    queue.lastMatchVoice?.matchId || `scrim-v${queue.version}`;
  const startedAt = Math.max(0, Number(queue.matchStartedAt) || 0);

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
      startedAt,
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
      startedAt,
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

function viewerInActiveMatch(activeMatch, uid) {
  if (!uid || !activeMatch?.teams?.length) return false;
  for (const team of activeMatch.teams) {
    for (const p of team.players || []) {
      if (p?.id && String(p.id) === uid) return true;
    }
  }
  return false;
}

function mapPublicSlot(m) {
  return m
    ? {
        id: m.id,
        displayName: m.displayName,
        username: m.username,
        avatarUrl: m.avatarUrl,
        joinedAt: m.joinedAt,
        teamName: m.teamName || ""
      }
    : null;
}

export function queuePayload(queue, viewerId) {
  const uid = viewerId ? String(viewerId) : "";
  const youIdx = uid ? queue.slots.findIndex((s) => s?.id === uid) : -1;
  const youAdminIdx =
    uid && Array.isArray(queue.adminSlots)
      ? queue.adminSlots.findIndex((s) => s?.id === uid)
      : -1;
  const activeMatch = computeActiveMatch(queue);
  const matchLive = Boolean(activeMatch);
  const youInMatch = viewerInActiveMatch(activeMatch, uid);
  const youInLobby = youIdx !== -1 || youAdminIdx !== -1;
  const youAsPlayer = youIdx !== -1;
  const youAsAdmin = youAdminIdx !== -1;
  const adminSource = Array.isArray(queue.adminSlots)
    ? queue.adminSlots
    : Array.from({ length: ADMIN_CAP }, () => null);
  return {
    version: queue.version,
    capacity: QUEUE_CAP,
    adminCapacity: ADMIN_CAP,
    count: matchLive ? 0 : queueCount(queue),
    adminCount: matchLive ? 0 : adminCount(queue),
    slots: (matchLive
      ? Array.from({ length: QUEUE_CAP }, () => null)
      : queue.slots
    ).map(mapPublicSlot),
    adminSlots: (matchLive ? Array.from({ length: ADMIN_CAP }, () => null) : adminSource).map(
      mapPublicSlot
    ),
    youInQueue: matchLive ? youInMatch : youInLobby,
    youAsPlayer: matchLive ? youInMatch : youAsPlayer,
    youAsAdmin,
    yourJoinedAt:
      youIdx !== -1
        ? queue.slots[youIdx].joinedAt
        : youAdminIdx !== -1
          ? queue.adminSlots[youAdminIdx].joinedAt
          : null,
    lastMatchVoice: queue.lastMatchVoice,
    matchVoiceError: queue.matchVoiceError,
    activeMatch,
    matchLive,
    lobbyId: queue.lobbyId || null,
    hostId: queue.hostId || null,
    youAreHost: Boolean(uid && queue.hostId && uid === String(queue.hostId)),
    persistence: usesUpstashRedis() ? "redis" : "ephemeral"
  };
}

export async function readLobby(lobbyId) {
  const id = normalizeLobbyId(lobbyId);
  if (!id) return null;
  if (!usesUpstashRedis()) {
    const fromMem = memoryLobbies.get(id);
    return fromMem ? normalizeScrimQueue(fromMem) : null;
  }
  try {
    const fromRedis = await upstashRedisGetJson(lobbyRedisKey(id));
    if (fromRedis != null && typeof fromRedis === "object") {
      return normalizeScrimQueue(fromRedis);
    }
    return memoryLobbies.get(id) ? normalizeScrimQueue(memoryLobbies.get(id)) : null;
  } catch {
    const fromMem = memoryLobbies.get(id);
    return fromMem ? normalizeScrimQueue(fromMem) : null;
  }
}

export async function writeLobby(lobbyId, queue) {
  const id = normalizeLobbyId(lobbyId);
  if (!id) throw new Error("invalid_lobby_id");
  const normalized = normalizeScrimQueue({ ...queue, lobbyId: id });
  memoryLobbies.set(id, normalized);
  if (!usesUpstashRedis()) {
    return normalized;
  }
  try {
    await upstashRedisSetJson(lobbyRedisKey(id), normalized);
    return normalized;
  } catch {
    return normalized;
  }
}

export async function listAllLobbies() {
  if (!usesUpstashRedis()) {
    return [...memoryLobbies.values()].map((q) => normalizeScrimQueue(q));
  }
  try {
    const pattern = `${LOBBY_KEY_PREFIX}*`;
    const keys = await upstashRedisCommand(["KEYS", pattern]);
    const list = Array.isArray(keys) ? keys : keys != null && keys !== "" ? [keys] : [];
    const queues = [];
    for (const key of list) {
      const keyStr = typeof key === "string" ? key : String(key);
      const q = await upstashRedisGetJson(keyStr);
      if (q) queues.push(normalizeScrimQueue(q));
    }
    return queues;
  } catch {
    return [...memoryLobbies.values()].map((q) => normalizeScrimQueue(q));
  }
}

export async function listLiveActiveMatches() {
  const queues = await listAllLobbies();
  const matches = [];
  for (const queue of queues) {
    const activeMatch = computeActiveMatch(queue);
    if (!activeMatch) continue;
    matches.push({
      lobbyId: queue.lobbyId || "",
      activeMatch
    });
  }
  return matches;
}

/** Clears stale live match state (player roster + force flag). Keeps lobby + admin slots. */
export async function purgeAllScrimsMatchStateOnBoot() {
  const queues = await listAllLobbies();
  const cleared = [];
  for (const queue of queues) {
    const id = normalizeLobbyId(queue.lobbyId);
    if (!id) continue;
    const staleLive = Boolean(computeActiveMatch(queue) || queue.forceMatchLive);
    if (!staleLive) continue;
    const outcome = await mutateLobby(id, (q) => {
      ensureLobbyRosterShape(q);
      q.forceMatchLive = false;
      q.matchStartedAt = 0;
      q.slots = Array.from({ length: QUEUE_CAP }, () => null);
      q.matchVoicePending = false;
      q.lastMatchVoice = null;
      q.matchVoiceError = null;
      return q;
    });
    if (outcome.ok) cleared.push({ lobbyId: id, queue: outcome.queue });
  }
  return cleared;
}

export async function deleteLobby(lobbyId) {
  const id = normalizeLobbyId(lobbyId);
  if (!id) return;
  memoryLobbies.delete(id);
  if (!usesUpstashRedis()) return;
  try {
    await upstashRedisCommand(["DEL", lobbyRedisKey(id)]);
  } catch {
  }
}

export async function mutateLobby(lobbyId, mutator) {
  const id = normalizeLobbyId(lobbyId);
  if (!id) return { ok: false, error: "invalid_lobby" };
  const current = (await readLobby(id)) || normalizeScrimQueue({ lobbyId: id });
  const draft = normalizeScrimQueue(JSON.parse(JSON.stringify(current)));
  draft.lobbyId = id;
  const result = mutator(draft);
  if (result === null) {
    return { ok: false, error: "queue_full", queue: current };
  }
  if (result && typeof result === "object" && result.error) {
    return { ok: false, error: String(result.error), queue: current };
  }
  if (!result || typeof result !== "object") {
    return { ok: false, error: "mutation_failed", queue: current };
  }
  result.version = (current.version || 0) + 1;
  result.lobbyId = id;
  const saved = await writeLobby(id, result);
  return { ok: true, queue: saved };
}

export async function createLobby(user) {
  const member = memberFromSessionUser(user);
  if (!member) return { ok: false, error: "invalid_user" };
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateLobbyCode();
    const existing = await readLobby(code);
    if (existing && lobbyOccupantCount(existing) > 0) continue;
    const lobby = emptyQueue();
    lobby.lobbyId = code;
    lobby.hostId = member.id;
    lobby.createdAt = Date.now();
    lobby.version = 1;
    await writeLobby(code, lobby);
    return { ok: true, lobbyId: code, queue: lobby };
  }
  return { ok: false, error: "create_failed" };
}

function ensureLobbyRosterShape(q) {
  if (!Array.isArray(q.adminSlots) || q.adminSlots.length !== ADMIN_CAP) {
    q.adminSlots = Array.from({ length: ADMIN_CAP }, (_, i) =>
      Array.isArray(q.adminSlots) ? q.adminSlots[i] || null : null
    );
  }
}

function refreshMemberInPlace(collection, idx, member) {
  collection[idx] = {
    ...member,
    joinedAt: collection[idx].joinedAt || member.joinedAt
  };
}

export async function joinLobby(lobbyId, user, role = "player") {
  const id = normalizeLobbyId(lobbyId);
  if (!id) return { ok: false, error: "invalid_lobby" };
  const member = memberFromSessionUser(user);
  if (!member) return { ok: false, error: "invalid_user" };
  const exists = await readLobby(id);
  if (!exists) return { ok: false, error: "lobby_not_found" };
  const uid = member.id;
  const joinRole = role === "admin" ? "admin" : "player";
  return mutateLobby(id, (q) => {
    ensureLobbyRosterShape(q);
    if (!q.hostId) q.hostId = uid;
    const playerIdx = q.slots.findIndex((s) => s?.id === uid);
    const adminIdx = q.adminSlots.findIndex((s) => s?.id === uid);

    if (joinRole === "admin") {
      if (playerIdx !== -1) return { error: "already_in_lobby" };
      if (adminIdx !== -1) {
        refreshMemberInPlace(q.adminSlots, adminIdx, member);
        return q;
      }
      const emptyIdx = q.adminSlots.findIndex((s) => !s);
      if (emptyIdx === -1) return { error: "admin_full" };
      q.adminSlots[emptyIdx] = member;
      return q;
    }

    if (adminIdx !== -1) return { error: "already_in_lobby" };
    if (playerIdx !== -1) {
      refreshMemberInPlace(q.slots, playerIdx, member);
      return q;
    }
    const emptyIdx = q.slots.findIndex((s) => !s);
    if (emptyIdx === -1) return null;
    q.slots[emptyIdx] = member;
    return q;
  });
}

function userInLobbyRoster(q, uid) {
  if (!q || !uid) return false;
  ensureLobbyRosterShape(q);
  if (q.slots.some((s) => s?.id === uid)) return true;
  if (q.adminSlots.some((s) => s?.id === uid)) return true;
  return false;
}

export async function startLobbyMatch(lobbyId, userId) {
  const id = normalizeLobbyId(lobbyId);
  if (!id) return { ok: false, error: "invalid_lobby" };
  const uid = String(userId || "").trim();
  if (!uid) return { ok: false, error: "invalid_user" };
  const current = await readLobby(id);
  if (!current) return { ok: false, error: "lobby_not_found" };
  if (computeActiveMatch(current)) {
    return { ok: true, queue: current, alreadyLive: true };
  }
  const isAdmin = (current.adminSlots || []).some((s) => s?.id === uid);
  const isHost = String(current.hostId) === uid;
  if (!isAdmin && !isHost) return { ok: false, error: "not_authorized" };
  if (lobbyOccupantCount(current) <= 2) {
    return { ok: false, error: "not_enough_lobby_members" };
  }
  if (queueCount(current) < 2) return { ok: false, error: "not_enough_players" };
  const outcome = await mutateLobby(id, (q) => {
    ensureLobbyRosterShape(q);
    const canAdmin = q.adminSlots.some((s) => s?.id === uid);
    const canHost = String(q.hostId) === uid;
    if (!canAdmin && !canHost) return { error: "not_authorized" };
    if (lobbyOccupantCount(q) <= 2) return { error: "not_enough_lobby_members" };
    if (queueCount(q) < 2) return { error: "not_enough_players" };
    q.forceMatchLive = true;
    if (!q.matchStartedAt) q.matchStartedAt = Date.now();
    return q;
  });
  if (!outcome.ok) {
    return { ok: false, error: outcome.error || "start_failed", queue: outcome.queue };
  }
  return { ok: true, queue: outcome.queue };
}

export async function leaveLobby(lobbyId, userId) {
  const id = normalizeLobbyId(lobbyId);
  if (!id) return { ok: false, error: "invalid_lobby" };
  const uid = String(userId || "").trim();
  if (!uid) return { ok: false, error: "invalid_user" };
  const current = await readLobby(id);
  if (
    current &&
    String(current.hostId) === uid &&
    !userInLobbyRoster(current, uid)
  ) {
    await deleteLobby(id);
    return {
      ok: true,
      deleted: true,
      queue: normalizeScrimQueue({ ...current, lobbyId: id, hostId: "" })
    };
  }
  const outcome = await mutateLobby(id, (q) => {
    ensureLobbyRosterShape(q);
    let touched = false;
    const playerIdx = q.slots.findIndex((s) => s?.id === uid);
    if (playerIdx !== -1) {
      q.slots[playerIdx] = null;
      touched = true;
      if (String(q.hostId) === uid) {
        const nextHost = q.slots.find((s) => s?.id);
        q.hostId = nextHost?.id ? String(nextHost.id) : "";
      }
      if (queueCount(q) < QUEUE_CAP) {
        q.matchVoicePending = false;
        q.lastMatchVoice = null;
        q.matchVoiceError = null;
        q.forceMatchLive = false;
        q.matchStartedAt = 0;
      }
    }
    const adminIdx = q.adminSlots.findIndex((s) => s?.id === uid);
    if (adminIdx !== -1) {
      q.adminSlots[adminIdx] = null;
      touched = true;
    }
    if (!touched) return q;
    return q;
  });
  const after = outcome.queue;
  if (after && lobbyOccupantCount(after) === 0) {
    await deleteLobby(id);
    return {
      ...outcome,
      deleted: true,
      queue: {
        ...after,
        lobbyId: id,
        slots: after.slots.map(() => null),
        adminSlots: (after.adminSlots || []).map(() => null),
        count: 0
      }
    };
  }
  return outcome;
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