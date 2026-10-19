import { CalcError } from './errors';
import { compareIds, fix } from './format';
import { splitFields } from './parser';
import type { Row, Section } from './types';

/**
 * Az Adatcsere/AKG jegyzőkönyv készítése munkalap magja (súgó 75. o.).
 *
 * A 61/2009. (V. 14.) FVM rendelet által előírt mérési és számítási jegyzőkönyv az
 * Agrár-Környezetgazdálkodási támogatáshoz. A webes változat a súgóban leírt kézi (koordináta-jegyzék)
 * adatforrást dolgozza fel:
 *   – koordináta-állomány: `PSZ, Y, X` sorok;
 *   – AMS leíró állomány: parcellánként a sarokpontok száma, `#` … `;;` között.
 * A GIS adatforrások (MIF, TAB, SHP, DXF, …) és a SHP/PDF kimenet nem része a webes változatnak.
 */

export interface AkgPoint {
  id: string;
  y: number;
  x: number;
}

/** A koordináta-állomány beolvasása (`PSZ, Y, X`). */
export function parseAkgCoordinates(text: string): AkgPoint[] {
  const out: AkgPoint[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (t === '' || t === ';;' || /^[#*]/.test(t) || /^(k|p)_/i.test(t)) return;
    const no = i + 1;
    const f = splitFields(t);
    const id = f[0];
    if (!id) return;
    const y = Number(f[1]);
    const x = Number(f[2]);
    if (!Number.isFinite(y) || !Number.isFinite(x)) {
      throw new CalcError(`${no}. sor (${id}): érvénytelen Y vagy X koordináta.`);
    }
    if (seen.has(id)) throw new CalcError(`${no}. sor: a(z) ${id} pontszám többször szerepel.`);
    seen.add(id);
    out.push({ id, y, x });
  });
  if (out.length === 0) throw new CalcError('A koordináta-állomány nem tartalmaz pontot.');
  return out;
}

/** Az AMS leíró állomány értelmezése: `#` … `;;` közötti pontszámok egy parcella. */
export function parseAms(text: string): string[][] {
  const parcels: string[][] = [];
  let current: string[] | null = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (t === '') return;
    if (t === '#') {
      if (current) throw new CalcError(`${i + 1}. sor: a parcella (;;) lezárása hiányzik.`);
      current = [];
      return;
    }
    if (t === ';;') {
      if (!current) throw new CalcError(`${i + 1}. sor: (;;) parcella kezdete (#) nélkül.`);
      if (current.length < 3) throw new CalcError(`${i + 1}. sor: egy parcellához legalább 3 sarokpont kell (${current.length} van).`);
      parcels.push(current);
      current = null;
      return;
    }
    if (!current) throw new CalcError(`${i + 1}. sor: a pontsor parcella (#) kezdete előtt áll.`);
    current.push(t);
  });
  if (current) throw new CalcError('Az utolsó parcella (;;) lezárása hiányzik.');
  if (parcels.length === 0) throw new CalcError('Az AMS állomány nem tartalmaz parcellát.');
  return parcels;
}

export interface AkgParcelData {
  /** 0-tól induló sorszám a fájlban. */
  index: number;
  /** A sarokpontok a leíró sorrendjében. */
  points: AkgPoint[];
  /** Vetületi (síkbeli) terület [m²]. */
  area: number;
  /** Kerület [m]. */
  perimeter: number;
  /** A sarokpontok súlypontja. */
  centroid: { y: number; x: number };
}

/** A parcellák geometriai adatai (terület, kerület, súlypont). */
export function buildParcels(points: AkgPoint[], parcels: string[][]): { parcels: AkgParcelData[]; issues: string[] } {
  const byId = new Map(points.map((p) => [p.id, p] as const));
  const issues: string[] = [];
  const out: AkgParcelData[] = [];
  parcels.forEach((ids, index) => {
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      issues.push(`${index + 1}. parcella: ${missing.length} sarokpont nem szerepel a koordináta-állományban (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', …' : ''}).`);
    }
    const pts = ids.map((id) => byId.get(id)).filter((p): p is AkgPoint => p !== undefined);
    if (pts.length < 3) {
      issues.push(`${index + 1}. parcella: kevés (${pts.length}) ismert sarokpont, a geometria nem számítható.`);
      return;
    }
    let twiceArea = 0;
    let perimeter = 0;
    let cy = 0;
    let cx = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      twiceArea += a.y * b.x - b.y * a.x;
      perimeter += Math.hypot(b.y - a.y, b.x - a.x);
      cy += a.y;
      cx += a.x;
    }
    // A koordináták EOV-ban méterben vannak, ezért a síkbeli (shoelace) terület közvetlenül m².
    // A parcella területe mindig pozitív, ezért a körüljárás irányától függetlenül abszolút értéket adunk.
    const area = Math.abs(twiceArea) / 2;
    out.push({
      index,
      points: pts,
      area,
      perimeter,
      centroid: { y: cy / pts.length, x: cx / pts.length },
    });
  });
  return { parcels: out, issues };
}

/* ------------------------------------------------------------------ *
 * A térkép leíró adatai (AKG_*)
 * ------------------------------------------------------------------ */

/** A térkép leíró adatmezői és jelentésük (súgó 75. o.). */
export const AKG_FIELDS: { name: string; description: string }[] = [
  { name: 'AKG_ID', description: 'A parcella sorszáma (a program automatikusan generálja).' },
  { name: 'AKG_BLOKK', description: 'A parcella blokk azonosítója.' },
  { name: 'AKG_REGSZ', description: 'Regisztrációs szám.' },
  { name: 'AKG_FOLDH', description: 'A földhasználó neve.' },
  { name: 'AKG_CELPRG', description: 'A célprogram azonosítója (rendelet szerint); elég üres hellyel beírni, például „a ad 1”.' },
  { name: 'AKG_CELPRGSZOVEG', description: 'A célprogram azonosítójához tartozó szöveg.' },
  { name: 'AKG_JELOLOPONT', description: 'A terepi jelölőpont sorszáma; ha üres, az első pont a jelölőpont.' },
  { name: 'AKG_KIVETT', description: 'Kivett terület esetén annak a parcellának az AKG_ID azonosítója, amelyhez a terület tartozik.' },
];

/**
 * A célprogram azonosítójának kiegészítése (súgó 75. o.): „elég üres hellyel beírni,
 * például [a) ad) 1.] helyett [a ad 1]”. A betűjelek `)`, a számok `.` jelet kapnak.
 */
export function normalizeCelprg(text: string): string {
  const tokens = text.trim().split(/[\s,;]+/).filter((t) => t !== '');
  if (tokens.length === 0) return '';
  return tokens
    .map((t) => (/^\d+$/.test(t) ? `${t}.` : /^[a-záéíóöőúüű]+$/i.test(t) ? `${t})` : t))
    .join(' ');
}

export interface AkgRecord {
  akgId: string;
  block: string;
  regsz: string;
  foldh: string;
  celprg: string;
  celprgSzoveg: string;
  jeloloPont: string;
  kivett: string;
}

export const EMPTY_RECORD: AkgRecord = {
  akgId: '1',
  block: '',
  regsz: '',
  foldh: '',
  celprg: '',
  celprgSzoveg: '',
  jeloloPont: '',
  kivett: '',
};

/** A közös adatok (a felmérés azonosításához, súgó 75. o.). */
export interface AkgCommon {
  merteVegzo: string;
  meresIdeje: string;
  muszer: string;
  telepules: string;
}

export const EMPTY_COMMON: AkgCommon = { merteVegzo: '', meresIdeje: '', muszer: '', telepules: '' };

/** A generált állományok neve (súgó 75. o.): AKG_REGSZ_AKG_BLOKK_AKG_ID.kiterjesztés. */
export function akgFileName(r: AkgRecord, kind: 'pdf' | 'shp' | 'shp-pont'): string {
  const esc = (s: string) => (s.trim() === '' ? 'X' : s.trim().replace(/[^0-9A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű_-]+/g, '_'));
  const base = `AKG_${esc(r.regsz)}_${esc(r.block)}_${esc(r.akgId)}`;
  if (kind === 'pdf') return `${base}.pdf`;
  if (kind === 'shp') return `${base}.shp`;
  return `${base}_P.shp`;
}

/** A jegyzőkönyv szakaszai a beolvasott parcellákból. */
export function akgSections(
  parcels: AkgParcelData[],
  records: AkgRecord[],
  common: AkgCommon,
): Section[] {
  const sections: Section[] = [];
  sections.push({
    kind: 'akg-common',
    title: 'Közös adatok',
    columns: ['Jellemző', 'Érték'],
    rows: [
      { cells: ['Mérést végző', common.merteVegzo], role: 'base' },
      { cells: ['Mérés ideje', common.meresIdeje], role: 'base' },
      { cells: ['Mérőműszer azonosítója', common.muszer], role: 'base' },
      { cells: ['Település', common.telepules], role: 'base' },
      { cells: ['Parcellák száma', String(parcels.length)], role: 'base' },
      { cells: ['Beolvasott pontok száma', String(new Set(parcels.flatMap((p) => p.points.map((q) => q.id))).size)], role: 'base' },
    ],
  });

  sections.push({
    kind: 'akg-parcels',
    title: 'Parcellák',
    columns: ['AKG_ID', 'AKG_BLOKK', 'AKG_REGSZ', 'Sarokpontok', 'Terület [m²]', 'Terület [ha]', 'Kerület [m]', 'AKG_CELPRG'],
    rows: parcels.map<Row>((p) => {
      const r = records[p.index] ?? EMPTY_RECORD;
      return {
        cells: [
          r.akgId,
          r.block,
          r.regsz,
          String(p.points.length),
          fix(p.area, 0),
          fix(p.area / 10000, 4),
          fix(p.perimeter, 2),
          r.celprg,
        ],
        role: 'result',
      };
    }),
    footer: ['A terület a vetületi (síkbeli) koordinátákból számolt terület; a vetületi méretarány hatását nem tartalmazza.'],
  });

  const centrals: Row[] = [];
  parcels.forEach((p) => {
    const r = records[p.index] ?? EMPTY_RECORD;
    p.points.forEach((pt, i) => {
      const isJelolo = r.jeloloPont.trim() === '' ? i === 0 : r.jeloloPont.trim() === pt.id;
      centrals.push({
        cells: [r.akgId, pt.id, fix(pt.y, 3), fix(pt.x, 3), isJelolo ? 'jelölőpont' : ''],
        role: i === 0 ? 'base' : undefined,
      });
    });
  });
  sections.push({
    kind: 'akg-points',
    title: 'A parcellák sarokpontjai',
    columns: ['AKG_ID', 'Pontszám', 'Y', 'X', 'Megjegyzés'],
    rows: centrals,
  });

  const fields: Row[] = AKG_FIELDS.map((f) => {
    const first = parcels[0];
    const r = first ? records[first.index] ?? EMPTY_RECORD : EMPTY_RECORD;
    const value =
      f.name === 'AKG_ID'
        ? r.akgId
        : f.name === 'AKG_BLOKK'
          ? r.block
          : f.name === 'AKG_REGSZ'
            ? r.regsz
            : f.name === 'AKG_FOLDH'
              ? r.foldh
              : f.name === 'AKG_CELPRG'
                ? r.celprg
                : f.name === 'AKG_CELPRGSZOVEG'
                  ? r.celprgSzoveg
                  : f.name === 'AKG_JELOLOPONT'
                    ? r.jeloloPont
                    : r.kivett;
    return { cells: [f.name, value, f.description], role: 'base' as const };
  });
  sections.push({
    kind: 'akg-fields',
    title: 'A térkép leíró adatai (AKG_*) – az első parcella adatlapja',
    columns: ['Mező', 'Érték', 'Jelentés'],
    rows: fields,
    footer: parcels.length > 1 ? ['Több parcella esetén a leíró adatok parcella szerint adhatók meg.'] : undefined,
  });

  const names = parcels.map((p) => records[p.index] ?? EMPTY_RECORD);
  sections.push({
    kind: 'akg-output',
    title: 'A generált állományok (a súgó 75. o. szerinti névadás)',
    columns: ['Állomány', 'Név'],
    rows: names.flatMap<Row>((r, i) => [
      { cells: [`${i + 1}. parcella jegyzőkönyve`, akgFileName(r, 'pdf')], role: 'base' },
      { cells: [`${i + 1}. parcella SHP`, akgFileName(r, 'shp')], role: 'base' },
      { cells: [`${i + 1}. parcella pont-SHP`, akgFileName(r, 'shp-pont')], role: 'base' },
    ]),
    footer: [
      'A webes változat a jegyzőkönyvet és a parcellák adatait szövegesen készíti el; a PDF és a SHP kimenet a valódi programot igényli.',
      'A gc35.ini [AKG] SHPDIR, PDFDIR és RELPATH beállításai a valódi programban adják meg a mentés helyét.',
    ],
  });
  return sections;
}

/** A sarokpontok szöveges listája (a kimenethez). */
export function akgPointList(parcels: AkgParcelData[]): string {
  const lines: string[] = [];
  for (const p of [...parcels].sort((a, b) => a.index - b.index)) {
    lines.push(`# ${p.index + 1}. parcella (${fix(p.area, 0)} m²)`);
    const pts = [...p.points].sort((a, b) => compareIds(a.id, b.id));
    for (const pt of pts) lines.push(`${pt.id} ${fix(pt.y, 3)} ${fix(pt.x, 3)}`);
    lines.push(';;');
  }
  return lines.join('\r\n') + '\r\n';
}
