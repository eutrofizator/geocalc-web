import type { DrawingElement } from './drawing';
import { fix } from './format';
import { polygonArea, type Pt } from './geometry';
import { distributeArea, type NamedPt } from './parcel';
import { labelPoint } from './plan';
import type { Issue, Row, Section } from './types';

/**
 * Alrészletek és művelési ágak a területkimutatásban (8/2018. AM rendelet 12. § (2)–(3)): a
 * földrészleten belül az alrészletek területösszegének a földrészlet területével kell megegyeznie
 * (22. § (6)) – a négyzetméterre kerekített műszaki területekből területarányos ráosztással.
 * A meglévő alrészletek („alrészlet”) a változás előtti, a kialakulók („új alrészlet”) a változás utáni
 * állapotot adják; ha nincs kialakuló alrészlet, a változás utáni állapot a meglévő.
 */

type Sub = Extract<DrawingElement, { kind: 'sub' }>;

export interface SubRow {
  hrsz: string;
  letter: string;
  use: string;
  /** Minőségi osztály (üres, ha nincs megadva). */
  quality: string;
  technical: number;
  area: number;
  ring: NamedPt[];
}

export interface SubStatement {
  before: SubRow[];
  after: SubRow[];
  section: Section | null;
  issues: Issue[];
}

function inside(p: Pt, ring: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.x > p.x !== b.x > p.x && p.y < ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x) + a.y) c = !c;
  }
  return c;
}

function assign(subs: Sub[], parcels: { hrsz: string; ring: NamedPt[]; area: number }[], issues: Issue[]): SubRow[] {
  const rows: SubRow[] = [];
  for (const s of subs) {
    const at = labelPoint(s.ring);
    const parcel = parcels.find((p) => inside(at, p.ring));
    if (!parcel) {
      issues.push({ level: 'error', line: s.line, message: `Rajzelemek ${s.line}. sor: a(z) „${s.letter}” alrészlet egyik földrészletbe sem esik.` });
      continue;
    }
    rows.push({ hrsz: parcel.hrsz, letter: s.letter, use: s.use, quality: s.quality, technical: polygonArea(s.ring), area: 0, ring: s.ring });
  }
  // Földrészletenként a ráosztás a földrészlet területére (22. § (6)).
  for (const p of parcels) {
    const list = rows.filter((r) => r.hrsz === p.hrsz);
    if (list.length === 0) continue;
    const sum = list.reduce((s, r) => s + r.technical, 0);
    const parcelTech = polygonArea(p.ring);
    if (Math.abs(sum - parcelTech) > 1)
      issues.push({ level: 'warning', message: `${p.hrsz}: az alrészletek műszaki területe (${fix(sum, 2)} m²) nem fedi le a földrészletet (${fix(parcelTech, 2)} m²).` });
    const finals = distributeArea(
      list.map((r) => r.technical),
      p.area,
    );
    list.forEach((r, i) => (r.area = finals[i]!));
    const letters = list.map((r) => r.letter);
    const dup = letters.filter((l, i) => letters.indexOf(l) !== i);
    if (dup.length > 0) issues.push({ level: 'error', message: `${p.hrsz}: kétszer szereplő alrészlet-betűjel: ${dup.join(', ')}.` });
  }
  return rows.sort((a, b) => a.hrsz.localeCompare(b.hrsz, 'hu', { numeric: true }) || a.letter.localeCompare(b.letter));
}

export function subStatement(
  drawing: DrawingElement[],
  before: { hrsz: string; ring: NamedPt[]; area: number }[],
  after: { hrsz: string; ring: NamedPt[]; area: number }[],
): SubStatement {
  const subs = drawing.filter((d): d is Sub => d.kind === 'sub');
  const issues: Issue[] = [];
  if (subs.length === 0) return { before: [], after: [], section: null, issues };
  const old = subs.filter((s) => !s.isNew);
  const fresh = subs.filter((s) => s.isNew);
  const b = assign(old, before, issues);
  const a = fresh.length > 0 ? assign(fresh, after, issues) : assign(old, after, []);
  const n = Math.max(b.length, a.length);
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const x = b[i];
    const y = a[i];
    rows.push({
      cells: [x?.hrsz ?? '', x?.letter ?? '', x?.use ?? '', x?.quality ?? '', x ? Math.round(x.area).toLocaleString('hu-HU') : '', y?.hrsz ?? '', y?.letter ?? '', y?.use ?? '', y?.quality ?? '', y ? Math.round(y.area).toLocaleString('hu-HU') : ''],
      role: 'result',
    });
  }
  return {
    before: b,
    after: a,
    issues,
    section: {
      kind: 'sub-statement',
      title: 'Alrészletek és művelési ágak',
      columns: ['Előtte: hrsz', 'Jel', 'Művelési ág', 'Min. o.', 'Terület [m²]', 'Utána: hrsz', 'Jel', 'Művelési ág', 'Min. o.', 'Terület [m²]'],
      rows,
      footer: ['12. § (2)–(3); az alrészletek területösszege a földrészlet területe (22. § (6)), területarányos ráosztással.'],
    },
  };
}
