import { describe, expect, it } from 'vitest';
import { MENUS, NAV, SHEETS, TOOLBAR, type MenuItem } from '../src/shell';

const ids = new Set(SHEETS.map((s) => s.id));
const navIds = new Set(NAV.flatMap((g) => g.pages.map((p) => p.id)));
const captionOf = (id: string) => SHEETS.find((s) => s.id === id)?.caption ?? id;

describe('a burok regisztere (menüsor, ikonsáv, navigátor, munkalapok)', () => {
  it('a munkalap- és navigátor-azonosítók egyediek', () => {
    expect(ids.size).toBe(SHEETS.length);
    expect(navIds.size).toBe(NAV.flatMap((g) => g.pages).length);
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

  it('a navigátor a valódi program hat modulját adja, a súgó 5–10. oldala szerinti részekkel', () => {
    expect(NAV.map((g) => g.label)).toEqual([
      'Adatrögzítő',
      'Geodéziai számítások',
      'Hálózatkiegyenlítés',
      'Térbeli transzformáció',
      'Adatcsere',
      'Beállítások',
    ]);
    const pages = (label: string) => NAV.find((g) => g.label === label)!.pages.map((p) => p.label);
    expect(pages('Adatrögzítő')).toEqual(['Mérési adatok - koordináták', 'Manuális adatbevitel', 'Beállítások']);
    // A Változási vázrajz a GEOkalkulus saját lapja (8/2018. AM rendelet), a valódi programban nincs.
    expect(pages('Geodéziai számítások')).toEqual(['Munkaterület', 'Adatleíró', 'Változási vázrajz', 'Beállítások']);
    expect(pages('Hálózatkiegyenlítés')).toEqual([
      'Munkaterület',
      'Előzetes számítások',
      'Vízszintes kiegyenlítés',
      'Magassági kiegyenlítés',
      'Részletpontok számítása',
      'Beállítások',
    ]);
    expect(pages('Térbeli transzformáció')).toEqual(['Transzformációs paraméterek', 'Átszámítás', 'Beállítások']);
    expect(pages('Adatcsere')).toEqual([
      'Koordináta kezelő',
      'Földrajzi koordináták konvertálása',
      'Koordináta állomány létrehozása',
      'AKG jegyzőkönyv kezelése',
    ]);
    expect(pages('Beállítások')).toContain('Általános beállítások');
    expect(pages('Beállítások')).toContain('Névjegy');
    // A valódi programban csak a Beállítások csoport fejléce sötét (kiemelt).
    expect(NAV.filter((g) => g.special).map((g) => g.label)).toEqual(['Beállítások']);
  });

  it('minden navigátor-pont létező munkalapra mutat', () => {
    for (const g of NAV) for (const p of g.pages) expect(ids.has(p.sheet)).toBe(true);
  });

  it('a menüsor a hat modul, a menük minden hivatkozása létezik', () => {
    expect(MENUS.map((m) => m.label)).toEqual(NAV.map((g) => g.label));
    const walk = (items: MenuItem[]): void => {
      for (const i of items) {
        if (i.sheet) expect(ids.has(i.sheet)).toBe(true);
        if (i.nav) expect(navIds.has(i.nav)).toBe(true);
      }
    };
    for (const m of MENUS) walk(m.items);
  });

  it('a modulmenük a navigátor pontjait ugyanabban a sorrendben kezdik', () => {
    for (const g of NAV) {
      const menu = MENUS.find((m) => m.label === g.label)!;
      const navItems = menu.items.filter((i) => i.nav).map((i) => i.nav);
      if (g.special) continue;
      expect(navItems).toEqual(g.pages.map((p) => p.id));
    }
  });

  it('minden munkalap a valódi 6 modul valamelyikéhez vagy az általános részhez tartozik', () => {
    const groups = ['Adatrögzítő', 'Geodéziai számítások', 'Hálózatkiegyenlítés', 'Térbeli transzformáció', 'Adatcsere', 'Beállítások', 'Mérési adatok', 'Súgó'];
    for (const s of SHEETS) {
      expect(groups.some((g) => s.caption.startsWith(g))).toBe(true);
    }
  });

  it('minden helyettesítő munkalap megokolja magát (van ismertetése)', () => {
    for (const s of SHEETS) if (!s.win) expect((s.desc ?? '').length).toBeGreaterThan(40);
  });
});
