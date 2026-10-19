import type { Point, Section } from './types';

/** Rögzített tizedes számformázás, "-0.000" elkerülésével. */
export function fix(n: number, digits: number): string {
  const s = n.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** A pontszámok rendezése a GeoCalc szerint: szövegesen (1, 10, 13, 2, 57). */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function coordsSection(points: Point[]): Section {
  return {
    kind: 'coords',
    // A valódi jegyzőkönyvben a cím így áll (a kettőspont előtt szóközzel): „Felhasznált koordináták :”.
    title: 'Felhasznált koordináták :',
    columns: ['Pontszám', 'Y', 'X', 'M', 'Kód'],
    rows: [...points]
      .sort((p, q) => compareIds(p.id, q.id))
      .map((p) => ({ cells: [p.id, fix(p.y, 3), fix(p.x, 3), fix(p.m ?? 0, 3), p.code] })),
  };
}

/** Szöveges (nyomtatható) riport a szakaszokból, fix szélességű oszlopokkal. */
export function sectionsToText(sections: Section[]): string {
  const out: string[] = [];
  for (const s of sections) {
    out.push(s.title, '');
    const widths = s.columns.map((c, i) => Math.max(c.length, ...s.rows.map((r) => (r.cells[i] ?? '').length)));
    const line = (cells: string[]) =>
      cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('  ');
    out.push(line(s.columns), '-'.repeat(widths.reduce((a, w) => a + w, 0) + 2 * (widths.length - 1)));
    for (const r of s.rows) out.push(line(r.cells));
    for (const f of s.footer ?? []) out.push('', f);
    out.push('', '');
  }
  return out.join('\n').trimEnd() + '\n';
}
