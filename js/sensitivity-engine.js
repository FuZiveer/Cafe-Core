const CM360_INCH_TO_CM = 2.54;

const EXPR_TOK = /([0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?|[A-Za-z_][A-Za-z0-9_]*|[+\-*/^(),])/g;
const EXPR_SKIP = /^\s+$/;

const EXPR_FUNCS = {
    pow: (a, b) => Math.pow(a, b),
    log: (a) => Math.log(a),
    tan: (a) => Math.tan(a),
    cbrt: (a) => Math.cbrt(a),
    sqrt: (a) => Math.sqrt(a),
    min: (a, b) => Math.min(a, b),
    max: (a, b) => Math.max(a, b),
    exp: (a) => Math.exp(a),
};

function evalExpr(expr, vars) {
    if (typeof expr !== "string" || !expr.trim()) return NaN;
    EXPR_TOK.lastIndex = 0;
    const tokens = [];
    let m;
    let last = 0;
    while ((m = EXPR_TOK.exec(expr)) !== null) {
        const gap = expr.slice(last, m.index);
        if (gap && !EXPR_SKIP.test(gap)) return NaN;
        tokens.push(m[1]);
        last = EXPR_TOK.lastIndex;
    }
    if (expr.slice(last).trim()) return NaN;
    let pos = 0;
    function peek() { return tokens[pos]; }
    function consume() { return tokens[pos++]; }
    function parseNum(tok) { const n = Number(tok); return Number.isFinite(n) ? n : NaN; }
    function parsePrimary() {
        const tok = consume();
        if (tok === undefined) return NaN;
        if (tok === "(") { const val = parseAdd(); if (consume() !== ")") return NaN; return val; }
        if (/^[0-9]/.test(tok)) return parseNum(tok);
        if (/^[A-Za-z_]/.test(tok)) {
            if (peek() === "(") {
                const fn = EXPR_FUNCS[tok];
                if (!fn) return NaN;
                consume();
                const args = [];
                if (peek() === ")") { consume(); return fn(...args); }
                while (true) { args.push(parseAdd()); const sep = consume(); if (sep === ")") break; if (sep !== ",") return NaN; }
                return fn(...args);
            }
            if (tok === "pi" || tok === "PI") return Math.PI;
            const v = vars[tok];
            return typeof v === "number" && Number.isFinite(v) ? v : NaN;
        }
        return NaN;
    }
    function parseUnary() {
        const tok = peek();
        if (tok === "-" || tok === "+") { consume(); const val = parseUnary(); return tok === "-" ? -val : val; }
        return parsePrimary();
    }
    function parsePower() {
        let left = parseUnary();
        if (peek() === "^") { consume(); const right = parsePower(); left = Math.pow(left, right); }
        return left;
    }
    function parseMul() {
        let left = parsePower();
        while (peek() === "*" || peek() === "/") { const op = consume(); const right = parsePower(); left = op === "*" ? left * right : left / right; }
        return left;
    }
    function parseAdd() {
        let left = parseMul();
        while (peek() === "+" || peek() === "-") { const op = consume(); const right = parseMul(); left = op === "+" ? left + right : left - right; }
        return left;
    }
    const result = parseAdd();
    if (pos !== tokens.length) return NaN;
    return result;
}

const GAME_ASPECT = 16 / 9;

function gameFovRads(game) {
    const fov = game?.fov;
    const def = fov?.def ?? 90;
    let hRad = (def * Math.PI) / 180;
    let vRad = (def * Math.PI) / 180;
    if (!fov) return { hRad, vRad };
    if (fov.type === "vertical_deg") {
        vRad = (def * Math.PI) / 180;
        hRad = 2 * Math.atan(Math.tan(vRad / 2) * GAME_ASPECT);
    } else if (fov.type === "horizontal_arbitrary_deg" && fov.formula) {
        const hDeg = evalExpr(fov.formula, { v: def });
        hRad = (hDeg * Math.PI) / 180;
        vRad = 2 * Math.atan(Math.tan(hRad / 2) / GAME_ASPECT);
    } else if (fov.type === "multiplier") {
        vRad = def;
        hRad = def;
    }
    return { hRad, vRad };
}

function gameModifierValues(game) {
    const out = {};
    for (const mod of game?.modifiers || []) out[mod.variable] = mod.def;
    return out;
}

function gameDpc(game, sens) {
    const s = Number(sens);
    const yaw = Number(game?.yaw) || 0;
    if (!Number.isFinite(s) || !Number.isFinite(yaw)) return null;
    switch (game?.type) {
        case "linear_offset": return yaw * (s + (Number(game.offset) || 0));
        case "linear_with_fov": return yaw * s;
        case "expression": {
            const { hRad, vRad } = gameFovRads(game);
            const val = evalExpr(game.fwd, { base_yaw: yaw, base_sens: s, base_fov_h_rad: hRad, base_fov_v_rad: vRad, pi: Math.PI, PI: Math.PI, ...gameModifierValues(game) });
            return Number.isFinite(val) ? val : null;
        }
        default: return yaw * s;
    }
}

function gameSensFromDpc(game, dpc) {
    const d = Number(dpc);
    const yaw = Number(game?.yaw) || 0;
    if (!Number.isFinite(d) || !Number.isFinite(yaw)) return null;
    switch (game?.type) {
        case "linear_offset": return d / yaw - (Number(game.offset) || 0);
        case "linear_with_fov": return d / yaw;
        case "expression": {
            const { hRad, vRad } = gameFovRads(game);
            const val = evalExpr(game.rev, { base_yaw: yaw, base_fov_h_rad: hRad, base_fov_v_rad: vRad, target_dpc: d, pi: Math.PI, PI: Math.PI, ...gameModifierValues(game) });
            return Number.isFinite(val) ? val : null;
        }
        default: return d / yaw;
    }
}

function convertSensitivity(fromSens, fromGame, toGame, fromDpi = 1, toDpi = 1) {
    const sens = Number(fromSens);
    const fDpi = Number(fromDpi);
    const tDpi = Number(toDpi);
    if (!fromGame || !toGame) return null;
    if (!Number.isFinite(sens) || sens <= 0) return null;
    if (!Number.isFinite(fDpi) || !Number.isFinite(tDpi) || fDpi <= 0 || tDpi <= 0) return null;
    const fromDpc = gameDpc(fromGame, sens);
    if (fromDpc == null || !Number.isFinite(fromDpc) || fromDpc <= 0) return null;
    const toDpc = fromDpc * (fDpi / tDpi);
    return gameSensFromDpc(toGame, toDpc);
}

function getSensitivityDecimals(game) { return Number.isInteger(game?.decimals) ? game.decimals : 2; }
function parseDecimalInput(value) { return parseFloat(String(value ?? "").replace(",", ".")); }
function roundToDecimals(value, decimals) {
    const n = Number(value);
    if (!Number.isFinite(n)) return n;
    if (decimals <= 0) return Math.round(n);
    const factor = 10 ** decimals;
    return Math.round(n * factor) / factor;
}

function stepDecimals(step) {
    return step && !(step <= 0) && Number.isFinite(step)
        ? Math.min(6, Math.max(0, -Math.floor(Math.log10(step))))
        : null;
}

function snapToSensStep(value, step) {
    const e = Number(value);
    const t = Number(step);
    if (!Number.isFinite(e)) return e;
    if (!Number.isFinite(t) || t <= 0) return e;
    const n = Math.round(e / t) * t;
    const i = Math.max(0, -Math.floor(Math.log10(t)));
    const r = 10 ** i;
    return Math.round(n * r) / r;
}

function formatConvertedSensitivity(value, toGame) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const fromStep = stepDecimals(toGame?.sens?.step);
    const tinyMax = (toGame?.sens?.max ?? 1) < 0.1;
    let decimals;
    if (n === 0) decimals = 2;
    else if (tinyMax && fromStep != null) decimals = fromStep;
    else decimals = Math.min(3, fromStep ?? (n >= 100 ? 0 : n >= 10 ? 2 : 4));
    return n.toFixed(decimals);
}

function cm360FromDpc(dpc, dpi) {
    const e = Number(dpc);
    const t = Number(dpi);
    if (!Number.isFinite(e) || !Number.isFinite(t) || e === 0 || t === 0) return null;
    return 360 / e / t * CM360_INCH_TO_CM;
}

function formatCm360Number(cm) {
    if (cm == null || !Number.isFinite(cm)) return '—';
    return cm.toFixed(2);
}

function calculateCm360Value(sens, dpi, yaw) {
    const s = Number(sens); const d = Number(dpi); const y = Number(yaw);
    if (!Number.isFinite(s) || !Number.isFinite(d) || !Number.isFinite(y)) return null;
    if (s <= 0 || d <= 0 || y <= 0) return null;
    return cm360FromDpc(s * y, d);
}
function formatCm360(sens, dpi, yaw) {
    const cm = calculateCm360Value(sens, dpi, yaw);
    if (cm == null || !Number.isFinite(cm)) return null;
    return `${formatCm360Number(cm)} cm/360`;
}
function calculateGameCm360Value(game, sens, dpi) {
    const dpc = gameDpc(game, sens);
    if (dpc == null || !Number.isFinite(dpc) || dpc <= 0) return null;
    return cm360FromDpc(dpc, dpi);
}
function formatGameCm360(game, sens, dpi) {
    const cm = calculateGameCm360Value(game, sens, dpi);
    if (cm == null || !Number.isFinite(cm)) return null;
    return `${formatCm360Number(cm)} cm/360`;
}

function bnNormalize(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function bnAliasName(name) {
    return (name || '')
        .replace(/^(AMD|Intel|NVIDIA)\s+/i, '')
        .replace(/^(GeForce|Radeon)\s+/i, '')
        .replace(/^Core\s+/i, 'Core ')
        .trim();
}


function bnSuffixAfterNormMatch(text, qNorm) {
    const fullNorm = bnNormalize(text);
    const start = fullNorm.indexOf(qNorm);
    if (start < 0) return '';
    const endTarget = start + qNorm.length;
    let normPos = 0;
    for (let i = 0; i < text.length; i++) {
        if (/[a-z0-9]/i.test(text[i])) {
            normPos++;
            if (normPos === endTarget) return text.slice(i + 1);
        }
    }
    return '';
}

function bnTokenMatchSuffix(name, query) {
    const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (!tokens.length) return null;
    const nameLower = name.toLowerCase();
    let searchFrom = 0;
    let lastEnd = 0;
    for (const tok of tokens) {
        const idx = nameLower.indexOf(tok, searchFrom);
        if (idx < 0) return null;
        lastEnd = idx + tok.length;
        searchFrom = lastEnd;
    }
    return name.slice(lastEnd);
}

function bnFindTextMatches(list, query, limit = 8) {
    const q = query;
    if (!q || !q.trim()) return [];
    const qTrim = q.replace(/^\s+/, '');
    const qLower = qTrim.toLowerCase();
    const qNorm = bnNormalize(qTrim);
    if (!qNorm) return [];

    const ranked = [];
    for (const item of list) {
        const name = item.name;
        const nameLower = name.toLowerCase();
        const alias = bnAliasName(name);
        const aliasLower = alias.toLowerCase();
        const lenPenalty = name.length * 0.01;

        if (nameLower.startsWith(qLower)) {
            ranked.push({ item, suffix: name.slice(qTrim.length), rank: 300 - lenPenalty });
            continue;
        }
        if (aliasLower.startsWith(qLower)) {
            ranked.push({ item, suffix: alias.slice(qTrim.length), rank: 280 - lenPenalty });
            continue;
        }

        let idx = nameLower.indexOf(qLower);
        if (idx >= 0) {
            const atBoundary = idx === 0 || /[\s\-_/]/.test(name[idx - 1]);
            ranked.push({
                item,
                suffix: name.slice(idx + qTrim.length),
                rank: (atBoundary ? 220 : 190) - idx * 0.05 - lenPenalty
            });
            continue;
        }
        idx = aliasLower.indexOf(qLower);
        if (idx >= 0) {
            const atBoundary = idx === 0 || /[\s\-_/]/.test(alias[idx - 1]);
            ranked.push({
                item,
                suffix: alias.slice(idx + qTrim.length),
                rank: (atBoundary ? 210 : 180) - idx * 0.05 - lenPenalty
            });
            continue;
        }

        const nameNorm = bnNormalize(name);
        if (nameNorm.includes(qNorm)) {
            const nIdx = nameNorm.indexOf(qNorm);
            const atBoundary = nIdx === 0 || !/[a-z0-9]/.test(nameNorm[nIdx - 1] || '');
            ranked.push({
                item,
                suffix: bnSuffixAfterNormMatch(name, qNorm),
                rank: (atBoundary ? 160 : 140) - nIdx * 0.05 - lenPenalty
            });
            continue;
        }
        const aliasNorm = bnNormalize(alias);
        if (aliasNorm.includes(qNorm)) {
            const nIdx = aliasNorm.indexOf(qNorm);
            ranked.push({
                item,
                suffix: bnSuffixAfterNormMatch(alias, qNorm),
                rank: 130 - nIdx * 0.05 - lenPenalty
            });
            continue;
        }

        const tokenSuffix = bnTokenMatchSuffix(name, qTrim);
        if (tokenSuffix !== null) {
            ranked.push({ item, suffix: tokenSuffix, rank: 110 - lenPenalty });
            continue;
        }
        const aliasTokenSuffix = bnTokenMatchSuffix(alias, qTrim);
        if (aliasTokenSuffix !== null) {
            ranked.push({ item, suffix: aliasTokenSuffix, rank: 100 - lenPenalty });
        }
    }

    if (!ranked.length) return [];
    ranked.sort((a, b) => {
        if (b.rank !== a.rank) return b.rank - a.rank;
        const aHas = a.suffix ? 1 : 0;
        const bHas = b.suffix ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        return a.item.name.length - b.item.name.length;
    });
    return ranked.slice(0, Math.max(1, limit));
}

function bnFindCompletion(list, query) {
    const qNorm = bnNormalize((query || '').trim());
    if (qNorm.length < 2) return null;
    return bnFindTextMatches(list, query, 1)[0] || null;
}

function bnResolvePart(list, query, selected) {
    const value = (query || '').trim();
    if (!value) return null;
    if (selected && selected.name === value) return selected;
    const qNorm = bnNormalize(value);
    const exact = list.find(item => bnNormalize(item.name) === qNorm)
        || list.find(item => bnNormalize(bnAliasName(item.name)) === qNorm);
    if (exact) return exact;
    const completion = bnFindCompletion(list, value);
    if (completion && !completion.suffix) return completion.item;
    return null;
}

(function registerSensitivityEngine(global) {
    const core = global.CafeCore;
    if (!core) return;
    core.mount('Sensitivity', {
        convertSensitivity,
        gameDpc,
        formatConvertedSensitivity,
        calculateGameCm360Value,
        formatGameCm360,
        bnResolvePart,
        bnFindCompletion,
        bnFindTextMatches,
        parseDecimalInput,
        getSensitivityDecimals,
        snapToSensStep,
    });
})(typeof window !== 'undefined' ? window : globalThis);
