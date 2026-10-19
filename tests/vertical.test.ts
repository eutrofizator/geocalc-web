import { describe, expect, it } from 'vitest';
import { CalcError } from '../src/core/errors';
import { parseGmj, parseNetworkCoordinates } from '../src/core/network/gmj';
import { DEFAULT_VERTICAL_SETTINGS, type VerticalSettings } from '../src/core/network/types';
import { adjustHeights, trigonometricHeightDifference } from '../src/core/network/vertical';
import { ISZKA_COORDINATES, ISZKA_GMJ } from './fixtures/iszkahegy';

const coords = parseNetworkCoordinates(ISZKA_COORDINATES).points;
const stations = parseGmj(ISZKA_GMJ).stations;
/** A GeoCalc „Önálló hálózat" beállítása a mintapéldához. */
const FREE: VerticalSettings = { ...DEFAULT_VERTICAL_SETTINGS, free: true };

describe('trigonometrikus magasságkülönbség', () => {
  it('a zenitszögből, a magasságokból és a görbületből a jegyzőkönyv értékét adja', () => {
    // 2 → 541017D: távolság 1008.9736, zenitszög 89°21'56", műszermagasság 1.40, prizmamagasság 1.39 → GMJ dM = 11.2535
    const dh = trigonometricHeightDifference(1008.9736, 89 + 21 / 60 + 56 / 3600, 1.4, 1.39);
    expect(Math.abs(dh - 11.2535)).toBeLessThan(0.002);
  });

  it('vízszintes irányra a görbületi tag adja az egyetlen magasságkülönbséget', () => {
    const dh = trigonometricHeightDifference(1000, 90, 1.5, 1.5);
    expect(dh).toBeCloseTo((0.87 * 1000 * 1000) / (2 * 6371000), 6);
  });
});

describe('magassági hálózat – valódi példa a GeoCalc saját kimenetével (önálló hálózat)', () => {
  const r = adjustHeights(coords, stations, FREE);
  const point = (id: string) => r.points.find((p) => p.id === id)!;
  const edge = (a: string, b: string) => r.observations.find((o) => o.station === a && o.target === b)!;

  it('a hálózat jellemző adatai egyeznek', () => {
    expect(r.counts.points).toBe(4);
    expect(r.counts.differences).toBe(6);
    expect(r.counts.redundancy).toBe(3);
  });

  it('a közelítő magasságok egyeznek a GeoCalc előzetes értékeivel', () => {
    // GeoCalc: 2: 249.32, 3: 273.39, 541017D: 260.50, 541440: 278.45
    expect(point('2').approximate).toBeCloseTo(249.32, 2);
    expect(point('3').approximate).toBeCloseTo(273.39, 2);
    expect(point('541017D').approximate).toBeCloseTo(260.5, 2);
    expect(point('541440').approximate).toBeCloseTo(278.45, 2);
  });

  it('a kiegyenlített magasságok és változásaik egyeznek a GeoCalc-kal (±1 cm)', () => {
    // GeoCalc: 2: 249.35 (+0.02), 3: 273.37 (−0.02), 541017D: 260.57 (+0.07), 541440: 278.38 (−0.07)
    const expected: Record<string, number> = { '2': 249.35, '3': 273.37, '541017D': 260.57, '541440': 278.38 };
    for (const [id, h] of Object.entries(expected)) expect(Math.abs(point(id).height - h), id).toBeLessThanOrEqual(0.0101);
    const change = (id: string) => (point(id).height - point(id).approximate) * 100;
    expect(change('2')).toBeCloseTo(2, 0);
    expect(change('3')).toBeCloseTo(-2, 0);
    expect(change('541017D')).toBeCloseTo(7, 0);
    expect(change('541440')).toBeCloseTo(-7, 0);
    // A javítások összege nulla (az átlagmagasság marad).
    expect(r.points.reduce((s, p) => s + (p.height - p.approximate), 0)).toBeCloseTo(0, 9);
  });

  it('a súlyozott négyzetösszeg és a súlyegység középhibája egyezik (GeoCalc: 40.279 és 3.664)', () => {
    expect(r.weightedSumSquares).toBeCloseTo(40.279, 0);
    expect(r.sigma0!).toBeCloseTo(3.664, 2);
  });

  it('a pontok középhibái egyeznek a GeoCalc-kal (1.6 cm és 2.4 cm)', () => {
    expect(point('2').sigma * 100).toBeCloseTo(1.6, 1);
    expect(point('3').sigma * 100).toBeCloseTo(1.6, 1);
    expect(point('541017D').sigma * 100).toBeCloseTo(2.4, 1);
    expect(point('541440').sigma * 100).toBeCloseTo(2.4, 1);
  });

  it('a javítások, a Stat. és az f egyeznek (GeoCalc: ∓0.03 m, ±4.28 / 4.64 / 0.68, f = 0.50)', () => {
    expect(edge('2', '541017D').residual).toBeCloseTo(-0.03, 2);
    expect(edge('541017D', '2').residual).toBeCloseTo(-0.03, 2);
    expect(edge('3', '541440').residual).toBeCloseTo(0.03, 2);
    expect(edge('541440', '3').residual).toBeCloseTo(0.03, 2);
    expect(edge('2', '3').residual).toBeCloseTo(0, 2);
    expect(edge('2', '541017D').stat).toBeCloseTo(-4.28, 1);
    expect(edge('3', '541440').stat).toBeCloseTo(4.64, 1);
    expect(edge('2', '3').stat).toBeCloseTo(0.68, 1);
    for (const o of r.observations) expect(o.redundancy).toBeCloseTo(0.5, 6);
  });

  it('a kiegyenlített magasságkülönbségek egyeznek a GeoCalc-kal', () => {
    expect(edge('2', '541017D').adjusted).toBeCloseTo(11.22, 2);
    expect(edge('2', '3').adjusted).toBeCloseTo(24.02, 2);
    expect(edge('3', '541440').adjusted).toBeCloseTo(5.01, 2);
  });

  it('a hibahatárok egyeznek a GeoCalc-kal (0.15, 0.11, 0.10 m)', () => {
    expect(edge('2', '541017D').limit).toBeCloseTo(0.15, 2);
    expect(edge('2', '3').limit).toBeCloseTo(0.11, 2);
    expect(edge('3', '541440').limit).toBeCloseTo(0.1, 2);
  });

  it('a próbák: a legnagyobb javítás a 4. mérés (3 → 541440), a globális próba felső határa 2.08', () => {
    expect(r.localTest!.index).toBe(4); // a 4. és a 6. mérés Stat.-ja azonos; a GeoCalc is a 4.-et jelöli
    expect(Math.abs(r.localTest!.stat)).toBeCloseTo(4.64, 1);
    expect(r.localTest!.theoretical).toBeCloseTo(2.58, 2);
    expect(r.localTest!.accepted).toBe(false);
    expect(r.globalTest!.upper).toBeCloseTo(2.08, 1);
    expect(r.globalTest!.accepted).toBe(false);
  });

  it('a jegyzőkönyv szakaszai elkészülnek', () => {
    expect(r.sections.map((s) => s.kind)).toEqual(['height-summary', 'height-max', 'height-tests', 'height-points', 'height-differences']);
  });
});

describe('magassági hálózat – beillesztett hálózat és hibakezelés', () => {
  it('rögzített pontoknál a rögzített magasságok nem változnak', () => {
    const r = adjustHeights(coords, stations, { ...DEFAULT_VERTICAL_SETTINGS, free: false });
    const d = r.points.find((p) => p.id === '541017D')!;
    const e = r.points.find((p) => p.id === '541440')!;
    expect(d.fixed && e.fixed).toBe(true);
    expect(d.height).toBe(260.5);
    expect(e.height).toBe(278.45);
    expect(r.counts.redundancy).toBe(4); // 6 mérés − 2 ismeretlen (2, 3)
  });

  it('beillesztett hálózatban a mérési javítások a két rögzített pont közötti zárási hibát osztják el', () => {
    const r = adjustHeights(coords, stations, DEFAULT_VERTICAL_SETTINGS);
    const sum = r.observations.filter((o) => ['2→541017D', '2→3', '3→541440'].includes(`${o.station}→${o.target}`));
    // a lánc kiegyenlített összege = a rögzített pontok magasságkülönbsége
    const chain = -sum[0]!.adjusted + sum[1]!.adjusted + sum[2]!.adjusted; // 541017D → 2 → 3 → 541440
    expect(chain).toBeCloseTo(278.45 - 260.5, 6);
  });

  it('távolsággal arányos súlyozás más eredményt ad, de a kiegyenlítés lefut', () => {
    const a = adjustHeights(coords, stations, FREE);
    const b = adjustHeights(coords, stations, { ...FREE, weight: 'proportional' });
    expect(b.sigma0).not.toBe(a.sigma0);
    expect(b.points).toHaveLength(4);
  });

  it('beillesztett hálózat magassági bázis nélkül érthető hibát ad', () => {
    expect(() => adjustHeights([], stations, DEFAULT_VERTICAL_SETTINGS)).toThrow(/legalább egy adott magasságú pont/);
  });

  it('nem összefüggő hálózatra és távolság nélküli mérésre hibát ad', () => {
    const noDist = parseGmj('1,A,,,,,,,1.5,,,,,-1\n2,B,10.0000,90.0000,0,0,1.0,,,0,,,,-2\n').stations;
    expect(() => adjustHeights(coords, noDist, FREE)).toThrow(CalcError);
    const split = parseGmj(
      '1,P,,,,,,,1.5,,,,,-1\n2,Q,10.0000,90.0000,100,100,1.0,,,1.5,100,,,-2\n3,R,,,,,,,1.5,,,,,-1\n4,S,10.0000,90.0000,100,100,2.0,,,1.5,100,,,-2\n',
    ).stations;
    const extraPoints = ['Q', 'S']; // nem állomás pontok: kifejezetten a hálózat pontjai
    expect(() => adjustHeights([{ id: 'P', y: 0, x: 0, m: 100, mark: '' }], split, DEFAULT_VERTICAL_SETTINGS, extraPoints)).toThrow(/nem összefüggő/);
  });

  it('zajmentes mérésekből visszaadja a valódi magasságokat', () => {
    const truth: Record<string, number> = { A: 100, B: 112.5, C: 98.25, D: 105 };
    const mk = (a: string, b: string) => `x,${b},10.0000,90.0000,100,100,${(truth[b]! - truth[a]!).toFixed(4)},,,1.5,100,,,-2`;
    const gmj = ['1,A,,,,,,,1.5,,,,,-1', mk('A', 'B'), mk('A', 'C'), '2,B,,,,,,,1.5,,,,,-1', mk('B', 'D'), '3,C,,,,,,,1.5,,,,,-1', mk('C', 'D')].join('\n');
    // A D pont nem állomás: kifejezetten a hálózat pontja (különben részletpont lenne).
    const r = adjustHeights([{ id: 'A', y: 0, x: 0, m: 100, mark: '' }], parseGmj(gmj).stations, DEFAULT_VERTICAL_SETTINGS, ['D']);
    for (const p of r.points) expect(Math.abs(p.height - truth[p.id]!)).toBeLessThan(1e-9);
    expect(r.sigma0!).toBeLessThan(1e-6);
  });
});
