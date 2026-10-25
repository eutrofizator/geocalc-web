import { CalcError } from './errors';
import { fix } from './format';
import { splitFields } from './parser';
import { formatDms, parseDms } from './angle';
import type { Section, Row } from './types';

/**
 * Az Adatrögzítő/Beállítások munkalap magja (súgó 12–14. o.).
 *
 * A modul a terepi adatrögzítők (Geodimeter, Leica, Sokkia, Topcon, GeoCalc-AR) adatait dolgozza fel,
 * és a mért adatokból a további feldolgozáshoz vízszintes/vetületi távolságokat és magasságkülönbségeket
 * számít. A távolságredukció lehet nincs, külső program vagy vetületi.
 *
 * A vetületi redukció a magassági és a vetületi (skála) redukció a súgóban megadott állandókkal:
 *   Tv = Tf · sin(Zi) · (1 − M/R) · k · (1 + d²/(2R²))
 * ahol M az átlagos magasság, d a redukciós koordináta eltérése a vetület kezdőértékétől, k a
 * vetületi méretarány és R a redukciós sugár. A súgó felsorolása szerint a fenti (EOV) vetületnél
 * k = 0.99993 és R = 6379743.001, a HÉR, HKR, HDR és a sztereografikus vetületnél R = 6378512.966.
 *
 * Az EOV kezdőértéke az X = 200 000 m (a vetület középvonala): a méretarány attól mért távolsággal nő.
 * A képlet a valódi GeoCalc 3.5 kimenetével egyezik (Tv → Tvet, ±0.1 mm a 4 tizedesre kerekítésen belül).
 */

export interface RecorderType {
  id: string;
  label: string;
  note: string;
}

/** A program által ismert adatrögzítő típusok (súgó 15. o.), a súgó sorrendjében. */
export const RECORDER_TYPES: RecorderType[] = [
  { id: 'geocalc-ar', label: 'GeoCalc-AR', note: 'A rendszer saját formátuma: soronként 14, vesszővel elválasztott adat.' },
  { id: 'geodimeter-uds', label: 'Geodimeter UDS', note: 'A Geodimeter UDS szöveges formátuma.' },
  { id: 'geomax', label: 'GeoMAX', note: 'A GeoMAX műszerek a Leica GSI-16 szóelrendezését használják.' },
  { id: 'geoprofi-mjk', label: 'GeoProfi MJK', note: 'A GeoProfi mérési jegyzőkönyve.' },
  { id: 'leica-gsi8', label: 'Leica GSI-8', note: 'Nyolc karakteres GSI-szavak.' },
  { id: 'leica-gsi16', label: 'Leica GSI-16', note: 'Tizenhat karakteres GSI-szavak (11/81/82/83 kód).' },
  { id: 'leica-tc', label: 'Leica TC/TPS sorozat', note: 'A TC 600/1800 sorozat; lásd a súgó 16. o. specialitásait.' },
  { id: 'sokkia-sdr-a', label: 'Sokkia SDR Alfanumerikus', note: 'Sokkia SDR, alfanumerikus pontszámok.' },
  { id: 'sokkia-sdr-n', label: 'Sokkia SDR Numerikus', note: 'Sokkia SDR, numerikus pontszámok.' },
  { id: 'topcon', label: 'Topcon', note: 'A Topcon GTS-7 szöveges kimenete (STN, BS/FS/SS, SD/HD/HV rekordok).' },
  {
    id: 'foif-rw5',
    label: 'FOIF (FieldGenius / SurvCE RW5)',
    note: 'A FOIF műszereken futó FieldGenius és SurvCE nyers állománya (Carlson/TDS RW5); a Carlson/TDS RW5 is.',
  },
  {
    id: 'foif-mes',
    label: 'FOIF (MES nyers mérés)',
    note: 'A FOIF műszer nyers mérési állománya (.MES): álláspont (A) és mérés (F) rekordok, 1/7200 fokos szögek.',
  },
];

export type ReductionMode = 'none' | 'external' | 'projection';

export const REDUCTION_MODES: { id: ReductionMode; label: string; note: string }[] = [
  {
    id: 'none',
    label: 'Nincs',
    note: 'Nincs távolságredukció: a mért vízszintes távolság, vagy a magassági szögből és ferde távolságból számolt vízszintes távolság kerül tovább.',
  },
  { id: 'external', label: 'Külső program', note: 'A redukciót külső program végzi a TVET.TXT állományon keresztül.' },
  { id: 'projection', label: 'Vetületi redukció', note: 'A program végzi a magassági és a vetületi redukciót az átlagos Y, X, M értékekkel.' },
];

export interface ProjectionDef {
  id: string;
  label: string;
  /** A vetületi méretarány (a kezdőértéknél). */
  k: number;
  /** A redukciós sugár [m]. */
  R: number;
  /** A redukciós koordináta: a súgó szerint az EOV-nál X, a többi vetületnél Y. */
  axis: 'x' | 'y';
  /** A vetület kezdőértéke a redukciós koordinátán [m]. */
  ref: number;
}

/** A Magyarországon használt főbb vetületi rendszerek (súgó 14. o.). */
export const REDUCTION_PROJECTIONS: ProjectionDef[] = [
  { id: 'EOV', label: 'EOV', k: 0.99993, R: 6379743.001, axis: 'x', ref: 200000 },
  { id: 'HER', label: 'HÉR', k: 1, R: 6378512.966, axis: 'y', ref: 0 },
  { id: 'HKR', label: 'HKR', k: 1, R: 6378512.966, axis: 'y', ref: 0 },
  { id: 'HDR', label: 'HDR', k: 1, R: 6378512.966, axis: 'y', ref: 0 },
  { id: 'SZTEREO', label: 'Sztereografikus', k: 1, R: 6378512.966, axis: 'y', ref: 0 },
];

export function projectionDef(id: string): ProjectionDef {
  return REDUCTION_PROJECTIONS.find((p) => p.id === id) ?? REDUCTION_PROJECTIONS[0]!;
}

/** A hiányzó távolságok átvételének szabálya (súgó 44. o., Geodéziai számítások/Beállítások). */
export type MissingDistance = 'measured' | 'coordinates';

export const MISSING_DISTANCE_RULES: { id: MissingDistance; label: string }[] = [
  { id: 'measured', label: 'Mérésekből átveszi' },
  { id: 'coordinates', label: 'Koordinátákból számolja' },
];

/** A feldolgozható mérési adatok (súgó 12. o.). */
export const RECORDER_FIELDS: { key: string; label: string; description: string }[] = [
  { key: 'psz', label: 'Psz', description: 'Pontszám (álláspont, iránypont)' },
  { key: 'hz', label: 'Hz', description: 'Vízszintes szög' },
  { key: 'zi', label: 'Zi', description: 'Magassági szög' },
  { key: 'tf', label: 'Tf', description: 'Ferde távolság' },
  { key: 'tv', label: 'Tv', description: 'Vízszintes távolság' },
  { key: 'dm', label: 'dM', description: 'Magasságkülönbség' },
  { key: 'mj', label: 'Mj', description: 'Jelmagasság' },
  { key: 'mm', label: 'Mm', description: 'Műszermagasság' },
  { key: 'pkod', label: 'Pkód', description: 'Pont jellege' },
];

export interface RecorderSettings {
  recorder: string;
  reduction: ReductionMode;
  projection: string;
  /** A külső redukáló program (a Külső program módnál). */
  externalProgram: string;
  /** Átlagos Y, X és M értékek [m] (a vetületi redukcióhoz). */
  avgY: number;
  avgX: number;
  avgM: number;
  /** A magassági redukció (tengerszintre) számítása. */
  heightReduction: boolean;
  /** Vetületi redukció: a kezdőérték felülírása. */
  ref: number;
  /** A vetületi redukcióhoz használt méretarány felülírása. */
  k: number;
  /** A vetületi redukcióhoz használt sugár felülírása [m]. */
  R: number;
  /** A redukciós koordináta (a vetület alapértékét felülírja). */
  axis: 'x' | 'y';
  missingDistance: MissingDistance;
}

export const DEFAULT_RECORDER_SETTINGS: RecorderSettings = {
  recorder: 'geocalc-ar',
  reduction: 'none',
  projection: 'EOV',
  externalProgram: '',
  avgY: 0,
  avgX: 0,
  avgM: 0,
  heightReduction: true,
  ref: 200000,
  k: 0.99993,
  R: 6379743.001,
  axis: 'x',
  missingDistance: 'measured',
};

/** A vetület kiválasztásakor az állandók átvétele (a kezdőérték és a tengely kivételével). */
export function applyProjection(s: RecorderSettings, projectionId: string): RecorderSettings {
  const p = projectionDef(projectionId);
  return { ...s, projection: p.id, k: p.k, R: p.R, axis: p.axis, ref: p.ref };
}

export interface MeasurementRow {
  no: number;
  /** Vízszintes szög (leolvasás) [fok]. */
  hz: number | null;
  /** Magassági szög (zenit) [fok]. */
  zi: number | null;
  /** Ferde távolság [m]. */
  tf: number | null;
  /** Mért vízszintes távolság [m]. */
  tv: number | null;
  /** Magasságkülönbség [m]. */
  dm: number | null;
  /** Jelmagasság és műszermagasság [m]. */
  mj: number | null;
  mm: number | null;
  code: string;
  /** Külső redukáló program eredménye (TVET.TXT); ha meg van adva, a redukciót felülírja. */
  external?: { tv: number | null; dm: number | null } | undefined;
}

export interface ReduceResult {
  /** Vetületi (redukált) távolság [m]. */
  tv: number | null;
  /** Magasságkülönbség [m]. */
  dm: number | null;
  /** A számítás lépései (a jegyzőkönyvhöz). */
  notes: string[];
}

const DEG = Math.PI / 180;

/**
 * A vetületi redukció szorzója: (1 − M/R) · k · (1 + d²/(2R²)), ahol d a redukciós koordináta eltérése
 * a kezdőértéktől (EOV: X − 200 000 m). A magassági tag csak bekapcsolt magassági redukciónál számít.
 */
export function projectionScale(
  s: Pick<RecorderSettings, 'avgY' | 'avgX' | 'avgM' | 'k' | 'R' | 'ref' | 'axis' | 'heightReduction'>,
): { factor: number; heightFactor: number; scaleFactor: number; d: number } {
  const heightFactor = s.heightReduction ? 1 - s.avgM / s.R : 1;
  const d = (s.axis === 'x' ? s.avgX : s.avgY) - s.ref;
  const scaleFactor = 1 + (d * d) / (2 * s.R * s.R);
  return { factor: heightFactor * s.k * scaleFactor, heightFactor, scaleFactor, d };
}

/** Egy mérés távolság- és magasságkülönbség-redukciója. */
export function reduceMeasurement(m: MeasurementRow, s: RecorderSettings): ReduceResult {
  const notes: string[] = [];
  if (m.external) {
    notes.push('a külső program (TVET.TXT) eredménye');
    return { tv: m.external.tv, dm: m.external.dm, notes };
  }
  // A GeoCalc a nem mért magassági szöget 0.0000-ként írja: az nem 0° zenitszög, hanem hiányzó adat.
  const zi = m.zi !== null && m.zi !== 0 ? m.zi : null;
  // A vízszintes (esetleg ferde) távolság.
  let horizontal: number | null = null;
  if (zi !== null && m.tf !== null && m.tf > 0) {
    horizontal = m.tf * Math.sin(zi * DEG);
    notes.push(`vízszintes a magassági szögből: Tf · sin(Zi) = ${fix(horizontal, 3)} m`);
  } else if (m.tv !== null && m.tv > 0) {
    horizontal = m.tv;
    notes.push(`mért vízszintes távolság: ${fix(m.tv, 3)} m`);
  }
  if (horizontal === null) return { tv: null, dm: null, notes };

  let tv = horizontal;
  if (s.reduction === 'projection') {
    const { factor, heightFactor, scaleFactor, d } = projectionScale(s);
    if (s.heightReduction) notes.push(`magassági redukció: 1 − M/R = 1 − ${fix(s.avgM, 3)}/${fix(s.R, 3)} = ${heightFactor.toFixed(9)}`);
    notes.push(`vetületi redukció: k = ${s.k.toFixed(5)}, d = ${fix(d, 3)} m, 1 + d²/(2R²) = ${scaleFactor.toFixed(9)}`);
    tv = horizontal * factor;
  } else if (s.reduction === 'external') {
    notes.push('a redukciót külső program végzi (TVET.TXT)');
  }
  const dm = zi !== null && m.tf !== null && m.tf > 0 ? m.tf * Math.cos(zi * DEG) + (m.mm ?? 0) - (m.mj ?? 0) : m.dm;
  return { tv, dm, notes };
}

export interface ReduceReport {
  rows: { m: MeasurementRow; tv: number | null; dm: number | null }[];
  sections: Section[];
}

/** A teljes méréslista redukciója és a hozzá tartozó jegyzőkönyv-szakaszok. */
export function reduceAll(measurements: MeasurementRow[], s: RecorderSettings): ReduceReport {
  const rows = measurements.map((m) => {
    const r = reduceMeasurement(m, s);
    return { m, tv: r.tv, dm: r.dm };
  });
  const mode = REDUCTION_MODES.find((x) => x.id === s.reduction)?.label ?? s.reduction;
  const settings: Row[] = [
    { cells: ['Adatrögzítő típusa', RECORDER_TYPES.find((t) => t.id === s.recorder)?.label ?? s.recorder], role: 'base' },
    { cells: ['Távolságredukció', mode], role: 'base' },
    { cells: ['Hiányzó távolságok', MISSING_DISTANCE_RULES.find((r) => r.id === s.missingDistance)?.label ?? s.missingDistance], role: 'base' },
  ];
  if (s.reduction === 'projection') {
    settings.push(
      { cells: ['Vetület', projectionDef(s.projection).label], role: 'base' },
      { cells: ['Átlagos Y, X, M', `${fix(s.avgY, 3)} ; ${fix(s.avgX, 3)} ; ${fix(s.avgM, 3)} m`], role: 'base' },
      { cells: ['Redukciós koordináta', `${s.axis.toUpperCase()} (kezdőérték ${fix(s.ref, 3)} m)`], role: 'base' },
      { cells: ['k, R', `${s.k.toFixed(5)} ; ${fix(s.R, 3)} m`], role: 'base' },
      { cells: ['Magassági redukció', s.heightReduction ? 'számítva' : 'nem számítva'], role: 'base' },
    );
  }
  const sections: Section[] = [
    {
      kind: 'rec-settings',
      title: 'Az adatrögzítő beállításai',
      columns: ['Jellemző', 'Érték'],
      rows: settings,
      footer: s.reduction === 'projection'
        ? [
            'A redukált távolság: Tv = Tf · sin(Zi) · (1 − M/R) · k · (1 + d²/(2R²)), ahol d a redukciós koordináta eltérése a kezdőértéktől (EOV: X − 200 000 m).',
            'Az EOV redukció a valódi GeoCalc 3.5 kimenetével egyezik; a HÉR, HKR, HDR és a sztereografikus vetület állandói a súgó szerintiek.',
          ]
        : undefined,
    },
    {
      kind: 'rec-measurements',
      title: 'Mérési adatok és a redukált értékek',
      columns: ['Sorszám', 'Hz', 'Zi', 'Tf [m]', 'Tv [m]', 'dM [m]', 'Mj [m]', 'Mm [m]', 'Pkód'],
      rows: rows.map<Row>(({ m, tv, dm }) => ({
        cells: [
          String(m.no),
          m.hz === null ? '' : formatDms(m.hz),
          m.zi === null ? '' : formatDms(m.zi),
          m.tf === null ? '' : fix(m.tf, 3),
          tv === null ? '' : fix(tv, 3),
          dm === null ? '' : fix(dm, 3),
          m.mj === null ? '' : fix(m.mj, 3),
          m.mm === null ? '' : fix(m.mm, 3),
          m.code,
        ],
        role: 'base',
      })),
      footer: [
        'A szögek a GeoCalc FOK.PPMMSS alakjában (45.1234 = 45°12′34″); a Tv és a dM a program számolt értéke.',
        `${rows.length} mérési sor, ebből ${rows.filter((r) => r.tv !== null).length} redukált távolság.`,
      ],
    },
  ];
  return { rows, sections };
}

/* ------------------------------------------------------------------ *
 * TVET.TXT – a külső redukáló program adatcseréje (súgó 14. o.)
 * ------------------------------------------------------------------ */

export interface TvetRow {
  no: number;
  /** Magassági szög [fok]. */
  zi: number | null;
  /** Ferde távolság [m]. */
  tf: number | null;
  /** A programtól visszakapott vetületi távolság [m]. */
  tv: number | null;
  /** A programtól visszakapott magasságkülönbség [m]. */
  dm: number | null;
}

/** A külső programnak átadott adatok: `sorszám, magassági szög, ferde távolság`. */
export function formatTvetInput(rows: TvetRow[]): string {
  return (
    rows
      .map((r) => [String(r.no), r.zi === null ? '' : fix(r.zi, 5), r.tf === null ? '' : fix(r.tf, 3)].join(', '))
      .join('\r\n') + '\r\n'
  );
}

/** A külső programtól visszakapott adatok: `sorszám, vetületi távolság, magasságkülönbség`. */
export function formatTvetResult(rows: TvetRow[]): string {
  return (
    rows
      .filter((r) => r.tv !== null || r.dm !== null)
      .map((r) => [String(r.no), r.tv === null ? '' : fix(r.tv, 3), r.dm === null ? '' : fix(r.dm, 3)].join(', '))
      .join('\r\n') + '\r\n'
  );
}

/** A TVET.TXT értelmezése (sorszám, magassági szög, ferde távolság). */
export function parseTvet(text: string): TvetRow[] {
  const out: TvetRow[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (t === '') return;
    const f = splitFields(t);
    const no = Number(f[0]);
    if (!Number.isFinite(no)) throw new CalcError(`${i + 1}. sor: érvénytelen sorszám: „${f[0]}”.`);
    const zi = f[1] && f[1] !== '' ? Number(f[1]) : null;
    const tf = f[2] && f[2] !== '' ? Number(f[2]) : null;
    const tv = f[3] && f[3] !== '' ? Number(f[3]) : null;
    const dm = f[4] && f[4] !== '' ? Number(f[4]) : null;
    out.push({
      no,
      zi: zi !== null && Number.isFinite(zi) ? zi : null,
      tf: tf !== null && Number.isFinite(tf) ? tf : null,
      tv: tv !== null && Number.isFinite(tv) ? tv : null,
      dm: dm !== null && Number.isFinite(dm) ? dm : null,
    });
  });
  return out;
}

/**
 * A felületi mérési táblázat egy sora: a kilenc mező pontosan úgy, ahogy a felhasználó beírta
 * (a program a Tv-t és a dM-et nem írja vissza). A `#` üresen hagyható, olyankor a sorrend adja.
 */
export interface RecorderDraft {
  no: string;
  hz: string;
  zi: string;
  tf: string;
  tv: string;
  dm: string;
  mj: string;
  mm: string;
  code: string;
}

/** A sor mezői a bevitel sorrendjében. */
export const RECORDER_DRAFT_FIELDS: (keyof RecorderDraft)[] = [
  'no',
  'hz',
  'zi',
  'tf',
  'tv',
  'dm',
  'mj',
  'mm',
  'code',
];

/** A sor feliratai a felületi táblázathoz (fejléc, súgószöveg). */
export const RECORDER_DRAFT_LABELS: Record<keyof RecorderDraft, string> = {
  no: 'Sorszám',
  hz: 'Hz (vízszintes szög)',
  zi: 'Zi (magassági szög)',
  tf: 'Tf (ferde távolság)',
  tv: 'Tv (vízszintes távolság)',
  dm: 'dM (magasságkülönbség)',
  mj: 'Mj (jelmagasság)',
  mm: 'Mm (műszermagasság)',
  code: 'Pkód (pont jellege)',
};

/** Üres táblázatsor a kézi bevitelhez. */
export const EMPTY_DRAFT: RecorderDraft = {
  no: '',
  hz: '',
  zi: '',
  tf: '',
  tv: '',
  dm: '',
  mj: '',
  mm: '',
  code: '',
};

/** Egy táblázatsor → a szöveges bevitel egy sora. */
export function draftToLine(d: RecorderDraft): string {
  return RECORDER_DRAFT_FIELDS.map((k) => d[k].trim()).join(', ');
}

/** A táblázat sorai → szöveg. Az üres `#` a sorrend szerinti sorszámot kapja, az üres sor kimarad. */
export function draftsToText(drafts: RecorderDraft[]): string {
  return drafts
    .filter((d) => RECORDER_DRAFT_FIELDS.some((k) => d[k].trim() !== ''))
    .map((d, i) => draftToLine({ ...d, no: d.no.trim() === '' ? String(i + 1) : d.no }))
    .join('\r\n');
}

/** Szöveg → táblázatsorok (`sorszám, Hz, Zi, Tf, Tv, dM, Mj, Mm, Pkód`); a megjegyzés-sor kimarad. */
export function textToDrafts(text: string): RecorderDraft[] {
  const out: RecorderDraft[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (t === '' || /^[#*]/.test(t)) continue;
    const f = splitFields(t);
    out.push({
      no: f[0] ?? '',
      hz: f[1] ?? '',
      zi: f[2] ?? '',
      tf: f[3] ?? '',
      tv: f[4] ?? '',
      dm: f[5] ?? '',
      mj: f[6] ?? '',
      mm: f[7] ?? '',
      code: f[8] ?? '',
    });
  }
  return out;
}

/** Egy hibás mező jegyzése a tűrő értelmezésnél. */
export interface RecorderRowIssue {
  /** A szöveg 1-alapú sorszáma. */
  line: number;
  message: string;
}

export interface RecorderParseResult {
  rows: MeasurementRow[];
  issues: RecorderRowIssue[];
}

/**
 * Mérési sorok **tűrő** értelmezése (`sorszám, Hz, Zi, Tf, Tv, dM, Mj, Mm, Pkód`).
 *
 * A hibás mező helyén üres érték marad és a hiba bekerül a jegyzékbe, így a többi sor és a
 * többi mező feldolgozható – ezt használja a felületi táblázat. A sorszám nélküli sor kimarad.
 * A `firstLine` a hibajegyzék sorszámozását állítja be (egyetlen sorból álló szövegnél).
 */
export function parseRecorderRows(text: string, firstLine = 1): RecorderParseResult {
  const rows: MeasurementRow[] = [];
  const issues: RecorderRowIssue[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (t === '' || /^[#*]/.test(t)) return;
    const line = firstLine + i;
    const f = splitFields(t);
    const no = Number(f[0]);
    if (!Number.isFinite(no)) {
      issues.push({ line, message: `${line}. sor: érvénytelen sorszám: „${f[0]}”.` });
      return;
    }
    const ang = (tok: string | undefined, what: string): number | null => {
      if (tok === undefined || tok === '') return null;
      try {
        return parseDms(tok);
      } catch {
        issues.push({ line, message: `${line}. sor: érvénytelen ${what}: „${tok}”.` });
        return null;
      }
    };
    const dist = (tok: string | undefined, what: string): number | null => {
      if (tok === undefined || tok === '') return null;
      const v = Number(tok);
      if (!Number.isFinite(v)) {
        issues.push({ line, message: `${line}. sor: érvénytelen ${what}: „${tok}”.` });
        return null;
      }
      return v;
    };
    rows.push({
      no,
      hz: ang(f[1], 'vízszintes szög'),
      zi: ang(f[2], 'magassági szög'),
      tf: dist(f[3], 'ferde távolság'),
      tv: dist(f[4], 'vízszintes távolság'),
      dm: dist(f[5], 'magasságkülönbség'),
      mj: dist(f[6], 'jelmagasság'),
      mm: dist(f[7], 'műszermagasság'),
      code: f[8] ?? '',
    });
  });
  return { rows, issues };
}

/**
 * A kézzel beírt mérési adatok értelmezése:
 * `sorszám, Hz, Zi, Tf, Tv, dM, Mj, Mm, Pkód`.
 * A szögek a GeoCalc formátumában (FOK.PPMMSS), a hiányzó mező üresen hagyható.
 * Az első hibánál dob (a szigorú értelmezés).
 */
export function parseRecorderInput(text: string): MeasurementRow[] {
  const { rows, issues } = parseRecorderRows(text);
  const first = issues[0];
  if (first) throw new CalcError(first.message);
  return rows;
}

/** Az átlagos Y, X és M értékek számítása egy koordináta-állományból (`psz, y, x, [m]`). */export function averagesFromCoordinates(text: string): { y: number; x: number; m: number; count: number } {
  let sy = 0;
  let sx = 0;
  let sm = 0;
  let withM = 0;
  let count = 0;
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    const t = line.trim();
    if (t === '' || t === ';;' || /^(k|p)_/i.test(t) || /^[A-Z]>/.test(t)) continue;
    const f = splitFields(t);
    const y = Number(f[1]);
    const x = Number(f[2]);
    if (!Number.isFinite(y) || !Number.isFinite(x)) throw new CalcError(`${i + 1}. sor: érvénytelen koordináta: „${line}”.`);
    sy += y;
    sx += x;
    const m = f[3] && f[3] !== '' ? Number(f[3]) : null;
    if (m !== null && Number.isFinite(m)) {
      sm += m;
      withM++;
    }
    count++;
  }
  if (count === 0) throw new CalcError('A koordináta-állomány nem tartalmaz pontot.');
  return { y: sy / count, x: sx / count, m: withM > 0 ? sm / withM : 0, count };
}
