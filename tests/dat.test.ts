import { describe, expect, it } from 'vitest';
import { encodeWindows1250, parseDatTables, readDat, splitRecord, writeDat } from '../src/core/dat';
import { decodeText } from '../src/core/land-office';

/**
 * DAT adatcsere-formátum (DAT-M1 melléklet, G Függelék): * határolójel, táblázatnév-rekordok,
 * címrekord, CR LF, CTRL-Z; a földrészlet határa felület → határ → határvonal → pont láncon át.
 */

// Két szomszédos földrészlet (20 × 25 m és 15 × 25 m) közös határvonallal; a 124-ben egy 2 × 2 m-es lyuk.
//   4 ─── 3 ─── 6        X (észak)
//   │ 123 │ 124 │        ↑
//   1 ─── 2 ─── 5        └→ Y (kelet)
const DAT = [
  'PROBA*Teszt adatcsere*DAT1*Járási Hivatal*Kiss Anna*Mérnök Kft.*Nagy Béla*20261024*ITR 5.0*1*',
  'T_PONT*',
  '1*240000.00*650000.00****',
  '2*240000.00*650020.00****',
  '3*240025.00*650020.00****',
  '4*240025.00*650000.00****',
  '5*240000.00*650035.00****',
  '6*240025.00*650035.00****',
  '7*240010.00*650025.00****',
  '8*240010.00*650027.00****',
  '9*240012.00*650027.00****',
  '10*240012.00*650025.00****',
  'T_HATARVONAL*',
  // 1. határvonal: a közös oldal 2 → 3
  '1*1*2*3*0**',
  // 2. határvonal: a 123 többi része 3 → 4 → 1 → 2
  '2*1*3*4*0**',
  '2*2*4*1*0**',
  '2*3*1*2*0**',
  // 3. határvonal: a 124 többi része 2 → 5 → 6 → 3
  '3*1*2*5*0**',
  '3*2*5*6*0**',
  '3*3*6*3*0**',
  // 4. a lyuk
  '4*1*7*8*0**',
  '4*2*8*9*0**',
  '4*3*9*10*0**',
  '4*4*10*7*0**',
  'T_HATAR*',
  '1*1*2*+*',
  '1*2*1*+*',
  '2*1*3*+*',
  '2*2*1*-*',
  '3*1*4*+*',
  'T_FELULET*',
  '1*1*1*+*',
  '2*1*2*+*',
  '2*1*3*-*',
  'T_OBJ_ATTRAC*',
  '1*AC01*101*1*1*1*20200101*0**1*1*K*',
  '2*AC01*102*2*1*1*20200101*0**1*1*K*',
  'T_OBJ_ATTRAD*',
  '1*AD01*1*5411*7*0*195***1***1*1*',
  'T_OBJ_ATTRBD*',
  '11*BD01*1*123*0*1*502*****1*0***1*1*0*****0**1*1**',
  '12*BD01*2*124*0*1*371*****1*0***1*1*0*****0**1*1**',
  '\u001a',
].join('\r\n');

describe('DAT rekordok', () => {
  it('a * határolójel, az üres mezők és a záró határolójel', () => {
    expect(splitRecord('1*240000.00*650000.00****')).toEqual(['1', '240000.00', '650000.00', '', '', '']);
    expect(splitRecord('T_PONT*')).toEqual(['T_PONT']);
  });

  it('címrekord és táblázatok', () => {
    const t = parseDatTables(DAT);
    expect(t.title.slice(0, 3)).toEqual(['PROBA', 'Teszt adatcsere', 'DAT1']);
    expect(t.tables.get('T_PONT')).toHaveLength(10);
    expect([...t.tables.keys()]).toEqual(['T_PONT', 'T_HATARVONAL', 'T_HATAR', 'T_FELULET', 'T_OBJ_ATTRAC', 'T_OBJ_ATTRAD', 'T_OBJ_ATTRBD']);
  });
});

describe('a földrészletek beolvasása', () => {
  const r = readDat(DAT);

  it('a pontok EOV koordinátái és a részletpontok pontszámai', () => {
    expect(r.warnings).toEqual([]);
    expect(r.points).toHaveLength(10);
    expect(r.points[0]).toEqual({ id: '101', y: 650000, x: 240000 });
    expect(r.points[2]!.id).toBe('3');
  });

  it('a határ a határvonalakból, az irányváltással (a közös határvonal a 124-ben fordítva)', () => {
    const p123 = r.parcels.find((p) => p.hrsz === '123')!;
    const p124 = r.parcels.find((p) => p.hrsz === '124')!;
    expect(p123.ring).toEqual(['3', '4', '101', '102']);
    expect(p124.ring).toEqual(['102', '5', '6', '3']);
    expect(p123.computed).toBeCloseTo(500, 9);
    expect(p123.area).toBe(502);
  });

  it('a belső határ (lyuk) területe levonódik', () => {
    const p124 = r.parcels.find((p) => p.hrsz === '124')!;
    expect(p124.holes).toHaveLength(1);
    expect(p124.computed).toBeCloseTo(375 - 4, 9);
  });

  it('a hiányos állomány érthető figyelmeztetést ad', () => {
    expect(readDat('valami\nmás').warnings.at(-1)).toMatch(/nincs T_PONT/);
    const broken = DAT.replace('2*1*3*+*\r\n', '');
    expect(readDat(broken).warnings.join(' ')).toMatch(/124: a határ nem fűzhető pontsorrá/);
  });
});

describe('visszaírás (az ITR 5 DAT kimenetének szerkezete)', () => {
  const r = readDat(DAT);
  const byId = new Map(r.points.map((p) => [p.id, p]));
  const p123 = r.parcels.find((p) => p.hrsz === '123')!;
  // Megosztás: a 123 két részre, a 124 marad; az U1–U2 osztóvonal közös határ.
  const U1 = { id: 'U1', y: 650010, x: 240000 };
  const U2 = { id: 'U2', y: 650010, x: 240025 };
  const ring = (...ids: string[]) => ids.map((i) => (i === 'U1' ? U1 : i === 'U2' ? U2 : byId.get(i)!));
  const text = writeDat(
    [
      { hrsz: '123/1', area: 251, ring: ring('101', 'U1', 'U2', '4') },
      { hrsz: '123/2', area: 251, ring: ring('U1', '102', '3', 'U2') },
      { hrsz: '124', area: 371, ring: ring('102', '5', '6', '3'), template: { table: 'T_OBJ_ATTRBD', record: r.parcels[1]!.record } },
    ],
    { name: '2025_123DAT', date: new Date(2026, 9, 25), pointRecords: r.pointRecords },
  );
  const back = parseDatTables(text);

  it('a földrészlet geokódpontja a megadott címkoordináta', () => {
    const parcels = [{ hrsz: '123/1', area: 251, ring: ring('101', 'U1', 'U2', '4') }];
    const withAddr = parseDatTables(
      writeDat(parcels, { name: 'c', date: new Date(2026, 9, 25), addresses: new Map([['123/1', { y: 650005, x: 240012 }]]) }),
    );
    const bd = withAddr.tables.get('T_OBJ_ATTRBD') ?? withAddr.tables.get('T_OBJ_ATTRBC')!;
    const pontId = bd[0]!.at(-1)!;
    const pont = withAddr.tables.get('T_PONT')!.find((r) => r[0] === pontId)!;
    expect([pont[1], pont[2]]).toEqual(['240012', '650005']);
  });

  it('az ITR címrekordja, CR LF sorvég, CTRL-Z nélkül', () => {
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('GEOK_DAT*2025_123DAT**-*-*-*20261025*GEOkalkulus 1.0*2015.07.01 1.1*');
    expect(lines[1]).toBe('T_PONT*');
    expect(text.endsWith('*\r\n')).toBe(true);
    expect(text.includes('\u001a')).toBe(false);
  });

  it('a közös él egyetlen határvonal, a szomszéd „–” irányváltással hivatkozik rá', () => {
    const hv = back.tables.get('T_HATARVONAL')!;
    // 4 + 4 + 4 él, ebből 2 közös (U1–U2 és 102–3): 10 határvonal, mind egy szakaszos.
    expect(hv).toHaveLength(10);
    expect(hv.every((x) => x[1] === '1')).toBe(true);
    const hatar = back.tables.get('T_HATAR')!;
    expect(hatar).toHaveLength(12);
    expect(hatar.filter((x) => x[3] === '-')).toHaveLength(2);
  });

  it('a visszaolvasott földrészletek, pontszámok és területek', () => {
    const again = readDat(text);
    expect(again.warnings).toEqual([]);
    expect(again.parcels.map((p) => [p.hrsz, p.area, Math.round(p.computed)])).toEqual([
      ['123/1', 251, 250],
      ['123/2', 251, 250],
      ['124', 371, 375],
    ]);
    // A határ az óramutató járásával egyező irányú (Y kelet, X észak): 4 → U2 → U1 → 101.
    expect(again.parcels[0]!.ring).toEqual(['4', 'U2', 'U1', '101']);
    expect(again.points.map((p) => p.id)).toContain('U1');
  });

  it('a beolvasott pontok rekordjai és a szülő földrészlet attribútumai megmaradnak', () => {
    const ac = back.tables.get('T_OBJ_ATTRAC')!;
    expect(ac.find((x) => x[2] === '101')![1]).toBe('AC01');
    expect(ac.find((x) => x[2] === 'U1')![1]).toBe('AC01'); // az új pont a leggyakoribb osztályt kapja
    const bd = back.tables.get('T_OBJ_ATTRBD')!;
    expect(bd.map((x) => [x[1], x[3], x[6]])).toEqual([
      ['BD01', '123/1', '251'],
      ['BD01', '123/2', '251'],
      ['BD01', '124', '371'],
    ]);
  });

  it('Windows-1250 kódolás (az ITR kódlapja)', () => {
    expect([...encodeWindows1250('Sző közút')]).toEqual([0x53, 0x7a, 0xf5, 0x20, 0x6b, 0xf6, 0x7a, 0xfa, 0x74]);
    expect(decodeText(encodeWindows1250('T_FELIRAT*Sző 5*'))).toBe('T_FELIRAT*Sző 5*');
  });
});

describe('címkoordináták a DAT-ban (T_OBJ_ATTRAD)', () => {
  it('a pontkód és a pont helye', () => {
    expect(readDat(DAT).addresses).toEqual([{ code: '5411', y: 650025, x: 240010 }]);
  });
});
