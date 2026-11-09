import { WebSocketServer } from "ws";
import { readScrimRecord } from "./bl-scrim-store.mjs";
const SCRIM_WS_PATH = "/ws/bl/scrim";
const clients = new Set();
function scrimMessage(record) {
  return JSON.stringify({
    type: "scrim",
    wins: record.wins,
    losses: record.losses
  });
}
export function broadcastScrimRecord(record) {
  const payload = scrimMessage(record);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}
const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws) => {
  clients.add(ws);
  void readScrimRecord().then((record) => {
    if (ws.readyState === 1) ws.send(scrimMessage(record));
  }).catch(() => {
    if (ws.readyState === 1) {
      ws.send(scrimMessage({ wins: 0, losses: 0 }));
    }
  });
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
});
export function handleScrimUpgrade(request, socket, head, pathname) {
  if (pathname !== SCRIM_WS_PATH) return false;
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
  return true;
}
