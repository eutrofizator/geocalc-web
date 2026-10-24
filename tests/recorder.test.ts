import { describe, expect, it } from 'vitest';
import { formatDmsPrecise, formatDmsText, parseDms } from '../src/core/angle';
import { CalcError } from '../src/core/errors';
import {
  DEFAULT_RECORDER_SETTINGS,
  EMPTY_DRAFT,
  RECORDER_TYPES,
  REDUCTION_PROJECTIONS,
  applyProjection,
  averagesFromCoordinates,
  draftToLine,
  draftsToText,
  formatTvetInput,
  formatTvetResult,
  parseRecorderInput,
  parseRecorderRows,
  parseTvet,
  projectionDef,
  reduceAll,
  reduceMeasurement,
  textToDrafts,
  type MeasurementRow,
  type RecorderDraft,
  type RecorderSettings,
} from '../src/core/recorder';

/**
 * Az Adatrögzítő magja (súgó 12–15. és 62–63. o.).
 *
 * A valódi minta: Pelda/Kiegyenlites/minta_felm.eov öt ismert EOV pontja. A súgó 62. oldali
 * mintapéldája szerint az X átlaga 204807 m, az Y átlaga 602147 m, a magasságok átlaga 43 m,
 * és az átlagos magasságot kézzel 110 m-re kell állítani.
 */

const M = (over: Partial<MeasurementRow> = {}): MeasurementRow => ({
  no: 1,
  hz: null,
  zi: null,
  tf: null,
  tv: null,
  dm: null,
  mj: null,
  mm: null,
  code: '',
  ...over,
});

const S = (over: Partial<RecorderSettings> = {}): RecorderSettings => ({ ...DEFAULT_RECORDER_SETTINGS, ...over });

describe('az adatrögzítő típusai és a vetületek (súgó 14–15. o.)', () => {
  it('tíz rögzítőtípus ismert, a GeoCalc-AR az első', () => {
    expect(RECORDER_TYPES).toHaveLength(10);
    expect(RECORDER_TYPES[0]!.id).toBe('geocalc-ar');
    expect(RECORDER_TYPES.map((t) => t.id)).toContain('leica-gsi16');
  });

  it('az EOV állandói a súgó szerintiek (k = 0.99993, R = 6379743.001, X)', () => {
    const eov = projectionDef('EOV');
    expect(eov.k).toBe(0.99993);
    expect(eov.R).toBe(6379743.001);
    expect(eov.axis).toBe('x');
  });

  it('a többi vetület Y tengelyű, R = 6378512.966', () => {
    for (const p of REDUCTION_PROJECTIONS.filter((x) => x.id !== 'EOV')) {
      expect(p.R).toBe(6378512.966);
      expect(p.axis).toBe('y');
    }
  });

  it('a vetület kiválasztása átveszi az állandókat', () => {
    const next = applyProjection({ ...DEFAULT_RECORDER_SETTINGS, k: 1, R: 1, axis: 'y' }, 'EOV');
    expect(next.projection).toBe('EOV');
    expect(next.k).toBe(0.99993);
    expect(next.R).toBe(6379743.001);
    expect(next.axis).toBe('x');
  });
});

describe('a mérési adatok értelmezése (súgó 12. o.)', () => {
  it('a szögeket a GeoCalc FOK.PPMMSS alakjában olvassa', () => {
    const rows = parseRecorderInput('1, 45.1234, 91.2345, 152.376, , , 1.500, 1.520, ko');
    expect(rows).toHaveLength(1);
    const m = rows[0]!;
    expect(m.hz).toBeCloseTo(45.2094444444, 9);
    expect(m.zi).toBeCloseTo(91.3958333333, 9);
    expect(m.tf).toBe(152.376);
    expect(m.tv).toBeNull();
    expect(m.dm).toBeNull();
    expect(m.mj).toBe(1.5);
    expect(m.mm).toBe(1.52);
    expect(m.code).toBe('ko');
  });

  it('a megjegyzéssort kihagyja', () => {
    expect(parseRecorderInput('# sorszám, Hz, Zi, Tf')).toEqual([]);
  });

  it('érvénytelen sorszámra hibát dob', () => {
    expect(() => parseRecorderInput('abc, 1, 2')).toThrow(CalcError);
  });
});

describe('a redukció (súgó 62–63. o.)', () => {
  it('redukció nélkül a magassági szögből számolt vízszintes távolság marad', () => {
    const r = reduceMeasurement(M({ zi: 90, tf: 100 }), S({ reduction: 'none' }));
    expect(r.tv).toBeCloseTo(100, 9);
    expect(r.dm).toBeCloseTo(0, 9);
  });

  it('mért vízszintes távolságot használ, ha nincs magassági szög', () => {
    const r = reduceMeasurement(M({ tv: 88.902 }), S({ reduction: 'none' }));
    expect(r.tv).toBeCloseTo(88.902, 9);
  });

  it('a vetületi redukció az EOV X átlagával és a súgó állandóival számol (kezdőérték X = 200 000)', () => {
    const s = S({ reduction: 'projection', projection: 'EOV', avgY: 602147.734, avgX: 204807.646, avgM: 110, k: 0.99993, R: 6379743.001, axis: 'x', ref: 200000, heightReduction: true });
    const r = reduceMeasurement(M({ zi: 90, tf: 100 }), s);
    // Tv = 100 · (1 − 110/R) · 0.99993 · (1 + 4807.646²/(2R²)) – a vetületi távolság kisebb a vízszintesnél.
    expect(r.tv).toBeCloseTo(99.99128, 4);
    expect(r.tv!).toBeLessThan(100);
    expect(r.notes.join(' ')).toContain('magassági redukció');
    expect(r.notes.join(' ')).toContain('vetületi redukció');
  });

  it('a valódi GeoCalc 3.5 vetületi távolságait adja (Tv → Tvet, EOV, M = 43, X = 204807)', () => {
    const s = S({ reduction: 'projection', projection: 'EOV', avgY: 602147, avgX: 204807, avgM: 43 });
    // A GeoCalc 3.5 „Mérési adatok - koordináták” táblájának Tv és Tvet oszlopa (4 tizedesre kerekítve).
    for (const [tv, tvet] of [
      [1605.323, 1605.2003],
      [1570.84, 1570.7199],
      [1498.574, 1498.4594],
      [1570.356, 1570.2359],
    ] as const) {
      expect(Math.abs(reduceMeasurement(M({ tv }), s).tv! - tvet)).toBeLessThan(0.00006);
    }
  });

  it('a 0.0000 magassági szög hiányzó adat (a GeoCalc így írja a nem mért zenitszöget)', () => {
    const r = reduceMeasurement(M({ zi: 0, tv: 100, tf: null }), S({ reduction: 'none' }));
    expect(r.tv).toBe(100);
    expect(r.dm).toBeNull();
  });

  it('magassági redukció nélkül csak a vetületi méretarány érvényesül', () => {
    const s = S({ reduction: 'projection', avgM: 110, avgX: 204807.646, heightReduction: false });
    const r = reduceMeasurement(M({ zi: 90, tf: 100 }), s);
    // Tv = 100 · 0.99993 · (1 + 4807.646²/(2R²))
    expect(r.tv).toBeCloseTo(99.99303, 4);
    expect(r.notes.join(' ')).not.toContain('magassági redukció');
  });

  it('a külső program eredménye felülírja a számítást', () => {
    const r = reduceMeasurement(M({ zi: 91, tf: 100, external: { tv: 12.345, dm: -0.5 } }), S({ reduction: 'external' }));
    expect(r.tv).toBe(12.345);
    expect(r.dm).toBe(-0.5);
    expect(r.notes.join(' ')).toContain('TVET.TXT');
  });

  it('a magasságkülönbség a ferde távolságból és a magasságokból adódik', () => {
    const r = reduceMeasurement(M({ zi: 90, tf: 100, mj: 1.5, mm: 1.52 }), S({ reduction: 'none' }));
    expect(r.dm).toBeCloseTo(0.02, 9);
  });

  it('hiányzó magassági szög és távolság esetén nincs eredmény', () => {
    const r = reduceMeasurement(M({ hz: 45 }), S());
    expect(r.tv).toBeNull();
    expect(r.dm).toBeNull();
  });
});

describe('a jegyzőkönyv szakaszai', () => {
  const s = S({ reduction: 'projection', projection: 'EOV', avgY: 602147.734, avgX: 204807.646, avgM: 110 });
  const rows = parseRecorderInput(['1, 45.1234, 91.2345, 152.376, , , 1.500, 1.520, ko', '2, 130.4517, 90.5000, 205.114, , , 1.500, 1.520, torony'].join('\r\n'));
  const report = reduceAll(rows, s);

  it('két szakasz: a beállítások és a mérések', () => {
    expect(report.sections.map((x) => x.kind)).toEqual(['rec-settings', 'rec-measurements']);
    expect(report.rows).toHaveLength(2);
  });

  it('a beállítások között szerepel a vetület és az átlagok', () => {
    const cells = report.sections[0]!.rows.map((r) => r.cells.join(' | ')).join('\n');
    expect(cells).toContain('EOV');
    expect(cells).toContain('602147.734');
    expect(cells).toContain('204807.646');
    expect(cells).toContain('110.000');
    expect(cells).toContain('X (kezdőérték 200000.000 m)');
  });

  it('minden sor kap redukált távolságot', () => {
    expect(report.rows.every((r) => r.tv !== null)).toBe(true);
    expect(report.sections[1]!.rows).toHaveLength(2);
  });

  it('a redukció képlete és a GeoCalc-egyezés szerepel a láblécben', () => {
    expect(report.sections[0]!.footer!.join(' ')).toContain('Tv = Tf · sin(Zi)');
    expect(report.sections[0]!.footer!.join(' ')).toContain('X − 200 000 m');
    expect(report.sections[0]!.footer!.join(' ')).toContain('GeoCalc 3.5 kimenetével egyezik');
  });
});

describe('az átlagok a valódi minta_felm.eov állományból (súgó 62. o.)', () => {
  const text = [
    '52           601817.36  205231.27    0.00  torony',
    '54           602375.50  204974.33  108.17  csap',
    '521          602064.51  204732.01    0.00  torony',
    '525          602373.04  204608.63    0.00  torony',
    '526          602108.26  204491.99  111.02  ko',
  ].join('\r\n');

  it('Y = 602147.734, X = 204807.646, M = 43.838 m', () => {
    const a = averagesFromCoordinates(text);
    expect(a.count).toBe(5);
    expect(a.y).toBeCloseTo(602147.734, 3);
    expect(a.x).toBeCloseTo(204807.646, 3);
    expect(a.m).toBeCloseTo(43.838, 3);
  });

  it('üres állományra hibát dob', () => {
    expect(() => averagesFromCoordinates('')).toThrow(CalcError);
  });
});

describe('a TVET.TXT adatcsere (súgó 14. o.)', () => {
  it('a bemenet sorszám, magassági szög, ferde távolság', () => {
    expect(formatTvetInput([{ no: 1, zi: 91.3958333333, tf: 152.376, tv: null, dm: null }])).toBe('1, 91.39583, 152.376\r\n');
  });

  it('az eredmény sorszám, vetületi távolság, magasságkülönbség', () => {
    expect(formatTvetResult([{ no: 1, zi: null, tf: null, tv: 100.0428, dm: 0 }])).toBe('1, 100.043, 0.000\r\n');
  });

  it('a bemenetet visszaolvassa', () => {
    const rows = parseTvet('1, 91.39583, 152.376');
    expect(rows[0]!.no).toBe(1);
    expect(rows[0]!.zi).toBeCloseTo(91.39583, 5);
    expect(rows[0]!.tf).toBeCloseTo(152.376, 3);
  });

  it('az eredményt visszaolvassa (üres szög és ferde távolság)', () => {
    const rows = parseTvet('1, , , 100.5, -0.2');
    expect(rows[0]!.zi).toBeNull();
    expect(rows[0]!.tf).toBeNull();
    expect(rows[0]!.tv).toBe(100.5);
    expect(rows[0]!.dm).toBe(-0.2);
  });

  it('érvénytelen sorszámra hibát dob', () => {
    expect(() => parseTvet('x, 1, 2')).toThrow(CalcError);
  });
});

/* ------------------------------------------------------------------ *
 * A felületi mérési táblázat (kézi bevitel)
 * ------------------------------------------------------------------ */

const D = (over: Partial<RecorderDraft> = {}): RecorderDraft => ({ ...EMPTY_DRAFT, ...over });

describe('a szög emberi (fok-perc-másodperc) alakja', () => {
  it('a FOK.PPMMSS értéket kiírja fok-perc-másodpercre', () => {
    expect(formatDmsText(parseDms('91.2345'))).toBe('91°23′45″');
    expect(formatDmsText(parseDms('130.4517'))).toBe('130°45′17″');
    expect(formatDmsText(parseDms('0.0000'))).toBe('0°00′00″');
    expect(formatDmsText(parseDms('5.0102'))).toBe('5°01′02″');
  });

  it('a teljes kört 0 fokként írja (360° → 0°)', () => {
    expect(formatDmsText(360)).toBe('0°00′00″');
  });

  it('a kért tizedesjegyre kerekít, és a túlcsordulást átviszi', () => {
    expect(formatDmsText(parseDms('45.123456'), 2)).toBe('45°12′34.56″');
    // 59.999″ → 60.00″ → 1′ (a másodperc helye 0-ra vált)
    expect(formatDmsText(10.0166663889, 2)).toBe('10°01′00.00″');
  });

  it('a pontos FOK.PPMMSS alak (adatcseréhez) oda-vissza olvasható', () => {
    for (const t of ['45.1234', '91.2345', '275.0900', '130.4517', '0.0000', '104.5900', '45.123456']) {
      const v = parseDms(t);
      expect(parseDms(formatDmsPrecise(v))).toBeCloseTo(v, 10);
    }
    expect(formatDmsPrecise(parseDms('91.2345'))).toBe('91.234500');
    expect(formatDmsPrecise(parseDms('45.1234'))).toBe('45.123400');
  });
});

describe('a táblázatsor szöveges alakja (kézi bevitel)', () => {
  it('a sor a kilenc mezőt vesszővel írja ki', () => {
    expect(draftToLine(D({ no: '7', hz: '45.1234', zi: '91.2345', tf: '152.376', mj: '1.5', mm: '1.52', code: 'ko' }))).toBe(
      '7, 45.1234, 91.2345, 152.376, , , 1.5, 1.52, ko',
    );
  });

  it('az üres sorszám a sorrend szerinti számot kapja', () => {
    const text = draftsToText([D({ hz: '10.0000' }), D({ hz: '20.0000' })]);
    expect(text).toBe('1, 10.0000, , , , , , , \r\n2, 20.0000, , , , , , , ');
  });

  it('a teljesen üres sort kihagyja', () => {
    expect(draftsToText([D({ no: '1', tf: '10' }), D(), D({ no: '3', tf: '20' })])).toBe('1, , , 10, , , , , \r\n3, , , 20, , , , , ');
  });

  it('a szöveget sorokra bontja, a megjegyzéssort kihagyja', () => {
    const drafts = textToDrafts('# fejléc\r\n1, 45.1234, 91.2345, 152.376, , , 1.500, 1.520, ko\r\n');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual(D({ no: '1', hz: '45.1234', zi: '91.2345', tf: '152.376', mj: '1.500', mm: '1.520', code: 'ko' }));
  });

  it('a szöveg és a táblázat oda-vissza megőrzi az adatot', () => {
    const text = '1, 45.1234, 91.2345, 152.376, , , 1.500, 1.520, ko\r\n2, 130.4517, 90.5000, 205.114, , , 1.500, 1.520, torony';
    expect(draftsToText(textToDrafts(text))).toBe(text);
    expect(parseRecorderInput(draftsToText(textToDrafts(text)))).toEqual(parseRecorderInput(text));
  });
});

describe('a mérési sorok tűrő értelmezése (a felületi táblázathoz)', () => {
  it('a hibás mezőt üresen hagyja, a hibát pedig jelzi', () => {
    const { rows, issues } = parseRecorderRows('1, 45.1234, 9x.2345, 152.376, , , 1.500, 1.520, ko');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hz).toBeCloseTo(45.2094444444, 9);
    expect(rows[0]!.zi).toBeNull();
    expect(rows[0]!.tf).toBe(152.376);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.line).toBe(1);
    expect(issues[0]!.message).toContain('érvénytelen magassági szög');
  });

  it('a hibás sor miatt a többi sor feldolgozható marad', () => {
    const { rows, issues } = parseRecorderRows(['abc, 1, 2', '2, 10.0000, 90.0000, 100.000'].join('\r\n'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.no).toBe(2);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('érvénytelen sorszám');
  });

  it('a hibajegyzék sorszáma a megadott sortól indul', () => {
    const { issues } = parseRecorderRows('1, , 91.0000, 100.000', 5);
    expect(issues).toHaveLength(0);
    const bad = parseRecorderRows('1, , 91.0000, x', 5);
    expect(bad.issues[0]!.message).toBe('5. sor: érvénytelen ferde távolság: „x”.');
  });

  it('a szigorú értelmezés az első hibánál dob', () => {
    expect(() => parseRecorderInput('1, 45.1234, 9x.2345, 152.376')).toThrow(CalcError);
  });
});

describe('a kézzel felvett sor a jegyzőkönyvben', () => {
  const s = S({ reduction: 'none' });
  const rows = parseRecorderInput('1, 45.1234, 91.2345, 152.376, , , 1.500, 1.520, ko');
  const report = reduceAll(rows, s);

  it('a szögek a beírt FOK.PPMMSS alakban jelennek meg', () => {
    const cells = report.sections[1]!.rows[0]!.cells;
    expect(cells[1]).toBe('45.1234');
    expect(cells[2]).toBe('91.2345');
    expect(cells[3]).toBe('152.376');
  });

  it('a számolt Tv és dM a Tf és a szögek után áll', () => {
    const cells = report.sections[1]!.rows[0]!.cells;
    const zi = parseDms('91.2345');
    expect(cells[4]).toBe((152.376 * Math.sin(zi * (Math.PI / 180))).toFixed(3));
    expect(cells[5]).toBe((152.376 * Math.cos(zi * (Math.PI / 180)) + 1.52 - 1.5).toFixed(3));
  });

  it('a lábléc megnevezi a formátumot és a számolt oszlopokat', () => {
    expect(report.sections[1]!.footer!.join(' ')).toContain('FOK.PPMMSS');
    expect(report.sections[1]!.footer!.join(' ')).toContain('számolt');
  });
});
