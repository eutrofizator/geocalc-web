import { describe, expect, it } from 'vitest';
import {
  averageLeftRight,
  computeDm,
  computeTvet,
  detectFieldFormat,
  parseFieldData,
  parseGeoCalcAr,
  parseGsi,
  toGeoCalcAr,
  toNetworkGmj,
} from '../src/core/field-book';
import { parseGmj } from '../src/core/network/gmj';
import { DEFAULT_RECORDER_SETTINGS } from '../src/core/recorder';

/**
 * Adatrögzítő / Mérési adatok - koordináták: a terepi jegyzőkönyv beolvasása (GeoCalc-AR / GMJ és Leica
 * GSI), a vetületi távolság és a magasságkülönbség számítása, a bal/jobb középelés és a konvertálás.
 */

/** A GeoCalc 3.5 által mentett GMJ írásmódja: a nem mért zenitszög 0.0000, csak vízszintes távolság. */
const GEOCALC_GMJ = [
  '1,104,,,,,,,,,,,,-1',
  '2,112,3.4325,0.0000,,,,,,,,,,-2',
  '3,503,23.1938,0.0000,,1605.323,,,,,1605.3230,,,-2',
  '4,516,71.2654,0.0000,,1570.84,,,,,1570.8400,,,-2',
  '5,105,,,,,,,1.52,,,,,-1',
  '6,116,8.0326,91.2345,152.376,,,ko,,1.5,,,,-2',
].join('\r\n');

const EOV = { ...DEFAULT_RECORDER_SETTINGS, reduction: 'projection' as const, projection: 'EOV', avgY: 602147, avgX: 204807, avgM: 43 };

describe('GeoCalc-AR (GMJ) beolvasás – súgó 17. o.', () => {
  const r = parseGeoCalcAr(GEOCALC_GMJ);

  it('az álláspontokat és a méréseket a 14. mező (AP3) szerint választja szét', () => {
    expect(r.issues).toEqual([]);
    expect(r.rows.map((x) => `${x.kind}:${x.id}`)).toEqual(['station:104', 'obs:112', 'obs:503', 'obs:516', 'station:105', 'obs:116']);
  });

  it('a 0.0000 zenitszög hiányzó adat, a Tv és a Tvet a helyén', () => {
    const p = r.rows[2]!;
    expect(p.hz).toBeCloseTo(23 + 19 / 60 + 38 / 3600, 9);
    expect(p.zi).toBeNull();
    expect(p.tv).toBe(1605.323);
    expect(p.tvet).toBe(1605.323);
  });

  it('a mezők a súgó szerinti helyen: PKOD (8.), MM (9.), MJ (10.)', () => {
    expect(r.rows[4]!.mm).toBe(1.52);
    expect(r.rows[5]!.code).toBe('ko');
    expect(r.rows[5]!.mj).toBe(1.5);
    expect(r.rows[5]!.tf).toBe(152.376);
  });

  it('a mentés visszaolvasva ugyanazt adja (14 mező, -1/-2 kód)', () => {
    const again = parseGeoCalcAr(toGeoCalcAr(r.rows));
    expect(again.rows.map((x) => [x.kind, x.id, x.hz, x.zi, x.tf, x.tv, x.tvet, x.mm, x.mj, x.code])).toEqual(
      r.rows.map((x) => [x.kind, x.id, x.hz, x.zi, x.tf, x.tv, x.tvet, x.mm, x.mj, x.code]),
    );
    expect(toGeoCalcAr(r.rows).split('\r\n')[0]!.split(',')).toHaveLength(14);
  });

  it('a hálózat GMJ-olvasója is átveszi a csak vízszintes távolságot (a GeoCalc mentéséből)', () => {
    const net = parseGmj(GEOCALC_GMJ);
    expect(net.issues).toEqual([]);
    const st = net.stations[0]!;
    expect(st.observations.find((o) => o.target === '503')!.distance).toBe(1605.323);
    expect(st.observations.find((o) => o.target === '112')!.distance).toBeNull();
    expect(st.observations[0]!.zi).toBeNull();
  });
});

describe('Távolságredukció és magasságkülönbség a munkaterületen', () => {
  const r = parseGeoCalcAr(GEOCALC_GMJ);

  it('a Tvet a valódi GeoCalc értékét adja (EOV, X = 204807, M = 43)', () => {
    const red = computeTvet(r.rows, EOV);
    expect(red[2]!.tvet).toBe(1605.2003);
    expect(red[3]!.tvet).toBe(1570.7199);
    // A vetületi távolság mindig kisebb a vízszintesnél (az EOV középvonala közelében).
    for (const x of red) if (x.tvet !== null && x.tv !== null) expect(x.tvet).toBeLessThan(x.tv);
  });

  it('a ferde távolságból a magassági szöggel számol, és a dM a műszermagassággal', () => {
    const red = computeTvet(r.rows, { ...DEFAULT_RECORDER_SETTINGS, reduction: 'none' });
    const zi = 91 + 23 / 60 + 45 / 3600;
    expect(red[5]!.tvet!).toBeCloseTo(152.376 * Math.sin((zi * Math.PI) / 180), 4);
    const dm = computeDm(r.rows);
    expect(dm[5]!.dm!).toBeCloseTo(152.376 * Math.cos((zi * Math.PI) / 180) + 1.52 - 1.5, 4);
    expect(dm[2]!.dm).toBeNull();
  });
});

describe('Leica GSI-8 / GSI-16 beolvasás', () => {
  it('GSI-8: álláspont (84–88) és mérés (11, 21, 22, 31, 87), fok-perc-másodperc és mm egységgel', () => {
    const r = parseGsi(
      [
        '110001+00000104 84..10+60214700 85..10+20480700 86..10+00010000 88..10+00001500',
        '110002+00000112 21.324+12345300 22.324+09130000 31..00+00100000 87..10+00001300',
        '110003+00000113 21.324+01000000 22.324+09000000',
      ].join('\n'),
    );
    expect(r.issues).toEqual([]);
    expect(r.rows.map((x) => `${x.kind}:${x.id}`)).toEqual(['station:104', 'obs:112', 'obs:113']);
    expect(r.rows[0]!.mm).toBe(1.5);
    const m = r.rows[1]!;
    expect(m.hz).toBeCloseTo(123 + 45 / 60 + 30 / 3600, 9);
    expect(m.zi).toBeCloseTo(91.5, 9);
    expect(m.tf).toBe(100);
    expect(m.mj).toBe(1.3);
    // Csak irány: nincs távolság és jelmagasság.
    expect(r.rows[2]!.tf).toBeNull();
    expect(r.rows[2]!.mj).toBeNull();
  });

  it('GSI-16: csillaggal kezdődő sorok, gon egység és 0.1 mm-es távolság', () => {
    const r = parseGsi(
      [
        '*110001+0000000000000105 88..16+0000000000015200',
        '*110002+0000000000000116 21.322+0000000010000000 22.322+0000000010000000 32..06+0000000001234567',
      ].join('\n'),
    );
    expect(r.rows[0]!.mm).toBeCloseTo(1.52, 9);
    expect(r.rows[1]!.hz).toBeCloseTo(90, 9);
    expect(r.rows[1]!.zi).toBeCloseTo(90, 9);
    expect(r.rows[1]!.tv).toBeCloseTo(123.4567, 9);
  });

  it('Leica TC-600 kódblokk: álláspont (Cod), műszermagasság (In1), azonosító (In2) – súgó 16. o.', () => {
    const r = parseGsi(['410001+00000104 42....+00001520 43....+0000JOB1', '110002+00000112 21.324+04500000 22.324+09000000'].join('\n'));
    expect(r.rows[0]).toMatchObject({ kind: 'station', id: '104', mm: 1.52, ap1: 'JOB1' });
    expect(r.rows[1]!.hz).toBeCloseTo(45, 9);
  });

  it('a formátum felismerése és a még nem támogatott típusok jelzése', () => {
    expect(detectFieldFormat('110001+00000104 21.324+12345300')).toBe('leica-gsi16');
    expect(detectFieldFormat(GEOCALC_GMJ)).toBe('geocalc-ar');
    expect(() => parseFieldData('x', 'topcon')).toThrow(/mintaállományt/);
  });
});

describe('Bal-jobb középelés és konvertálás (súgó 12. o.)', () => {
  const r = parseGeoCalcAr(
    ['1,A,,,,,,,1.5,,,,,-1', '2,K-b,10.0000,0.0000,,,,,,,,,,-2', '3,K_j,12.0000,0.0000,,,,,,,,,,-2', '4,B,20.0000,90.0000,,100,,,,,99.99,,,-2'].join('\n'),
  );

  it('a bal és jobb irány középértéke új irány a közös pontszámmal, az eredetiek pirosak', () => {
    const avg = averageLeftRight(r.rows);
    expect(avg.count).toBe(1);
    expect(avg.rows.map((x) => `${x.id}:${x.state}`)).toEqual(['A:ok', 'K-b:merged', 'K_j:merged', 'K:mean', 'B:ok']);
    expect(avg.rows[3]!.hz).toBeCloseTo(11, 9);
  });

  it('a konvertálás a kihagyott és a középelt eredeti irányokat elhagyja, a Tvet a hálózat távolsága', () => {
    const avg = averageLeftRight(r.rows).rows;
    avg[4] = { ...avg[4]!, state: 'skip' };
    const out = toNetworkGmj(avg);
    expect(out.stations).toBe(1);
    expect(out.observations).toBe(1);
    const net = parseGmj(out.text);
    expect(net.stations[0]!.observations.map((o) => o.target)).toEqual(['K']);

    const withB = toNetworkGmj(averageLeftRight(r.rows).rows);
    const b = parseGmj(withB.text).stations[0]!.observations.find((o) => o.target === 'B')!;
    expect(b.distance).toBe(99.99);
  });
});
