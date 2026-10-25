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

export interface PlanTemplate {
  /** A rajz felirata (a fejléc közepén). */
  title: string;
  /** A lábrész bal oldali sorai (záradékok, feliratok); a „…” helyére a felhasználó ír. */
  footer: string[];
  /** A lábrész jobb oldali mezőjének címe (a hatósági záradék vagy nyilvántartásba vétel helye). */
  stampBox: string;
  /** Területkimutatás a rajzon. */
  areaTable: boolean;
  /** A kitűzött / új földrészletek oldalainak méretei a rajzon. */
  dimensions: boolean;
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

export const JOBS: Record<JobKind, JobDef> = {
  setout: {
    id: 'setout',
    label: 'Kitűzés',
    name: 'földrészlet kitűzése',
    plan: {
      title: 'KITŰZÉSI VÁZRAJZ',
      footer: ['A kitűzött földrészlet határpontjait ........................ jelöltem meg. (43. § (3))', NOT_FOR_MEASURE],
      stampBox: 'Nyilvántartásba vétel:',
      areaTable: false,
      dimensions: true,
    },
    sketch: {
      title: 'KITŰZÉSI VÁZLAT',
      footer: ['A kitűzött földrészlet határpontjait ........................ jelöltem meg. (43. § (3))', 'A vázlat méretek levételére nem alkalmas.'],
      stampBox: 'Nyilvántartásba vétel:',
      areaTable: false,
      dimensions: true,
    },
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
    plan: {
      title: 'VÁLTOZÁSI VÁZRAJZ',
      footer: ['A változás akaratunknak megfelelően történt:', '§sign', NOT_FOR_MEASURE],
      stampBox: 'Záradék (51. § (1)):',
      areaTable: true,
      dimensions: false,
    },
    sketch: {
      title: 'MÉRÉSI VÁZLAT',
      footer: ['A változással érintett földrészlet új határpontjait ................ -val jelöltem meg.'],
      stampBox: '',
      areaTable: false,
      dimensions: true,
    },
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
    plan: {
      title: 'VÁLTOZÁSI VÁZRAJZ',
      footer: [NOT_FOR_MEASURE],
      stampBox: 'Záradék (51. § (2)):',
      areaTable: true,
      dimensions: false,
    },
    sketch: {
      title: 'MÉRÉSI VÁZLAT',
      footer: ['Az épület töréspontjait helyszíni méréssel határoztam meg.'],
      stampBox: '',
      areaTable: false,
      dimensions: true,
    },
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
    plan: {
      title: 'VÁLTOZÁSI VÁZRAJZ',
      footer: ['Mezőgazdász-záradék (30. § (2)):', '', NOT_FOR_MEASURE],
      stampBox: 'Záradék (51. § (1)):',
      areaTable: true,
      dimensions: false,
    },
    sketch: {
      title: 'MÉRÉSI VÁZLAT',
      footer: ['Az alrészlethatárok töréspontjait helyszíni méréssel határoztam meg.'],
      stampBox: '',
      areaTable: false,
      dimensions: true,
    },
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
