import { DEG, normDeg } from './angle';
import { CalcError } from './errors';

/** Síkbeli pont. A GeoCalc megállapodása szerint Y = kelet, X = észak, az irányszög északról az óramutató járásával megegyezően nő. */
export interface Pt {
  y: number;
  x: number;
}

export function azimuthDeg(from: Pt, to: Pt): number {
  return normDeg(Math.atan2(to.y - from.y, to.x - from.x) / DEG);
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.y - a.y, b.x - a.x);
}

export function polar(from: Pt, azDeg: number, t: number): Pt {
  const a = azDeg * DEG;
  return { y: from.y + t * Math.sin(a), x: from.x + t * Math.cos(a) };
}

/** Az AB és CD pontpárok által meghatározott két egyenes metszéspontja. */
export function intersectLines(a: Pt, b: Pt, c: Pt, d: Pt): Pt {
  const r = { y: b.y - a.y, x: b.x - a.x };
  const s = { y: d.y - c.y, x: d.x - c.x };
  const det = r.y * s.x - r.x * s.y;
  const scale = Math.hypot(r.y, r.x) * Math.hypot(s.y, s.x);
  if (scale === 0) throw new CalcError('Az egyik egyenest meghatározó két pont egybeesik.');
  if (Math.abs(det) < 1e-12 * scale) throw new CalcError('A két egyenes párhuzamos, nincs metszéspont.');
  const t = ((c.y - a.y) * s.x - (c.x - a.x) * s.y) / det;
  return { y: a.y + t * r.y, x: a.x + t * r.x };
}

export interface Ray {
  from: Pt;
  azDeg: number;
}

/**
 * Félegyenesek (irányok) metszéspontja. Két irányra a pontos metszés, kettőnél többre
 * a legkisebb négyzetösszegű (a merőleges távolságok négyzetösszegét minimalizáló) pont.
 */
export function intersectRays(rays: Ray[]): Pt {
  if (rays.length < 2) throw new CalcError('Legalább két irány szükséges.');
  let a00 = 0;
  let a01 = 0;
  let a11 = 0;
  let b0 = 0;
  let b1 = 0;
  for (const r of rays) {
    const a = r.azDeg * DEG;
    const ny = Math.cos(a);
    const nx = -Math.sin(a);
    const dot = ny * r.from.y + nx * r.from.x;
    a00 += ny * ny;
    a01 += ny * nx;
    a11 += nx * nx;
    b0 += ny * dot;
    b1 += nx * dot;
  }
  const det = a00 * a11 - a01 * a01;
  if (Math.abs(det) < 1e-9) throw new CalcError('Az irányok párhuzamosak, nincs metszéspont.');
  return { y: (b0 * a11 - b1 * a01) / det, x: (a00 * b1 - a01 * b0) / det };
}

/**
 * Két kör metszéspontjai. A visszaadott pontok a P1→P2 egyeneshez képest:
 * `[0]` balra (az óramutató járásával ellentétes oldal, cross > 0),
 * `[1]` jobbra (az óramutató járásával megegyező oldal, cross < 0).
 * A `cross(u, v) = u.y·v.x − u.x·v.y` a GeoCalc (Y = kelet, X = észak) síkjában.
 */
export function intersectCircles(a: Pt, ra: number, b: Pt, rb: number): [Pt, Pt] {
  const d = distance(a, b);
  if (d === 0) throw new CalcError('A két ismert pont egybeesik.');
  if (ra <= 0 || rb <= 0) throw new CalcError('A távolságok pozitívak kell legyenek.');
  if (d > ra + rb + 1e-9 || d < Math.abs(ra - rb) - 1e-9) {
    throw new CalcError('A megadott távolságokkal a két kör nem metszi egymást.');
  }
  const uy = (b.y - a.y) / d;
  const ux = (b.x - a.x) / d;
  const t = (ra * ra - rb * rb + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - t * t));
  const by = a.y + t * uy;
  const bx = a.x + t * ux;
  // Az n = (−ux, uy) merőlegesre cross(u, n) = +1, ezért a +h·n oldal a bal (ellenkező irányú).
  const ny = -ux;
  const nx = uy;
  return [
    { y: by + h * ny, x: bx + h * nx },
    { y: by - h * ny, x: bx - h * nx },
  ];
}

/** Sokszög területe (Gauss-féle trapézképlet, az első ponthoz eltolva a kerekítési hiba csökkentésére). */
export function polygonArea(pts: Pt[]): number {
  const o = pts[0];
  if (!o) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    sum += (p.y - o.y) * (q.x - o.x) - (q.y - o.y) * (p.x - o.x);
  }
  return Math.abs(sum) / 2;
}

/** A pont a sokszögön belül van-e (sugárkövetés). */
export function pointInRing(p: Pt, ring: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.x > p.x !== b.x > p.x && p.y < ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x) + a.y) c = !c;
  }
  return c;
}

/** Kitűzési méretek: a K→V alapvonalra vonatkozó abszcissza (a) és ordináta (b, balra pozitív). */
export function baseOffsets(k: Pt, v: Pt, p: Pt): { a: number; b: number } {
  const t = distance(k, v);
  if (t === 0) throw new CalcError('A kezdő- és a végpont egybeesik.');
  const uy = (v.y - k.y) / t;
  const ux = (v.x - k.x) / t;
  const dy = p.y - k.y;
  const dx = p.x - k.x;
  return { a: dy * uy + dx * ux, b: dx * uy - dy * ux };
}
