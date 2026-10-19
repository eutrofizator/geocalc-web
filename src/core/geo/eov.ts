import { GRS67, eccentricitySquared, type Ellipsoid } from './ellipsoid';

const DEG = Math.PI / 180;
const PI4 = Math.PI / 4;

/**
 * Svájci típusú ferdetengelyű, szögtartó hengervetület (az ellipszoidot szögtartóan a Gauss-gömbre,
 * onnan a ferde hengerre képezi). Az EOV (Egységes Országos Vetület) ezt a vetületet használja,
 * a GRS67 ellipszoidon; a képletek a PROJ `somerc` megvalósításával egyeznek.
 */
export class SwissObliqueMercator {
  private readonly e: number;
  private readonly c: number;
  private readonly K: number;
  private readonly kR: number;
  private readonly sinp0: number;
  private readonly cosp0: number;
  private readonly hlfE: number;
  private readonly oneEsInv: number;

  constructor(
    private readonly ell: Ellipsoid,
    private readonly phi0: number,
    private readonly lam0: number,
    k0: number,
    private readonly falseEasting: number,
    private readonly falseNorthing: number,
  ) {
    const es = eccentricitySquared(ell);
    this.e = Math.sqrt(es);
    this.hlfE = 0.5 * this.e;
    this.oneEsInv = 1 / (1 - es);
    const cp = Math.cos(phi0) ** 2;
    this.c = Math.sqrt(1 + es * cp * cp * this.oneEsInv);
    const sp = Math.sin(phi0);
    this.sinp0 = sp / this.c;
    const phip0 = Math.asin(this.sinp0);
    this.cosp0 = Math.cos(phip0);
    const spe = sp * this.e;
    this.K =
      Math.log(Math.tan(PI4 + 0.5 * phip0)) -
      this.c * (Math.log(Math.tan(PI4 + 0.5 * phi0)) - this.hlfE * Math.log((1 + spe) / (1 - spe)));
    this.kR = (k0 * Math.sqrt(1 - es)) / (1 - spe * spe);
  }

  /** Földrajzi koordináták [rad] → (Y keleti, X északi) vetületi koordináták [m]. */
  forward(phi: number, lam: number): { y: number; x: number } {
    const dl = lam - this.lam0;
    const s = this.e * Math.sin(phi);
    const phip =
      2 * Math.atan(Math.exp(this.c * (Math.log(Math.tan(PI4 + 0.5 * phi)) - this.hlfE * Math.log((1 + s) / (1 - s))) + this.K)) -
      Math.PI / 2;
    const lamp = this.c * dl;
    const cp = Math.cos(phip);
    const phipp = Math.asin(this.cosp0 * Math.sin(phip) - this.sinp0 * cp * Math.cos(lamp));
    const lampp = Math.asin((cp * Math.sin(lamp)) / Math.cos(phipp));
    return {
      y: this.ell.a * this.kR * lampp + this.falseEasting,
      x: this.ell.a * this.kR * Math.log(Math.tan(PI4 + 0.5 * phipp)) + this.falseNorthing,
    };
  }

  /** Vetületi koordináták → földrajzi koordináták [rad]. */
  inverse(y: number, x: number): { phi: number; lam: number } {
    const px = (y - this.falseEasting) / this.ell.a;
    const py = (x - this.falseNorthing) / this.ell.a;
    const phipp = 2 * (Math.atan(Math.exp(py / this.kR)) - PI4);
    const lampp = px / this.kR;
    const cp = Math.cos(phipp);
    const phip = Math.asin(this.cosp0 * Math.sin(phipp) + this.sinp0 * cp * Math.cos(lampp));
    const lamp = Math.asin((cp * Math.sin(lampp)) / Math.cos(phip));
    const con = (this.K - Math.log(Math.tan(PI4 + 0.5 * phip))) / this.c;
    let phi = phip;
    for (let i = 0; i < 30; i++) {
      const esp = this.e * Math.sin(phi);
      const delta =
        (Math.log(Math.tan(PI4 + 0.5 * phi)) - this.hlfE * Math.log((1 + esp) / (1 - esp)) + con) *
        (1 - esp * esp) *
        Math.cos(phi) *
        this.oneEsInv;
      phi -= delta;
      if (Math.abs(delta) < 1e-15) break;
    }
    return { phi, lam: lamp / this.c + this.lam0 };
  }
}

/**
 * EOV: kezdőpont φ0 = 47°08'39.8174", λ0 = 19°02'54.8584" (HD72, GRS67), m0 = 0.99993,
 * hamis koordináták Y0 = 650 000 m, X0 = 200 000 m (EPSG:23700).
 */
export const EOV = new SwissObliqueMercator(
  GRS67,
  (47 + 8 / 60 + 39.8174 / 3600) * DEG,
  (19 + 2 / 60 + 54.8584 / 3600) * DEG,
  0.99993,
  650000,
  200000,
);
