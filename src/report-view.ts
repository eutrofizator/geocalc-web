import {
  COVER_FOOTER,
  DEFAULT_META,
  countryLine,
  coverLines,
  formatCover,
  parseCover,
  reportToText,
  type ReportMeta,
} from './core/report';
import { coverLogoSrc } from './core/logo';
import type { Section } from './core/types';
import { $, download, el, readText, storage } from './ui';

/** A jegyzőkönyv előlapjának (borítójának) megjelenítése és szerkesztése. */

const STORAGE_KEY = 'geocalc-web.cover';

function load(): ReportMeta {
  try {
    const raw = storage.get(STORAGE_KEY);
    if (raw) return { ...DEFAULT_META, ...(JSON.parse(raw) as Partial<ReportMeta>) };
  } catch {
    /* a tárolt adat sérült – alapértékkel indulunk */
  }
  return { ...DEFAULT_META };
}

let meta: ReportMeta = load();
const listeners: (() => void)[] = [];

export function getMeta(): ReportMeta {
  return meta;
}

/** Az előlap adatainak frissítése; minden nézet értesítést kap, és a tárolóba is bekerül. */
export function setMeta(next: Partial<ReportMeta>): void {
  meta = { ...meta, ...next };
  storage.set(STORAGE_KEY, JSON.stringify(meta));
  for (const cb of listeners) cb();
}

export function onMeta(cb: () => void): void {
  listeners.push(cb);
}

/** Az előlap HTML-je (a jegyzőkönyv első oldala). */
export function renderCover(title: string, subtitle = ''): HTMLElement {
  const cover = el('section', 'card cover');
  cover.dataset.role = 'cover';

  const head = el('div', 'cover-head');
  const logo = el('div', 'cover-logo');
  {
    const img = el('img');
    img.src = coverLogoSrc(meta.logo);
    img.alt = meta.logo !== '' ? 'Céglogó' : 'Geodéziai számítás';
    if (meta.logo === '') logo.classList.add('is-default');
    logo.append(img);
  }
  const right = el('div', 'cover-head-right');
  if (meta.msz !== '') right.append(el('div', 'cover-msz', `Munkaszám: ${meta.msz}`));
  right.append(el('div', 'cover-country', countryLine(meta)));
  head.append(logo, right);

  cover.append(head);
  cover.append(el('h1', 'cover-title', title));
  const sub = subtitle !== '' ? subtitle : meta.munkanev;
  if (sub !== '') cover.append(el('p', 'cover-subtitle', sub));

  const fields = el('div', 'cover-fields');
  for (const line of coverLines(meta)) fields.append(el('div', undefined, line));
  cover.append(fields);

  const foot = el('div', 'cover-foot');
  for (const line of COVER_FOOTER) foot.append(el('div', undefined, line));
  cover.append(foot);

  return cover;
}

/** A jegyzőkönyv teljes szövege (előlap + szakaszok) letöltésre. */
export function downloadReport(name: string, title: string, sections: Section[], subtitle = ''): void {
  download(name, reportToText(title, meta, sections, subtitle));
}

/* ------------------------------------------------------------------ *
 * Az „Általános beállítások” munkalap (a súgó 76–77. o.)
 * ------------------------------------------------------------------ */

const TEXT_FIELDS: [string, keyof ReportMeta][] = [
  ['set-keszitette', 'keszitette'],
  ['set-munkanev', 'munkanev'],
  ['set-msz', 'msz'],
  ['set-telepules', 'telepules'],
  ['set-megye', 'megye'],
  ['set-ev', 'ev'],
  ['set-datum', 'datum'],
  ['set-vetulet', 'vetulet'],
  ['set-magassag', 'magassag'],
  ['set-fekves', 'fekves'],
];

export function initSettingsView(): void {
  const logoPreview = $('set-logo-preview');
  const logoStatus = $('set-logo-status');
  const logoInput = $<HTMLInputElement>('set-logo-file');
  const fileInput = $<HTMLInputElement>('set-file-open');
  const status = $('set-status');

  const write = () => {
    for (const [id, field] of TEXT_FIELDS) {
      const input = $<HTMLInputElement>(id);
      // A szerkesztés alatt álló mezőt nem írjuk felül (a kurzor megőrzése érdekében).
      if (input !== document.activeElement && input.value !== meta[field]) input.value = meta[field];
    }
    logoPreview.replaceChildren();
    {
      const img = el('img');
      img.src = coverLogoSrc(meta.logo);
      img.alt = 'Logó előnézet';
      if (meta.logo === '') img.classList.add('is-default');
      logoPreview.append(img);
    }
    logoStatus.textContent =
      meta.logo === '' ? 'Alapértelmezett jelkép (geodéziai számítás).' : 'Saját logó betöltve.';
  };
  onMeta(write);

  for (const [id, field] of TEXT_FIELDS) {
    const input = $<HTMLInputElement>(id);
    input.addEventListener('input', () => setMeta({ [field]: input.value }));
  }

  $('set-logo').addEventListener('click', () => logoInput.click());
  logoInput.addEventListener('change', () => {
    const file = logoInput.files?.[0];
    logoInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setMeta({ logo: String(reader.result ?? '') });
      write();
      status.textContent = `Logó betöltve: ${file.name}`;
    });
    reader.readAsDataURL(file);
  });
  $('set-logo-clear').addEventListener('click', () => {
    setMeta({ logo: '' });
    write();
    status.textContent = 'A saját logó törölve – az alapértelmezett jelkép látható.';
  });

  $('set-export').addEventListener('click', () => download('borito.ini', formatCover(meta)));
  $('set-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    setMeta(parseCover(await readText(file)));
    write();
    status.textContent = `Előlap betöltve: ${file.name}`;
  });

  $('set-reset').addEventListener('click', () => {
    setMeta({ ...DEFAULT_META });
    write();
    status.textContent = 'Az előlap adatai visszaálltak az alapértékre.';
  });

  write();
}
