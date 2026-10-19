import { CalcError } from './core/errors';
import {
  EMPTY_PARAM_FIELDS,
  PARAM_FIELD_META,
  applyTransform,
  checkParams,
  fieldsToParams,
  fromSkiFields,
  type ParamFields,
} from './core/geo/apply';
import { toPyx2 } from './core/export';
import { interpolationSection, type InterpolationAnchor } from './core/geo/interpolate';
import { parseCoordinateList } from './core/geo/spatial';
import { SYSTEMS, SYSTEM_IDS, type SystemId } from './core/geo/systems';
import type { Point, Row, Section } from './core/types';
import { downloadReport, onMeta, renderCover } from './report-view';
import { appendCommonPoint, getFittedParams } from './transform-store';
import { $, csvButton, download, el, renderSection, storage } from './ui';

/**
 * A Térbeli transzformáció/Átszámítás munkalap (súgó 63–64. o.).
 *
 * A kiszámított (vagy kézzel megadott) 7 paraméterrel végzi a pontok átszámítását. A mentett
 * paraméterek segítségével közös pont nélkül is átszámíthatók a pontok. A kimenet szöveges
 * koordináta-, földrajzi- vagy GeoCalc-DB (.pyx) állományba írható.
 */

const STORAGE_KEY = 'geocalc-web.transform-apply';
const TA_TITLE = 'TÉRBELI TRANSZFORMÁCIÓ / ÁTSZÁMÍTÁS';

type SaveKind = 'szoveges' | 'foldrajzi' | 'db';

interface FormState {
  from: SystemId;
  to: SystemId;
  twoD: boolean;
  fields: ParamFields;
  ski: boolean;
  /** Interpoláció a közös pontok javításaiból (a paraméterszámítás munkalapjáról átvéve). */
  interpolate?: boolean;
  points: string;
  saveKind: SaveKind;
}

const fix = (n: number, d: number) => {
  const s = n.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
};

/** A földrajzi kiírás „fok.perc.másodperc” alakja (a bevitelhez használt formátum megfordítása). */
function geographicText(deg: number): string {
  const sign = deg < 0 ? '-' : '';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const min = Math.floor((abs - d) * 60);
  const sec = ((abs - d) * 60 - min) * 60;
  return `${sign}${d}°${String(min).padStart(2, '0')}′${fix(sec, 2).padStart(5, '0')}″`;
}

export function initTransformApplyView(): void {
  const fromSel = $<HTMLSelectElement>('ta-from');
  const toSel = $<HTMLSelectElement>('ta-to');
  const dim3 = $<HTMLInputElement>('ta-3d');
  const dim2 = $<HTMLInputElement>('ta-2d');
  const ski = $<HTMLInputElement>('ta-ski');
  const interpolateOn = $<HTMLInputElement>('ta-interp');
  const points = $<HTMLTextAreaElement>('ta-points');
  const saveKind = $<HTMLSelectElement>('ta-save-kind');
  const stepId = $<HTMLInputElement>('ta-2step-id');
  const issues = $('ta-issues');
  const results = $('ta-results');
  const downloads = $('ta-downloads');
  const status = $('ta-status');

  const fields: Record<keyof ParamFields, HTMLInputElement> = {
    tX: $<HTMLInputElement>('ta-tx'),
    tY: $<HTMLInputElement>('ta-ty'),
    tZ: $<HTMLInputElement>('ta-tz'),
    rX: $<HTMLInputElement>('ta-rx'),
    rY: $<HTMLInputElement>('ta-ry'),
    rZ: $<HTMLInputElement>('ta-rz'),
    sMmKm: $<HTMLInputElement>('ta-s'),
  };

  for (const sel of [fromSel, toSel]) {
    for (const id of SYSTEM_IDS) sel.append(new Option(SYSTEMS[id].label, id));
  }

  let timer: number | undefined;

  const readFields = (): ParamFields => ({
    tX: Number(fields.tX.value) || 0,
    tY: Number(fields.tY.value) || 0,
    tZ: Number(fields.tZ.value) || 0,
    rX: Number(fields.rX.value) || 0,
    rY: Number(fields.rY.value) || 0,
    rZ: Number(fields.rZ.value) || 0,
    sMmKm: Number(fields.sMmKm.value) || 0,
  });

  const writeFields = (f: ParamFields) => {
    // A mezők a jegyzőkönyvben is használt pontossággal jelennek meg (súgó 63. o.).
    for (const meta of PARAM_FIELD_META) fields[meta.key].value = fix(f[meta.key], meta.digits);
  };

  const state = (): FormState => ({
    from: fromSel.value as SystemId,
    to: toSel.value as SystemId,
    twoD: dim2.checked,
    fields: readFields(),
    ski: ski.checked,
    interpolate: interpolateOn.checked,
    points: points.value,
    saveKind: saveKind.value as SaveKind,
  });

  const apply = (s: FormState) => {
    fromSel.value = s.from;
    toSel.value = s.to;
    dim2.checked = s.twoD;
    dim3.checked = !s.twoD;
    ski.checked = s.ski;
    interpolateOn.checked = s.interpolate ?? false;
    writeFields(s.fields);
    points.value = s.points;
    saveKind.value = s.saveKind;
  };

  /** Az interpolációhoz használható közös pontok (ha a paramétereket átvettük). */
  const interpolationAnchors = (s: FormState): { ok: true; anchors: InterpolationAnchor[] } | { ok: false; reason: string } => {
    const fitted = getFittedParams();
    if (!fitted || !fitted.anchors || fitted.anchors.length === 0) {
      return { ok: false, reason: 'Nincs átvehető közös pont: az interpolációhoz a „Paraméterek átvétele” gombbal kell behozni a paraméterszámítás munkalapjának közös pontjait.' };
    }
    if (fitted.from !== s.from || fitted.to !== s.to || fitted.twoD !== s.twoD) {
      return { ok: false, reason: `Az átvett közös pontok más rendszerekhez tartoznak (${fitted.from} → ${fitted.to}, ${fitted.twoD ? '2D' : '3D'}), mint a jelenlegi beállítás.` };
    }
    return { ok: true, anchors: fitted.anchors };
  };

  const updateHints = () => {
    $('ta-cols').textContent =
      `A kiinduló rendszerben: pontszám, ${SYSTEMS[fromSel.value as SystemId].columns.join(', ')}; ` +
      `a cél rendszerben: pontszám, ${SYSTEMS[toSel.value as SystemId].columns.join(', ')}.`;
  };

  const showError = (message: string) => {
    const row = el('div', 'issue error');
    row.append(el('span', 'tag', 'Hiba'), el('span', undefined, message));
    issues.append(row);
  };

  /** A kiválasztott kimeneti formátum szerinti szöveg. */
  const formatOutput = (
    s: FormState,
    converted: { id: string; input: string[]; output: string[] }[],
    values: number[][],
    geo: [number, number, number][],
  ): { name: string; text: string } => {
    if (s.saveKind === 'foldrajzi') {
      const lines = converted.map((c, i) => {
        const g = geo[i]!;
        return `${c.id} ${geographicText(g[0])} ${geographicText(g[1])} ${fix(g[2], 3)}`;
      });
      return { name: 'atszamitott_foldrajzi.txt', text: ['# Földrajzi koordináták (a cél rendszer ellipszoidján)', ...lines].join('\r\n') + '\r\n' };
    }
    if (s.saveKind === 'db') {
      const pts: Point[] = converted.map((c, i) => ({ id: c.id, y: values[i]![0]!, x: values[i]![1]!, m: values[i]![2] ?? null, code: '0' }));
      return { name: 'atszamitott.pyx', text: toPyx2(pts, new Set()) };
    }
    const lines = converted.map((c) => `${c.id} ${c.output.join(' ')}`);
    return {
      name: 'atszamitott.txt',
      text: [`# ${SYSTEMS[s.from].label} → ${SYSTEMS[s.to].label} (${s.twoD ? '2D' : '3D'})`, `# pontszám ${SYSTEMS[s.to].columns.join(' ')}`, ...lines].join('\r\n') + '\r\n',
    };
  };

  const buildSections = (s: FormState, f: ParamFields, converted: { id: string; input: string[]; output: string[] }[], geo: [number, number, number][]): Section[] => {
    const sections: Section[] = [];
    sections.push({
      kind: 'ta-params',
      title: 'A felhasznált transzformációs paraméterek',
      columns: ['Paraméter', 'Érték', 'Egység'],
      rows: PARAM_FIELD_META.map<Row>((m) => ({ cells: [m.label, fix(f[m.key], m.digits), m.unit], role: 'base' })),
      footer: [
        'Pozíció-vektor értelmezés: X′ = T + (1 + s)·(X + R × X).',
        s.ski ? 'A forgatási szögek Leica SKI előjellel (fordítva) értendők.' : 'A forgatási szögek a GeoCalc előjelével értendők.',
      ],
    });
    if (converted.length > 0) {
      const a = SYSTEMS[s.from].columns;
      const b = SYSTEMS[s.to].columns;
      sections.push({
        kind: 'ta-converted',
        title: `Átszámított pontok: ${SYSTEMS[s.from].label} → ${SYSTEMS[s.to].label}`,
        columns: ['Pontszám', ...a, ...b],
        rows: converted.map<Row>((c) => ({ cells: [c.id, ...c.input, ...c.output], role: 'result' })),
      });
      sections.push({
        kind: 'ta-geo',
        title: 'Földrajzi koordináták a cél rendszer ellipszoidján',
        columns: ['Pontszám', 'Szélesség', 'Hosszúság', 'Ellipszoid feletti magasság [m]'],
        rows: converted.map<Row>((c, i) => {
          const g = geo[i]!;
          return { cells: [c.id, geographicText(g[0]), geographicText(g[1]), fix(g[2], 3)], role: 'base' };
        }),
      });
    }
    return sections;
  };

  const compute = () => {
    window.clearTimeout(timer);
    const s = state();
    storage.set(STORAGE_KEY, JSON.stringify(s));
    issues.replaceChildren();
    results.replaceChildren();
    downloads.replaceChildren();
    status.textContent = '';
    updateHints();

    // A Leica SKI előjelű forgatás átvétele.
    const f = s.ski ? fromSkiFields(s.fields) : s.fields;
    const problem = checkParams(f);
    if (problem) {
      showError(problem);
      return;
    }
    if (s.points.trim() === '') {
      results.append(el('p', 'empty', 'Add meg az átszámítandó pontokat, vagy vedd át a paramétereket a paraméterszámításból.'));
      return;
    }
    try {
      const list = parseCoordinateList(s.points, s.from, s.twoD);
      let anchors: InterpolationAnchor[] | undefined;
      if (s.interpolate) {
        const a = interpolationAnchors(s);
        if (!a.ok) {
          showError(a.reason);
          return;
        }
        anchors = a.anchors;
      }
      const r = applyTransform({ from: s.from, to: s.to, twoD: s.twoD, params: fieldsToParams(f), points: list, anchors });
      const sections = buildSections(s, f, r.converted, r.geographic);
      const interp = interpolationSection(r.interpolations);
      if (interp) sections.push(interp);
      for (const section of sections) results.append(renderSection(section));
      results.prepend(renderCover(TA_TITLE));
      status.textContent = `Kiszámítva ${new Date().toLocaleTimeString('hu-HU')} · ${r.converted.length} átszámított pont${
        r.interpolations.length > 0 ? ' · interpolációval' : ''
      }`;

      const values = r.convertedValues.map((c) => c.coords);
      const out = formatOutput(s, r.converted, values, r.geographic);
      const b = el('button', undefined, 'Átszámított koordináták letöltése');
      b.type = 'button';
      b.addEventListener('click', () => download(out.name, out.text));
      downloads.append(b);
      const j = el('button', undefined, 'Jegyzőkönyv (.txt)');
      j.type = 'button';
      j.addEventListener('click', () => downloadReport('atszamitas_jegyzokonyv.txt', TA_TITLE, sections));
      downloads.append(j);
      downloads.append(csvButton('atszamitas_tablazatok', () => sections));
    } catch (e) {
      if (e instanceof CalcError) showError(e.message);
      else showError(`Az átszámítás nem futott le: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(compute, 350);
  };

  points.addEventListener('input', schedule);
  for (const e of [saveKind, ski, dim2, dim3, interpolateOn, ...Object.values(fields)]) e.addEventListener('change', compute);
  for (const e of Object.values(fields)) e.addEventListener('input', schedule);

  // A paraméterszámításból átvett paraméterek.
  const take = () => {
    const p = getFittedParams();
    if (!p) {
      showError('Nincs átvehető paraméter: előbb futtasd a Térbeli transzformáció/Transzformációs paraméterek számítása munkalapot (keresősugaras módszerrel pontonként változó paraméterek nem vehetők át).');
      return;
    }
    apply({ ...state(), from: p.from, to: p.to, twoD: p.twoD, fields: p.fields, ski: false });
    compute();
    status.textContent = `A paraméterek átvéve a paraméterszámításból (${p.commonCount} közös pont, σ₀ = ${fix(p.sigma0, 4)} m).`;
  };
  $('ta-take').addEventListener('click', take);

  // Hozzáadás a közös pontokhoz (kétlépcsős módszer).
  $('ta-2step-add').addEventListener('click', () => {
    const id = stepId.value.trim();
    if (id === '') {
      showError('Add meg a pont számát a közös pontokhoz fűzéshez.');
      return;
    }
    const s = state();
    const f = s.ski ? fromSkiFields(s.fields) : s.fields;
    try {
      const list = parseCoordinateList(points.value, s.from, s.twoD);
      const picked = list.find((p) => p.id === id);
      if (!picked) {
        showError(`A(z) ${id} pontszám nem szerepel az átszámítandó pontok között.`);
        return;
      }
      const r = applyTransform({ from: s.from, to: s.to, twoD: s.twoD, params: fieldsToParams(f), points: [picked] });
      const one = r.converted[0]!;
      const fromLine = `${one.id} ${one.input.join(' ')}`;
      const toLine = `${one.id} ${one.output.join(' ')}`;
      if (!appendCommonPoint(fromLine, toLine)) {
        showError('A paraméterszámítás munkalap nem érhető el.');
        return;
      }
      stepId.value = '';
      status.textContent = `A(z) ${id} pont hozzáfűzve a közös pontokhoz: ${fromLine} → ${toLine}.`;
    } catch (e) {
      if (e instanceof CalcError) showError(e.message);
      else showError(`A közös pontokhoz fűzés nem sikerült: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  $('ta-null').addEventListener('click', () => {
    writeFields({ ...EMPTY_PARAM_FIELDS });
    compute();
  });

  const print = () => window.print();
  $('ta-print').addEventListener('click', print);
  $('ta-print2').addEventListener('click', print);
  onMeta(compute);

  try {
    const saved = JSON.parse(storage.get(STORAGE_KEY) || 'null') as FormState | null;
    if (saved && SYSTEMS[saved.from] && SYSTEMS[saved.to]) apply({ ...saved, fields: { ...EMPTY_PARAM_FIELDS, ...saved.fields } });
    else apply({ from: 'EOV', to: 'WGS84_FLH', twoD: true, fields: { ...EMPTY_PARAM_FIELDS }, ski: false, points: '', saveKind: 'szoveges' });
  } catch {
    apply({ from: 'EOV', to: 'WGS84_FLH', twoD: true, fields: { ...EMPTY_PARAM_FIELDS }, ski: false, points: '', saveKind: 'szoveges' });
  }
  compute();
}
