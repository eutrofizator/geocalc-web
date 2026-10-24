/**
 * Böngészős végpróba: a kész, önálló `dist/GEOkalkulus-1.0.html` fájlt betölti egy már futó,
 * fejlesztői porttal indított Chrome-ba, és a DevTools protokollal (CDP) végigpróbálja a burok
 * működését: menük, navigátor, munkalapok, állapotsor, jegyzőkönyv, letöltések (`.gcd`, `.gcs`,
 * `.csv`), hibakezelés és gyorsbillentyűk.
 *
 * Indítás (a Chrome-ot előbb el kell indítani a fejlesztői porttal, pl.):
 *
 *   "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new ^
 *       --remote-debugging-port=9222 --user-data-dir=%TEMP%\geocalc-chrome about:blank
 *   npm run build
 *   npm run browser-check
 *
 * Ha bármelyik ellenőrzés elbukik, a program 1-es kilépési kóddal áll le.
 * Környezeti változók: `CDP_PORT` (alapértelmezés 9222), `GEOKALKULUS_HTML`
 * (alapértelmezés `dist/GEOkalkulus-1.0.html`), `GEOKALKULUS_URL` (ha meg van adva, a próba ezt a
 * címet tölti be a helyi fájl helyett – pl. a közzétett GitHub Pages oldalt). A letöltések a
 * rendszer ideiglenes mappájába (`geocalc-web-browser-check`) kerülnek.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CDP_PORT ?? 9222);
const HTML = resolve(process.env.GEOKALKULUS_HTML ?? join(ROOT, 'dist', 'GEOkalkulus-1.0.html'));
const REMOTE = process.env.GEOKALKULUS_URL?.trim();
if (!REMOTE && !existsSync(HTML)) {
  console.error(`Nincs meg a próbálandó fájl: ${HTML}\nElőbb futtasd: npm run build`);
  process.exit(1);
}
const URL_TO_LOAD = REMOTE || pathToFileURL(HTML).href;
const DL = join(tmpdir(), 'geocalc-web-browser-check');

// az ikonsáv gombjainak sorrendje (a 15 parancsikon)
const TB = {
  settingsSave: 0,
  dbOpen: 1,
  dbSave: 2,
  coords: 3,
  recorder: 4,
  calc: 5,
  descriptor: 6,
  network: 7,
  networkSettings: 8,
  transform: 9,
  transformApply: 10,
  exchangeCoords: 11,
  exchangeFile: 12,
  exchangeAkg: 13,
  help: 14,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('a Chrome DevTools végpont nem indult el');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) this.events.push(m);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

/** A `confirm()` párbeszédeket automatikusan elfogadja (a teszt ne akadjon meg). */
function autoAcceptDialogs(ws, sessionId) {
  let next = 1_000_000;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.javascriptDialogOpening') {
      ws.send(JSON.stringify({ id: next++, method: 'Page.handleJavaScriptDialog', params: { accept: true }, sessionId }));
    }
  });
}

async function main() {
  const browserWs = await endpoint();
  const ws = new WebSocket(browserWs);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  rmSync(DL, { recursive: true, force: true });
  mkdirSync(DL, { recursive: true });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

  await s('Runtime.enable');
  await s('Log.enable');
  await s('Page.enable');
  // Tiszta tároló: a korábbi futás vázlatai ne befolyásolják a próbát.
  await s('Page.navigate', { url: URL_TO_LOAD });
  await sleep(1200);
  await s('Runtime.evaluate', { expression: 'try { localStorage.clear(); } catch {} ; true', returnByValue: true });
  await s('Page.navigate', { url: URL_TO_LOAD });
  await sleep(2500);
  autoAcceptDialogs(ws, sessionId);

  const evalJs = async (expr) => {
    const r = await s('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
    return r.result.value;
  };

  const results = [];
  const check = async (name, expr, expect) => {
    let got;
    try {
      got = await evalJs(expr);
    } catch (e) {
      got = 'HIBA: ' + e.message;
    }
    const ok = JSON.stringify(got) === JSON.stringify(expect);
    results.push([ok, name, JSON.stringify(got), JSON.stringify(expect)]);
  };
  /** Node-oldali érték ellenőrzése (pl. a letöltött fájloké). */
  const checkNode = (name, got, expect) => {
    const ok = JSON.stringify(got) === JSON.stringify(expect);
    results.push([ok, name, JSON.stringify(got), JSON.stringify(expect)]);
  };
  const clickTb = async (i) => {
    await evalJs(`document.querySelectorAll('.tb-btn')[${i}].click()`);
    await sleep(140);
  };
  const clickMenu = async (i) => {
    await evalJs(`document.querySelectorAll('.menu-btn')[${i}].click()`);
    await sleep(110);
  };
  const clickMenuItem = async (i) => {
    await evalJs(`document.querySelectorAll('.menu-btn.open .menu-drop > .menu-item')[${i}].click()`);
    await sleep(110);
  };

  /* ---------- induló állapot: a valódi program Névjegy képe ---------- */
  await check('a program neve a lap címében', `document.title`, 'GEOkalkulus 1.0');
  await check('a program neve az ablak címsorában', `document.querySelector('.titlebar-text').textContent`, 'GEOkalkulus 1.0 – Névtelen');
  await check(
    'a menüsor a valódi program hat modulja',
    `[...document.querySelectorAll('.menu-btn')].map(b => b.firstChild.textContent).join('|')`,
    'Adatrögzítő|Geodéziai számítások|Hálózatkiegyenlítés|Térbeli transzformáció|Adatcsere|Beállítások',
  );
  await check('ikonsáv gombjai', `document.querySelectorAll('.tb-btn').length`, 15);
  await check('a navigátor hat csoportja', `document.querySelectorAll('#navigator .nav-group').length`, 6);
  await check('a navigátor pontjai', `document.querySelectorAll('#navigator .nav-item').length`, 22);
  await check('csak a Beállítások csoport kiemelt', `[...document.querySelectorAll('#navigator .nav-group.special .nav-head-label')].map(e => e.textContent).join('|')`, 'Beállítások');
  await check('induláskor a Névjegy látszik', `document.getElementById('win-about').classList.contains('active')`, true);
  await check('egyszerre egy munkalap látszik', `document.querySelectorAll('.mdiwin:not([hidden])').length`, 1);
  await check('a Névjegy fejléce', `document.querySelector('#win-about .mdiwin-caption').textContent`, 'Beállítások / Névjegy');
  await check('a Névjegy a program nevét mutatja', `document.querySelector('#win-about .about-name').textContent`, 'GEOkalkulus');
  await check('kódlista elemei', `document.querySelectorAll('#module-list li').length`, 19);
  await check('a jegyzőkönyv kártyái', `document.querySelectorAll('#results .card').length > 0`, true);
  await check('állapotsor: a nézet neve', `document.getElementById('sb-view').textContent`, 'Beállítások/Névjegy');
  await check('állapotsor: dátum', `/^\\d{4}\\.\\d{2}\\.\\d{2}$/.test(document.getElementById('sb-date').textContent)`, true);
  await check('állapotsor: idő', `/^\\d{2}:\\d{2}:\\d{2}$/.test(document.getElementById('sb-time').textContent)`, true);
  await check('állapotsor: összegzés', `/számított pont/.test(document.getElementById('sb-counts').textContent)`, true);

  /* ---------- navigátor ---------- */
  const clickNav = async (id) => {
    await evalJs(`document.querySelector('#navigator [data-nav="${id}"]').click()`);
    await sleep(140);
  };
  await clickNav('gs-work');
  await check('navigátor: a Munkaterület megnyílt', `document.getElementById('win-calc').classList.contains('active')`, true);
  await check('a munkalap fejléce „Modul / Lap”', `document.querySelector('#win-calc .mdiwin-caption').textContent`, 'Geodéziai számítások / Munkaterület');
  await check('a navigátor jelöli az aktív pontot', `document.querySelector('#navigator .nav-item.current').dataset.nav`, 'gs-work');
  await check('a Névjegy elrejtve', `document.getElementById('win-about').hidden`, true);
  await check('állapotsor követi a munkalapot', `document.getElementById('sb-view').textContent`, 'Geodéziai számítások/Munkaterület');

  await clickNav('rc-manual');
  await check('navigátor: a Manuális adatbevitel az Adatrögzítőt nyitja', `document.getElementById('win-recorder').classList.contains('active')`, true);
  await check('a fejléc a részfeladat nevét mutatja', `document.querySelector('#win-recorder .mdiwin-caption').textContent`, 'Adatrögzítő / Manuális adatbevitel');
  await check('a kézi bevitel szakasza nyitva', `document.getElementById('rc-manual').closest('details').open`, true);

  await clickNav('net-hor');
  await check('navigátor: a Vízszintes kiegyenlítés a hálózatot nyitja', `document.querySelector('#win-network .mdiwin-caption').textContent`, 'Hálózatkiegyenlítés / Vízszintes kiegyenlítés');

  // A csoport fejléce összecsukja és kinyitja a csoportot.
  await evalJs(`document.querySelectorAll('#navigator .nav-head')[0].click()`);
  await sleep(60);
  await check('a csoport összecsukható', `document.querySelectorAll('#navigator .nav-items')[0].hidden`, true);
  await evalJs(`document.querySelectorAll('#navigator .nav-head')[0].click()`);
  await sleep(60);
  await check('a csoport újra kinyitható', `document.querySelectorAll('#navigator .nav-items')[0].hidden`, false);

  // Az elválasztó nyila elrejti és visszahozza a navigátort.
  await evalJs(`document.getElementById('nav-splitter').click()`);
  await sleep(60);
  await check('a navigátor elrejthető', `getComputedStyle(document.getElementById('navigator')).display`, 'none');
  await evalJs(`document.getElementById('nav-splitter').click()`);
  await sleep(60);
  await check('a navigátor visszahozható', `getComputedStyle(document.getElementById('navigator')).display !== 'none'`, true);

  /* ---------- ikonsáv ---------- */
  await clickTb(TB.network);
  await check('ikonsáv: hálózat munkalap megnyílt', `document.getElementById('win-network').hidden`, false);
  await check('ikonsáv: a hálózat munkalap aktív', `document.getElementById('win-network').classList.contains('active')`, true);
  await check('az ikonsáv a munkalap saját fejlécét adja', `document.querySelector('#win-network .mdiwin-caption').textContent`, 'Hálózatkiegyenlítés / Munkaterület');
  await check('továbbra is egy munkalap látszik', `document.querySelectorAll('.mdiwin:not([hidden])').length`, 1);
  await check('állapotsor követi az aktív munkalapot', `document.getElementById('sb-view').textContent`, 'Hálózatkiegyenlítés/Munkaterület');

  await clickTb(TB.transform);
  await check('ikonsáv: transzformáció munkalap megnyílt', `document.getElementById('win-transform').hidden`, false);
  await check('a hálózat munkalap elrejtve', `document.getElementById('win-network').hidden`, true);

  await clickTb(TB.help);
  await check('helyettesítő munkalap (Súgó) létrejött', `!!document.getElementById('win-help')`, true);
  await check('a Súgó munkalap aktív', `document.getElementById('win-help').classList.contains('active')`, true);
  await check('a helyettesítő munkalap ismertet', `document.querySelector('#win-help .pane p').textContent.length > 40`, true);

  /* ---------- menük ---------- */
  await clickMenu(5);
  await check('a Beállítások menü lenyílt', `!!document.querySelector('.menu-btn.open')`, true);
  await check('van elválasztó', `document.querySelectorAll('.menu-btn.open .menu-sep').length > 0`, true);
  await check(
    'a Beállítások menü a munkamenet-parancsokat is kínálja',
    `[...document.querySelectorAll('.menu-btn.open .menu-drop > .menu-item .menu-label')].map(e => e.textContent).join('|')`,
    'Általános beállítások|Beállítások mentése|Munkamenet mentése…|Munkamenet betöltése…|Nyomtatás…|Súgó|Névjegy',
  );
  // Munkamenet mentése (.gcs): a menü 3. pontja – a letöltés valóban fájlt ad.
  await evalJs(`document.querySelectorAll('.menu-btn.open .menu-drop > .menu-item')[2].click()`);
  await sleep(1000);
  const gcsName = readdirSync(DL).find((n) => /^munkamenet-\d{4}-\d{2}-\d{2}\.gcs$/.test(n));
  checkNode('a munkamenet mentése .gcs fájlt ad', Boolean(gcsName), true);
  const gcs = gcsName ? JSON.parse(readFileSync(join(DL, gcsName), 'utf8')) : {};
  checkNode('a .gcs formátuma, programneve és változata a helyes', `${gcs.format}|${gcs.program}|${gcs.version}`, 'GEOkalkulus-munkamenet|GEOkalkulus 1.0|1');
  checkNode('a .gcs munkalapokat gyűjt be', Object.keys(gcs.data ?? {}).length >= 1, true);
  checkNode('a .gcs minden kulcsa a program sajátja', Object.keys(gcs.data ?? {}).every((k) => k.startsWith('geocalc-web.')), true);
  await clickMenu(5);
  await clickMenuItem(0);
  await check('a menüpont kiválasztása bezárja a menüt', `document.querySelectorAll('.menu-btn.open').length`, 0);
  await check('az Általános beállítások megnyílt', `document.getElementById('win-general-settings').classList.contains('active')`, true);
  await check('az Általános beállítások az automatikus számítást tükrözik', `document.getElementById('gs-auto').checked === document.getElementById('auto').checked`, true);

  await clickMenu(0);
  await check('újra lenyitható', `document.querySelectorAll('.menu-btn.open').length`, 1);
  await check('az Adatrögzítő menü a navigátor pontjait adja', `document.querySelectorAll('.menu-btn.open .menu-drop > .menu-item').length`, 3);
  await evalJs(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await sleep(80);
  await check('kattintás máshol bezárja', `document.querySelectorAll('.menu-btn.open').length`, 0);

  // Új munkaterület (Geodéziai számítások menü), hogy a kód beszúrása üres szerkesztőbe kerüljön.
  await clickMenu(1);
  await clickMenuItem(3);
  await check('az Új munkaterület kiüríti a szerkesztőt', `document.getElementById('editor').value`, '');
  await clickMenu(1);
  await check('a Geodéziai számítások menü lenyílt', `document.querySelectorAll('.menu-btn.open > .menu-drop > .menu-item').length`, 9);
  const codesIndex = await evalJs(`[...document.querySelectorAll('.menu-btn.open > .menu-drop > .menu-item')].findIndex(b => b.textContent.startsWith('Kód beszúrása'))`);
  await evalJs(`document.querySelectorAll('.menu-btn.open > .menu-drop > .menu-item')[${codesIndex}].dispatchEvent(new Event('mouseenter'))`);
  await sleep(80);
  await check('a „Kód beszúrása” almenü 19 kódot ad', `document.querySelectorAll('.menu-sub .menu-item').length`, 19);
  await check('az almenü a program kódsorrendjét követi', `document.querySelectorAll('.menu-sub .menu-item .menu-label')[0].textContent.slice(0, 2)`, 'IT');
  await evalJs(`document.querySelectorAll('.menu-sub .menu-item')[0].click()`);
  await sleep(120);
  await check('a kód beszúrása a szerkesztőbe került', `document.getElementById('editor').value.trim().slice(0, 2).toLowerCase()`, 'it');
  await check('a menü bezárult beszúrás után', `document.querySelectorAll('.menu-btn.open').length`, 0);

  await clickMenu(2);
  await clickMenuItem(0);
  await check('a menüből váltás működik', `document.getElementById('sb-view').textContent`, 'Hálózatkiegyenlítés/Munkaterület');
  await clickMenu(2);
  await check('a menü jelöli az aktív pontot', `document.querySelector('.menu-btn.open .menu-item.checked .menu-label').textContent`, 'Munkaterület');
  await evalJs(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await sleep(80);

  /* ---------- a Munkaterület szerkesztője (súgó 43. o.) ---------- */
  await clickNav('gs-work');
  await check('a szerkesztő ikonsora', `document.querySelectorAll('#calc-toolbar button.ib').length`, 10);
  await evalJs(`document.getElementById('btn-codes').click()`);
  await sleep(60);
  await check('a kódlista elrejthető', `document.getElementById('calc-codes').hidden`, true);
  await evalJs(`document.getElementById('btn-codes').click()`);
  await sleep(60);
  await check('a kódlista visszahozható', `document.getElementById('calc-codes').hidden`, false);
  await evalJs(`(() => { const e = document.getElementById('editor'); e.focus(); e.setSelectionRange(0, 0); e.dispatchEvent(new Event('click')); return true; })()`);
  await check('a szerkesztő állapotsora a kurzor helyét mutatja', `document.getElementById('ed-pos').textContent`, '1:1');
  await check('a szerkesztő állapotsora az állomány nevét mutatja', `document.getElementById('ed-file').textContent`, 'Névtelen.gcd');
  await evalJs(`
    (() => {
      const e = document.getElementById('editor');
      e.value = 'k_\\n1 , 3817.26 , 7339.75\\n5 , 2852.34 , 6562.88\\n;;\\nit\\n1\\n5\\n;;';
      e.dispatchEvent(new Event('input'));
      document.getElementById('btn-run').click();
      return true;
    })()
  `);
  await sleep(200);
  await check('az Előkép fejezetfája kitöltődött', `document.querySelectorAll('#report-tree .tree-item').length > 0`, true);
  await check('a fejezetfa első pontja az előlap', `document.querySelector('#report-tree .tree-item').textContent`, 'Előlap');
  await evalJs(`document.getElementById('btn-zoom-in').click()`);
  await check('az Előkép nagyítható', `document.getElementById('zoom-level').textContent`, '110%');
  await evalJs(`document.getElementById('btn-zoom-out').click()`);
  await check('az Előkép kicsinyíthető', `document.getElementById('zoom-level').textContent`, '100%');

  /* ---------- Földrajzi koordináták konvertálása ---------- */
  await clickNav('ex-geo');
  await check('a konvertáló munkalap megnyílt', `document.getElementById('win-geo-convert').classList.contains('active')`, true);
  await evalJs(`
    (() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); };
      set('gc-from', 'PSEUDO');
      set('gc-to', 'DMS');
      set('gc-dec', '5');
      const t = document.getElementById('gc-input');
      t.value = 'P 47.182231643 19.182231643 100';
      t.dispatchEvent(new Event('input'));
      return true;
    })()
  `);
  await check('az áldecimális szög a súgó szerinti fok-perc-másodperc', `document.querySelector('#gc-results tbody tr td:nth-child(3)').textContent`, '19° 18′ 22.31643″');

  /* ---------- számítás és előnézet ---------- */
  await evalJs(`
    (() => {
      const e = document.getElementById('editor');
      e.value = 'k_\\n1 , 3817.26 , 7339.75\\n5 , 2852.34 , 6562.88\\n;;\\nit\\n1\\n5\\n;;';
      e.dispatchEvent(new Event('input'));
      return true;
    })()
  `);
  await sleep(300);
  await evalJs(`document.getElementById('btn-run').click()`);
  await sleep(300);
  await check('a Számítás gomb újrafut', `document.querySelectorAll('#results .card').length > 0`, true);
  await check('az IT eredmény megvan', `/1238\\.789/.test(document.getElementById('results').textContent)`, true);
  await check('az állapotsor összegzése frissült', `/számított pont/.test(document.getElementById('sb-counts').textContent)`, true);

  // Táblázatok (.csv): a gomb a jegyzőkönyv táblázatait adja táblázatkezelőbe.
  await check('a számítási munkalap ad „Táblázatok (.csv)” gombot', `[...document.querySelectorAll('#downloads button')].some(b => b.textContent === 'Táblázatok (.csv)')`, true);
  await evalJs(`[...document.querySelectorAll('#downloads button')].find(b => b.textContent === 'Táblázatok (.csv)').click()`);
  await sleep(1000);
  const csvName = readdirSync(DL).find((n) => n.endsWith('.csv'));
  checkNode('a CSV letöltődött (szamitas_tablazatok.csv)', csvName ?? 'nincs fájl', 'szamitas_tablazatok.csv');
  const csvText = csvName ? readFileSync(join(DL, csvName), 'utf8') : '';
  checkNode('a CSV bájt-sorrendjellel és pontosvesszős elválasztással indul', csvText.startsWith('\uFEFF') && csvText.includes(';'), true);
  checkNode('a CSV a jegyzőkönyv táblázatcímeit tartalmazza', /Felhasznált koordináták/.test(csvText), true);

  await clickTb(TB.coords);
  await check('a koordináta-előnézet kitöltődött', `document.querySelectorAll('#coords-preview table tbody tr').length`, 2);

  await clickTb(TB.dbOpen);
  await check('az „Adatbázis beolvasása” nem dob hibát (fájlválasztó)', `true`, true);

  /* ---------- jegyzőkönyv-előlap és az általános beállítások ---------- */
  await check(
    'az előlap a jegyzőkönyv első kártyája',
    `document.querySelector('#results .card[data-role="cover"]') === document.querySelector('#results .card')`,
    true,
  );
  await check('az előlap címe', `document.querySelector('#results .cover-title').textContent`, 'GEODÉZIAI SZÁMÍTÁSOK');
  await check('az előlap lábléce', `document.querySelector('#results .cover-foot').textContent.trim()`, 'by_safi01');

  await clickMenu(1);
  await check('a Geodéziai számítások menü lenyílt', `!!document.querySelector('.menu-btn.open')`, true);
  await clickMenuItem(2);
  await check('a beállítások munkalap megnyílt', `document.getElementById('win-settings').hidden`, false);
  await check('a beállítások munkalap aktív', `document.getElementById('win-settings').classList.contains('active')`, true);

  await evalJs(`
    (() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
      set('set-keszitette', 'Teszt Elemér');
      set('set-munkanev', 'Webes próba');
      set('set-msz', '7/2026');
      set('set-telepules', 'Pécs');
      set('set-datum', '2026.02.03.');
      set('set-ev', '2026');
      return true;
    })()
  `);
  await sleep(200);
  await check('az előlap azonnal követi a beállítást', `/Készítette: Teszt Elemér/.test(document.querySelector('#results .cover').textContent)`, true);
  await check('a munkaszám az előlap fejlécében', `/Munkaszám: 7\\/2026/.test(document.querySelector('#results .cover-msz').textContent)`, true);
  await check('a dátum az előlapon', `/2026\\.02\\.03\\./.test(document.querySelector('#results .cover').textContent)`, true);
  await check('a munkanév az előlap alcíme', `document.querySelector('#results .cover-subtitle').textContent`, 'Webes próba');

  /* ---------- kimeneti formátumok (W>, G>, A>, L>, M>) ---------- */
  await evalJs(`(() => {
    const e = document.getElementById('editor');
    e.value = 'K_\\r\\n1,590543.330,209686.710,273.090\\r\\n;;\\r\\nA>adat\\r\\nL>leica.gsi\\r\\nM>geomax.gsi\\r\\nW>wild.gsi\\r\\nG>geo.coo\\r\\n';
    e.dispatchEvent(new Event('input'));
    return true;
  })()`);
  await sleep(150);
  await evalJs(`document.getElementById('btn-run').click()`);
  await sleep(300);
  await check(
    'az A> a .dxf kiterjesztést kényszeríti',
    `[...document.querySelectorAll('#downloads button')].some(b => b.textContent.includes('adat.dxf letöltése'))`,
    true,
  );
  await check(
    'a GSI-16 és Geodimeter fájlok is megjelennek',
    `['leica.gsi','geomax.gsi','wild.gsi','geo.coo'].every(n => [...document.querySelectorAll('#downloads button')].some(b => b.textContent.includes(n)))`,
    true,
  );
  await check('a formátum-megjegyzés látható', `!!document.querySelector('#downloads .fmt-note')`, true);

  /* ---------- Adatleíró (Geodéziai számítások/Adatleíró) ---------- */
  await evalJs(`(() => {
    const e = document.getElementById('editor');
    e.value = 'k_\\r\\n1 , 3817.26 , 7339.75\\r\\n5 , 2852.34 , 6562.88\\r\\n6 , 3092.68 , 8273.89\\r\\n9 , 3766.59 , 6327.93\\r\\n;;\\r\\n';
    e.dispatchEvent(new Event('input'));
    document.getElementById('btn-run').click();
    return true;
  })()`);
  await sleep(250);

  await clickTb(TB.descriptor);
  await check('az Adatleíró munkalap megnyílt', `document.getElementById('win-descriptor').hidden`, false);
  await check('az Adatleíró munkalap aktív', `document.getElementById('win-descriptor').classList.contains('active')`, true);
  await check('az állapotsor követi az Adatleírót', `document.getElementById('sb-view').textContent`, 'Geodéziai számítások/Adatleíró');
  await evalJs(`document.getElementById('dp-clear').click()`);
  await sleep(120);
  await check('az Adatleíró mérési táblája üres', `document.querySelectorAll('#dp-obs-body tr').length`, 0);

  await evalJs(`(() => {
    const rows = [['1','9','182.0324',''],['1','5','230.2105',''],['1','6','321.2330','']];
    for (const r of rows) {
      document.getElementById('dp-add').click();
      const tr = document.querySelector('#dp-obs-body tr:last-child');
      const ins = tr.querySelectorAll('input');
      r.forEach((v, i) => { ins[i].value = v; ins[i].dispatchEvent(new Event('input')); });
    }
    return true;
  })()`);
  await sleep(180);
  await check('a mérési sorok bekerültek', `document.querySelectorAll('#dp-obs-body tr').length`, 3);
  await check('az álláspontlista egy álláspontot ad', `document.querySelectorAll('#dp-stations li').length`, 1);
  await check('az álláspont ismertként jelölve', `document.querySelector('#dp-stations .pick-tag').textContent`, 'ismert');
  await check('az irányzott pontok listája', `document.querySelectorAll('#dp-targets li').length`, 3);
  await check('az irányzott pontok jelölése', `[...document.querySelectorAll('#dp-targets .pick-tag')].map(e => e.textContent).join(',')`, 'ismert,ismert,ismert');
  await check('az álláspont mezője kitöltve', `document.getElementById('dp-station').value`, '1');

  await evalJs(`(() => {
    const s = document.getElementById('dp-type'); s.value = 'TJ'; s.dispatchEvent(new Event('change'));
    return true;
  })()`);
  await check('a típus-súgó a súgó kódvázát mutatja', `/^tj \\//.test(document.getElementById('dp-type-hint').textContent)`, true);
  await check('TJ-nél nincs új pont mező', `document.getElementById('dp-row-target').hidden`, true);
  await evalJs(`document.getElementById('dp-generate').click()`);
  await sleep(140);
  const expectedTj = 'tj\n1\n9, 182.0324\n5, 230.2105\n6, 321.2330\n;;\n';
  await check('a generált TJ kód a súgó mintája szerint', `document.getElementById('dp-code').value`, expectedTj);

  await evalJs(`document.getElementById('dp-apply').click()`);
  await sleep(320);
  await check('a Konverzió beillesztette a kódot a Munkaterületre', `/tj\\r?\\n1\\r?\\n9, 182\\.0324/.test(document.getElementById('editor').value)`, true);
  await check('a számítás hibamentesen lefutott', `document.querySelectorAll('#issues .issue.error').length`, 0);
  await check('a Munkaterület aktív lett', `document.getElementById('win-calc').classList.contains('active')`, true);

  await clickTb(TB.descriptor);
  await evalJs(`(() => {
    const rows = [['1015','1001','10.0000','100.5'],['1015','1002','20.0000','120.5'],['1015','2001','40.0000','60.5']];
    document.getElementById('dp-clear').click();
    for (const r of rows) {
      document.getElementById('dp-add').click();
      const tr = document.querySelector('#dp-obs-body tr:last-child');
      const ins = tr.querySelectorAll('input');
      r.forEach((v, i) => { ins[i].value = v; ins[i].dispatchEvent(new Event('input')); });
    }
    const c = document.getElementById('dp-auto-count'); c.value = '2';
    document.getElementById('dp-auto').click();
    return true;
  })()`);
  await sleep(180);
  await check('az automatikus kódolás TJ-t és PO-t ad', `/^tj\\r?\\n1015/.test(document.getElementById('dp-code').value) && /\\r?\\npo\\r?\\n1015/.test(document.getElementById('dp-code').value)`, true);
  await check('a szabad álláspont VP-t kódol', `(() => {
    document.getElementById('dp-auto-station').value = 'vp';
    document.getElementById('dp-auto').click();
    return /^vp\\r?\\n1015/.test(document.getElementById('dp-code').value);
  })()`, true);

  /* ---------- Koordináta kezelő (Adatcsere/Koordináta kezelő) ---------- */
  await clickTb(TB.exchangeCoords);
  await check('a Koordináta kezelő megnyílt', `document.getElementById('win-exchange-coords').hidden`, false);
  await check('a Koordináta kezelő aktív', `document.getElementById('win-exchange-coords').classList.contains('active')`, true);
  await check('az állapotsor követi', `document.getElementById('sb-view').textContent`, 'Adatcsere/Koordináta kezelő');
  await check('a mezők alapértelmezett listája', `document.querySelectorAll('#ex-fields-body tr').length`, 5);
  await check('az adatforrás az utolsó futás', `document.getElementById('ex-db-name').textContent`, 'Az utolsó futás pontjai');
  await check('az előnézet az ismert pontokat mutatja', `document.querySelectorAll('#ex-preview table tbody tr').length`, 4);

  await evalJs(`(() => {
    document.getElementById('ex-cond-add').click();
    const box = document.querySelector('#ex-cond-body .cond');
    const sel = box.querySelectorAll('select');
    sel[0].value = 'id'; sel[0].dispatchEvent(new Event('change'));
    sel[1].value = '='; sel[1].dispatchEvent(new Event('change'));
    const inp = box.querySelector('input[type=text]');
    inp.value = '5'; inp.dispatchEvent(new Event('input'));
    return true;
  })()`);
  await sleep(160);
  await check('a feltétel szűri az előnézetet', `document.querySelectorAll('#ex-preview table tbody tr').length`, 1);
  await check('a szűrt pont az 5-ös', `document.querySelector('#ex-preview table tbody tr td').textContent`, '5');
  await check('a pontszám látható', `document.getElementById('ex-count').textContent`, '1 pont');

  await evalJs(`(() => { const c = document.getElementById('ex-flag'); c.checked = true; c.dispatchEvent(new Event('change')); return true; })()`);
  await check('a számított jelző oszlop megjelent', `[...document.querySelectorAll('#ex-preview table thead th')].map(e => e.textContent).join(',')`, 'Pontszám,Y,X,M,Számított');
  await evalJs(`(() => { const c = document.getElementById('ex-trim'); c.checked = true; c.dispatchEvent(new Event('change')); return true; })()`);
  await evalJs(`document.getElementById('ex-export').click()`);
  await sleep(200);
  await check('az export jelzi a kiírt pontszámot', `/1 pont kiírva/.test(document.getElementById('ex-hint').textContent)`, true);

  await evalJs(`(() => {
    document.querySelector('#ex-cond-body .cond button').click();
    return true;
  })()`);
  await sleep(120);
  await check('a feltétel törlése visszaadja a teljes listát', `document.querySelectorAll('#ex-preview table tbody tr').length`, 4);

  await check('a kód beszúrása (Adatleíró) után is hibátlan a futtatás', `document.querySelectorAll('#issues .issue.error').length`, 0);

  /* ---------- önálló hálózat, hálózati dátum, sokszögvonal-előzetes, vázlat ---------- */
  await clickTb(TB.network);
  await evalJs(`document.getElementById('net-sample').click()`);
  await sleep(900);
  await check('a mintapélda kitölti a sokszögvonal sorrendjét', `document.getElementById('net-traverse').value`, '541017D 2 3 541440');
  await check('a sokszögvonal-előzetes szakasz megjelenik', `[...document.querySelectorAll('#net-results .card h3')].some(e => e.textContent === 'Sokszögvonal-előzetes – a vonal előírása')`, true);
  await check('a vonal előírása a hátra/előre/törésszög oszlopokat adja', `[...document.querySelectorAll('#net-results thead tr')].map(e => [...e.children].map(c => c.textContent).join(',')).find(t => t.startsWith('Pontszám,Hátra (Hz),Előre (Hz),dHZ')) !== undefined`, true);
  await check('a vonalas záróhiba a láblécben', `[...document.querySelectorAll('#net-results .card p.footer')].some(e => e.textContent.includes('Vonalas záróhiba: 0.054 m'))`, true);
  await check('az előzetes koordináták szakasz megjelenik', `[...document.querySelectorAll('#net-results .card h3')].some(e => e.textContent === 'Sokszögvonal-előzetes – előzetes koordináták')`, true);

  /* ---------- mérések kizárása jelölőnégyzettel (súgó 42. o.) ---------- */
  const exclCard = `[...document.querySelectorAll('#net-results .card')].find(c => c.querySelector('h3')?.textContent === 'Mérések kizárása a kiegyenlítésből')`;
  await check('a mérések kizárása táblázat megjelenik', `!!(${exclCard})`, true);
  await check(
    'minden irány és távolság jelölőnégyzetes sor',
    `(() => { const c = ${exclCard}; const b = [...c.querySelectorAll('input[data-check]')]; return b.length > 20 && b.every(x => x.type === 'checkbox'); })()`,
    true,
  );
  await check(
    'a durva hiba miatt kihagyott mérés bejelölve, de zárolva',
    `(() => { const b = [...(${exclCard}).querySelectorAll('input[data-check]')]; return b.some(x => x.checked && x.disabled) && b.every(x => !x.disabled || x.checked); })()`,
    true,
  );
  checkNode('a jelölőnégyzet azonosítója álláspont>cél:fajta', await evalJs(`(${exclCard}).querySelector('input[data-check]').dataset.check`).then((v) => /^[^>]+>[^:]+:(dir|dist)$/.test(v)), true);
  await check(
    'a kizárás táblázatának oszlopszáma minden sorban egyezik a fejléccel',
    `(() => {
      const c = ${exclCard};
      const h = c.querySelectorAll('thead th').length;
      return [...c.querySelectorAll('tbody tr')].every(tr => tr.children.length === h);
    })()`,
    true,
  );
  await evalJs(`(() => {
    const b = [...(${exclCard}).querySelectorAll('input[data-check]')].find(x => !x.checked && !x.disabled);
    window.__exclKey = b.dataset.check;
    b.checked = true;
    b.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(1300);
  await check('a kézzel kizárt mérés a jelzőben is megjelenik', `/Kézzel kizárt mérések \\(1\\)/.test(document.getElementById('net-excl-count').textContent)`, true);
  await check(
    'a kizárt mérés sorában a jelölőnégyzet be van kapcsolva, és kapcsolható',
    `(() => {
      const row = [...document.querySelectorAll('#net-results tbody tr')].find(tr => tr.querySelector('input[data-check]')?.dataset.check === window.__exclKey);
      const box = row?.querySelector('input[data-check]');
      const head = row?.closest('.table-wrap')?.querySelector('thead th');
      return !!box && box.checked && !box.disabled && head?.textContent === 'Kizárva';
    })()`,
    true,
  );
  await check('a kizárás a láblécben is megjelenik', `/1 mérést zártál ki kézzel/.test([...document.querySelectorAll('#net-results .card p.footer')].map(e => e.textContent).join(' '))`, true);
  await evalJs(`document.getElementById('net-excl-none').click()`);
  await sleep(1300);
  await check('a „Minden mérés visszavétele” visszaállítja a kiegyenlítést', `document.getElementById('net-excl-count').textContent.startsWith('Nincs kézzel kizárt mérés')`, true);
  await check('visszavétel után nincs hiba', `document.querySelectorAll('#net-results .issue.error').length`, 0);

  await evalJs(`(() => { const c = document.getElementById('net-sketch-on'); c.checked = true; c.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(900);
  await check('a mérési vázlat SVG-je megjelenik', `!!document.querySelector('#net-results svg.sketch-svg')`, true);
  await check('a vázlaton a pontok és az élek is látszanak', `document.querySelectorAll('#net-results svg.sketch-svg .sk-dist').length > 0 && document.querySelectorAll('#net-results svg.sketch-svg .sk-known, #net-results svg.sketch-svg .sk-new').length > 0`, true);

  await evalJs(`(() => { const c = document.getElementById('net-free'); c.checked = true; c.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(1200);
  await check('az önálló hálózat beállítása hibamentes', `document.querySelectorAll('#net-results .issue.error').length`, 0);
  await check('az önálló hálózat szakasza megjelenik', `[...document.querySelectorAll('#net-results .card h3')].some(e => e.textContent === 'Önálló hálózat – a hálózat elhelyezése')`, true);
  await check('önálló hálózatnál nincs „Felhasznált vízszintes alappontok” szakasz', `[...document.querySelectorAll('#net-results .card h3')].some(e => e.textContent === 'Felhasznált vízszintes alappontok')`, false);
  await check('az önálló hálózat lábléce a dátumra hivatkozik', `[...document.querySelectorAll('#net-results .card p.footer')].some(e => e.textContent.includes('belső megkötéssel'))`, true);

  await evalJs(`(() => {
    document.getElementById('net-datum-anchor').value = '541017D';
    document.getElementById('net-datum-y').value = '591948.650';
    document.getElementById('net-datum-x').value = '208773.180';
    document.getElementById('net-datum-rot').value = '0';
    document.getElementById('net-datum-second').value = '';
    document.getElementById('net-datum-az').value = '';
    for (const id of ['net-datum-anchor', 'net-datum-y', 'net-datum-x', 'net-datum-rot']) document.getElementById(id).dispatchEvent(new Event('input'));
    return true;
  })()`);
  await sleep(1200);
  await check('a hálózati dátum szakasza megjelenik', `[...document.querySelectorAll('#net-results .card h3')].some(e => e.textContent === 'A hálózat elhelyezése (hálózati dátum)')`, true);
  await check('a horgonypont a kívánt koordinátára kerül', `[...document.querySelectorAll('#net-results table tbody tr')].filter(tr => tr.children[0].textContent === '541017D').map(tr => tr.children[1].textContent + ',' + tr.children[2].textContent).includes('591948.650,208773.180')`, true);
  await check('a dátum lábléce az eltolást és a forgatást közli', `[...document.querySelectorAll('#net-results .card p.footer')].some(e => e.textContent.includes('Forgatás: 0.000°'))`, true);

  await evalJs(`(() => {
    document.getElementById('net-datum-rot').value = '90';
    document.getElementById('net-datum-rot').dispatchEvent(new Event('input'));
    return true;
  })()`);
  await sleep(1200);
  await check('a forgatás a láblécben is megjelenik', `[...document.querySelectorAll('#net-results .card p.footer')].some(e => e.textContent.includes('Forgatás: 90.000°'))`, true);

  // Vissza a beillesztett hálózatra.
  await evalJs(`(() => { const c = document.getElementById('net-free'); c.checked = false; c.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(900);
  await check('beillesztett hálózatra visszaváltva is hibátlan', `document.querySelectorAll('#net-results .issue.error').length`, 0);
  await check('ismét megjelennek a felhasznált alappontok', `[...document.querySelectorAll('#net-results .card h3')].some(e => e.textContent === 'Felhasznált vízszintes alappontok')`, true);

  await evalJs(`document.getElementById('net-traverse').value = ''; document.getElementById('net-traverse').dispatchEvent(new Event('input'))`);
  await sleep(500);

  /* ---------- Hálózatkiegyenlítés/Beállítások (hibahatár, élesség) ---------- */
  await evalJs(`document.getElementById('net-open-settings').click()`);
  await sleep(250);
  await check('a hálózati beállítások munkalap megnyílt', `document.getElementById('win-network-settings').hidden`, false);
  await check('a hálózati beállítások munkalap aktív', `document.getElementById('win-network-settings').classList.contains('active')`, true);
  await check('az állapotsor követi a hálózati beállításokat', `document.getElementById('sb-view').textContent`, 'Hálózatkiegyenlítés/Beállítások');
  await check('a hibahatár-listában négy rendűség és az egyéni', `document.getElementById('ns-limit').options.length`, 5);
  await evalJs(`(() => { const s = document.getElementById('ns-limit'); s.value = 'v-rendu'; document.getElementById('ns-apply-limit').click(); return true; })()`);
  await sleep(1000);
  await check('az V. rendű hibahatár beállítja az irány középhibáját', `document.getElementById('net-sigma-dir').value`, '10');
  await check('az V. rendű hibahatár beállítja a távmérés középhibáját', `document.getElementById('net-sigma-dist').value`, '5');
  await check('a hibahatár alkalmazása megjegyzést ad', `/V\\. rendű hibahatár beállítva/.test(document.getElementById('ns-status').textContent)`, true);
  await evalJs(`(() => { const s = document.getElementById('net-prec'); s.value = 'cm'; s.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(1000);
  await check('a számítás élessége a hálózat összegzésében is megjelenik', `[...document.querySelectorAll('#net-results table tbody tr')].some(tr => tr.children[0].textContent === 'Számítás élessége (koordináta)' && tr.children[1].textContent === 'cm')`, true);

  /* ---------- Adatrögzítő/Beállítások ---------- */
  await clickTb(TB.recorder);
  await check('az Adatrögzítő munkalap megnyílt', `document.getElementById('win-recorder').hidden`, false);
  await check('az Adatrögzítő munkalap aktív', `document.getElementById('win-recorder').classList.contains('active')`, true);
  await check('az állapotsor követi az Adatrögzítőt', `document.getElementById('sb-view').textContent`, 'Adatrögzítő/Beállítások');
  await check('tíz rögzítőtípus választható', `document.getElementById('rc-type').options.length`, 10);
  await check('három redukciós mód van', `document.getElementById('rc-reduction').options.length`, 3);
  await check('öt vetület választható', `document.getElementById('rc-projection').options.length`, 5);
  await evalJs(`document.getElementById('rc-sample').click()`);
  await sleep(500);
  await check('a súgó mintapéldája beállítja az Y átlagot', `document.getElementById('rc-avgy').value`, '602147.734');
  await check('a súgó mintapéldája beállítja az X átlagot', `document.getElementById('rc-avgx').value`, '204807.646');
  await check('az átlagos magasság kézzel 110 m', `document.getElementById('rc-avgm').value`, '110');
  await check('a minta három mérést dolgoz fel', `/3 mérési sor/.test(document.getElementById('rc-status').textContent)`, true);
  await check('a jegyzőkönyv mérési táblája három sor', `[...document.querySelectorAll('#rc-results .card')].find(c => c.querySelector('h3')?.textContent.includes('Mérési adatok'))?.querySelectorAll('tbody tr').length`, 3);
  await check('a redukált vetületi távolság kiszámolódott', `(() => {
    const card = [...document.querySelectorAll('#rc-results .card')].find(c => c.querySelector('h3')?.textContent.includes('Mérési adatok'));
    if (!card) return 'nincs mérési kártya';
    const v = Number(card.querySelector('tbody tr').children[4].textContent);
    return v > 152.2 && v < 152.6;
  })()`, true);
  await check('a redukció képletének fenntartása a láblécben', `[...document.querySelectorAll('#rc-results .card p.footer')].some(e => e.textContent.includes('Tv = Tf · sin(Zi)'))`, true);
  await check('a redukciónál három letöltés készül (redukált mérések, jegyzőkönyv, táblázatok)', `document.querySelectorAll('#rc-downloads button').length`, 3);

  /* ---------- Adatrögzítő: a kézi bevitel táblázata ---------- */
  await check('a kézi bevitel táblázata három sort mutat', `document.querySelectorAll('#rc-body tr').length`, 3);
  await check('a vízszintes szög emberi alakja a beírás alatt', `document.querySelector('#rc-body tr:nth-child(1) td:nth-child(2) .rc-dms').textContent`, '45°12′34″');
  await check('a magassági szög emberi alakja is kiíródik', `document.querySelector('#rc-body tr:nth-child(2) td:nth-child(3) .rc-dms').textContent`, '90°50′00″');
  await check('a számolt vízszintes távolság a sor mellett jelenik meg', `(() => {
    const v = Number(document.querySelector('#rc-body tr:nth-child(1) td:nth-child(5) .rc-out').textContent);
    return v > 152.2 && v < 152.6;
  })()`, true);
  await check('a számolt magasságkülönbség is megjelenik', `document.querySelector('#rc-body tr:nth-child(1) td:nth-child(6) .rc-out').textContent`, '-3.692');
  await check('a szöveges bevitel tükrözi a táblázatot', `(() => {
    const v = document.getElementById('rc-input').value;
    return /45\\.1234/.test(v) && v.split(/\\r?\\n/).length === 3;
  })()`, true);
  await evalJs(`(() => {
    const inp = document.querySelector('#rc-body tr:nth-child(1) td:nth-child(4) input');
    inp.value = '304.752';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(600);
  await check('a táblázat a ferde távolság átírására újraszámol', `(() => {
    const v = Number(document.querySelector('#rc-body tr:nth-child(1) td:nth-child(5) .rc-out').textContent);
    return v > 304 && v < 305;
  })()`, true);
  await check('az átírt ferde távolság a jegyzőkönyvbe is átkerül', `(() => {
    const card = [...document.querySelectorAll('#rc-results .card')].find(c => c.querySelector('h3')?.textContent.includes('Mérési adatok'));
    return card?.querySelector('tbody tr').children[3].textContent;
  })()`, '304.752');
  await evalJs(`(() => {
    const inp = document.querySelector('#rc-body tr:nth-child(1) td:nth-child(3) input');
    inp.value = '9x.0000';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(600);
  await check('a hibás szöget piros keret jelöli', `document.querySelector('#rc-body tr:nth-child(1) td:nth-child(3) input').classList.contains('rc-invalid')`, true);
  await check('a hibás szög mellett a hibaüzenet is megjelenik', `/érvénytelen magassági szög/.test(document.getElementById('rc-issues').textContent)`, true);
  await check('a hibás szög emberi alakja jelzi a hibát', `document.querySelector('#rc-body tr:nth-child(1) td:nth-child(3) .rc-dms').textContent`, 'érvénytelen szög');
  await evalJs(`(() => {
    const inp = document.querySelector('#rc-body tr:nth-child(1) td:nth-child(3) input');
    inp.value = '91.2345';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(600);
  await check('a javított szög után nincs hibaüzenet', `document.getElementById('rc-issues').textContent`, '');
  await evalJs(`document.getElementById('rc-add').click()`);
  await sleep(400);
  await check('új mérési sor hozzáadható', `document.querySelectorAll('#rc-body tr').length`, 4);
  await check('az új sor sorszáma a következő', `document.querySelector('#rc-body tr:nth-child(4) td:nth-child(1) input').value`, '4');
  await evalJs(`document.querySelector('#rc-body tr:nth-child(4) button.glyph').click()`);
  await sleep(400);
  await check('a mérési sor törölhető', `document.querySelectorAll('#rc-body tr').length`, 3);
  await evalJs(`document.getElementById('net-open-recorder').click()`);
  await sleep(200);
  await check('a hálózatról is megnyitható az Adatrögzítő', `document.getElementById('win-recorder').classList.contains('active')`, true);

  /* ---------- Térbeli transzformáció/Átszámítás ---------- */
  await evalJs(`document.getElementById('tr-sample').click()`);
  await sleep(1000);

  /* ---------- interpoláció a közös pontok javításaiból (súgó 65., 68. o.) ---------- */
  const interpCard = `[...document.querySelectorAll('#tr-results .card')].find(c => c.querySelector('h3')?.textContent === 'Interpoláció számítása (a közös pontok javításaiból)')`;
  await check('a paraméterszámításnál van interpoláció jelölőnégyzet', `!!document.getElementById('tr-interp')`, true);
  await check('interpoláció nélkül nincs interpolációs szakasz', `!!(${interpCard})`, false);
  await evalJs(`(() => { const c = document.getElementById('tr-interp'); c.checked = true; c.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(1000);
  await check('interpolációval megjelenik az interpolációs szakasz', `!!(${interpCard})`, true);
  await check(
    'az interpoláció pontonként a javítást és a felhasznált közös pontokat adja',
    `(() => {
      const rows = [...(${interpCard}).querySelectorAll('tbody tr')];
      return rows.length === 2 && rows.every(r => r.children.length === 5 && r.children[4].textContent.trim() !== '');
    })()`,
    true,
  );
  await check(
    'az A pont a három legközelebbi közös pontot használja (6, 3, 5)',
    `(() => {
      const rows = [...(${interpCard}).querySelectorAll('tbody tr')];
      const a = rows.find(r => r.children[0].textContent === 'A');
      return a?.children[4].textContent;
    })()`,
    '6, 3, 5',
  );
  await check(
    'a B pont a maga három legközelebbi közös pontját használja (2, 6, 4)',
    `(() => {
      const rows = [...(${interpCard}).querySelectorAll('tbody tr')];
      const b = rows.find(r => r.children[0].textContent === 'B');
      return b?.children[4].textContent;
    })()`,
    '2, 6, 4',
  );
  await check(
    'az interpoláció a transzformált koordinátákat mm-nél kisebb mértékben javítja',
    `(() => {
      const rows = [...(${interpCard}).querySelectorAll('tbody tr')];
      return rows.every(r => [1, 2, 3].every(k => Math.abs(Number(r.children[k].textContent)) < 0.05));
    })()`,
    true,
  );
  await check(
    'az interpolált A koordináta a valódi minta szerinti (604155.24, 213879.06)',
    `(() => {
      const card = [...document.querySelectorAll('#tr-results .card')].find(c => c.querySelector('h3')?.textContent.startsWith('Átszámított pontok'));
      const tr = card && [...card.querySelectorAll('tbody tr')].find(r => r.children[0].textContent === 'A');
      if (!tr) return 'nincs A sor';
      return Math.abs(Number(tr.children[4].textContent) - 604155.241) < 0.01 && Math.abs(Number(tr.children[5].textContent) - 213879.061) < 0.01 ? 'rendben' : tr.children[4].textContent + ' / ' + tr.children[5].textContent;
    })()`,
    'rendben',
  );
  await clickTb(TB.transformApply);
  await check('az Átszámítás munkalap megnyílt', `document.getElementById('win-transform-apply').hidden`, false);
  await check('az Átszámítás munkalap aktív', `document.getElementById('win-transform-apply').classList.contains('active')`, true);
  await check('az állapotsor követi az Átszámítást', `document.getElementById('sb-view').textContent`, 'Térbeli transzformáció/Átszámítás');
  await evalJs(`document.getElementById('ta-take').click()`);
  await sleep(300);
  await check('a paraméterek átvétele a kiinduló rendszert is hozza', `document.getElementById('ta-from').value`, 'WGS84_XYZ');
  await check('a paraméterek átvétele a cél rendszert is hozza', `document.getElementById('ta-to').value`, 'EOV');
  await check('az eltolás értéke kitöltődött', `(() => { const v = Number(document.getElementById('ta-tx').value); return Number.isFinite(v) && v !== 0; })()`, true);
  await check('a forgatás értéke kitöltődött', `(() => { const v = Number(document.getElementById('ta-rz').value); return Number.isFinite(v) && v !== 0; })()`, true);
  await evalJs(`(() => {
    const e = document.getElementById('ta-points');
    e.value = 'A 4113380.501 1371657.548 4662148.720';
    e.dispatchEvent(new Event('input'));
    return true;
  })()`);
  await sleep(600);
  await check('az átszámított pont a valódi minta szerinti (A → 604155.24, 213879.06)', `(() => {
    const tr = [...document.querySelectorAll('#ta-results table tbody tr')].find(r => r.children[0].textContent === 'A');
    if (!tr) return 'nincs A sor';
    const dy = Math.abs(Number(tr.children[4].textContent) - 604155.24);
    const dx = Math.abs(Number(tr.children[5].textContent) - 213879.06);
    return dy < 2 && dx < 2 ? 'rendben' : tr.children[4].textContent + ' / ' + tr.children[5].textContent;
  })()`, 'rendben');
  await check('az Átszámításnál van interpoláció jelölőnégyzet', `!!document.getElementById('ta-interp')`, true);
  await check('az Átszámítás interpoláció nélkül a sima eredményt adja', `[...document.querySelectorAll('#ta-results .card h3')].some(e => e.textContent === 'Interpoláció számítása (a közös pontok javításaiból)')`, false);
  await evalJs(`(() => { const c = document.getElementById('ta-interp'); c.checked = true; c.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(900);
  await check('az Átszámításnál is megjelenik az interpolációs szakasz', `[...document.querySelectorAll('#ta-results .card h3')].some(e => e.textContent === 'Interpoláció számítása (a közös pontok javításaiból)')`, true);
  await check(
    'az átszámítás interpolációja is a közös pontokból dolgozik',
    `(() => {
      const card = [...document.querySelectorAll('#ta-results .card')].find(c => c.querySelector('h3')?.textContent === 'Interpoláció számítása (a közös pontok javításaiból)');
      const tr = [...card.querySelectorAll('tbody tr')].find(r => r.children[0].textContent === 'A');
      return !!tr && tr.children[4].textContent.trim() !== '';
    })()`,
    true,
  );
  await check('az átszámítás interpolációjával sincs hiba', `document.querySelectorAll('#ta-issues .issue.error').length`, 0);
  await evalJs(`(() => {
    const e = document.getElementById('ta-2step-id');
    e.value = 'A';
    document.getElementById('ta-2step-add').click();
    return true;
  })()`);
  await sleep(600);
  await check('a kétlépcsős módszer a közös pontokhoz fűzte az A pontot', `/A[ ,]/.test(document.getElementById('tr-common-from').value)`, true);
  await check('a közös pontok cél listája is megkapta az A pontot', `/A[ ,]/.test(document.getElementById('tr-common-to').value)`, true);
  await check('az Átszámításnál három letöltés készül', `document.querySelectorAll('#ta-downloads button').length >= 2`, true);

  /* ---------- Adatcsere/Koordináta állomány készítése ---------- */
  await clickTb(TB.exchangeFile);
  await check('a Koordináta állomány munkalap megnyílt', `document.getElementById('win-exchange-file').hidden`, false);
  await check('az állapotsor követi a Koordináta állományt', `document.getElementById('sb-view').textContent`, 'Adatcsere/Koordináta állomány készítése');
  await check('induláskor egy sor van', `document.querySelectorAll('#xf-body tr').length`, 1);
  await evalJs(`(() => {
    const rows = [
      ['101', 'yxm', '602000.000', '204500.000', '110.000'],
      ['2', 'geo', '47.182231643', '19.182231643', '145.000'],
    ];
    for (let i = 0; i < rows.length; i++) {
      if (i === 1) document.getElementById('xf-add').click();
      let tr = document.querySelectorAll('#xf-body tr')[i];
      const kind = tr.querySelector('select');
      kind.value = rows[i][1];
      kind.dispatchEvent(new Event('change'));
      tr = document.querySelectorAll('#xf-body tr')[i];
      const ins = tr.querySelectorAll('input.xf-cell');
      ins[0].value = rows[i][0];
      ins[0].dispatchEvent(new Event('input'));
      for (let k = 0; k < 3; k++) {
        ins[k + 1].value = rows[i][k + 2];
        ins[k + 1].dispatchEvent(new Event('input'));
      }
    }
    return true;
  })()`);
  await sleep(700);
  await check('a sorok száma kettő', `document.querySelectorAll('#xf-body tr').length`, 2);
  await check('a pontszám kiírása a GeoCalc adatbázisban', `document.getElementById('xf-preview').textContent.includes('101, 602000.000, 204500.000, 110.000')`, true);
  await check('a földrajzi pont a tizedes fokra alakul', `document.getElementById('xf-preview').textContent.includes('2, 47.306199008, 19.306199008, 145.000')`, true);
  await check('a jegyzék létszáma látható', `document.getElementById('xf-count').textContent`, '2 sor');
  await check('a kimenet három formátumban menthető', `['GeoCalc adatbázis (.pyx2)', '.PYX (fix szélességű)', 'Földrajzi (szöveges)'].every(n => [...document.querySelectorAll('#xf-downloads button')].some(b => b.textContent === n))`, true);

  /* ---------- Adatcsere/AKG jegyzőkönyv ---------- */
  await clickTb(TB.exchangeAkg);
  await check('az AKG munkalap megnyílt', `document.getElementById('win-exchange-akg').hidden`, false);
  await check('az állapotsor követi az AKG-t', `document.getElementById('sb-view').textContent`, 'Adatcsere/AKG jegyzőkönyv készítése');
  await evalJs(`document.getElementById('akg-sample').click()`);
  await sleep(700);
  await check('a minta két parcellát ad', `/2 parcella/.test(document.getElementById('akg-status').textContent)`, true);
  await check('a parcella választó két tételt ad', `document.getElementById('akg-parcel').options.length`, 2);
  await check('az első parcella területe 10 000 m²', `[...document.querySelectorAll('#akg-results .card')].find(c => c.querySelector('h3')?.textContent === 'Parcellák').querySelectorAll('tbody tr')[0].children[4].textContent`, '10000');
  await check('a második parcella területe 5 000 m²', `[...document.querySelectorAll('#akg-results .card')].find(c => c.querySelector('h3')?.textContent === 'Parcellák').querySelectorAll('tbody tr')[1].children[4].textContent`, '5000');
  await check('a jegyzőkönyv a közös adatokat is tartalmazza', `document.getElementById('akg-results').textContent.includes('Mérést végző')`, true);
  await check('a generált állományok neve a súgó szerinti', `/AKG_X_X_1\\.pdf/.test(document.getElementById('akg-results').textContent)`, true);
  await check('a sarokpontok szakasza is megjelenik', `document.getElementById('akg-results').textContent.includes('jelölőpont')`, true);
  await check('az AKG-nál három letöltés készül', `document.querySelectorAll('#akg-downloads button').length`, 3);
  await evalJs(`(() => {
    const e = document.getElementById('akg-celprg');
    e.value = 'a ad 1';
    document.getElementById('akg-normalize').click();
    return true;
  })()`);
  await sleep(200);
  await check('a célprogram azonosítója „a) ad) 1.” lesz', `document.getElementById('akg-celprg').value`, 'a) ad) 1.');
  await evalJs(`(() => {
    const s = document.getElementById('akg-parcel');
    s.value = '1';
    s.dispatchEvent(new Event('change'));
    return true;
  })()`);
  await sleep(300);
  await check('a második parcella választásakor a mezők átváltanak', `document.getElementById('akg-id').value`, '2');
  await check('az első parcella célprogramja megmaradt', `(() => { const s = document.getElementById('akg-parcel'); s.value = '0'; s.dispatchEvent(new Event('change')); return document.getElementById('akg-celprg').value === 'a) ad) 1.'; })()`, true);

  /* ---------- gyorsbillentyűk ---------- */
  await clickNav('gs-work');
  await evalJs(`(() => {
    const e = document.getElementById('editor');
    e.value = 'k_\\n1 , 1000 , 2000\\n;;\\n';
    e.dispatchEvent(new Event('input'));
    e.blur();
    return true;
  })()`);
  await sleep(300);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }))`);
  await check(
    'a Ctrl+A mindent kijelöl a szerkesztőben',
    `(() => { const e = document.getElementById('editor'); return document.activeElement === e && e.selectionStart === 0 && e.selectionEnd === e.value.length && e.value.length > 10; })()`,
    true,
  );
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))`);
  await sleep(1000);
  checkNode('a Ctrl+S .gcd állományt tölt le', readdirSync(DL).includes('Névtelen.gcd'), true);
  checkNode('a .gcd tartalma a szerkesztő szövege', readFileSync(join(DL, 'Névtelen.gcd'), 'utf8').includes('k_'), true);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true }))`);
  await sleep(500);
  await check('a Ctrl+N új (üres) munkaterületet ad', `document.getElementById('editor').value.trim()`, '');

  /* ---------- hibák ---------- */
  const exc = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown');
  const logs = cdp.events.filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error');
  const consoleErr = cdp.events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error');

  for (const [ok, name, got, want] of results)
    console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n       kapott: ${got}\n       várt:   ${want}`}`);
  console.log(`\n${results.filter((r) => r[0]).length}/${results.length} rendben.`);
  console.log(`\nkezeletlen kivétel: ${exc.length}` + (exc.length ? '\n  ' + exc.map((e) => JSON.stringify(e.params.exceptionDetails)).join('\n  ') : ''));
  console.log(`naplózott hiba: ${logs.length}` + (logs.length ? '\n  ' + logs.map((e) => e.params.entry.text).join('\n  ') : ''));
  console.log(`console.error: ${consoleErr.length}`);

  const failed = results.filter((r) => !r[0]).length + exc.length + logs.length + consoleErr.length;
  await cdp.send('Target.closeTarget', { targetId });
  ws.close();
  if (failed > 0) {
    console.error(`\n${failed} ellenőrzés nem sikerült – a végpróba elbukott.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('A teszt nem futott le:', e.message);
  process.exit(1);
});
