import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvFileName, sectionsToCsv } from '../src/core/csv';
import type { Section } from '../src/core/types';

const section = (over: Partial<Section> = {}): Section => ({
  kind: 'test',
  title: 'Minta táblázat',
  columns: ['Pontszám', 'Y', 'X'],
  rows: [
    { cells: ['1', '611474.280', '219913.350'], role: 'base' },
    { cells: ['2', '616177.930', '210269.540'], role: 'result' },
  ],
  ...over,
});

describe('CSV kimenet', () => {
  it('bájt-sorrendjelet, pontosvesszős elválasztást és CRLF sorvéget használ', () => {
    const csv = sectionsToCsv([section()]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toContain('Minta táblázat\r\n');
    expect(csv).toContain('Pontszám;Y;X\r\n');
    expect(csv).toContain('1;611474.280;219913.350\r\n');
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv).not.toContain(',');
  });

  it('a szakaszokat üres sor választja el, és a lábléc is bekerül', () => {
    const csv = sectionsToCsv([section({ footer: ['zk = 292°04′36″'] }), section({ title: 'Második' })]);
    expect(csv).toContain('\r\n\r\n');
    expect(csv).toContain('zk = 292°04′36″\r\n');
    expect(csv).toContain('Második\r\n');
  });

  it('időzőjelbe teszi az elválasztót, az idézőjelet és a sortörést tartalmazó mezőt', () => {
    const csv = sectionsToCsv([
      section({
        columns: ['Megjegyzés'],
        rows: [{ cells: ['bal; jobb'] }, { cells: ['idézőjel " benne'] }, { cells: ['két\nsor'] }, { cells: [' szóközös '] }],
      }),
    ]);
    expect(csv).toContain('"bal; jobb"');
    expect(csv).toContain('"idézőjel "" benne"');
    expect(csv).toContain('"két\nsor"');
    expect(csv).toContain('" szóközös "');
  });

  it('fejléc nélküli és üres szakasz is kezelhető', () => {
    expect(sectionsToCsv([])).toBe(CSV_BOM + '\r\n');
    const csv = sectionsToCsv([{ kind: 'x', title: 'Csak cím', columns: [], rows: [] }]);
    expect(csv).toContain('Csak cím\r\n');
  });
});

describe('CSV fájlnév', () => {
  it('ékezet nélküli, biztonságos fájlnevet ad', () => {
    expect(csvFileName('Hálózat táblázatok')).toBe('Halozat_tablazatok.csv');
    expect(csvFileName('szamitas_tablazatok')).toBe('szamitas_tablazatok.csv');
    expect(csvFileName('')).toBe('tablazatok.csv');
    expect(csvFileName('  ...  ')).toBe('tablazatok.csv');
  });
});
