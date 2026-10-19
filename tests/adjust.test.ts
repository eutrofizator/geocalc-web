import { describe, expect, it } from 'vitest';
import { run, type RunResult } from '../src/core/engine';
import { EXAMPLES } from '../src/examples';

const example = (id: string) => EXAMPLES.find((e) => e.id === id)!.source;
const section = (r: RunResult, kind: string) => r.sections.find((s) => s.kind === kind)!;
const errors = (r: RunResult) => r.issues.filter((i) => i.level === 'error');
const cell = (r: RunResult, kind: string, id: string) => section(r, kind).rows.find((x) => x.cells[0] === id)!.cells;
/** FOK.PPMMSS előjeles szög → másodperc (a javítások összehasonlításához). */
const arcsec = (s: string) => {
  const v = Math.abs(Number(s));
  const mm = Math.floor(v * 100 + 1e-9);
  const ss = Math.round((v * 100 - mm) * 100);
  return Math.sign(Number(s)) * (mm * 60 + ss);
};

describe('SM – magassági sokszögvonal (súgó mintapélda)', () => {
  const r = run(example('sm'));

  it('hibátlanul lefut, a zárási hibák a megengedetten belül vannak', () => {
    expect(errors(r)).toEqual([]);
    expect(r.issues.filter((i) => i.level === 'warning')).toEqual([]);
  });

  it('a vízszintes rész egyezik a súgóval', () => {
    const t = section(r, 'sv');
    const row = (id: string) => t.rows.find((x) => x.cells[0] === id)!.cells;
    expect(row('a')[3]).toBe('63.2655');
    expect(row('1')[3]).toBe('90.0054');
    expect(row('2')[3]).toBe('104.0304');
    expect(row('1').slice(11)).toEqual(['10.016', '15.006']);
    expect(row('2').slice(11)).toEqual(['20.013', '15.004']);
    expect(t.footer!.join(' ')).toMatch(/d = 0\.012 m.*megengedett: 0\.053 m/);
  });

  it('a magassági rész egyezik a súgóval', () => {
    // Pontszám, Mh, Me, dM, Mjav, T, M
    expect(cell(r, 'sm', 'a')).toEqual(['a', '', '0.500', '', '', '', '100.000']);
    expect(cell(r, 'sm', '1')).toEqual(['1', '-0.480', '', '0.490', '0.024', '11.2', '100.514']);
    expect(cell(r, 'sm', '2')).toEqual(['2', '0.220', '-0.300', '-0.220', '0.022', '10.0', '100.316']);
    expect(cell(r, 'sm', 'b')).toEqual(['b', '0.320', '', '-0.310', '0.044', '20.6', '100.050']);
    expect(cell(r, 'sm', 'Σ')).toEqual(['Σ', '', '', '-0.040', '0.090', '41.8', '0.050']);
  });

  it('a kiszámított pontok magasságot is kapnak', () => {
    expect(r.computed.find((p) => p.id === '1')!.m!.toFixed(3)).toBe('100.514');
    expect(r.computed.find((p) => p.id === '2')!.m!.toFixed(3)).toBe('100.316');
  });

  it('magasságkülönbség nélkül csak a vízszintes vonalat számítja, figyelmeztetéssel', () => {
    const only = example('sm').replace(/, +0\.500, +0\.320/, '').replace(/10\.000, +-0\.480,/, '10.000').replace(/20\.610, +0\.220, +-0\.300/, '20.610');
    const res = run(only);
    expect(errors(res)).toEqual([]);
    expect(res.issues.some((i) => i.level === 'warning' && /magasságkülönbség/.test(i.message))).toBe(true);
    expect(res.sections.some((s) => s.kind === 'sm')).toBe(false);
  });

  it('magasság nélküli kezdőpontra érthető hibát ad', () => {
    const res = run(example('sm').replace('a 0 10 100\n', 'a 0 10\n'));
    expect(res.issues.some((i) => i.level === 'error' && /magassága hiányzik/.test(i.message))).toBe(true);
  });
});

describe('VP – szabad álláspont (súgó mintapélda)', () => {
  const r = run(example('vp'));
  const result = cell(r, 'vp', '1');

  it('hibátlanul lefut', () => expect(errors(r)).toEqual([]));

  it('a pont és a tájékozási szög egyezik a súgóval (a mérési pontosságon belül)', () => {
    // A súgó: Y = 3817.263, X = 7339.746, Z(k) = 0.4836.
    expect(Math.abs(Number(result[1]) - 3817.263)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(Number(result[2]) - 7339.746)).toBeLessThanOrEqual(0.004);
    expect(result[3]).toBe('Z(k) = 0.4836');
  });

  it('a távolság- és irányjavítások a súgóéval megegyező nagyságrendűek', () => {
    // súgó: 9: dT 0.034, 5: −0.031, 7: 0.035; dL: 8: 0, 9: 0, 5: −2″, 6: +4″
    const dT = (id: string) => Number(cell(r, 'vp', id)[6]);
    expect(Math.abs(dT('9') - 0.034)).toBeLessThanOrEqual(0.004);
    expect(Math.abs(dT('5') + 0.031)).toBeLessThanOrEqual(0.004);
    expect(Math.abs(dT('7') - 0.035)).toBeLessThanOrEqual(0.004);
    const dL = (id: string) => arcsec(cell(r, 'vp', id)[5]!);
    expect(Math.abs(dL('8') - 0)).toBeLessThanOrEqual(1);
    expect(Math.abs(dL('5') - -2)).toBeLessThanOrEqual(1);
    expect(Math.abs(dL('6') - 4)).toBeLessThanOrEqual(1);
  });

  it('a kiszámított pont és a tájékozás tárolódik a további számításokhoz', () => {
    const p = r.computed.find((x) => x.id === '1')!;
    expect(p.y).toBeCloseTo(3817.263, 2);
    const next = run(`${example('vp')}po\n1\n9, 182.0324, 1013.05\n;;\n`);
    const q = next.computed.find((x) => x.id === '9')!;
    expect(Math.abs(q.y - 3766.59)).toBeLessThan(0.05);
    expect(Math.abs(q.x - 6327.93)).toBeLessThan(0.05);
  });
});

describe('EK – egypontos kiegyenlítés (súgó mintapélda)', () => {
  const r = run(example('ek'));
  const result = cell(r, 'ek', '1');

  it('hibátlanul lefut', () => expect(errors(r)).toEqual([]));

  it('a pont és a tájékozási szög egyezik a súgóval', () => {
    // A súgó: Y = 3817.292, X = 7339.727, Z(k) = 0.4838.
    expect(Math.abs(Number(result[1]) - 3817.292)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(Number(result[2]) - 7339.727)).toBeLessThanOrEqual(0.002);
    expect(result[3]).toBe('Z(k) = 0.4838');
  });

  it('a külső irányok, belső irányok és távolságok javításai egyeznek a súgóval (±1″, ±2 mm)', () => {
    // oszlopok: Pontszám Y X Lk Lb T dLk dLb dT
    const help: Record<string, [number | null, number | null, number | null]> = {
      '8': [7, 3, null],
      '9': [null, -5, 0.017],
      '5': [3, -6, -0.021],
      '6': [null, 8, null],
      '6/1': [7, null, null],
      '7': [9, null, 0.034],
    };
    for (const [id, [lk, lb, dt]] of Object.entries(help)) {
      const c = cell(r, 'ek', id);
      if (lk !== null) expect(Math.abs(arcsec(c[6]!) - lk)).toBeLessThanOrEqual(1);
      if (lb !== null) expect(Math.abs(arcsec(c[7]!) - lb)).toBeLessThanOrEqual(1);
      if (dt !== null) expect(Math.abs(Number(c[8]) - dt)).toBeLessThanOrEqual(0.002);
    }
  });
});

describe('VP/EK – függetlenül ellenőrzött helyesség', () => {
  // Zajmentes mérések egy ismert pontból: a kiegyenlítésnek vissza kell adnia az eredeti pontot.
  const deg = (v: number) => {
    const t = Math.round(((v % 360) + 360) % 360 * 3600);
    return `${Math.floor(t / 3600)}.${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}${String(t % 60).padStart(2, '0')}`;
  };
  const known = [
    { id: 'A', y: 1000, x: 1000 },
    { id: 'B', y: 1800, x: 1150 },
    { id: 'C', y: 1500, x: 2100 },
    { id: 'D', y: 600, x: 1900 },
  ];
  const truth = { y: 1234.5, x: 1456.25 };
  const zk = 17.5; // fok (17°30')
  const az = (k: { y: number; x: number }) => ((Math.atan2(k.y - truth.y, k.x - truth.x) * 180) / Math.PI + 360) % 360;
  const dist = (k: { y: number; x: number }) => Math.hypot(k.y - truth.y, k.x - truth.x);
  const coords = known.map((k) => `${k.id} ${k.y} ${k.x}`).join('\n');

  it('VP: belső irányokból és távolságokból visszaadja a pontot (kerekített irányok mellett is ±1 cm)', () => {
    const lines = known.map((k) => `${k.id}, ${deg(az(k) - zk)}, ${dist(k).toFixed(3)}`).join('\n');
    const res = run(`k_\n${coords}\n;;\nvp\nP\n${lines}\n;;\n`);
    expect(errors(res)).toEqual([]);
    const p = res.computed.find((x) => x.id === 'P')!;
    expect(Math.abs(p.y - truth.y)).toBeLessThan(0.01);
    expect(Math.abs(p.x - truth.x)).toBeLessThan(0.01);
  });

  it('VP: hátrametszés (csak irányok, 3 ismert pont) és ívmetszés (csak távolságok, 2 pont + 1 irány)', () => {
    const dirs = known.slice(0, 3).map((k) => `${k.id}, ${deg(az(k) - zk)}`).join('\n');
    const back = run(`k_\n${coords}\n;;\nvp\nP\n${dirs}\n;;\n`);
    expect(errors(back)).toEqual([]);
    const p = back.computed.find((x) => x.id === 'P')!;
    expect(Math.abs(p.y - truth.y)).toBeLessThan(0.5); // 1″ kerekítés ~ 1 cm 1 km-en, a 3 irány gyenge geometriája miatt nagyobb
    expect(Math.abs(p.x - truth.x)).toBeLessThan(0.5);
  });

  it('EK: külső irányokból (ismert pontokról mért) is visszaadja a pontot', () => {
    const lines = known.map((k) => `${k.id}, ${deg(az(k) + 180)}, , ${dist(k).toFixed(3)}`).join('\n');
    const res = run(`k_\n${coords}\n;;\nek\nP\n${lines}\n;;\n`);
    expect(errors(res)).toEqual([]);
    const p = res.computed.find((x) => x.id === 'P')!;
    expect(Math.abs(p.y - truth.y)).toBeLessThan(0.01);
    expect(Math.abs(p.x - truth.x)).toBeLessThan(0.01);
    expect(section(res, 'ek').rows.at(-1)!.cells[3]).toBe(''); // külső irányokból tájékozás nem számítható
  });

  it('a mérések számának hiányát érthetően jelzi', () => {
    const res = run(`k_\n${coords}\n;;\nvp\nP\nA, , 100.0\nB, , 200.0\n;;\n`);
    expect(res.issues.some((i) => i.level === 'error' && /Kevés mérés/.test(i.message))).toBe(false); // 2 távolság = 2 ismeretlen: ívmetszés
    const few = run(`k_\n${coords}\n;;\nvp\nP\nA, 10.0000, 100.0\n;;\n`);
    expect(few.issues.some((i) => i.level === 'error' && /Kevés mérés/.test(i.message))).toBe(true);
  });

  it('ugyanaz a bemenet mindig ugyanazt adja', () => {
    const a = run(example('vp'));
    run(example('ek'));
    expect(run(example('vp'))).toEqual(a);
  });
});
