import type { Section } from './types';

/**
 * A jegyzőkönyv táblázatainak átadása táblázatkezelőnek (CSV).
 *
 * A magyar Excel a pontosvesszős elválasztást és a UTF-8 bájt-sorrendjelet (BOM) várja, ezért a
 * kimenet `;`-vel tagolt, BOM-mal kezdődik, és minden szakasz a saját címével, fejlécsorával,
 * valamint egy üres sorral zárul. Az idézőjelet, a pontosvesszőt és a sortörést tartalmazó mezők
 * idézőjelbe kerülnek (a bennük lévő idézőjel megduplázódik), így a fájl minden táblázatkezelőben
 * egyértelműen visszaolvasható.
 */

export const CSV_SEPARATOR = ';';
export const CSV_BOM = '\uFEFF';

function escapeField(value: string): string {
  if (/[";\r\n]/.test(value) || value !== value.trim()) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function line(fields: string[]): string {
  return fields.map(escapeField).join(CSV_SEPARATOR);
}

/** A szakaszok átalakítása CSV-szöveggé (egy szakasz egy „táblázat”, üres sorral elválasztva). */
export function sectionsToCsv(sections: Section[]): string {
  const lines: string[] = [];
  for (const s of sections) {
    if (lines.length > 0) lines.push('');
    lines.push(line([s.title]));
    if (s.columns.length > 0) lines.push(line(s.columns));
    for (const r of s.rows) lines.push(line(r.cells));
    for (const f of s.footer ?? []) lines.push(line([f]));
  }
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

/** A CSV-fájl neve: a `.csv` kiterjesztéssel, a magyar karakterek ékezet nélküli alakjával. */
export function csvFileName(base: string): string {
  const plain = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
  return `${plain === '' ? 'tablazatok' : plain}.csv`;
}
