(function() {
  const R6_OPERATOR_ICON_BASE = "https://cdn.jsdelivr.net/npm/r6operators@2.12.0/dist/icons";
  const R6_OPERATOR_ICON_EXTRA_BASE = "https://cdn.jsdelivr.net/npm/@zerobertoo/r6operators@2.0.0/dist/icons";
  const R6_OPERATOR_SLUG_ALIASES = {
    jager: "jager",
    j\u00E4ger: "jager",
    chanka: "tachanka",
    tachanka: "tachanka",
    lion: "lion",
    dokkaebi: "dokkaebi",
    "solid snake": "solid_snake",
    solidsnake: "solid_snake"
  };
  const R6_OPERATOR_ICON_SLUGS_EXTRA = new Set(["solid_snake"]);
  function operatorNameToSlug(name) {
    const raw = String(name).trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    if (R6_OPERATOR_SLUG_ALIASES[raw]) return R6_OPERATOR_SLUG_ALIASES[raw];
    const compact = raw.replace(/[^a-z0-9]/g, "");
    if (R6_OPERATOR_SLUG_ALIASES[compact]) return R6_OPERATOR_SLUG_ALIASES[compact];
    return compact;
  }
  function operatorIconUrl(name) {
    const slug = operatorNameToSlug(name);
    if (!slug) return "";
    const base = R6_OPERATOR_ICON_SLUGS_EXTRA.has(slug) ? R6_OPERATOR_ICON_EXTRA_BASE : R6_OPERATOR_ICON_BASE;
    return `${base}/${encodeURIComponent(slug)}.svg`;
  }
  function bindOperatorIconFallback(root) {
    if (!root) return;
    root.querySelectorAll(".bl-roster-op-icon").forEach((img) => {
      img.addEventListener(
        "error",
        () => {
          img.remove();
        },
        { once: true }
      );
    });
  }
  function bindBlRosterAvatarFallback(root) {
    if (!root) return;
    root.querySelectorAll(".bl-roster-avatar-img").forEach((img) => {
      img.addEventListener(
        "error",
        () => {
          const wrap = img.closest(".bl-roster-avatar");
          const initials = wrap?.dataset?.blAvatarFallback || "?";
          if (!wrap) return;
          wrap.classList.remove("bl-roster-avatar--photo");
          wrap.textContent = initials;
        },
        { once: true }
      );
    });
  }
  function rosterAvatarUrlFromMember(member) {
    const link = member?.statsCc;
    const profileId = String(link?.profileId || link?.profile_id || "").trim();
    if (!profileId) return "";
    return `https://ubisoft-avatars.akamaized.net/${encodeURIComponent(profileId)}/default_146_146.png`;
  }
  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function renderCardAvatar(member, recruiting, name) {
    const baseClass = recruiting ? "bl-roster-avatar bl-roster-avatar--recruiting" : "bl-roster-avatar";
    const initials = initialsFromName(name);
    const avatarUrl = String(member.avatarUrl || rosterAvatarUrlFromMember(member) || "").trim();
    if (!recruiting && avatarUrl) {
      return `<div class="${baseClass} bl-roster-avatar--photo" data-bl-avatar-fallback="${escapeHtml(initials)}" aria-hidden="true"><img class="bl-roster-avatar-img" src="${escapeHtml(avatarUrl)}" alt="" width="52" height="52" loading="lazy" decoding="async"></div>`;
    }
    return `<div class="${baseClass}" aria-hidden="true">${escapeHtml(initials)}</div>`;
  }
  function renderCardTeamRankPill(member) {
    const n = Number(member.teamRank);
    if (!Number.isFinite(n) || n < 1) return "";
    return `<span class="bl-roster-badge bl-roster-badge--team-rank bl-roster-badge--pastel-tint" title="Team rank #${n}">#${escapeHtml(String(n))}</span>`;
  }
  function formatPlayerName(name) {
    const raw = String(name);
    const match = raw.match(/^(.+?)(\.BL)$/i);
    if (!match) return escapeHtml(raw);
    return `${escapeHtml(match[1])}<span class="bl-roster-handle">${escapeHtml(match[2])}</span>`;
  }
  function rolePartSlug(label) {
    return String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function formatRolePart(part) {
    const text = String(part || "").trim();
    if (!text) return "";
    const slug = rolePartSlug(text);
    const slugClass = ["support", "flex", "fragger", "intel", "roamer"].includes(slug) ? ` bl-roster-role-part--${slug}` : "";
    return `<span class="bl-roster-role-part${slugClass}">${escapeHtml(text)}</span>`;
  }
  const ROLE_PART_DISPLAY_ORDER = ["fragger", "flex", "support", "intel", "roamer"];
  function sortRolePartsForDisplay(parts) {
    return [...parts].sort((a, b) => {
      const ia = ROLE_PART_DISPLAY_ORDER.indexOf(rolePartSlug(a));
      const ib = ROLE_PART_DISPLAY_ORDER.indexOf(rolePartSlug(b));
      const oa = ia === -1 ? ROLE_PART_DISPLAY_ORDER.length : ia;
      const ob = ib === -1 ? ROLE_PART_DISPLAY_ORDER.length : ib;
      if (oa !== ob) return oa - ob;
      return String(a).localeCompare(String(b), void 0, { sensitivity: "base" });
    });
  }
  function formatRoleDisplay(role) {
    const raw = String(role || "").trim();
    if (!raw) return "";
    const parts = sortRolePartsForDisplay(raw.split(/\s*\/\s*/).filter(Boolean));
    if (!parts.length) return "";
    if (parts.length === 1) return formatRolePart(parts[0]);
    return parts.map((part) => formatRolePart(part)).join('<span class="bl-roster-role-dot" aria-hidden="true">\xB7</span>');
  }
  function initialsFromName(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const BL_ROSTER_PASTELS = [
    { accent: "#f9a8d4", soft: "rgba(249, 168, 212, 0.16)", border: "rgba(249, 168, 212, 0.34)", ink: "#fce7f3" },
    { accent: "#fdba74", soft: "rgba(253, 186, 116, 0.16)", border: "rgba(253, 186, 116, 0.34)", ink: "#ffedd5" },
    { accent: "#fde68a", soft: "rgba(253, 230, 138, 0.14)", border: "rgba(253, 230, 138, 0.32)", ink: "#fef9c3" },
    { accent: "#86efac", soft: "rgba(134, 239, 172, 0.14)", border: "rgba(134, 239, 172, 0.32)", ink: "#dcfce7" },
    { accent: "#7dd3fc", soft: "rgba(125, 211, 252, 0.14)", border: "rgba(125, 211, 252, 0.32)", ink: "#e0f2fe" },
    { accent: "#c4b5fd", soft: "rgba(196, 181, 253, 0.16)", border: "rgba(196, 181, 253, 0.34)", ink: "#ede9fe" },
    { accent: "#f0abfc", soft: "rgba(240, 171, 252, 0.14)", border: "rgba(240, 171, 252, 0.32)", ink: "#fae8ff" },
    { accent: "#a5f3fc", soft: "rgba(165, 243, 252, 0.14)", border: "rgba(165, 243, 252, 0.32)", ink: "#cffafe" }
  ];
  function blRosterPastelIndex(memberId) {
    const id = String(memberId || "");
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    return hash % BL_ROSTER_PASTELS.length;
  }
  function blRosterPastelForMember(member) {
    return BL_ROSTER_PASTELS[blRosterPastelIndex(member?.id)] || BL_ROSTER_PASTELS[0];
  }
  function blRosterPastelStyleAttr(member) {
    const p = blRosterPastelForMember(member);
    return ` style="--bl-player-accent:${p.accent};--bl-player-soft:${p.soft};--bl-player-border:${p.border}"`;
  }
  function normalizeOperatorEntry(entry) {
    if (!entry) return null;
    if (typeof entry === "string") {
      const name = entry.trim();
      return name ? { name, kd: null } : null;
    }
    if (typeof entry === "object") {
      const name = String(entry.name || entry.operator || "").trim();
      if (!name) return null;
      const kd = Number(entry.kd);
      return { name, kd: Number.isFinite(kd) ? kd : null };
    }
    return null;
  }
  function formatOperatorKd(kd) {
    if (kd == null || !Number.isFinite(kd)) return "";
    return kd.toFixed(2);
  }
  function renderOperatorPills(operators, side) {
    const list = (Array.isArray(operators) ? operators : [])
      .map(normalizeOperatorEntry)
      .filter(Boolean);
    if (!list.length) {
      return '<span class="bl-roster-op-empty">\u2014</span>';
    }
    return list.map((entry) => {
      const iconUrl = operatorIconUrl(entry.name);
      const iconMarkup = iconUrl
        ? `<img class="bl-roster-op-icon" src="${escapeHtml(iconUrl)}" alt="" width="18" height="18" loading="lazy" decoding="async">`
        : "";
      const kdText = formatOperatorKd(entry.kd);
      const kdMarkup = kdText
        ? `<span class="bl-roster-op-kd${blSeasonKdToneClass(entry.kd)}">${escapeHtml(kdText)}</span>`
        : "";
      return `<span class="bl-roster-op-pill bl-roster-op-pill--${side}">${iconMarkup}<span class="bl-roster-op-name">${escapeHtml(entry.name)}</span>${kdMarkup}</span>`;
    }).join("");
  }
  function renderMemberCard(member) {
    member = memberForDisplay(member);
    const recruiting = Boolean(member.recruiting);
    const captain = Boolean(member.captain);
    const name = member.name || "TBD";
    const role = member.role || "Role";
    const badges = [];
    if (member.igl) {
      badges.push('<span class="bl-roster-badge bl-roster-badge--igl">IGL</span>');
    }
    if (member.coIgl) {
      badges.push('<span class="bl-roster-badge bl-roster-badge--co-igl">Co-IGL</span>');
    }
    if (captain) {
      badges.push('<span class="bl-roster-badge bl-roster-badge--captain bl-roster-badge--pastel-tint">Captain</span>');
    }
    if (recruiting) {
      badges.push('<span class="bl-roster-badge bl-roster-badge--recruiting bl-roster-badge--pastel-tint">Recruiting</span>');
    }
    const teamRankPill = renderCardTeamRankPill(member);
    const tagMarkup =
      badges.length || teamRankPill
        ? `<div class="bl-roster-name-row-tags"${blRosterPastelStyleAttr(member)}>${teamRankPill}${badges.join("")}</div>`
        : "";
    let cardClass = "bl-roster-card";
    if (member.substitute) cardClass += " bl-roster-card--sub";
    const iglFocus = Boolean(member.igl && member.gridCenter);
    if (iglFocus) cardClass += " bl-roster-card--igl-focus";
    else if (member.gridCenter) cardClass += " bl-roster-card--grid-center";
    const cardHtml = `
        <article class="${cardClass}">
            <div class="bl-roster-card-body">
                <header class="bl-roster-card-head">
                    <div class="bl-roster-card-head-main">
                        ${renderCardAvatar(member, recruiting, name)}
                        <div class="bl-roster-card-meta min-w-0 flex-1">
                            <div class="bl-roster-name-row">
                                <h3 class="bl-roster-player-name">${formatPlayerName(name)}</h3>
                                ${tagMarkup}
                            </div>
                            <p class="bl-roster-role">${formatRoleDisplay(role)}</p>
                        </div>
                    </div>
                    <button type="button" class="bl-roster-more-btn ui-interactive" data-bl-member-id="${escapeHtml(member.id || "")}" aria-haspopup="dialog">More</button>
                </header>
                ${renderMemberOps(member)}
            </div>
        </article>`;
    if (!iglFocus) return cardHtml;
    const iglOrnament = (side) => `
            <div class="bl-roster-igl-ornament bl-roster-igl-ornament--${side}" aria-hidden="true">
                <span class="bl-roster-igl-ornament-line"></span>
                <span class="bl-roster-igl-ornament-mark">
                    <i class="fa-solid fa-crown"></i>
                </span>
                <span class="bl-roster-igl-ornament-line"></span>
            </div>`;
    return `
        <div class="bl-roster-igl-focus-row">
            ${iglOrnament("left")}
            ${cardHtml}
            ${iglOrnament("right")}
        </div>`;
  }
  function getRoster() {
    const roster = window.BLACK_LISTED_ROSTER;
    return Array.isArray(roster) ? roster : [];
  }
  function findMemberById(memberId) {
    if (!memberId) return null;
    return getRoster().find((entry) => entry.id === memberId) || null;
  }
  function liveStatsForMember(memberId) {
    const players = window.__cafeBlApi?.rosterStats?.players;
    if (!players || !memberId) return null;
    const row = players[memberId];
    return row && row.ok === true ? row : null;
  }
  let blLiveTeamRankCache = null;
  function clearBlLiveTeamRankCache() {
    blLiveTeamRankCache = null;
  }
  const BL_TEAM_RANK_MIN_RANKED_MATCHES = 10;
  const BL_TEAM_RANK_WEIGHTS = { kd: 0.4, wr: 0.35, hs: 0.25 };
  function blNormalizePct(value, max = 100) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(Math.max(n, 0), max) / max;
  }
  function blTeamContributionScore(live) {
    const kd = Number(live?.seasonKd);
    const wr = Number(live?.seasonWinRate);
    const hs = Number(live?.seasonHeadshotPct);
    const kdNorm = Number.isFinite(kd) && kd >= 0 ? Math.min(kd / 2, 1) : null;
    const wrNorm = blNormalizePct(wr, 100);
    const hsNorm = blNormalizePct(hs, 100);
    const w = BL_TEAM_RANK_WEIGHTS;
    let total = 0;
    let weight = 0;
    if (kdNorm != null) {
      total += kdNorm * w.kd;
      weight += w.kd;
    }
    if (wrNorm != null) {
      total += wrNorm * w.wr;
      weight += w.wr;
    }
    if (hsNorm != null) {
      total += hsNorm * w.hs;
      weight += w.hs;
    }
    if (!weight) return null;
    return total / weight;
  }
  function computeBlLiveTeamRankMap() {
    if (window.__cafeBlApi?.rosterStats?.configured !== true) return null;
    const starters = getRoster().filter((m) => !m.substitute);
    const scored = starters
      .map((m) => {
        const live = liveStatsForMember(m.id);
        const matches = Number(live?.seasonRankedMatches);
        const score = blTeamContributionScore(live);
        const kd = Number(live?.seasonKd);
        const wr = Number(live?.seasonWinRate);
        const hs = Number(live?.seasonHeadshotPct);
        const eligible =
          score != null &&
          Number.isFinite(kd) &&
          Number.isFinite(wr) &&
          (!Number.isFinite(matches) || matches >= BL_TEAM_RANK_MIN_RANKED_MATCHES);
        return {
          id: m.id,
          eligible,
          score,
          kd,
          wr,
          hs: Number.isFinite(hs) ? hs : -1
        };
      })
      .filter((row) => row.eligible);
    if (!scored.length) return null;
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wr !== a.wr) return b.wr - a.wr;
      if (b.kd !== a.kd) return b.kd - a.kd;
      if (b.hs !== a.hs) return b.hs - a.hs;
      return 0;
    });
    const map = new Map();
    scored.forEach((row, index) => map.set(row.id, index + 1));
    return map;
  }
  function getBlLiveTeamRankMap() {
    if (blLiveTeamRankCache) return blLiveTeamRankCache;
    blLiveTeamRankCache = computeBlLiveTeamRankMap();
    return blLiveTeamRankCache;
  }
  function applyLiveTeamRankToMember(member) {
    if (!member || member.substitute) {
      if (member) member.teamRank = undefined;
      return;
    }
    const map = getBlLiveTeamRankMap();
    if (map?.has(member.id)) member.teamRank = map.get(member.id);
  }
  function memberForDisplay(member) {
    if (!member) return member;
    const merged = { ...member };
    const live = liveStatsForMember(member.id);
    if (live) {
      if (live.currentRank) merged.currentRank = live.currentRank;
      if (live.peakRank) {
        merged.peakRank = {
          rank: live.peakRank,
          season: live.peakSeason || ""
        };
      }
      if (live.displayName) merged.name = live.displayName;
      else if (live.username) merged.name = `${String(live.username).trim()}.BL`;
      if (live.statsProfileUrl) merged.statsProfileUrl = live.statsProfileUrl;
      if (live.avatarUrl) merged.avatarUrl = live.avatarUrl;
      if (Array.isArray(live.attackers) && live.attackers.length) {
        merged.attackers = live.attackers.slice(0, 2);
      }
      if (Array.isArray(live.defenders) && live.defenders.length) {
        merged.defenders = live.defenders.slice(0, 2);
      }
    }
    applyLiveTeamRankToMember(merged);
    if (!merged.avatarUrl) {
      const avatarUrl = rosterAvatarUrlFromMember(merged);
      if (avatarUrl) merged.avatarUrl = avatarUrl;
    }
    return merged;
  }
  function renderMemberOps(member) {
    return `
                <div class="bl-roster-ops">
                    <div class="bl-roster-ops-side bl-roster-ops-side--atk">
                        <p class="bl-roster-ops-label bl-roster-ops-label--atk">
                            <i class="fa-solid fa-crosshairs" aria-hidden="true"></i>
                            Attack
                        </p>
                        <div class="bl-roster-op-list">${renderOperatorPills(member.attackers, "atk")}</div>
                    </div>
                    <div class="bl-roster-ops-side bl-roster-ops-side--def">
                        <p class="bl-roster-ops-label bl-roster-ops-label--def">
                            <i class="fa-solid fa-shield" aria-hidden="true"></i>
                            Defense
                        </p>
                        <div class="bl-roster-op-list">${renderOperatorPills(member.defenders, "def")}</div>
                    </div>
                </div>`;
  }
  const R6_RANK_ICON_CDN = "https://cdn.jsdelivr.net/gh/Kaapo38/r6ranks@main";
  const R6_RANK_TIER_BASE_ID = {
    copper: 1,
    bronze: 6,
    silver: 11,
    gold: 16,
    platinum: 21,
    emerald: 26,
    diamond: 31
  };
  function peakRankRawLabel(member) {
    const raw = member.peakRank;
    if (raw == null || raw === "") return "";
    if (typeof raw === "string") return raw.trim();
    if (typeof raw === "object" && raw.rank) return String(raw.rank).trim();
    return "";
  }
  function formatPeakRank(member) {
    const label = peakRankRawLabel(member);
    if (!label) return "";
    const raw = member.peakRank;
    if (typeof raw === "object" && raw.season) {
      const season = String(raw.season).trim();
      if (season) return `${label} \xB7 ${season}`;
    }
    return label;
  }
  function parseRankDivision(part) {
    const token = String(part || "").trim().toLowerCase().replace(/\./g, "");
    if (!token) return null;
    const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
    if (roman[token] != null) return roman[token];
    const n = Number.parseInt(token, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
    return null;
  }
  function rankTierFromLabel(label) {
    const text = String(label || "")
      .trim()
      .toLowerCase()
      .replace(/\./g, " ")
      .replace(/\s+/g, " ");
    if (!text || text === "\u2014") return "";
    if (text.startsWith("champion")) return "champion";
    const match = text.match(/^(copper|bronze|silver|gold|platinum|emerald|diamond)/);
    return match ? match[1] : "";
  }
  function peakRankLabelToIconId(label) {
    let text = String(label).trim().toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
    if (!text) return null;
    if (text === "unranked") return 0;
    if (text.startsWith("champion")) return 36;
    const match = text.match(/^(copper|bronze|silver|gold|platinum|emerald|diamond)\s*(.*)$/);
    if (!match) return null;
    const base = R6_RANK_TIER_BASE_ID[match[1]];
    if (!base) return null;
    const division = parseRankDivision(match[2]);
    if (division == null) return base + 2;
    return base + (5 - division);
  }
  function peakRankIconUrl(member, labelOverride) {
    const explicit = Number(member.peakRankIconId);
    if (Number.isFinite(explicit) && explicit >= 0 && explicit <= 36) {
      return `${R6_RANK_ICON_CDN}/${explicit}.png`;
    }
    const label = labelOverride != null && String(labelOverride).trim()
      ? String(labelOverride).trim()
      : peakRankRawLabel(member);
    const id = peakRankLabelToIconId(label);
    if (id == null) return "";
    return `${R6_RANK_ICON_CDN}/${id}.png`;
  }
  function bindPeakRankIconFallback(root) {
    if (!root) return;
    root.querySelectorAll(".bl-roster-modal-peak-icon").forEach((img) => {
      if (img.dataset.fallbackBound === "1") return;
      img.dataset.fallbackBound = "1";
      img.addEventListener("error", () => {
        img.hidden = true;
      });
    });
  }
  function ensureBlRosterModalPeakRail() {
    const peak = document.getElementById("bl-roster-player-modal-peak");
    const panel = document.querySelector("#bl-roster-player-modal .bl-roster-player-modal-panel");
    const body = document.getElementById("bl-roster-player-modal-body");
    if (!peak || !panel || !body || panel.contains(peak)) return;
    peak.classList.add("bl-roster-modal-peak-rail--in-panel");
    body.insertAdjacentElement("afterend", peak);
  }
  function ensureBlRosterModalReloadButton() {
    const headRow = document.querySelector(
      "#bl-roster-player-modal .bl-roster-modal-head-row"
    );
    if (!headRow) return;
    document.getElementById("bl-roster-modal-update-rail")?.remove();
    const legacyBtn = document.getElementById("bl-roster-modal-stats-update");
    legacyBtn?.remove();
    let reloadBtn = document.getElementById("bl-roster-player-modal-reload");
    const closeBtn = document.getElementById("bl-roster-player-modal-close");
    const statsOpenMarkup = `<a id="bl-roster-player-modal-stats-open" class="topbar-action-btn ui-interactive w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-redneon-500 hover:bg-matte-800 relative shrink-0" href="https://stats.cc/siege" target="_blank" rel="noopener noreferrer" aria-label="Open Stats.cc profile">
                    <i class="fa-solid fa-arrow-up-right-from-square text-sm" aria-hidden="true"></i>
                </a>`;
    if (!reloadBtn && closeBtn) {
      const wrap =
        closeBtn.closest(".bl-roster-modal-head-actions") ||
        (() => {
          const actions = document.createElement("div");
          actions.className =
            "bl-roster-modal-head-actions flex items-center gap-1 shrink-0";
          closeBtn.replaceWith(actions);
          actions.appendChild(closeBtn);
          return actions;
        })();
      wrap.insertAdjacentHTML(
        "afterbegin",
        `${statsOpenMarkup}<button type="button" id="bl-roster-player-modal-reload" class="topbar-action-btn ui-interactive w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-redneon-500 hover:bg-matte-800 relative shrink-0" disabled aria-label="Refresh Stats.cc data for this player">
                    <i class="fa-solid fa-arrows-rotate text-sm" aria-hidden="true"></i>
                </button>`
      );
      reloadBtn = document.getElementById("bl-roster-player-modal-reload");
    } else if (!document.getElementById("bl-roster-player-modal-stats-open") && reloadBtn) {
      reloadBtn.insertAdjacentHTML("beforebegin", statsOpenMarkup);
    }
    if (reloadBtn && closeBtn) {
      const actions = reloadBtn.closest(".bl-roster-modal-head-actions");
      if (actions && !actions.contains(closeBtn)) {
        actions.appendChild(closeBtn);
      }
      const statsOpen = document.getElementById("bl-roster-player-modal-stats-open");
      if (statsOpen && !actions.contains(statsOpen)) {
        actions.insertBefore(statsOpen, reloadBtn);
      }
    }
    bindBlRosterModalHeadTooltipButtons();
  }
  const BL_MODAL_STATS_RAIL_HTML = `
            <aside id="bl-roster-player-modal-stats" class="bl-roster-modal-stats-rail bl-roster-modal-stats-rail--shell-bottom-right" aria-label="View on Stats.cc">
                <a id="bl-roster-player-modal-stats-link" class="bl-roster-modal-stats-chip ui-interactive" href="https://stats.cc/siege" target="_blank" rel="noopener noreferrer" tabindex="-1">
                    <span class="bl-roster-modal-stats-chip-label">Data by Stats.cc</span>
                    <i class="fa-solid fa-arrow-up-right-from-square bl-roster-modal-stats-chip-icon" aria-hidden="true"></i>
                </a>
            </aside>`;
  function ensureBlRosterModalStatsRail() {
    ensureBlRosterModalPeakRail();
    ensureBlRosterModalReloadButton();
    document.getElementById("bl-roster-modal-update-rail")?.remove();
    document.getElementById("bl-roster-modal-shell-foot")?.remove();
    const shell = document.querySelector(
      "#bl-roster-player-modal .bl-roster-player-modal-shell"
    );
    const panel = shell?.querySelector(".bl-roster-player-modal-panel");
    if (!shell || !panel) return;
    let statsRail = document.getElementById("bl-roster-player-modal-stats");
    if (!statsRail) {
      panel.insertAdjacentHTML("afterend", BL_MODAL_STATS_RAIL_HTML);
      statsRail = document.getElementById("bl-roster-player-modal-stats");
    } else if (statsRail.parentElement !== shell) {
      panel.insertAdjacentElement("afterend", statsRail);
    }
    if (!statsRail) return;
    statsRail.classList.add("bl-roster-modal-stats-rail");
    statsRail.classList.remove(
      "bl-roster-modal-stats-rail--shell-top-right",
      "bl-roster-modal-stats-rail--panel-foot",
      "bl-roster-modal-stats-rail--shell-right",
      "bl-roster-modal-stats-rail--panel-bottom-right"
    );
    statsRail.classList.add("bl-roster-modal-stats-rail--shell-bottom-right");
  }
  function statsProfileUrlFromRosterLink(member) {
    const link = member?.statsCc;
    if (!link || typeof link !== "object") return "";
    const profileId = String(link.profileId || link.profile_id || "").trim();
    if (profileId) {
      return `https://stats.cc/siege/-/${encodeURIComponent(profileId)}`;
    }
    const vanity = String(link.vanity || "").trim();
    if (vanity) {
      return `https://stats.cc/siege/@${encodeURIComponent(vanity.toLowerCase())}`;
    }
    const username = String(link.username || "").trim();
    const platform = String(link.platform || "pc").trim().toLowerCase();
    if (username) {
      return `https://stats.cc/siege/${encodeURIComponent(platform)}/${encodeURIComponent(username)}`;
    }
    return "";
  }
  function isStaleStatsCcPlatformUrl(url) {
    if (typeof url !== "string" || !url.trim()) return false;
    try {
      return /\/siege\/(?:pc|uplay|xbox|psn)\/[^/]+\/?$/i.test(new URL(url).pathname);
    } catch {
      return false;
    }
  }
  function statsProfileUrlForMember(member) {
    const rosterUrl = statsProfileUrlFromRosterLink(member);
    const live = liveStatsForMember(member?.id);
    let url = live?.statsProfileUrl || member?.statsProfileUrl || "";
    if (typeof url === "string") url = url.trim();
    if (rosterUrl) {
      if (!url || isStaleStatsCcPlatformUrl(url)) return rosterUrl;
    }
    if (url) return url;
    return rosterUrl || "https://stats.cc/siege";
  }
  const BL_STATS_CC_ATTRIBUTION_URL = "https://stats.cc/siege";
  function renderStatsCcRail(member) {
    const profileHref = statsProfileUrlForMember(member);
    const headOpen = document.getElementById("bl-roster-player-modal-stats-open");
    if (headOpen) {
      headOpen.href = profileHref;
      headOpen.setAttribute("aria-label", "Open Stats.cc profile");
    }
    const statsLink = document.getElementById("bl-roster-player-modal-stats-link");
    if (statsLink) {
      statsLink.href = BL_STATS_CC_ATTRIBUTION_URL;
      statsLink.setAttribute(
        "aria-label",
        `Data by Stats.cc (${BL_STATS_CC_ATTRIBUTION_URL})`
      );
    }
  }
  function renderTeamRankRail(member) {
    const railEl = document.getElementById("bl-roster-player-modal-team-rank");
    if (!railEl) return;
    const n = Number(member.teamRank);
    if (!Number.isFinite(n) || n < 1) {
      railEl.hidden = true;
      railEl.innerHTML = "";
      return;
    }
    railEl.hidden = false;
    railEl.innerHTML = `
            <div class="bl-roster-modal-peak-rail-inner">
                <p class="bl-roster-modal-peak-label">Team rank</p>
                <p class="bl-roster-modal-peak-value">#${escapeHtml(String(n))}</p>
            </div>`;
  }
  function siegeMapSlugFromName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/['']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  const BL_R6MAPS_FOLDER_ALIASES = {
    "kafe-dostoyevsky": "kafe",
    "presidential-plane": "plane",
    "bartlett-u": "university",
    "hereford-base": "hereford",
    "theme-park": "themepark"
  };
  function normalizeBestMapEntry(entry) {
    if (entry == null) return null;
    if (typeof entry === "object") {
      const name = String(entry.name || entry.map || "").trim();
      if (!name) return null;
      const slug = String(entry.slug || "").trim().toLowerCase();
      const image = String(entry.image || entry.imageUrl || entry.src || "").trim();
      return { name, slug, image };
    }
    const name = String(entry).trim();
    if (!name) return null;
    return { name, slug: siegeMapSlugFromName(name), image: "" };
  }
  function bestMapsForMember(member) {
    const live = liveStatsForMember(member?.id);
    const fromLive = live?.bestMaps;
    if (!Array.isArray(fromLive) || !fromLive.length) return [];
    return fromLive.map(normalizeBestMapEntry).filter(Boolean);
  }
  function bestMapImageUrl(map) {
    if (map.image) return map.image;
    const slug = String(map.slug || "").trim().toLowerCase() || siegeMapSlugFromName(map.name);
    if (!slug) return "";
    const folder = BL_R6MAPS_FOLDER_ALIASES[slug] || slug;
    return `https://www.r6maps.com/img/${encodeURIComponent(folder)}/${encodeURIComponent(folder)}-1.jpg`;
  }
  function renderBestMapRailCell(map) {
    const src = bestMapImageUrl(map);
    const srcAttr = src ? ` data-map-src="${escapeHtml(src)}"` : "";
    return `
            <div class="bl-roster-modal-peak-rail-inner bl-roster-modal-best-map-cell"${srcAttr}>
                <span class="bl-roster-modal-best-map-fallback" aria-hidden="true">${escapeHtml(map.name)}</span>
                <div class="bl-roster-modal-best-map-caption">
                    <p class="bl-roster-modal-peak-label">Best map</p>
                    <p class="bl-roster-modal-best-map-name">${escapeHtml(map.name)}</p>
                </div>
            </div>`;
  }
  function bindBestMapBackgrounds(root) {
    if (!root) return;
    root.querySelectorAll(".bl-roster-modal-best-map-cell[data-map-src]").forEach((cell) => {
      const src = cell.getAttribute("data-map-src");
      if (!src || cell.dataset.mapBgBound === "1") return;
      cell.dataset.mapBgBound = "1";
      const img = new Image();
      img.onload = () => {
        cell.classList.add("has-map-image");
        cell.style.setProperty(
          "--bl-best-map-bg",
          `url("${src.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`
        );
      };
      img.onerror = () => {
        cell.removeAttribute("data-map-src");
      };
      img.src = src;
    });
  }
  function renderBestMapsRail(member) {
    const railEl = document.getElementById("bl-roster-player-modal-best-maps");
    if (!railEl) return;
    const maps = bestMapsForMember(member);
    if (!maps.length) {
      railEl.hidden = true;
      railEl.innerHTML = "";
      return;
    }
    railEl.hidden = false;
    railEl.innerHTML = maps.map((map) => renderBestMapRailCell(map)).join("");
    bindBestMapBackgrounds(railEl);
  }
  function currentRankDisplay(member) {
    const live = liveStatsForMember(member.id);
    const rankRaw = live?.currentRank ?? member.currentRank;
    const rank = rankRaw != null ? String(rankRaw).trim() : "";
    if (!rank) return { text: "", iconLabel: "" };
    const season = live?.currentSeason != null ? String(live.currentSeason).trim() : "";
    const text = season ? `${rank} \xB7 ${season}` : rank;
    return { text, iconLabel: rank };
  }
  const BL_ROSTER_STATS_UPDATE_COOLDOWN_MS = 3 * 60 * 1000;
  const BL_ROSTER_STATS_COOLDOWN_STORAGE_KEY = "cafeBlRosterStatsUpdateUntilByMember";
  const BL_ROSTER_STATS_COOLDOWN_LEGACY_KEY = "cafeBlRosterStatsUpdateUntil";
  let blRosterStatsUpdateCooldowns = Object.create(null);
  let blRosterStatsUpdateTimer = null;
  function pruneBlRosterStatsCooldownMap(map) {
    const now = Date.now();
    for (const id of Object.keys(map)) {
      const until = map[id];
      if (!Number.isFinite(until) || until <= now) delete map[id];
    }
    return map;
  }
  function persistBlRosterStatsCooldownMap() {
    try {
      pruneBlRosterStatsCooldownMap(blRosterStatsUpdateCooldowns);
      if (Object.keys(blRosterStatsUpdateCooldowns).length === 0) {
        localStorage.removeItem(BL_ROSTER_STATS_COOLDOWN_STORAGE_KEY);
      } else {
        localStorage.setItem(
          BL_ROSTER_STATS_COOLDOWN_STORAGE_KEY,
          JSON.stringify(blRosterStatsUpdateCooldowns)
        );
      }
    } catch {
    }
  }
  function loadBlRosterStatsUpdateCooldown() {
    try {
      const raw = localStorage.getItem(BL_ROSTER_STATS_COOLDOWN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          blRosterStatsUpdateCooldowns = pruneBlRosterStatsCooldownMap({ ...parsed });
          persistBlRosterStatsCooldownMap();
          return;
        }
      }
      localStorage.removeItem(BL_ROSTER_STATS_COOLDOWN_LEGACY_KEY);
      blRosterStatsUpdateCooldowns = Object.create(null);
    } catch {
      blRosterStatsUpdateCooldowns = Object.create(null);
    }
  }
  function setBlRosterStatsUpdateCooldown(memberId, until) {
    if (!memberId) return;
    if (Number.isFinite(until) && until > Date.now()) {
      blRosterStatsUpdateCooldowns[memberId] = until;
    } else {
      delete blRosterStatsUpdateCooldowns[memberId];
    }
    persistBlRosterStatsCooldownMap();
  }
  function openBlRosterModalMemberId() {
    return document.getElementById("bl-roster-player-modal")?.dataset?.blOpenMemberId || "";
  }
  loadBlRosterStatsUpdateCooldown();
  function formatBlSeasonKd(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "\u2014";
    return n.toFixed(2);
  }
  function formatBlPercentStat(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "\u2014";
    return `${n.toFixed(1)}%`;
  }
  function blSeasonKdToneClass(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "";
    return n >= 1 ? " bl-roster-modal-stat-kd--good" : " bl-roster-modal-stat-kd--low";
  }
  function blSeasonHsToneClass(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "";
    return n >= 25 ? " bl-roster-modal-stat-hs--good" : " bl-roster-modal-stat-hs--low";
  }
  function blSeasonWrToneClass(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "";
    return n >= 48 ? " bl-roster-modal-stat-wr--good" : " bl-roster-modal-stat-wr--low";
  }
  function formatBlLastPlayed(iso) {
    if (!iso) return "\u2014";
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "\u2014";
    const diffMs = Date.now() - then;
    if (diffMs < 45_000) return "Just now";
    const min = Math.floor(diffMs / 60_000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 14) return `${day} day${day === 1 ? "" : "s"} ago`;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(then);
  }
  function blRosterStatsUpdateCooldownLeft(memberId) {
    const id = memberId || openBlRosterModalMemberId();
    if (!id) return 0;
    const until = blRosterStatsUpdateCooldowns[id];
    if (!Number.isFinite(until)) return 0;
    return Math.max(0, until - Date.now());
  }
  function blRosterStatsUpdateAriaHint(memberId) {
    const left = blRosterStatsUpdateCooldownLeft(memberId);
    if (left <= 0) return "Refresh Stats.cc data for this player";
    const sec = Math.ceil(left / 1000);
    if (sec >= 60) {
      const min = Math.ceil(sec / 60);
      return `Refresh Stats.cc data (available in ${min} minute${min === 1 ? "" : "s"})`;
    }
    return `Refresh Stats.cc data (available in ${sec} seconds)`;
  }
  function stopBlRosterStatsUpdateTimer() {
    clearInterval(blRosterStatsUpdateTimer);
    blRosterStatsUpdateTimer = null;
  }
  function syncBlRosterStatsUpdateButton() {
    const btn = document.getElementById("bl-roster-player-modal-reload");
    if (!btn) return;
    const memberId = openBlRosterModalMemberId();
    const configured = window.__cafeBlApi?.rosterStats?.configured === true;
    const cooling = memberId ? blRosterStatsUpdateCooldownLeft(memberId) > 0 : false;
    btn.disabled = cooling || !configured;
    btn.classList.toggle("bl-roster-modal-reload--cooldown", cooling);
    btn.setAttribute("aria-label", blRosterStatsUpdateAriaHint(memberId));
    if (memberId && !cooling) {
      setBlRosterStatsUpdateCooldown(memberId, 0);
    }
    if (!cooling) {
      stopBlRosterStatsUpdateTimer();
    }
  }
  function playBlRosterReloadIconSpin(btn) {
    const icon = btn?.querySelector("i");
    if (!icon) return;
    icon.classList.remove("bl-roster-modal-reload-icon--spin");
    void icon.offsetWidth;
    const onEnd = () => {
      icon.classList.remove("bl-roster-modal-reload-icon--spin");
      icon.removeEventListener("animationend", onEnd);
    };
    icon.addEventListener("animationend", onEnd);
    icon.classList.add("bl-roster-modal-reload-icon--spin");
  }
  function startBlRosterStatsUpdateTimer() {
    if (blRosterStatsUpdateTimer) return;
    syncBlRosterStatsUpdateButton();
    blRosterStatsUpdateTimer = setInterval(() => {
      syncBlRosterStatsUpdateButton();
      if (blRosterStatsUpdateCooldownLeft() <= 0) stopBlRosterStatsUpdateTimer();
    }, 500);
  }
  async function requestBlRosterStatsForceUpdate() {
    const modal = document.getElementById("bl-roster-player-modal");
    const memberId = modal?.dataset?.blOpenMemberId;
    if (!memberId) return;
    const left = blRosterStatsUpdateCooldownLeft(memberId);
    if (left > 0) return;
    const btn = document.getElementById("bl-roster-player-modal-reload");
    playBlRosterReloadIconSpin(btn);
    setBlRosterStatsUpdateCooldown(memberId, Date.now() + BL_ROSTER_STATS_UPDATE_COOLDOWN_MS);
    startBlRosterStatsUpdateTimer();
    btn?.setAttribute("aria-busy", "true");
    try {
      await window.refreshCafeBlApiState?.({ forceRosterMemberId: memberId });
      refreshOpenBlRosterPlayerModal();
      renderBlackListedRoster();
    } catch {
      window.CafeCore?.Toast?.show?.("Could not refresh roster stats");
    } finally {
      btn?.removeAttribute("aria-busy");
    }
  }
  function renderBlModalExtraStatsRow(member) {
    const live = liveStatsForMember(member.id);
    const kdRaw = live?.seasonKd;
    const kd = formatBlSeasonKd(kdRaw);
    const kdTone = blSeasonKdToneClass(kdRaw);
    const lastOn = formatBlLastPlayed(live?.lastPlayedAt);
    return `
            <div class="bl-roster-modal-extra-stats" role="group" aria-label="Season stats">
                <div class="bl-roster-modal-peak-rail-inner bl-roster-modal-stat-cell">
                    <p class="bl-roster-modal-peak-label">KD</p>
                    <p class="bl-roster-modal-peak-value bl-roster-modal-stat-kd${kdTone}">${escapeHtml(kd)}</p>
                </div>
                <div class="bl-roster-modal-peak-rail-inner bl-roster-modal-stat-cell">
                    <p class="bl-roster-modal-peak-label">Last on</p>
                    <p class="bl-roster-modal-peak-value bl-roster-modal-stat-last">${escapeHtml(lastOn)}</p>
                </div>
            </div>`;
  }
  function renderBlModalPeakPerfRow(member) {
    const live = liveStatsForMember(member.id);
    const wrRaw = live?.seasonWinRate;
    const wr = formatBlPercentStat(wrRaw);
    const wrTone = blSeasonWrToneClass(wrRaw);
    const hsRaw = live?.seasonHeadshotPct;
    const hs = formatBlPercentStat(hsRaw);
    const hsTone = blSeasonHsToneClass(hsRaw);
    return `
            <div class="bl-roster-modal-peak-extra-stats" role="group" aria-label="Season win rate and headshot percentage">
                <div class="bl-roster-modal-peak-rail-inner bl-roster-modal-stat-cell">
                    <p class="bl-roster-modal-peak-label">WR</p>
                    <p class="bl-roster-modal-peak-value bl-roster-modal-stat-wr${wrTone}">${escapeHtml(wr)}</p>
                </div>
                <div class="bl-roster-modal-peak-rail-inner bl-roster-modal-stat-cell">
                    <p class="bl-roster-modal-peak-label">HS</p>
                    <p class="bl-roster-modal-peak-value bl-roster-modal-stat-hs${hsTone}">${escapeHtml(hs)}</p>
                </div>
            </div>`;
  }
  function rankRailCell(member, heading, valueText, iconLabel) {
    if (!valueText) return "";
    const iconUrl = peakRankIconUrl(member, iconLabel || valueText);
    const iconMarkup = iconUrl
      ? `<img class="bl-roster-modal-peak-icon" src="${escapeHtml(iconUrl)}" alt="" width="56" height="56" loading="lazy" decoding="async">`
      : "";
    const tierSource =
      iconLabel ||
      String(valueText).split("\xB7")[0].trim();
    const tier = rankTierFromLabel(tierSource);
    const tierClass = tier ? ` bl-roster-modal-peak-value--${tier}` : "";
    return `
            <div class="bl-roster-modal-peak-rail-inner bl-roster-modal-rank-cell">
                ${iconMarkup}
                <p class="bl-roster-modal-peak-label">${escapeHtml(heading)}</p>
                <p class="bl-roster-modal-peak-value${tierClass}">${escapeHtml(valueText)}</p>
            </div>`;
  }
  function renderPeakRankRail(member) {
    member = memberForDisplay(member);
    const peakEl = document.getElementById("bl-roster-player-modal-peak");
    if (!peakEl) return;
    const peakLabel = formatPeakRank(member);
    const current = currentRankDisplay(member);
    const hasPeak = Boolean(peakLabel);
    const hasCurrent = Boolean(current.text);
    const statsConfigured = window.__cafeBlApi?.rosterStats?.configured === true;
    if (!hasPeak && !hasCurrent && !statsConfigured) {
      peakEl.hidden = true;
      peakEl.innerHTML = "";
      return;
    }
    const currentCell = hasCurrent
      ? rankRailCell(member, "Current rank", current.text, current.iconLabel)
      : rankRailCell(member, "Current rank", "\u2014", "");
    const peakCell = hasPeak
      ? rankRailCell(member, "Peak rank", peakLabel, peakRankRawLabel(member))
      : rankRailCell(member, "Peak rank", "\u2014", "");
    peakEl.hidden = false;
    peakEl.innerHTML = `
            <div class="bl-roster-modal-rank-stack">
                <div class="bl-roster-modal-current-stack">
                    ${currentCell}
                    ${renderBlModalExtraStatsRow(member)}
                </div>
                <div class="bl-roster-modal-peak-stack">
                    ${peakCell}
                    ${renderBlModalPeakPerfRow(member)}
                </div>
            </div>`;
    bindPeakRankIconFallback(peakEl);
    syncBlRosterStatsUpdateButton();
    if (blRosterStatsUpdateCooldownLeft(member.id) > 0) startBlRosterStatsUpdateTimer();
  }
  function renderPlayerModalContent(member) {
    const notes = member.notes || member.more || "";
    const notesBlock = notes ? `<div class="bl-roster-modal-notes mt-4 pt-4 border-t border-matte-800 text-slate-400 text-xs tracking-wide leading-relaxed">${escapeHtml(notes)}</div>` : "";
    return `
            ${renderMemberOps(member)}
            ${notesBlock}`;
  }
  let blRosterModalBound = false;
  let blRosterModalCloseTimer = null;
  const BL_ROSTER_MODAL_CLOSE_MS = 150;
  let blRosterModalHeadTipTarget = null;
  function ensureBlRosterModalHeadTooltip() {
    let tip = document.getElementById("bl-roster-modal-head-tooltip");
    if (tip) return tip;
    tip = document.createElement("div");
    tip.id = "bl-roster-modal-head-tooltip";
    tip.className = "cafe-ui-tooltip bl-roster-modal-head-tooltip tooltip-closed hidden";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-hidden", "true");
    document.body.appendChild(tip);
    return tip;
  }
  function hideBlRosterModalHeadTooltip() {
    const tip = document.getElementById("bl-roster-modal-head-tooltip");
    if (!tip) return;
    blRosterModalHeadTipTarget = null;
    window.hideCafeTooltip?.(tip);
  }
  function blRosterModalHeadActionTooltipLabel(el) {
    if (!el) return "";
    const label = el.getAttribute("aria-label");
    return label ? String(label).trim() : "";
  }
  function positionBlRosterModalHeadActionTooltip(btn, text) {
    const tip = ensureBlRosterModalHeadTooltip();
    const label = String(text || "").trim();
    if (!btn || !label) {
      hideBlRosterModalHeadTooltip();
      return;
    }
    const panel = btn.closest(".bl-roster-player-modal-panel");
    if (!panel) {
      hideBlRosterModalHeadTooltip();
      return;
    }
    tip.textContent = label;
    const layout = () => {
      const panelRect = panel.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = 0.25 * rootPx;
      tip.style.left = `${btnRect.left + btnRect.width / 2}px`;
      tip.style.top = `${panelRect.top - gap}px`;
      tip.style.transform = "translate(-50%, -100%)";
    };
    tip.setAttribute("aria-hidden", "false");
    blRosterModalHeadTipTarget = btn;
    window.revealCafeTooltip?.(tip, layout);
  }
  function bindBlRosterModalHeadTooltipButtons() {
    const modal = document.getElementById("bl-roster-player-modal");
    if (!modal) return;
    modal.querySelectorAll(".bl-roster-modal-head-actions .topbar-action-btn").forEach((el) => {
      if (el.id === "bl-roster-player-modal-close") return;
      if (el.dataset.blHeadTipBound === "1") return;
      el.dataset.blHeadTipBound = "1";
      el.addEventListener("mouseenter", () => {
        const label = blRosterModalHeadActionTooltipLabel(el);
        if (!label) return;
        positionBlRosterModalHeadActionTooltip(el, label);
      });
      el.addEventListener("mouseleave", () => {
        if (blRosterModalHeadTipTarget === el) hideBlRosterModalHeadTooltip();
      });
    });
    if (typeof window.scanModalCloseTooltipButtons === "function") {
      window.scanModalCloseTooltipButtons(modal);
    }
  }
  function initBlRosterModalHeadActionTooltips() {
    const modal = document.getElementById("bl-roster-player-modal");
    if (!modal) return;
    bindBlRosterModalHeadTooltipButtons();
    if (modal.dataset.blHeadTipsBound === "1") return;
    modal.dataset.blHeadTipsBound = "1";
    window.addEventListener("resize", () => {
      if (!blRosterModalHeadTipTarget) return;
      const label = blRosterModalHeadActionTooltipLabel(blRosterModalHeadTipTarget);
      if (!label) return;
      positionBlRosterModalHeadActionTooltip(blRosterModalHeadTipTarget, label);
    });
    window.addEventListener(
      "scroll",
      () => {
        if (!blRosterModalHeadTipTarget) return;
        const label = blRosterModalHeadActionTooltipLabel(blRosterModalHeadTipTarget);
        if (!label) return;
        positionBlRosterModalHeadActionTooltip(blRosterModalHeadTipTarget, label);
      },
      true
    );
  }
  function portalModalToBody() {
    const modal = document.getElementById("bl-roster-player-modal");
    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  }
  function syncBlRosterPlayerModalLayout() {
    const modal = document.getElementById("bl-roster-player-modal");
    if (!modal?.classList.contains("is-open")) return;
    const stack = modal.querySelector(".bl-roster-modal-rank-stack");
    if (stack) void stack.offsetWidth;
    void modal.offsetWidth;
  }
  let blRosterModalLayoutSyncBound = false;
  function bindBlRosterModalLayoutSync() {
    if (blRosterModalLayoutSyncBound) return;
    blRosterModalLayoutSyncBound = true;
    const sidebar = document.getElementById("sidebar");
    const run = () => syncBlRosterPlayerModalLayout();
    sidebar?.addEventListener("transitionend", (event) => {
      if (event.propertyName !== "width") return;
      run();
    });
    window.addEventListener("resize", run);
  }
  function setBlRosterPlayerModalOpen(open) {
    const modal = document.getElementById("bl-roster-player-modal");
    const closeBtn = document.getElementById("bl-roster-player-modal-close");
    if (!modal) return;
    clearTimeout(blRosterModalCloseTimer);
    blRosterModalCloseTimer = null;
    if (open) {
      ensureBlRosterModalStatsRail();
      portalModalToBody();
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("bl-roster-player-modal-open");
      void modal.offsetHeight;
      modal.classList.add("is-open");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => syncBlRosterPlayerModalLayout());
      });
      closeBtn?.focus();
      return;
    }
    hideBlRosterModalHeadTooltip();
    if (typeof window.hideModalCloseTooltip === "function") window.hideModalCloseTooltip();
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    blRosterModalCloseTimer = setTimeout(() => {
      modal.classList.add("hidden");
      document.body.classList.remove("bl-roster-player-modal-open");
      blRosterModalCloseTimer = null;
    }, BL_ROSTER_MODAL_CLOSE_MS);
  }
  function refreshOpenBlRosterPlayerModal() {
    const modal = document.getElementById("bl-roster-player-modal");
    if (!modal?.classList.contains("is-open")) return;
    const memberId = modal.dataset.blOpenMemberId;
    if (!memberId) return;
    const member = memberForDisplay(findMemberById(memberId));
    if (!member) return;
    renderTeamRankRail(member);
    renderBestMapsRail(member);
    renderPeakRankRail(member);
    renderStatsCcRail(member);
  }
  function openBlRosterPlayerModal(memberId) {
    const member = memberForDisplay(findMemberById(memberId));
    if (!member) return;
    const modal = document.getElementById("bl-roster-player-modal");
    const title = document.getElementById("bl-roster-player-modal-title");
    const roleEl = document.getElementById("bl-roster-player-modal-role");
    const body = document.getElementById("bl-roster-player-modal-body");
    if (!modal || !title || !body) return;
    title.innerHTML = formatPlayerName(member.name || "Player");
    if (roleEl) {
      const role = member.role || "";
      roleEl.innerHTML = role ? formatRoleDisplay(role) : "";
      roleEl.hidden = !role;
    }
    body.innerHTML = renderPlayerModalContent(member);
    modal.dataset.blOpenMemberId = memberId;
    renderTeamRankRail(member);
    renderBestMapsRail(member);
    renderPeakRankRail(member);
    renderStatsCcRail(member);
    syncBlRosterStatsUpdateButton();
    if (blRosterStatsUpdateCooldownLeft(memberId) > 0) startBlRosterStatsUpdateTimer();
    bindOperatorIconFallback(body);
    setBlRosterPlayerModalOpen(true);
  }
  function initBlRosterPlayerModal() {
    const modal = document.getElementById("bl-roster-player-modal");
    const backdrop = document.getElementById("bl-roster-player-modal-backdrop");
    const closeBtn = document.getElementById("bl-roster-player-modal-close");
    if (!modal) return;
    ensureBlRosterModalStatsRail();
    syncBlRosterStatsUpdateButton();
    portalModalToBody();
    initBlRosterModalHeadActionTooltips();
    bindBlRosterModalLayoutSync();
    if (blRosterModalBound) return;
    blRosterModalBound = true;
    const close = () => setBlRosterPlayerModalOpen(false);
    backdrop?.addEventListener("click", close);
    closeBtn?.addEventListener("click", close);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const liveModal = document.getElementById("bl-roster-player-modal");
      if (!liveModal?.classList.contains("is-open")) return;
      close();
    });
    modal.addEventListener("click", (event) => {
      const btn = event.target.closest?.("#bl-roster-player-modal-reload");
      if (!btn || !modal.contains(btn)) return;
      event.preventDefault();
      void requestBlRosterStatsForceUpdate();
    });
    window.addEventListener("cafe-bl-api-updated", () => {
      clearBlLiveTeamRankCache();
      if (!modal.classList.contains("is-open")) return;
      refreshOpenBlRosterPlayerModal();
    });
  }
  function bindBlRosterMoreButtons() {
    const page = document.getElementById("page-black-listed");
    if (!page || page.dataset.blMoreBound === "1") return;
    page.dataset.blMoreBound = "1";
    page.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-bl-member-id]");
      if (!btn || !page.contains(btn)) return;
      const memberId = btn.getAttribute("data-bl-member-id");
      if (!memberId) return;
      openBlRosterPlayerModal(memberId);
    });
  }
  function renderBlackListedRoster() {
    const host = document.getElementById("black-listed-roster");
    const subsHost = document.getElementById("black-listed-subs");
    const subsSection = document.getElementById("black-listed-subs-section");
    if (!host) return;
    clearBlLiveTeamRankCache();
    const roster = getRoster();
    const starters = roster.filter((member) => !member.substitute);
    const subs = roster.filter((member) => member.substitute);
    if (!starters.length && !subs.length) {
      host.innerHTML = '<p class="text-sm text-slate-500 tracking-wide text-center col-span-full">Roster coming soon.</p>';
      if (subsSection) subsSection.classList.add("hidden");
      return;
    }
    host.innerHTML = starters.length ? starters.map((member) => renderMemberCard(member)).join("") : '<p class="text-sm text-slate-500 tracking-wide text-center col-span-full">Starters coming soon.</p>';
    if (subsHost && subsSection) {
      if (subs.length) {
        subsSection.classList.remove("hidden");
        subsHost.innerHTML = subs.map((member) => renderMemberCard(member)).join("");
      } else {
        subsSection.classList.add("hidden");
        subsHost.innerHTML = "";
      }
    }
    bindOperatorIconFallback(host);
    bindOperatorIconFallback(subsHost);
    bindBlRosterAvatarFallback(host);
    bindBlRosterAvatarFallback(subsHost);
  }
  function loadBlScrimRecord() {
    if (typeof window.isCafeScrimWsConnected === "function" && !window.isCafeScrimWsConnected()) {
      return { wins: 0, losses: 0 };
    }
    const s = window.__cafeBlApi?.scrim;
    if (s) {
      return {
        wins: Math.max(0, Math.round(Number(s.wins) || 0)),
        losses: Math.max(0, Math.round(Number(s.losses) || 0))
      };
    }
    return { wins: 0, losses: 0 };
  }
  let blScrimSaveQueued = null;
  let blScrimSaveRunning = false;
  async function saveBlScrimRecord(record) {
    if (typeof window.patchCafeScrimRecord !== "function") {
      return false;
    }
    await window.patchCafeScrimRecord(record);
    return true;
  }
  async function flushBlScrimSaveQueue() {
    if (blScrimSaveRunning) return;
    const record = blScrimSaveQueued;
    if (!record) return;
    blScrimSaveRunning = true;
    const snapshot = { wins: record.wins, losses: record.losses };
    blScrimSaveQueued = null;
    try {
      const ok = await saveBlScrimRecord(snapshot);
      if (!ok) throw new Error("save_failed");
    } catch {
      const loaded = loadBlScrimRecord();
      const keepOptimistic =
        blScrimSaveQueued &&
        (blScrimSaveQueued.wins !== loaded.wins ||
          blScrimSaveQueued.losses !== loaded.losses);
      if (!keepOptimistic) {
        blScrimRecordState = loaded;
        paintBlScrimRecord();
      }
      window.CafeCore?.Toast?.show?.("Could not update scrim record");
    } finally {
      blScrimSaveRunning = false;
      if (blScrimSaveQueued) {
        void flushBlScrimSaveQueue();
      }
    }
  }
  function queueBlScrimSave(record) {
    blScrimSaveQueued = {
      wins: Math.max(0, Math.round(Number(record?.wins) || 0)),
      losses: Math.max(0, Math.round(Number(record?.losses) || 0))
    };
    void flushBlScrimSaveQueue();
  }
  function canEditBlScrimCounter() {
    if (typeof window.isCafeScrimWsConnected === "function" && !window.isCafeScrimWsConnected()) {
      return false;
    }
    return typeof window.canEditBlScrimRecord === "function" && window.canEditBlScrimRecord();
  }
  let blScrimRecordState = { wins: 0, losses: 0 };
  let blScrimDisplayed = { wins: null, losses: null };
  const BL_SCRIM_DIGIT_TRANSITION = "transform 150ms ease-out";
  function scrimDigitMotionEnabled() {
    return !document.documentElement.classList.contains("reduce-motion");
  }
  function buildBlScrimDigitStrip() {
    const strip = document.createElement("span");
    strip.className = "bl-scrim-digit-strip";
    for (let d = 0; d <= 9; d += 1) {
      const digit = document.createElement("span");
      digit.className = "bl-scrim-digit";
      digit.textContent = String(d);
      strip.appendChild(digit);
    }
    return strip;
  }
  function ensureBlScrimDigitGroup(container, value) {
    const text = String(Math.max(0, Math.round(Number(value) || 0)));
    let group = container.querySelector(".bl-scrim-digit-group");
    if (!group) {
      group = document.createElement("span");
      group.className = "bl-scrim-digit-group";
      group.setAttribute("aria-hidden", "true");
      container.replaceChildren(group);
    }
    while (group.children.length < text.length) {
      const slot = document.createElement("span");
      slot.className = "bl-scrim-digit-slot";
      slot.appendChild(buildBlScrimDigitStrip());
      group.appendChild(slot);
    }
    while (group.children.length > text.length) {
      group.lastElementChild?.remove();
    }
    return { group, text };
  }
  function blScrimDigitAtRight(text, posFromRight) {
    const idx = text.length - 1 - posFromRight;
    return idx >= 0 ? text.charAt(idx) : null;
  }
  function setBlScrimDigitSlot(slot, digitChar, prevDigitChar, animate, delayMs) {
    const strip = slot.querySelector(".bl-scrim-digit-strip");
    if (!strip) return;
    const d = Math.max(0, Math.min(9, Number(digitChar) || 0));
    const hasPrev =
      prevDigitChar !== null &&
      prevDigitChar !== undefined &&
      prevDigitChar !== "";
    const fromD = hasPrev
      ? Math.max(0, Math.min(9, Number(prevDigitChar) || 0))
      : d;
    const shouldAnimate =
      animate && scrimDigitMotionEnabled() && (hasPrev ? fromD !== d : false);
    if (!shouldAnimate) {
      strip.style.transition = "none";
      strip.style.transitionDelay = "0ms";
      strip.style.transform = `translate3d(0, calc(${-d} * var(--bl-scrim-digit-step, 1em)), 0)`;
      void strip.offsetHeight;
      strip.style.transition = BL_SCRIM_DIGIT_TRANSITION;
      return;
    }
    const rollFrom = hasPrev ? fromD : 0;
    const toTransform = `translate3d(0, calc(${-d} * var(--bl-scrim-digit-step, 1em)), 0)`;
    const fromTransform = `translate3d(0, calc(${-rollFrom} * var(--bl-scrim-digit-step, 1em)), 0)`;
    strip.style.transition = "none";
    strip.style.transitionDelay = "0ms";
    strip.style.transform = fromTransform;
    void strip.offsetHeight;
    window.requestAnimationFrame(() => {
      if (!slot.isConnected) return;
      const live = slot.querySelector(".bl-scrim-digit-strip");
      if (!live) return;
      live.style.transition = "none";
      live.style.transitionDelay = "0ms";
      live.style.transform = fromTransform;
      void live.offsetHeight;
      window.requestAnimationFrame(() => {
        if (!live.isConnected) return;
        live.style.transition = BL_SCRIM_DIGIT_TRANSITION;
        live.style.transitionDelay = `${delayMs}ms`;
        live.style.transform = toTransform;
      });
    });
  }
  function paintBlScrimAnimatedNumber(container, value, previousValue) {
    const motion = scrimDigitMotionEnabled();
    const animate =
      motion && previousValue !== null && previousValue !== value;
    const { text } = ensureBlScrimDigitGroup(container, value);
    const slots = container.querySelectorAll(".bl-scrim-digit-slot");
    const prevText =
      previousValue === null
        ? text
        : String(Math.max(0, Math.round(Number(previousValue) || 0)));
    const maxLen = Math.max(text.length, prevText.length);
    text.split("").forEach((ch, index) => {
      const posFromRight = text.length - 1 - index;
      const prevCh = blScrimDigitAtRight(prevText, posFromRight);
      const slotAnimate = animate && prevText !== text;
      const delay = slotAnimate ? (maxLen - 1 - index) * 45 : 0;
      const rollInNew = animate && prevCh === null;
      setBlScrimDigitSlot(
        slots[index],
        ch,
        rollInNew ? "0" : prevCh,
        slotAnimate || rollInNew,
        delay
      );
    });
    container.setAttribute("aria-label", text);
  }
  function paintBlScrimRecord() {
    const winsEl = document.getElementById("bl-scrim-wins");
    const lossesEl = document.getElementById("bl-scrim-losses");
    if (!winsEl || !lossesEl) return;
    paintBlScrimAnimatedNumber(winsEl, blScrimRecordState.wins, blScrimDisplayed.wins);
    paintBlScrimAnimatedNumber(lossesEl, blScrimRecordState.losses, blScrimDisplayed.losses);
    blScrimDisplayed = { wins: blScrimRecordState.wins, losses: blScrimRecordState.losses };
  }
  function blScrimRecordMatchesDisplayed(record) {
    return (
      record.wins === blScrimDisplayed.wins &&
      record.losses === blScrimDisplayed.losses
    );
  }
  function loadedScrimIsStale(loaded) {
    if (!blScrimSaveRunning && !blScrimSaveQueued) return false;
    return (
      loaded.wins !== blScrimRecordState.wins ||
      loaded.losses !== blScrimRecordState.losses
    );
  }
  function applyBlScrimRecordFromStore() {
    const loaded = loadBlScrimRecord();
    if (loadedScrimIsStale(loaded)) {
      window.syncBlScrimEditControls?.();
      return;
    }
    blScrimRecordState = loaded;
    if (blScrimDisplayed.wins === null && blScrimDisplayed.losses === null) {
      paintBlScrimRecord();
    } else if (!blScrimRecordMatchesDisplayed(loaded)) {
      paintBlScrimRecord();
    }
    window.syncBlScrimEditControls?.();
  }
  async function refreshBlScrimFromServer() {
    if (!document.getElementById("bl-scrim-counter")) return;
    if (!document.getElementById("page-black-listed")) return;
    await window.refreshCafeBlApiState?.();
    if (window.isCafeScrimWsConnected?.()) {
      applyBlScrimRecordFromStore();
    }
    if (typeof window.syncTopBarServerWakeup === "function") {
      window.syncTopBarServerWakeup();
    }
    if (document.getElementById("black-listed-roster")) {
      renderBlackListedRoster();
      refreshOpenBlRosterPlayerModal();
    }
  }
  function stripScrimAdjustControls() {
    document.querySelectorAll(".bl-scrim-counter-adjust").forEach((el) => el.remove());
    document.querySelectorAll("#bl-scrim-counter").forEach((section) => {
      section.classList.remove("bl-scrim-counter--editable");
      section.querySelectorAll("[data-bl-scrim-edit]").forEach((wrap) => {
        wrap.hidden = true;
      });
    });
  }
  function createScrimAdjustButton(key, delta) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "bl-scrim-counter-adjust topbar-action-btn ui-interactive w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-redneon-500 hover:bg-matte-800 relative shrink-0";
    btn.dataset.scrimDelta = `${key},${delta}`;
    btn.setAttribute(
      "aria-label",
      delta > 0 ? `Increase scrim ${key}` : `Decrease scrim ${key}`
    );
    btn.innerHTML = delta > 0
      ? '<i class="fa-solid fa-plus text-xs" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-minus text-xs" aria-hidden="true"></i>';
    return btn;
  }
  function scrimStackHasControls(stack, key) {
    return (
      stack.querySelector(`[data-scrim-delta="${key},1"]`) &&
      stack.querySelector(`[data-scrim-delta="${key},-1"]`)
    );
  }
  window.syncBlScrimEditControls = function syncBlScrimEditControls() {
    const section = document.getElementById("bl-scrim-counter");
    if (!section) return;
    if (!canEditBlScrimCounter()) {
      stripScrimAdjustControls();
      return;
    }
    section.classList.add("bl-scrim-counter--editable");
    section.querySelectorAll("[data-bl-scrim-edit]").forEach((stack) => {
      const key = stack.dataset.blScrimEdit;
      if (key !== "wins" && key !== "losses") return;
      stack.hidden = false;
      if (scrimStackHasControls(stack, key)) return;
      stack
        .querySelectorAll(".bl-scrim-counter-adjust")
        .forEach((el) => el.remove());
      stack.appendChild(createScrimAdjustButton(key, 1));
      stack.appendChild(createScrimAdjustButton(key, -1));
    });
  };
  function onBlScrimWsStatus(event) {
    if (!document.getElementById("bl-scrim-counter")) return;
    if (event?.detail?.connected) {
      applyBlScrimRecordFromStore();
    } else {
      blScrimRecordState = { wins: 0, losses: 0 };
      paintBlScrimRecord();
      stripScrimAdjustControls();
    }
    window.syncBlScrimEditControls?.();
  }
  function initBlScrimCounter() {
    const section = document.getElementById("bl-scrim-counter");
    if (!section) return;
    if (!document.getElementById("bl-scrim-wins") || !document.getElementById("bl-scrim-losses")) return;
    if (window.isCafeScrimWsConnected?.()) {
      applyBlScrimRecordFromStore();
    } else {
      blScrimRecordState = { wins: 0, losses: 0 };
      paintBlScrimRecord();
    }
    if (section.dataset.scrimBound !== "1") {
      section.dataset.scrimBound = "1";
      section.addEventListener("click", (event) => {
        const btn = event.target.closest?.("[data-scrim-delta]");
        if (!btn) return;
        if (!canEditBlScrimCounter()) return;
        const parts = String(btn.dataset.scrimDelta || "").split(",");
        const key = parts[0];
        const delta = Number(parts[1]);
        if (key !== "wins" && key !== "losses") return;
        if (!Number.isFinite(delta)) return;
        if (delta < 0 && blScrimRecordState[key] <= 0) return;
        const next = {
          ...blScrimRecordState,
          [key]: Math.max(0, blScrimRecordState[key] + delta)
        };
        if (next[key] === blScrimRecordState[key]) return;
        blScrimRecordState = next;
        paintBlScrimRecord();
        queueBlScrimSave(next);
      });
      window.addEventListener("cafe-bl-api-updated", () => {
        if (!document.getElementById("bl-scrim-counter")) return;
        if (!document.getElementById("page-black-listed")) return;
        clearBlLiveTeamRankCache();
        if (window.isCafeScrimWsConnected?.()) {
          applyBlScrimRecordFromStore();
        }
        if (document.getElementById("black-listed-roster")) {
          renderBlackListedRoster();
          refreshOpenBlRosterPlayerModal();
        }
      });
      window.addEventListener("cafe-scrim-ws-status", onBlScrimWsStatus);
    }
  }
  window.teardownBlackListedPage = function teardownBlackListedPage() {
    clearTimeout(blRosterModalCloseTimer);
    blRosterModalCloseTimer = null;
    document.querySelectorAll("#bl-roster-player-modal").forEach((el) => el.remove());
    document.body.classList.remove("bl-roster-player-modal-open");
    blRosterModalBound = false;
    hideBlRosterModalHeadTooltip();
    document.getElementById("bl-roster-modal-head-tooltip")?.remove();
    blScrimDisplayed = { wins: null, losses: null };
    blScrimSaveQueued = null;
    blScrimSaveRunning = false;
    window.syncTopBarServerWakeup?.();
  };
  window.initBlackListedPage = function initBlackListedPage() {
    loadBlRosterStatsUpdateCooldown();
    if (openBlRosterModalMemberId() && blRosterStatsUpdateCooldownLeft() > 0) {
      startBlRosterStatsUpdateTimer();
    }
    initBlRosterPlayerModal();
    bindBlRosterMoreButtons();
    renderBlackListedRoster();
    initBlScrimCounter();
    window.syncTopBarServerWakeup?.();
    window.connectCafeScrimWebSocket?.();
    void refreshBlScrimFromServer();
  };
})();
