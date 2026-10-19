import { describe, expect, it } from 'vitest';
import { ERROR_LIMITS, PRECISION_OPTIONS, errorLimit } from '../src/core/network/limits';
import { DEFAULT_HORIZONTAL_SETTINGS, PRECISION_DECIMALS } from '../src/core/network/types';

/**
 * A Hálózatkiegyenlítés/Beállítások előbeállításai (súgó 62. o.).
 * Csak az V. rendű hibahatár igazolt a súgó mintapéldájából (10″ irány- és 5 mm távmérés-középhiba);
 * a többi érték a webes változat becslése.
 */

describe('a hálózati rendűség hibahatárai (súgó 62. o.)', () => {
  it('négy előbeállítás van', () => {
    expect(ERROR_LIMITS).toHaveLength(4);
    expect(ERROR_LIMITS.map((e) => e.id)).toEqual(['szabatos', 'v-rendu', 'felmeresi', 'mikro']);
  });

  it('az V. rendű hibahatár a súgóval igazolt (10″ / 5 mm)', () => {
    const v = errorLimit('v-rendu')!;
    expect(v.sigmaDirection).toBe(10);
    expect(v.sigmaDistance).toBe(5);
    expect(v.verified).toBe(true);
  });

  it('csak az V. rendű érték igazolt', () => {
    expect(ERROR_LIMITS.filter((e) => e.verified).map((e) => e.id)).toEqual(['v-rendu']);
  });

  it('a durva hiba küszöbei nagyobbak a középhibáknál', () => {
    for (const e of ERROR_LIMITS) {
      expect(e.grossDirection).toBeGreaterThan(e.sigmaDirection);
      expect(e.grossDistance).toBeGreaterThan(e.sigmaDistance / 1000);
    }
  });

  it('ismeretlen azonosítóra nincs érték', () => {
    expect(errorLimit('nincs-ilyen')).toBeUndefined();
  });
});

describe('a számítás élessége', () => {
  it('cm, mm és tized mm választható', () => {
    expect(PRECISION_OPTIONS.map((p) => p.id)).toEqual(['cm', 'mm', 'tizedmm']);
    expect(PRECISION_DECIMALS).toEqual({ cm: 2, mm: 3, tizedmm: 4 });
  });

  it('az alapértelmezés a mm', () => {
    expect(DEFAULT_HORIZONTAL_SETTINGS.coordinatePrecision).toBe('mm');
  });
});
