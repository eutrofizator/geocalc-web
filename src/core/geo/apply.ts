import { geocentricToGeodetic, type Xyz } from './ellipsoid';
import { applyHelmert, applyHelmertInverse, toArcsec, type Helmert3dParams } from './helmert3d';
import { applyCorrection, interpolationAt, type Interpolation, type InterpolationAnchor } from './interpolate';
import type { ConvertedPoint, NamedCoords } from './spatial';
import { SYSTEMS, type SystemId } from './systems';

/**
 * A Térbeli transzformáció/Átszámítás munkalap magja (súgó 63. o.).
 *
 * A Transzformációs paraméterek munkalapon meghatározott (vagy kézzel megadott) 7 paraméterrel
 * végzi a pontok átszámítását. A súgó (63. o.) szerint a paraméterek manuálisan is szerkeszthetők;
 * a Leica SKI programmal számított forgatási szögek az X, Y és Z tengelynél ellentétes előjelűek
 * (az eltolás és a méretarány mm/km-ben azonos).
 */

const ARCSEC = Math.PI / 180 / 3600;

/** A 7 paraméter szerkeszthető mezői: az eltolás méterben, a forgatás szögmásodpercben, a méretarány mm/km-ben. */
export interface ParamFields {
  tX: number;
  tY: number;
  tZ: number;
  rX: number;
  rY: number;
  rZ: number;
  sMmKm: number;
}

export const PARAM_FIELD_META: { key: keyof ParamFields; label: string; unit: string; digits: number }[] = [
  { key: 'tX', label: 'Eltolás X', unit: 'm', digits: 4 },
  { key: 'tY', label: 'Eltolás Y', unit: 'm', digits: 4 },
  { key: 'tZ', label: 'Eltolás Z', unit: 'm', digits: 4 },
  { key: 'rX', label: 'Forgatás X', unit: '″', digits: 5 },
  { key: 'rY', label: 'Forgatás Y', unit: '″', digits: 5 },
  { key: 'rZ', label: 'Forgatás Z', unit: '″', digits: 5 },
  { key: 'sMmKm', label: 'Méretarány', unit: 'mm/km', digits: 2 },
];

export const EMPTY_PARAM_FIELDS: ParamFields = { tX: 0, tY: 0, tZ: 0, rX: 0, rY: 0, rZ: 0, sMmKm: 0 };

export function paramsToFields(p: Helmert3dParams): ParamFields {
  return { tX: p.t[0], tY: p.t[1], tZ: p.t[2], rX: toArcsec(p.r[0]), rY: toArcsec(p.r[1]), rZ: toArcsec(p.r[2]), sMmKm: p.s * 1e6 };
}

export function fieldsToParams(f: ParamFields): Helmert3dParams {
  return { t: [f.tX, f.tY, f.tZ], r: [f.rX * ARCSEC, f.rY * ARCSEC, f.rZ * ARCSEC], s: f.sMmKm / 1e6 };
}

/**
 * A Leica SKI programmal közölt paraméterek átvétele: az X, Y és Z tengely körüli forgatási szögek
 * ellentétes előjelűek (súgó 63. o.); az eltolás és a méretarány változatlan.
 */
export function fromSkiFields(f: ParamFields): ParamFields {
  return { ...f, rX: -f.rX, rY: -f.rY, rZ: -f.rZ };
}

export interface ApplyRequest {
  from: SystemId;
  to: SystemId;
  twoD: boolean;
  params: Helmert3dParams;
  points: NamedCoords[];
  /**
   * Interpoláció: a közös pontok helye és javítása (a paraméterszámítás munkalapról átvéve).
   * Ha meg van adva, a pontok javítása a súgó 65. oldala szerint interpolálódik.
   */
  anchors?: InterpolationAnchor[];
}

export interface ApplyResult {
  converted: ConvertedPoint[];
  convertedValues: NamedCoords[];
  /** A transzformált pontok geocentrikus koordinátái a cél rendszer ellipszoidján. */
  geocentric: Xyz[];
  /** A transzformált pontok földrajzi koordinátái a cél rendszer ellipszoidján: φ, λ [fok], h [m]. */
  geographic: [number, number, number][];
  /** Az interpoláció eredménye pontonként (csak ha voltak közös pontok). */
  interpolations: Interpolation[];
}

const DEG = Math.PI / 180;

/** A megadott paraméterek alkalmazása a pontokra (illesztés nélkül). */
export function applyTransform(req: ApplyRequest): ApplyResult {
  const src = SYSTEMS[req.from];
  const dst = SYSTEMS[req.to];
  const converted: ConvertedPoint[] = [];
  const convertedValues: NamedCoords[] = [];
  const geocentric: Xyz[] = [];
  const geographic: [number, number, number][] = [];
  const interpolations: Interpolation[] = [];
  for (const p of req.points) {
    const base = applyHelmert(req.params, src.toGeocentric(p.coords, req.twoD));
    let x = base;
    if (req.anchors && req.anchors.length > 0) {
      const it = interpolationAt(p.id, base, dst.ellipsoid, req.anchors);
      if (it) {
        interpolations.push(it);
        x = applyCorrection(base, it.v);
      }
    }
    const out = dst.fromGeocentric(x, req.twoD);
    const g = geocentricToGeodetic(dst.ellipsoid, x);
    converted.push({ id: p.id, input: src.format(p.coords), output: dst.format(out) });
    convertedValues.push({ id: p.id, coords: out });
    geocentric.push(x);
    geographic.push([g.phi / DEG, g.lam / DEG, req.twoD ? 0 : g.h]);
  }
  return { converted, convertedValues, geocentric, geographic, interpolations };
}

/** A paraméterek ellenőrzése (a kézi megadáshoz): az eltolás és a forgatás véges, a méretarány a valósághoz közeli. */
export function checkParams(f: ParamFields): string | null {
  for (const { key, label } of PARAM_FIELD_META) {
    if (!Number.isFinite(f[key])) return `A(z) „${label}” értéke nem szám.`;
  }
  if (Math.abs(f.sMmKm) > 100000) return 'A méretarány (mm/km) nagyságrendje hibás: |s| ≤ 100000 mm/km lehet.';
  return null;
}

/** Az inverz transzformáció (a cél rendszerből a kiindulóba) ugyanazokkal a paraméterekkel. */
export function applyInverse(params: Helmert3dParams, x: Xyz): Xyz {
  return applyHelmertInverse(params, x);
}
