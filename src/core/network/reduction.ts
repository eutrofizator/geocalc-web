import { fix } from '../format';
import { projectionDef, projectionScale } from '../recorder';
import type { Row, Section } from '../types';
import type { NetStation } from './types';

/**
 * Vetületi távolságredukció a hálózat számított koordinátáiból (a GeoCalc „Adatrögzítő/Beállítások”
 * vetületi redukciójának párja). A mérések alapból redukció nélkül kerülnek a kiegyenlítésbe; a
 * kiegyenlítés után a pontok átlagos Y, X és M értékéből számolt szorzóval a távolságok redukálhatók,
 * és a kiegyenlítés a redukált távolságokkal fut újra.
 */

export interface NetworkAverages {
  y: number;
  x: number;
  /** Az átlagos magasság; null, ha egyik pontnak sincs magassága. */
  m: number | null;
  count: number;
  heightCount: number;
}

/** A pontok átlagos Y, X és M értéke (a magasság csak a magassággal rendelkező pontokból). */
export function networkAverages(points: { y: number; x: number; m: number | null }[]): NetworkAverages | null {
  if (points.length === 0) return null;
  const hs = points.filter((p) => p.m !== null).map((p) => p.m!);
  return {
    y: points.reduce((a, p) => a + p.y, 0) / points.length,
    x: points.reduce((a, p) => a + p.x, 0) / points.length,
    m: hs.length > 0 ? hs.reduce((a, h) => a + h, 0) / hs.length : null,
    count: points.length,
    heightCount: hs.length,
  };
}

export interface NetworkReduction {
  projection: string;
  y: number;
  x: number;
  m: number;
  factor: number;
}

/** A redukció szorzója a választott vetület állandóival (EOV: k = 0.99993, X − 200 000 m). */
export function networkReduction(projection: string, y: number, x: number, m: number): NetworkReduction {
  const p = projectionDef(projection);
  const { factor } = projectionScale({ avgY: y, avgX: x, avgM: m, k: p.k, R: p.R, ref: p.ref, axis: p.axis, heightReduction: true });
  return { projection: p.id, y, x, m, factor };
}

/** Az állomások távolságai a szorzóval (a mért vízszintes távolságból vetületi távolság). */
export function scaleDistances(stations: NetStation[], factor: number): NetStation[] {
  return stations.map((st) => ({
    ...st,
    observations: st.observations.map((o) => (o.distance === null ? o : { ...o, distance: o.distance * factor })),
  }));
}

/** A jegyzőkönyv szakasza: az átlagok, a szorzó és hatása 1 km-en. */
export function reductionSection(r: NetworkReduction, avg: NetworkAverages, mManual: boolean, applied: boolean): Section {
  const kv = (k: string, v: string): Row => ({ cells: [k, v], role: 'base' });
  const p = projectionDef(r.projection);
  return {
    kind: 'net-reduction',
    title: 'Vetületi távolságredukció a számított koordinátákból',
    columns: ['Jellemző', 'Érték'],
    rows: [
      kv('Vetület', p.label),
      kv('Átlagos Y', `${fix(r.y, 3)} m (${avg.count} pontból)`),
      kv('Átlagos X', `${fix(r.x, 3)} m`),
      kv('Átlagos M', `${fix(r.m, 3)} m (${mManual ? 'kézzel megadva' : avg.heightCount > 0 ? `${avg.heightCount} pont magasságából` : 'nincs magasság, 0'})`),
      kv('Szorzó', r.factor.toFixed(9)),
      kv('Hatás 1000 m-en', `${fix((r.factor - 1) * 1000 * 1000, 1)} mm`),
      kv('A kiegyenlítésben', applied ? 'figyelembe véve (a távolságok redukálva)' : 'nincs figyelembe véve'),
    ],
    footer: [
      `Vetületi távolság = mért vízszintes távolság · (1 − M/R) · k · (1 + d²/(2R²)); ${p.label}: k = ${p.k}, R = ${p.R} m, d = ${p.axis.toUpperCase()} − ${fix(p.ref, 0)} m.`,
    ],
  };
}
