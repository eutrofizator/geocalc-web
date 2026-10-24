import { describe, expect, it } from 'vitest';
import { parseDms } from '../src/core/angle';
import { averageTwoFaces, parseGeoCalcAr, toNetworkGmj, undoAveraging } from '../src/core/field-book';
import { parseGmj } from '../src/core/network/gmj';

/**
 * Két távcsőállás középelése a Mérési adatok munkalapon – a GeoCalc GCAR_2T programjának helyett.
 * Az elvárt értékek a GCAR_2T valódi kimenetei (minta.gmj → proba.GMJ, 2T.gmj → giuigh.GMJ); a GCAR a
 * fél másodpercet nem mindig ugyanarra kerekíti, ezért a tűrés 1″.
 */

const sec = (a: number, b: number) => Math.abs(((((a - b + 180) % 360) + 360) % 360) - 180) * 3600;
const mean = (rows: ReturnType<typeof averageTwoFaces>['rows'], id: string, station?: string) => {
  let current = '';
  for (const r of rows) {
    if (r.kind === 'station') current = r.id;
    else if (r.state === 'mean' && r.id === id && (station === undefined || station === current)) return r;
  }
  throw new Error(`nincs középelt ${id}`);
};

describe('a GCAR_2T mintapéldája (minta.gmj → proba.GMJ)', () => {
  const MINTA = [
    '3,110,,,,,,FURAT,0,,,,,-1',
    '4,8,322.0231,90.0010,,,,FURAT,,0,,,,-2',
    '5,9,359.4142,89.5950,,,,FURAT,,0,,,,-2',
    '6,9,179.4148,270.0015,,,,FURAT,,0,,,,-2',
    '7,8,142.0224,269.5942,,,,FURAT,,0,,,,-2',
  ].join('\n');
  const res = averageTwoFaces(parseGeoCalcAr(MINTA).rows);

  it('mindkét célpont középelve, az eredetiek pirosak', () => {
    expect(res.count).toBe(2);
    expect(res.rows.filter((r) => r.state === 'merged')).toHaveLength(4);
    expect(res.rows.filter((r) => r.state === 'mean').map((r) => r.id)).toEqual(['8', '9']);
  });

  it('a GCAR_2T értékei (8: 322.0228 / 90.0014, 9: 359.4145 / 89.5947)', () => {
    expect(sec(mean(res.rows, '8').hz!, parseDms('322.0228'))).toBeLessThanOrEqual(1.001);
    expect(sec(mean(res.rows, '8').zi!, parseDms('90.0014'))).toBeLessThanOrEqual(1.001);
    expect(sec(mean(res.rows, '9').hz!, parseDms('359.4145'))).toBeLessThanOrEqual(1.001);
    expect(sec(mean(res.rows, '9').zi!, parseDms('89.5947'))).toBeLessThanOrEqual(1.001);
  });

  it('az indexhiba (Zi₁ + Zi₂ − 360°) kimutatható', () => {
    // 8: 90°00′10″ + 269°59′42″ = 359°59′52″ → −8″; 9: 89°59′50″ + 270°00′15″ → +5″
    expect(res.maxIndexError).toBeCloseTo(8, 6);
  });
});

describe('a GCAR_2T kétállásos példája (2T.gmj → giuigh.GMJ), átnevezett pontokkal', () => {
  const T2 = [
    '1,A,,,,,,ko,1.54,,,,,-1',
    '2,P1,16.3208,89.4218,,,,torony,,0.000,,,,-2',
    '3,P2,104.4155,85.5211,,,,torony,,0.000,,,,-2',
    '4,P3,175.0711,88.3254,856.000,,,ko,,1.520,,,,-2',
    '5,P4,241.0520,96.1847,1100.500,,,ko,,1.650,,,,-2',
    '6,P5,269.0003,90.5027,750.000,,,ko,,1.600,,,,-2',
    '7,P5,88.5954,269.0809,750.010,,,ko,,1.600,,,,-2',
    '8,P4,61.0510,263.3953,1100.516,,,ko,,1.650,,,,-2',
    '9,P3,355.0702,271.2604,,,,ko,,1.520,,,,-2',
    '10,P2,284.4148,274.0634,,,,torony,,0.000,,,,-2',
    '11,P1,196.3159,270.1638,,,,torony,,0.000,,,,-2',
    '1,B,,,,,,ko,1.54,,,,,-1',
    '2,P1,359.5959,89.4218,,,,torony,,0.000,,,,-2',
    '3,P2,104.4155,85.5211,,,,torony,,0.000,,,,-2',
    '4,P3,175.0711,88.3254,856.000,840.001,,ko,,1.520,,,,-2',
    '9,P3,355.0702,271.2604,,840.008,,ko,,1.520,,,,-2',
    '10,P2_,284.4148,274.0634,,,,torony,,0.000,,,,-2',
    '11,P1,180.0009,270.1638,,,,torony,,0.000,,,,-2',
    '2,P1b,359.5950,89.4218,,,,torony,,0.000,,,,-2',
    '11,P1b,180.0005,270.1638,,,,torony,,0.000,,,,-2',
    '2,P1c,0.0000,89.4218,,,,torony,,0.000,,,,-2',
    '11,P1c,179.5955,270.1638,,,,torony,,0.000,,,,-2',
  ].join('\n');
  const res = averageTwoFaces(parseGeoCalcAr(T2).rows);
  const expected: [string, string, string, string, number | null, number | null][] = [
    // állomás, pont, Hz, Zi, Tf, Tv – a GCAR_2T kimenete
    ['A', 'P5', '268.5959', '90.5109', 750.005, null],
    ['A', 'P1', '16.3204', '89.4250', null, null],
    ['A', 'P2', '104.4152', '85.5248', null, null],
    ['A', 'P4', '241.0515', '96.1927', 1100.508, null],
    ['A', 'P3', '175.0707', '88.3325', 856, null],
    ['B', 'P1', '0.0004', '89.4250', null, null],
    ['B', 'P1b', '359.5958', '89.4250', null, null],
    ['B', 'P1c', '359.5958', '89.4250', null, null],
    ['B', 'P3', '175.0707', '88.3325', 856, 840.0045],
  ];

  for (const [st, id, hz, zi, tf, tv] of expected) {
    it(`${st} → ${id}: Hz ${hz}, Zi ${zi}`, () => {
      const m = mean(res.rows, id, st);
      expect(sec(m.hz!, parseDms(hz))).toBeLessThanOrEqual(1.001);
      expect(sec(m.zi!, parseDms(zi))).toBeLessThanOrEqual(1.001);
      if (tf !== null) expect(m.tf).toBeCloseTo(tf, 4);
      if (tv !== null) expect(m.tv).toBeCloseTo(tv, 4);
    });
  }

  it('a különböző pontszámú irányok (P2 és P2_) nem párosulnak, egy állásban maradnak', () => {
    const b = res.rows.slice(res.rows.findIndex((r) => r.kind === 'station' && r.id === 'B'));
    expect(b.filter((r) => r.id === 'P2' || r.id === 'P2_').map((r) => r.state)).toEqual(['ok', 'ok']);
    expect(res.single).toBeGreaterThanOrEqual(2);
  });

  it('a konvertálás csak a középelt irányokat viszi át; a középelés visszavonható', () => {
    const net = parseGmj(toNetworkGmj(res.rows).text);
    expect(net.stations[0]!.observations.map((o) => o.target).sort()).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
    const undone = undoAveraging(res.rows);
    expect(undone.filter((r) => r.state !== 'ok')).toHaveLength(0);
    expect(undone).toHaveLength(parseGeoCalcAr(T2).rows.length);
  });
});
