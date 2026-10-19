import { describe, expect, it } from 'vitest';
import { coordsSection } from '../src/core/format';
import {
  COVER_FOOTER,
  DEFAULT_META,
  countryLine,
  coverLines,
  formatCover,
  parseCover,
  reportToText,
} from '../src/core/report';

/** A valódi projekt `borito.ini` állománya (Iszkahegy gyakorlat). */
const BORITO_INI = `[JKV]
KESZITETTE=Safranyik Sándor
MUNKANEV=Vizszintes halozat
MSZ=01/2025
TELEPULES=Székesfehérvár 
EV=2025
DATUM=2025.11.28.
VETULET=EOV
MAGASSAG=Balti
FEKVES=Belterület
`;

/** A `GC35.INI` `[MKJ]` szakasza (a gyári beállítás). */
const GC35_INI = `[Beallitasok]
logo=logo.png,http:\\\\www.geo.info.hu

[MKJ]
Keszitette=
Munkanev=
Megye=F
Telepules=
Ev=
Datum=
Vetulet=EOV
Magassag=Balti
MagKi=1
XYE=2
ME=2
MSZ=
Fekves=Belterület
`;

describe('a jegyzőkönyv előlapja (borito.ini / GC35.INI)', () => {
  it('a borito.ini [JKV] szakaszát beolvassa', () => {
    const meta = parseCover(BORITO_INI);
    expect(meta.keszitette).toBe('Safranyik Sándor');
    expect(meta.munkanev).toBe('Vizszintes halozat');
    expect(meta.msz).toBe('01/2025');
    expect(meta.telepules).toBe('Székesfehérvár');
    expect(meta.ev).toBe('2025');
    expect(meta.datum).toBe('2025.11.28.');
    expect(meta.vetulet).toBe('EOV');
    expect(meta.magassag).toBe('Balti');
    expect(meta.fekves).toBe('Belterület');
  });

  it('a GC35.INI [MKJ] szakaszát is beolvassa (vegyes írásmód, Megye)', () => {
    const meta = parseCover(GC35_INI);
    expect(meta.megye).toBe('F');
    expect(meta.vetulet).toBe('EOV');
    expect(meta.magassag).toBe('Balti');
    expect(meta.fekves).toBe('Belterület');
    expect(meta.keszitette).toBe('');
  });

  it('a [Beallitasok] LOGO sorát csak data URL-ként veszi át', () => {
    expect(parseCover(GC35_INI).logo).toBe('');
    expect(parseCover('[Beallitasok]\nLOGO=data:image/png;base64,AAAA\n').logo).toBe('data:image/png;base64,AAAA');
  });

  it('az ismeretlen szakaszokat kihagyja', () => {
    expect(parseCover('[Egyeb]\nKESZITETTE=Senki\n').keszitette).toBe('');
  });

  it('a formatCover a valódi [JKV] mezősorrendet adja, és visszaolvasható', () => {
    const meta = { ...DEFAULT_META, keszitette: 'Teszt Elemér', munkanev: 'Minta', msz: '5/2026' };
    const text = formatCover(meta);
    expect(text.startsWith('[JKV]\r\n')).toBe(true);
    const keys = text.split(/\r?\n/).slice(1).filter((l) => l !== '').map((l) => l.split('=')[0]);
    expect(keys).toEqual([
      'KESZITETTE',
      'MUNKANEV',
      'MSZ',
      'TELEPULES',
      'EV',
      'DATUM',
      'VETULET',
      'MAGASSAG',
      'FEKVES',
    ]);
    expect(parseCover(text)).toEqual(meta);
  });

  it('a megadott megyét a munkanév után írja ki', () => {
    const text = formatCover({ ...DEFAULT_META, munkanev: 'M', megye: 'Fejér' });
    expect(text).toContain('MUNKANEV=M\r\nMEGYE=Fejér\r\n');
  });

  it('a coverLines a valódi sorrendben, az üres mezőket kihagyva adja a sorokat', () => {
    const meta = { ...DEFAULT_META, keszitette: 'A B', datum: '2026.01.01.', telepules: 'Pécs', fekves: 'Belterület', msz: '3/2026' };
    expect(coverLines(meta)).toEqual(['Készítette: A B', '2026.01.01.', 'Pécs', 'Belterület', 'Munkaszám: 3/2026']);
    expect(coverLines({ ...DEFAULT_META, fekves: '', vetulet: '', magassag: '' })).toEqual([]);
  });

  it('a countryLine az év megadásától függ', () => {
    expect(countryLine({ ...DEFAULT_META, ev: '2025' })).toBe('Magyarország, 2025');
    expect(countryLine(DEFAULT_META)).toBe('Magyarország');
  });

  it('a reportToText az előlapot és a szakaszokat együtt tartalmazza', () => {
    const meta = { ...DEFAULT_META, keszitette: 'A B', datum: '2026.01.01.', msz: '3/2026', ev: '2026' };
    const text = reportToText('GEODÉZIAI SZÁMÍTÁSOK', meta, [coordsSection([{ id: '1', y: 1, x: 2, m: 0, code: '0' }])]);
    expect(text).toContain('Magyarország, 2026');
    expect(text).toContain('GEODÉZIAI SZÁMÍTÁSOK');
    expect(text).toContain('Készítette: A B');
    expect(text).toContain('Munkaszám: 3/2026');
    for (const line of COVER_FOOTER) expect(text).toContain(line);
    expect(text).toContain('Felhasznált koordináták :');
  });

  it('a „Felhasznált koordináták :” cím a valódi jegyzőkönyv szerinti', () => {
    expect(coordsSection([]).title).toBe('Felhasznált koordináták :');
  });
});
