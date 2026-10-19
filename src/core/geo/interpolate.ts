import { geocentricToGeodetic, type Ellipsoid, type Xyz } from './ellipsoid';
import { fix } from '../format';
import type { Row, Section } from '../types';

/**
 * Interpoláció a közös pontok javításaiból (súgó 65. o., „Interpoláció”).
 *
 * A súgó elve: „az átszámítandó ponthoz legközelebb eső 3 pontra (beleértve akár a súlypontot,
 * mint fiktív pontot, ahol a javítások nullák) egy sík illesztése történik az átszámítandó ponthoz
 * rögzített topocentrikus koordinátarendszerben. … A sík illesztésekor a harmadik dimenzió mindig a
 * megfelelő koordináták javításai. Az interpoláció a térbeli geocentrikus koordinátákra vonatkozik.”
 *
 * Ezért minden koordináta-összetevőre (X, Y, Z) külön síkot illesztünk a vízszintes topocentrikus
 * helyzet (kelet, észak) függvényében, majd a sík értékét az átszámítandó pontban (a vonatkoztatási
 * pontban, azaz a topocentrikus rendszer origójában) számítjuk. Így három síkillesztés adja a
 * geocentrikus javítást. „Vetület nélküli rendszerben ez csak egy eltolást jelent.”
 */

export interface InterpolationAnchor {
  id: string;
  /** A közös pont helye a cél rendszer geocentrikus koordinátáival [m]. */
  xyz: Xyz;
  /** A közös pont javítása a cél rendszerben, geocentrikus összetevőkkel [m]. */
  residual: Xyz;
}

export interface Interpolation {
  id: string;
  /** Az interpolált javítás geocentrikus összetevői [m]. */
  v: Xyz;
  /** A felhasznált közös pontok pontszámai, távolság szerint növekvő sorrendben. */
  anchors: string[];
  /** A fiktív súlypont (nulla javítással) bevonása: kevés közeli pont esetén. */
  usedCentroid: boolean;
  /** A síkillesztés nem volt elvégezhető (a pontok egy egyenesbe esnek), a súlypont-átlagot vettük. */
  fallback: boolean;
}

/** Az interpolációhoz felhasznált legközelebbi pontok száma (a súgó szerint 3). */
export const INTERPOLATION_POINTS = 3;

/** Topocentrikus bázis (kelet, észak, magasság) egy geocentrikus ponton. */
export function topocentricBasis(e: Ellipsoid, p: Xyz): { east: Xyz; north: Xyz; up: Xyz } {
  const g = geocentricToGeodetic(e, p);
  const sl = Math.sin(g.lam);
  const cl = Math.cos(g.lam);
  const sp = Math.sin(g.phi);
  const cp = Math.cos(g.phi);
  return { east: [-sl, cl, 0], north: [-sp * cl, -sp * sl, cp], up: [cp * cl, cp * sl, sp] };
}

/** Geocentrikus különbség topocentrikus (kelet, észak, magasság) összetevői. */
export function toTopocentric(basis: { east: Xyz; north: Xyz; up: Xyz }, d: Xyz): [number, number, number] {
  const dot = (v: Xyz) => v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
  return [dot(basis.east), dot(basis.north), dot(basis.up)];
}

/** 3×3 lineáris egyenletrendszer megoldása (részleges főelemválasztással); null, ha szinguláris. */
function solve3(a: number[][], b: number[]): [number, number, number] | null {
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    if (Math.abs(m[piv]![c]!) < 1e-12) return null;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    const d = m[c]![c]!;
    for (let k = c; k < 4; k++) m[c]![k]! /= d;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r]![c]!;
      for (let k = c; k < 4; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return [m[0]![3]!, m[1]![3]!, m[2]![3]!];
}

interface LocalAnchor {
  id: string;
  /** Keleti eltérés az átszámítandó ponttól [m]. */
  e: number;
  /** Északi eltérés az átszámítandó ponttól [m]. */
  n: number;
  residual: Xyz;
  /** Vízszintes távolság az átszámítandó ponttól [m]. */
  dist: number;
}

/**
 * Az átszámítandó pont interpolált javítása a közös pontok javításaiból.
 *
 * @param origin az átszámítandó pont helye a cél rendszerben (a transzformáció eredménye, javítás nélkül)
 * @param ellipsoid a cél rendszer ellipszoidja (a topocentrikus rendszerhez)
 * @param anchors a közös pontok (hely és javítás a cél rendszerben)
 */
export function interpolationAt(
  id: string,
  origin: Xyz,
  ellipsoid: Ellipsoid,
  anchors: InterpolationAnchor[],
  count = INTERPOLATION_POINTS,
): Interpolation | null {
  if (anchors.length === 0) return null;
  const basis = topocentricBasis(ellipsoid, origin);
  const local: LocalAnchor[] = anchors.map((a) => {
    const d: Xyz = [a.xyz[0] - origin[0], a.xyz[1] - origin[1], a.xyz[2] - origin[2]];
    const [e, n] = toTopocentric(basis, d);
    return { id: a.id, e, n, residual: a.residual, dist: Math.hypot(e, n) };
  });
  local.sort((x, y) => x.dist - y.dist || (x.id < y.id ? -1 : 1));
  const used = local.slice(0, Math.max(1, count));
  let usedCentroid = false;
  if (used.length < INTERPOLATION_POINTS) {
    // Kevesebb közeli pont: a súlypont mint fiktív pont, ahol a javítások nullák (súgó 65. o.).
    const e = used.reduce((s, a) => s + a.e, 0) / used.length;
    const n = used.reduce((s, a) => s + a.n, 0) / used.length;
    used.push({ id: 'súlypont', e, n, residual: [0, 0, 0], dist: 0 });
    usedCentroid = true;
  }
  const rows = used.length >= INTERPOLATION_POINTS ? used.slice(0, INTERPOLATION_POINTS) : used;
  // A sík egyértelmű, ha a három vízszintes helyzet nem esik egy egyenesbe. A súlypont fiktív
  // pontként a két valódi pont felezőpontja, ezért 3-nál kevesebb közös pontnál az illesztés
  // szükségszerűen elfajul – ilyenkor a javítások átlaga (vetület nélküli rendszerben ez az eltolás).
  const degenerate = (): boolean => {
    if (rows.length < 3) return true;
    const [a, b, c] = rows as [LocalAnchor, LocalAnchor, LocalAnchor];
    const area2 = Math.abs((b.e - a.e) * (c.n - a.n) - (c.e - a.e) * (b.n - a.n));
    const scale = Math.max(Math.abs(a.e), Math.abs(a.n), Math.abs(b.e), Math.abs(b.n), Math.abs(c.e), Math.abs(c.n), 1);
    return area2 < 1e-6 * scale * scale;
  };
  const flat = degenerate();
  const v: Xyz = [0, 0, 0];
  let fallback = false;
  for (let k = 0; k < 3; k++) {
    const a = rows.map((r) => [r.e, r.n, 1]);
    const b = rows.map((r) => r.residual[k]!);
    const solution = flat ? null : solve3(a, b);
    if (solution) v[k] = solution[2];
    else {
      // Egy egyenesbe eső (vagy hiányos) pontok: a javítások átlaga kerül a korrekcióba.
      fallback = true;
      v[k] = b.reduce((s, x) => s + x, 0) / b.length;
    }
  }
  return { id, v, anchors: used.map((a) => a.id), usedCentroid, fallback };
}

/** Az interpolált javítás hozzáadása egy geocentrikus koordinátához. */
export function applyCorrection(x: Xyz, c: Xyz): Xyz {
  return [x[0] + c[0], x[1] + c[1], x[2] + c[2]];
}

/** Az interpoláció eredményének táblázata (súgó 65., 68. o. – „Interpoláció számítása”). */
export function interpolationSection(items: Interpolation[]): Section | null {
  if (items.length === 0) return null;
  return {
    kind: 'interpolation',
    title: 'Interpoláció számítása (a közös pontok javításaiból)',
    columns: ['Pontszám', 'vX', 'vY', 'vZ', 'Felhasznált közös pontok'],
    rows: items.map<Row>((it) => ({
      cells: [it.id, fix(it.v[0], 3), fix(it.v[1], 3), fix(it.v[2], 3), it.anchors.join(', ')],
      role: 'result',
    })),
    footer: [
      'Az értékek a transzformált geocentrikus koordinátákhoz adott javítások [m]: a ponthoz legközelebb eső 3 közös pont javításaiból illesztett sík értéke a pontban.',
      items.some((it) => it.usedCentroid)
        ? 'Legalább egy pontnál 3-nál kevesebb közös pont volt a környezetben, ezért a súlypont (nulla javítással) is részt vett az illesztésben.'
        : '',
      items.some((it) => it.fallback)
        ? 'Legalább egy pontnál a közös pontok egy egyenesbe estek, ezért a sík helyett a javítások átlaga került a korrekcióba.'
        : '',
    ].filter((t) => t !== ''),
  };
}
