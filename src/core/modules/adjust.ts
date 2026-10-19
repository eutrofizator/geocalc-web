import { DEG, formatDms, formatDmsSigned, normDeg, parseDms, wrapDeg } from '../angle';
import { CalcError } from '../errors';
import { fix } from '../format';
import { parseNum, splitFields } from '../parser';
import type { Block, Context, Handler, Row, Section } from '../types';
import { headerFields, lineError, newPoint, requireId } from './common';

const c3 = (n: number) => fix(n, 3);
const DASH = '-';

interface Pt {
  y: number;
  x: number;
}

/** Egy mérés: belső irány (az ismeretlen ponton), külső irány (ismert ponton) vagy távolság. */
export interface Obs {
  kind: 'dirIn' | 'dirOut' | 'dist';
  K: Pt;
  /** Irányoknál radián (külső iránynál irányszög = leolvasás + tárolt tájékozás), távolságnál méter. */
  value: number;
  /** Középhiba radiánban, illetve méterben. */
  sigma: number;
}

export interface Solution {
  y: number;
  x: number;
  /** Tájékozási szög (radián); csak belső irányok esetén értelmezett. */
  zk: number;
  cost: number;
}

const wrapRad = (r: number) => {
  const t = r % (2 * Math.PI);
  return t > Math.PI ? t - 2 * Math.PI : t < -Math.PI ? t + 2 * Math.PI : t;
};

/** Egy mérés javítása (mért − modell) és a Jacobi-sora az (Y, X, zk) ismeretlenekre. */
function evaluate(o: Obs, p: { y: number; x: number; zk: number }): { r: number; row: [number, number, number] } {
  if (o.kind === 'dirIn') {
    const dy = o.K.y - p.y;
    const dx = o.K.x - p.x;
    const d2 = dx * dx + dy * dy;
    return { r: wrapRad(o.value - (Math.atan2(dy, dx) - p.zk)), row: [dx / d2, -dy / d2, 1] };
  }
  const dy = p.y - o.K.y;
  const dx = p.x - o.K.x;
  if (o.kind === 'dirOut') {
    const d2 = dx * dx + dy * dy;
    return { r: wrapRad(o.value - Math.atan2(dy, dx)), row: [-dx / d2, dy / d2, 0] };
  }
  const d = Math.hypot(dy, dx);
  return { r: o.value - d, row: [-dy / d, -dx / d, 0] };
}

/**
 * Súlyok az aktuális közelítő pontnál. A távolságok súlya 1/σ², az irányoké keresztirányú eltérésként
 * (irányhiba × távolság) számított, 1 km-re vonatkoztatott állandó középhibával: w = (D/1000)² / σ².
 * Így a hosszabb irány a pontot erősebben köti, ahogy a régi program súlyozása is viselkedik.
 */
function weightsAt(obs: Obs[], p: { y: number; x: number }): number[] {
  return obs.map((o) => {
    if (o.kind === 'dist') return 1 / (o.sigma * o.sigma);
    const f = Math.hypot(p.y - o.K.y, p.x - o.K.x) / 1000;
    return (f * f) / (o.sigma * o.sigma);
  });
}

function costWith(obs: Obs[], p: { y: number; x: number; zk: number }, w: number[]): number {
  return obs.reduce((s, o, i) => s + w[i]! * evaluate(o, p).r ** 2, 0);
}

/** Gauss-elimináció részleges főelem-kereséssel; szinguláris rendszerre null. */
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    if (Math.abs(m[piv]![c]!) < 1e-300) return null;
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

/** Súlyozott legkisebb négyzetes illesztés Levenberg–Marquardt iterációval egy kezdőértékből. */
function fitFrom(obs: Obs[], useZk: boolean, start: { y: number; x: number; zk: number }): Solution | null {
  const n = useZk ? 3 : 2;
  let p = { ...start };
  let lambda = 1e-3;
  let cost = costWith(obs, p, weightsAt(obs, p));
  for (let iter = 0; iter < 200; iter++) {
    const weights = weightsAt(obs, p);
    cost = costWith(obs, p, weights);
    const N = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const g = new Array<number>(n).fill(0);
    obs.forEach((o, k) => {
      const { r, row } = evaluate(o, p);
      const w = weights[k]!;
      for (let i = 0; i < n; i++) {
        g[i]! -= w * row[i]! * r;
        for (let j = 0; j < n; j++) N[i]![j]! += w * row[i]! * row[j]!;
      }
    });
    let improved = false;
    for (let attempt = 0; attempt < 30 && !improved; attempt++) {
      const damped = N.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-30 : v)));
      const delta = solveLinear(damped, g);
      if (!delta) {
        lambda *= 10;
        continue;
      }
      const q = { y: p.y + delta[0]!, x: p.x + delta[1]!, zk: useZk ? p.zk + delta[2]! : 0 };
      const c = costWith(obs, q, weights);
      if (Number.isFinite(c) && c <= cost) {
        const step = Math.hypot(delta[0]!, delta[1]!);
        p = q;
        cost = c;
        lambda = Math.max(lambda / 4, 1e-12);
        improved = true;
        if (step < 1e-10 && (!useZk || Math.abs(delta[2]!) < 1e-14)) {
          return { ...p, cost: costWith(obs, p, weightsAt(obs, p)) };
        }
      } else {
        lambda *= 4;
      }
    }
    if (!improved) break;
  }
  const finalCost = costWith(obs, p, weightsAt(obs, p));
  return Number.isFinite(finalCost) ? { ...p, cost: finalCost } : null;
}

/** Több kezdőértékről indul (súlypont és körülötte 8 irány), és a legkisebb négyzetösszegű megoldást adja. */
export function adjust(obs: Obs[], useZk: boolean, orientationReadings: { K: Pt; l: number }[]): Solution {
  const known = obs.map((o) => o.K);
  const cy = known.reduce((a, k) => a + k.y, 0) / known.length;
  const cx = known.reduce((a, k) => a + k.x, 0) / known.length;
  const spread = Math.max(1, ...known.map((k) => Math.hypot(k.y - cy, k.x - cx)));
  const starts: Pt[] = [{ y: cy, x: cx }];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    starts.push({ y: cy + spread * 0.5 * Math.sin(a), x: cx + spread * 0.5 * Math.cos(a) });
  }
  let best: Solution | null = null;
  for (const s of starts) {
    let zk0 = 0;
    if (useZk && orientationReadings.length > 0) {
      let sy = 0;
      let sx = 0;
      for (const r of orientationReadings) {
        const a = Math.atan2(r.K.y - s.y, r.K.x - s.x) - r.l;
        sy += Math.sin(a);
        sx += Math.cos(a);
      }
      zk0 = Math.atan2(sy, sx);
    }
    const sol = fitFrom(obs, useZk, { y: s.y, x: s.x, zk: zk0 });
    if (sol && (!best || sol.cost < best.cost - 1e-9)) best = sol;
  }
  if (!best) throw new CalcError('A mérések alapján a pont nem határozható meg.');
  return best;
}

interface Spec {
  kind: 'vp' | 'ek';
  title: string;
}

function weights(fields: string[]): { sigmaDir: number; sigmaDist: number; pkod: string | undefined } {
  const mi = parseNum(fields[1], 'az irányok megbízhatósága (Mi)') ?? 5;
  const ti = parseNum(fields[2], 'a távolságok megbízhatósága (Ti)') ?? 2.5;
  if (mi <= 0 || ti <= 0) throw new CalcError('A megbízhatóság értéke pozitív kell legyen.');
  return { sigmaDir: (mi / 3600) * DEG, sigmaDist: ti / 100, pkod: fields[3] };
}

interface Line {
  id: string;
  K: Pt;
  /** Külső irány (az ismert ponton mért), belső irány (az ismeretlen ponton mért), távolság. */
  lk: number | null;
  lb: number | null;
  t: number | null;
}

function parseLines(ctx: Context, block: Block, spec: Spec): Line[] {
  const out: Line[] = [];
  for (const l of block.lines.slice(1)) {
    try {
      const f = splitFields(l.text);
      const id = requireId(f, 'az ismert pont száma', l.no);
      const K = ctx.getPoint(id, l.no);
      const dir = (t: string | undefined, what: string) => {
        const v = parseNum(t, `${id}: ${what}`);
        return v === null ? null : parseDms(t!);
      };
      const line: Line =
        spec.kind === 'vp'
          ? { id, K, lk: null, lb: dir(f[1], 'irány'), t: parseNum(f[2], `${id}: távolság`) }
          : { id, K, lk: dir(f[1], 'külső irány'), lb: dir(f[2], 'belső irány'), t: parseNum(f[3], `${id}: távolság`) };
      if (line.lk === null && line.lb === null && line.t === null) {
        throw new CalcError(`${id}: nincs mérés megadva.`, l.no);
      }
      out.push(line);
    } catch (e) {
      lineError(ctx, e, l.no);
    }
  }
  return out;
}

function run(spec: Spec): Handler {
  return (ctx, block) => {
    const { fields, no } = headerFields(block, 'az új pont száma');
    const newId = requireId(fields, 'az új pont száma', no);
    const { sigmaDir, sigmaDist, pkod } = weights(fields);
    const lines = parseLines(ctx, block, spec);

    const obs: Obs[] = [];
    const orientation: { K: Pt; l: number }[] = [];
    for (const l of lines) {
      if (l.lb !== null) {
        obs.push({ kind: 'dirIn', K: l.K, value: l.lb * DEG, sigma: sigmaDir });
        orientation.push({ K: l.K, l: l.lb * DEG });
      }
      if (l.lk !== null) obs.push({ kind: 'dirOut', K: l.K, value: normDeg(l.lk + ctx.getZk(l.id)) * DEG, sigma: sigmaDir });
      if (l.t !== null) obs.push({ kind: 'dist', K: l.K, value: l.t, sigma: sigmaDist });
    }
    const useZk = orientation.length > 0;
    const unknowns = useZk ? 3 : 2;
    if (obs.length < unknowns) {
      throw new CalcError(`Kevés mérés: legalább ${unknowns} szükséges (${obs.length} van).`, block.no);
    }
    if (obs.length === 0) throw new CalcError('Nincs mérés.', block.no);

    const sol = adjust(obs, useZk, orientation);
    const zkDeg = useZk ? (Math.round(normDeg(sol.zk / DEG) * 3600) / 3600) % 360 : null;
    ctx.setPoint(newPoint(newId, sol.y, sol.x, null, pkod));
    if (zkDeg !== null) ctx.zk.set(newId, zkDeg);

    // Javítás: távolságnál és külső iránynál számított − mért; belső iránynál mért − számított (a súgó konvenciója).
    const vDir = (o: Obs) => formatDmsSigned(wrapDeg((o.kind === 'dirIn' ? 1 : -1) * (evaluate(o, sol).r / DEG)));
    const vDist = (o: Obs) => c3(-evaluate(o, sol).r);

    const rows: Row[] = [];
    for (const l of lines) {
      const find = (k: Obs['kind']) => obs.find((o) => o.K === l.K && o.kind === k);
      const oIn = find('dirIn');
      const oOut = find('dirOut');
      const oDist = find('dist');
      const common = [l.id, c3(l.K.y), c3(l.K.x)];
      if (spec.kind === 'vp') {
        rows.push({
          cells: [...common, l.lb === null ? DASH : formatDms(l.lb), l.t === null ? DASH : c3(l.t), oIn ? vDir(oIn) : DASH, oDist ? vDist(oDist) : DASH],
          role: 'base',
        });
      } else {
        rows.push({
          cells: [
            ...common,
            l.lk === null ? DASH : formatDms(l.lk),
            l.lb === null ? DASH : formatDms(l.lb),
            l.t === null ? DASH : c3(l.t),
            oOut ? vDir(oOut) : DASH,
            oIn ? vDir(oIn) : DASH,
            oDist ? vDist(oDist) : DASH,
          ],
          role: 'base',
        });
      }
    }
    const width = spec.kind === 'vp' ? 7 : 9;
    const result = [newId, c3(sol.y), c3(sol.x), zkDeg === null ? '' : `Z(k) = ${formatDms(zkDeg)}`];
    rows.push({ cells: [...result, ...new Array<string>(width - result.length).fill('')], role: 'result' });

    const section: Section = {
      kind: spec.kind,
      title: spec.title,
      columns:
        spec.kind === 'vp'
          ? ['Pontszám', 'Y', 'X', 'Li', 'T', 'dL', 'dT']
          : ['Pontszám', 'Y', 'X', 'Lk', 'Lb', 'T', 'dLk', 'dLb', 'dT'],
      rows,
      footer: [
        `Középhibák: irány ${fix((sigmaDir / DEG) * 3600, 1)}″ (1 km-en), távolság ${fix(sigmaDist * 100, 1)} cm; ${obs.length} mérés, ${unknowns} ismeretlen.`,
      ],
    };
    return [section];
  };
}

/** VP – szabad álláspont (vesztett pont): az ismeretlen ponton állva mért irányokból és távolságokból. */
export const vp: Handler = run({ kind: 'vp', title: 'Szabad álláspont (vesztett pont) számítása egypontos kiegyenlítéssel' });

/** EK – egypontos kiegyenlítés: belső és külső irányok és távolságok együttes kiegyenlítése. */
export const ek: Handler = run({ kind: 'ek', title: 'Egypontos kiegyenlítés' });
