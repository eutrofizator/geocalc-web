import { describe, expect, it } from 'vitest';
import { run } from '../src/core/engine';
import { intersectCircles, type Pt } from '../src/core/geometry';
import { EXAMPLES } from '../src/examples';

const example = (id: string) => EXAMPLES.find((e) => e.id === id)!.source;
const errors = (r: ReturnType<typeof run>) => r.issues.filter((i) => i.level === 'error');

/** A GeoCalc síkjában (Y = kelet, X = észak) vett keresztszorzat. */
const cross = (u: Pt, v: Pt) => u.y * v.x - u.x * v.y;
const dist = (a: Pt, b: Pt) => Math.hypot(a.y - b.y, a.x - b.x);

describe('intersectCircles – két kör metszéspontjai', () => {
  it('egységes példán a két megoldás a P1→P2 egyenes két oldalára esik', () => {
    const a = { y: 0, x: 0 };
    const b = { y: 10, x: 0 };
    const [left, right] = intersectCircles(a, 13, b, 13);
    expect(left.y).toBeCloseTo(5, 9);
    expect(left.x).toBeCloseTo(12, 9);
    expect(right.y).toBeCloseTo(5, 9);
    expect(right.x).toBeCloseTo(-12, 9);
    // A bal oldal ellenkező irányú (cross > 0), a jobb oldal az óramutató járásával megegyező (cross < 0).
    expect(cross({ y: b.y - a.y, x: b.x - a.x }, { y: left.y - a.y, x: left.x - a.x })).toBeGreaterThan(0);
    expect(cross({ y: b.y - a.y, x: b.x - a.x }, { y: right.y - a.y, x: right.x - a.x })).toBeLessThan(0);
  });

  it('nem metsző körökre hibát jelez', () => {
    expect(() => intersectCircles({ y: 0, x: 0 }, 1, { y: 10, x: 0 }, 1)).toThrow(/nem metszi/);
    expect(() => intersectCircles({ y: 0, x: 0 }, 1, { y: 0, x: 0 }, 1)).toThrow(/egybeesik/);
  });
});

describe('IV – ív-/távolságmetszés (a program iv.gcd mintája)', () => {
  const r = run(example('iv'));
  const section = r.sections.find((s) => s.kind === 'iv')!;
  const p = r.computed.find((x) => x.id === '520')!;
  const P1 = { y: 57821.75, x: 21792.91 };
  const P2 = { y: 58379.27, x: 23107.51 };

  it('hibátlanul lefut, és a 520-as pont a két mért távolságra illeszkedik', () => {
    expect(errors(r)).toEqual([]);
    expect(p).toBeDefined();
    expect(Math.abs(dist(p, P1) - 1260.631)).toBeLessThan(0.001);
    expect(Math.abs(dist(p, P2) - 1499.979)).toBeLessThan(0.001);
  });

  it('a program az óramutató járásával megegyező körüljárású megoldást veszi', () => {
    // A megadott sorrendben az ismert pontok körbejárása az új pont körül az óramutató járásával egyező.
    expect(cross({ y: P1.y - p.y, x: P1.x - p.x }, { y: P2.y - p.y, x: P2.x - p.x })).toBeLessThan(0);
  });

  it('a jegyzőkönyv a tükör-megoldást is közli', () => {
    expect(section.title).toBe('Ív-/távolságmetszés (távolság–távolság metszés)');
    const footer = section.footer!.join(' ');
    expect(footer).toContain('tükör-megoldás');
    const m = /520 = (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)/.exec(footer);
    expect(m).not.toBeNull();
    const mirror = { y: Number(m![1]), x: Number(m![2]) };
    expect(Math.abs(dist(mirror, P1) - 1260.631)).toBeLessThan(0.001);
    expect(Math.abs(dist(mirror, P2) - 1499.979)).toBeLessThan(0.001);
    // A tükör-megoldás az ellenkező oldalon van.
    expect(cross({ y: P1.y - mirror.y, x: P1.x - mirror.x }, { y: P2.y - mirror.y, x: P2.x - mirror.x })).toBeGreaterThan(0);
  });

  it('a távolságok táblázatosan, a mért értékkel egyezően jelennek meg', () => {
    expect(section.columns).toEqual(['Pontszám', 'Y', 'X', 'T', 'dT']);
    const known = section.rows.slice(0, 2).map((x) => x.cells);
    expect(known[0]!.slice(0, 4)).toEqual(['113', '57821.750', '21792.910', '1260.631']);
    expect(known[1]!.slice(0, 4)).toEqual(['116', '58379.270', '23107.510', '1499.979']);
    expect(section.rows[2]!.role).toBe('result');
  });

  it('három távolságból legkisebb négyzetes megoldást ad', () => {
    const src = `K_
113 57821.750 21792.910
116 58379.270 23107.510
200 58500.000 22000.000
;;
IV
520
113 1260.631
116 1499.979
200 ${dist({ y: 58500, x: 22000 }, { y: 59082.32, x: 21782.5 }).toFixed(3)}
;;
`;
    const r3 = run(src);
    expect(errors(r3)).toEqual([]);
    const s3 = r3.sections.find((s) => s.kind === 'iv')!;
    expect(s3.footer!.join(' ')).toContain('legkisebb négyzetes kiegyenlítés');
    const q = r3.computed.find((x) => x.id === '520')!;
    expect(Math.abs(q.y - 59082.32)).toBeLessThan(0.05);
    expect(Math.abs(q.x - 21782.5)).toBeLessThan(0.05);
  });

  it('egy ismert pontra kevés mérés → hiba', () => {
    const bad = run(`K_\n113 57821.750 21792.910\n;;\nIV\n520\n113 1260.631\n;;\n`);
    expect(errors(bad)).toHaveLength(1);
    expect(errors(bad)[0]!.message).toMatch(/legalább két ismert pont/);
  });
});
