import { WebSocketServer } from "ws";
import { QUEUE_CAP, readScrimQueue, queuePayload } from "./scrim-queue-store.mjs";

export const SCRIM_QUEUE_WS_PATH = "/ws/scrims/queue";

const clients = new Set();

function queueMessage(queue) {
  return JSON.stringify({
    type: "scrim_queue",
    ...queuePayload(queue, "")
  });
}

export function broadcastScrimQueue(queue) {
  const payload = queueMessage(queue);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  clients.add(ws);
  void readScrimQueue()
    .then((queue) => {
      if (ws.readyState === 1) ws.send(queueMessage(queue));
    })
    .catch(() => {
      if (ws.readyState === 1) {
        ws.send(
          JSON.stringify({
            type: "scrim_queue",
            version: 0,
            capacity: QUEUE_CAP,
            count: 0,
            slots: Array.from({ length: QUEUE_CAP }, () => null),
            youInQueue: false,
            yourJoinedAt: null,
            lastMatchVoice: null,
            activeMatch: null
          })
        );
      }
    });
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
});

export function handleScrimQueueUpgrade(request, socket, head, pathname) {
  if (pathname !== SCRIM_QUEUE_WS_PATH) return false;
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
  return true;
}