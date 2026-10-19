import { describe, expect, it } from 'vitest';
import { CalcError } from '../src/core/errors';
import { azimuthBetween, datumSection, placeFreeNetwork, rotationForAzimuth, type DatumPoint } from '../src/core/network/datum';
import { adjustHorizontal } from '../src/core/network/horizontal';
import { DEFAULT_HORIZONTAL_SETTINGS, type NetObservation, type NetPoint, type NetStation } from '../src/core/network/types';

const DEG = Math.PI / 180;
const norm = (d: number) => ((d % 360) + 360) % 360;
const dist = (a: DatumPoint, b: DatumPoint) => Math.hypot(a.y - b.y, a.x - b.x);

/** Egy „valódi” háromszöghálózat, minden pont álláspont, minden irány és távolság mérve. */
const TRUE: Record<string, DatumPoint> = {
  '1': { id: '1', y: 0, x: 0 },
  '2': { id: '2', y: 1000, x: 0 },
  '3': { id: '3', y: 400, x: 900 },
};
const Z: Record<string, number> = { '1': 100, '2': 200, '3': 300 };

const azimuthDegOf = (a: DatumPoint, b: DatumPoint) => norm(Math.atan2(b.y - a.y, b.x - a.x) / DEG);

function network(withDistance = true): NetStation[] {
  return ['1', '2', '3'].map((id) => ({
    id,
    instrumentHeight: null,
    observations: ['1', '2', '3']
      .filter((t) => t !== id)
      .map<NetObservation>((t) => ({
        target: t,
        hz: norm(azimuthDegOf(TRUE[id]!, TRUE[t]!) - Z[id]!),
        zi: null,
        slope: null,
        horizontal: null,
        dM: null,
        targetHeight: null,
        distance: withDistance ? dist(TRUE[id]!, TRUE[t]!) : null,
      })),
  }));
}

const SETTINGS = { ...DEFAULT_HORIZONTAL_SETTINGS, grossDirection: 3600, grossDistance: 5, averageDistance: 1000 };

/** Közelítő koordináták: a valódi pontok eltolva és kicsit elrontva. */
const approx = (dy = 5000, dx = -3000): NetPoint[] =>
  ['1', '2', '3'].map((id) => ({ id, y: TRUE[id]!.y + dy + 0.1, x: TRUE[id]!.x + dx - 0.08, m: null, mark: '' }));

const side = (r: { points: { id: string; y: number; x: number }[] }, a: string, b: string) =>
  dist(r.points.find((p) => p.id === a)! as DatumPoint, r.points.find((p) => p.id === b)! as DatumPoint);

describe('önálló vízszintes hálózat (súgó 55. o.)', () => {
  const r = adjustHorizontal(approx(), network(), { ...SETTINGS, free: true });

  it('az adott koordinátákat is ismeretlennek veszi, és belső megkötéssel egyenlít ki', () => {
    expect(r.counts.known).toBe(0);
    expect(r.counts.new).toBe(3);
    expect(r.counts.directions).toBe(6);
    expect(r.counts.distances).toBe(6);
    // 12 mérés, 9 ismeretlen, 3 dátum-szabadsági fok → 6 fölös mérés.
    expect(r.counts.redundancy).toBe(6);
    expect(r.sections.some((s) => s.kind === 'net-datum')).toBe(true);
    expect(r.sections.some((s) => s.kind === 'net-known')).toBe(false);
  });

  it('a hálózat alakját (a pontok közti távolságokat) pontosan visszaadja', () => {
    expect(side(r, '1', '2')).toBeCloseTo(1000, 6);
    expect(side(r, '2', '3')).toBeCloseTo(dist(TRUE['2']!, TRUE['3']!), 6);
    expect(side(r, '1', '3')).toBeCloseTo(dist(TRUE['1']!, TRUE['3']!), 6);
  });

  it('a szabad hálózat a közelítő koordináták súlypontjában marad', () => {
    const a = approx();
    const bary = (list: { y: number; x: number }[]) => ({
      y: list.reduce((s, p) => s + p.y, 0) / list.length,
      x: list.reduce((s, p) => s + p.x, 0) / list.length,
    });
    const b0 = bary(a);
    const b1 = bary(r.points);
    expect(b1.y).toBeCloseTo(b0.y, 6);
    expect(b1.x).toBeCloseTo(b0.x, 6);
  });

  it('az eredmény független a közelítő koordináták megválasztásától (eltolás)', () => {
    const other = adjustHorizontal(approx(-12000, 8000), network(), { ...SETTINGS, free: true });
    expect(side(other, '1', '2')).toBeCloseTo(1000, 6);
    expect(side(other, '1', '3')).toBeCloseTo(side(r, '1', '3'), 6);
    // Az alak ugyanaz: a pontok közti vektorok hossza és szöge is.
    const v = (res: typeof r, a: string, b: string) => {
      const pa = res.points.find((p) => p.id === a)!;
      const pb = res.points.find((p) => p.id === b)!;
      return { dy: pb.y - pa.y, dx: pb.x - pa.x };
    };
    const u = v(r, '1', '2');
    const w = v(other, '1', '2');
    expect(Math.atan2(w.dy, w.dx) - Math.atan2(u.dy, u.dx)).toBeCloseTo(0, 9);
  });

  it('az elforgatott közelítő koordinátákból ugyanaz az alak adódik', () => {
    const alpha = 30 * DEG;
    const c = { y: 0, x: 0 };
    const rotated = approx().map((p) => {
      const vy = p.y - 5000 + c.y;
      const vx = p.x + 3000 + c.x;
      const rr = Math.hypot(vy, vx);
      const phi = Math.atan2(vy, vx);
      return { ...p, y: c.y + rr * Math.sin(phi + alpha), x: c.x + rr * Math.cos(phi + alpha) };
    });
    const rr = adjustHorizontal(rotated, network(), { ...SETTINGS, free: true });
    expect(side(rr, '1', '2')).toBeCloseTo(1000, 6);
    expect(side(rr, '2', '3')).toBeCloseTo(dist(TRUE['2']!, TRUE['3']!), 6);
  });

  it('csak irányok mérésekor a méretarány is dátum-szabadsági fok (4)', () => {
    const d = adjustHorizontal(approx(), network(false), { ...SETTINGS, free: true });
    expect(d.counts.distances).toBe(0);
    // 6 irány, 9 ismeretlen, 4 dátum-szabadsági fok → 1 fölös mérés.
    expect(d.counts.redundancy).toBe(1);
    const angle = (res: typeof d, a: string, b: string, c2: string) => {
      const p = (id: string) => res.points.find((x) => x.id === id)!;
      const a1 = Math.atan2(p(b).y - p(a).y, p(b).x - p(a).x);
      const a2 = Math.atan2(p(c2).y - p(a).y, p(c2).x - p(a).x);
      return ((a2 - a1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    };
    const angleTrue = (a: string, b: string, c2: string) => {
      const a1 = Math.atan2(TRUE[b]!.y - TRUE[a]!.y, TRUE[b]!.x - TRUE[a]!.x);
      const a2 = Math.atan2(TRUE[c2]!.y - TRUE[a]!.y, TRUE[c2]!.x - TRUE[a]!.x);
      return ((a2 - a1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    };
    expect(angle(d, '1', '2', '3')).toBeCloseTo(angleTrue('1', '2', '3'), 8);
  });

  it('beillesztett hálózatnál (free nélkül) az adott pontok rögzítettek maradnak', () => {
    const f = adjustHorizontal(approx(), network(), SETTINGS);
    expect(f.counts.known).toBe(3);
    expect(f.counts.new).toBe(0);
    expect(f.sections.some((s) => s.kind === 'net-known')).toBe(true);
    // Az adott koordináták nem változnak.
    for (const p of f.points) expect(p.dy).toBeCloseTo(0, 9);
  });
});

describe('hálózati dátum – eltolás és forgatás', () => {
  const pts: DatumPoint[] = [
    { id: '1', y: 1000, x: 2000 },
    { id: '2', y: 1000, x: 3000 },
    { id: '3', y: 2000, x: 2000 },
  ];

  it('a horgonypont a kívánt koordinátára kerül, a hálózat merev marad', () => {
    const r = placeFreeNetwork({ points: pts, anchorId: '2', toY: 611000, toX: 215000, rotation: 0 });
    const a = r.points.find((p) => p.id === '2')!;
    expect(a.y).toBeCloseTo(611000, 9);
    expect(a.x).toBeCloseTo(215000, 9);
    expect(r.dy).toBeCloseTo(610000, 9);
    expect(r.dx).toBeCloseTo(212000, 9);
    const ap = r.points.find((x) => x.id === '2')!;
    const aq = pts.find((x) => x.id === '2')!;
    for (const p of r.points) {
      const q = pts.find((x) => x.id === p.id)!;
      expect(dist(p, ap)).toBeCloseTo(dist(q, aq), 6);
    }
  });

  it('a forgatás az óramutató járásával megegyezően számol', () => {
    const r = placeFreeNetwork({ points: pts, anchorId: '1', toY: 0, toX: 0, rotation: 90 });
    // Az 1→2 irány eredetileg északi (X növekvő). +90°-os (óramutató szerinti) forgatás után keleti lesz.
    const p2 = r.points.find((p) => p.id === '2')!;
    expect(p2.y).toBeCloseTo(1000, 6);
    expect(p2.x).toBeCloseTo(0, 6);
    const p3 = r.points.find((p) => p.id === '3')!;
    expect(p3.y).toBeCloseTo(0, 6);
    expect(p3.x).toBeCloseTo(-1000, 6);
  });

  it('a forgatás a második pont és a kívánt irányszög alapján is megadható', () => {
    const rot = rotationForAzimuth(pts, '1', '2', 90);
    expect(rot).toBeCloseTo(90, 9);
    const r = placeFreeNetwork({ points: pts, anchorId: '1', toY: 0, toX: 0, rotation: rot });
    expect(azimuthBetween(r.points.find((p) => p.id === '1')!, r.points.find((p) => p.id === '2')!)).toBeCloseTo(90, 6);
  });

  it('ismertelen horgonypontra és hiányzó célkoordinátára hibát jelez', () => {
    expect(() => placeFreeNetwork({ points: pts, anchorId: 'X', toY: 0, toX: 0, rotation: 0 })).toThrow(/nincs a kiegyenlített/);
    expect(() => placeFreeNetwork({ points: pts, anchorId: '1', toY: NaN, toX: 0, rotation: 0 })).toThrow(CalcError);
    expect(() => rotationForAzimuth(pts, '1', 'X', 0)).toThrow(/nincs a kiegyenlített/);
  });

  it('a jegyzőkönyv-szakasz a régi és az új koordinátákat is közli', () => {
    const result = placeFreeNetwork({ points: pts, anchorId: '1', toY: 500, toX: 600, rotation: 0 });
    const s = datumSection({ points: pts, anchorId: '1', toY: 500, toX: 600, rotation: 0 }, result);
    expect(s.kind).toBe('net-placed');
    expect(s.columns).toEqual(['Pontszám', 'Y', 'X', 'ΔY [m]', 'ΔX [m]']);
    expect(s.rows.map((x) => x.cells[0])).toEqual(['1', '2', '3']);
    expect(s.rows[0]!.cells.slice(1, 3)).toEqual(['500.000', '600.000']);
    expect(s.rows[0]!.cells.slice(3)).toEqual(['-500.000', '-1400.000']);
    expect(s.footer!.join(' ')).toContain('Horgonypont: 1');
  });
});
