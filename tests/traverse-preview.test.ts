import { describe, expect, it } from 'vitest';
import { CalcError } from '../src/core/errors';
import { azimuthDeg } from '../src/core/geometry';
import { parseGmj, parseNetworkCoordinates } from '../src/core/network/gmj';
import { adjustHorizontal } from '../src/core/network/horizontal';
import { parseTraverseOrder, traversePreview } from '../src/core/network/traverse-preview';
import { DEFAULT_HORIZONTAL_SETTINGS, type NetObservation, type NetStation } from '../src/core/network/types';
import { ISZKA_COORDINATES, ISZKA_GMJ } from './fixtures/iszkahegy';

const knownPts = parseNetworkCoordinates(ISZKA_COORDINATES).points;
const known = new Map(knownPts.map((p) => [p.id, { y: p.y, x: p.x }] as const));
const stations = parseGmj(ISZKA_GMJ).stations;
/** A hálózatkiegyenlítésből ismert (valódi) koordináták a 2 és 3 új pontra. */
const adjusted = new Map(adjustHorizontal(knownPts, stations, DEFAULT_HORIZONTAL_SETTINGS).points.map((p) => [p.id, p] as const));

/** Szintetikus hálózat: a megadott pontokon mérjük a szomszédokat (irány + távolság), adott tájékozási szöggel. */
const ring = (P: Record<string, { y: number; x: number }>, Z: Record<string, number>, ids: string[], legs: [string, string][]): NetStation[] =>
  ids.map((id) => ({
    id,
    instrumentHeight: null,
    observations: legs
      .filter(([a, b]) => a === id || b === id)
      .map<NetObservation>(([a, b]) => {
        const to = a === id ? b : a;
        return {
          target: to,
          hz: (azimuthDeg(P[id]!, P[to]!) - Z[id]! + 720) % 360,
          zi: null,
          slope: null,
          horizontal: null,
          dM: null,
          targetHeight: null,
          distance: Math.hypot(P[a]!.y - P[b]!.y, P[a]!.x - P[b]!.x),
        };
      }),
  }));

describe('sokszögvonal-előzetes (súgó 55. o.)', () => {
  // Beillesztett vonal: 541017D és 541440 ismert, a 2 és 3 új pont.
  const Order = ['541017D', '2', '3', '541440'];
  const t = traversePreview(Order, known, stations);

  it('a vonal előírását (hátra/előre irány, törésszög, oda-vissza távolság) összeállítja', () => {
    const v = t.sections.find((s) => s.kind === 'traverse-vertices')!;
    expect(v.columns).toEqual(['Pontszám', 'Hátra (Hz)', 'Előre (Hz)', 'dHZ', 'T(1) [m]', 'T(2) [m]', 'Irányszög', 'Hossz [m]']);
    expect(v.rows.map((r) => r.cells[0])).toEqual(['541017D', '2', '3', '541440']);
    // Az első ponton nincs hátrairány, a végponton nincs előreirány (és nincs szakasza).
    expect(v.rows[0]!.cells[1]).toBe('');
    expect(v.rows[0]!.cells[2]).not.toBe('');
    expect(v.rows[3]!.cells[2]).toBe('');
    expect(v.rows[3]!.cells[6]).toBe('');
    // Az oda-vissza mért távolság mindkét irányból látszik (kis eltéréssel).
    expect(v.rows[0]!.cells[4]).toBe('1008.978');
    expect(v.rows[0]!.cells[5]).toBe('1008.974');
    expect(v.rows[1]!.cells[4]).toBe('719.131');
    expect(v.rows[1]!.cells[5]).toBe('719.134');
    // A törésszög a hátra- és az előreirány különbsége.
    expect(v.rows[1]!.cells[3]).not.toBe('');
    expect(t.vertices[1]!.dHz).toBeCloseTo((t.vertices[1]!.forward! - t.vertices[1]!.back! + 360) % 360, 9);
  });

  it('az előzetes koordináták a mért irányokból és távolságokból adódnak', () => {
    const p = t.sections.find((s) => s.kind === 'traverse-points')!;
    expect(p.rows.map((r) => r.cells[0])).toEqual(['541017D', '2', '3', '541440']);
    expect(p.rows[0]!.cells[3]).toBe('ismert');
    expect(p.rows[1]!.cells[3]).toBe('előzetes');
    // A közbenső pontok előzetes koordinátái gyakorlatilag a hálózatkiegyenlítésből adódó értéket adják.
    for (const id of ['2', '3']) {
      expect(Math.abs(t.points.find((q) => q.id === id)!.y - adjusted.get(id)!.y)).toBeLessThan(0.05);
      expect(Math.abs(t.points.find((q) => q.id === id)!.x - adjusted.get(id)!.x)).toBeLessThan(0.05);
    }
    // A zárópont az ismert koordinátára kerül (a vonalas záróhiba elosztása után).
    expect(t.points[3]!.y).toBeCloseTo(known.get('541440')!.y, 3);
    expect(t.points[3]!.x).toBeCloseTo(known.get('541440')!.x, 3);
  });

  it('a vonalas záróhibát kiszámítja, és arányosan elosztja', () => {
    expect(t.linear).not.toBeNull();
    expect(t.linear!.length).toBeCloseTo(0.054, 3);
    expect(t.linear!.length).toBeLessThan(t.linear!.allowed);
    const sum = t.vertices.reduce((a, v) => a + (v.length ?? 0), 0);
    expect(t.linear!.totalLength).toBeCloseTo(sum, 6);
    expect(t.linear!.allowed).toBeCloseTo(0.048 + 0.00012 * sum, 9);
    expect(t.sections[0]!.footer!.join(' ')).toContain('Vonalas záróhiba:');
  });

  it('ismert végirány nélkül a szögzáró hiba nem számítható (a végpont új pont)', () => {
    expect(t.angularClosure).toBeNull();
    expect(t.sections[0]!.footer!.join(' ')).toContain('A szögzáró hiba nem számítható');
  });

  it('a kezdő irányszög a kezdőpont tájékozásából is adódhat', () => {
    const r = traversePreview(['541017D', '2', '3'], known, stations);
    expect(r.vertices[0]!.azimuth).not.toBeNull();
    expect(r.vertices[0]!.azimuth!).toBeGreaterThanOrEqual(0);
    expect(r.vertices[0]!.azimuth!).toBeLessThan(360);
    // Az első szakasz irányszöge a 2. pont irányába mutat.
    expect(Math.abs(r.vertices[0]!.azimuth! - azimuthDeg(known.get('541017D')!, adjusted.get('2')!))).toBeLessThan(0.01);
    expect(r.sections[0]!.footer!.join(' ')).toContain('tájékozásából');
  });

  it('a hibás sorrendet és a hiányzó adatot jelzi', () => {
    expect(() => traversePreview(['1', '2'], known, stations)).toThrow(/legalább három pont/);
    expect(() => traversePreview(['541017D', '2', '2'], known, stations)).toThrow(/többször szerepel/);
    expect(() => traversePreview(['ZZZ', '2', '3'], known, stations)).toThrow(/nem ismert/);
  });
});

describe('kétoldalt csatlakozó (beillesztett) sokszögvonal', () => {
  const P: Record<string, { y: number; x: number }> = {
    A: { y: 0, x: 0 },
    P1: { y: 100, x: 300 },
    P2: { y: 450, x: 520 },
    B: { y: 300, x: 900 },
  };
  const Z: Record<string, number> = { A: 17, P1: 200, P2: 333, B: 91 };
  const legs: [string, string][] = [
    ['A', 'P1'],
    ['P1', 'P2'],
    ['P2', 'B'],
  ];
  const all = new Map(Object.entries(P).map(([id, p]) => [id, { ...p }] as const));
  const net = ring(P, Z, ['A', 'P1', 'P2', 'B'], legs);

  it('hibátlan mérésből a szögzáró hiba nulla, és az előzetes koordináták pontosak', () => {
    const r = traversePreview(['A', 'P1', 'P2', 'B'], all, net);
    expect(r.angularClosure).not.toBeNull();
    expect(r.angularClosure!).toBeCloseTo(0, 6);
    for (const id of ['A', 'P1', 'P2', 'B']) {
      const p = r.points.find((q) => q.id === id)!;
      expect(p.y).toBeCloseTo(P[id]!.y, 6);
      expect(p.x).toBeCloseTo(P[id]!.x, 6);
    }
    expect(r.linear!.length).toBeCloseTo(0, 6);
  });

  it('a szögzáró hibát a törésszögek között elosztva az irányszög a végén pontos lesz', () => {
    // A P1-en mért előreirányba szándékos hibát teszünk (+0,005° = +18″).
    const bad: NetStation[] = net.map((s) =>
      s.id === 'P1'
        ? { ...s, observations: s.observations.map((o) => (o.target === 'P2' ? { ...o, hz: o.hz + 0.005 } : o)) }
        : s,
    );
    const r = traversePreview(['A', 'P1', 'P2', 'B'], all, bad);
    expect(r.angularClosure).toBeCloseTo(-18, 3);
    // A javított utolsó szakasz irányszöge megegyezik az ismert P2→B iránnyal.
    const lastAz = r.vertices[2]!.azimuth!;
    expect(Math.abs(lastAz - azimuthDeg(P['P2']!, P['B']!))).toBeLessThan(1e-6);
    expect(r.sections[0]!.footer!.join(' ')).toContain('Szögzáró hiba: -18″');
  });

  it('a vonalas záróhibát az oldalhosszak arányában osztja el', () => {
    const short: NetStation[] = net.map((s) =>
      s.id === 'A' ? { ...s, observations: s.observations.map((o) => ({ ...o, distance: (o.distance ?? 0) + 0.4 })) } : s,
    );
    const r = traversePreview(['A', 'P1', 'P2', 'B'], all, short);
    expect(r.linear!.length).toBeCloseTo(0.4, 3);
    // A zárópont pontosan az ismert B-re kerül.
    expect(r.points[3]!.y).toBeCloseTo(P['B']!.y, 6);
    expect(r.points[3]!.x).toBeCloseTo(P['B']!.x, 6);
  });

  it('hiányzó távolságra és kezdő koordináta nélkül hibát jelez', () => {
    const noDist: NetStation[] = net.map((s) =>
      s.id === 'A' || s.id === 'P1'
        ? {
            ...s,
            observations: s.observations.map((o) =>
              (s.id === 'A' && o.target === 'P1') || (s.id === 'P1' && o.target === 'A') ? { ...o, distance: null } : o,
            ),
          }
        : s,
    );
    expect(() => traversePreview(['A', 'P1', 'P2', 'B'], all, noDist)).toThrow(/nincs mért távolság/);
    expect(() => traversePreview(['A', 'P1', 'P2', 'B'], new Map(), net)).toThrow(CalcError);
  });
});

describe('zárt poligon (súgó 55. o.)', () => {
  const P: Record<string, { y: number; x: number }> = {
    A: { y: 0, x: 0 },
    B: { y: 100, x: 0 },
    C: { y: 100, x: 100 },
    D: { y: 0, x: 100 },
  };
  const Z: Record<string, number> = { A: 0, B: 40, C: 90, D: 150 };
  const ids = ['A', 'B', 'C', 'D'];
  const square = ring(
    P,
    Z,
    ids,
    [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'A'],
    ],
  );
  const knownA = new Map([['A', { y: 5000, x: 8000 }]]);

  it('a törésszögek összegéből adja a szögzáróhibát', () => {
    const r = traversePreview(['A', 'B', 'C', 'D', 'A'], knownA, square);
    expect(r.closed).toBe(true);
    expect(r.linear).not.toBeNull();
    // A mérés hibátlan → a szögzáró hiba és a vonalas záróhiba nulla.
    expect(r.angularClosure).toBeCloseTo(0, 3);
    expect(r.linear!.length).toBeCloseTo(0, 6);
    expect(r.vertices).toHaveLength(4);
    expect(r.vertices.every((v) => v.back !== null && v.forward !== null && v.dHz !== null)).toBe(true);
    // A körbejárás visszatér a kezdőpontra.
    const last = r.points[r.points.length - 1]!;
    expect(last.id).toBe('A');
    expect(last.y).toBeCloseTo(5000, 6);
    expect(last.x).toBeCloseTo(8000, 6);
    expect(r.sections[0]!.title).toBe('Zárt poligon előírása');
  });

  it('szögzáróhiba esetén a törésszögeket elosztja, és a poligon záródik', () => {
    const bad: NetStation[] = square.map((s) =>
      s.id === 'B' ? { ...s, observations: s.observations.map((o) => (o.target === 'C' ? { ...o, hz: o.hz + 0.01 } : o)) } : s,
    );
    const r = traversePreview(['A', 'B', 'C', 'D', 'A'], knownA, bad);
    expect(r.angularClosure).toBeCloseTo(-36, 3);
    // Az elosztás után a poligon visszazár a kezdőpontra.
    expect(r.linear!.length).toBeLessThan(0.05);
    const last = r.points[r.points.length - 1]!;
    expect(last.y).toBeCloseTo(5000, 3);
    expect(last.x).toBeCloseTo(8000, 3);
    expect(r.sections[0]!.footer!.join(' ')).toContain('elméletileg 360°');
  });

  it('ismert koordináta nélkül is megrajzolható (tájékozatlan poligon)', () => {
    const r = traversePreview(['A', 'B', 'C', 'D', 'A'], new Map(), square);
    expect(r.closed).toBe(true);
    expect(r.linear).toBeNull();
    expect(r.sections[0]!.footer!.join(' ')).toContain('tájékozatlan');
    expect(r.vertices[0]!.length).toBeCloseTo(100, 6);
  });

  it('a pontsorrend szövegből is beolvasható', () => {
    expect(parseTraverseOrder('541017D 2 3 541440')).toEqual(['541017D', '2', '3', '541440']);
    expect(parseTraverseOrder('541017D, 2;3\n541440')).toEqual(['541017D', '2', '3', '541440']);
    expect(parseTraverseOrder('   ')).toEqual([]);
  });
});
