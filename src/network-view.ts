import { formatDms } from './core/angle';
import { CalcError } from './core/errors';
import { toPyx } from './core/export';
import { fix } from './core/format';
import { averageFaces } from './core/network/averaging';
import { computeDetailPoints, workCoordinateList, type DetailPoint, type WorkPoint } from './core/network/details';
import { datumSection, placeFreeNetwork, rotationForAzimuth, type DatumInput } from './core/network/datum';
import { parseGmj, parseNetworkCoordinates, toGmj } from './core/network/gmj';
import { adjustHorizontal, type HorizontalResult } from './core/network/horizontal';
import { preliminaryCoordinates, preliminaryOrientationSection, type Pt } from './core/network/preliminary';
import {
  DEFAULT_HORIZONTAL_SETTINGS,
  DEFAULT_VERTICAL_SETTINGS,
  type CoordinatePrecision,
  type DirectionWeight,
  type DistanceWeight,
  type HeightWeight,
  type HorizontalSettings,
  type NetPoint,
  type NetStation,
  type VerticalSettings,
} from './core/network/types';
import { adjustHeights, coordinateHeightDifference, trigonometricHeightDifference, type VerticalResult } from './core/network/vertical';
import { buildSketch, sketchPoints } from './core/network/sketch';
import { polygonClosure, parseTraverseOrder, traversePreview, type TraversePreview } from './core/network/traverse-preview';
import { heightLine, heightLineSections, type HeightLineResult } from './core/network/height-lines';
import type { Issue, Point, Row, Section } from './core/types';
import { ISZKA_COORDINATES, ISZKA_GMJ } from './network-sample';
import { ISZKA_RAW_GMJ } from './network-sample-raw';
import { downloadReport, onMeta, renderCover } from './report-view';
import { $, csvButton, download, el, readText, renderReportTree, renderSection, storage, svgElement } from './ui';

/**
 * Hálózatkiegyenlítés – a valódi program öt lépése (súgó 50–54. o.), mindegyik saját munkalapon:
 *
 * 1. Munkaterület – a munkaállomány, a koordináták és a mérési jegyzőkönyv;
 * 2. Előzetes számítások – a kiegyenlítésbe bevont pontok (álláspontok, ismert és további pontok),
 *    az új pontok előzetes koordinátái, a státusz átállítása, sokszögvonal és előzetes tájékozás;
 * 3. Vízszintes kiegyenlítés – mérésenként a javítás, a hibahatár és a statisztika; a cellára kattintva
 *    a mérés kihagyható; hálózati dátum, mérési vázlat;
 * 4. Magassági kiegyenlítés – a magasságkülönbségek, a kihagyásuk, az adott magasságú pontok, élesség;
 * 5. Részletpontok számítása – a számítandó álláspontok, koordináta-export, munka koordináta-jegyzék.
 *
 * A teljes számítási jegyzőkönyv a valódi program „Előkép” ablakának mintájára külön nézegetőben nyílik.
 * A számítás minden változásra lefut (a lépések gombjai a jegyzőkönyvet is frissítik).
 */

const STORAGE_KEY = 'geocalc-web.network';
const NET_TITLE = 'VÍZSZINTES HÁLÓZAT KIEGYENLÍTÉSE';

interface WorkListState {
  heights: boolean;
  coordDecimals: number;
  heightDecimals: number;
}

interface FormState {
  coordinates: string;
  gmj: string;
  settings: HorizontalSettings;
  heights: boolean;
  details: boolean;
  averaging: boolean;
  sketch: boolean;
  vertical: VerticalSettings;
  workname?: string;
  /** Az Álláspont(ok) listából kihagyott álláspontok. */
  removedStations?: string[];
  /** Az Ismert pont(ok) listából kihagyott pontok. */
  removedKnown?: string[];
  /** Ismert pontok, amelyeknek a státuszát új pontra állították (önálló hálózat, súgó 51. o.). */
  statusNew?: string[];
  /** Új pontok, amelyeket kézzel beírt koordinátával adottnak állítottak. */
  manual?: Record<string, Pt>;
  /** Magassággal rendelkező, de magasságilag nem adott pontok (súgó 53. o.). */
  heightFloating?: string[];
  /** A számítandó álláspontok a részletpontokhoz (üres: mind). */
  detailStations?: string[] | null;
  /** Előzetes tájékozás a jegyzőkönyvben (a bevont irányok típusa). */
  orientation?: { known: boolean; computed: boolean } | null;
  /** Munka koordináta-jegyzék a jegyzőkönyvben. */
  workList?: WorkListState | null;
  /** Poligon záróhiba: a poligon pontjai (a kezdőpont ismétlése nélkül). */
  polygon?: string[];
  /** Magassági vonalak: az előírt vonalak és a szerkesztés alatti vonal. */
  heightLines?: LineDef[];
  lineDraft?: LineDef;
}

interface LineDef {
  name: string;
  order: string[];
}

/** Egy lépés táblázatának adatai a legutóbbi számításból. */
interface Model {
  stations: NetStation[];
  allStations: string[];
  knownAll: NetPoint[];
  known: NetPoint[];
  extra: string[];
  used: string[];
  newIds: Set<string>;
  prelim: Map<string, Pt>;
  horizontal: HorizontalResult | null;
  vertical: VerticalResult | null;
  heightCandidates: HeightCandidate[];
  details: DetailPoint[];
  polygon: TraversePreview | null;
  polygonError: string;
  draftLine: HeightLineResult | null;
  lineError: string;
  /** A magassági vonalakba választható pontok. */
  linePoints: string[];
}

interface HeightCandidate {
  station: string;
  target: string;
  dh: number;
  /** A mérésben nincs távolság: a koordinátákból számított (csak kézzel bevonva vesz részt). */
  fromCoords: boolean;
}

interface Output {
  sections: Section[];
  known: NetPoint[];
  horizontal: HorizontalResult | null;
  details: DetailPoint[];
  averagedGmj: string | null;
  /** A mérési vázlat SVG-je (ha be van kapcsolva). */
  sketch: string | null;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function setOptions(select: HTMLSelectElement, values: string[], keepSelection = true): void {
  const selected = keepSelection ? new Set([...select.selectedOptions].map((o) => o.value)) : new Set<string>();
  select.replaceChildren(...values.map((v) => new Option(v, v, false, selected.has(v))));
}

const selectedValues = (select: HTMLSelectElement) => [...select.selectedOptions].map((o) => o.value);

function renderReport(issues: Issue[], output: Output | null): void {
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
    if (issues.length === 0) results.append(el('p', 'empty', 'Add meg a koordinátákat és a mérési jegyzőkönyvet a Munkaterületen, vagy tölts be egy mintapéldát.'));
    renderReportTree($('net-report-tree'), results);
    return;
  }
  const { sections, horizontal, known, details, averagedGmj, sketch } = output;
  results.append(renderCover(NET_TITLE));
  for (const s of sections) {
    const card = renderSection(s);
    card.dataset.kind = s.kind;
    results.append(card);
  }
  if (sketch) {
    const box = el('section', 'card sketch-card');
    box.dataset.kind = 'sketch';
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
  renderReportTree($('net-report-tree'), results);
  if (horizontal) {
    const c = horizontal.counts;
    status.textContent = `Kiszámítva ${new Date().toLocaleTimeString('hu-HU')} · ${c.new} új pont · ${c.directions} irány, ${c.distances} távolság · σ₀ = ${
      horizontal.sigma0Posterior === null ? '–' : horizontal.sigma0Posterior.toFixed(2)
    }″`;
  }

  const button = (text: string, onClick: () => void) => {
    const b = el('button', undefined, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    downloads.append(b);
  };
  if (horizontal) {
    button('Új pontok koordinátái (.txt)', () =>
      download('uj_pontok.txt', horizontal.points.map((p) => `${p.id} ${p.y.toFixed(3)} ${p.x.toFixed(3)}`).join('\r\n') + '\r\n'),
    );
  }
  if (details.length > 0) {
    button('Részletpontok (.txt)', () =>
      download('reszletpontok.txt', details.map((p) => `${p.id} ${p.y.toFixed(3)} ${p.x.toFixed(3)}${p.height === null ? '' : ` ${p.height.toFixed(3)}`}`).join('\r\n') + '\r\n'),
    );
  }
  button('Minden pont (.PYX)', () => {
    const all: Point[] = [
      ...known.map((p) => ({ id: p.id, y: p.y, x: p.x, m: p.m, code: '0' })),
      ...(horizontal?.points ?? []).map((p) => ({ id: p.id, y: p.y, x: p.x, m: null, code: '1' })),
      ...details.map((p) => ({ id: p.id, y: p.y, x: p.x, m: p.height, code: '2' })),
    ];
    download('halozat.PYX', toPyx(all));
  });
  if (averagedGmj) button('Középelt GMJ (.gmj)', () => download('kozepelt.gmj', averagedGmj));
  button('Jegyzőkönyv (.txt)', () => downloadReport('halozat_jegyzokonyv.txt', NET_TITLE, sections));
  downloads.append(csvButton('halozat_tablazatok', () => sections));
}

export function initNetworkView(nav: { openNav: (id: string) => void }): void {
  const coordinates = $<HTMLTextAreaElement>('net-coords');
  const gmj = $<HTMLTextAreaElement>('net-gmj');
  const workname = $<HTMLInputElement>('net-workname');
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
  const hPrec = () => (document.querySelector<HTMLInputElement>('input[name="nv-prec"]:checked')?.value ?? 'cm') as CoordinatePrecision;
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
  let heightExcluded: string[] = [];
  let heightIncluded: string[] = [];
  let polygon: string[] = [];
  let heightLines: LineDef[] = [];
  let lineDraft: LineDef = { name: '', order: [] };
  let removedStations = new Set<string>();
  let removedKnown = new Set<string>();
  let statusNew = new Set<string>();
  let manual = new Map<string, Pt>();
  let heightFloating = new Set<string>();
  let detailStations: string[] | null = null;
  let orientation: FormState['orientation'] = null;
  let workList: WorkListState | null = null;
  let model: Model | null = null;
  let timer: number | undefined;

  const extraPoints = () => extraInput.value.split(/[\s,;]+/).filter((t) => t !== '');
  const setExtraPoints = (ids: string[]) => {
    extraInput.value = [...new Set(ids)].join(', ');
  };

  const updateExcludedLabel = () => {
    exclCount.textContent =
      excluded.length === 0
        ? 'Nincs kézzel kizárt mérés: a kizárás a javítás cellájára kattintva (vagy a jegyzőkönyv „Mérések kizárása a kiegyenlítésből” táblázatában) végezhető.'
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
    extraPoints: extraPoints(),
  });
  const readVertical = (): VerticalSettings => ({
    sigma: Number(hSigma.value),
    unitDistance: Number(hUnit.value),
    weight: hWeight.value as HeightWeight,
    probability: Number(prob.value),
    free: hFree.checked,
    precision: hPrec(),
    excluded: [...heightExcluded],
    included: [...heightIncluded],
  });
  const writeVertical = (s: VerticalSettings, on: boolean) => {
    hOn.checked = on;
    hSigma.value = String(s.sigma);
    hUnit.value = String(s.unitDistance);
    hWeight.value = s.weight;
    hFree.checked = s.free;
    const radio = document.querySelector<HTMLInputElement>(`input[name="nv-prec"][value="${s.precision ?? 'cm'}"]`);
    if (radio) radio.checked = true;
    heightExcluded = [...(s.excluded ?? [])];
    heightIncluded = [...(s.included ?? [])];
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
    setExtraPoints(s.extraPoints ?? []);
    updateExcludedLabel();
  };
  /** Az Előzetes számítások kijelöléseinek alaphelyzete (új adatoknál és a frissítés gombra). */
  const resetSelections = () => {
    removedStations = new Set();
    removedKnown = new Set();
    statusNew = new Set();
    manual = new Map();
  };

  /* ---------------- számítás ---------------- */

  const compute = () => {
    window.clearTimeout(timer);
    const settings = readSettings();
    const state: FormState = {
      coordinates: coordinates.value,
      gmj: gmj.value,
      settings,
      heights: hOn.checked,
      details: detailsOn.checked,
      averaging: avgOn.checked,
      sketch: sketchOn.checked,
      vertical: readVertical(),
      workname: workname.value,
      removedStations: [...removedStations],
      removedKnown: [...removedKnown],
      statusNew: [...statusNew],
      manual: Object.fromEntries(manual),
      heightFloating: [...heightFloating],
      detailStations,
      orientation,
      workList,
      polygon,
      heightLines,
      lineDraft,
    };
    storage.set(STORAGE_KEY, JSON.stringify(state));
    $('net-sum-coords').textContent = '0';
    $('net-sum-stations').textContent = '0';
    $('net-sum-obs').textContent = '0';
    if (state.coordinates.trim() === '' && state.gmj.trim() === '') {
      model = null;
      renderReport([], null);
      renderSteps();
      return;
    }
    const issues: Issue[] = [];
    try {
      const parsedKnown = parseNetworkCoordinates(state.coordinates);
      const parsed = parseGmj(state.gmj);
      issues.push(...parsedKnown.issues, ...parsed.issues);
      // Középelés: a célpontonként többször mért irányok átlagolása (nyers, kétállásos jegyzőkönyv).
      const avg = state.averaging ? averageFaces(parsed.stations) : null;
      const allStations = avg ? avg.stations : parsed.stations;
      if (avg) issues.push(...avg.issues);
      $('net-sum-coords').textContent = String(parsedKnown.points.length);
      $('net-sum-stations').textContent = String(allStations.length);
      $('net-sum-obs').textContent = String(allStations.reduce((a, st) => a + st.observations.length, 0));

      // 2. lépés: a kiegyenlítésbe bevont pontok (súgó 51. o.).
      const stations = allStations.filter((st) => !removedStations.has(st.id));
      const stationIds = new Set(stations.map((st) => st.id));
      const known: NetPoint[] = parsedKnown.points.filter((p) => !removedKnown.has(p.id) && !statusNew.has(p.id));
      for (const [id, c] of manual) if (!known.some((p) => p.id === id)) known.push({ id, y: c.y, x: c.x, m: null, mark: '' });
      const extra = [...new Set([...extraPoints(), ...[...statusNew].filter((id) => !stationIds.has(id))])];
      const horizontalSettings: HorizontalSettings = { ...settings, extraPoints: extra };

      const observed = new Set<string>();
      for (const st of stations) {
        observed.add(st.id);
        for (const o of st.observations) observed.add(o.target);
      }
      const knownMap = new Map<string, Pt>(known.map((p) => [p.id, { y: p.y, x: p.x }]));
      const extraSet = new Set(extra);
      const newIds = new Set([...observed].filter((id) => (stationIds.has(id) || extraSet.has(id)) && (settings.free || !knownMap.has(id))));
      const used = [...observed].filter((id) => newIds.has(id) || knownMap.has(id)).sort(byId);
      let prelim = new Map<string, Pt>(knownMap);
      try {
        prelim = preliminaryCoordinates(knownMap, stations, settings.grossDirection, [], newIds).coords;
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
      }

      const sections: Section[] = [];
      const all: Issue[] = [...issues];
      sections.push(prelimSection(used, newIds, prelim, parsedKnown.points));
      if (orientation) {
        sections.push(
          preliminaryOrientationSection(stations, prelim, (id) => (knownMap.has(id) && !newIds.has(id) ? orientation!.known : orientation!.computed)),
        );
      }
      // Sokszögvonal-előzetes: a megadott sorrendű vonal előzetes koordinátái és záróhibái.
      const order = parseTraverseOrder(traverseInput.value);
      let traverseNote = '';
      if (order.length > 0) {
        try {
          const tp = traversePreview(order, knownMap, stations, settings.grossDirection);
          sections.push(...tp.sections);
          traverseNote = tp.sections.flatMap((s) => s.footer ?? []).find((f) => f.startsWith('Vonalas záróhiba')) ?? '';
        } catch (e) {
          if (!(e instanceof CalcError)) throw e;
          all.push({ level: 'warning', message: `Sokszögvonal-előzetes: ${e.message}` });
        }
      }
      $('np-trav-result').textContent = traverseNote;

      let horizontal: HorizontalResult | null = null;
      try {
        horizontal = adjustHorizontal(known, stations, horizontalSettings);
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        all.push({ level: 'error', message: e.message });
      }
      if (horizontal) {
        sections.push(...horizontal.sections);
        all.push(...horizontal.issues);
      }
      if (avg) sections.push(...avg.sections);

      // 4. lépés: magassági kiegyenlítés (súgó 53. o.).
      const heightMap = new Map<string, number>(known.filter((p) => p.m !== null).map((p) => [p.id, p.m!] as const));
      const heightKnown = known.map((p) => (heightFloating.has(p.id) ? { ...p, m: null } : p));
      const planar = new Map<string, Pt>(prelim);
      for (const p of horizontal?.points ?? []) planar.set(p.id, { y: p.y, x: p.x });
      const heightCandidates = heightDifferences(stations, heightKnown, extra, planar);
      let vertical: VerticalResult | null = null;
      if (state.heights) {
        try {
          vertical = adjustHeights(heightKnown, stations, state.vertical, extra, planar);
          sections.push(...vertical.sections);
          all.push(...vertical.issues);
          for (const p of vertical.points) heightMap.set(p.id, p.height);
        } catch (e) {
          if (!(e instanceof CalcError)) throw e;
          all.push({ level: 'warning', message: `Magassági hálózat: ${e.message}` });
        }
      }

      // Poligon záróhiba (súgó 52. o.): a megadott zárt poligon szög- és vonalas záróhibája.
      let polygonResult: TraversePreview | null = null;
      let polygonError = '';
      if (polygon.length >= 3) {
        try {
          polygonResult = polygonClosure(polygon, knownMap, stations);
          sections.push(...polygonResult.sections);
        } catch (e) {
          if (!(e instanceof CalcError)) throw e;
          polygonError = e.message;
          all.push({ level: 'warning', message: `Poligon záróhiba: ${e.message}` });
        }
      }
      // Trigonometriai magassági vonalak (súgó 53. o.): az adott magasságok között, ellenőrzésként.
      const givenHeights = new Map<string, number>(heightKnown.filter((p) => p.m !== null).map((p) => [p.id, p.m!] as const));
      const lineResults: HeightLineResult[] = [];
      let draftLine: HeightLineResult | null = null;
      let lineError = '';
      const allLines = [...heightLines, ...(lineDraft.order.length >= 2 ? [lineDraft] : [])];
      allLines.forEach((line, i) => {
        try {
          const r = heightLine(line.name, line.order, stations, givenHeights, planar);
          lineResults.push(r);
          if (line === lineDraft) draftLine = r;
        } catch (e) {
          if (!(e instanceof CalcError)) throw e;
          if (line === lineDraft) lineError = e.message;
          all.push({ level: 'warning', message: `Magassági vonal${line.name ? ` (${line.name})` : ` (${i + 1}.)`}: ${e.message}` });
        }
      });
      sections.push(...heightLineSections(lineResults));

      // 5. lépés: részletpontok a kijelölt álláspontokról (súgó 54. o.).
      let details: DetailPoint[] = [];
      if (state.details && horizontal) {
        const coords = new Map(known.map((p) => [p.id, { y: p.y, x: p.x }] as const));
        for (const p of horizontal.points) coords.set(p.id, { y: p.y, x: p.x });
        const chosen = detailStations ? stations.filter((st) => detailStations!.includes(st.id)) : stations;
        const d = computeDetailPoints(chosen, coords, horizontal.orientations, heightMap);
        details = d.points;
        sections.push(...d.sections);
        all.push(...d.issues);
      }
      if (workList && horizontal) {
        const points: WorkPoint[] = [
          ...known.map<WorkPoint>((p) => ({ id: p.id, y: p.y, x: p.x, m: heightMap.get(p.id) ?? p.m, mark: p.mark, kind: 'known' })),
          ...horizontal.points.map<WorkPoint>((p) => ({ id: p.id, y: p.y, x: p.x, m: heightMap.get(p.id) ?? null, mark: '', kind: 'adjusted' })),
          ...details.map<WorkPoint>((p) => ({ id: p.id, y: p.y, x: p.x, m: p.height, mark: '', kind: 'detail' })),
        ];
        sections.push(...workCoordinateList(points, details, workList));
      }

      // Önálló hálózat: a hálózati dátum (eltolás és forgatás) alkalmazása a kiegyenlített pontokra.
      if (settings.free && horizontal) {
        const anchorId = datumAnchor.value.trim();
        const yRaw = datumY.value.trim();
        const xRaw = datumX.value.trim();
        if (anchorId !== '' && yRaw !== '' && xRaw !== '') {
          try {
            const pts = horizontal.points.map((p) => ({ id: p.id, y: p.y, x: p.x }));
            const second = datumSecond.value.trim();
            const azRaw = datumAz.value.trim();
            const rotation =
              second !== '' && azRaw !== '' ? rotationForAzimuth(pts, anchorId, second, Number(azRaw)) : Number(datumRot.value) || 0;
            const input: DatumInput = { points: pts, anchorId, toY: Number(yRaw), toX: Number(xRaw), rotation };
            sections.push(datumSection(input, placeFreeNetwork(input)));
          } catch (e) {
            if (!(e instanceof CalcError)) throw e;
            all.push({ level: 'warning', message: `Hálózati dátum: ${e.message}` });
          }
        } else {
          all.push({
            level: 'info',
            message: 'Önálló hálózat: a hálózati dátum (eltolás pontja és a kívánt koordinátái) megadásával helyezhető el a hálózat.',
          });
        }
      }
      // Mérési vázlat: a kiegyenlített (illetve ismert) koordinátákból, mérethelyesen.
      let sketch: string | null = null;
      if (state.sketch && horizontal) {
        const allPoints = [
          ...known.map((p) => ({ id: p.id, y: p.y, x: p.x, m: p.m, mark: '' })),
          ...horizontal.points.map((p) => ({ id: p.id, y: p.y, x: p.x, m: null, mark: '' })),
        ];
        const pts = sketchPoints(allPoints, new Set(known.map((p) => p.id)));
        sketch = buildSketch(pts, stations) || null;
      }

      model = {
        stations,
        allStations: allStations.map((st) => st.id).sort(byId),
        knownAll: parsedKnown.points,
        known,
        extra,
        used,
        newIds,
        prelim,
        horizontal,
        vertical,
        heightCandidates,
        details,
        polygon: polygonResult,
        polygonError,
        draftLine,
        lineError,
        linePoints: [...observed].filter((id) => stationIds.has(id) || knownMap.has(id) || extraSet.has(id)).sort(byId),
      };
      renderReport(all, {
        sections,
        horizontal,
        known,
        details,
        averagedGmj: avg && avg.rows.length > 0 ? toGmj(stations) : null,
        sketch,
      });
    } catch (e) {
      model = null;
      if (e instanceof CalcError) issues.push({ level: 'error', message: e.message });
      else issues.push({ level: 'error', message: `A számítás nem futott le: ${e instanceof Error ? e.message : String(e)}` });
      renderReport(issues, null);
    }
    renderSteps();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(compute, 400);
  };

  /* ---------------- a lépések táblázatai ---------------- */

  const renderSteps = () => {
    renderPre();
    renderHor();
    renderPolygon();
    renderVer();
    renderLines();
    renderDet();
  };

  const renderPolygon = () => {
    setOptions($<HTMLSelectElement>('nh-poly-stations'), (model?.stations ?? []).map((st) => st.id).sort(byId));
    const list = $<HTMLSelectElement>('nh-poly-list');
    const sel = list.value;
    list.replaceChildren(...polygon.map((id, i) => new Option(id, String(i), false, String(i) === sel)));
    const body = $('nh-poly-table').querySelector('tbody')!;
    body.replaceChildren();
    const r = model?.polygon ?? null;
    $('nh-poly-angle').textContent = r?.angularClosure == null ? '–' : `${fix(r.angularClosure, 0)}″`;
    $('nh-poly-linear').textContent = r?.linear ? `${fix(r.linear.length, 3)} m` : '–';
    $('nh-poly-msg').textContent = model?.polygonError ?? '';
    for (const v of r?.vertices ?? []) {
      const tr = el('tr');
      tr.append(
        el('td', undefined, v.id),
        el('td', 'num', v.back === null ? '' : formatDms(v.back)),
        el('td', 'num', v.forward === null ? '' : formatDms(v.forward)),
        el('td', 'num', v.dHz === null ? '' : formatDms(v.dHz)),
        el('td', 'num', v.t1 === null ? '0' : fix(v.t1, 3)),
        el('td', 'num', v.t2 === null ? '0' : fix(v.t2, 3)),
      );
      body.append(tr);
    }
  };

  const renderLines = () => {
    setOptions($<HTMLSelectElement>('nv-line-points'), model?.linePoints ?? []);
    const list = $<HTMLSelectElement>('nv-line-list');
    const sel = list.value;
    list.replaceChildren(...lineDraft.order.map((id, i) => new Option(id, String(i), false, String(i) === sel)));
    const saved = $<HTMLSelectElement>('nv-line-saved');
    saved.replaceChildren(...heightLines.map((l, i) => new Option(`${l.name || `${i + 1}.`}: ${l.order.join('–')}`, String(i))));
    const nameInput = $<HTMLInputElement>('nv-line-name');
    if (document.activeElement !== nameInput) nameInput.value = lineDraft.name;
    const r = model?.draftLine ?? null;
    $('nv-line-start').textContent = lineDraft.order[0] ?? '–';
    $('nv-line-end').textContent = lineDraft.order.length > 1 ? lineDraft.order[lineDraft.order.length - 1]! : '–';
    $('nv-line-closure').textContent = r?.closure == null ? '–' : fix(r.closure * 100, 1);
    $('nv-line-limit').textContent = r ? fix(r.limit * 100, 1) : '–';
    $('nv-line-length').textContent = r ? fix(r.length, 1) : '–';
    $('nv-line-msg').textContent = model?.lineError ?? '';
    $('nv-line-closure').classList.toggle('bad', !!r && r.closure !== null && Math.abs(r.closure) > r.limit);
    const showHeights = $<HTMLInputElement>('nv-line-heights').checked;
    $('nv-line-table-wrap').hidden = !showHeights || !r;
    const body = $('nv-line-table').querySelector('tbody')!;
    body.replaceChildren();
    if (r && showHeights) {
      for (const row of heightLineSections([r])[0]!.rows) {
        const tr = el('tr', row.role === 'result' ? undefined : 'given');
        row.cells.forEach((c, i) => tr.append(el('td', i === 0 ? undefined : 'num', c)));
        body.append(tr);
      }
    }
  };

  const renderPre = () => {
    const m = model;
    const knownIds = (m?.knownAll ?? []).map((p) => p.id).sort(byId);
    setOptions($<HTMLSelectElement>('np-stations'), (m?.allStations ?? []).filter((id) => !removedStations.has(id)));
    setOptions($<HTMLSelectElement>('np-known'), knownIds.filter((id) => !removedKnown.has(id)));
    setOptions($<HTMLSelectElement>('np-extra'), extraPoints().sort(byId));
    const observed = new Set<string>();
    for (const st of m?.stations ?? []) {
      observed.add(st.id);
      for (const o of st.observations) observed.add(o.target);
    }
    setOptions($<HTMLSelectElement>('np-all'), [...observed].sort(byId));
    setOptions($<HTMLSelectElement>('np-used'), m?.used ?? [], false);

    const body = $('np-table').querySelector('tbody')!;
    body.replaceChildren();
    if (!m) return;
    const knownById = new Map(m.knownAll.map((p) => [p.id, p]));
    // A valódi program sorrendje: előbb az új pontok (sárga), utána az adottak (fehér).
    const ordered = [...m.used.filter((id) => m.newIds.has(id)), ...m.used.filter((id) => !m.newIds.has(id))];
    ordered.forEach((id, i) => {
      const isNew = m.newIds.has(id);
      const c = m.prelim.get(id) ?? manual.get(id) ?? knownById.get(id);
      const tr = el('tr', isNew ? 'new-point' : undefined);
      tr.dataset.id = id;
      const status = el('input');
      status.type = 'checkbox';
      status.checked = isNew;
      status.dataset.status = id;
      status.title = isNew ? 'Új pont – kikapcsolva adottá válik (koordináta kell)' : 'Adott pont – bekapcsolva új pont lesz';
      status.setAttribute('aria-label', `${id} státusza`);
      const statusCell = el('td', 'center');
      statusCell.append(status);
      tr.append(el('td', 'num', String(i + 1)), statusCell, el('td', undefined, id));
      if (isNew && !manual.has(id)) {
        tr.append(el('td', 'num', c ? fix(c.y, 2) : ''), el('td', 'num', c ? fix(c.x, 2) : ''));
      } else {
        // Adott pont: a koordináták szerkeszthetők (önálló hálózatnál két pontot kézzel adottnak kell venni).
        for (const axis of ['y', 'x'] as const) {
          const td = el('td', 'num');
          const input = el('input');
          input.type = 'text';
          input.inputMode = 'decimal';
          input.className = 'cell-input';
          input.value = c ? fix(c[axis], 3) : '';
          input.dataset.coord = `${id}:${axis}`;
          input.setAttribute('aria-label', `${id} ${axis.toUpperCase()}`);
          td.append(input);
          tr.append(td);
        }
      }
      tr.append(el('td', undefined, knownById.get(id)?.mark ?? ''));
      body.append(tr);
    });
  };

  const renderHor = () => {
    const body = $('nh-table').querySelector('tbody')!;
    body.replaceChildren();
    const m = model;
    if (!m) return;
    const obs = m.horizontal?.observations ?? [];
    const find = (st: string, t: string, kind: 'direction' | 'distance') => obs.find((o) => o.station === st && o.target === t && o.kind === kind);
    let n = 0;
    for (const st of [...m.stations].sort((a, b) => byId(a.id, b.id))) {
      st.observations.forEach((o, i) => {
        n++;
        const tr = el('tr');
        tr.append(el('td', i === 0 ? 'ap' : undefined, i === 0 ? st.id : ''), el('td', undefined, o.target), el('td', 'num', formatDms(o.hz)), el('td', 'num', o.distance ? fix(o.distance, 3) : ''), el('td', 'num idx', String(n)));
        const cells = (kind: 'direction' | 'distance', key: string, has: boolean) => {
          const r = has ? find(st.id, o.target, kind) : undefined;
          const res = el('td', 'num click');
          const lim = el('td', 'num');
          const stat = el('td', 'num');
          if (r) {
            res.textContent = fix(r.residual, 0);
            lim.textContent = `(${fix(r.limit, 0)})`;
            stat.textContent = r.excluded ? '–' : r.stat === null ? '–' : fix(r.stat, 2);
            res.dataset.key = key;
            res.title = r.manual ? 'Kizárva – kattintásra visszakerül a kiegyenlítésbe' : r.excluded ? 'Durva hiba miatt automatikusan kihagyva' : 'Kattintásra kimarad a kiegyenlítésből';
            if (r.excluded) {
              for (const c of [res, lim, stat]) c.classList.add(r.manual ? 'off' : 'auto-off');
            }
            if (!r.excluded && Math.abs(r.residual) > r.limit) res.classList.add('over');
          }
          tr.append(res, lim, stat);
        };
        cells('direction', `${st.id}>${o.target}:dir`, true);
        cells('distance', `${st.id}>${o.target}:dist`, !!o.distance);
        body.append(tr);
      });
    }
    $<HTMLButtonElement>('nh-datum').classList.toggle('active', freeOn.checked);
  };

  const renderVer = () => {
    const body = $('nv-table').querySelector('tbody')!;
    body.replaceChildren();
    const fixedBox = $('nv-fixed');
    fixedBox.replaceChildren();
    const m = model;
    if (!m) return;
    const dec = hPrec() === 'cm' ? 2 : hPrec() === 'mm' ? 3 : 4;
    const res = m.vertical?.observations ?? [];
    m.heightCandidates.forEach((c, i) => {
      const key = `${c.station}>${c.target}`;
      const r = res.find((o) => o.station === c.station && o.target === c.target);
      // A távolság nélküli sor alapértelmezésben nincs bevonva (piros), kattintásra bevonható.
      const off = c.fromCoords ? !heightIncluded.includes(key) : heightExcluded.includes(key);
      const tr = el('tr');
      const prev = m.heightCandidates[i - 1];
      tr.append(el('td', 'num idx', String(i + 1)), el('td', 'ap', prev?.station === c.station ? '' : c.station), el('td', undefined, c.target));
      const dh = el('td', `num click${off ? ' off' : ''}${c.fromCoords ? ' coord' : ''}`, fix(c.dh, 4));
      dh.dataset.hkey = key;
      if (c.fromCoords) dh.dataset.coord = '1';
      dh.title = c.fromCoords
        ? off
          ? 'A mérésnek nincs távolsága – kattintásra bevonható (a távolságot a koordinátákból számolja)'
          : 'Bevonva, koordinátából számított távolsággal – kattintásra kimarad'
        : off
          ? 'Kihagyva – kattintásra visszakerül'
          : 'Kattintásra kimarad a magassági kiegyenlítésből';
      tr.append(dh, el('td', 'num', r ? fix(r.residual, dec) : ''), el('td', 'num', r ? `(${fix(r.limit, 2)})` : ''), el('td', 'num', r ? fix(r.stat, 2) : off ? '–' : ''));
      body.append(tr);
    });
    // Adott magasságú pontok: alapértelmezésben azok, amelyeknek van magassága a koordinátalistában.
    const withHeight = m.known.filter((p) => p.m !== null || heightFloating.has(p.id));
    if (withHeight.length === 0) fixedBox.append(el('p', 'hint', 'Nincs magassággal megadott pont (az M oszlop üres).'));
    for (const p of withHeight.sort((a, b) => byId(a.id, b.id))) {
      const lab = el('label', 'check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !heightFloating.has(p.id);
      box.dataset.fixed = p.id;
      lab.append(box, el('span', undefined, `${p.id}${p.m !== null ? ` (${fix(p.m, 2)} m)` : ''}`));
      fixedBox.append(lab);
    }
  };

  const renderDet = () => {
    const ids = (model?.stations ?? []).map((st) => st.id).sort(byId);
    setOptions($<HTMLSelectElement>('nd-stations'), ids);
    setOptions($<HTMLSelectElement>('nd-selected'), detailStations ? ids.filter((id) => detailStations!.includes(id)) : ids);
    $('nd-count').textContent = String(model?.details.length ?? 0);
  };

  /* ---------------- Előkép (a teljes jegyzőkönyv) ---------------- */

  const preview = $('net-preview');
  const openPreview = (kinds: string[] = []) => {
    compute();
    preview.hidden = false;
    const card = kinds.map((k) => $('net-results').querySelector<HTMLElement>(`.card[data-kind="${k}"]`)).find((c) => c);
    if (card) card.scrollIntoView({ block: 'start' });
    else $('net-results').parentElement?.scrollTo({ top: 0 });
    $('net-preview-close').focus();
  };
  const closePreview = () => {
    preview.hidden = true;
  };
  $('net-preview-close').addEventListener('click', closePreview);
  preview.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
  });

  /* ---------------- események ---------------- */

  for (const e of [coordinates, gmj, hSigma, hUnit, ...Object.values(inputs)]) e.addEventListener('input', schedule);
  for (const e of [dirWeight, distWeight, prob, prec, hOn, hWeight, hFree, detailsOn, avgOn, sketchOn, freeOn]) e.addEventListener('change', compute);
  for (const e of document.querySelectorAll<HTMLInputElement>('input[name="nv-prec"]')) e.addEventListener('change', compute);
  for (const e of [datumAnchor, datumY, datumX, datumRot, datumSecond, datumAz, traverseInput, workname]) e.addEventListener('input', schedule);
  $('net-workname').addEventListener('input', () => {
    $('workname').textContent = workname.value.trim() || 'Névtelen';
  });

  // Lépések közötti navigáció: a jobb alsó kék nyíl a következő munkalapra visz.
  for (const b of document.querySelectorAll<HTMLButtonElement>('.step-next[data-next]')) {
    b.addEventListener('click', () => {
      compute();
      nav.openNav(b.dataset.next!);
    });
  }
  $('net-go-details').addEventListener('click', () => nav.openNav('net-det'));

  // Mérés kizárása a kiegyenlítésből (súgó 52. o.): a javítás cellájára kattintva, vagy a jegyzőkönyv
  // „Mérések kizárása” táblázatának jelölőnégyzetével. A bejelölt mérés kimarad, a kijelölt visszakerül.
  const toggle = (key: string, on: boolean) => {
    excluded = on ? (excluded.includes(key) ? excluded : [...excluded, key]) : excluded.filter((k) => k !== key);
    updateExcludedLabel();
    compute();
  };
  $('nh-table').addEventListener('click', (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('td[data-key]');
    if (!cell || cell.classList.contains('auto-off')) return;
    toggle(cell.dataset.key!, !excluded.includes(cell.dataset.key!));
  });
  $('net-results').addEventListener('change', (event) => {
    const box = (event.target as HTMLElement).closest<HTMLInputElement>('input[data-check]');
    if (!box || box.disabled) return;
    toggle(box.dataset.check!, box.checked);
  });
  /** A jelenleg kizárható (nem automatikusan kihagyott) mérések azonosítói. */
  const measurableKeys = (): string[] =>
    [...$('net-results').querySelectorAll<HTMLInputElement>('input[data-check]')].filter((b) => !b.disabled).map((b) => b.dataset.check!);
  $('net-excl-all').addEventListener('click', () => {
    excluded = [...new Set([...excluded, ...measurableKeys()])];
    updateExcludedLabel();
    compute();
  });
  for (const id of ['net-excl-none', 'net-clear-excl', 'nh-refresh']) {
    $(id).addEventListener('click', () => {
      excluded = [];
      updateExcludedLabel();
      compute();
    });
  }

  // Előzetes számítások: a listák kezelése (súgó 51. o.).
  $('np-del-station').addEventListener('click', () => {
    for (const id of selectedValues($<HTMLSelectElement>('np-stations'))) removedStations.add(id);
    compute();
  });
  $('np-del-known').addEventListener('click', () => {
    for (const id of selectedValues($<HTMLSelectElement>('np-known'))) removedKnown.add(id);
    compute();
  });
  $('np-del-extra').addEventListener('click', () => {
    const drop = new Set(selectedValues($<HTMLSelectElement>('np-extra')));
    setExtraPoints(extraPoints().filter((id) => !drop.has(id)));
    compute();
  });
  $('np-add-extra').addEventListener('click', () => {
    setExtraPoints([...extraPoints(), ...selectedValues($<HTMLSelectElement>('np-all'))]);
    compute();
  });
  for (const id of ['np-use', 'np-calc', 'nh-run', 'nd-run']) $(id).addEventListener('click', compute);
  $('np-refresh').addEventListener('click', () => {
    resetSelections();
    compute();
  });
  $('np-table').addEventListener('change', (event) => {
    const t = event.target as HTMLInputElement;
    if (t.dataset.status) {
      const id = t.dataset.status;
      const wasKnown = model?.knownAll.some((p) => p.id === id) ?? false;
      if (t.checked) {
        // Adottból új: az ismert pont is számítandó lesz (az előzetes koordinátája a mérésekből adódik).
        manual.delete(id);
        if (wasKnown) statusNew.add(id);
      } else {
        // Újból adott: a sorban látható (vagy beírt) koordinátával.
        statusNew.delete(id);
        const c = model?.prelim.get(id);
        if (!wasKnown && c) manual.set(id, { ...c });
      }
      compute();
    } else if (t.dataset.coord) {
      const [id, axis] = t.dataset.coord.split(':') as [string, 'y' | 'x'];
      const v = Number(t.value.replace(',', '.'));
      if (!Number.isFinite(v) || t.value.trim() === '') return;
      const base = manual.get(id) ?? model?.known.find((p) => p.id === id) ?? model?.prelim.get(id);
      if (!base) return;
      manual.set(id, { y: axis === 'y' ? v : base.y, x: axis === 'x' ? v : base.x });
      // A kézzel beírt koordináta felülírja a koordinátalista értékét (az ismert pont adott marad).
      if (model?.knownAll.some((p) => p.id === id)) removedKnown.add(id);
      compute();
    }
  });
  $('np-stations').addEventListener('dblclick', () => {
    const picked = selectedValues($<HTMLSelectElement>('np-stations'));
    if (picked.length === 0) return;
    traverseInput.value = [...parseTraverseOrder(traverseInput.value), ...picked].join(' ');
    $('np-traverse-panel').hidden = false;
    $('np-traverse-btn').setAttribute('aria-expanded', 'true');
    compute();
  });
  $('np-traverse-btn').addEventListener('click', () => {
    const panel = $('np-traverse-panel');
    panel.hidden = !panel.hidden;
    $('np-traverse-btn').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) traverseInput.focus();
  });
  $('np-trav-clear').addEventListener('click', () => {
    traverseInput.value = '';
    compute();
  });
  $('np-orient').addEventListener('click', () => {
    orientation = { known: $<HTMLInputElement>('np-or-known').checked, computed: $<HTMLInputElement>('np-or-computed').checked };
    openPreview(['preliminary-orientation']);
  });
  $('np-report').addEventListener('click', () => openPreview(['net-prelim', 'traverse-vertices', 'preliminary-orientation']));

  // Vízszintes kiegyenlítés: hálózati dátum, mérési vázlat, jegyzőkönyv.
  $('nh-datum').addEventListener('click', () => {
    const panel = $('nh-datum-panel');
    panel.hidden = !panel.hidden;
    $('nh-datum').setAttribute('aria-expanded', String(!panel.hidden));
  });
  $('nh-sketch').addEventListener('click', () => {
    sketchOn.checked = true;
    openPreview(['sketch']);
  });
  $('nh-report').addEventListener('click', () => openPreview(['net-summary']));

  // Poligon záróhiba (súgó 52. o.): dupla kattintás az álláspontra, sorrend a nyilakkal, törlés a vonallal.
  $('nh-poly').addEventListener('click', () => {
    const panel = $('nh-poly-panel');
    panel.hidden = !panel.hidden;
    $('nh-poly').setAttribute('aria-expanded', String(!panel.hidden));
  });
  $('nh-poly-stations').addEventListener('dblclick', () => {
    for (const id of selectedValues($<HTMLSelectElement>('nh-poly-stations'))) if (!polygon.includes(id)) polygon.push(id);
    compute();
  });
  const moveIn = (arr: string[], listId: string, delta: number): boolean => {
    const i = Number($<HTMLSelectElement>(listId).value);
    const j = i + delta;
    if (!Number.isInteger(i) || $<HTMLSelectElement>(listId).value === '' || j < 0 || j >= arr.length) return false;
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    $<HTMLSelectElement>(listId).value = String(j);
    return true;
  };
  $('nh-poly-up').addEventListener('click', () => moveIn(polygon, 'nh-poly-list', -1) && compute());
  $('nh-poly-down').addEventListener('click', () => moveIn(polygon, 'nh-poly-list', 1) && compute());
  $('nh-poly-del').addEventListener('click', () => {
    polygon = [];
    compute();
  });
  $('nh-poly-run').addEventListener('click', () => {
    compute();
    if (model?.polygon) openPreview(['polygon-closure']);
  });

  // Trigonometriai magassági vonalak (súgó 53. o.).
  $('nv-lines').addEventListener('click', () => {
    const panel = $('nv-lines-panel');
    panel.hidden = !panel.hidden;
    $('nv-lines').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) panel.scrollIntoView({ block: 'nearest' });
  });
  $('nv-line-points').addEventListener('dblclick', () => {
    lineDraft.order.push(...selectedValues($<HTMLSelectElement>('nv-line-points')));
    compute();
  });
  $('nv-line-name').addEventListener('input', () => {
    lineDraft.name = $<HTMLInputElement>('nv-line-name').value;
    schedule();
  });
  $('nv-line-up').addEventListener('click', () => moveIn(lineDraft.order, 'nv-line-list', -1) && compute());
  $('nv-line-down').addEventListener('click', () => moveIn(lineDraft.order, 'nv-line-list', 1) && compute());
  $('nv-line-del').addEventListener('click', () => {
    lineDraft = { name: lineDraft.name, order: [] };
    compute();
  });
  $('nv-line-new').addEventListener('click', () => {
    // A szerkesztett vonal az előírt vonalak közé kerül, és új, üres vonal kezdődik.
    if (lineDraft.order.length >= 2) heightLines.push({ name: lineDraft.name, order: [...lineDraft.order] });
    lineDraft = { name: String(heightLines.length + 1), order: [] };
    compute();
  });
  $('nv-line-drop').addEventListener('click', () => {
    const i = Number($<HTMLSelectElement>('nv-line-saved').value);
    if ($<HTMLSelectElement>('nv-line-saved').value === '' || !heightLines[i]) return;
    heightLines.splice(i, 1);
    compute();
  });
  $('nv-line-run').addEventListener('click', compute);
  $('nv-line-heights').addEventListener('change', renderLines);
  $('nv-line-report').addEventListener('click', () => openPreview(['height-line']));

  // Magassági kiegyenlítés: a magasságkülönbség kihagyása és az adott magasságú pontok (súgó 53. o.).
  $('nv-table').addEventListener('click', (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('td[data-hkey]');
    if (!cell) return;
    const key = cell.dataset.hkey!;
    if (cell.dataset.coord) heightIncluded = heightIncluded.includes(key) ? heightIncluded.filter((k) => k !== key) : [...heightIncluded, key];
    else heightExcluded = heightExcluded.includes(key) ? heightExcluded.filter((k) => k !== key) : [...heightExcluded, key];
    compute();
  });
  $('nv-fixed').addEventListener('change', (event) => {
    const box = event.target as HTMLInputElement;
    if (!box.dataset.fixed) return;
    if (box.checked) heightFloating.delete(box.dataset.fixed);
    else heightFloating.add(box.dataset.fixed);
    compute();
  });
  $('nv-run').addEventListener('click', () => {
    hOn.checked = true;
    compute();
  });
  $('nv-refresh').addEventListener('click', () => {
    heightExcluded = [];
    heightIncluded = [];
    heightFloating = new Set();
    compute();
  });
  $('nv-report').addEventListener('click', () => {
    hOn.checked = true;
    openPreview(['height-summary']);
  });

  // Részletpontok számítása: a számítandó álláspontok, export és munka koordináta-jegyzék (súgó 54. o.).
  $('nd-add').addEventListener('click', () => {
    const add = selectedValues($<HTMLSelectElement>('nd-stations'));
    detailStations = [...new Set([...(detailStations ?? []), ...add])];
    compute();
  });
  $('nd-remove').addEventListener('click', () => {
    const drop = new Set(selectedValues($<HTMLSelectElement>('nd-selected')));
    const current = detailStations ?? (model?.stations ?? []).map((st) => st.id);
    detailStations = current.filter((id) => !drop.has(id));
    compute();
  });
  $('nd-refresh').addEventListener('click', () => {
    detailStations = null;
    compute();
  });
  $('nd-report').addEventListener('click', () => {
    detailsOn.checked = true;
    openPreview(['detail-points']);
  });
  const readWorkList = (): WorkListState => ({
    heights: $<HTMLInputElement>('nd-heights').checked,
    coordDecimals: Math.max(0, Math.min(4, Math.round(Number($<HTMLInputElement>('nd-cdec').value) || 0))),
    heightDecimals: Math.max(0, Math.min(4, Math.round(Number($<HTMLInputElement>('nd-hdec').value) || 0))),
  });
  $('nd-worklist').addEventListener('click', () => {
    workList = readWorkList();
    openPreview(['work-list']);
  });
  for (const id of ['nd-heights', 'nd-cdec', 'nd-hdec']) {
    $(id).addEventListener('change', () => {
      if (workList) {
        workList = readWorkList();
        compute();
      }
    });
  }
  /** A kiválasztott típusú pontok (súgó 54. o.: Minden / Kiinduló / Kiegyenlített / Részletpontok). */
  const exportPoints = (): Point[] => {
    const m = model;
    if (!m) return [];
    const type = $<HTMLSelectElement>('nd-type').value;
    const heights = new Map<string, number>((m.vertical?.points ?? []).map((p) => [p.id, p.height] as const));
    const out: Point[] = [];
    if (type === 'all' || type === 'known') out.push(...m.known.map((p) => ({ id: p.id, y: p.y, x: p.x, m: heights.get(p.id) ?? p.m, code: p.mark })));
    if (type === 'all' || type === 'adjusted') out.push(...(m.horizontal?.points ?? []).map((p) => ({ id: p.id, y: p.y, x: p.x, m: heights.get(p.id) ?? null, code: '' })));
    if (type === 'all' || type === 'detail') out.push(...m.details.map((p) => ({ id: p.id, y: p.y, x: p.x, m: p.height, code: '' })));
    return out;
  };
  const baseName = () => workname.value.trim() || 'halozat';
  $('nd-export').addEventListener('click', () => {
    const pts = exportPoints();
    if (pts.length === 0) return;
    download(
      `${baseName()}_koordinatak.txt`,
      pts.map((p) => [p.id, p.y.toFixed(3), p.x.toFixed(3), p.m === null ? '' : p.m.toFixed(3), p.code].join(',')).join('\r\n') + '\r\n',
    );
  });
  $('nd-export-db').addEventListener('click', () => {
    const pts = exportPoints();
    if (pts.length > 0) download(`${baseName()}.PYX2`, pts.map((p) => `${p.id}, ${p.y.toFixed(3)}, ${p.x.toFixed(3)}, ${(p.m ?? 0).toFixed(3)}, ${p.code}, 1`).join('\r\n') + '\r\n');
  });

  // Állományok: betöltés és hozzáfűzés (súgó 50. o.).
  const loadFile = (button: string, input: string, target: HTMLTextAreaElement, append = false) => {
    const file = $<HTMLInputElement>(input);
    $(button).addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      const text = await readText(f);
      target.value = append && target.value.trim() !== '' ? `${target.value.replace(/\s+$/, '')}\n${text}` : text;
      excluded = [];
      if (!append) resetSelections();
      updateExcludedLabel();
      compute();
    });
  };
  const appendInput = el('input');
  appendInput.type = 'file';
  appendInput.id = 'net-file-coords-append';
  appendInput.hidden = true;
  document.body.append(appendInput);
  loadFile('net-open-coords', 'net-file-coords', coordinates);
  loadFile('net-append-coords', 'net-file-coords-append', coordinates, true);
  loadFile('net-open-gmj', 'net-file-gmj', gmj);

  const loadSample = (sampleGmj: string, alsoAveraging: boolean) => {
    resetSelections();
    heightFloating = new Set();
    detailStations = null;
    polygon = [];
    heightLines = [];
    lineDraft = { name: '', order: [] };
    heightIncluded = [];
    coordinates.value = ISZKA_COORDINATES;
    gmj.value = sampleGmj;
    if (alsoAveraging) avgOn.checked = true;
    writeSettings(DEFAULT_HORIZONTAL_SETTINGS);
    // A mintapélda önálló magassági hálózat (a GeoCalc saját kimenetével összevethető).
    writeVertical({ ...DEFAULT_VERTICAL_SETTINGS, free: true }, true);
    compute();
  };
  $('net-sample').addEventListener('click', () => {
    const dirty = (coordinates.value.trim() !== '' || gmj.value.trim() !== '') && !(coordinates.value === ISZKA_COORDINATES && gmj.value === ISZKA_GMJ);
    if (dirty && !confirm('A beviteli mezők tartalmát lecseréli a mintapélda. Folytatod?')) return;
    traverseInput.value = '541017D 2 3 541440';
    loadSample(ISZKA_GMJ, false);
  });
  $('net-sample-raw').addEventListener('click', () => {
    const dirty =
      (coordinates.value.trim() !== '' || gmj.value.trim() !== '') &&
      !(coordinates.value === ISZKA_COORDINATES && (gmj.value === ISZKA_GMJ || gmj.value === ISZKA_RAW_GMJ));
    if (dirty && !confirm('A beviteli mezők tartalmát lecseréli a mintapélda. Folytatod?')) return;
    loadSample(ISZKA_RAW_GMJ, true);
  });
  $('net-reset').addEventListener('click', () => {
    writeSettings({ ...DEFAULT_HORIZONTAL_SETTINGS, excluded, extraPoints: extraPoints() });
    writeVertical({ ...DEFAULT_VERTICAL_SETTINGS, excluded: heightExcluded }, hOn.checked);
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
      workname.value = saved.workname ?? '';
      removedStations = new Set(saved.removedStations ?? []);
      removedKnown = new Set(saved.removedKnown ?? []);
      statusNew = new Set(saved.statusNew ?? []);
      manual = new Map(Object.entries(saved.manual ?? {}));
      heightFloating = new Set(saved.heightFloating ?? []);
      detailStations = saved.detailStations ?? null;
      orientation = saved.orientation ?? null;
      workList = saved.workList ?? null;
      polygon = saved.polygon ?? [];
      heightLines = saved.heightLines ?? [];
      lineDraft = saved.lineDraft ?? { name: '', order: [] };
    } else {
      writeSettings(DEFAULT_HORIZONTAL_SETTINGS);
      writeVertical(DEFAULT_VERTICAL_SETTINGS, true);
      sketchOn.checked = false;
    }
  } catch {
    writeSettings(DEFAULT_HORIZONTAL_SETTINGS);
    writeVertical(DEFAULT_VERTICAL_SETTINGS, true);
  }
  compute();
}

/** Az előzetes koordináták jegyzéke a jegyzőkönyvbe (a táblázat nyomtatható párja). */
function prelimSection(used: string[], newIds: Set<string>, prelim: Map<string, Pt>, knownAll: NetPoint[]): Section {
  const marks = new Map(knownAll.map((p) => [p.id, p.mark]));
  const rows: Row[] = [...used.filter((id) => newIds.has(id)), ...used.filter((id) => !newIds.has(id))].map((id) => {
    const c = prelim.get(id);
    return {
      cells: [id, c ? fix(c.y, 2) : '', c ? fix(c.x, 2) : '', marks.get(id) ?? '', newIds.has(id) ? 'új' : 'adott'],
      role: newIds.has(id) ? 'result' : 'base',
    };
  });
  return {
    kind: 'net-prelim',
    title: 'Előzetes koordináták',
    columns: ['Pontszám', 'Y', 'X', 'Jelölés', 'Státusz'],
    rows,
    footer: [`A kiegyenlítésbe bevont pontok: ${used.length}, ebből új pont: ${used.filter((id) => newIds.has(id)).length}.`],
  };
}

/**
 * A magassági kiegyenlítésbe felkínált magasságkülönbségek (súgó 53. o.): a távolsággal mért irányok
 * a hálózat pontjai között, a mért dM-mel vagy a zenitszögből számítva – mint az `adjustHeights`.
 */
function heightDifferences(stations: NetStation[], known: NetPoint[], extra: string[], coords: Map<string, Pt>): HeightCandidate[] {
  const network = new Set<string>([...stations.map((st) => st.id), ...known.map((p) => p.id), ...extra]);
  const out: HeightCandidate[] = [];
  for (const st of [...stations].sort((a, b) => byId(a.id, b.id))) {
    for (const o of st.observations) {
      if (!network.has(o.target)) continue;
      let distance = o.distance;
      let fromCoords = false;
      if (!distance) {
        const a = coords.get(st.id);
        const b = coords.get(o.target);
        if (!a || !b) continue;
        distance = Math.hypot(b.y - a.y, b.x - a.x);
        fromCoords = true;
        if (distance <= 0) continue;
      }
      let dh = fromCoords ? coordinateHeightDifference(o, st.instrumentHeight, distance) : o.dM;
      if (dh === null && o.zi !== null && st.instrumentHeight !== null && o.targetHeight !== null) {
        dh = trigonometricHeightDifference(distance, o.zi, st.instrumentHeight, o.targetHeight);
      }
      if (dh !== null) out.push({ station: st.id, target: o.target, dh, fromCoords });
    }
  }
  return out;
}
