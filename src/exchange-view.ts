import {
  DEFAULT_FIELDS,
  FIELD_LABEL,
  FIELD_WIDTH,
  OPS,
  filterPoints,
  formatTable,
  formatValue,
  sortPoints,
  type Condition,
  type ExchangeField,
  type FieldKey,
  type FormatOptions,
  type Op,
} from './core/exchange';
import { parseCoordLine } from './core/parser';
import type { Point } from './core/types';
import { $, download, el, readText, storage } from './ui';

/**
 * Az Adatcsere/Koordináta kezelő munkalap (súgó 72. o.).
 *
 * A GeoCalc adatbázis koordinátáit válogatja, csoportosítja és konvertálja: a mezők sorrendje és a
 * feltétel az SQL `select` logikája szerint adható meg, a kimenet a mezőjellemzők (hossz, tizedesek,
 * elválasztó) szerint készül. A `K_`/`U>` kimenethez hasonlóan itt is megadható a „számított” jelző.
 */

export interface ExchangeHooks {
  /** Az utolsó futás összes pontja (ismert + számított). */
  getPoints(): Point[];
  /** A futás során kiszámított pontok azonosítói (a jelző oszlophoz). */
  getComputed(): Set<string>;
}

const DRAFT_KEY = 'geocalc-web.exchange';

let fields: ExchangeField[] = DEFAULT_FIELDS.map((f) => ({ ...f }));
let conditions: Condition[] = [];
let mode: 'and' | 'or' = 'and';
let widths: Partial<Record<FieldKey, number>> = {};
let dbPoints: Point[] = [];
let dbName = '';
let hooks: ExchangeHooks;

export function initExchangeView(h: ExchangeHooks): void {
  hooks = h;

  $('ex-fields-reset').addEventListener('click', () => {
    fields = DEFAULT_FIELDS.map((f) => ({ ...f }));
    renderAll();
  });
  $('ex-cond-add').addEventListener('click', () => {
    conditions.push({ field: 'id', op: '=', value: '' });
    renderConditions();
    renderPreview();
  });
  $<HTMLSelectElement>('ex-mode').addEventListener('change', () => {
    mode = $<HTMLSelectElement>('ex-mode').value === 'or' ? 'or' : 'and';
    renderPreview();
  });
  for (const id of ['ex-sep', 'ex-dec', 'ex-trim', 'ex-flag']) {
    $(id).addEventListener('change', renderPreview);
    $(id).addEventListener('input', renderPreview);
  }

  const dbInput = $<HTMLInputElement>('ex-db-file');
  $('ex-db-load').addEventListener('click', () => dbInput.click());
  dbInput.addEventListener('change', async () => {
    const f = dbInput.files?.[0];
    dbInput.value = '';
    if (!f) return;
    dbPoints = parsePoints(await readText(f));
    dbName = f.name;
    $('ex-db-name').textContent = `${f.name} (${dbPoints.length} pont)`;
    renderAll();
  });
  $('ex-db-clear').addEventListener('click', () => {
    dbPoints = [];
    dbName = '';
    $('ex-db-name').textContent = 'Az utolsó futás pontjai';
    renderAll();
  });

  $('ex-export').addEventListener('click', () => {
    const rows = visibleRows();
    const text = formatTable(rows, fields, opts(), new Set(hooks.getComputed()));
    if (text === '') {
      setHint('Nincs exportálható pont.');
      return;
    }
    download('koordinatak.PYX', text);
    setHint(`${rows.length} pont kiírva.`);
  });

  const saved = storage.get(DRAFT_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved) as { fields?: ExchangeField[]; conditions?: Condition[]; mode?: 'and' | 'or'; widths?: Partial<Record<FieldKey, number>> };
      if (Array.isArray(data.fields) && data.fields.length > 0) fields = data.fields;
      if (Array.isArray(data.conditions)) conditions = data.conditions;
      if (data.mode === 'or' || data.mode === 'and') mode = data.mode;
      if (data.widths) widths = data.widths;
    } catch {
      /* sérült vázlat: marad az alapértelmezés */
    }
  }

  $<HTMLSelectElement>('ex-mode').value = mode;
  renderAll();
}

/** A munkalap láthatóvá válásakor (és a számítás után) frissítjük az előnézetet. */
export function refreshExchange(): void {
  if (!document.getElementById('win-exchange-coords')) return;
  renderPreview();
}

/* ---------- adatforrás ---------- */

function sourcePoints(): Point[] {
  return dbPoints.length > 0 ? dbPoints : hooks.getPoints();
}

function parsePoints(text: string): Point[] {
  const out: Point[] = [];
  let no = 0;
  for (const raw of text.split(/\r?\n/)) {
    no++;
    const line = raw.trim();
    if (line === '' || line === ';;' || /^(k|p)_/i.test(line) || /^[A-Z]>/.test(line)) continue;
    try {
      out.push(parseCoordLine(line, no));
    } catch {
      /* nem koordinátasor */
    }
  }
  return out;
}

/* ---------- űrlap ---------- */

function renderAll(): void {
  renderFields();
  renderConditions();
  renderWidths();
  renderPreview();
  saveDraft();
}

function renderFields(): void {
  const body = $('ex-fields-body');
  body.replaceChildren();
  fields.forEach((f, i) => {
    const tr = el('tr');
    const tdCb = el('td');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = f.enabled;
    cb.setAttribute('aria-label', f.label);
    cb.addEventListener('change', () => {
      f.enabled = cb.checked;
      renderWidths();
      renderPreview();
      saveDraft();
    });
    tdCb.append(cb);
    tr.append(tdCb);

    tr.append(el('td', undefined, f.label));

    const tdMove = el('td', 'row-actions');
    const up = el('button', 'glyph', '\u25b2');
    up.type = 'button';
    up.title = 'Feljebb';
    up.disabled = i === 0;
    up.addEventListener('click', () => {
      [fields[i - 1], fields[i]] = [fields[i]!, fields[i - 1]!];
      renderAll();
    });
    const down = el('button', 'glyph', '\u25bc');
    down.type = 'button';
    down.title = 'Lejjebb';
    down.disabled = i === fields.length - 1;
    down.addEventListener('click', () => {
      [fields[i + 1], fields[i]] = [fields[i]!, fields[i + 1]!];
      renderAll();
    });
    tdMove.append(up, down);
    tr.append(tdMove);
    body.append(tr);
  });
}

function renderConditions(): void {
  const box = $('ex-cond-body');
  box.replaceChildren();
  if (conditions.length === 0) {
    box.append(el('p', 'hint', 'Nincs feltétel – minden pont megjelenik.'));
    return;
  }
  conditions.forEach((c, i) => {
    const block = el('div', 'cond');
    block.append(el('span', 'cond-kw', i === 0 ? 'WHERE' : mode === 'or' ? 'OR' : 'AND'));

    const selField = el('select');
    for (const key of Object.keys(FIELD_LABEL) as FieldKey[]) {
      const opt = el('option', undefined, FIELD_LABEL[key]);
      opt.value = key;
      selField.append(opt);
    }
    selField.value = c.field;
    selField.setAttribute('aria-label', 'mező');
    selField.addEventListener('change', () => {
      c.field = selField.value as FieldKey;
      renderPreview();
      saveDraft();
    });

    const selOp = el('select');
    for (const o of OPS) {
      const opt = el('option', undefined, o.label);
      opt.value = o.op;
      selOp.append(opt);
    }
    selOp.value = c.op;
    selOp.setAttribute('aria-label', 'művelet');
    selOp.addEventListener('change', () => {
      c.op = selOp.value as Op;
      renderPreview();
      saveDraft();
    });

    const input = el('input');
    input.type = 'text';
    input.value = c.value;
    input.placeholder = 'keresett érték';
    input.setAttribute('aria-label', 'keresett érték');
    input.addEventListener('input', () => {
      c.value = input.value;
      renderPreview();
      saveDraft();
    });

    const rm = el('button', 'glyph', '\u2212');
    rm.type = 'button';
    rm.title = 'A feltétel törlése';
    rm.setAttribute('aria-label', 'A feltétel törlése');
    rm.addEventListener('click', () => {
      conditions.splice(i, 1);
      renderConditions();
      renderPreview();
      saveDraft();
    });

    const row = el('div', 'cond-row');
    row.append(selField, selOp, rm);
    block.append(row, input);
    box.append(block);
  });
}

function renderWidths(): void {
  const box = $('ex-widths');
  box.replaceChildren();
  for (const f of fields) {
    if (!f.enabled) continue;
    const label = el('label', 'width-item');
    label.append(el('span', undefined, f.label));
    const input = el('input');
    input.type = 'number';
    input.min = '1';
    input.max = '40';
    input.value = String(widths[f.key] ?? FIELD_WIDTH[f.key]);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && v > 0) widths[f.key] = v;
      renderPreview();
      saveDraft();
    });
    label.append(input);
    box.append(label);
  }
}

/* ---------- előnézet és export ---------- */

function visibleRows(): Point[] {
  return sortPoints(filterPoints(sourcePoints(), conditions, mode));
}

function opts(): FormatOptions {
  return {
    separator: $<HTMLSelectElement>('ex-sep').value,
    decimals: Number($<HTMLInputElement>('ex-dec').value) || 0,
    trim: $<HTMLInputElement>('ex-trim').checked,
    withFlag: $<HTMLInputElement>('ex-flag').checked,
    widths,
  };
}

function renderPreview(): void {
  const box = $('ex-preview');
  box.replaceChildren();
  const rows = visibleRows();
  const active = fields.filter((f) => f.enabled);
  const flag = $<HTMLInputElement>('ex-flag').checked;
  $('ex-count').textContent = `${rows.length} pont`;
  if (rows.length === 0) {
    box.append(el('p', 'empty', 'Nincs megjeleníthető pont. Tölts be adatbázist, vagy adj meg feltételt.'));
    return;
  }
  const table = el('table');
  const head = el('tr');
  for (const f of active) head.append(el('th', undefined, f.label));
  if (flag) head.append(el('th', undefined, 'Számított'));
  const thead = el('thead');
  thead.append(head);
  table.append(thead);

  const decimals = Number($<HTMLInputElement>('ex-dec').value) || 0;
  const computed = new Set(hooks.getComputed());
  const body = el('tbody');
  for (const p of rows) {
    const tr = el('tr');
    for (const f of active) {
      const td = el('td');
      td.textContent = formatValue(p, f.key, decimals);
      if (f.key !== 'id' && f.key !== 'code') td.className = 'num';
      tr.append(td);
    }
    if (flag) tr.append(el('td', 'num', computed.has(p.id) ? '1' : '0'));
    body.append(tr);
  }
  table.append(body);
  const wrap = el('div', 'table-wrap');
  wrap.append(table);
  box.append(wrap);
}

function setHint(text: string): void {
  $('ex-hint').textContent = text;
}

function saveDraft(): void {
  storage.set(DRAFT_KEY, JSON.stringify({ fields, conditions, mode, widths }));
}
