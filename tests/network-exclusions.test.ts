import { describe, expect, it } from 'vitest';
import { adjustHorizontal, type HorizontalResult } from '../src/core/network/horizontal';
import { DEFAULT_HORIZONTAL_SETTINGS } from '../src/core/network/types';
import { parseGmj, parseNetworkCoordinates } from '../src/core/network/gmj';
import { ISZKA_COORDINATES, ISZKA_GMJ } from './fixtures/iszkahegy';

const coords = parseNetworkCoordinates(ISZKA_COORDINATES).points;
const gmj = parseGmj(ISZKA_GMJ);

/** A „Mérések kizárása a kiegyenlítésből” táblázat (súgó 42. o.): jelölőnégyzetes sorok. */
describe('mérések kizárása jelölőnégyzettel', () => {
  const r: HorizontalResult = adjustHorizontal(coords, gmj.stations, DEFAULT_HORIZONTAL_SETTINGS);
  const section = r.sections.find((s) => s.kind === 'net-exclusions')!;

  it('minden irányra és távolságra pontosan egy sor van, jelölőnégyzettel', () => {
    expect(section).toBeDefined();
    expect(section.rows).toHaveLength(26 + 6);
    expect(section.rows.every((row) => row.check !== undefined)).toBe(true);
    expect(section.columns[0]).toBe('Kizárva');
    expect(section.rows[0]!.cells).toHaveLength(section.columns.length);
  });

  it('a kézzel kizárható mérés azonosítója `álláspont>cél:fajta`', () => {
    const keys = section.rows.map((row) => row.check!.key);
    expect(keys).toContain('541017D>2:dir');
    expect(keys).toContain('541017D>2:dist');
    expect(keys).toContain('541440>541017:dir');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a durva hiba miatt kihagyott mérés bejelölt és nem kapcsolható', () => {
    const excluded = section.rows.filter((row) => row.check!.checked);
    expect(excluded).toHaveLength(r.counts.excluded);
    expect(excluded.every((row) => row.check!.disabled)).toBe(true);
    expect(excluded.every((row) => row.cells[0] === 'kihagyva')).toBe(true);
    expect(section.rows.filter((row) => !row.check!.checked).every((row) => row.cells[0] === 'kiegyenlítésben')).toBe(true);
  });

  it('a kézzel kizárt mérés be van jelölve, de kapcsolható, és kimarad a kiegyenlítésből', () => {
    const manual = adjustHorizontal(coords, gmj.stations, { ...DEFAULT_HORIZONTAL_SETTINGS, excluded: ['541017D>2:dir'] });
    const rows = manual.sections.find((s) => s.kind === 'net-exclusions')!.rows;
    const row = rows.find((x) => x.check!.key === '541017D>2:dir')!;
    expect(row.check).toMatchObject({ checked: true, disabled: false });
    expect(row.cells[0]).toBe('kizárva');
    expect(manual.counts.excluded).toBe(r.counts.excluded + 1);
    expect(manual.counts.redundancy).toBe(r.counts.redundancy - 1);
    expect(manual.observations.find((o) => o.station === '541017D' && o.target === '2' && o.kind === 'direction')!.manual).toBe(true);
  });

  it('a táblázat láblécében a kizárások összegzése szerepel', () => {
    const footer = section.footer!.join(' ');
    expect(footer).toMatch(/jelölőnégyzet/);
    expect(footer).toMatch(new RegExp(`${r.counts.excluded} mérést a durva hiba`));
  });
});
