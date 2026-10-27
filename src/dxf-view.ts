import { parseMeasured } from './core/boundary-check';
import { gnssToText, parseGnssText } from './core/gnss';
import { readDxfDrawing, matchPoints, type DxfDrawing } from './core/dxf-drawing';
import { decodeText, readZip } from './core/land-office';
import { parsePoints, type NamedPt } from './core/parcel';
import type { Section } from './core/types';
import { createPage } from './shell';
import { csvButton, el, renderSection, storage } from './ui';

/**
 * Adatcsere/DXF megjelenítő: a földhivatali (vagy bármilyen ASCII) DXF térkép megtekintése fóliánként,
 * ráhelyezve a saját mért pontokat, a legközelebbi DXF ponttól való eltéréssel. Nagyítás egérgörgővel,
 * mozgatás húzással; a kurzor koordinátái a sávban.
 */

const KEY = 'geocalc-web.dxfview';
const PARCEL_KEY = 'geocalc-web.parcel';
const COLORS = ['#1f5fbf', '#8a5a00', '#0b7a4b', '#7a2fa0', '#b04a00', '#00708a', '#5a5a5a', '#a01860', '#4a6a00', '#2a3f9a'];

interface Saved {
  points: string;
  radius: string;
  texts: boolean;
  hidden: string[];
}

const DEFAULTS: Saved = { points: '', radius: '1', texts: true, hidden: [] };

export function initDxfView(): void {
  const { body } = createPage('dxf-view', 'Adatcsere/DXF megjelenítő');
  const panes = el('div', 'panes');
  const left = el('section', 'pane network-form');
  left.setAttribute('aria-label', 'DXF és saját pontok');
  const right = el('section', 'pane result-pane');
  right.setAttribute('aria-label', 'Térkép');

  /* ---------- bal oldal ---------- */
  const lhead = el('div', 'pane-head');
  lhead.append(el('h2', undefined, 'DXF megjelenítő'));
  const lact = el('div', 'pane-actions');
  const openBtn = button('dv-open', 'DXF megnyitása…', 'A földhivatali térkép (DXF vagy a DXF-et tartalmazó ZIP) beolvasása');
  const ptsBtn = button('dv-points-open', 'Pontok állományból…', 'Saját pontok beolvasása (pontszám Y X soronként)');
  const parcelBtn = button('dv-from-parcel', 'A Változási vázrajz pontjai', 'A Változási vázrajz munkalap mért pontjai (vagy ha nincsenek, a koordinátái)');
  lact.append(openBtn, ptsBtn, parcelBtn);
  lhead.append(lact);

  const form = el('div', 'form');
  const fileInfo = el('p', 'hint', 'Még nincs beolvasott DXF.');
  fileInfo.id = 'dv-file';
  const points = el('textarea');
  points.id = 'dv-points';
  points.rows = 10;
  points.spellcheck = false;
  points.placeholder = '# pontszám Y X\n101 650012.34 240001.02\n102 650040.11 240000.87';
  const radiusSel = el('select');
  radiusSel.id = 'dv-radius';
  for (const r of ['0.1', '0.5', '1', '2', '5', '10']) radiusSel.append(new Option(`${r} m`, r));
  const textsChk = el('input');
  textsChk.type = 'checkbox';
  textsChk.id = 'dv-texts';
  const textsLabel = el('label', 'check');
  textsLabel.append(textsChk, el('span', undefined, 'A DXF feliratai'));
  const grid = el('div', 'grid2');
  grid.append(labelled('Keresési sugár a legközelebbi DXF ponthoz', radiusSel), textsLabel);
  const layerBox = el('div', 'dv-layers');
  layerBox.id = 'dv-layers';
  const layerHead = el('div', 'pane-actions');
  const allOn = button('dv-layers-all', 'Mind', 'Minden fólia látszik');
  const allOff = button('dv-layers-none', 'Egyik sem', 'Minden fólia rejtve');
  layerHead.append(el('span', 'label-text', 'Fóliák'), allOn, allOff);
  form.append(fileInfo, labelled('Saját pontok (pontszám Y X)', points), grid, layerHead, layerBox);
  left.append(lhead, form);

  /* ---------- jobb oldal ---------- */
  const rhead = el('div', 'pane-head');
  rhead.append(el('h2', undefined, 'Térkép'));
  const ract = el('div', 'pane-actions');
  const fitBtn = button('dv-fit', 'Teljes nézet', 'A teljes rajz a nézetben');
  const ownBtn = button('dv-fit-own', 'Saját pontokra', 'Nagyítás a saját pontokra');
  const zoomIn = button('dv-zoom-in', '+', 'Nagyítás');
  const zoomOut = button('dv-zoom-out', '−', 'Kicsinyítés');
  const cursor = el('span', 'hint', '');
  cursor.id = 'dv-cursor';
  ract.append(fitBtn, ownBtn, zoomIn, zoomOut, cursor);
  rhead.append(ract);
  const status = el('div', 'status');
  status.id = 'dv-status';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'dv-svg';
  svg.classList.add('dv-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'A DXF rajz és a saját pontok');
  const gMap = document.createElementNS(NS, 'g');
  const gOwn = document.createElementNS(NS, 'g');
  svg.append(gMap, gOwn);
  const results = el('div', 'results');
  results.id = 'dv-results';
  right.append(rhead, status, svg, results);
  panes.append(left, right);
  body.append(panes);

  const dxfFile = el('input');
  dxfFile.type = 'file';
  dxfFile.accept = '.dxf,.DXF,.zip,.ZIP';
  dxfFile.hidden = true;
  dxfFile.id = 'dv-dxf-input';
  const ptsFile = el('input');
  ptsFile.type = 'file';
  ptsFile.accept = '.txt,.csv,.pkt,.koo,text/plain';
  ptsFile.hidden = true;
  ptsFile.id = 'dv-points-input';
  body.append(dxfFile, ptsFile);

  /* ---------- állapot ---------- */
  let saved: Saved = DEFAULTS;
  try {
    saved = { ...DEFAULTS, ...(JSON.parse(storage.get(KEY) || '{}') as Partial<Saved>) };
  } catch {
    saved = DEFAULTS;
  }
  points.value = saved.points;
  radiusSel.value = saved.radius;
  textsChk.checked = saved.texts;
  const hidden = new Set(saved.hidden);
  let drawing: DxfDrawing | null = null;
  /** A rajz koordinátáinak eltolása (a nagy EOV értékek helyett kis SVG-számok). */
  let origin = { y: 0, x: 0 };
  let view = { x: 0, y: 0, w: 100, h: 100 };
  const sx = (p: { y: number }) => p.y - origin.y;
  const sy = (p: { x: number }) => origin.x - p.x;

  const save = () => storage.set(KEY, JSON.stringify({ points: points.value, radius: radiusSel.value, texts: textsChk.checked, hidden: [...hidden] } satisfies Saved));

  const setView = (v: typeof view) => {
    view = v;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    drawOwn();
  };
  /** Egy képpont hossza rajzegységben (m). */
  const px = () => {
    const r = svg.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? Math.max(view.w / r.width, view.h / r.height) : view.w / 800;
  };
  const fit = (b: { minY: number; minX: number; maxY: number; maxX: number } | null) => {
    if (!b) return;
    const w = Math.max(b.maxY - b.minY, 1);
    const h = Math.max(b.maxX - b.minX, 1);
    setView({ x: b.minY - origin.y - w * 0.05, y: origin.x - b.maxX - h * 0.05, w: w * 1.1, h: h * 1.1 });
  };
  const ownBounds = (own: NamedPt[]) =>
    own.length === 0
      ? null
      : {
          minY: Math.min(...own.map((p) => p.y)) - 10,
          maxY: Math.max(...own.map((p) => p.y)) + 10,
          minX: Math.min(...own.map((p) => p.x)) - 10,
          maxX: Math.max(...own.map((p) => p.x)) + 10,
        };

  const ownPoints = (): NamedPt[] => [...parsePoints(points.value).points.values()];

  function drawMap(): void {
    gMap.replaceChildren();
    if (!drawing) return;
    const byLayer = new Map<string, { d: string[]; dots: string[]; texts: string[] }>();
    const f = (n: number) => n.toFixed(3);
    for (const it of drawing.items) {
      if (hidden.has(it.layer)) continue;
      let g = byLayer.get(it.layer);
      if (!g) byLayer.set(it.layer, (g = { d: [], dots: [], texts: [] }));
      if (it.kind === 'path') g.d.push(`M${it.pts.map((p) => `${f(sx(p))} ${f(sy(p))}`).join('L')}${it.closed ? 'Z' : ''}`);
      else if (it.kind === 'point') g.dots.push(`M${f(sx(it.at))} ${f(sy(it.at))}h0`);
      else if (textsChk.checked)
        g.texts.push(
          `<text x="${f(sx(it.at))}" y="${f(sy(it.at))}" font-size="${f(it.height)}"${it.rotation ? ` transform="rotate(${f(-it.rotation)} ${f(sx(it.at))} ${f(sy(it.at))})"` : ''}>${esc(it.text)}</text>`,
        );
    }
    const order = drawing.layers.map((l) => l.name);
    const parts: string[] = [];
    for (const [name, g] of [...byLayer].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))) {
      const c = COLORS[order.indexOf(name) % COLORS.length]!;
      parts.push(
        `<g data-layer="${esc(name)}">` +
          (g.d.length ? `<path d="${g.d.join('')}" fill="none" stroke="${c}" stroke-width="1" vector-effect="non-scaling-stroke"/>` : '') +
          (g.dots.length ? `<path d="${g.dots.join('')}" stroke="${c}" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : '') +
          (g.texts.length ? `<g fill="${c}" font-family="Arial, sans-serif">${g.texts.join('')}</g>` : '') +
          '</g>',
      );
    }
    // A saját előállítású jelölés beillesztése egy SVG-dokumentumon át (az attribútumok kódolva).
    const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${parts.join('')}</svg>`, 'image/svg+xml');
    for (const n of [...doc.documentElement.childNodes]) gMap.append(document.importNode(n, true));
  }

  function drawOwn(): void {
    gOwn.replaceChildren();
    const own = ownPoints();
    if (own.length === 0) return;
    const k = px();
    const matches = drawing ? matchPoints(drawing, own, Number(radiusSel.value)) : [];
    const parts: string[] = [];
    for (const m of matches)
      if (m.near) parts.push(`<path d="M${sx(m)} ${sy(m)}L${sx(m.near)} ${sy(m.near)}" stroke="#d01010" stroke-width="1.5" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>`);
    parts.push(`<path d="${own.map((p) => `M${sx(p)} ${sy(p)}h0`).join('')}" stroke="#d01010" stroke-width="8" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
    parts.push(
      `<g fill="#d01010" font-family="Arial, sans-serif" font-size="${(12 * k).toFixed(4)}" font-weight="bold">` +
        own.map((p) => `<text x="${sx(p) + 6 * k}" y="${sy(p) - 6 * k}">${esc(p.id)}</text>`).join('') +
        '</g>',
    );
    const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${parts.join('')}</svg>`, 'image/svg+xml');
    for (const n of [...doc.documentElement.childNodes]) gOwn.append(document.importNode(n, true));
  }

  function drawLayers(): void {
    layerBox.replaceChildren();
    if (!drawing) return;
    drawing.layers.forEach((l, i) => {
      const lab = el('label', 'check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !hidden.has(l.name);
      box.dataset.layer = l.name;
      const sw = el('span', 'dv-swatch');
      sw.style.background = COLORS[i % COLORS.length]!;
      lab.append(box, sw, el('span', undefined, `${l.name} (${l.count})`));
      layerBox.append(lab);
    });
  }

  function matchSection(): Section | null {
    const own = ownPoints();
    if (!drawing || own.length === 0) return null;
    const r = Number(radiusSel.value);
    const ms = matchPoints(drawing, own, r);
    const f = (n: number) => n.toFixed(3);
    return {
      kind: 'dxf-match',
      title: 'Saját pontok és a legközelebbi DXF pont',
      columns: ['Pontszám', 'Y', 'X', 'DXF pont', 'dY [m]', 'dX [m]', 'Eltérés [m]'],
      rows: ms.map((m) => ({
        key: m.id,
        role: 'result',
        cells: m.near
          ? [m.id, f(m.y), f(m.x), m.near.name || 'töréspont', f(m.y - m.near.y), f(m.x - m.near.x), f(m.near.dist)]
          : [m.id, f(m.y), f(m.x), `nincs ${r} m-en belül`, '', '', ''],
      })),
      footer: ['Eltérés = saját pont − DXF pont. A DXF pontjai: a számozott határpontok, a pontszerű elemek és a vonalak töréspontjai. Sorra kattintva a térkép a pontra áll.'],
    };
  }

  function refresh(): void {
    save();
    const issues = parsePoints(points.value).issues;
    const notes = [...(drawing?.warnings ?? []), ...issues.map((i) => i.message)];
    status.replaceChildren(...notes.map((m) => el('p', 'hint', m)));
    drawOwn();
    results.replaceChildren();
    const s = matchSection();
    if (s) {
      const card = renderSection(s);
      card.querySelector('h3')?.append(' ', csvButton('dxf_eltérések', () => [s]));
      results.append(card);
    }
  }

  async function openDxf(files: File[]): Promise<void> {
    let name = '';
    let text = '';
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        const z = (await readZip(await f.arrayBuffer())).find((x) => /\.dxf$/i.test(x.name));
        if (z) ({ name, text } = { name: `${f.name} / ${z.name}`, text: decodeText(z.data) });
      } else if (/\.dxf$/i.test(f.name)) ({ name, text } = { name: f.name, text: decodeText(new Uint8Array(await f.arrayBuffer())) });
      if (text) break;
    }
    if (!text) {
      fileInfo.textContent = 'Nem található DXF a kiválasztott állomány(ok)ban.';
      return;
    }
    drawing = readDxfDrawing(text);
    const b = drawing.bounds;
    origin = b ? { y: b.minY, x: b.maxX } : { y: 0, x: 0 };
    fileInfo.textContent = `${name}: ${drawing.items.length} elem, ${drawing.layers.length} fólia, ${drawing.named.length} számozott határpont.`;
    drawLayers();
    drawMap();
    fit(b);
    refresh();
  }

  /* ---------- nagyítás, mozgatás ---------- */
  const toWorld = (e: { clientX: number; clientY: number }) => {
    const r = svg.getBoundingClientRect();
    const k = px();
    // preserveAspectRatio="xMidYMid meet": a nézet a dobozban középre igazítva
    return { x: view.x + view.w / 2 + (e.clientX - r.left - r.width / 2) * k, y: view.y + view.h / 2 + (e.clientY - r.top - r.height / 2) * k };
  };
  const zoom = (f: number, at?: { x: number; y: number }) => {
    const c = at ?? { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    setView({ x: c.x - (c.x - view.x) * f, y: c.y - (c.y - view.y) * f, w: view.w * f, h: view.h * f });
  };
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.25 : 0.8, toWorld(e));
    },
    { passive: false },
  );
  let drag: { x: number; y: number; v: typeof view } | null = null;
  svg.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, v: view };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    const w = toWorld(e);
    if (drawing) cursor.textContent = `Y = ${(w.x + origin.y).toFixed(2)}  X = ${(origin.x - w.y).toFixed(2)}`;
    if (!drag) return;
    const k = px();
    view = { ...drag.v, x: drag.v.x - (e.clientX - drag.x) * k, y: drag.v.y - (e.clientY - drag.y) * k };
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  });
  const endDrag = () => (drag = null);
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  /* ---------- események ---------- */
  openBtn.addEventListener('click', () => dxfFile.click());
  dxfFile.addEventListener('change', () => {
    const fs = [...(dxfFile.files ?? [])];
    dxfFile.value = '';
    if (fs.length > 0) void openDxf(fs);
  });
  ptsBtn.addEventListener('click', () => ptsFile.click());
  ptsFile.addEventListener('change', async () => {
    const f = ptsFile.files?.[0];
    ptsFile.value = '';
    if (!f) return;
    const text = decodeText(new Uint8Array(await f.arrayBuffer()));
    // GNSS export (bármilyen oszlopsorrend, 5001_01 alakú utótag): a program saját jegyzékalakjára hozva.
    const g = parseGnssText(text);
    points.value = g.points.length > 0 ? gnssToText(g.points, false) : text;
    refresh();
    fit(ownBounds(ownPoints()) ?? drawing?.bounds ?? null);
  });
  parcelBtn.addEventListener('click', () => {
    let p: { coords?: string; measured?: string } = {};
    try {
      p = JSON.parse(storage.get(PARCEL_KEY) || '{}') as typeof p;
    } catch {
      p = {};
    }
    const mp = [...parseMeasured(p.measured ?? '').points.values()];
    const list = mp.length > 0 ? mp : [...parsePoints(p.coords ?? '').points.values()];
    points.value = list.map((q) => `${q.id} ${q.y.toFixed(3)} ${q.x.toFixed(3)}`).join('\n');
    refresh();
  });
  points.addEventListener('input', refresh);
  radiusSel.addEventListener('change', refresh);
  textsChk.addEventListener('change', () => {
    save();
    drawMap();
  });
  layerBox.addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    const name = box.dataset.layer;
    if (name === undefined) return;
    if (box.checked) hidden.delete(name);
    else hidden.add(name);
    save();
    drawMap();
  });
  const setAll = (on: boolean) => {
    if (!drawing) return;
    for (const l of drawing.layers) on ? hidden.delete(l.name) : hidden.add(l.name);
    save();
    drawLayers();
    drawMap();
  };
  allOn.addEventListener('click', () => setAll(true));
  allOff.addEventListener('click', () => setAll(false));
  fitBtn.addEventListener('click', () => fit(drawing?.bounds ?? ownBounds(ownPoints())));
  ownBtn.addEventListener('click', () => fit(ownBounds(ownPoints())));
  zoomIn.addEventListener('click', () => zoom(0.8));
  zoomOut.addEventListener('click', () => zoom(1.25));
  results.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest('tr')?.dataset.key;
    const p = id ? parsePoints(points.value).points.get(id) : undefined;
    if (p) fit({ minY: p.y - 15, maxY: p.y + 15, minX: p.x - 15, maxX: p.x + 15 });
  });

  setView(view);
  refresh();
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function button(id: string, text: string, title: string): HTMLButtonElement {
  const b = el('button', undefined, text);
  b.type = 'button';
  b.id = id;
  b.title = title;
  return b;
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label');
  l.append(el('span', 'label-text', text), control);
  return l;
}
