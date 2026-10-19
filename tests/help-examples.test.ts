import { describe, expect, it } from 'vitest';
import { run, type RunResult } from '../src/core/engine';
import { EXAMPLES } from '../src/examples';

const example = (id: string) => EXAMPLES.find((e) => e.id === id)!.source;
const rows = (r: RunResult, kind: string) => r.sections.find((s) => s.kind === kind)!.rows.map((x) => x.cells);
const errors = (r: RunResult) => r.issues.filter((i) => i.level === 'error');

describe('a súgó mintapéldái ugyanazt adják, mint a GeoCalc 3.5', () => {
  it('IT – irányszög és távolság', () => {
    const r = run(example('it'));
    expect(errors(r)).toEqual([]);
    const t = rows(r, 'it');
    expect(t[1]).toEqual(['8', '5245.840', '6957.410', '104.5900', '1478.859']);
    expect(t[2]).toEqual(['9', '3766.590', '6327.930', '182.5201', '1013.088']);
    expect(t[3]).toEqual(['5', '2852.340', '6562.880', '231.0943', '1238.789']);
    expect(t[4]).toEqual(['6', '3092.680', '8273.890', '322.1202', '1182.216']);
  });

  it('PO – polárisan bemért pont a tárolt tájékozási szöggel', () => {
    const r = run(example('po'));
    expect(errors(r)).toEqual([]);
    expect(r.sections.find((s) => s.kind === 'zk')!.title).toBe('Zk[1003] = 63.1315');
    const t = rows(r, 'po');
    expect(t[1]).toEqual(['104', '551705.947', '124008.807', '349.4100', '316.700', '52.5415', '0.620', '264.120']);
    expect(t[2]).toEqual(['105', '551517.445', '123577.349', '101.5100', '248.840', '165.0415', '0.000', '0.000']);
  });

  it('EM – egyenesek metszése', () => {
    const r = run(example('em'));
    expect(errors(r)).toEqual([]);
    expect(rows(r, 'em')[4]).toEqual(['', 'metszes', '645661.808', '200329.938']);
  });

  it('EB – előmetszés belső szögekkel', () => {
    const r = run(example('eb'));
    expect(errors(r)).toEqual([]);
    // A súgó 3817.262 / 7339.754 értéket közöl. Az egész másodpercre kerekített bemeneti szögekből
    // adódó bizonytalanság ~1 km-en kb. 5 mm, ezért a súgó értékétől legfeljebb 4 mm eltérést engedünk.
    const [id, y, x] = rows(r, 'eb')[2]!;
    expect(id).toBe('1');
    expect(Math.abs(Number(y) - 3817.262)).toBeLessThanOrEqual(0.004);
    expect(Math.abs(Number(x) - 7339.754)).toBeLessThanOrEqual(0.004);
  });

  it('ET – előmetszés tájékozott irányokkal', () => {
    const r = run(example('et'));
    expect(errors(r)).toEqual([]);
    expect(rows(r, 'et')[2]).toEqual(['1', '3817.261', '7339.753', '']);
  });

  it('KM – kitűzési méretek', () => {
    const r = run(example('km'));
    expect(errors(r)).toEqual([]);
    const t = rows(r, 'km');
    expect(t[0]![4]).toBe('351.5146');
    expect(t[1]![4]).toBe('241.836');
    expect(t[2]!.slice(3)).toEqual(['-12.079', '2.559']);
    expect(t[3]!.slice(3)).toEqual(['-18.020', '-4.370']);
  });

  it('TE – területszámítás', () => {
    const r = run(example('te'));
    expect(errors(r)).toEqual([]);
    const s = r.sections.find((x) => x.kind === 'te')!;
    expect(s.title).toBe('Területszámítás  5318/4');
    expect(s.footer).toEqual(['Terület = 805.46784 m2']);
  });

  it('TO – terület összesítés, majd az összeadás újrakezdődik', () => {
    const r = run(example('to'));
    expect(errors(r)).toEqual([]);
    const te = r.sections.filter((x) => x.kind === 'te');
    expect(te[0]!.footer).toEqual(['Terület = 128.72191 m2']);
    expect(te[1]!.footer).toEqual(['Terület = 422.14836 m2']);
    expect(r.sections.find((x) => x.kind === 'to')!.footer).toEqual(['Az előző területek összesen: 550.87027']);

    const again = run(`${example('to')}\nto\n`);
    const totals = again.sections.filter((x) => x.kind === 'to').map((x) => x.footer![0]);
    expect(totals).toEqual(['Az előző területek összesen: 550.87027', 'Az előző területek összesen: 0.00000']);
  });

  it('ZK – nullára állított tájékozási szög', () => {
    const r = run(example('zk'));
    expect(errors(r)).toEqual([]);
    const t = rows(r, 'po');
    expect(t[1]).toEqual(['104', '551450.383', '123834.022', '349.4100', '16.500', '349.4100', '0.000', '0.000']);
    expect(t[2]).toEqual(['105', '551477.512', '123812.717', '101.5100', '24.700', '101.5100', '0.000', '0.000']);
  });
});
