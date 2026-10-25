import { describe, expect, it } from 'vitest';
import { readStakeoutMes } from '../src/core/stakeout-mes';

/** Kitűzési mérési jegyzőkönyv (.MES): álláspont (A), terv (H), kitűzött (F) és eltérés (J) rekordok. */

const MES = [
  ' PROBA1,87,87,9,10,23,15,40,30,0,0,5,-34,9971,240,128,13,1,1,0,0,',
  'A,1,240000.0000,650000.0000,0.0000,1.5600,3,9,10,23,15,57,27,',
  'K,0,1,0.0035,0.0050,0.1353,9,10,23,15,57,27,',
  'B,10,,240020.0000,650000.0000,0.0000,0,3,9,10,23,15,57,27,',
  'C,10,0,1000000,20.0000,20.0000,0.0000,1.5500,240020.0000,650000.0000,0.0000,0,3,9,10,23,15,57,27,------,',
  'D,1,10,0,1,3,0,0,0,3,9,10,23,15,57,28,',
  'H,101,------,240010.0000,650005.0000,0.0000,0,2,9,10,23,16,9,31,',
  'F,101,1140869,1944932,11.18,11.18,0.0461,1.5500,240009.9970,650005.0040,0.0100,0,2,9,10,23,16,9,31,------,',
  'J,101,0.0030,-0.0040,-0.0100,9,10,23,16,9,32,',
  'H,102,------,240010.0000,650015.0000,0.0000,0,2,9,10,23,16,11,35,',
  'H,103,------,240000.0000,650015.0000,0.0000,0,2,9,10,23,16,11,35,',
  'F,102,1107461,1947607,18.03,18.03,0.0863,1.5500,240010.1000,650015.0000,0.0000,0,2,9,10,23,16,11,35,------,',
  'F,102,1107461,1947607,18.03,18.03,0.0863,1.5500,240010.0100,650015.0000,0.0000,0,2,9,10,23,16,12,35,------,',
  'J,102,-0.0100,0.0000,0.0000,9,10,23,16,12,35,',
].join('\r\n');

describe('kitűzési jegyzőkönyv (.MES)', () => {
  const r = readStakeoutMes(MES);

  it('a munka neve és az álláspont', () => {
    expect(r.job).toBe('PROBA1');
    expect(r.stations).toEqual([{ id: '1', x: 240000, y: 650000, h: 0, ih: 1.56 }]);
  });

  it('a terv (H) és a kitűzött (F) koordináták, X északi és Y keleti sorrendben', () => {
    expect(r.points.map((p) => p.id)).toEqual(['101', '102']);
    const p = r.points[0]!;
    expect(p.design).toMatchObject({ x: 240010, y: 650005 });
    expect(p.staked).toMatchObject({ x: 240009.997, y: 650005.004, h: 0.01 });
    expect([p.dX, p.dY, p.dH]).toEqual([0.003, -0.004, -0.01]);
    expect(p.station).toBe('1');
  });

  it('az ismételt kitűzésből az utolsó számít; a ki nem tűzött pontok külön', () => {
    expect(r.points[1]!.staked.x).toBe(240010.01);
    expect(r.notStaked).toEqual(['103']);
    expect(r.warnings).toEqual([]);
  });

  it('az eltérés-rekord és a koordináták ellentmondását jelzi', () => {
    const bad = readStakeoutMes(MES.replace('J,101,0.0030', 'J,101,0.0530'));
    expect(bad.warnings[0]).toMatch(/101: a jegyzőkönyv eltérése/);
    expect(readStakeoutMes('valami\nmás').warnings[0]).toMatch(/nem kitűzési jegyzőkönyv/);
  });
});
