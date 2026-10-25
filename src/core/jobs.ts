import type { ChangeKind } from './fees';

/**
 * A földhivatali munkák fajtái és a leadandó munkarészeik a 8/2018. (VI. 29.) AM rendelet szerint:
 * - kitűzés: kitűzési vázlat (27. melléklet), kitűzési vázrajz (28.), helyszíni jegyzőkönyv (25.),
 *   a 43. § (2)–(3) szerinti feliratok;
 * - telekalakítás: változási vázrajz (15.), mérési vázlat (10. A), területkimutatás (5–6.);
 * - épületfeltüntetés: változási vázrajz (17.), mérési vázlat (10. B), címkoordináták;
 * - művelési ág változása: változási vázrajz (19.) mezőgazdász-záradékkal, mérési vázlat;
 * mindegyikhez: adatigénylő lap (1.), térképmásolat-megrendelő (3.), műszaki leírás (29.),
 * vizsgálat és záradékolás iránti kérelem (30.), koordinátajegyzék, területszámítás.
 */

export type JobKind = 'setout' | 'subdivision' | 'building' | 'landuse';

/**
 * A lábrész elemei a földhivatal által közzétett mellékletminták szerint:
 * - sign: „A változás akaratunknak megfelelően történt:” a tulajdonosok aláírásának helyével;
 * - place: „Készítés helye, időpontja:”; maker: „Készítő: … földmérő ig. száma:”;
 * - cert: „Minőséget tanúsító: … Ing.rend.min.sz.:”; makercert: „Készítő és minőséget tanúsító: …”;
 * - taken: „A … sz. záradékolt munkából átvett méretek.”;
 * - optional: „Szükség esetén:” (megelőző / hatályon kívül helyezett vázrajz) keret;
 * - soil: a 30. § (2) vagy (3) szerinti földminősítési záradék kerete;
 * - clause511 / clause512: az 51. § (1) / (2) szerinti záradék helye (J.H. székhelye, Záradékoló, P.H.);
 * - marked: „A kitűzött földrészlet határpontjait … jelöltem meg.” (43. § (3));
 * - newmarked: „A változással érintett földrészlet új határpontjait …-val jelöltem meg.”;
 * - register: „Nyilvántartásba véve:” (kitűzés, Vizsgáló, P.H.).
 */
export type FooterItem = 'sign' | 'place' | 'maker' | 'cert' | 'makercert' | 'taken' | 'optional' | 'soil' | 'clause511' | 'clause512' | 'marked' | 'newmarked' | 'register';

export interface PlanTemplate {
  /** A rajz felirata. */
  title: string;
  /** A tárgymondat fajtája („a … helyrajzi számú földrészlet megosztásáról” stb.). */
  subject: JobKind | 'auto';
  left: FooterItem[];
  right: FooterItem[];
  /** „A vázrajz (vázlat) méretek levételére nem alkalmas.” – üres, ha a minta nem írja. */
  notForMeasure: string;
  /** Területkimutatás a rajzon: a 14 oszlopos (jogok, megjegyzés) vagy a 13 oszlopos (jegyzet) változat. */
  areaTable: 'full' | 'note' | null;
  /** Méretmegírás (a munka fajtája szerinti éleken). */
  dimensions: boolean;
  /** Színes vázlat a 11. melléklet szerint (mért: zöld, kitűzési / új: piros, átvett: kék). */
  colored: boolean;
}

export interface JobDef {
  id: JobKind;
  label: string;
  /** A változási vázrajz megnevezése (4. §). */
  name: string;
  plan: PlanTemplate;
  sketch: PlanTemplate;
  fee: ChangeKind;
  /** A leadandó munkarészek mappái a csomagban, sorrendben. */
  folders: string[];
}

const NOT_FOR_MEASURE = 'A vázrajz méretek levételére nem alkalmas.';
const SKETCH_NOT_FOR_MEASURE = 'A vázlat méretek levételére nem alkalmas.';

export const JOBS: Record<JobKind, JobDef> = {
  setout: {
    id: 'setout',
    label: 'Kitűzés',
    name: 'földrészlet kitűzése',
    // 28. minta
    plan: { title: 'KITŰZÉSI VÁZRAJZ', subject: 'setout', left: ['place', 'makercert'], right: ['marked', 'register'], notForMeasure: NOT_FOR_MEASURE, areaTable: null, dimensions: true, colored: false },
    // 27. minta
    sketch: { title: 'KITŰZÉSI VÁZLAT', subject: 'setout', left: ['place', 'makercert'], right: ['marked', 'register'], notForMeasure: SKETCH_NOT_FOR_MEASURE, areaTable: null, dimensions: true, colored: true },
    fee: 'setout',
    folders: [
      '01_Tartalomjegyzék',
      '02_Adatigénylő lap',
      '03_Térképmásolat megrendelő',
      '04_Műszaki leírás',
      '05_Mérési jegyzőkönyv',
      '06_Kitűzési vázlat',
      '07_Kitűzési vázrajz',
      '08_Helyszíni jegyzőkönyv',
      '09_Koordináta jegyzék',
      '10_Területszámítás',
      '11_Értesítés kitűzési munkavégzésről',
    ],
  },
  subdivision: {
    id: 'subdivision',
    label: 'Telekalakítás',
    name: 'telekalakítással összefüggő változási vázrajz',
    // 15. minta
    plan: { title: 'VÁLTOZÁSI VÁZRAJZ', subject: 'subdivision', left: ['sign', 'place', 'maker', 'cert'], right: ['optional', 'soil', 'clause511'], notForMeasure: NOT_FOR_MEASURE, areaTable: 'full', dimensions: false, colored: false },
    // 10/A. minta
    sketch: { title: 'MÉRÉSI VÁZLAT', subject: 'subdivision', left: ['place', 'taken', 'maker'], right: ['newmarked', 'cert'], notForMeasure: '', areaTable: null, dimensions: true, colored: true },
    fee: 'subdivision',
    folders: [
      '01_Adatigénylő lap',
      '02_Változási vázrajz',
      '03_Mérési vázlat',
      '04_Koordináta jegyzék',
      '05_Területszámítás',
      '06_DAT állomány',
      '07_Műszaki leírás',
      '08_Záradékolási kérelem',
    ],
  },
  building: {
    id: 'building',
    label: 'Épületfeltüntetés',
    name: 'épület feltüntetésével összefüggő változási vázrajz',
    // 17. minta
    plan: { title: 'VÁLTOZÁSI VÁZRAJZ', subject: 'building', left: ['place', 'maker', 'cert'], right: ['optional', 'soil', 'clause512'], notForMeasure: NOT_FOR_MEASURE, areaTable: 'note', dimensions: false, colored: false },
    // 10/B. minta
    sketch: { title: 'MÉRÉSI VÁZLAT', subject: 'building', left: ['place', 'taken', 'maker'], right: ['cert'], notForMeasure: '', areaTable: null, dimensions: true, colored: true },
    fee: 'building',
    folders: [
      '01_Adatigénylő lap',
      '02_Változási vázrajz',
      '03_Mérési vázlat',
      '04_Koordinátajegyzék',
      '05_Címkoordináta',
      '06_Ellenőrző területszámítás',
      '07_Műszaki leírás',
      '08_Záradékolási kérelem',
      '09_DAT állomány',
    ],
  },
  landuse: {
    id: 'landuse',
    label: 'Művelési ág változás',
    name: 'művelési ág változásával összefüggő változási vázrajz',
    // 19. minta
    plan: { title: 'VÁLTOZÁSI VÁZRAJZ', subject: 'landuse', left: ['place', 'maker', 'cert'], right: ['optional', 'soil', 'clause511'], notForMeasure: NOT_FOR_MEASURE, areaTable: 'full', dimensions: false, colored: false },
    sketch: { title: 'MÉRÉSI VÁZLAT', subject: 'landuse', left: ['place', 'taken', 'maker'], right: ['cert'], notForMeasure: '', areaTable: null, dimensions: true, colored: true },
    fee: 'cultivation',
    folders: [
      '01_Adatigénylő lap',
      '02_Változási vázrajz',
      '03_Mérési vázlat',
      '04_Koordinátajegyzék',
      '05_Területszámítás',
      '06_DAT állomány',
      '07_Műszaki leírás',
      '08_Záradékolási kérelem',
    ],
  },
};

export const JOB_LIST: JobDef[] = [JOBS.setout, JOBS.subdivision, JOBS.building, JOBS.landuse];

/** A T_MUVEL_AG kódtáblázat (DAT-M1). */
export const LAND_USE_CODES: Record<string, number> = {
  szántó: 1,
  rét: 2,
  szőlő: 3,
  kert: 4,
  gyümölcsös: 5,
  legelő: 6,
  nádas: 7,
  erdő: 8,
  kivett: 9,
  halastó: 10,
  'fásított terület': 11,
};

/** A művelési ág kódja a megnevezés első szava szerint („kivett, lakóház, udvar” → 9). */
export function landUseCode(use: string): number | null {
  const u = use.trim().toLowerCase();
  if (LAND_USE_CODES[u] !== undefined) return LAND_USE_CODES[u]!;
  const first = u.split(/[,;]/)[0]!.trim();
  return LAND_USE_CODES[first] ?? null;
}

/** A T_MUVEL_AG kód megnevezése. */
export function landUseName(code: number | null): string {
  return Object.entries(LAND_USE_CODES).find(([, c]) => c === code)?.[0] ?? '';
}
