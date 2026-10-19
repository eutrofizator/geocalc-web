import { CalcError } from './core/errors';
import { appendLine, transformWithRadius, twoStepCommon } from './core/geo/radius';
import { paramsToFields } from './core/geo/apply';
import { interpolationSection, type InterpolationAnchor } from './core/geo/interpolate';
import { parseCoordinateList, spatialTransform, type SpatialResult } from './core/geo/spatial';
import { SYSTEMS, SYSTEM_IDS, type SystemId } from './core/geo/systems';
import type { Row, Section } from './core/types';
import { TRANSFORM_SAMPLE } from './transform-sample';
import { downloadReport, onMeta, renderCover } from './report-view';
import { setCommonAppender, setFittedParams } from './transform-store';
import { $, csvButton, download, el, renderSection, storage } from './ui';

const STORAGE_KEY = 'geocalc-web.transform';
const TR_TITLE = 'TÉRBELI TRANSZFORMÁCIÓ';

interface FormState {
  from: SystemId;
  to: SystemId;
  twoD: boolean;
  radiusOn?: boolean;
  radius?: number;
  interpolate?: boolean;
  commonFrom: string;
  commonTo: string;
  points: string;
}

const fixed = (n: number, d: number) => {
  const s = n.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
};

const PARAM_DIGITS = [4, 4, 4, 5, 5, 5, 2];

function buildSections(r: SpatialResult, from: SystemId, to: SystemId, twoD: boolean): Section[] {
  const sections: Section[] = [];
  const digits = PARAM_DIGITS;
  sections.push({
    kind: 'params',
    title: `Transzformációs paraméterek és középhibáik (${twoD ? '2D' : '3D'})`,
    columns: ['Paraméter', 'Érték', 'Középhiba', 'Egység'],
    rows: r.summary.labels.map<Row>((label, i) => ({
      cells: [label, fixed(r.summary.values[i]!, digits[i]!), fixed(r.summary.sigmas[i]!, digits[i]!), r.summary.units[i]!],
      role: 'base',
    })),
    footer: [
      `${r.commonCount} közös pont, ${r.fit.dof} szabadsági fok, az illeszkedés középhibája σ₀ = ${fixed(r.fit.sigma0, 4)} m ` +
        `(RMS: kelet ${fixed(r.rms.e, 4)} m, észak ${fixed(r.rms.n, 4)} m, magasság ${fixed(r.rms.h, 4)} m)`,
      'A paraméterek pozíció-vektor értelmezésűek: X′ = T + (1 + s)·(X + R × X); a magasságokat ellipszoid feletti magasságként kezeli.',
    ],
  });
  sections.push({
    kind: 'residuals',
    title: 'Közös pontok javításai (a transzformált koordinátákhoz adva az eredeti koordinátákat adják)',
    columns: ['Pontszám', 'vX', 'vY', 'vZ', 'vE', 'vN', 'vh'],
    rows: r.residuals.map<Row>((v) => ({
      cells: [v.id, ...[v.vX, v.vY, v.vZ, v.vE, v.vN, v.vH].map((x) => fixed(x, 3))],
      role: 'base',
    })),
  });
  if (r.converted.length > 0) {
    const a = SYSTEMS[from].columns;
    const b = SYSTEMS[to].columns;
    sections.push({
      kind: 'converted',
      title: `Átszámított pontok: ${SYSTEMS[from].label} → ${SYSTEMS[to].label}`,
      columns: ['Pontszám', ...a, ...b],
      rows: r.converted.map<Row>((c) => ({ cells: [c.id, ...c.input, ...c.output], role: 'result' })),
    });
  }
  return sections;
}

export function initTransformView(): void {
  const fromSel = $<HTMLSelectElement>('tr-from');
  const toSel = $<HTMLSelectElement>('tr-to');
  const dim3 = $<HTMLInputElement>('tr-3d');
  const dim2 = $<HTMLInputElement>('tr-2d');
  const radiusOn = $<HTMLInputElement>('tr-radius-on');
  const radiusInput = $<HTMLInputElement>('tr-radius');
  const interpolateOn = $<HTMLInputElement>('tr-interp');
  const twoStepId = $<HTMLInputElement>('tr-2step-id');
  const twoStepH = $<HTMLInputElement>('tr-2step-h');
  const commonFrom = $<HTMLTextAreaElement>('tr-common-from');
  const commonTo = $<HTMLTextAreaElement>('tr-common-to');
  const points = $<HTMLTextAreaElement>('tr-points');
  const issues = $('tr-issues');
  const results = $('tr-results');
  const downloads = $('tr-downloads');
  const status = $('tr-status');

  for (const sel of [fromSel, toSel]) {
    for (const id of SYSTEM_IDS) sel.append(new Option(SYSTEMS[id].label, id));
  }

  let timer: number | undefined;

  const state = (): FormState => ({
    from: fromSel.value as SystemId,
    to: toSel.value as SystemId,
    twoD: dim2.checked,
    radiusOn: radiusOn.checked,
    radius: Number(radiusInput.value) || 0,
    interpolate: interpolateOn.checked,
    commonFrom: commonFrom.value,
    commonTo: commonTo.value,
    points: points.value,
  });
  const apply = (s: FormState) => {
    fromSel.value = s.from;
    toSel.value = s.to;
    dim2.checked = s.twoD;
    dim3.checked = !s.twoD;
    radiusOn.checked = s.radiusOn ?? false;
    interpolateOn.checked = s.interpolate ?? false;
    if (s.radius) radiusInput.value = String(s.radius);
    commonFrom.value = s.commonFrom;
    commonTo.value = s.commonTo;
    points.value = s.points;
  };

  const updateHints = () => {
    $('tr-from-cols').textContent = `pontszám, ${SYSTEMS[fromSel.value as SystemId].columns.join(', ')}`;
    $('tr-to-cols').textContent = `pontszám, ${SYSTEMS[toSel.value as SystemId].columns.join(', ')}`;
    $('tr-points-cols').textContent = `a kiinduló rendszerben: pontszám, ${SYSTEMS[fromSel.value as SystemId].columns.join(', ')}`;
  };

  const showError = (message: string) => {
    const row = el('div', 'issue error');
    row.append(el('span', 'tag', 'Hiba'), el('span', undefined, message));
    issues.append(row);
  };

  const digits = (i: number) => PARAM_DIGITS[i]!;

  const compute = () => {
    window.clearTimeout(timer);
    const s = state();
    storage.set(STORAGE_KEY, JSON.stringify(s));
    issues.replaceChildren();
    results.replaceChildren();
    downloads.replaceChildren();
    status.textContent = '';
    updateHints();
    if (s.commonFrom.trim() === '' && s.commonTo.trim() === '') {
      results.append(el('p', 'empty', 'Add meg a közös pontokat mindkét rendszerben, vagy tölts be egy mintapéldát.'));
      return;
    }
    try {
      const request = {
        from: s.from,
        to: s.to,
        twoD: s.twoD,
        commonFrom: parseCoordinateList(s.commonFrom, s.from, s.twoD),
        commonTo: parseCoordinateList(s.commonTo, s.to, s.twoD),
        points: parseCoordinateList(s.points, s.from, s.twoD),
        interpolate: s.interpolate ?? false,
      };
      const radiusMode = s.radiusOn && request.points.length > 0;
      if (radiusMode && s.interpolate) {
        const row = el('div', 'issue info');
        row.append(
          el('span', 'tag', 'Info'),
          el('span', undefined, 'Keresősugár mellett minden pont a saját környezetének közös pontjaiból számol, ezért az interpoláció itt nem kerül alkalmazásra.'),
        );
        issues.append(row);
      }
      let sections: Section[];
      let converted: { id: string; input: string[]; output: string[] }[];
      let commonCount: number;
      let paramLines: string[];

      if (radiusMode) {
        const rr = transformWithRadius({ ...request, interpolate: false }, s.radius ?? 0);
        sections = rr.sections;
        converted = rr.points.map((p) => ({ id: p.id, input: p.input, output: p.output }));
        commonCount = request.commonFrom.length;
        paramLines = rr.points.map((p) => `${p.id}: ${p.params.map((v, i) => `${v.toFixed(PARAM_DIGITS[i]!)}`).join(' ')}`);
        // Keresősugaras módszer: pontonként más paraméter, ezért az Átszámítás munkalap nem vehet át egyet.
        setFittedParams(null);
        if (rr.failed.length > 0) {
          const row = el('div', 'issue warning');
          row.append(
            el('span', 'tag', 'Figyelem'),
            el('span', undefined, `${rr.failed.length} pont a keresősugárban nem számítható: ${rr.failed.map((f) => f.id).join(', ')}.`),
          );
          issues.append(row);
        }
      } else {
        const result = spatialTransform(request);
        sections = buildSections(result, s.from, s.to, s.twoD);
        const interp = interpolationSection(result.interpolations);
        if (interp) sections.push(interp);
        converted = result.converted;
        commonCount = result.commonCount;
        paramLines = result.summary.labels.map(
          (l, i) => `${l}: ${fixed(result.summary.values[i]!, digits(i))} ${result.summary.units[i]} (± ${fixed(result.summary.sigmas[i]!, digits(i))})`,
        );
        setFittedParams({
          from: s.from,
          to: s.to,
          twoD: s.twoD,
          fields: paramsToFields(result.fit.params),
          commonCount: result.commonCount,
          sigma0: result.fit.sigma0,
          anchors: result.residuals.map<InterpolationAnchor>((v) => ({
            id: v.id,
            xyz: SYSTEMS[s.to].toGeocentric(
              parseCoordinateList(s.commonTo, s.to, s.twoD).find((p) => p.id === v.id)!.coords,
              s.twoD,
            ),
            residual: [v.vX, v.vY, v.vZ],
          })),
        });
      }

      for (const section of sections) results.append(renderSection(section));
      results.prepend(renderCover(TR_TITLE));
      status.textContent =
        `Kiszámítva ${new Date().toLocaleTimeString('hu-HU')} · ${commonCount} közös pont · ${converted.length} átszámított pont` +
        (radiusMode ? ` · keresősugár: ${fixed(s.radius ?? 0, 0)} m` : '');

      if (converted.length > 0) {
        const names = SYSTEMS[s.to].columns;
        const b = el('button', undefined, 'Átszámított koordináták letöltése (.txt)');
        b.type = 'button';
        b.addEventListener('click', () => {
          const header = `Pontszám ${names.join(' ')}`;
          const lines = converted.map((c) => `${c.id} ${c.output.join(' ')}`);
          download('atszamitott.txt', [`# ${SYSTEMS[s.from].label} → ${SYSTEMS[s.to].label}`, `# ${header}`, ...lines].join('\r\n') + '\r\n');
        });
        downloads.append(b);
      }
      const p = el('button', undefined, 'Paraméterek letöltése (.txt)');
      p.type = 'button';
      p.addEventListener('click', () => {
        download(
          'parameterek.txt',
          [`${SYSTEMS[s.from].label} → ${SYSTEMS[s.to].label} (${s.twoD ? '2D' : '3D'})${radiusMode ? ` – keresősugár ${fixed(s.radius ?? 0, 0)} m` : ''}`, ...paramLines].join('\r\n') + '\r\n',
        );
      });
      downloads.append(p);
      const j = el('button', undefined, 'Jegyzőkönyv (.txt)');
      j.type = 'button';
      j.addEventListener('click', () => downloadReport('transzformacio_jegyzokonyv.txt', TR_TITLE, sections));
      downloads.append(j);
      downloads.append(csvButton('transzformacio_tablazatok', () => sections));
    } catch (e) {
      if (e instanceof CalcError) showError(e.message);
      else showError(`A számítás nem futott le: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(compute, 350);
  };

  for (const e of [commonFrom, commonTo, points, radiusInput]) e.addEventListener('input', schedule);
  for (const e of [fromSel, toSel, dim2, dim3, radiusOn, interpolateOn]) e.addEventListener('change', compute);

  // Kétlépcsős módszer: a kijelölt pont átszámítása után a közös pontok listájára fűzés.
  $('tr-2step-add').addEventListener('click', () => {
    const s = state();
    const id = twoStepId.value.trim();
    if (id === '') {
      showError('Add meg a pont számát a kétlépcsős módszerhez.');
      return;
    }
    try {
      const request = {
        from: s.from,
        to: s.to,
        twoD: s.twoD,
        commonFrom: parseCoordinateList(s.commonFrom, s.from, s.twoD),
        commonTo: parseCoordinateList(s.commonTo, s.to, s.twoD),
        points: parseCoordinateList(s.points, s.from, s.twoD),
      };
      if (request.commonFrom.some((p) => p.id === id) || request.commonTo.some((p) => p.id === id)) {
        showError(`A(z) ${id} pont már szerepel a közös pontok között.`);
        return;
      }
      const h = twoStepH.value.trim();
      const r = twoStepCommon(request, id, h === '' ? null : Number(h));
      commonFrom.value = appendLine(commonFrom.value, r.fromLine);
      commonTo.value = appendLine(commonTo.value, r.toLine);
      twoStepId.value = '';
      compute();
      status.textContent = `A(z) ${id} pont hozzáfűzve a közös pontokhoz. 3D beállításnál számolj újra a magasságok bevonásához.`;
    } catch (e) {
      if (e instanceof CalcError) showError(e.message);
      else showError(`A kétlépcsős módszer nem futott le: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  $('tr-swap').addEventListener('click', () => {
    const s = state();
    apply({ ...s, from: s.to, to: s.from, commonFrom: s.commonTo, commonTo: s.commonFrom, points: '' });
    compute();
  });

  $('tr-sample').addEventListener('click', () => {
    const s = state();
    const dirty = [s.commonFrom, s.commonTo, s.points].some((t) => t.trim() !== '') && JSON.stringify({ ...s }) !== JSON.stringify({ ...TRANSFORM_SAMPLE, twoD: false });
    if (dirty && !confirm('A beviteli mezők tartalmát lecseréli a mintapélda. Folytatod?')) return;
    apply({ ...TRANSFORM_SAMPLE, twoD: false });
    compute();
  });

  $('tr-print').addEventListener('click', () => window.print());
  onMeta(compute);

  // Az Átszámítás munkalap ide fűzi a közös pontokhoz az átszámított pontot (kétlépcsős módszer).
  setCommonAppender((fromLine, toLine) => {
    commonFrom.value = appendLine(commonFrom.value, fromLine);
    commonTo.value = appendLine(commonTo.value, toLine);
    compute();
  });

  // Indulás: utolsó munka vagy üres állapot.
  try {
    const saved = JSON.parse(storage.get(STORAGE_KEY) || 'null') as FormState | null;
    if (saved && SYSTEMS[saved.from] && SYSTEMS[saved.to]) apply(saved);
    else apply({ ...TRANSFORM_SAMPLE, twoD: false, commonFrom: '', commonTo: '', points: '' });
  } catch {
    apply({ ...TRANSFORM_SAMPLE, twoD: false, commonFrom: '', commonTo: '', points: '' });
  }
  updateHints();
}
