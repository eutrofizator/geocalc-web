import { JOBS, type JobKind } from './jobs';
import type { Section } from './types';

/**
 * A leadandó szöveges munkarészek A4-es, nyomtatható HTML oldalként, a 8/2018. (VI. 29.) AM rendelet
 * mellékletei szerinti tartalommal:
 * - 1. melléklet: földmérési és térképészeti adatigénylő lap (ingatlan-nyilvántartási célra);
 * - 3. melléklet: térképmásolat-megrendelő;
 * - 25. melléklet: helyszíni jegyzőkönyv a földrészlet kitűzéséről;
 * - 29. melléklet: műszaki leírás;
 * - 30. melléklet: vizsgálat és záradékolás iránti kérelem;
 * - az Fttv. 24. § (1) és a rendelet 6. § (4) szerinti értesítés a munkavégzésről; tartalomjegyzék.
 * A hatóság által kitöltendő részek üresen maradnak.
 */

export interface WorkData {
  job: JobKind;
  /** Készítő földmérő / vállalkozás. */
  keszito: string;
  szekhely: string;
  munkaszam: string;
  telepules: string;
  fekves: string;
  iktatoszam: string;
  hrsz: string[];
  /** A szomszédos földrészletek (kitűzésnél). */
  szomszedok: string;
  megbizo: string;
  megbizoCim: string;
  hivatal: string;
  ugyfelkod: string;
  okmany: string;
  statisztikai: string;
  email: string;
  igazolvany: string;
  minosites: string;
  minosegtanusito: string;
  muszer: string;
  gyariszam: string;
  /** A munka elvégzésének rövid leírása (ha üres, a munka fajtája szerinti szöveg). */
  leiras: string;
  /** Egyéb feljegyzések, eltérések (pl. a határpont-azonosítás eredménye). */
  feljegyzes: string;
  /** A határpontok megjelölése (pl. „fakaróval”, „vasbeton határkővel”). */
  megjeloles: string;
  /** A munkavégzés (kitűzés) időpontja. */
  idopont: string;
  hely: string;
  datum: string;
  /** A leadott adatállomány neve (DAT). */
  adatallomany: string;
  /** Telefonszám az értesítésen. */
  telefon?: string;
  /** A munkavégzés helyszíne (cím), az értesítésen. */
  helyszin?: string;
  /** A munkát végzők (név, földmérő ig. sz.), az értesítésen; üresen a készítő. */
  vegzok?: string;
  /** Az érintett és a szomszédos tulajdonosok soronként: név ; lakcím ; hrsz. */
  tulajdonosok?: string;
}

export interface Owner {
  name: string;
  address: string;
  hrsz: string;
}

/** A tulajdonosok sorai („név ; lakcím ; hrsz”, # után megjegyzés). */
export function parseOwners(text: string | undefined): Owner[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map((l) => {
      const [name = '', address = '', hrsz = ''] = l.split(';').map((s) => s.trim());
      return { name, address, hrsz };
    })
    .filter((o) => o.name !== '');
}

/** A munkával érintett földrészlet tulajdonosai, illetve a szomszédosak (a hrsz szerint). */
const ownersOf = (w: WorkData) => {
  const all = parseOwners(w.tulajdonosok);
  const own = new Set(w.hrsz);
  return { main: all.filter((o) => own.has(o.hrsz)), neighbours: all.filter((o) => !own.has(o.hrsz)) };
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dots = (s: string, n = 30) => (s.trim() ? esc(s) : '.'.repeat(n));

export const DOC_STYLE = `
@page { size: A4 portrait; margin: 16mm 15mm; }
/* a rajzok saját, margó nélküli lapon: a rajz maga tartalmazza a lapszéli margót */
@page drawing { size: A4 portrait; margin: 0; }
.drawing { page: drawing; width: 210mm; height: 296mm; overflow: hidden; }
.drawing svg { display: block; width: 210mm; height: 296mm; }
body { font: 10.5pt/1.35 Arial, Helvetica, sans-serif; color: #000; margin: 0; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
h1 { font-size: 15pt; text-align: center; margin: 6mm 0 4mm; letter-spacing: 0.5pt; }
h2 { font-size: 11pt; margin: 5mm 0 2mm; border-bottom: 0.3mm solid #000; }
.head { display: flex; justify-content: space-between; border: 0.3mm solid #000; padding: 2mm 3mm; font-size: 9.5pt; }
.head div { flex: 1; }
.head div + div { text-align: right; }
table { border-collapse: collapse; width: 100%; margin: 2mm 0; }
td, th { border: 0.2mm solid #000; padding: 1.2mm 2mm; vertical-align: top; text-align: left; }
th { background: #f0f0f0; width: 42%; font-weight: normal; }
.sign { display: flex; justify-content: space-between; margin-top: 14mm; }
.sign div { width: 45%; border-top: 0.2mm dotted #000; text-align: center; font-size: 9pt; padding-top: 1mm; }
.note { font-size: 9pt; margin-top: 4mm; }
.empty td { height: 7mm; }
table.grid th { width: auto; text-align: center; font-size: 9pt; }
table.grid td { font-size: 9pt; padding: 0.8mm 1.5mm; }
td.n { text-align: right; font-variant-numeric: tabular-nums; }
h1 small { font-size: 11pt; font-weight: normal; letter-spacing: 0; }
`;

function header(w: WorkData, title: string): string {
  return (
    `<div class="head"><div><b>${esc(w.keszito)}</b><br>${esc(w.szekhely)}<br>Munkaszám: ${esc(w.munkaszam)}</div>` +
    `<div><b>${esc(w.telepules)}</b><br>${esc(w.fekves)}<br>Iktatószám: ${esc(w.iktatoszam)}</div></div><h1>${title}</h1>`
  );
}

const hrszList = (w: WorkData) => w.hrsz.join(', ');
const signLine = (left: string, right: string) => `<div class="sign"><div>${left}</div><div>${right}</div></div>`;
const row = (k: string, v: string) => `<tr><th>${k}</th><td>${v}</td></tr>`;

/** 1. melléklet: adatigénylő lap ingatlan-nyilvántartási célra. */
export function dataRequest(w: WorkData): string {
  return (
    `<div class="page"><h1>FÖLDMÉRÉSI ÉS TÉRKÉPÉSZETI ADATOK IGÉNYLÉSE INGATLAN-NYILVÁNTARTÁSI CÉLRA</h1>` +
    `<table>${row('Adatszolgáltató szervezet', dots(w.hivatal))}${row('Iktatószám', '')}</table>` +
    `<h2>Az igénylő adatai</h2><table>` +
    row('Ügyfélkód', dots(w.ugyfelkod)) +
    row('Név', esc(w.keszito)) +
    row('Cím / székhely', esc(w.szekhely)) +
    row('Személyazonosító okmány megnevezése és száma', dots(w.okmany)) +
    row('Statisztikai azonosító számjel', dots(w.statisztikai)) +
    row('Földmérési jogosultság igazolása', w.igazolvany ? `földmérő igazolvány: ${esc(w.igazolvany)}` : dots('')) +
    row('Elektronikus kapcsolattartás e-mail-címe', dots(w.email)) +
    `</table><h2>A költségvállaló adatai (ha nem azonos az igénylővel)</h2><table>` +
    row('Név', esc(w.megbizo)) +
    row('Cím / székhely', esc(w.megbizoCim)) +
    row('Statisztikai azonosító számjel', '') +
    `</table><h2>Az igényelt adatok</h2><table>` +
    row('Település (kerület)', esc(w.telepules)) +
    row('Fekvés', esc(w.fekves)) +
    row('Helyrajzi szám(ok)', esc(hrszList(w))) +
    row('A terület körbeírása', '') +
    row('Az adatigénylés célja', esc(JOBS[w.job].label.toLowerCase())) +
    `</table><h2>Az adatszolgáltató tölti ki</h2><table><tr><th style="width:auto">Sorszám</th><th style="width:auto">Szolgáltatáskód</th><th style="width:auto">Megnevezés</th><th style="width:auto">Mennyiség</th><th style="width:auto">Egységár</th><th style="width:auto">Összár</th></tr>` +
    `<tr class="empty"><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr class="empty"><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>` +
    `<p class="note">Az adatigénylés átvételének dátuma: ................ &nbsp; Az adatigénylésre vonatkozó jogosultságot ellenőriztem. ................ (ügyintéző)</p>` +
    `<p>Az adatigénylés dátuma: ${esc(w.datum)}</p>` +
    signLine('a kérelmező aláírása', 'az adatátvevő aláírása') +
    `<p class="note">Az ingatlan-nyilvántartás tartalmában változást eredményező földmérési munkákhoz, valamint a kitűzési munkákhoz igényelt földmérési és térképészeti állami alapadatok csak hitelesítve szolgáltathatók!</p></div>`
  );
}

/** 3. melléklet: térképmásolat-megrendelő. */
export function mapCopyOrder(w: WorkData): string {
  return (
    `<div class="page"><h1>TÉRKÉPMÁSOLAT MEGRENDELŐ</h1>` +
    `<table>${row('Adatszolgáltató szervezet', dots(w.hivatal))}${row('Iktatószám', '')}</table>` +
    `<h2>Az igénylő adatai</h2><table>` +
    row('Ügyfélkód', dots(w.ugyfelkod)) +
    row('Név', esc(w.keszito)) +
    row('Cím / székhely', esc(w.szekhely)) +
    row('Személyazonosító okmány megnevezése és száma', dots(w.okmany)) +
    row('Statisztikai azonosító számjel', dots(w.statisztikai)) +
    `</table><h2>A költségvállaló adatai (ha nem azonos az igénylővel)</h2><table>` +
    row('Név', esc(w.megbizo)) +
    row('Cím / székhely', esc(w.megbizoCim)) +
    `</table><h2>Az igényelt adatok</h2><table>` +
    row('Település (kerület)', esc(w.telepules)) +
    row('Fekvés', esc(w.fekves)) +
    row('Helyrajzi szám(ok) és darabszám', `${esc(hrszList(w))} (${w.hrsz.length} db)`) +
    row('Az adatigénylés célja', esc(JOBS[w.job].label.toLowerCase())) +
    row('Szemle / teljes másolat', 'teljes másolat') +
    `</table><h2>Az adatszolgáltató tölti ki</h2><table><tr class="empty"><td></td><td></td><td></td><td></td><td></td></tr></table>` +
    `<p class="note">A személyazonosságot / képviseleti jogosultságot ellenőriztem. ................ (ügyintéző)</p>` +
    `<p>A térképmásolat-igénylés dátuma: ${esc(w.datum)}</p>` +
    signLine('a kérelmező aláírása', 'az átvevő aláírása') +
    `</div>`
  );
}

const DEFAULT_DESCRIPTION: Record<JobKind, (w: WorkData) => string> = {
  setout: (w) =>
    `A(z) ${hrszList(w)} helyrajzi számú földrészlet határpontjait a földhivatali adatszolgáltatás alapján, a meglévő alappontokra támaszkodva ${w.muszer || 'mérőállomással'} tűztem ki. A kitűzött pontokat ${w.megjeloles || '…'} jelöltem meg, a kitűzés helyességét ellenőrző méréssel igazoltam.`,
  subdivision: (w) =>
    `A(z) ${hrszList(w)} helyrajzi számú földrészlet(ek) telekalakítási munkáját a földhivatali adatszolgáltatás alapján végeztem. A határpontok azonosítását helyszíni méréssel (${w.muszer || 'mérőállomás'}) végeztem, az új határpontokat ${w.megjeloles || '…'} jelöltem meg. A területszámítás koordinátákból, a végleges területek területarányos ráosztással készültek.`,
  building: (w) =>
    `A(z) ${hrszList(w)} helyrajzi számú földrészleten álló épület feltüntetéséhez az épület töréspontjait helyszíni méréssel (${w.muszer || 'mérőállomás'}) határoztam meg, a határpontok azonosításával együtt. Az épület a változási vázrajzon és a DAT állományban szerepel.`,
  landuse: (w) =>
    `A(z) ${hrszList(w)} helyrajzi számú földrészlet művelési ág változását helyszíni méréssel (${w.muszer || 'mérőállomás'}) felmértem; az alrészlet-határokat és a területeket koordinátákból számítottam, a földrészlet területére ráosztva.`,
};

/** 29. melléklet: műszaki leírás. */
export function technicalReport(w: WorkData): string {
  return (
    `<div class="page">${header(w, 'MŰSZAKI LEÍRÁS')}<table>` +
    row('1. A munka megnevezése', `${esc(JOBS[w.job].name)} – ${esc(hrszList(w))} hrsz.`) +
    row('2. Megbízó neve és címe', `${dots(w.megbizo)}${w.megbizoCim ? `, ${esc(w.megbizoCim)}` : ''}`) +
    row('3. Felhasznált alapadatok', `ingatlan-nyilvántartási célú földmérési adatszolgáltatás, iktatószám: ${dots(w.iktatoszam)}`) +
    row('4. A mérőműszer típusa és gyári száma', `${dots(w.muszer)} &nbsp; gyári szám: ${dots(w.gyariszam, 12)}`) +
    row('5. A munka elvégzésének rövid leírása', esc(w.leiras || DEFAULT_DESCRIPTION[w.job](w))) +
    row('6. Egyéb feljegyzés', esc(w.feljegyzes) || '–') +
    row('7. Tapasztalt eltérések, dokumentációhivatkozások', '–') +
    row('8. Minőségtanúsító neve, ingatlanrendező földmérő minősítés száma', `${dots(w.minosegtanusito)} &nbsp; ${esc(w.minosites)}`) +
    `</table><p>Készült: ${esc(w.hely)} ${esc(w.datum)}</p>` +
    signLine(`készítő (${esc(w.keszito)}, ig. sz.: ${esc(w.igazolvany)})`, 'minőségtanúsító') +
    `</div>`
  );
}

/** 30. melléklet: vizsgálat és záradékolás iránti kérelem. */
export function clauseRequest(w: WorkData): string {
  return (
    `<div class="page"><p>Tisztelt ${dots(w.hivatal)}!</p>` +
    `<p>Alulírott ${esc(w.keszito)} kérem, az általam készített változási munkarészeket vizsgálat és záradékolás céljából átvenni szíveskedjen.</p>` +
    `<p>Soron kívüli eljárást kérek: igen / nem</p><table>` +
    row('Munka megnevezése – település és fekvés', `${esc(w.telepules)}, ${esc(w.fekves)}`) +
    row('Változás fajtája', esc(JOBS[w.job].name)) +
    row('Hrsz.', esc(hrszList(w))) +
    row('Térképtári adatszolgáltatás – típusa, neve, iktatószáma', `digitális adatszolgáltatás; ${dots(w.iktatoszam)}`) +
    row('Záradékolásra leadott adatállomány – típusa, neve, formátuma', `digitális szerkesztés GEOkalkulus programban; ${esc(w.adatallomany)}; DAT`) +
    row('Adathordozó', 'elektronikus') +
    row('Adatszolgáltatási és záradékolási számla száma', '') +
    row('Melléklet', `1 db ${esc(JOBS[w.job].label.toLowerCase())} munkarész dossziéban`) +
    row('A záradékolt vázrajzok megküldési címe', `${esc(w.keszito)}, ${esc(w.szekhely)}`) +
    row('Leadás dátuma', esc(w.datum)) +
    `</table>` +
    signLine('átadó', 'átvevő') +
    `</div>`
  );
}

/** 25. melléklet: helyszíni jegyzőkönyv a földrészlet kitűzéséről. */
export function setoutMinutes(w: WorkData): string {
  const decl = 'A kitűzés jelenlétemben megtörtént, a kitűzött határpontokat elfogadom* – nem fogadom el*.';
  const { main, neighbours } = ownersOf(w);
  // a szomszédok a tulajdonosok közül, különben a „Szomszédos hrsz-ek” mezőből
  const others = neighbours.length > 0
    ? neighbours.map((o) => `${esc(o.name)}${o.hrsz ? ` (${esc(o.hrsz)} hrsz.)` : ''}`)
    : w.szomszedok
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((h) => `${esc(h)} hrsz.`);
  const dotted = `<p>${'.'.repeat(150)}</p>`;
  return (
    `<div class="page">${header(w, `HELYSZÍNI JEGYZŐKÖNYV<br><small>a ${esc(hrszList(w))} helyrajzi számú földrészlet kitűzéséről</small>`)}` +
    `<table>${row('A megbízó neve és lakcíme', `${dots(w.megbizo)}${w.megbizoCim ? `, ${esc(w.megbizoCim)}` : ''}`)}` +
    `${row('A kitűzött földrészlet tulajdonosa (képviselője)', main.length > 0 ? main.map((o) => esc(o.name)).join(', ') : dots(''))}</table>` +
    `<h2>Nyilatkozatok</h2><p><b>A kitűzött földrészlet tulajdonosának nyilatkozata:</b></p><p>${decl}</p>` +
    signLine('', 'a földrészlet tulajdonosának aláírása') +
    `<p><b>A kitűzéssel érintett földrészlettel szomszédos ingatlanok tulajdonosainak – kitűzéssel kapcsolatos – nyilatkozatai:</b></p>` +
    (others.length > 0 ? others : ['', '']).map((o) => `<p>${o ? `${o}: ` : ''}${decl}</p>${signLine('', 'a szomszédos ingatlan tulajdonosának aláírása')}`).join('') +
    `<h2>A földmérési munkára vonatkozó egyéb nyilatkozatok és megállapítások</h2>${dotted.repeat(4)}` +
    `<p class="note">* A megfelelő rész aláhúzandó!</p>` +
    `<p>${esc(w.telepules)}, ${dots(w.idopont || w.datum)}</p>` +
    signLine(`készítő: ${esc(w.keszito)}, földmérő ig. száma: ${dots(w.igazolvany, 10)}`, `ing. rend. min. sz.: ${dots(w.minosites, 10)}`) +
    `</div>`
  );
}

/**
 * Értesítés a munkavégzésről (Fttv. 24. § (1), 8/2018. AM rendelet 6. § (4)): tulajdonosonként egy
 * oldal, a címzettel; ha nincs megadva tulajdonos, egy általános „Tisztelt Tulajdonos!” levél.
 */
export function workNotice(w: WorkData): string {
  const setout = w.job === 'setout';
  const all = parseOwners(w.tulajdonosok);
  const recipients: (Owner | null)[] = all.length > 0 ? all : [null];
  const workers = w.vegzok?.trim() || `${w.keszito} (földmérő igazolvány szám: ${w.igazolvany || '…'})`;
  const what = setout
    ? `a(z) ${esc(w.telepules)}, ${esc(hrszList(w))} helyrajzi szám alatt nyilvántartott földrészlet határpontjainak kitűzési munkálatait elvégezzük`
    : `a(z) ${esc(w.telepules)}, ${esc(hrszList(w))} helyrajzi számú földrészlet(ek)en ${esc(JOBS[w.job].label.toLowerCase())} céljából földmérési munkát végzünk`;
  return recipients
    .map(
      (o) =>
        `<div class="page">` +
        `<table>${row('Címzett', o ? `${esc(o.name)}${o.address ? `, ${esc(o.address)}` : ''}` : dots(''))}${row('Küldő', `${esc(w.keszito)}${w.szekhely ? `, ${esc(w.szekhely)}` : ''}`)}</table>` +
        `<h1>ÉRTESÍTÉS<br><small>${setout ? 'a kitűzési munkavégzésről' : 'földmérési munkavégzésről'} (8/2018. (VI. 29.) AM rendelet 6. § (4) bek.)</small></h1>` +
        `<p>Tisztelt ${o ? esc(o.name) : 'Tulajdonos'}!</p>` +
        `<p>Ezúton értesítjük, hogy ${what}.</p>` +
        `<table>${row('A munkavégzés időpontja', dots(w.idopont))}${row('Helyszíne', w.helyszin?.trim() ? esc(w.helyszin) : `${esc(w.telepules)}, ${esc(hrszList(w))} hrsz.`)}${row('Megbízó', dots(w.megbizo))}</table>` +
        `<p>A munkát a 8/2018. (VI. 29.) AM rendelet 6. § (4) bekezdése alapján végezzük, amely előírja, hogy a ${setout ? 'kitűzési munkálatokról' : 'földmérési munkálatokról'} az érintett tulajdonosokat, illetve jogosultakat előzetesen, igazolható módon értesíteni kell.</p>` +
        `<p>A ${setout ? 'kitűzést' : 'munkát'} ${esc(workers)} végzi.${setout ? ' Kérjük szíves jelenlétét, hogy a kitűzött határpontokat megtekinthesse és nyilatkozhasson.' : ''}</p>` +
        `<p>Amennyiben kérdése vagy észrevétele van a ${setout ? 'kitűzéssel' : 'munkával'} kapcsolatban, kérjük, vegye fel velünk a kapcsolatot az alábbi elérhetőségeken:</p>` +
        `<table>${row('E-mail', dots(w.email, 20))}${row('Telefon', dots(w.telefon ?? '', 20))}</table>` +
        `<p>Kelt: ${esc(w.hely)} ${esc(w.datum)}</p>` +
        signLine('', `aláírás (${esc(w.keszito)})`) +
        `</div>`,
    )
    .join('');
}

/** A kitűzött pont: a tervezett (nyilvántartott) és a kitűzött (bemért) koordináta. */
export interface StakedPoint {
  id: string;
  planY: number;
  planX: number;
  y: number;
  x: number;
}

/** Kitűzési jegyzőkönyv: a tervezett és a kitűzött koordináták, az eltérések. */
export function setoutReport(w: WorkData, pts: StakedPoint[]): string {
  const f = (n: number, d = 3) => n.toFixed(d);
  const rows = pts
    .map((p) => {
      const dy = p.y - p.planY;
      const dx = p.x - p.planX;
      return `<tr><td>${esc(p.id)}</td><td class="n">${f(p.planY, 2)}</td><td class="n">${f(p.planX, 2)}</td><td class="n">${f(p.y)}</td><td class="n">${f(p.x)}</td><td class="n">${f(dy)}</td><td class="n">${f(dx)}</td><td class="n">${f(Math.hypot(dy, dx))}</td></tr>`;
    })
    .join('');
  const max = pts.reduce((m, p) => Math.max(m, Math.hypot(p.y - p.planY, p.x - p.planX)), 0);
  return (
    `<div class="page">${header(w, `KITŰZÉSI JEGYZŐKÖNYV<br><small>a ${esc(hrszList(w))} helyrajzi számú földrészlet kitűzéséről</small>`)}` +
    `<table>${row('A kitűzés időpontja', dots(w.idopont || w.datum))}${row('Mérőműszer típusa, gyári száma', `${dots(w.muszer)} &nbsp; ${esc(w.gyariszam)}`)}${row('A kitűzött pontok megjelölése', dots(w.megjeloles))}</table>` +
    `<table class="grid"><tr><th>Pontszám</th><th>Terv Y [m]</th><th>Terv X [m]</th><th>Kitűzött Y [m]</th><th>Kitűzött X [m]</th><th>dY [m]</th><th>dX [m]</th><th>Eltérés [m]</th></tr>${rows || '<tr><td colspan="8">Nincs kitűzött pont.</td></tr>'}</table>` +
    `<p>Kitűzött pontok száma: ${pts.length}; a legnagyobb eltérés: ${f(max)} m. Eltérés = kitűzött − terv.</p>` +
    `<p>${esc(w.hely)} ${esc(w.datum)}</p>` +
    signLine(`készítő: ${esc(w.keszito)}, földmérő ig. száma: ${dots(w.igazolvany, 10)}`, '') +
    `</div>`
  );
}

/** A mérési jegyzőkönyv egy sora (a nyers mérésből: Hz, Zi fokban, a távolságok méterben). */
export interface RecordRow {
  kind: 'station' | 'obs';
  id: string;
  hz: number | null;
  zi: number | null;
  tf: number | null;
  tv: number | null;
  mj: number | null;
  mm: number | null;
  code: string;
  tvet: number | null;
  dm: number | null;
}

/** Mérési jegyzőkönyv a nyers mérésből: álláspontonként a mért irányok és távolságok. */
export function measurementRecord(w: WorkData, rows: RecordRow[], source: string, formatAngle: (deg: number) => string): string {
  const a = (n: number | null) => (n === null ? '' : formatAngle(n));
  const d = (n: number | null, k = 3) => (n === null ? '' : n.toFixed(k));
  const blocks: string[] = [];
  let cur: string[] | null = null;
  let head = '';
  const flush = () => {
    if (cur) blocks.push(`<h2>${head}</h2><table class="grid"><tr><th>Psz</th><th>Hz</th><th>Zi</th><th>Tf</th><th>Tv</th><th>Mj</th><th>Jelleg</th><th>Tvet</th><th>dM</th></tr>${cur.join('')}</table>`);
  };
  for (const r of rows) {
    if (r.kind === 'station') {
      flush();
      cur = [];
      head = `Álláspont: ${esc(r.id)} (műszermagasság = ${d(r.mm)})`;
    } else {
      if (!cur) {
        cur = [];
        head = 'Álláspont: –';
      }
      cur.push(`<tr><td>${esc(r.id)}</td><td class="n">${a(r.hz)}</td><td class="n">${a(r.zi)}</td><td class="n">${d(r.tf)}</td><td class="n">${d(r.tv)}</td><td class="n">${d(r.mj)}</td><td>${esc(r.code)}</td><td class="n">${d(r.tvet)}</td><td class="n">${d(r.dm)}</td></tr>`);
    }
  }
  flush();
  return (
    `<div class="page">${header(w, `MÉRÉSI JEGYZŐKÖNYV${w.job === 'setout' ? ' KITŰZÉSRŐL' : ''}`)}` +
    `<table>${row('Vetület', 'EOV')}${row('Magasság', 'Balti')}${row('Mérőeszköz típusa, száma', `${dots(w.muszer)} &nbsp; ${esc(w.gyariszam)}`)}${row('Nyers mérés', esc(source))}</table>` +
    (blocks.join('') || '<p>Nincs beolvasott nyers mérés.</p>') +
    `<p class="note">Hz, Zi: fok-perc-másodperc; Tf: ferde, Tv: vízszintes, Tvet: vetületi távolság; Mj: jelmagasság; dM: magasságkülönbség [m].</p>` +
    signLine(`készítő: ${esc(w.keszito)}`, '') +
    `</div>`
  );
}

/** Táblázatos munkarész (koordinátajegyzék, címkoordináták, területszámítás) nyomtatható oldalon. */
export function sectionsPage(w: WorkData, title: string, sections: Section[]): string {
  const tables = sections
    .map(
      (s) =>
        `<h2>${esc(s.title)}</h2><table class="grid"><tr>${s.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>` +
        s.rows.map((r) => `<tr>${r.cells.map((c) => `<td${/^-?[\d.]+$/.test(c) ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('') +
        `</table>${(s.footer ?? []).map((t) => `<p class="note">${esc(t)}</p>`).join('')}`,
    )
    .join('');
  return `<div class="page">${header(w, esc(title))}${tables}<p>${esc(w.hely)} ${esc(w.datum)}</p>${signLine(`készítő: ${esc(w.keszito)}`, '')}</div>`;
}

/** Tartalomjegyzék a csomag mappái szerint, mappánként az adatállományok nevével. */
export function tableOfContents(w: WorkData, files: Record<string, string[]> = {}): string {
  const items = JOBS[w.job].folders
    .map((f) => {
      const [, no, name] = /^(\d+)_(.*)$/.exec(f) ?? [f, '', f];
      return `<tr><td>${esc(no ?? '')}.</td><td>${esc(name ?? f)}</td><td>${(files[f] ?? []).map(esc).join('<br>')}</td></tr>`;
    })
    .join('');
  return (
    `<div class="page">${header(w, `TARTALOMJEGYZÉK<br><small>${esc(JOBS[w.job].label)} – ${esc(hrszList(w))} hrsz.</small>`)}` +
    `<table class="grid"><tr><th>Fsz.</th><th>Munkarész megnevezése</th><th>Munkarész adatállományai</th></tr>${items}</table></div>`
  );
}

/** Önálló HTML állomány egy vagy több oldallal (a csomagba és a nyomtatáshoz). */
export function htmlDocument(title: string, pages: string[]): string {
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_STYLE}</style></head><body>${pages.join('')}</body></html>`;
}

/** Egy SVG rajz A4-es nyomtatható HTML-be ágyazva. */
export function svgDocument(title: string, svg: string): string {
  return (
    `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>@page{size:A4 portrait;margin:0}html,body{margin:0}svg{display:block;width:210mm;height:297mm}</style></head><body>${svg}</body></html>`
  );
}
