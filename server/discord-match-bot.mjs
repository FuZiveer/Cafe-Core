import {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits
} from "discord.js";
import { getAuthConfig } from "./discord-auth.mjs";
import { discordBotToken } from "./secret-env.mjs";

let client = null;
let botReady = null;
let botStartPromise = null;
let botLoggedIn = false;
let lastBotError = null;

const READY_TIMEOUT_MS = 45e3;

export function getMatchBotConfig() {
  getAuthConfig();
  return {
    token: discordBotToken(),
    guildId: process.env.DISCORD_GUILD_ID?.trim() || "",
    categoryName:
      process.env.DISCORD_MATCH_CATEGORY_NAME?.trim() || "MATCH CHANNELS",
    categoryId: process.env.DISCORD_MATCH_CATEGORY_ID?.trim() || "",
    teamRolePrefix: process.env.DISCORD_TEAM_ROLE_PREFIX?.trim() || "TEAM"
  };
}

export function isMatchBotConfigured() {
  const c = getMatchBotConfig();
  return Boolean(c.token && c.guildId);
}

export function isMatchBotReady() {
  return Boolean(botLoggedIn && client?.isReady?.());
}

export function getMatchBotStatus() {
  const cfg = getMatchBotConfig();
  const configured = Boolean(cfg.token && cfg.guildId);
  return {
    configured,
    ready: isMatchBotReady(),
    starting: Boolean(botStartPromise) && !isMatchBotReady(),
    lastError: lastBotError,
    guildIdConfigured: Boolean(cfg.guildId),
    tokenConfigured: Boolean(cfg.token),
    botUsername: client?.user?.tag || null,
    botId: client?.user?.id || null
  };
}

function warnTokenFormat(token) {
  if (!token) return;
  if (/\s/.test(token)) {
    console.warn("[match-bot] Bot token contains whitespace — paste as one line in Render env");
  }
  if (!token.includes(".")) {
    console.warn(
      "[match-bot] Bot token format looks invalid — use Bot token from Developer Portal (not Client Secret)"
    );
  }
}

function resetBotClient() {
  botLoggedIn = false;
  const prev = client;
  client = null;
  botReady = null;
  botStartPromise = null;
  if (prev) {
    try {
      prev.destroy();
    } catch {
    }
  }
}

function sanitizeVoiceChannelName(name) {
  return String(name || "Team")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

function primaryTeamRole(member, prefix) {
  const p = prefix.toUpperCase();
  const roles = [...member.roles.cache.values()].filter((r) =>
    r.name.toUpperCase().startsWith(p)
  );
  if (!roles.length) return null;
  roles.sort((a, b) => b.position - a.position);
  return roles[0];
}

async function ensureMatchCategory(guild, cfg) {
  const categoryId = cfg.categoryId;
  if (categoryId) {
    const byId = await guild.channels.fetch(categoryId).catch(() => null);
    if (byId?.type === ChannelType.GuildCategory) return byId;
    throw new Error("match_category_id_not_found");
  }
  const categoryName = cfg.categoryName;
  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory &&
      c.name.toLowerCase() === categoryName.toLowerCase()
  );
  if (existing) return existing;
  return guild.channels.create({
    name: categoryName,
    type: ChannelType.GuildCategory,
    reason: "Café Core matchmaking voice category"
  });
}

function uniqueNameInCategory(guild, categoryId, base) {
  const name = sanitizeVoiceChannelName(base);
  const taken = new Set(
    guild.channels.cache
      .filter((c) => c.parentId === categoryId && c.type === ChannelType.GuildVoice)
      .map((c) => c.name.toLowerCase())
  );
  if (!taken.has(name.toLowerCase())) return name;
  return `${name.slice(0, 88)} · ${Date.now().toString(36).slice(-4)}`;
}

export async function startDiscordMatchBot() {
  const cfg = getMatchBotConfig();
  if (!cfg.token || !cfg.guildId) {
    console.warn(
      "[match-bot] Skipped — set bot token and guild id in Render Environment"
    );
    return null;
  }

  if (client?.isReady?.()) return client;

  if (botStartPromise) return botStartPromise;

  warnTokenFormat(cfg.token);
  console.log(`[match-bot] Connecting… guild=${cfg.guildId}`);

  botStartPromise = (async () => {
    const c = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
    });
    client = c;

    const ready = new Promise((resolve, reject) => {
      const tid = setTimeout(() => {
        reject(new Error("gateway_ready_timeout"));
      }, READY_TIMEOUT_MS);
      const onReady = () => {
        clearTimeout(tid);
        botLoggedIn = true;
        lastBotError = null;
        console.log(
          `[match-bot] Online as ${c.user?.tag || "bot"} (application id ${c.user?.id || "?"})`
        );
        resolve(c);
      };
      const onError = (err) => {
        clearTimeout(tid);
        reject(err);
      };
      c.once("ready", onReady);
      c.once("error", onError);
    });

    try {
      await c.login(cfg.token);
      await ready;
      botReady = Promise.resolve(c);
      return c;
    } catch (err) {
      lastBotError = err?.message || String(err);
      console.error("[match-bot] Login failed:", lastBotError);
      resetBotClient();
      throw err;
    } finally {
      botStartPromise = null;
    }
  })();

  try {
    return await botStartPromise;
  } catch {
    return null;
  }
}

export async function getMatchGuild() {
  const started = await startDiscordMatchBot();
  if (!started || !client?.isReady?.()) throw new Error("bot_not_ready");
  await botReady;
  const cfg = getMatchBotConfig();
  const guild = await client.guilds.fetch(cfg.guildId);
  if (!guild) throw new Error("guild_not_found");
  return { guild, cfg };
}

export async function createMatchVoiceChannels({
  discordUserIds,
  matchId
} = {}) {
  const ids = [
    ...new Set(
      (Array.isArray(discordUserIds) ? discordUserIds : [])
        .map((id) => String(id).trim())
        .filter(Boolean)
    )
  ];
  if (!ids.length) throw new Error("no_participants");

  const { guild, cfg } = await getMatchGuild();
  const category = await ensureMatchCategory(guild, cfg);

  const teams = new Map();
  const skipped = [];

  for (const userId of ids) {
    let member;
    try {
      member = await guild.members.fetch(userId);
    } catch {
      skipped.push({ userId, reason: "not_in_guild" });
      continue;
    }
    const role = primaryTeamRole(member, cfg.teamRolePrefix);
    if (!role) {
      skipped.push({ userId, reason: "no_team_role" });
      continue;
    }
    if (!teams.has(role.id)) {
      teams.set(role.id, { role, userIds: [] });
    }
    teams.get(role.id).userIds.push(userId);
  }

  if (!teams.size) {
    const err = new Error("no_team_roles");
    err.skipped = skipped;
    throw err;
  }

  const label = matchId ? String(matchId) : `match-${Date.now().toString(36)}`;
  const channels = [];

  for (const { role, userIds } of teams.values()) {
    const channelName = uniqueNameInCategory(guild, category.id, role.name);
    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel]
      },
      {
        id: role.id,
        allow: [
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Speak
        ]
      }
    ];
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: overwrites,
      reason: `Café Core match ${label} — ${role.name} (${userIds.length} players)`
    });
    channels.push({
      teamRoleId: role.id,
      teamName: role.name,
      channelId: channel.id,
      channelName: channel.name,
      memberIds: userIds
    });
  }

  console.log(
    `[match-bot] Created ${channels.length} voice channel(s) for match ${label}`
  );

  return {
    matchId: label,
    categoryId: category.id,
    categoryName: category.name,
    channels,
    skipped
  };
}

export async function deleteMatchVoiceChannels({ channelIds } = {}) {
  const ids = [
    ...new Set(
      (Array.isArray(channelIds) ? channelIds : [])
        .map((id) => String(id).trim())
        .filter(Boolean)
    )
  ];
  if (!ids.length) return { deleted: [] };

  const { guild } = await getMatchGuild();
  const deleted = [];
  for (const channelId of ids) {
    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (ch?.isVoiceBased?.()) {
      await ch.delete("Café Core match ended");
      deleted.push(channelId);
    }
  }
  return { deleted };
}

export function shutdownDiscordMatchBot() {
  resetBotClient();
  lastBotError = null;
}