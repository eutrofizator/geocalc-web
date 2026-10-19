import { describe, expect, it } from 'vitest';
import { formatDms } from '../src/core/angle';
import { CalcError } from '../src/core/errors';
import { parseGmj, parseNetworkCoordinates } from '../src/core/network/gmj';
import { adjustHorizontal, type HorizontalResult } from '../src/core/network/horizontal';
import { chiSquareQuantile, normalQuantile } from '../src/core/network/stats';
import { DEFAULT_HORIZONTAL_SETTINGS } from '../src/core/network/types';
import { ISZKA_COORDINATES, ISZKA_GMJ } from './fixtures/iszkahegy';

const coords = parseNetworkCoordinates(ISZKA_COORDINATES).points;
const gmj = parseGmj(ISZKA_GMJ);

describe('statisztikai segédfüggvények', () => {
  it('normális kvantilis ismert értékekkel', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.995)).toBeCloseTo(2.575829, 5);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 9);
    expect(normalQuantile(0.001)).toBeCloseTo(-3.090232, 5);
  });

  it('χ² kvantilis ismert táblázati értékekkel', () => {
    expect(chiSquareQuantile(0.95, 1)).toBeCloseTo(3.841459, 4);
    expect(chiSquareQuantile(0.995, 20)).toBeCloseTo(39.99685, 3);
    expect(chiSquareQuantile(0.005, 20)).toBeCloseTo(7.433844, 3);
    expect(chiSquareQuantile(0.5, 10)).toBeCloseTo(9.341818, 4);
  });
});

describe('GMJ és koordináta beolvasás', () => {
  it('az állomásokat és a méréseket helyesen olvassa', () => {
    expect(gmj.issues).toEqual([]);
    expect(gmj.stations.map((s) => s.id)).toEqual(['541017D', '2', '3', '541440']);
    expect(gmj.stations.map((s) => s.observations.length)).toEqual([6, 6, 9, 5]);
    expect(gmj.stations[0]!.instrumentHeight).toBe(1.39);
    const toTwo = gmj.stations[0]!.observations.find((o) => o.target === '2')!;
    expect(toTwo.distance).toBeCloseTo(1008.9776, 4);
    expect(toTwo.hz).toBeCloseTo(355 + 51 / 60 + 17 / 3600, 8); // 355.5117 = 355°51'17"
    expect(gmj.stations[0]!.observations.find((o) => o.target === '541017A')!.distance).toBeNull();
  });

  it('a koordináta-listát (jelöléssel) beolvassa, hibás sort jelez', () => {
    expect(coords).toHaveLength(11);
    expect(coords.find((p) => p.id === '541017')).toMatchObject({ y: 591942.42, x: 208782.62, m: 273.21, mark: 'merotorony' });
    const bad = parseNetworkCoordinates('1 2\n3 4 5');
    expect(bad.issues).toHaveLength(1);
    expect(bad.points).toHaveLength(1);
  });

  it('ismeretlen sortípusra és állomás nélküli mérésre figyelmeztet', () => {
    const r = parseGmj('1,A,,,,,,,1.5,,,,,-1\n2,B,10.0000,90.0000,0,0,0,,,0,,,,-7\n');
    expect(r.issues.some((i) => /Ismeretlen sortípus/.test(i.message))).toBe(true);
    const orphan = parseGmj('2,B,10.0000,90.0000,0,0,0,,,0,,,,-2\n');
    expect(orphan.issues.some((i) => /állásponti sor nélkül/.test(i.message))).toBe(true);
  });
});

describe('vízszintes hálózat kiegyenlítése – valódi példa a GeoCalc saját kimenetével', () => {
  const r: HorizontalResult = adjustHorizontal(coords, gmj.stations, DEFAULT_HORIZONTAL_SETTINGS);
  const obs = (st: string, tg: string, kind: 'direction' | 'distance') => r.observations.find((o) => o.station === st && o.target === tg && o.kind === kind)!;

  it('a hálózat jellemző adatai egyeznek', () => {
    expect(r.counts).toEqual({ points: 13, known: 11, new: 2, directions: 26, distances: 6, redundancy: 20, excluded: 4 });
  });

  it('az új pontok koordinátái egyeznek a GeoCalc eredményével (±1 cm)', () => {
    const p2 = r.points.find((p) => p.id === '2')!;
    const p3 = r.points.find((p) => p.id === '3')!;
    // GeoCalc: 2: 590988.68  209083.80  |  3: 590588.38  209681.22
    expect(Math.abs(p2.y - 590988.68)).toBeLessThan(0.01);
    expect(Math.abs(p2.x - 209083.8)).toBeLessThan(0.01);
    expect(Math.abs(p3.y - 590588.38)).toBeLessThan(0.01);
    expect(Math.abs(p3.x - 209681.22)).toBeLessThan(0.01);
  });

  it('az állomások tájékozási szögei egyeznek (±1″)', () => {
    // GeoCalc: 2: 122°59'38"  3: 262°15'12"  541017D: 292°04'36"  541440: 222°39'55"
    const expected: Record<string, number> = {
      '2': 122 + 59 / 60 + 38 / 3600,
      '3': 262 + 15 / 60 + 12 / 3600,
      '541017D': 292 + 4 / 60 + 36 / 3600,
      '541440': 222 + 39 / 60 + 55 / 3600,
    };
    for (const [id, deg] of Object.entries(expected)) {
      expect(Math.abs(r.orientations.get(id)! - deg) * 3600).toBeLessThan(1.2);
    }
    expect(formatDms(r.orientations.get('2')!)).toBe('122.5938');
  });

  it('a durva hibás 543060-ra mért irányokat kihagyja, és jelzi', () => {
    const excluded = r.observations.filter((o) => o.excluded);
    expect(excluded).toHaveLength(4);
    expect(excluded.every((o) => o.target === '543060' && o.kind === 'direction')).toBe(true);
    expect(Math.abs(obs('2', '543060', 'direction').residual)).toBeGreaterThan(10000); // GeoCalc: −83286″
    expect(r.issues.some((i) => i.level === 'warning' && /durva hiba/.test(i.message))).toBe(true);
  });

  it('a súlyozott négyzetösszeg és a súlyegység középhibája a GeoCalc értékeinek 1%-án belül van', () => {
    // GeoCalc: 846.643 és 6.51
    expect(Math.abs(r.weightedSumSquares / 846.643 - 1)).toBeLessThan(0.01);
    expect(Math.abs(r.sigma0Posterior! - 6.51)).toBeLessThan(0.06);
  });

  it('az egyes mérések javításai egyeznek a GeoCalc kimenetével (irány ±1″, távolság ±1 mm)', () => {
    // GeoCalc „Jav.” oszlop (állomás, pont, irány [″], távolság [mm])
    const expected: [string, string, number, number | null][] = [
      ['541017D', '541017A', -2, null], ['541017D', '541066', 3, null], ['541017D', '543012', -4, null], ['541017D', '543054', 3, null], ['541017D', '2', -3, -8],
      ['2', '541017', 2, null], ['2', '541017D', 4, -4], ['2', '543012', -1, null], ['2', '541016', 1, null], ['2', '3', 2, -2],
      ['3', '541017A', 0, null], ['3', '541066', 3, null], ['3', '541017', 6, null], ['3', '543061', 0, null], ['3', '2', 5, -5], ['3', '543012', -4, null], ['3', '541016', 3, null], ['3', '541440', 4, -2],
      ['541440', '541017', 5, null], ['541440', '543062', -2, null], ['541440', '541016', 0, null], ['541440', '3', 6, -1],
    ];
    for (const [st, tg, dirRes, distRes] of expected) {
      expect(Math.abs(obs(st, tg, 'direction').residual - dirRes), `${st}→${tg} irány`).toBeLessThan(1.1);
      if (distRes !== null) expect(Math.abs(obs(st, tg, 'distance').residual - distRes), `${st}→${tg} táv.`).toBeLessThan(1.3);
    }
  });

  it('a standardizált javítások és a redundancia-számok egyeznek a GeoCalc „Stat.” és „f” oszlopával', () => {
    // GeoCalc: 3→543012: Stat −4.25, f 0.70; 541017D→543012: −3.66 / 0.65; 3→541066: 2.13 / 0.83; 541440→543062: −2.01 / 0.39
    const check = (st: string, tg: string, stat: number, f: number) => {
      const o = obs(st, tg, 'direction');
      expect(Math.abs(o.stat! - stat), `${st}→${tg} stat`).toBeLessThan(0.06);
      expect(Math.abs(o.redundancy! - f), `${st}→${tg} f`).toBeLessThan(0.02);
    };
    check('3', '543012', -4.25, 0.7);
    check('541017D', '543012', -3.66, 0.65);
    check('3', '541066', 2.13, 0.83);
    check('541440', '543062', -2.01, 0.39);
    expect(obs('2', '3', 'distance').redundancy!).toBeCloseTo(0.65, 1);
  });

  it('a lokális teszt a GeoCalc-hoz hasonlóan a 3→543012 irányt jelöli meg, és nem fogadható el', () => {
    const l = r.localTest!;
    expect([l.station, l.target]).toEqual(['3', '543012']);
    expect(l.stat).toBeCloseTo(-4.25, 1);
    expect(l.theoretical).toBeCloseTo(2.58, 2);
    expect(l.accepted).toBe(false);
  });

  it('a globális teszt intervalluma a χ² eloszlásból adódik, és a GeoCalc szerint sem fogadható el', () => {
    const g = r.globalTest!;
    expect(g.upper).toBeCloseTo(4 * Math.sqrt(39.99685 / 20), 2); // 5.66 – egyezik a GeoCalc felső határával
    expect(g.accepted).toBe(false);
  });

  it('az új pontok középhibái és a hibaellipszis egyezik a GeoCalc kimenetével', () => {
    // GeoCalc: 2: my 1.1 mx 1.3 max 1.4 min 1.0 szög 28° | 3: 1.1 1.2 1.4 0.9 34°
    const p2 = r.points.find((p) => p.id === '2')!;
    const p3 = r.points.find((p) => p.id === '3')!;
    const cm = (v: number) => Math.round(v * 1000) / 10;
    expect([cm(p2.my), cm(p2.mx), cm(p2.semiMajor), cm(p2.semiMinor)]).toEqual([1.1, 1.3, 1.4, 1.0]);
    expect(Math.abs(p2.angle - 28)).toBeLessThan(2);
    expect([cm(p3.my), cm(p3.mx), cm(p3.semiMajor)]).toEqual([1.1, 1.2, 1.4]);
    expect(Math.abs(p3.angle - 34)).toBeLessThan(2);
  });

  it('a hibahatár az irányoknál a GeoCalc értékeihez igazodik', () => {
    // GeoCalc: 2→541017: (20), 2→543012: (6), 2→541016: (9), 2→3: (24)
    expect(Math.round(obs('2', '541017', 'direction').limit)).toBe(20);
    expect(Math.abs(obs('2', '543012', 'direction').limit - 6)).toBeLessThanOrEqual(1);
    expect(Math.abs(obs('2', '541016', 'direction').limit - 9)).toBeLessThanOrEqual(1);
    expect(Math.abs(obs('2', '3', 'direction').limit - 24)).toBeLessThanOrEqual(1);
  });

  it('a jegyzőkönyv szakaszai elkészülnek', () => {
    const kinds = r.sections.map((s) => s.kind);
    expect(kinds.slice(0, 5)).toEqual(['net-summary', 'net-max', 'net-tests', 'net-known', 'net-points']);
    expect(kinds.filter((k) => k === 'net-station')).toHaveLength(4);
    const st2 = r.sections.find((s) => s.title.endsWith('álláspont: 2'))!;
    expect(st2.footer![0]).toBe('zk = 122.5938');
  });
});

describe('hálózat – hibakezelés és stabilitás', () => {
  it('ugyanaz a bemenet mindig ugyanazt adja', () => {
    const a = adjustHorizontal(coords, gmj.stations, DEFAULT_HORIZONTAL_SETTINGS);
    adjustHorizontal(coords, gmj.stations, { ...DEFAULT_HORIZONTAL_SETTINGS, directionWeight: 'equal' });
    const b = adjustHorizontal(coords, gmj.stations, DEFAULT_HORIZONTAL_SETTINGS);
    expect(b.points).toEqual(a.points);
    expect(b.sigma0Posterior).toBe(a.sigma0Posterior);
  });

  it('a súlyozási beállítások érvényesülnek (azonos irányok súlya más eredményt ad)', () => {
    const a = adjustHorizontal(coords, gmj.stations, DEFAULT_HORIZONTAL_SETTINGS);
    const b = adjustHorizontal(coords, gmj.stations, { ...DEFAULT_HORIZONTAL_SETTINGS, directionWeight: 'equal' });
    expect(b.weightedSumSquares).not.toBe(a.weightedSumSquares);
    // A koordináták a mérési pontosságon belül maradnak.
    expect(Math.abs(a.points[0]!.y - b.points[0]!.y)).toBeLessThan(0.05);
  });

  it('az előzetes koordináták nem számíthatók → érthető hibaüzenet', () => {
    const lonely = parseGmj('1,A,,,,,,,1.5,,,,,-1\n2,X,10.0000,90.0000,0,0,0,,,0,,,,-2\n').stations;
    expect(() => adjustHorizontal(coords, lonely, DEFAULT_HORIZONTAL_SETTINGS)).toThrow(/előzetes koordináták nem számíthatók/);
  });

  it('mérés nélkül és érvénytelen beállításra hibát ad', () => {
    expect(() => adjustHorizontal(coords, [], DEFAULT_HORIZONTAL_SETTINGS)).toThrow(CalcError);
    expect(() => adjustHorizontal(coords, gmj.stations, { ...DEFAULT_HORIZONTAL_SETTINGS, sigmaDirection: 0 })).toThrow(/pozitív/);
  });

  it('zajmentes mérésekből visszaadja a valódi pontokat (σ₀ ≈ 0)', () => {
    // Négy ismert pont, egy új (P); minden irány és távolság pontos.
    const known = [
      { id: 'A', y: 1000, x: 1000 }, { id: 'B', y: 2000, x: 1100 }, { id: 'C', y: 1800, x: 2000 }, { id: 'D', y: 900, x: 1900 },
    ].map((p) => ({ ...p, m: null, mark: '' }));
    const P = { y: 1450, x: 1480 };
    const zk = 0.7; // rad
    const all = [...known, { id: 'P', ...P, m: null, mark: '' }];
    const dirDeg = (a: { y: number; x: number }, b: { y: number; x: number }) => (((Math.atan2(b.y - a.y, b.x - a.x) - zk) * 180) / Math.PI + 720) % 360;
    const obsP = known.map((k) => ({
      target: k.id, hz: dirDeg(P, k), zi: null, slope: 1, horizontal: null, dM: null, targetHeight: null, distance: Math.hypot(k.y - P.y, k.x - P.x),
    }));
    void all;
    const st = [{ id: 'P', instrumentHeight: null, observations: obsP }];
    const r = adjustHorizontal(known, st, DEFAULT_HORIZONTAL_SETTINGS);
    expect(Math.abs(r.points[0]!.y - P.y)).toBeLessThan(1e-6);
    expect(Math.abs(r.points[0]!.x - P.x)).toBeLessThan(1e-6);
    expect(r.sigma0Posterior!).toBeLessThan(1e-3);
  });
});
