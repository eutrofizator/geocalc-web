import { describe, expect, it } from 'vitest';
import { parseDrawing } from '../src/core/drawing';
import { writeDxf } from '../src/core/dxf-writer';
import { JOBS } from '../src/core/jobs';
import type { NamedPt } from '../src/core/parcel';
import { planEntities, renderPlan, symbolRotation, type PlanMeta } from '../src/core/plan';
import { findSymbol, SYMBOLS, symbolPaths } from '../src/core/symbols';

/** Jelkulcsi jelek a DAT1-M2. szabályzatmelléklet szerint (kitalált koordináták). */

const P = (id: string, y: number, x: number): NamedPt => ({ id, y, x });
const pts = new Map([P('1', 650000, 240000), P('2', 650040, 240000), P('3', 650040, 240025), P('4', 650000, 240025)].map((p) => [p.id, p]));
const ring = ['1', '2', '3', '4'].map((i) => pts.get(i)!);
const meta: PlanMeta = { keszito: 'K', szekhely: '', munkaszam: '', telepules: 'T', fekves: 'belterület', iktatoszam: '', megnevezes: 'x', igazolvany: '', minosites: '', hely: '', datum: '' };

const extent = (key: string, rot = 0) => {
  const xs = symbolPaths(findSymbol(key)!, rot).flatMap((p) => p.pts);
  return {
    w: Math.max(...xs.map(([u]) => u)) - Math.min(...xs.map(([u]) => u)),
    h: Math.max(...xs.map(([, v]) => v)) - Math.min(...xs.map(([, v]) => v)),
  };
};

describe('jelkulcsi jelek', () => {
  it('a jelek egyedi névvel és T_JELKULCS kóddal, ékezet nélkül is kereshetők', () => {
    expect(new Set(SYMBOLS.map((s) => s.key)).size).toBe(SYMBOLS.length);
    expect(new Set(SYMBOLS.map((s) => s.code)).size).toBe(SYMBOLS.length);
    expect(findSymbol('Villanyoszlop')!.code).toBe('JKDATE02');
    expect(findSymbol('kapcsolojel')!.code).toBe('JKDATB04');
    expect(findSymbol('jkdatc21')!.key).toBe('lombos fa');
  });

  it('a méretek a melléklet szerint (1:1000)', () => {
    // határpont: 1,00 mm átmérő; kapcsolójel: AB = 2 × 0,60; tűlevelű fa: AF = 5,00, alap 2,00; akna 3,00
    expect(extent('határpont').w).toBeCloseTo(1, 2);
    expect(extent('kapcsolójel').h).toBeCloseTo(1.2, 6);
    expect(extent('tűlevelű fa')).toMatchObject({ h: 5 });
    expect(extent('tűlevelű fa').w).toBeCloseTo(2, 6);
    expect(extent('akna').w).toBeCloseTo(3, 2);
    // forgatva a kapcsolójel vízszintesen fekszik
    expect(extent('kapcsolójel', 90).w).toBeCloseTo(1.2, 6);
  });

  it('a „jel” rajzelem: hely, forgatás, megírás; hibás név', () => {
    const r = parseDrawing(['jel ; villanyoszlop ; @2', 'jel ; akna ; 650010 240010 ; 30', 'jel ; kút ; 650020 240010 ; ; Ak', 'jel ; ufó ; @1'].join('\n'), pts);
    expect(r.elements).toMatchObject([
      { kind: 'symbol', at: { y: 650040, x: 240000 }, rotation: null, label: '', line: 1 },
      { kind: 'symbol', rotation: 30, label: 'Akna' },
      { kind: 'symbol', rotation: null, label: 'Ak' },
    ]);
    expect(r.issues[0]!.message).toContain('ismeretlen jelkulcsi jel „ufó”');
  });

  it('a kapcsolójel a legközelebbi határvonalhoz igazodik, a villanyoszlop É-i irányú', () => {
    const [kj, vo] = parseDrawing(['jel ; kapcsolójel ; 650001 240012', 'jel ; villanyoszlop ; 650001 240012'].join('\n'), pts).elements;
    const input = { before: [{ hrsz: '100', ring }], after: [{ hrsz: '100', ring }], address: [] };
    // a legközelebbi él az 4–1 (É–D irányú): a jel x tengelye erre esik
    expect(Math.abs(symbolRotation(kj as never, input))).toBeCloseTo(90, 6);
    expect(symbolRotation(vo as never, input)).toBe(0);
  });

  it('a jel a vázrajzon (megfogható csoport) és a DXF-ben a Jelkulcsi jel rétegen', () => {
    const drawing = parseDrawing('jel ; akna ; 650020 240012', pts).elements;
    const input = { before: [{ hrsz: '100', ring, area: 1000 }], after: [{ hrsz: '100', ring, area: 1000 }], address: [], drawing };
    const r = renderPlan('change', input, meta, { template: JOBS.building.plan, job: 'building' });
    expect(r.svg).toMatch(/<g data-line="1" data-px="[\d.]+" data-py="[\d.]+">/);
    expect(r.svg).toContain('>Akna</text>');
    const dxf = writeDxf(planEntities('change', input, r.scale, { template: JOBS.building.plan, job: 'building' }), r.scale);
    expect(dxf).toContain('Jelkulcsi jel');
  });
});
