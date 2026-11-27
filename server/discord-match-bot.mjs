import {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits
} from "discord.js";
import { getAuthConfig } from "./discord-auth.mjs";

let client = null;
let botReady = null;

export function getMatchBotConfig() {
  getAuthConfig();
  return {
    token: process.env.DISCORD_BOT_TOKEN?.trim() || "",
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
    console.log(
      "[match-bot] Skipped — set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID in .env"
    );
    return null;
  }
  if (client) return client;

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
  });

  botReady = new Promise((resolve, reject) => {
    client.once("ready", () => {
      console.log(`[match-bot] Logged in as ${client.user?.tag || "bot"}`);
      resolve(client);
    });
    client.once("error", reject);
  });

  await client.login(cfg.token);
  await botReady;
  return client;
}

export async function getMatchGuild() {
  if (!client) await startDiscordMatchBot();
  if (!client) throw new Error("bot_not_configured");
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
  if (!client) return;
  void client.destroy();
  client = null;
  botReady = null;
}