import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { getAuthConfig, handleDiscordAuthRequest } from "./discord-auth.mjs";
import { handleBlApiRequest } from "./bl-api.mjs";
import { handleScrimUpgrade } from "./bl-scrim-ws.mjs";
import { handleScrimQueueUpgrade, startScrimLobbyRedisFanout } from "./scrim-queue-ws.mjs";
import { handleScrimQueueApiRequest } from "./scrim-queue-api.mjs";
import { purgeAllScrimsMatchStateOnBoot } from "./scrim-queue-store.mjs";
import { broadcastScrimLobby } from "./scrim-queue-ws.mjs";
import { handleMatchVoiceApiRequest } from "./match-voice-api.mjs";
import { isMatchBotConfigured, startDiscordMatchBot } from "./discord-match-bot.mjs";
import { usesUpstashRedis } from "./upstash-redis.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8787);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.normalize(path.join(ROOT, relative));
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg", ".mjs"]);
const GZIP_MIN_BYTES = 512;
function cacheControlForExt(ext) {
  if (ext === ".html") return "no-cache";
  if (COMPRESSIBLE.has(ext)) return "public, max-age=86400, stale-while-revalidate=604800";
  return "public, max-age=2592000, immutable";
}
function sendStaticBody(res, data, headers, statusCode = 200) {
  res.writeHead(statusCode, headers);
  res.end(data);
}
function weakEtag(data) {
  return `W/"${crypto.createHash("sha1").update(data).digest("base64")}"`;
}
function serveFile(req, res, url) {
  const filePath = safePath(url.pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(err.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const etag = weakEtag(data);
    const headers = {
      "Content-Type": type,
      "Cache-Control": cacheControlForExt(ext),
      ETag: etag
    };
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch === etag || ifNoneMatch === "*") {
      res.writeHead(304, {
        "Cache-Control": headers["Cache-Control"],
        ETag: etag
      });
      res.end();
      return;
    }
    const accept = String(req.headers["accept-encoding"] || "");
    const mayGzip = COMPRESSIBLE.has(ext) && accept.includes("gzip") && data.length >= GZIP_MIN_BYTES;
    if (!mayGzip) {
      sendStaticBody(res, data, headers);
      return;
    }
    zlib.gzip(data, { level: zlib.constants.Z_BEST_SPEED }, (gzipErr, compressed) => {
      if (gzipErr || !compressed || compressed.length >= data.length) {
        sendStaticBody(res, data, headers);
        return;
      }
      sendStaticBody(res, compressed, {
        ...headers,
        "Content-Encoding": "gzip",
        Vary: "Accept-Encoding"
      });
    });
  });
}
console.log("[cafe] Node", process.version, "| boot", new Date().toISOString());

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  try {
    const cfg = getAuthConfig();
    const handledAuth = await handleDiscordAuthRequest(req, res, url);
    if (handledAuth) return;
    const handledBl = await handleBlApiRequest(req, res, url, cfg);
    if (handledBl) return;
    const handledMatch = await handleMatchVoiceApiRequest(req, res, url, cfg);
    if (handledMatch) return;
    const handledScrimQueue = await handleScrimQueueApiRequest(req, res, url, cfg);
    if (handledScrimQueue) return;
  } catch (err) {
    console.error("[auth]", err);
    res.writeHead(500);
    res.end("Auth error");
    return;
  }
  serveFile(req, res, url);
});
server.on("upgrade", (request, socket, head) => {
  let pathname = "";
  try {
    pathname = new URL(request.url || "", "http://127.0.0.1").pathname;
  } catch {
    socket.destroy();
    return;
  }
  if (handleScrimUpgrade(request, socket, head, pathname)) return;
  if (handleScrimQueueUpgrade(request, socket, head, pathname)) return;
  socket.destroy();
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error("Stop the other process, or run:");
    console.error(`  $env:PORT=8788; npm run dev`);
    console.error("On Windows, find and kill the listener:");
    console.error(`  netstat -ano | findstr :${PORT}`);
    console.error("  taskkill /PID <pid> /F");
    process.exit(1);
  }
  throw err;
});
server.listen(PORT, "0.0.0.0", () => {
  const origin = process.env.PUBLIC_ORIGIN?.trim() || `http://127.0.0.1:${PORT}`;
  console.log(`Caf\xE9 Core server listening on port ${PORT}`);
  console.log(`  Local:  http://127.0.0.1:${PORT}`);
  if (origin !== `http://127.0.0.1:${PORT}`) console.log(`  Public: ${origin}`);
  console.log("Discord sign-in: configure OAuth env on Render (client id, secret, redirect URI)");
  if (isMatchBotConfigured()) {
    console.log("[match-bot] Env present — starting Discord gateway connection on boot");
    void startDiscordMatchBot()
      .then((c) => {
        if (c?.isReady?.()) {
          console.log("[match-bot] Boot startup finished (bot should show online in Discord)");
        } else {
          console.warn(
            "[match-bot] Boot startup finished but bot is not ready — check Render logs for Login failed"
          );
        }
      })
      .catch((err) => {
        console.error("[match-bot] Boot startup error:", err?.message || err);
      });
  } else {
    console.warn(
      "[match-bot] NOT configured — add bot token and guild id in Render Environment, then redeploy"
    );
  }
  if (!usesUpstashRedis()) {
    console.warn(
      "[cafe] Scrim record is stored on the local filesystem only (data/bl-scrim-record.json). On Render this resets when the service sleeps or redeploys. Set Upstash Redis env vars for durable storage."
    );
  } else {
    console.log("[cafe] Scrim record persistence: Upstash Redis");
    startScrimLobbyRedisFanout();
  }
  if (process.env.SCRIM_KEEP_MATCHES_ON_BOOT === "1") {
    console.log("[scrim-queue] Skipping live-match purge on boot (SCRIM_KEEP_MATCHES_ON_BOOT=1)");
  } else {
    void purgeAllScrimsMatchStateOnBoot()
      .then((cleared) => {
        for (const { lobbyId, queue } of cleared) {
          broadcastScrimLobby(lobbyId, queue);
        }
        if (cleared.length > 0) {
          console.log(`[scrim-queue] Purged ${cleared.length} stale live match(es) on boot`);
        }
      })
      .catch((err) => {
        console.error("[scrim-queue] Boot live-match purge failed:", err?.message || err);
      });
  }
});
