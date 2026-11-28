import { WebSocketServer } from "ws";
import {
  QUEUE_CAP,
  normalizeLobbyId,
  queuePayload,
  readLobby
} from "./scrim-queue-store.mjs";
import {
  usesUpstashRedis,
  upstashRedisGetJson,
  upstashRedisSetJson
} from "./upstash-redis.mjs";

export const SCRIM_LOBBY_WS_PREFIX = "/ws/scrims/lobby/";

const LOBBY_REV_PREFIX = String(
  process.env.SCRIM_LOBBY_REV_PREFIX || "cafe:scrim-lobby:rev:"
).trim();

const clientsByLobby = new Map();
const fanoutSeenVersion = new Map();
let fanoutTimer = null;

function lobbyClients(lobbyId) {
  const id = normalizeLobbyId(lobbyId);
  if (!clientsByLobby.has(id)) clientsByLobby.set(id, new Set());
  return clientsByLobby.get(id);
}

function queueMessage(queue) {
  return JSON.stringify({
    type: "scrim_queue",
    ...queuePayload(queue, "")
  });
}

function lobbyRevKey(lobbyId) {
  return `${LOBBY_REV_PREFIX}${normalizeLobbyId(lobbyId)}`;
}

function localBroadcastScrimLobby(lobbyId, queue) {
  const id = normalizeLobbyId(lobbyId);
  if (!id) return;
  const payload = queueMessage(queue);
  for (const ws of lobbyClients(id)) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

async function touchLobbyRevision(lobbyId, version) {
  const id = normalizeLobbyId(lobbyId);
  const v = Math.max(0, Math.round(Number(version) || 0));
  if (!id || v < 1) return;
  fanoutSeenVersion.set(id, v);
  if (!usesUpstashRedis()) return;
  try {
    await upstashRedisSetJson(lobbyRevKey(id), { v, at: Date.now() });
  } catch (err) {
    console.warn("[scrim-queue-ws] lobby revision touch failed:", err?.message || err);
  }
}

/** Fan out lobby state to local WS clients on every instance (Render multi-instance safe). */
export function broadcastScrimLobby(lobbyId, queue) {
  const id = normalizeLobbyId(lobbyId);
  if (!id) return;
  localBroadcastScrimLobby(id, queue);
  void touchLobbyRevision(id, queue?.version);
}

async function fanoutScrimsLobbyTick() {
  if (!usesUpstashRedis() || clientsByLobby.size === 0) return;
  for (const lobbyId of clientsByLobby.keys()) {
    const prev = fanoutSeenVersion.get(lobbyId) || 0;
    let rev = null;
    try {
      rev = await upstashRedisGetJson(lobbyRevKey(lobbyId));
    } catch {
      continue;
    }
    const v = Math.max(0, Math.round(Number(rev?.v) || 0));
    if (v <= prev) continue;
    let queue;
    try {
      queue = await readLobby(lobbyId);
    } catch {
      continue;
    }
    if (!queue) continue;
    fanoutSeenVersion.set(lobbyId, v);
    localBroadcastScrimLobby(lobbyId, queue);
  }
}

export function startScrimLobbyRedisFanout() {
  if (fanoutTimer != null || !usesUpstashRedis()) return;
  const ms = Math.max(
    200,
    Math.round(Number(process.env.SCRIM_LOBBY_FANOUT_MS) || 450)
  );
  fanoutTimer = setInterval(() => {
    void fanoutScrimsLobbyTick();
  }, ms);
  if (typeof fanoutTimer.unref === "function") fanoutTimer.unref();
}

/** @deprecated use broadcastScrimLobby */
export function broadcastScrimQueue(queue) {
  if (queue?.lobbyId) broadcastScrimLobby(queue.lobbyId, queue);
}

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws, lobbyId) => {
  const id = normalizeLobbyId(lobbyId);
  if (!id) {
    ws.close();
    return;
  }
  lobbyClients(id).add(ws);
  void readLobby(id)
    .then((queue) => {
      if (!queue) {
        ws.send(
          JSON.stringify({
            type: "scrim_queue",
            version: 0,
            capacity: QUEUE_CAP,
            count: 0,
            slots: Array.from({ length: QUEUE_CAP }, () => null),
            lobbyId: id,
            youInQueue: false,
            yourJoinedAt: null,
            lastMatchVoice: null,
            activeMatch: null
          })
        );
        return;
      }
      if (ws.readyState === 1) ws.send(queueMessage(queue));
    })
    .catch(() => {
      if (ws.readyState === 1) ws.close();
    });
  ws.on("close", () => {
    lobbyClients(id).delete(ws);
    if (lobbyClients(id).size === 0) clientsByLobby.delete(id);
  });
  ws.on("error", () => {
    lobbyClients(id).delete(ws);
  });
});

export function handleScrimQueueUpgrade(request, socket, head, pathname) {
  if (!pathname.startsWith(SCRIM_LOBBY_WS_PREFIX)) return false;
  const lobbyId = pathname.slice(SCRIM_LOBBY_WS_PREFIX.length).split("/")[0];
  if (!normalizeLobbyId(lobbyId)) return false;
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, lobbyId);
  });
  return true;
}