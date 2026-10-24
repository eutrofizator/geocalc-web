import { fix } from './format';
import { polygonArea, type Pt } from './geometry';
import type { Issue, Row, Section } from './types';

/**
 * Változási vázrajz – területszámítás, terület-összevetés és területosztás a 8/2018. (VI. 29.) AM
 * rendelet szerint:
 * - 18. § (1): a tulajdoni lapi és a műszaki terület összhangban van, ha az eltérés nem lépi túl a
 *   8. (EOTR) vagy a 9. (EOTR előtti vetület) melléklet értékének másfélszeresét; alrészlet, minőségi
 *   osztály, jog és tény területénél a kétszeresét;
 * - 22. § (1), (3): a változás előtti és utáni területek összege azonos; a végleges terület a
 *   négyzetméterre kerekített műszaki területből területarányos ráosztással adódik;
 * - 12. §: a területkimutatás változás előtti és utáni része, a területek összegével.
 */

export interface NamedPt extends Pt {
  id: string;
}

export type ToleranceAnnex = 8 | 9;
export type ToleranceKind = 'parcel' | 'sub';

export const ANNEX_SCALES: Record<ToleranceAnnex, { id: string; label: string }[]> = {
  8: [
    { id: '1000', label: '1:500, 1:1 000' },
    { id: '2000', label: '1:2 000' },
    { id: '4000', label: '1:4 000' },
  ],
  9: [
    { id: '1000', label: '1:1 000' },
    { id: '2000', label: '1:2 000' },
    { id: '2880', label: '1:2 880' },
    { id: '4000', label: '1:4 000' },
  ],
};

/** A szorzó a táblázat értékére (18. § (1) a)–c)). */
export const KIND_FACTOR: Record<ToleranceKind, number> = { parcel: 1.5, sub: 2 };

const HA = 10_000;
type TableRow = [number, ...(number | null)[]];

/** 8. melléklet: a területszámítás hibahatárai EOTR térkép digitális átalakításával készült adatbázisnál [m²]. */
const ANNEX8: TableRow[] = [
  [200, 5, 10, 19], [400, 7, 13, 26], [600, 9, 17, 33], [800, 10, 19, 37], [1000, 11, 22, 43],
  [1200, 12, 24, 46], [1400, 13, 25, 51], [1600, 14, 28, 54], [1800, 15, 30, 57], [2000, 17, 32, 61],
  [2500, 19, 35, 68], [3000, 20, 39, 75], [3500, 22, 42, 80], [4000, 23, 44, 86], [4500, 25, 47, 91],
  [5000, 26, 50, 97], [5500, 29, 53, 101], [6000, 30, 55, 107], [6500, 31, 57, 111], [7000, 32, 59, 113],
  [7500, 33, 62, 119], [8000, 35, 64, 123], [8500, 36, 66, 128], [9000, 37, 68, 131], [9500, 39, 70, 133],
  [10000, 40, 73, 139], [12500, 45, 82, 156], [15000, 51, 90, 172], [17500, 55, 99, 186], [20000, 59, 107, 200],
  [22500, 65, 114, 213], [25000, 68, 121, 226], [27500, 73, 128, 237], [30000, 77, 134, 249], [32500, 81, 141, 260],
  [35000, 85, 156, 270], [37500, 89, 157, 280], [40000, 92, 158, 290], [42500, 96, 164, 300], [45000, 100, 169, 310],
  [47500, 104, 173, 320], [50000, 107, 180, 330], [55000, 113, 191, 346], [60000, 120, 201, 363], [65000, 126, 211, 379],
  [70000, 133, 221, 395],
  [7.5 * HA, 140, 230, 410], [8 * HA, 146, 240, 426], [8.5 * HA, 152, 248, 441], [9 * HA, 158, 257, 455],
  [9.5 * HA, 164, 266, 470], [10 * HA, 170, 275, 483], [11 * HA, 182, 292, 510], [12 * HA, 194, 308, 537],
  [13 * HA, 205, 323, 562], [14 * HA, 216, 339, 586], [15 * HA, 227, 354, 610], [16 * HA, 238, 370, 634],
  [17 * HA, 249, 384, 657], [18 * HA, 259, 399, 679], [19 * HA, 270, 414, 701], [20 * HA, 279, 427, 723],
  [25 * HA, 330, 495, 825], [30 * HA, 378, 560, 921], [35 * HA, 426, 621, 1012], [40 * HA, 447, 681, 1099],
  [45 * HA, 528, 739, 1183], [50 * HA, 563, 796, 1264], [55 * HA, null, 853, 1342], [60 * HA, null, 907, 1419],
  [65 * HA, null, 961, 1493], [70 * HA, null, 1014, 1566], [75 * HA, null, 1067, 1648], [80 * HA, null, 1119, 1708],
  [85 * HA, null, 1169, 1778], [90 * HA, null, 1220, 1846], [95 * HA, null, 1270, 1914], [100 * HA, null, 1320, 1980],
  [120 * HA, null, 1515, 2239], [140 * HA, null, 1705, 2486], [160 * HA, null, 1891, 2726], [180 * HA, null, 2074, 2959],
  [200 * HA, null, 2254, 3187], [250 * HA, null, null, 3737], [300 * HA, null, null, 4266], [350 * HA, null, null, 4779],
  [400 * HA, null, null, 5280], [450 * HA, null, null, 5771], [500 * HA, null, null, 6251], [600 * HA, null, null, 7193],
  [700 * HA, null, null, 8113], [800 * HA, null, null, 9003],
];

/** 9. melléklet: EOTR előtti vetületi rendszerű térkép digitális átalakításával készült adatbázisnál [m²]. */
const ANNEX9: TableRow[] = [
  [1000, 20, 28, 33, 40], [1200, 24, 33, 40, 48], [1400, 28, 39, 46, 55], [1500, 30, 41, 50, 59],
  [1600, 32, 44, 53, 63], [1800, 36, 50, 59, 71], [2000, 40, 55, 64, 77], [2200, 44, 61, 70, 85],
  [2400, 48, 66, 77, 92], [2600, 52, 72, 83, 100], [2800, 56, 77, 89, 108], [3000, 60, 83, 96, 116],
  [3250, 65, 89, 104, 125], [3500, 70, 96, 112, 135], [3750, 75, 103, 120, 144], [4000, 80, 110, 128, 154],
  [4500, 90, 124, 144, 173], [5000, 95, 132, 155, 188], [5500, 104, 146, 170, 198], [6000, 114, 153, 180, 216],
  [6500, 124, 166, 195, 228], [7000, 133, 178, 210, 245], [7500, 135, 180, 214, 262], [8000, 144, 192, 228, 272],
  [8500, 149, 204, 242, 289], [9000, 154, 216, 256, 306], [9500, 159, 228, 271, 323], [1 * HA, 165, 230, 275, 330],
  [1.5 * HA, 206, 345, 412, 412], [2 * HA, 247, 350, 420, 550], [2.5 * HA, 288, 412, 525, 575], [3 * HA, 330, 495, 630, 660],
  [4 * HA, 415, 660, 840, 840], [5 * HA, 500, 725, 980, 1000], [10 * HA, 750, 1100, 1300, 1550],
  [15 * HA, 975, 1500, 1650, 1950], [30 * HA, 1350, 1950, 2400, 2700], [60 * HA, 2100, 2700, 3300, 3900],
  [100 * HA, null, 3500, 4500, 5500], [200 * HA, null, 4000, 7000, 9000], [400 * HA, null, null, 8000, 18000],
];

/**
 * A melléklet táblázatának értéke a területhez (a sorok között lineárisan interpolálva, a legkisebb
 * táblázati terület alatt a táblázat első értéke). null: a terület a táblázaton kívül esik.
 */
export function areaTolerance(area: number, annex: ToleranceAnnex, scale: string): number | null {
  const col = ANNEX_SCALES[annex].findIndex((s) => s.id === scale);
  if (col < 0) return null;
  const rows = (annex === 8 ? ANNEX8 : ANNEX9).filter((r) => r[col + 1] !== null);
  const first = rows[0];
  if (!first) return null;
  if (area <= first[0]) return first[col + 1]!;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!;
    const b = rows[i]!;
    if (area <= b[0]) {
      const va = a[col + 1]!;
      const vb = b[col + 1]!;
      return va + ((vb - va) * (area - a[0])) / (b[0] - a[0]);
    }
  }
  return null;
}

export interface AreaCheck {
  diff: number;
  /** A megengedett eltérés (a táblázat értéke · 1,5 vagy · 2); null, ha a táblázaton kívül esik. */
  limit: number | null;
  ok: boolean | null;
}

export function checkArea(registered: number, technical: number, annex: ToleranceAnnex, scale: string, kind: ToleranceKind): AreaCheck {
  const t = areaTolerance(registered, annex, scale);
  const limit = t === null ? null : t * KIND_FACTOR[kind];
  const diff = technical - registered;
  return { diff, limit, ok: limit === null ? null : Math.abs(diff) <= limit + 1e-9 };
}

/**
 * Területarányos ráosztás (22. § (3)): a négyzetméterre kerekített műszaki területekből kiindulva az
 * eltérést a területek arányában osztja el, és a legnagyobb maradékok szerint kerekít, így a
 * végleges területek összege pontosan a cél (a változás előtti tulajdoni lapi területek összege).
 */
export function distributeArea(technical: number[], target: number): number[] {
  const rounded = technical.map((a) => Math.round(a));
  const sum = rounded.reduce((s, a) => s + a, 0);
  const goal = Math.round(target);
  if (sum === 0) return rounded;
  const delta = goal - sum;
  const raw = rounded.map((a) => a + (delta * a) / sum);
  const out = raw.map((v) => Math.floor(v));
  let rest = goal - out.reduce((s, a) => s + a, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((p, q) => q[0] - p[0] || p[1] - q[1]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    out[i]! += 1;
    rest--;
  }
  return out;
}

/* ---------- bemenet ---------- */

export interface ParcelDef {
  hrsz: string;
  /** Tulajdoni lapi terület [m²] (csak a változás előtti oldalon). */
  registered: number | null;
  points: string[];
  line: number;
}

const splitFields = (line: string) => line.replace(/#.*/, '').trim();
const num = (s: string) => Number(s.replace(',', '.'));

/** Koordináták: pontszám, Y, X [, M] – szóközzel, vesszővel vagy pontosvesszővel tagolva. */
export function parsePoints(text: string): { points: Map<string, NamedPt>; issues: Issue[] } {
  const points = new Map<string, NamedPt>();
  const issues: Issue[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = splitFields(raw);
    if (!line) return;
    const f = line.split(/[\s,;]+/);
    const y = num(f[1] ?? '');
    const x = num(f[2] ?? '');
    if (f.length < 3 || !Number.isFinite(y) || !Number.isFinite(x)) {
      issues.push({ level: 'error', line: i + 1, message: `Koordináták ${i + 1}. sor: „pontszám Y X” kell.` });
      return;
    }
    if (points.has(f[0]!)) issues.push({ level: 'warning', line: i + 1, message: `Koordináták ${i + 1}. sor: a(z) ${f[0]} pont kétszer szerepel, az utolsó érvényes.` });
    points.set(f[0]!, { id: f[0]!, y, x });
  });
  return { points, issues };
}

/**
 * Földrészletek: „hrsz ; [tulajdoni lapi terület ;] pontok…”. A pontok szóközzel tagolva, a
 * kerület mentén; a kezdőpontot nem kell megismételni.
 */
export function parseParcels(text: string, withArea: boolean, label: string): { parcels: ParcelDef[]; issues: Issue[] } {
  const parcels: ParcelDef[] = [];
  const issues: Issue[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = splitFields(raw);
    if (!line) return;
    const f = line.split(';').map((s) => s.trim());
    const hrsz = f[0] ?? '';
    let registered: number | null = null;
    let pts: string;
    if (withArea) {
      registered = f[1] ? num(f[1]) : null;
      pts = f[2] ?? '';
      if (registered !== null && !Number.isFinite(registered)) {
        issues.push({ level: 'error', line: i + 1, message: `${label} ${i + 1}. sor: érvénytelen terület („${f[1]}”).` });
        return;
      }
    } else pts = f[1] ?? '';
    const points = pts.split(/[\s,]+/).filter(Boolean);
    if (points.length > 1 && points[0] === points.at(-1)) points.pop();
    if (!hrsz || points.length < 3) {
      issues.push({ level: 'error', line: i + 1, message: `${label} ${i + 1}. sor: „hrsz ; ${withArea ? 'terület ; ' : ''}legalább 3 pont” kell.` });
      return;
    }
    parcels.push({ hrsz, registered, points, line: i + 1 });
  });
  return { parcels, issues };
}

function resolve(p: ParcelDef, points: Map<string, NamedPt>, issues: Issue[], label: string): NamedPt[] | null {
  const missing = p.points.filter((id) => !points.has(id));
  if (missing.length > 0) {
    issues.push({ level: 'error', line: p.line, message: `${label} ${p.hrsz}: ismeretlen pont(ok): ${missing.join(', ')}.` });
    return null;
  }
  return p.points.map((id) => points.get(id)!);
}

/* ---------- területkimutatás ---------- */

export interface StatementInput {
  coordinates: string;
  before: string;
  after: string;
  annex: ToleranceAnnex;
  scale: string;
  kind: ToleranceKind;
}

export interface StatementBefore {
  hrsz: string;
  registered: number | null;
  technical: number;
  check: AreaCheck | null;
}

export interface StatementAfter {
  hrsz: string;
  technical: number;
  rounded: number;
  final: number;
}

export interface Statement {
  before: StatementBefore[];
  after: StatementAfter[];
  registeredSum: number;
  technicalBefore: number;
  technicalAfter: number;
  issues: Issue[];
  sections: Section[];
}

const m2 = (a: number) => Math.round(a).toLocaleString('hu-HU');
const signed = (a: number, d = 0) => (a > 0 ? '+' : '') + fix(a, d);

export function areaStatement(input: StatementInput): Statement {
  const pts = parsePoints(input.coordinates);
  const pb = parseParcels(input.before, true, 'Változás előtt');
  const pa = parseParcels(input.after, false, 'Változás után');
  const issues = [...pts.issues, ...pb.issues, ...pa.issues];

  const before: StatementBefore[] = [];
  for (const p of pb.parcels) {
    const poly = resolve(p, pts.points, issues, 'Változás előtt');
    if (!poly) continue;
    const technical = polygonArea(poly);
    before.push({
      hrsz: p.hrsz,
      registered: p.registered,
      technical,
      check: p.registered === null ? null : checkArea(p.registered, technical, input.annex, input.scale, input.kind),
    });
  }
  const afterRaw: { hrsz: string; technical: number }[] = [];
  for (const p of pa.parcels) {
    const poly = resolve(p, pts.points, issues, 'Változás után');
    if (poly) afterRaw.push({ hrsz: p.hrsz, technical: polygonArea(poly) });
  }

  const registeredSum = before.reduce((s, b) => s + (b.registered ?? Math.round(b.technical)), 0);
  const technicalBefore = before.reduce((s, b) => s + b.technical, 0);
  const technicalAfter = afterRaw.reduce((s, a) => s + a.technical, 0);
  const finals = distributeArea(
    afterRaw.map((a) => a.technical),
    registeredSum,
  );
  const after: StatementAfter[] = afterRaw.map((a, i) => ({ ...a, rounded: Math.round(a.technical), final: finals[i]! }));

  for (const b of before) {
    if (b.registered === null) issues.push({ level: 'warning', message: `${b.hrsz}: nincs tulajdoni lapi terület – a kerekített műszaki területtel számol.` });
    else if (b.check?.ok === false)
      issues.push({ level: 'error', message: `${b.hrsz}: a műszaki és a tulajdoni lapi terület eltérése (${signed(b.check.diff)} m²) meghaladja a hibahatárt (± ${fix(b.check.limit!, 0)} m²) – területszámítási hiba vizsgálata szükséges.` });
    else if (b.check?.ok === null) issues.push({ level: 'warning', message: `${b.hrsz}: a terület a melléklet táblázatán kívül esik, a hibahatár nem állapítható meg.` });
  }
  if (before.length > 0 && after.length > 0 && Math.abs(technicalBefore - technicalAfter) > 0.5)
    issues.push({
      level: 'error',
      message: `A változás előtti (${fix(technicalBefore, 2)} m²) és utáni (${fix(technicalAfter, 2)} m²) műszaki területek összege eltér: a földrészletek kerülete nem ugyanazt a területet fedi le.`,
    });

  const sections: Section[] = [];
  const scaleLabel = ANNEX_SCALES[input.annex].find((s) => s.id === input.scale)?.label ?? input.scale;
  if (before.length > 0) {
    const rows: Row[] = before.map((b) => ({
      cells: [
        b.hrsz,
        b.registered === null ? '–' : m2(b.registered),
        fix(b.technical, 2),
        b.check ? signed(b.check.diff, 2) : '–',
        b.check?.limit != null ? `± ${fix(b.check.limit, 0)}` : '–',
        b.check?.ok == null ? '–' : b.check.ok ? 'megfelel' : 'NEM FELEL MEG',
      ],
      role: 'input',
    }));
    rows.push({ cells: ['Összesen', m2(registeredSum), fix(technicalBefore, 2), signed(technicalBefore - registeredSum, 2), '', ''], role: 'result' });
    sections.push({
      kind: 'parcel-before',
      title: 'Változás előtti állapot – terület-összevetés',
      columns: ['Hrsz', 'Tulajdoni lapi terület [m²]', 'Műszaki terület [m²]', 'Eltérés [m²]', 'Hibahatár [m²]', 'Összhang'],
      rows,
      footer: [
        `Hibahatár: a 8/2018. AM rendelet ${input.annex}. mellékletének értéke (${scaleLabel}) · ${fix(KIND_FACTOR[input.kind], 1).replace('.', ',')} ` +
          `(18. § (1) ${input.kind === 'parcel' ? (input.annex === 8 ? 'a)' : 'b)') : 'c)'}); a táblázat sorai között lineáris interpolációval.`,
      ],
    });
  }
  if (after.length > 0) {
    const rows: Row[] = after.map((a) => ({
      cells: [a.hrsz, fix(a.technical, 2), m2(a.rounded), signed(a.final - a.rounded), m2(a.final)],
      role: 'result',
    }));
    rows.push({
      cells: ['Összesen', fix(technicalAfter, 2), m2(after.reduce((s, a) => s + a.rounded, 0)), signed(registeredSum - after.reduce((s, a) => s + a.rounded, 0)), m2(registeredSum)],
      role: 'base',
    });
    sections.push({
      kind: 'parcel-after',
      title: 'Változás utáni állapot – területarányos ráosztás',
      columns: ['Hrsz', 'Műszaki terület [m²]', 'Kerekített [m²]', 'Ráosztás [m²]', 'Végleges terület [m²]'],
      rows,
      footer: ['22. § (3): a négyzetméterre kerekített műszaki területből területarányos ráosztással; a végleges területek összege a változás előtti tulajdoni lapi területek összege.'],
    });
  }
  if (before.length > 0 || after.length > 0) {
    const n = Math.max(before.length, after.length);
    const rows: Row[] = [];
    for (let i = 0; i < n; i++) {
      const b = before[i];
      const a = after[i];
      rows.push({ cells: [b?.hrsz ?? '', b ? m2(b.registered ?? Math.round(b.technical)) : '', a?.hrsz ?? '', a ? m2(a.final) : ''] });
    }
    const afterSum = after.reduce((s, a) => s + a.final, 0);
    rows.push({ cells: ['Összesen', m2(registeredSum), '', m2(afterSum)], role: 'result' });
    sections.push({
      kind: 'parcel-statement',
      title: 'Területkimutatás',
      columns: ['Változás előtt: hrsz', 'Terület [m²]', 'Változás után: hrsz', 'Terület [m²]'],
      rows,
      footer: [
        after.length > 0 && afterSum === registeredSum
          ? 'A változás előtti és utáni területek összege azonos (22. § (1)).'
          : 'A változás előtti és utáni területek összege nem azonos (22. § (1))!',
      ],
    });
  }
  return { before, after, registeredSum, technicalBefore, technicalAfter, issues, sections };
}

/* ---------- területosztás ---------- */

interface ClipPt extends Pt {
  id: string | null;
  /** Metszéspont esetén a sokszög oldalának sorszáma. */
  edge?: number;
}

/** A sokszög vágása az s(p) ≥ c félsíkkal (Sutherland–Hodgman); a metszéspontok az oldal sorszámát viszik. */
function clip(poly: NamedPt[], s: (p: Pt) => number, c: number, keepAbove: boolean): ClipPt[] {
  const out: ClipPt[] = [];
  const inside = (p: Pt) => (keepAbove ? s(p) >= c : s(p) <= c);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const pin = inside(p);
    const qin = inside(q);
    if (pin) out.push({ y: p.y, x: p.x, id: p.id });
    if (pin !== qin) {
      const sp = s(p);
      const sq = s(q);
      const t = (c - sp) / (sq - sp);
      out.push({ y: p.y + t * (q.y - p.y), x: p.x + t * (q.x - p.x), id: null, edge: i });
    }
  }
  return out;
}

export interface DivisionResult {
  method: 'parallel' | 'vertex';
  target: number;
  parts: { hrsz: string; points: NamedPt[]; area: number }[];
  newPoints: NamedPt[];
  issues: Issue[];
}

function finishParts(parts: ClipPt[][], names: [string, string], prefix: string, firstNo: number): { parts: DivisionResult['parts']; newPoints: NamedPt[] } {
  const byEdge = new Map<number, NamedPt>();
  const newPoints: NamedPt[] = [];
  // Az új pontok a metszett oldalak sorrendjében kapnak pontszámot (mindkét részben ugyanazt).
  const edges = [...new Set(parts.flat().filter((p) => p.id === null).map((p) => p.edge!))].sort((a, b) => a - b);
  for (const e of edges) {
    const p = parts.flat().find((q) => q.id === null && q.edge === e)!;
    const np = { id: `${prefix}${firstNo + newPoints.length}`, y: p.y, x: p.x };
    byEdge.set(e, np);
    newPoints.push(np);
  }
  return {
    parts: parts.map((poly, i) => {
      const points = poly.map((p) => (p.id === null ? byEdge.get(p.edge!)! : { id: p.id, y: p.y, x: p.x }));
      return { hrsz: names[i]!, points, area: polygonArea(points) };
    }),
    newPoints,
  };
}

/**
 * Leválasztás az A–B egyenessel (általában a földrészlet egyik oldalával) párhuzamos osztóvonallal: a
 * kért területű rész az A–B egyenes mellett marad. A vonal helyét felezéssel keresi.
 */
export function divideParallel(
  poly: NamedPt[],
  a: Pt,
  b: Pt,
  target: number,
  names: [string, string],
  prefix: string,
  firstNo = 1,
): DivisionResult {
  const issues: Issue[] = [];
  const len = Math.hypot(b.y - a.y, b.x - a.x);
  if (len === 0) throw new Error('Az osztóvonal irányát megadó két pont egybeesik.');
  const total = polygonArea(poly);
  if (!(target > 0 && target < total)) throw new Error(`A leválasztandó terület 0 és a földrészlet területe (${fix(total, 2)} m²) közé kell essen.`);
  // Előjeles távolság az AB egyenestől, a földrészlet felé pozitív (Y kelet, X észak).
  const dist = (p: Pt) => ((b.y - a.y) * (p.x - a.x) - (b.x - a.x) * (p.y - a.y)) / len;
  const far = poly.reduce((m, p) => (Math.abs(dist(p)) > Math.abs(dist(m)) ? p : m), poly[0]!);
  const sg = Math.sign(dist(far)) || 1;
  const s = (p: Pt) => sg * dist(p);
  let lo = Math.min(...poly.map(s));
  let hi = Math.max(...poly.map(s));
  for (let i = 0; i < 200 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2;
    if (polygonArea(clip(poly, s, mid, false)) < target) lo = mid;
    else hi = mid;
  }
  const c = (lo + hi) / 2;
  const keep = clip(poly, s, c, false);
  const rest = clip(poly, s, c, true);
  const res = finishParts([keep, rest], names, prefix, firstNo);
  if (res.newPoints.length > 2)
    issues.push({ level: 'warning', message: `Az osztóvonal ${res.newPoints.length} helyen metszi a határt (nem konvex földrészlet) – ellenőrizd a részeket.` });
  return { method: 'parallel', target, ...res, issues };
}

/**
 * Leválasztás a földrészlet egy töréspontján átmenő osztóvonallal: a P pontból a kerület mentén
 * (a megadott pontsorrendben) haladva a kért területű legyezőt vágja le; az új pont a megfelelő oldalra
 * esik. A P pontból a földrészletnek „beláthatónak” kell lennie (konvex vagy csillag alakú rész).
 */
export function divideThroughVertex(poly: NamedPt[], pivotId: string, target: number, names: [string, string], prefix: string, firstNo = 1): DivisionResult {
  const k = poly.findIndex((p) => p.id === pivotId);
  if (k < 0) throw new Error(`A(z) ${pivotId} pont nem töréspontja a földrészletnek.`);
  const total = polygonArea(poly);
  if (!(target > 0 && target < total)) throw new Error(`A leválasztandó terület 0 és a földrészlet területe (${fix(total, 2)} m²) közé kell essen.`);
  const ring = [...poly.slice(k), ...poly.slice(0, k)];
  const P = ring[0]!;
  const tri = (u: Pt, v: Pt) => ((u.y - P.y) * (v.x - P.x) - (v.y - P.y) * (u.x - P.x)) / 2;
  const sign = Math.sign(ring.reduce((s, p, i) => s + (i > 0 && i < ring.length - 1 ? tri(p, ring[i + 1]!) : 0), 0)) || 1;
  let acc = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    const u = ring[i]!;
    const v = ring[i + 1]!;
    const t = sign * tri(u, v);
    if (acc + t >= target - 1e-9) {
      const f = t === 0 ? 0 : (target - acc) / t;
      const q: NamedPt = { id: `${prefix}${firstNo}`, y: u.y + f * (v.y - u.y), x: u.x + f * (v.x - u.x) };
      const onVertex = f >= 1 - 1e-9;
      const part1 = onVertex ? ring.slice(0, i + 2) : [...ring.slice(0, i + 1), q];
      const part2 = onVertex ? [P, ...ring.slice(i + 1)] : [P, q, ...ring.slice(i + 1)];
      return {
        method: 'vertex',
        target,
        parts: [
          { hrsz: names[0], points: part1, area: polygonArea(part1) },
          { hrsz: names[1], points: part2, area: polygonArea(part2) },
        ],
        newPoints: onVertex ? [] : [q],
        issues: [],
      };
    }
    acc += t;
  }
  throw new Error('A területet nem sikerült leválasztani (a P pontból a földrészlet nem látható be).');
}

export function divisionSection(parcel: string, r: DivisionResult, how: string): Section[] {
  const out: Section[] = [
    {
      kind: 'parcel-division',
      title: `Területosztás – ${parcel}`,
      columns: ['Rész', 'Pontok', 'Terület [m²]'],
      rows: [
        ...r.parts.map((p) => ({ cells: [p.hrsz, p.points.map((q) => q.id).join(' '), fix(p.area, 2)], role: 'result' as const })),
        { cells: ['Összesen', '', fix(r.parts.reduce((s, p) => s + p.area, 0), 2)], role: 'base' },
      ],
      footer: [`${how}; kért terület: ${fix(r.target, 2)} m², eltérés: ${signed(r.parts[0]!.area - r.target, 4)} m².`],
    },
  ];
  if (r.newPoints.length > 0)
    out.push({
      kind: 'parcel-new-points',
      title: 'Az osztóvonal új pontjai',
      columns: ['Pontszám', 'Y', 'X'],
      rows: r.newPoints.map((p) => ({ cells: [p.id, fix(p.y, 2), fix(p.x, 2)], role: 'result' })),
    });
  return out;
}
