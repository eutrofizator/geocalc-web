import type { NamedPt } from './parcel';
import type { Issue } from './types';

/**
 * GNSS vevők (kontrollerek) koordináta-exportja: soronként egy pont, a pontszámmal, a két EOV
 * koordinátával, esetleg magassággal és kóddal. Az elválasztó (vessző, pontosvessző, tabulátor,
 * szóköz), a fejlécsor és az oszlopok sorrendje gyártónként más; az EOV tartományaiból (Y 400–950 km,
 * X 30–400 km) eldönthető, melyik oszlop melyik koordináta.
 *
 * A terepen mentett pont a kontrollerben gyakran utótagot kap (5001 → 5001_01, 5001_02): a
 * pontszám az aláhúzás előtti rész, az ismételt mérések átlaga adja a pontot.
 */

/** Az ismételt mentés utótagja: aláhúzás és legfeljebb három számjegy a pontszám végén. */
const SUFFIX = /^(.+?)_(\d{1,3})$/;

/** A pontszám az utótag nélkül (5001_01 → 5001). */
export function baseName(id: string): string {
  return SUFFIX.exec(id)?.[1] ?? id;
}

export interface GnssPoint extends NamedPt {
  z: number | null;
  code: string;
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

const isEovY = (v: number) => v >= 400000 && v <= 950000;
const isEovX = (v: number) => v >= 30000 && v <= 400000;
const NUM = /^[-+]?\d+(?:[.,]\d+)?$/;

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

/** A GNSS koordináta-export (TXT, CSV) beolvasása. */
export function parseGnssText(text: string): GnssParse {
  const issues: Issue[] = [];
  const raw = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l, i) => ({ text: l.replace(/#.*/, '').trim(), line: i + 1 }))
    .filter((l) => l.text !== '');
  if (raw.length === 0) return { points: [], issues: [{ level: 'error', message: 'Az állomány üres.' }], layout: '' };
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
  const nameCol = [...Array(width).keys()].find((c) => c !== yCol && c !== xCol) ?? 0;
  // A magasság hiányozhat egyes sorokból: csak a kitöltött mezőket nézzük.
  const heightLike = (c: number) => {
    const filled = rows.filter((r) => (r.f[c] ?? '') !== '' && r.f.some((v) => NUM.test(v)));
    return filled.length > 0 && filled.filter((r) => NUM.test(r.f[c]!) && Math.abs(num(r.f[c]!)) < 5000).length / filled.length >= 0.8;
  };
  const zCol = [...Array(width).keys()].find((c) => c > Math.min(yCol, xCol) && c !== yCol && c !== xCol && c !== nameCol && heightLike(c));
  const codeCol = [...Array(width).keys()]
    .reverse()
    .find((c) => c !== yCol && c !== xCol && c !== nameCol && c !== zCol && rows.some((r) => (r.f[c] ?? '') !== '' && !NUM.test(r.f[c]!)));

  const groups = new Map<string, { id: string; ys: number[]; xs: number[]; zs: number[]; code: string; sources: string[] }>();
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
    const id = baseName(name);
    const g = groups.get(id) ?? { id, ys: [], xs: [], zs: [], code: '', sources: [] };
    g.ys.push(num(yv));
    g.xs.push(num(xv));
    const zv = zCol !== undefined ? (r.f[zCol] ?? '') : '';
    if (NUM.test(zv)) g.zs.push(num(zv));
    if (!g.code && codeCol !== undefined) g.code = r.f[codeCol] ?? '';
    g.sources.push(name);
    groups.set(id, g);
  }

  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const points: GnssPoint[] = [...groups.values()].map((g) => {
    const y = avg(g.ys);
    const x = avg(g.xs);
    const spread = Math.max(...g.ys.map((v, i) => Math.hypot(v - y, g.xs[i]! - x)));
    return { id: g.id, y, x, z: g.zs.length > 0 ? avg(g.zs) : null, code: g.code, sources: g.sources, spread };
  });
  for (const p of points) {
    if (p.sources.length < 2) continue;
    const list = `${p.id} (${p.sources.join(', ')})`;
    if (p.spread > 0.05)
      issues.push({ level: 'warning', message: `${list}: az ismételt mérések ${p.spread.toFixed(3)} m-re térnek el az átlagtól – ellenőrizd.` });
    else issues.push({ level: 'info', message: `${list}: ${p.sources.length} mérés átlaga (legnagyobb eltérés ${p.spread.toFixed(3)} m).` });
  }

  const label = (c: number) => (c === nameCol ? 'pontszám' : c === yCol ? 'Y' : c === xCol ? 'X' : c === zCol ? 'Z' : c === codeCol ? 'kód' : '–');
  const layout = [...Array(width).keys()].map(label).join(', ');
  return { points, issues, layout };
}

/** A pontok a program saját jegyzékalakjában: pontszám Y X [Z] soronként. */
export function gnssToText(points: GnssPoint[], withZ = true): string {
  return points.map((p) => [p.id, p.y.toFixed(3), p.x.toFixed(3), ...(withZ && p.z !== null ? [p.z.toFixed(3)] : [])].join(' ')).join('\n');
}

/**
 * Pontok beírása egy meglévő jegyzékbe: az azonos pontszámú (utótag nélkül azonos) régi sorok
 * helyére az új pont kerül, a többi sor marad – így több napi mérés egymás után is betölthető.
 */
export function mergePointLines(text: string, points: GnssPoint[], withZ = true): string {
  const ids = new Set(points.map((p) => p.id));
  const kept = text
    .split(/\r?\n/)
    .filter((l) => {
      const first = l.replace(/#.*/, '').trim().split(/[\s,;]+/)[0] ?? '';
      return first === '' ? l.trim() !== '' : !ids.has(baseName(first));
    });
  const added = gnssToText(points, withZ);
  return [...kept, ...(added ? [added] : [])].join('\n');
}

/** A beolvasott pontok szétválasztása: a jegyzékben már meglévő (azonosító) és az új pontok. */
export function splitByKnown(points: GnssPoint[], known: Set<string>): { known: GnssPoint[]; fresh: GnssPoint[] } {
  return { known: points.filter((p) => known.has(p.id)), fresh: points.filter((p) => !known.has(p.id)) };
}
