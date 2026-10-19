import { CalcError } from '../errors';
import { fix } from '../format';
import { splitFields, requireNum } from '../parser';
import type { Block, Context, Handler, Point, Row, Section } from '../types';
import { idTokens, lineError, newPoint, requireId } from './common';

const c3 = (n: number) => fix(n, 3);
const c9 = (n: number) => fix(n, 9);

interface Pair {
  id: string;
  /** Régi rendszer. */
  y: number;
  x: number;
  /** Új rendszer. */
  ny: number;
  nx: number;
}

/** Közös pontok: a régi rendszerbeli koordináták a tárolt pontokból, az újak a sorokból. */
function commonPoints(ctx: Context, block: Block): Pair[] {
  return block.lines.map((l) => {
    const f = splitFields(l.text);
    const id = requireId(f, 'a közös pont száma', l.no);
    const p = ctx.getPoint(id, l.no);
    return { id, y: p.y, x: p.x, ny: requireNum(f[1], `${id}: új Y`), nx: requireNum(f[2], `${id}: új X`) };
  });
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Közös lépések: súlypontra redukálás, illesztés, javítások és az átszámítandó pontok kiszámítása. */
function transformResult(
  ctx: Context,
  block: Block,
  kind: string,
  title: string,
  pairs: Pair[],
  fit: (u: number[], v: number[], y: number[], x: number[]) => { model: (du: number, dv: number) => { y: number; x: number }; coefficients: string },
): Section[] {
  const Ym = mean(pairs.map((p) => p.y));
  const Xm = mean(pairs.map((p) => p.x));
  const ym = mean(pairs.map((p) => p.ny));
  const xm = mean(pairs.map((p) => p.nx));
  const u = pairs.map((p) => p.y - Ym);
  const v = pairs.map((p) => p.x - Xm);
  const { model, coefficients } = fit(
    u,
    v,
    pairs.map((p) => p.ny - ym),
    pairs.map((p) => p.nx - xm),
  );
  const apply = (Y: number, X: number) => {
    const d = model(Y - Ym, X - Xm);
    return { y: ym + d.y, x: xm + d.x };
  };

  const rows: Row[] = pairs.map((p) => {
    const c = apply(p.y, p.x);
    // Javítás = adott − számított
    return { cells: [p.id, c3(p.y), c3(p.x), c3(p.ny), c3(p.nx), c3(p.ny - c.y), c3(p.nx - c.x)], role: 'base' };
  });
  rows.push({ cells: ['Súlypont', c3(Ym), c3(Xm), c3(ym), c3(xm), '', ''], role: 'base' });

  const pkod = block.args[0];
  const converted: Point[] = [];
  for (const t of idTokens(block.lines2 ?? [])) {
    try {
      const p = ctx.getPoint(t.id, t.no);
      const c = apply(p.y, p.x);
      converted.push(newPoint(t.id, c.y, c.x, null, pkod));
      rows.push({ cells: [t.id, c3(p.y), c3(p.x), c3(c.y), c3(c.x), '', ''], role: 'result' });
    } catch (e) {
      lineError(ctx, e, t.no);
    }
  }
  ctx.transformed.push(...converted);
  return [{ kind, title, columns: ['Pontszám', 'Y', 'X', 'y', 'x', 'Vy', 'Vx'], rows, footer: [coefficients] }];
}

function solve2(sxx: number, sxy: number, syy: number, sxz: number, syz: number): [number, number] {
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-9 * Math.max(sxx * syy, 1)) throw new CalcError('A közös pontok egy egyenesre esnek, a transzformáció nem határozható meg.');
  return [(sxz * syy - syz * sxy) / det, (sxx * syz - sxy * sxz) / det];
}

/** AF – affin transzformáció: y = a·u + b·v, x = c·u + d·v (a súlypontra redukált koordinátákkal), legkisebb négyzetes illesztéssel. */
export const af: Handler = (ctx, block) => {
  const pairs = commonPoints(ctx, block);
  if (pairs.length < 3) throw new CalcError('Az affin transzformációhoz legalább 3 közös pont szükséges.', block.no);
  return transformResult(ctx, block, 'af', 'Affin transzformáció', pairs, (u, v, y, x) => {
    const S = (a: number[], b: number[]) => a.reduce((s, _, i) => s + a[i]! * b[i]!, 0);
    const [a, b] = solve2(S(u, u), S(u, v), S(v, v), S(u, y), S(v, y));
    const [c, d] = solve2(S(u, u), S(u, v), S(v, v), S(u, x), S(v, x));
    return {
      model: (du, dv) => ({ y: a * du + b * dv, x: c * du + d * dv }),
      coefficients: `a = ${c9(a)}   b = ${c9(b)}   c = ${c9(c)}   d = ${c9(d)}`,
    };
  });
};

/** HE – Helmert- (hasonlósági) transzformáció: y = a·u + b·v, x = −b·u + a·v (a GeoCalc előjelkonvenciója). */
export const he: Handler = (ctx, block) => {
  const pairs = commonPoints(ctx, block);
  if (pairs.length < 2) throw new CalcError('A Helmert-transzformációhoz legalább 2 közös pont szükséges.', block.no);
  return transformResult(ctx, block, 'he', 'Helmert transzformáció', pairs, (u, v, y, x) => {
    const den = u.reduce((s, _, i) => s + u[i]! ** 2 + v[i]! ** 2, 0);
    if (den === 0) throw new CalcError('A közös pontok egybeesnek, a transzformáció nem határozható meg.');
    const a = u.reduce((s, _, i) => s + u[i]! * y[i]! + v[i]! * x[i]!, 0) / den;
    const b = u.reduce((s, _, i) => s + v[i]! * y[i]! - u[i]! * x[i]!, 0) / den;
    return {
      model: (du, dv) => ({ y: a * du + b * dv, x: -b * du + a * dv }),
      coefficients: `a = ${c9(a)}   b = ${c9(b)}`,
    };
  });
};
