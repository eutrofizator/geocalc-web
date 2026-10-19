import { CalcError } from '../errors';
import { splitFields } from '../parser';
import { geocentricToGeodetic, type Xyz } from './ellipsoid';
import { applyHelmert, applyHelmertInverse, fitHelmert, toArcsec, type Helmert3dFit, type Helmert3dParams } from './helmert3d';
import { interpolationAt, applyCorrection, type Interpolation, type InterpolationAnchor } from './interpolate';
import { SYSTEMS, type SystemId } from './systems';

export interface NamedCoords {
  id: string;
  coords: number[];
}

/** A beviteli lista (pontszám + koordináták) értelmezése a rendszer oszlopai szerint. */
export function parseCoordinateList(text: string, system: SystemId, twoD: boolean): NamedCoords[] {
  const columns = SYSTEMS[system].columns;
  const needed = system === 'WGS84_XYZ' || !twoD ? columns.length : 2;
  const out: NamedCoords[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '' || line.trim() === ';;') return;
    const f = splitFields(line);
    const id = f[0];
    if (!id) throw new CalcError(`${i + 1}. sor: hiányzó pontszám.`);
    if (seen.has(id)) throw new CalcError(`${i + 1}. sor: a(z) ${id} pontszám többször szerepel.`);
    seen.add(id);
    const values = f.slice(1, 1 + columns.length).map((t, k) => {
      const v = Number(t);
      if (t === '' || !Number.isFinite(v)) throw new CalcError(`${i + 1}. sor (${id}): érvénytelen ${columns[k]} érték: „${t}”.`);
      return v;
    });
    if (values.length < needed) {
      throw new CalcError(`${i + 1}. sor (${id}): ${needed} koordináta kell (${columns.slice(0, needed).join(', ')}), ${values.length} van.`);
    }
    while (values.length < columns.length) values.push(0);
    out.push({ id, coords: values });
  });
  return out;
}

export interface SpatialRequest {
  from: SystemId;
  to: SystemId;
  /** 2D: az ellipszoid feletti magasságokat nem veszi figyelembe (a magasság 0). */
  twoD: boolean;
  /** Közös pontok: azonos pontszámmal szereplő pontok a két listában. */
  commonFrom: NamedCoords[];
  commonTo: NamedCoords[];
  points: NamedCoords[];
  /** Interpoláció: az átszámítandó pontok javítása a közös pontok javításaiból (súgó 65. o.). */
  interpolate?: boolean;
}

export interface ResidualRow {
  id: string;
  /** Geocentrikus javítások [m]. */
  vX: number;
  vY: number;
  vZ: number;
  /** Topocentrikus javítások [m]: kelet, észak, magasság. */
  vE: number;
  vN: number;
  vH: number;
}

export interface ConvertedPoint {
  id: string;
  input: string[];
  output: string[];
}

export interface SpatialResult {
  fit: Helmert3dFit;
  /** Eltolás [m], forgatás [″], méretarány [mm/km] és középhibáik. */
  summary: {
    labels: string[];
    values: number[];
    sigmas: number[];
    units: string[];
  };
  /** Az illeszkedés középhibái: RMS kelet, észak, magasság [m]. */
  rms: { e: number; n: number; h: number };
  commonCount: number;
  residuals: ResidualRow[];
  converted: ConvertedPoint[];
  /** Az átszámított pontok számszerű eredménye (a letöltéshez). */
  convertedValues: NamedCoords[];
  /** Az interpoláció eredménye pontonként (csak ha kértük). */
  interpolations: Interpolation[];
  /** Az átszámított pontok geocentrikus koordinátái (a cél rendszer ellipszoidján). */
  geocentric: Xyz[];
}

/**
 * Térbeli hasonlósági transzformáció két koordináta-rendszer között közös pontokból.
 * A közös pontokból 7 paramétert számít (legkisebb négyzetek), majd átszámítja a kért pontokat.
 */
export function spatialTransform(req: SpatialRequest): SpatialResult {
  if (req.from === req.to) throw new CalcError('A kiinduló és a cél rendszer azonos.');
  const src = SYSTEMS[req.from];
  const dst = SYSTEMS[req.to];

  const byIdTo = new Map(req.commonTo.map((p) => [p.id, p] as const));
  const pairs = req.commonFrom.filter((p) => byIdTo.has(p.id)).map((p) => ({ id: p.id, from: p.coords, to: byIdTo.get(p.id)!.coords }));
  if (pairs.length < 3) {
    throw new CalcError(`A közös pontok száma (${pairs.length}) kevés: legalább 3 azonos pontszámú pont kell mindkét rendszerben.`);
  }

  const srcXyz = pairs.map((p) => src.toGeocentric(p.from, req.twoD));
  const dstXyz = pairs.map((p) => dst.toGeocentric(p.to, req.twoD));
  const fit = fitHelmert(srcXyz, dstXyz);

  const residuals: ResidualRow[] = pairs.map((p, i) => {
    const [vX, vY, vZ] = fit.residuals[i]!;
    const g = geocentricToGeodetic(dst.ellipsoid, dstXyz[i]!);
    const sl = Math.sin(g.lam);
    const cl = Math.cos(g.lam);
    const sp = Math.sin(g.phi);
    const cp = Math.cos(g.phi);
    return {
      id: p.id,
      vX, vY, vZ,
      vE: -sl * vX + cl * vY,
      vN: -sp * cl * vX - sp * sl * vY + cp * vZ,
      vH: cp * cl * vX + cp * sl * vY + sp * vZ,
    };
  });
  const rms = (pick: (r: ResidualRow) => number) => Math.sqrt(residuals.reduce((s, r) => s + pick(r) ** 2, 0) / residuals.length);

  const converted: ConvertedPoint[] = [];
  const convertedValues: NamedCoords[] = [];
  const interpolations: Interpolation[] = [];
  const geocentric: Xyz[] = [];
  // Az interpolációhoz a közös pontok cél rendszerbeli helye és javítása kell (súgó 65. o.).
  const anchors: InterpolationAnchor[] = pairs.map((p, i) => ({ id: p.id, xyz: dstXyz[i]!, residual: fit.residuals[i]! }));
  for (const p of req.points) {
    const base = applyHelmert(fit.params, src.toGeocentric(p.coords, req.twoD));
    let x = base;
    if (req.interpolate) {
      const it = interpolationAt(p.id, base, dst.ellipsoid, anchors);
      if (it) {
        interpolations.push(it);
        x = applyCorrection(base, it.v);
      }
    }
    const out = dst.fromGeocentric(x, req.twoD);
    converted.push({ id: p.id, input: src.format(p.coords), output: dst.format(out) });
    convertedValues.push({ id: p.id, coords: out });
    geocentric.push(x);
  }

  const { t, r, s } = fit.params;
  const sg = fit.sigmas;
  return {
    fit,
    summary: {
      labels: ['Eltolás X', 'Eltolás Y', 'Eltolás Z', 'Forgatás X', 'Forgatás Y', 'Forgatás Z', 'Méretarány'],
      values: [t[0], t[1], t[2], toArcsec(r[0]), toArcsec(r[1]), toArcsec(r[2]), s * 1e6],
      sigmas: [sg[0]!, sg[1]!, sg[2]!, toArcsec(sg[3]!), toArcsec(sg[4]!), toArcsec(sg[5]!), sg[6]! * 1e6],
      units: ['m', 'm', 'm', '″', '″', '″', 'mm/km'],
    },
    rms: { e: rms((x) => x.vE), n: rms((x) => x.vN), h: rms((x) => x.vH) },
    commonCount: pairs.length,
    residuals,
    converted,
    convertedValues,
    interpolations,
    geocentric,
  };
}

/** A transzformációs paraméterek visszafelé alkalmazása (pl. a mentett paraméterek inverze). */
export function invertPoint(params: Helmert3dParams, x: Xyz): Xyz {
  return applyHelmertInverse(params, x);
}
