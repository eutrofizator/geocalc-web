import { formatDms } from '../angle';
import { CalcError } from '../errors';
import { fix } from '../format';
import type { Issue, Row, Section } from '../types';
import { chiSquareQuantile, normalQuantile } from './stats';
import type { NetPoint, NetStation, VerticalSettings } from './types';

const RHO = 206264.80624709636;
const EARTH_RADIUS = 6371000;
const REFRACTION = 0.13;
/** A hibahatár a kiegyenlítés előtti középhiba többszöröse (a régi program értékeihez igazított tájékoztató tényező). */
const LIMIT_FACTOR = 5;

export interface HeightObservation {
  /** A mérés sorszáma a jegyzőkönyvben (1-től). */
  index: number;
  station: string;
  target: string;
  instrumentHeight: number | null;
  targetHeight: number | null;
  zenith: number | null;
  /** Vízszintes távolság [m]. */
  distance: number;
  /** Mért magasságkülönbség [m]. */
  dh: number;
  /** Javítás (kiegyenlített − mért) [m]. */
  residual: number;
  adjusted: number;
  /** Hibahatár [m]. */
  limit: number;
  sigma: number;
  redundancy: number;
  stat: number;
}

export interface HeightPointResult {
  id: string;
  mark: string;
  approximate: number;
  height: number;
  /** Középhiba [m]. */
  sigma: number;
  /** Rögzített (adott) magasság. */
  fixed: boolean;
}

export interface VerticalResult {
  points: HeightPointResult[];
  observations: HeightObservation[];
  counts: { points: number; fixed: number; new: number; differences: number; redundancy: number };
  weightedSumSquares: number;
  sigma0: number | null;
  globalTest: { lower: number; upper: number; accepted: boolean } | null;
  localTest: { index: number; station: string; target: string; stat: number; theoretical: number; accepted: boolean } | null;
  sections: Section[];
  issues: Issue[];
}

function solveSymmetric(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    if (Math.abs(m[piv]![c]!) < 1e-12) return null;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= m[r]![k]! * x[k]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}

function invert(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0);
    e[j] = 1;
    const x = solveSymmetric(matrix, e);
    if (!x) return null;
    cols.push(x);
  }
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]!));
}

/** Trigonometrikus magasságkülönbség a zenitszögből: Δh = D·ctg z + i − t + (1 − k)·D²/(2R). */
export function trigonometricHeightDifference(distance: number, zenithDeg: number, instrument: number, target: number): number {
  const z = (zenithDeg * Math.PI) / 180;
  return distance / Math.tan(z) + instrument - target + ((1 - REFRACTION) * distance * distance) / (2 * EARTH_RADIUS);
}

/**
 * Trigonometrikus magassági hálózat kiegyenlítése.
 *
 * A mért magasságkülönbségek a mérési jegyzőkönyv `dM` mezőjéből jönnek (ha hiányzik, a zenitszögből,
 * a műszer- és prizmamagasságból, a távolságból és a föld görbületéből számoljuk). Súlyozás: egyenlő súly
 * (σ = a megadott középhiba) vagy a távolsággal fordítottan arányos súly (σ² ∝ D).
 */
export function adjustHeights(
  knownPoints: NetPoint[],
  stationList: NetStation[],
  settings: VerticalSettings,
  extraPoints: string[] = [],
): VerticalResult {
  const issues: Issue[] = [];
  // A jegyzőkönyv az állomásokat azonosító szerint rendezve sorolja fel (mint a GeoCalc).
  const stations = [...stationList].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const s = settings;
  if (s.sigma <= 0 || s.unitDistance <= 0) throw new CalcError('A középhiba és az egységnyi távolság pozitív kell legyen.');

  interface Edge {
    station: NetStation;
    target: string;
    obs: NetStation['observations'][number];
    dh: number;
  }
  const edges: Edge[] = [];
  // A hálózat pontjai: az állomások, az adott pontok és a megadott további pontok. A többi irányzott pont részletpont.
  const network = new Set<string>([...stations.map((st) => st.id), ...knownPoints.map((p) => p.id), ...extraPoints]);
  for (const st of stations) {
    for (const o of st.observations) {
      if (!o.distance || !network.has(o.target)) continue;
      let dh = o.dM;
      if (dh === null && o.zi !== null && st.instrumentHeight !== null && o.targetHeight !== null) {
        dh = trigonometricHeightDifference(o.distance, o.zi, st.instrumentHeight, o.targetHeight);
      }
      if (dh === null) {
        issues.push({ level: 'warning', message: `${st.id}→${o.target}: nincs magasságkülönbség (dM) és a zenitszögből sem számítható, a mérés kimarad.` });
        continue;
      }
      edges.push({ station: st, target: o.target, obs: o, dh });
    }
  }
  if (edges.length === 0) throw new CalcError('Nincs magasságkülönbség a mérési jegyzőkönyvben (távolsággal és zenitszöggel mért irányzás).');

  const ids: string[] = [];
  for (const e of edges) for (const id of [e.station.id, e.target]) if (!ids.includes(id)) ids.push(id);
  const given = new Map<string, number>();
  for (const p of knownPoints) if (p.m !== null && ids.includes(p.id)) given.set(p.id, p.m);
  const marks = new Map(knownPoints.map((p) => [p.id, p.mark]));

  if (!s.free && given.size === 0) {
    throw new CalcError('A beillesztett magassági hálózathoz legalább egy adott magasságú pont kell (vagy jelöld az önálló hálózatot).');
  }

  // --- Közelítő magasságok: az adott magasságú pontok rögzítésével, egyenlő súlyú legkisebb négyzetekkel.
  const approx = new Map<string, number>();
  const anchors = new Set(given.keys());
  if (anchors.size === 0) anchors.add(ids[0]!); // magassági bázis nélküli hálózat: tetszőleges kezdőérték
  for (const a of anchors) approx.set(a, given.get(a) ?? 0);
  const free = ids.filter((id) => !anchors.has(id));
  if (free.length > 0) {
    const idx = new Map(free.map((id, i) => [id, i]));
    const N = Array.from({ length: free.length }, () => new Array<number>(free.length).fill(0));
    const g = new Array<number>(free.length).fill(0);
    for (const e of edges) {
      const a = e.station.id;
      const b = e.target;
      const ia = idx.get(a);
      const ib = idx.get(b);
      // h_b − h_a = dh
      if (ib !== undefined) {
        N[ib]![ib]! += 1;
        g[ib]! += e.dh + (ia === undefined ? approx.get(a)! : 0);
      }
      if (ia !== undefined) {
        N[ia]![ia]! += 1;
        g[ia]! += -e.dh + (ib === undefined ? approx.get(b)! : 0);
      }
      if (ia !== undefined && ib !== undefined) {
        N[ia]![ib]! -= 1;
        N[ib]![ia]! -= 1;
      }
    }
    const sol = solveSymmetric(N, g);
    if (!sol) throw new CalcError('A magassági hálózat nem összefüggő vagy nincs magassági kapcsolata az adott pontokkal.');
    for (const id of free) approx.set(id, sol[idx.get(id)!]!);
  }

  // --- Kiegyenlítés
  const unknown = s.free ? ids : ids.filter((id) => !given.has(id));
  const col = new Map(unknown.map((id, i) => [id, i]));
  const n = unknown.length;
  const sigmaOf = (d: number): number => {
    const base = s.sigma / 100;
    return s.weight === 'proportional' ? base * Math.sqrt(d / s.unitDistance) : base;
  };

  const hApprox = (id: string) => approx.get(id) ?? given.get(id)!;
  const N = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const g = new Array<number>(n).fill(0);
  const rows = edges.map((e) => {
    const sigma = sigmaOf(e.obs.distance!);
    const ia = col.get(e.station.id);
    const ib = col.get(e.target);
    const l = e.dh - (hApprox(e.target) - hApprox(e.station.id)); // mért − közelítő
    const w = 1 / (sigma * sigma);
    if (ib !== undefined) {
      N[ib]![ib]! += w;
      g[ib]! += w * l;
    }
    if (ia !== undefined) {
      N[ia]![ia]! += w;
      g[ia]! -= w * l;
    }
    if (ia !== undefined && ib !== undefined) {
      N[ia]![ib]! -= w;
      N[ib]![ia]! -= w;
    }
    return { sigma, ia, ib, l, w };
  });

  let delta: number[];
  let Q: number[][];
  if (s.free) {
    // Szabad hálózat: a javítások összege nulla (az átlagmagasság marad) – szegélyezett normálegyenlet.
    const m = n + 1;
    const ext = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i < n && j < n ? N[i]![j]! : i === n && j === n ? 0 : 1)));
    const inv = invert(ext);
    if (!inv) throw new CalcError('A magassági hálózat nem összefüggő: nem minden pont kapcsolódik a többihez.');
    const rhs = [...g, 0];
    delta = inv.slice(0, n).map((row) => row.reduce((acc, v, j) => acc + v * rhs[j]!, 0));
    Q = inv.slice(0, n).map((row) => row.slice(0, n));
  } else {
    const inv = invert(N);
    if (!inv) throw new CalcError('A magassági hálózat nem összefüggő vagy nincs magassági kapcsolata az adott pontokkal.');
    delta = inv.map((row) => row.reduce((acc, v, j) => acc + v * g[j]!, 0));
    Q = inv;
  }

  const height = (id: string) => hApprox(id) + (col.has(id) ? delta[col.get(id)!]! : 0);
  const observations: HeightObservation[] = [];
  let sumZ2 = 0;
  edges.forEach((e, k) => {
    const r = rows[k]!;
    const adjusted = height(e.target) - height(e.station.id);
    const residual = adjusted - e.dh;
    const z = residual / r.sigma;
    sumZ2 += z * z;
    let qa = 0;
    const a: [number | undefined, number][] = [
      [r.ib, 1],
      [r.ia, -1],
    ];
    for (const [i, ai] of a) for (const [j, aj] of a) if (i !== undefined && j !== undefined) qa += ai * Q[i]![j]! * aj;
    const redundancy = 1 - r.w * qa;
    const stat = redundancy > 1e-9 ? residual / (r.sigma * Math.sqrt(redundancy)) : 0;
    const d = e.obs.distance!;
    // Tájékoztató érték: a régi program három közölt hibahatárához igazított (0.15, 0.11, 0.10 m); a képletét a súgó nem közli.
    const limit = LIMIT_FACTOR * Math.sqrt((0.68 * (s.sigma / 100)) ** 2 + ((5.9 * d) / RHO) ** 2);
    observations.push({
      index: k + 1,
      station: e.station.id,
      target: e.target,
      instrumentHeight: e.station.instrumentHeight,
      targetHeight: e.obs.targetHeight,
      zenith: e.obs.zi,
      distance: d,
      dh: e.dh,
      residual,
      adjusted,
      limit,
      sigma: r.sigma,
      redundancy,
      stat,
    });
  });

  const fDof = edges.length - (s.free ? n - 1 : n);
  const sigma0 = fDof > 0 ? Math.sqrt(sumZ2 / fDof) : null;
  const s0 = sigma0 ?? 1;
  const points: HeightPointResult[] = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((id) => ({
    id,
    mark: marks.get(id) ?? '',
    approximate: hApprox(id),
    height: height(id),
    sigma: col.has(id) ? s0 * Math.sqrt(Q[col.get(id)!]![col.get(id)!]!) : 0,
    fixed: !s.free && given.has(id),
  }));

  const alpha = 1 - s.probability;
  let globalTest: VerticalResult['globalTest'] = null;
  if (fDof > 0 && sigma0 !== null) {
    const lower = Math.sqrt(chiSquareQuantile(alpha / 2, fDof) / fDof);
    const upper = Math.sqrt(chiSquareQuantile(1 - alpha / 2, fDof) / fDof);
    globalTest = { lower, upper, accepted: sigma0 >= lower && sigma0 <= upper };
  }
  const theoretical = normalQuantile(1 - alpha / 2);
  let localTest: VerticalResult['localTest'] = null;
  for (const o of observations) {
    // Döntetlennél (azonos |Stat.|) az első mérés marad a jelölt, függetlenül a lebegőpontos kerekítéstől.
    if (!localTest || Math.abs(o.stat) > Math.abs(localTest.stat) + 1e-9) {
      localTest = { index: o.index, station: o.station, target: o.target, stat: o.stat, theoretical, accepted: Math.abs(o.stat) <= theoretical };
    }
  }
  const result: VerticalResult = {
    points,
    observations,
    counts: { points: ids.length, fixed: s.free ? 0 : given.size, new: s.free ? ids.length : ids.length - given.size, differences: edges.length, redundancy: fDof },
    weightedSumSquares: sumZ2,
    sigma0,
    globalTest,
    localTest,
    sections: [],
    issues,
  };
  result.sections = buildSections(result, s);
  return result;
}

const c2 = (n: number) => fix(n, 2);
const signed = (n: number) => `${n < 0 ? '−' : '+'} ${fix(Math.abs(n), 2)}`;

function buildSections(r: VerticalResult, s: VerticalSettings): Section[] {
  const kv = (k: string, v: string): Row => ({ cells: [k, v], role: 'base' });
  const sections: Section[] = [];
  sections.push({
    kind: 'height-summary',
    title: 'Trigonometriai magassági hálózat jellemző adatai',
    columns: ['Jellemző', 'Érték'],
    rows: [
      kv('Összes pont száma', String(r.counts.points)),
      kv('Adott pontok száma', String(r.counts.fixed)),
      kv('Új pontok száma', String(r.counts.new)),
      kv('Magasságkülönbségek száma', String(r.counts.differences)),
      kv('Fölös mérések száma', String(r.counts.redundancy)),
      kv('Magasságkülönbség súlya', s.weight === 'equal' ? 'a távolságtól független' : 'a távolsággal fordítottan arányos'),
      kv('Kiegyenlítés előtti középhiba', `${fix(s.sigma, 1)} cm`),
      ...(s.weight === 'proportional' ? [kv('Egységnyi súlyú méréshez tartozó távolság', `${fix(s.unitDistance, 0)} m`)] : []),
      kv('Javítások súlyozott négyzetösszege', fix(r.weightedSumSquares, 3)),
      kv('Súlyegység középhibája', r.sigma0 === null ? '–' : fix(r.sigma0, 3)),
      kv('Hálózat típusa', s.free ? 'önálló (a javítások összege nulla)' : 'beillesztett'),
    ],
  });
  const worst = r.observations.reduce<HeightObservation | null>((m, o) => (!m || Math.abs(o.residual) > Math.abs(m.residual) ? o : m), null);
  if (worst) {
    sections.push({
      kind: 'height-max',
      title: 'Maximális javítás kimutatása',
      columns: ['Sorszám', 'Álláspont', 'Irányzott pont', 'Javítás [m]', 'Hibahatár [m]'],
      rows: [{ cells: [String(worst.index), worst.station, worst.target, c2(worst.residual), `(${c2(worst.limit)})`], role: 'base' }],
    });
  }
  const notes: string[] = [];
  const rows: Row[] = [];
  if (r.globalTest && r.sigma0 !== null) {
    rows.push(kv('Súlyegység középhibája kiegyenlítés előtt', '1.00'));
    rows.push(kv('Súlyegység középhibája kiegyenlítés után', fix(r.sigma0, 2)));
    rows.push(kv('Elméleti intervallum', `${fix(r.globalTest.lower, 2)} … ${fix(r.globalTest.upper, 2)}`));
    notes.push(`A globális teszt ${fix(s.probability * 100, 0)} %-os valószínűségi szinten ${r.globalTest.accepted ? 'elfogadható' : 'nem fogadható el'}.`);
  }
  if (r.localTest) {
    const l = r.localTest;
    rows.push(kv('Legnagyobb standardizált javítás', `${l.index}. (${l.station} → ${l.target}): ${fix(l.stat, 2)}, elméleti határ ±${fix(l.theoretical, 2)}`));
    notes.push(`A lokális teszt (u próba) ${fix(s.probability * 100, 0)} %-os valószínűségi szinten ${l.accepted ? 'elfogadható' : 'nem fogadható el'}.`);
  }
  sections.push({ kind: 'height-tests', title: 'Statisztikai próbák durva hibák kimutatására', columns: ['Mutató', 'Érték'], rows, footer: notes });

  sections.push({
    kind: 'height-points',
    title: 'Magasság-jegyzék',
    columns: ['Pontszám', 'Jelölés', 'Előzetes magasság', 'Kiegyenlített magasság', 'Változás [cm]', 'Középhiba [cm]'],
    rows: r.points.map<Row>((p) => ({
      cells: [p.id, p.mark, c2(p.approximate), c2(p.height), p.fixed ? '–' : fix((p.height - p.approximate) * 100, 0), p.fixed ? '–' : fix(p.sigma * 100, 1)],
      role: p.fixed ? 'base' : 'result',
    })),
  });

  sections.push({
    kind: 'height-differences',
    title: 'Magasságkülönbségek és javítások',
    columns: ['Sorszám', 'Álláspont', 'Irányzott pont', 'Műszermag.', 'Prizmamag.', 'Zenitszög', 'Távolság [m]', 'Mért mag.különbség', 'Kiegy. mag.különbség', 'Javítás', 'Hibahatár', 'Stat.', 'f'],
    rows: r.observations.map<Row>((o) => ({
      cells: [
        String(o.index),
        o.station,
        o.target,
        o.instrumentHeight === null ? '' : c2(o.instrumentHeight),
        o.targetHeight === null ? '' : c2(o.targetHeight),
        o.zenith === null ? '' : formatDms(o.zenith),
        c2(o.distance),
        signed(o.dh),
        signed(o.adjusted),
        signed(o.residual),
        `(${c2(o.limit)})`,
        c2(o.stat),
        c2(o.redundancy),
      ],
      role: 'base',
    })),
  });
  return sections;
}
