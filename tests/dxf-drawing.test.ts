import { describe, expect, it } from 'vitest';
import { matchPoints, readDxfDrawing } from '../src/core/dxf-drawing';

/** DXF megjelenítő: a rajzelemek fóliánként és a saját pontok legközelebbi DXF pontja (kitalált koordináták). */

const dxf = (...ents: (string | number)[][]) =>
  ['0', 'SECTION', '2', 'ENTITIES', ...ents.flatMap((e) => e.map(String)), '0', 'ENDSEC', '0', 'EOF'].join('\n');

const sample = dxf(
  ['0', 'LWPOLYLINE', '8', 'BNK_FRSZ', '90', 4, '70', 1, '10', 650000, '20', 240000, '10', 650040, '20', 240000, '10', 650040, '20', 240025, '10', 650000, '20', 240025],
  ['0', 'LINE', '8', 'KERITES', '10', 650000, '20', 240030, '11', 650040, '21', 240030],
  ['0', 'POLYLINE', '8', 'EPULET', '70', 1],
  ['0', 'VERTEX', '8', 'EPULET', '10', 650010, '20', 240005],
  ['0', 'VERTEX', '8', 'EPULET', '10', 650020, '20', 240005],
  ['0', 'VERTEX', '8', 'EPULET', '10', 650020, '20', 240012],
  ['0', 'SEQEND', '8', 'EPULET'],
  ['0', 'CIRCLE', '8', 'JEL', '10', 650030, '20', 240010, '40', 0.5],
  ['0', 'MTEXT', '8', 'HRSZ', '10', 650020, '20', 240012, '40', 2, '1', '{\\fArial;100}'],
  ['0', 'INSERT', '8', 'BHP', '2', 'HP', '10', 650040, '20', 240000],
  ['0', 'TEXT', '8', 'BHP_SZ', '10', 650040, '20', 240000, '40', 1, '1', '17'],
  ['0', 'HATCH', '8', 'X'],
);

describe('DXF megjelenítő', () => {
  const d = readDxfDrawing(sample);

  it('a rajzelemek fóliánként, a befoglaló téglalap', () => {
    expect(d.layers.map((l) => l.name)).toEqual(['BHP', 'BHP_SZ', 'BNK_FRSZ', 'EPULET', 'HRSZ', 'JEL', 'KERITES']);
    const poly = d.items.find((i) => i.layer === 'EPULET');
    expect(poly).toMatchObject({ kind: 'path', closed: true });
    expect(poly && poly.kind === 'path' && poly.pts).toHaveLength(3);
    expect(d.items.find((i) => i.layer === 'HRSZ')).toMatchObject({ kind: 'text', text: '100', height: 2 });
    expect(d.items.find((i) => i.layer === 'BHP')).toMatchObject({ kind: 'point', block: 'HP' });
    expect(d.bounds).toEqual({ minY: 650000, minX: 240000, maxY: 650040, maxX: 240030 });
    expect(d.warnings[0]).toContain('HATCH (1)');
  });

  it('a számozott határpont és a legközelebbi DXF pont eltérése', () => {
    expect(d.named).toEqual([{ id: '17', y: 650040, x: 240000 }]);
    const m = matchPoints(d, [
      { id: '1', y: 650040.03, x: 239999.96 },
      { id: '2', y: 650000.1, x: 240030 },
      { id: '3', y: 650030.4, x: 240010 },
    ], 1);
    expect(m[0]!.near!.name).toBe('17');
    expect(m[0]!.near!.dist).toBeCloseTo(0.05, 6);
    expect(m[1]!.near).toMatchObject({ name: '', y: 650000, x: 240030 });
    // A kör (pontjel) húrjai nem számítanak töréspontnak.
    expect(m[2]!.near).toBeNull();
  });
});
