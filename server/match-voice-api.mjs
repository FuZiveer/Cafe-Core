import { applyCors, getSessionUser, sendJson } from "./discord-auth.mjs";
import { matchVoiceApiSecret } from "./secret-env.mjs";
import {
  createMatchVoiceChannels,
  deleteMatchVoiceChannels,
  getMatchBotStatus,
  isMatchBotConfigured,
  startDiscordMatchBot
} from "./discord-match-bot.mjs";

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

function apiSecret() {
  return matchVoiceApiSecret();
}

function authorized(req) {
  const secret = apiSecret();
  const header = req.headers["x-match-voice-secret"];
  if (secret && header === secret) return { ok: true, via: "secret" };
  const user = getSessionUser(req);
  if (user) return { ok: true, via: "session", user };
  return { ok: false };
}

export async function handleMatchVoiceApiRequest(req, res, url, cfg) {
  const pathname = url.pathname;

  if (pathname === "/api/match/bot-status" && req.method === "GET") {
    applyCors(req, res, cfg);
    if (isMatchBotConfigured()) {
      await startDiscordMatchBot();
    }
    sendJson(res, 200, getMatchBotStatus());
    return true;
  }

  if (pathname === "/api/match/voice-channels" && req.method === "POST") {
    applyCors(req, res, cfg);
    const auth = authorized(req);
    if (!auth.ok) {
      sendJson(res, 401, { error: "sign_in_required" });
      return true;
    }
    if (!isMatchBotConfigured()) {
      sendJson(res, 503, { error: "bot_not_configured" });
      return true;
    }
    const body = await readJsonBody(req);
    if (body === null) {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const discordUserIds = body.discordUserIds;
    if (!Array.isArray(discordUserIds) || !discordUserIds.length) {
      sendJson(res, 400, { error: "discord_user_ids_required" });
      return true;
    }
    try {
      await startDiscordMatchBot();
      const result = await createMatchVoiceChannels({
        discordUserIds,
        matchId: body.matchId
      });
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      const code = err?.message || "create_failed";
      sendJson(res, 422, {
        error: code,
        skipped: err?.skipped || []
      });
    }
    return true;
  }

  if (pathname === "/api/match/voice-channels" && req.method === "DELETE") {
    applyCors(req, res, cfg);
    const auth = authorized(req);
    if (!auth.ok) {
      sendJson(res, 401, { error: "sign_in_required" });
      return true;
    }
    if (!isMatchBotConfigured()) {
      sendJson(res, 503, { error: "bot_not_configured" });
      return true;
    }
    const body = await readJsonBody(req);
    if (body === null) {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    try {
      await startDiscordMatchBot();
      const result = await deleteMatchVoiceChannels({
        channelIds: body.channelIds
      });
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      sendJson(res, 500, { error: err?.message || "delete_failed" });
    }
    return true;
  }

  return false;
}