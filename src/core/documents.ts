import { JOBS, type JobKind } from './jobs';

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
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dots = (s: string, n = 30) => (s.trim() ? esc(s) : '.'.repeat(n));

export const DOC_STYLE = `
@page { size: A4 portrait; margin: 16mm 15mm; }
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
  const decl = '„A kitűzés jelenlétemben megtörtént, a kitűzött határpontokat elfogadom – nem fogadom el.”';
  const neighbours = w.szomszedok
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    `<div class="page">${header(w, `HELYSZÍNI JEGYZŐKÖNYV a ${esc(hrszList(w))} hrsz.-ú földrészlet(ek) kitűzéséről`)}` +
    `<table>${row('Megbízó neve és lakcíme', `${dots(w.megbizo)}${w.megbizoCim ? `, ${esc(w.megbizoCim)}` : ''}`)}</table>` +
    `<h2>A kitűzött földrészlet tulajdonosának nyilatkozata</h2><p>${decl}</p>` +
    signLine('tulajdonos', 'tulajdonos') +
    `<h2>A szomszédos ingatlanok tulajdonosainak nyilatkozata</h2><p>${decl}</p>` +
    (neighbours.length > 0 ? neighbours : ['', '']).map((h) => `<p>${h ? `${esc(h)} hrsz.:` : 'hrsz.: ............'}</p>${signLine('tulajdonos', 'tulajdonos')}`).join('') +
    `<p>Kelt: ${esc(w.telepules)}, ${dots(w.idopont || w.datum)}</p>` +
    signLine(`készítő (${esc(w.keszito)}, ig. sz.: ${esc(w.igazolvany)})`, `ingatlanrendező földmérő minősítés: ${esc(w.minosites)}`) +
    `</div>`
  );
}

/** Értesítés a munkavégzésről az érintett és a szomszédos tulajdonosoknak (Fttv. 24. § (1), 8/2018. AM r. 6. § (4)). */
export function workNotice(w: WorkData): string {
  return (
    `<div class="page">${header(w, 'ÉRTESÍTÉS FÖLDMÉRÉSI MUNKAVÉGZÉSRŐL')}` +
    `<p>Tisztelt Tulajdonos!</p>` +
    `<p>Értesítem, hogy a(z) ${esc(w.telepules)} ${esc(hrszList(w))} helyrajzi számú földrészlet(ek)en ${esc(JOBS[w.job].label.toLowerCase())} céljából földmérési munkát végzek.</p>` +
    `<table>${row('A munkavégzés időpontja', dots(w.idopont))}${row('A munkavégzés helye', `${esc(w.telepules)}, ${esc(hrszList(w))} hrsz.`)}${row('Megbízó', dots(w.megbizo))}${row('A munkát végző földmérő', `${esc(w.keszito)}, földmérő ig. sz.: ${esc(w.igazolvany)}`)}${row('Elérhetőség', `${esc(w.szekhely)}${w.email ? `, ${esc(w.email)}` : ''}`)}</table>` +
    `<p>A kitűzésnél kérem szíves jelenlétét, hogy a kitűzött határpontokat megtekinthesse és nyilatkozhasson.</p>` +
    `<p>Kelt: ${esc(w.hely)} ${esc(w.datum)}</p>` +
    signLine('', `${esc(w.keszito)}`) +
    `</div>`
  );
}

/** Tartalomjegyzék a csomag mappái szerint. */
export function tableOfContents(w: WorkData): string {
  const items = JOBS[w.job].folders.map((f) => `<tr><td>${esc(f.replace(/^(\d+)_/, '$1. '))}</td></tr>`).join('');
  return `<div class="page">${header(w, 'TARTALOMJEGYZÉK')}<table>${items}</table></div>`;
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
