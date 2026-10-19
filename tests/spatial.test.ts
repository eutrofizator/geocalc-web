import { describe, expect, it } from 'vitest';
import { CalcError } from '../src/core/errors';
import { EOV } from '../src/core/geo/eov';
import { GRS67, WGS84, geocentricToGeodetic, geodeticToGeocentric } from '../src/core/geo/ellipsoid';
import { applyHelmert, applyHelmertInverse, fitHelmert } from '../src/core/geo/helmert3d';
import { parseCoordinateList, spatialTransform } from '../src/core/geo/spatial';
import { SYSTEMS } from '../src/core/geo/systems';
import { UTM33, UTM34, utmZone } from '../src/core/geo/utm';

const D = Math.PI / 180;
const dms = (d: number, m: number, s: number) => (d + m / 60 + s / 3600) * D;

/** A súgó „Mintapéldák” fejezetének adatai. */
const WGS = `1 4106820.237 1377136.303 4666265.152
2 4111998.999 1383900.815 4659740.363
3 4117358.832 1370888.312 4658832.395
4 4110020.379 1384712.014 4661277.163
5 4110268.846 1368889.300 4665688.490
6 4112743.475 1376159.118 4661362.426`;
const EOVS = `1 611474.280 219913.350 160.890
2 616177.930 210269.540 159.440
3 602129.670 209051.360 139.130
4 617590.470 212491.450 190.650
5 602554.170 219104.570 182.180
6 608617.760 212708.810 157.470`;
const AB = `A 4113380.501 1371657.548 4662148.720
B 4111278.691 1380186.607 4661466.547`;

describe('EOV vetület', () => {
  it('a kezdőpont pontosan (650000; 200000)', () => {
    const p = EOV.forward(dms(47, 8, 39.8174), dms(19, 2, 54.8584));
    expect(p.y).toBeCloseTo(650000, 6);
    expect(p.x).toBeCloseTo(200000, 6);
  });

  it('oda-vissza számítás nanométeres pontossággal az ország egész területén', () => {
    for (const [y, x] of [[450000, 80000], [650000, 200000], [900000, 350000], [520000, 300000], [800000, 90000]] as const) {
      const g = EOV.inverse(y, x);
      const p = EOV.forward(g.phi, g.lam);
      expect(Math.abs(p.y - y)).toBeLessThan(1e-6);
      expect(Math.abs(p.x - x)).toBeLessThan(1e-6);
    }
  });

  it('szögtartó: a méretarány minden irányban egyenlő', () => {
    const g = EOV.inverse(700000, 250000);
    const h = 1e-7;
    const p = EOV.forward(g.phi, g.lam);
    const pe = EOV.forward(g.phi, g.lam + h);
    const pn = EOV.forward(g.phi + h, g.lam);
    const es = GRS67.f * (2 - GRS67.f);
    const w = 1 - es * Math.sin(g.phi) ** 2;
    const sEast = Math.hypot(pe.y - p.y, pe.x - p.x) / (h * (GRS67.a / Math.sqrt(w)) * Math.cos(g.phi)); // kelet felé: N·cosφ
    const sNorth = Math.hypot(pn.y - p.y, pn.x - p.x) / (h * ((GRS67.a * (1 - es)) / w ** 1.5)); // észak felé: M
    expect(Math.abs(sEast / sNorth - 1)).toBeLessThan(1e-6);
    // és a méretarány az EOV hengerén közel 1 (m0 = 0.99993 a kezdőpontnál)
    expect(Math.abs(sEast - 1)).toBeLessThan(2e-4);
  });
});

describe('UTM (keresztirányú Mercator)', () => {
  /** A meridiánív hossza numerikus integrálással – független ellenőrzés. */
  const meridianArc = (phi: number) => {
    const es = 0.0066943799901413165;
    const n = 4000;
    let s = 0;
    for (let i = 0; i <= n; i++) {
      const p = (phi * i) / n;
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      s += w * (1 - es * Math.sin(p) ** 2) ** -1.5;
    }
    return (WGS84.a * (1 - es) * s * (phi / n)) / 3;
  };

  it('a középmeridiánon az északi koordináta k0 · meridiánív', () => {
    for (const lat of [0, 30, 47.5, 60]) {
      const p = UTM33.forward(lat * D, 15 * D);
      expect(p.y).toBeCloseTo(500000, 6);
      expect(Math.abs(p.x - 0.9996 * meridianArc(lat * D))).toBeLessThan(1e-5);
    }
  });

  it('oda-vissza számítás a zónán belül', () => {
    for (const [lat, lon] of [[47.4979, 19.0402], [46.9, 16.5], [48.1, 22.8]] as const) {
      const z = lon < 18 ? UTM33 : UTM34;
      const p = z.forward(lat * D, lon * D);
      const g = z.inverse(p.y, p.x);
      expect(Math.abs(g.phi / D - lat)).toBeLessThan(1e-10);
      expect(Math.abs(g.lam / D - lon)).toBeLessThan(1e-10);
    }
  });

  it('a zónák középmeridiánja: 33 → 15°, 34 → 21°', () => {
    expect(utmZone(33).forward(0, 15 * D).y).toBeCloseTo(500000, 6);
    expect(utmZone(34).forward(0, 21 * D).y).toBeCloseTo(500000, 6);
  });
});

describe('ellipszoidi ↔ geocentrikus átalakítás', () => {
  it('oda-vissza és ismert érték (egyenlítő, 0° hosszúság)', () => {
    expect(geodeticToGeocentric(WGS84, { phi: 0, lam: 0, h: 0 })[0]).toBeCloseTo(6378137, 6);
    const g = { phi: 47.3 * D, lam: 19.2 * D, h: 187.25 };
    const b = geocentricToGeodetic(WGS84, geodeticToGeocentric(WGS84, g));
    expect(Math.abs(b.phi - g.phi)).toBeLessThan(1e-13);
    expect(Math.abs(b.lam - g.lam)).toBeLessThan(1e-13);
    expect(Math.abs(b.h - g.h)).toBeLessThan(1e-6);
  });
});

describe('térbeli (7 paraméteres) transzformáció – súgó mintapélda (WGS 84 → EOV, 3D)', () => {
  const req = {
    from: 'WGS84_XYZ' as const,
    to: 'EOV' as const,
    twoD: false,
    commonFrom: parseCoordinateList(WGS, 'WGS84_XYZ', false),
    commonTo: parseCoordinateList(EOVS, 'EOV', false),
    points: parseCoordinateList(AB, 'WGS84_XYZ', false),
  };
  const r = spatialTransform(req);

  it('a paraméterek egyeznek a súgóval', () => {
    // súgó: eltolás X,Y,Z = −5.5007, 100.0448, 16.2136 m; forgatás 1.08511″, −0.92840″, 0.21505″; méretarány −8.13 mm/km
    const v = r.summary.values;
    expect(Math.abs(v[0]! - -5.5007)).toBeLessThan(0.002);
    expect(Math.abs(v[1]! - 100.0448)).toBeLessThan(0.002);
    expect(Math.abs(v[2]! - 16.2136)).toBeLessThan(0.002);
    expect(Math.abs(v[3]! - 1.08511)).toBeLessThan(0.0005);
    expect(Math.abs(v[4]! - -0.9284)).toBeLessThan(0.0005);
    expect(Math.abs(v[5]! - 0.21505)).toBeLessThan(0.0005);
    expect(Math.abs(v[6]! - -8.13)).toBeLessThan(0.01);
  });

  it('a paraméterek középhibái egyeznek a súgóval', () => {
    const s = r.summary.sigmas;
    const help = [11.0098, 8.7844, 10.416, 0.27338, 0.42122, 0.26441, 1.15];
    help.forEach((h, i) => expect(Math.abs(s[i]! - h)).toBeLessThan(i < 3 ? 0.002 : i < 6 ? 0.0005 : 0.01));
  });

  it('az A és B pont EOV koordinátái és magassága egyezik a súgóval (±2 mm)', () => {
    const [A, B] = r.convertedValues;
    const near = (a: number, b: number) => Math.abs(a - b) <= 0.002;
    expect(near(A!.coords[0]!, 604155.249) && near(A!.coords[1]!, 213879.069) && near(A!.coords[2]!, 177.086)).toBe(true);
    expect(near(B!.coords[0]!, 612902.439) && near(B!.coords[1]!, 212831.067) && near(B!.coords[2]!, 160.067)).toBe(true);
  });

  it('a javításokat a transzformált értékekhez adva az eredeti koordináták adódnak', () => {
    const src = SYSTEMS.WGS84_XYZ;
    const dstSys = SYSTEMS.EOV;
    req.commonFrom.forEach((p, i) => {
      const transformed = applyHelmert(r.fit.params, src.toGeocentric(p.coords, false));
      const given = dstSys.toGeocentric(req.commonTo[i]!.coords, false);
      const v = r.fit.residuals[i]!;
      expect(Math.abs(transformed[0] + v[0] - given[0])).toBeLessThan(1e-6);
      expect(Math.abs(transformed[1] + v[1] - given[1])).toBeLessThan(1e-6);
      expect(Math.abs(transformed[2] + v[2] - given[2])).toBeLessThan(1e-6);
    });
    expect(r.residuals).toHaveLength(6);
    expect(r.commonCount).toBe(6);
  });

  it('2D-ben a magasságok nincsenek figyelembe véve (az eredmény magassága 0)', () => {
    const r2 = spatialTransform({ ...req, twoD: true });
    for (const p of r2.convertedValues) expect(p.coords[2]).toBe(0);
    const [A] = r2.convertedValues;
    expect(Math.hypot(A!.coords[0]! - 604155.249, A!.coords[1]! - 213879.069)).toBeLessThan(5); // néhány méteren belül
  });

  it('fordított irányban (EOV → WGS 84) is egymáshoz illeszkedik, és az inverz pontosan visszaad', () => {
    const fwd = spatialTransform({ ...req, from: 'EOV', to: 'WGS84_XYZ', commonFrom: req.commonTo, commonTo: req.commonFrom, points: parseCoordinateList('P 604155.249 213879.069 177.086', 'EOV', false) });
    const x = SYSTEMS.EOV.toGeocentric([604155.249, 213879.069, 177.086], false);
    const w = applyHelmert(fwd.fit.params, x);
    const back = applyHelmertInverse(fwd.fit.params, w);
    expect(Math.hypot(back[0] - x[0], back[1] - x[1], back[2] - x[2])).toBeLessThan(1e-6);
    // A WGS 84 → EOV minta A pontja ~ az EOV → WGS 84 irányban is közel ugyanide kerül (a két illesztés nem ugyanaz, ezért ~cm).
    const wgsA = SYSTEMS.WGS84_XYZ.toGeocentric([4113380.501, 1371657.548, 4662148.72], false);
    expect(Math.hypot(w[0] - wgsA[0], w[1] - wgsA[1], w[2] - wgsA[2])).toBeLessThan(0.05);
  });
});

describe('térbeli transzformáció – hibakezelés és más rendszerek', () => {
  it('hiányos vagy érvénytelen bemenetre érthető hibát ad', () => {
    expect(() => parseCoordinateList('1 611474.28 219913.35', 'EOV', true)).not.toThrow(); // 2D-ben elég az Y, X
    expect(() => parseCoordinateList('1 611474.28', 'EOV', false)).toThrow(/koordináta kell/);
    expect(() => parseCoordinateList('1 abc 2 3', 'EOV', false)).toThrow(/érvénytelen/);
    expect(() => parseCoordinateList('1 1 2 3\n1 4 5 6', 'EOV', false)).toThrow(/többször/);
    const two = parseCoordinateList('1 4106820.237 1377136.303 4666265.152\n2 4111998.999 1383900.815 4659740.363', 'WGS84_XYZ', false);
    expect(() => spatialTransform({ from: 'WGS84_XYZ', to: 'EOV', twoD: false, commonFrom: two, commonTo: two, points: [] })).toThrow(CalcError);
    expect(() => spatialTransform({ from: 'EOV', to: 'EOV', twoD: false, commonFrom: [], commonTo: [], points: [] })).toThrow(/azonos/);
  });

  it('közös pontok egy egyenesen nem határoznak meg transzformációt', () => {
    const line = [0, 1, 2, 3].map((i) => [6378137 + i * 100, 0, 0] as [number, number, number]);
    expect(() => fitHelmert(line, line)).toThrow(CalcError);
  });

  it('pontos transzformáció helyreállítja az ismert paramétereket (zajmentes szintetikus adat)', () => {
    const truth = { t: [12.5, -7.25, 3.0] as [number, number, number], r: [2e-6, -1e-6, 3e-6] as [number, number, number], s: 5e-6 };
    const base = [
      [4106820, 1377136, 4666265],
      [4111998, 1383900, 4659740],
      [4117358, 1370888, 4658832],
      [4110020, 1384712, 4661277],
    ] as [number, number, number][];
    const dst = base.map((x) => applyHelmert(truth, x));
    const f = fitHelmert(base, dst);
    expect(Math.abs(f.params.t[0] - 12.5)).toBeLessThan(1e-4);
    expect(Math.abs(f.params.r[2] - 3e-6)).toBeLessThan(1e-10);
    expect(Math.abs(f.params.s - 5e-6)).toBeLessThan(1e-10);
    expect(f.sigma0).toBeLessThan(1e-4);
  });

  it('EOV → UTM 34 átszámítás ugyanazon a vetületi pontokon ismert eltolással konzisztens', () => {
    // Azonos fizikai pont: EOV-ból WGS-re a szabványos paraméterekkel, majd UTM-be; a hivatalos HD72→WGS84 (EPSG:1448) paraméterekkel
    const std = { t: [52.684, -71.194, -13.975] as [number, number, number], r: [0.312, 0.1063, 0.3729].map((v) => (v * Math.PI) / 180 / 3600) as [number, number, number], s: 1.0191e-6 };
    // EPSG:1448 koordináta-keret konvenciójú → pozíció-vektorban az előjelek fordítottak.
    const pv = { t: std.t, r: std.r.map((v) => -v) as [number, number, number], s: std.s };
    const eovXyz = SYSTEMS.EOV.toGeocentric([650000, 200000, 0], false);
    const wgs = applyHelmert(pv, eovXyz);
    const g = geocentricToGeodetic(WGS84, wgs);
    // A HD72 kezdőpontja (47°08'39.8", 19°02'54.9") a WGS 84-en néhány 10 m-rel arrébb van (≤ 0,001°).
    expect(Math.abs(g.phi / D - 47.14439)).toBeLessThan(0.001);
    expect(Math.abs(g.lam / D - 19.04857)).toBeLessThan(0.002);
    const utm = UTM34.forward(g.phi, g.lam);
    expect(utm.y).toBeGreaterThan(300000);
    expect(utm.y).toBeLessThan(400000);
  });
});
