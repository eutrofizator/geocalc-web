import { describe, expect, it } from 'vitest';
import { CalcError } from '../src/core/errors';
import { appendLine, transformWithRadius, twoStepCommon } from '../src/core/geo/radius';
import { parseCoordinateList, spatialTransform, type SpatialRequest } from '../src/core/geo/spatial';
import { SYSTEMS } from '../src/core/geo/systems';
import { TRANSFORM_SAMPLE } from '../src/transform-sample';

const request = (points: string): SpatialRequest => ({
  from: 'WGS84_XYZ',
  to: 'EOV',
  twoD: false,
  commonFrom: parseCoordinateList(TRANSFORM_SAMPLE.commonFrom, 'WGS84_XYZ', false),
  commonTo: parseCoordinateList(TRANSFORM_SAMPLE.commonTo, 'EOV', false),
  points: parseCoordinateList(points, 'WGS84_XYZ', false),
});

describe('keresősugár (súgó 64. o.)', () => {
  const req = request(TRANSFORM_SAMPLE.points);

  it('minden ponthoz a sugarában lévő közös pontokból számol', () => {
    const r = transformWithRadius(req, 8000);
    expect(r.points.map((p) => p.id)).toEqual(['A', 'B']);
    // A mintapélda kb. 9 km-es körzetben van; 8 km-es sugárral nem mind a 6 pont esik bele.
    expect(r.points.every((p) => p.count >= 3 && p.count <= 6)).toBe(true);
    expect(r.points.every((p) => p.params.length === 7)).toBe(true);
  });

  it('nagy sugarat választva (a teljes hálózat) ugyanazt adja, mint az egyetlen transzformáció', () => {
    const r = transformWithRadius(req, 100000);
    expect(r.points.every((p) => p.count === 6)).toBe(true);
    const single = spatialTransform(req);
    r.points.forEach((p, i) => {
      const expected = single.converted[i]!.output;
      expect(p.output).toEqual(expected);
    });
  });

  it('a pontonkénti paraméterek a várt sorrendben és egységekkel jelennek meg', () => {
    const r = transformWithRadius(req, 100000);
    const params = r.sections.find((s) => s.kind === 'radius-params')!;
    expect(params.columns).toEqual(['Pontszám', 'Eltolás X', 'Eltolás Y', 'Eltolás Z', 'Forgatás X', 'Forgatás Y', 'Forgatás Z', 'Méretarány']);
    expect(params.rows.map((x) => x.cells[0])).toEqual(['A', 'B']);
  });

  it('a pontok táblázata a kiinduló és a cél koordinátákat is tartalmazza', () => {
    const r = transformWithRadius(req, 100000);
    const points = r.sections.find((s) => s.kind === 'radius-points')!;
    expect(points.columns).toEqual(['Pontszám', 'Közös pont', 'X', 'Y', 'Z', 'Y', 'X', 'M']);
    expect(points.rows[0]!.cells[0]).toBe('A');
    expect(points.rows[0]!.cells[1]).toBe('6');
  });

  it('túl kicsi sugárnál a pont nem számítható, de nem hibázik el a futás', () => {
    const r = transformWithRadius(req, 100);
    expect(r.points).toEqual([]);
    expect(r.failed.map((f) => f.id)).toEqual(['A', 'B']);
    const s = r.sections.find((x) => x.kind === 'radius-failed')!;
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0]!.cells[1]).toMatch(/legalább 3/);
  });

  it('érvénytelen sugárra hibát jelez', () => {
    expect(() => transformWithRadius(req, 0)).toThrow(/pozitív/);
    expect(() => transformWithRadius(req, -5)).toThrow(CalcError);
  });
});

describe('kétlépcsős módszer (súgó 65. o.)', () => {
  it('a kijelölt pontot a célrendszerbe számítja, és a közös pontokra fűzhető sorokat adja', () => {
    const r = twoStepCommon(request(TRANSFORM_SAMPLE.points), 'A', 145.678);
    expect(r.id).toBe('A');
    expect(r.fromLine).toBe('A 4113380.501 1371657.548 4662148.720');
    const parts = r.toLine.split(' ');
    expect(parts[0]).toBe('A');
    expect(parts).toHaveLength(4);
    // A megadott szintezett magasság kerül a célrendszer M koordinátájába.
    expect(parts[3]).toBe('145.678');
    // A vízszintes koordináták megegyeznek a szokásos transzformációval.
    const single = spatialTransform(request(TRANSFORM_SAMPLE.points));
    expect(parts[1]).toBe(single.converted[0]!.output[0]);
    expect(parts[2]).toBe(single.converted[0]!.output[1]);
  });

  it('magasság nélkül a transzformált magasságot hagyja meg', () => {
    const withH = twoStepCommon(request(TRANSFORM_SAMPLE.points), 'A', 0);
    const without = twoStepCommon(request(TRANSFORM_SAMPLE.points), 'A', null);
    expect(withH.toLine).not.toBe(without.toLine);
  });

  it('ismeretlen pontra hibát jelez', () => {
    expect(() => twoStepCommon(request(TRANSFORM_SAMPLE.points), 'ZZ', null)).toThrow(/nincs az átszámítandó/);
  });

  it('a sor hozzáfűzése megőrzi a meglévő tartalmat', () => {
    expect(appendLine('', 'A 1 2 3')).toBe('A 1 2 3\r\n');
    expect(appendLine('B 4 5 6\r\n', 'A 1 2 3')).toBe('B 4 5 6\r\nA 1 2 3\r\n');
  });

  it('a cél koordináták a rendszer formátumát követik (EOV: 3 tizedes)', () => {
    const r = twoStepCommon(request(TRANSFORM_SAMPLE.points), 'B', 170);
    const parts = r.toLine.split(' ');
    expect(parts[1]).toMatch(/^\d+\.\d{3}$/);
    expect(SYSTEMS.EOV.columns).toEqual(['Y', 'X', 'M']);
  });
});
