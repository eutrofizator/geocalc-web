import { describe, expect, it } from 'vitest';
import {
  chooseScale,
  coordinateList,
  generateAddressPoints,
  haM2,
  parsePointAttrs,
  pointGroup,
  renderPlan,
  subjectSentence,
  type PlanMeta,
} from '../src/core/plan';
import { JOBS } from '../src/core/jobs';

/** Koordinátajegyzék, címkoordináták és a vázrajz (8/2018. AM rendelet 4., 10., 15. melléklet, 46. §). */

describe('pontkód és koordinátajegyzék', () => {
  it('a pontkód csoportja (4. melléklet)', () => {
    expect(pointGroup('0205')).toBe('base');
    expect(pointGroup('3115')).toBe('detail');
    expect(pointGroup('5411')).toBe('address');
    expect(pointGroup('')).toBe('detail');
  });

  it('a koordinátasor magassága és pontkódja (pontszám, Y, X, Z, pontkód)', () => {
    const a = parsePointAttrs(['Psz. Y X Z', '500\t650100.000\t240100.000\t0.000\t0305', '101 650120.45 241230.18'].join('\n'));
    expect(a.get('500')).toEqual({ m: 0, code: '0305' });
    expect(a.get('101')).toEqual({ m: null, code: '' });
    expect(a.has('Psz.')).toBe(false);
  });

  it('csoportonként számsorrendben, cm és a címkoordináta m élességgel', () => {
    const r = coordinateList([
      { id: '12', y: 650010.004, x: 240020.006, m: null, code: '3115' },
      { id: '9', y: 650000.1, x: 240000.2, m: 101.5, code: '3115' },
      { id: '500', y: 650100, x: 240100, m: null, code: '0305' },
      { id: 'C1', y: 650005.4, x: 240010.6, m: null, code: '5411' },
    ]);
    expect(r.sections.map((s) => s.title)).toEqual([
      'Koordinátajegyzék – Alappontok',
      'Koordinátajegyzék – Részletpontok',
      'Koordinátajegyzék – Címkoordináták',
    ]);
    expect(r.sections[1]!.rows.map((x) => x.cells[0])).toEqual(['9', '12']);
    expect(r.text.split('\r\n')).toEqual([
      'Pontszám\tY\tX\tZ\tPontkód',
      '500\t650100.00\t240100.00\t0.00\t0305',
      '9\t650000.10\t240000.20\t101.50\t3115',
      '12\t650010.00\t240020.01\t0.00\t3115',
      'C1\t650005\t240011\t0.00\t5411',
      '',
    ]);
  });
});

describe('címkoordináták', () => {
  it('generált (5411) pont a földrészleten belül, méterre kerekítve', () => {
    const ring = [
      { y: 650000, x: 240000 },
      { y: 650020, x: 240000 },
      { y: 650020, x: 240025 },
      { y: 650000, x: 240025 },
    ];
    expect(generateAddressPoints([{ hrsz: '123/1', ring }], 'C')).toEqual([{ id: 'C1', hrsz: '123/1', y: 650010, x: 240013, code: '5411' }]);
  });
});

describe('vázrajz', () => {
  const P = (id: string, y: number, x: number) => ({ id, y, x });
  const p1 = P('1', 650000, 240000);
  const p2 = P('2', 650040, 240000);
  const p3 = P('3', 650040, 240025);
  const p4 = P('4', 650000, 240025);
  const u1 = P('U1', 650012, 240000);
  const u2 = P('U2', 650012, 240025);
  const meta: PlanMeta = {
    keszito: 'Minta Földmérő Kft.',
    szekhely: '1111 Budapest, Minta u. 1.',
    munkaszam: '12/2026',
    telepules: 'Mintafalva',
    fekves: 'belterület',
    iktatoszam: '700/1/2026',
    megnevezes: 'telekfelosztás',
    igazolvany: '1234',
    minosites: '',
    hely: 'Budapest,',
    datum: '2026.10.25.',
  };
  const input = {
    before: [{ hrsz: '100', ring: [p1, p2, p3, p4], area: 1000 }],
    after: [
      { hrsz: '100/1', ring: [p1, u1, u2, p4], area: 300 },
      { hrsz: '100/2', ring: [u1, p2, p3, u2], area: 700 },
    ],
    address: [{ id: 'C1', hrsz: '100/1', y: 650006, x: 240013, code: '5411' }],
  };

  it('a szabványos méretarány a keretbe fér', () => {
    expect(chooseScale(46, 29, 190, 150)).toBe(250);
    expect(chooseScale(400, 300, 190, 150)).toBe(4000);
  });

  it('a változási vázrajz a 15. melléklet mintája szerint: fejléc, tárgymondat, területkimutatás ha.m²-ben, lábrész', () => {
    const { svg, scale } = renderPlan('change', input, meta, { template: JOBS.subdivision.plan, job: 'subdivision' });
    expect(scale).toBe(500);
    for (const s of [
      'VÁLTOZÁSI VÁZRAJZ',
      'a 100 helyrajzi számú földrészlet megosztásáról',
      'Munka száma: 12/2026',
      'Adatszolg. ikt.sz.: 700/1/2026',
      'M= 1:500',
      'A változás akaratunknak megfelelően történt:',
      'A vázrajz méretek levételére nem alkalmas.',
      'Változás előtti állapot',
      'Változás utáni állapot',
      'Szolgalmi és egyéb jogok',
      '>0.1000<',
      '>0.0300<',
      '>0.0700<',
      'Címkoordináták 100/1 hrsz',
      'Szükség esetén:',
      'földminősítési záradék',
      'Az 51. § (1) bekezdés szerinti záradékszöveg.',
    ])
      expect(svg).toContain(s);
    // Az új határ (U1–U2) vastag vonallal; az oszlopszámozás 1–14.
    expect(svg).toMatch(/stroke-width="0\.7"/);
    expect(svg).toContain('font-weight="bold">14<');
    // Az új 100/1 vastagon; a megszűnő 100 áthúzva.
    expect(svg).toMatch(/font-weight="bold">100\/1<\/text>/);
    expect(svg).toMatch(/font-style="italic">100<\/text><line /);
  });

  it('a területkimutatás minőségi osztály oszlopa (4. és 10.) az alrészletekből', () => {
    const subs = {
      before: [{ hrsz: '100', letter: 'a', use: 'szántó', quality: '5', area: 1000 }],
      after: [
        { hrsz: '100/1', letter: 'a', use: 'szántó', quality: '5', area: 300 },
        { hrsz: '100/2', letter: 'a', use: 'kivett', quality: '', area: 700 },
      ],
    };
    const { svg } = renderPlan('change', { ...input, subs }, meta, { template: JOBS.subdivision.plan, job: 'subdivision' });
    expect(svg.match(/font-style="italic">5<\/text>/g)).toHaveLength(2);
    expect(svg).toContain('>szántó<');
  });

  it('ha.m² alak és tárgymondat egyesítésnél', () => {
    expect(haM2(1102)).toBe('0.1102');
    expect(haM2(12345.4)).toBe('1.2345');
    expect(subjectSentence('subdivision', { before: input.after, after: input.before, address: [] }, '')).toBe('a 100/1, 100/2 helyrajzi számú földrészletek egyesítéséről');
  });

  it('a mérési vázlat (10/A. minta) a 11. melléklet színeivel: mért zöld, új piros', () => {
    const measuredPts = new Map([['U1', { y: 650012.01, x: 240000 }], ['U2', { y: 650012, x: 240025.02 }]]);
    const { svg } = renderPlan('sketch', { ...input, measured: new Set(['U1', 'U2']), measuredPts }, meta, { template: JOBS.subdivision.sketch, job: 'subdivision' });
    expect(svg).toContain('MÉRÉSI VÁZLAT');
    expect(svg).toContain('>25.00<');
    expect(svg).toContain('-val jelöltem meg.');
    expect(svg).toContain('A …………. sz. záradékolt munkából átvett méretek.');
    // A mért távolság zölden, dőlten, aláhúzva; a mért pontszám zölden.
    expect(svg).toMatch(/text-decoration="underline" fill="#118a2e"[^>]*>25\.02</);
    expect(svg).toMatch(/fill="#118a2e">U1</);
    expect(svg).not.toContain('Változás előtti állapot');
  });
});
