import { describe, expect, it } from 'vitest';
import { formatDms, parseDms } from '../src/core/angle';
import { averageFaces } from '../src/core/network/averaging';
import { parseGmj, parseNetworkCoordinates, toGmj } from '../src/core/network/gmj';
import { adjustHorizontal } from '../src/core/network/horizontal';
import { DEFAULT_HORIZONTAL_SETTINGS, DEFAULT_VERTICAL_SETTINGS } from '../src/core/network/types';
import { adjustHeights } from '../src/core/network/vertical';
import { ISZKA_COORDINATES, ISZKA_GMJ } from './fixtures/iszkahegy';
import { ISZKA_AVERAGING_LOG, ISZKA_CONVERTED_GMJ, ISZKA_RAW_GMJ } from './fixtures/iszkahegy-raw';

const station = (lines: string[]) => parseGmj(`1,S,,,,,,,1.5,,,,,-1\n${lines.join('\n')}\n`).stations;
const rec = (target: string, hz: string, zi: string) => `2,${target},${hz},${zi},0,0,1.5,,,0,,,,-2`;
const deg = (s: string) => parseDms(s);
const arcsec = (a: number, b: number) => Math.abs(a - b) * 3600;

describe('középelés – szintetikus esetek', () => {
  it('az I. és a II. állás átlaga: Hz = (Hz₁ + Hz₂ − 180°)/2, Zi = (Zi₁ + 360° − Zi₂)/2', () => {
    const r = averageFaces(station([rec('A', '100.0000', '90.0000'), rec('A', '280.0010', '270.0010')]));
    const o = r.stations[0]!.observations[0]!;
    expect(formatDms(o.hz)).toBe('100.0005');
    expect(formatDms(o.zi!)).toBe('89.5955'); // (90°00'00" + 359°59'50" − 270°00'10"…) = 89°59'55"
    expect(r.rows[0]!.indexError).toBeCloseTo(10, 6); // az indexhiba kétszerese: Zi₁ + Zi₂ − 360° = 10″
  });

  it('a 0°/360° átfordulásnál is jól átlagol', () => {
    const a = averageFaces(station([rec('A', '359.5955', '90.0000'), rec('A', '179.5957', '270.0000')]));
    expect(formatDms(a.stations[0]!.observations[0]!.hz)).toBe('359.5956');
    const b = averageFaces(station([rec('A', '0.0003', '90.0000'), rec('A', '180.0001', '270.0000')]));
    expect(formatDms(b.stations[0]!.observations[0]!.hz)).toBe('0.0002');
  });

  it('egyetlen leolvasást érintetlenül hagy, és nem készít naplósort', () => {
    const r = averageFaces(station([rec('A', '12.3456', '88.1234')]));
    expect(r.rows).toEqual([]);
    expect(formatDms(r.stations[0]!.observations[0]!.hz)).toBe('12.3456');
    expect(r.sections).toEqual([]);
  });

  it('a horizont zárásakor kétszer mért célpont leolvasásait állásonként átlagolja (nem csak az elsőt és az utolsót)', () => {
    // I.: 10.0000 és 10.0004 (zárás); II.: 190.0002 és 190.0010
    const r = averageFaces(
      station([rec('A', '10.0000', '90.0000'), rec('B', '50.0000', '90.0000'), rec('A', '10.0004', '90.0000'), rec('A', '190.0002', '270.0000'), rec('B', '230.0000', '270.0000'), rec('A', '190.0010', '270.0000')]),
    );
    const a = r.stations[0]!.observations.find((o) => o.target === 'A')!;
    // I. átlag 10°00'02", II. átlag 10°00'06" → 10°00'04"
    expect(formatDms(a.hz)).toBe('10.0004');
    expect(r.rows.find((x) => x.target === 'A')).toMatchObject({ faceI: 2, faceII: 2 });
    // a két állás összesen 2 célpontra 6 leolvasásból 2 megfigyelés
    expect(r.stations[0]!.observations).toHaveLength(2);
  });

  it('a távolságokat és a magasságkülönbséget átlagolja, a beragadt távolságokat (Mj = 0) nem veszi távolságmérésnek', () => {
    const lines = [
      '2,T,100.0000,90.0000,500.0,499.9,2.0,,,1.5,499.800,,,-2',
      '3,U,150.0000,90.0000,500.0,499.9,2.0,,,0,499.800,,,-2', // beragadt távolság: a prizmamagasság nulla
      '4,T,280.0000,270.0000,500.2,500.1,2.2,,,1.5,500.000,,,-2',
    ];
    const r = averageFaces(parseGmj(`1,S,,,,,,,1.5,,,,,-1\n${lines.join('\n')}\n`).stations);
    const t = r.stations[0]!.observations.find((o) => o.target === 'T')!;
    expect(t.distance).toBeCloseTo(499.9, 6);
    expect(t.dM).toBeCloseTo(2.1, 6);
    expect(t.slope).toBeCloseTo(500.1, 6);
    expect(r.stations[0]!.observations.find((o) => o.target === 'U')!.distance).toBeNull();
  });

  it('a 180°-tól nagyon eltérő II. állás irányértékére figyelmeztet', () => {
    const r = averageFaces(station([rec('A', '10.0000', '90.0000'), rec('A', '210.0000', '270.0000')]));
    expect(r.issues.some((i) => i.level === 'warning' && /180°-tól/.test(i.message))).toBe(true);
  });
});

describe('középelés – a valódi nyers jegyzőkönyv a GeoCalc GCAR_2T kimenetével összevetve', () => {
  const raw = parseGmj(ISZKA_RAW_GMJ);
  const converted = parseGmj(ISZKA_CONVERTED_GMJ);
  const result = averageFaces(raw.stations);
  const conv = (st: string, tg: string) => converted.stations.find((s) => s.id === st)!.observations.find((o) => o.target === tg)!;
  const mine = (st: string, tg: string) => result.stations.find((s) => s.id === st)!.observations.find((o) => o.target === tg)!;

  it('a nyers jegyzőkönyv beolvasható, a beragadt távolságok nem válnak távolságmérésekké', () => {
    expect(raw.issues).toEqual([]);
    expect(raw.stations.map((s) => s.id)).toEqual(['541017D', '2', '3', '541440']);
    const distances = raw.stations.flatMap((s) => s.observations.filter((o) => o.distance));
    expect(distances).toHaveLength(12); // 6 távolság, mindegyik két állásban
  });

  it('minden olyan célpontra, amelyre egy I. és egy II. leolvasás van, egyezik a GCAR_2T eredményével (±1″)', () => {
    const pairs = result.rows.filter((r) => r.faceI === 1 && r.faceII === 1);
    expect(pairs.length).toBeGreaterThanOrEqual(20);
    for (const r of pairs) {
      const c = conv(r.station, r.target);
      expect(arcsec(mine(r.station, r.target).hz, c.hz), `${r.station}→${r.target} Hz`).toBeLessThanOrEqual(1.01);
      expect(arcsec(mine(r.station, r.target).zi!, c.zi!), `${r.station}→${r.target} Zi`).toBeLessThanOrEqual(1.01);
    }
  });

  it('a naplóval is egyezik (541066 az 541017D állomáson: Hz 123.4459, Zi 91.2504)', () => {
    expect(ISZKA_AVERAGING_LOG).toMatch(/541066\s+123\.4504\s+303\.4454\s+123\.4459\s+91\.2203\s+268\.3155\s+91\.2504/);
    const o = mine('541017D', '541066');
    expect(formatDms(o.hz)).toBe('123.4459');
    expect(formatDms(o.zi!)).toBe('91.2504');
  });

  it('a kétszer mért nulla irányokat helyesen kezeli (a GeoCalc ezeket elrontja, a felhasználónak kézzel javítani kellett)', () => {
    // GeoCalc naplója: 541017A az 541017D állomáson: „94.4236 94.4234 4.4235” (hibás közép: 4.4235)
    expect(ISZKA_AVERAGING_LOG).toMatch(/541017A\s+94\.4236\s+94\.4234\s+4\.4235/);
    const o = mine('541017D', '541017A');
    expect(arcsec(o.hz, deg('94.4236'))).toBeLessThanOrEqual(2); // a kézzel javított jegyzőkönyv: 94.4236
    expect(result.rows.find((r) => r.station === '541017D' && r.target === '541017A')).toMatchObject({ faceI: 2, faceII: 2 });
  });

  it('a távolságok és magasságkülönbségek a kézzel javított jegyzőkönyvhöz igazodnak', () => {
    const javitott = parseGmj(ISZKA_GMJ).stations;
    const j = javitott.find((s) => s.id === '541017D')!.observations.find((o) => o.target === '2')!;
    const m = mine('541017D', '2');
    expect(Math.abs(m.distance! - j.distance!)).toBeLessThan(0.001); // 1008.9779 – 1008.9776
    expect(Math.abs(m.dM! - j.dM!)).toBeLessThan(0.0005); // −11.19295 – −11.1930
    expect(arcsec(m.hz, j.hz)).toBeLessThanOrEqual(1.01);
    expect(arcsec(m.zi!, j.zi!)).toBeLessThanOrEqual(1.01);
  });

  it('a középelt adatból a kiegyenlítés a GeoCalc eredményét adja (új pontok ±2 cm, magasságok ±2 cm)', () => {
    const known = parseNetworkCoordinates(ISZKA_COORDINATES).points;
    const adj = adjustHorizontal(known, result.stations, DEFAULT_HORIZONTAL_SETTINGS);
    expect(adj.counts).toMatchObject({ points: 13, new: 2, directions: 26, distances: 6, excluded: 4 });
    const p2 = adj.points.find((p) => p.id === '2')!;
    const p3 = adj.points.find((p) => p.id === '3')!;
    expect(Math.abs(p2.y - 590988.68)).toBeLessThan(0.02);
    expect(Math.abs(p2.x - 209083.8)).toBeLessThan(0.02);
    expect(Math.abs(p3.y - 590588.38)).toBeLessThan(0.02);
    expect(Math.abs(p3.x - 209681.22)).toBeLessThan(0.02);
    const h = adjustHeights(known, result.stations, { ...DEFAULT_VERTICAL_SETTINGS, free: true });
    const height = (id: string) => h.points.find((p) => p.id === id)!.height;
    expect(Math.abs(height('2') - 249.35)).toBeLessThan(0.02);
    expect(Math.abs(height('3') - 273.37)).toBeLessThan(0.02);
    expect(Math.abs(height('541017D') - 260.57)).toBeLessThan(0.02);
    expect(Math.abs(height('541440') - 278.38)).toBeLessThan(0.02);
  });

  it('a középelés naplója szakaszként elkészül', () => {
    expect(result.sections[0]!.kind).toBe('averaging');
    expect(result.sections[0]!.rows.length).toBe(result.rows.length);
  });
});

describe('GMJ kiírás', () => {
  it('a középelt jegyzőkönyv kiírva és újra beolvasva ugyanazt adja', () => {
    const avg = averageFaces(parseGmj(ISZKA_RAW_GMJ).stations);
    const again = parseGmj(toGmj(avg.stations));
    expect(again.issues).toEqual([]);
    expect(again.stations.map((s) => s.id)).toEqual(avg.stations.map((s) => s.id));
    avg.stations.forEach((s, i) => {
      s.observations.forEach((o, k) => {
        const p = again.stations[i]!.observations[k]!;
        expect(p.target).toBe(o.target);
        expect(arcsec(p.hz, o.hz)).toBeLessThan(0.51);
        if (o.distance !== null) expect(Math.abs(p.distance! - o.distance)).toBeLessThan(1e-4);
        else expect(p.distance).toBeNull();
      });
    });
  });
});
