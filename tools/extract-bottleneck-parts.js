const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data', 'bottleneck-parts.json');
const URL = 'https://bottleneckpc.com/bottleneck-checker';

function parseArraySlice(raw) {
    let text = raw;
    if (text.includes('\\"')) {
        text = text.replace(/\\"/g, '"');
    }
    return JSON.parse(text);
}

function extractEscArray(html, key) {
    const markers = [`"${key}":[`, `\\"${key}\\":[`];
    let best = null;

    markers.forEach((marker) => {
        let searchFrom = 0;
        while (searchFrom < html.length) {
            const startIdx = html.indexOf(marker, searchFrom);
            if (startIdx < 0) break;

            let i = startIdx + marker.length - 1;
            let depth = 0;
            const arrayStart = i;
            let closed = false;
            for (; i < html.length; i += 1) {
                const ch = html[i];
                if (ch === '[') depth += 1;
                else if (ch === ']') {
                    depth -= 1;
                    if (depth === 0) {
                        const raw = html.slice(arrayStart, i + 1);
                        try {
                            const parsed = parseArraySlice(raw);
                            if (!Array.isArray(parsed) || !parsed.length) continue;
                            const scored = parsed.filter((p) => p
                                && (Number.isFinite(Number(p.gaming_score))
                                    || Number.isFinite(Number(p.benchmark_score))));
                            if (!scored.length) continue;
                            if (!best || scored.length > best.length) {
                                best = parsed;
                            }
                        } catch {
                            /* try next occurrence */
                        }
                        closed = true;
                        break;
                    }
                }
            }
            searchFrom = closed ? i + 1 : startIdx + marker.length;
        }
    });

    if (!best || !best.length) throw new Error(`Could not find ${key} array in page HTML`);
    return best;
}

function normalizeParts(list) {
    return list
        .filter((p) => p && p.id && p.name)
        .map((p) => ({
            id: String(p.id),
            name: String(p.name).trim(),
            score: Math.round(Number(p.gaming_score) || Number(p.benchmark_score) || 50),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

async function main() {
    const response = await fetch(URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const cpus = extractEscArray(html, 'cpus');
    const gpus = extractEscArray(html, 'gpus');
    const out = {
        cpus: normalizeParts(cpus),
        gpus: normalizeParts(gpus),
    };
    fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`Wrote ${out.cpus.length} CPUs and ${out.gpus.length} GPUs to ${OUT}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
