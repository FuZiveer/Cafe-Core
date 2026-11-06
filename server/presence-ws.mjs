import { WebSocketServer } from "ws";

export const PRESENCE_WS_PATH = "/ws/presence";

const PAGE_LABELS = {
  default: "Browsing home",
  apps: "Browsing apps",
  branding: "Viewing branding",
  fuziveer: "Viewing FuZiveer",
  "black-listed": "Viewing Black-Listed",
  privacy: "Reading privacy policy",
  terms: "Reading terms",
  bottleneck: "Checking bottleneck",
  sensitivity: "Converting sensitivity",
  edpi: "Calculating eDPI",
  lineups: "Browsing lineups",
  "bl-planner": "Using BL planner",
  "aim-trainer": "Training aim"
};

const wss = new WebSocketServer({ noServer: true });
let idSeq = 0;
const sessions = new Map();

function activityLabel(pageKey) {
  const k = String(pageKey || "").trim();
  return PAGE_LABELS[k] || (k ? `Viewing ${k}` : "Online");
}

function broadcastPresence() {
  const users = [];
  for (const st of sessions.values()) {
    users.push({
      id: st.publicId,
      pageKey: st.pageKey,
      activity: activityLabel(st.pageKey),
      name: st.displayName || "Guest"
    });
  }
  const payload = JSON.stringify({ type: "presence", count: users.length, users });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

wss.on("connection", (ws) => {
  const publicId = `u-${++idSeq}`;
  const state = { publicId, pageKey: "default", displayName: "Guest" };
  sessions.set(ws, state);
  try {
    ws.send(JSON.stringify({ type: "presence_hello", id: publicId }));
  } catch {
  }
  broadcastPresence();
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg?.type !== "presence_ping") return;
    if (typeof msg.pageKey === "string") state.pageKey = msg.pageKey.slice(0, 80);
    if (typeof msg.displayName === "string") state.displayName = msg.displayName.trim().slice(0, 120);
    broadcastPresence();
  });
  ws.on("close", () => {
    sessions.delete(ws);
    broadcastPresence();
  });
  ws.on("error", () => {
    sessions.delete(ws);
    broadcastPresence();
  });
});

export function handlePresenceUpgrade(request, socket, head, pathname) {
  if (pathname !== PRESENCE_WS_PATH) return false;
  wss.handleUpgrade(request, socket, head, (client) => {
    wss.emit("connection", client, request);
  });
  return true;
}
