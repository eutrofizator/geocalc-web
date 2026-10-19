import { CalcError } from './core/errors';
import { toPyx } from './core/export';
import { averageFaces } from './core/network/averaging';
import { computeDetailPoints, type DetailPoint } from './core/network/details';
import { datumSection, placeFreeNetwork, rotationForAzimuth, type DatumInput } from './core/network/datum';
import { parseGmj, parseNetworkCoordinates, toGmj } from './core/network/gmj';
import { adjustHorizontal, type HorizontalResult } from './core/network/horizontal';
import {
  DEFAULT_HORIZONTAL_SETTINGS,
  DEFAULT_VERTICAL_SETTINGS,
  type CoordinatePrecision,
  type DirectionWeight,
  type DistanceWeight,
  type HeightWeight,
  type HorizontalSettings,
  type NetPoint,
  type VerticalSettings,
} from './core/network/types';
import { adjustHeights } from './core/network/vertical';
import { buildSketch, sketchPoints } from './core/network/sketch';
import { parseTraverseOrder, traversePreview } from './core/network/traverse-preview';
import type { Issue, Point, Section } from './core/types';
import { ISZKA_COORDINATES, ISZKA_GMJ } from './network-sample';
import { ISZKA_RAW_GMJ } from './network-sample-raw';
import { downloadReport, onMeta, renderCover } from './report-view';
import { $, csvButton, download, el, readText, renderSection, storage, svgElement } from './ui';

const STORAGE_KEY = 'geocalc-web.network';
const NET_TITLE = 'VÍZSZINTES HÁLÓZAT KIEGYENLÍTÉSE';

interface FormState {
  coordinates: string;
  gmj: string;
  settings: HorizontalSettings;
  heights: boolean;
  details: boolean;
  averaging: boolean;
  sketch: boolean;
  vertical: VerticalSettings;
}

interface Output {
  result: HorizontalResult;
  extra: Section[];
  known: NetPoint[];
  details: DetailPoint[];
  averagedGmj: string | null;
  /** A mérési vázlat SVG-je (ha be van kapcsolva). */
  sketch: string | null;
}

function render(issues: Issue[], output: Output | null): void {
  const issuesBox = $('net-issues');
  const results = $('net-results');
  const downloads = $('net-downloads');
  const status = $('net-status');
  issuesBox.replaceChildren();
  results.replaceChildren();
  downloads.replaceChildren();
  status.textContent = '';

  const label = { error: 'Hiba', warning: 'Figyelem', info: 'Info' } as const;
  for (const i of issues) {
    const row = el('div', `issue ${i.level}`);
    row.append(el('span', 'tag', label[i.level]), el('span', undefined, i.line !== undefined ? `${i.message} (${i.line}. sor)` : i.message));
    issuesBox.append(row);
  }
  if (!output) {
    if (issues.length === 0) results.append(el('p', 'empty', 'Add meg az ismert pontokat és a mérési jegyzőkönyvet, vagy tölts be egy mintapéldát.'));
    return;
  }
  const { result, extra, known, details, averagedGmj, sketch } = output;
  const sections = [...result.sections, ...extra];
  results.append(renderCover(NET_TITLE));
  for (const s of sections) results.append(renderSection(s));
  if (sketch) {
    const box = el('section', 'card sketch-card');
    box.append(el('h3', undefined, 'Mérési vázlat'));
    const svg = svgElement(sketch);
    if (svg) box.append(svg);
    box.append(
      el(
        'p',
        'footer',
        'Mérethelyes rajz: Y jobbra, X felfelé (észak felül). ● = új pont, ■ = ismert pont; ' +
          'a folytonos vonal mért (redukált) távolság (↔ oda-vissza mérve), a rövid szakasz csak irány.',
      ),
    );
    results.append(box);
  }
  const c = result.counts;
  status.textContent = `Kiszámítva ${new Date().toLocaleTimeString('hu-HU')} · ${c.new} új pont · ${c.directions} irány, ${c.distances} távolság · σ₀ = ${
    result.sigma0Posterior === null ? '–' : result.sigma0Posterior.toFixed(2)
  }″ · a mérések a jegyzőkönyv jelölőnégyzeteivel zárhatók ki a kiegyenlítésből`;

  const button = (text: string, onClick: () => void) => {
    const b = el('button', undefined, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    downloads.append(b);
  };
  button('Új pontok koordinátái (.txt)', () =>
    download('uj_pontok.txt', result.points.map((p) => `${p.id} ${p.y.toFixed(3)} ${p.x.toFixed(3)}`).join('\r\n') + '\r\n'),
  );
  if (details.length > 0) {
    button('Részletpontok (.txt)', () =>
      download('reszletpontok.txt', details.map((p) => `${p.id} ${p.y.toFixed(3)} ${p.x.toFixed(3)}${p.height === null ? '' : ` ${p.height.toFixed(3)}`}`).join('\r\n') + '\r\n'),
    );
  }
  button('Minden pont (.PYX)', () => {
    const all: Point[] = [
      ...known.map((p) => ({ id: p.id, y: p.y, x: p.x, m: p.m, code: '0' })),
      ...result.points.map((p) => ({ id: p.id, y: p.y, x: p.x, m: null, code: '1' })),
      ...details.map((p) => ({ id: p.id, y: p.y, x: p.x, m: p.height, code: '2' })),
    ];
    download('halozat.PYX', toPyx(all));
  });
  if (averagedGmj) button('Középelt GMJ (.gmj)', () => download('kozepelt.gmj', averagedGmj));
  button('Jegyzőkönyv (.txt)', () => downloadReport('halozat_jegyzokonyv.txt', NET_TITLE, sections));
  downloads.append(csvButton('halozat_tablazatok', () => sections));
}

export function initNetworkView(): void {
  const coordinates = $<HTMLTextAreaElement>('net-coords');
  const gmj = $<HTMLTextAreaElement>('net-gmj');
  const inputs = {
    sigmaDirection: $<HTMLInputElement>('net-sigma-dir'),
    sigmaDistance: $<HTMLInputElement>('net-sigma-dist'),
    sigmaDistancePerKm: $<HTMLInputElement>('net-sigma-km'),
    averageDistance: $<HTMLInputElement>('net-avg'),
    grossDirection: $<HTMLInputElement>('net-gross-dir'),
    grossDistance: $<HTMLInputElement>('net-gross-dist'),
  };
  const dirWeight = $<HTMLSelectElement>('net-dir-weight');
  const distWeight = $<HTMLSelectElement>('net-dist-weight');
  const prob = $<HTMLSelectElement>('net-prob');
  const prec = $<HTMLSelectElement>('net-prec');
  const hOn = $<HTMLInputElement>('net-h-on');
  const hSigma = $<HTMLInputElement>('net-h-sigma');
  const hUnit = $<HTMLInputElement>('net-h-unit');
  const hWeight = $<HTMLSelectElement>('net-h-weight');
  const hFree = $<HTMLInputElement>('net-h-free');
  const freeOn = $<HTMLInputElement>('net-free');
  const detailsOn = $<HTMLInputElement>('net-details-on');
  const sketchOn = $<HTMLInputElement>('net-sketch-on');
  const avgOn = $<HTMLInputElement>('net-avg-on');
  const datumAnchor = $<HTMLInputElement>('net-datum-anchor');
  const datumY = $<HTMLInputElement>('net-datum-y');
  const datumX = $<HTMLInputElement>('net-datum-x');
  const datumRot = $<HTMLInputElement>('net-datum-rot');
  const datumSecond = $<HTMLInputElement>('net-datum-second');
  const datumAz = $<HTMLInputElement>('net-datum-az');
  const traverseInput = $<HTMLInputElement>('net-traverse');
  const extraInput = $<HTMLInputElement>('net-extra');
  const exclCount = $('net-excl-count');
  let excluded: string[] = [];
  let timer: number | undefined;

  const updateExcludedLabel = () => {
    exclCount.textContent =
      excluded.length === 0
        ? 'Nincs kézzel kizárt mérés: a kizárás a jegyzőkönyv „Mérések kizárása a kiegyenlítésből” táblázatának jelölőnégyzeteivel végezhető.'
        : `Kézzel kizárt mérések (${excluded.length}): ${excluded
            .map((k) => k.replace('>', ' → ').replace(':dir', ' irány').replace(':dist', ' távolság'))
            .join(', ')}`;
  };

  const readSettings = (): HorizontalSettings => ({
    sigmaDirection: Number(inputs.sigmaDirection.value),
    sigmaDistance: Number(inputs.sigmaDistance.value),
    sigmaDistancePerKm: Number(inputs.sigmaDistancePerKm.value),
    averageDistance: Number(inputs.averageDistance.value),
    grossDirection: Number(inputs.grossDirection.value),
    grossDistance: Number(inputs.grossDistance.value),
    directionWeight: dirWeight.value as DirectionWeight,
    distanceWeight: distWeight.value as DistanceWeight,
    probability: Number(prob.value),
    coordinatePrecision: prec.value as CoordinatePrecision,
    free: freeOn.checked,
    excluded: [...excluded],
    extraPoints: extraInput.value.split(/[s,;]+/).filter((t) => t !== ''),
  });
  const readVertical = (): VerticalSettings => ({
    sigma: Number(hSigma.value),
    unitDistance: Number(hUnit.value),
    weight: hWeight.value as HeightWeight,
    probability: Number(prob.value),
    free: hFree.checked,
  });
  const writeVertical = (s: VerticalSettings, on: boolean) => {
    hOn.checked = on;
    hSigma.value = String(s.sigma);
    hUnit.value = String(s.unitDistance);
    hWeight.value = s.weight;
    hFree.checked = s.free;
  };
  const writeSettings = (s: HorizontalSettings) => {
    inputs.sigmaDirection.value = String(s.sigmaDirection);
    inputs.sigmaDistance.value = String(s.sigmaDistance);
    inputs.sigmaDistancePerKm.value = String(s.sigmaDistancePerKm);
    inputs.averageDistance.value = String(s.averageDistance);
    inputs.grossDirection.value = String(s.grossDirection);
    inputs.grossDistance.value = String(s.grossDistance);
    dirWeight.value = s.directionWeight;
    distWeight.value = s.distanceWeight;
    prob.value = String(s.probability);
    prec.value = s.coordinatePrecision ?? 'mm';
    freeOn.checked = s.free ?? false;
    excluded = [...(s.excluded ?? [])];
    extraInput.value = (s.extraPoints ?? []).join(', ');
    updateExcludedLabel();
  };

  const compute = () => {
    window.clearTimeout(timer);
    const state: FormState = {
      coordinates: coordinates.value,
      gmj: gmj.value,
      settings: readSettings(),
      heights: hOn.checked,
      details: detailsOn.checked,
      averaging: avgOn.checked,
      sketch: sketchOn.checked,
      vertical: readVertical(),
    };
    storage.set(STORAGE_KEY, JSON.stringify(state));
    if (state.coordinates.trim() === '' && state.gmj.trim() === '') {
      render([], null);
      return;
    }
    const issues: Issue[] = [];
    try {
      const known = parseNetworkCoordinates(state.coordinates);
      const parsed = parseGmj(state.gmj);
      issues.push(...known.issues, ...parsed.issues);
      // Középelés: a célpontonként többször mért irányok átlagolása (nyers, kétállásos jegyzőkönyv).
      const avg = state.averaging ? averageFaces(parsed.stations) : null;
      const meas = { stations: avg ? avg.stations : parsed.stations };
      if (avg) issues.push(...avg.issues);
      const result = adjustHorizontal(known.points, meas.stations, state.settings);
      const all = [...issues, ...result.issues];
      const extra: Section[] = avg ? [...avg.sections] : [];
      const heightMap = new Map<string, number>(known.points.filter((p) => p.m !== null).map((p) => [p.id, p.m!] as const));
      if (state.heights) {
        try {
          const h = adjustHeights(known.points, meas.stations, state.vertical, state.settings.extraPoints);
          extra.push(...h.sections);
          all.push(...h.issues);
          for (const p of h.points) heightMap.set(p.id, p.height);
        } catch (e) {
          if (!(e instanceof CalcError)) throw e;
          all.push({ level: 'warning', message: `Magassági hálózat: ${e.message}` });
        }
      }
      let details: DetailPoint[] = [];
      if (state.details) {
        const coords = new Map(known.points.map((p) => [p.id, { y: p.y, x: p.x }] as const));
        for (const p of result.points) coords.set(p.id, { y: p.y, x: p.x });
        const d = computeDetailPoints(meas.stations, coords, result.orientations, heightMap);
        details = d.points;
        extra.push(...d.sections);
        all.push(...d.issues);
      }
      // Önálló hálózat: a hálózati dátum (eltolás és forgatás) alkalmazása a kiegyenlített pontokra.
      if (state.settings.free) {
        const anchorId = datumAnchor.value.trim();
        const yRaw = datumY.value.trim();
        const xRaw = datumX.value.trim();
        if (anchorId !== '' && yRaw !== '' && xRaw !== '') {
          try {
            const pts = result.points.map((p) => ({ id: p.id, y: p.y, x: p.x }));
            const second = datumSecond.value.trim();
            const azRaw = datumAz.value.trim();
            const rotation =
              second !== '' && azRaw !== ''
                ? rotationForAzimuth(pts, anchorId, second, Number(azRaw))
                : Number(datumRot.value) || 0;
            const input: DatumInput = { points: pts, anchorId, toY: Number(yRaw), toX: Number(xRaw), rotation };
            extra.push(datumSection(input, placeFreeNetwork(input)));
          } catch (e) {
            if (!(e instanceof CalcError)) throw e;
            all.push({ level: 'warning', message: `Hálózati dátum: ${e.message}` });
          }
        } else {
          all.push({
            level: 'info',
            message: 'Önálló hálózat: a hálózati dátum (horgonypont és kívánt koordináták) megadásával helyezhető el a hálózat.',
          });
        }
      }
      // Sokszögvonal-előzetes: a megadott sorrendű vonal előzetes koordinátái és záróhibái.
      const order = parseTraverseOrder(traverseInput.value);
      if (order.length > 0) {
        try {
          const knownMap = new Map(known.points.map((p) => [p.id, { y: p.y, x: p.x }] as const));
          const tp = traversePreview(order, knownMap, meas.stations, state.settings.grossDirection);
          extra.push(...tp.sections);
        } catch (e) {
          if (!(e instanceof CalcError)) throw e;
          all.push({ level: 'warning', message: `Sokszögvonal-előzetes: ${e.message}` });
        }
      }
      // Mérési vázlat: a kiegyenlített (illetve ismert) koordinátákból, mérethelyesen.
      let sketch: string | null = null;
      if (state.sketch) {
        const allPoints = [
          ...known.points.map((p) => ({ id: p.id, y: p.y, x: p.x, m: p.m, mark: '' })),
          ...result.points.map((p) => ({ id: p.id, y: p.y, x: p.x, m: null, mark: '' })),
        ];
        const pts = sketchPoints(allPoints, new Set(known.points.map((p) => p.id)));
        sketch = buildSketch(pts, meas.stations) || null;
      }
      render(all, {
        result,
        extra,
        known: known.points,
        details,
        averagedGmj: avg && avg.rows.length > 0 ? toGmj(meas.stations) : null,
        sketch,
      });
    } catch (e) {
      if (e instanceof CalcError) issues.push({ level: 'error', message: e.message });
      else issues.push({ level: 'error', message: `A számítás nem futott le: ${e instanceof Error ? e.message : String(e)}` });
      render(issues, null);
    }
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(compute, 400);
  };

  for (const e of [coordinates, gmj, hSigma, hUnit, extraInput, ...Object.values(inputs)]) e.addEventListener('input', schedule);
  for (const e of [dirWeight, distWeight, prob, prec, hOn, hWeight, hFree, detailsOn, avgOn, sketchOn, freeOn]) e.addEventListener('change', compute);
  for (const e of [datumAnchor, datumY, datumX, datumRot, datumSecond, datumAz, traverseInput]) e.addEventListener('input', schedule);

  // A mérés kizárása a kiegyenlítésből a „Mérések kizárása” táblázat jelölőnégyzetével történik
  // (mint a GeoCalc-ban: súgó 42. o.). A bejelölt mérés kimarad, a kijelölt visszakerül.
  const toggle = (key: string, on: boolean) => {
    excluded = on ? (excluded.includes(key) ? excluded : [...excluded, key]) : excluded.filter((k) => k !== key);
    updateExcludedLabel();
    compute();
  };
  $('net-results').addEventListener('change', (event) => {
    const box = (event.target as HTMLElement).closest<HTMLInputElement>('input[data-check]');
    if (!box || box.disabled) return;
    toggle(box.dataset.check!, box.checked);
  });
  /** A jelenleg kizárható (nem automatikusan kihagyott) mérések azonosítói. */
  const measurableKeys = (): string[] =>
    [...$('net-results').querySelectorAll<HTMLInputElement>('input[data-check]')]
      .filter((b) => !b.disabled)
      .map((b) => b.dataset.check!);

  $('net-excl-all').addEventListener('click', () => {
    excluded = [...new Set([...excluded, ...measurableKeys()])];
    updateExcludedLabel();
    compute();
  });
  $('net-excl-none').addEventListener('click', () => {
    excluded = [];
    updateExcludedLabel();
    compute();
  });
  $('net-clear-excl').addEventListener('click', () => {
    excluded = [];
    updateExcludedLabel();
    compute();
  });

  const loadFile = (button: string, input: string, target: HTMLTextAreaElement) => {
    const file = $<HTMLInputElement>(input);
    $(button).addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      target.value = await readText(f);
      excluded = [];
      updateExcludedLabel();
      compute();
    });
  };
  loadFile('net-open-coords', 'net-file-coords', coordinates);
  loadFile('net-open-gmj', 'net-file-gmj', gmj);

  $('net-sample').addEventListener('click', () => {
    const dirty = (coordinates.value.trim() !== '' || gmj.value.trim() !== '') && !(coordinates.value === ISZKA_COORDINATES && gmj.value === ISZKA_GMJ);
    if (dirty && !confirm('A beviteli mezők tartalmát lecseréli a mintapélda. Folytatod?')) return;
    coordinates.value = ISZKA_COORDINATES;
    gmj.value = ISZKA_GMJ;
    traverseInput.value = '541017D 2 3 541440';
    writeSettings(DEFAULT_HORIZONTAL_SETTINGS);
    // A mintapélda önálló magassági hálózat (a GeoCalc saját kimenetével összevethető).
    writeVertical({ ...DEFAULT_VERTICAL_SETTINGS, free: true }, true);
    compute();
  });
  $('net-sample-raw').addEventListener('click', () => {
    const dirty = (coordinates.value.trim() !== '' || gmj.value.trim() !== '') && !(coordinates.value === ISZKA_COORDINATES && (gmj.value === ISZKA_GMJ || gmj.value === ISZKA_RAW_GMJ));
    if (dirty && !confirm('A beviteli mezők tartalmát lecseréli a mintapélda. Folytatod?')) return;
    coordinates.value = ISZKA_COORDINATES;
    gmj.value = ISZKA_RAW_GMJ;
    avgOn.checked = true;
    writeSettings(DEFAULT_HORIZONTAL_SETTINGS);
    writeVertical({ ...DEFAULT_VERTICAL_SETTINGS, free: true }, true);
    compute();
  });
  $('net-reset').addEventListener('click', () => {
    writeSettings({ ...DEFAULT_HORIZONTAL_SETTINGS, excluded, extraPoints: readSettings().extraPoints });
    writeVertical(DEFAULT_VERTICAL_SETTINGS, hOn.checked);
    compute();
  });
  $('net-print').addEventListener('click', () => window.print());
  onMeta(compute);

  try {
    const saved = JSON.parse(storage.get(STORAGE_KEY) || 'null') as FormState | null;
    if (saved && saved.settings) {
      coordinates.value = saved.coordinates ?? '';
      gmj.value = saved.gmj ?? '';
      writeSettings({ ...DEFAULT_HORIZONTAL_SETTINGS, ...saved.settings });
      writeVertical({ ...DEFAULT_VERTICAL_SETTINGS, ...(saved.vertical ?? {}) }, saved.heights ?? true);
      detailsOn.checked = saved.details ?? true;
      avgOn.checked = saved.averaging ?? true;
      sketchOn.checked = saved.sketch ?? false;
    } else {
      writeSettings(DEFAULT_HORIZONTAL_SETTINGS);
      writeVertical(DEFAULT_VERTICAL_SETTINGS, true);
      sketchOn.checked = false;
    }
  } catch {
    writeSettings(DEFAULT_HORIZONTAL_SETTINGS);
    writeVertical(DEFAULT_VERTICAL_SETTINGS, true);
  }
}
