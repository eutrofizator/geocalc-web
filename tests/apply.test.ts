import { describe, expect, it } from 'vitest';
import {
  EMPTY_PARAM_FIELDS,
  PARAM_FIELD_META,
  applyTransform,
  checkParams,
  fieldsToParams,
  fromSkiFields,
  paramsToFields,
  type ParamFields,
} from '../src/core/geo/apply';
import { parseCoordinateList, spatialTransform } from '../src/core/geo/spatial';
import { SYSTEMS } from '../src/core/geo/systems';
import { TRANSFORM_SAMPLE } from '../src/transform-sample';

/**
 * A Térbeli transzformáció/Átszámítás magja (súgó 63. o.).
 * A mintapélda a valódi program Pelda/Transzformacio/minta_tr.* állományaiból származik.
 */

describe('a transzformációs paraméterek mezői (súgó 63. o.)', () => {
  it('a mezők és a paraméterek oda-vissza alakíthatók', () => {
    const fields: ParamFields = { tX: 123.4567, tY: -234.5678, tZ: 3.5, rX: 1.23456, rY: -2.5, rZ: 0.00001, sMmKm: 12.34 };
    const back = paramsToFields(fieldsToParams(fields));
    for (const meta of PARAM_FIELD_META) {
      expect(back[meta.key]).toBeCloseTo(fields[meta.key], meta.key === 'sMmKm' ? 6 : 9);
    }
  });

  it('a Leica SKI előjel csak a forgatásokat fordítja meg', () => {
    const f: ParamFields = { tX: 1, tY: 2, tZ: 3, rX: 4, rY: 5, rZ: 6, sMmKm: 7 };
    const ski = fromSkiFields(f);
    expect(ski).toEqual({ tX: 1, tY: 2, tZ: 3, rX: -4, rY: -5, rZ: -6, sMmKm: 7 });
  });

  it('a hibás paramétert jelzi', () => {
    expect(checkParams({ ...EMPTY_PARAM_FIELDS })).toBeNull();
    expect(checkParams({ ...EMPTY_PARAM_FIELDS, tX: Number.NaN })).not.toBeNull();
    expect(checkParams({ ...EMPTY_PARAM_FIELDS, sMmKm: 1e7 })).not.toBeNull();
  });
});

describe('átszámítás megadott paraméterekkel (súgó 63–64. o.)', () => {
  it('azonos paraméterekkel a 2D EOV koordináták megmaradnak', () => {
    const points = parseCoordinateList('101 602000.000 204500.000', 'EOV', true);
    const r = applyTransform({ from: 'EOV', to: 'EOV', twoD: true, params: fieldsToParams(EMPTY_PARAM_FIELDS), points });
    expect(r.converted).toHaveLength(1);
    expect(r.convertedValues[0]!.coords[0]).toBeCloseTo(602000, 3);
    expect(r.convertedValues[0]!.coords[1]).toBeCloseTo(204500, 3);
    expect(r.geographic[0]![2]).toBeCloseTo(0, 6);
  });

  it('a kimenet a cél rendszer formázását használja', () => {
    const points = parseCoordinateList(TRANSFORM_SAMPLE.points, 'WGS84_XYZ', false);
    const r = applyTransform({ from: 'WGS84_XYZ', to: 'EOV', twoD: false, params: fieldsToParams(EMPTY_PARAM_FIELDS), points });
    expect(r.converted[0]!.input).toEqual(SYSTEMS.WGS84_XYZ.format(points[0]!.coords));
    expect(r.converted[0]!.output).toEqual(SYSTEMS.EOV.format(r.convertedValues[0]!.coords));
    expect(r.geographic[0]![0]).toBeGreaterThan(45);
    expect(r.geographic[0]![0]).toBeLessThan(49);
  });

  it('a valódi minta illesztett paramétereivel a közös pontok visszaadódnak', () => {
    const request = {
      from: 'WGS84_XYZ' as const,
      to: 'EOV' as const,
      twoD: false,
      commonFrom: parseCoordinateList(TRANSFORM_SAMPLE.commonFrom, 'WGS84_XYZ', false),
      commonTo: parseCoordinateList(TRANSFORM_SAMPLE.commonTo, 'EOV', false),
      points: [],
    };
    const fitted = spatialTransform(request);
    const known = parseCoordinateList(TRANSFORM_SAMPLE.commonFrom, 'WGS84_XYZ', false);
    const applied = applyTransform({ from: 'WGS84_XYZ', to: 'EOV', twoD: false, params: fitted.fit.params, points: known });
    // Az illesztés középhibáján belül vissza kell adnia a megadott EOV koordinátákat.
    applied.convertedValues.forEach((c, i) => {
      const expected = request.commonTo[i]!.coords;
      expect(Math.abs(c.coords[0]! - expected[0]!)).toBeLessThan(0.15);
      expect(Math.abs(c.coords[1]! - expected[1]!)).toBeLessThan(0.15);
    });
  });

  it('az átszámítás nincs hatással a bemeneti listára', () => {
    const points = parseCoordinateList('1 602000.000 204500.000', 'EOV', true);
    const before = JSON.stringify(points);
    applyTransform({ from: 'EOV', to: 'EOV', twoD: true, params: fieldsToParams({ ...EMPTY_PARAM_FIELDS, tX: 10 }), points });
    expect(JSON.stringify(points)).toBe(before);
  });
});
