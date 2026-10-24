import { sectionsToText } from './core/format';
import {
  ANNEX_SCALES,
  areaStatement,
  divideParallel,
  divideThroughVertex,
  divisionSection,
  parseParcels,
  parsePoints,
  type DivisionResult,
  type NamedPt,
  type ToleranceAnnex,
  type ToleranceKind,
} from './core/parcel';
import type { Issue, Section } from './core/types';
import { createPage } from './shell';
import { csvButton, download, el, readText, renderSection, storage } from './ui';

/**
 * Geodéziai számítások/Változási vázrajz: területszámítás a koordinátákból, terület-összevetés a
 * tulajdoni lapi területtel (8/2018. AM rendelet 18. §, 8–9. melléklet), területarányos ráosztás és
 * területkimutatás (12. §, 22. §), valamint területosztás (párhuzamos vagy töréspontos osztóvonal).
 */

const KEY = 'geocalc-web.parcel';

const SAMPLE = {
  coords: [
    '# pontszám  Y  X',
    '101  650120.45  241230.18',
    '102  650158.92  241236.71',
    '103  650152.37  241275.04',
    '104  650113.88  241268.52',
    '105  650190.40  241242.05',
    '106  650184.11  241280.39',
  ].join('\n'),
  before: ['# hrsz ; tulajdoni lapi terület [m²] ; pontok a kerület mentén', '123 ; 1524 ; 101 102 103 104', '124 ; 1241 ; 102 105 106 103'].join('\n'),
  after: ['# hrsz ; pontok', '123 ; 101 102 103 104', '124 ; 102 105 106 103'].join('\n'),
};

interface Saved {
  coords: string;
  before: string;
  after: string;
  annex: ToleranceAnnex;
  scale: string;
  kind: ToleranceKind;
}

const DEFAULTS: Saved = { ...SAMPLE, annex: 8, scale: '1000', kind: 'parcel' };

export function initParcelView(): void {
  const { body } = createPage('parcel', 'Geodéziai számítások/Változási vázrajz');
  const panes = el('div', 'panes');
  const left = el('section', 'pane network-form');
  left.setAttribute('aria-label', 'Földrészletek és területosztás');
  const right = el('section', 'pane result-pane');
  right.setAttribute('aria-label', 'Eredmény');

  /* ---------- bal oldal: bemenet ---------- */
  const lhead = el('div', 'pane-head');
  lhead.append(el('h2', undefined, 'Változási vázrajz – területszámítás'));
  const lact = el('div', 'pane-actions');
  const sampleBtn = button('pc-sample', 'Minta', 'A mintapélda betöltése');
  const openBtn = button('pc-open', 'Koordináták…', 'Koordináta-állomány beolvasása (pontszám, Y, X)');
  lact.append(sampleBtn, openBtn);
  lhead.append(lact);

  const form = el('div', 'form');
  const row = el('div', 'grid3');
  const annexSel = select('pc-annex', [
    ['8', '8. melléklet – EOTR (EOV) térkép'],
    ['9', '9. melléklet – EOTR előtti vetület'],
  ]);
  const scaleSel = select('pc-scale', []);
  const kindSel = select('pc-kind', [
    ['parcel', 'Földrészlet (1,5 ×)'],
    ['sub', 'Alrészlet, minőségi osztály, jog, tény (2 ×)'],
  ]);
  row.append(labelled('Hibahatár', annexSel), labelled('A digitalizált térkép méretaránya', scaleSel), labelled('Terület fajtája', kindSel));

  const coords = area('pc-coords', 8);
  const before = area('pc-before', 5);
  const after = area('pc-after', 5);
  form.append(
    row,
    labelled('Koordináták (pontszám, Y, X)', coords),
    labelled('Változás előtti földrészletek (hrsz ; tulajdoni lapi terület ; pontok)', before),
    labelled('Változás utáni földrészletek (hrsz ; pontok)', after),
    el(
      'p',
      'hint',
      'A pontokat a kerület mentén, szóközzel tagolva add meg (a kezdőpontot nem kell megismételni). A # utáni rész megjegyzés. ' +
        'A műszaki terület a koordinátákból számolódik; a változás utáni végleges területek a 22. § (3) szerinti területarányos ráosztással adódnak.',
    ),
  );

  // Területosztás
  const div = el('fieldset', 'dims column');
  div.append(el('legend', undefined, 'Területosztás'));
  const parcelSel = select('pc-div-parcel', []);
  const methodSel = select('pc-div-method', [
    ['parallel', 'Párhuzamos az A–B oldallal'],
    ['vertex', 'Az A törésponton átmenő'],
  ]);
  const ptA = input('pc-div-a', 'pl. 101');
  const ptB = input('pc-div-b', 'pl. 104');
  const target = input('pc-div-area', 'pl. 600');
  const name1 = input('pc-div-name1', 'pl. 123/1');
  const name2 = input('pc-div-name2', 'pl. 123/2');
  const prefix = input('pc-div-prefix', 'pl. U');
  prefix.value = 'U';
  const g1 = el('div', 'grid3');
  g1.append(labelled('Földrészlet', parcelSel), labelled('Osztóvonal', methodSel), labelled('Leválasztandó terület [m²]', target));
  const g2 = el('div', 'grid3');
  const bLabel = labelled('B pont', ptB);
  g2.append(labelled('A pont', ptA), bLabel, labelled('Új pontok előtagja', prefix));
  const g3 = el('div', 'grid3');
  g3.append(labelled('A leválasztott rész hrsz-a', name1), labelled('A maradék rész hrsz-a', name2));
  const divAct = el('div', 'pane-actions');
  const divBtn = button('pc-divide', 'Osztás', 'A földrészlet osztása a megadott területtel');
  const takeBtn = button('pc-take', 'Átvétel a változás utáni állapotba', 'Az új pontok a koordinátákhoz, a két rész a változás utáni földrészletek közé kerül');
  takeBtn.disabled = true;
  divAct.append(divBtn, takeBtn);
  div.append(
    g1,
    g2,
    g3,
    divAct,
    el(
      'p',
      'hint',
      'Párhuzamos osztásnál a leválasztott rész az A–B egyenes mellett marad (A és B általában a földrészlet egyik oldala). ' +
        'Töréspontos osztásnál az osztóvonal az A pontból indul, a leválasztott rész a pontsorrend szerint az A pontot követő oldalak felé esik. ' +
        'Az átvételkor az új pontok centiméterre kerekítve kerülnek a koordináták közé, ezért a rész területe néhány dm²-rel eltérhet a kérttől.',
    ),
  );
  form.append(div);
  left.append(lhead, form);

  /* ---------- jobb oldal: eredmény ---------- */
  const rhead = el('div', 'pane-head');
  rhead.append(el('h2', undefined, 'Területkimutatás'));
  const ract = el('div', 'pane-actions');
  const saveBtn = button('pc-save', 'Jegyzőkönyv (.txt)', 'A területszámítás jegyzőkönyvének mentése');
  let sections: Section[] = [];
  ract.append(saveBtn, csvButton('valtozasi_vazrajz', () => sections));
  rhead.append(ract);
  const status = el('div', 'status');
  status.id = 'pc-status';
  status.setAttribute('role', 'status');
  const issuesBox = el('div', 'issues');
  issuesBox.id = 'pc-issues';
  const sketch = el('div', 'parcel-sketch');
  sketch.id = 'pc-sketch';
  const results = el('div', 'results');
  results.id = 'pc-results';
  right.append(rhead, status, issuesBox, sketch, results);

  panes.append(left, right);
  body.append(panes);
  const file = el('input');
  file.type = 'file';
  file.accept = '.txt,.csv,.pkt,.koo,text/plain';
  file.hidden = true;
  body.append(file);

  /* ---------- állapot ---------- */
  let saved: Saved = DEFAULTS;
  try {
    saved = { ...DEFAULTS, ...(JSON.parse(storage.get(KEY) || '{}') as Partial<Saved>) };
  } catch {
    saved = DEFAULTS;
  }
  coords.value = saved.coords;
  before.value = saved.before;
  after.value = saved.after;
  annexSel.value = String(saved.annex);
  kindSel.value = saved.kind;
  fillScales(saved.scale);

  let division: { result: DivisionResult; sections: Section[] } | null = null;

  function fillScales(keep?: string): void {
    const annex = Number(annexSel.value) as ToleranceAnnex;
    const old = keep ?? scaleSel.value;
    scaleSel.replaceChildren(...ANNEX_SCALES[annex].map((s) => new Option(s.label, s.id)));
    scaleSel.value = ANNEX_SCALES[annex].some((s) => s.id === old) ? old : ANNEX_SCALES[annex][0]!.id;
  }

  function fillParcels(): void {
    const keep = parcelSel.value;
    const list = parseParcels(before.value, true, '').parcels;
    parcelSel.replaceChildren(...list.map((p) => new Option(p.hrsz, p.hrsz)));
    if (list.some((p) => p.hrsz === keep)) parcelSel.value = keep;
  }

  function run(): void {
    const state: Saved = {
      coords: coords.value,
      before: before.value,
      after: after.value,
      annex: Number(annexSel.value) as ToleranceAnnex,
      scale: scaleSel.value,
      kind: kindSel.value as ToleranceKind,
    };
    storage.set(KEY, JSON.stringify(state));
    fillParcels();
    const st = areaStatement({ coordinates: state.coords, before: state.before, after: state.after, annex: state.annex, scale: state.scale, kind: state.kind });
    sections = [...st.sections, ...(division?.sections ?? [])];
    showIssues([...st.issues, ...(division?.result.issues ?? [])]);
    results.replaceChildren(...sections.map(renderSection));
    if (sections.length === 0) results.append(el('p', 'empty', 'Add meg a koordinátákat és a földrészleteket, vagy töltsd be a mintát.'));
    const errors = st.issues.filter((i) => i.level === 'error').length;
    const finalSum = st.after.reduce((s, a) => s + a.final, 0);
    status.textContent =
      st.before.length + st.after.length === 0
        ? ''
        : `${st.before.length} földrészlet előtte, ${st.after.length} utána · tulajdoni lapi összeg ${st.registeredSum} m²` +
          (st.after.length > 0 ? ` · végleges összeg ${finalSum} m²` : '') +
          (errors > 0 ? ` · ${errors} hiba` : ' · rendben');
    drawSketch(state);
    saveBtn.disabled = sections.length === 0;
  }

  function showIssues(list: Issue[]): void {
    issuesBox.replaceChildren();
    for (const i of list) {
      const d = el('div', `issue ${i.level}`);
      d.append(el('span', 'tag', i.level === 'error' ? 'Hiba' : i.level === 'warning' ? 'Figyelem' : 'Megjegyzés'), el('span', undefined, i.message));
      issuesBox.append(d);
    }
  }

  function drawSketch(state: Saved): void {
    const pts = parsePoints(state.coords).points;
    const polys = (text: string, withArea: boolean) =>
      parseParcels(text, withArea, '')
        .parcels.map((p) => ({ hrsz: p.hrsz, pts: p.points.map((id) => pts.get(id)).filter((q): q is NamedPt => q !== undefined) }))
        .filter((p) => p.pts.length >= 3);
    const b = polys(state.before, true);
    const a = polys(state.after, false);
    const extra = division?.result.parts.map((p) => ({ hrsz: p.hrsz, pts: p.points })) ?? [];
    const all = [...b, ...a, ...extra].flatMap((p) => p.pts);
    sketch.replaceChildren();
    if (all.length === 0) return;
    const minY = Math.min(...all.map((p) => p.y));
    const maxY = Math.max(...all.map((p) => p.y));
    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const W = 520;
    const H = 300;
    const pad = 28;
    const k = Math.min((W - 2 * pad) / Math.max(maxY - minY, 1e-6), (H - 2 * pad) / Math.max(maxX - minX, 1e-6));
    const sx = (y: number) => pad + (y - minY) * k;
    const sy = (x: number) => H - pad - (x - minX) * k;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'A földrészletek vázlata');
    const poly = (p: { hrsz: string; pts: NamedPt[] }, cls: string) => {
      const g = document.createElementNS(ns, 'polygon');
      g.setAttribute('points', p.pts.map((q) => `${sx(q.y).toFixed(1)},${sy(q.x).toFixed(1)}`).join(' '));
      g.setAttribute('class', cls);
      svg.append(g);
      const cy = p.pts.reduce((s, q) => s + q.y, 0) / p.pts.length;
      const cx = p.pts.reduce((s, q) => s + q.x, 0) / p.pts.length;
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', sx(cy).toFixed(1));
      t.setAttribute('y', sy(cx).toFixed(1));
      t.setAttribute('class', `label ${cls}`);
      t.textContent = p.hrsz;
      svg.append(t);
    };
    b.forEach((p) => poly(p, 'before'));
    // Osztás előnézeténél az osztott földrészlet helyén a két rész látszik.
    const divided = division ? parcelSel.value : null;
    [...a.filter((p) => p.hrsz !== divided), ...extra].forEach((p) => poly(p, 'after'));
    const newIds = new Set(division?.result.newPoints.map((p) => p.id) ?? []);
    const seen = new Set<string>();
    for (const p of all) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', sx(p.y).toFixed(1));
      c.setAttribute('cy', sy(p.x).toFixed(1));
      c.setAttribute('r', '3');
      c.setAttribute('class', newIds.has(p.id) ? 'pt new' : 'pt');
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', (sx(p.y) + 5).toFixed(1));
      t.setAttribute('y', (sy(p.x) - 5).toFixed(1));
      t.setAttribute('class', 'ptid');
      t.textContent = p.id;
      svg.append(c, t);
    }
    sketch.append(svg);
  }

  function divide(): void {
    division = null;
    takeBtn.disabled = true;
    try {
      const pts = parsePoints(coords.value).points;
      const def = parseParcels(before.value, true, '').parcels.find((p) => p.hrsz === parcelSel.value);
      if (!def) throw new Error('Válassz földrészletet a változás előtti listából.');
      const poly = def.points.map((id) => {
        const p = pts.get(id);
        if (!p) throw new Error(`Ismeretlen pont: ${id}.`);
        return p;
      });
      const area = Number(target.value.replace(',', '.'));
      if (!Number.isFinite(area)) throw new Error('Add meg a leválasztandó területet.');
      const names: [string, string] = [name1.value.trim() || `${def.hrsz}/1`, name2.value.trim() || `${def.hrsz}/2`];
      const pre = prefix.value.trim() || 'U';
      let first = 1;
      while (pts.has(`${pre}${first}`)) first++;
      const pa = pts.get(ptA.value.trim());
      let res: DivisionResult;
      let how: string;
      if (methodSel.value === 'parallel') {
        const pb = pts.get(ptB.value.trim());
        if (!pa || !pb) throw new Error('Add meg az A és a B pontot (a koordináták között szereplő pontszámmal).');
        res = divideParallel(poly, pa, pb, area, names, pre, first);
        how = `Osztóvonal párhuzamos a(z) ${pa.id}–${pb.id} egyenessel`;
      } else {
        if (!pa) throw new Error('Add meg az A töréspontot.');
        res = divideThroughVertex(poly, pa.id, area, names, pre, first);
        how = `Osztóvonal a(z) ${pa.id} törésponton át`;
      }
      division = { result: res, sections: divisionSection(def.hrsz, res, how) };
      takeBtn.disabled = false;
      run();
    } catch (e) {
      run();
      showIssues([{ level: 'error', message: `Területosztás: ${e instanceof Error ? e.message : String(e)}` }]);
    }
  }

  function take(): void {
    if (!division) return;
    const r = division.result;
    const lines = r.newPoints.map((p) => `${p.id}  ${p.y.toFixed(2)}  ${p.x.toFixed(2)}`);
    if (lines.length > 0) coords.value = `${coords.value.replace(/\s*$/, '')}\n${lines.join('\n')}`;
    // A változás utáni listában az osztott földrészlet helyére a két rész kerül.
    const parent = parcelSel.value;
    const kept = after.value
      .split(/\r?\n/)
      .filter((l) => l.replace(/#.*/, '').split(';')[0]!.trim() !== parent);
    const parts = r.parts.map((p) => `${p.hrsz} ; ${p.points.map((q) => q.id).join(' ')}`);
    after.value = [...kept.filter((l) => l.trim() !== ''), ...parts].join('\n');
    division = null;
    takeBtn.disabled = true;
    run();
  }

  annexSel.addEventListener('change', () => {
    fillScales();
    run();
  });
  for (const c of [scaleSel, kindSel]) c.addEventListener('change', run);
  for (const t of [coords, before, after]) t.addEventListener('input', run);
  methodSel.addEventListener('change', () => {
    bLabel.hidden = methodSel.value !== 'parallel';
  });
  divBtn.addEventListener('click', divide);
  takeBtn.addEventListener('click', take);
  sampleBtn.addEventListener('click', () => {
    coords.value = SAMPLE.coords;
    before.value = SAMPLE.before;
    after.value = SAMPLE.after;
    division = null;
    takeBtn.disabled = true;
    run();
  });
  openBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    coords.value = await readText(f);
    run();
  });
  saveBtn.addEventListener('click', () => {
    if (sections.length > 0) download('teruletkimutatas.txt', sectionsToText(sections));
  });
  run();
}

function button(id: string, text: string, title: string): HTMLButtonElement {
  const b = el('button', undefined, text);
  b.type = 'button';
  b.id = id;
  b.title = title;
  return b;
}

function select(id: string, options: [string, string][]): HTMLSelectElement {
  const s = el('select');
  s.id = id;
  for (const [v, t] of options) s.append(new Option(t, v));
  return s;
}

function input(id: string, placeholder: string): HTMLInputElement {
  const i = el('input');
  i.id = id;
  i.placeholder = placeholder;
  i.spellcheck = false;
  return i;
}

function area(id: string, rows: number): HTMLTextAreaElement {
  const t = el('textarea');
  t.id = id;
  t.rows = rows;
  t.spellcheck = false;
  t.wrap = 'off';
  return t;
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label');
  l.append(el('span', 'label-text', text), control);
  return l;
}
