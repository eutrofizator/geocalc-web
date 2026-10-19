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
