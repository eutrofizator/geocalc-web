import { formatDmsPrecise, formatDmsText, parseDms } from './core/angle';
import { CalcError } from './core/errors';
import {
  DEFAULT_RECORDER_SETTINGS,
  EMPTY_DRAFT,
  MISSING_DISTANCE_RULES,
  RECORDER_DRAFT_FIELDS,
  RECORDER_DRAFT_LABELS,
  RECORDER_TYPES,
  REDUCTION_MODES,
  REDUCTION_PROJECTIONS,
  applyProjection,
  averagesFromCoordinates,
  draftToLine,
  draftsToText,
  formatTvetInput,
  parseRecorderRows,
  parseTvet,
  projectionDef,
  reduceAll,
  reduceMeasurement,
  textToDrafts,
  type MeasurementRow,
  type RecorderDraft,
  type RecorderSettings,
  type ReduceResult,
  type ReductionMode,
} from './core/recorder';
import type { Section } from './core/types';
import { downloadReport, onMeta, renderCover } from './report-view';
import { $, download, el, readText, renderSection, storage } from './ui';

/**
 * Az Adatrögzítő/Beállítások munkalap (súgó 12–15. o.).
 *
 * Az adatrögzítő típusának kiválasztása, a távolságredukció (nincs / külső program / vetületi)
 * beállítása, valamint a mért adatok redukciója. A mérések kézzel, **táblázatban** vehetők fel:
 * a Hz (vízszintes szög), a Zi (magassági szög) és a Tf (ferde távolság) beírása után a program
 * a sor mellett azonnal kiírja a számolt Tv-t (vízszintes távolság) és dM-et (magasságkülönbség).
 * A súgó mintapéldája (62. o.) a minta_felm.eov öt ismert pontjának átlagértékeit használja
 * (Y = 602147.734, X = 204807.646 m) és az átlagos magasságot kézzel 110 m-re állítja.
 */

const STORAGE_KEY = 'geocalc-web.recorder';

const SAMPLE_INPUT = [
  '1, 45.1234, 91.2345, 152.376, , , 1.500, 1.520, ko',
  '2, 130.4517, 90.5000, 205.114, , , 1.500, 1.520, torony',
  '3, 275.0900, 89.3000, 88.902, , , 1.500, 1.520, fasor',
].join('\r\n');

/** A súgó 62. oldali mintapéldájának beállításai (minta_felm.eov). */
const SAMPLE_SETTINGS: RecorderSettings = {
  ...DEFAULT_RECORDER_SETTINGS,
  reduction: 'projection',
  projection: 'EOV',
  avgY: 602147.734,
  avgX: 204807.646,
  avgM: 110,
};

interface FormState extends RecorderSettings {
  drafts: RecorderDraft[];
}

/** A számolt (a program által kitöltött) mezők: ezek a felületen csak olvashatók. */
const NUM_FIELDS = new Set<keyof RecorderDraft>(['tf', 'tv', 'dm', 'mj', 'mm']);
const ANGLE_FIELDS = new Set<keyof RecorderDraft>(['hz', 'zi']);

const fix = (n: number, d: number) => {
  const s = n.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
};

const isBlank = (d: RecorderDraft) => RECORDER_DRAFT_FIELDS.every((k) => d[k].trim() === '');

/** Egy táblázatsor értelmezése a hibaüzenetekkel együtt (a sor önállóan is feldolgozható). */
const parseDraft = (d: RecorderDraft, index: number): { m: MeasurementRow | null; issues: string[] } => {
  if (isBlank(d)) return { m: null, issues: [] };
  const no = d.no.trim() === '' ? String(index + 1) : d.no;
  const { rows, issues } = parseRecorderRows(draftToLine({ ...d, no }), index + 1);
  return { m: rows[0] ?? null, issues: issues.map((x) => x.message) };
};

/** Egy mező szövege érvényes-e (üres mindig érvényes). */
const fieldValid = (key: keyof RecorderDraft, value: string): boolean => {
  const v = value.trim();
  if (v === '') return true;
  if (key === 'code') return true;
  if (key === 'hz' || key === 'zi') {
    try {
      parseDms(v);
      return true;
    } catch {
      return false;
    }
  }
  return Number.isFinite(Number(v));
};

const RC_TITLE = 'ADATRÖGZÍTŐ / TÁVOLSÁGREDUKCIÓ';

interface RowCells {
  inputs: Partial<Record<keyof RecorderDraft, HTMLInputElement>>;
  dms: Partial<Record<'hz' | 'zi', HTMLElement>>;
  tv: HTMLElement;
  dm: HTMLElement;
  tvCell: HTMLTableCellElement;
  dmCell: HTMLTableCellElement;
}

export function initRecorderView(): void {
  const typeSel = $<HTMLSelectElement>('rc-type');
  const typeNote = $('rc-type-note');
  const missing = $<HTMLSelectElement>('rc-missing');
  const reduction = $<HTMLSelectElement>('rc-reduction');
  const reductionNote = $('rc-reduction-note');
  const projection = $<HTMLSelectElement>('rc-projection');
  const program = $<HTMLInputElement>('rc-program');
  const avgY = $<HTMLInputElement>('rc-avgy');
  const avgX = $<HTMLInputElement>('rc-avgx');
  const avgM = $<HTMLInputElement>('rc-avgm');
  const axis = $<HTMLSelectElement>('rc-axis');
  const ref = $<HTMLInputElement>('rc-ref');
  const kInput = $<HTMLInputElement>('rc-k');
  const rInput = $<HTMLInputElement>('rc-r');
  const height = $<HTMLInputElement>('rc-height');
  const input = $<HTMLTextAreaElement>('rc-input');
  const issues = $('rc-issues');
  const results = $('rc-results');
  const downloads = $('rc-downloads');
  const status = $('rc-status');
  const body = $('rc-body');

  for (const t of RECORDER_TYPES) typeSel.append(new Option(t.label, t.id));
  for (const m of MISSING_DISTANCE_RULES) missing.append(new Option(m.label, m.id));
  for (const m of REDUCTION_MODES) reduction.append(new Option(m.label, m.id));
  for (const p of REDUCTION_PROJECTIONS) projection.append(new Option(p.label, p.id));

  /** A külső program (TVET.TXT) eredménye, sorszám szerint. */
  const external = new Map<number, { tv: number | null; dm: number | null }>();

  /** A kézzel beírt sorok (a bevitel forrása) és a belőlük számolt értékek. */
  let drafts: RecorderDraft[] = [];
  let models: (MeasurementRow | null)[] = [];
  let computed: ReduceResult[] = [];
  let rowCells: RowCells[] = [];

  let timer: number | undefined;
  let pendingSync = false;

  const state = (): FormState => ({
    recorder: typeSel.value,
    reduction: reduction.value as ReductionMode,
    projection: projection.value,
    externalProgram: program.value,
    avgY: Number(avgY.value) || 0,
    avgX: Number(avgX.value) || 0,
    avgM: Number(avgM.value) || 0,
    heightReduction: height.checked,
    ref: Number(ref.value) || 0,
    k: Number(kInput.value) || 0,
    R: Number(rInput.value) || 0,
    axis: axis.value as 'x' | 'y',
    missingDistance: missing.value as RecorderSettings['missingDistance'],
    drafts: drafts.map((d) => ({ ...d })),
  });

  const syncNotes = () => {
    const t = RECORDER_TYPES.find((x) => x.id === typeSel.value);
    typeNote.textContent = t ? t.note : '';
    const m = REDUCTION_MODES.find((x) => x.id === reduction.value);
    reductionNote.textContent = m ? m.note : '';
    const off = reduction.value !== 'projection';
    for (const e of [projection, avgY, avgX, avgM, axis, ref, kInput, rInput, height]) e.disabled = off;
    program.disabled = reduction.value !== 'external';
  };

  const showError = (message: string) => {
    const row = el('div', 'issue error');
    row.append(el('span', 'tag', 'Hiba'), el('span', undefined, message));
    issues.append(row);
  };
  const showWarning = (message: string) => {
    const row = el('div', 'issue warning');
    row.append(el('span', 'tag', 'Figyelem'), el('span', undefined, message));
    issues.append(row);
  };

  const withExternal = (m: MeasurementRow): MeasurementRow => {
    const ext = external.get(m.no);
    return ext ? { ...m, external: ext } : m;
  };

  /* ---------- a kézi bevitel táblázata ---------- */

  const makeInput = (d: RecorderDraft, key: keyof RecorderDraft): HTMLInputElement => {
    const inp = el('input');
    inp.type = 'text';
    inp.value = d[key];
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.setAttribute('aria-label', RECORDER_DRAFT_LABELS[key]);
    inp.title = RECORDER_DRAFT_LABELS[key];
    inp.size = key === 'no' ? 3 : key === 'code' ? 9 : 7;
    if (key === 'no' || NUM_FIELDS.has(key) || ANGLE_FIELDS.has(key)) inp.className = 'rc-num';
    inp.addEventListener('input', () => {
      d[key] = inp.value;
      inp.classList.toggle('rc-invalid', !fieldValid(key, inp.value));
      if (key === 'hz' || key === 'zi') refreshPreviews();
      schedule(true);
    });
    return inp;
  };

  const renderTable = () => {
    body.replaceChildren();
    rowCells = [];
    drafts.forEach((d, i) => {
      const tr = el('tr');

      const tdNo = el('td', 'rc-no');
      const inNo = makeInput(d, 'no');
      tdNo.append(inNo);
      tr.append(tdNo);

      const cells: RowCells = {
        inputs: { no: inNo },
        dms: {},
        tv: el('span', 'rc-out'),
        dm: el('span', 'rc-out'),
        tvCell: el('td', 'rc-calc'),
        dmCell: el('td', 'rc-calc'),
      };

      for (const key of ['hz', 'zi'] as const) {
        const td = el('td');
        const inp = makeInput(d, key);
        const dms = el('span', 'rc-dms');
        td.append(inp, dms);
        cells.inputs[key] = inp;
        cells.dms[key] = dms;
        tr.append(td);
      }

      for (const key of ['tf', 'mj', 'mm'] as const) {
        const td = el('td');
        const inp = makeInput(d, key);
        cells.inputs[key] = inp;
        td.append(inp);
        tr.append(td);
        // A Tv és a dM a Tf után, illetve a dM a magasságok előtt jelenik meg.
        if (key === 'tf') {
          cells.tvCell.append(cells.tv);
          cells.dmCell.append(cells.dm);
          tr.append(cells.tvCell, cells.dmCell);
        }
      }

      const tdCode = el('td');
      const inCode = makeInput(d, 'code');
      cells.inputs.code = inCode;
      tdCode.append(inCode);
      tr.append(tdCode);

      const tdDel = el('td');
      const rm = el('button', 'glyph', '\u00d7');
      rm.type = 'button';
      rm.title = 'A mérési sor törlése';
      rm.setAttribute('aria-label', 'A mérési sor törlése');
      rm.addEventListener('click', () => {
        drafts.splice(i, 1);
        renderTable();
        compute({ syncText: true });
      });
      tdDel.append(rm);
      tr.append(tdDel);

      rowCells.push(cells);
      body.append(tr);
    });
  };

  /** A FOK.PPMMSS szög emberi alakja a beírás alatt (pl. 91.2345 → 91°23′45″). */
  const refreshPreviews = () => {
    drafts.forEach((d, i) => {
      const cells = rowCells[i];
      if (!cells) return;
      for (const key of ['hz', 'zi'] as const) {
        const span = cells.dms[key];
        if (!span) continue;
        const v = d[key].trim();
        if (v === '') {
          span.textContent = '';
          continue;
        }
        try {
          span.textContent = formatDmsText(parseDms(v));
        } catch {
          span.textContent = 'érvénytelen szög';
        }
      }
    });
  };

  /** A számolt Tv és dM kiírása a sorok mellé (a táblázat újrarajzolása nélkül). */
  const refreshComputed = () => {
    rowCells.forEach((cells, i) => {
      const r = computed[i];
      const m = models[i];
      const ext = m ? external.get(m.no) : undefined;
      cells.tv.textContent = r && r.tv !== null ? fix(r.tv, 3) : '';
      cells.dm.textContent = r && r.dm !== null ? fix(r.dm, 3) : '';
      const note = r ? r.notes.join('; ') : '';
      cells.tvCell.title = note;
      cells.dmCell.title = note;
      cells.tvCell.classList.toggle('ext', !!ext);
      cells.dmCell.classList.toggle('ext', !!ext);
    });
  };

  const syncTextarea = () => {
    const t = draftsToText(drafts);
    if (input.value !== t) input.value = t;
  };

  const buildSections = (s: RecorderSettings, rows: MeasurementRow[]): Section[] =>
    reduceAll(rows.map(withExternal), s).sections;

  const compute = ({ syncText = false } = {}) => {
    window.clearTimeout(timer);
    const s = state();
    storage.set(STORAGE_KEY, JSON.stringify(s));
    if (syncText) syncTextarea();
    issues.replaceChildren();
    results.replaceChildren();
    downloads.replaceChildren();
    status.textContent = '';
    syncNotes();
    refreshPreviews();

    const parsed = drafts.map(parseDraft);
    models = parsed.map((p) => p.m);
    computed = models.map((m) => (m ? reduceMeasurement(withExternal(m), s) : { tv: null, dm: null, notes: [] }));
    refreshComputed();

    for (const p of parsed) for (const message of p.issues) showError(message);

    const rows = models.filter((m): m is MeasurementRow => m !== null);
    if (rows.length === 0) {
      results.append(el('p', 'empty', 'Írd be a méréseket a táblázatba, tölts be egy mintapéldát, vagy illessz be szöveget.'));
      return;
    }
    try {
      const sections = buildSections(s, rows);
      for (const section of sections) results.append(renderSection(section));
      results.prepend(renderCover(RC_TITLE));
      const reduced = computed.filter((r) => r.tv !== null).length;
      status.textContent =
        `Kiszámítva ${new Date().toLocaleTimeString('hu-HU')} · ${rows.length} mérési sor · ${reduced} redukált távolság` +
        (s.reduction === 'none' ? ' (redukció nélkül)' : '');
      if (s.reduction === 'projection') {
        const dl = projectionDef(s.projection);
        if (Math.abs(s.k - dl.k) > 1e-9 || Math.abs(s.R - dl.R) > 1e-6 || s.axis !== dl.axis) {
          showWarning(`A(z) ${dl.label} vetület állandói módosítva lettek az alapértékhez képest (k = ${dl.k}, R = ${fix(dl.R, 3)} m, redukciós koordináta: ${dl.axis.toUpperCase()}).`);
        }
      }
      if (external.size > 0) showWarning(`A TVET.TXT eredménye ${external.size} mérésre van érvényben.`);

      const reduceButton = el('button', undefined, 'Redukált mérések letöltése (.txt)');
      reduceButton.type = 'button';
      reduceButton.addEventListener('click', () => {
        const lines = rows.map((m) => {
          const r = reduceMeasurement(withExternal(m), s);
          const ang = (v: number | null) => (v === null ? '' : formatDmsPrecise(v));
          return `${m.no}, ${ang(m.hz)}, ${ang(m.zi)}, ${m.tf === null ? '' : fix(m.tf, 3)}, ${r.tv === null ? '' : fix(r.tv, 3)}, ${r.dm === null ? '' : fix(r.dm, 3)}, ${m.mj === null ? '' : fix(m.mj, 3)}, ${m.mm === null ? '' : fix(m.mm, 3)}, ${m.code}`;
        });
        download('redukalt_meresek.txt', ['# sorszám, Hz, Zi, Tf, Tv, dM, Mj, Mm, Pkód', ...lines].join('\r\n') + '\r\n');
      });
      downloads.append(reduceButton);

      const j = el('button', undefined, 'Jegyzőkönyv (.txt)');
      j.type = 'button';
      j.addEventListener('click', () => downloadReport('adatrogzito_jegyzokonyv.txt', RC_TITLE, sections));
      downloads.append(j);
    } catch (e) {
      if (e instanceof CalcError) showError(e.message);
      else showError(`A feldolgozás nem futott le: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const schedule = (syncText = false) => {
    pendingSync = pendingSync || syncText;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const sync = pendingSync;
      pendingSync = false;
      compute({ syncText: sync });
    }, 350);
  };

  /** A szöveges bevitel (beillesztés) átvétele a táblázatba. */
  const applyText = (syncText: boolean) => {
    drafts = textToDrafts(input.value);
    renderTable();
    compute({ syncText });
  };

  for (const e of [typeSel, missing, reduction, axis, height]) e.addEventListener('change', () => compute());
  for (const e of [program, avgY, avgX, avgM, ref, kInput, rInput]) e.addEventListener('input', () => schedule());

  // A szöveges bevitel is élő: a beillesztett sorok azonnal a táblázatba kerülnek.
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => applyText(false), 350);
  });

  $('rc-text-apply').addEventListener('click', () => applyText(false));

  // A vetület kiválasztásakor az állandók átvétele.
  projection.addEventListener('change', () => {
    const s = state();
    const next = applyProjection(s, projection.value);
    kInput.value = String(next.k);
    rInput.value = String(next.R);
    axis.value = next.axis;
    ref.value = String(next.ref);
    compute();
  });

  $('rc-sample').addEventListener('click', () => {
    typeSel.value = SAMPLE_SETTINGS.recorder;
    reduction.value = SAMPLE_SETTINGS.reduction;
    projection.value = SAMPLE_SETTINGS.projection;
    program.value = SAMPLE_SETTINGS.externalProgram;
    avgY.value = String(SAMPLE_SETTINGS.avgY);
    avgX.value = String(SAMPLE_SETTINGS.avgX);
    avgM.value = String(SAMPLE_SETTINGS.avgM);
    height.checked = SAMPLE_SETTINGS.heightReduction;
    ref.value = String(SAMPLE_SETTINGS.ref);
    kInput.value = String(SAMPLE_SETTINGS.k);
    rInput.value = String(SAMPLE_SETTINGS.R);
    axis.value = SAMPLE_SETTINGS.axis;
    missing.value = SAMPLE_SETTINGS.missingDistance;
    drafts = textToDrafts(SAMPLE_INPUT);
    renderTable();
    compute({ syncText: true });
  });

  const nextNo = () => {
    const nums = drafts.map((d) => Number(d.no)).filter((n) => Number.isFinite(n));
    return String(nums.length > 0 ? Math.max(...nums) + 1 : drafts.length + 1);
  };

  $('rc-add').addEventListener('click', () => {
    const last = drafts[drafts.length - 1];
    drafts.push({ ...EMPTY_DRAFT, no: nextNo(), mj: last?.mj ?? '', mm: last?.mm ?? '' });
    renderTable();
    compute({ syncText: true });
    const inputs = body.querySelectorAll<HTMLInputElement>('tr:last-child input');
    (inputs[1] ?? inputs[0])?.focus();
  });

  $('rc-clear').addEventListener('click', () => {
    if (drafts.length > 0 && !confirm('Törlöd az összes mérési sort?')) return;
    drafts = [];
    external.clear();
    renderTable();
    compute({ syncText: true });
  });

  // Átlagok számítása koordináta-állományból (súgó 62. o.).
  const coordFile = $<HTMLInputElement>('rc-coord-file');
  $('rc-avg-load').addEventListener('click', () => {
    coordFile.value = '';
    coordFile.click();
  });
  coordFile.addEventListener('change', async () => {
    const file = coordFile.files?.[0];
    if (!file) return;
    try {
      const text = await readText(file);
      const a = averagesFromCoordinates(text);
      avgY.value = String(Number(a.y.toFixed(3)));
      avgX.value = String(Number(a.x.toFixed(3)));
      avgM.value = String(Number(a.m.toFixed(3)));
      compute();
      status.textContent = `Az átlagok a(z) ${file.name} állomány ${a.count} pontjából: Y = ${fix(a.y, 3)}, X = ${fix(a.x, 3)}, M = ${fix(a.m, 3)} m.`;
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  });

  // TVET.TXT: a külső program adatcseréje.
  $('rc-tvet-out').addEventListener('click', () => {
    const list = models
      .filter((m): m is MeasurementRow => m !== null)
      .map((m) => ({ no: m.no, zi: m.zi, tf: m.tf, tv: null, dm: null }));
    if (list.length === 0) {
      showError('Nincs mérési sor a TVET.TXT kimenethez.');
      return;
    }
    download('TVET.TXT', formatTvetInput(list));
    status.textContent = `A TVET.TXT (${list.length} sor) letöltve: sorszám, magassági szög, ferde távolság.`;
  });

  const tvetFile = $<HTMLInputElement>('rc-tvet-file');
  $('rc-tvet-in').addEventListener('click', () => {
    tvetFile.value = '';
    tvetFile.click();
  });
  tvetFile.addEventListener('change', async () => {
    const file = tvetFile.files?.[0];
    if (!file) return;
    try {
      const rows = parseTvet(await readText(file));
      external.clear();
      for (const row of rows) external.set(row.no, { tv: row.tv, dm: row.dm });
      reduction.value = 'external';
      compute();
      status.textContent = `A(z) ${file.name} ${rows.length} sorát beolvastam; a redukciót a külső program eredménye adja.`;
    } catch (e) {
      showError(e instanceof CalcError ? e.message : String(e));
    }
  });

  const print = () => window.print();
  $('rc-print').addEventListener('click', print);
  $('rc-print2').addEventListener('click', print);
  onMeta(() => compute());

  // A korábbi munka visszaállítása (a régi, csak szöveges változat is beolvasható).
  let restored: FormState | null = null;
  try {
    const saved = JSON.parse(storage.get(STORAGE_KEY) || 'null') as
      | (Partial<FormState> & { input?: string })
      | null;
    if (saved && RECORDER_TYPES.some((t) => t.id === saved.recorder)) {
      const rest = { ...DEFAULT_RECORDER_SETTINGS, ...saved } as RecorderSettings;
      if (Array.isArray(saved.drafts)) {
        restored = { ...rest, drafts: saved.drafts.map((d) => ({ ...EMPTY_DRAFT, ...d })) };
      } else if (typeof saved.input === 'string') {
        restored = { ...rest, drafts: textToDrafts(saved.input) };
      }
    }
  } catch {
    restored = null;
  }

  if (restored) {
    typeSel.value = restored.recorder;
    reduction.value = restored.reduction;
    projection.value = restored.projection;
    program.value = restored.externalProgram;
    avgY.value = String(restored.avgY);
    avgX.value = String(restored.avgX);
    avgM.value = String(restored.avgM);
    height.checked = restored.heightReduction;
    ref.value = String(restored.ref);
    kInput.value = String(restored.k);
    rInput.value = String(restored.R);
    axis.value = restored.axis;
    missing.value = restored.missingDistance;
    drafts = restored.drafts;
  } else {
    typeSel.value = SAMPLE_SETTINGS.recorder;
    reduction.value = SAMPLE_SETTINGS.reduction;
    projection.value = SAMPLE_SETTINGS.projection;
    avgY.value = String(SAMPLE_SETTINGS.avgY);
    avgX.value = String(SAMPLE_SETTINGS.avgX);
    avgM.value = String(SAMPLE_SETTINGS.avgM);
    ref.value = String(SAMPLE_SETTINGS.ref);
    kInput.value = String(SAMPLE_SETTINGS.k);
    rInput.value = String(SAMPLE_SETTINGS.R);
    axis.value = SAMPLE_SETTINGS.axis;
  }

  syncNotes();
  renderTable();
  compute({ syncText: true });
}
