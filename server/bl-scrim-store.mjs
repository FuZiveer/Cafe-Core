import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
export const SCRIM_DATA_PATH = path.join(ROOT, 'data', 'bl-scrim-record.json');

export function normalizeScrimRecord(raw) {
    return {
        wins: Math.max(0, Math.round(Number(raw?.wins) || 0)),
        losses: Math.max(0, Math.round(Number(raw?.losses) || 0)),
    };
}

export function readScrimRecordFile() {
    try {
        if (!fs.existsSync(SCRIM_DATA_PATH)) {
            const initial = { wins: 0, losses: 0 };
            fs.mkdirSync(path.dirname(SCRIM_DATA_PATH), { recursive: true });
            fs.writeFileSync(SCRIM_DATA_PATH, `${JSON.stringify(initial, null, 2)}\n`, 'utf8');
            return initial;
        }
        const parsed = JSON.parse(fs.readFileSync(SCRIM_DATA_PATH, 'utf8'));
        return normalizeScrimRecord(parsed);
    } catch {
        return { wins: 0, losses: 0 };
    }
}

export function writeScrimRecordFile(record) {
    const normalized = normalizeScrimRecord(record);
    fs.mkdirSync(path.dirname(SCRIM_DATA_PATH), { recursive: true });
    fs.writeFileSync(SCRIM_DATA_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
}
