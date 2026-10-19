/**
 * Mérési vázlat (súgó 52. o.): a hálózat mérethelyes rajza.
 *
 * A vázlat a pontokat, az irányokat és a távolságokat tartalmazza. A koordinátákból számolt
 * helyzetet képezi le (Y jobbra, X felfelé, azaz észak felül), ezért a rajz méretarányos.
 * A kimenet önálló, beágyazható SVG (nincs külső hivatkozás), így a nyomtatott jegyzőkönyvben és
 * az önálló HTML-ben is megjelenik.
 */

import { fix } from '../format';
import type { NetPoint, NetStation } from './types';

export interface SketchOptions {
  width?: number;
  height?: number;
  /** A mért távolságok feliratai. */
  showDistances?: boolean;
  /** A pontszámok feliratai. */
  showIds?: boolean;
  /** Az irányok hossza képpontban (a csak irányként mért pontok felé). */
  rayLength?: number;
}

const W = 660;
const H = 480;
const PAD = 46;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Egy ismert vagy számított pont a vázlaton. */
export interface SketchPoint {
  id: string;
  y: number;
  x: number;
  /** Ismert (adott) pont: tömör jelölés; új pont: üres. */
  known?: boolean;
}

interface Edge {
  from: string;
  to: string;
  /** Mért (redukált) vízszintes távolság [m]; null, ha csak irányt mértek. */
  distance: number | null;
  /** Kétirányú (oda-vissza) mérés. */
  bothWays: boolean;
}

/** A mérésekből páronként összevont élek (oda-vissza mérés egyszer szerepel). */
export function sketchEdges(stations: NetStation[]): Edge[] {
  const byKey = new Map<string, Edge>();
  for (const s of stations) {
    for (const o of s.observations) {
      const a = s.id;
      const b = o.target;
      if (a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const d = o.distance ?? o.horizontal ?? o.slope;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { from: a, to: b, distance: d, bothWays: false });
      } else {
        if (prev.distance === null && d !== null) {
          prev.distance = d;
          prev.from = a;
          prev.to = b;
        }
        if (prev.from === b && prev.to === a) prev.bothWays = true;
      }
    }
  }
  return [...byKey.values()];
}

/** A mérési vázlat SVG-je. Üres bemenetre üres szöveget ad (a hívó ilyenkor nem rajzol). */
export function buildSketch(points: SketchPoint[], stations: NetStation[], options: SketchOptions = {}): string {
  const width = options.width ?? W;
  const height = options.height ?? H;
  const showDist = options.showDistances ?? true;
  const showIds = options.showIds ?? true;
  const rayLength = options.rayLength ?? 30;

  const byId = new Map(points.map((p) => [p.id, p]));
  const edges = sketchEdges(stations);
  if (edges.length === 0) return '';

  const involved = new Set<string>();
  for (const e of edges) {
    involved.add(e.from);
    involved.add(e.to);
  }
  const used = points.filter((p) => involved.has(p.id));
  if (used.length === 0) return '';

  const ys = used.map((p) => p.y);
  const xs = used.map((p) => p.x);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spanY = Math.max(maxY - minY, 1e-6);
  const spanX = Math.max(maxX - minX, 1e-6);
  const scale = Math.min((width - 2 * PAD) / spanY, (height - 2 * PAD) / spanX);
  const cy = (minY + maxY) / 2;
  const cx = (minX + maxX) / 2;
  const sx = (p: SketchPoint) => width / 2 + (p.y - cy) * scale;
  const sy = (p: SketchPoint) => height / 2 - (p.x - cx) * scale; // észak felfelé

  const parts: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, cls: string) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls}"/>`;

  // Távolságok (folytonos vonal) és irányok (rövid szakasz).
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const x1 = sx(a);
    const y1 = sy(a);
    const x2 = sx(b);
    const y2 = sy(b);
    if (e.distance !== null) {
      parts.push(line(x1, y1, x2, y2, 'sk-dist'));
      if (showDist) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const label = `${fix(e.distance, 2)}${e.bothWays ? ' ↔' : ''}`;
        parts.push(
          `<text x="${mx.toFixed(1)}" y="${(my - 3).toFixed(1)}" class="sk-mtext">${esc(label)}</text>`,
        );
      }
    } else {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const k = Math.min(1, rayLength / len);
      parts.push(line(x1, y1, x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, 'sk-ray'));
    }
  }

  // Pontok.
  for (const p of used) {
    const x = sx(p);
    const y = sy(p);
    parts.push(
      p.known
        ? `<rect x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="8" height="8" class="sk-known"/>`
        : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" class="sk-new"/>`,
    );
    if (showIds) parts.push(`<text x="${(x + 7).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="sk-id">${esc(p.id)}</text>`);
  }

  // Észak-nyíl és lépték.
  const nx = width - 30;
  const ny = 34;
  parts.push(
    `<path d="M${nx} ${ny - 16} L${nx - 6} ${ny + 6} L${nx} ${ny + 1} L${nx + 6} ${ny + 6} Z" class="sk-north"/>`,
    `<text x="${nx}" y="${ny + 20}" class="sk-nlabel">É</text>`,
  );
  const barMeters = niceLength(scale, width - 2 * PAD);
  const barPx = barMeters * scale;
  if (barPx >= 24 && barPx <= width - 2 * PAD) {
    const bx = 24;
    const by = height - 24;
    parts.push(
      line(bx, by, bx + barPx, by, 'sk-scale'),
      `<text x="${(bx + barPx / 2).toFixed(1)}" y="${(by - 6).toFixed(1)}" class="sk-mtext">${fix(barMeters, 0)} m</text>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="sketch-svg" role="img" ` +
    `aria-label="Mérési vázlat">` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" class="sk-frame"/>` +
    parts.join('') +
    `</svg>`
  );
}

/** Kerek lépték-hossz (1, 2 vagy 5 × 10ⁿ méter), amely kb. 60–160 képpont közé esik. */
function niceLength(scale: number, maxPx: number): number {
  const targetMeters = 110 / scale;
  const pow = 10 ** Math.floor(Math.log10(targetMeters));
  let meters = 10 * pow;
  for (const m of [1, 2, 5]) {
    if (m * pow >= targetMeters) {
      meters = m * pow;
      break;
    }
  }
  while (meters * scale > maxPx && meters > 1e-3) meters /= 10;
  return meters;
}

/** A hálózati pontokból vázlatpontok (az ismert pontok tömören jelennek meg). */
export function sketchPoints(netPoints: NetPoint[], knownIds: Set<string>): SketchPoint[] {
  return netPoints.map((p) => ({ id: p.id, y: p.y, x: p.x, known: knownIds.has(p.id) }));
}
