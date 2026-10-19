import { describe, expect, it } from 'vitest';
import { run } from '../src/core/engine';
import {
  CALC_TYPES,
  autoCode,
  generateCode,
  joinFields,
  observationsOf,
  parseObservations,
  stations,
  type Observation,
} from '../src/core/descriptor';

const obs = (station: string, id: string, dir: string, dist = ''): Observation => ({ station, id, dir, dist });

describe('az Adatleíró kódvázai (súgó 44. o.)', () => {
  it('mind a nyolc előkészíthető számítást ismeri, a súgó sorrendjében (az IV a program külön kódja)', () => {
    expect(CALC_TYPES.map((t) => t.code)).toEqual(['TJ', 'PO', 'KP', 'VP', 'ET', 'IV', 'SV', 'SM']);
  });

  it('az álláspontokat és azok irányzott pontjait sorrendben adja', () => {
    const o = [obs('1', '5', '10'), obs('1', '6', '20'), obs('2', '5', '30')];
    expect(stations(o)).toEqual(['1', '2']);
    expect(observationsOf(o, '1').map((x) => x.id)).toEqual(['5', '6']);
  });

  it('a mezőket a GeoCalc jelölésével fűzi össze (belső üres mező megtartva)', () => {
    expect(joinFields(['104', '349.41', '316.70'])).toBe('104, 349.41, 316.70');
    expect(joinFields(['6', '', '321.2330'])).toBe('6, , 321.2330');
    expect(joinFields(['252', '156.0223', '173.4', undefined])).toBe('252, 156.0223, 173.4');
  });

  it('a tájékozást (TJ) a súgó mintája szerint kódolja', () => {
    const code = generateCode({
      type: 'TJ',
      station: '1',
      obs: [obs('1', '9', '182.0324'), obs('1', '5', '230.2105'), obs('1', '6', '321.2330')],
    });
    expect(code).toBe('tj\r\n1\r\n9, 182.0324\r\n5, 230.2105\r\n6, 321.2330\r\n;;\r\n');
  });

  it('a poláris pontot (PO) távolsággal együtt kódolja', () => {
    const code = generateCode({ type: 'PO', station: '1003', obs: [obs('1003', '104', '349.41', '316.70')] });
    expect(code).toBe('po\r\n1003\r\n104, 349.41, 316.70\r\n;;\r\n');
  });

  it('PO távolság nélkül hibát jelez', () => {
    expect(() => generateCode({ type: 'PO', station: '1003', obs: [obs('1003', '104', '349.41')] })).toThrow(/távolság/);
  });

  it('a központosítást (KP) a központ irányával és külpontosságával kódolja', () => {
    const code = generateCode({
      type: 'KP',
      station: '526',
      centerDir: '226.0611',
      eccentricity: '31.5270',
      obs: [obs('526', '52', '0.0107'), obs('526', '102', '93.1325', '123.5864')],
    });
    expect(code).toBe('kp\r\n526, 226.0611, 31.5270\r\n52, 0.0107\r\n102, 93.1325, 123.5864\r\n;;\r\n');
  });

  it('álláspont és kijelölt pont nélkül hibát jelez', () => {
    expect(() => generateCode({ type: 'TJ', station: '', obs: [obs('1', '5', '10')] })).toThrow(/álláspont/);
    expect(() => generateCode({ type: 'TJ', station: '1', obs: [] })).toThrow(/irányzott pont/);
  });
});

describe('az Adatleíró kódja a számítómagban', () => {
  const K = 'k_\r\n1 , 3817.26 , 7339.75\r\n5 , 2852.34 , 6562.88\r\n6 , 3092.68 , 8273.89\r\n9 , 3766.59 , 6327.93\r\n;;\r\n';

  it('a generált TJ blokk hibátlanul lefut és tájékozást ad', () => {
    const code = generateCode({
      type: 'TJ',
      station: '1',
      obs: [obs('1', '9', '182.0324'), obs('1', '5', '230.2105'), obs('1', '6', '321.2330')],
    });
    const r = run(K + code);
    expect(r.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    expect(r.sections.some((s) => s.kind === 'tj')).toBe(true);
  });

  it('a generált VP blokk szabad álláspontot számol', () => {
    const vpK =
      'k_\r\n5 , 2852.34 , 6562.88\r\n6 , 3092.68 , 8273.89\r\n7 , 4606.76 , 8451.54\r\n8 , 5245.84 , 6957.41\r\n9 , 3766.59 , 6327.93\r\n;;\r\n';
    const code = generateCode({
      type: 'VP',
      target: '1',
      station: '1',
      obs: [obs('1', '8', '104.1023'), obs('1', '9', '182.0324', '1013.05'), obs('1', '5', '230.2105', '1238.82')],
    });
    const r = run(vpK + code);
    expect(r.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    expect(r.computed.some((p) => p.id === '1')).toBe(true);
  });

  it('a generált ET blokk előmetszést számol', () => {
    const code = generateCode({ type: 'ET', target: '1', station: '1', obs: [obs('1', '9', '2.5201'), obs('1', '5', '51.0943')] });
    const base = 'k_\r\n5 , 2852.34 , 6562.88\r\n9 , 3766.59 , 6327.93\r\n;;\r\n';
    const r = run(base + code);
    expect(r.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    expect(r.computed.some((p) => p.id === '1')).toBe(true);
  });

  it('a generált IV blokk (álláspont nélkül) ívmetszést számol', () => {
    const code = generateCode({
      type: 'IV',
      target: '520',
      station: '',
      obs: [obs('', '113', '', '1260.631'), obs('', '116', '', '1499.979')],
    });
    expect(code).toBe('iv\r\n520\r\n113, 1260.631\r\n116, 1499.979\r\n;;\r\n');
    const base = 'K_\r\n113 57821.750 21792.910\r\n116 58379.270 23107.510\r\n;;\r\n';
    const r = run(base + code);
    expect(r.issues.filter((i) => i.level === 'error')).toHaveLength(0);
    expect(r.computed.some((p) => p.id === '520')).toBe(true);
  });

  it('az IV hiányzó távolságra hibát jelez', () => {
    expect(() => generateCode({ type: 'IV', target: '520', station: '', obs: [obs('', '113', '10.0000')] })).toThrow(/távolság/);
  });
});

describe('automatikus kódolás (súgó 44. o.)', () => {
  const rows = [
    obs('1015', '1001', '10.0000', '100.5'),
    obs('1015', '1002', '20.0000', '120.5'),
    obs('1015', '1003', '30.0000', '140.5'),
    obs('1015', '2001', '40.0000', '60.5'),
    obs('1015', '2002', '50.0000', '80.5'),
  ];

  it('ismert álláspontnál az első N irányból TJ, a többiből PO készül', () => {
    const code = autoCode({ obs: rows, known: new Set(['1001', '1002', '1003']), stationCode: 'tj', orientCount: 3 });
    expect(code).toContain('tj\r\n1015\r\n1001, 10.0000\r\n1002, 20.0000\r\n1003, 30.0000\r\n;;');
    expect(code).toContain('po\r\n1015\r\n2001, 40.0000, 60.5\r\n2002, 50.0000, 80.5\r\n;;');
    // A tájékozás előbb áll, mint a poláris pontszámítás.
    expect(code.indexOf('tj')).toBeLessThan(code.indexOf('po'));
  });

  it('szabad álláspontnál VP-t kódol', () => {
    const code = autoCode({ obs: rows.slice(0, 3), known: new Set(['1001', '1002', '1003']), stationCode: 'vp', orientCount: 3 });
    expect(code.startsWith('vp\r\n1015\r\n')).toBe(true);
    expect(code).not.toContain('tj');
  });

  it('üres mérésre üres szöveget ad', () => {
    expect(autoCode({ obs: [], known: new Set(), stationCode: 'tj', orientCount: 2 })).toBe('');
  });
});

describe('mérési sorok beolvasása', () => {
  it('a vesszős és a szóközös sorokat is értelmezi, a fejlécet kihagyja', () => {
    const text = '# álláspont, pont, irány, távolság\r\n1, 5, 230.2105\r\n1 6 321.2330 120.5\r\n';
    const { obs: o, skipped } = parseObservations(text);
    expect(skipped).toBe(0);
    expect(o).toEqual([
      { station: '1', id: '5', dir: '230.2105', dist: '' },
      { station: '1', id: '6', dir: '321.2330', dist: '120.5' },
    ]);
  });
});
