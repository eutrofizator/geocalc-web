import { sectionsToText } from './format';
import type { Section } from './types';

/**
 * A jegyzőkönyv előlapjának (borítójának) adatai.
 *
 * A valódi GeoCalc 3.5 két helyen tárolja ezeket:
 *  - a projekt `borito.ini` állományában, `[JKV]` szakaszban (ezt a projekt menti/betölti), és
 *  - a `GC35.INI`, `[MKJ]` szakaszában (ez az általános beállítás).
 * A mezőnevek mindkét helyen ugyanazok; a súgó 76–77. o. „Mérési jegyzőkönyv előlapja” panelján adhatók meg.
 */
export interface ReportMeta {
  /** A jegyzőkönyvet készítő neve. */
  keszitette: string;
  /** A munkaterület (munka) neve. */
  munkanev: string;
  /** Megye (a `GC35.INI` `[MKJ]` szakaszában van, a `borito.ini`-ben nem). */
  megye: string;
  /** Település. */
  telepules: string;
  /** Év. */
  ev: string;
  /** Dátum, szabad szöveg (a valódi példában `2025.11.28.`). */
  datum: string;
  /** Vetület neve (pl. `EOV`). */
  vetulet: string;
  /** Magassági rendszer (pl. `Balti`). */
  magassag: string;
  /** Fekvés (pl. `Belterület`, `Külterület`). */
  fekves: string;
  /** Munkaszám, szabad szöveg (pl. `01/2025`). */
  msz: string;
  /** Céglogó data URL-ként. A valódi program BMP/JPG/PNG/WMF fájlt vár az INI `LOGO=` sorában. */
  logo: string;
}

export const DEFAULT_META: ReportMeta = {
  keszitette: '',
  munkanev: '',
  megye: '',
  telepules: '',
  ev: '',
  datum: '',
  vetulet: 'EOV',
  magassag: 'Balti',
  fekves: 'Belterület',
  msz: '',
  logo: '',
};

/** A `borito.ini` `[JKV]` szakaszának mezősorrendje (a valódi fájllal egyezően). */
const COVER_KEYS: (keyof ReportMeta)[] = [
  'keszitette',
  'munkanev',
  'msz',
  'telepules',
  'ev',
  'datum',
  'vetulet',
  'magassag',
  'fekves',
];

/** A `borito.ini` mezőnevei (nagybetűs). */
const KEY_NAME: Partial<Record<keyof ReportMeta, string>> = {
  keszitette: 'KESZITETTE',
  munkanev: 'MUNKANEV',
  msz: 'MSZ',
  telepules: 'TELEPULES',
  ev: 'EV',
  datum: 'DATUM',
  vetulet: 'VETULET',
  magassag: 'MAGASSAG',
  fekves: 'FEKVES',
  megye: 'MEGYE',
  logo: 'LOGO',
};

/** Kulcs (kisbetűs) → mező. A valódi INI-k vegyes írásmódot használnak, ezért mindent kisbetűsítünk. */
const KEY_MAP: Record<string, keyof ReportMeta> = {};
for (const [field, name] of Object.entries(KEY_NAME) as [keyof ReportMeta, string][]) {
  KEY_MAP[name.toLowerCase()] = field;
  KEY_MAP[field] = field;
}

/** A feldolgozott `borito.ini` / `GC35.INI` szakaszok. */
const SECTIONS = new Set(['JKV', 'MKJ', 'BEALLITASOK']);

/**
 * Előlap adatainak beolvasása egyszerű szöveges állományból (`borito.ini` `[JKV]`, illetve `GC35.INI` `[MKJ]`).
 * Az ismeretlen kulcsokat és szakaszokat kihagyja, a hiányzó mezők alapértéken maradnak.
 */
export function parseCover(text: string): ReportMeta {
  const meta: ReportMeta = { ...DEFAULT_META };
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith(';') || line.startsWith('#')) continue;
    const head = line.match(/^\[(.+)\]$/);
    if (head) {
      section = head[1]!.toUpperCase();
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    if (section !== '' && !SECTIONS.has(section)) continue;
    const field = KEY_MAP[line.slice(0, eq).trim().toLowerCase()];
    if (!field) continue;
    // A `[Beallitasok]` LOGO sora `fájlnév,url` alakú lehet; a fájlnév nem data URL, ezért csak a data URL-t vesszük át.
    const value = line.slice(eq + 1).trim();
    if (field === 'logo' && !value.startsWith('data:')) continue;
    meta[field] = value;
  }
  return meta;
}

/** Előlap adatainak kiírása `borito.ini` formátumban. */
export function formatCover(meta: ReportMeta): string {
  const lines = ['[JKV]'];
  for (const field of COVER_KEYS) {
    lines.push(`${KEY_NAME[field]}=${meta[field]}`);
    // A megye a valódi fájlban nem szerepel, de ha megadták, a munkanév után fűzzük be.
    if (field === 'munkanev' && meta.megye !== '') lines.push(`MEGYE=${meta.megye}`);
  }
  return lines.join('\r\n') + '\r\n';
}

/** Az előlapon megjelenő sorok a valódi jegyzőkönyv sorrendje szerint. */
export function coverLines(meta: ReportMeta): string[] {
  const lines: string[] = [];
  if (meta.keszitette !== '') lines.push(`Készítette: ${meta.keszitette}`);
  if (meta.datum !== '') lines.push(meta.datum);
  if (meta.telepules !== '') lines.push(meta.telepules);
  if (meta.fekves !== '') lines.push(meta.fekves);
  if (meta.msz !== '') lines.push(`Munkaszám: ${meta.msz}`);
  return lines;
}

/** A „Magyarország, 2024” fejlécsor; a valódi jegyzőkönyv az évet innen veszi. */
export function countryLine(meta: ReportMeta): string {
  return meta.ev !== '' ? `Magyarország, ${meta.ev}` : 'Magyarország';
}

/** A jegyzőkönyvek állandó lábléc-sora. */
export const COVER_FOOTER = ['by_safi01'];

/** A jegyzőkönyv előlapját és a szakaszokat együtt tartalmazó, nyomtatható szöveg. */
export function reportToText(title: string, meta: ReportMeta, sections: Section[], subtitle = ''): string {
  const out: string[] = [countryLine(meta), title];
  if (subtitle !== '') out.push(subtitle);
  out.push('');
  for (const line of coverLines(meta)) out.push(`   ${line}`);
  out.push('');
  for (const line of COVER_FOOTER) out.push(line);
  out.push('', '', '');
  out.push(sectionsToText(sections).trimEnd());
  return out.join('\r\n') + '\r\n';
}
