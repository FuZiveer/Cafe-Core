import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DISCORD_AUTHORIZE = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token';
const DISCORD_USER = 'https://discord.com/api/users/@me';

const SESSION_COOKIE = 'cafe_core_session';
const STATE_COOKIE = 'cafe_oauth_state';
const RETURN_COOKIE = 'cafe_oauth_return';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

let envLoaded = false;

function loadEnvFile() {
    if (envLoaded) return;
    envLoaded = true;
    const envPath = path.join(ROOT, '.env');
    if (!fs.existsSync(envPath)) return;
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"'))
            || (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (process.env[key] == null) process.env[key] = val;
    }
}

export function getAuthConfig() {
    loadEnvFile();
    const clientId = process.env.DISCORD_CLIENT_ID?.trim() || '';
    const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim() || '';
    const sessionSecret = process.env.SESSION_SECRET?.trim() || '';
    const port = Number(process.env.PORT || 8787);
    const redirectUri =
        process.env.DISCORD_REDIRECT_URI?.trim()
        || `http://127.0.0.1:${port}/auth/discord/callback`;
    const publicOrigin = process.env.PUBLIC_ORIGIN?.trim().replace(/\/$/, '') || `http://127.0.0.1:${port}`;
    const cookieSecure = publicOrigin.startsWith('https://');
    const { corsOrigins, extraOrigins } = parseCorsOrigins(process.env.CORS_ORIGINS, publicOrigin);
    const crossSiteCookies = cookieSecure && extraOrigins.length > 0;
    return {
        clientId,
        clientSecret,
        sessionSecret,
        redirectUri,
        publicOrigin,
        cookieSecure,
        corsOrigins,
        crossSiteCookies,
        configured: Boolean(clientId && clientSecret && sessionSecret),
    };
}

function parseCorsOrigins(raw, publicOrigin) {
    const extraOrigins = [];
    for (const part of (raw || '').split(',')) {
        const trimmed = part.trim().replace(/\/$/, '');
        if (!trimmed) continue;
        try {
            extraOrigins.push(new URL(trimmed).origin);
        } catch {
            /* ignore bad entries */
        }
    }
    const set = new Set(extraOrigins);
    if (publicOrigin) {
        try {
            set.add(new URL(publicOrigin).origin);
        } catch {
            /* ignore */
        }
    }
    return { corsOrigins: [...set], extraOrigins };
}

function appendAuthQuery(url, code) {
    try {
        const u = new URL(url);
        u.searchParams.set('auth', code);
        return u.toString();
    } catch {
        return url;
    }
}

function isAllowedReturnTo(returnTo, cfg) {
    if (!returnTo) return false;
    let target;
    try {
        target = new URL(returnTo);
    } catch {
        return false;
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;
    return cfg.corsOrigins.includes(target.origin);
}

function corsOriginForRequest(req, cfg) {
    const origin = req.headers.origin;
    if (!origin || !cfg.corsOrigins.includes(origin)) return null;
    return origin;
}

function applyCors(req, res, cfg) {
    const origin = corsOriginForRequest(req, cfg);
    if (!origin) return false;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    return true;
}

function handleAuthOptions(req, res, cfg) {
    if (req.method !== 'OPTIONS') return false;
    const origin = corsOriginForRequest(req, cfg);
    if (!origin) return false;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    res.writeHead(204);
    res.end();
    return true;
}

function parseCookies(header) {
    const out = Object.create(null);
    if (!header) return out;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        const key = part.slice(0, idx).trim();
        const val = decodeURIComponent(part.slice(idx + 1).trim());
        out[key] = val;
    }
    return out;
}

function signSession(payload, secret) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
}

function verifySession(token, secret) {
    if (!token || !secret) return null;
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const json = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!json || typeof json !== 'object') return null;
        if (typeof json.exp !== 'number' || json.exp < Date.now()) return null;
        return json.user ?? null;
    } catch {
        return null;
    }
}

function setCookie(
    res,
    name,
    value,
    { maxAge, httpOnly = true, path = '/', secure = false, sameSite = 'Lax', partitioned = false } = {},
) {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
    if (httpOnly) parts.push('HttpOnly');
    if (secure) parts.push('Secure');
    if (partitioned) parts.push('Partitioned');
    if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);
    const prev = res.getHeader('Set-Cookie');
    const next = Array.isArray(prev) ? [...prev, parts.join('; ')] : prev ? [prev, parts.join('; ')] : [parts.join('; ')];
    res.setHeader('Set-Cookie', next);
}

function clearCookie(res, name, { secure = false, sameSite = 'Lax', partitioned = false } = {}) {
    setCookie(res, name, '', { maxAge: 0, secure, sameSite, partitioned });
}

function cookieOpts(cfg) {
    const crossSite = cfg.crossSiteCookies;
    return {
        secure: cfg.cookieSecure,
        sameSite: crossSite ? 'None' : 'Lax',
        partitioned: crossSite,
    };
}

function postLoginRedirect(req, cfg) {
    const cookies = parseCookies(req.headers.cookie);
    const returnTo = cookies[RETURN_COOKIE];
    if (returnTo && isAllowedReturnTo(returnTo, cfg)) return returnTo;
    return `${cfg.publicOrigin}/`;
}

function sendJson(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

function redirect(res, location) {
    res.writeHead(302, { Location: location });
    res.end();
}

function discordAvatarUrl(user) {
    if (!user?.id) return '';
    if (user.avatar) {
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
    }
    const index = Number((BigInt(user.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function normalizeUser(raw) {
    if (!raw?.id) return null;
    const username = raw.global_name || raw.username || 'Discord user';
    return {
        id: String(raw.id),
        username: String(raw.username || ''),
        globalName: raw.global_name ? String(raw.global_name) : '',
        displayName: username,
        avatarUrl: discordAvatarUrl(raw),
    };
}

async function readFormBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}

async function exchangeCode(code, cfg) {
    const body = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: cfg.redirectUri,
    });
    const res = await fetch(DISCORD_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!res.ok) throw new Error('token_exchange_failed');
    const data = await res.json();
    if (!data.access_token) throw new Error('no_access_token');
    return data.access_token;
}

async function fetchDiscordUser(accessToken) {
    const res = await fetch(DISCORD_USER, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('user_fetch_failed');
    return res.json();
}

function buildAuthorizeUrl(cfg, state) {
    const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        response_type: 'code',
        scope: 'identify',
        state,
        prompt: 'none',
    });
    return `${DISCORD_AUTHORIZE}?${params.toString()}`;
}

export { applyCors, sendJson };

export function getSessionUser(req) {
    const cfg = getAuthConfig();
    const cookies = parseCookies(req.headers.cookie);
    return verifySession(cookies[SESSION_COOKIE], cfg.sessionSecret);
}

export async function handleDiscordAuthRequest(req, res, url) {
    const cfg = getAuthConfig();
    const pathname = url.pathname;
    const cOpts = cookieOpts(cfg);

    if (handleAuthOptions(req, res, cfg)) return true;

    if (pathname === '/api/health') {
        sendJson(res, 200, { ok: true, discord: cfg.configured, blApi: true });
        return true;
    }

    if (pathname === '/api/auth/discord/config') {
        applyCors(req, res, cfg);
        sendJson(res, 200, {
            configured: cfg.configured,
            authOrigin: cfg.publicOrigin,
            loginPath: '/auth/discord/login',
        });
        return true;
    }

    if (pathname === '/api/auth/me') {
        applyCors(req, res, cfg);
        const user = getSessionUser(req);
        sendJson(res, 200, { user: user ?? null });
        return true;
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
        applyCors(req, res, cfg);
        clearCookie(res, SESSION_COOKIE, cOpts);
        // Older sessions may have been set without Partitioned; clear both shapes.
        if (cfg.crossSiteCookies) {
            clearCookie(res, SESSION_COOKIE, {
                secure: cfg.cookieSecure,
                sameSite: 'None',
                partitioned: false,
            });
        }
        sendJson(res, 200, { ok: true });
        return true;
    }

    /** Top-level browser navigation (same as OAuth): reliably clears HttpOnly cookies on the auth host. */
    if (pathname === '/auth/discord/logout' && req.method === 'GET') {
        clearCookie(res, SESSION_COOKIE, cOpts);
        if (cfg.crossSiteCookies) {
            clearCookie(res, SESSION_COOKIE, {
                secure: cfg.cookieSecure,
                sameSite: 'None',
                partitioned: false,
            });
        }
        const returnTo = url.searchParams.get('return_to')?.trim() || '';
        const dest =
            returnTo && isAllowedReturnTo(returnTo, cfg) ? returnTo : `${cfg.publicOrigin}/`;
        redirect(res, dest);
        return true;
    }

    if (!cfg.configured) {
        if (pathname.startsWith('/auth/discord')) {
            redirect(res, `${cfg.publicOrigin}/?auth=discord_not_configured`);
            return true;
        }
        return false;
    }

    if (pathname === '/auth/discord/login' && req.method === 'GET') {
        const state = crypto.randomBytes(16).toString('hex');
        const returnTo = url.searchParams.get('return_to')?.trim() || '';
        setCookie(res, STATE_COOKIE, state, { maxAge: 600, httpOnly: true, ...cOpts });
        if (returnTo && isAllowedReturnTo(returnTo, cfg)) {
            setCookie(res, RETURN_COOKIE, returnTo, { maxAge: 600, httpOnly: true, ...cOpts });
        }
        redirect(res, buildAuthorizeUrl(cfg, state));
        return true;
    }

    if (pathname === '/auth/discord/callback' && req.method === 'GET') {
        const cookies = parseCookies(req.headers.cookie);
        const expectedState = cookies[STATE_COOKIE];
        clearCookie(res, STATE_COOKIE, cOpts);
        const afterLogin = postLoginRedirect(req, cfg);
        clearCookie(res, RETURN_COOKIE, cOpts);

        const err = url.searchParams.get('error');
        if (err) {
            redirect(res, appendAuthQuery(afterLogin, 'discord_denied'));
            return true;
        }

        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state || state !== expectedState) {
            redirect(res, appendAuthQuery(afterLogin, 'discord_invalid'));
            return true;
        }

        try {
            const accessToken = await exchangeCode(code, cfg);
            const rawUser = await fetchDiscordUser(accessToken);
            const user = normalizeUser(rawUser);
            if (!user) throw new Error('invalid_user');

            const session = signSession(
                {
                    user,
                    exp: Date.now() + SESSION_MAX_AGE_SEC * 1000,
                },
                cfg.sessionSecret,
            );
            setCookie(res, SESSION_COOKIE, session, {
                maxAge: SESSION_MAX_AGE_SEC,
                httpOnly: true,
                ...cOpts,
            });
            redirect(res, afterLogin);
        } catch {
            redirect(res, appendAuthQuery(afterLogin, 'discord_error'));
        }
        return true;
    }

    return false;
}
