import { describe, expect, it } from 'vitest';
import { run, type RunResult } from '../src/core/engine';
import { EXAMPLES } from '../src/examples';

const example = (id: string) => EXAMPLES.find((e) => e.id === id)!.source;
const section = (r: RunResult, kind: string) => r.sections.find((s) => s.kind === kind)!;
const errors = (r: RunResult) => r.issues.filter((i) => i.level === 'error');

describe('DK – derékszögű koordinátamérés (súgó mintapélda)', () => {
  const r = run(example('dk'));
  const t = section(r, 'dk');

  it('az alaphossz számított és mért értéke egyezik', () => {
    expect(errors(r)).toEqual([]);
    expect(t.rows[0]!.cells).toEqual(['111', 'Tszám =', '241.836', '551160.123', '123187.020']);
    expect(t.rows[1]!.cells).toEqual(['1009', 'Tmért =', '241.780', '551125.892', '123426.421']);
  });

  it('a koordináták a mért alaphosszal skálázva egyeznek a súgóval', () => {
    expect(t.rows[2]!.cells).toEqual(['77', '-12.079', '2.559', '551159.299', '123174.698']);
    expect(t.rows[3]!.cells).toEqual(['79', '-18.020', '-4.370', '551167.001', '123169.796']);
  });

  it('mért távolság nélkül skálázás nélkül számol (a KM fordítottja)', () => {
    const km = run(`${example('dk').split(';;')[0]};;\ndk\n111,1009\n77, -12.079, 2.559\n;;\n`);
    const p = km.computed.find((x) => x.id === '77')!;
    expect(p.y.toFixed(3)).toBe('551159.300');
    expect(p.x.toFixed(3)).toBe('123174.700');
  });
});

describe('KP – külpontos mérés központosítása (súgó mintapélda)', () => {
  const r = run(example('kp'));

  it('hibátlanul lefut', () => expect(errors(r)).toEqual([]));

  it('az ismert pontok központosítása egyezik a súgóval', () => {
    const t = section(r, 'kp');
    expect(t.rows[0]!.cells.slice(0, 5)).toEqual(['526', '602108.260', '204491.990', '226.0611', 'r = 31.527']);
    expect(t.rows[1]!.cells).toEqual(['52', '601817.360', '205231.270', '0.0107', '794.454', '1.3817', '1.3924']);
    expect(t.rows[2]!.cells).toEqual(['521', '602064.510', '204732.010', '8.1517', '243.975', '4.3251', '12.4808']);
  });

  it('a tájékozás (súlyozott átlag) egyezik a súgóval', () => {
    const t = section(r, 'kp-orient');
    expect(t.rows[0]!.cells[4]).toBe('Zk = 336.5154');
    expect(t.rows[1]!.cells).toEqual(['52', '1.3924', '338.3115', '794.454', '336.5151', '-3']);
    expect(t.rows[2]!.cells).toEqual(['521', '12.4808', '349.4011', '243.975', '336.5203', '9']);
  });

  it('az ismeretlen pont központ–pont távolsága egyezik a súgóval', () => {
    const t = section(r, 'kp-polar');
    expect(t.rows[1]!.cells[0]).toBe('102');
    expect(t.rows[1]!.cells[4]).toBe('146.868');
  });

  /**
   * A súgó 602234.564 / 204566.940 értéket közöl a 102-es pontra, de az 4,4 m-re van a pontos megoldástól:
   * a régi program az irányjavítás szinusztételében a külpontból mért távolságot (123.586) használta a
   * központ–pont távolság (146.868) helyett. A pontos megoldást független számítás igazolja: a külpontos
   * álláspontból az ismert pontokra mért irányok a megadott tájékozással 10″-en belül visszaadódnak.
   */
  it('az ismeretlen pont a pontos geometria szerint számolódik', () => {
    const p = r.computed.find((x) => x.id === '102')!;
    expect(p.y.toFixed(3)).toBe('602236.761');
    expect(p.x.toFixed(3)).toBe('204563.107');
  });

  it('a külpontos álláspontból az ismert pontokra mért irányok visszaadódnak', () => {
    const C = { y: 602108.26, x: 204491.99 };
    const zk = (336 + 51 / 60 + 54 / 3600) * (Math.PI / 180);
    const lc = (226 + 6 / 60 + 11 / 3600) * (Math.PI / 180);
    const E = { y: C.y - 31.527 * Math.sin(lc + zk), x: C.x - 31.527 * Math.cos(lc + zk) };
    const lOf = (P: { y: number; x: number }) => ((Math.atan2(P.y - E.y, P.x - E.x) - zk) * 180) / Math.PI;
    const deg = (a: number) => ((a % 360) + 360) % 360;
    expect(Math.abs(deg(lOf({ y: 601817.36, x: 205231.27 })) - (0 + 1 / 60 + 7 / 3600))).toBeLessThan(15 / 3600);
    expect(Math.abs(deg(lOf({ y: 602064.51, x: 204732.01 })) - (8 + 15 / 60 + 17 / 3600))).toBeLessThan(15 / 3600);
  });

  it('ismeretlen pontra távolság nélkül hibát jelez, de a többit kiszámítja', () => {
    const bad = run(`${example('kp').replace('102  93.1325  123.5864', '102  93.1325')}`);
    expect(bad.issues.some((i) => i.level === 'error' && /távolság/.test(i.message))).toBe(true);
    expect(bad.sections.some((s) => s.kind === 'kp-orient')).toBe(true);
  });
});

describe('AF – affin transzformáció (súgó mintapélda)', () => {
  const r = run(example('af'));
  const t = section(r, 'af');
  const row = (id: string) => t.rows.find((x) => x.cells[0] === id)!.cells;

  it('hibátlanul lefut', () => expect(errors(r)).toEqual([]));

  it('az együtthatók és a súlypont egyeznek a súgóval', () => {
    expect(t.footer![0]).toBe('a = -0.999840719   b = 0.000075534   c = -0.000100397   d = -0.999841039');
    expect(row('Súlypont').slice(1, 5)).toEqual(['-120361.040', '105754.280', '770352.672', '132368.321']);
  });

  it('a javítások (adott − számított) egyeznek a súgóval', () => {
    expect(row('1').slice(5)).toEqual(['-0.021', '0.003']);
    expect(row('2').slice(5)).toEqual(['0.036', '0.005']);
    expect(row('3').slice(5)).toEqual(['-0.018', '0.002']);
    expect(row('4').slice(5)).toEqual(['0.002', '-0.014']);
    expect(row('5').slice(5)).toEqual(['-0.004', '0.016']);
    expect(row('6').slice(5)).toEqual(['0.005', '-0.012']);
  });

  it('az átszámított pontok egyeznek a súgóval, és nem keverednek az eredeti pontokkal', () => {
    expect(row('11').slice(3, 5)).toEqual(['770131.568', '132624.628']);
    expect(row('12').slice(3, 5)).toEqual(['769028.947', '131123.726']);
    expect(r.computed).toEqual([]); // az új rendszer pontjai külön listában vannak
    expect(r.transformed.map((p) => p.id)).toEqual(['11', '12']);
    expect(r.exports.some((e) => e.name === 'eredmeny.TTR')).toBe(true);
    expect(r.points.find((p) => p.id === '11')!.y).toBe(-120139.92);
  });

  it('három ponttól kevesebbel érthető hibát ad', () => {
    const bad = run(`k_\n1 0 0\n2 1 1\n;;\naf\n1 5 5\n2 6 6\n;;\n1\n;;\n`);
    expect(bad.issues.some((i) => i.level === 'error' && /legalább 3/.test(i.message))).toBe(true);
  });
});

describe('HE – Helmert-transzformáció (súgó mintapélda)', () => {
  const r = run(example('he'));
  const t = section(r, 'he');
  const row = (id: string) => t.rows.find((x) => x.cells[0] === id)!.cells;

  it('az együtthatók és a súlypont egyeznek a súgóval', () => {
    expect(errors(r)).toEqual([]);
    expect(t.footer![0]).toBe('a = -1.896291087   b = 0.000163937');
    expect(row('Súlypont').slice(1, 5)).toEqual(['28906.310', '15613.567', '595187.677', '208492.520']);
  });

  it('a javítások és az átszámított pontok egyeznek a súgóval', () => {
    expect(row('1413').slice(5)).toEqual(['-0.007', '0.025']);
    expect(row('1408').slice(5)).toEqual(['0.014', '-0.020']);
    expect(row('3203').slice(5)).toEqual(['-0.007', '-0.004']);
    expect(row('1').slice(3, 5)).toEqual(['595010.077', '207759.715']);
    expect(row('2').slice(3, 5)).toEqual(['596906.236', '209276.912']);
  });

  it('két közös ponttal is számol, egy ponttal hibát ad', () => {
    const two = run(`k_\n1 0 0\n2 0 10\n;;\nhe\n1 100 100\n2 100 120\n;;\n2\n;;\n`);
    expect(errors(two)).toEqual([]);
    const p = two.transformed[0]!;
    expect([p.y.toFixed(3), p.x.toFixed(3)]).toEqual(['100.000', '120.000']);
    const one = run(`k_\n1 0 0\n;;\nhe\n1 100 100\n;;\n1\n;;\n`);
    expect(one.issues.some((i) => i.level === 'error')).toBe(true);
  });

  it('a két listás blokk után a következő számítás normálisan fut', () => {
    const r2 = run(`${example('he')}it\n1408\n3203\n;;\n`);
    expect(r2.sections.some((s) => s.kind === 'it')).toBe(true);
  });
});
