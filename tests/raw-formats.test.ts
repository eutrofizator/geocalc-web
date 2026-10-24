import { describe, expect, it } from 'vitest';
import { angleToDeg, detectFieldFormat, parseFieldData, parseGeodimeter, parseGts7, parseRw5, parseSdr, toNetworkGmj } from '../src/core/field-book';
import { parseGmj } from '../src/core/network/gmj';

/**
 * A műszerek nyers mérési állományai: Sokkia SDR (a Sokkia „SDR Electronic Field Book” formátumleírása),
 * Geodimeter címke=érték, Topcon GTS-7 és a FOIF FieldGenius / SurvCE RW5 (Carlson/TDS).
 */

const DMS = (d: number, m: number, s: number) => d + m / 60 + s / 3600;
const pad = (s: string | number, w: number) => String(s).padEnd(w, ' ').slice(0, w);
const rpad = (s: string | number, w: number) => String(s).padStart(w, ' ').slice(-w);

describe('szögegységek', () => {
  it('FOK.PPMMSS, tizedes fok, gon és mil', () => {
    expect(angleToDeg('123.4530', 'dms')).toBeCloseTo(DMS(123, 45, 30), 12);
    expect(angleToDeg('91.30005', 'dms')).toBeCloseTo(DMS(91, 30, 0.5), 12);
    expect(angleToDeg('90.275', 'deg')).toBe(90.275);
    expect(angleToDeg('100', 'gon')).toBe(90);
    expect(angleToDeg('1600', 'mil')).toBe(90);
    expect(() => angleToDeg('10.6000', 'dms')).toThrow(/≥ 60/);
  });
});

describe('Sokkia SDR2x (4 jegyű pontszám)', () => {
  // A formátumleírás 3.6.1 fejezete szerinti mezők és szélességek.
  const header = `00NM${pad('SDR20     V03-05', 16)}${pad('0000', 4)}${pad('25-Sep-10 22:10', 16)}113111`;
  const instr = `01NM:${pad('', 16)}000000${pad('', 16)}00000031${pad('', 1)}`; // 51. karakter: 1 = zenitszög
  const stn = `02TP0001${rpad('5000.000', 10)}${rpad('3000.000', 10)}${rpad('100.000', 10)}${rpad('1.595', 10)}${pad('ALLAS', 16)}`;
  const tgt = `03NM${rpad('1.474', 10)}`;
  const obs1 = `09F100019999${rpad('28.950', 10)}${rpad('90.2750000', 10)}${rpad('121.855555', 10)}`;
  const obs2 = `09F100011001${pad('', 10)}${rpad('90.2166666', 10)}${rpad('114.030555', 10)}${pad('FIT-TEST', 16)}`;

  it('álláspont, jelmagasság és mérések a megfelelő oszlopokból (tizedes fokban)', () => {
    const r = parseSdr([header, instr.padEnd(51, '1'), stn, tgt, obs1, obs2].join('\n'));
    expect(r.issues).toEqual([]);
    expect(r.rows.map((x) => `${x.kind}:${x.id}`)).toEqual(['station:0001', 'obs:9999', 'obs:1001']);
    expect(r.rows[0]!.mm).toBe(1.595);
    const a = r.rows[1]!;
    expect(a.tf).toBe(28.95);
    expect(a.zi).toBeCloseTo(90.275, 9);
    expect(a.hz).toBeCloseTo(121.855555, 9);
    expect(a.mj).toBe(1.474);
    // A csak irányt tartalmazó mérésnek nincs távolsága és jelmagassága.
    expect(r.rows[2]!.tf).toBeNull();
    expect(r.rows[2]!.mj).toBeNull();
    expect(r.rows[2]!.code).toBe('FIT-TEST');
  });

  it('gon egység a fejlécből (41. karakter = 2)', () => {
    const h = `${header.slice(0, 40)}2${header.slice(41)}`;
    const r = parseSdr([h, stn, `09F100011002${rpad('10.000', 10)}${rpad('100.0000', 10)}${rpad('200.0000', 10)}`].join('\n'));
    expect(r.rows[1]!.zi).toBeCloseTo(90, 9);
    expect(r.rows[1]!.hz).toBeCloseTo(180, 9);
  });

  it('magassági szög beállításnál (01 rekord 51. karakter = 2) zenitszögre alakít', () => {
    const ins = `01NM:${pad('', 16)}000000${pad('', 16)}000000${pad('', 1)}2`;
    const r = parseSdr([header, ins, stn, `09F100011002${rpad('10.000', 10)}${rpad('1.5000', 10)}${rpad('10.0000', 10)}`].join('\n'));
    expect(r.rows[1]!.zi).toBeCloseTo(88.5, 9);
  });
});

describe('Sokkia SDR33 (16 karakteres pontszám)', () => {
  const stn = `02TP${pad('ALLAS1', 16)}${rpad('5000.000', 16)}${rpad('3000.000', 16)}${rpad('100.000', 16)}${rpad('1.500', 16)}${pad('', 16)}`;
  const tgt = `03NM${rpad('1.300', 16)}`;
  const obs = `09F1${pad('ALLAS1', 16)}${pad('P-101', 16)}${rpad('152.376', 16)}${rpad('91.39583333', 16)}${rpad('45.20944444', 16)}${pad('KO', 16)}`;

  it('az alfanumerikus változatot a rekord hosszából ismeri fel', () => {
    const r = parseSdr([stn, tgt, obs].join('\n'));
    expect(r.rows.map((x) => `${x.kind}:${x.id}`)).toEqual(['station:ALLAS1', 'obs:P-101']);
    expect(r.rows[0]!.mm).toBe(1.5);
    expect(r.rows[1]).toMatchObject({ tf: 152.376, mj: 1.3, code: 'KO' });
    expect(r.rows[1]!.zi).toBeCloseTo(91.39583333, 8);
  });
});

describe('Geodimeter (címke=érték)', () => {
  const job = ['50=PROBA', '2=ST1', '3=1.520', '5=101', '4=KERITES', '6=1.300', '7=123.4530', '8=91.3000', '9=100.000', '5=102', '7=200.0000', '8=90.0000'].join('\r\n');

  it('álláspont (2=, 3=) és mérések (5=, 4=, 6=, 7=, 8=, 9=)', () => {
    const r = parseGeodimeter(job, 'dms');
    expect(r.issues).toEqual([]);
    expect(r.rows.map((x) => `${x.kind}:${x.id}`)).toEqual(['station:ST1', 'obs:101', 'obs:102']);
    expect(r.rows[0]!.mm).toBe(1.52);
    expect(r.rows[1]).toMatchObject({ code: 'KERITES', tf: 100, mj: 1.3 });
    expect(r.rows[1]!.hz).toBeCloseTo(DMS(123, 45, 30), 9);
    expect(r.rows[1]!.zi).toBeCloseTo(91.5, 9);
    expect(r.rows[2]!.tf).toBeNull();
  });

  it('a szögegység választható (gon)', () => {
    const r = parseGeodimeter('2=A\n5=1\n7=100.0000\n8=100.0000\n9=10', 'gon');
    expect(r.rows[1]!.hz).toBeCloseTo(90, 9);
  });

  it('több címke egy sorban is', () => {
    const r = parseGeodimeter('2=A 3=1.5\n5=1 6=1.2 7=10.0000 8=90.0000 9=12.5', 'dms');
    expect(r.rows[1]).toMatchObject({ id: '1', tf: 12.5, mj: 1.2 });
  });
});

describe('Topcon GTS-7', () => {
  const gts = [
    'GTS-7',
    'UNITS   M,D',
    'STN     1001,1.550,ALLAS',
    'BS      1002,1.500',
    'SD      0.0000,90.0000,100.000',
    'SS      1003,1.300,KO',
    'SD      123.4530,91.3000,50.000',
    'SS      1004,1.300',
    'HD      200.1500,48.500,1.250',
  ].join('\n');

  it('STN, BS/SS és SD/HD rekordok, FOK.PPMMSS szögek', () => {
    const r = parseGts7(gts);
    expect(r.issues).toEqual([]);
    expect(r.rows.map((x) => `${x.kind}:${x.id}`)).toEqual(['station:1001', 'obs:1002', 'obs:1003', 'obs:1004']);
    expect(r.rows[0]!.mm).toBe(1.55);
    expect(r.rows[2]).toMatchObject({ tf: 50, mj: 1.3, code: 'KO' });
    expect(r.rows[2]!.hz).toBeCloseTo(DMS(123, 45, 30), 9);
    expect(r.rows[3]).toMatchObject({ tv: 48.5, tf: null });
  });

  it('gon egység a UNITS rekordból', () => {
    const r = parseGts7(['UNITS   M,G', 'STN     1,1.5', 'SS      2,1.3', 'SD      100.0000,100.0000,10.000'].join('\n'));
    expect(r.rows[1]!.hz).toBeCloseTo(90, 9);
  });

  it('SD rekord BS/FS/SS nélkül hibát ad', () => {
    expect(parseGts7('STN     1,1.5\nSD      1,90,10').issues[0]!.message).toMatch(/BS\/FS\/SS nélkül/);
  });
});

describe('FOIF FieldGenius / SurvCE RW5 (Carlson/TDS)', () => {
  const rw5 = [
    'MO,AD0,UN1,SF1.00000000,EC1,EO0.0,AU0',
    'OC,OP1,N 5000.00000,E 5000.00000,EL100.000,--CP',
    'LS,HI1.500000,HR1.300000',
    'BK,OP1,BP2,BS315.0000,BC0.0044',
    'BD,OP1,FP2,AR0.0055,ZE86.0126,SD10.320000,--CP',
    'SS,OP1,FP3,AR57.1630,ZE89.4305,SD7.393000,--KO',
    'LS,HR2.000000',
    'SS,OP1,FP4,AR90.3333,ZE90.0000,HD25.550000',
  ].join('\n');

  it('álláspont (OC, LS HI), jelmagasság (LS HR) és mérések (AR, ZE, SD/HD)', () => {
    const r = parseRw5(rw5);
    expect(r.issues).toEqual([]);
    expect(r.rows.map((x) => `${x.kind}:${x.id}`)).toEqual(['station:1', 'obs:2', 'obs:3', 'obs:4']);
    expect(r.rows[0]!.mm).toBe(1.5);
    expect(r.rows[2]).toMatchObject({ tf: 7.393, mj: 1.3, code: 'KO' });
    expect(r.rows[2]!.hz).toBeCloseTo(DMS(57, 16, 30), 9);
    expect(r.rows[2]!.zi).toBeCloseTo(DMS(89, 43, 5), 9);
    expect(r.rows[3]).toMatchObject({ tv: 25.55, mj: 2 });
  });

  it('gon (AU1) és láb (UN0)', () => {
    const r = parseRw5(['MO,AU1,UN0', 'OC,OP1', 'SS,OP1,FP2,AR100.0000,ZE100.0000,SD10.000'].join('\n'));
    expect(r.rows[1]!.hz).toBeCloseTo(90, 9);
    expect(r.rows[1]!.tf).toBeCloseTo(3.048, 9);
  });
});

describe('felismerés és konvertálás', () => {
  it('a formátumot a tartalomból ismeri fel', () => {
    expect(detectFieldFormat('00NMSDR33 V04-04.02\n02TP')).toBe('sokkia-sdr-n');
    expect(detectFieldFormat('MO,AD0,UN1\nOC,OP1')).toBe('foif-rw5');
    expect(detectFieldFormat('GTS-7\nSTN     1,1.5')).toBe('topcon');
    expect(detectFieldFormat('2=A\n3=1.5\n5=1\n7=10')).toBe('geodimeter-uds');
  });

  it('a beolvasott nyers mérés a hálózatkiegyenlítésbe konvertálható', () => {
    const r = parseFieldData(['STN     1001,1.550', 'SS      1003,1.300', 'SD      123.4530,90.0000,50.000'].join('\n'), 'topcon');
    const net = parseGmj(toNetworkGmj(r.rows).text);
    expect(net.stations[0]!.id).toBe('1001');
    const o = net.stations[0]!.observations[0]!;
    expect(o.target).toBe('1003');
    expect(o.distance).toBeCloseTo(50, 4);
  });

  it('a még nem támogatott GeoProfi MJK mintaállományt kér', () => {
    expect(() => parseFieldData('x', 'geoprofi-mjk')).toThrow(/mintaállományt/);
  });
});
