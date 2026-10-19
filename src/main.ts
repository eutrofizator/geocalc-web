import './style.css';
import { run, type RunResult } from './core/engine';
import { toPyx } from './core/export';
import { EXAMPLES } from './examples';
import { MODULES } from './modules-info';
import { initDescriptorView, refreshDescriptor } from './descriptor-view';
import { initExchangeView, refreshExchange } from './exchange-view';
import { DEFAULT_LOGO_SVG, logoDataUri } from './core/logo';
import { initNetworkView } from './network-view';
import { initNetSettingsView } from './net-settings-view';
import { initRecorderView } from './recorder-view';
import { downloadReport, initSettingsView, onMeta, renderCover } from './report-view';
import { initShell, setCodeProvider } from './shell';
import { initTransformApplyView } from './transform-apply-view';
import { initTransformView } from './transform-view';
import { initExchangeFileView } from './exchange-file-view';
import { initAkgView } from './akg-view';
import { $, download, el, readText, renderSection, storage } from './ui';

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
    insert.title = m.ready ? `${m.code} váz beszúrása` : 'Ez a számítás még nem érhető el';
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
  editor.dispatchEvent(new Event('input'));
  compute();
});

$('btn-save').addEventListener('click', () => download('munka.gcd', editor.value));

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

document.addEventListener('keydown', (e) => {
  if (e.key === 'F5' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault();
    compute();
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

/* ---------- a burok: menüsor, ikonsáv, munkalapok, állapotsor ---------- */
setCodeProvider(() => MODULES.map((m) => ({ id: m.code, name: m.name })));

const shell = initShell({
  new: () => $<HTMLButtonElement>('btn-new').click(),
  open: () => fileOpen.click(),
  save: () => download('munka.gcd', editor.value),
  print: () => window.print(),
  run: () => compute(),
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
  about: () => shell.open('help'),
});

shell.onShow((id) => {
  if (id === 'coords') renderCoordsPreview(last);
  if (id === 'descriptor') refreshDescriptor();
  if (id === 'exchange-coords') refreshExchange();
});

// A hálózati munkaterületről a beállítások munkalapjára.
$('net-open-settings').addEventListener('click', () => shell.open('network-settings'));
// A nyers mérések (Hz, Zi, ferde távolság) redukciója az Adatrögzítő munkalapon történik.
$('net-open-recorder').addEventListener('click', () => shell.open('recorder'));

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
initNetworkView();
initNetSettingsView();
initRecorderView();
initTransformView();
initTransformApplyView();
initExchangeFileView();
initAkgView();
onMeta(() => {
  if (last) render(last);
});
compute();
renderCoordsPreview(last);
shell.open('calc');
