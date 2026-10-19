/**
 * Hálózati dátum – az önálló (szabadon kiegyenlített) hálózat elhelyezése és tájékozása
 * (súgó 55. o.: „A hálózati dátum önálló hálózatok elhelyezésével és tájékozásával kapcsolatos
 * számítások elvégzését jelenti.”).
 *
 * A szabad kiegyenlítés a hálózat alakját adja; a koordináták a közelítő értékek súlypontjában,
 * irányzatában és nagyságában maradnak. A végleges helyzetet egy horgonypont kívánt koordinátáinak
 * megadása (eltolás) és a hálózat elforgatása adja. A forgatás az óramutató járásával megegyező
 * irányban értendő (a GeoCalc síkjában Y = kelet, X = észak).
 */

import { DEG, normDeg } from '../angle';
import { CalcError } from '../errors';
import { fix } from '../format';
import type { Row, Section } from '../types';

export interface DatumPoint {
  id: string;
  y: number;
  x: number;
}

export interface DatumInput {
  points: DatumPoint[];
  /** A horgonypont száma: ide kerül a hálózat. */
  anchorId: string;
  /** A horgonypont kívánt Y koordinátája [m]. */
  toY: number;
  /** A horgonypont kívánt X koordinátája [m]. */
  toX: number;
  /** A hálózat forgatása [fok] az óramutató járásával megegyezően (előjeles). */
  rotation: number;
}

export interface DatumResult {
  points: DatumPoint[];
  /** A horgonypontra alkalmazott eltolás [m]. */
  dy: number;
  dx: number;
  /** A hálózat forgatása [fok]. */
  rotation: number;
  anchorId: string;
}

/** Két pont irányszöge [fok], északtól az óramutató járásával megegyezően. */
export function azimuthBetween(a: DatumPoint, b: DatumPoint): number {
  return normDeg(Math.atan2(b.y - a.y, b.x - a.x) / DEG);
}

/** A hálózat elforgatása, hogy a horgonypont→második pont iránya a kívánt irányszöget adja. */
export function rotationForAzimuth(points: DatumPoint[], anchorId: string, secondId: string, azimuth: number): number {
  const a = points.find((p) => p.id === anchorId);
  const b = points.find((p) => p.id === secondId);
  if (!a || !b) throw new CalcError('A hálózati dátumhoz megadott pont nincs a kiegyenlített hálózatban.');
  const current = azimuthBetween(a, b);
  return normDeg(azimuth - current + 180) - 180;
}

/** A hálózat elhelyezése: a horgonypont a megadott koordinátára kerül, a hálózat elfordul. */
export function placeFreeNetwork(input: DatumInput): DatumResult {
  const a = input.points.find((p) => p.id === input.anchorId);
  if (!a) throw new CalcError(`A(z) ${input.anchorId} horgonypont nincs a kiegyenlített hálózatban.`);
  if (!Number.isFinite(input.toY) || !Number.isFinite(input.toX)) {
    throw new CalcError('A horgonypont kívánt koordinátáit meg kell adni.');
  }
  const alpha = input.rotation * DEG;
  return {
    anchorId: input.anchorId,
    dy: input.toY - a.y,
    dx: input.toX - a.x,
    rotation: input.rotation,
    points: input.points.map((p) => {
      const vy = p.y - a.y;
      const vx = p.x - a.x;
      const r = Math.hypot(vy, vx);
      const phi = Math.atan2(vy, vx);
      return { id: p.id, y: input.toY + r * Math.sin(phi + alpha), x: input.toX + r * Math.cos(phi + alpha) };
    }),
  };
}

const c3 = (n: number) => fix(n, 3);

/** Az elhelyezés jegyzőkönyv-szakasza (a kiegyenlített és az elhelyezett koordinátákkal). */
export function datumSection(input: DatumInput, result: DatumResult): Section {
  const before = new Map(input.points.map((p) => [p.id, p] as const));
  const rows: Row[] = result.points.map((p) => {
    const b = before.get(p.id)!;
    return { cells: [p.id, c3(p.y), c3(p.x), c3(p.y - b.y), c3(p.x - b.x)], role: 'result' };
  });
  return {
    kind: 'net-placed',
    title: 'A hálózat elhelyezése (hálózati dátum)',
    columns: ['Pontszám', 'Y', 'X', 'ΔY [m]', 'ΔX [m]'],
    rows,
    footer: [
      `Horgonypont: ${result.anchorId}; eltolás: ΔY = ${c3(result.dy)} m, ΔX = ${c3(result.dx)} m.`,
      `Forgatás: ${c3(result.rotation)}° az óramutató járásával megegyezően.`,
      'A szabad kiegyenlítésből származó középhibák az eltolástól és a forgatástól nem változnak.',
    ],
  };
}
