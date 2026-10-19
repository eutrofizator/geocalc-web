import { DEG, formatDms, normDeg, wrapDeg } from '../angle';
import { CalcError } from '../errors';
import { fix } from '../format';
import type { Issue, Row, Section } from '../types';
import { preliminaryCoordinates, robustOrientation, type Pt } from './preliminary';
import { chiSquareQuantile, normalQuantile } from './stats';
import { PRECISION_DECIMALS, type HorizontalSettings, type NetPoint, type NetStation } from './types';

const RHO = 206264.80624709636;
const TWO_PI = 2 * Math.PI;

/** A hibahatár a kiegyenlítés előtti középhiba többszöröse (a régi program értékeihez igazított tájékoztató tényező). */
const LIMIT_FACTOR = 5;

export interface ObservationResult {
  station: string;
  target: string;
  kind: 'direction' | 'distance';
  /** Kézzel kizárt mérés (a felhasználó kihagyta a kiegyenlítésből). */
  manual: boolean;
  /** A durva hiba miatt kihagyott mérés: a javítása a kiegyenlített megoldáshoz képest számolt, a próbákban nem szerepel. */
  excluded: boolean;
  /** Irány: leolvasás [fok]; távolság: mért távolság [m]. */
  observed: number;
  /** Irány: a kiegyenlítésből számított irányszög [fok]; távolság: számított távolság [m]. */
  computed: number;
  /** Irány: tájékozási szög ezen irányból (irányszög − leolvasás) [fok]. */
  orientation: number | null;
  /** Javítás (számított − mért): irány [″], távolság [mm]. */
  residual: number;
  /** Hibahatár: irány [″], távolság [mm]. */
  limit: number;
  /** A mérés kiegyenlítés előtti középhibája: irány [″], távolság [mm]. */
  sigma: number;
  redundancy: number | null;
  /** Standardizált javítás (u statisztika). */
  stat: number | null;
}

export interface NewPointResult {
  id: string;
  y: number;
  x: number;
  /** Középhibák [m]. */
  my: number;
  mx: number;
  semiMajor: number;
  semiMinor: number;
  /** A fő tengely irányszöge az X tengelytől [fok, 0…180). */
  angle: number;
  /** Az előzetes koordinátáktól való eltérés [m]. */
  dy: number;
  dx: number;
}

export interface HorizontalResult {
  counts: { points: number; known: number; new: number; directions: number; distances: number; redundancy: number; excluded: number };
  sigma0Prior: number;
  sigma0Posterior: number | null;
  /** A javítások súlyozott négyzetösszege (a súlyegységre vonatkoztatva) [″²]. */
  weightedSumSquares: number;
  points: NewPointResult[];
  /** Az állomások tájékozási szöge [fok]. */
  orientations: Map<string, number>;
  observations: ObservationResult[];
  globalTest: { lower: number; upper: number; accepted: boolean } | null;
  localTest: { station: string; target: string; kind: string; stat: number; theoretical: number; accepted: boolean } | null;
  iterations: number;
  sections: Section[];
  issues: Issue[];
}

/** Gauss–Jordan-elimináció: a mátrix inverze; szinguláris mátrixra null. */
function invert(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[piv]![c]!)) piv = r;
    if (Math.abs(a[piv]![c]!) < 1e-14 * Math.max(1, Math.abs(a[c]![c]!))) return null;
    [a[c], a[piv]] = [a[piv]!, a[c]!];
    const d = a[c]![c]!;
    for (let k = 0; k < 2 * n; k++) a[c]![k]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r]![c]!;
      if (f === 0) continue;
      for (let k = 0; k < 2 * n; k++) a[r]![k]! -= f * a[c]![k]!;
    }
  }
  return a.map((row) => row.slice(n));
}

function multiply(m: number[][], v: number[]): number[] {
  return m.map((row) => row.reduce((s, x, j) => s + x * v[j]!, 0));
}

interface Rec {
  station: string;
  target: string;
  kind: 'dir' | 'dist';
  value: number;
  excluded: boolean;
  manual: boolean;
}

/**
 * Vízszintes hálózat kiegyenlítése (beillesztett hálózat): az új pontok koordinátái és az állomások tájékozási
 * szögei az irány- és távmérésekből, súlyozott legkisebb négyzetes módszerrel.
 *
 * Súlyozás: az irányok súlya a távolsággal arányos (σᵢ = σ_irány·√(D₀/D)), a távolságoké állandó
 * (σ = a [+ b·D]); a súlyegység középhibája az irányok középhibája az átlagos távolságnál.
 */
export function adjustHorizontal(
  knownPoints: NetPoint[],
  stationList: NetStation[],
  settings: HorizontalSettings,
): HorizontalResult {
  const issues: Issue[] = [];
  // A jegyzőkönyv az állomásokat azonosító szerint rendezve sorolja fel (mint a GeoCalc).
  const stations = [...stationList].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const s = settings;
  if (stations.length === 0) throw new CalcError('Nincs mérési adat (állásponti sor) a jegyzőkönyvben.');
  if (s.sigmaDirection <= 0 || s.sigmaDistance <= 0 || s.averageDistance <= 0) {
    throw new CalcError('A középhibák és az átlagos távolság pozitívak kell legyenek.');
  }

  const known = new Map<string, Pt>(knownPoints.map((p) => [p.id, { y: p.y, x: p.x }]));
  const observedIds = new Set<string>();
  for (const st of stations) {
    observedIds.add(st.id);
    for (const o of st.observations) observedIds.add(o.target);
  }
  const knownUsed = s.free ? [] : [...observedIds].filter((id) => known.has(id));

  // --- Előzetes koordináták
  // Új pont: koordináta nélküli állomás, vagy a felhasználó által megadott további pont. A többi koordináta nélküli
  // irányzott pont részletpont, ami nem része a kiegyenlítésnek.
  const stationIds = new Set(stations.map((st) => st.id));
  const extra = new Set(s.extraPoints ?? []);
  // Önálló hálózatnál az adott koordinátájú pontok is ismeretlenek (a koordináták csak közelítő értékek).
  const newIds = [...observedIds].filter(
    (id) => (stationIds.has(id) || extra.has(id)) && (s.free || !known.has(id)),
  );
  const prelim = preliminaryCoordinates(known, stations, s.grossDirection, issues, new Set(newIds));
  if (prelim.unresolved.length > 0) throw new CalcError(issues[issues.length - 1]!.message);
  const inNetwork = (st: NetStation) => st.observations.filter((o) => prelim.coords.has(o.target));
  const coords = new Map<string, Pt>(prelim.coords);

  // --- Mérések és durva hibák kiszűrése az előzetes megoldás alapján
  const recs: Rec[] = [];
  const stationZk = new Map<string, number>();
  const gross = (s.grossDirection / 3600) * DEG;
  // 1. lépés: az előzetes megoldáshoz képest durva hibás irányok és távolságok.
  const flagged = new Set<string>();
  for (const st of stations) {
    const S = coords.get(st.id)!;
    const zi = inNetwork(st).map((o) => {
      const T = coords.get(o.target)!;
      return Math.atan2(T.y - S.y, T.x - S.x) - o.hz * DEG;
    });
    const rob = robustOrientation(zi, gross);
    if (!rob) throw new CalcError(`A(z) ${st.id} állomás tájékozása nem határozható meg.`);
    stationZk.set(st.id, rob.zk);
    for (const o of inNetwork(st)) {
      const T = coords.get(o.target)!;
      let wrapped = ((Math.atan2(T.y - S.y, T.x - S.x) - o.hz * DEG - rob.zk) % TWO_PI + TWO_PI) % TWO_PI;
      if (wrapped > Math.PI) wrapped -= TWO_PI;
      if (Math.abs(wrapped) > gross) flagged.add(`${st.id}>${o.target}:dir`);
      if (o.distance && Math.abs(Math.hypot(T.y - S.y, T.x - S.x) - o.distance) > s.grossDistance) flagged.add(`${st.id}>${o.target}:dist`);
    }
  }
  // 2. lépés: ha egy ismert célpontra a mérések legalább fele (és legalább kettő) durva hibás, a pont koordinátája
  // gyanús, ezért az összes rá mért mérést kihagyjuk.
  const manualKeys = new Set(s.excluded ?? []);
  const badTargets = new Set<string>();
  for (const id of knownUsed) {
    const dirs = stations.filter((st) => inNetwork(st).some((o) => o.target === id));
    const bad = dirs.filter((st) => flagged.has(`${st.id}>${id}:dir`)).length;
    if (bad >= 2 && bad / dirs.length >= 0.5) badTargets.add(id);
  }
  for (const st of stations) {
    for (const o of inNetwork(st)) {
      const badPoint = badTargets.has(o.target);
      const dirKey = `${st.id}>${o.target}:dir`;
      const distKey = `${st.id}>${o.target}:dist`;
      recs.push({ station: st.id, target: o.target, kind: 'dir', value: o.hz * DEG, manual: manualKeys.has(dirKey), excluded: badPoint || flagged.has(dirKey) || manualKeys.has(dirKey) });
      if (o.distance) recs.push({ station: st.id, target: o.target, kind: 'dist', value: o.distance, manual: manualKeys.has(distKey), excluded: badPoint || flagged.has(distKey) || manualKeys.has(distKey) });
    }
  }
  // Az állomások kezdő tájékozását a kihagyott mérések nélkül számítjuk újra.
  for (const st of stations) {
    const S = coords.get(st.id)!;
    const zi = inNetwork(st)
      .filter((o) => !recs.find((r) => r.station === st.id && r.target === o.target && r.kind === 'dir')!.excluded)
      .map((o) => Math.atan2(coords.get(o.target)!.y - S.y, coords.get(o.target)!.x - S.x) - o.hz * DEG);
    const rob = robustOrientation(zi, gross);
    if (rob) stationZk.set(st.id, rob.zk);
  }

  // --- Ismeretlenek: új pontok (y, x) és az állomások tájékozási szöge
  const index = new Map<string, number>();
  let n = 0;
  for (const id of newIds) {
    index.set(`y:${id}`, n++);
    index.set(`x:${id}`, n++);
  }
  const zkIds = stations.map((st) => st.id);
  for (const id of zkIds) index.set(`z:${id}`, n++);
  const p = new Map<string, number>();
  for (const id of newIds) {
    p.set(`y:${id}`, coords.get(id)!.y);
    p.set(`x:${id}`, coords.get(id)!.x);
  }
  for (const id of zkIds) p.set(`z:${id}`, stationZk.get(id)!);
  const pt = (id: string): Pt => (index.has(`y:${id}`) ? { y: p.get(`y:${id}`)!, x: p.get(`x:${id}`)! } : known.get(id)!);

  const sigmaOf = (kind: 'dir' | 'dist', d: number): number => {
    if (kind === 'dir') {
      const base = s.sigmaDirection / RHO;
      return s.directionWeight === 'proportional' ? base * Math.sqrt(s.averageDistance / d) : base;
    }
    const mm = s.distanceWeight === 'dependent' ? s.sigmaDistance + (s.sigmaDistancePerKm * d) / 1000 : s.sigmaDistance;
    return mm / 1000;
  };

  const evaluate = (r: Rec) => {
    const S = pt(r.station);
    const T = pt(r.target);
    const dy = T.y - S.y;
    const dx = T.x - S.x;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2);
    const row = new Map<number, number>();
    const add = (key: string, v: number) => {
      const i = index.get(key);
      if (i !== undefined) row.set(i, (row.get(i) ?? 0) + v);
    };
    if (r.kind === 'dir') {
      const az = Math.atan2(dy, dx);
      const res = wrapDeg(((az - p.get(`z:${r.station}`)! - r.value) / DEG)) * DEG; // számított − mért
      add(`y:${r.target}`, dx / d2);
      add(`x:${r.target}`, -dy / d2);
      add(`y:${r.station}`, -dx / d2);
      add(`x:${r.station}`, dy / d2);
      add(`z:${r.station}`, -1);
      return { res, row, d, sigma: sigmaOf('dir', d), az };
    }
    add(`y:${r.target}`, dy / d);
    add(`x:${r.target}`, dx / d);
    add(`y:${r.station}`, -dy / d);
    add(`x:${r.station}`, -dx / d);
    return { res: d - r.value, row, d, sigma: sigmaOf('dist', d), az: 0 };
  };

  const used = recs.filter((r) => !r.excluded);
  const nDir = recs.filter((r) => r.kind === 'dir').length;
  const nDist = recs.length - nDir;

  // --- Önálló hálózat belső megkötése
  // A szabad hálózat normálegyenlete úgy hiányos, hogy a hálózat merev eltolása (2), elforgatása (1), és ha a
  // méretarány nem adódik a mérésekből (csak irányokat mértek), a méretarány-változás (1) nem befolyásolja a
  // méréseket. A hiányt a javításokra felírt homogén dátum-feltételekkel töltjük ki:
  //   Σ dY = 0, Σ dX = 0  (a súlypont helyben marad),
  //   Σ (Y dX − X dY) = 0  (a hálózat nem fordul el),
  //   Σ (Y dY + X dX) = 0  (a nagysága nem változik; csak ha a méretarány nem meghatározott).
  const hasDist = used.some((r) => r.kind === 'dist');
  const datumRows: number[][] = [];
  if (s.free) {
    let by = 0;
    let bx = 0;
    for (const id of newIds) {
      by += coords.get(id)!.y;
      bx += coords.get(id)!.x;
    }
    by /= newIds.length;
    bx /= newIds.length;
    let spread = 0;
    for (const id of newIds) spread += (coords.get(id)!.y - by) ** 2 + (coords.get(id)!.x - bx) ** 2;
    spread = Math.sqrt(spread / newIds.length) || 1;
    const datumRow = (fn: (v: number, u: number) => [number, number]): number[] => {
      const a = new Array<number>(n).fill(0);
      for (const id of newIds) {
        const v = coords.get(id)!.y - by;
        const u = coords.get(id)!.x - bx;
        const [cy, cx] = fn(v, u);
        a[index.get(`y:${id}`)!] = cy;
        a[index.get(`x:${id}`)!] = cx;
      }
      return a;
    };
    datumRows.push(datumRow(() => [1, 0]));
    datumRows.push(datumRow(() => [0, 1]));
    datumRows.push(datumRow((v, u) => [-u / spread, v / spread]));
    if (!hasDist) datumRows.push(datumRow((v, u) => [v / spread, u / spread]));
  }
  const defect = datumRows.length;
  const f = used.length - n + defect;
  if (f < 0) throw new CalcError(`Kevés a mérés: ${used.length} mérésből ${n} ismeretlen nem határozható meg.`);

  // A kovarianciamátrix σ₀ = 1-nél (abszolút súlyokkal); szabad hálózatnál a belső megkötéses inverz.
  let Q: number[][] = [];

  // --- Gauss–Newton iteráció
  let iterations = 0;
  let N: number[][] = [];
  for (let it = 0; it < 40; it++) {
    iterations = it + 1;
    N = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const g = new Array<number>(n).fill(0);
    for (const r of used) {
      const e = evaluate(r);
      const w = 1 / (e.sigma * e.sigma);
      for (const [i, a] of e.row) {
        g[i]! -= w * a * e.res;
        for (const [j, b] of e.row) N[i]![j]! += w * a * b;
      }
    }
    let inv: number[][] | null;
    let rhs: number[];
    if (defect === 0) {
      inv = invert(N);
      rhs = g;
    } else {
      // A normálegyenlet kiegészítése a dátum-feltételekkel: [[N, Cᵀ], [C, 0]]·[dx, k] = [g, 0].
      const m = n + defect;
      const M = Array.from({ length: m }, () => new Array<number>(m).fill(0));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i]![j] = N[i]![j]!;
      for (let k = 0; k < defect; k++) {
        for (let j = 0; j < n; j++) {
          M[n + k]![j] = datumRows[k]![j]!;
          M[j]![n + k] = datumRows[k]![j]!;
        }
      }
      inv = invert(M);
      rhs = [...g, ...new Array<number>(defect).fill(0)];
    }
    if (!inv) {
      throw new CalcError(
        s.free
          ? 'Az önálló hálózat nem egyeníthető ki: a mérések nem határozzák meg a hálózat alakját.'
          : 'A hálózat nincs kellően megkötve (a normálegyenlet szinguláris): ellenőrizd az adott pontokat és a mérések eloszlását.',
      );
    }
    const delta = multiply(inv, rhs).slice(0, n);
    Q = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => inv![i]![j]!));
    let maxStep = 0;
    for (const [key, i] of index) {
      p.set(key, p.get(key)! + delta[i]!);
      if (!key.startsWith('z:')) maxStep = Math.max(maxStep, Math.abs(delta[i]!));
    }
    if (maxStep < 1e-9) break;
  }

  // --- Statisztika
  const m0 = s.sigmaDirection;
  let sumZ2 = 0;
  const obsResults: ObservationResult[] = [];
  for (const r of recs) {
    const e = evaluate(r);
    const isDir = r.kind === 'dir';
    const z = e.res / e.sigma;
    let redundancy: number | null = null;
    let stat: number | null = null;
    if (!r.excluded) {
      sumZ2 += z * z;
      let qa = 0;
      for (const [i, a] of e.row) for (const [j, b] of e.row) qa += a * Q[i]![j]! * b;
      redundancy = 1 - qa / (e.sigma * e.sigma);
      const denom = e.sigma * Math.sqrt(Math.max(redundancy, 0));
      stat = redundancy > 1e-9 ? e.res / denom : null;
    }
    const sigmaOut = isDir ? e.sigma * RHO : e.sigma * 1000;
    let limit: number;
    if (isDir) limit = LIMIT_FACTOR * sigmaOut;
    else {
      // Tájékoztató érték: a régi program három közölt hibahatárához igazított (a képletét a súgó nem közli).
      const lateralMm = ((0.75 * s.sigmaDirection * e.d) / RHO) * 1000;
      limit = LIMIT_FACTOR * Math.sqrt(1.75 * s.sigmaDistance ** 2 + lateralMm ** 2);
    }
    const azDeg = isDir ? normDeg(e.az / DEG) : 0;
    obsResults.push({
      station: r.station,
      target: r.target,
      kind: isDir ? 'direction' : 'distance',
      excluded: r.excluded,
      manual: r.manual,
      observed: isDir ? r.value / DEG : r.value,
      computed: isDir ? azDeg : e.d,
      orientation: isDir ? normDeg(azDeg - r.value / DEG) : null,
      residual: isDir ? e.res * RHO : e.res * 1000,
      limit,
      sigma: sigmaOut,
      redundancy,
      stat,
    });
  }
  const weightedSumSquares = m0 * m0 * sumZ2;
  const sigma0Posterior = f > 0 ? Math.sqrt(weightedSumSquares / f) : null;

  const orientations = new Map<string, number>();
  for (const id of zkIds) orientations.set(id, normDeg(p.get(`z:${id}`)! / DEG));

  // --- Új pontok és középhibáik
  // A pontok középhibájához a (dimenzió nélküli) súlyegység-középhibát használjuk: σ₀ = √(Σ(v/σᵢ)² / f).
  const s0 = f > 0 ? Math.sqrt(sumZ2 / f) : 1;
  const points: NewPointResult[] = newIds.map((id) => {
    const iy = index.get(`y:${id}`)!;
    const ix = index.get(`x:${id}`)!;
    const qy = Q[iy]![iy]!;
    const qx = Q[ix]![ix]!;
    const qxy = Q[iy]![ix]!;
    const tr = qy + qx;
    const df = Math.sqrt((qy - qx) ** 2 + 4 * qxy * qxy);
    const axis = 0.5 * Math.atan2(2 * qxy, qy - qx) / DEG; // a Y tengelytől
    return {
      id,
      y: p.get(`y:${id}`)!,
      x: p.get(`x:${id}`)!,
      my: s0 * Math.sqrt(qy),
      mx: s0 * Math.sqrt(qx),
      semiMajor: s0 * Math.sqrt((tr + df) / 2),
      semiMinor: s0 * Math.sqrt(Math.max((tr - df) / 2, 0)),
      angle: (((90 - axis) % 180) + 180) % 180,
      dy: p.get(`y:${id}`)! - coords.get(id)!.y,
      dx: p.get(`x:${id}`)! - coords.get(id)!.x,
    };
  });

  // --- Próbák
  const alpha = 1 - s.probability;
  let globalTest: HorizontalResult['globalTest'] = null;
  if (f > 0 && sigma0Posterior !== null) {
    const lower = m0 * Math.sqrt(chiSquareQuantile(alpha / 2, f) / f);
    const upper = m0 * Math.sqrt(chiSquareQuantile(1 - alpha / 2, f) / f);
    globalTest = { lower, upper, accepted: sigma0Posterior >= lower && sigma0Posterior <= upper };
  }
  let localTest: HorizontalResult['localTest'] = null;
  const theoretical = normalQuantile(1 - alpha / 2);
  for (const o of obsResults) {
    if (o.excluded || o.stat === null) continue;
    if (!localTest || Math.abs(o.stat) > Math.abs(localTest.stat)) {
      localTest = { station: o.station, target: o.target, kind: o.kind === 'direction' ? 'Irány' : 'Távolság', stat: o.stat, theoretical, accepted: Math.abs(o.stat) <= theoretical };
    }
  }

  const result: HorizontalResult = {
    counts: {
      points: knownUsed.length + newIds.length,
      known: knownUsed.length,
      new: newIds.length,
      directions: nDir,
      distances: nDist,
      redundancy: f,
      excluded: recs.filter((r) => r.excluded).length,
    },
    sigma0Prior: m0,
    sigma0Posterior,
    weightedSumSquares,
    points,
    orientations,
    observations: obsResults,
    globalTest,
    localTest,
    iterations,
    sections: [],
    issues,
  };
  const automatic = obsResults.filter((o) => o.excluded && !o.manual);
  if (automatic.length > 0) {
    issues.push({
      level: 'warning',
      message: `${automatic.length} mérés durva hiba miatt kimaradt a kiegyenlítésből (pl. ${automatic.slice(0, 3).map((o) => `${o.station}→${o.target}`).join(', ')}). Ellenőrizd a megfelelő pontok koordinátáit.`,
    });
  }
  const manualCount = obsResults.filter((o) => o.manual).length;
  if (manualCount > 0) {
    issues.push({ level: 'info', message: `${manualCount} mérést kézzel kizártál a kiegyenlítésből; a javításuk a kiegyenlített megoldáshoz képest számolt.` });
  }
  result.sections = buildSections(result, settings, stations, knownPoints, knownUsed);
  return result;
}

function buildSections(r: HorizontalResult, s: HorizontalSettings, stations: NetStation[], knownPoints: NetPoint[], knownUsed: string[]): Section[] {
  const sections: Section[] = [];
  const kv = (k: string, v: string): Row => ({ cells: [k, v], role: 'base' });
  const coordDigits = PRECISION_DECIMALS[s.coordinatePrecision ?? 'mm'];
  const f3 = (n: number) => fix(n, coordDigits);
  const dirW = s.directionWeight === 'proportional' ? 'távolsággal arányos' : 'távolságtól független';
  const distW = s.distanceWeight === 'dependent' ? 'távolságfüggő' : 'távolságtól független';

  sections.push({
    kind: 'net-summary',
    title: 'A hálózat jellemző adatai',
    columns: ['Jellemző', 'Érték'],
    rows: [
      kv('Összes pont száma', String(r.counts.points)),
      kv('Adott pontok száma', String(r.counts.known)),
      kv('Új pontok száma', String(r.counts.new)),
      kv('Mért irányok száma', String(r.counts.directions)),
      kv('Mért távolságok száma', String(r.counts.distances)),
      kv('Fölös mérések száma', String(r.counts.redundancy)),
      kv('Számításból kihagyott mérési eredmények száma', String(r.counts.excluded)),
      kv('Iránymérés kiegyenlítés előtti középhibája', `${fix(s.sigmaDirection, 1)}″`),
      kv('Távmérés kiegyenlítés előtti középhibája', `${fix(s.sigmaDistance, 0)} mm + ${fix(s.sigmaDistancePerKm, 0)} mm/km`),
      kv('Súlyegység középhibája kiegyenlítés előtt', `${fix(r.sigma0Prior, 2)}″`),
      kv('Iránymérés súlya', dirW),
      kv('Távmérés súlya', distW),
      kv('Átlagos távolság', `${fix(s.averageDistance, 0)} m`),
      kv('Javítások súlyozott négyzetösszege', fix(r.weightedSumSquares, 3)),
      kv('Súlyegység középhibája kiegyenlítés után', r.sigma0Posterior === null ? '–' : `${fix(r.sigma0Posterior, 2)}″`),
      kv('Relatív középhiba', r.sigma0Posterior === null || r.sigma0Posterior === 0 ? '–' : `1/${Math.round(RHO / r.sigma0Posterior)}`),
      kv('Iterációk száma', String(r.iterations)),
      kv('Számítás élessége (koordináta)', s.coordinatePrecision === 'cm' ? 'cm' : s.coordinatePrecision === 'tizedmm' ? 'tized mm' : 'mm'),
    ],
    footer: s.free
      ? [
          'Önálló hálózat: a megadott koordináták csak közelítő értékek; a kiegyenlítés a hálózat alakját adja, belső megkötéssel (a súlypont, az irányzat és a nagyság rögzített).',
          'A végleges elhelyezést a hálózati dátum (eltolás és forgatás) adja meg – lásd „Hálózati dátum”.',
        ]
      : undefined,
  });

  const dirs = r.observations.filter((o) => o.kind === 'direction');
  const dists = r.observations.filter((o) => o.kind === 'distance');
  const maxOf = (list: ObservationResult[]) => list.reduce<ObservationResult | null>((m, o) => (!m || Math.abs(o.residual) > Math.abs(m.residual) ? o : m), null);
  const md = maxOf(dirs);
  const ms = maxOf(dists);
  sections.push({
    kind: 'net-max',
    title: 'Maximális javítások kimutatása',
    columns: ['', 'Álláspont', 'Irányzott pont', 'Javítás', 'Hibahatár'],
    rows: [
      ...(md ? [{ cells: ['Iránymérés', md.station, md.target, `${fix(md.residual, 0)}″`, `(${fix(md.limit, 0)})`], role: 'base' as const }] : []),
      ...(ms ? [{ cells: ['Távmérés', ms.station, ms.target, `${fix(ms.residual, 0)} mm`, `(${fix(ms.limit, 0)})`], role: 'base' as const }] : []),
    ],
  });

  const tests: Row[] = [];
  const notes: string[] = [];
  if (r.globalTest) {
    const g = r.globalTest;
    tests.push(kv('Súlyegység középhibája kiegyenlítés előtt', fix(r.sigma0Prior, 2)));
    tests.push(kv('Súlyegység középhibája kiegyenlítés után', fix(r.sigma0Posterior!, 2)));
    tests.push(kv('Fölös mérések száma', String(r.counts.redundancy)));
    tests.push(kv('Elfogadható intervallum (a súlyegység középhibájára)', `${fix(g.lower, 2)} … ${fix(g.upper, 2)}`));
    notes.push(`A globális teszt ${fix(s.probability * 100, 0)} %-os valószínűségi szinten ${g.accepted ? 'elfogadható' : 'nem fogadható el'}.`);
  }
  if (r.localTest) {
    const l = r.localTest;
    tests.push(kv('Legnagyobb standardizált javítás', `${l.station} → ${l.target} (${l.kind}): ${fix(l.stat, 2)}, elméleti határ ±${fix(l.theoretical, 2)}`));
    notes.push(`A lokális teszt (u próba) ${fix(s.probability * 100, 0)} %-os valószínűségi szinten ${l.accepted ? 'elfogadható' : 'nem fogadható el'}.`);
  }
  sections.push({ kind: 'net-tests', title: `Statisztikai próbák durva hibák kimutatására (valószínűségi szint: ${fix(s.probability * 100, 0)} %)`, columns: ['Mutató', 'Érték'], rows: tests, footer: notes });

  const known = new Map(knownPoints.map((p) => [p.id, p]));
  if (s.free) {
    sections.push({
      kind: 'net-datum',
      title: 'Önálló hálózat – a hálózat elhelyezése',
      columns: ['Jellemző', 'Érték'],
      rows: [
        kv('Dátum', 'belső megkötés (súlypont, irányzat és nagyság rögzített)'),
        kv('A hálózat pontjai (mind közelítő érték)', String(r.counts.new)),
        kv('Rögzített szabadsági fokok', String(4 - (r.counts.distances > 0 ? 1 : 0))),
      ],
      footer: [
        'A hálózat a szabad kiegyenlítés után a közelítő koordináták súlypontjában, irányzatában és nagyságában marad.',
        'A végleges elhelyezés az „Eltolás és forgatás” (hálózati dátum) megadásával történik; ekkor a pontok koordinátái a kívánt rendszerbe kerülnek.',
      ],
    });
  } else {
    sections.push({
      kind: 'net-known',
      title: 'Felhasznált vízszintes alappontok',
      columns: ['Pontszám', 'Jelölés', 'Y', 'X'],
      rows: [...knownUsed].sort().map<Row>((id) => ({ cells: [id, known.get(id)!.mark, f3(known.get(id)!.y), f3(known.get(id)!.x)], role: 'base' })),
    });
  }

  sections.push({
    kind: 'net-points',
    title: 'Kiegyenlítéssel meghatározott vízszintes pontok',
    columns: ['Pontszám', 'Y', 'X', 'my [cm]', 'mx [cm]', 'max [cm]', 'min [cm]', 'szög [°]', 'ΔY [m]', 'ΔX [m]'],
    rows: r.points.map<Row>((p) => ({
      cells: [p.id, f3(p.y), f3(p.x), fix(p.my * 100, 1), fix(p.mx * 100, 1), fix(p.semiMajor * 100, 1), fix(p.semiMinor * 100, 1), fix(p.angle, 0), fix(p.dy, 3), fix(p.dx, 3)],
      role: 'result',
    })),
  });

  for (const st of stations) {
    const rows: Row[] = [];
    const list = r.observations.filter((o) => o.station === st.id);
    const targets = [...new Set(list.map((o) => o.target))];
    for (const t of targets) {
      const d = list.find((o) => o.target === t && o.kind === 'direction');
      const q = list.find((o) => o.target === t && o.kind === 'distance');
      const orient = (o: ObservationResult | undefined) => (o && o.orientation !== null ? formatDms(o.orientation) : '');
      rows.push({
        cells: [
          t,
          d ? formatDms(d.observed) : '',
          d ? formatDms(d.computed) : '',
          orient(d),
          d ? (d.excluded ? `${fix(d.residual, 0)}` : fix(d.residual, 0)) : '',
          d ? `(${fix(d.limit, 0)})` : '',
          d ? (d.excluded ? (d.manual ? 'kizárva' : 'kihagyva') : d.stat === null ? '–' : fix(d.stat, 2)) : '',
          d && d.redundancy !== null ? fix(d.redundancy, 2) : '',
          q ? f3(q.observed) : '',
          q ? f3(q.computed) : '',
          q ? fix(q.residual, 0) : '',
          q ? `(${fix(q.limit, 0)})` : '',
          q ? (q.excluded ? (q.manual ? 'kizárva' : 'kihagyva') : q.stat === null ? '–' : fix(q.stat, 2)) : '',
          q && q.redundancy !== null ? fix(q.redundancy, 2) : '',
        ],
        role: d?.excluded || q?.excluded ? 'input' : 'base',
        key: `${st.id}>${t}`,
      });
    }
    sections.push({
      kind: 'net-station',
      title: `Mérési jegyzőkönyv – álláspont: ${st.id}`,
      columns: ['Irányzott pont', 'Irányérték', 'Irányszög', 'Táj.szög', 'Jav. [″]', 'Hhat.', 'Stat.', 'f', 'Mért táv.', 'Számított táv.', 'Jav. [mm]', 'Hhat.', 'Stat.', 'f'],
      rows,
      footer: [`zk = ${formatDms(r.orientations.get(st.id)!)}`],
    });
  }
  return sections;
}
