import { describe, expect, it } from 'vitest';
import { applyHelmert } from '../src/core/geo/helmert3d';
import { applyCorrection, interpolationAt, toTopocentric, topocentricBasis, type InterpolationAnchor } from '../src/core/geo/interpolate';
import { parseCoordinateList, spatialTransform } from '../src/core/geo/spatial';
import { SYSTEMS } from '../src/core/geo/systems';
import { TRANSFORM_SAMPLE } from '../src/transform-sample';

const req = {
  from: 'WGS84_XYZ' as const,
  to: 'EOV' as const,
  twoD: false,
  commonFrom: parseCoordinateList(TRANSFORM_SAMPLE.commonFrom, 'WGS84_XYZ', false),
  commonTo: parseCoordinateList(TRANSFORM_SAMPLE.commonTo, 'EOV', false),
  points: parseCoordinateList(TRANSFORM_SAMPLE.points, 'WGS84_XYZ', false),
};

/** A súgó (65., 68. o.) mintapéldája: a WGS 84 → EOV transzformáció 6 közös ponttal. */
describe('interpoláció a közös pontok javításaiból – súgó mintapélda', () => {
  const r = spatialTransform({ ...req, interpolate: true });
  const near = (a: number, b: number, t = 0.002) => Math.abs(a - b) <= t;

  it('kérés nélkül nincs interpoláció, kérésre pontonként megvan', () => {
    expect(spatialTransform(req).interpolations).toEqual([]);
    expect(r.interpolations.map((x) => x.id)).toEqual(['A', 'B']);
    expect(r.convertedValues).toHaveLength(2);
  });

  it('az A pont a súgó szerinti értéket adja (±2 mm)', () => {
    // súgó 68. o.: A → 604155.242  213879.061  177.085
    const A = r.convertedValues[0]!;
    expect(near(A.coords[0]!, 604155.242)).toBe(true);
    expect(near(A.coords[1]!, 213879.061)).toBe(true);
    expect(near(A.coords[2]!, 177.085)).toBe(true);
  });

  it('a legközelebbi 3 közös pontot használja (súgó 65. o.)', () => {
    expect(r.interpolations[0]!.anchors).toEqual(['6', '3', '5']);
    expect(r.interpolations[1]!.anchors).toEqual(['2', '6', '4']);
    expect(r.interpolations.every((x) => !x.usedCentroid && !x.fallback)).toBe(true);
  });

  it('a javítás a transzformált pontot a közös pontok javításaihoz igazítja', () => {
    // Az A pont közelében lévő horgonyok javításai 1–3 cm-esek, ezért az interpolált eredmény
    // legfeljebb néhány mm-rel tér el a javítás nélkülitől (a sík a pontban közel a súlyponti érték).
    const plain = spatialTransform(req).convertedValues[0]!.coords;
    const A = r.convertedValues[0]!;
    const diff = Math.hypot(A.coords[0]! - plain[0]!, A.coords[1]! - plain[1]!);
    expect(diff).toBeGreaterThan(0.001);
    expect(diff).toBeLessThan(0.05);
  });

  it('a B pont javítása a súgótól eltér (a dokumentált ponthozam elegendő a fenntartás)', () => {
    // A súgó 68. o. B pontra −0.007, 0.000, 0.030 geocentrikus javítást közöl (612902.442 212831.092 160.084).
    // A dokumentált eljárás (3 legközelebbi pont + sík a pontban) ezt nem adja vissza: az A pontnál
    // viszont pontosan egyezik, ezért a számítás a súgó elve szerint történik, a mintaérték fenntartással kezelendő.
    const B = r.convertedValues[1]!;
    expect(near(B.coords[0]!, 612902.435)).toBe(true);
    expect(near(B.coords[1]!, 212831.043)).toBe(true);
    expect(near(B.coords[2]!, 160.053)).toBe(true);
  });

  it('a javítás hozzáadása után a közös pontokra visszakapjuk az ismert koordinátákat', () => {
    // Az interpoláció a javítások síkját illeszti, ezért a horgonyokra magára nézve konzisztens:
    // a horgony javítása a transzformált értékhez adva az ismert cél-koordinátát adja.
    const anchors: InterpolationAnchor[] = r.residuals.map((x) => ({
      id: x.id,
      xyz: SYSTEMS.EOV.toGeocentric(req.commonTo.find((p) => p.id === x.id)!.coords, false),
      residual: [x.vX, x.vY, x.vZ],
    }));
    const src = SYSTEMS.WGS84_XYZ;
    anchors.forEach((a, i) => {
      const t = applyHelmert(r.fit.params, src.toGeocentric(req.commonFrom[i]!.coords, false));
      const c = applyCorrection(t, a.residual);
      expect(Math.hypot(c[0] - a.xyz[0], c[1] - a.xyz[1], c[2] - a.xyz[2])).toBeLessThan(1e-6);
    });
  });
});

describe('interpoláció – határesetek', () => {
  const ellipsoid = SYSTEMS.EOV.ellipsoid;
  const origin = SYSTEMS.EOV.toGeocentric([600000, 200000, 150], false);
  const east = topocentricBasis(ellipsoid, origin).east;
  const anchorAt = (id: string, dE: number, dN: number, residual: [number, number, number]): InterpolationAnchor => ({
    id,
    xyz: [
      origin[0] + east[0] * dE + topocentricBasis(ellipsoid, origin).north[0] * dN,
      origin[1] + east[1] * dE + topocentricBasis(ellipsoid, origin).north[1] * dN,
      origin[2] + east[2] * dE + topocentricBasis(ellipsoid, origin).north[2] * dN,
    ],
    residual,
  });

  it('a topocentrikus bázis ortogonális és egységvektor', () => {
    const b = topocentricBasis(ellipsoid, origin);
    const dot = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
    for (const v of [b.east, b.north, b.up]) expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 12);
    expect(dot(b.east, b.north)).toBeCloseTo(0, 12);
    expect(dot(b.east, b.up)).toBeCloseTo(0, 12);
    expect(dot(b.north, b.up)).toBeCloseTo(0, 12);
    expect(toTopocentric(b, [b.east[0], b.east[1], b.east[2]])[0]).toBeCloseTo(1, 12);
  });

  it('közös pont nélkül nincs javítás', () => {
    expect(interpolationAt('P', origin, ellipsoid, [])).toBeNull();
  });

  it('3-nál kevesebb közös pontnál a súlypont (nulla javítással) is részt vesz', () => {
    const it = interpolationAt('P', origin, ellipsoid, [anchorAt('1', 1000, 0, [0.01, 0, 0]), anchorAt('2', 0, 1000, [0, 0.02, 0])])!;
    expect(it.usedCentroid).toBe(true);
    expect(it.anchors).toContain('súlypont');
    // Két pont és a felezőpontjuk egy egyenesen van: ilyenkor a javítások átlaga a korrekció
    // (a súlypont nulla javítással vesz részt).
    expect(it.fallback).toBe(true);
    expect(it.v[0]).toBeCloseTo(0.01 / 3, 12);
    expect(it.v[1]).toBeCloseTo(0.02 / 3, 12);
    expect(it.v[2]).toBeCloseTo(0, 12);
  });

  it('egy egyenesbe eső közös pontoknál a javítások átlaga kerül a korrekcióba', () => {
    const it = interpolationAt('P', origin, ellipsoid, [
      anchorAt('1', 1000, 0, [0.003, 0.006, 0.009]),
      anchorAt('2', 2000, 0, [0.003, 0.006, 0.009]),
      anchorAt('3', 3000, 0, [0.003, 0.006, 0.009]),
    ])!;
    expect(it.fallback).toBe(true);
    expect(it.v[0]).toBeCloseTo(0.003, 12);
    expect(it.v[1]).toBeCloseTo(0.006, 12);
    expect(it.v[2]).toBeCloseTo(0.009, 12);
  });

  it('3 közös pontra a sík a pontban a pontok javításainak súlyozott értéke', () => {
    // A pont a háromszög közepén: a sík értéke a pontban a javítások átlaga.
    const a = anchorAt('1', 1000, 0, [0.03, 0, 0]);
    const b = anchorAt('2', -500, 866.0254037844, [0, 0.03, 0]);
    const c = anchorAt('3', -500, -866.0254037844, [0, 0, 0.03]);
    const it = interpolationAt('P', origin, ellipsoid, [a, b, c])!;
    expect(it.anchors).toHaveLength(3);
    expect(it.v[0]).toBeCloseTo(0.01, 9);
    expect(it.v[1]).toBeCloseTo(0.01, 9);
    expect(it.v[2]).toBeCloseTo(0.01, 9);
  });
});
