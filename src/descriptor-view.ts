import {
  CALC_TYPES,
  autoCode,
  generateCode,
  observationsOf,
  parseObservations,
  stations,
  type CalcType,
  type Observation,
} from './core/descriptor';
import { parseCoordLine } from './core/parser';
import type { Point } from './core/types';
import { $, download, el, readText, storage } from './ui';

/**
 * Az Adatleíró munkalap (súgó 44. o.) – űrlapos számítás-előkészítés a Munkaterülethez.
 *
 * A mérési adatok (álláspont, irányzott pont, irány, távolság) kézzel vagy állományból vihetők be.
 * A munkalap a kiválasztott álláspont és irányzott pontok alapján előállítja a `kj`/`po`/`kp`/`vp`/`et`/`sv`/`sm`
 * kódblokkot, illetve a súgó szerinti automatikus kódolást (TJ/VP + PO).
 */

export interface DescriptorHooks {
  /** Az eddig ismert pontok (az utolsó futásból): a tájékozó és a poláris pontok szétválasztásához. */
  getPoints(): Point[];
  /** A kód beszúrása a Munkaterület szerkesztőjébe és futtatása ([Konverzió]). */
  applyCode(code: string): void;
}

const DRAFT_KEY = 'geocalc-web.descriptor';

let observations: Observation[] = [];
let selectedStation = '';
const selectedTargets = new Set<string>();
let hooks: DescriptorHooks;
let coordFilePoints: Point[] = [];
let coordFileName = '';

const TRIM = (s: string) => s.trim();

export function initDescriptorView(h: DescriptorHooks): void {
  hooks = h;

  // A tábla fejét és a gombokat az index.html tartalmazza; csak a viselkedést kötjük be.
  $('dp-add').addEventListener('click', () => {
    observations.push({ station: selectedStation || '', id: '', dir: '', dist: '' });
    renderObs();
    refreshDerived();
    focusLastObs();
  });
  $('dp-clear').addEventListener('click', () => {
    if (observations.length > 0 && !confirm('Törlöd az összes mérési sort?')) return;
    observations = [];
    coordFilePoints = [];
    coordFileName = '';
    selectedStation = '';
    selectedTargets.clear();
    renderObs();
    refreshDerived();
    $('dp-coord-name').textContent = 'Nincs betöltve';
  });

  $('dp-type').addEventListener('change', () => {
    renderExtras();
    setCode('');
  });
  $('dp-generate').addEventListener('click', onGenerate);
  $('dp-auto').addEventListener('click', onAutoCode);
  $('dp-apply').addEventListener('click', () => {
    const code = $<HTMLTextAreaElement>('dp-code').value;
    if (code.trim() === '') {
      setHint('Előbb állítsd elő a kódot.');
      return;
    }
    hooks.applyCode(code);
    setHint('A kód bekerült a Munkaterületre és lefutott.');
  });
  $('dp-save').addEventListener('click', () => {
    download('adatleiro.gcd', $<HTMLTextAreaElement>('dp-code').value);
  });

  const measInput = $<HTMLInputElement>('dp-meas-file');
  $('dp-load-meas').addEventListener('click', () => measInput.click());
  measInput.addEventListener('change', async () => {
    const f = measInput.files?.[0];
    measInput.value = '';
    if (!f) return;
    const { obs, skipped } = parseObservations(await readText(f));
    observations = obs;
    selectedStation = stations(obs)[0] ?? '';
    selectedTargets.clear();
    renderObs();
    refreshDerived();
    setHint(`Mérési jegyzőkönyv beolvasva: ${obs.length} sor${skipped > 0 ? `, ${skipped} kihagyva` : ''}.`);
  });

  const coordInput = $<HTMLInputElement>('dp-coord-file');
  $('dp-load-coord').addEventListener('click', () => coordInput.click());
  coordInput.addEventListener('change', async () => {
    const f = coordInput.files?.[0];
    coordInput.value = '';
    if (!f) return;
    coordFilePoints = parsePoints(await readText(f));
    coordFileName = f.name;
    $('dp-coord-name').textContent = `${f.name} (${coordFilePoints.length} pont)`;
    refreshDerived();
    setHint(`Koordináta állomány: ${coordFilePoints.length} pont.`);
  });

  // A korábbi munka visszaállítása.
  const saved = storage.get(DRAFT_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved) as { obs?: Observation[]; code?: string };
      if (Array.isArray(data.obs)) observations = data.obs;
      if (typeof data.code === 'string') setCode(data.code);
    } catch {
      /* régi vagy sérült vázlat: figyelmen kívül hagyjuk */
    }
  }
  selectedStation = stations(observations)[0] ?? '';

  renderObs();
  refreshDerived();
  renderExtras();
}

/** A munkalap láthatóvá válásakor frissítjük az ismert pontokat (a jelölésekhez). */
export function refreshDescriptor(): void {
  if (!document.getElementById('win-descriptor')) return;
  refreshDerived();
}

/* ---------- ismert pontok ---------- */

function knownPoints(): Map<string, Point> {
  const map = new Map<string, Point>();
  for (const p of coordFilePoints) map.set(p.id, p);
  for (const p of hooks.getPoints()) map.set(p.id, p);
  return map;
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
      /* nem koordinátasor: kimarad */
    }
  }
  return out;
}

/* ---------- megjelenítés ---------- */

function renderObs(): void {
  const body = $('dp-obs-body');
  body.replaceChildren();
  observations.forEach((o, i) => {
    const tr = el('tr');
    const cell = (key: 'station' | 'id' | 'dir' | 'dist', size: number) => {
      const td = el('td');
      const input = el('input');
      input.type = 'text';
      input.value = o[key];
      input.size = size;
      input.setAttribute('aria-label', key);
      input.addEventListener('input', () => {
        o[key] = input.value;
        refreshDerived();
        saveDraft();
      });
      td.append(input);
      tr.append(td);
    };
    cell('station', 7);
    cell('id', 7);
    cell('dir', 9);
    cell('dist', 8);
    const td = el('td');
    const rm = el('button', 'glyph', '\u2212');
    rm.type = 'button';
    rm.title = 'A mérési sor törlése';
    rm.setAttribute('aria-label', 'A mérési sor törlése');
    rm.addEventListener('click', () => {
      observations.splice(i, 1);
      renderObs();
      refreshDerived();
      saveDraft();
    });
    td.append(rm);
    tr.append(td);
    body.append(tr);
  });
}

function focusLastObs(): void {
  const inputs = $('dp-obs-body').querySelectorAll<HTMLInputElement>('input');
  const last = inputs[inputs.length - 4];
  last?.focus();
}

/** Az álláspont- és az irányzottpont-listát, valamint a jelöléseket frissíti (a mérési tábla újrarajzolása nélkül). */
function refreshDerived(): void {
  const list = stations(observations);
  if (!list.includes(selectedStation)) selectedStation = list[0] ?? '';
  const known = knownPoints();

  const st = $('dp-stations');
  st.replaceChildren();
  if (list.length === 0) st.append(el('li', 'empty', 'Nincs mérés.'));
  for (const s of list) {
    const li = el('li');
    const b = el('button', 'pick');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s === selectedStation));
    if (s === selectedStation) b.classList.add('on');
    b.append(el('span', 'pick-id', s), el('span', 'pick-tag', known.has(s) ? 'ismert' : 'szabad'));
    b.addEventListener('click', () => {
      selectedStation = s;
      selectedTargets.clear();
      refreshDerived();
    });
    li.append(b);
    st.append(li);
  }

  const ip = $('dp-targets');
  ip.replaceChildren();
  const rows = observationsOf(observations, selectedStation);
  if (rows.length === 0) ip.append(el('li', 'empty', 'Nincs irányzott pont.'));
  rows.forEach((o) => {
    const li = el('li');
    const label = el('label', 'pick-check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = selectedTargets.has(o.id);
    cb.disabled = TRIM(o.id) === '';
    cb.addEventListener('change', () => {
      if (cb.checked) selectedTargets.add(o.id);
      else selectedTargets.delete(o.id);
      renderExtras();
    });
    label.append(cb, el('span', 'pick-id', o.id || '(üres)'));
    label.append(el('span', 'pick-tag', known.has(o.id) ? 'ismert' : 'új'));
    if (o.dir) label.append(el('span', 'pick-dir', o.dir));
    if (o.dist) label.append(el('span', 'pick-dir', o.dist + ' m'));
    li.append(label);
    ip.append(li);
  });

  const sel = $<HTMLInputElement>('dp-station');
  sel.value = selectedStation === '' ? '' : selectedStation;
}

function renderExtras(): void {
  const type = $<HTMLSelectElement>('dp-type').value as CalcType;
  const show = (id: string, on: boolean) => {
    $(id).hidden = !on;
  };
  show('dp-row-target', type === 'PO' || type === 'VP' || type === 'ET' || type === 'IV' || type === 'SV' || type === 'SM');
  show('dp-row-startdir', type === 'SV' || type === 'SM');
  show('dp-row-center', type === 'KP');
  const target = document.getElementById('dp-target-label');
  if (target) {
    target.textContent = type === 'SV' || type === 'SM' ? 'Végpont száma' : 'Új pont száma';
  }
  const hint = CALC_TYPES.find((t) => t.code === type)?.hint ?? '';
  $('dp-type-hint').textContent = hint;
}

function setCode(text: string): void {
  $<HTMLTextAreaElement>('dp-code').value = text;
  saveDraft();
}

function setHint(text: string): void {
  $('dp-hint').textContent = text;
}

function saveDraft(): void {
  storage.set(
    DRAFT_KEY,
    JSON.stringify({ obs: observations, code: $<HTMLTextAreaElement>('dp-code').value }),
  );
}

/* ---------- kód előállítása ---------- */

function selectedObs(): Observation[] {
  const rows = observationsOf(observations, selectedStation);
  if (selectedTargets.size === 0) return rows;
  return rows.filter((o) => selectedTargets.has(o.id));
}

/** Az IV (ív-/távolságmetszés) álláspont nélküli kód: az összes mérési sor a bemenete. */
function ivObs(): Observation[] {
  if (selectedTargets.size === 0) return observations;
  return observations.filter((o) => selectedTargets.has(o.id));
}

function onGenerate(): void {
  const type = $<HTMLSelectElement>('dp-type').value as CalcType;
  const val = (id: string) => ($<HTMLInputElement>(id).value ?? '').trim();
  try {
    const code = generateCode({
      type,
      station: selectedStation,
      obs: type === 'IV' ? ivObs() : selectedObs(),
      target: val('dp-target'),
      startDir: val('dp-start-dir'),
      centerDir: val('dp-center-dir'),
      eccentricity: val('dp-ecc'),
    });
    setCode(code);
    setHint(`${type} kód előállítva.`);
  } catch (e) {
    setHint(e instanceof Error ? e.message : String(e));
  }
}

function onAutoCode(): void {
  if (observations.length === 0) {
    setHint('Nincs mérési adat az automatikus kódoláshoz.');
    return;
  }
  const known = new Set(knownPoints().keys());
  const stationCode = $<HTMLSelectElement>('dp-auto-station').value as 'tj' | 'vp';
  const count = Number($<HTMLInputElement>('dp-auto-count').value) || 1;
  const code = autoCode({ obs: observations, known, stationCode, orientCount: count });
  setCode(code);
  setHint(`Automatikus kódolás: ${stations(observations).length} álláspont, ${known.size} ismert pont.`);
}
