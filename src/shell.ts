import { $, el } from './ui';

/* ------------------------------------------------------------------ *
 * Munkalapok – a valódi program ikonsávja és munkalapjai (súgó 3. o.)
 * ------------------------------------------------------------------ */

export interface Sheet {
  id: string;
  /** A munkalap teljes neve, ahogy a valódi program címsorában áll. */
  caption: string;
  icon: string;
  /** Meglévő munkalap-ablak azonosítója; ha nincs, helyettesítő ablak készül. */
  win?: string;
  /** A helyettesítő munkalap ismertetése (a súgóból). */
  desc?: string;
}

export const SHEETS: Sheet[] = [
  {
    id: 'coords',
    caption: 'Mérési adatok és koordináták',
    icon: '#i-table',
    win: 'win-coords',
  },
  {
    id: 'recorder',
    caption: 'Adatrögzítő/Beállítások',
    icon: '#i-reader',
    win: 'win-recorder',
  },
  { id: 'calc', caption: 'Geodéziai számítások/Munkaterület', icon: '#i-calculator', win: 'win-calc' },
  {
    id: 'descriptor',
    caption: 'Geodéziai számítások/Adatleíró',
    icon: '#i-form',
    win: 'win-descriptor',
  },
  {
    id: 'settings',
    caption: 'Geodéziai számítások/Beállítások',
    icon: '#i-gear',
    win: 'win-settings',
  },
  { id: 'network', caption: 'Hálózatkiegyenlítés/Munkaterület', icon: '#i-network', win: 'win-network' },
  {
    id: 'network-settings',
    caption: 'Hálózatkiegyenlítés/Beállítások',
    icon: '#i-gear',
    win: 'win-network-settings',
  },
  {
    id: 'transform',
    caption: 'Térbeli transzformáció/Transzformációs paraméterek számítása',
    icon: '#i-axes',
    win: 'win-transform',
  },
  {
    id: 'transform-apply',
    caption: 'Térbeli transzformáció/Átszámítás',
    icon: '#i-swap',
    win: 'win-transform-apply',
  },
  {
    id: 'exchange-coords',
    caption: 'Adatcsere/Koordináta kezelő',
    icon: '#i-table',
    win: 'win-exchange-coords',
  },
  {
    id: 'exchange-file',
    caption: 'Adatcsere/Koordináta állomány készítése',
    icon: '#i-file-text',
    win: 'win-exchange-file',
  },
  {
    id: 'exchange-akg',
    caption: 'Adatcsere/AKG jegyzőkönyv készítése',
    icon: '#i-check-square',
    win: 'win-exchange-akg',
  },
  {
    id: 'help',
    caption: 'Súgó',
    icon: '#i-help',
    desc:
      'A valódi GeoCalc 3.5 teljes súgója (4791 sor) a docs/sugo_geocalc35.txt állományban olvasható: ' +
      'rendszerkövetelmények, a 6 modul leírása, a 18 geodéziai számítás pontos kódolása és mintapéldái, ' +
      'az adatrögzítő-formátumok, a hálózatkiegyenlítés és a térbeli transzformáció. ' +
      'Gyorsbillentyűk: F5 vagy Ctrl+Enter – számítás futtatása; Ctrl+N – új munkaterület; Ctrl+O – megnyitás; ' +
      'Ctrl+S – mentés .gcd állományba; Ctrl+P – nyomtatás; Ctrl+A – minden kijelölése; F10 – menüsor; Esc – menü bezárása. ' +
      'A Fájl menü „Munkamenet mentése…”/„Munkamenet betöltése…” parancsa a teljes munkaterületet egyetlen .gcs ' +
      'fájlba gyűjti (minden munkalap beállítása és tartalma), a „Táblázatok (.csv)” gombok pedig a jegyzőkönyv ' +
      'táblázatait adják táblázatkezelőbe (pontosvesszős, UTF-8-as CSV).',
  },
];

/** A valódi program ikonsávjának 15 parancsa, abban a sorrendben, ahogy a súgó listázza. */
type ToolItem = { kind: 'action'; id: string; caption: string; icon: string } | { kind: 'sheet'; id: string } | { kind: 'sep' };

export const TOOLBAR: ToolItem[] = [
  { kind: 'action', id: 'settings-save', caption: 'Általános beállítások mentése', icon: '#i-save' },
  { kind: 'action', id: 'db-open', caption: 'Adatbázis beolvasása', icon: '#i-database' },
  { kind: 'action', id: 'db-save', caption: 'Adatbázis mentése konvertálás után', icon: '#i-database' },
  { kind: 'sep' },
  { kind: 'sheet', id: 'coords' },
  { kind: 'sep' },
  { kind: 'sheet', id: 'recorder' },
  { kind: 'sheet', id: 'calc' },
  { kind: 'sheet', id: 'descriptor' },
  { kind: 'sep' },
  { kind: 'sheet', id: 'network' },
  { kind: 'sheet', id: 'network-settings' },
  { kind: 'sep' },
  { kind: 'sheet', id: 'transform' },
  { kind: 'sheet', id: 'transform-apply' },
  { kind: 'sep' },
  { kind: 'sheet', id: 'exchange-coords' },
  { kind: 'sheet', id: 'exchange-file' },
  { kind: 'sheet', id: 'exchange-akg' },
  { kind: 'sep' },
  { kind: 'sheet', id: 'help' },
];

/* ------------------------------------------------------------------ *
 * Menük
 * ------------------------------------------------------------------ */

export interface MenuItem {
  label: string;
  /** Munkalap megnyitása. */
  sheet?: string;
  /** Névvel azonosított művelet, amit a main.ts regisztrál. */
  action?: string;
  accel?: string;
  sep?: boolean;
  /** Almenü a 18 geodéziai kódhoz. */
  codes?: boolean;
}

export interface Menu {
  label: string;
  items: MenuItem[];
}

export const MENUS: Menu[] = [
  {
    label: 'Fájl',
    items: [
      { label: 'Új munkaterület', action: 'new', accel: 'Ctrl+N' },
      { label: 'Megnyitás…', action: 'open', accel: 'Ctrl+O' },
      { label: 'Mentés .gcd állományba', action: 'save', accel: 'Ctrl+S' },
      { label: '', sep: true },
      { label: 'Munkamenet mentése…', action: 'session-save' },
      { label: 'Munkamenet betöltése…', action: 'session-load' },
      { label: '', sep: true },
      { label: 'Adatbázis beolvasása…', action: 'db-open' },
      { label: 'Adatbázis mentése konvertálás után…', action: 'db-save' },
      { label: '', sep: true },
      { label: 'Nyomtatás…', action: 'print', accel: 'Ctrl+P' },
    ],
  },
  {
    label: 'Szerkesztés',
    items: [
      { label: 'Minden kijelölése', action: 'select-all', accel: 'Ctrl+A' },
      { label: 'Kód beszúrása', codes: true },
    ],
  },
  {
    label: 'Számítás',
    items: [
      { label: 'Munkaterület', sheet: 'calc' },
      { label: 'Adatleíró', sheet: 'descriptor' },
      { label: '', sep: true },
      { label: 'Számítás futtatása', action: 'run', accel: 'F5' },
    ],
  },
  {
    label: 'Hálózat',
    items: [
      { label: 'Munkaterület', sheet: 'network' },
      { label: 'Beállítások', sheet: 'network-settings' },
      { label: 'Mérési adatok és koordináták', sheet: 'coords' },
    ],
  },
  {
    label: 'Transzformáció',
    items: [
      { label: 'Transzformációs paraméterek számítása', sheet: 'transform' },
      { label: 'Átszámítás', sheet: 'transform-apply' },
    ],
  },
  {
    label: 'Adatcsere',
    items: [
      { label: 'Koordináta kezelő', sheet: 'exchange-coords' },
      { label: 'Koordináta állomány készítése', sheet: 'exchange-file' },
      { label: 'AKG jegyzőkönyv készítése', sheet: 'exchange-akg' },
    ],
  },
  {
    label: 'Beállítások',
    items: [
      { label: 'Általános beállítások…', sheet: 'settings' },
      { label: 'Általános beállítások mentése', action: 'settings-save' },
      { label: 'Adatrögzítő', sheet: 'recorder' },
      { label: 'Hálózatkiegyenlítés', sheet: 'network-settings' },
    ],
  },
  { label: 'Ablak', items: [] },
  {
    label: 'Súgó',
    items: [
      { label: 'Súgó', sheet: 'help' },
      { label: '', sep: true },
      { label: 'A programról…', action: 'about' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * A burok (menüsor + ikonsáv + MDI + állapotsor)
 * ------------------------------------------------------------------ */

export interface Shell {
  open(sheetId: string): void;
  hide(sheetId: string): void;
  active(): string | null;
  isOpen(sheetId: string): boolean;
  setHint(text: string): void;
  setCounts(text: string): void;
  /** Értesítés, ha egy munkalap láthatóvá válik (a nézet frissítéséhez). */
  onShow(cb: (sheetId: string) => void): void;
}

const sheet = (id: string): Sheet => SHEETS.find((s) => s.id === id) ?? { id, caption: id, icon: '#i-help' };

/** Helyettesítő munkalap ablaka: megmondja, mit tud a valódi program, és mi készül még. */
function buildPlaceholder(s: Sheet): HTMLElement {
  const win = el('section', 'mdiwin');
  win.id = `win-${s.id}`;
  win.hidden = true;
  win.setAttribute('aria-label', s.caption);

  const title = el('div', 'mdiwin-title');
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'mdiwin-icon');
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', s.icon);
  icon.append(use);
  title.append(icon, el('span', 'mdiwin-caption', s.caption), titleButtons());

  const body = el('div', 'mdiwin-body');
  const pane = el('div', 'pane');
  pane.append(el('h2', undefined, s.caption));
  if (s.desc) pane.append(el('p', undefined, s.desc));
  pane.append(
    el(
      'p',
      'hint',
      'Ez a munkalap a valódi GeoCalc 3.5-ben működik; a GEOkalkulusban még nem érhető el. ' +
        'A modul tartalma a súgó (docs/sugo_geocalc35.txt) alapján készül el.',
    ),
  );
  body.append(pane);
  win.append(title, body);
  return win;
}

function titleButtons(): HTMLElement {
  const box = el('div', 'mdiwin-buttons');
  for (const [act, glyph, label] of [
    ['min', '\u2013', 'Kicsinyítés'],
    ['max', '\u25a1', 'Nagyítás'],
    ['close', '\u2715', 'Bezárás'],
  ] as const) {
    const b = el('button', undefined, glyph);
    b.type = 'button';
    b.dataset.act = act;
    b.setAttribute('aria-label', label);
    box.append(b);
  }
  return box;
}

export function initShell(actions: Record<string, (arg?: string) => void>): Shell {
  const mdi = $('mdi');
  const menubar = $('menubar');
  const toolbar = $('toolbar');
  const sbHint = $('sb-hint');
  const sbCounts = $('sb-counts');
  const sbView = $('sb-view');

  const order: string[] = [];
  let activeId: string | null = null;
  const showCbs: ((id: string) => void)[] = [];
  let openMenu: HTMLElement | null = null;

  /* ---------- MDI ---------- */

  function winOf(id: string): HTMLElement | null {
    return document.getElementById(`win-${id}`);
  }

  function ensureWin(s: Sheet): HTMLElement {
    let w = winOf(s.id);
    if (!w) {
      w = buildPlaceholder(s);
      mdi.append(w);
      w.querySelector('.mdiwin-title')?.addEventListener('pointerdown', (e) => startDrag(e, w!));
      w.querySelector('.mdiwin-buttons')?.addEventListener('click', (e) => {
        const act = (e.target as HTMLElement).closest('button')?.dataset.act;
        if (act === 'min') hide(s.id);
        else if (act === 'close') hide(s.id);
        else if (act === 'max') toggleMax(s.id);
        e.stopPropagation();
      });
    }
    return w;
  }

  function activate(id: string): void {
    for (const w of mdi.querySelectorAll<HTMLElement>('.mdiwin')) {
      const on = w.id === `win-${id}`;
      w.classList.toggle('active', on);
      const t = w.querySelector('.mdiwin-title');
      t?.setAttribute('aria-hidden', String(!on));
    }
    activeId = id;
    const w = winOf(id);
    if (w) {
      for (const other of mdi.querySelectorAll<HTMLElement>('.mdiwin')) other.style.zIndex = '1';
      w.style.zIndex = '2';
      const first =
        w.querySelector<HTMLElement>('[data-autofocus]') ??
        w.querySelector<HTMLElement>('textarea, input, select, button, [tabindex]');
      first?.focus({ preventScroll: true });
    }
    sbView.textContent = sheet(id).caption;
    document.body.dataset.sheet = id;
    rebuildWindowMenu();
  }

  function open(id: string): void {
    const s = sheet(id);
    const w = ensureWin(s);
    w.hidden = false;
    if (!w.dataset.mode) {
      w.dataset.mode = 'max';
      w.classList.add('maximized');
    }
    if (!order.includes(id)) order.push(id);
    activate(id);
    for (const cb of showCbs) cb(id);
  }

  function hide(id: string): void {
    const w = winOf(id);
    if (w) w.hidden = true;
    const i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
    if (activeId === id) {
      activeId = null;
      const next = order[order.length - 1];
      if (next) {
        const nw = winOf(next);
        if (nw) nw.hidden = false;
        activate(next);
      } else {
        sbView.textContent = '';
        document.body.dataset.sheet = '';
        rebuildWindowMenu();
      }
    }
  }

  function toggleMax(id: string): void {
    const w = winOf(id);
    if (!w) return;
    if (w.dataset.mode === 'max') {
      w.dataset.mode = 'normal';
      w.classList.remove('maximized');
      const rect = mdi.getBoundingClientRect();
      const width = Math.max(360, Math.round(rect.width * 0.78));
      const height = Math.max(260, Math.round(rect.height * 0.78));
      w.style.left = `${Math.round((rect.width - width) / 2)}px`;
      w.style.top = `${Math.round((rect.height - height) / 2)}px`;
      w.style.width = `${width}px`;
      w.style.height = `${height}px`;
    } else {
      w.dataset.mode = 'max';
      w.classList.add('maximized');
      w.style.left = w.style.top = w.style.width = w.style.height = '';
    }
    activate(id);
  }

  function startDrag(e: Event, w: HTMLElement): void {
    if (w.dataset.mode === 'max') return;
    const pe = e as PointerEvent;
    if ((pe.target as HTMLElement).closest('.mdiwin-buttons')) return;
    const rect = w.getBoundingClientRect();
    const host = mdi.getBoundingClientRect();
    const dx = pe.clientX - rect.left;
    const dy = pe.clientY - rect.top;
    const move = (ev: PointerEvent) => {
      w.style.left = `${Math.max(0, Math.min(host.width - 80, ev.clientX - host.left - dx))}px`;
      w.style.top = `${Math.max(0, Math.min(host.height - 40, ev.clientY - host.top - dy))}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    activate(w.id.slice(4));
    pe.preventDefault();
  }

  /* ---------- menüsor ---------- */

  function closeMenus(): void {
    for (const m of document.querySelectorAll('.menu-drop')) m.remove();
    for (const b of menubar.querySelectorAll('button')) b.classList.remove('open');
    openMenu = null;
  }

  function menuItemNode(item: MenuItem): HTMLElement {
    if (item.sep) return el('div', 'menu-sep');
    const node = el('button', 'menu-item');
    node.type = 'button';
    node.setAttribute('role', 'menuitem');
    const label = el('span', 'menu-label', item.label);
    node.append(label);
    if (item.accel) node.append(el('span', 'menu-accel', item.accel));
    if (item.codes) {
      node.append(el('span', 'menu-arrow', '\u25b8'));
      const sub = el('div', 'menu-drop menu-sub');
      sub.setAttribute('role', 'menu');
      for (const code of codeSheets()) {
        const s = el('button', 'menu-item');
        s.type = 'button';
        s.setAttribute('role', 'menuitem');
        s.append(el('span', 'menu-label', `${code.id} – ${code.name}`));
        s.addEventListener('click', () => {
          closeMenus();
          actions['insert-code']?.(code.id);
        });
        sub.append(s);
      }
      node.append(sub);
      node.addEventListener('mouseenter', () => sub.classList.add('visible'));
      node.addEventListener('mouseleave', () => sub.classList.remove('visible'));
      return node;
    }
    node.addEventListener('click', () => {
      closeMenus();
      if (item.sheet) open(item.sheet);
      else if (item.action) actions[item.action]?.();
    });
    return node;
  }

  function openMenuFor(button: HTMLButtonElement, menu: Menu): void {
    closeMenus();
    button.classList.add('open');
    const drop = el('div', 'menu-drop');
    drop.setAttribute('role', 'menu');
    // A menüpont kattintása ne buborékoljon fel a menügombra, különben a lenyíló menü újranyílna.
    drop.addEventListener('click', (e) => e.stopPropagation());
    if (menu.label === 'Ablak') {
      if (order.length === 0) drop.append(el('div', 'menu-item disabled', '(nincs nyitott munkalap)'));
      for (const id of order) {
        const b = el('button', 'menu-item');
        b.type = 'button';
        b.setAttribute('role', 'menuitemradio');
        b.setAttribute('aria-checked', String(id === activeId));
        b.append(el('span', 'menu-check', id === activeId ? '\u2713' : ''), el('span', 'menu-label', sheet(id).caption));
        b.addEventListener('click', () => {
          closeMenus();
          const w = winOf(id);
          if (w) w.hidden = false;
          activate(id);
        });
        drop.append(b);
      }
      drop.append(el('div', 'menu-sep'));
      const casc = el('button', 'menu-item');
      casc.type = 'button';
      casc.append(el('span', 'menu-label', 'Egymás után'));
      casc.addEventListener('click', () => {
        closeMenus();
        cascade();
      });
      drop.append(casc);
    } else {
      for (const item of menu.items) drop.append(menuItemNode(item));
    }
    button.append(drop);
    openMenu = drop;
  }

  function cascade(): void {
    let i = 0;
    for (const id of order) {
      const w = winOf(id);
      if (!w) continue;
      w.dataset.mode = 'normal';
      w.classList.remove('maximized');
      w.hidden = false;
      w.style.left = `${24 + i * 26}px`;
      w.style.top = `${24 + i * 26}px`;
      w.style.width = '70%';
      w.style.height = '70%';
      i++;
    }
  }

  function rebuildWindowMenu(): void {
    // Az Ablak menü tartalma nyitáskor épül fel, ezért itt nincs teendő.
  }

  for (const menu of MENUS) {
    const button = el('button', 'menu-btn', menu.label);
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-haspopup', 'true');
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (button.classList.contains('open')) closeMenus();
      else openMenuFor(button, menu);
    });
    button.addEventListener('mouseenter', () => {
      if (openMenu && !button.classList.contains('open')) openMenuFor(button, menu);
    });
    button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenuFor(button, menu);
        openMenu?.querySelector<HTMLElement>('.menu-item')?.focus();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const buttons = [...menubar.querySelectorAll<HTMLElement>('.menu-btn')];
        const i = buttons.indexOf(button);
        buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
    });
    menubar.append(button);
  }
  document.addEventListener('pointerdown', (e) => {
    if (openMenu && !(e.target as HTMLElement).closest('.menu-drop, .menu-btn')) closeMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openMenu) closeMenus();
    else if (e.key === 'F10' || (e.altKey && e.key === 'Alt')) {
      e.preventDefault();
      menubar.querySelector<HTMLElement>('.menu-btn')?.focus();
    }
  });

  /* ---------- ikonsáv ---------- */

  for (const item of TOOLBAR) {
    if (item.kind === 'sep') {
      toolbar.append(el('span', 'tb-sep'));
      continue;
    }
    let caption: string;
    let icon: string;
    if (item.kind === 'sheet') {
      const sh = sheet(item.id);
      caption = sh.caption;
      icon = sh.icon;
    } else {
      caption = item.caption;
      icon = item.icon;
    }
    const b = el('button', 'tb-btn');
    b.type = 'button';
    b.title = caption;
    b.setAttribute('aria-label', caption);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tb-icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', icon);
    svg.append(use);
    b.append(svg);
    b.addEventListener('click', () => {
      if (item.kind === 'sheet') open(item.id);
      else actions[item.id]?.();
    });
    toolbar.append(b);
  }

  /* ---------- meglévő munkalap-ablakok ---------- */

  for (const w of mdi.querySelectorAll<HTMLElement>('.mdiwin')) {
    const id = w.id.replace(/^win-/, '');
    w.querySelector('.mdiwin-title')?.addEventListener('pointerdown', (e) => startDrag(e, w));
    w.querySelector('.mdiwin-buttons')?.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'min' || act === 'close') hide(id);
      else if (act === 'max') toggleMax(id);
      e.stopPropagation();
    });
  }

  return {
    open,
    hide,
    active: () => activeId,
    isOpen: (id) => winOf(id)?.hidden === false,
    setHint: (t) => {
      sbHint.textContent = t;
    },
    setCounts: (t) => {
      sbCounts.textContent = t;
    },
    onShow: (cb) => {
      showCbs.push(cb);
    },
  };
}

/** A geodéziai kódok a Szerkesztés ▸ Kód beszúrása almenühöz (a main.ts tölti fel). */
let codeProvider: () => { id: string; name: string }[] = () => [];
export function setCodeProvider(fn: () => { id: string; name: string }[]): void {
  codeProvider = fn;
}
function codeSheets(): { id: string; name: string }[] {
  return codeProvider();
}
