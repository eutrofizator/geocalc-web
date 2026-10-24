import { $, el } from './ui';

/* ------------------------------------------------------------------ *
 * Munkalapok – a valódi program ikonsávja és munkalapjai (súgó 3. o.)
 * ------------------------------------------------------------------ */

export interface Sheet {
  id: string;
  /** A munkalap teljes neve, ahogy a valódi program súgója és ikonsávja nevezi. */
  caption: string;
  icon: string;
  /** Meglévő munkalap azonosítója; ha nincs, helyettesítő lap készül. */
  win?: string;
  /** A helyettesítő munkalap ismertetése (a súgóból). */
  desc?: string;
}

export const SHEETS: Sheet[] = [
  { id: 'about', caption: 'Beállítások/Névjegy', icon: '#i-help', win: 'win-about' },
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
  { id: 'geo-convert', caption: 'Adatcsere/Földrajzi koordináták konvertálása', icon: '#i-globe', win: 'win-geo-convert' },
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
  { id: 'general-settings', caption: 'Beállítások/Általános beállítások', icon: '#i-gear', win: 'win-general-settings' },
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
      'A Beállítások menü „Munkamenet mentése…”/„Munkamenet betöltése…” parancsa a teljes munkaterületet egyetlen .gcs ' +
      'fájlba gyűjti (minden munkalap beállítása és tartalma), a „Táblázatok (.csv)” gombok pedig a jegyzőkönyv ' +
      'táblázatait adják táblázatkezelőbe (pontosvesszős, UTF-8-as CSV).',
  },
];

/* ------------------------------------------------------------------ *
 * Navigátor – a valódi program bal oldali, lenyitható modulpanele
 * (a GeoCalc 3.5 képernyőképei és a súgó 5–10. oldala szerint)
 * ------------------------------------------------------------------ */

export interface NavPage {
  /** A navigátor-pont egyedi azonosítója. */
  id: string;
  /** A felirat a navigátorban és a munkalap fejlécében. */
  label: string;
  /** A megnyitandó munkalap. */
  sheet: string;
  /** A munkalapon belül ehhez az elemhez görget (pl. a hálózat részfeladatai). */
  focus?: string;
}

export interface NavGroup {
  label: string;
  /** A kiemelt (sötét fejlécű) csoport – a valódi programban a Beállítások. */
  special?: boolean;
  pages: NavPage[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Adatrögzítő',
    pages: [
      { id: 'rc-data', label: 'Mérési adatok - koordináták', sheet: 'coords' },
      { id: 'rc-manual', label: 'Manuális adatbevitel', sheet: 'recorder', focus: 'rc-manual' },
      { id: 'rc-settings', label: 'Beállítások', sheet: 'recorder' },
    ],
  },
  {
    label: 'Geodéziai számítások',
    pages: [
      { id: 'gs-work', label: 'Munkaterület', sheet: 'calc' },
      { id: 'gs-desc', label: 'Adatleíró', sheet: 'descriptor' },
      { id: 'gs-settings', label: 'Beállítások', sheet: 'settings' },
    ],
  },
  {
    label: 'Hálózatkiegyenlítés',
    pages: [
      { id: 'net-work', label: 'Munkaterület', sheet: 'network' },
      { id: 'net-pre', label: 'Előzetes számítások', sheet: 'network', focus: 'net-traverse' },
      { id: 'net-hor', label: 'Vízszintes kiegyenlítés', sheet: 'network', focus: 'net-excl-count' },
      { id: 'net-ver', label: 'Magassági kiegyenlítés', sheet: 'network', focus: 'net-results' },
      { id: 'net-det', label: 'Részletpontok számítása', sheet: 'network', focus: 'net-details-on' },
      { id: 'net-settings', label: 'Beállítások', sheet: 'network-settings' },
    ],
  },
  {
    label: 'Térbeli transzformáció',
    pages: [
      { id: 'tr-params', label: 'Transzformációs paraméterek', sheet: 'transform' },
      { id: 'tr-apply', label: 'Átszámítás', sheet: 'transform-apply' },
      { id: 'tr-settings', label: 'Beállítások', sheet: 'transform-apply', focus: 'ta-params' },
    ],
  },
  {
    label: 'Adatcsere',
    pages: [
      { id: 'ex-coords', label: 'Koordináta kezelő', sheet: 'exchange-coords' },
      { id: 'ex-geo', label: 'Földrajzi koordináták konvertálása', sheet: 'geo-convert' },
      { id: 'ex-file', label: 'Koordináta állomány létrehozása', sheet: 'exchange-file' },
      { id: 'ex-akg', label: 'AKG jegyzőkönyv kezelése', sheet: 'exchange-akg' },
    ],
  },
  {
    label: 'Beállítások',
    special: true,
    pages: [
      { id: 'set-general', label: 'Általános beállítások', sheet: 'general-settings' },
      { id: 'set-help', label: 'Súgó', sheet: 'help' },
      { id: 'set-about', label: 'Névjegy', sheet: 'about' },
    ],
  },
];

const navPages = (): { group: NavGroup; page: NavPage }[] => NAV.flatMap((group) => group.pages.map((page) => ({ group, page })));

/** A munkalap alapértelmezett navigátor-pontja: amelyiknek a felirata a munkalap nevének vége. */
function defaultNavFor(sheetId: string): { group: NavGroup; page: NavPage } | undefined {
  const all = navPages().filter((x) => x.page.sheet === sheetId);
  const caption = SHEETS.find((s) => s.id === sheetId)?.caption ?? '';
  return all.find((x) => !x.page.focus && caption.endsWith(x.page.label)) ?? all.find((x) => !x.page.focus) ?? all[0];
}

/** A valódi program ikonsávjának 15 parancsa, abban a sorrendben, ahogy a súgó listázza. */
type ToolItem = { kind: 'action'; id: string; caption: string; icon: string } | { kind: 'sheet'; id: string } | { kind: 'sep' };

export const TOOLBAR: ToolItem[] = [
  { kind: 'action', id: 'settings-save', caption: 'Általános beállítások mentése', icon: '#i-save' },
  { kind: 'sep' },
  { kind: 'action', id: 'db-open', caption: 'Adatbázis beolvasása', icon: '#i-folder-open' },
  { kind: 'action', id: 'db-save', caption: 'Adatbázis mentése konvertálás után', icon: '#i-database' },
  { kind: 'sep' },
  { kind: 'sheet', id: 'coords' },
  { kind: 'sheet', id: 'recorder' },
  { kind: 'sep' },
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
 * Menük – a valódi program menüsora a hat modul szerint
 * ------------------------------------------------------------------ */

export interface MenuItem {
  label: string;
  /** Munkalap megnyitása. */
  sheet?: string;
  /** Navigátor-pont megnyitása (a munkalapon belüli részfeladathoz). */
  nav?: string;
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

const navItems = (group: string): MenuItem[] =>
  (NAV.find((g) => g.label === group)?.pages ?? []).map((p) => ({ label: p.label, nav: p.id }));

export const MENUS: Menu[] = [
  { label: 'Adatrögzítő', items: navItems('Adatrögzítő') },
  {
    label: 'Geodéziai számítások',
    items: [
      ...navItems('Geodéziai számítások'),
      { label: '', sep: true },
      { label: 'Új munkaterület', action: 'new', accel: 'Ctrl+N' },
      { label: 'Megnyitás…', action: 'open', accel: 'Ctrl+O' },
      { label: 'Mentés .gcd állományba', action: 'save', accel: 'Ctrl+S' },
      { label: '', sep: true },
      { label: 'Számítás futtatása', action: 'run', accel: 'F5' },
      { label: 'Kód beszúrása', codes: true },
      { label: 'Minden kijelölése', action: 'select-all', accel: 'Ctrl+A' },
    ],
  },
  { label: 'Hálózatkiegyenlítés', items: navItems('Hálózatkiegyenlítés') },
  { label: 'Térbeli transzformáció', items: navItems('Térbeli transzformáció') },
  {
    label: 'Adatcsere',
    items: [
      ...navItems('Adatcsere'),
      { label: '', sep: true },
      { label: 'Adatbázis beolvasása…', action: 'db-open' },
      { label: 'Adatbázis mentése konvertálás után…', action: 'db-save' },
    ],
  },
  {
    label: 'Beállítások',
    items: [
      { label: 'Általános beállítások', nav: 'set-general' },
      { label: 'Beállítások mentése', action: 'settings-save' },
      { label: '', sep: true },
      { label: 'Munkamenet mentése…', action: 'session-save' },
      { label: 'Munkamenet betöltése…', action: 'session-load' },
      { label: '', sep: true },
      { label: 'Nyomtatás…', action: 'print', accel: 'Ctrl+P' },
      { label: '', sep: true },
      { label: 'Súgó', nav: 'set-help', accel: 'F1' },
      { label: 'Névjegy', nav: 'set-about' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * A burok (menüsor + ikonsáv + navigátor + munkalap + állapotsor)
 * ------------------------------------------------------------------ */

export interface Shell {
  open(sheetId: string): void;
  /** Navigátor-pont megnyitása (munkalap + fejléc + görgetés a részfeladathoz). */
  openNav(navId: string): void;
  hide(sheetId: string): void;
  active(): string | null;
  isOpen(sheetId: string): boolean;
  setHint(text: string): void;
  setCounts(text: string): void;
  /** Értesítés, ha egy munkalap láthatóvá válik (a nézet frissítéséhez). */
  onShow(cb: (sheetId: string) => void): void;
}

const sheet = (id: string): Sheet => SHEETS.find((s) => s.id === id) ?? { id, caption: id, icon: '#i-help' };

/** Új munkalap váza: fejléc („Modul / Lap”) és törzs. A törzset a hívó tölti fel. */
export function createPage(id: string, caption: string): { win: HTMLElement; body: HTMLElement } {
  const win = el('section', 'mdiwin');
  win.id = `win-${id}`;
  win.hidden = true;
  win.setAttribute('aria-label', caption);
  const title = el('div', 'mdiwin-title');
  title.append(el('span', 'mdiwin-caption', caption));
  const body = el('div', 'mdiwin-body');
  win.append(title, body);
  $('mdi').append(win);
  return { win, body };
}

/** Helyettesítő munkalap: megmondja, mit tud a valódi program, és mi készül még. */
function buildPlaceholder(s: Sheet): HTMLElement {
  const { win, body } = createPage(s.id, s.caption);
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
  return win;
}

const CHEVRON_UP = '˄';
const CHEVRON_DOWN = '˅';
const NAV_KEY = 'geocalc-web.nav';

export function initShell(actions: Record<string, (arg?: string) => void>): Shell {
  const mdi = $('mdi');
  const menubar = $('menubar');
  const toolbar = $('toolbar');
  const nav = $('navigator');
  const sbHint = $('sb-hint');
  const sbCounts = $('sb-counts');
  const sbView = $('sb-view');

  let activeId: string | null = null;
  let activeNav: string | null = null;
  const showCbs: ((id: string) => void)[] = [];
  let openMenu: HTMLElement | null = null;

  /* ---------- munkalapok (egyszerre egy látszik, mint a valódi programban) ---------- */

  function winOf(id: string): HTMLElement | null {
    return document.getElementById(`win-${id}`);
  }

  function ensureWin(s: Sheet): HTMLElement {
    return winOf(s.id) ?? buildPlaceholder(s);
  }

  function setHeader(w: HTMLElement, group: string, page: string): void {
    const cap = w.querySelector('.mdiwin-caption');
    if (cap) cap.textContent = group ? `${group} / ${page}` : page;
  }

  function show(id: string, entry: { group: NavGroup; page: NavPage } | undefined): void {
    const s = sheet(id);
    const w = ensureWin(s);
    for (const other of mdi.querySelectorAll<HTMLElement>('.mdiwin')) {
      const on = other === w;
      other.hidden = !on;
      other.classList.toggle('active', on);
    }
    activeId = id;
    activeNav = entry?.page.id ?? null;
    if (entry) setHeader(w, entry.group.label, entry.page.label);
    else setHeader(w, '', s.caption);
    sbView.textContent = s.caption;
    document.body.dataset.sheet = id;
    markNav();
    for (const cb of showCbs) cb(id);

    const target = entry?.page.focus ? document.getElementById(entry.page.focus) : null;
    if (target) {
      // A részfeladat (pl. Manuális adatbevitel) a munkalapon belül: odagörgetünk, és ha lenyitható, kinyitjuk.
      const details = target.closest('details');
      if (details && !details.open) details.open = true;
      if (target instanceof HTMLDetailsElement) target.open = true;
      target.scrollIntoView({ block: 'start' });
      target.classList.add('flash');
      window.setTimeout(() => target.classList.remove('flash'), 900);
    } else {
      const body = w.querySelector<HTMLElement>('.mdiwin-body');
      body?.scrollTo?.({ top: 0 });
      const first =
        w.querySelector<HTMLElement>('[data-autofocus]') ??
        w.querySelector<HTMLElement>('textarea, input, select, button, [tabindex]');
      first?.focus({ preventScroll: true });
    }
  }

  function open(id: string): void {
    show(id, defaultNavFor(id));
  }

  function openNav(navId: string): void {
    const entry = navPages().find((x) => x.page.id === navId);
    if (entry) show(entry.page.sheet, entry);
  }

  function hide(id: string): void {
    if (activeId === id) open('about');
  }

  /* ---------- navigátor ---------- */

  let collapsed: Record<string, boolean> = {};
  try {
    collapsed = JSON.parse(localStorage.getItem(NAV_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    collapsed = {};
  }
  const saveCollapsed = () => {
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify(collapsed));
    } catch {
      /* a tárolás nem kötelező */
    }
  };

  for (const group of NAV) {
    const box = el('div', group.special ? 'nav-group special' : 'nav-group');
    const head = el('button', 'nav-head');
    head.type = 'button';
    const isCollapsed = () => collapsed[group.label] === true;
    const chevron = el('span', 'nav-chevron');
    head.append(el('span', 'nav-head-label', group.label), chevron);
    const list = el('div', 'nav-items');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', group.label);
    const sync = () => {
      const c = isCollapsed();
      list.hidden = c;
      chevron.textContent = c ? CHEVRON_DOWN : CHEVRON_UP;
      head.setAttribute('aria-expanded', String(!c));
      head.title = c ? `${group.label} – kinyitás` : `${group.label} – összecsukás`;
    };
    head.addEventListener('click', () => {
      collapsed[group.label] = !isCollapsed();
      saveCollapsed();
      sync();
    });
    for (const page of group.pages) {
      const item = el('button', 'nav-item', page.label);
      item.type = 'button';
      item.dataset.nav = page.id;
      item.addEventListener('click', () => openNav(page.id));
      list.append(item);
    }
    sync();
    box.append(head, list);
    nav.append(box);
  }

  function markNav(): void {
    for (const b of nav.querySelectorAll<HTMLElement>('.nav-item')) {
      const on = b.dataset.nav === activeNav;
      b.classList.toggle('current', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
  }

  // A navigátor és a munkalap közötti elválasztó: a kis nyíllal a navigátor elrejthető.
  const splitter = $('nav-splitter');
  const toggleNav = () => {
    const hidden = document.body.classList.toggle('nav-hidden');
    splitter.setAttribute('aria-expanded', String(!hidden));
    splitter.title = hidden ? 'A modulpanel megjelenítése' : 'A modulpanel elrejtése';
  };
  splitter.addEventListener('click', toggleNav);

  /* ---------- menüsor ---------- */

  function closeMenus(): void {
    for (const m of document.querySelectorAll('.menu-drop')) m.remove();
    for (const b of menubar.querySelectorAll('button')) b.classList.remove('open');
    openMenu = null;
  }

  function runItem(item: MenuItem): void {
    if (item.nav) openNav(item.nav);
    else if (item.sheet) open(item.sheet);
    else if (item.action) actions[item.action]?.();
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
      node.append(el('span', 'menu-arrow', '▸'));
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
      runItem(item);
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
    for (const item of menu.items) {
      const node = menuItemNode(item);
      if (item.nav && item.nav === activeNav) node.classList.add('checked');
      drop.append(node);
    }
    button.append(drop);
    openMenu = drop;
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
    } else if (e.key === 'F1') {
      e.preventDefault();
      openNav('set-help');
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
    b.dataset.tool = item.id;
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

  /* ---------- állapotsor: dátum és óra, mint a valódi programban ---------- */

  const sbDate = $('sb-date');
  const sbTime = $('sb-time');
  const pad = (n: number) => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    sbDate.textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    sbTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  tick();
  window.setInterval(tick, 1000);

  return {
    open,
    openNav,
    hide,
    active: () => activeId,
    isOpen: (id) => activeId === id,
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

/** A geodéziai kódok a Geodéziai számítások ▸ Kód beszúrása almenühöz (a main.ts tölti fel). */
let codeProvider: () => { id: string; name: string }[] = () => [];
export function setCodeProvider(fn: () => { id: string; name: string }[]): void {
  codeProvider = fn;
}
function codeSheets(): { id: string; name: string }[] {
  return codeProvider();
}
