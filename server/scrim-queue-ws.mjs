import { WebSocketServer } from "ws";
import {
  QUEUE_CAP,
  normalizeLobbyId,
  queuePayload,
  readLobby
} from "./scrim-queue-store.mjs";

export const SCRIM_LOBBY_WS_PREFIX = "/ws/scrims/lobby/";

const clientsByLobby = new Map();

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

export function broadcastScrimLobby(lobbyId, queue) {
  const id = normalizeLobbyId(lobbyId);
  if (!id) return;
  const payload = queueMessage(queue);
  for (const ws of lobbyClients(id)) {
    if (ws.readyState === 1) ws.send(payload);
  }
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