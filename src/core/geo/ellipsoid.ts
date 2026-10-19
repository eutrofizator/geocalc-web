export interface Ellipsoid {
  /** Fél nagytengely [m]. */
  a: number;
  /** Lapultság. */
  f: number;
}

/** GRS67 (IUGG 1967) – a HD72 (EOV) ellipszoidja. */
export const GRS67: Ellipsoid = { a: 6378160.0, f: 1 / 298.247167427 };
/** WGS 84. */
export const WGS84: Ellipsoid = { a: 6378137.0, f: 1 / 298.257223563 };

export type Xyz = [number, number, number];

export interface Geodetic {
  /** Földrajzi szélesség [rad]. */
  phi: number;
  /** Földrajzi hosszúság [rad]. */
  lam: number;
  /** Ellipszoid feletti magasság [m]. */
  h: number;
}

export const eccentricitySquared = (e: Ellipsoid) => e.f * (2 - e.f);

export function geodeticToGeocentric(e: Ellipsoid, g: Geodetic): Xyz {
  const es = eccentricitySquared(e);
  const sp = Math.sin(g.phi);
  const n = e.a / Math.sqrt(1 - es * sp * sp);
  return [
    (n + g.h) * Math.cos(g.phi) * Math.cos(g.lam),
    (n + g.h) * Math.cos(g.phi) * Math.sin(g.lam),
    (n * (1 - es) + g.h) * sp,
  ];
}

export function geocentricToGeodetic(e: Ellipsoid, [x, y, z]: Xyz): Geodetic {
  const es = eccentricitySquared(e);
  const p = Math.hypot(x, y);
  let phi = Math.atan2(z, p * (1 - es));
  let h = 0;
  for (let i = 0; i < 30; i++) {
    const sp = Math.sin(phi);
    const n = e.a / Math.sqrt(1 - es * sp * sp);
    h = p / Math.cos(phi) - n;
    const next = Math.atan2(z, p * (1 - (es * n) / (n + h)));
    const done = Math.abs(next - phi) < 1e-15;
    phi = next;
    if (done) break;
  }
  return { phi, lam: Math.atan2(y, x), h };
}
