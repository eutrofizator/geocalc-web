import { describe, expect, it } from 'vitest';
import { formatDms, parseDms } from '../src/core/angle';
import { run } from '../src/core/engine';
import { parseCoordLine, parseProgram, splitFields, stripRtf } from '../src/core/parser';
import { EXAMPLES } from '../src/examples';

const sample = (id: string) => EXAMPLES.find((e) => e.id === id)!.source;

describe('stabilitás: a futások nem keveredhetnek össze', () => {
  it('ugyanaz a bemenet mindig ugyanazt adja, bármi futott közben', () => {
    const first = run(sample('po'));
    run(sample('zk')); // másik program, ami más tájékozási szöget és pontokat használ
    run(sample('te'));
    const second = run(sample('po'));
    expect(second).toEqual(first);
  });

  it('a tájékozási szög nem szivárog át a következő futásba', () => {
    run(sample('po')); // Zk[1003] = 63.1315
    const r = run(`k_\n1003 , 100 , 100\n;;\npo\n1003\n7, 90.0000, 10\n`);
    const row = r.sections.find((s) => s.kind === 'po')!.rows[1]!.cells;
    expect(row.slice(1, 3)).toEqual(['110.000', '100.000']); // Zk = 0, tehát kelet felé
  });

  it('a terület-összesítő nem szivárog át a következő futásba', () => {
    run(sample('to'));
    const r = run(`k_\n1 , 0 , 0\n;;\nto\n`);
    expect(r.sections.find((s) => s.kind === 'to')!.footer).toEqual(['Az előző területek összesen: 0.00000']);
  });

  it('egy hibás számítás nem akasztja meg a többit', () => {
    const r = run(`k_\n1 , 0 , 0\n2 , 100 , 0\n;;\nit\n1\n99\n2\n;;\nit\n2\n1\n`);
    const its = r.sections.filter((s) => s.kind === 'it');
    expect(its).toHaveLength(2);
    expect(its[0]!.rows.map((x) => x.cells[0])).toEqual(['1', '2']); // a 99-es hibás sor kimaradt
    expect(r.issues.some((i) => i.level === 'error' && /99/.test(i.message))).toBe(true);
  });

  it('a hibás sor mellett a többi polárisan bemért pont kiszámítódik', () => {
    const r = run(`k_\n1 , 0 , 0\n;;\npo\n1\n10, 0, \n11, 90, 5\n`);
    const rows = r.sections.find((s) => s.kind === 'po')!.rows;
    expect(rows.map((x) => x.cells[0])).toEqual(['1', '11']);
    expect(r.issues.filter((i) => i.level === 'error')).toHaveLength(1);
  });

  it('a számított pontot a későbbi számítás használni tudja', () => {
    const r = run(`k_\n1 , 0 , 0\n;;\npo\n1\n2, 90.0000, 100\n;;\nit\n1\n2\n`);
    const it = r.sections.find((s) => s.kind === 'it')!.rows[1]!.cells;
    expect(it.slice(3)).toEqual(['90.0000', '100.000']);
  });

  it('ismeretlen kódot jelez, de a futás folytatódik', () => {
    const r = run(`k_\n1 , 0 , 0\n;;\nxx\n1\n;;\nit\n1\n`);
    expect(r.issues.map((i) => i.level)).toEqual(['error']);
    expect(r.issues[0]!.message).toMatch(/Ismeretlen számítási kód: XX/);
    expect(r.sections.some((s) => s.kind === 'it')).toBe(true);
  });
});

describe('bemenet értelmezése', () => {
  it('vessző és szóköz vegyes elválasztása', () => {
    expect(splitFields('6-65,    3092.680,   8273.890    , ,        24')).toEqual(['6-65', '3092.680', '8273.890', '', '24']);
    expect(splitFields('5        2852.340    6562.880    100.4      23')).toEqual(['5', '2852.340', '6562.880', '100.4', '23']);
    expect(splitFields('105, 101.51,248.84, ,')).toEqual(['105', '101.51', '248.84', '', '']);
  });

  it('koordinátasor magassággal, vessző és szóköz keverve', () => {
    const p = parseCoordLine('1003 , 551453.338 , 123817.789 263.50', 1);
    expect(p).toEqual({ id: '1003', y: 551453.338, x: 123817.789, m: 263.5, code: '0' });
  });

  it('hiányzó koordináta hibát jelez, a pont betűs jelzéssel is lehet', () => {
    expect(() => parseCoordLine('7 , 12.5', 3)).toThrow(/X koordináta/);
    expect(parseCoordLine('541017A,593214.310,211280.280', 1).id).toBe('541017A');
  });

  it('a K_ sor fájlnevet és X (kijelzés tiltás) jelzőt is felvehet', () => {
    const a = parseProgram('K_c:\\gc\\adatbazis\\alappontok.dat  X\n;;\n');
    expect(a.kFile).toBe('c:\\gc\\adatbazis\\alappontok.dat');
    expect(a.hideCoords).toBe(true);
    const b = parseProgram('K_  , X\n5 1 1\n;;\n');
    expect(b.kFile).toBeNull();
    expect(b.hideCoords).toBe(true);
  });

  it('a K_ fájlt a feltöltött állományokból tölti be, a hiányzót jelzi', () => {
    const src = 'K_c:\\gc\\pontok.dat\n;;\nit\n1\n2\n';
    const missing = run(src);
    expect(missing.issues.some((i) => /nincs betöltve/.test(i.message))).toBe(true);
    const ok = run(src, { files: { 'pontok.dat': '1 0 0\n2 0 10\n' } });
    expect(ok.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(ok.sections.find((s) => s.kind === 'it')!.rows[1]!.cells.slice(3)).toEqual(['0.0000', '10.000']);
  });

  it('RTF-ben mentett .gcd állományt is beolvas', () => {
    const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0\fnil MS Sans Serif;}}\f3\fs16 k_
\par 1 0 0
\par 2 0 10
\par ;;
\par it
\par 1
\par 2
\par }`;
    expect(stripRtf(rtf)).toContain('k_');
    const r = run(rtf);
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.sections.some((s) => s.kind === 'it')).toBe(true);
  });

  it('a K> kimeneti azonosító letölthető koordinátalistát ad', () => {
    const r = run(`k_\n1 , 0 , 0\n;;\npo\n1\n2, 90.0000, 100\n;;\nK>pontok.pyx\n`);
    const f = r.exports.find((e) => e.name === 'pontok.pyx')!;
    expect(f.content).toContain('2, 100.000, 0.000, 0.000, , 1');
  });
});

describe('szögek (FOK.PPMMSS)', () => {
  it('oda-vissza átalakítás', () => {
    for (const s of ['104.5900', '0.0000', '359.5959', '63.1315', '12.3456']) {
      expect(formatDms(parseDms(s))).toBe(s);
    }
  });

  it('360 fokra kerekítve 0-ra fordul', () => {
    expect(formatDms(359.99999)).toBe('0.0000');
  });

  it('érvénytelen perc/másodperc hibát ad', () => {
    expect(() => parseDms('12.6000')).toThrow();
    expect(() => parseDms('12.0060')).toThrow();
    expect(() => parseDms('abc')).toThrow();
  });
});
