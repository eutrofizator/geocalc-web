import { EN, EN_PATTERNS } from './i18n-en';
import { storage } from './ui';

/**
 * A felület nyelve: magyar (alap) vagy angol. A program magyarul épül fel; angol nyelvnél a DOM
 * szövegeit és a title/placeholder/aria-label attribútumokat a szótár (i18n-en.ts) cseréli, a később
 * megjelenő tartalmat MutationObserver fordítja. A jegyzőkönyvek (.results), a beviteli mezők és a
 * táblázatok adatcellái magyarok maradnak – azok mérési adatok, illetve hivatalos dokumentáció.
 */

export type Lang = 'hu' | 'en';

const KEY = 'geocalc-web.lang';
const ATTRS = ['title', 'placeholder', 'aria-label'] as const;
const SKIP = 'textarea, pre, code, td, .results, .report-tree, [translate="no"]';

export function getLang(): Lang {
  return storage.get(KEY) === 'en' ? 'en' : 'hu';
}

/** A nyelv váltása: a felület az újratöltéssel épül fel az új nyelven. */
export function setLang(l: Lang): void {
  if (l === getLang()) return;
  storage.set(KEY, l);
  location.reload();
}

export function toggleLang(): void {
  setLang(getLang() === 'en' ? 'hu' : 'en');
}

/** Egy magyar felirat angolul (ha a szótárban nincs, változatlan). */
export function tr(text: string): string {
  if (getLang() !== 'en') return text;
  return translate(text) ?? text;
}

function translate(text: string): string | null {
  const key = text.replace(/\s+/g, ' ').trim();
  if (key === '') return null;
  const hit = EN[key];
  if (hit !== undefined) return hit;
  for (const [re, to] of EN_PATTERNS) {
    const m = key.match(re);
    if (m) return typeof to === 'string' ? key.replace(re, to) : to(m);
  }
  return null;
}

function translateText(node: Text): void {
  const raw = node.data;
  const out = translate(raw);
  if (out === null) return;
  const lead = raw.match(/^\s*/)![0];
  const trail = raw.match(/\s*$/)![0];
  const next = lead + out + trail;
  if (next !== raw) node.data = next;
}

function translateAttrs(e: Element): void {
  for (const a of ATTRS) {
    const v = e.getAttribute(a);
    if (v === null) continue;
    const out = translate(v);
    if (out !== null && out !== v) e.setAttribute(a, out);
  }
}

function skipped(e: Element | null): boolean {
  return e !== null && e.closest(SKIP) !== null;
}

function translateTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!skipped(root.parentElement)) translateText(root as Text);
    return;
  }
  if (!(root instanceof Element) || skipped(root)) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n instanceof Element && skipped(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n as Text);
    else translateAttrs(n as Element);
  }
}

export function initI18n(): void {
  const lang = getLang();
  document.documentElement.lang = lang;
  if (lang !== 'en') return;

  const title = translate(document.title);
  if (title !== null) document.title = title;
  translateTree(document.body);

  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translateTree(r.target);
      else if (r.type === 'attributes') {
        if (r.target instanceof Element && !skipped(r.target)) translateAttrs(r.target);
      } else r.addedNodes.forEach(translateTree);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  new MutationObserver(() => {
    const t = translate(document.title);
    if (t !== null && t !== document.title) document.title = t;
  }).observe(document.querySelector('title')!, { childList: true, characterData: true, subtree: true });

  // A megerősítő és figyelmeztető ablakok szövege is
  const confirm0 = window.confirm.bind(window);
  const alert0 = window.alert.bind(window);
  const prompt0 = window.prompt.bind(window);
  window.confirm = (m?: string) => confirm0(m === undefined ? m : tr(m));
  window.alert = (m?: unknown) => alert0(typeof m === 'string' ? tr(m) : m);
  window.prompt = (m?: string, d?: string) => prompt0(m === undefined ? m : tr(m), d);
}
