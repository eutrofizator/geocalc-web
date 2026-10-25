import { describe, expect, it } from 'vitest';
import { checkBoundary, lengthTolerance, pointTolerance, type CheckOptions } from '../src/core/boundary-check';
import type { NamedPt } from '../src/core/parcel';

/** Határpontok azonosítása a 8/2018. AM rendelet 16–17. §-a és 7. melléklete szerint. */

const base: CheckOptions = { kind: 'digital', scale: '1000', area: 'inner', order: 'R2', marked: true };

describe('a megengedett eltérések (7. melléklet)', () => {
  it('F) táblázat: rendűség és tűrési osztály (T11 belterület, T21 külterület)', () => {
    expect(pointTolerance(base).limit).toBe(0.15);
    expect(pointTolerance({ ...base, area: 'outer' }).limit).toBe(0.21);
    expect(pointTolerance(base, 'R1').limit).toBe(0.09);
    expect(pointTolerance({ ...base, area: 'outer' }, 'R4').limit).toBe(0.57);
  });

  it('A) és B) táblázat: a határvonal helyzete digitális átalakításnál', () => {
    expect(pointTolerance({ ...base, kind: 'converted-eov', scale: '2000' }).limit).toBe(0.65);
    expect(pointTolerance({ ...base, kind: 'converted-old', scale: '2880' }).limit).toBe(1.3);
    expect(pointTolerance({ ...base, kind: 'converted-eov', scale: '2880' }).limit).toBeNull();
  });

  it('16. § (1) a): szabatosan felmért területen 0,10 / 0,20 m', () => {
    expect(pointTolerance({ ...base, kind: 'precise' }).limit).toBe(0.1);
    expect(pointTolerance({ ...base, kind: 'precise', marked: false }).limit).toBe(0.2);
  });

  it('C), D), E) táblázat a mérési vonal hossza szerint', () => {
    expect(lengthTolerance({ ...base, kind: 'converted-eov' }, 100).limit).toBeCloseTo(0.45, 9);
    expect(lengthTolerance({ ...base, kind: 'converted-eov' }, 150).limit).toBeCloseTo(0.475, 9);
    expect(lengthTolerance({ ...base, kind: 'converted-old', scale: '4000' }, 30).limit).toBeCloseTo(2.0, 9);
    expect(lengthTolerance({ ...base, area: 'outer' }, 300).limit).toBeCloseTo(0.95, 9);
    expect(lengthTolerance({ ...base, area: 'inner-precise' }, 75).limit).toBeCloseTo(0.225, 9);
  });
});

describe('összevetés', () => {
  const map = new Map<string, NamedPt>([
    ['1', { id: '1', y: 1000, x: 2000 }],
    ['2', { id: '2', y: 1040, x: 2000 }],
    ['3', { id: '3', y: 1040, x: 2025 }],
    ['4', { id: '4', y: 1000, x: 2025 }],
  ]);
  const parcels = [{ hrsz: '100', registered: 1000, points: ['1', '2', '3', '4'], line: 1 }];
  const measured = ['1 1000.05 2000.08', '2 1040.03 1999.98 R1', '3 1040.30 2025.00', '9 1 1'].join('\n');
  const r = checkBoundary(map, parcels, measured, base);

  it('pontonként: eltérés és a rendűség szerinti határ', () => {
    expect(r.points.map((p) => [p.id, Number(p.d.toFixed(3)), p.limit, p.ok])).toEqual([
      ['1', 0.094, 0.15, true],
      ['2', 0.036, 0.09, true],
      ['3', 0.3, 0.15, false],
    ]);
    expect(r.unmatched).toEqual(['9']);
  });

  it('a mért végpontú határvonalak hossza', () => {
    expect(r.lines.map((l) => `${l.from}-${l.to}`)).toEqual(['1-2', '2-3']);
    expect(r.lines[1]!.diff).toBeCloseTo(Math.hypot(0.27, 25.02) - 25, 9);
  });

  it('a hibák és a jegyzőkönyv szakaszai', () => {
    expect(r.issues.map((i) => i.level)).toEqual(['warning', 'error']);
    expect(r.issues[1]!.message).toMatch(/^Határpont-azonosítás: 3 eltérése/);
    expect(r.sections.map((s) => s.kind)).toEqual(['boundary-points', 'boundary-lines']);
  });
});
