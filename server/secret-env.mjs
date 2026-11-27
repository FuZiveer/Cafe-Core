/**
 * Single place for sensitive environment variables (server-only).
 * Never log these values or return them from HTTP APIs.
 */

function read(name) {
  return String(process.env[name] ?? "").trim();
}

export function discordClientSecret() {
  return read("DISCORD_CLIENT_SECRET");
}

export function discordBotToken() {
  return read("DISCORD_BOT_TOKEN");
}

export function sessionSecret() {
  return read("SESSION_SECRET");
}

export function upstashRedisRestUrl() {
  return read("UPSTASH_REDIS_REST_URL");
}

export function upstashRedisRestToken() {
  return read("UPSTASH_REDIS_REST_TOKEN");
}

export function statsCcApiKey() {
  return read("STATS_CC_API_KEY");
}

export function matchVoiceApiSecret() {
  return read("MATCH_VOICE_API_SECRET");
}