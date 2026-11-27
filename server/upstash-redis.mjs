import { upstashRedisRestToken, upstashRedisRestUrl } from "./secret-env.mjs";

function upstashUrl() {
  return upstashRedisRestUrl();
}

function upstashToken() {
  return upstashRedisRestToken();
}

export function usesUpstashRedis() {
  return Boolean(upstashUrl() && upstashToken());
}
export async function upstashRedisCommand(cmd) {
  if (!usesUpstashRedis()) throw new Error("upstash_not_configured");
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12e3);
  const res = await fetch(upstashUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstashToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(cmd),
    signal: ctrl.signal
  });
  clearTimeout(tid);
  if (!res.ok) throw new Error(`upstash_http_${res.status}`);
  const data = await res.json();
  if (data && typeof data.error === "string" && data.error) throw new Error(data.error);
  return data?.result;
}
export async function upstashRedisGetJson(key) {
  const raw = await upstashRedisCommand(["GET", key]);
  if (raw == null || raw === "") return null;
  const str = typeof raw === "string" ? raw : String(raw);
  return JSON.parse(str);
}
export async function upstashRedisSetJson(key, value) {
  await upstashRedisCommand(["SET", key, JSON.stringify(value)]);
}
