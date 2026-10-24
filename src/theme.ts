import { storage } from './ui';

/**
 * Megjelenés: világos (a GeoCalc 3.5 színei), sötét, vagy a rendszer beállítása szerint. A választott
 * téma a `<html data-theme>` attribútumába kerül; a sötét téma tokenjei a `style.css` végén vannak.
 */

export type Theme = 'light' | 'dark' | 'auto';

const KEY = 'geocalc-web.theme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getTheme(): Theme {
  const v = storage.get(KEY);
  return v === 'dark' || v === 'auto' ? v : 'light';
}

/** A ténylegesen alkalmazott téma (az „auto” a rendszer beállítása szerint). */
export function resolvedTheme(t: Theme = getTheme()): 'light' | 'dark' {
  return t === 'auto' ? (media?.matches ? 'dark' : 'light') : t;
}

export function applyTheme(t: Theme = getTheme()): void {
  document.documentElement.dataset.theme = resolvedTheme(t);
}

export function setTheme(t: Theme): void {
  storage.set(KEY, t);
  applyTheme(t);
}

/** Világos ↔ sötét váltás (a menüből). */
export function toggleTheme(): Theme {
  const next: Theme = resolvedTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function initTheme(): void {
  applyTheme();
  media?.addEventListener('change', () => {
    if (getTheme() === 'auto') applyTheme('auto');
  });
}
