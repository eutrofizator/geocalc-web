import { describe, expect, it } from 'vitest';
import { run } from '../src/core/engine';
import {
  EXPORT_CODES,
  formatFor,
  toDxf,
  toGeodimeter,
  toGsi16,
  withExtension,
} from '../src/core/export';
import type { Point } from '../src/core/types';

const P = (id: string, y: number, x: number, m: number | null, code = '0'): Point => ({ id, y, x, m, code });

describe('a kimenei formátumok (súgó 23. o.: K>, U>, W>, G>, A>, L>, M>)', () => {
  it('a nyilvántartás a hét direktívát tartalmazza, a súgó sorrendjében', () => {
    expect(EXPORT_CODES).toEqual(['K>', 'U>', 'W>', 'G>', 'A>', 'L>', 'M>']);
    for (const code of EXPORT_CODES) expect(formatFor(code)?.label).toBeTruthy();
    expect(formatFor('X>')).toBeUndefined();
  });

  it('a DXF a súgó szerint pontszámot, Y-t, X-et és M-et tárol (R12, POINT + TEXT)', () => {
    const dxf = toDxf([P('1', 590543.33, 209686.71, 273.09)]);
    expect(dxf.startsWith('0\r\nSECTION\r\n')).toBe(true);
    expect(dxf.trimEnd().endsWith('0\r\nEOF')).toBe(true);
    expect(dxf).toContain('AC1009');
    expect(dxf.split('\r\n').filter((l) => l === 'POINT')).toHaveLength(1);
    expect(dxf.split('\r\n').filter((l) => l === 'TEXT')).toHaveLength(1);
    expect(dxf).toContain('590543.330');
    expect(dxf).toContain('209686.710');
    expect(dxf).toContain('273.090');
    expect(dxf).toContain('PONTOK');
  });

  it('a GSI-16 minden szava 16 karakteres, a szókódok 11/81/82/83', () => {
    const line = toGsi16([P('1', 590543.33, 209686.71, 273.09)], false).trimEnd();
    const words = line.split(' ');
    expect(words).toHaveLength(4);
    for (const w of words) expect(w).toHaveLength(16);
    expect(words[0]).toBe('110001+000000001');
    expect(words[1]).toBe('81..10+590543330');
    expect(words[2]).toBe('82..10+209686710');
    expect(words[3]).toBe('83..10+000273090');
  });

  it('a GSI-16 a Wild-változatban * rekordjelzőt kap, a Leica/GeoMAX nem', () => {
    const p = [P('7', 1, 2, 3)];
    expect(toGsi16(p, true).startsWith('*')).toBe(true);
    expect(toGsi16(p, false).startsWith('110001+')).toBe(true);
  });

  it('a GSI-16 kihagyja a 83-as szót, ha nincs magasság', () => {
    const line = toGsi16([P('2', 1, 2, null)], false).trimEnd();
    expect(line.split(' ')).toHaveLength(3);
  });

  it('a Geodimeter vesszővel tagolt koordináta-lista', () => {
    expect(toGeodimeter([P('1', 1.5, 2.25, 3)])).toBe('1,1.500,2.250,3.000\r\n');
  });

  it('a kiterjesztést az A> mindig .dxf-re cseréli, a többi csak kiegészíti', () => {
    expect(withExtension('adat', '.dxf', true)).toBe('adat.dxf');
    expect(withExtension('adat.pyx', '.dxf', true)).toBe('adat.dxf');
    expect(withExtension('adat', '.pyx', false)).toBe('adat.pyx');
    expect(withExtension('adat.gsi', '.pyx', false)).toBe('adat.gsi');
  });
});

describe('a kimeneti direktívák a futtatásban', () => {
  const source = [
    'K_',
    '1,590543.330,209686.710,273.090',
    ';;',
    'K>adat.pyx',
    'U>adat2.txt',
    'W>wild.gsi',
    'G>geo.coo',
    'A>c:\\adat',
    'L>leica.gsi',
    'M>geomax.gsi',
  ].join('\r\n');

  it('mind a hét direktíva fájlt készít, figyelmeztetés nélkül', () => {
    const r = run(source);
    expect(r.issues.filter((i) => i.level === 'warning')).toHaveLength(0);
    expect(r.exports.map((e) => e.name)).toEqual([
      'adat.pyx',
      'adat2.txt',
      'wild.gsi',
      'geo.coo',
      'adat.dxf',
      'leica.gsi',
      'geomax.gsi',
    ]);
    expect(r.exports.every((e) => e.note !== undefined)).toBe(true);
  });

  it('a K> a vesszős (GeoCalc DB), az U> a fix szélességű formátumot adja', () => {
    const r = run(source);
    expect(r.exports[0]?.content).toBe('1, 590543.330, 209686.710, 273.090, , 0\r\n');
    expect(r.exports[1]?.content).toContain('590543.330');
    expect(r.exports[1]?.content.replace(/\r\n$/, '')).toHaveLength(48);
  });

  it('az A> valódi DXF-et ír, a W>/L> pedig GSI-16-ot', () => {
    const r = run(source);
    expect(r.exports[4]?.content).toContain('AC1009');
    expect(r.exports[4]?.content).toContain('EOF');
    expect(r.exports[2]?.content.startsWith('*')).toBe(true);
    expect(r.exports[5]?.content.startsWith('110001+')).toBe(true);
  });
});
