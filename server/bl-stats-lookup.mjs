const BL_HANDLE_SUFFIX = /\.BL$/i;

export function ubisoftNameFromBlHandle(name) {
  const raw = String(name || "").trim();
  const match = raw.match(/^(.+?)\.BL$/i);
  return match ? match[1].trim() : "";
}

export function blDisplayNameFromUbisoft(username) {
  const u = String(username || "").trim();
  if (!u) return "";
  if (BL_HANDLE_SUFFIX.test(u)) return u;
  return `${u}.BL`;
}

export function statsLookupForMember(member) {
  const link = member?.statsCc && typeof member.statsCc === "object" ? member.statsCc : {};
  const vanity = String(link.vanity || member.statsVanity || "").trim();
  const profileId = String(link.profileId || link.profile_id || "").trim();
  const platform = String(link.platform || member.statsPlatform || "uplay").trim().toLowerCase();
  let username = String(link.username || member.ubisoftUsername || "").trim();
  if (!vanity && !profileId && !username) {
    username = ubisoftNameFromBlHandle(member?.name);
  }
  return { vanity, profileId, platform, username };
}

export function memberHasStatsLookup(member) {
  const { vanity, profileId, username } = statsLookupForMember(member);
  return Boolean(vanity || profileId || username);
}
