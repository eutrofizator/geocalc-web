import { describe, expect, it } from 'vitest';
import { parseMeasured } from '../src/core/boundary-check';
import { parseFieldData } from '../src/core/field-book';
import { baseName, farPoints, gnssToText, mergePointLines, parseGnssText, pointRole, splitByKnown } from '../src/core/gnss';

describe('GNSS koordináta-export', () => {
  it('az utótag nélküli pontszám', () => {
    expect(baseName('5001_01')).toBe('5001');
    expect(baseName('5001_2')).toBe('5001');
    expect(baseName('5001')).toBe('5001');
    expect(baseName('K_A')).toBe('K_A');
    expect(baseName('12_3456')).toBe('12_3456');
  });

  it('vesszővel tagolt, fejléces, X-Y sorrendű export (Northing, Easting)', () => {
    const r = parseGnssText(['Name,Northing,Easting,Elevation,Code', '5001_01,241230.181,650120.452,112.34,HP', '901_01,241236.710,650158.920,112.10,EP'].join('\r\n'));
    expect(r.layout).toBe('pontszám, X, Y, Z, kód');
    expect(r.points.map((p) => [p.id, p.y, p.x, p.z, p.code])).toEqual([
      ['5001', 650120.452, 241230.181, 112.34, 'HP'],
      ['901', 650158.92, 241236.71, 112.1, 'EP'],
    ]);
  });

  it('pontosvesszős, tizedesvesszős, Y-X sorrendű export', () => {
    const r = parseGnssText('5001_01;650120,45;241230,18;112,3\n5002_01;650158,92;241236,71;112,1\n');
    expect(r.layout).toBe('pontszám, Y, X, Z');
    expect(r.points[1]).toMatchObject({ id: '5002', y: 650158.92, x: 241236.71 });
  });

  it('szóközzel tagolt, a pontszám az X tartományba esik (50001)', () => {
    const r = parseGnssText('50001 650120.452 241230.181 112.3\n50002 650158.920 241236.710 112.1');
    expect(r.points.map((p) => [p.id, p.y, p.x])).toEqual([
      ['50001', 650120.452, 241230.181],
      ['50002', 650158.92, 241236.71],
    ]);
  });

  it('az ismételt mérések (5001_01, 5001_02) átlaga, nagy eltérésnél figyelmeztetés', () => {
    const r = parseGnssText('5001_01 650120.40 241230.20\n5001_02 650120.42 241230.22\n5002_01 650150.00 241240.00\n5002_02 650150.20 241240.00');
    const p = r.points.find((q) => q.id === '5001')!;
    expect(p.sources).toEqual(['5001_01', '5001_02']);
    expect(p.y).toBeCloseTo(650120.41, 6);
    expect(p.x).toBeCloseTo(241230.21, 6);
    expect(r.issues.filter((i) => i.level === 'warning').map((i) => i.message)).toEqual([
      '5002 (5002_01, 5002_02): az ismételt mérések 0.100 m-re térnek el az átlagtól – ellenőrizd.',
    ]);
  });

  it('EOV koordináta nélküli állomány hibát ad', () => {
    const r = parseGnssText('1,47.123456,19.123456,120.0');
    expect(r.points).toEqual([]);
    expect(r.issues[0]!.level).toBe('error');
  });

  it('ismert és új pontok szétválasztása, beírás a meglévő jegyzékbe', () => {
    const r = parseGnssText('5001_01 650120.452 241230.181\n901_01 650158.920 241236.710 112.1');
    const { known, fresh } = splitByKnown(r.points, new Set(['5001', '5002']));
    expect(known.map((p) => p.id)).toEqual(['5001']);
    expect(fresh.map((p) => p.id)).toEqual(['901']);
    expect(mergePointLines('# mért\n5001_01 1 2 R2\n5003 650000 240000', known, false)).toBe('# mért\n5003 650000 240000\n5001 650120.452 241230.181');
    expect(gnssToText(fresh)).toBe('901 650158.920 241236.710 112.100');
  });

  it('a mért pontok közt az utótagos pontszám a földhivatali pontra vonatkozik', () => {
    const m = parseMeasured('5001_01 650120.40 241230.20 R2\n5001_02 650120.42 241230.22');
    expect([...m.points.keys()]).toEqual(['5001']);
    const p = m.points.get('5001')!;
    expect(p.order).toBe('R2');
    expect(p.y).toBeCloseTo(650120.41, 6);
    expect(m.issues.map((i) => i.message)).toEqual(['Mért pontok: a(z) 5001 pont 2 mérésének átlaga.']);
  });

  it('a kód szerinti szerep: ap alappont, fix földhivatali, kit kitűzött – nem átlagolódnak egymással', () => {
    expect([pointRole('ap'), pointRole('FIX'), pointRole('kit'), pointRole('HP')]).toEqual(['base', 'reference', 'staked', 'other']);
    const r = parseGnssText(['1001,650100.310,241278.359,109.841,ap', '5001,650106.540,241281.400,0.000,fix', '5001_1,650106.548,241281.398,110.762,kit'].join('\n'));
    expect(r.points.map((p) => [p.id, p.role, p.sources.join('+')])).toEqual([
      ['1001', 'base', '1001'],
      ['5001', 'reference', '5001'],
      ['5001', 'staked', '5001_1'],
    ]);
    expect(r.issues).toEqual([]);
    expect(gnssToText(r.points.filter((p) => p.role === 'base'))).toBe('1001 650100.310 241278.359 109.841 AP');
  });

  it('a betűs utótag (1001_E) ellenőrző mérés: eltérés megjegyzésként, nem átlagolódik', () => {
    expect(baseName('1001_E')).toBe('1001');
    const r = parseGnssText('1001 650100.310 241278.359\n1001_E 650100.320 241278.357');
    expect(r.points.map((p) => [p.id, p.role])).toEqual([
      ['1001', 'other'],
      ['1001', 'check'],
    ]);
    expect(r.issues[0]!.message).toBe('1001_E: a(z) 1001 pont ellenőrző mérése, eltérés dY = 0.010, dX = -0.002, d = 0.010 m.');
  });

  it('Leica GSI koordinátaállomány (11, 81, 82, 83 szavak)', () => {
    const gsi = [
      '110001+0000000000001001 81..10+0000000650100310 82..10+0000000241278359 83..10+0000000000109841 ',
      '110002+0000000000002001 81..10+0000000650106494 82..10+0000000241287294 83..10+0000000000114945 ',
      '110003+00000000001001_E 81..10+0000000650100320 82..10+0000000241278357 83..10+0000000000109085 ',
    ].join('\r\n');
    const r = parseGnssText(gsi);
    expect(r.layout).toBe('Leica GSI (11 pontszám, 81 Y, 82 X, 83 Z)');
    expect(r.points.map((p) => [p.id, p.role, p.y, p.x, p.z])).toEqual([
      ['1001', 'other', 650100.31, 241278.359, 109.841],
      ['2001', 'other', 650106.494, 241287.294, 114.945],
      ['1001', 'check', 650100.32, 241278.357, 109.085],
    ]);
    // A nyers mérés olvasója megmondja, hogy ez nem mérés, hanem koordinátajegyzék.
    const f = parseFieldData(gsi, 'leica-gsi16');
    expect(f.rows).toEqual([]);
    expect(f.issues[0]!.message).toMatch(/^Az állomány csak koordinátákat tartalmaz/);
  });

  it('a munkaterülettől messze eső pont (tájékozatlan kezdő álláspont)', () => {
    const P = (id: string, y: number, x: number) => ({ id, y, x });
    const work = [P('1', 650100, 241278), P('2', 650120, 241290), P('3', 650110, 241300)];
    expect([...farPoints([...work, P('9', 649700, 227600)], work)]).toEqual(['9']);
  });
});
