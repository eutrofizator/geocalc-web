import { describe, expect, it } from 'vitest';
import { heightLine, heightLineLimit, heightLineSections } from '../src/core/network/height-lines';
import { polygonClosure } from '../src/core/network/traverse-preview';
import { DEFAULT_VERTICAL_SETTINGS, type NetObservation, type NetPoint, type NetStation } from '../src/core/network/types';
import { adjustHeights, trigonometricHeightDifference } from '../src/core/network/vertical';

/**
 * A Hálózatkiegyenlítés eddig hiányzó részei (súgó 52–53. o.): poligon záróhibák, trigonometriai
 * magassági vonalak, valamint a távolság nélkül mért, koordinátából számított távolságú
 * magasságkülönbségek bevonása.
 */

const D = Math.PI / 180;
type P = { y: number; x: number };

function obs(target: string, hz: number, distance: number | null, dM: number | null = null): NetObservation {
  return { target, hz, zi: null, slope: null, horizontal: null, dM, targetHeight: null, distance };
}

/** Állomás pontos irányokkal (a megadott tájékozással) és távolságokkal. */
function station(id: string, pts: Record<string, P>, zk: number, targets: string[], extra: Record<string, { hzErr?: number; dM?: number; noDist?: boolean }> = {}): NetStation {
  const S = pts[id]!;
  return {
    id,
    instrumentHeight: null,
    observations: targets.map((t) => {
      const T = pts[t]!;
      const az = Math.atan2(T.y - S.y, T.x - S.x) / D;
      const e = extra[t] ?? {};
      return obs(t, (((az - zk + (e.hzErr ?? 0)) % 360) + 360) % 360, e.noDist ? null : Math.hypot(T.y - S.y, T.x - S.x), e.dM ?? null);
    }),
  };
}

describe('Poligon záróhibák (súgó 52. o.)', () => {
  const P4: Record<string, P> = { A: { y: 0, x: 0 }, B: { y: 100, x: 0 }, C: { y: 100, x: 100 }, D: { y: 0, x: 100 } };
  const ring = (err = 0) => [
    station('A', P4, 0, ['D', 'B']),
    station('B', P4, 40, ['A', 'C'], { C: { hzErr: err } }),
    station('C', P4, 90, ['B', 'D']),
    station('D', P4, 150, ['C', 'A']),
  ];

  it('hibátlan poligonnál a szög- és a vonalas záróhiba nulla, ismert koordináta nélkül is', () => {
    const r = polygonClosure(['A', 'B', 'C', 'D'], new Map(), ring());
    expect(r.closed).toBe(true);
    expect(r.angularClosure).toBeCloseTo(0, 6);
    expect(r.linear!.length).toBeCloseTo(0, 6);
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0]!.kind).toBe('polygon-closure');
    expect(r.sections[0]!.title).toBe('Poligon záróhiba: A – B – C – D');
  });

  it('a kezdőpontot nem kell megismételni, de megismételve is ugyanazt adja', () => {
    const a = polygonClosure(['A', 'B', 'C', 'D'], new Map(), ring(0.01));
    const b = polygonClosure(['A', 'B', 'C', 'D', 'A'], new Map(), ring(0.01));
    expect(a.angularClosure).toBeCloseTo(-36, 3);
    expect(b.angularClosure).toBeCloseTo(a.angularClosure!, 9);
  });

  it('háromnál kevesebb pontra hibát ad', () => {
    expect(() => polygonClosure(['A', 'B'], new Map(), ring())).toThrow(/legalább három pont/);
  });
});

describe('Trigonometriai magassági vonalak (súgó 53. o.)', () => {
  const P3: Record<string, P> = { A: { y: 0, x: 0 }, B: { y: 300, x: 400 }, C: { y: 600, x: 0 } };
  // Valódi magasságok: A = 100.00, B = 104.00, C = 101.00
  const stations = [
    station('A', P3, 0, ['B'], { B: { dM: 4.02 } }),
    station('B', P3, 0, ['A', 'C'], { A: { dM: -3.98 }, C: { dM: -3.0 } }),
    station('C', P3, 0, ['B'], { B: { dM: 3.0 } }),
  ];

  it('a hibahatár a súgó szerinti 15·√t mm (10 m-re 1.5 mm)', () => {
    expect(heightLineLimit(10) * 1000).toBeCloseTo(1.5, 9);
    expect(heightLineLimit(1000) * 1000).toBeCloseTo(15, 9);
  });

  it('két ismert pont között: oda-vissza átlag, záróhiba és elosztás', () => {
    const r = heightLine('1', ['A', 'B', 'C'], stations, new Map([['A', 100], ['C', 101.02]]));
    expect(r.legs[0]!.forward).toBeCloseTo(4.02, 9);
    expect(r.legs[0]!.backward).toBeCloseTo(3.98, 9);
    expect(r.legs[0]!.dh).toBeCloseTo(4.0, 9);
    expect(r.length).toBeCloseTo(1000, 6);
    // 100 + 4 − 3 = 101.00, az adott 101.02: a záróhiba −2 cm.
    expect(r.closure!).toBeCloseTo(-0.02, 9);
    // A B ponton (a vonal felénél) a javítás +1 cm.
    expect(r.heights.find((p) => p.id === 'B')!.height).toBeCloseTo(104.01, 9);
    expect(r.heights.find((p) => p.id === 'C')).toEqual({ id: 'C', height: 101.02, given: true });
  });

  it('zárt poligon: a záróhiba a magasságkülönbségek összege', () => {
    const closedStations = [...stations.filter((s) => s.id !== 'C'), station('C', P3, 0, ['B', 'A'], { B: { dM: 3.0 }, A: { dM: -0.99 } })];
    const r = heightLine('kör', ['A', 'B', 'C', 'A'], closedStations, new Map([['A', 100]]));
    expect(r.closed).toBe(true);
    // 4.00 − 3.00 − 0.99 = +0.01 m
    expect(r.closure!).toBeCloseTo(0.01, 9);
    const [s] = heightLineSections([r]);
    expect(s!.kind).toBe('height-line');
    expect(s!.footer!.join(' ')).toContain('Záróhiba: 1.0 cm');
    expect(s!.footer!.join(' ')).toContain('zárt poligon');
  });

  it('ismeretlen végpontnál a záróhiba nem számítható, a magasságok a mérésekből adódnak', () => {
    const r = heightLine('', ['A', 'B'], stations, new Map([['A', 100]]));
    expect(r.closure).toBeNull();
    expect(r.heights[1]!.height).toBeCloseTo(104.0, 9);
  });

  it('ismeretlen kezdőpont vagy hiányzó mérés hibát ad', () => {
    expect(() => heightLine('', ['B', 'C'], stations, new Map())).toThrow(/kezdőpont magassága/);
    expect(() => heightLine('', ['A', 'C'], stations, new Map([['A', 100]]))).toThrow(/nincs magasságkülönbség/);
  });
});

describe('Magassági kiegyenlítés: koordinátából számított távolság (súgó 53. o.)', () => {
  const P3: Record<string, P> = { A: { y: 0, x: 0 }, B: { y: 300, x: 400 }, X: { y: 0, x: 300 } };
  const known: NetPoint[] = [
    { id: 'A', y: 0, x: 0, m: 100, mark: '' },
    { id: 'B', y: 300, x: 400, m: 104, mark: '' },
  ];
  // Az X magaspontra csak irány és magasságkülönbség van, távolság nincs.
  const stations = [
    station('A', P3, 0, ['B', 'X'], { B: { dM: 4.0 }, X: { dM: 2.0, noDist: true } }),
    station('B', P3, 0, ['A', 'X'], { A: { dM: -4.0 }, X: { dM: -2.0, noDist: true } }),
  ];
  const coords = new Map(Object.entries(P3));

  it('bevonás nélkül a távolság nélküli mérés kimarad', () => {
    const r = adjustHeights(known, stations, DEFAULT_VERTICAL_SETTINGS, ['X'], coords);
    expect(r.observations.some((o) => o.target === 'X')).toBe(false);
  });

  it('zenitszög esetén a távolság nélkül készült (hamis) dM helyett a koordinátás távolsággal számol', () => {
    // A GMJ a távolság nélküli irányra a műszer- és jelmagasság különbségét írja dM-nek (itt 1.40).
    const st: NetStation = {
      id: 'A',
      instrumentHeight: 1.4,
      observations: [
        { ...obs('B', 0, 500, 4.0), zi: null },
        { target: 'X', hz: 0, zi: 89.5, slope: 0, horizontal: 0, dM: 1.4, targetHeight: 0, distance: null },
      ],
    };
    const r = adjustHeights(known, [st], { ...DEFAULT_VERTICAL_SETTINGS, included: ['A>X'] }, ['X'], coords);
    const ax = r.observations.find((o) => o.target === 'X')!;
    expect(ax.dh).toBeCloseTo(trigonometricHeightDifference(300, 89.5, 1.4, 0), 9);
    expect(ax.dh).toBeGreaterThan(2.5);
  });

  it('kézzel bevonva a távolságot a koordinátákból számolja, és X magassága kiadódik', () => {
    const r = adjustHeights(known, stations, { ...DEFAULT_VERTICAL_SETTINGS, included: ['A>X', 'B>X'] }, ['X'], coords);
    const ax = r.observations.find((o) => o.station === 'A' && o.target === 'X')!;
    expect(ax.fromCoordinates).toBe(true);
    expect(ax.distance).toBeCloseTo(300, 9);
    expect(r.points.find((p) => p.id === 'X')!.height).toBeCloseTo(102, 6);
    expect(r.sections.find((s) => s.kind === 'height-differences')!.footer?.[0]).toMatch(/koordinátákból számított/);
  });
});
