import { parseGsiCoordinates } from './field-book';
import type { NamedPt } from './parcel';
import type { Issue } from './types';

/**
 * GNSS vevők (kontrollerek) koordináta-exportja: soronként egy pont, a pontszámmal, a két EOV
 * koordinátával, esetleg magassággal és kóddal. Az elválasztó (vessző, pontosvessző, tabulátor,
 * szóköz), a fejlécsor és az oszlopok sorrendje gyártónként más; az EOV tartományaiból (Y 400–950 km,
 * X 30–400 km) eldönthető, melyik oszlop melyik koordináta. A Leica GSI koordinátablokkjai (11
 * pontszám, 81 Y, 82 X, 83 magasság) ugyanígy olvashatók.
 *
 * A terepen mentett pont a kontrollerben gyakran utótagot kap (5001 → 5001_01, 5001_02): a
 * pontszám az aláhúzás előtti rész, az ismételt mérések átlaga adja a pontot. A betűs utótag
 * (1001_E) a pont ellenőrző mérése: nem átlagolódik, hanem az eltérése számít.
 *
 * A kód a pont szerepe: „ap” alappont, „fix” a földhivatali (terv) koordináta, „kit” a kitűzött
 * (mért) pont. Csak az azonos szerepű mérések átlagolódnak.
 */

/** Az ismételt mentés utótagja: aláhúzás és legfeljebb három számjegy a pontszám végén. */
const SUFFIX = /^(.+?)_(\d{1,3})$/;
/** Ellenőrző mérés: számjegyes pontszám, aláhúzás és egy betű (pl. 1001_E). */
const CHECK = /^(\d+)_([A-Za-z])$/;

/** A pontszám az utótag nélkül (5001_01 → 5001, 1001_E → 1001). */
export function baseName(id: string): string {
  return SUFFIX.exec(id)?.[1] ?? CHECK.exec(id)?.[1] ?? id;
}

/** A pont szerepe a kódja szerint. */
export type PointRole = 'base' | 'reference' | 'staked' | 'check' | 'other';

export function pointRole(code: string): Exclude<PointRole, 'check'> {
  const c = code.trim().toLowerCase();
  if (/^(ap|alappont|bp)$/.test(c)) return 'base';
  if (/^(fix|ref|terv)$/.test(c)) return 'reference';
  if (/^(kit|kitűzött|kituzott)$/.test(c)) return 'staked';
  return 'other';
}

export interface GnssPoint extends NamedPt {
  z: number | null;
  code: string;
  role: PointRole;
  /** Az eredeti pontszámok (utótaggal), amelyekből a pont átlagolódott. */
  sources: string[];
  /** Ismételt mérésnél a legnagyobb eltérés az átlagtól [m]. */
  spread: number;
}

export interface GnssParse {
  points: GnssPoint[];
  issues: Issue[];
  /** A felismert oszlopsorrend leírása (pl. „pontszám, X, Y, Z, kód”). */
  layout: string;
}

interface CoordRecord {
  name: string;
  y: number;
  x: number;
  z: number | null;
  code: string;
}

const isEovY = (v: number) => v >= 400000 && v <= 950000;
const isEovX = (v: number) => v >= 30000 && v <= 400000;
const NUM = /^[-+]?\d+(?:[.,]\d+)?$/;
const GSI = /^\*?\d{2}[.\d]{4}[+-]/;

function splitLine(line: string, delim: RegExp): string[] {
  return line.split(delim).map((s) => s.trim().replace(/^"(.*)"$/, '$1'));
}

/** Az elválasztó: ami a legtöbb sorban azonos számú (legalább három) mezőt ad. */
function detectDelimiter(lines: string[]): RegExp {
  const cands: RegExp[] = [/\t/, /;/, /,/, /\s+/];
  let best = cands[3]!;
  let bestScore = -1;
  for (const d of cands) {
    const counts = lines.map((l) => splitLine(l, d).length).filter((n) => n >= 3);
    if (counts.length === 0) continue;
    // Vessző mint elválasztó csak akkor, ha nem tizedesvessző (a mezők száma soronként állandó).
    const mode = [...counts].sort((a, b) => counts.filter((c) => c === b).length - counts.filter((c) => c === a).length)[0]!;
    const score = counts.filter((c) => c === mode).length;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

const num = (s: string) => Number(s.replace(',', '.'));

/** A GNSS koordináta-export (TXT, CSV) vagy a Leica GSI koordinátaállomány beolvasása. */
export function parseGnssText(text: string): GnssParse {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const first = lines.find((l) => l.trim() !== '')?.trim() ?? '';
  if (first === '') return { points: [], issues: [{ level: 'error', message: 'Az állomány üres.' }], layout: '' };
  if (GSI.test(first)) {
    const recs = parseGsiCoordinates(text);
    if (recs.length === 0)
      return { points: [], issues: [{ level: 'error', message: 'A GSI állományban nincs koordinátablokk (81, 82 szó).' }], layout: '' };
    const issues: Issue[] = [];
    return { ...group(recs, issues), layout: 'Leica GSI (11 pontszám, 81 Y, 82 X, 83 Z)' };
  }
  return parseColumns(lines);
}

function parseColumns(source: string[]): GnssParse {
  const issues: Issue[] = [];
  const raw = source.map((l, i) => ({ text: l.replace(/#.*/, '').trim(), line: i + 1 })).filter((l) => l.text !== '');
  const delim = detectDelimiter(raw.map((l) => l.text));
  const rows = raw.map((l) => ({ f: splitLine(l.text, delim), line: l.line }));

  // Oszlopok: Y és X az EOV tartomány szerint, a soroknak legalább a 80 %-ában.
  const width = Math.max(...rows.map((r) => r.f.length));
  const share = (test: (v: number) => boolean, c: number) => {
    const data = rows.filter((r) => r.f.some((v) => NUM.test(v)));
    return data.filter((r) => NUM.test(r.f[c] ?? '') && test(num(r.f[c]!))).length / Math.max(1, data.length);
  };
  // A pontszám is eshet a tartományba (pl. 50001); a koordinátát a tizedesjegy jellemzi, és az Y mellett áll.
  const decimals = (c: number) => rows.filter((r) => /[.,]\d/.test(r.f[c] ?? '')).length;
  const cols = [...Array(width).keys()];
  const pickCol = (test: (v: number) => boolean, not: number, near: number) =>
    cols
      .filter((c) => c !== not && share(test, c) >= 0.8)
      .sort((a, b) => decimals(b) - decimals(a) || Math.abs(a - near) - Math.abs(b - near))[0] ?? -1;
  const yCol = pickCol(isEovY, -1, 1);
  const xCol = yCol < 0 ? -1 : pickCol((v) => isEovX(v) && !isEovY(v), yCol, yCol);
  if (yCol < 0 || xCol < 0)
    return {
      points: [],
      issues: [{ level: 'error', message: 'Nem találhatók EOV koordináták (Y 400 000–950 000, X 30 000–400 000 m) az állományban.' }],
      layout: '',
    };
  // A pontszám az első nem koordináta oszlop; a magasság a koordináták utáni első számoszlop; a kód az utolsó szöveges.
  const nameCol = cols.find((c) => c !== yCol && c !== xCol) ?? 0;
  // A magasság hiányozhat egyes sorokból: csak a kitöltött mezőket nézzük.
  const heightLike = (c: number) => {
    const filled = rows.filter((r) => (r.f[c] ?? '') !== '' && r.f.some((v) => NUM.test(v)));
    return filled.length > 0 && filled.filter((r) => NUM.test(r.f[c]!) && Math.abs(num(r.f[c]!)) < 5000).length / filled.length >= 0.8;
  };
  const zCol = cols.find((c) => c > Math.min(yCol, xCol) && c !== yCol && c !== xCol && c !== nameCol && heightLike(c));
  const codeCol = [...cols]
    .reverse()
    .find((c) => c !== yCol && c !== xCol && c !== nameCol && c !== zCol && rows.some((r) => (r.f[c] ?? '') !== '' && !NUM.test(r.f[c]!)));

  const recs: CoordRecord[] = [];
  for (const r of rows) {
    const yv = r.f[yCol] ?? '';
    const xv = r.f[xCol] ?? '';
    if (!NUM.test(yv) || !NUM.test(xv)) {
      // Fejlécsor: egyetlen szám sincs benne; minden más hibás sor.
      if (r.f.some((v) => NUM.test(v))) issues.push({ level: 'warning', line: r.line, message: `${r.line}. sor: nincs benne Y és X koordináta, kihagyva.` });
      continue;
    }
    const name = r.f[nameCol] ?? '';
    if (name === '') {
      issues.push({ level: 'warning', line: r.line, message: `${r.line}. sor: hiányzik a pontszám, kihagyva.` });
      continue;
    }
    const zv = zCol !== undefined ? (r.f[zCol] ?? '') : '';
    recs.push({ name, y: num(yv), x: num(xv), z: NUM.test(zv) ? num(zv) : null, code: codeCol !== undefined ? (r.f[codeCol] ?? '') : '' });
  }

  const label = (c: number) => (c === nameCol ? 'pontszám' : c === yCol ? 'Y' : c === xCol ? 'X' : c === zCol ? 'Z' : c === codeCol ? 'kód' : '–');
  return { ...group(recs, issues), layout: cols.map(label).join(', ') };
}

/** Pontonként és szerepenként összevont mérések; az ellenőrző mérések eltérése megjegyzésként. */
function group(recs: CoordRecord[], issues: Issue[]): { points: GnssPoint[]; issues: Issue[] } {
  const groups = new Map<string, { id: string; role: PointRole; ys: number[]; xs: number[]; zs: number[]; code: string; sources: string[] }>();
  for (const r of recs) {
    const id = baseName(r.name);
    const role: PointRole = CHECK.test(r.name) ? 'check' : pointRole(r.code);
    const key = `${id}|${role}`;
    const g = groups.get(key) ?? { id, role, ys: [], xs: [], zs: [], code: r.code, sources: [] };
    g.ys.push(r.y);
    g.xs.push(r.x);
    if (r.z !== null) g.zs.push(r.z);
    g.sources.push(r.name);
    groups.set(key, g);
  }

  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const points: GnssPoint[] = [...groups.values()].map((g) => {
    const y = avg(g.ys);
    const x = avg(g.xs);
    const spread = Math.max(...g.ys.map((v, i) => Math.hypot(v - y, g.xs[i]! - x)));
    return { id: g.id, y, x, z: g.zs.length > 0 ? avg(g.zs) : null, code: g.code, role: g.role, sources: g.sources, spread };
  });
  for (const p of points) {
    if (p.role === 'check') {
      const ref = points.find((q) => q.id === p.id && q.role !== 'check');
      issues.push(
        ref
          ? {
              level: Math.hypot(p.y - ref.y, p.x - ref.x) > 0.05 ? 'warning' : 'info',
              message: `${p.sources.join(', ')}: a(z) ${p.id} pont ellenőrző mérése, eltérés dY = ${(p.y - ref.y).toFixed(3)}, dX = ${(p.x - ref.x).toFixed(3)}, d = ${Math.hypot(p.y - ref.y, p.x - ref.x).toFixed(3)} m.`,
            }
          : { level: 'warning', message: `${p.sources.join(', ')}: ellenőrző mérés, de a(z) ${p.id} pont nincs az állományban.` },
      );
      continue;
    }
    if (p.sources.length < 2) continue;
    const list = `${p.id} (${p.sources.join(', ')})`;
    if (p.spread > 0.05)
      issues.push({ level: 'warning', message: `${list}: az ismételt mérések ${p.spread.toFixed(3)} m-re térnek el az átlagtól – ellenőrizd.` });
    else issues.push({ level: 'info', message: `${list}: ${p.sources.length} mérés átlaga (legnagyobb eltérés ${p.spread.toFixed(3)} m).` });
  }
  return { points, issues };
}

/** A pontok a program saját jegyzékalakjában: pontszám Y X [Z [jel]] soronként (az alappont jele „AP”). */
export function gnssToText(points: GnssPoint[], withZ = true): string {
  return points
    .map((p) => {
      const z = withZ && p.z !== null ? p.z.toFixed(3) : '-';
      const tag = p.role === 'base' ? 'AP' : '';
      return [p.id, p.y.toFixed(3), p.x.toFixed(3), ...(tag ? [z, tag] : z !== '-' ? [z] : [])].join(' ');
    })
    .join('\n');
}

/**
 * Pontok beírása egy meglévő jegyzékbe: az azonos pontszámú (utótag nélkül azonos) régi sorok
 * helyére az új pont kerül, a többi sor marad – így több napi mérés egymás után is betölthető.
 */
export function mergePointLines(text: string, points: GnssPoint[], withZ = true): string {
  const ids = new Set(points.map((p) => p.id));
  const kept = text.split(/\r?\n/).filter((l) => {
    const head = l.replace(/#.*/, '').trim().split(/[\s,;]+/)[0] ?? '';
    return head === '' ? l.trim() !== '' : !ids.has(baseName(head));
  });
  const added = gnssToText(points, withZ);
  return [...kept, ...(added ? [added] : [])].join('\n');
}

/** A beolvasott pontok szétválasztása: a jegyzékben már meglévő (azonosító) és az új pontok. */
export function splitByKnown(points: GnssPoint[], known: Set<string>): { known: GnssPoint[]; fresh: GnssPoint[] } {
  return { known: points.filter((p) => known.has(p.id)), fresh: points.filter((p) => !known.has(p.id)) };
}

/**
 * A munkaterülettől messze eső pontok (pl. a műszer kezdő, tájékozatlan álláspontja): a többi pont
 * mediánjától `limit` méternél távolabbiak.
 */
export function farPoints(points: NamedPt[], around: NamedPt[], limit = 2000): Set<string> {
  const ref = around.length > 0 ? around : points;
  if (ref.length === 0) return new Set();
  const med = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)]!;
  const cy = med(ref.map((p) => p.y));
  const cx = med(ref.map((p) => p.x));
  return new Set(points.filter((p) => Math.hypot(p.y - cy, p.x - cx) > limit).map((p) => p.id));
}
