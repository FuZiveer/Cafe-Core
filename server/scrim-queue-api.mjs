import { applyCors, getSessionUser, sendJson } from "./discord-auth.mjs";
import {
  ADMIN_CAP,
  QUEUE_CAP,
  createLobby,
  joinLobby,
  leaveLobby,
  listLiveActiveMatches,
  startLobbyMatch,
  normalizeLobbyId,
  queueCount,
  queueMemberIds,
  queuePayload,
  readLobby,
  writeLobby
} from "./scrim-queue-store.mjs";
import { broadcastScrimLobby } from "./scrim-queue-ws.mjs";
import {
  createMatchVoiceChannels,
  enrichScrimQueueTeamNames,
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

async function maybeProvisionMatchVoice(lobbyId) {
  if (!isMatchBotConfigured()) {
    console.warn("[scrim-queue] Match voice skipped — bot env not configured");
    return null;
  }
  const id = normalizeLobbyId(lobbyId);
  const queue = await readLobby(id);
  if (!queue) return null;
  if (queue.matchVoicePending) return queue;
  if (queueCount(queue) < QUEUE_CAP) return queue;
  const ids = queueMemberIds(queue).filter((wid) => /^\d{17,20}$/.test(wid));
  if (ids.length < QUEUE_CAP) return queue;

  queue.matchVoicePending = true;
  queue.matchVoiceError = null;
  await writeLobby(id, queue);
  broadcastScrimLobby(id, queue);

  const roster = queue.slots
    .filter(Boolean)
    .map((m) => ({
      id: m.id,
      displayName: m.displayName,
      username: m.username
    }));

  try {
    const bot = await startDiscordMatchBot();
    if (!bot?.isReady?.()) {
      const fresh = await readLobby(id);
      if (!fresh) return null;
      fresh.matchVoicePending = false;
      fresh.matchVoiceError = { code: "bot_not_ready", message: "Discord bot is not online" };
      const saved = await writeLobby(id, fresh);
      broadcastScrimLobby(id, saved);
      return saved;
    }
    const matchId = `scrim-${Date.now().toString(36)}`;
    const result = await createMatchVoiceChannels({
      discordUserIds: ids,
      matchId,
      roster
    });
    const fresh = await readLobby(id);
    if (!fresh) return null;
    fresh.lastMatchVoice = result;
    fresh.matchVoicePending = false;
    fresh.matchVoiceError = null;
    const saved = await writeLobby(id, fresh);
    broadcastScrimLobby(id, saved);
    return saved;
  } catch (err) {
    console.error("[scrim-queue] match voice:", err?.message || err, err?.skipped || "");
    const fresh = await readLobby(id);
    if (!fresh) return null;
    fresh.matchVoicePending = false;
    fresh.matchVoiceError = {
      code: err?.message || "match_voice_failed",
      skipped: err?.skipped || []
    };
    const saved = await writeLobby(id, fresh);
    broadcastScrimLobby(id, saved);
    return saved;
  }
}

function lobbyPathId(pathname) {
  const m = pathname.match(/^\/api\/scrims\/lobbies\/([^/]+)/);
  return m ? normalizeLobbyId(m[1]) : "";
}

export async function handleScrimQueueApiRequest(req, res, url, cfg) {
  const pathname = url.pathname;

  if (pathname === "/api/scrims/matches" && req.method === "GET") {
    applyCors(req, res, cfg);
    const matches = await listLiveActiveMatches();
    sendJson(res, 200, { count: matches.length, matches });
    return true;
  }

  if (pathname === "/api/scrims/lobbies" && req.method === "POST") {
    applyCors(req, res, cfg);
    const user = getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { error: "sign_in_required" });
      return true;
    }
    if (await readJsonBody(req) === null) {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const created = await createLobby(user);
    if (!created.ok) {
      sendJson(res, 400, { error: created.error || "create_failed" });
      return true;
    }
    let queue = created.queue;
    queue = await enrichScrimQueueTeamNames(queue);
    await writeLobby(created.lobbyId, queue);
    broadcastScrimLobby(created.lobbyId, queue);
    if (isMatchBotConfigured()) void startDiscordMatchBot().catch(() => {});
    sendJson(res, 200, { ok: true, ...queuePayload(queue, user.id) });
    return true;
  }

  const lobbyId = lobbyPathId(pathname);

  if (lobbyId && pathname === `/api/scrims/lobbies/${lobbyId}` && req.method === "GET") {
    applyCors(req, res, cfg);
    const user = getSessionUser(req);
    const queue = await readLobby(lobbyId);
    if (!queue) {
      sendJson(res, 404, { error: "lobby_not_found" });
      return true;
    }
    const enriched =
      queueCount(queue) > 0 ? await enrichScrimQueueTeamNames(structuredClone(queue)) : queue;
    sendJson(res, 200, queuePayload(enriched, user?.id));
    return true;
  }

  if (lobbyId && pathname === `/api/scrims/lobbies/${lobbyId}/join` && req.method === "POST") {
    applyCors(req, res, cfg);
    const user = getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { error: "sign_in_required" });
      return true;
    }
    const body = await readJsonBody(req);
    if (body === null) {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const joinRole = body?.role === "admin" ? "admin" : "player";
    const outcome = await joinLobby(lobbyId, user, joinRole);
    if (!outcome.ok) {
      const code = outcome.error || "join_failed";
      const status =
        code === "queue_full" || code === "admin_full"
          ? 409
          : code === "lobby_not_found"
            ? 404
            : 400;
      const fallback = outcome.queue || (await readLobby(lobbyId));
      sendJson(res, status, {
        error: code,
        ...(fallback ? queuePayload(fallback, user.id) : { lobbyId })
      });
      return true;
    }
    let queue = outcome.queue;
    queue = await enrichScrimQueueTeamNames(queue);
    await writeLobby(lobbyId, queue);
    broadcastScrimLobby(lobbyId, queue);
    if (isMatchBotConfigured()) void startDiscordMatchBot().catch(() => {});
    if (queueCount(queue) >= QUEUE_CAP) {
      void maybeProvisionMatchVoice(lobbyId).catch((err) => {
        console.error("[scrim-queue] background match voice:", err?.message || err);
      });
    }
    sendJson(res, 200, { ok: true, ...queuePayload(queue, user.id) });
    return true;
  }

  if (lobbyId && pathname === `/api/scrims/lobbies/${lobbyId}/start` && req.method === "POST") {
    applyCors(req, res, cfg);
    const user = getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { error: "sign_in_required" });
      return true;
    }
    if (await readJsonBody(req) === null) {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const outcome = await startLobbyMatch(lobbyId, user.id);
    if (!outcome.ok) {
      const code = outcome.error || "start_failed";
      const status =
        code === "not_authorized"
          ? 403
          : code === "lobby_not_found"
            ? 404
            : code === "not_enough_players"
              ? 409
              : 400;
      const fallback = outcome.queue || (await readLobby(lobbyId));
      sendJson(res, status, {
        error: code,
        ...(fallback ? queuePayload(fallback, user.id) : { lobbyId })
      });
      return true;
    }
    let queue = outcome.queue;
    queue = await enrichScrimQueueTeamNames(queue);
    await writeLobby(lobbyId, queue);
    broadcastScrimLobby(lobbyId, queue);
    void maybeProvisionMatchVoice(lobbyId).catch((err) => {
      console.error("[scrim-queue] background match voice:", err?.message || err);
    });
    sendJson(res, 200, { ok: true, ...queuePayload(queue, user.id) });
    return true;
  }

  if (lobbyId && pathname === `/api/scrims/lobbies/${lobbyId}/leave` && req.method === "POST") {
    applyCors(req, res, cfg);
    const user = getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { error: "sign_in_required" });
      return true;
    }
    if (await readJsonBody(req) === null) {
      sendJson(res, 400, { error: "invalid_json" });
      return true;
    }
    const outcome = await leaveLobby(lobbyId, user.id);
    if (!outcome.ok) {
      sendJson(res, 400, { error: outcome.error || "leave_failed" });
      return true;
    }
    if (outcome.deleted) {
      sendJson(res, 200, {
        ok: true,
        lobbyClosed: true,
        lobbyId,
        ...queuePayload(normalizeEmptyLobby(lobbyId), user.id)
      });
      return true;
    }
    broadcastScrimLobby(lobbyId, outcome.queue);
    sendJson(res, 200, { ok: true, ...queuePayload(outcome.queue, user.id) });
    return true;
  }

  return false;
}

function normalizeEmptyLobby(lobbyId) {
  return {
    version: 0,
    slots: Array.from({ length: QUEUE_CAP }, () => null),
    adminSlots: Array.from({ length: ADMIN_CAP }, () => null),
    lobbyId,
    hostId: "",
    matchVoicePending: false,
    lastMatchVoice: null,
    matchVoiceError: null
  };
}