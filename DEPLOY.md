# Put Café Core online (with Discord sign-in)

You **cannot** upload only HTML/JS to generic web hosting and keep Discord login. You need a **Node server** (this repo already includes one) that serves the site **and** handles OAuth. Secrets live in the host’s **environment variables**, not in uploaded files.

## What you need

1. A **Git** repo (GitHub, GitLab, etc.) with your project — **no `.env` in git**.
2. A **Node host** (examples below).
3. Discord app redirect URL for your **live** domain.

---

## Step 1 — Discord (production URLs)

1. [Discord Developer Portal](https://discord.com/developers/applications) → your app → **OAuth2**.
2. Add a redirect URL (exact match, no trailing slash on the path):

   `https://YOUR-SITE/auth/discord/callback`

   Examples:
   - `https://cafe-core.onrender.com/auth/discord/callback`
   - `https://yourdomain.com/auth/discord/callback`

3. Keep your local redirect for dev if you still use it:
   - `http://127.0.0.1:8787/auth/discord/callback`

---

## Step 2 — Deploy on Render (simple free tier)

1. Push the project to GitHub (without `.env`).
2. Go to [render.com](https://render.com) → **New** → **Web Service** → connect the repo.
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install` (or leave empty; no dependencies required)
   - **Start command:** `npm start`
   - **Instance type:** Free (or paid for always-on)
4. **Environment** → add variables (same names as local `.env`):

   | Key | Example value |
   |-----|----------------|
   | `DISCORD_CLIENT_ID` | from Discord portal |
   | `DISCORD_CLIENT_SECRET` | from Discord portal |
   | `DISCORD_REDIRECT_URI` | `https://YOUR-SERVICE.onrender.com/auth/discord/callback` |
   | `SESSION_SECRET` | long random string (new one for production is fine) |
   | `PUBLIC_ORIGIN` | `https://YOUR-SERVICE.onrender.com` |
   | `CORS_ORIGINS` | `https://fuziveer.github.io` (if you use GitHub Pages for the static site) |
   | `NODE_ENV` | `production` (optional) |

   Render sets **`PORT`** automatically — do not hardcode it.

5. Deploy. Open `https://YOUR-SERVICE.onrender.com` → **Sign in** next to the bell.

**Custom domain:** Render → Settings → Custom Domain → then update Discord redirect, `PUBLIC_ORIGIN`, and `DISCORD_REDIRECT_URI` to `https://yourdomain.com`.

---

## Other hosts (same idea)

| Host | Start command | Env vars |
|------|---------------|----------|
| **Railway** | `npm start` | Dashboard → Variables |
| **Fly.io** | `npm start` | `fly secrets set KEY=value` |
| **VPS** (Ubuntu) | `npm start` with systemd + nginx reverse proxy | `/etc/environment` or service file |

Always use **HTTPS** in production (`PUBLIC_ORIGIN` and `DISCORD_REDIRECT_URI` must start with `https://`).

---

## What *not* to do

- Do **not** upload `.env` to the server filesystem in a public folder.
- Do **not** put `DISCORD_CLIENT_SECRET` in JavaScript or HTML.
- Do **not** use GitHub Pages / pure static hosting for Discord OAuth (no server for token exchange).

---

## Check that it works

- `https://YOUR-SITE/api/health` → `{"ok":true,"discord":true,"blApi":true}` when env is set.
- `GET /api/bl/scrim-record` → shared scrim score; `PATCH` only for allowlisted Discord usernames (session cookie). Clients on static GitHub Pages read this from `__CAFE_AUTH_ORIGIN` (Render), not `localStorage`.
- `WS /ws/bl/scrim` → pushes `{ type: "scrim", wins, losses }` on connect and whenever an editor saves; static pages use `wss://` on the same auth origin.
- `GET /api/bl/planner-access` → `{ allowed: true/false }` for BL planner (server decides from session).
- Scrim data file: `data/bl-scrim-record.json` on the server (use Render persistent disk if you need scores to survive redeploys).
- `https://YOUR-SITE/api/auth/discord/config` → `{"configured":true,...}`.
- Sign in → profile appears in the top bar.

Local dev stays: `.env` on your PC + `npm run dev` + `http://127.0.0.1:8787`.

---

## GitHub Pages + Discord (two URLs, one login)

GitHub Pages only hosts files. OAuth still runs on Render.

1. On **Render**, set `CORS_ORIGINS` to `https://fuziveer.github.io` (your Pages origin, no path).
2. Keep Discord redirect on Render only: `https://YOUR-SERVICE.onrender.com/auth/discord/callback`.
3. In **`js/auth-config.js`**, set `__CAFE_AUTH_ORIGIN` to your Render URL (already wired for `fuziveer.github.io`).
4. Push to GitHub so Pages updates; sign in on `https://fuziveer.github.io/Cafe-Core`.

Flow: Pages → Sign in → Render (Discord) → back to your GitHub Pages URL → profile loads via cross-origin API + cookie on Render.
