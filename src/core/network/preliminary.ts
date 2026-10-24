import { DEG, formatDms } from '../angle';
import { CalcError } from '../errors';
import { intersectRays } from '../geometry';
import { adjust, type Obs } from '../modules/adjust';
import { fix } from '../format';
import type { Issue, Row, Section } from '../types';
import type { NetStation } from './types';

export interface Pt {
  y: number;
  x: number;
}

const TWO_PI = 2 * Math.PI;
const azimuth = (a: Pt, b: Pt) => ((Math.atan2(b.y - a.y, b.x - a.x) % TWO_PI) + TWO_PI) % TWO_PI;
const wrap = (a: number) => {
  const r = ((a % TWO_PI) + TWO_PI) % TWO_PI;
  return r > Math.PI ? r - TWO_PI : r;
};

/**
 * Egy állomás tájékozási szöge (radián) az ismert célpontok `zi = irányszög − leolvasás` értékeiből:
 * a mediánhoz képest küszöbön belüli eltérések átlaga (a durva hibás irányok nem rontják el).
 */
export function robustOrientation(zi: number[], thresholdRad: number): { zk: number; used: boolean[] } | null {
  if (zi.length === 0) return null;
  const ref = zi[0]!;
  const rel = zi.map((z) => wrap(z - ref));
  const sorted = [...rel].sort((p, q) => p - q);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const used = rel.map((r) => Math.abs(r - median) <= thresholdRad);
  const kept = rel.filter((_, i) => used[i]);
  if (kept.length === 0) return null;
  return { zk: ref + kept.reduce((a, b) => a + b, 0) / kept.length, used };
}

export interface PreliminaryResult {
  coords: Map<string, Pt>;
  unresolved: string[];
}

/**
 * Az új pontok előzetes koordinátái: ismert állomásról poláris vagy előmetszéssel, új állomáson
 * hátrametszéssel / szabad álláspontként (VP). A számítás az ismert pontokból halad az újak felé.
 */
export function preliminaryCoordinates(
  known: Map<string, Pt>,
  stations: NetStation[],
  grossDirectionArcsec: number,
  issues: Issue[],
  wanted: Set<string>,
): PreliminaryResult {
  const coords = new Map(known);
  const threshold = (grossDirectionArcsec / 3600) * DEG;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const s of stations) {
    for (const id of [s.id, ...s.observations.map((o) => o.target)]) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  // Csak a kiegyenlítésbe bevont (új) pontok előzetes koordinátáit számítjuk; a többi koordináta nélküli pont részletpont.
  const unresolved = ids.filter((id) => !coords.has(id) && wanted.has(id));

  const orientationOf = (s: NetStation): number | null => {
    const S = coords.get(s.id);
    if (!S) return null;
    const zi = s.observations.filter((o) => coords.has(o.target)).map((o) => azimuth(S, coords.get(o.target)!) - o.hz * DEG);
    return robustOrientation(zi, threshold)?.zk ?? null;
  };

  let progress = true;
  while (progress && unresolved.length > 0) {
    progress = false;
    for (const p of [...unresolved]) {
      let found: Pt | null = null;

      // 1. Ismert (vagy már kiszámított) állomásról mért irányokból és távolságokból.
      const polar: Pt[] = [];
      const rays: { from: Pt; azDeg: number }[] = [];
      for (const s of stations) {
        const S = coords.get(s.id);
        if (!S) continue;
        const zk = orientationOf(s);
        if (zk === null) continue;
        for (const o of s.observations) {
          if (o.target !== p) continue;
          const az = o.hz * DEG + zk;
          if (o.distance) polar.push({ y: S.y + o.distance * Math.sin(az), x: S.x + o.distance * Math.cos(az) });
          else rays.push({ from: S, azDeg: ((az / DEG) % 360 + 360) % 360 });
        }
      }
      if (polar.length > 0) {
        found = { y: polar.reduce((a, q) => a + q.y, 0) / polar.length, x: polar.reduce((a, q) => a + q.x, 0) / polar.length };
      } else if (rays.length >= 2) {
        try {
          found = intersectRays(rays);
        } catch (e) {
          if (!(e instanceof CalcError)) throw e;
        }
      }

      // 2. Új állomás: szabad álláspont az ismert célpontokra mért irányokból és távolságokból.
      if (!found) {
        const st = stations.find((s) => s.id === p);
        if (st) {
          const obs: Obs[] = [];
          const readings: { K: Pt; l: number }[] = [];
          for (const o of st.observations) {
            const K = coords.get(o.target);
            if (!K) continue;
            obs.push({ kind: 'dirIn', K, value: o.hz * DEG, sigma: (5 / 3600) * DEG });
            readings.push({ K, l: o.hz * DEG });
            if (o.distance) obs.push({ kind: 'dist', K, value: o.distance, sigma: 0.02 });
          }
          if (obs.length >= 3) {
            try {
              const sol = adjust(obs, true, readings);
              found = { y: sol.y, x: sol.x };
            } catch (e) {
              if (!(e instanceof CalcError)) throw e;
            }
          }
        }
      }

      if (found) {
        coords.set(p, found);
        unresolved.splice(unresolved.indexOf(p), 1);
        progress = true;
      }
    }
  }
  if (unresolved.length > 0) {
    issues.push({
      level: 'error',
      message: `Az előzetes koordináták nem számíthatók: ${unresolved.join(', ')} (kevés mérés vagy hiányzó ismert pont).`,
    });
  }
  return { coords, unresolved };
}

/**
 * Előzetes tájékozás (súgó 51. o., „Előzetes tájékozás” panel): az álláspontok tájékozása az addig
 * ismert (megadott vagy előzetesen számított) koordinátákból, hibakereséshez. A `include` dönti el,
 * mely irányzott pontok irányai vesznek részt (pl. csak az ismert pontok, vagy a számoltak is).
 *
 * A jegyzőkönyv a valódi program szerinti: álláspontonként a tájékozási szög (Zk), irányonként a
 * leolvasás (l), az irányszög (δ), a távolság (t), az iránynak megfelelő tájékozási szög (Zi) és az
 * eltérés (e″ = Zi − Zk).
 */
export function preliminaryOrientationSection(
  stations: NetStation[],
  coords: Map<string, Pt>,
  include: (id: string) => boolean,
): Section {
  const rows: Row[] = [];
  const sorted = [...stations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const st of sorted) {
    const S = coords.get(st.id);
    if (!S) continue;
    const obs = st.observations.filter((o) => o.target !== st.id && coords.has(o.target) && include(o.target));
    if (obs.length === 0) continue;
    const zi = obs.map((o) => azimuth(S, coords.get(o.target)!) - o.hz * DEG);
    // Átlag a körön: az első irányhoz viszonyított eltérések átlaga.
    const ref = zi[0]!;
    const zk = ref + zi.reduce((a, z) => a + wrap(z - ref), 0) / zi.length;
    rows.push({ cells: [st.id, '', '', '', formatDms(zk / DEG), ''], role: 'result' });
    obs.forEach((o, i) => {
      const T = coords.get(o.target)!;
      rows.push({
        cells: [
          o.target,
          formatDms(o.hz),
          formatDms(azimuth(S, T) / DEG),
          fix(Math.hypot(T.y - S.y, T.x - S.x), 3),
          formatDms(zi[i]! / DEG),
          fix((wrap(zi[i]! - zk) / DEG) * 3600, 0),
        ],
        role: 'base',
      });
    });
  }
  return {
    kind: 'preliminary-orientation',
    title: 'Előzetes tájékozás',
    columns: ['Tájékozás', 'l', 'δ', 't', 'Zk/Zi', 'e″'],
    rows,
    footer: rows.length === 0 ? ['Nincs tájékozható álláspont (az álláspontnak és legalább egy irányzott pontnak koordináta kell).'] : undefined,
  };
}
