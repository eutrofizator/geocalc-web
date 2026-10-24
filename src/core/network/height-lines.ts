import { CalcError } from '../errors';
import { fix } from '../format';
import type { Row, Section } from '../types';
import type { Pt } from './preliminary';
import type { NetStation } from './types';
import { coordinateHeightDifference, trigonometricHeightDifference } from './vertical';

/**
 * Trigonometriai magassági vonalak számítása (súgó 53. o.): ismert magasságú pontok között vezetett
 * vonalak magassági záróhibája, ellenőrzésként vagy durva hibák keresésére (cm élességgel). Zárt
 * poligonnál a végpont a kezdőpont. A pontok magasságát a záróhiba távolsággal arányos elosztásával
 * számolja; adott magasságú pont nem íródik felül.
 *
 * A hibahatár a súgó szerint 15·√t mm (t a vonal hossza km-ben; 10 m-es irányra 1.5 mm).
 */

export interface HeightLeg {
  from: string;
  to: string;
  /** Az „oda” mért magasságkülönbség [m] (a from állásponton). */
  forward: number | null;
  /** A „vissza” mért magasságkülönbség előjelhelyesen a from → to irányra [m]. */
  backward: number | null;
  /** A felhasznált magasságkülönbség (oda-vissza mérésnél az átlag) [m]. */
  dh: number;
  distance: number;
}

export interface HeightLineResult {
  name: string;
  order: string[];
  closed: boolean;
  legs: HeightLeg[];
  /** A vonal pontjainak magassága a záróhiba elosztása után. */
  heights: { id: string; height: number; given: boolean }[];
  /** Záróhiba: számított − adott végpontmagasság [m]; null, ha a végpont magassága nem ismert. */
  closure: number | null;
  /** Hibahatár [m]. */
  limit: number;
  /** A vonal hossza [m]. */
  length: number;
}

/** A súgó hibahatára: 15·√t mm, t km-ben. */
export const heightLineLimit = (lengthM: number): number => (15 * Math.sqrt(lengthM / 1000)) / 1000;

function measured(stations: NetStation[], from: string, to: string, coords: Map<string, Pt>): { dh: number; distance: number } | null {
  const st = stations.find((s) => s.id === from);
  const o = st?.observations.find((x) => x.target === to);
  if (!st || !o) return null;
  const a = coords.get(from);
  const b = coords.get(to);
  const fromCoordinates = !o.distance;
  const distance = o.distance || (a && b ? Math.hypot(b.y - a.y, b.x - a.x) : null);
  if (distance === null || distance <= 0) return null;
  let dh = fromCoordinates ? coordinateHeightDifference(o, st.instrumentHeight, distance) : o.dM;
  if (dh === null && o.zi !== null && st.instrumentHeight !== null && o.targetHeight !== null) {
    dh = trigonometricHeightDifference(distance, o.zi, st.instrumentHeight, o.targetHeight);
  }
  return dh === null ? null : { dh, distance };
}

export function heightLine(
  name: string,
  order: string[],
  stations: NetStation[],
  heights: Map<string, number>,
  coords: Map<string, Pt> = new Map(),
): HeightLineResult {
  if (order.length < 2) throw new CalcError('A magassági vonalhoz legalább két pont kell.');
  const closed = order.length >= 3 && order[order.length - 1] === order[0];
  const start = order[0]!;
  const end = order[order.length - 1]!;
  const h0 = heights.get(start);
  if (h0 === undefined) throw new CalcError(`A(z) ${start} kezdőpont magassága nem ismert.`);

  const legs: HeightLeg[] = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i]!;
    const b = order[i + 1]!;
    const fw = measured(stations, a, b, coords);
    const bw = measured(stations, b, a, coords);
    if (!fw && !bw) throw new CalcError(`A(z) ${a}–${b} szakaszon nincs magasságkülönbség (sem oda, sem vissza).`);
    const forward = fw ? fw.dh : null;
    const backward = bw ? -bw.dh : null;
    const dh = forward !== null && backward !== null ? (forward + backward) / 2 : (forward ?? backward)!;
    const distance = fw && bw ? (fw.distance + bw.distance) / 2 : (fw ?? bw)!.distance;
    legs.push({ from: a, to: b, forward, backward, dh, distance });
  }
  const length = legs.reduce((s, l) => s + l.distance, 0);
  const sum = legs.reduce((s, l) => s + l.dh, 0);
  const endGiven = closed ? h0 : heights.get(end);
  const closure = endGiven === undefined ? null : h0 + sum - endGiven;

  const out: HeightLineResult['heights'] = [{ id: start, height: h0, given: true }];
  let h = h0;
  let run = 0;
  for (const l of legs) {
    run += l.distance;
    h += l.dh;
    const given = heights.get(l.to);
    const corrected = closure === null ? h : h - (closure * run) / length;
    if (closed && l.to === start) continue;
    out.push({ id: l.to, height: given ?? corrected, given: given !== undefined });
  }
  return { name, order, closed, legs, heights: out, closure, limit: heightLineLimit(length), length };
}

export function heightLineSections(lines: HeightLineResult[]): Section[] {
  return lines.map<Section>((r) => {
    const byId = new Map(r.heights.map((p) => [p.id, p]));
    const rows: Row[] = [{ cells: [r.order[0]!, '', '', '', '', fix(r.heights[0]!.height, 2)], role: 'base' }];
    for (const l of r.legs) {
      const p = byId.get(l.to);
      rows.push({
        cells: [
          l.to,
          l.forward === null ? '' : fix(l.forward, 3),
          l.backward === null ? '' : fix(l.backward, 3),
          fix(l.dh, 3),
          fix(l.distance, 1),
          p ? fix(p.height, 2) : '',
        ],
        role: p?.given ? 'base' : 'result',
      });
    }
    const footer = [
      `Kezdőpont: ${r.order[0]}, végpont: ${r.order[r.order.length - 1]}${r.closed ? ' (zárt poligon)' : ''}.`,
      r.closure === null
        ? 'Záróhiba: nem számítható (a végpont magassága nem ismert).'
        : `Záróhiba: ${fix(r.closure * 100, 1)} cm, hibahatár: ${fix(r.limit * 100, 1)} cm – ${Math.abs(r.closure) <= r.limit ? 'megfelel' : 'NEM felel meg'}.`,
      `A vonal hossza: ${fix(r.length, 1)} m.`,
    ];
    return {
      kind: 'height-line',
      title: `Trigonometriai magassági vonal${r.name ? `: ${r.name}` : ''}`,
      columns: ['Pontszám', 'dM oda', 'dM vissza', 'dM', 'Távolság [m]', 'Magasság'],
      rows,
      footer,
    };
  });
}
