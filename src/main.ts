import './style.css';
import { run, type RunResult } from './core/engine';
import { toPyx } from './core/export';
import { EXAMPLES } from './examples';
import { MODULES } from './modules-info';
import { initDescriptorView, refreshDescriptor } from './descriptor-view';
import { initExchangeView, refreshExchange } from './exchange-view';
import { DEFAULT_LOGO_SVG, logoDataUri } from './core/logo';
import { parseSession, serializeSession, sessionFileName } from './core/session';
import { initNetworkView } from './network-view';
import { initNetSettingsView } from './net-settings-view';
import { initRecorderView, recorderSettings } from './recorder-view';
import { initFieldBookView } from './field-book-view';
import { downloadReport, initSettingsView, onMeta, renderCover } from './report-view';
import { SHEETS, initShell, setCodeProvider } from './shell';
import { initTransformApplyView } from './transform-apply-view';
import { initTransformView } from './transform-view';
import { initExchangeFileView } from './exchange-file-view';
import { initAkgView } from './akg-view';
import { initAboutView } from './about-view';
import { initGeneralSettingsView, rememberSheet, startSheet } from './general-settings-view';
import { initGeoConvertView } from './geo-convert-view';
import { $, csvButton, download, el, readText, renderReportTree, renderSection, storage } from './ui';

/* ---------- tárolás (csak kényelmi funkció, hiba esetén is működik az oldal) ---------- */
const DRAFT_KEY = 'geocalc-web.draft';
const loadDraft = () => storage.get(DRAFT_KEY);
const saveDraft = (v: string) => storage.set(DRAFT_KEY, v);

/* ---------- állapot ---------- */
const CALC_TITLE = 'GEODÉZIAI SZÁMÍTÁSOK';
const editor = $<HTMLTextAreaElement>('editor');
const auto = $<HTMLInputElement>('auto');
const files = new Map<string, { name: string; content: string }>();
let last: RunResult | null = null;
let lastLoadedSource = '';
let timer: number | undefined;
/** A munkaterület állományneve (a szerkesztő állapotsorában és a címsorban). */
let fileName = 'Névtelen.gcd';

function setFileName(name: string): void {
  fileName = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.gcd`;
  $('ed-file').textContent = fileName;
  $('workname').textContent = fileName.replace(/\.[^.]+$/, '');
}

/* ---------- szerkesztő ---------- */
function insertAtCursor(text: string): void {
  const { selectionStart: s, selectionEnd: e, value } = editor;
  const needsBreak = s > 0 && value[s - 1] !== '\n';
  editor.setRangeText((needsBreak ? '\n' : '') + text, s, e, 'end');
  editor.focus();
  editor.dispatchEvent(new Event('input'));
}

function loadExample(id: string): void {
  const ex = EXAMPLES.find((x) => x.id === id);
  if (!ex) return;
  const dirty = editor.value.trim() !== '' && editor.value !== lastLoadedSource;
  if (dirty && !confirm('A szerkesztő tartalmát lecseréli a példa. Folytatod?')) return;
  editor.value = ex.source;
  lastLoadedSource = ex.source;
  editor.dispatchEvent(new Event('input'));
  editor.focus();
}

function gotoLine(line: number): void {
  const lines = editor.value.split('\n');
  const start = lines.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
  const end = start + (lines[line - 1]?.length ?? 0);
  editor.focus();
  editor.setSelectionRange(start, end);
  const lh = parseFloat(getComputedStyle(editor).lineHeight) || 21;
  editor.scrollTop = Math.max(0, (line - 3) * lh);
}

/* ---------- megjelenítés ---------- */
function render(result: RunResult): void {
  const status = $('status');
  const issuesBox = $('issues');
  const resultsBox = $('results');
  const downloads = $('downloads');
  issuesBox.replaceChildren();
  resultsBox.replaceChildren();
  downloads.replaceChildren();

  const errors = result.issues.filter((i) => i.level === 'error').length;
  const warnings = result.issues.filter((i) => i.level === 'warning').length;
  const time = new Date().toLocaleTimeString('hu-HU');
  status.className = errors > 0 ? 'status has-error' : 'status';
  status.textContent =
    result.sections.length === 0 && result.issues.length === 0
      ? ''
      : `Kiszámítva ${time} · ${result.sections.length} szakasz · ${result.computed.length} számított pont · ${errors} hiba, ${warnings} figyelmeztetés`;
  shell.setCounts(`${result.computed.length} számított pont · ${errors} hiba, ${warnings} figyelmeztetés`);
  shell.setHint(errors > 0 ? 'A számítás hibát talált – lásd a jegyzőkönyvet.' : `Kiszámítva ${time}`);
  if (shell.isOpen('coords')) renderCoordsPreview(result);
  if (shell.isOpen('descriptor')) refreshDescriptor();
  if (shell.isOpen('exchange-coords')) refreshExchange();

  const label = { error: 'Hiba', warning: 'Figyelem', info: 'Info' } as const;
  for (const i of result.issues) {
    const row = el('div', `issue ${i.level}`);
    row.append(el('span', 'tag', label[i.level]), el('span', undefined, i.message));
    if (i.line !== undefined) {
      const line = i.line;
      const b = el('button', 'goto', `${line}. sor`);
      b.type = 'button';
      b.addEventListener('click', () => gotoLine(line));
      row.append(b);
    }
    issuesBox.append(row);
  }

  if (result.sections.length === 0) {
    if (result.issues.length === 0) {
      resultsBox.append(el('p', 'empty', 'Írd be a számítást, vagy a bal oldali listából tölts be egy példát.'));
    }
  } else {
    resultsBox.append(renderCover(CALC_TITLE));
    for (const s of result.sections) resultsBox.append(renderSection(s));
  }
  renderReportTree($('report-tree'), resultsBox);

  const notes = new Set<string>();
  for (const f of result.exports) {
    const b = el('button', undefined, `${f.name} letöltése`);
    b.type = 'button';
    if (f.note) {
      b.title = f.note;
      notes.add(f.note);
    }
    b.addEventListener('click', () => download(f.name, f.content));
    downloads.append(b);
  }
  if (result.sections.length > 0) downloads.append(csvButton('szamitas_tablazatok', () => result.sections));
  for (const note of notes) downloads.append(el('span', 'fmt-note', note));
}

function compute(): void {
  window.clearTimeout(timer);
  const source = editor.value;
  const coordFiles: Record<string, string> = {};
  for (const [key, f] of files) coordFiles[key] = f.content;
  try {
    last = run(source, { files: coordFiles });
    render(last);
  } catch (e) {
    // Belső hiba: nem a felhasználó bemenete a hibás, ezért külön jelezzük, és az oldal működőképes marad.
    last = null;
    $('results').replaceChildren();
    $('downloads').replaceChildren();
    const box = $('issues');
    box.replaceChildren();
    const row = el('div', 'issue error');
    row.append(el('span', 'tag', 'Belső hiba'), el('span', undefined, `A számítás nem futott le: ${e instanceof Error ? e.message : String(e)}`));
    box.append(row);
    $('status').textContent = '';
  }
}

function schedule(): void {
  saveDraft(editor.value);
  if (!auto.checked) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(compute, 350);
}

/* ---------- oldalsáv ---------- */
function buildModuleList(): void {
  const ul = $('module-list');
  for (const m of MODULES) {
    const li = el('li', m.ready ? undefined : 'planned');
    const insert = el('button', 'insert');
    insert.type = 'button';
    insert.disabled = !m.ready;
    insert.title = m.ready ? `${m.code} – ${m.name}: a kód vázának beszúrása` : 'Ez a számítás még nem érhető el';
    insert.append(el('span', 'chip', m.code), el('span', 'label', m.name));
    if (m.ready) insert.addEventListener('click', () => insertAtCursor(m.template));
    li.append(insert);
    if (m.ready && m.exampleId) {
      const ex = el('button', 'example', 'példa');
      ex.type = 'button';
      ex.title = `${m.code} – a súgó mintapéldájának betöltése`;
      ex.addEventListener('click', () => loadExample(m.exampleId!));
      li.append(ex);
    } else if (!m.ready) {
      li.append(el('span', 'soon-tag', 'hamarosan'));
    }
    ul.append(li);
  }
}

function renderFiles(): void {
  const ul = $('file-list');
  ul.replaceChildren();
  if (files.size === 0) {
    ul.append(el('li', 'empty', 'Még nincs feltöltött állomány.'));
    return;
  }
  for (const [key, f] of files) {
    const li = el('li');
    li.append(el('span', undefined, f.name));
    const rm = el('button', 'remove', 'Törlés');
    rm.type = 'button';
    rm.addEventListener('click', () => {
      files.delete(key);
      renderFiles();
      schedule();
    });
    li.append(rm);
    ul.append(li);
  }
}

/* ---------- események ---------- */
editor.addEventListener('input', schedule);
auto.addEventListener('change', () => auto.checked && compute());
$('btn-run').addEventListener('click', compute);

$('btn-new').addEventListener('click', () => {
  if (editor.value.trim() !== '' && editor.value !== lastLoadedSource && !confirm('Az új munkaterület törli a jelenlegi tartalmat. Folytatod?')) return;
  editor.value = '';
  lastLoadedSource = '';
  setFileName('Névtelen.gcd');
  editor.dispatchEvent(new Event('input'));
  compute();
  editor.focus();
});

const fileOpen = $<HTMLInputElement>('file-open');
$('btn-open').addEventListener('click', () => fileOpen.click());
fileOpen.addEventListener('change', async () => {
  const f = fileOpen.files?.[0];
  fileOpen.value = '';
  if (!f) return;
  editor.value = await readText(f);
  lastLoadedSource = editor.value;
  setFileName(f.name);
  editor.dispatchEvent(new Event('input'));
  compute();
});

$('btn-save').addEventListener('click', () => download(fileName, editor.value));
$('btn-save-as').addEventListener('click', () => {
  const name = prompt('Az állomány neve:', fileName);
  if (!name || name.trim() === '') return;
  setFileName(name.trim());
  download(fileName, editor.value);
});

/* ---------- a szerkesztő ikonsora és állapotsora (a valódi program beépített szerkesztője) ---------- */
function editCommand(cmd: 'undo' | 'cut' | 'copy'): void {
  editor.focus();
  // A böngésző saját szerkesztőparancsai a szövegmező visszavonási sorát is megtartják.
  document.execCommand(cmd);
}
$('btn-undo').addEventListener('click', () => editCommand('undo'));
$('btn-cut').addEventListener('click', () => editCommand('cut'));
$('btn-copy').addEventListener('click', () => editCommand('copy'));
$('btn-paste').addEventListener('click', async () => {
  editor.focus();
  try {
    const text = await navigator.clipboard.readText();
    document.execCommand('insertText', false, text);
  } catch {
    shell.setHint('A vágólap olvasását a böngésző nem engedte – használd a Ctrl+V billentyűt.');
  }
});
$('btn-selall').addEventListener('click', () => {
  editor.focus();
  editor.select();
});

const CODES_KEY = 'geocalc-web.codes-panel';
const codesBtn = $('btn-codes');
const setCodesPanel = (on: boolean) => {
  $('calc-codes').hidden = !on;
  codesBtn.setAttribute('aria-pressed', String(on));
  storage.set(CODES_KEY, on ? '1' : '0');
};
codesBtn.addEventListener('click', () => setCodesPanel($('calc-codes').hidden === true));
setCodesPanel(storage.get(CODES_KEY) !== '0');

let overwrite = false;
const edPos = $('ed-pos');
const edMode = $('ed-mode');
function updateCaret(): void {
  const upto = editor.value.slice(0, editor.selectionStart);
  const line = upto.split('\n').length;
  const col = upto.length - upto.lastIndexOf('\n');
  edPos.textContent = `${line}:${col}`;
}
for (const ev of ['keyup', 'click', 'select', 'input', 'focus']) editor.addEventListener(ev, updateCaret);
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Insert' && !e.shiftKey && !e.ctrlKey) {
    overwrite = !overwrite;
    edMode.textContent = overwrite ? 'Átírás' : 'Beszúrás';
    e.preventDefault();
  }
});
// Átíró módban a beírt karakter a kurzor utáni karaktert váltja fel (sor végén nem nyel el sortörést).
editor.addEventListener('beforeinput', (e) => {
  if (!overwrite || e.inputType !== 'insertText') return;
  const { selectionStart: s, selectionEnd: end, value } = editor;
  if (s === end && s < value.length && value[s] !== '\n' && value[s] !== '\r') editor.setSelectionRange(s, s + 1);
});

let zoom = 100;
const applyZoom = () => {
  $('results').style.zoom = String(zoom / 100);
  $('zoom-level').textContent = `${zoom}%`;
};
$('btn-zoom-in').addEventListener('click', () => {
  zoom = Math.min(200, zoom + 10);
  applyZoom();
});
$('btn-zoom-out').addEventListener('click', () => {
  zoom = Math.max(50, zoom - 10);
  applyZoom();
});

const fileCoords = $<HTMLInputElement>('file-coords');
$('btn-files').addEventListener('click', () => fileCoords.click());
fileCoords.addEventListener('change', async () => {
  const list = [...(fileCoords.files ?? [])];
  fileCoords.value = '';
  for (const f of list) files.set(f.name.toLowerCase(), { name: f.name, content: await readText(f) });
  renderFiles();
  compute();
});

$('btn-txt').addEventListener('click', () => {
  if (last) downloadReport('eredmeny.txt', CALC_TITLE, last.sections);
});
$('btn-print').addEventListener('click', () => window.print());

/** Gépelés közben (szövegmezőben) csak a szerkesztőre vonatkozó gyorsbillentyűk hatnak. */
const typingInForm = (): boolean => {
  const t = document.activeElement;
  return !!t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
};

document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'F5' || (e.key === 'Enter' && ctrl)) {
    e.preventDefault();
    compute();
    return;
  }
  if (!ctrl || e.altKey) return;
  const key = e.key.toLowerCase();
  // A menükben kiírt gyorsbillentyűk (Fájl, Szerkesztés) valóban működnek.
  if (key === 's') {
    e.preventDefault();
    download(fileName, editor.value);
  } else if (key === 'o') {
    e.preventDefault();
    fileOpen.click();
  } else if (key === 'n') {
    e.preventDefault();
    $<HTMLButtonElement>('btn-new').click();
  } else if (key === 'p') {
    e.preventDefault();
    window.print();
  } else if (key === 'a' && shell.active() === 'calc' && (!typingInForm() || document.activeElement === editor)) {
    e.preventDefault();
    editor.focus();
    editor.select();
  }
});

/* ---------- koordináta-előnézet a „Mérési adatok és koordináták” munkalapon ---------- */
function renderCoordsPreview(result: RunResult | null): void {
  const box = $('coords-preview');
  box.replaceChildren();
  const points = result ? [...result.points.values()] : [];
  if (points.length === 0) {
    box.append(
      el(
        'p',
        'empty',
        'Még nincs beolvasott koordináta. Írd be a K_ blokkot a Munkaterületen, vagy tölts fel állományt.',
      ),
    );
    return;
  }
  points.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  box.append(
    renderSection({
      kind: 'coords-preview',
      title: 'Beolvasott koordináták',
      columns: ['Pontszám', 'Y', 'X', 'M', 'Kód'],
      rows: points.map((p) => ({ cells: [p.id, p.y.toFixed(3), p.x.toFixed(3), (p.m ?? 0).toFixed(3), p.code] })),
    }),
  );
}

/* ---------- munkamenet (.gcs): a teljes munkaterület egy fájlban ---------- */
function sessionSave(): void {
  let all: Record<string, string> = {};
  let available = true;
  try {
    for (const key of Object.keys(localStorage)) all[key] = localStorage.getItem(key) ?? '';
  } catch {
    available = false;
  }
  const iso = new Date().toISOString();
  const name = sessionFileName(iso);
  download(name, serializeSession(all, iso), 'application/json');
  shell.setHint(
    available
      ? `A munkamenet mentve: ${name} (${Object.keys(all).filter((k) => k.startsWith('geocalc-web.')).length} munkalap).`
      : 'A böngésző tárolója nem érhető el, ezért a munkamenet nem tartalmaz munkalapot.',
  );
}

function sessionLoad(): void {
  let existing = 0;
  try {
    existing = Object.keys(localStorage).filter((k) => k.startsWith('geocalc-web.')).length;
  } catch {
    /* a tároló hiánya nem akadály */
  }
  if (existing > 0 && !confirm('A munkamenet betöltése felülírja a jelenlegi munkalapok tartalmát. Folytatod?')) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.gcs,.json,application/json';
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    const parsed = parseSession(await readText(f));
    if (!parsed.ok) {
      shell.setHint(`A munkamenet betöltése nem sikerült: ${parsed.error}`);
      alert(`A munkamenet betöltése nem sikerült.\n\n${parsed.error}`);
      return;
    }
    try {
      for (const [key, value] of parsed.entries) localStorage.setItem(key, value);
    } catch {
      shell.setHint('A böngésző tárolója nem érhető el, ezért a munkamenet nem tölthető be.');
      return;
    }
    shell.setHint(`A munkamenet betöltve (${parsed.entries.length} munkalap) – az oldal újratöltődik.`);
    location.reload();
  });
  input.click();
}

/* ---------- a burok: menüsor, ikonsáv, navigátor, munkalapok, állapotsor ---------- */
setCodeProvider(() => MODULES.map((m) => ({ id: m.code, name: m.name })));

// A JS-ben épülő munkalapok a burok előtt jönnek létre, hogy a navigátor már megtalálja őket.
initAboutView();
initGeoConvertView();
const generalSettings = initGeneralSettingsView({ sessionSave: () => sessionSave(), sessionLoad: () => sessionLoad() });

const shell = initShell({
  new: () => $<HTMLButtonElement>('btn-new').click(),
  open: () => fileOpen.click(),
  save: () => download(fileName, editor.value),
  print: () => window.print(),
  run: () => compute(),
  'session-save': sessionSave,
  'session-load': sessionLoad,
  'select-all': () => {
    editor.focus();
    editor.select();
  },
  'insert-code': (arg) => {
    const m = MODULES.find((x) => x.code === (arg ?? ''));
    if (m) insertAtCursor(m.template);
  },
  'db-open': () => $<HTMLButtonElement>('btn-files').click(),
  'db-save': () => {
    if (last) download('adatbazis.PYX', toPyx([...last.points.values()]));
  },
  'settings-save': () => {
    saveDraft(editor.value);
    shell.setHint('A beállítások mentve a böngésző tárolójába.');
  },
  about: () => shell.open('about'),
});

shell.onShow((id) => {
  rememberSheet(id);
  if (id === 'general-settings') generalSettings.refresh();
  if (id === 'coords') renderCoordsPreview(last);
  if (id === 'descriptor') refreshDescriptor();
  if (id === 'exchange-coords') refreshExchange();
});

// A hálózati munkaterületről a beállítások munkalapjára.
$('net-open-settings').addEventListener('click', () => shell.open('network-settings'));
// A nyers mérések (Hz, Zi, ferde távolság) redukciója az Adatrögzítő munkalapon történik.
$('net-open-recorder').addEventListener('click', () => shell.openNav('rc-data'));

/* ---------- indulás ---------- */
// Az oldal ikonja ugyanaz a geodéziai jelkép, beágyazva (nincs külső hivatkozás).
const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = logoDataUri(DEFAULT_LOGO_SVG);
document.head.append(favicon);

initSettingsView();
initDescriptorView({
  getPoints: () => last?.points ?? [],
  applyCode: (code) => {
    const cur = editor.value.replace(/\s+$/, '');
    editor.value = cur === '' ? code : `${cur}\r\n${code}`;
    editor.dispatchEvent(new Event('input'));
    compute();
    shell.open('calc');
  },
});
initExchangeView({
  getPoints: () => last?.points ?? [],
  getComputed: () => new Set((last?.computed ?? []).map((p) => p.id)),
});
buildModuleList();
renderFiles();
editor.value = loadDraft() || (EXAMPLES.find((x) => x.id === 'po')?.source ?? '');
lastLoadedSource = editor.value;
initNetworkView({ openNav: (id) => shell.openNav(id) });
initNetSettingsView();
initRecorderView();
initFieldBookView({
  settings: recorderSettings,
  toNetwork: (gmj, coordinates) => {
    // A konvertált jegyzőkönyv a Hálózatkiegyenlítés munkaterületére kerül (súgó 12. o.).
    const gmjBox = $<HTMLTextAreaElement>('net-gmj');
    gmjBox.value = gmj;
    gmjBox.dispatchEvent(new Event('input'));
    if (coordinates !== null) {
      const coordBox = $<HTMLTextAreaElement>('net-coords');
      coordBox.value = coordinates;
      coordBox.dispatchEvent(new Event('input'));
    }
  },
  openNav: (id) => shell.openNav(id),
  setHint: (t) => shell.setHint(t),
});
initTransformView();
initTransformApplyView();
initExchangeFileView();
initAkgView();
onMeta(() => {
  if (last) render(last);
});
compute();
renderCoordsPreview(last);
const first = startSheet();
shell.open(SHEETS.some((x) => x.id === first) ? first : 'about');
