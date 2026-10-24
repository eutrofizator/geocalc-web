import { describe, expect, it } from 'vitest';
import {
  convertGeo,
  formatDmsSymbols,
  formatGeo,
  formatPseudoDecimal,
  parseDmsText,
  parseGeoLine,
  parsePseudoDecimal,
} from '../src/core/geo/convert';
import { SYSTEMS } from '../src/core/geo/systems';

const SUGO = 19 + 18 / 60 + 22.31643 / 3600;

describe('Földrajzi koordináták konvertálása – szögírások', () => {
  it('a súgó áldecimális példája: 19° 18′ 22.31643″ = 19.182231643', () => {
    expect(parsePseudoDecimal('19.182231643')).toBeCloseTo(SUGO, 12);
    expect(formatPseudoDecimal(SUGO)).toBe('19.182231643');
    expect(formatDmsSymbols(SUGO)).toBe('19° 18′ 22.31643″');
  });

  it('az áldecimális alak rövid és előjeles írása', () => {
    expect(parsePseudoDecimal('47')).toBe(47);
    expect(parsePseudoDecimal('47.3')).toBeCloseTo(47.5, 12);
    expect(parsePseudoDecimal('-0.0030')).toBeCloseTo(-30 / 3600, 12);
    expect(() => parsePseudoDecimal('47.6000')).toThrow(/≥ 60/);
    expect(() => parsePseudoDecimal('47,5')).toThrow();
  });

  it('a kerekítés túlcsordulása átvisz a percbe és a fokba', () => {
    expect(formatPseudoDecimal(47 + 59 / 60 + 59.999999 / 3600, 3)).toBe('48.0000000');
    expect(formatDmsSymbols(-(10 + 0.5 / 3600), 1)).toBe('-10° 00′ 00.5″');
  });

  it('fok-perc-másodperc szöveg jelekkel, szóközzel és égtájjal', () => {
    expect(parseDmsText('47°30′12.3″')).toBeCloseTo(47 + 30 / 60 + 12.3 / 3600, 12);
    expect(parseDmsText(`47°30'12.3"`)).toBeCloseTo(47 + 30 / 60 + 12.3 / 3600, 12);
    expect(parseDmsText('47 30 12.3')).toBeCloseTo(47 + 30 / 60 + 12.3 / 3600, 12);
    expect(parseDmsText('N 47 30')).toBeCloseTo(47.5, 12);
    expect(parseDmsText('47 30 S')).toBeCloseTo(-47.5, 12);
    expect(parseDmsText('Ny 19 3')).toBeCloseTo(-(19 + 3 / 60), 12);
    expect(() => parseDmsText('47 61 0')).toThrow(/≥ 60/);
  });
});

describe('Földrajzi koordináták konvertálása – átszámítás', () => {
  const p = { lat: 47 + 29 / 60 + 52.123 / 3600, lon: 19 + 2 / 60 + 47.456 / 3600, h: 151.25 };

  it('földrajzi → geocentrikus → földrajzi oda-vissza (a kimenet mm-es kerekítésén belül)', () => {
    const xyz = formatGeo(p, 'XYZ');
    const back = parseGeoLine(`A ${xyz.join(' ')}`, 'XYZ').geo;
    // 1e-8 fok ≈ 1 mm: a kiírt koordináták milliméterre kerekítettek.
    expect(Math.abs(back.lat - p.lat)).toBeLessThan(1e-8);
    expect(Math.abs(back.lon - p.lon)).toBeLessThan(1e-8);
    expect(back.h).toBeCloseTo(p.h, 3);
  });

  it('az UTM kimenet a Térbeli transzformáció UTM rendszerével egyezik', () => {
    const [y, x] = formatGeo(p, 'UTM34').map(Number);
    const viaSystems = SYSTEMS.UTM34.fromGeocentric(SYSTEMS.WGS84_FLH.toGeocentric([p.lat, p.lon, 0], true), true);
    expect(y).toBeCloseTo(viaSystems[0]!, 3);
    expect(x).toBeCloseTo(viaSystems[1]!, 3);
    // A 34-es zóna középmeridiánja 21°: ott a keleti koordináta 500 000 m.
    expect(Number(formatGeo({ lat: 47, lon: 21, h: 0 }, 'UTM34')[0])).toBeCloseTo(500000, 3);
  });

  it('UTM → földrajzi visszaolvasás', () => {
    const utm = formatGeo(p, 'UTM33');
    const back = parseGeoLine(`B ${utm.join(',')}`, 'UTM33').geo;
    expect(Math.abs(back.lat - p.lat)).toBeLessThan(1e-8);
    expect(Math.abs(back.lon - p.lon)).toBeLessThan(1e-8);
  });

  it('fok-perc-másodperc bemenet jelekkel és hármas számcsoportokkal', () => {
    const a = parseGeoLine(`1 47°29′52.123″ 19°02′47.456″ 151.25`, 'DMS');
    const b = parseGeoLine(`1 47 29 52.123 19 2 47.456 151.25`, 'DMS');
    for (const r of [a, b]) {
      expect(r.id).toBe('1');
      expect(r.geo.lat).toBeCloseTo(p.lat, 10);
      expect(r.geo.lon).toBeCloseTo(p.lon, 10);
      expect(r.geo.h).toBe(151.25);
    }
  });

  it('a hibás sor kimarad, a többi feldolgozható marad', () => {
    const r = convertGeo(['1 47.295212 19.024746 100', 'hibás sor', '', '2 47.3 19.1'].join('\n'), 'PSEUDO', 'DECIMAL');
    expect(r.rows.map((x) => x.id)).toEqual(['1', '2']);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.line).toBe(2);
    expect(r.rows[1]!.values).toEqual(['47.500000000', '19.166666667', '0.000']);
  });

  it('tartományon kívüli szélesség hibát ad', () => {
    const r = convertGeo('X 95 19', 'DECIMAL', 'PSEUDO');
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]!.message).toMatch(/tartományon kívül/);
  });
});
