import { csvFileName, sectionsToCsv } from './core/csv';
import type { Section } from './core/types';

/** Közös felületi segédek a számítási és a transzformációs nézethez. */

export const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Hiányzó elem: #${id}`);
  return e as T;
};

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // A régi GeoCalc állományok Windows-1250 kódolásúak.
    return new TextDecoder('windows-1250').decode(buf);
  }
}

export function download(name: string, content: string | Uint8Array<ArrayBuffer>, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content], { type: typeof content === 'string' ? `${type};charset=utf-8` : type }));
  const a = el('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Kényelmi tárolás: hibát nyel el (privát ablak, letiltott tárolás), az oldal nélküle is működik. */
export const storage = {
  get(key: string): string {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  },
  has(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* a tárolás letiltott vagy tele van */
    }
  },
};

const NUM = /^-?\d+(\.\d+)?$/;

/** Saját előállítású SVG beágyazása (a szöveges megjelenítés helyett valódi SVG-elemként). */
export function svgElement(markup: string): SVGElement | null {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  return root && root.nodeName.toLowerCase() === 'svg' ? (root as unknown as SVGElement) : null;
}

export function renderSection(s: Section): HTMLElement {
  const card = el('section', s.columns.length === 0 && !s.footer ? 'card title-only' : 'card');
  card.append(el('h3', undefined, s.title));
  if (s.columns.length > 0) {
    const hasCheck = s.rows.some((r) => r.check);
    const wrap = el('div', 'table-wrap');
    const table = el('table');
    const head = el('tr');
    for (const c of s.columns) head.append(el('th', undefined, c));
    if (hasCheck) head.firstElementChild?.classList.add('check-col');
    const thead = el('thead');
    thead.append(head);
    table.append(thead);
    const body = el('tbody');
    for (const r of s.rows) {
      const tr = el('tr', [r.role, r.check ? 'check-row' : ''].filter((c) => c).join(' '));
      if (r.key) tr.dataset.key = r.key;
      r.cells.forEach((c, i) => {
        if (i === 0 && r.check) {
          const td = el('td', 'check-cell');
          const box = el('input');
          box.type = 'checkbox';
          box.checked = r.check.checked;
          box.disabled = r.check.disabled ?? false;
          box.dataset.check = r.check.key;
          box.title = r.check.label;
          box.setAttribute('aria-label', r.check.label);
          td.append(box);
          tr.append(td);
          return;
        }
        tr.append(el('td', NUM.test(c) ? 'num' : undefined, c));
      });
      body.append(tr);
    }
    table.append(body);
    wrap.append(table);
    card.append(wrap);
  }
  for (const f of s.footer ?? []) card.append(el('p', 'footer', f));
  return card;
}

/** Az Előkép bal oldali fejezetfája: a jegyzőkönyv kártyái, kattintásra odagörget. */
export function renderReportTree(tree: HTMLElement, resultsBox: HTMLElement): void {
  tree.replaceChildren();
  const cards = [...resultsBox.querySelectorAll<HTMLElement>(':scope > .card')];
  if (cards.length === 0) return;
  const ul = el('ul');
  cards.forEach((card, i) => {
    const title = card.dataset.role === 'cover' ? 'Előlap' : (card.querySelector('h3')?.textContent ?? `${i + 1}. szakasz`);
    const b = el('button', 'tree-item', title.replace(/\s*:\s*$/, ''));
    b.type = 'button';
    b.title = title;
    b.addEventListener('click', () => {
      card.scrollIntoView({ block: 'start' });
      for (const x of tree.querySelectorAll('.tree-item')) x.classList.toggle('current', x === b);
    });
    const li = el('li');
    li.append(b);
    ul.append(li);
  });
  tree.append(ul);
}

/** „Táblázatok (.csv)” gomb: a megadott szakaszok mentése táblázatkezelőbe. */
export function csvButton(baseName: string, sections: () => Section[]): HTMLButtonElement {
  const b = el('button', undefined, 'Táblázatok (.csv)');
  b.type = 'button';
  b.title = 'A táblázatok mentése táblázatkezelőbe (pontosvesszős CSV, UTF-8)';
  b.addEventListener('click', () => download(csvFileName(baseName), sectionsToCsv(sections()), 'text/csv'));
  return b;
}
