import { GEO_FORMATS, convertGeo, type GeoFormat } from './core/geo/convert';
import { createPage } from './shell';
import { download, el, readText, renderSection, storage } from './ui';

/**
 * Adatcsere/Földrajzi koordináták konvertálása (súgó 9. o.): a kézi, navigációs célú GPS-vevők és más
 * programok koordinátáinak átírása egyik szögírásból a másikba (áldecimális, tizedes fok, fok-perc-
 * másodperc), illetve WGS 84 földrajzi, geocentrikus és UTM koordináták között.
 */

const KEY = 'geocalc-web.geoconvert';
const SAMPLE = [
  '# pontszám  φ  λ  h  (áldecimális: 19.182231643 = 19° 18′ 22.31643″)',
  'A  47.29521230  19.02474560  151.250',
  'B  47.30101500  19.10223000  138.400',
  'C  46.15302200  20.08451700  84.120',
].join('\n');

interface Saved {
  from: GeoFormat;
  to: GeoFormat;
  dec: number;
  text: string;
}

export function initGeoConvertView(): void {
  const { body } = createPage('geo-convert', 'Adatcsere / Földrajzi koordináták konvertálása');
  const panes = el('div', 'panes');
  const left = el('section', 'pane network-form');
  left.setAttribute('aria-label', 'Bemenet és formátumok');
  const right = el('section', 'pane result-pane');
  right.setAttribute('aria-label', 'Eredmény');

  // Bal oldal: formátumok és bemenet
  const lhead = el('div', 'pane-head');
  lhead.append(el('h2', undefined, 'Földrajzi koordináták konvertálása'));
  const lact = el('div', 'pane-actions');
  const sampleBtn = el('button', undefined, 'Minta');
  sampleBtn.type = 'button';
  sampleBtn.id = 'gc-sample';
  const openBtn = el('button', undefined, 'Megnyitás…');
  openBtn.type = 'button';
  openBtn.id = 'gc-open';
  lact.append(sampleBtn, openBtn);
  lhead.append(lact);

  const form = el('div', 'form');
  const row = el('div', 'grid2');
  const mkSelect = (id: string, label: string) => {
    const lab = el('label');
    lab.append(el('span', 'label-text', label));
    const sel = el('select');
    sel.id = id;
    for (const f of GEO_FORMATS) sel.append(new Option(f.label, f.id));
    lab.append(sel);
    row.append(lab);
    return sel;
  };
  const fromSel = mkSelect('gc-from', 'Bemenet formátuma');
  const toSel = mkSelect('gc-to', 'Kimenet formátuma');
  const decLabel = el('label');
  decLabel.append(el('span', 'label-text', 'A másodperc tizedesjegyei'));
  const decSel = el('select');
  decSel.id = 'gc-dec';
  for (const d of [0, 1, 2, 3, 4, 5]) decSel.append(new Option(String(d), String(d)));
  decLabel.append(decSel);
  row.append(decLabel);
  const swapLabel = el('label');
  swapLabel.append(el('span', 'label-text', ' '));
  const swapBtn = el('button', 'wide', 'Bemenet ⇄ kimenet');
  swapBtn.type = 'button';
  swapBtn.id = 'gc-swap';
  swapLabel.append(swapBtn);
  row.append(swapLabel);

  const inLabel = el('label');
  const cols = el('span', 'cols');
  const inHead = el('span', 'label-text', 'Pontok (soronként: pontszám és koordináták)');
  inHead.append(cols);
  inLabel.append(inHead);
  const input = el('textarea');
  input.id = 'gc-input';
  input.spellcheck = false;
  input.wrap = 'off';
  input.rows = 14;
  inLabel.append(input);
  const note = el(
    'p',
    'hint',
    'Az átszámítás a WGS 84 ellipszoidon pontos (dátum-átszámítás nélkül). Az EOV formátum az országos ' +
      '7 paraméteres transzformációval (MSZ 7222, EPSG 1449) kb. ± 1 m pontos, a magasság (M) változatlanul megy át; ' +
      'centiméteres átszámításhoz a Térbeli transzformáció modul (közös pontok, interpoláció) vagy az EHT² kell. ' +
      'A # utáni rész megjegyzés.',
  );
  form.append(row, inLabel, note);
  left.append(lhead, form);

  // Jobb oldal: eredmény
  const rhead = el('div', 'pane-head');
  rhead.append(el('h2', undefined, 'Eredmény'));
  const ract = el('div', 'pane-actions');
  const saveBtn = el('button', undefined, 'Mentés (.txt)');
  saveBtn.type = 'button';
  saveBtn.id = 'gc-save';
  ract.append(saveBtn);
  rhead.append(ract);
  const status = el('div', 'status');
  status.id = 'gc-status';
  status.setAttribute('role', 'status');
  const issues = el('div', 'issues');
  const results = el('div', 'results');
  results.id = 'gc-results';
  right.append(rhead, status, issues, results);

  panes.append(left, right);
  body.append(panes);

  const file = el('input');
  file.type = 'file';
  file.accept = '.txt,.csv,.gpx,text/plain';
  file.hidden = true;
  body.append(file);

  let lastText = '';
  const run = () => {
    const from = fromSel.value as GeoFormat;
    const to = toSel.value as GeoFormat;
    const dec = Number(decSel.value);
    cols.textContent = ` – ${GEO_FORMATS.find((f) => f.id === from)!.columns.join(', ')}`;
    storage.set(KEY, JSON.stringify({ from, to, dec, text: input.value } satisfies Saved));
    const r = convertGeo(input.value, from, to, dec);
    issues.replaceChildren();
    results.replaceChildren();
    for (const e of r.errors) {
      const d = el('div', 'issue error');
      d.append(el('span', 'tag', 'Hiba'), el('span', undefined, `${e.line}. sor: ${e.message}`));
      issues.append(d);
    }
    const outCols = GEO_FORMATS.find((f) => f.id === to)!.columns;
    status.textContent = r.rows.length === 0 && r.errors.length === 0 ? '' : `${r.rows.length} pont átszámítva, ${r.errors.length} hibás sor`;
    if (r.rows.length > 0) {
      results.append(
        renderSection({
          kind: 'geo-convert',
          title: GEO_FORMATS.find((f) => f.id === to)!.label,
          columns: ['Pontszám', ...outCols],
          rows: r.rows.map((x) => ({ cells: [x.id, ...x.values] })),
        }),
      );
    } else if (r.errors.length === 0) {
      results.append(el('p', 'empty', 'Írj be pontokat, vagy töltsd be a mintát.'));
    }
    lastText = r.rows.map((x) => [x.id, ...x.values].join(' ')).join('\r\n');
    saveBtn.disabled = r.rows.length === 0;
  };

  let saved: Partial<Saved> = {};
  try {
    saved = JSON.parse(storage.get(KEY) || '{}') as Partial<Saved>;
  } catch {
    saved = {};
  }
  fromSel.value = saved.from ?? 'PSEUDO';
  toSel.value = saved.to ?? 'DMS';
  decSel.value = String(saved.dec ?? 5);
  input.value = saved.text ?? SAMPLE;

  for (const c of [fromSel, toSel, decSel]) c.addEventListener('change', run);
  input.addEventListener('input', run);
  sampleBtn.addEventListener('click', () => {
    fromSel.value = 'PSEUDO';
    input.value = SAMPLE;
    run();
  });
  swapBtn.addEventListener('click', () => {
    // A kimenet lesz az új bemenet: így oda-vissza is ellenőrizhető az átírás.
    const text = lastText;
    const f = fromSel.value;
    fromSel.value = toSel.value;
    toSel.value = f;
    if (text) input.value = text;
    run();
  });
  openBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    input.value = await readText(f);
    run();
  });
  saveBtn.addEventListener('click', () => {
    if (lastText) download(`konvertalt_${toSel.value.toLowerCase()}.txt`, `${lastText}\r\n`);
  });
  run();
}
