import {
  ChannelType,
  Client,
  GatewayIntentBits,
  OverwriteType,
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

function parseTeamRoleNames(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getMatchBotConfig() {
  getAuthConfig();
  const teamRoleNames = parseTeamRoleNames(process.env.DISCORD_TEAM_ROLES);
  const teamRolePrefix = process.env.DISCORD_TEAM_ROLE_PREFIX?.trim() || "TEAM";
  return {
    token: discordBotToken(),
    guildId: process.env.DISCORD_GUILD_ID?.trim() || "",
    categoryName:
      process.env.DISCORD_MATCH_CATEGORY_NAME?.trim() || "LIVE MATCHES",
    categoryId: process.env.DISCORD_MATCH_CATEGORY_ID?.trim() || "",
    teamRoleNames,
    teamRolePrefix
  };
}

function roleMatchesTeamConfig(roleName, cfg) {
  const name = String(roleName || "").trim();
  if (!name) return false;
  if (cfg.teamRoleNames?.length) {
    const upper = name.toUpperCase();
    return cfg.teamRoleNames.some((n) => n.toUpperCase() === upper);
  }
  const prefix = String(cfg.teamRolePrefix || "TEAM").toUpperCase();
  return name.toUpperCase().startsWith(prefix);
}

/** Label for UI / voice channels — strips configured prefix (default TEAM). */
export function teamDisplayName(roleName, cfg = getMatchBotConfig()) {
  const name = String(roleName || "").trim();
  if (!name) return "";
  const prefix = String(cfg.teamRolePrefix || "TEAM").trim();
  const upper = name.toUpperCase();
  const pUpper = prefix.toUpperCase();
  if (!upper.startsWith(pUpper)) return name;
  let rest = name.slice(prefix.length).trim();
  if (/^[-–—:|·]/.test(rest)) rest = rest.slice(1).trim();
  return rest || name;
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

function matchVoiceChannelPrefix() {
  const fromEnv = process.env.DISCORD_MATCH_VC_PREFIX;
  if (fromEnv != null && String(fromEnv).trim() !== "") {
    return String(fromEnv);
  }
  return "⚔️┃";
}

function sanitizeVoiceChannelName(name) {
  return String(name || "Team")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

function formatMatchVoiceChannelName(teamLabel) {
  const prefix = matchVoiceChannelPrefix();
  const label = String(teamLabel || "Team").trim();
  const needsSpace =
    prefix.length > 0 && !/\s$/.test(prefix) && label.length > 0;
  return sanitizeVoiceChannelName(`${prefix}${needsSpace ? " " : ""}${label}`);
}

async function primaryTeamRole(guild, member, cfg) {
  const roleIds = [...member.roles.cache.keys()].filter((id) => id !== guild.id);
  const teamRoles = [];
  for (const roleId of roleIds) {
    let role = member.roles.cache.get(roleId);
    if (!role?.name) {
      role = await guild.roles.fetch(roleId).catch(() => null);
    }
    if (!role?.name) continue;
    if (roleMatchesTeamConfig(role.name, cfg)) teamRoles.push(role);
  }
  if (!teamRoles.length) return null;
  teamRoles.sort((a, b) => b.position - a.position);
  return teamRoles[0];
}

function teamVoiceOverwrites(guild, roleId) {
  if (!roleId) {
    throw new Error("team_role_required");
  }
  return [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
    },
    {
      id: roleId,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ]
    }
  ];
}

export async function enrichScrimQueueTeamNames(queue) {
  if (!isMatchBotConfigured()) return queue;
  const { guild, cfg } = await getMatchGuild().catch(() => ({}));
  if (!guild) return queue;
  await guild.roles.fetch().catch(() => null);
  for (let i = 0; i < queue.slots.length; i++) {
    const slot = queue.slots[i];
    if (!slot?.id) continue;
    const member = await guild.members.fetch({ user: slot.id, force: true }).catch(() => null);
    if (!member) continue;
    const role = await primaryTeamRole(guild, member, cfg);
    if (role?.name) {
      queue.slots[i] = {
        ...slot,
        teamName: teamDisplayName(role.name, cfg),
        teamRoleId: role.id
      };
    }
  }
  return queue;
}

async function ensureMatchCategory(guild, cfg) {
  const categoryId = cfg.categoryId;
  if (categoryId) {
    const byId = await guild.channels.fetch(categoryId).catch(() => null);
    if (byId?.type === ChannelType.GuildCategory) return byId;
    throw new Error("match_category_id_not_found");
  }
  const categoryName = cfg.categoryName;
  const legacyCategoryNames = ["match channels"];
  const categoryNameMatches = (name) => {
    const lower = String(name || "").toLowerCase();
    if (lower === categoryName.toLowerCase()) return true;
    return legacyCategoryNames.includes(lower);
  };
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && categoryNameMatches(c.name)
  );
  if (existing) {
    if (
      existing.name.toLowerCase() === "match channels" &&
      categoryName.toLowerCase() === "live matches" &&
      existing.name !== categoryName
    ) {
      await existing.setName(categoryName).catch(() => null);
    }
    return existing;
  }
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
      // Guilds only — member roles are loaded via REST (guild.members.fetch), no privileged intents.
      intents: [GatewayIntentBits.Guilds]
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
  matchId,
  roster = []
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
  await guild.roles.fetch().catch(() => null);
  const category = await ensureMatchCategory(guild, cfg);

  const teams = new Map();
  const membersById = new Map();
  const skipped = [];

  for (const userId of ids) {
    let member;
    try {
      member = await guild.members.fetch({ user: userId, force: true });
    } catch {
      skipped.push({ userId, reason: "not_in_guild" });
      continue;
    }
    membersById.set(userId, member);
    const role = await primaryTeamRole(guild, member, cfg);
    if (!role) {
      skipped.push({ userId, reason: "no_team_role" });
      continue;
    }
    if (!teams.has(role.id)) {
      teams.set(role.id, { role, userIds: [] });
    }
    teams.get(role.id).userIds.push(userId);
  }

  const label = matchId ? String(matchId) : `match-${Date.now().toString(36)}`;
  const channels = [];

  const createVoice = async ({ channelName, teamName, roleId, memberIds }) => {
    const unique = uniqueNameInCategory(guild, category.id, channelName);
    const channel = await guild.channels.create({
      name: unique,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: teamVoiceOverwrites(guild, roleId),
      reason: `Café Core match ${label} — ${teamName}`
    });
    channels.push({
      teamRoleId: roleId || null,
      teamName,
      channelId: channel.id,
      channelName: channel.name,
      memberIds
    });
  };

  if (teams.size) {
    for (const { role, userIds } of teams.values()) {
      const label = teamDisplayName(role.name, cfg);
      await createVoice({
        channelName: formatMatchVoiceChannelName(label),
        teamName: label,
        roleId: role.id,
        memberIds: userIds
      });
    }
  }

  if (!teams.size) {
    const err = new Error("no_team_roles");
    err.skipped = skipped;
    throw err;
  }

  if (!channels.length) {
    const err = new Error("no_channels_created");
    err.skipped = skipped;
    throw err;
  }

  if (skipped.length) {
    console.warn("[match-bot] Match voice skipped members:", JSON.stringify(skipped));
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