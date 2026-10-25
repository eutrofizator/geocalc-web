import { fix } from './format';
import { distance } from './geometry';
import type { NamedPt, ParcelDef } from './parcel';
import type { Issue, Row, Section } from './types';

/**
 * Határpontok azonosítása – a térképi és a természetbeni állapot összehasonlítása a 8/2018. (VI. 29.)
 * AM rendelet 16–17. §-a és 7. melléklete szerint:
 * - 16. § (1) a): szabatosan felmért területen a szabatosan megjelölt határ ± 0,10 m, a meg nem jelölt ± 0,20 m;
 * - 16. § (1) c), d): EOV (A) vagy régi vetületi (B) alaptérkép digitális átalakításával készült
 *   adatbázisnál a határvonal helyzetében megengedett eltérés a méretarány szerint;
 * - 16. § (2): több földrészlet töréspontjainak folyamatos összemérése (mérési vonal) – C) és D) táblázat;
 * - 16. § (3): szabatosan megjelölt pontok koordinátákból számított és mért távolsága – E) táblázat;
 * - 17. §: digitális újfelméréssel, térképfelújítással készült adatbázis – F) táblázat (rendűség, tűrési osztály).
 */

export type MapKind = 'digital' | 'converted-eov' | 'converted-old' | 'precise';
export type Area = 'inner-precise' | 'inner' | 'outer';
export type PointOrder = 'R1' | 'R2' | 'R3' | 'R4';

/** A) és B) táblázat: [határvonal helyzete, földrészlet szélessége] [m]. */
const LINE_A: Record<string, [number, number]> = { '1000': [0.35, 0.45], '2000': [0.65, 0.9], '4000': [1.3, 1.8] };
const LINE_B: Record<string, [number, number]> = { '1000': [0.45, 0.6], '2000': [0.9, 1.2], '2880': [1.3, 1.7], '4000': [1.75, 2.4] };
/** C) és D) táblázat: egy földrészlet határvonalában, majd 50, 100, 200, 300 m-es mérési vonalon [m]. */
const RUN_C: Record<string, number[]> = { '1000': [0.35, 0.4, 0.45, 0.5, 0.55], '2000': [0.65, 0.8, 0.85, 0.9, 0.95], '4000': [1.3, 1.55, 1.65, 1.75, 1.9] };
const RUN_D: Record<string, number[]> = {
  '1000': [0.45, 0.5, 0.55, 0.6, 0.65],
  '2000': [0.9, 1.0, 1.1, 1.15, 1.2],
  '2880': [1.3, 1.45, 1.55, 1.65, 1.75],
  '4000': [1.75, 2.0, 2.2, 2.3, 2.45],
};
/** E) táblázat: 50, 100, 200, 300 m [m]. */
const DIST_E: Record<Area, number[]> = {
  'inner-precise': [0.2, 0.25, 0.35, 0.45],
  inner: [0.3, 0.4, 0.55, 0.65],
  outer: [0.4, 0.55, 0.8, 0.95],
};
/** F) táblázat: T11 (belterület), T21 (külterület) [m]. */
const POINT_F: Record<PointOrder, [number, number]> = { R1: [0.09, 0.15], R2: [0.15, 0.21], R3: [0.18, 0.3], R4: [0.24, 0.57] };
const LENGTHS = [50, 100, 200, 300];

/** Lineáris interpoláció a mérési vonal hossza szerint (50 m alatt az 50 m-es, 300 m fölött a 300 m-es érték). */
function byLength(len: number, values: number[]): number {
  if (len <= LENGTHS[0]!) return values[0]!;
  for (let i = 1; i < LENGTHS.length; i++)
    if (len <= LENGTHS[i]!) return values[i - 1]! + ((values[i]! - values[i - 1]!) * (len - LENGTHS[i - 1]!)) / (LENGTHS[i]! - LENGTHS[i - 1]!);
  return values.at(-1)!;
}

export interface CheckOptions {
  kind: MapKind;
  /** A digitalizált (eredeti) térkép méretaránya (A–D táblázat). */
  scale: string;
  area: Area;
  /** Az alapértelmezett rendűség (F táblázat), ha a mért pontnál nincs megadva. */
  order: PointOrder;
  /** Szabatosan megjelölt határ (16. § (1) aa)). */
  marked: boolean;
}

/** A határpont helyzetének megengedett eltérése; null, ha a táblázatban nincs érték. */
export function pointTolerance(o: CheckOptions, order: PointOrder = o.order): { limit: number | null; rule: string } {
  switch (o.kind) {
    case 'digital':
      return { limit: POINT_F[order][o.area === 'outer' ? 1 : 0], rule: `7. melléklet F) ${order}, ${o.area === 'outer' ? 'T21' : 'T11'}` };
    case 'converted-eov':
      return { limit: LINE_A[o.scale]?.[0] ?? null, rule: '16. § (1) c), 7. melléklet A)' };
    case 'converted-old':
      return { limit: LINE_B[o.scale]?.[0] ?? null, rule: '16. § (1) d), 7. melléklet B)' };
    case 'precise':
      return { limit: o.marked ? 0.1 : 0.2, rule: `16. § (1) ${o.marked ? 'aa)' : 'ab)'}` };
  }
}

/** A határvonal (két szomszédos határpont) hosszának megengedett eltérése. */
export function lengthTolerance(o: CheckOptions, len: number): { limit: number | null; rule: string } {
  switch (o.kind) {
    case 'converted-eov': {
      const v = RUN_C[o.scale];
      return { limit: v ? byLength(len, v.slice(1)) : null, rule: '16. § (2), 7. melléklet C)' };
    }
    case 'converted-old': {
      const v = RUN_D[o.scale];
      return { limit: v ? byLength(len, v.slice(1)) : null, rule: '16. § (2), 7. melléklet D)' };
    }
    default:
      return { limit: byLength(len, DIST_E[o.area]), rule: '16. § (3), 7. melléklet E)' };
  }
}

export interface MeasuredPt extends NamedPt {
  order?: PointOrder;
}

/** Mért pontok: pontszám, Y, X [, rendűség R1–R4]. */
export function parseMeasured(text: string): { points: Map<string, MeasuredPt>; issues: Issue[] } {
  const points = new Map<string, MeasuredPt>();
  const issues: Issue[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const f = line.split(/[\s,;]+/);
    const y = Number((f[1] ?? '').replace(',', '.'));
    const x = Number((f[2] ?? '').replace(',', '.'));
    // Fejlécsor (pl. „Psz. Y X Z”, „Pontszám;Y;X;…”): egyetlen szám sincs benne.
    if (!f.some((v) => /^-?\d+([.,]\d+)?$/.test(v))) return;
    if (f.length < 3 || !Number.isFinite(y) || !Number.isFinite(x)) {
      issues.push({ level: 'error', line: i + 1, message: `Mért pontok ${i + 1}. sor: „pontszám Y X [R1–R4]” kell.` });
      return;
    }
    const ord = f[3]?.toUpperCase();
    points.set(f[0]!, { id: f[0]!, y, x, order: ord === 'R1' || ord === 'R2' || ord === 'R3' || ord === 'R4' ? ord : undefined });
  });
  return { points, issues };
}

export interface PointCheck {
  id: string;
  dy: number;
  dx: number;
  d: number;
  limit: number | null;
  ok: boolean | null;
  rule: string;
}

export interface LineCheck {
  from: string;
  to: string;
  map: number;
  measured: number;
  diff: number;
  limit: number | null;
  ok: boolean | null;
  rule: string;
}

export interface BoundaryCheck {
  points: PointCheck[];
  lines: LineCheck[];
  unmatched: string[];
  sections: Section[];
  issues: Issue[];
}

const verdict = (ok: boolean | null) => (ok === null ? '–' : ok ? 'megfelel' : 'NEM FELEL MEG');

/** A térképi pontok (és a földrészletek határvonalai) összevetése a mért pontokkal. */
export function checkBoundary(map: Map<string, NamedPt>, parcels: ParcelDef[], measuredText: string, o: CheckOptions): BoundaryCheck {
  const { points: measured, issues } = parseMeasured(measuredText);
  const points: PointCheck[] = [];
  const unmatched: string[] = [];
  for (const m of measured.values()) {
    const p = map.get(m.id);
    if (!p) {
      unmatched.push(m.id);
      continue;
    }
    const { limit, rule } = pointTolerance(o, m.order);
    const dy = m.y - p.y;
    const dx = m.x - p.x;
    const d = Math.hypot(dy, dx);
    points.push({ id: m.id, dy, dx, d, limit, ok: limit === null ? null : d <= limit + 1e-9, rule });
  }

  // A földrészletek oldalai, amelyeknek mindkét végpontját mérték (minden oldal egyszer).
  const lines: LineCheck[] = [];
  const seen = new Set<string>();
  for (const pc of parcels)
    pc.points.forEach((a, i) => {
      const b = pc.points[(i + 1) % pc.points.length]!;
      const key = [a, b].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const pa = map.get(a);
      const pb = map.get(b);
      const ma = measured.get(a);
      const mb = measured.get(b);
      if (!pa || !pb || !ma || !mb) return;
      const mapLen = distance(pa, pb);
      const mLen = distance(ma, mb);
      const { limit, rule } = lengthTolerance(o, mLen);
      const diff = mLen - mapLen;
      lines.push({ from: a, to: b, map: mapLen, measured: mLen, diff, limit, ok: limit === null ? null : Math.abs(diff) <= limit + 1e-9, rule });
    });

  if (unmatched.length > 0) issues.push({ level: 'warning', message: `Térképi megfelelő nélküli mért pont(ok): ${unmatched.join(', ')}.` });
  const badP = points.filter((p) => p.ok === false);
  const badL = lines.filter((l) => l.ok === false);
  if (badP.length > 0)
    issues.push({ level: 'error', message: `Határpont-azonosítás: ${badP.map((p) => p.id).join(', ')} eltérése meghaladja a megengedettet – a térképi és a természetbeni állapot nem azonos.` });
  if (badL.length > 0) issues.push({ level: 'error', message: `Határvonal-hossz: ${badL.map((l) => `${l.from}–${l.to}`).join(', ')} eltérése meghaladja a megengedettet.` });

  const sections: Section[] = [];
  if (points.length > 0) {
    const rows: Row[] = points.map((p) => ({
      cells: [p.id, fix(p.dy, 3), fix(p.dx, 3), fix(p.d, 3), p.limit === null ? '–' : `± ${fix(p.limit, 2)}`, verdict(p.ok)],
      role: p.ok === false ? 'input' : 'result',
    }));
    sections.push({
      kind: 'boundary-points',
      title: 'Határpontok azonosítása – térképi és mért helyzet',
      columns: ['Pontszám', 'dY [m]', 'dX [m]', 'Eltérés [m]', 'Megengedett [m]', 'Azonosság'],
      rows,
      footer: [`Megengedett eltérés: 8/2018. AM rendelet ${[...new Set(points.map((p) => p.rule))].join('; ')}. dY, dX = mért − térképi.`],
    });
  }
  if (lines.length > 0) {
    const rows: Row[] = lines.map((l) => ({
      cells: [`${l.from} – ${l.to}`, fix(l.map, 3), fix(l.measured, 3), fix(l.diff, 3), l.limit === null ? '–' : `± ${fix(l.limit, 2)}`, verdict(l.ok)],
      role: l.ok === false ? 'input' : 'result',
    }));
    sections.push({
      kind: 'boundary-lines',
      title: 'Határvonalak hossza – térképi és mért',
      columns: ['Határvonal', 'Térképi [m]', 'Mért [m]', 'Eltérés [m]', 'Megengedett [m]', 'Azonosság'],
      rows,
      footer: [`Megengedett eltérés: 8/2018. AM rendelet ${lines[0]!.rule}; a mérési vonal hossza szerint (50–300 m között lineárisan).`],
    });
  }
  return { points, lines, unmatched, sections, issues };
}
