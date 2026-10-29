import { describe, expect, it } from 'vitest';
import { decodeText, mergeRegistered, mtextPlain, parseDxfEntities, readCadastralDxf, readRegisteredAreas, readSettlement, readZip } from '../src/core/land-office';

/**
 * A földhivatali adatszolgáltatás csomagja: ingatlan-nyilvántartási térkép DXF-ben (BHP, BHP_SZ, HRSZ,
 * *_FRSZ fóliák), földrészlet-információ (Report.txt) és földkönyvi kivonat. A minták a valódi
 * állományok szerkezetét követik, kitalált adatokkal.
 */

const g = (code: number, value: string | number) => `${String(code).padStart(3)}\r\n${value}\r\n`;
const insert = (y: number, x: number) => g(0, 'INSERT') + g(8, 'BHP') + g(2, 'JKDATA30') + g(10, y) + g(20, x) + g(30, 0);
const mtext = (layer: string, y: number, x: number, s: string) => g(0, 'MTEXT') + g(8, layer) + g(10, y) + g(20, x) + g(1, s);
const poly = (layer: string, pts: [number, number][]) =>
  g(0, 'LWPOLYLINE') + g(8, layer) + g(90, pts.length) + g(70, 1) + pts.map(([y, x]) => g(10, y) + g(20, x)).join('');

// Két szomszédos földrészlet: 100 (20 × 25 m) és 101 (15 × 25 m); a 101 egyik töréspontja pontszám nélküli.
const P: [string, number, number][] = [
  ['1-10_1', 650000, 240000],
  ['1-10_2', 650020, 240000],
  ['1-10_3', 650020, 240025],
  ['1-10_4', 650000, 240025],
  ['1-10_5', 650035, 240000],
];
const DXF =
  g(0, 'SECTION') + g(2, 'HEADER') + g(9, '$DWGCODEPAGE') + g(3, 'ANSI_1250') + g(0, 'ENDSEC') +
  g(0, 'SECTION') + g(2, 'ENTITIES') +
  P.map(([, y, x]) => insert(y, x)).join('') +
  P.map(([n, y, x]) => mtext('BHP_SZ', y, x, n)).join('') +
  mtext('HRSZ', 650010, 240012, '100') +
  mtext('HRSZ', 650027, 240012, '{\\fArial|b0;(101)}') +
  mtext('HRSZ', 650100, 240100, '999') +
  poly('BNK_FRSZ', [[650000, 240000], [650020, 240000], [650020, 240025], [650000, 240025]]) +
  poly('BNK_FRSZ', [[650020, 240000], [650035, 240000], [650035, 240025], [650020, 240025]]) +
  poly('KNK_FRSZ', [[650200, 240200], [650210, 240200], [650210, 240210]]) +
  g(0, 'LWPOLYLINE') + g(8, 'FOLDRESZLET') + g(90, 2) + g(70, 0) + g(10, 650000) + g(20, 240000) + g(10, 650020) + g(20, 240000) +
  g(0, 'ENDSEC') + g(0, 'EOF');

const REPORT = [
  '﻿2026.10.24. Page 1 of 1 ',
  'Földrészlet információ ',
  'Helyrajzi szám: 100 Létrehozó térrajz száma:  ',
  'Terület: 502 m2 Műszaki terület: 500.000000 m2 ',
  'Földrészlet típusa: Belterületi nem közterület földrészlet ',
  'Geometria: ',
  'Pontszám Y EOV X EOV ',
  '1-10_1  650000,00 ,  240000,00 ',
  '1-10_2  650020,00 ,  240000,00 ',
  '1-10_3  650020,00 ,  240025,00 ',
  '1-10_4  650000,00 ,  240025,00 ',
  '1-10_1  650000,00 ,  240000,00 ',
].join('\r\n');

const FOLDKONYV = [
  '  HRSZ    JEL     Müv.ág        Min.oszt.           Terület(ha.m2)       Kat.jöv.     ',
  '______________________________________________________________________________________________ ',
  '   100/     ',
  '          -   kivett                               0.0502                0.00           ',
  '                                    ÖSSZESEN:      0.0502                0.00          ',
  '   101/2     ',
  '          -   szántó                               1.0371                1.20           ',
  '                                    ÖSSZESEN:      1.0371                1.20          ',
].join('\r\n');

describe('DXF', () => {
  it('az ENTITIES szakasz elemei és az MTEXT formázás nélkül', () => {
    const ents = parseDxfEntities(DXF);
    expect(ents.filter((e) => e.type === 'LWPOLYLINE')).toHaveLength(4);
    expect(mtextPlain('{\\fArial|b0;(101)}')).toBe('(101)');
    expect(mtextPlain('egy\\Pkettő')).toBe('egy kettő');
  });

  it('a földrészletek a benne álló helyrajzi számmal, a határpontok a pontszámukkal', () => {
    const m = readCadastralDxf(DXF);
    expect(m.parcels.map((p) => [p.hrsz, p.layer, p.ring.join(' '), p.computed])).toEqual([
      ['100', 'BNK_FRSZ', '1-10_1 1-10_2 1-10_3 1-10_4', 500],
      ['101', 'BNK_FRSZ', '1-10_2 1-10_5 DXF1 1-10_3', 375],
    ]);
    expect(m.warnings).toEqual([
      '1 földrészlet-sokszögben nincs helyrajzi szám (jellemzően a kivágat szélén) – ezeket kihagyta.',
      '1 töréspontnak nincs pontszáma a DXF-ben (DXF1, DXF2… nevet kapott).',
    ]);
  });
});

describe('a földhivatali szöveges kimenetek', () => {
  it('földrészlet-információ: terület, műszaki terület és geometria', () => {
    const r = readRegisteredAreas(REPORT);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ hrsz: '100', area: 502, technical: 500 });
    expect(r[0]!.points!.map((p) => p.id)).toEqual(['1-10_1', '1-10_2', '1-10_3', '1-10_4']);
    expect(r[0]!.points![1]).toEqual({ id: '1-10_2', y: 650020, x: 240000 });
  });

  it('földkönyvi kivonat: ha.m2 terület (0.0502 = 502 m², 1.0371 = 10 371 m²)', () => {
    expect(readRegisteredAreas(FOLDKONYV)).toEqual([
      { hrsz: '100', area: 502 },
      { hrsz: '101/2', area: 10_371 },
    ]);
  });

  it('a két forrás összevonva helyrajzi számonként egyszer', () => {
    const m = mergeRegistered([readRegisteredAreas(FOLDKONYV), readRegisteredAreas(REPORT)]);
    expect(m.map((r) => [r.hrsz, r.area, r.points?.length ?? 0])).toEqual([
      ['100', 502, 4],
      ['101/2', 10_371, 0],
    ]);
  });
});

describe('ZIP', () => {
  const enc = new TextEncoder();
  async function zip(files: [string, string, boolean][]): Promise<ArrayBuffer> {
    const parts: BlobPart[] = [];
    const central: BlobPart[] = [];
    let cdSize = 0;
    let offset = 0;
    for (const [name, text, deflate] of files) {
      const raw = enc.encode(text);
      const data: Uint8Array<ArrayBuffer> = deflate
        ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
        : raw;
      const nm = enc.encode(name);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(8, deflate ? 8 : 0, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, raw.length, true);
      local.setUint16(26, nm.length, true);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(10, deflate ? 8 : 0, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, raw.length, true);
      cd.setUint16(28, nm.length, true);
      cd.setUint32(42, offset, true);
      parts.push(new Uint8Array(local.buffer), nm, data);
      central.push(new Uint8Array(cd.buffer), nm);
      cdSize += 46 + nm.length;
      offset += 30 + nm.length + data.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)]).arrayBuffer();
  }

  it('tárolt és deflate tagok kibontása', async () => {
    const files = await readZip(await zip([
      ['Report.txt', REPORT, false],
      ['terkep.dxf', DXF, true],
    ]));
    expect(files.map((f) => f.name)).toEqual(['Report.txt', 'terkep.dxf']);
    expect(decodeText(files[1]!.data)).toBe(DXF);
    expect(readRegisteredAreas(decodeText(files[0]!.data))[0]!.area).toBe(502);
  });

  it('a Windows-1250 kódolás felismerése', () => {
    const bytes = new Uint8Array([0x48, 0x52, 0x53, 0x5a, 0x20, 0xe1, 0xe9, 0xf5]); // „HRSZ áéő”
    expect(decodeText(bytes)).toBe('HRSZ áéő');
  });

  it('nem ZIP állomány', async () => {
    await expect(readZip(new ArrayBuffer(40))).rejects.toThrow(/Nem ZIP/);
  });
});

describe('földkönyvi kivonat fejléce', () => {
  it('a település és a fekvés', () => {
    const text = ['*'.repeat(40), ' 1234 KISVÁROS   BELTERÜLET ', '*'.repeat(40), '  HRSZ    JEL'].join('\r\n');
    expect(readSettlement(text)).toEqual({ telepules: 'Kisváros', fekves: 'Belterület' });
    expect(readSettlement(' 0042 ALSÓ-HEGYVÁROS  KÜLTERÜLET')).toEqual({ telepules: 'Alsó-Hegyváros', fekves: 'Külterület' });
    expect(readSettlement('nincs fejléc')).toBeNull();
  });
});
