import { describe, expect, it } from 'vitest';
import { buildSketch, sketchEdges, sketchPoints, type SketchPoint } from '../src/core/network/sketch';
import { parseGmj, parseNetworkCoordinates } from '../src/core/network/gmj';
import type { NetObservation, NetStation } from '../src/core/network/types';
import { ISZKA_COORDINATES, ISZKA_GMJ } from '../src/network-sample';

const obs = (target: string, distance: number | null): NetObservation => ({
  target,
  hz: 0,
  zi: null,
  slope: null,
  horizontal: null,
  dM: null,
  targetHeight: null,
  distance,
});
const station = (id: string, observations: NetObservation[]): NetStation => ({ id, instrumentHeight: null, observations });

/** Kézzel felépített kis hálózat: A–B távolság, B–C csak irány, A ismert. */
const stations = [station('A', [obs('B', 141.4214)]), station('B', [obs('A', 141.4214), obs('C', null)])];
const points: SketchPoint[] = [
  { id: 'A', y: 0, x: 0, known: true },
  { id: 'B', y: 100, x: 100 },
  { id: 'C', y: 40, x: 220 },
];

describe('mérési vázlat (súgó 52. o.)', () => {
  it('önálló, beágyazható SVG-t ad (nincs külső hivatkozás és nincs szkript)', () => {
    const svg = buildSketch(points, stations);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toMatch(/<script|<image|href=|xlink/i);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('tartalmazza a pontokat (ismert ■, új ●), a távolságokat és az irányokat', () => {
    const svg = buildSketch(points, stations);
    expect(svg).toContain('class="sk-known"'); // A ismert
    expect(svg).toContain('class="sk-new"'); // B, C új
    expect(svg).toContain('class="sk-dist"'); // A–B mért távolság
    expect(svg).toContain('class="sk-ray"'); // B–C csak irány
    expect(svg).toContain('class="sk-id"');
    expect(svg).toContain('class="sk-north"');
    expect(svg).toMatch(/\d+ m<\/text>/);
  });

  it('a mért távolság felirata és a kétirányú jelölés megjelenik', () => {
    const svg = buildSketch(points, stations);
    expect(svg).toContain('141.42');
    expect(svg).toContain('↔');
    // A távolság nélküli kapcsolat nem kap feliratot: „C” távolságfelirata nincs.
    expect(svg.match(/sk-mtext/g)!.length).toBeGreaterThan(0);
  });

  it('minden megjelenített pont felirata szerepel', () => {
    const svg = buildSketch(points, stations);
    for (const id of ['A', 'B', 'C']) expect(svg).toContain(`>${id}</text>`);
  });

  it('az ISZKA-minta hálózata is megrajzolható', () => {
    const known = parseNetworkCoordinates(ISZKA_COORDINATES);
    const parsed = parseGmj(ISZKA_GMJ);
    const edges = sketchEdges(parsed.stations);
    const ids = new Set([
      ...known.points.map((p) => p.id),
      ...edges.flatMap((e) => [e.from, e.to]),
    ]);
    const all: SketchPoint[] = [...ids].map((id, i) => ({ id, y: i * 100, x: (i % 5) * 90, known: false }));
    const svg = buildSketch(all, parsed.stations);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.length).toBeGreaterThan(500);
  });

  it('az oda-vissza mért távolság egyszer, kétirányúként jelenik meg', () => {
    // A minta oda-vissza mért élei (a GeoCalc GMJ „Tf”/„Tv” mezői).
    const parsed = parseGmj(ISZKA_GMJ);
    const edges = sketchEdges(parsed.stations);
    const keys = edges.map((e) => `${e.from}|${e.to}`);
    expect(new Set(keys).size).toBe(edges.length);
    expect(edges.some((e) => e.bothWays)).toBe(true);
    expect(edges.some((e) => e.distance !== null)).toBe(true);
  });

  it('mérés nélkül üres (a hívó ilyenkor nem rajzol)', () => {
    expect(buildSketch([], [])).toBe('');
    expect(buildSketch([{ id: '1', y: 0, x: 0 }], [])).toBe('');
  });

  it('a pontszámot és a feliratot kimenti (nincs nyers jel a feliratban)', () => {
    const s = [station('<a>', [obs('"b"', 14.1421)])];
    const svg = buildSketch([{ id: '<a>', y: 0, x: 0, known: true }, { id: '"b"', y: 10, x: 10 }], s);
    expect(svg).toContain('&lt;a&gt;');
    expect(svg).toContain('&quot;b&quot;');
    expect(svg).not.toContain('<a>');
  });

  it('a sketchPoints az ismert jelölést az ismert pontok halmazából veszi', () => {
    const pts = sketchPoints(
      [
        { id: '1', y: 0, x: 0, m: null, mark: '' },
        { id: '2', y: 1, x: 1, m: null, mark: '' },
      ],
      new Set(['1']),
    );
    expect(pts.map((p) => p.known)).toEqual([true, false]);
  });
});
