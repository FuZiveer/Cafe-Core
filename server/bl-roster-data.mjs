import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ROSTER_PATH = path.join(ROOT, "data", "black-listed-roster.js");

let rosterCache = { at: 0, list: null };
const ROSTER_TTL_MS = 30_000;

export function loadBlackListedRoster() {
  const now = Date.now();
  if (rosterCache.list && now - rosterCache.at < ROSTER_TTL_MS) {
    return rosterCache.list;
  }
  let list = [];
  try {
    const text = fs.readFileSync(ROSTER_PATH, "utf8");
    const sandbox = { window: {} };
    vm.runInNewContext(`${text}\n;`, sandbox, { filename: "black-listed-roster.js" });
    list = Array.isArray(sandbox.window.BLACK_LISTED_ROSTER)
      ? sandbox.window.BLACK_LISTED_ROSTER
      : [];
  } catch {
    list = [];
  }
  rosterCache = { at: now, list };
  return list;
}
