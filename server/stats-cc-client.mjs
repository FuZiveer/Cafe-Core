import {
  blDisplayNameFromUbisoft,
  memberHasStatsLookup,
  statsLookupForMember
} from "./bl-stats-lookup.mjs";

const STATS_CC_BASE = "https://api.stats.cc/siege";
const CONFIG_TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_TTL_MS = 20 * 60 * 1000;
const PROFILE_ERROR_TTL_MS = 10 * 60 * 1000;
const ROSTER_PAYLOAD_TTL_MS = 20 * 60 * 1000;
const STATS_CC_PLAYER_GAP_MS = 150;

export const STATS_CC_ATTRIBUTION = {
  text: "Data by Stats.cc",
  url: "https://stats.cc/siege"
};

let configCache = { at: 0, data: null };
const profileCache = new Map();
const memberProfileIdByRosterId = new Map();
let rosterPayloadCache = { at: 0, data: null };
let rosterPayloadInflight = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiKey() {
  return process.env.STATS_CC_API_KEY?.trim() || "";
}

export function statsCcConfigured() {
  return Boolean(apiKey());
}

function localizedDisplay(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const direct = value.en || value["en-US"] || value.en_us;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    for (const v of Object.values(value)) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

async function statsCcFetch(pathname, options = {}) {
  const key = apiKey();
  if (!key) {
    const err = new Error("stats_cc_not_configured");
    err.code = "stats_cc_not_configured";
    throw err;
  }
  const res = await fetch(`${STATS_CC_BASE}${pathname}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "x-api-key": key,
      "x-locale": "en",
      ...options.headers
    }
  });
  if (res.status === 429) {
    const err = new Error("stats_cc_rate_limited");
    err.code = "stats_cc_rate_limited";
    err.retryAfter = res.headers.get("retry-after");
    throw err;
  }
  if (res.status === 404) {
    const err = new Error("stats_cc_not_found");
    err.code = "stats_cc_not_found";
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`stats_cc_http_${res.status}`);
    err.code = "stats_cc_http";
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function getConfig() {
  const now = Date.now();
  if (configCache.data && now - configCache.at < CONFIG_TTL_MS) {
    return configCache.data;
  }
  const data = await statsCcFetch("/v2/config");
  configCache = { at: now, data };
  return data;
}

function rankLabel(config, rankKey) {
  if (!rankKey) return "";
  const ent = config?.ranks?.[rankKey];
  return localizedDisplay(ent?.display) || "";
}

function seasonLabel(config, seasonKey) {
  if (!seasonKey) return "";
  const ent = config?.seasons?.[seasonKey];
  return localizedDisplay(ent?.display) || "";
}

function operatorDisplayName(config, slug) {
  const key = String(slug || "").trim();
  if (!key) return "";
  const ent = config?.operators?.[key];
  const label = localizedDisplay(ent?.display);
  if (label) return label;
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function topOperatorsBySide(operatorRows, config, side, limit = 2) {
  const wantSide = String(side || "").trim().toLowerCase();
  if (!wantSide) return [];
  const rows = (Array.isArray(operatorRows) ? operatorRows : [])
    .map((row) => ({
      slug: String(row?.operator || "").trim(),
      rounds: Number(row?.rounds_played) || 0,
      raw: row
    }))
    .filter((row) => {
      if (!row.slug || row.rounds < 1) return false;
      const opSide = String(config?.operators?.[row.slug]?.side || "").toLowerCase();
      return opSide === wantSide;
    })
    .sort((a, b) => b.rounds - a.rounds);
  const picked = [];
  for (const row of rows) {
    const name = operatorDisplayName(config, row.slug);
    if (!name || picked.some((entry) => entry.name === name)) continue;
    const kd = kdFromSeasonRecord(row.raw);
    picked.push({
      name,
      kd: kd != null && Number.isFinite(kd) ? kd : null
    });
    if (picked.length >= limit) break;
  }
  return picked;
}

async function fetchRankedOperatorRows(profileId) {
  const id = String(profileId || "").trim();
  if (!id) return [];
  return statsCcFetch(
    `/v2/profiles/${encodeURIComponent(id)}/operators?playlist=ranked`
  );
}

function parseStatsTimestamp(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function kdFromSeasonRecord(record) {
  if (!record || typeof record !== "object") return null;
  const nested =
    record.stats && typeof record.stats === "object" ? record.stats : record;
  const seasonStats =
    record.season_statistics && typeof record.season_statistics === "object"
      ? record.season_statistics
      : null;
  for (const source of [record, nested, seasonStats].filter(Boolean)) {
    const direct = Number(source.kd ?? source.kd_ratio);
    if (Number.isFinite(direct) && direct >= 0) {
      return Math.round(direct * 100) / 100;
    }
    const kills = Number(source.kills);
    const deaths = Number(source.deaths);
    if (Number.isFinite(kills) && Number.isFinite(deaths)) {
      if (deaths > 0) return Math.round((kills / deaths) * 100) / 100;
      if (kills > 0 && deaths === 0) return kills;
    }
  }
  return null;
}

const RANKED_MODE_KEYS = ["ranked-bomb", "ranked", "ranked-standard"];

function currentSeasonRankedModeRow(profile, config) {
  const seasonKey = config?.constants?.slugs?.current_season;
  if (!seasonKey) return null;
  const modes = profile?.season_mode_records?.[seasonKey];
  if (!modes || typeof modes !== "object") return null;
  for (const modeKey of RANKED_MODE_KEYS) {
    const row = modes[modeKey];
    if (row && typeof row === "object") return row;
  }
  for (const [modeKey, row] of Object.entries(modes)) {
    if (!row || typeof row !== "object") continue;
    const modeSlug = String(row.mode || modeKey).toLowerCase();
    if (modeSlug.startsWith("ranked")) return row;
  }
  return null;
}

function winRatePercentFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const direct = Number(row.wr ?? row.win_rate);
  if (Number.isFinite(direct)) {
    const pct = direct > 0 && direct <= 1 ? direct * 100 : direct;
    return Math.round(pct * 10) / 10;
  }
  const matches = Number(row.matches);
  const wins = Number(row.wins);
  if (Number.isFinite(matches) && matches > 0 && Number.isFinite(wins)) {
    return Math.round((wins / matches) * 1000) / 10;
  }
  const losses = Number(row.losses);
  if (Number.isFinite(wins) && Number.isFinite(losses) && wins + losses > 0) {
    return Math.round((wins / (wins + losses)) * 1000) / 10;
  }
  return null;
}

function headshotPercentFromRow(row, profile) {
  if (row && typeof row === "object") {
    const direct = Number(row.hs ?? row.headshot_percent);
    if (Number.isFinite(direct) && direct >= 0) {
      const pct = direct > 0 && direct <= 1 ? direct * 100 : direct;
      return Math.round(pct * 10) / 10;
    }
    const kills = Number(row.kills);
    const headshots = Number(row.headshots);
    if (Number.isFinite(kills) && kills > 0 && Number.isFinite(headshots)) {
      return Math.round((headshots / kills) * 1000) / 10;
    }
  }
  const profileHs = Number(profile?.hs);
  if (Number.isFinite(profileHs) && profileHs >= 0) {
    const pct = profileHs > 0 && profileHs <= 1 ? profileHs * 100 : profileHs;
    return Math.round(pct * 10) / 10;
  }
  return null;
}

function seasonRankedPerformanceFromProfile(profile, config) {
  const row = currentSeasonRankedModeRow(profile, config);
  if (!row) {
    const current = currentSeasonRecord(profile, config);
    const kd = current?.record ? kdFromSeasonRecord(current.record) : null;
    return {
      seasonKd: kd,
      seasonWinRate: null,
      seasonHeadshotPct: headshotPercentFromRow(null, profile),
      seasonRankedMatches: null
    };
  }
  const matches = Number(row.matches);
  return {
    seasonKd: kdFromSeasonRecord(row),
    seasonWinRate: winRatePercentFromRow(row),
    seasonHeadshotPct: headshotPercentFromRow(row, profile),
    seasonRankedMatches: Number.isFinite(matches) ? matches : null
  };
}

function lastPlayedFromProfile(profile) {
  const keys = [
    "last_played_at",
    "last_seen_at",
    "last_seen",
    "last_played",
    "updated_at"
  ];
  for (const key of keys) {
    const iso = parseStatsTimestamp(profile?.[key]);
    if (iso) return iso;
  }
  return null;
}

const UBISOFT_AVATAR_CDN = "https://ubisoft-avatars.akamaized.net";

function profileAvatarUrl(profile, lookup = {}) {
  const profileId = String(profile?.id || lookup.profileId || "").trim();
  if (!profileId) return null;
  return `${UBISOFT_AVATAR_CDN}/${encodeURIComponent(profileId)}/default_146_146.png`;
}

function profileStatsUrl(profile, platform, username, lookup = {}) {
  const profileId = String(profile?.id || lookup.profileId || "").trim();
  if (profileId) {
    return `https://stats.cc/siege/-/${encodeURIComponent(profileId)}`;
  }
  const vanity =
    (typeof profile?.vanity === "string" && profile.vanity.trim()) ||
    (typeof lookup.vanity === "string" && lookup.vanity.trim()) ||
    "";
  if (vanity) {
    return `https://stats.cc/siege/@${encodeURIComponent(vanity.trim().toLowerCase())}`;
  }
  const uname = String(profile?.username || username || "").trim();
  if (platform && uname) {
    return `https://stats.cc/siege/${encodeURIComponent(platform)}/${encodeURIComponent(uname)}`;
  }
  return STATS_CC_ATTRIBUTION.url;
}

function currentSeasonRecord(profile, config) {
  const records = profile?.ranked_season_records;
  if (!records || typeof records !== "object") return null;
  const currentKey = config?.constants?.slugs?.current_season;
  if (currentKey && records[currentKey]) {
    return { seasonKey: currentKey, record: records[currentKey] };
  }
  let best = null;
  for (const [seasonKey, record] of Object.entries(records)) {
    const pts = Number(record?.rank_points) || 0;
    if (!best || pts > best.pts) {
      best = { seasonKey, record, pts };
    }
  }
  return best ? { seasonKey: best.seasonKey, record: best.record } : null;
}

function peakFromProfile(profile, config) {
  const records = profile?.ranked_season_records;
  if (!records || typeof records !== "object") return null;
  const maxSeason = profile?.max_rank_season;
  if (maxSeason && records[maxSeason]) {
    const rec = records[maxSeason];
    const rankKey = rec.max_rank || rec.rank;
    return {
      seasonKey: maxSeason,
      rankKey,
      rankLabel: rankLabel(config, rankKey),
      seasonLabel: seasonLabel(config, maxSeason)
    };
  }
  let best = null;
  for (const [seasonKey, rec] of Object.entries(records)) {
    const pts = Number(rec?.max_rank_points) || 0;
    const rankKey = rec?.max_rank;
    if (!rankKey) continue;
    if (!best || pts > best.pts) {
      best = { seasonKey, rankKey, pts };
    }
  }
  if (!best) return null;
  return {
    seasonKey: best.seasonKey,
    rankKey: best.rankKey,
    rankLabel: rankLabel(config, best.rankKey),
    seasonLabel: seasonLabel(config, best.seasonKey)
  };
}

function mapProfileToPlayerStats(profile, config, platform, username, lookup = {}) {
  const current = currentSeasonRecord(profile, config);
  const unrankedKey = config?.constants?.slugs?.unranked_rank;
  let currentRank = "";
  let currentSeason = "";
  let rankPoints = null;
  if (current?.record) {
    const rankKey = current.record.rank;
    if (rankKey && rankKey !== unrankedKey) {
      currentRank = rankLabel(config, rankKey);
      currentSeason = seasonLabel(config, current.seasonKey);
      rankPoints = Number.isFinite(Number(current.record.rank_points))
        ? Number(current.record.rank_points)
        : null;
    }
  }
  const peak = peakFromProfile(profile, config);
  const liveName = profile?.username || username || null;
  const rankedPerf = seasonRankedPerformanceFromProfile(profile, config);
  const lastPlayedAt = lastPlayedFromProfile(profile);
  const fetchedAt = parseStatsTimestamp(profile?.fetched_at);
  return {
    ok: true,
    profileId: profile?.id || null,
    username: liveName,
    displayName: blDisplayNameFromUbisoft(liveName),
    platform: profile?.platform || platform || null,
    currentRank: currentRank || null,
    currentSeason: currentSeason || null,
    rankPoints,
    seasonKd: rankedPerf.seasonKd,
    seasonWinRate: rankedPerf.seasonWinRate,
    seasonHeadshotPct: rankedPerf.seasonHeadshotPct,
    seasonRankedMatches: rankedPerf.seasonRankedMatches,
    lastPlayedAt,
    peakRank: peak?.rankLabel || null,
    peakSeason: peak?.seasonLabel || null,
    statsProfileUrl: profileStatsUrl(profile, platform, username, lookup),
    avatarUrl: profileAvatarUrl(profile, lookup),
    fetchedAt
  };
}

const PROFILE_PLATFORM_TRY = ["pc", "uplay", "xbox", "psn"];

async function fetchProfileById(profileId) {
  return statsCcFetch(
    `/v2/profiles/${encodeURIComponent(profileId)}?increment_views=false`
  );
}

async function fetchProfileByPlatformUsername(preferredPlatform, username) {
  const preferred = String(preferredPlatform || "pc").trim().toLowerCase();
  const platforms = [
    preferred,
    ...PROFILE_PLATFORM_TRY.filter((p) => p !== preferred)
  ];
  let lastErr;
  for (const platform of platforms) {
    try {
      const profile = await statsCcFetch(
        `/v2/profiles/${encodeURIComponent(platform)}/${encodeURIComponent(username)}?increment_views=false`
      );
      return { profile, platform };
    } catch (err) {
      lastErr = err;
      if (err?.code !== "stats_cc_not_found") throw err;
    }
  }
  throw lastErr || new Error("stats_cc_not_found");
}

async function fetchProfile(member, rosterMemberId) {
  const lookup = statsLookupForMember(member);
  const cachedId = rosterMemberId ? memberProfileIdByRosterId.get(rosterMemberId) : "";
  const profileId = lookup.profileId || cachedId || "";
  if (profileId) {
    const profile = await fetchProfileById(profileId);
    const platform = profile?.platform || lookup.platform || "pc";
    return { profile, platform };
  }
  if (lookup.vanity) {
    const profile = await statsCcFetch(
      `/v2/profiles/vanity/${encodeURIComponent(lookup.vanity.toLowerCase())}?increment_views=false`
    );
    const platform = profile?.platform || lookup.platform || "pc";
    return { profile, platform };
  }
  if (!lookup.username) {
    const err = new Error("not_linked");
    err.code = "not_linked";
    throw err;
  }
  return fetchProfileByPlatformUsername(lookup.platform, lookup.username);
}

async function resolveMemberStats(member, config, options = {}) {
  const id = member?.id;
  if (!id) {
    return { ok: false, error: "missing_id" };
  }
  if (!memberHasStatsLookup(member) && !memberProfileIdByRosterId.has(id)) {
    return { ok: false, error: "not_linked" };
  }
  const force = options.force === true;
  const lookup = statsLookupForMember(member);
  const pinnedId = lookup.profileId || memberProfileIdByRosterId.get(id) || "";
  const cacheKey = pinnedId
    ? `id:${pinnedId}`
    : lookup.vanity
      ? `vanity:${lookup.vanity.toLowerCase()}`
      : `member:${id}:${lookup.platform}:${lookup.username.toLowerCase()}`;
  const cached = profileCache.get(cacheKey);
  const now = Date.now();
  if (
    !force &&
    cached &&
    now - cached.at < (cached.result?.ok ? PROFILE_TTL_MS : PROFILE_ERROR_TTL_MS)
  ) {
    return { ...cached.result, memberId: id };
  }
  try {
    const { profile, platform: resolvedPlatform } = await fetchProfile(member, id);
    if (profile?.id) {
      memberProfileIdByRosterId.set(id, profile.id);
    }
    const mapped = mapProfileToPlayerStats(
      profile,
      config,
      resolvedPlatform || lookup.platform,
      lookup.username || profile?.username || "",
      lookup
    );
    let attackers = null;
    let defenders = null;
    const profileIdForOps = profile?.id || pinnedId;
    if (profileIdForOps) {
      try {
        const operatorRows = await fetchRankedOperatorRows(profileIdForOps);
        const topAtk = topOperatorsBySide(operatorRows, config, "attacker", 2);
        const topDef = topOperatorsBySide(operatorRows, config, "defender", 2);
        if (topAtk.length) attackers = topAtk;
        if (topDef.length) defenders = topDef;
      } catch {
      }
    }
    const result = {
      ...mapped,
      attackers,
      defenders
    };
    profileCache.set(cacheKey, { at: now, result });
    if (profile?.id) {
      profileCache.set(`id:${profile.id}`, { at: now, result });
    }
    return { ...result, memberId: id };
  } catch (err) {
    const code = err?.code || err?.message || "stats_cc_error";
    const result = { ok: false, error: code, memberId: id };
    profileCache.set(cacheKey, { at: now, result });
    return result;
  }
}

async function buildRosterStatsPayloadUncached(roster, options = {}) {
  const attribution = STATS_CC_ATTRIBUTION;
  if (!statsCcConfigured()) {
    return { configured: false, attribution, players: {} };
  }
  let config;
  try {
    config = await getConfig();
  } catch (err) {
    return {
      configured: true,
      attribution,
      configError: err?.code || err?.message || "stats_cc_config_failed",
      players: {}
    };
  }
  const players = {};
  const list = Array.isArray(roster) ? roster : [];
  let coldFetchGap = false;
  for (const member of list) {
    if (!member?.id) continue;
    const lookup = statsLookupForMember(member);
    const pinnedId = lookup.profileId || memberProfileIdByRosterId.get(member.id) || "";
    const cacheKey = pinnedId
      ? `id:${pinnedId}`
      : lookup.vanity
        ? `vanity:${lookup.vanity.toLowerCase()}`
        : `member:${member.id}:${lookup.platform}:${lookup.username.toLowerCase()}`;
    const cached = profileCache.get(cacheKey);
    const cacheFresh =
      cached &&
      Date.now() - cached.at <
        (cached.result?.ok ? PROFILE_TTL_MS : PROFILE_ERROR_TTL_MS);
    if (!cacheFresh) {
      if (coldFetchGap) await sleep(STATS_CC_PLAYER_GAP_MS);
      coldFetchGap = true;
    }
    players[member.id] = await resolveMemberStats(member, config, options);
  }
  return { configured: true, attribution, players };
}

async function refreshRosterMemberStats(roster, memberId) {
  const attribution = STATS_CC_ATTRIBUTION;
  if (!statsCcConfigured()) {
    return { configured: false, attribution, players: {} };
  }
  let config;
  try {
    config = await getConfig();
  } catch (err) {
    return {
      configured: true,
      attribution,
      configError: err?.code || err?.message || "stats_cc_config_failed",
      players: {}
    };
  }
  const list = Array.isArray(roster) ? roster : [];
  const member = list.find((m) => m?.id === memberId);
  const player = member
    ? await resolveMemberStats(member, config, { force: true })
    : { ok: false, error: "not_found", memberId };
  const prev = rosterPayloadCache.data;
  const players = { ...(prev?.players || {}), [memberId]: player };
  const merged = prev
    ? { ...prev, configured: true, attribution, players }
    : { configured: true, attribution, players };
  rosterPayloadCache = { at: Date.now(), data: merged };
  return merged;
}

export async function buildRosterStatsPayload(roster, options = {}) {
  const force = options.force === true;
  const memberId = typeof options.memberId === "string" ? options.memberId.trim() : "";
  if (force && memberId) {
    return refreshRosterMemberStats(roster, memberId);
  }
  const now = Date.now();
  if (
    !force &&
    rosterPayloadCache.data &&
    now - rosterPayloadCache.at < ROSTER_PAYLOAD_TTL_MS
  ) {
    return rosterPayloadCache.data;
  }
  if (rosterPayloadInflight && !force) {
    return rosterPayloadInflight;
  }
  rosterPayloadInflight = (async () => {
    try {
      const payload = await buildRosterStatsPayloadUncached(roster, options);
      rosterPayloadCache = { at: Date.now(), data: payload };
      return payload;
    } finally {
      rosterPayloadInflight = null;
    }
  })();
  return rosterPayloadInflight;
}
