import { applyCors, getSessionUser, sendJson } from "./discord-auth.mjs";
import { readScrimRecordFile, writeScrimRecordFile } from "./bl-scrim-store.mjs";
import { broadcastScrimRecord } from "./bl-scrim-ws.mjs";
const BL_SCRIM_RECORD_EDITORS = new Set(["fuziveer", "rawenge", "rjwarrior", "jobless___", "kkv060", "two4ne"]);
function usernameKey(user) {
  return String(user?.username || "").trim().toLowerCase();
}
function canEditScrim(user) {
  return BL_SCRIM_RECORD_EDITORS.has(usernameKey(user));
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
export async function handleBlApiRequest(req, res, url, cfg) {
  const pathname = url.pathname;
  if (pathname === "/api/bl/scrim-record" && req.method === "GET") {
    applyCors(req, res, cfg);
    const user = getSessionUser(req);
    const record = readScrimRecordFile();
    sendJson(res, 200, {
      wins: record.wins,
      losses: record.losses,
      canEdit: canEditScrim(user)
    });
    return true;
  }
  if (pathname === "/api/bl/scrim-record" && req.method === "PATCH") {
    applyCors(req, res, cfg);
    const user = getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { error: "sign_in_required" });
      return true;
    }
    if (!canEditScrim(user)) {
      sendJson(res, 403, { error: "forbidden", username: user.username || null });
      return true;
    }
    const body = await readJsonBody(req);
    if (body === null) {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const record = writeScrimRecordFile(body);
    broadcastScrimRecord(record);
    sendJson(res, 200, { wins: record.wins, losses: record.losses, canEdit: true });
    return true;
  }
  return false;
}
