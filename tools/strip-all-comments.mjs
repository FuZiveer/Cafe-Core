import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SKIP_DIR_NAMES = new Set(["node_modules", ".git"]);
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
function stripPureAnnotations(content) {
  return content.replace(/\s*\/\*\s*@__PURE__\s*\*\/\s*/g, " ");
}
async function stripJsLike(content) {
  const result = await esbuild.transform(content, {
    loader: "js",
    legalComments: "none",
    minify: false
  });
  return stripPureAnnotations(result.code);
}
async function stripCss(content) {
  const result = await esbuild.transform(content, {
    loader: "css",
    legalComments: "none",
    minify: false
  });
  return result.code;
}
function stripHtmlComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, "");
}
async function stripHtmlFile(content) {
  let out = stripHtmlComments(content);
  out = await replaceAsync(out, /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, async (full, attrs, body) => {
    if (attrs && /\bsrc\s*=/i.test(attrs)) return full;
    const inner = await stripJsLike(body);
    return `<script${attrs || ""}>${inner}<\/script>`;
  });
  return out;
}
async function replaceAsync(str, regex, fn) {
  const parts = [];
  let lastIndex = 0;
  let m;
  const r = new RegExp(regex.source, regex.flags);
  while ((m = r.exec(str)) !== null) {
    parts.push(str.slice(lastIndex, m.index));
    parts.push(await fn(...m, m.index, str));
    lastIndex = m.index + m[0].length;
  }
  parts.push(str.slice(lastIndex));
  return parts.join("");
}
const EXT_HANDLERS = {
  ".js": stripJsLike,
  ".mjs": stripJsLike,
  ".cjs": stripJsLike,
  ".css": stripCss,
  ".html": stripHtmlFile
};
const files = walk(ROOT).filter((f) => Object.prototype.hasOwnProperty.call(EXT_HANDLERS, path.extname(f)));
let changed = 0;
for (const file of files) {
  const ext = path.extname(file);
  const raw = fs.readFileSync(file, "utf8");
  const handler = EXT_HANDLERS[ext];
  const next = await handler(raw);
  if (next !== raw) {
    fs.writeFileSync(file, next, "utf8");
    console.log(path.relative(ROOT, file));
    changed++;
  }
}
console.error(`Done. Updated ${changed} file(s).`);
