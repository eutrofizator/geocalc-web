/**
 * Munkamenet mentése és betöltése (`.gcs`).
 *
 * A program minden munkalapja a beállításait a böngésző tárolójába menti `geocalc-web.<munkalap>`
 * kulcsok alatt. Ez a modul ezeket a kulcsokat egyetlen, önmagát leíró JSON-fájlba gyűjti, illetve
 * onnan visszaolvassa, így a teljes munkamenet (koordináták, mérések, beállítások) átvihető másik
 * böngészőbe vagy gépre – hálózat és szerver nélkül. A mag tiszta: a tárolót a hívó adja át.
 */

export const SESSION_PREFIX = 'geocalc-web.';
export const SESSION_FORMAT = 'GEOkalkulus-munkamenet';
export const SESSION_VERSION = 1;

export interface SessionFile {
  format: string;
  version: number;
  /** Készítés ideje (ISO 8601). */
  saved: string;
  /** A program neve. */
  program: string;
  /** A tárolt kulcsok és értékeik. */
  data: Record<string, string>;
}

export const PROGRAM_NAME = 'GEOkalkulus 1.0';

/** A tárolóból csak a program saját kulcsai kerülnek a munkamenetbe. */
export function sessionEntries(all: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(all).sort()) {
    if (key.startsWith(SESSION_PREFIX)) out[key] = all[key]!;
  }
  return out;
}

/** A munkamenet szöveges (JSON) alakja. */
export function serializeSession(data: Record<string, string>, saved: string): string {
  const file: SessionFile = { format: SESSION_FORMAT, version: SESSION_VERSION, saved, program: PROGRAM_NAME, data: sessionEntries(data) };
  return JSON.stringify(file, null, 1) + '\n';
}

export type SessionParse = { ok: true; file: SessionFile; entries: [string, string][] } | { ok: false; error: string };

/** A munkamenet-fájl értelmezése; hibás vagy idegen fájl esetén magyar nyelvű hibaüzenet. */
export function parseSession(text: string): SessionParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'A fájl nem érvényes JSON: nem munkamenet-fájl.' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'A fájl szerkezete nem munkamenet-fájl.' };
  }
  const file = raw as Partial<SessionFile>;
  if (file.format !== SESSION_FORMAT) {
    return { ok: false, error: `Ez nem ${PROGRAM_NAME} munkamenet-fájl (a formátumjelző „${SESSION_FORMAT}” hiányzik).` };
  }
  if (typeof file.version !== 'number' || file.version > SESSION_VERSION) {
    return { ok: false, error: `A munkamenet újabb programváltozásból származik (${String(file.version)} > ${SESSION_VERSION}).` };
  }
  if (typeof file.data !== 'object' || file.data === null || Array.isArray(file.data)) {
    return { ok: false, error: 'A munkamenetben nincs érvényes adatrész.' };
  }
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(file.data as Record<string, unknown>)) {
    if (!key.startsWith(SESSION_PREFIX)) continue;
    if (typeof value !== 'string') return { ok: false, error: `A(z) „${key}” bejegyzés értéke nem szöveg.` };
    entries.push([key, value]);
  }
  if (entries.length === 0) return { ok: false, error: 'A munkamenet nem tartalmaz mentett munkalapot.' };
  return { ok: true, file: { format: SESSION_FORMAT, version: file.version, saved: file.saved ?? '', program: file.program ?? '', data: Object.fromEntries(entries) }, entries };
}

/** A fájlnév a mentés napjával: `munkamenet-2026-10-19.gcs`. */
export function sessionFileName(iso: string): string {
  return `munkamenet-${iso.slice(0, 10)}.gcs`;
}

/* ---------- új munka: a munkaadatok törlése, a beállítások megtartása ---------- */

/** Tisztán beállítást tároló kulcsok: új munkánál változatlanok maradnak. */
const SETTING_KEYS = new Set(['theme', 'lang', 'start', 'last', 'nav', 'codes-panel']);

/**
 * Munkalaponként a megtartott (beállítás jellegű) mezők és a felülírt munkaadatok. Ami itt nem
 * szerepel, az törlődik. Az üres értéket ki kell írni ott, ahol a munkalap hiányzó adatnál a
 * mintapéldát töltené be.
 */
const JOB_RULES: Record<string, { keep: string[]; set?: Record<string, unknown>; nested?: Record<string, string[]> }> = {
  draft: { keep: [] },
  recorder: { keep: ['*'], set: { drafts: [] } },
  cover: { keep: ['keszitette', 'vetulet', 'magassag', 'fekves', 'logo'] },
  parcel: {
    keep: ['annex', 'scale', 'kind', 'check', 'job', 'plan', 'work'],
    set: { coords: '', before: '', after: '', measured: '', owners: '', raw: null },
    nested: {
      plan: ['szekhely', 'megnevezes', 'igazolvany', 'minosites', 'hely', 'address', 'prefix', 'scale'],
      work: ['muszer', 'gyariszam', 'minosegtanusito', 'megjeloles', 'email', 'telefon', 'vegzok'],
    },
  },
  akg: { keep: ['common'], set: { coords: '', ams: '', records: [], selected: 0 }, nested: { common: ['merteVegzo', 'muszer'] } },
  geoconvert: { keep: ['from', 'to', 'dec'], set: { text: '' } },
  dxfview: { keep: ['radius', 'texts'], set: { points: '', hidden: [] } },
  fieldbook: { keep: ['type', 'angle', 'showAp'], set: { rows: [], file: '' } },
  network: { keep: ['settings', 'heights', 'details', 'averaging', 'sketch', 'vertical'], set: { coordinates: '', gmj: '', workname: '' } },
  'transform-apply': { keep: ['from', 'to', 'twoD', 'fields', 'ski', 'interpolate', 'saveKind'], set: { points: '' } },
  descriptor: { keep: ['code'], set: { obs: [] } },
  exchange: { keep: ['*'] },
};

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

/**
 * Új munka kezdése: a tárolt kulcsokból kiszámolja, mi változik. Az eredményben a `null` törlést,
 * a szöveg új értéket jelent; a hiányzó kulcs változatlan marad. A munkához tartozó adatok
 * (koordináták, mérések, megbízó, tulajdonosok, munkaszám) törlődnek, a felhasználó saját adatai
 * (téma, nyelv, műszer, készítő, székhely, igazolványszám) megmaradnak.
 */
export function newJobChanges(all: Record<string, string>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of Object.keys(all)) {
    if (!key.startsWith(SESSION_PREFIX)) continue;
    const name = key.slice(SESSION_PREFIX.length);
    if (SETTING_KEYS.has(name)) continue;
    const rule = JOB_RULES[name];
    if (!rule) {
      out[key] = null;
      continue;
    }
    if (rule.keep.length === 0 && !rule.set) {
      out[key] = '';
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(all[key]!);
    } catch {
      data = null;
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      out[key] = null;
      continue;
    }
    const obj = data as Record<string, unknown>;
    const next = rule.keep.includes('*') ? { ...obj } : pick(obj, rule.keep);
    for (const [field, keys] of Object.entries(rule.nested ?? {})) {
      const inner = next[field];
      if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) next[field] = pick(inner as Record<string, unknown>, keys);
    }
    Object.assign(next, rule.set ?? {});
    const text = JSON.stringify(next);
    if (text !== all[key]) out[key] = text;
  }
  return out;
}
