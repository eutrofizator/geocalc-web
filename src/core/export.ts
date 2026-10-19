import { compareIds, fix } from './format';
import type { Point } from './types';

function sorted(points: Point[]): Point[] {
  return [...points].sort((a, b) => compareIds(a.id, b.id));
}

const n3 = (n: number) => fix(n, 3);

/**
 * A kimenet jelleg-mezője. A régi program a kód nélküli pontot belül 0-ként tárolja,
 * de a .PYX/.PYX2 kimenetben üres jelleg-mezőt ad hozzá (ek.PYX2: `..., 0.000, , 1`),
 * míg a riport „Kód” oszlopában megjelenik a 0. A valódi kód (pl. `ko`) természetesen kikerül.
 */
function jelleg(p: Point): string {
  return p.code && p.code !== '0' ? p.code : '';
}

/**
 * .PYX: a régi program fix szélességű, balra igazított koordinátalistája (a `U>` direktíva).
 * A jelleg (kód) előtti rész pontosan 48 karakter: pontszám, Y (12), X (15), M + 1 szóköz.
 * A pontszám mezője ebből adódik (20 mínusz a magasság hossza), így a sorok egyformán záródnak.
 *
 * Valódi GeoCalc-kimenetek, amikhez igazodik:
 *   Pelda/Szamitasok/ek.PYX  -> `1              3817.292    7339.727       0.000 ` (48)
 *   Névtelen.PYX             -> `1            590543.330  209686.710     273.090 ko` (50)
 */
export function toPyx(points: Point[]): string {
  return (
    sorted(points)
      .map((p) => {
        const m = `${n3(p.m ?? 0)} `;
        const id = p.id.padEnd(Math.max(1, 48 - 12 - 15 - m.length));
        return `${id}${n3(p.y).padEnd(12)}${n3(p.x).padEnd(15)}${m}${jelleg(p)}`;
      })
      .join('\r\n') + '\r\n'
  );
}

/**
 * .PYX2: vesszővel tagolt lista (a `K>` direktíva kimenete);
 * a jelleg a pont kódja, az utolsó oszlop 1, ha a pont a futás során számított.
 *   Pelda/Szamitasok/ek.PYX2 -> `1, 3817.292, 7339.727, 0.000, , 1`
 *   Névtelen.PYX2            -> `1, 590543.330, 209686.710, 273.090, ko, 0`
 */
export function toPyx2(points: Point[], computedIds: Set<string>): string {
  return (
    sorted(points)
      .map((p) => `${p.id}, ${n3(p.y)}, ${n3(p.x)}, ${n3(p.m ?? 0)}, ${jelleg(p)}, ${computedIds.has(p.id) ? 1 : 0}`)
      .join('\r\n') + '\r\n'
  );
}

/* ------------------------------------------------------------------ *
 * GSI-16 (Leica / Wild / GeoMAX)
 * ------------------------------------------------------------------ */

/**
 * Egy GSI-16 „szó” 16 karakterből áll:
 *   1–2. jegy: szókód (11 = pontszám, 81 = Y, 82 = X, 83 = M)
 *   3–6. jegy: kiegészítő adat (a koordinátáknál `..10`: az érték mm-ben, 3 tizedes)
 *   7.        : előjel
 *   8–16.     : 9 jegyű érték
 */
function gsiWord(code: string, info: string, value: number, decimals = 3): string {
  const digits = String(Math.round(Math.abs(value) * 10 ** decimals)).padStart(9, '0').slice(-9);
  return `${code}${info}${value < 0 ? '-' : '+'}${digits}`;
}

/** A pontszám GSI-szava: számnál `11`, betűs azonosítónál `13` (a Leica GSI így különbözteti meg). */
function gsiPoint(p: Point): string {
  if (/^\d+$/.test(p.id)) return `110001+${p.id.padStart(9, '0').slice(-9)}`;
  return `130000+${p.id.padEnd(9, ' ').slice(0, 9)}`;
}

/**
 * GSI-16 szöveg. A Wild-változat minden rekordot `*` rekordjelzővel kezd (a Wild/Leica GSI-ben ez a
 * szokás); a Leica és a GeoMAX GSI-16 ugyanezt a szóelrendezést használja jelző nélkül.
 * A magasság hiányában a 83-as szó elmarad.
 */
export function toGsi16(points: Point[], star = false): string {
  return (
    sorted(points)
      .map((p) => {
        const words = [gsiPoint(p), gsiWord('81', '..10', p.y), gsiWord('82', '..10', p.x)];
        if (p.m !== null) words.push(gsiWord('83', '..10', p.m));
        return (star ? '*' : '') + words.join(' ');
      })
      .join('\r\n') + '\r\n'
  );
}

/** Geodimeter koordináta-lista: `pontszám,Y,X,M` (vesszővel tagolt, 3 tizedes). */
export function toGeodimeter(points: Point[]): string {
  return sorted(points).map((p) => `${p.id},${n3(p.y)},${n3(p.x)},${n3(p.m ?? 0)}`).join('\r\n') + '\r\n';
}

/**
 * AutoCAD DXF (R12, AC1009). A súgó szerint (72. o.) „csak pontszám, Y, X és M adatokat fog tárolni”:
 * ezért minden pont egy POINT entitás (X = Y keleti, Y = X északi, Z = M), fölötte egy TEXT a pontszámmal.
 */
export function toDxf(points: Point[]): string {
  const out: (string | number)[] = [];
  const pair = (code: number, value: string | number) => {
    out.push(code, value);
  };
  pair(0, 'SECTION');
  pair(2, 'HEADER');
  pair(9, '$ACADVER');
  pair(1, 'AC1009');
  pair(9, '$INSUNITS');
  pair(70, 6);
  pair(0, 'ENDSEC');
  pair(0, 'SECTION');
  pair(2, 'TABLES');
  pair(0, 'TABLE');
  pair(2, 'LAYER');
  pair(70, 1);
  pair(0, 'LAYER');
  pair(2, 'PONTOK');
  pair(70, 0);
  pair(62, 7);
  pair(6, 'CONTINUOUS');
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');
  pair(0, 'SECTION');
  pair(2, 'ENTITIES');
  for (const p of sorted(points)) {
    const m = n3(p.m ?? 0);
    pair(0, 'POINT');
    pair(8, 'PONTOK');
    pair(10, n3(p.y));
    pair(20, n3(p.x));
    pair(30, m);
    pair(0, 'TEXT');
    pair(8, 'PONTOK');
    pair(10, n3(p.y));
    pair(20, n3(p.x));
    pair(30, m);
    pair(40, '1.0');
    pair(7, 'STANDARD');
    pair(1, p.id);
  }
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ *
 * A kimeneti direktívák nyilvántartása (súgó 23. o.)
 * ------------------------------------------------------------------ */

export interface ExportFormat {
  /** A direktíva (a `>` jellel együtt). */
  code: string;
  /** Rövid magyar név. */
  label: string;
  /** Alapértelmezett kiterjesztés (a program a megadott nevet használja; csak az A> kényszeríti a .dxf-et). */
  ext: string;
  /** A bájtos elrendezés követi-e a valódi programot (a súgóval igazolható), vagy csak a nyilvános műszerformátumot. */
  verified: boolean;
  /** Leírás és forrás (a felületen és a dokumentációban is megjelenik). */
  note: string;
  write(points: Point[], computedIds: Set<string>): string;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    code: 'K>',
    label: 'Vesszővel tagolt (GeoCalc DB)',
    ext: '.pyx',
    verified: true,
    note: 'Vesszővel elválasztott koordináták (a GeoCalc adatbázis-formátuma); az utolsó oszlop 1, ha a pont számított.',
    write: (p, c) => toPyx2(p, c),
  },
  {
    code: 'U>',
    label: 'Üres hellyel tagolt (fix szélességű)',
    ext: '.pyx',
    verified: true,
    note: 'A .PYX fix szélességű, balra igazított koordinátalistája.',
    write: (p) => toPyx(p),
  },
  {
    code: 'W>',
    label: 'Wild (GSI-16)',
    ext: '.pyx',
    verified: false,
    note: 'Wild GSI-16; minden rekord „*” rekordjelzővel. A bájtos elrendezést a súgó nem közli – a nyilvános GSI-16 szabvány szerint.',
    write: (p) => toGsi16(p, true),
  },
  {
    code: 'G>',
    label: 'Geodimeter',
    ext: '.pyx',
    verified: false,
    note: 'Geodimeter koordináta-lista: pontszám,Y,X,M. A bájtos elrendezést a súgó nem közli.',
    write: (p) => toGeodimeter(p),
  },
  {
    code: 'A>',
    label: 'AutoCAD DXF',
    ext: '.dxf',
    verified: true,
    note: 'AutoCAD R12 DXF: pontszám, Y, X és M (a súgó 72. o.). A kiterjesztés mindig .dxf.',
    write: (p) => toDxf(p),
  },
  {
    code: 'L>',
    label: 'Leica GSI-16',
    ext: '.pyx',
    verified: false,
    note: 'Leica GSI-16 (16 karakteres szavak: 11/81/82/83 kód). A bájtos elrendezést a súgó nem közli – a nyilvános GSI-16 szabvány szerint.',
    write: (p) => toGsi16(p, false),
  },
  {
    code: 'M>',
    label: 'GeoMAX GSI-16',
    ext: '.pyx',
    verified: false,
    note: 'GeoMAX GSI-16 – a GeoMAX műszerek a Leica GSI-16 szóelrendezését használják.',
    write: (p) => toGsi16(p, false),
  },
];

/** A kimeneti direktíva kódjai (a `run` ezeket választja le a számítási kódoktól). */
export const EXPORT_CODES = EXPORT_FORMATS.map((f) => f.code);

const FORMAT_BY_CODE = new Map(EXPORT_FORMATS.map((f) => [f.code, f]));

export function formatFor(code: string): ExportFormat | undefined {
  return FORMAT_BY_CODE.get(code);
}

/**
 * A kimeneti állománynév kiterjesztése. Az `A>` mindig `.dxf` (a súgó: „Nem kell kiterjesztést adni,
 * mivel automatikusan DXF lesz a kiterjesztés”); a többinél csak akkor egészítjük ki, ha nincs.
 */
export function withExtension(name: string, ext: string, force = false): string {
  if (name === '') return name;
  const dot = name.lastIndexOf('.');
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  const hasExt = dot > slash;
  if (force) return hasExt ? name.slice(0, dot) + ext : name + ext;
  return hasExt ? name : name + ext;
}
