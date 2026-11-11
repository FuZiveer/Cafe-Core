import {
  blDisplayNameFromUbisoft,
  memberHasStatsLookup,
  statsLookupForMember
} from "./bl-stats-lookup.mjs";

const STATS_CC_BASE = "https://api.stats.cc/siege";
const CONFIG_TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_TTL_MS = 12 * 60 * 1000;
const PROFILE_ERROR_TTL_MS = 2 * 60 * 1000;

export const STATS_CC_ATTRIBUTION = {
  text: "Data by Stats.cc",
  url: "https://stats.cc/siege"
};

let configCache = { at: 0, data: null };
const profileCache = new Map();
const memberProfileIdByRosterId = new Map();

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

function profileStatsUrl(profile, platform, username) {
  const vanity = profile?.vanity;
  if (typeof vanity === "string" && vanity.trim()) {
    return `https://stats.cc/siege/@${encodeURIComponent(vanity.trim().toLowerCase())}`;
  }
  if (platform && username) {
    return `https://stats.cc/siege/${encodeURIComponent(platform)}/${encodeURIComponent(username)}`;
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

function mapProfileToPlayerStats(profile, config, platform, username) {
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
  return {
    ok: true,
    profileId: profile?.id || null,
    username: liveName,
    displayName: blDisplayNameFromUbisoft(liveName),
    platform: profile?.platform || platform || null,
    currentRank: currentRank || null,
    currentSeason: currentSeason || null,
    rankPoints,
    peakRank: peak?.rankLabel || null,
    peakSeason: peak?.seasonLabel || null,
    statsProfileUrl: profileStatsUrl(profile, platform, username),
    fetchedAt: profile?.fetched_at || null
  };
}

async function fetchProfileById(profileId) {
  return statsCcFetch(
    `/v2/profiles/${encodeURIComponent(profileId)}?increment_views=false`
  );
}

async function fetchProfile(member, rosterMemberId) {
  const lookup = statsLookupForMember(member);
  const cachedId = rosterMemberId ? memberProfileIdByRosterId.get(rosterMemberId) : "";
  const profileId = lookup.profileId || cachedId || "";
  if (profileId) {
    return fetchProfileById(profileId);
  }
  if (lookup.vanity) {
    return statsCcFetch(
      `/v2/profiles/vanity/${encodeURIComponent(lookup.vanity.toLowerCase())}?increment_views=false`
    );
  }
  if (!lookup.username) {
    const err = new Error("not_linked");
    err.code = "not_linked";
    throw err;
  }
  return statsCcFetch(
    `/v2/profiles/${encodeURIComponent(lookup.platform)}/${encodeURIComponent(lookup.username)}?increment_views=false`
  );
}

async function resolveMemberStats(member, config) {
  const id = member?.id;
  if (!id) {
    return { ok: false, error: "missing_id" };
  }
  if (!memberHasStatsLookup(member) && !memberProfileIdByRosterId.has(id)) {
    return { ok: false, error: "not_linked" };
  }
  const lookup = statsLookupForMember(member);
  const pinnedId = lookup.profileId || memberProfileIdByRosterId.get(id) || "";
  const cacheKey = pinnedId
    ? `id:${pinnedId}`
    : lookup.vanity
      ? `vanity:${lookup.vanity.toLowerCase()}`
      : `member:${id}:${lookup.platform}:${lookup.username.toLowerCase()}`;
  const cached = profileCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.at < (cached.result?.ok ? PROFILE_TTL_MS : PROFILE_ERROR_TTL_MS)) {
    return { ...cached.result, memberId: id };
  }
  try {
    const profile = await fetchProfile(member, id);
    if (profile?.id) {
      memberProfileIdByRosterId.set(id, profile.id);
    }
    const result = mapProfileToPlayerStats(
      profile,
      config,
      lookup.platform,
      lookup.username || profile?.username || ""
    );
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

export async function buildRosterStatsPayload(roster) {
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
  for (const member of list) {
    if (!member?.id) continue;
    players[member.id] = await resolveMemberStats(member, config);
  }
  return { configured: true, attribution, players };
}
