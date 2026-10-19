import { describe, expect, it } from 'vitest';
import {
  POINT_KINDS,
  checkRegister,
  formatGeographic,
  kindMeta,
  parseGeographic,
  registerToGeoCalcDb,
  registerToGeographicText,
  registerToPoints,
  registerToPyx,
  type RegisterRow,
} from '../src/core/coords-file';
import { CalcError } from '../src/core/errors';

/**
 * Az Adatcsere/Koordináta állomány készítése magja (súgó 74. o.).
 * A súgó példája: a 19° 18′ 22.31643″ szélességet „19.182231643” alakban kell megadni.
 */

const R = (id: string, kind: RegisterRow['kind'], a: number | null, b: number | null, c: number | null = null): RegisterRow => ({ id, kind, a, b, c });

describe('földrajzi koordináták „áldecimális” alakja (súgó 74. o.)', () => {
  it('19.182231643 = 19° 18′ 22.31643″', () => {
    expect(parseGeographic('19.182231643')).toBeCloseTo(19.3061990083333, 9);
  });

  it('a negatív érték előjelet kap', () => {
    expect(parseGeographic('-19.182231643')).toBeCloseTo(-19.3061990083333, 9);
  });

  it('a kiírás megfordítja a bevitelt', () => {
    expect(formatGeographic(parseGeographic('19.182231643'))).toBe('19.182231643');
    expect(formatGeographic(19.5)).toBe('19.300000000');
    expect(parseGeographic(formatGeographic(47.5))).toBeCloseTo(47.5, 9);
  });

  it('négy jegynél rövidebb törtrészt tizedes fokként értelmez', () => {
    expect(parseGeographic('19.306199')).toBeCloseTo(19.306199, 9);
    expect(parseGeographic('47.5')).toBeCloseTo(47.5, 9);
  });

  it('a perc vagy a másodperc nem lehet 60 vagy több', () => {
    // 19.9975 => 99 perc, ezért tizedes fokként értelmezendő.
    expect(parseGeographic('19.9975')).toBeCloseTo(19.9975, 9);
  });

  it('érvénytelen bemenetre hibát dob', () => {
    expect(() => parseGeographic('abc')).toThrow(CalcError);
  });
});

describe('a ponttípusok és oszlopaik', () => {
  it('három típus ismert, a dokumentált oszlopnevekkel', () => {
    expect(POINT_KINDS.map((k) => k.kind)).toEqual(['yxm', 'xyz', 'geo']);
    expect(kindMeta('yxm').columns).toEqual(['Y', 'X', 'M']);
    expect(kindMeta('xyz').columns).toEqual(['X', 'Y', 'Z']);
    expect(kindMeta('geo').columns).toEqual(['φ [°]', 'λ [°]', 'h [m]']);
    expect(kindMeta('geo').decimals[0]).toBe(9);
  });
});

describe('a jegyzék kiírása', () => {
  const rows = [R('101', 'yxm', 602000, 204500, 110.5), R('2', 'xyz', 4106820.237, 1377136.303, 4666265.152)];

  it('a GeoCalc adatbázis minden típust megtart', () => {
    expect(registerToGeoCalcDb(rows)).toBe('101, 602000.000, 204500.000, 110.500\r\n2, 4106820.237, 1377136.303, 4666265.152\r\n');
  });

  it('a .PYX (fix szélességű) csak Y, X, M pontokból készül', () => {
    expect(registerToPyx([R('1', 'yxm', 3817.292, 7339.727, 0)])).toBe('1'.padEnd(15) + '3817.292'.padEnd(12) + '7339.727'.padEnd(15) + '0.000 \r\n');
    expect(() => registerToPyx(rows)).toThrow(CalcError);
  });

  it('a földrajzi kiírás a sarokpontokat is átalakítja', () => {
    const geo = [R('1', 'geo', 47.5, 19.25, 145)];
    expect(registerToGeographicText(geo)).toBe('1 47.500000000 19.250000000 145.000\r\n');
  });

  it('az Y, X, M pontok a számítómag pontjaivá alakulnak', () => {
    const pts = registerToPoints([R('1', 'yxm', 602000, 204500, 110), R('2', 'geo', 47, 19, 100)]);
    expect(pts).toEqual([{ id: '1', y: 602000, x: 204500, m: 110, code: '0' }]);
  });
});

describe('a jegyzék ellenőrzése', () => {
  it('hiányzó és ismétlődő pontszámot jelez', () => {
    const issues = checkRegister([R('', 'yxm', 1, 2), R('1', 'yxm', 1, 2), R('1', 'yxm', 3, 4)]);
    expect(issues.some((i) => i.includes('hiányzó pontszám'))).toBe(true);
    expect(issues.some((i) => i.includes('többször szerepel'))).toBe(true);
  });

  it('hiányzó koordinátát jelez, a harmadik mezőt nem kéri', () => {
    const issues = checkRegister([R('1', 'yxm', 1, null), R('2', 'geo', null, 19)]);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('X');
    expect(issues[1]).toContain('φ');
  });

  it('a helyes jegyzék hibátlan', () => {
    expect(checkRegister([R('1', 'yxm', 1, 2), R('2', 'geo', 47, 19)])).toEqual([]);
  });
});
