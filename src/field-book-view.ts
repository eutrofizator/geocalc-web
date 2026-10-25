import { formatDms, parseDms } from './core/angle';
import { CalcError } from './core/errors';
import {
  averageLeftRight,
  averageTwoFaces,
  undoAveraging,
  computeDm,
  computeTvet,
  ANGLE_UNITS,
  detectFieldFormat,
  fieldBookSection,
  parseFieldData,
  toGeoCalcAr,
  toNetworkGmj,
  type AngleUnit,
  type FieldRow,
} from './core/field-book';
import { fix } from './core/format';
import { RECORDER_TYPES, type RecorderSettings } from './core/recorder';
import type { Issue } from './core/types';
import { renderCover } from './report-view';
import { $, download, el, readText, renderSection, storage } from './ui';

/**
 * Adatrögzítő / Mérési adatok - koordináták (súgó 11–12. o.): a nyers mérési adatok és a GeoCalc GMJ
 * állományok beolvasása, a táblázatos munkaterület (a valódi program színeivel), a távolságredukció és a
 * magasságkülönbség számítása, mérés kihagyása, bal/jobb középelés, mentés GMJ-be és a konvertálás a
 * hálózatkiegyenlítéshez.
 */

const STORAGE_KEY = 'geocalc-web.fieldbook';

interface Saved {
  type: string;
  angle?: string;
  file: string;
  rows: FieldRow[];
  showAp: boolean;
}

type Column = 'id' | 'hz' | 'zi' | 'tf' | 'tv' | 'tvet' | 'dm' | 'mj' | 'mm' | 'code' | 'ap1' | 'ap2';
const COLUMNS: Column[] = ['id', 'hz', 'zi', 'tf', 'tv', 'tvet', 'dm', 'mj', 'mm', 'code', 'ap1', 'ap2'];
const ANGLES = new Set<Column>(['hz', 'zi']);
const TEXTS = new Set<Column>(['id', 'code', 'ap1', 'ap2']);

export interface FieldBookDeps {
  /** Az Adatrögzítő/Beállítások jelenlegi beállításai (a redukcióhoz). */
  settings: () => RecorderSettings;
  /** A konvertált jegyzőkönyv és koordináták átadása a hálózatkiegyenlítésnek. */
  toNetwork: (gmj: string, coordinates: string | null) => void;
  openNav: (id: string) => void;
  setHint: (text: string) => void;
}

function cellText(r: FieldRow, c: Column): string {
  const v = r[c];
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (ANGLES.has(c)) return formatDms(v);
  if (c === 'tvet' || c === 'dm') return fix(v, 4);
  if (c === 'mj' || c === 'mm') return fix(v, 2);
  return String(Math.round(v * 10000) / 10000);
}

export function initFieldBookView(deps: FieldBookDeps): void {
  const typeSel = $<HTMLSelectElement>('fb-type');
  const angleSel = $<HTMLSelectElement>('fb-angle');
  for (const u of ANGLE_UNITS) angleSel.append(new Option(u.label, u.id));
  const body = $('fb-table').querySelector('tbody')!;
  const status = $('fb-status');
  const issuesBox = $('fb-issues');
  const fileInput = $<HTMLInputElement>('fb-file-input');
  let rows: FieldRow[] = [];
  let fileName = '';
  let coordinates: { name: string; text: string } | null = null;
  let showAp = false;
  let selected = new Set<number>();
  let anchor: number | null = null;
  let appendNext = false;

  for (const t of RECORDER_TYPES) typeSel.append(new Option(t.label, t.id));

  const save = () =>
    storage.set(STORAGE_KEY, JSON.stringify({ type: typeSel.value, angle: angleSel.value, file: fileName, rows, showAp } satisfies Saved));

  const setStatus = (text: string, issues: Issue[] = []) => {
    status.textContent = text;
    issuesBox.replaceChildren();
    const label = { error: 'Hiba', warning: 'Figyelem', info: 'Info' } as const;
    for (const i of issues.slice(0, 50)) {
      const row = el('div', `issue ${i.level}`);
      row.append(el('span', 'tag', label[i.level]), el('span', undefined, i.line !== undefined ? `${i.line}. sor: ${i.message}` : i.message));
      issuesBox.append(row);
    }
    if (issues.length > 50) issuesBox.append(el('div', 'issue info', `… és még ${issues.length - 50} üzenet`));
  };

  const render = () => {
    $('fb-file').textContent = fileName;
    $('fb-table').classList.toggle('show-ap', showAp);
    $('fb-ap').setAttribute('aria-pressed', String(showAp));
    body.replaceChildren();
    const frag = document.createDocumentFragment();
    rows.forEach((r, i) => {
      const tr = el('tr', [r.kind === 'station' ? 'station' : '', r.state !== 'ok' ? `st-${r.state}` : '', selected.has(i) ? 'sel' : ''].filter((c) => c).join(' '));
      tr.dataset.row = String(i);
      tr.append(el('td', 'num idx', String(i + 1)));
      for (const c of COLUMNS) {
        const td = el('td', `${TEXTS.has(c) ? '' : 'num'}${c === 'tvet' || (c === 'dm' && r.kind === 'obs') ? ' calc' : ''}${c === 'ap1' || c === 'ap2' ? ' fb-apcol' : ''}`, cellText(r, c));
        td.dataset.col = c;
        tr.append(td);
      }
      frag.append(tr);
    });
    body.append(frag);
    save();
  };

  const counts = () => {
    const st = rows.filter((r) => r.kind === 'station').length;
    const ob = rows.filter((r) => r.kind === 'obs').length;
    return `${st} álláspont, ${ob} mérés`;
  };

  /* ---------- beolvasás ---------- */

  const load = (text: string, name: string, append: boolean) => {
    let type = typeSel.value;
    const detected = detectFieldFormat(text);
    // A GMJ és a GSI felismerhető: a rossz típusválasztás ne akadályozza a beolvasást.
    // Az azonos családba tartozó típusok (pl. GSI-8/16, TC, GeoMAX; SDR numerikus/alfanumerikus) egyenértékűek.
    const family = (t: string) => (/^leica|^geomax/.test(t) ? 'gsi' : /^sokkia/.test(t) ? 'sdr' : t);
    if (detected && family(detected) !== family(type)) {
      type = detected;
      typeSel.value = detected;
    }
    try {
      const res = parseFieldData(text, type, { angleUnit: angleSel.value as AngleUnit });
      if (res.rows.length === 0) {
        setStatus(`A(z) ${name} állományban nem volt értelmezhető mérési adat (${res.format}).`, res.issues);
        return;
      }
      rows = append ? [...rows, ...res.rows] : res.rows;
      fileName = append && fileName ? `${fileName} + ${name}` : name;
      selected = new Set();
      render();
      setStatus(`Beolvasva: ${name} (${res.format}) – ${res.rows.length} sor. A munkaterületen: ${counts()}.`, res.issues);
      deps.setHint(`Mérési adatok beolvasva: ${name}`);
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      setStatus(e.message);
    }
  };

  $('fb-open').addEventListener('click', () => {
    appendNext = false;
    fileInput.click();
  });
  $('fb-append').addEventListener('click', () => {
    appendNext = true;
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    load(await readText(f), f.name, appendNext);
  });
  typeSel.addEventListener('change', save);
  angleSel.addEventListener('change', save);
  $('fb-ap').addEventListener('click', () => {
    showAp = !showAp;
    render();
  });

  /* ---------- kijelölés és javítás ---------- */

  body.addEventListener('click', (e) => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-row]');
    if (!tr || (e.target as HTMLElement).closest('input')) return;
    const i = Number(tr.dataset.row);
    if (e.shiftKey && anchor !== null) {
      selected = new Set();
      for (let k = Math.min(anchor, i); k <= Math.max(anchor, i); k++) selected.add(k);
    } else if (e.ctrlKey || e.metaKey) {
      if (selected.has(i)) selected.delete(i);
      else selected.add(i);
      anchor = i;
    } else {
      selected = new Set([i]);
      anchor = i;
    }
    for (const row of body.querySelectorAll<HTMLElement>('tr[data-row]')) row.classList.toggle('sel', selected.has(Number(row.dataset.row)));
  });

  body.addEventListener('dblclick', (e) => {
    const td = (e.target as HTMLElement).closest<HTMLElement>('td[data-col]');
    const tr = td?.closest<HTMLElement>('tr[data-row]');
    if (!td || !tr) return;
    const i = Number(tr.dataset.row);
    const c = td.dataset.col as Column;
    const input = el('input', 'cell-edit');
    input.value = td.textContent ?? '';
    td.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      if (commit) {
        const t = input.value.trim();
        try {
          const r = { ...rows[i]! };
          if (TEXTS.has(c)) (r[c] as string) = t;
          else if (t === '') (r[c] as number | null) = null;
          else if (ANGLES.has(c)) (r[c] as number | null) = parseDms(t);
          else {
            const v = Number(t.replace(',', '.'));
            if (!Number.isFinite(v)) throw new CalcError(`Érvénytelen szám: „${t}”.`);
            (r[c] as number | null) = v;
          }
          rows[i] = r;
          setStatus(`${i + 1}. sor javítva (${c}).`);
        } catch (err) {
          if (!(err instanceof CalcError)) throw err;
          setStatus(err.message);
        }
      }
      render();
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') finish(true);
      else if (ev.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  });

  /* ---------- műveletek (súgó 12. o.) ---------- */

  const needSelection = (): number[] | null => {
    const list = [...selected].filter((i) => rows[i]?.kind === 'obs');
    if (list.length === 0) {
      setStatus('Jelöld ki a mérés(eke)t a táblázatban (kattintás, Shift + kattintás).');
      return null;
    }
    return list;
  };
  $('fb-skip').addEventListener('click', () => {
    const list = needSelection();
    if (!list) return;
    for (const i of list) if (rows[i]!.state === 'ok') rows[i] = { ...rows[i]!, state: 'skip' };
    render();
    setStatus(`${list.length} mérés kihagyva a feldolgozásból.`);
  });
  $('fb-restore').addEventListener('click', () => {
    const list = needSelection();
    if (!list) return;
    for (const i of list) if (rows[i]!.state === 'skip') rows[i] = { ...rows[i]!, state: 'ok' };
    render();
    setStatus(`${list.length} mérés ismét felhasználva.`);
  });
  $('fb-lr').addEventListener('click', () => {
    const res = averageLeftRight(rows);
    rows = res.rows;
    selected = new Set();
    render();
    setStatus(res.count === 0 ? 'Nincs középelendő bal/jobb irány (a pontszám után -b/-j vagy _b/_j kell).' : `${res.count} bal/jobb irány középelve.`);
  });
  // Két távcsőállás középelése (a GeoCalc GCAR_2T programja helyett, súgó 12. o.).
  $('fb-2t').addEventListener('click', () => {
    const res = averageTwoFaces(rows);
    rows = res.rows;
    selected = new Set();
    render();
    setStatus(
      res.count === 0
        ? 'Nincs középelhető irány: ugyanarra a pontszámra I. és II. távcsőállású mérés kell (a II. állás zenitszöge 180° fölötti).'
        : `${res.count} célpont középelve (I. és II. távcsőállás)` +
            (res.maxIndexError !== null ? `, a legnagyobb indexhiba-kétszeres ${fix(res.maxIndexError, 0)}″` : '') +
            (res.single > 0 ? `; ${res.single} célpontot csak egy állásban mértek, ezek változatlanok.` : '.'),
    );
  });
  $('fb-2t-undo').addEventListener('click', () => {
    rows = undoAveraging(rows);
    selected = new Set();
    render();
    setStatus('A középelés visszavonva: az eredeti irányok ismét felhasználódnak.');
  });
  $('fb-tvet').addEventListener('click', () => {
    const s = deps.settings();
    rows = computeTvet(rows, s);
    render();
    const n = rows.filter((r) => r.kind === 'obs' && r.tvet !== null).length;
    const mode = s.reduction === 'projection' ? `vetületi redukció (${s.projection}, átlag Y ${fix(s.avgY, 0)}, X ${fix(s.avgX, 0)}, M ${fix(s.avgM, 1)})` : s.reduction === 'none' ? 'redukció nélkül' : 'külső program';
    setStatus(`Távolságredukció: ${n} távolság, ${mode}. A beállítás az Adatrögzítő/Beállítások lapon módosítható.`);
  });
  $('fb-dm').addEventListener('click', () => {
    rows = computeDm(rows);
    render();
    setStatus(`Magasságkülönbség: ${rows.filter((r) => r.kind === 'obs' && r.dm !== null).length} mérés.`);
  });
  const extInput = $<HTMLInputElement>('fb-ext-input');
  $('fb-ext').addEventListener('click', () => extInput.click());
  extInput.addEventListener('change', async () => {
    const f = extInput.files?.[0];
    extInput.value = '';
    if (!f) return;
    try {
      // A külső program eredménye (súgó 14. o.): sorszám, vetületi távolság, magasságkülönbség.
      let n = 0;
      for (const [k, line] of (await readText(f)).split(/\r?\n/).entries()) {
        const t = line.trim().split(/[\s,;]+/).filter((x) => x !== '');
        if (t.length === 0) continue;
        const no = Number(t[0]);
        const tv = t[1] === undefined ? NaN : Number(t[1]);
        if (!Number.isInteger(no) || !Number.isFinite(tv)) throw new CalcError(`${k + 1}. sor: a TVET.TXT sora „sorszám, vetületi távolság, magasságkülönbség” legyen.`);
        const r = rows[no - 1];
        if (!r || r.kind !== 'obs') continue;
        const dm = t[2] === undefined ? NaN : Number(t[2]);
        rows[no - 1] = { ...r, tvet: tv, dm: Number.isFinite(dm) ? dm : r.dm };
        n++;
      }
      render();
      setStatus(`A külső program eredménye (${f.name}): ${n} sor átvéve (sorszám szerint).`);
    } catch (err) {
      if (!(err instanceof CalcError)) throw err;
      setStatus(err.message);
    }
  });
  $('fb-save').addEventListener('click', () => {
    if (rows.length === 0) return;
    const base = (fileName.split(' + ')[0] || 'meresek').replace(/\.[^.]+$/, '');
    download(`${base}.GMJ`, toGeoCalcAr(rows));
  });
  $('fb-print').addEventListener('click', () => {
    if (rows.length === 0) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const box = document.createElement('div');
    box.append(renderCover('MÉRÉSI JEGYZŐKÖNYV'), renderSection(fieldBookSection(rows, fileName)));
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Mérési jegyzőkönyv</title><style>${[...document.styleSheets].map((s) => {
      try {
        return [...s.cssRules].map((r) => r.cssText).join('\n');
      } catch {
        return '';
      }
    }).join('\n')}</style><body class="print-only">${box.innerHTML}</body>`);
    w.document.close();
    w.focus();
    w.print();
  });

  /* ---------- konvertálás és koordináták ---------- */

  const coordInput = $<HTMLInputElement>('fb-coord-input');
  $('fb-coord-open').addEventListener('click', () => coordInput.click());
  coordInput.addEventListener('change', async () => {
    const f = coordInput.files?.[0];
    coordInput.value = '';
    if (!f) return;
    coordinates = { name: f.name, text: await readText(f) };
    $('fb-coord-file').textContent = f.name;
    setStatus(`Koordináta állomány: ${f.name} – a konvertálással a hálózatkiegyenlítés ismert pontjai közé kerül.`);
  });
  $('fb-coord-new').addEventListener('click', () => deps.openNav('ex-file'));
  $('fb-convert').addEventListener('click', () => {
    if (rows.length === 0) {
      setStatus('Nincs mit konvertálni: előbb olvasd be a mérési adatokat.');
      return;
    }
    const out = toNetworkGmj(rows);
    const noDist = rows.filter((r) => r.kind === 'obs' && r.state === 'ok' && r.tvet === null && r.tv === null && r.tf !== null).length;
    deps.toNetwork(out.text, coordinates?.text ?? null);
    setStatus(
      `Konvertálva a hálózatkiegyenlítéshez: ${out.stations} álláspont, ${out.observations} mérés${coordinates ? `, koordináták: ${coordinates.name}` : ''}.` +
        (noDist > 0 ? ` Figyelem: ${noDist} ferde távolság redukálatlan – előbb számold a Tvet-et.` : ''),
    );
    deps.setHint('A mérési adatok a Hálózatkiegyenlítés munkaterületére kerültek.');
  });

  try {
    const saved = JSON.parse(storage.get(STORAGE_KEY) || 'null') as Saved | null;
    if (saved && Array.isArray(saved.rows)) {
      rows = saved.rows;
      fileName = saved.file ?? '';
      showAp = saved.showAp ?? false;
      if (RECORDER_TYPES.some((t) => t.id === saved.type)) typeSel.value = saved.type;
      if (ANGLE_UNITS.some((u) => u.id === saved.angle)) angleSel.value = saved.angle!;
    }
  } catch {
    rows = [];
  }
  render();
  if (rows.length > 0) setStatus(`A munkaterületen: ${counts()}.`);
  else setStatus('Válaszd ki az adatrögzítő típusát, majd olvasd be a mérési adatokat (GeoCalc GMJ, Leica GSI, Sokkia SDR, Topcon GTS-7, Geodimeter, FOIF MES, FOIF/Carlson RW5).');
}
