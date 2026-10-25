import { describe, expect, it } from 'vitest';
import { borderReviewFee, computeFees, dataFeeFor, permitFee, type FeeInput } from '../src/core/fees';

/** Igazgatási szolgáltatási díjak az 1/2024. (I. 30.) KTM rendelet szerint. */

const base: FeeInput = { kind: 'subdivision', before: 1, after: 2, buildings: 0, units: 0, subparcels: 0, areas: [], reissue: false, withData: false };

describe('telekalakítás engedélyezése (10. §)', () => {
  it('a sávok folytonosan illeszkednek', () => {
    expect(permitFee(2)).toBe(38_000);
    expect(permitFee(5)).toBe(95_000);
    expect(permitFee(6)).toBe(112_000);
    expect(permitFee(15)).toBe(256_000);
    expect(permitFee(16)).toBe(257_600);
    expect(permitFee(25)).toBe(272_000);
    expect(permitFee(30)).toBe(276_000);
  });
});

describe('a változási vázrajz vizsgálata (12–16. §)', () => {
  it('földrészlethatár: a változás utáni földrészletek száma szerint', () => {
    expect([2, 5, 6, 10, 11, 30, 31, 50, 51, 100].map(borderReviewFee)).toEqual([4000, 4000, 5600, 5600, 9600, 9600, 12000, 12000, 17600, 17600]);
    expect(borderReviewFee(110)).toBe(17_600 + 11 * 160);
  });

  it('telekfelosztás 1 → 2: engedélyezés 38 000 + vizsgálat 4000', () => {
    const r = computeFees(base);
    expect(r.lines.map((l) => l.amount)).toEqual([38_000, 4_000]);
    expect(r.total).toBe(42_000);
  });

  it('telekegyesítés: az engedélyezés a változás előtti földrészletek szerint, a vizsgálat 4000', () => {
    const r = computeFees({ ...base, kind: 'merge', before: 3, after: 1 });
    expect(r.lines.map((l) => l.amount)).toEqual([57_000, 4_000]);
  });

  it('épület, társasház, művelési ág, jog, kitűzés', () => {
    expect(computeFees({ ...base, kind: 'building', buildings: 2 }).total).toBe(14_600);
    expect(computeFees({ ...base, kind: 'condo', units: 6 }).total).toBe(12_000);
    expect(computeFees({ ...base, kind: 'cultivation', subparcels: 7 }).total).toBe(5_400);
    expect(computeFees({ ...base, kind: 'right', before: 3 }).total).toBe(2_500);
    expect(computeFees({ ...base, kind: 'setout' }).total).toBe(3_200);
  });

  it('újrazáradékolás: a vizsgálati díj fele', () => {
    expect(computeFees({ ...base, kind: 'building', buildings: 2, reissue: true }).total).toBe(7_300);
  });
});

describe('adatszolgáltatás (4. melléklet 41–42. tétel)', () => {
  it('terület szerinti díjtételek, 100 ha fölött arányosan (a rendelet példája)', () => {
    expect(dataFeeFor(5_000, '41')).toBe(10_000);
    expect(dataFeeFor(200_000, '41')).toBe(16_000);
    expect(dataFeeFor(1_252_112, '42')).toBe(18_154); // 125 ha 2112 m²: 14 500 × 1,252
  });

  it('több szomszédos földrészlet: a legnagyobbra 100%, a többire 50% (egyesítésnél 20%)', () => {
    const areas = [1200, 3000, 800];
    expect(computeFees({ ...base, kind: 'boundary', before: 3, after: 3, areas, withData: true }).lines.at(-1)!.amount).toBe(20_000);
    expect(computeFees({ ...base, kind: 'merge', before: 3, after: 1, areas, withData: true }).lines.at(-1)!.amount).toBe(14_000);
    expect(computeFees({ ...base, kind: 'building', buildings: 1, areas: [900], withData: true }).lines.at(-1)!.amount).toBe(6_500);
  });
});
