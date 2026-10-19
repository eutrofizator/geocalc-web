import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIELDS,
  DEFAULT_FORMAT,
  filterPoints,
  formatRow,
  formatTable,
  formatValue,
  matches,
  sortPoints,
  type Condition,
  type ExchangeField,
  type FormatOptions,
} from '../src/core/exchange';
import type { Point } from '../src/core/types';

const P = (id: string, y: number, x: number, m: number | null, code = '0'): Point => ({ id, y, x, m, code });
const pts = [
  P('1', 590543.33, 209686.71, 273.09, 'ko'),
  P('2', 591000.0, 210000.0, null),
  P('13', 591200.5, 210123.456, 100.5, 'pk'),
  P('10', 592000.0, 210500.0, 120.0),
];

const F = (keys: string[]): ExchangeField[] =>
  keys.map((k) => ({ key: k as ExchangeField['key'], label: k, enabled: true }));

const fmt = (over: Partial<FormatOptions> = {}): FormatOptions => ({ ...DEFAULT_FORMAT, ...over });

describe('a Koordináta kezelő szűrése (SQL select logika)', () => {
  it('a numerikus mezőket számszerűen hasonlítja', () => {
    expect(matches(pts[0]!, { field: 'y', op: '>', value: '591000' })).toBe(false);
    expect(matches(pts[1]!, { field: 'y', op: '>', value: '591000' })).toBe(false);
    expect(matches(pts[2]!, { field: 'y', op: '>=', value: '591200.5' })).toBe(true);
  });

  it('a szöveges mezőknél a tartalmazást is kezeli', () => {
    expect(matches(pts[0]!, { field: 'code', op: 'contains', value: 'k' })).toBe(true);
    expect(matches(pts[0]!, { field: 'code', op: '=', value: 'ko' })).toBe(true);
    expect(matches(pts[1]!, { field: 'code', op: '=', value: '0' })).toBe(true);
  });

  it('AND kapcsolattal minden feltételnek teljesülnie kell', () => {
    const conds: Condition[] = [
      { field: 'y', op: '>', value: '590000' },
      { field: 'm', op: '>', value: '200' },
    ];
    expect(filterPoints(pts, conds, 'and').map((p) => p.id)).toEqual(['1']);
  });

  it('OR kapcsolattal bármelyik feltétel elég', () => {
    const conds: Condition[] = [
      { field: 'code', op: '=', value: 'ko' },
      { field: 'code', op: '=', value: 'pk' },
    ];
    expect(filterPoints(pts, conds, 'or').map((p) => p.id)).toEqual(['1', '13']);
  });

  it('üres feltételeket figyelmen kívül hagy', () => {
    expect(filterPoints(pts, [{ field: 'y', op: '=', value: '  ' }], 'and')).toHaveLength(4);
  });

  it('a pontokat a GeoCalc szerint szövegesen rendezi (1, 10, 13, 2)', () => {
    expect(sortPoints(pts).map((p) => p.id)).toEqual(['1', '10', '13', '2']);
  });
});

describe('a Koordináta kezelő kimenete (mezőjellemzők)', () => {
  it('a mezőket a beállított hosszal igazítja (szöveg balra, szám jobbra)', () => {
    const row = formatRow(pts[0]!, F(['id', 'y', 'x', 'm']), fmt({ separator: '|', widths: { id: 6, y: 10, x: 10, m: 8 } }));
    expect(row).toBe('1     |590543.330|209686.710| 273.090');
  });

  it('az „Üres helyeket levágni” kikapcsolja a hossz szerinti igazítást', () => {
    const row = formatRow(pts[0]!, DEFAULT_FIELDS.slice(0, 2), fmt({ separator: ',', trim: true, widths: { id: 10, y: 12 } }));
    expect(row).toBe('1,590543.330');
  });

  it('a kikapcsolt mezők nem kerülnek a kimenetbe', () => {
    const fields: ExchangeField[] = DEFAULT_FIELDS.map((f) => ({ ...f, enabled: f.key !== 'code' }));
    const row = formatRow(pts[0]!, fields, fmt({ separator: ',', trim: true }));
    expect(row).toBe('1,590543.330,209686.710,273.090');
  });

  it('a számított jelző a `K>` kimenet utolsó mezője', () => {
    const row = formatRow(pts[0]!, DEFAULT_FIELDS.slice(0, 4), fmt({ separator: ', ', trim: true, withFlag: true }), new Set(['1']));
    expect(row).toBe('1, 590543.330, 209686.710, 273.090, 1');
  });

  it('a teljes táblát rendezve és soronként zárva adja', () => {
    const out = formatTable(pts, F(['id', 'y']), fmt({ separator: ',', trim: true }));
    expect(out.split('\r\n').filter(Boolean)).toEqual(['1,590543.330', '10,592000.000', '13,591200.500', '2,591000.000']);
    expect(out.endsWith('\r\n')).toBe(true);
  });

  it('a tizedesek száma állítható', () => {
    expect(formatRow(pts[0]!, F(['y']), fmt({ trim: true, decimals: 2 }))).toBe('590543.33');
  });

  it('a hiányzó magasság 0.000-ként jelenik meg (nem „null”)', () => {
    expect(formatValue(pts[1]!, 'm', 3)).toBe('0.000');
  });
});
