import { describe, expect, it } from 'vitest';
import { MENUS, SHEETS, TOOLBAR, type MenuItem } from '../src/shell';

const ids = new Set(SHEETS.map((s) => s.id));
const captionOf = (id: string) => SHEETS.find((s) => s.id === id)?.caption ?? id;

describe('a burok regisztere (menüsor, ikonsáv, munkalapok)', () => {
  it('a munkalap-azonosítók egyediek', () => {
    expect(ids.size).toBe(SHEETS.length);
  });

  it('az ikonsáv a valódi program 15 parancsikonját tartalmazza', () => {
    expect(TOOLBAR.filter((t) => t.kind !== 'sep')).toHaveLength(15);
    for (const t of TOOLBAR) if (t.kind === 'sheet') expect(ids.has(t.id)).toBe(true);
  });

  it('az ikonsáv sorrendje a súgó 3. oldala szerinti', () => {
    expect(TOOLBAR.filter((t) => t.kind === 'sheet').map((t) => captionOf(t.id))).toEqual([
      'Mérési adatok és koordináták',
      'Adatrögzítő/Beállítások',
      'Geodéziai számítások/Munkaterület',
      'Geodéziai számítások/Adatleíró',
      'Hálózatkiegyenlítés/Munkaterület',
      'Hálózatkiegyenlítés/Beállítások',
      'Térbeli transzformáció/Transzformációs paraméterek számítása',
      'Térbeli transzformáció/Átszámítás',
      'Adatcsere/Koordináta kezelő',
      'Adatcsere/Koordináta állomány készítése',
      'Adatcsere/AKG jegyzőkönyv készítése',
      'Súgó',
    ]);
  });

  it('a menük minden munkalap-hivatkozása létezik', () => {
    const walk = (items: MenuItem[]): void => {
      for (const i of items) if (i.sheet) expect(ids.has(i.sheet)).toBe(true);
    };
    for (const m of MENUS) walk(m.items);
  });

  it('minden munkalap a valódi 6 modul valamelyikéhez vagy az általános részhez tartozik', () => {
    const groups = ['Adatrögzítő', 'Geodéziai számítások', 'Hálózatkiegyenlítés', 'Térbeli transzformáció', 'Adatcsere', 'Mérési adatok', 'Súgó'];
    for (const s of SHEETS) {
      expect(groups.some((g) => s.caption.startsWith(g))).toBe(true);
    }
  });

  it('minden helyettesítő munkalap megokolja magát (van ismertetése)', () => {
    for (const s of SHEETS) if (!s.win) expect((s.desc ?? '').length).toBeGreaterThan(40);
  });
});
