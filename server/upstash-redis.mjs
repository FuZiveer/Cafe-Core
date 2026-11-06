const UPSTASH_URL = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
const UPSTASH_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
export function usesUpstashRedis() {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}
export async function upstashRedisCommand(cmd) {
  if (!usesUpstashRedis()) throw new Error("upstash_not_configured");
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12e3);
  const res = await fetch(UPSTASH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
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
