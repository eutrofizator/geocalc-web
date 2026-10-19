import { CalcError } from './errors';
import { compareIds, fix } from './format';
import type { Point } from './types';

/**
 * Az Adatcsere/Koordináta állomány készítése munkalap magja (súgó 74. o.).
 *
 * Kézzel begépelt pontok jegyzéke. A pontok típusa oszlopban a szokásos Y, X, M; az X, Y, Z
 * (geocentrikus) vagy a földrajzi koordináták formában adhatók meg. Földrajzi koordinátáknál a
 * szélességet és a hosszúságot „áldecimális” (fok.perc.másodperc) alakban kell megadni, például
 * a 19° 18′ 22.31643″ értéket így: `19.182231643`.
 */

export type PointKind = 'yxm' | 'xyz' | 'geo';

export const POINT_KINDS: { kind: PointKind; label: string; columns: [string, string, string]; decimals: [number, number, number] }[] = [
  { kind: 'yxm', label: 'Y, X, M', columns: ['Y', 'X', 'M'], decimals: [3, 3, 3] },
  { kind: 'xyz', label: 'X, Y, Z (geocentrikus)', columns: ['X', 'Y', 'Z'], decimals: [3, 3, 3] },
  { kind: 'geo', label: 'Földrajzi (φ, λ, h)', columns: ['φ [°]', 'λ [°]', 'h [m]'], decimals: [9, 9, 3] },
];

export function kindMeta(kind: PointKind) {
  return POINT_KINDS.find((k) => k.kind === kind) ?? POINT_KINDS[0]!;
}

export interface RegisterRow {
  id: string;
  kind: PointKind;
  /** A három koordináta (Y/X/M, X/Y/Z vagy φ/λ/h; a földrajzi értékek tizedes fokban). */
  a: number | null;
  b: number | null;
  c: number | null;
}

export const EMPTY_ROW: RegisterRow = { id: '', kind: 'yxm', a: null, b: null, c: null };

/**
 * „Áldecimális” földrajzi érték értelmezése: `19.182231643` → 19° 18′ 22.31643″.
 * A fok egész része után a perc két, majd a másodperc két egész jegye és a tizedesek következnek.
 * Ha a tört rész rövidebb négy jegynél, vagy a perc/másodperc 60-nál nagyobb lenne, a bemenetet
 * tizedes fokként értelmezzük (például `19.306199` → 19.306199°).
 */
export function parseGeographic(text: string): number {
  const t = text.trim().replace(',', '.');
  const m = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(t);
  if (!m) throw new CalcError(`Érvénytelen földrajzi koordináta: „${text}”.`);
  const sign = m[1] === '-' ? -1 : 1;
  const deg = Number(m[2]);
  const frac = m[3] ?? '';
  if (frac.length < 4) return sign * Number(`${m[2]}${frac === '' ? '' : `.${frac}`}`);
  const minutes = Number(frac.slice(0, 2));
  const seconds = Number(`${frac.slice(2, 4)}${frac.length > 4 ? `.${frac.slice(4)}` : ''}`);
  if (minutes >= 60 || seconds >= 60) return sign * Number(`${m[2]}.${frac}`);
  return sign * (deg + minutes / 60 + seconds / 3600);
}

/** Tizedes fok kiírása „fok.perc.másodperc” alakban (a bevitel megfordítása, hét tizedesjeggyel). */
export function formatGeographic(deg: number): string {
  const sign = deg < 0 ? '-' : '';
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let min = Math.floor((abs - d) * 60);
  let sec = ((abs - d) * 60 - min) * 60;
  // A kerekítés átfordulhat 60-ra.
  if (Number(sec.toFixed(5)) >= 60) {
    sec = 0;
    min += 1;
  }
  if (min >= 60) {
    min = 0;
    d += 1;
  }
  // A másodperc tizedespontja a tömör („áldecimális”) alakból kimarad: 19° 18′ 22.31643″ → 19.182231643.
  const secText = sec.toFixed(5).replace('.', '').padStart(7, '0');
  return `${sign}${d}.${String(min).padStart(2, '0')}${secText}`;
}

const num = (v: number | null, digits: number) => (v === null ? '' : fix(v, digits));

/** A jegyzék a GeoCalc adatbázis formátumában (pontszám, majd a típus szerinti három koordináta). */
export function registerToGeoCalcDb(rows: RegisterRow[]): string {
  const sorted = [...rows].sort((a, b) => compareIds(a.id, b.id));
  const lines = sorted.map((r) => {
    const d = kindMeta(r.kind).decimals;
    return `${r.id}, ${num(r.a, d[0])}, ${num(r.b, d[1])}, ${num(r.c, d[2])}`;
  });
  return lines.length === 0 ? '' : lines.join('\r\n') + '\r\n';
}

/** Csak Y, X, M pontok írhatók ki a GeoCalc fix szélességű .PYX formátumában. */
export function registerToPyx(rows: RegisterRow[]): string {
  const other = rows.find((r) => r.kind !== 'yxm');
  if (other) {
    throw new CalcError(
      `A(z) ${other.id || '(névtelen)'} pont típusa „${kindMeta(other.kind).label}”: a .PYX (fix szélességű) kimenethez minden pont Y, X, M típusú kell legyen.`,
    );
  }
  return (
    [...rows]
      .sort((a, b) => compareIds(a.id, b.id))
      .map((r) => {
        const m = `${num(r.c, 3)} `;
        const id = r.id.padEnd(Math.max(1, 48 - 12 - 15 - m.length));
        return `${id}${num(r.a, 3).padEnd(12)}${num(r.b, 3).padEnd(15)}${m}`;
      })
      .join('\r\n') + '\r\n'
  );
}

/** Földrajzi koordináták szöveges kiírása (a `19.182231643` alakban). */
export function registerToGeographicText(rows: RegisterRow[]): string {
  return (
    [...rows]
      .sort((a, b) => compareIds(a.id, b.id))
      .map((r) =>
        r.kind === 'geo'
          ? `${r.id} ${num(r.a, 9)} ${num(r.b, 9)} ${num(r.c, 3)}`
          : `${r.id} ${r.a === null ? '' : formatGeographic(r.a)} ${r.b === null ? '' : formatGeographic(r.b)} ${num(r.c, 3)}`,
      )
      .join('\r\n') + '\r\n'
  );
}

/** Az Y, X, M típusú sorok átalakítása a számítómag pontjaivá. */
export function registerToPoints(rows: RegisterRow[]): Point[] {
  return rows
    .filter((r) => r.kind === 'yxm' && r.a !== null && r.b !== null)
    .map((r) => ({ id: r.id, y: r.a!, x: r.b!, m: r.c, code: '0' }));
}

/** A jegyzék ellenőrzése: a pontszám nem üres és nem ismétlődik, a koordináták kitöltöttek. */
export function checkRegister(rows: RegisterRow[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const no = i + 1;
    if (r.id.trim() === '') issues.push(`${no}. sor: hiányzó pontszám.`);
    else if (seen.has(r.id)) issues.push(`${no}. sor: a(z) ${r.id} pontszám többször szerepel.`);
    seen.add(r.id);
    const cols = kindMeta(r.kind).columns;
    ([r.a, r.b] as const).forEach((v, k) => {
      if (v === null) issues.push(`${no}. sor (${r.id || '?'}): hiányzó ${cols[k]} koordináta.`);
    });
  });
  return issues;
}
