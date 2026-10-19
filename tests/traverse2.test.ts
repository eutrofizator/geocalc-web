import { describe, expect, it } from 'vitest';
import { formatDms } from '../src/core/angle';
import { run } from '../src/core/engine';

/**
 * Kétoldalt tájékozott sokszögvonal ellenőrzése egy ismert (valódi) vonallal. A mérések a valódi
 * koordinátákból készülnek; a szögzáró hibát egy szándékosan hibás szöggel vizsgáljuk.
 */
const D = 180 / Math.PI;
const pts = [
  { id: 'K', y: 1000, x: 1000 },
  { id: '1', y: 1120, x: 1090 },
  { id: '2', y: 1260, x: 1070 },
  { id: '3', y: 1390, x: 1150 },
  { id: 'V', y: 1520, x: 1120 },
];
const orient = { K: 0, V: 0 };
const az = (a: (typeof pts)[number], b: (typeof pts)[number]) => ((Math.atan2(b.y - a.y, b.x - a.x) * D) % 360 + 360) % 360;
const dist = (a: (typeof pts)[number], b: (typeof pts)[number]) => Math.hypot(b.y - a.y, b.x - a.x);
/** Egész másodpercre kerekített leolvasás FOK.PPMMSS formában. */
const read = (deg: number) => formatDms(Math.round(deg * 3600) / 3600);

function program(angleError = 0): string {
  const lines: string[] = [];
  const first = `K ${read(az(pts[0]!, pts[1]!))} ${dist(pts[0]!, pts[1]!).toFixed(3)} V ${read(az(pts[4]!, pts[3]!))}`;
  lines.push(first);
  for (let i = 1; i <= 3; i++) {
    const back = az(pts[i]!, pts[i - 1]!);
    const fwd = az(pts[i]!, pts[i + 1]!) + (i === 2 ? angleError / 3600 : 0);
    lines.push(`${pts[i]!.id} ${read(back)} ${read(fwd)} ${dist(pts[i]!, pts[i + 1]!).toFixed(3)}`);
  }
  const coords = pts
    .filter((p) => p.id === 'K' || p.id === 'V')
    .map((p) => `${p.id} ${p.y} ${p.x}`)
    .join('\n');
  return `k_\n${coords}\n;;\nzk,K,${orient.K}\nzk,V,${orient.V}\nsv\n${lines.join('\n')}\n;;\n`;
}

describe('SV – kétoldalt tájékozott sokszögvonal', () => {
  it('hibátlan mérésnél visszaadja a valódi pontokat és kicsi a szögzáró hiba', () => {
    const r = run(program());
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    const t = r.sections.find((s) => s.kind === 'sv')!;
    expect(t.title).toBe('Kétoldalt tájékozott sokszögvonal számítása');
    for (const p of pts.slice(1, 4)) {
      const c = r.computed.find((x) => x.id === p.id)!;
      expect(Math.abs(c.y - p.y)).toBeLessThan(0.03);
      expect(Math.abs(c.x - p.x)).toBeLessThan(0.03);
    }
    expect(t.footer!.join('\n')).toMatch(/fβ = -?\d+\.\d″/);
  });

  it('szándékosan hibás szöggel: a szögzáró hibát felismeri és egyenletesen osztja el', () => {
    const r = run(program(20)); // a 2. pont szöge +20″-cel hibás → a végirány +20″-cel eltér
    const t = r.sections.find((s) => s.kind === 'sv')!;
    const f = t.footer!.join('\n');
    const m = /fβ = (-?\d+\.\d)″; szögenkénti javítás: (-?\d+\.\d+)″ \((\d+) szög\)/.exec(f)!;
    expect(Number(m[1])).toBeGreaterThan(-24);
    expect(Number(m[1])).toBeLessThan(-16); // ismert − számított ≈ −20″ (a leolvasások kerekítése ±2″)
    expect(Number(m[3])).toBe(5); // 3 töréspont + a két csatlakozó szög
    expect(Math.abs(Number(m[2]) - Number(m[1]) / 5)).toBeLessThan(0.02);
  });

  it('a javított vonal pontosan a végponthoz zár, és jobb a javítatlannál', () => {
    const wrong = run(program(20));
    const t = wrong.sections.find((s) => s.kind === 'sv')!;
    const sum = t.rows.find((x) => x.cells[0] === 'Σ')!.cells;
    // dy, dx összegei a javítások után = V − K
    expect(sum[9]).toBe('520.000');
    expect(sum[10]).toBe('120.000');
    // A 3. pont hibája kisebb, mint ha a 20″-es szöghibát egyáltalán nem osztanánk el.
    const p3 = wrong.computed.find((x) => x.id === '3')!;
    const err = Math.hypot(p3.y - 1390, p3.x - 1150);
    expect(err).toBeLessThan(0.06);
  });

  it('végponti irány vagy végpont tájékozása nélkül nem kétoldalt tájékozott', () => {
    const noVn = program().replace(/ V [0-9.]+\n/, ' V\n');
    const r = run(noVn);
    const t = r.sections.find((s) => s.kind === 'sv');
    expect(t?.title).toBe('Beillesztett sokszögvonal számítása');
  });
});
