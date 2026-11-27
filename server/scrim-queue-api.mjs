import { applyCors, getSessionUser, sendJson } from "./discord-auth.mjs";
import {
  QUEUE_CAP,
  joinScrimQueue,
  leaveScrimQueue,
  queueCount,
  queueMemberIds,
  queuePayload,
  readScrimQueue,
  writeScrimQueue
} from "./scrim-queue-store.mjs";
import { broadcastScrimQueue } from "./scrim-queue-ws.mjs";
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

async function maybeProvisionMatchVoice(queueSnap) {
  if (!isMatchBotConfigured()) {
    console.warn("[scrim-queue] Match voice skipped — bot env not configured");
    return queueSnap;
  }
  const queue = await readScrimQueue();
  if (queue.matchVoicePending) return queue;
  if (queueCount(queue) < QUEUE_CAP) return queue;
  const ids = queueMemberIds(queue).filter((id) => /^\d{17,20}$/.test(id));
  if (ids.length < QUEUE_CAP) return queue;

  queue.matchVoicePending = true;
  queue.matchVoiceError = null;
  await writeScrimQueue(queue);
  broadcastScrimQueue(queue);

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
      console.error("[scrim-queue] Match voice skipped — bot not online (see [match-bot] logs)");
      const fresh = await readScrimQueue();
      fresh.matchVoicePending = false;
      fresh.matchVoiceError = { code: "bot_not_ready", message: "Discord bot is not online" };
      const saved = await writeScrimQueue(fresh);
      broadcastScrimQueue(saved);
      return saved;
    }
    const matchId = `scrim-${Date.now().toString(36)}`;
    const result = await createMatchVoiceChannels({
      discordUserIds: ids,
      matchId,
      roster
    });
    const fresh = await readScrimQueue();
    fresh.lastMatchVoice = result;
    fresh.matchVoicePending = false;
    fresh.matchVoiceError = null;
    const saved = await writeScrimQueue(fresh);
    broadcastScrimQueue(saved);
    return saved;
  } catch (err) {
    console.error("[scrim-queue] match voice:", err?.message || err, err?.skipped || "");
    const fresh = await readScrimQueue();
    fresh.matchVoicePending = false;
    fresh.matchVoiceError = {
      code: err?.message || "match_voice_failed",
      skipped: err?.skipped || []
    };
    const saved = await writeScrimQueue(fresh);
    broadcastScrimQueue(saved);
    return saved;
  }
}

export async function handleScrimQueueApiRequest(req, res, url, cfg) {
  const pathname = url.pathname;

  if (pathname === "/api/scrims/queue" && req.method === "GET") {
    applyCors(req, res, cfg);
    const user = getSessionUser(req);
    const queue = await readScrimQueue();
    const enriched =
      queueCount(queue) > 0 ? await enrichScrimQueueTeamNames(structuredClone(queue)) : queue;
    sendJson(res, 200, queuePayload(enriched, user?.id));
    return true;
  }

  if (pathname === "/api/scrims/queue/join" && req.method === "POST") {
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
    const outcome = await joinScrimQueue(user);
    if (!outcome.ok) {
      const code = outcome.error || "join_failed";
      const status = code === "queue_full" ? 409 : 400;
      sendJson(res, status, { error: code, ...queuePayload(outcome.queue || (await readScrimQueue()), user.id) });
      return true;
    }
    let queue = await readScrimQueue();
    queue = await enrichScrimQueueTeamNames(queue);
    await writeScrimQueue(queue);
    broadcastScrimQueue(queue);
    if (isMatchBotConfigured()) {
      void startDiscordMatchBot().catch(() => {});
    }
    if (queueCount(queue) >= QUEUE_CAP) {
      void maybeProvisionMatchVoice(queue).catch((err) => {
        console.error("[scrim-queue] background match voice:", err?.message || err);
      });
    }
    sendJson(res, 200, { ok: true, ...queuePayload(queue, user.id) });
    return true;
  }

  if (pathname === "/api/scrims/queue/leave" && req.method === "POST") {
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
    const outcome = await leaveScrimQueue(user.id);
    if (!outcome.ok) {
      sendJson(res, 400, { error: outcome.error || "leave_failed" });
      return true;
    }
    broadcastScrimQueue(outcome.queue);
    sendJson(res, 200, { ok: true, ...queuePayload(outcome.queue, user.id) });
    return true;
  }

  return false;
}