import { describe, expect, it } from 'vitest';
import { parseDrawing } from '../src/core/drawing';
import { JOBS } from '../src/core/jobs';
import type { NamedPt } from '../src/core/parcel';
import { renderPlan, type PlanMeta } from '../src/core/plan';

/** A munka fajtája szerinti vázrajz és vázlat (8/2018. AM rendelet 15., 17., 19., 27–28. melléklet). */

const P = (id: string, y: number, x: number): NamedPt => ({ id, y, x });
const pts = new Map(
  [P('1', 650000, 240000), P('2', 650040, 240000), P('3', 650040, 240025), P('4', 650000, 240025), P('5', 650015, 240000), P('6', 650015, 240025), P('E1', 650020, 240005), P('E2', 650030, 240005), P('E3', 650030, 240012), P('E4', 650020, 240012)].map(
    (p) => [p.id, p],
  ),
);
const parcel = { hrsz: '100', ring: ['1', '2', '3', '4'].map((i) => pts.get(i)!), area: 1000 };
const meta: PlanMeta = { keszito: 'K', szekhely: '', munkaszam: '', telepules: '', fekves: '', iktatoszam: '', megnevezes: '', igazolvany: '', minosites: '', hely: '', datum: '' };

describe('a munka fajtája szerinti rajzok', () => {
  it('kitűzés: KITŰZÉSI VÁZRAJZ, a 43. § (3) felirata és a kitűzött földrészlet méretei', () => {
    const { svg } = renderPlan('change', { before: [parcel], after: [parcel], address: [] }, meta, { template: JOBS.setout.plan, job: 'setout' });
    expect(svg).toContain('KITŰZÉSI VÁZRAJZ');
    expect(svg).toContain('jelöltem meg. (43. § (3))');
    expect(svg).toContain('>40.00<');
    expect(svg).toContain('>25.00<');
    expect(svg).not.toContain('Területkimutatás');
    const sketch = renderPlan('sketch', { before: [parcel], after: [parcel], address: [] }, meta, { template: JOBS.setout.sketch, job: 'setout' }).svg;
    expect(sketch).toContain('KITŰZÉSI VÁZLAT');
  });

  it('épületfeltüntetés: az 51. § (2) záradék helye, a vázlaton az új épület méretei', () => {
    const drawing = parseDrawing('épület ; új ; E1 E2 E3 E4', pts).elements;
    const plan = renderPlan('change', { before: [parcel], after: [parcel], address: [], drawing }, meta, { template: JOBS.building.plan, job: 'building' }).svg;
    expect(plan).toContain('Záradék (51. § (2)):');
    expect(plan).not.toContain('akaratunknak');
    const sketch = renderPlan('sketch', { before: [parcel], after: [parcel], address: [], drawing }, meta, { template: JOBS.building.sketch, job: 'building' }).svg;
    expect(sketch).toContain('>10.00<');
    expect(sketch).toContain('>7.00<');
    expect(sketch).not.toContain('>40.00<');
  });

  it('művelési ág változás: mezőgazdász-záradék, a megszűnő alrészlet áthúzva, az új vastagon', () => {
    const drawing = parseDrawing(['alrészlet ; a ; szántó ; 1 2 3 4', 'új alrészlet ; a ; kivett ; 1 5 6 4', 'új alrészlet ; b ; szántó ; 5 2 3 6'].join('\n'), pts).elements;
    const svg = renderPlan('change', { before: [parcel], after: [parcel], address: [], drawing }, meta, { template: JOBS.landuse.plan, job: 'landuse' }).svg;
    expect(svg).toContain('Mezőgazdász-záradék (30. § (2)):');
    expect(svg).toMatch(/fill="#555">Sz<\/text>/);
    expect(svg).toMatch(/font-weight="bold">kivett<\/text>/);
  });
});
