import { describe, expect, it } from 'vitest';
import {
  AKG_FIELDS,
  EMPTY_RECORD,
  akgFileName,
  akgPointList,
  akgSections,
  buildParcels,
  normalizeCelprg,
  parseAkgCoordinates,
  parseAms,
} from '../src/core/akg';
import { CalcError } from '../src/core/errors';

/**
 * Az Adatcsere/AKG jegyzőkönyv magja (súgó 75. o.).
 * A minta egy 100 × 100 m-es és egy trapéz alakú parcellát tartalmaz.
 */

const COORDS = [
  '101 602000.000 204500.000',
  '102 602100.000 204500.000',
  '103 602100.000 204600.000',
  '104 602000.000 204600.000',
  '105 602150.000 204650.000',
  '106 602250.000 204650.000',
].join('\r\n');

const AMS = ['#', '101', '102', '103', '104', ';;', '#', '103', '104', '105', '106', ';;'].join('\r\n');

describe('a koordináta-állomány (PSZ, Y, X)', () => {
  it('beolvassa a pontokat', () => {
    const pts = parseAkgCoordinates(COORDS);
    expect(pts).toHaveLength(6);
    expect(pts[0]).toEqual({ id: '101', y: 602000, x: 204500 });
  });

  it('a megjegyzéssort kihagyja', () => {
    expect(parseAkgCoordinates(`# jegyzet\r\n${COORDS}`)).toHaveLength(6);
  });

  it('ismétlődő pontszámra és üres állományra hibát dob', () => {
    expect(() => parseAkgCoordinates('1 1 2\r\n1 3 4')).toThrow(CalcError);
    expect(() => parseAkgCoordinates('')).toThrow(CalcError);
  });
});

describe('az AMS leíró állomány (# … ;;)', () => {
  it('parcellánként gyűjti a sarokpontokat', () => {
    expect(parseAms(AMS)).toEqual([
      ['101', '102', '103', '104'],
      ['103', '104', '105', '106'],
    ]);
  });

  it('kezdő # nélkül hibát dob', () => {
    expect(() => parseAms('101\r\n;;')).toThrow(CalcError);
  });

  it('lezárás nélkül hibát dob', () => {
    expect(() => parseAms('#\r\n1\r\n2\r\n3')).toThrow(CalcError);
  });

  it('háromnál kevesebb sarokpontra hibát dob', () => {
    expect(() => parseAms('#\r\n1\r\n2\r\n;;')).toThrow(CalcError);
  });

  it('üres állományra hibát dob', () => {
    expect(() => parseAms('')).toThrow(CalcError);
  });
});

describe('a parcellák geometriája', () => {
  const built = buildParcels(parseAkgCoordinates(COORDS), parseAms(AMS));

  it('két parcellát számol, hiba nélkül', () => {
    expect(built.issues).toEqual([]);
    expect(built.parcels).toHaveLength(2);
  });

  it('a négyzet területe 10 000 m², kerülete 400 m', () => {
    const p = built.parcels[0]!;
    expect(p.points).toHaveLength(4);
    expect(p.area).toBeCloseTo(10000, 6);
    expect(p.perimeter).toBeCloseTo(400, 6);
    expect(p.centroid.y).toBeCloseTo(602050, 6);
    expect(p.centroid.x).toBeCloseTo(204550, 6);
  });

  it('a szabálytalan négyszög területe 5 000 m²', () => {
    expect(built.parcels[1]!.area).toBeCloseTo(5000, 6);
  });

  it('a hiányzó sarokpontot jelzi', () => {
    const b = buildParcels(parseAkgCoordinates(COORDS), parseAms(['#', '101', '102', '103', '999', ';;'].join('\r\n')));
    expect(b.issues.join(' ')).toContain('999');
    expect(b.parcels).toHaveLength(1);
  });

  it('nagyon kevés ismert pontnál nem számol geometriát', () => {
    const b = buildParcels(parseAkgCoordinates(COORDS), parseAms(['#', '101', '102', '999', ';;'].join('\r\n')));
    expect(b.parcels).toHaveLength(0);
    expect(b.issues.join(' ')).toContain('nem számítható');
  });
});

describe('a célprogram azonosítója (súgó 75. o.)', () => {
  it('„a ad 1” → „a) ad) 1.”', () => {
    expect(normalizeCelprg('a ad 1')).toBe('a) ad) 1.');
  });

  it('a már kiegészített alakot nem bántja', () => {
    expect(normalizeCelprg('a) ad) 1.')).toBe('a) ad) 1.');
  });

  it('a számot ponttal, a betűt zárójellel egészíti ki', () => {
    expect(normalizeCelprg('ab 2')).toBe('ab) 2.');
  });

  it('üres bemenetre üres eredmény', () => {
    expect(normalizeCelprg('   ')).toBe('');
  });
});

describe('a generált állományok neve (súgó 75. o.)', () => {
  const r = { ...EMPTY_RECORD, regsz: '1234', block: 'A1', akgId: '5' };

  it('AKG_REGSZ_AKG_BLOKK_AKG_ID.kiterjesztés', () => {
    expect(akgFileName(r, 'pdf')).toBe('AKG_1234_A1_5.pdf');
    expect(akgFileName(r, 'shp')).toBe('AKG_1234_A1_5.shp');
    expect(akgFileName(r, 'shp-pont')).toBe('AKG_1234_A1_5_P.shp');
  });

  it('a hiányzó adat helyére X kerül', () => {
    expect(akgFileName({ ...EMPTY_RECORD, block: 'A1' }, 'pdf')).toBe('AKG_X_A1_1.pdf');
  });
});

describe('a jegyzőkönyv szakaszai', () => {
  const built = buildParcels(parseAkgCoordinates(COORDS), parseAms(AMS));
  const records = [{ ...EMPTY_RECORD, akgId: '1', regsz: '1234', block: 'A1', celprg: 'a) ad) 1.' }, { ...EMPTY_RECORD, akgId: '2' }];
  const sections = akgSections(built.parcels, records, { merteVegzo: 'Példa', meresIdeje: '2026. 10. 18.', muszer: 'TC-600', telepules: 'Iszkahegy' });

  it('öt szakasz készül', () => {
    expect(sections.map((s) => s.kind)).toEqual(['akg-common', 'akg-parcels', 'akg-points', 'akg-fields', 'akg-output']);
  });

  it('a parcellák táblázata tartalmazza a területet hektárban is', () => {
    const row = sections[1]!.rows[0]!;
    expect(row.cells[0]).toBe('1');
    expect(row.cells[4]).toBe('10000');
    expect(row.cells[5]).toBe('1.0000');
  });

  it('az AKG_* mezők mind szerepelnek a leíró adatlapban', () => {
    const names = sections[3]!.rows.map((r) => r.cells[0]);
    expect(names).toEqual(AKG_FIELDS.map((f) => f.name));
  });

  it('az első sarokpont a jelölőpont', () => {
    const row = sections[2]!.rows[0]!;
    expect(row.cells[1]).toBe('101');
    expect(row.cells[4]).toBe('jelölőpont');
  });

  it('a kimeneti nevek parcellánként három állományt sorolnak fel', () => {
    expect(sections[4]!.rows).toHaveLength(6);
    expect(sections[4]!.rows[0]!.cells[1]).toBe('AKG_1234_A1_1.pdf');
  });

  it('a sarokpont-lista parcellánként készül', () => {
    const text = akgPointList(built.parcels);
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe('# 1. parcella (10000 m²)');
    expect(lines[1]).toBe('101 602000.000 204500.000');
    expect(text).toContain(';;');
    expect(lines.filter((l) => l.startsWith('#'))).toHaveLength(2);
  });
});
