# Discord sign-in setup

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **OAuth2** → add redirect URL:
   - `http://127.0.0.1:8787/auth/discord/callback`
   - (Add your production URL when you deploy.)
3. Copy **Client ID** and **Client Secret**.
4. Create a `.env` file in the project root:

```env
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://127.0.0.1:8787/auth/discord/callback
SESSION_SECRET=use_a_long_random_string_here
PUBLIC_ORIGIN=http://127.0.0.1:8787
```

5. Restart the dev server: `npm run dev`
6. Use **Sign in** in the top bar (right of notifications).

The client secret stays on the server only; the static site calls `/api/auth/*` on the same origin.

**Put the site online for real users:** follow **[DEPLOY.md](./DEPLOY.md)** (Render, env vars on the host, production Discord redirect URL). Do not upload your `.env` file.
