import { describe, expect, it } from 'vitest';
import { computeDetailPoints } from '../src/core/network/details';
import { parseGmj } from '../src/core/network/gmj';
import { adjustHorizontal } from '../src/core/network/horizontal';
import { parseNetworkCoordinates } from '../src/core/network/gmj';
import { DEFAULT_HORIZONTAL_SETTINGS } from '../src/core/network/types';
import { adjustHeights } from '../src/core/network/vertical';
import { DEFAULT_VERTICAL_SETTINGS } from '../src/core/network/types';
import { ISZKA_COORDINATES, ISZKA_GMJ } from './fixtures/iszkahegy';

const D = Math.PI / 180;
const dms = (deg: number) => {
  const t = Math.round(((deg % 360) + 360) % 360 * 3600);
  return `${Math.floor(t / 3600)}.${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}${String(t % 60).padStart(2, '0')}`;
};

/** Állomás ismert koordinátával és tájékozással, két részletponttal (az egyiket két állomásról mérik). */
function setup() {
  const coords = new Map([
    ['A', { y: 1000, x: 2000 }],
    ['B', { y: 1100, x: 2100 }],
  ]);
  const zk = new Map([
    ['A', 10],
    ['B', 350],
  ]);
  const trueD1 = { y: 1060, x: 2080 };
  const trueD2 = { y: 1040, x: 2010 };
  const obs = (from: { y: number; x: number }, z: number, target: { y: number; x: number }, id: string, dM: number | null) => {
    const az = ((Math.atan2(target.y - from.y, target.x - from.x) / D - z) + 720) % 360;
    return `1,${id},${dms(az)},90.0000,${Math.hypot(target.y - from.y, target.x - from.x).toFixed(3)},0,${dM ?? ''},,,1.5,${Math.hypot(target.y - from.y, target.x - from.x).toFixed(4)},,,-2`;
  };
  const gmj = [
    '1,A,,,,,,,1.5,,,,,-1',
    obs(coords.get('A')!, 10, trueD1, 'D1', 2.5),
    obs(coords.get('A')!, 10, trueD2, 'D2', -0.5),
    obs(coords.get('A')!, 10, coords.get('B')!, 'B', null),
    '2,B,,,,,,,1.6,,,,,-1',
    obs(coords.get('B')!, 350, trueD1, 'D1', 1.5),
  ].join('\n');
  return { coords, zk, gmj: parseGmj(gmj).stations, trueD1, trueD2 };
}

describe('részletpontok számítása', () => {
  it('poláris módszerrel visszaadja a pontos koordinátákat és magasságot', () => {
    const { coords, zk, gmj, trueD1, trueD2 } = setup();
    const r = computeDetailPoints(gmj, coords, zk, new Map([['A', 100], ['B', 101]]));
    expect(r.issues).toEqual([]);
    expect(r.points.map((p) => p.id)).toEqual(['D1', 'D2']); // a B koordinátás pont nem részletpont
    const d2 = r.points.find((p) => p.id === 'D2')!;
    expect(Math.abs(d2.y - trueD2.y)).toBeLessThan(0.01);
    expect(Math.abs(d2.x - trueD2.x)).toBeLessThan(0.01);
    expect(d2.height).toBeCloseTo(99.5, 6);
    const d1 = r.points.find((p) => p.id === 'D1')!;
    expect(Math.abs(d1.y - trueD1.y)).toBeLessThan(0.01);
    expect(Math.abs(d1.x - trueD1.x)).toBeLessThan(0.01);
  });

  it('a többször mért pont koordinátája a mérések átlaga, az eltérést kimutatja', () => {
    const { coords, zk, gmj } = setup();
    const r = computeDetailPoints(gmj, coords, zk, new Map([['A', 100], ['B', 101]]));
    const d1 = r.points.find((p) => p.id === 'D1')!;
    expect(d1.measurements.map((m) => m.station)).toEqual(['A', 'B']);
    expect(d1.height).toBeCloseTo((102.5 + 102.5) / 2, 6);
    expect(d1.spread).toBeLessThan(0.02); // a mérések (kerekített irányokkal) alig térnek el
    expect(r.sections.map((s) => s.kind)).toEqual(['detail-points', 'detail-multi']);
    expect(r.sections[1]!.rows).toHaveLength(2);
  });

  it('magasság nélkül is számít, a hiányzó tájékozású állomást jelzi', () => {
    const { coords, gmj } = setup();
    const r = computeDetailPoints(gmj, coords, new Map([['A', 10]]), null);
    expect(r.points.find((p) => p.id === 'D2')!.height).toBeNull();
    expect(r.issues.some((i) => i.level === 'warning' && /B/.test(i.message))).toBe(true);
    expect(r.points.find((p) => p.id === 'D1')!.measurements).toHaveLength(1);
  });

  it('a valódi hálózatban nincs részletpont (minden irányzott pont adott vagy kiegyenlített)', () => {
    const known = parseNetworkCoordinates(ISZKA_COORDINATES).points;
    const stations = parseGmj(ISZKA_GMJ).stations;
    const adj = adjustHorizontal(known, stations, DEFAULT_HORIZONTAL_SETTINGS);
    const coords = new Map(known.map((p) => [p.id, { y: p.y, x: p.x }] as const));
    for (const p of adj.points) coords.set(p.id, { y: p.y, x: p.x });
    const r = computeDetailPoints(stations, coords, adj.orientations, null);
    expect(r.points).toEqual([]);
  });
});

describe('kézi kizárás és relatív középhiba a kiegyenlítésben', () => {
  const known = parseNetworkCoordinates(ISZKA_COORDINATES).points;
  const stations = parseGmj(ISZKA_GMJ).stations;

  it('a relatív középhiba a ρ / σ₀ (GeoCalc: 1/31702, σ₀ = 6.51″ mellett)', () => {
    const r = adjustHorizontal(known, stations, DEFAULT_HORIZONTAL_SETTINGS);
    const rel = r.sections[0]!.rows.find((x) => x.cells[0] === 'Relatív középhiba')!.cells[1]!;
    const n = Number(rel.replace('1/', ''));
    expect(Math.abs(n / 31702 - 1)).toBeLessThan(0.01);
    expect(n).toBe(Math.round(206264.80624709636 / r.sigma0Posterior!));
  });

  it('a kézzel kizárt mérés kimarad, az eredmény újraszámolódik, a többi nem változik', () => {
    const base = adjustHorizontal(known, stations, DEFAULT_HORIZONTAL_SETTINGS);
    const r = adjustHorizontal(known, stations, { ...DEFAULT_HORIZONTAL_SETTINGS, excluded: ['3>543012:dir'] });
    const o = r.observations.find((x) => x.station === '3' && x.target === '543012' && x.kind === 'direction')!;
    expect(o.excluded && o.manual).toBe(true);
    expect(o.stat).toBeNull();
    expect(r.counts.excluded).toBe(base.counts.excluded + 1);
    expect(r.counts.redundancy).toBe(base.counts.redundancy - 1);
    // a legnagyobb statisztika (−4.25) eltűnik, a σ₀ javul
    expect(r.sigma0Posterior!).toBeLessThan(base.sigma0Posterior!);
    expect(r.localTest!.station === '3' && r.localTest!.target === '543012').toBe(false);
    expect(r.issues.some((i) => i.level === 'info' && /kézzel kizártál/.test(i.message))).toBe(true);
    // a durva hiba miatti figyelmeztetés csak az automatikusan kihagyottakat számolja
    expect(r.issues.find((i) => i.level === 'warning')!.message).toMatch(/^4 mérés/);
  });

  it('távolság is kizárható külön az iránytól', () => {
    const r = adjustHorizontal(known, stations, { ...DEFAULT_HORIZONTAL_SETTINGS, excluded: ['2>3:dist'] });
    expect(r.observations.find((x) => x.station === '2' && x.target === '3' && x.kind === 'distance')!.manual).toBe(true);
    expect(r.observations.find((x) => x.station === '2' && x.target === '3' && x.kind === 'direction')!.excluded).toBe(false);
  });

  it('a kiegyenlítő sorai kulcsot kapnak a felületi kizáráshoz', () => {
    const r = adjustHorizontal(known, stations, DEFAULT_HORIZONTAL_SETTINGS);
    const st = r.sections.find((s) => s.title.endsWith('álláspont: 2'))!;
    expect(st.rows.map((x) => x.key)).toContain('2>3');
  });
});

describe('új pontok és részletpontok a kiegyenlítésben', () => {
  const known = parseNetworkCoordinates(ISZKA_COORDINATES).points;
  const withDetails = parseGmj(`${ISZKA_GMJ}31,DP1,100.0000,90.0000,100,100,2.0,,,1.4,99.9990,,,-2
32,DP2,120.0000,90.0000,200,200,-1.0,,,1.4,199.9990,,,-2
`).stations;

  it('a koordináta nélküli, nem álláspont pontok nem kerülnek be a kiegyenlítésbe, hanem részletpontok lesznek', () => {
    const base = adjustHorizontal(known, parseGmj(ISZKA_GMJ).stations, DEFAULT_HORIZONTAL_SETTINGS);
    const r = adjustHorizontal(known, withDetails, DEFAULT_HORIZONTAL_SETTINGS);
    expect(r.counts).toEqual(base.counts); // a részletpont-mérések nem változtatják a hálózat jellemzőit
    expect(r.points.map((p) => p.id)).toEqual(['2', '3']);
    expect(r.points[0]!.y).toBe(base.points[0]!.y);
    const coords = new Map(known.map((p) => [p.id, { y: p.y, x: p.x }] as const));
    for (const p of r.points) coords.set(p.id, { y: p.y, x: p.x });
    const d = computeDetailPoints(withDetails, coords, r.orientations, null);
    expect(d.points.map((p) => p.id)).toEqual(['DP1', 'DP2']);
    // DP1 a 541440 állomásról 100.0000 irányon, 99.999 m-re: az irányszög = irányérték + tájékozás
    const S = coords.get('541440')!;
    const az = (100 + r.orientations.get('541440')!) * (Math.PI / 180);
    expect(d.points[0]!.y).toBeCloseTo(S.y + 99.999 * Math.sin(az), 6);
    expect(d.points[0]!.x).toBeCloseTo(S.x + 99.999 * Math.cos(az), 6);
  });

  it('a megadott további pont új pontként kerül a kiegyenlítésbe', () => {
    // A DP1-et két állomásról is mérjük (iránnyal), és kifejezetten új pontnak jelöljük.
    const extra = parseGmj(`${ISZKA_GMJ}31,DP1,100.0000,90.0000,100,100,2.0,,,1.4,99.9990,,,-2
`).stations;
    const r = adjustHorizontal(known, extra, { ...DEFAULT_HORIZONTAL_SETTINGS, extraPoints: ['DP1'] });
    expect(r.counts.new).toBe(3);
    expect(r.points.map((p) => p.id)).toEqual(['2', '3', 'DP1']);
    expect(r.counts.directions).toBe(27);
  });
});

describe('a részletpont-mérések nem változtatják a magassági hálózatot', () => {
  it('a részletpont dM-je nem kerül a magassági kiegyenlítésbe', () => {
    const known = parseNetworkCoordinates(ISZKA_COORDINATES).points;
    const base = adjustHeights(known, parseGmj(ISZKA_GMJ).stations, { ...DEFAULT_VERTICAL_SETTINGS, free: true });
    const withDetail = parseGmj(`${ISZKA_GMJ}31,DP1,100.0000,90.0000,100,100,2.0,,,1.4,99.9990,,,-2
`).stations;
    const r = adjustHeights(known, withDetail, { ...DEFAULT_VERTICAL_SETTINGS, free: true });
    expect(r.points.map((p) => p.id)).toEqual(base.points.map((p) => p.id));
    for (const p of r.points) expect(p.height).toBe(base.points.find((b) => b.id === p.id)!.height);
    expect(r.counts.differences).toBe(base.counts.differences);
  });
});
