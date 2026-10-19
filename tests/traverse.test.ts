import { describe, expect, it } from 'vitest';
import { run, type RunResult } from '../src/core/engine';
import { EXAMPLES } from '../src/examples';

const example = (id: string) => EXAMPLES.find((e) => e.id === id)!.source;
const section = (r: RunResult, kind: string) => r.sections.find((s) => s.kind === kind)!;
const errors = (r: RunResult) => r.issues.filter((i) => i.level === 'error');

describe('TJ – iránysorozat tájékozása (súgó mintapélda)', () => {
  const r = run(example('tj'));

  it('hibátlanul lefut', () => expect(errors(r)).toEqual([]));

  it('a tájékozási szög és az irányonkénti eredmények egyeznek a súgóval', () => {
    const t = section(r, 'tj');
    expect(t.title).toBe('Végleges tájékozás [1]');
    expect(t.rows[0]!.cells[4]).toBe('Zk = 0.4836');
    // [pontszám, l, de, t, zi, e″]
    expect(t.rows[1]!.cells).toEqual(['9', '182.0324', '182.5201', '1013.088', '0.4837', '1']);
    expect(t.rows[2]!.cells).toEqual(['5', '230.2105', '231.0943', '1238.789', '0.4838', '3']);
    expect(t.rows[3]!.cells).toEqual(['6', '321.2330', '322.1202', '1182.216', '0.4832', '-4']);
  });

  it('a tájékozás a későbbi PO számításban érvényesül', () => {
    const po = run(`${example('tj')}po\n1\n9, 182.0324, 1013.088\n;;\n`);
    const p9 = po.points.find((p) => p.id === '9')!;
    const calc = po.computed.find((p) => p.id === '9')!;
    expect(Math.abs(calc.y - p9.y)).toBeLessThan(0.003);
    expect(Math.abs(calc.x - p9.x)).toBeLessThan(0.003);
  });

  it('a 360°-os átfordulásnál is jól átlagol', () => {
    // Az irányszögek 359°59'59" és 0°00'01" körül adják a tájékozást: az átlag ≈ 0, nem 180.
    const res = run(`k_\n1 , 0 , 0\n2 , 0 , 100\n3 , 0.0010 , 100\n;;\ntj\n1\n2, 0.0001\n3, 359.5959\n`);
    expect(errors(res)).toEqual([]);
    const zk = section(res, 'tj').rows[0]!.cells[4]!;
    expect(zk === 'Zk = 0.0000' || zk === 'Zk = 359.5959' || zk === 'Zk = 0.0001').toBe(true);
  });
});

describe('SV – tájékozatlan beillesztett sokszögvonal (súgó mintapélda)', () => {
  const r = run(example('sv'));
  const t = section(r, 'sv');
  const rowOf = (id: string) => t.rows.find((x) => x.cells[0] === id)!.cells;
  // oszlopok: Pontszám Lh Le D T DYi DXi DYjav DXjav dy dx Y X

  it('hibátlanul lefut, a zárási hiba a megengedetten belül marad', () => {
    expect(errors(r)).toEqual([]);
    expect(r.issues.filter((i) => i.level === 'warning')).toEqual([]);
    expect(t.title).toBe('Beillesztett sokszögvonal számítása');
  });

  it('az irányszögek egyeznek a súgóval (a tájékozást a kezdő-végpont húrjából kapja)', () => {
    expect(rowOf('252')[3]).toBe('156.0123');
    expect(rowOf('2502')[3]).toBe('159.4053');
    expect(rowOf('2503')[3]).toBe('179.0620');
    expect(rowOf('2504')[3]).toBe('220.1418');
    expect(rowOf('1075')[3]).toBe('168.3206');
    expect(rowOf('1076')[3]).toBe('174.1241');
  });

  it('a kiegyenlített koordináták egyeznek a súgóval', () => {
    expect(rowOf('2502').slice(11)).toEqual(['747707.934', '115012.228']);
    expect(rowOf('2503').slice(11)).toEqual(['747758.666', '114875.223']);
    expect(rowOf('2504').slice(11)).toEqual(['747761.027', '114723.975']);
    expect(rowOf('1075').slice(11)).toEqual(['747631.892', '114571.377']);
    expect(rowOf('1076').slice(11)).toEqual(['747671.246', '114377.343']);
  });

  it('a javítások és a nyers növekmények egyeznek a súgóval', () => {
    expect(rowOf('252').slice(5, 11)).toEqual(['70.464', '-158.437', '0.000', '0.005', '70.464', '-158.432']);
    expect(rowOf('2502').slice(7, 9)).toEqual(['0.000', '0.004']); // a 146.1 m-es szakasz
    expect(rowOf('2504').slice(7, 9)).toEqual(['0.000', '0.006']); // a 199.91 m-es szakasz
    const total = rowOf('Σ');
    expect(total[4]).toBe('1039.740');
    expect(total.slice(5, 7)).toEqual(['51.030', '-963.539']);
    expect(total.slice(9, 11)).toEqual(['51.030', '-963.510']);
  });

  it('a zárási hiba és a megengedett érték egyezik a súgóval', () => {
    const f = t.footer!.join('\n');
    expect(f).toMatch(/d = 0\.029 m/);
    expect(f).toMatch(/megengedett: 0\.173 m/);
  });

  it('a kiszámított pontok és a tájékozás tárolódik', () => {
    expect(r.computed.map((p) => p.id)).toEqual(['2502', '2503', '2504', '1075', '1076']);
  });
});

describe('SV – további esetek', () => {
  const known = `k_\n1 , 1000 , 1000\n2 , 1000 , 1200\n;;\n`;

  it('tájékozott kezdőpontról nyitott vonalat is számol', () => {
    const r = run(`${known}zk,1,0\nsv\n1 90.0000 100 \n10 0 180.0000 100\n11 0 0 0\n;;\n`);
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    const t = r.sections.find((s) => s.kind === 'sv')!;
    expect(t.title).toBe('Nyitott sokszögvonal számítása');
    const p10 = r.computed.find((p) => p.id === '10')!;
    expect([p10.y, p10.x]).toEqual([1100, 1000]);
  });

  it('tájékozás és végpont nélkül érthető hibát ad', () => {
    const r = run(`${known}sv\n1 90.0000 100\n10 0 180.0000 100\n;;\n`);
    expect(r.issues.some((i) => i.level === 'error' && /tájékozása hiányzik/.test(i.message))).toBe(true);
  });

  it('a megengedettet meghaladó zárási hibára figyelmeztet', () => {
    // Az 1 → 2 húr 200 m; a vonal 100 + 100 m, de a második szakasz 3 m-rel hosszabb.
    const r = run(`${known}sv\n1 90.0000 100 2 0\n10 0 180.0000 103\n;;\n`);
    expect(r.issues.some((i) => i.level === 'warning' && /meghaladja a megengedettet/.test(i.message))).toBe(true);
  });

  it('a vonal egyenes szakaszain a javítások a hosszak arányában oszlanak el', () => {
    const r = run(`${known}sv\n1 90.0000 100 2 0\n10 0 180.0000 101\n;;\n`);
    const t = r.sections.find((s) => s.kind === 'sv')!;
    const row10 = t.rows.find((x) => x.cells[0] === '10')!.cells;
    // A 201 m hosszú vonal 1 m-rel hosszabb a 200 m-es húrnál: a javítások −1·100/201 és −1·101/201 m.
    expect(Number(row10[11])).toBeCloseTo(1000, 3); // a húr észak felé fut, Y nem változik
    expect(Number(row10[12])).toBeCloseTo(1000 + 100 - 100 / 201, 3);
  });
});
