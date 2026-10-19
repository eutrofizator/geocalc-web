import { fix } from '../format';
import { intersectCircles, type Pt } from '../geometry';
import { requireNum, parseNum, splitFields } from '../parser';
import { CalcError } from '../errors';
import type { Handler, Row, Section } from '../types';
import { headerFields, newPoint, requireId } from './common';

/**
 * IV – ív-/távolságmetszés (távolság–távolság metszés).
 *
 * A GeoCalc 3.5 egyetlen, a súgóban nem tárgyalt számítási kódja; a program mintái között
 * `Pelda/Szamitasok/iv.gcd` néven megtalálható:
 *
 *     IV
 *     <új pont>
 *     <ismert pont>  <távolság>
 *     <ismert pont>  <távolság>
 *     ;;
 *
 * Két ismert pontból és a hozzájuk mért távolságokból határozza meg az új pontot. Két mérésnél
 * két tükör-megoldás van; a program — a súgó ívmetszésre vonatkozó megjegyzése szerint („az óramutató
 * járásával megegyező irányba adjuk be az adatokat, nehogy tükörképet számoljunk") — az óramutató
 * járásával megegyező körüljárású megoldást veszi. A másik (tükör-)megoldás a jegyzőkönyv lábában
 * megjelenik, hogy ellenőrizhető legyen. Három vagy több mérés esetén legkisebb négyzetes becslés készül.
 */

const c3 = (n: number) => fix(n, 3);
const DASH = '-';

interface Meas {
  id: string;
  K: Pt;
  t: number;
}

/** A mérések együtteséből számított kiegyenlített megoldás és a hozzá tartozó középhiba. */
export interface DistanceSolution {
  p: Pt;
  /** A távolságmaradékok négyzetes középértéke [m]; két mérésnél gyakorlatilag nulla. */
  rms: number;
}

/** Legkisebb négyzetes (Gauss–Newton) megoldás a mért távolságokból, egy közelítő pontból indulva. */
export function solveDistances(meas: Meas[], start: Pt): DistanceSolution {
  const p = { ...start };
  for (let iter = 0; iter < 100; iter++) {
    let a00 = 0;
    let a01 = 0;
    let a11 = 0;
    let b0 = 0;
    let b1 = 0;
    for (const o of meas) {
      const dy = p.y - o.K.y;
      const dx = p.x - o.K.x;
      const d = Math.hypot(dy, dx) || 1e-12;
      const r = o.t - d; // mért − számított
      const jy = dy / d;
      const jx = dx / d;
      a00 += jy * jy;
      a01 += jy * jx;
      a11 += jx * jx;
      b0 += jy * r;
      b1 += jx * r;
    }
    const det = a00 * a11 - a01 * a01;
    if (Math.abs(det) < 1e-12) break;
    const dy = (b0 * a11 - b1 * a01) / det;
    const dx = (a00 * b1 - a01 * b0) / det;
    p.y += dy;
    p.x += dx;
    if (Math.hypot(dy, dx) < 1e-9) break;
  }
  const rms = Math.sqrt(meas.reduce((s, o) => s + (o.t - Math.hypot(p.y - o.K.y, p.x - o.K.x)) ** 2, 0) / meas.length);
  return { p, rms };
}

export const iv: Handler = (ctx, block) => {
  const { fields, no } = headerFields(block, 'az új pont számát');
  const newId = requireId(fields, 'az új pont számát', no);

  const meas: Meas[] = [];
  for (const l of block.lines.slice(1)) {
    const f = splitFields(l.text);
    const id = requireId(f, 'az ismert pont számát', l.no);
    const K = ctx.getPoint(id, l.no);
    const t = parseNum(f[1], `${id}: távolság`);
    if (t === null) continue; // üres sor (pl. elválasztó) kihagyása
    if (t <= 0) throw new CalcError(`A(z) ${id} pontra mért távolság pozitív kell legyen.`, l.no);
    meas.push({ id, K, t });
  }
  if (meas.length < 2) {
    throw new CalcError('Az ívmetszéshez legalább két ismert pont és a hozzájuk mért távolság kell.', block.no);
  }
  const first = meas[0]!;
  const second = meas[1]!;
  if (first.K.y === second.K.y && first.K.x === second.K.x) {
    throw new CalcError('A két ismert pont egybeesik, a metszés nem határozható meg.', block.no);
  }

  // Két mérésnél a kör-kör metszés azonnali: a jobb oldali (óramutató járásával megegyező) megoldás az érvényes.
  // Három vagy több mérésnél onnan indulva készül legkisebb négyzetes becslés.
  let start: Pt;
  let mirror: Pt | null = null;
  try {
    const [left, right] = intersectCircles(first.K, first.t, second.K, second.t);
    start = right;
    mirror = left;
  } catch (e) {
    if (!(e instanceof CalcError) || meas.length === 2) throw e;
    // Több mérésnél a kör-kör metszés nem feltétel: a két ismert pont súlypontjából indulunk.
    start = { y: (first.K.y + second.K.y) / 2, x: (first.K.x + second.K.x) / 2 };
  }
  const sol = solveDistances(meas, start);

  ctx.setPoint(newPoint(newId, sol.p.y, sol.p.x, null));

  const rows: Row[] = meas.map((o) => {
    const d = Math.hypot(sol.p.y - o.K.y, sol.p.x - o.K.x);
    return { cells: [o.id, c3(o.K.y), c3(o.K.x), c3(o.t), c3(d - o.t)], role: 'base' };
  });
  rows.push({ cells: [newId, c3(sol.p.y), c3(sol.p.x), DASH, DASH], role: 'result' });

  const footer: string[] = [];
  if (meas.length === 2 && mirror) {
    footer.push(
      'Két távolságból két tükör-megoldás adódik; a program az óramutató járásával megegyező körüljárásút veszi ' +
        '(az ismert pontok a megadott sorrendben). A másik megoldás (fordított sorrendnél ez érvényes): ' +
        `${newId} = ${c3(mirror.y)}, ${c3(mirror.x)}.`,
    );
  } else {
    footer.push(
      `${meas.length} távolságból legkisebb négyzetes kiegyenlítés; a maradékok középhibája ${fix(sol.rms * 1000, 1)} mm.`,
    );
  }

  const section: Section = {
    kind: 'iv',
    title: 'Ív-/távolságmetszés (távolság–távolság metszés)',
    columns: ['Pontszám', 'Y', 'X', 'T', 'dT'],
    rows,
    footer,
  };
  return [section];
};
