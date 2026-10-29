import { describe, expect, it } from 'vitest';
import { parseGsi } from '../src/core/field-book';
import { orientStations, type RawObs } from '../src/core/orientation';

const RHO = 180 / Math.PI;
const S = { id: '101', y: 650000, x: 240000 };
/** Pont az állásponttól adott irányszögben és távolságban. */
const at = (id: string, deg: number, d: number) => ({ id, y: S.y + d * Math.sin(deg / RHO), x: S.x + d * Math.cos(deg / RHO) });
const A = at('1001', 45, 20);
const B = at('1003', 135, 30);
const P = at('2001', 200, 15);
const Z = 10; // a műszer kezdőirányának tájékozási szöge
const obs = (id: string, deg: number, d: number, dsec = 0): RawObs => ({ kind: 'obs', id, hz: ((deg - Z + dsec / 3600) % 360 + 360) % 360, zi: 90, tf: d, tv: d });
const rows: RawObs[] = [
  { kind: 'station', id: '101', hz: null, zi: null, tf: null, tv: null },
  obs('1001', 45, 20, 3),
  obs('1003', 135, 30, -3),
  obs('2001', 200, 15),
];
const refs = new Map([A, B].map((p) => [p.id, p]));

describe('tájékozás', () => {
  it('ismert álláspont: tájékozási szög, javítások, középhiba, poláris részletpont', () => {
    const { stations, issues } = orientStations(rows, refs, new Map([...refs, [S.id, S], [P.id, P]]));
    const s = stations[0]!;
    expect(s.source).toBe('known');
    expect(s.z).toBeCloseTo(Z, 6);
    expect(s.rows.map((r) => [r.id, Math.round(r.v * 10) / 10])).toEqual([
      ['1001', 3],
      ['1003', -3],
    ]);
    expect(s.m0).toBeCloseTo(Math.sqrt(18), 6);
    expect(s.rows[0]!.e).toBeCloseTo((3 / 3600 / RHO) * 20 * 1000, 6);
    expect(s.points).toHaveLength(1);
    expect(s.points[0]!.id).toBe('2001');
    expect(s.points[0]!.dy).toBeCloseTo(0, 6);
    expect(s.points[0]!.dx).toBeCloseTo(0, 6);
    expect(s.freeCheck!.dy).toBeCloseTo(0, 3);
    expect(issues.map((i) => i.level)).toEqual(['info']);
  });

  it('ismeretlen álláspont: szabad álláspont két ismert pontból', () => {
    const exact = rows.map((r) => (r.kind === 'obs' ? obs(r.id, r.id === '1001' ? 45 : r.id === '1003' ? 135 : 200, r.tf!) : r));
    const { stations } = orientStations(exact, refs, new Map(refs));
    const s = stations[0]!;
    expect(s.source).toBe('free');
    expect(s.y).toBeCloseTo(S.y, 6);
    expect(s.x).toBeCloseTo(S.x, 6);
    expect(s.scale).toBeCloseTo(1, 9);
    expect(s.points[0]!.y).toBeCloseTo(P.y, 6);
  });

  it('névütközés: a koordináták között ugyanilyen pontszámú más pont (épületsarok) – szabad álláspont', () => {
    const corner = { id: '101', y: S.y + 7, x: S.x - 4 };
    const { stations, issues } = orientStations(rows, refs, new Map([...refs, [corner.id, corner]]));
    expect(stations[0]!.source).toBe('free');
    expect(stations[0]!.y).toBeCloseTo(S.y, 2);
    expect(issues.some((i) => i.level === 'warning' && /más pontot jelöl/.test(i.message))).toBe(true);
  });

  it('eltérő álláspont-koordinátánál figyelmeztet', () => {
    const shifted = { ...S, y: S.y + 0.02 };
    const { issues } = orientStations(rows, refs, new Map([...refs, [S.id, shifted]]));
    expect(issues.some((i) => i.level === 'warning' && /2\.0 cm-re/.test(i.message))).toBe(true);
  });
});

describe('GSI kódblokk: 41 kódszám, 42 álláspont, 43 műszermagasság', () => {
  it('több azonos kódszámú blokknál a 42-es szó az álláspont', () => {
    const r = parseGsi(
      [
        '410001+0000000000000002 42....+0000000000000101 43....+0000000000001650',
        '110001+0000000000001001 21...4+0000000021837550 22...4+0000000010434060 31...6+0000000000115850',
        '410002+0000000000000002 42....+0000000000000102 43....+0000000000001600',
        '110002+0000000000001002 21...4+0000000017152060 22...4+0000000010604540 31...6+0000000000141810',
      ].join('\r\n'),
    );
    expect(r.rows.filter((x) => x.kind === 'station').map((x) => [x.id, x.mm])).toEqual([
      ['101', 1.65],
      ['102', 1.6],
    ]);
    const o = r.rows[1]!;
    expect(o.hz).toBeCloseTo(218 + 37 / 60 + 55 / 3600, 9);
    expect(o.tf).toBeCloseTo(11.585, 9);
  });
});
