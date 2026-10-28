(function () {
const coreFreeze = window.CafeCore.freeze;

const PROSETTINGS_PRO_LIST_URL = 'https://prosettings.net/wp-json/pro/v1/pro-list';
const PROSETTINGS_GAME_FILTERS_URL = 'https://prosettings.net/wp-json/pro/v2/player-filters?only=games';
const EDPI_PRO_SAMPLE_SIZE = 50;
const EDPI_PRO_CACHE_MS = 60 * 60 * 1000;
const EDPI_PRO_CACHE_VERSION = 'v3';

const PRO_LIST_COLUMN_LAYOUT = coreFreeze({
    468: { edpi: 8, dpi: 6, sens: 7 },
    479: { edpi: 7, dpi: 5, sens: 6 },
    472: { dpi: 5, sens: 6 },
    613: { dpi: 5, sens: 8 },
    812: { edpi: 7, dpi: 5, sens: 6 },
    836: { edpi: 7 },
});

const PRO_LIST_UNSUPPORTED_GAME_IDS = new Set([
    469,
    470,
    471,
    616,
    617,
]);

const PROSETTINGS_GAME_ALIASES = {
    'counter-strike 2': 'CS2',
    'counter-strike: source': 'CS2',
    'counter-strike 1.6': 'CS2',
    valorant: 'VALORANT',
    'overwatch 2': 'Overwatch',
    'rainbow six siege': 'Rainbow Six Siege',
    'apex legends': 'Apex Legends',
    fortnite: 'Fortnite',
    'marvel rivals': 'Marvel Rivals',
    deadlock: 'Deadlock',
    'call of duty: warzone': 'Call of Duty: Warzone',
    'call of duty: black ops 7': 'Call of Duty: Warzone',
    'call of duty: black ops 6': 'Call of Duty: Warzone',
    'call of duty: modern warfare iii (2023)': 'Call of Duty: Warzone',
    'call of duty: modern warfare ii (2022)': 'Call of Duty: Warzone',
    'call of duty: modern warfare (2019)': 'Call of Duty: Warzone',
    'call of duty: vanguard': 'Call of Duty: Warzone',
    'call of duty: black ops cold war': 'Call of Duty: Warzone',
    'call of duty: black ops 4': 'Call of Duty: Warzone',
    pubg: 'PUBG',
    'pubg: battlegrounds': 'PUBG',
    'playerunknown\'s battlegrounds': 'PUBG',
    'league of legends': 'League of Legends',
    'dota 2': 'DOTA 2',
};

let prosettingsGameCatalog = null;
let prosettingsGameCatalogPromise = null;
const edpiProFetchCache = new Map();

function stripHtmlToText(html) {
    if (!html) return '';
    const el = document.createElement('div');
    el.innerHTML = html;
    return el.textContent.replace(/\s+/g, ' ').trim();
}

function normalizeGameKey(name) {
    return String(name || '').trim().toLowerCase();
}

async function loadProsettingsGameCatalog() {
    if (prosettingsGameCatalog) return prosettingsGameCatalog;
    if (prosettingsGameCatalogPromise) return prosettingsGameCatalogPromise;

    prosettingsGameCatalogPromise = fetch(PROSETTINGS_GAME_FILTERS_URL)
        .then((res) => {
            if (!res.ok) throw new Error('game filters unavailable');
            return res.json();
        })
        .then((json) => {
            const byName = new Map();
            (json.games || []).forEach((g) => {
                byName.set(String(g.name).toLowerCase(), g.id);
            });
            prosettingsGameCatalog = byName;
            return byName;
        })
        .catch(() => {
            prosettingsGameCatalog = new Map();
            return prosettingsGameCatalog;
        });

    return prosettingsGameCatalogPromise;
}

async function resolveProsettingsGameId(gameName) {
    if (!gameName) return null;
    const catalog = await loadProsettingsGameCatalog();
    const key = normalizeGameKey(gameName);
    const alias = PROSETTINGS_GAME_ALIASES[key];
    if (alias && catalog.has(alias.toLowerCase())) {
        return catalog.get(alias.toLowerCase());
    }
    if (catalog.has(key)) return catalog.get(key);
    return null;
}

function parseCellNumber(raw) {
    if (raw == null || raw === '') return null;
    const cleaned = String(raw).replace(/,/g, '').replace(/%+$/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

function parseTruncatedSpanNumber(raw) {
    if (raw == null || raw === '') return null;
    const str = String(raw);
    const titleMatch = str.match(/title="([^"]+)"/i);
    if (titleMatch) return parseCellNumber(titleMatch[1]);
    return parseCellNumber(str);
}

function parseApexEdpi(row) {
    let dpi = parseCellNumber(row[5]);
    const altDpi = parseCellNumber(row[4]);
    if (dpi != null && dpi > 3200 && altDpi != null && altDpi >= 200 && altDpi <= 3200) {
        dpi = altDpi;
    }
    let sens = parseCellNumber(row[6]);
    if (sens != null && sens > 50) {
        sens = parseCellNumber(row[7]) ?? parseCellNumber(row[8]);
    }
    if ((sens == null || sens > 50) && dpi != null) {
        sens = parseCellNumber(row[7]) ?? sens;
    }
    if (dpi > 0 && sens > 0 && sens <= 50) {
        const product = dpi * sens;
        if (product >= 20 && product <= 50000) return product;
    }
    const listed = parseCellNumber(row[8]);
    if (listed != null && listed >= 20 && listed <= 50000) return listed;
    return null;
}

function parsePubgEdpi(row) {
    const dpi = parseCellNumber(row[4]);
    if (!(dpi > 0)) return null;
    let mult = parseCellNumber(row[6]);
    if (mult == null || mult <= 0 || mult > 5) {
        mult = parseCellNumber(row[5]);
    }
    if (mult == null || mult <= 0 || mult > 5) return null;
    const edpi = dpi * mult;
    if (edpi < 20 || edpi > 50000) return null;
    return edpi;
}

function parseRainbowSixEdpi(row) {
    const dpi = parseCellNumber(row[5]);
    if (!(dpi > 0)) return null;
    const spanSens = parseTruncatedSpanNumber(row[9]) ?? parseTruncatedSpanNumber(row[8]);
    let sens = spanSens;
    if (sens == null) {
        sens = parseCellNumber(row[8]) ?? parseCellNumber(row[7]);
        if (sens != null && sens > 25) return null;
    }
    if (!(sens > 0 && sens <= 25)) return null;
    const edpi = dpi * sens;
    if (edpi < 20 || edpi > 50000) return null;
    return edpi;
}

function rowHasCs2RoleColumn(row) {
    const cell = row[3];
    if (!cell || String(cell).includes('<a')) return false;
    const text = stripHtmlToText(cell);
    if (!text) return false;
    return /^(sniper|rifler|awper|igl|support|entry|lurker|coach|anchor)/i.test(text);
}

function getProListColumnLayout(row, gameId) {
    if (PRO_LIST_COLUMN_LAYOUT[gameId]) {
        return PRO_LIST_COLUMN_LAYOUT[gameId];
    }
    if (rowHasCs2RoleColumn(row)) {
        return { edpi: 8, dpi: 6, sens: 7 };
    }
    return { edpi: 7, dpi: 5, sens: 6 };
}

function parseProListRow(row, gameId) {
    const player = stripHtmlToText(row[2]) || 'Pro';
    const layout = getProListColumnLayout(row, gameId);

    const dpi = layout.dpi != null ? parseCellNumber(row[layout.dpi]) : null;
    const sens = layout.sens != null ? parseCellNumber(row[layout.sens]) : null;
    const computedEdpi = dpi > 0 && sens > 0 ? dpi * sens : null;

    let edpi = layout.edpi != null ? parseCellNumber(row[layout.edpi]) : null;

    if (gameId === 613) {
        edpi = parseRainbowSixEdpi(row);
    } else if (gameId === 614) {
        edpi = parsePubgEdpi(row);
    } else if (gameId === 472) {
        edpi = parseApexEdpi(row);
    } else if (computedEdpi != null && (edpi == null || edpi < 40)) {
        edpi = computedEdpi;
    }

    if (!Number.isFinite(edpi) || edpi <= 0) return null;
    if (edpi < 20 || edpi > 50000) return null;
    return { player, edpi };
}

async function fetchProEdpiSamples(gameId) {
    if (PRO_LIST_UNSUPPORTED_GAME_IDS.has(gameId)) {
        throw new Error('pro list layout unsupported');
    }

    const cacheKey = `${gameId}-${EDPI_PRO_CACHE_VERSION}`;
    const cached = edpiProFetchCache.get(cacheKey);
    if (cached && Date.now() - cached.at < EDPI_PRO_CACHE_MS) {
        return cached.data;
    }

    const url = `${PROSETTINGS_PRO_LIST_URL}?game=${encodeURIComponent(gameId)}&length=${EDPI_PRO_SAMPLE_SIZE}&start=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('pro list unavailable');

    const json = await res.json();
    const rows = Array.isArray(json.data) ? json.data : [];
    const samples = rows
        .map((row) => parseProListRow(row, gameId))
        .filter(Boolean)
        .slice(0, EDPI_PRO_SAMPLE_SIZE);
    if (!samples.length) throw new Error('no pro eDPI rows');

    const average = samples.reduce((sum, s) => sum + s.edpi, 0) / samples.length;
    const data = { samples, average, gameId };
    edpiProFetchCache.set(cacheKey, { at: Date.now(), data });
    return data;
}

function formatEdpiLabel(value) {
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function escapeHtmlAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function ensureEdpiProGraphTooltip() {
    let tooltip = document.getElementById('edpi-pro-graph-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'edpi-pro-graph-tooltip';
        tooltip.className = 'edpi-pro-graph-tooltip hidden';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.setAttribute('aria-hidden', 'true');
        document.body.appendChild(tooltip);
    }
    return tooltip;
}

function hideEdpiProGraphTooltip() {
    const tooltip = document.getElementById('edpi-pro-graph-tooltip');
    if (!tooltip) return;
    tooltip.classList.add('hidden');
    tooltip.setAttribute('aria-hidden', 'true');
}

function bindEdpiProGraphTooltips(chartEl) {
    const tooltip = ensureEdpiProGraphTooltip();
    if (!tooltip) return;

    hideEdpiProGraphTooltip();
    chartEl.onmouseleave = hideEdpiProGraphTooltip;

    chartEl.querySelectorAll('.edpi-pro-graph-point-hit').forEach((hit) => {
        hit.addEventListener('mouseenter', () => {
            const edpi = Number(hit.dataset.edpi);
            if (!Number.isFinite(edpi)) return;
            const player = (hit.dataset.player || 'Pro').trim();
            tooltip.textContent = `${player} · ${formatEdpiLabel(edpi)} eDPI`;
            tooltip.classList.remove('hidden');
            tooltip.setAttribute('aria-hidden', 'false');
        });

        hit.addEventListener('mousemove', (event) => {
            tooltip.style.left = `${event.clientX}px`;
            tooltip.style.top = `${event.clientY}px`;
        });

        hit.addEventListener('mouseleave', hideEdpiProGraphTooltip);
    });
}

function renderEdpiProGraph({ samples, average, gameName, userEdpi, graphMax }) {
    const chartEl = document.getElementById('edpi-pro-graph-chart');
    const avgEl = document.getElementById('edpi-pro-graph-avg');
    if (!chartEl) return;

    const maxVal = Math.max(
        graphMax || 0,
        average * 1.15,
        ...samples.map((s) => s.edpi),
    );
    const chartW = 920;
    const chartH = 200;
    const padL = 44;
    const padR = 12;
    const padT = 16;
    const padB = 36;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    const count = samples.length;
    const xForIndex = (i) => (count <= 1 ? padL + plotW / 2 : padL + (i / (count - 1)) * plotW);

    const yFor = (v) => padT + plotH - (v / maxVal) * plotH;

    const points = samples.map((s, i) => ({
        x: xForIndex(i),
        y: yFor(s.edpi),
        sample: s,
    }));

    const linePath = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ');

    const pointMarks = points
        .map(
            (p) => `<g class="edpi-pro-graph-point-hit" data-edpi="${p.sample.edpi}" data-player="${escapeHtmlAttribute(p.sample.player)}" tabindex="-1">
<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="8" class="edpi-pro-graph-point-target" />
<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="2.75" class="edpi-pro-graph-point" />
</g>`,
        )
        .join('');

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const val = maxVal * t;
        const y = yFor(val);
        return `<line x1="${padL}" y1="${y}" x2="${chartW - padR}" y2="${y}" class="edpi-pro-graph-grid" />
<text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="edpi-pro-graph-axis">${formatEdpiLabel(val)}</text>`;
    }).join('');

    chartEl.innerHTML = `<svg viewBox="0 0 ${chartW} ${chartH}" class="edpi-pro-graph-svg" role="img" aria-label="Pro player eDPI distribution for ${gameName}">
${yTicks}
<path d="${linePath}" class="edpi-pro-graph-line" fill="none" />
${pointMarks}
</svg>`;

    if (avgEl) avgEl.textContent = `${formatEdpiLabel(average)} avg`;
    const gameEl = document.getElementById('edpi-pro-graph-game');
    if (gameEl) gameEl.textContent = gameName || '';
    bindEdpiProGraphTooltips(chartEl);
}

function setEdpiProGraphSectionVisible(visible) {
    const section = document.getElementById('edpi-pro-graph');
    if (!section) return;
    section.classList.toggle('hidden', !visible);
}

function clearEdpiProGraph() {
    const chartEl = document.getElementById('edpi-pro-graph-chart');
    const avgEl = document.getElementById('edpi-pro-graph-avg');
    const gameEl = document.getElementById('edpi-pro-graph-game');
    hideEdpiProGraphTooltip();
    if (chartEl) {
        chartEl.onmouseleave = null;
        chartEl.innerHTML = '';
    }
    if (avgEl) avgEl.textContent = '—';
    if (gameEl) gameEl.textContent = '';
}

let edpiProGraphToken = 0;

async function updateEdpiProGraph(game, userEdpi) {
    const token = ++edpiProGraphToken;
    const section = document.getElementById('edpi-pro-graph');
    if (!section) return;

    if (!game?.name) {
        setEdpiProGraphSectionVisible(false);
        clearEdpiProGraph();
        return;
    }

    clearEdpiProGraph();

    const gameId = await resolveProsettingsGameId(game.name);
    if (token !== edpiProGraphToken) return;

    if (!gameId || PRO_LIST_UNSUPPORTED_GAME_IDS.has(gameId)) {
        setEdpiProGraphSectionVisible(false);
        clearEdpiProGraph();
        return;
    }

    try {
        const { samples, average } = await fetchProEdpiSamples(gameId);
        if (token !== edpiProGraphToken) return;
        setEdpiProGraphSectionVisible(true);
        renderEdpiProGraph({
            samples,
            average,
            gameName: game.name,
            userEdpi,
            graphMax: game.edpiGraphMax,
        });
    } catch {
        if (token !== edpiProGraphToken) return;
        setEdpiProGraphSectionVisible(false);
        clearEdpiProGraph();
    }
}

window.updateEdpiProGraph = updateEdpiProGraph;
window.CafeCore.mount('EdpiProGraph', coreFreeze({ updateEdpiProGraph }));
})();
