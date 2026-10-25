import { describe, expect, it } from 'vitest';
import { parseDatTables, readDat, writeDat } from '../src/core/dat';
import { parseDrawing } from '../src/core/drawing';
import { landUseCode } from '../src/core/jobs';
import type { NamedPt } from '../src/core/parcel';
import { subStatement } from '../src/core/subparcels';

/** Alrészletek a területkimutatásban (12. §, 22. § (6)) és a DAT-ban (T_OBJ_ATTRBE), épület (T_OBJ_ATTRCA). */

const P = (id: string, y: number, x: number): NamedPt => ({ id, y, x });
const pts = new Map(
  [P('1', 650000, 240000), P('2', 650040, 240000), P('3', 650040, 240025), P('4', 650000, 240025), P('5', 650015, 240000), P('6', 650015, 240025), P('E1', 650020, 240005), P('E2', 650030, 240005), P('E3', 650030, 240012), P('E4', 650020, 240012)].map(
    (p) => [p.id, p],
  ),
);
const parcel = { hrsz: '100', ring: ['1', '2', '3', '4'].map((i) => pts.get(i)!), area: 1003 };

describe('alrészletek', () => {
  const dr = parseDrawing(
    ['alrészlet ; a ; szántó ; 1 2 3 4', 'új alrészlet ; a ; kivett, lakóház, udvar ; 1 5 6 4', 'új alrészlet ; b ; szántó ; 5 2 3 6', 'épület ; új ; E1 E2 E3 E4 ; CA01'].join('\n'),
    pts,
  ).elements;
  const st = subStatement(dr, [parcel], [parcel]);

  it('a változás előtti és utáni alrészletek, a földrészlet területére ráosztva', () => {
    expect(st.issues).toEqual([]);
    expect(st.before.map((r) => [r.hrsz, r.letter, r.use, r.area])).toEqual([['100', 'a', 'szántó', 1003]]);
    expect(st.after.map((r) => [r.letter, r.area])).toEqual([
      ['a', 376],
      ['b', 627],
    ]);
    expect(st.after.reduce((s, r) => s + r.area, 0)).toBe(1003);
    expect(st.section!.columns).toHaveLength(8);
  });

  it('a művelési ág DAT-kódja (T_MUVEL_AG)', () => {
    expect(landUseCode('szántó')).toBe(1);
    expect(landUseCode('kivett, lakóház, udvar')).toBe(9);
    expect(landUseCode('fásított terület')).toBe(11);
    expect(landUseCode('ismeretlen')).toBeNull();
  });

  it('a DAT-ban az alrészletek (BE01) és az új épület (CA01) saját felülettel', () => {
    const b = dr.find((d) => d.kind === 'building')!;
    const text = writeDat([{ hrsz: '100', area: 1003, ring: parcel.ring }], {
      name: 'proba',
      date: new Date(2026, 9, 25),
      subs: st.after.map((r) => ({ hrsz: r.hrsz, letter: r.letter, useCode: landUseCode(r.use), area: r.area, ring: r.ring })),
      buildings: b.kind === 'building' ? [{ hrsz: '100', code: b.code, ring: b.ring }] : [],
    });
    const t = parseDatTables(text);
    expect(t.tables.get('T_FELULET')).toHaveLength(4);
    expect(t.tables.get('T_OBJ_ATTRBE')!.map((r) => [r[1], r[3], r[4], r[5], r[7]])).toEqual([
      ['BE01', 'a', '100', '376', '9'],
      ['BE01', 'b', '100', '627', '1'],
    ]);
    const ca = t.tables.get('T_OBJ_ATTRCA')![0]!;
    expect([ca[1], ca[2], ca[5], ca[6], ca[16]]).toEqual(['CA01', '4', '1', '1', '0']);
    // Visszaolvasva a földrészlet és az épület is megvan.
    const back = readDat(text);
    expect(back.warnings).toEqual([]);
    expect(back.parcels.map((p) => p.hrsz)).toEqual(['100']);
    expect(back.buildings).toEqual([{ code: 'CA01', ring: expect.any(Array) }]);
  });
});
