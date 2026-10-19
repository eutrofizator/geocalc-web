import { DEG, normDeg } from '../angle';
import { fix } from '../format';
import type { Issue, Row, Section } from '../types';
import type { NetStation } from './types';

export interface DetailMeasurement {
  station: string;
  y: number;
  x: number;
  height: number | null;
  /** Vízszintes távolság az álláspontról [m]. */
  distance: number;
  /** Irányszög az álláspontról [fok]. */
  azimuth: number;
}

export interface DetailPoint {
  id: string;
  y: number;
  x: number;
  height: number | null;
  measurements: DetailMeasurement[];
  /** A legnagyobb eltérés az átlagos koordinátától [m] (több álláspontról mért pontnál). */
  spread: number;
}

export interface DetailResult {
  points: DetailPoint[];
  sections: Section[];
  issues: Issue[];
}

const c3 = (n: number) => fix(n, 3);
const c2 = (n: number) => fix(n, 2);

/**
 * Részletpontok számítása: minden olyan irányzott pont, amelynek nincs koordinátája (nem adott és nem a hálózat
 * kiegyenlített pontja), poláris módszerrel az álláspontról (kiegyenlített koordináták és tájékozási szög).
 * A többször mért pontok koordinátája a mérések átlaga, az eltérésüket külön kimutatás adja.
 */
export function computeDetailPoints(
  stations: NetStation[],
  coords: Map<string, { y: number; x: number }>,
  orientations: Map<string, number>,
  heights: Map<string, number> | null,
): DetailResult {
  const issues: Issue[] = [];
  const byId = new Map<string, DetailMeasurement[]>();
  const sorted = [...stations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const st of sorted) {
    const detail = st.observations.filter((o) => o.distance && !coords.has(o.target));
    if (detail.length === 0) continue;
    const S = coords.get(st.id);
    const zk = orientations.get(st.id);
    if (!S || zk === undefined) {
      issues.push({ level: 'warning', message: `A(z) ${st.id} állomás részletpontjai nem számíthatók: hiányzik az állomás koordinátája vagy tájékozása.` });
      continue;
    }
    const h0 = heights?.get(st.id);
    for (const o of detail) {
      const az = normDeg(o.hz + zk);
      const d = o.distance!;
      const m: DetailMeasurement = {
        station: st.id,
        y: S.y + d * Math.sin(az * DEG),
        x: S.x + d * Math.cos(az * DEG),
        height: h0 !== undefined && o.dM !== null ? h0 + o.dM : null,
        distance: d,
        azimuth: az,
      };
      const list = byId.get(o.target) ?? [];
      list.push(m);
      byId.set(o.target, list);
    }
  }

  const points: DetailPoint[] = [...byId.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, ms]) => {
      const y = ms.reduce((a, m) => a + m.y, 0) / ms.length;
      const x = ms.reduce((a, m) => a + m.x, 0) / ms.length;
      const hs = ms.filter((m) => m.height !== null).map((m) => m.height!);
      return {
        id,
        y,
        x,
        height: hs.length > 0 ? hs.reduce((a, h) => a + h, 0) / hs.length : null,
        measurements: ms,
        spread: Math.max(...ms.map((m) => Math.hypot(m.y - y, m.x - x))),
      };
    });

  const sections: Section[] = [];
  if (points.length > 0) {
    sections.push({
      kind: 'detail-points',
      title: 'Részletpontok',
      columns: ['Pontszám', 'Y', 'X', 'M', 'Mérések', 'Álláspont(ok)'],
      rows: points.map<Row>((p) => ({
        cells: [p.id, c3(p.y), c3(p.x), p.height === null ? '' : c2(p.height), String(p.measurements.length), p.measurements.map((m) => m.station).join(', ')],
        role: 'result',
      })),
    });
    const multi = points.filter((p) => p.measurements.length > 1);
    if (multi.length > 0) {
      sections.push({
        kind: 'detail-multi',
        title: 'Többször mért részletpontok',
        columns: ['Pontszám', 'Álláspont', 'Y', 'X', 'M', 'ΔY [m]', 'ΔX [m]'],
        rows: multi.flatMap((p) =>
          p.measurements.map<Row>((m) => ({
            cells: [p.id, m.station, c3(m.y), c3(m.x), m.height === null ? '' : c2(m.height), c3(m.y - p.y), c3(m.x - p.x)],
            role: 'base',
          })),
        ),
        footer: [`A legnagyobb eltérés az átlagtól: ${c3(Math.max(...multi.map((p) => p.spread)))} m`],
      });
    }
  }
  return { points, sections, issues };
}
