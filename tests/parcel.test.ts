import { describe, expect, it } from 'vitest';
import { polygonArea } from '../src/core/geometry';
import {
  areaStatement,
  areaTolerance,
  checkArea,
  distributeArea,
  divideParallel,
  divideThroughVertex,
  parseParcels,
  type NamedPt,
} from '../src/core/parcel';

/**
 * Változási vázrajz: terület-összevetés a 8/2018. (VI. 29.) AM rendelet 8. és 9. melléklete szerint,
 * területarányos ráosztás (22. § (3)) és területosztás.
 */

describe('a területszámítás hibahatárai (8. és 9. melléklet)', () => {
  it('a 8. melléklet táblázati értékei', () => {
    expect(areaTolerance(1000, 8, '1000')).toBe(11);
    expect(areaTolerance(1000, 8, '2000')).toBe(22);
    expect(areaTolerance(1000, 8, '4000')).toBe(43);
    expect(areaTolerance(10 * 10_000, 8, '4000')).toBe(483);
    expect(areaTolerance(800 * 10_000, 8, '4000')).toBe(9003);
  });

  it('a sorok között lineáris interpoláció, a táblázat alatt az első érték, fölötte nincs érték', () => {
    expect(areaTolerance(1100, 8, '1000')).toBeCloseTo(11.5, 9);
    expect(areaTolerance(100, 8, '1000')).toBe(5);
    expect(areaTolerance(60 * 10_000, 8, '1000')).toBeNull(); // 1:500–1:1 000: 50 ha-ig
    expect(areaTolerance(900 * 10_000, 8, '4000')).toBeNull();
  });

  it('a 9. melléklet m²-es értékei', () => {
    expect(areaTolerance(1000, 9, '2880')).toBe(33);
    expect(areaTolerance(5000, 9, '4000')).toBe(188);
    expect(areaTolerance(10_000, 9, '1000')).toBe(165);
    expect(areaTolerance(150 * 10_000, 9, '1000')).toBeNull();
  });

  it('18. § (1): földrészletnél a táblázat másfélszerese, alrészletnél a kétszerese', () => {
    expect(checkArea(1000, 1016, 8, '1000', 'parcel')).toMatchObject({ diff: 16, limit: 16.5, ok: true });
    expect(checkArea(1000, 1017, 8, '1000', 'parcel').ok).toBe(false);
    expect(checkArea(1000, 1022, 8, '1000', 'sub')).toMatchObject({ limit: 22, ok: true });
  });
});

describe('területarányos ráosztás (22. § (3))', () => {
  it('a kerekített területekből indul, az összeg pontosan a cél', () => {
    const out = distributeArea([600.4, 399.7], 1005);
    expect(out.reduce((s, a) => s + a, 0)).toBe(1005);
    expect(out).toEqual([603, 402]);
  });

  it('eltérés nélkül a kerekített műszaki terület marad', () => {
    expect(distributeArea([512.49, 487.51], 1000)).toEqual([512, 488]);
  });

  it('negatív eltérésnél is', () => {
    const out = distributeArea([700.2, 200.1, 100.3], 990);
    expect(out.reduce((s, a) => s + a, 0)).toBe(990);
    expect(out[0]).toBe(693);
  });
});

const COORDS = ['1 1000.00 2000.00', '2 1040.00 2000.00', '3 1040.00 2025.00', '4 1000.00 2025.00', '5 1020.00 2000.00', '6 1020.00 2025.00'].join('\n');

describe('területkimutatás', () => {
  const st = areaStatement({
    coordinates: COORDS,
    before: '100 ; 1008 ; 1 2 3 4',
    after: '100/1 ; 1 5 6 4\n100/2 ; 5 2 3 6',
    annex: 8,
    scale: '1000',
    kind: 'parcel',
  });

  it('a műszaki terület a koordinátákból, az összevetés a hibahatárral', () => {
    expect(st.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(st.before[0]!.technical).toBeCloseTo(1000, 9);
    expect(st.before[0]!.check).toMatchObject({ diff: -8, ok: true });
  });

  it('a változás utáni végleges területek összege a tulajdoni lapi terület', () => {
    expect(st.after.map((a) => a.final)).toEqual([504, 504]);
    expect(st.sections.map((s) => s.kind)).toEqual(['parcel-before', 'parcel-after', 'parcel-statement']);
  });

  it('hibahatáron túli eltérés és eltérő kerület hibát ad', () => {
    const bad = areaStatement({ coordinates: COORDS, before: '100 ; 1030 ; 1 2 3 4', after: '100/1 ; 1 5 6 4', annex: 8, scale: '1000', kind: 'parcel' });
    expect(bad.issues.some((i) => /meghaladja a hibahatárt/.test(i.message))).toBe(true);
    expect(bad.issues.some((i) => /összege eltér/.test(i.message))).toBe(true);
  });

  it('a bemenet hibáit sorszámmal jelzi', () => {
    expect(parseParcels('100 ; x ; 1 2 3', true, 'Változás előtt').issues[0]!.message).toMatch(/érvénytelen terület/);
    const r = areaStatement({ coordinates: COORDS, before: '100 ; 1000 ; 1 2 9', after: '', annex: 8, scale: '1000', kind: 'parcel' });
    expect(r.issues[0]!.message).toMatch(/ismeretlen pont.*9/);
  });
});

const RECT: NamedPt[] = [
  { id: '1', y: 1000, x: 2000 },
  { id: '2', y: 1040, x: 2000 },
  { id: '3', y: 1040, x: 2025 },
  { id: '4', y: 1000, x: 2025 },
];

describe('területosztás', () => {
  it('párhuzamos osztóvonal: 300 m² az 1–4 oldal mellett', () => {
    const r = divideParallel(RECT, RECT[0]!, RECT[3]!, 300, ['100/1', '100/2'], 'U');
    expect(r.parts[0]!.area).toBeCloseTo(300, 4);
    expect(r.parts[1]!.area).toBeCloseTo(700, 4);
    expect(r.newPoints.map((p) => [p.id, Math.round(p.y * 1000) / 1000])).toEqual([
      ['U1', 1012],
      ['U2', 1012],
    ]);
    // Mindkét rész ugyanazokat az új pontokat használja.
    expect(r.parts[1]!.points.filter((p) => p.id.startsWith('U')).length).toBe(2);
  });

  it('párhuzamos osztóvonal ferde földrészletben', () => {
    const quad: NamedPt[] = [
      { id: 'a', y: 0, x: 0 },
      { id: 'b', y: 50, x: 5 },
      { id: 'c', y: 45, x: 40 },
      { id: 'd', y: -3, x: 33 },
    ];
    const r = divideParallel(quad, quad[0]!, quad[1]!, 612.5, ['A', 'B'], 'N', 7);
    expect(r.parts[0]!.area).toBeCloseTo(612.5, 3);
    expect(r.parts[0]!.area + r.parts[1]!.area).toBeCloseTo(polygonArea(quad), 6);
    expect(r.newPoints.map((p) => p.id)).toEqual(['N7', 'N8']);
  });

  it('töréspontos osztóvonal: 250 m² az 1. pontból', () => {
    const r = divideThroughVertex(RECT, '1', 250, ['100/1', '100/2'], 'U');
    expect(r.parts[0]!.area).toBeCloseTo(250, 6);
    expect(r.newPoints).toHaveLength(1);
    // 1→2 oldal 40 m, a 2–3 oldalon 12,5 m-re: 40·12,5/2 = 250.
    expect(r.newPoints[0]!.x).toBeCloseTo(2012.5, 6);
    expect(r.parts[1]!.points.map((p) => p.id)).toEqual(['1', 'U1', '3', '4']);
  });

  it('a lehetetlen kérés érthető hibát ad', () => {
    expect(() => divideParallel(RECT, RECT[0]!, RECT[3]!, 1200, ['a', 'b'], 'U')).toThrow(/közé kell essen/);
    expect(() => divideThroughVertex(RECT, '9', 100, ['a', 'b'], 'U')).toThrow(/nem töréspontja/);
  });
});

describe('az ITR koordinátajegyzék és a címkoordináta CSV fejléce', () => {
  it('a fejlécsorokat kihagyja, a pontkód és a középhiba oszlopai nem zavarnak', async () => {
    const { parsePoints } = await import('../src/core/parcel');
    const itr = parsePoints(['Psz.\tY\t\tX\t\tZ\t', '500\t602679.120\t204987.750\t0.000', '134792\t602626.380\t204959.510\t0.000\t3115\t6\t33'].join('\n'));
    expect(itr.issues).toEqual([]);
    expect([...itr.points.keys()]).toEqual(['500', '134792']);
    const csv = parsePoints([';;;;;Pontlista táblázata;;', 'Pontszám;Y;X;;Z_M;Pontkód;;', '1;615547.000;;210365.000;0.000;5412;0;0'].join('\n'));
    expect(csv.issues).toEqual([]);
    expect(csv.points.get('1')).toEqual({ id: '1', y: 615547, x: 210365 });
  });
});
