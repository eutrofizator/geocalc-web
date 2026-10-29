import { baseName } from './gnss';
import type { NamedPt } from './parcel';
import type { Issue } from './types';

/**
 * Álláspontonkénti tájékozás a nyers mérésből: a tájékozó irányok (ismert, jellemzően alappontokra
 * mért irányok) irányszögéből és vízszintes irányértékéből a tájékozási szög (z = δ − Hz), az
 * irányonkénti javítás (″) és annak lineáris megfelelője (mm), valamint a tájékozás középhibája.
 *
 * Ha az álláspont koordinátája nem ismert, legalább két ismert pontra mért iránnyal és távolsággal
 * szabad álláspontként (kétdimenziós Helmert-transzformáció) számolja. A tájékozás után a részletpontok
 * poláris pontként számolhatók, és összevethetők a meglévő koordinátákkal.
 */

export interface RawObs {
  kind: 'station' | 'obs';
  id: string;
  hz: number | null;
  zi: number | null;
  tf: number | null;
  tv: number | null;
  tvet?: number | null;
}

export interface OrientationRow {
  /** Az irányzott pont (ahogy a mérésben szerepel, pl. 1001_E). */
  id: string;
  hz: number;
  /** Az irányszög a koordinátákból [fok]. */
  bearing: number;
  /** Az irány tájékozási szöge [fok]. */
  z: number;
  /** Javítás: a középérték mínusz az irány tájékozási szöge [″]. */
  v: number;
  /** A javítás lineáris megfelelője a pont távolságán [mm]. */
  e: number;
  /** Távolság a koordinátákból [m]. */
  dist: number;
  /** A mért (vízszintes) távolság eltérése a koordinátákból számítottól [m], ha mérték. */
  dd: number | null;
}

export interface PolarPoint {
  id: string;
  y: number;
  x: number;
  dist: number;
  /** Eltérés a meglévő koordinátától (számított − meglévő) [m], ha van ilyen pont. */
  dy: number | null;
  dx: number | null;
}

export interface StationOrientation {
  station: string;
  source: 'known' | 'free';
  y: number;
  x: number;
  /** A tájékozási szög középértéke [fok]. */
  z: number;
  /** A tájékozás középhibája [″] (legalább két irány esetén). */
  m0: number | null;
  rows: OrientationRow[];
  /** Szabad álláspontnál a méretarány-tényező. */
  scale?: number;
  /** Ismert álláspontnál a szabad álláspontként számolt helyzet eltérése (szabad − ismert) [m]. */
  freeCheck?: { dy: number; dx: number };
  points: PolarPoint[];
}

const RHO = 180 / Math.PI;
const norm = (a: number) => ((a % 360) + 360) % 360;
/** Előjeles szögkülönbség (−180…180]. */
const diff = (a: number, b: number) => {
  const d = norm(a - b);
  return d > 180 ? d - 360 : d;
};
const bearing = (from: { y: number; x: number }, to: { y: number; x: number }) => norm(Math.atan2(to.y - from.y, to.x - from.x) * RHO);

/** Vízszintes távolság: a vetületi, ha van, különben a vízszintes, különben a ferde és a zenitszög. */
function horiz(o: RawObs): number | null {
  if (o.tvet != null) return o.tvet;
  if (o.tv != null) return o.tv;
  if (o.tf != null && o.zi != null) return o.tf * Math.sin(o.zi / RHO);
  return null;
}

/**
 * Tájékozás és poláris részletpontok álláspontonként.
 * @param refs a tájékozáshoz használható ismert pontok (alappontok)
 * @param known minden ismert koordináta (az álláspontokhoz és az összevetéshez)
 */
export function orientStations(rows: RawObs[], refs: Map<string, NamedPt>, known: Map<string, NamedPt>): { stations: StationOrientation[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const stations: StationOrientation[] = [];
  const groups: { id: string; obs: RawObs[] }[] = [];
  for (const r of rows) {
    if (r.kind === 'station') groups.push({ id: r.id, obs: [] });
    else if (groups.length > 0) groups.at(-1)!.obs.push(r);
  }
  for (const g of groups) {
    const obs = g.obs.filter((o) => o.hz !== null);
    if (obs.length === 0) continue;
    const toRef = obs.filter((o) => baseName(o.id) !== g.id && refs.has(baseName(o.id)));
    if (toRef.length === 0) {
      issues.push({ level: 'warning', message: `Álláspont ${g.id}: nincs mérés ismert (alap)pontra, a tájékozás nem számolható.` });
      continue;
    }
    let st = known.get(g.id) ?? null;
    let source: StationOrientation['source'] = 'known';
    let scale: number | undefined;
    const free = freeStation(toRef, refs);
    // Névütközés: a koordináták között ilyen pontszámmal egészen más pont áll (pl. épületsarok).
    if (st && free && Math.hypot(free.y - st.y, free.x - st.x) > 0.5) {
      issues.push({
        level: 'warning',
        message: `Álláspont ${g.id}: a koordináták között a(z) ${g.id} pontszám más pontot jelöl (${Math.hypot(free.y - st.y, free.x - st.x).toFixed(2)} m-re a mérésből számolt állásponttól) – az álláspontot szabad álláspontként számolom. Érdemes az egyiket átnevezni.`,
      });
      st = null;
    }
    const freeCheck = st && free ? { dy: free.y - st.y, dx: free.x - st.x } : undefined;
    if (freeCheck && Math.hypot(freeCheck.dy, freeCheck.dx) > 0.01)
      issues.push({
        level: 'warning',
        message: `Álláspont ${g.id}: a mérésből szabad álláspontként számolt helyzet ${(Math.hypot(freeCheck.dy, freeCheck.dx) * 100).toFixed(1)} cm-re van a megadott koordinátától – ellenőrizd az álláspont koordinátáját.`,
      });
    if (!st) {
      if (!free) {
        issues.push({ level: 'warning', message: `Álláspont ${g.id}: a koordinátája nem ismert, és nincs legalább két ismert pontra mért távolság a szabad álláspont számításához.` });
        continue;
      }
      st = { id: g.id, y: free.y, x: free.x };
      source = 'free';
      scale = free.scale;
    }
    const s = st;
    const first = toRef.map((o) => diff(bearing(s, refs.get(baseName(o.id))!), o.hz!));
    // A középérték az első irányhoz viszonyítva (a 0/360 átmenet miatt).
    const z0 = first[0]!;
    const z = norm(z0 + first.reduce((a, v) => a + diff(v, z0), 0) / first.length);
    const out: OrientationRow[] = toRef.map((o, i) => {
      const p = refs.get(baseName(o.id))!;
      const dist = Math.hypot(p.y - s.y, p.x - s.x);
      const v = diff(z, norm(first[i]!)) * 3600;
      const h = horiz(o);
      return { id: o.id, hz: o.hz!, bearing: bearing(s, p), z: norm(first[i]!), v, e: (v / 3600 / RHO) * dist * 1000, dist, dd: h === null ? null : h - dist };
    });
    // Fölös mérés: ismert álláspontnál n − 1, szabad álláspontnál (a helyzet is ismeretlen) n − 2.
    const dof = out.length - (source === 'free' ? 2 : 1);
    const m0 = dof >= 1 ? Math.sqrt(out.reduce((a, r) => a + r.v * r.v, 0) / dof) : null;
    const points: PolarPoint[] = [];
    for (const o of obs) {
      if (toRef.includes(o)) continue;
      const d = horiz(o);
      if (d === null) continue;
      const dir = norm(z + o.hz!) / RHO;
      const y = s.y + d * Math.sin(dir);
      const x = s.x + d * Math.cos(dir);
      const ex = known.get(baseName(o.id));
      points.push({ id: o.id, y, x, dist: d, dy: ex ? y - ex.y : null, dx: ex ? x - ex.x : null });
    }
    issues.push({
      level: 'info',
      message:
        `Tájékozás – álláspont ${g.id} (${source === 'known' ? 'ismert' : 'szabad álláspont'}): ${out.length} tájékozó irány, ` +
        `középhiba ${m0 === null ? '– (nincs fölös mérés)' : `± ${m0.toFixed(1)}″`}, legnagyobb lineáris eltérés ${Math.max(...out.map((r) => Math.abs(r.e))).toFixed(1)} mm; ${points.length} részletpont.`,
    });
    stations.push({ station: g.id, source, y: s.y, x: s.x, z, m0, rows: out, ...(scale !== undefined ? { scale } : {}), ...(freeCheck ? { freeCheck } : {}), points });
  }
  return { stations, issues };
}

/** Szabad álláspont: a műszer helyi rendszeréből (Hz, távolság) az EOV-ba illesztő hasonlósági transzformáció. */
function freeStation(obs: RawObs[], refs: Map<string, NamedPt>): { y: number; x: number; scale: number } | null {
  const pairs = obs.flatMap((o) => {
    const d = horiz(o);
    const p = refs.get(baseName(o.id));
    if (d === null || !p) return [];
    return [{ l: { e: d * Math.sin(o.hz! / RHO), n: d * Math.cos(o.hz! / RHO) }, p }];
  });
  if (pairs.length < 2) return null;
  const k = pairs.length;
  const le = pairs.reduce((a, q) => a + q.l.e, 0) / k;
  const ln = pairs.reduce((a, q) => a + q.l.n, 0) / k;
  const py = pairs.reduce((a, q) => a + q.p.y, 0) / k;
  const px = pairs.reduce((a, q) => a + q.p.x, 0) / k;
  let sa = 0;
  let sb = 0;
  let ss = 0;
  for (const q of pairs) {
    const e = q.l.e - le;
    const n = q.l.n - ln;
    const y = q.p.y - py;
    const x = q.p.x - px;
    // y = a·e + b·n, x = −b·e + a·n (forgatás az óramutató járásával egyezően)
    sa += e * y + n * x;
    sb += n * y - e * x;
    ss += e * e + n * n;
  }
  if (ss === 0) return null;
  const a = sa / ss;
  const b = sb / ss;
  // az álláspont a helyi rendszer origója
  return { y: py - (a * le + b * ln), x: px - (-b * le + a * ln), scale: Math.hypot(a, b) };
}
