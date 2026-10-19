import { CalcError } from '../errors';
import type { Xyz } from './ellipsoid';

const ARCSEC = Math.PI / 180 / 3600;

/**
 * Térbeli hasonlósági (7 paraméteres) transzformáció, pozíció-vektor értelmezéssel:
 *   X' = T + (1 + s)·(X + R × X)
 * ahol R a (kis) forgatásvektor [rad], s a méretarány-változás (dimenzió nélkül).
 */
export interface Helmert3dParams {
  /** Eltolás [m]. */
  t: Xyz;
  /** Forgatás X, Y, Z tengely körül [rad]. */
  r: Xyz;
  /** Méretarány-változás (1 = 1 000 000 ppm = 1 000 000 mm/km). */
  s: number;
}

export interface Helmert3dFit {
  params: Helmert3dParams;
  /** A 7 paraméter középhibája: T[3], R[3] (rad), s. */
  sigmas: number[];
  /** Az egységsúlyú mérés középhibája [m]. */
  sigma0: number;
  /** Javítások: ismert cél − transzformált kiinduló (geocentrikus, m). */
  residuals: Xyz[];
  dof: number;
}

export const toArcsec = (rad: number) => rad / ARCSEC;

export function applyHelmert(p: Helmert3dParams, [x, y, z]: Xyz): Xyz {
  const k = 1 + p.s;
  const [rx, ry, rz] = p.r;
  return [
    p.t[0] + k * (x + (ry * z - rz * y)),
    p.t[1] + k * (y + (rz * x - rx * z)),
    p.t[2] + k * (z + (rx * y - ry * x)),
  ];
}

/** A transzformáció pontos inverze (3×3 mátrix inverze). */
export function applyHelmertInverse(p: Helmert3dParams, X: Xyz): Xyz {
  const k = 1 + p.s;
  const [rx, ry, rz] = p.r;
  // X' − T = k·M·X,  M = I + [R]×
  const m = [
    [1, -rz, ry],
    [rz, 1, -rx],
    [-ry, rx, 1],
  ];
  const v = [(X[0] - p.t[0]) / k, (X[1] - p.t[1]) / k, (X[2] - p.t[2]) / k];
  const det =
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
    m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
    m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const inv = [
    [
      (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) / det,
      (m[0]![2]! * m[2]![1]! - m[0]![1]! * m[2]![2]!) / det,
      (m[0]![1]! * m[1]![2]! - m[0]![2]! * m[1]![1]!) / det,
    ],
    [
      (m[1]![2]! * m[2]![0]! - m[1]![0]! * m[2]![2]!) / det,
      (m[0]![0]! * m[2]![2]! - m[0]![2]! * m[2]![0]!) / det,
      (m[0]![2]! * m[1]![0]! - m[0]![0]! * m[1]![2]!) / det,
    ],
    [
      (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!) / det,
      (m[0]![1]! * m[2]![0]! - m[0]![0]! * m[2]![1]!) / det,
      (m[0]![0]! * m[1]![1]! - m[0]![1]! * m[1]![0]!) / det,
    ],
  ];
  return [
    inv[0]![0]! * v[0]! + inv[0]![1]! * v[1]! + inv[0]![2]! * v[2]!,
    inv[1]![0]! * v[0]! + inv[1]![1]! * v[1]! + inv[1]![2]! * v[2]!,
    inv[2]![0]! * v[0]! + inv[2]![1]! * v[1]! + inv[2]![2]! * v[2]!,
  ];
}

function invert(matrix: number[][]): number[][] {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[piv]![c]!)) piv = r;
    if (Math.abs(a[piv]![c]!) < 1e-300) throw new CalcError('A közös pontok elhelyezkedése nem elég a transzformáció meghatározásához (egy síkba vagy egy egyenesbe esnek).');
    [a[c], a[piv]] = [a[piv]!, a[c]!];
    const d = a[c]![c]!;
    for (let k = 0; k < 2 * n; k++) a[c]![k]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r]![c]!;
      for (let k = 0; k < 2 * n; k++) a[r]![k]! -= f * a[c]![k]!;
    }
  }
  return a.map((row) => row.slice(n));
}

/**
 * A 7 paraméter meghatározása legkisebb négyzetes módszerrel a közös pontok geocentrikus
 * koordinátáiból (kiinduló → cél). Legalább 3 nem egy egyenesre eső közös pont kell.
 */
export function fitHelmert(src: Xyz[], dst: Xyz[]): Helmert3dFit {
  if (src.length !== dst.length) throw new CalcError('A két rendszerben nem azonos számú közös pont van.');
  if (src.length < 3) throw new CalcError(`A térbeli transzformációhoz legalább 3 közös pont szükséges (${src.length} van).`);
  const rows: number[][] = [];
  const rhs: number[] = [];
  src.forEach(([x, y, z], i) => {
    const [wx, wy, wz] = dst[i]!;
    rows.push([1, 0, 0, 0, z, -y, x]);
    rhs.push(wx - x);
    rows.push([0, 1, 0, -z, 0, x, y]);
    rhs.push(wy - y);
    rows.push([0, 0, 1, y, -x, 0, z]);
    rhs.push(wz - z);
  });
  const n = 7;
  const N = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => rows.reduce((s, r) => s + r[i]! * r[j]!, 0)));
  const g = Array.from({ length: n }, (_, i) => rows.reduce((s, r, k) => s + r[i]! * rhs[k]!, 0));
  const Q = invert(N);
  const p = Q.map((row) => row.reduce((s, v, j) => s + v * g[j]!, 0));
  const params: Helmert3dParams = { t: [p[0]!, p[1]!, p[2]!], r: [p[3]!, p[4]!, p[5]!], s: p[6]! };

  // Javítások a pontos (nemlineáris) modellel: ismert cél − transzformált.
  const residuals = src.map((X, i) => {
    const w = applyHelmert(params, X);
    const d = dst[i]!;
    return [d[0] - w[0], d[1] - w[1], d[2] - w[2]] as Xyz;
  });
  const dof = rows.length - n;
  const sumSq = residuals.reduce((s, v) => s + v[0] ** 2 + v[1] ** 2 + v[2] ** 2, 0);
  const sigma0 = dof > 0 ? Math.sqrt(sumSq / dof) : 0;
  return { params, sigmas: Q.map((row, i) => sigma0 * Math.sqrt(row[i]!)), sigma0, residuals, dof };
}
