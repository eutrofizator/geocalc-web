import { WGS84, type Ellipsoid } from './ellipsoid';

const DEG = Math.PI / 180;

/** Keresztirányú Mercator-vetület (Krüger-sor, 4. rendig; milliméter alatti pontosság a zónán belül). */
export class TransverseMercator {
  private readonly A: number;
  private readonly e: number;
  private readonly alpha: number[];
  private readonly beta: number[];
  private readonly delta: number[];

  constructor(
    ell: Ellipsoid,
    private readonly lam0: number,
    private readonly k0: number,
    private readonly falseEasting: number,
    private readonly falseNorthing: number,
  ) {
    const n = ell.f / (2 - ell.f);
    const n2 = n * n;
    const n3 = n2 * n;
    const n4 = n3 * n;
    this.e = (2 * Math.sqrt(n)) / (1 + n);
    this.A = (ell.a / (1 + n)) * (1 + n2 / 4 + n4 / 64);
    this.alpha = [
      0,
      n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180,
      (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440,
      (61 * n3) / 240 - (103 * n4) / 140,
      (49561 * n4) / 161280,
    ];
    this.beta = [
      0,
      n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360,
      n2 / 48 + n3 / 15 - (437 * n4) / 1440,
      (17 * n3) / 480 - (37 * n4) / 840,
      (4397 * n4) / 161280,
    ];
    this.delta = [
      0,
      2 * n - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45,
      (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45,
      (56 * n3) / 15 - (136 * n4) / 35,
      (4279 * n4) / 630,
    ];
  }

  /** Földrajzi koordináták [rad] → (Y keleti, X északi) [m]. */
  forward(phi: number, lam: number): { y: number; x: number } {
    const dl = lam - this.lam0;
    const sp = Math.sin(phi);
    const t = Math.sinh(Math.atanh(sp) - this.e * Math.atanh(this.e * sp));
    const xi0 = Math.atan2(t, Math.cos(dl));
    const eta0 = Math.asinh(Math.sin(dl) / Math.hypot(t, Math.cos(dl)));
    let xi = xi0;
    let eta = eta0;
    for (let j = 1; j <= 4; j++) {
      xi += this.alpha[j]! * Math.sin(2 * j * xi0) * Math.cosh(2 * j * eta0);
      eta += this.alpha[j]! * Math.cos(2 * j * xi0) * Math.sinh(2 * j * eta0);
    }
    return { y: this.falseEasting + this.k0 * this.A * eta, x: this.falseNorthing + this.k0 * this.A * xi };
  }

  inverse(y: number, x: number): { phi: number; lam: number } {
    const xi = (x - this.falseNorthing) / (this.k0 * this.A);
    const eta = (y - this.falseEasting) / (this.k0 * this.A);
    let xi0 = xi;
    let eta0 = eta;
    for (let j = 1; j <= 4; j++) {
      xi0 -= this.beta[j]! * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      eta0 -= this.beta[j]! * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    const chi = Math.asin(Math.sin(xi0) / Math.cosh(eta0));
    let phi = chi;
    for (let j = 1; j <= 4; j++) phi += this.delta[j]! * Math.sin(2 * j * chi);
    return { phi, lam: this.lam0 + Math.atan2(Math.sinh(eta0), Math.cos(xi0)) };
  }
}

/** UTM-zóna a WGS 84 ellipszoidon: k0 = 0.9996, Y0 = 500 000 m. A 33. zóna középmeridiánja 15°, a 34.-é 21°. */
export const utmZone = (zone: number) =>
  new TransverseMercator(WGS84, (zone * 6 - 183) * DEG, 0.9996, 500000, 0);

export const UTM33 = utmZone(33);
export const UTM34 = utmZone(34);
