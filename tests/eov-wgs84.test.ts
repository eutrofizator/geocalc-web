import { describe, expect, it } from 'vitest';
import { convertGeo, eovToWgs84, wgs84ToEov } from '../src/core/geo/convert';

/**
 * EOV (HD72, EPSG:23700) ↔ WGS 84 / ETRS89 az országos 7 paraméteres transzformációval (MSZ 7222,
 * EPSG 1449). Az elvárt értékek a PROJ 9.8.1 számításai ugyanezzel a vetülettel és paraméterekkel
 * (somerc + helmert, coordinate_frame).
 */

const REF: [number, number, number, number][] = [
  // EOV Y, X → ETRS89 φ, λ [°]
  [650000, 200000, 47.1441253323, 19.0474523303],
  [650120.45, 241230.18, 47.5149977633, 19.0490449899],
  [860000, 150000, 46.6611885661, 21.7919374472],
  [450000, 100000, 46.2146783167, 16.4552466825],
];

describe('EOV → WGS 84 / ETRS89', () => {
  for (const [y, x, lat, lon] of REF)
    it(`Y = ${y}, X = ${x}`, () => {
      const g = eovToWgs84(y, x);
      // 1e-8° ≈ 1 mm
      expect(g.lat).toBeCloseTo(lat, 8);
      expect(g.lon).toBeCloseTo(lon, 8);
    });

  it('a magasság (M) változatlanul megy át', () => {
    expect(eovToWgs84(650000, 200000, 123.45).h).toBe(123.45);
  });
});

describe('WGS 84 / ETRS89 → EOV', () => {
  it('a PROJ értéke (φ = 47,5°, λ = 19,05°)', () => {
    const p = wgs84ToEov({ lat: 47.5, lon: 19.05, h: 0 });
    expect(p.y).toBeCloseTo(650192.415, 3);
    expect(p.x).toBeCloseTo(239562.794, 3);
  });

  it('oda-vissza milliméteren belül', () => {
    for (const [y, x] of REF) {
      const p = wgs84ToEov(eovToWgs84(y, x));
      expect(Math.abs(p.y - y)).toBeLessThan(0.001);
      expect(Math.abs(p.x - x)).toBeLessThan(0.001);
    }
  });
});

describe('a Földrajzi koordináták konvertálása munkalapon', () => {
  it('EOV → áldecimális és vissza', () => {
    const r = convertGeo('A 650120.45 241230.18 151.25', 'EOV', 'DECIMAL');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]!.values).toEqual(['47.514997762', '19.049044990', '151.250']);
    const back = convertGeo(`A ${r.rows[0]!.values.join(' ')}`, 'DECIMAL', 'EOV');
    expect(back.rows[0]!.values).toEqual(['650120.450', '241230.180', '151.250']);
  });

  it('a tartományon kívüli EOV koordináta hibát ad', () => {
    expect(convertGeo('B 241230 650120', 'EOV', 'DECIMAL').errors[0]!.message).toMatch(/tartományon kívül/);
  });
});
