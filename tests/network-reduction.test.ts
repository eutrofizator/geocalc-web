import { describe, expect, it } from 'vitest';
import { parseGmj, parseNetworkCoordinates } from '../src/core/network/gmj';
import { adjustHorizontal } from '../src/core/network/horizontal';
import { networkAverages, networkReduction, reductionSection, scaleDistances } from '../src/core/network/reduction';
import { DEFAULT_HORIZONTAL_SETTINGS } from '../src/core/network/types';
import { DEFAULT_RECORDER_SETTINGS, projectionScale } from '../src/core/recorder';
import { ISZKA_COORDINATES, ISZKA_GMJ } from './fixtures/iszkahegy';

/**
 * Vetületi távolságredukció a hálózat számított koordinátáiból: alapból nincs redukció, a kiegyenlítés
 * után a pontok átlagos Y, X, M értékéből kérhető.
 */

describe('az alapérték: nincs távolságredukció', () => {
  it('az Adatrögzítő alapbeállítása redukció nélküli', () => {
    expect(DEFAULT_RECORDER_SETTINGS.reduction).toBe('none');
  });
});

describe('a redukció szorzója', () => {
  it('a GeoCalc 3.5 értékét adja (EOV, Y 602147, X 204807, M 43: 1605.323 → 1605.2003)', () => {
    const r = networkReduction('EOV', 602147, 204807, 43);
    expect(Math.round(1605.323 * r.factor * 10000) / 10000).toBe(1605.2003);
    const p = projectionScale({ avgY: 602147, avgX: 204807, avgM: 43, k: 0.99993, R: 6379743.001, ref: 200000, axis: 'x', heightReduction: true });
    expect(r.factor).toBeCloseTo(p.factor, 15);
  });

  it('az átlagos magasság csak a magassággal rendelkező pontokból számít', () => {
    const avg = networkAverages([
      { y: 10, x: 20, m: 100 },
      { y: 30, x: 40, m: null },
      { y: 50, x: 60, m: 110 },
    ])!;
    expect(avg).toEqual({ y: 30, x: 40, m: 105, count: 3, heightCount: 2 });
    expect(networkAverages([])).toBeNull();
    expect(networkAverages([{ y: 1, x: 2, m: null }])!.m).toBeNull();
  });

  it('a távolságok a szorzóval redukálódnak, az irányok nem változnak', () => {
    const stations = parseGmj(ISZKA_GMJ).stations;
    const scaled = scaleDistances(stations, 0.9999);
    const a = stations[0]!.observations.find((o) => o.distance !== null)!;
    const b = scaled[0]!.observations.find((o) => o.target === a.target)!;
    expect(b.distance).toBeCloseTo(a.distance! * 0.9999, 9);
    expect(b.hz).toBe(a.hz);
    expect(stations[0]!.observations.find((o) => o.target === a.target)!.distance).toBe(a.distance);
  });
});

describe('a kiegyenlítés a redukált távolságokkal', () => {
  const known = parseNetworkCoordinates(ISZKA_COORDINATES).points;
  const stations = parseGmj(ISZKA_GMJ).stations;
  const base = adjustHorizontal(known, stations, DEFAULT_HORIZONTAL_SETTINGS);
  const avg = networkAverages([...known.map((p) => ({ y: p.y, x: p.x, m: p.m })), ...base.points.map((p) => ({ y: p.y, x: p.x, m: null }))])!;
  const red = networkReduction('EOV', avg.y, avg.x, avg.m ?? 0);
  const reduced = adjustHorizontal(known, scaleDistances(stations, red.factor), DEFAULT_HORIZONTAL_SETTINGS);

  it('a szorzó 1-nél kisebb az EOV középvonala közelében (vetületi < vízszintes)', () => {
    expect(red.factor).toBeLessThan(1);
  });

  it('a redukció mm-es nagyságrendben mozdítja az új pontokat, a pontok száma nem változik', () => {
    expect(reduced.points.map((p) => p.id)).toEqual(base.points.map((p) => p.id));
    const shift = Math.max(...reduced.points.map((p, i) => Math.hypot(p.y - base.points[i]!.y, p.x - base.points[i]!.x)));
    expect(shift).toBeGreaterThan(0);
    expect(shift).toBeLessThan(0.2);
  });

  it('a jegyzőkönyv szakasza közli az átlagokat, a szorzót és hogy figyelembe vette-e', () => {
    const on = reductionSection(red, avg, false, true);
    const off = reductionSection(red, avg, false, false);
    expect(on.kind).toBe('net-reduction');
    expect(on.rows.find((r) => r.cells[0] === 'Szorzó')!.cells[1]).toBe(red.factor.toFixed(9));
    expect(on.rows.at(-1)!.cells[1]).toMatch(/figyelembe véve/);
    expect(off.rows.at(-1)!.cells[1]).toMatch(/nincs figyelembe véve/);
    expect(reductionSection(red, avg, true, true).rows.find((r) => r.cells[0] === 'Átlagos M')!.cells[1]).toMatch(/kézzel/);
  });
});
