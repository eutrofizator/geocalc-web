import { describe, expect, it } from 'vitest';
import { landUseLabel, parseDrawing } from '../src/core/drawing';
import { writeDxf } from '../src/core/dxf-writer';
import { parseDxfEntities } from '../src/core/land-office';
import { LAYERS, buildingLayer } from '../src/core/layers';
import { planEntities, renderPlan, type PlanMeta } from '../src/core/plan';
import type { NamedPt } from '../src/core/parcel';

/** Rajzelemek (épület, alrészlet, vonal, felirat), a földhivatali rétegrend és a DXF kimenet. */

const P = (id: string, y: number, x: number): NamedPt => ({ id, y, x });
const pts = new Map(
  [P('1', 650000, 240000), P('2', 650040, 240000), P('3', 650040, 240025), P('4', 650000, 240025), P('E1', 650010, 240005), P('E2', 650022, 240005), P('E3', 650022, 240015), P('E4', 650010, 240015)].map(
    (p) => [p.id, p],
  ),
);

describe('rajzelemek', () => {
  const text = [
    '# az új lakóház',
    'épület ; új ; E1 E2 E3 E4',
    'épület ; gazdasági ; 1 E1 E4 4',
    'alrészlet ; a ; kivett ; 1 2 3 4',
    'új alrészlet ; b ; szántó ; E1 E2 E3 E4',
    'vonal ; kerítés ; 1 E1',
    'felirat ; házszám ; 35 ; @E4',
    'felirat ; utcanév ; Petőfi utca ; 650020 239995 ; 0',
  ].join('\n');
  const r = parseDrawing(text, pts);

  it('az elemek és a rétegek', () => {
    expect(r.issues).toEqual([]);
    expect(r.elements.map((e) => e.kind)).toEqual(['building', 'building', 'sub', 'sub', 'polyline', 'label', 'label']);
    expect(r.elements[0]).toMatchObject({ type: 'new', layer: 'newBuilding' });
    expect(r.elements[1]).toMatchObject({ type: 'farm', layer: 'farm' });
    expect(r.elements[3]).toMatchObject({ letter: 'b', use: 'szántó', isNew: true });
    expect(r.elements[5]).toMatchObject({ layer: 'houseNo', text: '35', at: { y: 650010, x: 240015 } });
    expect(r.elements[6]).toMatchObject({ layer: 'street', at: { y: 650020, x: 239995 } });
  });

  it('a hibás sorok érthető üzenetet adnak', () => {
    const bad = parseDrawing(['épület ; torony ; 1 2 3', 'épület ; új ; 1 2 9', 'felirat ; házszám ; 7 ; valahol', 'kör ; 1'].join('\n'), pts);
    expect(bad.issues.map((i) => i.message)).toEqual([
      'Rajzelemek 1. sor: ismeretlen épülettípus „torony” (új, lakó, gazdasági, üdülő, megszűnő, falsík).',
      'Rajzelemek 2. sor: ismeretlen pont(ok): 9.',
      'Rajzelemek 3. sor: a felirat helye „@pontszám” vagy „Y X” legyen.',
      'Rajzelemek 4. sor: ismeretlen elem „kör” (épület, alrészlet, új alrészlet, vonal, felirat).',
    ]);
  });

  it('a művelési ág rövidítése (18. § (2)) és az épület rétege a DAT kód szerint', () => {
    expect(landUseLabel('szántó')).toBe('Sz');
    expect(landUseLabel('Szőlő')).toBe('Sző');
    expect(landUseLabel('kivett, lakóház, udvar')).toBe('kivett, lakóház, udvar');
    expect(buildingLayer('CA01')).toBe('residential');
    expect(buildingLayer('CA06')).toBe('farm');
    expect(LAYERS.newBuilding.name).toBe('Új épület (bármilyen)');
  });

  const meta: PlanMeta = { keszito: 'K', szekhely: '', munkaszam: '', telepules: 'T', fekves: 'belterület', iktatoszam: '', megnevezes: 'épületfeltüntetés', igazolvany: '', minosites: '', hely: '', datum: '' };
  const parcel = { hrsz: '100', ring: [pts.get('1')!, pts.get('2')!, pts.get('3')!, pts.get('4')!], area: 1000 };
  const input = {
    before: [parcel],
    after: [parcel],
    address: [],
    drawing: r.elements,
    background: { parcels: [{ hrsz: '101', ring: [P('a', 650040, 240000), P('b', 650060, 240000), P('c', 650060, 240025), P('d', 650040, 240025)] }], buildings: [] },
  };

  it('a vázrajzon az új épület vastag vonallal, a felirat és a szomszéd hrsz', () => {
    const { svg } = renderPlan('change', input, meta);
    expect(svg).toMatch(/<polygon points="[^"]+" fill="none" stroke="#000" stroke-width="0\.6"\/>/);
    expect(svg).toContain('>35<');
    expect(svg).toContain('font-style="italic" text-anchor="middle">101<');
  });

  it('DXF: R12, ANSI_1250, a rétegek a földhivatali nevekkel, EOV Y → X, EOV X → Y', () => {
    const dxf = writeDxf(planEntities('change', input, 500), 500);
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('ANSI_1250');
    const ents = parseDxfEntities(dxf);
    const layers = new Set(ents.map((e) => e.layer));
    for (const n of ['Földrészlet határ', 'Helyrajziszám', 'Új épület (bármilyen)', 'Gazdasági és melléképület', 'Alrészlet határ', 'Előzetes alrészlet vonal', 'Kerítés (jogi állapottal nem egyező)', 'Házszám', 'Utcanév', 'Pontszám (mért)'])
      expect(layers.has(n)).toBe(true);
    const building = ents.find((e) => e.type === 'POLYLINE' && e.layer === 'Új épület (bármilyen)');
    expect(building).toBeDefined();
    const house = ents.find((e) => e.type === 'TEXT' && e.layer === 'Házszám')!;
    const g = (c: number) => house.codes.find(([k]) => k === c)?.[1];
    expect([g(10), g(20), g(1), g(40)]).toEqual(['650010', '240015', '35', '1']); // 2 mm · 1:500 = 1 m
  });
});
