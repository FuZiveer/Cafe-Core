import crypto from "node:crypto";
import { applyCors, sendJson, parseCookies, setCookie, getSessionUser, isSiteStatsAdminUser } from "./discord-auth.mjs";
import { getSiteStatsSummary, recordPageView } from "./site-stats-store.mjs";

const SITE_VISITOR_COOKIE = "cafe_site_vid";

function randomVisitorId() {
  return crypto.randomBytes(16).toString("base64url");
}

function parseQueryDays(url) {
  const d = url.searchParams.get("days");
  const n = Math.floor(Number(d));
  if (Number.isFinite(n) && n > 0) return n;
  return 14;
}

export async function handleSiteStatsRequest(req, res, url, cfg) {
  const pathname = url.pathname;
  if (pathname === "/api/site-stats/record" && req.method === "POST") {
    applyCors(req, res, cfg);
    const cookies = parseCookies(req.headers.cookie);
    let vid = cookies[SITE_VISITOR_COOKIE];
    const opts = {
      secure: cfg.cookieSecure,
      sameSite: cfg.crossSiteCookies ? "None" : "Lax",
      partitioned: cfg.crossSiteCookies,
      maxAge: 365 * 24 * 60 * 60,
      httpOnly: true,
      path: "/"
    };
    if (!vid || String(vid).length < 8) {
      vid = randomVisitorId();
      setCookie(res, SITE_VISITOR_COOKIE, vid, opts);
    }
    const now = new Date();
    recordPageView(now, now.getUTCHours());
    sendJson(res, 200, { ok: true });
    return true;
  }
  if (pathname === "/api/site-stats/summary" && req.method === "GET") {
    applyCors(req, res, cfg);
    const user = getSessionUser(req);
    if (!isSiteStatsAdminUser(user)) {
      sendJson(res, 403, { error: "forbidden" });
      return true;
    }
    const days = parseQueryDays(url);
    const summary = getSiteStatsSummary({ days });
    sendJson(res, 200, summary);
    return true;
  }
  return false;
}
