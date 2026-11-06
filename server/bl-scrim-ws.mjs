import { WebSocketServer } from "ws";
import { readScrimRecordFile } from "./bl-scrim-store.mjs";
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
export function attachBlScrimWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(request.url || "", "http://127.0.0.1").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== SCRIM_WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(scrimMessage(readScrimRecordFile()));
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });
}
export function getScrimWebSocketPath() {
  return SCRIM_WS_PATH;
}
