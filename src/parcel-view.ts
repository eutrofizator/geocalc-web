import { encodeWindows1250, readDat, writeDat, type DatImport } from './core/dat';
import { checkBoundary, type Area, type CheckOptions, type MapKind, type PointOrder } from './core/boundary-check';
import { CHANGE_KINDS, feesSection, type ChangeKind } from './core/fees';
import { sectionsToText } from './core/format';
import { parseMeasured } from './core/boundary-check';
import { writeLst } from './core/lst';
import { decodeText, mergeRegistered, readCadastralDxf, readRegisteredAreas, readZip, type CadastralMap, type RegisteredParcel } from './core/land-office';
import { polygonArea } from './core/geometry';
import {
  ANNEX_SCALES,
  areaStatement,
  divideParallel,
  divideThroughVertex,
  divisionSection,
  parseParcels,
  parsePoints,
  type DivisionResult,
  type NamedPt,
  type ToleranceAnnex,
  type ToleranceKind,
} from './core/parcel';
import type { Issue, Section } from './core/types';
import { createPage } from './shell';
import { csvButton, download, el, readText, renderSection, storage } from './ui';
import {
  addressSection,
  coordinateList,
  generateAddressPoints,
  parsePointAttrs,
  planEntities,
  PLAN_SCALES,
  renderPlan,
  type AddressPoint,
  type PlanInput,
  type PlanMeta,
} from './core/plan';
import { getMeta } from './report-view';
import { JOBS, JOB_LIST, landUseCode, landUseName, type JobKind } from './core/jobs';
import { subStatement } from './core/subparcels';
import { SYMBOLS } from './core/symbols';
import { buildPackage, printAll, type PackageParts } from './core/package';
import { writeZip } from './core/zip-writer';
import { measurementRecord, type RecordRow, type StakedPoint, type WorkData } from './core/documents';
import { parseDrawing, type DrawingElement } from './core/drawing';
import { writeDxf } from './core/dxf-writer';
import { buildingLayer } from './core/layers';
import { computeDm, computeTvet, detectFieldFormat, parseFieldData } from './core/field-book';
import { DEFAULT_RECORDER_SETTINGS, type RecorderSettings } from './core/recorder';
import { formatDms } from './core/angle';
import { fix } from './core/format';

/**
 * A nyers mérés sorai a mérési jegyzőkönyvhöz: a vízszintes távolság a ferdéből és a zenitszögből, ha
 * a műszer nem adta; a magasságkülönbség; a vetületi távolság az Adatrögzítő beállításai szerint.
 */
function recordRows(raw: { name: string; text: string }): RecordRow[] {
  const fmt = detectFieldFormat(raw.text);
  if (!fmt) return [];
  let rows;
  try {
    rows = parseFieldData(raw.text, fmt).rows;
  } catch {
    return [];
  }
  rows = rows.map((r) => (r.kind === 'obs' && r.tv === null && r.tf !== null && r.zi !== null ? { ...r, tv: Math.round(r.tf * Math.sin((r.zi * Math.PI) / 180) * 10000) / 10000 } : r));
  rows = computeDm(rows);
  let settings: RecorderSettings = DEFAULT_RECORDER_SETTINGS;
  try {
    settings = { ...DEFAULT_RECORDER_SETTINGS, ...(JSON.parse(storage.get('geocalc-web.recorder') || '{}') as Partial<RecorderSettings>) };
  } catch {
    settings = DEFAULT_RECORDER_SETTINGS;
  }
  try {
    rows = computeTvet(rows, settings);
  } catch {
    /* a vetületi távolság nélkül is kiírható */
  }
  return rows.filter((r) => r.state !== 'skip').map((r) => ({ kind: r.kind, id: r.id, hz: r.hz, zi: r.zi, tf: r.tf, tv: r.tv, mj: r.mj, mm: r.mm, code: r.code, tvet: r.tvet, dm: r.dm }));
}

/** Az új épületek ellenőrző területszámítása: töréspontok és terület (m², négyzetméterre kerekítve is). */
function buildingAreaText(drawing: DrawingElement[]): string | undefined {
  const blds = drawing.filter((d): d is Extract<DrawingElement, { kind: 'building' }> => d.kind === 'building' && d.type === 'new');
  if (blds.length === 0) return undefined;
  const lines = ['Ellenőrző területszámítás – új épület(ek)', ''];
  blds.forEach((b, i) => {
    const a = polygonArea(b.ring);
    lines.push(`${i + 1}. épület (${b.code}): ${b.ring.map((p) => p.id).join(' ')}`);
    lines.push('Pontszám\tY\tX');
    for (const p of b.ring) lines.push(`${p.id}\t${fix(p.y, 2)}\t${fix(p.x, 2)}`);
    lines.push(`Terület: ${fix(a, 3)} m², kerekítve ${Math.round(a)} m²`, '');
  });
  return lines.join('\r\n');
}

/**
 * Geodéziai számítások/Változási vázrajz: területszámítás a koordinátákból, terület-összevetés a
 * tulajdoni lapi területtel (8/2018. AM rendelet 18. §, 8–9. melléklet), területarányos ráosztás és
 * területkimutatás (12. §, 22. §), valamint területosztás (párhuzamos vagy töréspontos osztóvonal).
 */

const KEY = 'geocalc-web.parcel';

const SAMPLE = {
  coords: [
    '# pontszám  Y  X',
    '101  650120.45  241230.18',
    '102  650158.92  241236.71',
    '103  650152.37  241275.04',
    '104  650113.88  241268.52',
    '105  650190.40  241242.05',
    '106  650184.11  241280.39',
  ].join('\n'),
  before: ['# hrsz ; tulajdoni lapi terület [m²] ; pontok a kerület mentén', '123 ; 1524 ; 101 102 103 104', '124 ; 1241 ; 102 105 106 103'].join('\n'),
  after: ['# hrsz ; pontok', '123 ; 101 102 103 104', '124 ; 102 105 106 103'].join('\n'),
};

interface Saved {
  coords: string;
  before: string;
  after: string;
  annex: ToleranceAnnex;
  scale: string;
  kind: ToleranceKind;
  measured: string;
  check: Omit<CheckOptions, 'scale'>;
  fees: { on: boolean; kind: ChangeKind; buildings: number; units: number; subparcels: number; reissue: boolean; withData: boolean };
  plan: { szekhely: string; iktatoszam: string; megnevezes: string; igazolvany: string; minosites: string; hely: string; address: boolean; prefix: string; drawing?: string; scale?: string };
  job?: JobKind;
  work?: Partial<Record<WorkKey, string>>;
  /** Tulajdonosok soronként: név ; lakcím ; hrsz. */
  owners?: string;
  /** A nyers mérés (a mérési jegyzőkönyvhöz). */
  raw?: { name: string; text: string } | null;
}

/** A „Munka adatai” mezői: kulcs, felirat, súgószöveg. */
const WORK_FIELDS = [
  ['megbizo', 'Megbízó neve', ''],
  ['megbizoCim', 'Megbízó címe', ''],
  ['hivatal', 'Kormányhivatal (adatszolgáltató, záradékoló)', 'pl. Pest Vármegyei Kormányhivatal'],
  ['ugyfelkod', 'Ügyfélkód', ''],
  ['okmany', 'Személyazonosító okmány és száma', ''],
  ['statisztikai', 'Statisztikai számjel', ''],
  ['email', 'E-mail-cím', ''],
  ['telefon', 'Telefonszám', 'pl. +36 30 123 4567'],
  ['muszer', 'Mérőműszer típusa', 'pl. FOIF RTS102'],
  ['gyariszam', 'Gyári szám', ''],
  ['minosegtanusito', 'Minőségtanúsító neve', ''],
  ['megjeloles', 'A határpontok megjelölése', 'pl. fakaróval'],
  ['idopont', 'A munkavégzés (kitűzés) időpontja', 'pl. 2026.11.05. 9:00'],
  ['szomszedok', 'Szomszédos hrsz-ek (kitűzés)', 'pl. 122, 124, 125'],
  ['helyszin', 'A munkavégzés helyszíne (cím)', 'pl. Kisváros, Fő utca 12.'],
  ['vegzok', 'A munkát végzők (név, ig. szám)', 'üresen: a készítő'],
  ['feljegyzes', 'Egyéb feljegyzés (műszaki leírás)', ''],
] as const;
type WorkKey = (typeof WORK_FIELDS)[number][0];

const DEFAULTS: Saved = {
  ...SAMPLE,
  annex: 8,
  scale: '1000',
  kind: 'parcel',
  measured: '',
  check: { kind: 'digital', area: 'inner', order: 'R2', marked: true },
  fees: { on: false, kind: 'subdivision', buildings: 1, units: 1, subparcels: 1, reissue: false, withData: true },
  plan: { szekhely: '', iktatoszam: '', megnevezes: 'telekalakítással összefüggő változási vázrajz', igazolvany: '', minosites: '', hely: '', address: false, prefix: 'C' },
};

export function initParcelView(): void {
  const { body } = createPage('parcel', 'Geodéziai számítások/Változási vázrajz');
  const panes = el('div', 'panes');
  const left = el('section', 'pane network-form');
  left.setAttribute('aria-label', 'Földrészletek és területosztás');
  const right = el('section', 'pane result-pane');
  right.setAttribute('aria-label', 'Eredmény');

  /* ---------- bal oldal: bemenet ---------- */
  const lhead = el('div', 'pane-head');
  lhead.append(el('h2', undefined, 'Változási vázrajz – területszámítás'));
  const lact = el('div', 'pane-actions');
  const sampleBtn = button('pc-sample', 'Minta', 'A mintapélda betöltése');
  const openBtn = button('pc-open', 'Koordináták…', 'Koordináta-állomány beolvasása (pontszám, Y, X)');
  const datBtn = button('pc-dat-open', 'DAT beolvasása…', 'A földhivatali adatszolgáltatás DAT állományának beolvasása (pontok és földrészletek)');
  const officeBtn = button(
    'pc-office-open',
    'Földhivatali adatok…',
    'A földhivatali adatszolgáltatás beolvasása: a ZIP csomag, vagy a térkép (DXF) a földrészlet-információval (Report.txt) és a földkönyvi kivonattal együtt',
  );
  lact.append(sampleBtn, openBtn, officeBtn, datBtn);
  lhead.append(lact);

  const form = el('div', 'form');
  const row = el('div', 'grid3');
  const annexSel = select('pc-annex', [
    ['8', '8. melléklet – EOTR (EOV) térkép'],
    ['9', '9. melléklet – EOTR előtti vetület'],
  ]);
  const scaleSel = select('pc-scale', []);
  const kindSel = select('pc-kind', [
    ['parcel', 'Földrészlet (1,5 ×)'],
    ['sub', 'Alrészlet, minőségi osztály, jog, tény (2 ×)'],
  ]);
  row.append(labelled('Hibahatár', annexSel), labelled('A digitalizált térkép méretaránya', scaleSel), labelled('Terület fajtája', kindSel));

  const coords = area('pc-coords', 8);
  const before = area('pc-before', 5);
  const after = area('pc-after', 5);
  form.append(
    row,
    labelled('Koordináták (pontszám, Y, X)', coords),
    labelled('Változás előtti földrészletek (hrsz ; tulajdoni lapi terület ; pontok)', before),
    labelled('Változás utáni földrészletek (hrsz ; pontok)', after),
    el(
      'p',
      'hint',
      'A pontokat a kerület mentén, szóközzel tagolva add meg (a kezdőpontot nem kell megismételni). A # utáni rész megjegyzés. ' +
        'A műszaki terület a koordinátákból számolódik; a változás utáni végleges területek a 22. § (3) szerinti területarányos ráosztással adódnak.',
    ),
  );

  // Területosztás
  const div = el('fieldset', 'dims column');
  div.append(el('legend', undefined, 'Területosztás'));
  const parcelSel = select('pc-div-parcel', []);
  const methodSel = select('pc-div-method', [
    ['parallel', 'Párhuzamos az A–B oldallal'],
    ['vertex', 'Az A törésponton átmenő'],
  ]);
  const ptA = input('pc-div-a', 'pl. 101');
  const ptB = input('pc-div-b', 'pl. 104');
  const target = input('pc-div-area', 'pl. 600');
  const name1 = input('pc-div-name1', 'pl. 123/1');
  const name2 = input('pc-div-name2', 'pl. 123/2');
  const prefix = input('pc-div-prefix', 'pl. U');
  prefix.value = 'U';
  const g1 = el('div', 'grid3');
  g1.append(labelled('Földrészlet', parcelSel), labelled('Osztóvonal', methodSel), labelled('Leválasztandó terület [m²]', target));
  const g2 = el('div', 'grid3');
  const bLabel = labelled('B pont', ptB);
  g2.append(labelled('A pont', ptA), bLabel, labelled('Új pontok előtagja', prefix));
  const g3 = el('div', 'grid3');
  g3.append(labelled('A leválasztott rész hrsz-a', name1), labelled('A maradék rész hrsz-a', name2));
  const divAct = el('div', 'pane-actions');
  const divBtn = button('pc-divide', 'Osztás', 'A földrészlet osztása a megadott területtel');
  const takeBtn = button('pc-take', 'Átvétel a változás utáni állapotba', 'Az új pontok a koordinátákhoz, a két rész a változás utáni földrészletek közé kerül');
  takeBtn.disabled = true;
  divAct.append(divBtn, takeBtn);
  div.append(
    g1,
    g2,
    g3,
    divAct,
    el(
      'p',
      'hint',
      'Párhuzamos osztásnál a leválasztott rész az A–B egyenes mellett marad (A és B általában a földrészlet egyik oldala). ' +
        'Töréspontos osztásnál az osztóvonal az A pontból indul, a leválasztott rész a pontsorrend szerint az A pontot követő oldalak felé esik. ' +
        'Az átvételkor az új pontok centiméterre kerekítve kerülnek a koordináták közé, ezért a rész területe néhány dm²-rel eltérhet a kérttől.',
    ),
  );
  form.append(div);

  // Határpont-azonosítás (16–17. §)
  const chk = el('fieldset', 'dims column');
  chk.append(el('legend', undefined, 'Határpont-azonosítás (16–17. §)'));
  const mapKindSel = select('pc-chk-kind', [
    ['digital', 'Digitális újfelmérés / felújítás (F)'],
    ['converted-eov', 'EOV térkép digitális átalakítása (A, C)'],
    ['converted-old', 'Régi vetületi térkép digitális átalakítása (B, D)'],
    ['precise', 'Szabatosan felmért terület (16. § (1) a)'],
  ]);
  const areaSel = select('pc-chk-area', [
    ['inner-precise', 'Szabatosan felmért belterület'],
    ['inner', 'Belterület (egyéb módszerrel felmért)'],
    ['outer', 'Külterület'],
  ]);
  const orderSel = select('pc-chk-order', [
    ['R1', 'R1 – közterülettel érintkező határpont'],
    ['R2', 'R2 – egyéb belterületi határpont'],
    ['R3', 'R3 – külterületi határpont'],
    ['R4', 'R4 – egyéb részletpont'],
  ]);
  const markedChk = el('input');
  markedChk.type = 'checkbox';
  markedChk.id = 'pc-chk-marked';
  const markedLabel = el('label', 'check');
  markedLabel.append(markedChk, el('span', undefined, 'Szabatosan megjelölt határ (± 0,10 m, különben ± 0,20 m)'));
  const measured = area('pc-measured', 5);
  const stakeBtn = button('pc-stake-open', 'Kitűzési jegyzőkönyv (.txt)…', 'A kitűzött pontok jegyzéke (pontszám, Y, X [, Z]) a mért pontok közé');
  const stakeFile = el('input');
  stakeFile.type = 'file';
  stakeFile.accept = '.txt,.csv,.koo,text/plain';
  stakeFile.hidden = true;
  stakeFile.id = 'pc-stake-input';
  const stakeAct = el('div', 'pane-actions');
  const rawBtn = button('pc-raw-open', 'Nyers mérés (.MES, GSI…)…', 'A műszer nyers mérési állománya a mérési jegyzőkönyvhöz (FOIF MES, Leica GSI, GeoCalc AR, Sokkia SDR, Topcon, RW5)');
  const rawClear = button('pc-raw-clear', 'Nyers mérés törlése', 'A beolvasott nyers mérés elhagyása');
  const rawInfo = el('span', 'hint');
  rawInfo.id = 'pc-raw-info';
  const rawFile = el('input');
  rawFile.type = 'file';
  rawFile.hidden = true;
  rawFile.id = 'pc-raw-input';
  stakeAct.append(stakeBtn, stakeFile, rawBtn, rawClear, rawFile, rawInfo);
  const g4 = el('div', 'grid3');
  g4.append(labelled('Az alaptérkép készítése', mapKindSel), labelled('Fekvés', areaSel), labelled('Alapértelmezett rendűség', orderSel));
  chk.append(
    g4,
    markedLabel,
    labelled('Mért pontok (pontszám, Y, X [, R1–R4])', measured),
    stakeAct,
    el(
      'p',
      'hint',
      'A mért pontokat a koordináták azonos pontszámú pontjaival veti össze; a mindkét végén mért határvonalak hosszát is. ' +
        'A méretarány a fenti „A digitalizált térkép méretaránya” mező.',
    ),
  );
  form.append(chk);

  // Igazgatási szolgáltatási díjak (1/2024. KTM)
  const fee = el('fieldset', 'dims column');
  fee.append(el('legend', undefined, 'Igazgatási szolgáltatási díjak (1/2024. KTM)'));
  const feeOn = el('input');
  feeOn.type = 'checkbox';
  feeOn.id = 'pc-fee-on';
  const feeOnLabel = el('label', 'check');
  feeOnLabel.append(feeOn, el('span', undefined, 'Díjszámítás a jegyzőkönyvben'));
  const feeKind = select('pc-fee-kind', CHANGE_KINDS.map((k) => [k.id, k.label] as [string, string]));
  const numInput = (id: string) => {
    const i = el('input');
    i.id = id;
    i.type = 'number';
    i.min = '0';
    i.step = '1';
    return i;
  };
  const feeBuildings = numInput('pc-fee-buildings');
  const feeUnits = numInput('pc-fee-units');
  const feeSub = numInput('pc-fee-sub');
  const feeReissue = el('input');
  feeReissue.type = 'checkbox';
  feeReissue.id = 'pc-fee-reissue';
  const feeData = el('input');
  feeData.type = 'checkbox';
  feeData.id = 'pc-fee-data';
  const g5 = el('div', 'grid3');
  g5.append(labelled('A változás jellege', feeKind), labelled('Építmények száma', feeBuildings), labelled('Egyéb önálló ingatlanok', feeUnits));
  const g6 = el('div', 'grid3');
  g6.append(labelled('Új alrészletek', feeSub));
  const reissueLabel = el('label', 'check');
  reissueLabel.append(feeReissue, el('span', undefined, 'Újrazáradékolás (50%)'));
  const dataLabel = el('label', 'check');
  dataLabel.append(feeData, el('span', undefined, 'Adatszolgáltatás díja is (4. melléklet)'));
  fee.append(
    feeOnLabel,
    g5,
    g6,
    reissueLabel,
    dataLabel,
    el('p', 'hint', 'A földrészletek számát és a nyilvántartott területeket a változás előtti és utáni földrészletekből veszi. A számítás tájékoztató jellegű.'),
  );
  form.append(fee);

  // Vázrajz és jegyzékek (8/2018. AM rendelet 10., 15. melléklet, 46. §)
  // A munka fajtája és adatai (a leadandó munkarészekhez)
  const job = el('fieldset', 'dims column');
  job.append(el('legend', undefined, 'Munka'));
  const jobSel = select('pc-job', JOB_LIST.map((j) => [j.id, j.label] as [string, string]));
  const gJob = el('div', 'grid3');
  gJob.append(labelled('A munka fajtája', jobSel));
  const workInputs = new Map<WorkKey, HTMLInputElement>();
  const gWork = el('div', 'grid3');
  for (const [key, label, ph] of WORK_FIELDS) {
    const i = input(`pc-work-${key}`, ph);
    workInputs.set(key, i);
    gWork.append(labelled(label, i));
  }
  const workDetails = el('details', 'settings');
  const owners = area('pc-owners', 4);
  owners.placeholder = ['# név ; lakcím ; hrsz', 'Kiss Anna ; 1111 Kisváros, Fő u. 1. ; 124', 'Nagy Béla ; 1111 Kisváros, Fő u. 3. ; 125'].join('\n');
  workDetails.append(
    el('summary', undefined, 'Munka adatai (adatigénylés, műszaki leírás, kérelem, jegyzőkönyv)'),
    gWork,
    labelled('Tulajdonosok (név ; lakcím ; hrsz) – az értesítéshez és a helyszíni jegyzőkönyvhöz', owners),
    el('p', 'hint', 'Az érintett földrészlet tulajdonosa az, akinek a hrsz-a a munka földrészletei között van; a többiek szomszédok. Tulajdonosonként külön értesítés készül.'),
  );
  const jobAct = el('div', 'pane-actions');
  const printAllBtn = button('pc-print-all', 'Munkarészek nyomtatása', 'A munka összes szöveges munkarésze és rajza egy nyomtatásban (PDF-be menthető)');
  const zipBtn = button('pc-package', 'Leadandó csomag (.zip)', 'A munkarészek a leadott munkák mappaszerkezetében: vázrajz, vázlat, DAT, területszámítás, koordinátajegyzék, dokumentumok');
  jobAct.append(printAllBtn, zipBtn);
  job.append(
    gJob,
    workDetails,
    jobAct,
    el(
      'p',
      'hint',
      'A munka fajtája szabja meg a vázrajz és a vázlat feliratát, záradékait (8/2018. AM rendelet 15., 17., 19., 27–28. melléklet), a méretmegírást és a csomag mappáit.',
    ),
  );
  form.append(job);

  const pl = el('fieldset', 'dims column');
  pl.append(el('legend', undefined, 'Vázrajz és jegyzékek'));
  const plSzekhely = input('pc-plan-szekhely', 'pl. 1111 Budapest, Minta u. 1.');
  const plIkt = input('pc-plan-iktato', 'pl. 700/1/2026');
  const plMegnev = input('pc-plan-megnev', 'pl. telekfelosztás');
  const plIg = input('pc-plan-ig', 'pl. 1234');
  const plMin = input('pc-plan-min', 'ha van');
  const plHely = input('pc-plan-hely', 'pl. Budapest,');
  const plAddr = el('input');
  plAddr.type = 'checkbox';
  plAddr.id = 'pc-plan-addr';
  const plPrefix = input('pc-plan-prefix', 'pl. C');
  const plScale = select('pc-plan-scale', [['', 'Automatikus (ami a keretbe fér)'], ...PLAN_SCALES.map((s): [string, string] => [String(s), `1:${s}`])]);
  const g7 = el('div', 'grid3');
  g7.append(labelled('Székhely', plSzekhely), labelled('Adatszolgáltatás iktatószáma', plIkt), labelled('A vázrajz megnevezése', plMegnev));
  const g8 = el('div', 'grid3');
  g8.append(labelled('Földmérő igazolvány száma', plIg), labelled('IRF minősítés száma', plMin), labelled('A készítés helye', plHely));
  const addrLabel = el('label', 'check');
  addrLabel.append(plAddr, el('span', undefined, 'Címkoordináták generálása a változás utáni földrészletekhez (5411)'));
  const g9 = el('div', 'grid3');
  g9.append(labelled('A vázrajz méretaránya', plScale), labelled('Címkoordináta pontszám-előtagja', plPrefix));
  const drawing = area('pc-drawing', 5);
  drawing.placeholder = [
    'épület ; új ; E1 E2 E3 E4',
    'alrészlet ; a ; kivett ; 101 102 103 104',
    'új alrészlet ; b ; szántó ; … ; 4',
    'vonal ; kerítés ; 101 E5',
    'felirat ; házszám ; 35 ; @104',
  ].join('\n');
  const drawingLabel = labelled('Rajzelemek (épület, alrészlet, vonal, felirat)', drawing);
  const plAct = el('div', 'pane-actions');
  const planChangeBtn = button('pc-plan-change', 'Változási vázrajz', 'A változási vázrajz nyomtatható oldala (15. melléklet)');
  const planSketchBtn = button('pc-plan-sketch', 'Mérési vázlat', 'A mérési vázlat nyomtatható oldala (10. melléklet)');
  const coordListBtn = button('pc-coordlist', 'Koordinátajegyzék (.txt)', 'A koordinátajegyzék csoportonként, számsorrendben (46. § (1) i))');
  const dxfBtn = button('pc-plan-dxf', 'DXF (földhivatali rétegek)', 'A változási vázrajz rajza DXF-ben, a földhivatali rajzok rétegrendjével');
  const planSiteBtn = button('pc-plan-site', 'Telekalakítási helyszínrajz', 'A telekalakítási helyszínrajz nyomtatható oldala (telekalakításnál)');
  plAct.append(planChangeBtn, planSketchBtn, planSiteBtn, dxfBtn, coordListBtn);
  pl.append(
    g7,
    g8,
    addrLabel,
    g9,
    drawingLabel,
    plAct,
    el(
      'p',
      'hint',
      'A készítő, a munkaszám, a település, a fekvés és a dátum a Geodéziai számítások/Beállítások előlapjáról jön. ' +
        'A koordinátajegyzék a koordináták 4. (Z) és 5. (pontkód) oszlopát is átveszi.',
    ),
  );
  form.append(pl);
  left.append(lhead, form);

  /* ---------- jobb oldal: eredmény ---------- */
  const rhead = el('div', 'pane-head');
  rhead.append(el('h2', undefined, 'Területkimutatás'));
  const ract = el('div', 'pane-actions');
  const saveBtn = button('pc-save', 'Jegyzőkönyv (.txt)', 'A területszámítás jegyzőkönyvének mentése');
  const datSaveBtn = button('pc-dat-save', 'Mentés DAT-ba', 'A változás utáni földrészletek mentése DAT adatcsere-állományba (egyszerűsített)');
  let sections: Section[] = [];
  const lstBtn = button('pc-lst-save', 'Területszámítás (.lst)', 'A változás előtti (ve.lst) és utáni (vu.lst) területszámítási lista az ITR szerkezetében');
  ract.append(saveBtn, lstBtn, datSaveBtn, csvButton('valtozasi_vazrajz', () => sections));
  rhead.append(ract);
  const status = el('div', 'status');
  status.id = 'pc-status';
  status.setAttribute('role', 'status');
  const issuesBox = el('div', 'issues');
  issuesBox.id = 'pc-issues';
  const sketch = el('div', 'parcel-sketch');
  sketch.id = 'pc-sketch';
  const results = el('div', 'results');
  results.id = 'pc-results';
  const planBox = el('div', 'plan-preview');
  planBox.id = 'pc-plan';
  planBox.hidden = true;
  right.append(rhead, status, issuesBox, sketch, planBox, results);

  panes.append(left, right);
  body.append(panes);
  const file = el('input');
  file.type = 'file';
  file.accept = '.txt,.csv,.pkt,.koo,text/plain';
  file.hidden = true;
  const datFile = el('input');
  datFile.type = 'file';
  datFile.accept = '.dat,.DAT,text/plain';
  datFile.hidden = true;
  datFile.id = 'pc-dat-input';
  const officeFile = el('input');
  officeFile.type = 'file';
  officeFile.accept = '.zip,.dxf,.txt,.DXF,.TXT,.ZIP';
  officeFile.multiple = true;
  officeFile.hidden = true;
  officeFile.id = 'pc-office-input';
  body.append(file, datFile, officeFile);

  /* ---------- állapot ---------- */
  let saved: Saved = DEFAULTS;
  try {
    saved = {
      ...DEFAULTS,
      ...(JSON.parse(storage.get(KEY) || '{}') as Partial<Saved>),
    };
  } catch {
    saved = DEFAULTS;
  }
  coords.value = saved.coords;
  before.value = saved.before;
  after.value = saved.after;
  annexSel.value = String(saved.annex);
  kindSel.value = saved.kind;
  measured.value = saved.measured;
  mapKindSel.value = saved.check.kind;
  areaSel.value = saved.check.area;
  orderSel.value = saved.check.order;
  markedChk.checked = saved.check.marked;
  feeOn.checked = saved.fees.on;
  feeKind.value = saved.fees.kind;
  feeBuildings.value = String(saved.fees.buildings);
  feeUnits.value = String(saved.fees.units);
  feeSub.value = String(saved.fees.subparcels);
  feeReissue.checked = saved.fees.reissue;
  feeData.checked = saved.fees.withData;
  plSzekhely.value = saved.plan.szekhely;
  plIkt.value = saved.plan.iktatoszam;
  plMegnev.value = saved.plan.megnevezes;
  plIg.value = saved.plan.igazolvany;
  plMin.value = saved.plan.minosites;
  plHely.value = saved.plan.hely;
  plAddr.checked = saved.plan.address;
  plPrefix.value = saved.plan.prefix;
  plScale.value = saved.plan.scale ?? '';
  drawing.value = saved.plan.drawing ?? '';
  jobSel.value = saved.job ?? 'subdivision';
  for (const [key] of WORK_FIELDS) workInputs.get(key)!.value = saved.work?.[key] ?? '';
  owners.value = saved.owners ?? '';
  let raw: { name: string; text: string } | null = saved.raw ?? null;
  fillScales(saved.scale);

  let division: { result: DivisionResult; sections: Section[] } | null = null;
  /** A beolvasott DAT (a földrészletek attribútumai a visszaíráshoz). */
  let dat: { name: string; data: DatImport } | null = null;
  let datNotes: Issue[] = [];
  /** A környezet (a szomszédos földrészletek és épületek) a beolvasott DAT-ból vagy földhivatali DXF-ből. */
  let background: PlanInput['background'] = undefined;

  function fillScales(keep?: string): void {
    const annex = Number(annexSel.value) as ToleranceAnnex;
    const old = keep ?? scaleSel.value;
    scaleSel.replaceChildren(...ANNEX_SCALES[annex].map((s) => new Option(s.label, s.id)));
    scaleSel.value = ANNEX_SCALES[annex].some((s) => s.id === old) ? old : ANNEX_SCALES[annex][0]!.id;
  }

  function fillParcels(): void {
    const keep = parcelSel.value;
    const list = parseParcels(before.value, true, '').parcels;
    parcelSel.replaceChildren(...list.map((p) => new Option(p.hrsz, p.hrsz)));
    if (list.some((p) => p.hrsz === keep)) parcelSel.value = keep;
  }

  function run(): void {
    const state: Saved = {
      coords: coords.value,
      before: before.value,
      after: after.value,
      annex: Number(annexSel.value) as ToleranceAnnex,
      scale: scaleSel.value,
      kind: kindSel.value as ToleranceKind,
      measured: measured.value,
      check: { kind: mapKindSel.value as MapKind, area: areaSel.value as Area, order: orderSel.value as PointOrder, marked: markedChk.checked },
      fees: {
        on: feeOn.checked,
        kind: feeKind.value as ChangeKind,
        buildings: Math.max(0, Math.round(Number(feeBuildings.value) || 0)),
        units: Math.max(0, Math.round(Number(feeUnits.value) || 0)),
        subparcels: Math.max(0, Math.round(Number(feeSub.value) || 0)),
        reissue: feeReissue.checked,
        withData: feeData.checked,
      },
      plan: {
        szekhely: plSzekhely.value,
        iktatoszam: plIkt.value,
        megnevezes: plMegnev.value,
        igazolvany: plIg.value,
        minosites: plMin.value,
        hely: plHely.value,
        address: plAddr.checked,
        prefix: plPrefix.value.trim() || 'C',
        drawing: drawing.value,
        scale: plScale.value,
      },
      job: jobSel.value as JobKind,
      work: Object.fromEntries(WORK_FIELDS.map(([k]) => [k, workInputs.get(k)!.value])),
      owners: owners.value,
      raw,
    };
    storage.set(KEY, JSON.stringify(state));
    fillParcels();
    const st = areaStatement({
      coordinates: state.coords,
      before: state.before,
      after: state.after,
      annex: state.annex,
      scale: state.scale,
      kind: state.kind,
    });
    const bc = state.measured.trim()
      ? checkBoundary(parsePoints(state.coords).points, parseParcels(state.before, true, '').parcels, state.measured, { ...state.check, scale: state.scale })
      : null;
    const fees = state.fees.on
      ? feesSection({
          ...state.fees,
          before: st.before.length,
          after: st.after.length,
          areas: st.before.map((b) => b.registered ?? b.technical),
        })
      : null;
    const addr = state.plan.address ? addressPoints() : [];
    const parsedDrawing = parseDrawing(drawing.value, parsePoints(state.coords).points);
    const drawingIssues = parsedDrawing.issues;
    const subs = subsFor(parsedDrawing.elements, st);
    sections = [
      ...st.sections,
      ...(subs.section ? [subs.section] : []),
      ...(addr.length > 0 ? [addressSection(addr)] : []),
      ...(bc?.sections ?? []),
      ...(division?.sections ?? []),
      ...(fees ? [fees] : []),
    ];
    showIssues([...datNotes, ...st.issues, ...drawingIssues, ...subs.issues, ...(bc?.issues ?? []), ...(division?.result.issues ?? [])]);
    results.replaceChildren(...sections.map(renderSection));
    if (sections.length === 0) results.append(el('p', 'empty', 'Add meg a koordinátákat és a földrészleteket, vagy töltsd be a mintát.'));
    const errors = st.issues.filter((i) => i.level === 'error').length;
    const finalSum = st.after.reduce((s, a) => s + a.final, 0);
    status.textContent =
      st.before.length + st.after.length === 0
        ? ''
        : `${st.before.length} földrészlet előtte, ${st.after.length} utána · tulajdoni lapi összeg ${st.registeredSum} m²` +
          (st.after.length > 0 ? ` · végleges összeg ${finalSum} m²` : '') +
          (errors > 0 ? ` · ${errors} hiba` : ' · rendben');
    drawSketch(state);
    saveBtn.disabled = sections.length === 0;
    datSaveBtn.disabled = st.after.length === 0;
    lstBtn.disabled = st.before.length + st.after.length === 0;
  }

  async function openDat(f: File): Promise<void> {
    const d = readDat(await readText(f));
    datNotes = d.warnings.map((message) => ({
      level: 'warning' as const,
      message: `DAT: ${message}`,
    }));
    if (d.parcels.length === 0) {
      datNotes.unshift({
        level: 'error',
        message: `DAT: a(z) ${f.name} állományban nincs beolvasható földrészlet.`,
      });
      run();
      return;
    }
    dat = { name: f.name, data: d };
    // A meglévő alrészletek és épületek rajzelemként (a munka a jelenlegi állapotból indul).
    {
      const typeOf = (code: string) => (code === 'CA01' ? 'lakó' : code === 'CA02' ? 'üdülő' : 'gazdasági');
      const lines = [
        ...d.subs.map((x) => `alrészlet ; ${x.letter} ; ${landUseName(x.useCode) || 'kivett'} ; ${x.ring.join(' ')}`),
        ...d.buildings.map((b) => `épület ; ${typeOf(b.code)} ; ${b.ring.join(' ')} ; ${b.code}`),
      ];
      if (lines.length > 0) drawing.value = ['# a DAT meglévő alrészletei és épületei', ...lines].join('\n');
    }
    {
      const byId = new Map(d.points.map((q) => [q.id, q]));
      background = {
        parcels: d.parcels.map((q) => ({ hrsz: q.hrsz, ring: q.ring.map((id) => byId.get(id)!) })),
        // A DAT épületei rajzelemként kerülnek a munkalapra, a környezetben nem kell őket megismételni.
        buildings: [],
      };
    }
    const holes = d.parcels.filter((p) => p.holes.length > 0).map((p) => p.hrsz);
    if (holes.length > 0)
      datNotes.push({
        level: 'warning',
        message: `DAT: belső határos (lyukas) földrészlet(ek): ${holes.join(', ')} – a munkalap csak a külső határral számol.`,
      });
    datNotes.push({
      level: 'info',
      message: `DAT: ${f.name} – ${d.points.length} pont, ${d.parcels.length} földrészlet` + (d.title[1] ? ` (${d.title[1]})` : '') + '.',
    });
    const used = new Set([...d.parcels.flatMap((p) => p.ring), ...d.subs.flatMap((x) => x.ring), ...d.buildings.flatMap((b) => b.ring)]);
    coords.value = ['# pontszám  Y  X  (DAT)', ...d.points.filter((p) => used.has(p.id)).map((p) => `${p.id}  ${p.y.toFixed(2)}  ${p.x.toFixed(2)}`)].join(
      '\n',
    );
    before.value = ['# hrsz ; tulajdoni lapi terület [m²] ; pontok (DAT)', ...d.parcels.map((p) => `${p.hrsz} ; ${p.area ?? ''} ; ${p.ring.join(' ')}`)].join(
      '\n',
    );
    after.value = ['# hrsz ; pontok', ...d.parcels.map((p) => `${p.hrsz} ; ${p.ring.join(' ')}`)].join('\n');
    division = null;
    takeBtn.disabled = true;
    run();
  }

  /** A földhivatali csomag: a DXF földrészletei, a szöveges kimenetek nyilvántartott területeivel. */
  async function openOffice(list: File[]): Promise<void> {
    const texts: { name: string; text: string }[] = [];
    try {
      for (const f of list) {
        if (/\.zip$/i.test(f.name)) {
          for (const z of await readZip(await f.arrayBuffer())) if (/\.(dxf|txt)$/i.test(z.name)) texts.push({ name: z.name, text: decodeText(z.data) });
        } else
          texts.push({
            name: f.name,
            text: decodeText(new Uint8Array(await f.arrayBuffer())),
          });
      }
    } catch (e) {
      datNotes = [
        {
          level: 'error',
          message: `Földhivatali adatok: ${e instanceof Error ? e.message : String(e)}`,
        },
      ];
      run();
      return;
    }
    const dxfFile = texts.find((t) => /\.dxf$/i.test(t.name));
    const map: CadastralMap | null = dxfFile ? readCadastralDxf(dxfFile.text) : null;
    if (map) {
      const byId = new Map(map.points.map((q) => [q.id, q]));
      background = {
        parcels: map.parcels.map((q) => ({ hrsz: q.hrsz, ring: q.ring.map((id) => byId.get(id)!) })),
        buildings: map.buildings.map((b) => ({ layer: b.layer, ring: b.ring.map((q) => ({ id: '', ...q })) })),
      };
    }
    const regs: RegisteredParcel[] = mergeRegistered(texts.filter((t) => /\.txt$/i.test(t.name)).map((t) => readRegisteredAreas(t.text)));
    // A teljes térképkivágatra vonatkozó megjegyzések; a kiválasztott földrészletekre külön figyelmeztet.
    datNotes = (map?.warnings ?? []).map((message) => ({
      level: 'info' as const,
      message: `DXF: ${message}`,
    }));
    const pts = new Map<string, NamedPt>();
    const rows: { hrsz: string; area: number | null; ring: string[] }[] = [];
    const wanted = regs.length > 0 ? regs.map((r) => r.hrsz) : (map?.parcels.map((p) => p.hrsz) ?? []);
    for (const hrsz of [...new Set(wanted)]) {
      const reg = regs.find((r) => r.hrsz === hrsz);
      const cands = map?.parcels.filter((p) => p.hrsz === hrsz) ?? [];
      // Több sokszög esetén a nyilvántartott területhez legközelebbi.
      const geo = cands.sort((a, b) => Math.abs(a.computed - (reg?.area ?? a.computed)) - Math.abs(b.computed - (reg?.area ?? b.computed)))[0];
      if (geo) {
        for (const id of geo.ring)
          pts.set(
            id,
            map!.points.find((q) => q.id === id)!,
          );
        rows.push({ hrsz, area: reg?.area ?? null, ring: geo.ring });
        if (reg?.technical !== undefined && Math.abs(reg.technical - geo.computed) > 0.01)
          datNotes.push({
            level: 'warning',
            message: `${hrsz}: a DXF műszaki területe (${geo.computed.toFixed(2)} m²) eltér a földrészlet-információétól (${reg.technical.toFixed(2)} m²).`,
          });
      } else if (reg?.points) {
        for (const q of reg.points) pts.set(q.id, q);
        rows.push({ hrsz, area: reg.area, ring: reg.points.map((q) => q.id) });
      } else
        datNotes.push({
          level: 'warning',
          message: `${hrsz}: nincs geometria (sem a DXF-ben, sem a földrészlet-információban).`,
        });
    }
    const noName = rows.filter((r) => r.ring.some((id) => /^DXF\d+$/.test(id))).map((r) => r.hrsz);
    if (noName.length > 0)
      datNotes.push({
        level: 'warning',
        message: `Pontszám nélküli töréspont (DXF…) a földrészlet(ek)ben: ${noName.join(', ')}.`,
      });
    if (rows.length === 0) {
      datNotes.unshift({
        level: 'error',
        message: 'Földhivatali adatok: nem található földrészlet (DXF: *_FRSZ és HRSZ fólia, vagy Report.txt geometria).',
      });
      run();
      return;
    }
    const tech = rows.map((r) => polygonArea(r.ring.map((id) => pts.get(id)!)));
    datNotes.push({
      level: 'info',
      message:
        `Földhivatali adatok: ${texts.map((t) => t.name).join(', ')} – ${rows.length} földrészlet` +
        (regs.length > 0 ? ' (a szöveges kimenetek helyrajzi számai)' : ' (a DXF összes földrészlete)') +
        `, műszaki terület összesen ${tech.reduce((a, b) => a + b, 0).toFixed(2)} m².`,
    });
    dat = null;
    coords.value = ['# pontszám  Y  X  (földhivatali adatszolgáltatás)', ...[...pts.values()].map((p) => `${p.id}  ${p.y.toFixed(2)}  ${p.x.toFixed(2)}`)].join(
      '\n',
    );
    before.value = ['# hrsz ; tulajdoni lapi terület [m²] ; pontok', ...rows.map((r) => `${r.hrsz} ; ${r.area ?? ''} ; ${r.ring.join(' ')}`)].join('\n');
    after.value = ['# hrsz ; pontok', ...rows.map((r) => `${r.hrsz} ; ${r.ring.join(' ')}`)].join('\n');
    division = null;
    takeBtn.disabled = true;
    run();
  }

  /** A változás utáni földrészletek gyűrűi (a hiányos földrészlet kimarad). */
  function afterRings(): { hrsz: string; ring: NamedPt[] }[] {
    const pts = parsePoints(coords.value).points;
    return parseParcels(after.value, false, '')
      .parcels.filter((p) => p.points.every((id) => pts.has(id)))
      .map((p) => ({ hrsz: p.hrsz, ring: p.points.map((id) => pts.get(id)!) }));
  }

  function addressPoints(): AddressPoint[] {
    return generateAddressPoints(afterRings(), plPrefix.value.trim() || 'C');
  }

  function planMeta(): PlanMeta {
    const m = getMeta();
    return {
      keszito: m.keszitette,
      szekhely: plSzekhely.value,
      munkaszam: m.msz,
      telepules: m.telepules,
      fekves: m.fekves,
      iktatoszam: plIkt.value,
      megnevezes: plMegnev.value,
      igazolvany: plIg.value,
      minosites: plMin.value,
      hely: plHely.value,
      datum: m.datum,
    };
  }

  let planSvg = '';
  /** Az alrészletek a változás előtti és utáni földrészletek területére ráosztva. */
  function subsFor(elements: ReturnType<typeof parseDrawing>['elements'], st: ReturnType<typeof areaStatement>) {
    const pts = parsePoints(coords.value).points;
    const ring = (ids: string[]) => ids.map((id) => pts.get(id)!);
    const bDefs = parseParcels(before.value, true, '').parcels.filter((p) => p.points.every((id) => pts.has(id)));
    const beforeP = bDefs.map((p) => ({ hrsz: p.hrsz, ring: ring(p.points), area: p.registered ?? Math.round(st.before.find((b) => b.hrsz === p.hrsz)?.technical ?? 0) }));
    const afterP = afterRings().map((p) => ({ ...p, area: st.after.find((a) => a.hrsz === p.hrsz)?.final ?? 0 }));
    return subStatement(elements, beforeP, afterP);
  }

  const currentJob = () => JOBS[jobSel.value as JobKind];
  /** A választott méretarány (üres: automatikus). */
  const planScale = () => (plScale.value ? Number(plScale.value) : undefined);

  /** A vázrajz bemenete a munkalap mezőiből. */
  function planInput(): PlanInput {
    const pts = parsePoints(coords.value).points;
    const st = areaStatement({
      coordinates: coords.value,
      before: before.value,
      after: after.value,
      annex: Number(annexSel.value) as ToleranceAnnex,
      scale: scaleSel.value,
      kind: kindSel.value as ToleranceKind,
    });
    const ring = (ids: string[]) => ids.map((id) => pts.get(id)!);
    const bDefs = parseParcels(before.value, true, '').parcels.filter((p) => p.points.every((id) => pts.has(id)));
    const finals = new Map(st.after.map((a) => [a.hrsz, a.final]));
    const elements = parseDrawing(drawing.value, pts).elements;
    const subs = subsFor(elements, st);
    const mp = parseMeasured(measured.value).points;
    return {
      before: bDefs.map((p) => ({ hrsz: p.hrsz, ring: ring(p.points), area: p.registered ?? st.before.find((b) => b.hrsz === p.hrsz)?.technical })),
      after: afterRings().map((p) => ({ ...p, area: finals.get(p.hrsz) })),
      address: plAddr.checked ? addressPoints() : [],
      measured: new Set(mp.keys()),
      measuredPts: mp,
      drawing: elements,
      background,
      subs: { before: subs.before, after: subs.after },
    };
  }

  /* ---------- a rajz szerkesztése az előnézeten ---------- */
  type EditTool = 'none' | 'label' | 'dim' | 'symbol' | 'move' | 'delete';
  let editTool: EditTool = 'none';
  let dimStart: string | null = null;
  const undoStack: string[] = [];
  const editBar = el('div', 'plan-edit');
  editBar.id = 'pc-edit';
  const toolBtns: [EditTool, HTMLButtonElement][] = [
    ['label', button('pc-edit-label', 'Felirat', 'Felirat elhelyezése: kattints a rajzra, a Szöveg mező tartalma oda kerül')],
    ['dim', button('pc-edit-dim', 'Méret', 'Méretmegírás: kattints egymás után a két pontra')],
    ['symbol', button('pc-edit-symbol', 'Jel', 'Jelkulcsi jel elhelyezése (DAT1-M2): válaszd ki a jelet, és kattints a helyére')],
    ['move', button('pc-edit-move', 'Mozgatás', 'Kézzel felvett felirat vagy jel áthelyezése: fogd meg és húzd')],
    ['delete', button('pc-edit-delete', 'Törlés', 'Kézzel felvett felirat, méret vagy jel törlése: kattints rá')],
  ];
  const symSel = el('select');
  symSel.id = 'pc-edit-symbol-kind';
  const SYMBOL_GROUPS: [string, string][] = [
    ['A', 'Geodéziai pontok, határjelek'],
    ['B', 'Határok'],
    ['C', 'Épületek, tereptárgyak'],
    ['E', 'Vezetékek'],
    ['F', 'Vizek, kutak, aknák'],
    ['G', 'Domborzat'],
  ];
  for (const [g, title] of SYMBOL_GROUPS) {
    const og = el('optgroup');
    og.label = title;
    for (const s of SYMBOLS.filter((x) => x.code[5] === g)) og.append(new Option(`${s.key} – ${s.name} (${s.code})`, s.key));
    symSel.append(og);
  }
  symSel.value = 'villanyoszlop';
  const editText = input('pc-edit-text', 'Felirat szövege');
  const editKind = select('pc-edit-kind', [
    ['egyéb', 'egyéb'],
    ['utcanév', 'utcanév'],
    ['dűlőnév', 'dűlőnév'],
    ['házszám', 'házszám'],
    ['objektum', 'objektum'],
  ]);
  const editRot = input('pc-edit-rot', '0');
  editRot.type = 'number';
  editRot.step = '5';
  const undoBtn = button('pc-edit-undo', 'Visszavonás', 'Az utolsó rajzszerkesztés visszavonása');
  const editHint = el('span', 'hint');
  editHint.id = 'pc-edit-hint';
  const toolRow = el('div', 'pane-actions');
  const zoomSel = select('pc-edit-zoom', [
    ['1', '100%'],
    ['1.5', '150%'],
    ['2', '200%'],
    ['3', '300%'],
  ]);
  zoomSel.title = 'Az előnézet nagyítása a pontosabb elhelyezéshez';
  toolRow.append(el('span', 'label-text', 'Szerkesztés:'), ...toolBtns.map(([, b]) => b), undoBtn, zoomSel);
  /** Az előnézet nagyítása: a lap szélessége a szokásos 560 px többszöröse, görgethető dobozban. */
  const applyZoom = () => {
    const holder = planBox.querySelector<HTMLElement>('.plan-page');
    if (!holder) return;
    const z = Number(zoomSel.value);
    holder.style.maxWidth = z > 1 ? 'none' : '';
    holder.style.width = z > 1 ? `${560 * z}px` : '';
  };
  zoomSel.addEventListener('change', applyZoom);
  const fieldRow = el('div', 'grid3');
  fieldRow.append(labelled('Szöveg', editText), labelled('Fajta', editKind), labelled('Forgatás (°)', editRot));
  editBar.append(toolRow, fieldRow, labelled('Jelkulcsi jel', symSel), editHint);
  const EDIT_HINTS: Record<EditTool, string> = {
    none: 'Válassz eszközt. Minden szerkesztés sorként a „Rajzelemek” mezőbe kerül, ott is javítható.',
    label: 'Írd be a szöveget, majd kattints oda a rajzon, ahová a feliratot szánod.',
    dim: 'Kattints az első pontra, aztán a másodikra; a két pont közé a távolság kerül.',
    symbol: 'Válaszd ki a jelet, és kattints a helyére. 0° forgatásnál a jel a jelkulcs szerint áll: É-i irányban, a kapcsolójel, a fényakna, a négyzetes jelek a legközelebbi vonalhoz igazodva.',
    move: 'Fogd meg a kézzel felvett feliratot vagy jelet, és húzd a helyére.',
    delete: 'Kattints a törlendő kézi feliratra, méretre vagy jelre.',
  };
  const setTool = (t: EditTool) => {
    editTool = editTool === t ? 'none' : t;
    dimStart = null;
    for (const [k, b] of toolBtns) b.setAttribute('aria-pressed', String(k === editTool));
    editHint.textContent = EDIT_HINTS[editTool];
    planBox.dataset.tool = editTool;
  };
  for (const [k, b] of toolBtns) b.addEventListener('click', () => setTool(k));
  setTool('none');
  type PlanKind = 'change' | 'sketch' | 'site';
  const PLAN_TITLES: Record<PlanKind, string> = { change: 'Változási vázrajz', sketch: 'Mérési vázlat', site: 'Telekalakítási helyszínrajz' };
  let planKind: PlanKind = 'change';
  let planView: ReturnType<typeof renderPlan> | null = null;
  /** A Rajzelemek mező módosítása soronként, visszavonhatóan, majd a rajz frissítése. */
  const editDrawing = (fn: (lines: string[]) => string[]) => {
    undoStack.push(drawing.value);
    drawing.value = fn(drawing.value.split(/\r?\n/))
      .join('\n')
      .replace(/^\n+/, '');
    drawing.dispatchEvent(new Event('input'));
    showPlan(planKind, false);
  };
  undoBtn.addEventListener('click', () => {
    const prev = undoStack.pop();
    if (prev === undefined) return;
    drawing.value = prev;
    drawing.dispatchEvent(new Event('input'));
    showPlan(planKind, false);
  });
  const field = (s: string) => s.replace(/[;\r\n]/g, ',').trim();
  /** A kattintás helye a rajzlapon (mm). */
  const paperAt = (svgEl: SVGSVGElement, e: { clientX: number; clientY: number }) => {
    const p = svgEl.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svgEl.getScreenCTM()!.inverse());
  };
  /** A kattintáshoz legközelebbi pont (4 mm-en belül a rajzlapon). */
  const snap = (mx: number, my: number): string | null => {
    if (!planView) return null;
    let best: { id: string; d: number } | null = null;
    for (const p of parsePoints(coords.value).points.values()) {
      const q = planView.toPaper(p);
      const d = Math.hypot(q.x - mx, q.y - my);
      if (d < 4 && (!best || d < best.d)) best = { id: p.id, d };
    }
    return best?.id ?? null;
  };
  const lineOf = (target: EventTarget | null) => {
    const n = Number((target as Element | null)?.closest?.('[data-line]')?.getAttribute('data-line'));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  function wireEditor(holder: HTMLElement): void {
    const svgEl = holder.querySelector('svg');
    if (!svgEl || !planView) return;
    const view = planView;
    svgEl.addEventListener('click', (e) => {
      const at = paperAt(svgEl, e);
      if (editTool === 'label') {
        const text = field(editText.value);
        if (!text) {
          editHint.textContent = 'Előbb írd be a felirat szövegét a Szöveg mezőbe.';
          editText.focus();
          return;
        }
        const g = view.toGround(at.x, at.y);
        const rot = Number(editRot.value) || 0;
        editDrawing((ls) => [...ls, `felirat ; ${editKind.value} ; ${text} ; ${g.y.toFixed(2)} ${g.x.toFixed(2)}${rot ? ` ; ${rot}` : ''}`]);
      } else if (editTool === 'dim') {
        const id = snap(at.x, at.y);
        if (!id) {
          editHint.textContent = 'Nincs pont a kattintás közelében – kattints közvetlenül egy pontra.';
          return;
        }
        if (!dimStart || dimStart === id) {
          dimStart = id;
          editHint.textContent = `Első pont: ${id}. Kattints a második pontra.`;
          return;
        }
        const a = dimStart;
        dimStart = null;
        editDrawing((ls) => [...ls, `méret ; ${a} ${id}`]);
        editHint.textContent = EDIT_HINTS.dim;
      } else if (editTool === 'symbol') {
        const g = view.toGround(at.x, at.y);
        const rot = Number(editRot.value) || 0;
        editDrawing((ls) => [...ls, `jel ; ${symSel.value} ; ${g.y.toFixed(2)} ${g.x.toFixed(2)}${rot ? ` ; ${rot}` : ''}`]);
      } else if (editTool === 'delete') {
        const n = lineOf(e.target);
        if (n) editDrawing((ls) => ls.filter((_, i) => i !== n - 1));
      }
    });
    let drag: { n: number; node: Element; x0: number; y0: number; tx: number; ty: number; base: string } | null = null;
    svgEl.addEventListener('pointerdown', (e) => {
      if (editTool !== 'move') return;
      const n = lineOf(e.target);
      const node = (e.target as Element).closest('[data-line]');
      if (!n || !node || !/^\s*(felirat|jel)\s*;/i.test(drawing.value.split(/\r?\n/)[n - 1] ?? '')) return;
      const at = paperAt(svgEl, e);
      const px = node.getAttribute('data-px') ?? node.getAttribute('x');
      const py = node.getAttribute('data-py') ?? node.getAttribute('y');
      drag = { n, node, x0: at.x, y0: at.y, tx: Number(px), ty: Number(py), base: node.getAttribute('transform') ?? '' };
      svgEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    svgEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const at = paperAt(svgEl, e);
      drag.node.setAttribute('transform', `translate(${(at.x - drag.x0).toFixed(2)} ${(at.y - drag.y0).toFixed(2)}) ${drag.base}`);
    });
    svgEl.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      const at = paperAt(svgEl, e);
      if (Math.hypot(at.x - d.x0, at.y - d.y0) < 0.3) return;
      const g = view.toGround(d.tx + at.x - d.x0, d.ty + at.y - d.y0);
      editDrawing((ls) =>
        ls.map((l, i) => {
          if (i !== d.n - 1) return l;
          const f = l.split(';').map((s) => s.trim());
          // a hely mezője: felirat ; fajta ; szöveg ; HELY …, jel ; név ; HELY …
          f[/^jel$/i.test(f[0] ?? '') ? 2 : 3] = `${g.y.toFixed(2)} ${g.x.toFixed(2)}`;
          return f.join(' ; ');
        }),
      );
    });
  }

  function showPlan(kind: PlanKind, scroll = true): void {
    planKind = kind;
    const input = planInput();
    if (input.before.length + input.after.length === 0) return;
    const j = currentJob();
    const template = kind === 'sketch' ? j.sketch : kind === 'site' ? (j.siteplan ?? j.plan) : j.plan;
    const r = renderPlan(kind === 'sketch' ? 'sketch' : 'change', input, planMeta(), { template, job: j.id, scale: planScale() });
    planSvg = r.svg;
    planView = r;
    planBox.replaceChildren();
    const bar = el('div', 'pane-actions');
    const printBtn = button('pc-plan-print', 'Nyomtatás / PDF', 'A vázrajz nyomtatása vagy mentése PDF-be (A4 álló)');
    const svgBtn = button('pc-plan-svg', 'SVG mentése', 'A vázrajz mentése SVG rajzként');
    const closeBtn = button('pc-plan-close', 'Bezár', 'Az előnézet bezárása');
    bar.append(el('span', 'hint', `${PLAN_TITLES[kind]} – 1:${r.scale}${r.scale < r.autoScale ? ` (a rajz nem fér a keretbe, legalább 1:${r.autoScale} kell)` : ''}`), printBtn, svgBtn, closeBtn);
    const holder = el('div', 'plan-page');
    holder.innerHTML = r.svg;
    const scroller = el('div', 'plan-scroll');
    scroller.append(holder);
    planBox.append(bar, editBar, scroller);
    planBox.hidden = false;
    applyZoom();
    wireEditor(holder);
    printBtn.addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>${kind === 'change' ? 'Változási vázrajz' : 'Mérési vázlat'}</title>` +
          '<style>@page{size:A4 portrait;margin:0}html,body{margin:0}svg{display:block;width:210mm;height:297mm}</style></head><body>' +
          planSvg +
          '</body></html>',
      );
      w.document.close();
      w.focus();
      w.print();
    });
    svgBtn.addEventListener('click', () => download(kind === 'change' ? 'valtozasi_vazrajz.svg' : 'meresi_vazlat.svg', planSvg, 'image/svg+xml'));
    closeBtn.addEventListener('click', () => {
      planBox.hidden = true;
    });
    if (scroll) planBox.scrollIntoView({ block: 'start' });
  }

  function saveDxf(): void {
    const input = planInput();
    if (input.before.length + input.after.length === 0) return;
    const scale = renderPlan('change', input, planMeta(), { template: currentJob().plan, job: currentJob().id, scale: planScale() }).scale;
    const text = writeDxf(planEntities('change', input, scale, { template: currentJob().plan, job: currentJob().id }), scale);
    download('valtozasi_vazrajz.dxf', encodeWindows1250(text), 'application/octet-stream');
  }

  function saveCoordList(): void {
    const pts = parsePoints(coords.value).points;
    const attrs = parsePointAttrs(coords.value);
    const list = [...pts.values()].map((p) => ({ ...p, m: attrs.get(p.id)?.m ?? null, code: attrs.get(p.id)?.code ?? '' }));
    if (plAddr.checked) for (const a of addressPoints()) list.push({ id: a.id, y: a.y, x: a.x, m: null, code: a.code });
    if (list.length === 0) return;
    const r = coordinateList(list);
    download('koordinatajegyzek.txt', encodeWindows1250(r.text), 'application/octet-stream');
    sections = [...sections.filter((x) => !x.kind.startsWith('coord-list-')), ...r.sections];
    results.replaceChildren(...sections.map(renderSection));
  }

  /** A változás utáni állapot DAT-ja: földrészletek, alrészletek (BE), épületek (CA). */
  function buildDat(): { name: string; text: string } | null {
    const st = areaStatement({
      coordinates: coords.value,
      before: before.value,
      after: after.value,
      annex: Number(annexSel.value) as ToleranceAnnex,
      scale: scaleSel.value,
      kind: kindSel.value as ToleranceKind,
    });
    const pts = parsePoints(coords.value).points;
    const defs = parseParcels(after.value, false, '').parcels;
    const finals = new Map(st.after.map((a) => [a.hrsz, a.final]));
    const parcels = defs
      .filter((p) => p.points.every((id) => pts.has(id)) && finals.has(p.hrsz))
      .map((p) => {
        const src = dat?.data.parcels.find((q) => q.hrsz === p.hrsz);
        return {
          hrsz: p.hrsz,
          area: finals.get(p.hrsz)!,
          ring: p.points.map((id) => pts.get(id)!),
          template: src ? { table: src.table, record: src.record } : undefined,
        };
      });
    if (parcels.length === 0) return null;
    const elements = parseDrawing(drawing.value, pts).elements;
    const subs = subsFor(elements, st).after;
    const inside = (p: { y: number; x: number }, ring: { y: number; x: number }[]) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        if (a.x > p.x !== b.x > p.x && p.y < ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x) + a.y) c = !c;
      }
      return c;
    };
    const buildings = elements
      .filter((d): d is Extract<typeof d, { kind: 'building' }> => d.kind === 'building' && d.type !== 'old' && d.type !== 'wall')
      .map((d) => {
        const c = { y: d.ring.reduce((s, q) => s + q.y, 0) / d.ring.length, x: d.ring.reduce((s, q) => s + q.x, 0) / d.ring.length };
        return { hrsz: parcels.find((p) => inside(c, p.ring))?.hrsz ?? parcels[0]!.hrsz, code: d.code, ring: d.ring };
      });
    const base = (dat?.name ?? 'valtozas').replace(/\.[^.]*$/, '');
    const text = writeDat(parcels, {
      name: `${base}_valtozas`,
      date: new Date(),
      pointRecords: dat?.data.pointRecords,
      subs: subs.map((r) => ({ hrsz: r.hrsz, letter: r.letter, useCode: landUseCode(r.use), area: r.area, ring: r.ring })),
      buildings,
    });
    return { name: `${base}_valtozas`, text };
  }

  function saveDat(): void {
    const d = buildDat();
    // A DAT állomány az ITR-hez hasonlóan Windows-1250 kódolású.
    if (d) download(`${d.name}.dat`, encodeWindows1250(d.text), 'application/octet-stream');
  }

  /** A munka adatai a dokumentumokhoz. */
  function workData(): WorkData {
    const m = planMeta();
    const w = (k: WorkKey) => workInputs.get(k)!.value.trim();
    const hrsz = [...new Set([...parseParcels(before.value, true, '').parcels, ...parseParcels(after.value, false, '').parcels].map((p) => p.hrsz))];
    return {
      job: currentJob().id,
      keszito: m.keszito,
      szekhely: m.szekhely,
      munkaszam: m.munkaszam,
      telepules: m.telepules,
      fekves: m.fekves,
      iktatoszam: m.iktatoszam,
      hrsz,
      szomszedok: w('szomszedok'),
      megbizo: w('megbizo'),
      megbizoCim: w('megbizoCim'),
      hivatal: w('hivatal'),
      ugyfelkod: w('ugyfelkod'),
      okmany: w('okmany'),
      statisztikai: w('statisztikai'),
      email: w('email'),
      igazolvany: m.igazolvany,
      minosites: m.minosites,
      minosegtanusito: w('minosegtanusito'),
      muszer: w('muszer'),
      gyariszam: w('gyariszam'),
      leiras: '',
      feljegyzes: w('feljegyzes'),
      megjeloles: w('megjeloles'),
      idopont: w('idopont'),
      hely: m.hely,
      datum: m.datum,
      adatallomany: buildDat()?.name ?? '',
      telefon: w('telefon'),
      helyszin: w('helyszin'),
      vegzok: w('vegzok'),
      tulajdonosok: owners.value,
    };
  }

  /** A csomag tartalma: rajzok, DAT, területszámítás, jegyzékek, dokumentumok. */
  function packageParts(): PackageParts | null {
    const input = planInput();
    if (input.before.length + input.after.length === 0) return null;
    const j = currentJob();
    const meta = planMeta();
    const plan = renderPlan('change', input, meta, { template: j.plan, job: j.id, scale: planScale() });
    const sketch = renderPlan('sketch', input, meta, { template: j.sketch, job: j.id, scale: planScale() });
    const pts = parsePoints(coords.value).points;
    const attrs = parsePointAttrs(coords.value);
    const list = [...pts.values()].map((p) => ({ ...p, m: attrs.get(p.id)?.m ?? null, code: attrs.get(p.id)?.code ?? '' }));
    const addr = plAddr.checked ? addressPoints() : [];
    for (const a of addr) list.push({ id: a.id, y: a.y, x: a.x, m: null, code: a.code });
    const ringList = (text: string, withArea: boolean) =>
      parseParcels(text, withArea, '')
        .parcels.filter((p) => p.points.every((id) => pts.has(id)))
        .map((p) => ({ hrsz: p.hrsz, ring: p.points.map((id) => pts.get(id)!) }));
    const st = areaStatement({
      coordinates: coords.value,
      before: before.value,
      after: after.value,
      annex: Number(annexSel.value) as ToleranceAnnex,
      scale: scaleSel.value,
      kind: kindSel.value as ToleranceKind,
    });
    const subs = subsFor(input.drawing ?? [], st);
    const bc = measured.value.trim()
      ? checkBoundary(pts, parseParcels(before.value, true, '').parcels, measured.value, {
          kind: mapKindSel.value as MapKind,
          area: areaSel.value as Area,
          order: orderSel.value as PointOrder,
          marked: markedChk.checked,
          scale: scaleSel.value,
        })
      : null;
    const work = workData();
    const site = j.siteplan ? renderPlan('change', input, meta, { template: j.siteplan, job: j.id, scale: planScale() }) : null;
    const cl = coordinateList(list);
    // kitűzött pontok: a mért pontok közül azok, amelyeknek van nyilvántartott (terv) koordinátája
    const staked: StakedPoint[] = [...parseMeasured(measured.value).points.values()]
      .filter((m) => pts.has(m.id))
      .map((m) => ({ id: m.id, planY: pts.get(m.id)!.y, planX: pts.get(m.id)!.x, y: m.y, x: m.x }));
    return {
      work,
      siteplan: site && j.siteplan ? { svg: site.svg, dxf: writeDxf(planEntities('change', input, site.scale, { template: j.siteplan, job: j.id }), site.scale) } : undefined,
      coordSections: cl.sections,
      addressSections: addr.length > 0 ? [addressSection(addr)] : undefined,
      raw: raw ?? undefined,
      record: raw ? measurementRecord(work, recordRows(raw), raw.name, formatDms) : undefined,
      staked: j.id === 'setout' ? staked : undefined,
      buildingArea: j.id === 'building' ? buildingAreaText(input.drawing ?? []) : undefined,
      plan: { svg: plan.svg, dxf: writeDxf(planEntities('change', input, plan.scale, { template: j.plan, job: j.id }), plan.scale) },
      sketch: { svg: sketch.svg, dxf: writeDxf(planEntities('sketch', input, sketch.scale, { template: j.sketch, job: j.id }), sketch.scale) },
      dat: j.id === 'setout' ? undefined : buildDat()?.text,
      lstBefore: writeLst(ringList(before.value, true)),
      lstAfter: writeLst(ringList(after.value, false)),
      coordList: coordinateList(list).text,
      addressList: addr.length > 0 ? addr.map((a) => `${a.hrsz}\t${a.id}\t${a.y}\t${a.x}\t${a.code}`).join('\r\n') : undefined,
      measured: measured.value.trim() ? `${measured.value.trim()}\r\n\r\n${bc ? sectionsToText(bc.sections) : ''}` : undefined,
      subList: subs.after.length > 0 ? subs.after.map((r) => `${r.hrsz}\t${r.letter}\t${r.use}\t${r.area}`).join('\r\n') : undefined,
    };
  }

  function showIssues(list: Issue[]): void {
    issuesBox.replaceChildren();
    for (const i of list) {
      const d = el('div', `issue ${i.level}`);
      d.append(el('span', 'tag', i.level === 'error' ? 'Hiba' : i.level === 'warning' ? 'Figyelem' : 'Megjegyzés'), el('span', undefined, i.message));
      issuesBox.append(d);
    }
  }

  function drawSketch(state: Saved): void {
    const pts = parsePoints(state.coords).points;
    const polys = (text: string, withArea: boolean) =>
      parseParcels(text, withArea, '')
        .parcels.map((p) => ({
          hrsz: p.hrsz,
          pts: p.points.map((id) => pts.get(id)).filter((q): q is NamedPt => q !== undefined),
        }))
        .filter((p) => p.pts.length >= 3);
    const b = polys(state.before, true);
    const a = polys(state.after, false);
    const extra = division?.result.parts.map((p) => ({ hrsz: p.hrsz, pts: p.points })) ?? [];
    const all = [...b, ...a, ...extra].flatMap((p) => p.pts);
    sketch.replaceChildren();
    if (all.length === 0) return;
    const minY = Math.min(...all.map((p) => p.y));
    const maxY = Math.max(...all.map((p) => p.y));
    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const W = 520;
    const H = 300;
    const pad = 28;
    const k = Math.min((W - 2 * pad) / Math.max(maxY - minY, 1e-6), (H - 2 * pad) / Math.max(maxX - minX, 1e-6));
    const sx = (y: number) => pad + (y - minY) * k;
    const sy = (x: number) => H - pad - (x - minX) * k;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'A földrészletek vázlata');
    const poly = (p: { hrsz: string; pts: NamedPt[] }, cls: string) => {
      const g = document.createElementNS(ns, 'polygon');
      g.setAttribute('points', p.pts.map((q) => `${sx(q.y).toFixed(1)},${sy(q.x).toFixed(1)}`).join(' '));
      g.setAttribute('class', cls);
      svg.append(g);
      const cy = p.pts.reduce((s, q) => s + q.y, 0) / p.pts.length;
      const cx = p.pts.reduce((s, q) => s + q.x, 0) / p.pts.length;
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', sx(cy).toFixed(1));
      t.setAttribute('y', sy(cx).toFixed(1));
      t.setAttribute('class', `label ${cls}`);
      t.textContent = p.hrsz;
      svg.append(t);
    };
    b.forEach((p) => poly(p, 'before'));
    // Osztás előnézeténél az osztott földrészlet helyén a két rész látszik.
    const divided = division ? parcelSel.value : null;
    [...a.filter((p) => p.hrsz !== divided), ...extra].forEach((p) => poly(p, 'after'));
    const newIds = new Set(division?.result.newPoints.map((p) => p.id) ?? []);
    // A hosszú pontszámok közös előtagja (pl. „1-10_”) a rajzon elhagyható.
    const ids = [...new Set(all.map((p) => p.id))];
    let prefix =
      ids.length > 1
        ? ids.reduce((a, b) => {
            let i = 0;
            while (i < a.length && a[i] === b[i]) i++;
            return a.slice(0, i);
          })
        : '';
    prefix = prefix.slice(0, Math.max(prefix.lastIndexOf('_'), prefix.lastIndexOf('-')) + 1);
    const seen = new Set<string>();
    for (const p of all) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', sx(p.y).toFixed(1));
      c.setAttribute('cy', sy(p.x).toFixed(1));
      c.setAttribute('r', '3');
      c.setAttribute('class', newIds.has(p.id) ? 'pt new' : 'pt');
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', (sx(p.y) + 5).toFixed(1));
      t.setAttribute('y', (sy(p.x) - 5).toFixed(1));
      t.setAttribute('class', 'ptid');
      t.textContent = prefix && p.id.startsWith(prefix) ? p.id.slice(prefix.length) : p.id;
      svg.append(c, t);
    }
    if (prefix) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', '6');
      t.setAttribute('y', String(H - 6));
      t.setAttribute('class', 'ptid');
      t.textContent = `pontszám: ${prefix}…`;
      svg.append(t);
    }
    sketch.append(svg);
  }

  function divide(): void {
    division = null;
    takeBtn.disabled = true;
    try {
      const pts = parsePoints(coords.value).points;
      const def = parseParcels(before.value, true, '').parcels.find((p) => p.hrsz === parcelSel.value);
      if (!def) throw new Error('Válassz földrészletet a változás előtti listából.');
      const poly = def.points.map((id) => {
        const p = pts.get(id);
        if (!p) throw new Error(`Ismeretlen pont: ${id}.`);
        return p;
      });
      const area = Number(target.value.replace(',', '.'));
      if (!Number.isFinite(area)) throw new Error('Add meg a leválasztandó területet.');
      const names: [string, string] = [name1.value.trim() || `${def.hrsz}/1`, name2.value.trim() || `${def.hrsz}/2`];
      const pre = prefix.value.trim() || 'U';
      let first = 1;
      while (pts.has(`${pre}${first}`)) first++;
      const pa = pts.get(ptA.value.trim());
      let res: DivisionResult;
      let how: string;
      if (methodSel.value === 'parallel') {
        const pb = pts.get(ptB.value.trim());
        if (!pa || !pb) throw new Error('Add meg az A és a B pontot (a koordináták között szereplő pontszámmal).');
        res = divideParallel(poly, pa, pb, area, names, pre, first);
        how = `Osztóvonal párhuzamos a(z) ${pa.id}–${pb.id} egyenessel`;
      } else {
        if (!pa) throw new Error('Add meg az A töréspontot.');
        res = divideThroughVertex(poly, pa.id, area, names, pre, first);
        how = `Osztóvonal a(z) ${pa.id} törésponton át`;
      }
      division = { result: res, sections: divisionSection(def.hrsz, res, how) };
      takeBtn.disabled = false;
      run();
    } catch (e) {
      run();
      showIssues([
        {
          level: 'error',
          message: `Területosztás: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    }
  }

  function take(): void {
    if (!division) return;
    const r = division.result;
    const lines = r.newPoints.map((p) => `${p.id}  ${p.y.toFixed(2)}  ${p.x.toFixed(2)}`);
    if (lines.length > 0) coords.value = `${coords.value.replace(/\s*$/, '')}\n${lines.join('\n')}`;
    // A változás utáni listában az osztott földrészlet helyére a két rész kerül.
    const parent = parcelSel.value;
    const kept = after.value.split(/\r?\n/).filter((l) => l.replace(/#.*/, '').split(';')[0]!.trim() !== parent);
    const parts = r.parts.map((p) => `${p.hrsz} ; ${p.points.map((q) => q.id).join(' ')}`);
    after.value = [...kept.filter((l) => l.trim() !== ''), ...parts].join('\n');
    division = null;
    takeBtn.disabled = true;
    run();
  }

  annexSel.addEventListener('change', () => {
    fillScales();
    run();
  });
  for (const c of [scaleSel, kindSel, mapKindSel, areaSel, orderSel, markedChk, feeOn, feeKind, feeReissue, feeData]) c.addEventListener('change', run);
  for (const t of [coords, before, after, measured, feeBuildings, feeUnits, feeSub, plSzekhely, plIkt, plMegnev, plIg, plMin, plHely, plPrefix])
    t.addEventListener('input', run);
  drawing.addEventListener('input', run);
  plAddr.addEventListener('change', run);
  plScale.addEventListener('change', run);
  methodSel.addEventListener('change', () => {
    bLabel.hidden = methodSel.value !== 'parallel';
  });
  divBtn.addEventListener('click', divide);
  takeBtn.addEventListener('click', take);
  sampleBtn.addEventListener('click', () => {
    coords.value = SAMPLE.coords;
    before.value = SAMPLE.before;
    after.value = SAMPLE.after;
    division = null;
    dat = null;
    datNotes = [];
    background = undefined;
    takeBtn.disabled = true;
    run();
  });
  openBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    coords.value = await readText(f);
    run();
  });
  datBtn.addEventListener('click', () => datFile.click());
  datFile.addEventListener('change', async () => {
    const f = datFile.files?.[0];
    datFile.value = '';
    if (f) await openDat(f);
  });
  datSaveBtn.addEventListener('click', saveDat);
  planChangeBtn.addEventListener('click', () => showPlan('change'));
  planSketchBtn.addEventListener('click', () => showPlan('sketch'));
  planSiteBtn.addEventListener('click', () => showPlan('site'));
  const syncJobButtons = () => {
    planSiteBtn.hidden = !currentJob().siteplan;
  };
  syncJobButtons();
  owners.addEventListener('input', run);
  const showRaw = () => {
    rawInfo.textContent = raw ? `Nyers mérés: ${raw.name} – ${recordRows(raw).filter((r) => r.kind === 'station').length} álláspont, ${recordRows(raw).filter((r) => r.kind === 'obs').length} mérés.` : '';
    rawClear.hidden = !raw;
  };
  rawBtn.addEventListener('click', () => rawFile.click());
  rawFile.addEventListener('change', async () => {
    const f = rawFile.files?.[0];
    rawFile.value = '';
    if (!f) return;
    const text = await readText(f);
    const fmt = detectFieldFormat(text);
    if (!fmt) {
      datNotes = [{ level: 'error', message: `Nyers mérés: ${f.name} – ismeretlen formátum (FOIF MES, Leica GSI, GeoCalc AR, Sokkia SDR, Topcon GTS-7, RW5, Geodimeter).` }];
      run();
      return;
    }
    raw = { name: f.name, text };
    datNotes = [{ level: 'info', message: `Nyers mérés: ${f.name} – a mérési jegyzőkönyv a csomagba kerül.` }];
    showRaw();
    run();
  });
  rawClear.addEventListener('click', () => {
    raw = null;
    showRaw();
    run();
  });
  showRaw();
  coordListBtn.addEventListener('click', saveCoordList);
  jobSel.addEventListener('change', () => {
    // A vázrajz megnevezése a munka fajtája szerint (ha nem írták át).
    const names = JOB_LIST.map((j) => j.name);
    if (!plMegnev.value.trim() || names.includes(plMegnev.value.trim()) || plMegnev.value === DEFAULTS.plan.megnevezes) plMegnev.value = currentJob().name;
    feeKind.value = currentJob().fee;
    syncJobButtons();
    run();
  });
  for (const i of workInputs.values()) i.addEventListener('input', run);
  printAllBtn.addEventListener('click', () => {
    const parts = packageParts();
    if (!parts) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(printAll(parts));
    w.document.close();
    w.focus();
    w.print();
  });
  zipBtn.addEventListener('click', () => {
    const parts = packageParts();
    if (!parts) return;
    const files = buildPackage(parts);
    const name = `${(parts.work.munkaszam || 'munka').replace(/[^0-9A-Za-z]+/g, '_')}_${currentJob().id}.zip`;
    download(name, writeZip(files), 'application/zip');
    datNotes = [{ level: 'info', message: `Leadandó csomag: ${name} – ${files.length} állomány (${currentJob().folders.length} mappa).` }];
    run();
  });
  dxfBtn.addEventListener('click', saveDxf);
  stakeBtn.addEventListener('click', () => stakeFile.click());
  stakeFile.addEventListener('change', async () => {
    const f = stakeFile.files?.[0];
    stakeFile.value = '';
    if (!f) return;
    const text = await readText(f);
    const parsed = parseMeasured(text);
    measured.value = text.replace(/\s+$/, '');
    datNotes = [{ level: parsed.points.size > 0 ? 'info' : 'error', message: `Kitűzési jegyzőkönyv: ${f.name} – ${parsed.points.size} kitűzött pont.` }];
    run();
  });
  lstBtn.addEventListener('click', () => {
    const pts = parsePoints(coords.value).points;
    const list = (text: string, withArea: boolean) =>
      parseParcels(text, withArea, '')
        .parcels.filter((p) => p.points.every((id) => pts.has(id)))
        .map((p) => ({ hrsz: p.hrsz, ring: p.points.map((id) => pts.get(id)!) }));
    const ve = list(before.value, true);
    const vu = list(after.value, false);
    // Az ITR listái Windows-1250 kódolásúak.
    if (ve.length > 0) download('ve.lst', encodeWindows1250(writeLst(ve)), 'application/octet-stream');
    if (vu.length > 0) setTimeout(() => download('vu.lst', encodeWindows1250(writeLst(vu)), 'application/octet-stream'), 300);
  });
  officeBtn.addEventListener('click', () => officeFile.click());
  officeFile.addEventListener('change', async () => {
    const list = [...(officeFile.files ?? [])];
    officeFile.value = '';
    if (list.length > 0) await openOffice(list);
  });
  saveBtn.addEventListener('click', () => {
    if (sections.length > 0) download('teruletkimutatas.txt', sectionsToText(sections));
  });
  run();
}

function button(id: string, text: string, title: string): HTMLButtonElement {
  const b = el('button', undefined, text);
  b.type = 'button';
  b.id = id;
  b.title = title;
  return b;
}

function select(id: string, options: [string, string][]): HTMLSelectElement {
  const s = el('select');
  s.id = id;
  for (const [v, t] of options) s.append(new Option(t, v));
  return s;
}

function input(id: string, placeholder: string): HTMLInputElement {
  const i = el('input');
  i.id = id;
  i.placeholder = placeholder;
  i.spellcheck = false;
  return i;
}

function area(id: string, rows: number): HTMLTextAreaElement {
  const t = el('textarea');
  t.id = id;
  t.rows = rows;
  t.spellcheck = false;
  t.wrap = 'off';
  return t;
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label');
  l.append(el('span', 'label-text', text), control);
  return l;
}
