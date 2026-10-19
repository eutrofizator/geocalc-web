import { EOV } from './eov';
import { GRS67, WGS84, geocentricToGeodetic, geodeticToGeocentric, type Ellipsoid, type Xyz } from './ellipsoid';
import { UTM33, UTM34, type TransverseMercator } from './utm';

const DEG = Math.PI / 180;

export type SystemId = 'EOV' | 'WGS84_XYZ' | 'WGS84_FLH' | 'UTM33' | 'UTM34';

export interface CoordSystem {
  id: SystemId;
  label: string;
  /** A koordináták sorrendje és neve a beviteli állományokban. */
  columns: string[];
  ellipsoid: Ellipsoid;
  /** Geocentrikus koordináták a rendszer saját ellipszoidján (2D esetén a magasság 0). */
  toGeocentric(c: number[], twoD: boolean): Xyz;
  fromGeocentric(x: Xyz, twoD: boolean): number[];
  /** A koordináták kiírása (a magasság és a földrajzi szög külön élességgel). */
  format(c: number[]): string[];
}

const fixed = (n: number, d: number) => {
  const s = n.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
};

function projected(
  id: SystemId,
  label: string,
  ellipsoid: Ellipsoid,
  projection: Pick<TransverseMercator, 'forward' | 'inverse'>,
): CoordSystem {
  return {
    id,
    label,
    columns: ['Y', 'X', 'M'],
    ellipsoid,
    toGeocentric(c, twoD) {
      const { phi, lam } = projection.inverse(c[0]!, c[1]!);
      return geodeticToGeocentric(ellipsoid, { phi, lam, h: twoD ? 0 : (c[2] ?? 0) });
    },
    fromGeocentric(x, twoD) {
      const g = geocentricToGeodetic(ellipsoid, x);
      const p = projection.forward(g.phi, g.lam);
      return [p.y, p.x, twoD ? 0 : g.h];
    },
    format: (c) => [fixed(c[0]!, 3), fixed(c[1]!, 3), fixed(c[2] ?? 0, 3)],
  };
}

export const SYSTEMS: Record<SystemId, CoordSystem> = {
  EOV: projected('EOV', 'EOV (HD72)', GRS67, EOV),
  UTM33: projected('UTM33', 'UTM 33 (WGS 84)', WGS84, UTM33),
  UTM34: projected('UTM34', 'UTM 34 (WGS 84)', WGS84, UTM34),
  WGS84_XYZ: {
    id: 'WGS84_XYZ',
    label: 'WGS 84 (X, Y, Z geocentrikus)',
    columns: ['X', 'Y', 'Z'],
    ellipsoid: WGS84,
    toGeocentric(c, twoD) {
      const x: Xyz = [c[0]!, c[1]!, c[2]!];
      return twoD ? geodeticToGeocentric(WGS84, { ...geocentricToGeodetic(WGS84, x), h: 0 }) : x;
    },
    fromGeocentric(x, twoD) {
      return twoD ? geodeticToGeocentric(WGS84, { ...geocentricToGeodetic(WGS84, x), h: 0 }) : [...x];
    },
    format: (c) => c.map((v) => fixed(v, 3)),
  },
  WGS84_FLH: {
    id: 'WGS84_FLH',
    label: 'WGS 84 (φ, λ fokban, h)',
    columns: ['φ [°]', 'λ [°]', 'h [m]'],
    ellipsoid: WGS84,
    toGeocentric: (c, twoD) => geodeticToGeocentric(WGS84, { phi: c[0]! * DEG, lam: c[1]! * DEG, h: twoD ? 0 : (c[2] ?? 0) }),
    fromGeocentric(x, twoD) {
      const g = geocentricToGeodetic(WGS84, x);
      return [g.phi / DEG, g.lam / DEG, twoD ? 0 : g.h];
    },
    format: (c) => [fixed(c[0]!, 9), fixed(c[1]!, 9), fixed(c[2] ?? 0, 3)],
  },
};

export const SYSTEM_IDS = Object.keys(SYSTEMS) as SystemId[];
