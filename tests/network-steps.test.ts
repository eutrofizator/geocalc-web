import { describe, expect, it } from 'vitest';
import { computeDetailPoints, workCoordinateList, type WorkPoint } from '../src/core/network/details';
import { parseGmj, parseNetworkCoordinates } from '../src/core/network/gmj';
import { preliminaryOrientationSection } from '../src/core/network/preliminary';
import { DEFAULT_VERTICAL_SETTINGS, type NetStation, type VerticalSettings } from '../src/core/network/types';
import { adjustHeights } from '../src/core/network/vertical';
import { ISZKA_COORDINATES, ISZKA_GMJ } from './fixtures/iszkahegy';

/**
 * A Hálózatkiegyenlítés öt lépésének (súgó 50–54. o.) számítómag-kiegészítései:
 * előzetes tájékozás, a magasságkülönbségek kihagyása és élessége, munka koordináta-jegyzék.
 */

const D = Math.PI / 180;
const coords = parseNetworkCoordinates(ISZKA_COORDINATES).points;
const stations = parseGmj(ISZKA_GMJ).stations;
const FREE: VerticalSettings = { ...DEFAULT_VERTICAL_SETTINGS, free: true };

/** Egy állomás a megadott tájékozással mért irányokkal (pontos geometria). */
function station(id: string, at: { y: number; x: number }, zk: number, targets: Record<string, { y: number; x: number }>, err: Record<string, number> = {}): NetStation {
  return {
    id,
    instrumentHeight: null,
    observations: Object.entries(targets).map(([t, p]) => {
      const az = Math.atan2(p.y - at.y, p.x - at.x) / D;
      const hz = (((az - zk + (err[t] ?? 0) / 3600) % 360) + 360) % 360;
      return { target: t, hz, zi: null, slope: null, horizontal: null, dM: null, targetHeight: null, distance: Math.hypot(p.y - at.y, p.x - at.x) };
    }),
  };
}

describe('Előzetes tájékozás (súgó 51. o.)', () => {
  const P = { A: { y: 1000, x: 1000 }, B: { y: 1500, x: 1000 }, C: { y: 1000, x: 1600 }, N: { y: 1300, x: 1300 } };
  const coordMap = new Map(Object.entries(P));

  it('hibátlan irányoknál a tájékozási szög a valódi és az eltérés nulla', () => {
    const st = station('A', P.A, 25, { B: P.B, C: P.C });
    const s = preliminaryOrientationSection([st], coordMap, () => true);
    expect(s.columns).toEqual(['Tájékozás', 'l', 'δ', 't', 'Zk/Zi', 'e″']);
    expect(s.rows[0]!.cells[0]).toBe('A');
    expect(s.rows[0]!.cells[4]).toBe('25.0000');
    expect(s.rows.slice(1).map((r) => r.cells[5])).toEqual(['0', '0']);
    expect(s.rows[1]!.cells[3]).toBe('500.000');
  });

  it('a durva hibás irány eltérése kimutatható (+20″ és −20″ a két irányon)', () => {
    const st = station('A', P.A, 25, { B: P.B, C: P.C }, { B: 40 });
    const s = preliminaryOrientationSection([st], coordMap, () => true);
    // Zk a két Zi átlaga, ezért a +40″ hibás irány két oldalra osztja az eltérést.
    expect(s.rows.slice(1).map((r) => r.cells[5])).toEqual(['-20', '20']);
  });

  it('a bevont irányok típusa szűrhető (pl. csak az ismert pontok)', () => {
    const st = station('A', P.A, 25, { B: P.B, C: P.C, N: P.N });
    const onlyKnown = preliminaryOrientationSection([st], coordMap, (id) => id !== 'N');
    expect(onlyKnown.rows.map((r) => r.cells[0])).toEqual(['A', 'B', 'C']);
  });

  it('koordináta nélküli álláspontnál nincs tájékozás, a lábléc megmondja', () => {
    const st = station('X', { y: 0, x: 0 }, 0, { B: P.B });
    const s = preliminaryOrientationSection([st], coordMap, () => true);
    expect(s.rows).toHaveLength(0);
    expect(s.footer?.[0]).toMatch(/Nincs tájékozható álláspont/);
  });
});

describe('Magassági kiegyenlítés: kihagyás és élesség (súgó 53. o.)', () => {
  const full = adjustHeights(coords, stations, FREE);
  const first = full.observations[0]!;
  const key = `${first.station}>${first.target}`;

  it('a kihagyott magasságkülönbség nem vesz részt a kiegyenlítésben', () => {
    const r = adjustHeights(coords, stations, { ...FREE, excluded: [key] });
    expect(r.counts.differences).toBe(full.counts.differences - 1);
    expect(r.counts.redundancy).toBe(full.counts.redundancy - 1);
    expect(r.excludedDifferences).toEqual([{ station: first.station, target: first.target, dh: first.dh }]);
    expect(r.observations.some((o) => o.station === first.station && o.target === first.target)).toBe(false);
    expect(r.sections.some((s) => s.kind === 'height-excluded')).toBe(true);
  });

  it('kihagyás nélkül nincs kihagyott-szakasz, és az eredmény a régi', () => {
    expect(full.excludedDifferences).toEqual([]);
    expect(full.sections.some((s) => s.kind === 'height-excluded')).toBe(false);
  });

  it('a számítás élessége a magasság-jegyzék tizedeseit állítja (cm alapértelmezés)', () => {
    const list = (r: ReturnType<typeof adjustHeights>) => r.sections.find((s) => s.kind === 'height-points')!.rows[0]!.cells[3]!;
    expect(list(full).split('.')[1]).toHaveLength(2);
    expect(list(adjustHeights(coords, stations, { ...FREE, precision: 'mm' })).split('.')[1]).toHaveLength(3);
    expect(list(adjustHeights(coords, stations, { ...FREE, precision: 'tizedmm' })).split('.')[1]).toHaveLength(4);
  });
});

describe('Munka koordináta-jegyzék (súgó 54. o.)', () => {
  const A = { y: 1000, x: 2000 };
  const B = { y: 1100, x: 2100 };
  const D1 = { y: 1060, x: 2080 };
  const stA = station('A', A, 10, { B, D1 });
  const stB = station('B', B, 350, { A, D1 });
  stA.observations.find((o) => o.target === 'D1')!.dM = 1.5;
  const det = computeDetailPoints(
    [stA, stB],
    new Map([
      ['A', A],
      ['B', B],
    ]),
    new Map([
      ['A', 10],
      ['B', 350],
    ]),
    new Map([['A', 100]]),
  );
  const points: WorkPoint[] = [
    { id: 'B', ...B, m: null, mark: 'cs', kind: 'adjusted' },
    { id: 'A', ...A, m: 100, mark: 'k', kind: 'known' },
    ...det.points.map<WorkPoint>((p) => ({ id: p.id, y: p.y, x: p.x, m: p.height, mark: '', kind: 'detail' })),
  ];

  it('az adott pontok, a kiegyenlítettek, majd a részletpontok sorrendjében, a választott élességgel', () => {
    const [list] = workCoordinateList(points, det.points, { heights: true, coordDecimals: 2, heightDecimals: 1 });
    expect(list!.columns).toEqual(['Pontszám', 'Y', 'X', 'M', 'Jelölés', 'Jelleg']);
    expect(list!.rows.map((r) => r.cells[0])).toEqual(['A', 'B', 'D1']);
    expect(list!.rows[0]!.cells).toEqual(['A', '1000.00', '2000.00', '100.0', 'k', 'adott']);
    expect(list!.rows[2]!.cells.slice(0, 3)).toEqual(['D1', '1060.00', '2080.00']);
    expect(list!.rows[2]!.cells[3]).toBe('101.5');
  });

  it('a magasság kijelzése kikapcsolható', () => {
    const [list] = workCoordinateList(points, det.points, { heights: false, coordDecimals: 3, heightDecimals: 2 });
    expect(list!.columns).toEqual(['Pontszám', 'Y', 'X', 'Jelölés', 'Jelleg']);
    expect(list!.rows[0]!.cells[1]).toBe('1000.000');
  });

  it('a többször mért részletpontokat álláspontonként kimutatja', () => {
    const sections = workCoordinateList(points, det.points, { heights: false, coordDecimals: 3, heightDecimals: 2 });
    const multi = sections.find((s) => s.kind === 'work-multi')!;
    expect(multi.rows.map((r) => r.cells.slice(0, 2).join(' '))).toEqual(['D1 A', 'D1 B']);
  });
});
