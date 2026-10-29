import { interiorPoint } from './dat';
import { landUseLabel, type DrawingElement } from './drawing';
import type { DxfEntity } from './dxf-writer';
import type { LayerKey } from './layers';
import type { FooterItem, JobKind, PlanTemplate } from './jobs';
import { fix } from './format';
import { distance, pointInRing, polygonArea, type Pt } from './geometry';
import type { NamedPt } from './parcel';
import { symbolPaths } from './symbols';
import type { Row, Section } from './types';

/**
 * Változási vázrajz, mérési vázlat, koordinátajegyzék és címkoordináták a 8/2018. (VI. 29.) AM
 * rendelet szerint:
 * - 15. melléklet: a földrészlethatár változásához készítendő változási vázrajz fejléce, térképi
 *   kivágata (megszűnő helyrajzi szám vastag vonallal áthúzva, új határ és új helyrajzi szám vastagon,
 *   címkoordináták) és lábrésze (záradékok, aláírások);
 * - 10. melléklet: a mérési vázlat (az új határok természetbeni méretei, a mért pontok, a záradék);
 * - 46. § (1) i): a koordinátajegyzék számsorrendben, alappontok / részletpontok / címkoordináták
 *   bontásban, EOV koordináták cm, címkoordináták m élességgel;
 * - 4. melléklet: a pontkód (1–2. jegy rendűség, 3. állandósítás, 4. határpont jellege; a
 *   címkoordináta 5411 generált, 5412 mérésből levezetett).
 * A vázrajz SVG-ben készül (A4 álló, mm egységben), a böngésző nyomtatási párbeszédével nyomtatható
 * vagy PDF-be menthető.
 */

/* ---------- pontok kiegészítő adatai ---------- */

export interface PointAttrs {
  /** Magasság (Z / M), ha a sorban szerepel. */
  m: number | null;
  /** Pontkód (4 jegyű, a 4. melléklet szerint), ha a sorban szerepel. */
  code: string;
}

/** A koordinátasorok 4. (magasság) és 5. (pontkód) oszlopa – pl. az ITR koordinátajegyzék formája. */
export function parsePointAttrs(text: string): Map<string, PointAttrs> {
  const out = new Map<string, PointAttrs>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const f = line.split(/[\s,;]+/);
    if (f.length < 3 || !Number.isFinite(Number(f[1]?.replace(',', '.')))) continue;
    const m = f[3] !== undefined && /^-?\d+([.,]\d+)?$/.test(f[3]) ? Number(f[3].replace(',', '.')) : null;
    const code = f[4] !== undefined && /^\d{4}$/.test(f[4]) ? f[4] : '';
    out.set(f[0]!, { m, code });
  }
  return out;
}

/* ---------- koordinátajegyzék ---------- */

export type PointGroup = 'base' | 'detail' | 'address';

/** A pont csoportja a pontkód első két jegye szerint (1–30 alappont, 54 címkoordináta, a többi részletpont). */
export function pointGroup(code: string): PointGroup {
  const r = Number(code.slice(0, 2));
  if (code.length === 4 && r >= 1 && r <= 30) return 'base';
  if (code.length === 4 && r === 54) return 'address';
  return 'detail';
}

const GROUP_TITLE: Record<PointGroup, string> = {
  base: 'Alappontok',
  detail: 'Részletpontok',
  address: 'Címkoordináták',
};

const byNumber = (a: string, b: string) => a.localeCompare(b, 'hu', { numeric: true });

export interface ListPoint extends NamedPt {
  m: number | null;
  code: string;
}

/**
 * Koordinátajegyzék (46. § (1) i)): csoportonként számsorrendben; az EOV koordináták cm, a
 * címkoordináták m élességgel. A szöveges változat tabulátorral tagolt: pontszám, Y, X, Z, pontkód.
 */
export function coordinateList(points: ListPoint[]): { text: string; sections: Section[] } {
  const groups: PointGroup[] = ['base', 'detail', 'address'];
  const lines: string[] = ['Pontszám\tY\tX\tZ\tPontkód'];
  const sections: Section[] = [];
  for (const g of groups) {
    const list = points.filter((p) => pointGroup(p.code) === g).sort((a, b) => byNumber(a.id, b.id));
    if (list.length === 0) continue;
    const d = g === 'address' ? 0 : 2;
    const rows: Row[] = list.map((p) => ({ cells: [p.id, fix(p.y, d), fix(p.x, d), p.m === null ? '' : fix(p.m, 2), p.code], role: 'result' }));
    for (const p of list) lines.push([p.id, fix(p.y, d), fix(p.x, d), p.m === null ? '0.00' : fix(p.m, 2), p.code].join('\t'));
    sections.push({
      kind: `coord-list-${g}`,
      title: `Koordinátajegyzék – ${GROUP_TITLE[g]}`,
      columns: ['Pontszám', 'Y [m]', 'X [m]', 'Z [m]', 'Pontkód'],
      rows,
      footer: g === 'address' ? ['A címkoordináták méter élességgel (46. § (1) i)).'] : undefined,
    });
  }
  return { text: `${lines.join('\r\n')}\r\n`, sections };
}

/* ---------- címkoordináták ---------- */

export interface AddressPoint extends NamedPt {
  hrsz: string;
  code: string;
}

/**
 * Generált címkoordináta (pontkód 5411) a földrészleten belül, méterre kerekítve; a pontszám az
 * előtag és a sorszám. A mérésből levezetett címkoordinátát (5412) a felhasználó adja meg.
 */
export function generateAddressPoints(
  parcels: { hrsz: string; ring: Pt[] }[],
  prefix: string,
  first = 1,
  /** A földhivatali DAT meglévő címkoordinátái: a földrészletbe esők mind maradnak (a földrészleté és az épületeké is). */
  existing: { code: string; y: number; x: number }[] = [],
): AddressPoint[] {
  const out: AddressPoint[] = [];
  for (const p of parcels) {
    const own = existing.filter((e) => pointInRing(e, p.ring));
    const list = own.length > 0 ? own : [{ ...interiorPoint(p.ring), code: '5411' }];
    for (const c of list) out.push({ id: `${prefix}${first + out.length}`, hrsz: p.hrsz, y: Math.round(c.y), x: Math.round(c.x), code: c.code });
  }
  return out;
}

export function addressSection(points: AddressPoint[]): Section {
  return {
    kind: 'address-points',
    title: 'Címkoordináták',
    columns: ['Hrsz', 'Pontszám', 'Y [m]', 'X [m]', 'Pontkód'],
    rows: points.map((p) => ({ cells: [p.hrsz, p.id, fix(p.y, 0), fix(p.x, 0), p.code], role: 'result' })),
    footer: ['11. § (17): a címkoordináták helyrajzi szám szerinti bontásban; 5411 = generált, 5412 = mérésből levezetett (4. melléklet).'],
  };
}

/* ---------- vázrajz (SVG) ---------- */

export interface PlanMeta {
  /** A készítő földmérő vagy vállalkozás neve. */
  keszito: string;
  szekhely: string;
  munkaszam: string;
  telepules: string;
  fekves: string;
  /** Az ingatlan-nyilvántartási célú földmérési adatszolgáltatás iktatószáma. */
  iktatoszam: string;
  /** A változási vázrajz megnevezése (4. § (2) a), pl. „telekfelosztás”). */
  megnevezes: string;
  /** Földmérő igazolvány száma. */
  igazolvany: string;
  /** Ingatlanrendező földmérő minősítés száma. */
  minosites: string;
  /** A készítés helye és ideje. */
  hely: string;
  datum: string;
  /** A minőséget tanúsító földmérő neve (ha üres, a készítő tanúsít). */
  tanusito?: string;
}

export interface PlanParcel {
  hrsz: string;
  ring: NamedPt[];
  area?: number;
}

export interface PlanInput {
  before: PlanParcel[];
  after: PlanParcel[];
  address: AddressPoint[];
  /** Mérési vázlathoz: a mért pontok azonosítói. */
  measured?: Set<string>;
  /** Rajzelemek: épületek, alrészletek, vonalak, feliratok. */
  drawing?: DrawingElement[];
  /** A környezet (a szomszédos földrészletek és épületek) az adatszolgáltatásból. */
  background?: { parcels: PlanParcel[]; buildings: { layer: LayerKey; ring: NamedPt[] }[] };
  /** Az alrészletek a területkimutatáshoz (változás előtt és után). */
  subs?: { before: SubLike[]; after: SubLike[] };
  /** A mért pontok koordinátái (a vázlaton a mért távolságokhoz). */
  measuredPts?: Map<string, Pt>;
}

/** A határvonalak és a helyrajzi számok besorolása: változatlan, megszűnő, új. */
export function classifyPlan(input: PlanInput) {
  const be = edges(input.before);
  const af = edges(input.after);
  const kept: [NamedPt, NamedPt][] = [];
  const removed: [NamedPt, NamedPt][] = [];
  const added: [NamedPt, NamedPt][] = [];
  for (const [key, e] of be) (af.has(key) || covered(e[0], e[1], af) ? kept : removed).push(e);
  for (const [key, e] of af) if (!be.has(key) && !liesOn(e[0], e[1], be)) added.push(e);
  const afterH = new Set(input.after.map((p) => p.hrsz));
  const beforeH = new Set(input.before.map((p) => p.hrsz));
  return {
    kept,
    removed,
    added,
    oldHrsz: input.before.filter((p) => !afterH.has(p.hrsz)),
    newHrsz: input.after.filter((p) => !beforeH.has(p.hrsz)),
    sameHrsz: input.after.filter((p) => beforeH.has(p.hrsz)),
  };
}

export const PLAN_SCALES = [100, 200, 250, 500, 1000, 2000, 4000, 5000, 10000];

/** A legnagyobb szabványos méretarány, amelyben a kivágat (m) a keretbe (mm) fér. */
export function chooseScale(widthM: number, heightM: number, frameWmm: number, frameHmm: number): number {
  for (const s of PLAN_SCALES) if ((widthM * 1000) / s <= frameWmm && (heightM * 1000) / s <= frameHmm) return s;
  return PLAN_SCALES.at(-1)!;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const edgeKey = (a: Pt, b: Pt) => {
  const k = (p: Pt) => `${Math.round(p.y * 100)}:${Math.round(p.x * 100)}`;
  return [k(a), k(b)].sort().join('|');
};
const edges = (ps: PlanParcel[]) => {
  const out = new Map<string, [NamedPt, NamedPt]>();
  for (const p of ps) p.ring.forEach((a, i) => out.set(edgeKey(a, p.ring[(i + 1) % p.ring.length]!), [a, p.ring[(i + 1) % p.ring.length]!]));
  return out;
};
const centroid = (ring: Pt[]) => interiorPoint(ring);

/**
 * Feliratpont: a sokszögön belüli rácspontok közül az, amelyik a legtávolabb van a határától és az
 * akadályoktól (pl. a rajzolt épületek éleitől). Ha nincs belső rácspont, a belső pont.
 */
export function labelPoint(ring: Pt[], obstacles: Pt[][] = []): Pt {
  const ys = ring.map((p) => p.y);
  const xs = ring.map((p) => p.x);
  const [y0, y1, x0, x1] = [Math.min(...ys), Math.max(...ys), Math.min(...xs), Math.max(...xs)];
  const inside = (p: Pt) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.x > p.x !== b.x > p.x && p.y < ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x) + a.y) c = !c;
    }
    return c;
  };
  const segs: [Pt, Pt][] = [];
  for (const r of [ring, ...obstacles]) r.forEach((a, i) => segs.push([a, r[(i + 1) % r.length]!]));
  const dist = (p: Pt) =>
    Math.min(
      ...segs.map(([a, b]) => {
        const dy = b.y - a.y;
        const dx = b.x - a.x;
        const l2 = dy * dy + dx * dx || 1;
        const u = Math.max(0, Math.min(1, ((p.y - a.y) * dy + (p.x - a.x) * dx) / l2));
        return Math.hypot(a.y + u * dy - p.y, a.x + u * dx - p.x);
      }),
    );
  // Az épületen belüli pont nem jó feliratpont.
  const inObstacle = (p: Pt) => obstacles.some((o) => {
    let c = false;
    for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
      const a = o[i]!;
      const b = o[j]!;
      if (a.x > p.x !== b.x > p.x && p.y < ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x) + a.y) c = !c;
    }
    return c;
  });
  let best: Pt | null = null;
  let bestD = -1;
  const n = 24;
  for (let i = 1; i < n; i++)
    for (let j = 1; j < n; j++) {
      const p = { y: y0 + ((y1 - y0) * i) / n, x: x0 + ((x1 - x0) * j) / n };
      if (!inside(p) || inObstacle(p)) continue;
      const d = dist(p);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  return best ?? interiorPoint(ring);
}

/** A p pont az ab szakaszon van (1 cm-en belül). */
function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  const dy = b.y - a.y;
  const dx = b.x - a.x;
  const len2 = dy * dy + dx * dx;
  if (len2 === 0) return false;
  const t = ((p.y - a.y) * dy + (p.x - a.x) * dx) / len2;
  if (t < -1e-6 || t > 1 + 1e-6) return false;
  return Math.hypot(a.y + t * dy - p.y, a.x + t * dx - p.x) < 0.01;
}

/** Az ab él egy másik halmaz valamelyik élén fekszik (a töréspontok beszúrása nem változtat a határon). */
const liesOn = (a: Pt, b: Pt, set: Map<string, [NamedPt, NamedPt]>) => [...set.values()].some(([c, d]) => onSegment(a, c, d) && onSegment(b, c, d));
/** Az ab élre a másik halmaz valamelyik éle ráfekszik. */
const covered = (a: Pt, b: Pt, set: Map<string, [NamedPt, NamedPt]>) => [...set.values()].some(([c, d]) => onSegment(c, a, b) && onSegment(d, a, b));
const m2 = (a: number | undefined) => (a === undefined ? '' : Math.round(a).toLocaleString('hu-HU'));

/** A4 álló oldal (210 × 297 mm) a változási vázrajzzal vagy a mérési vázlattal. */
/** Az alapértelmezett sablon (telekalakítás), ha a hívó nem ad meg munkafajtát. */
const DEFAULT_TEMPLATES: Record<'change' | 'sketch', PlanTemplate> = {
  change: {
    title: 'VÁLTOZÁSI VÁZRAJZ',
    subject: 'auto',
    left: ['sign', 'place', 'maker', 'cert'],
    right: ['optional', 'soil', 'clause511'],
    notForMeasure: 'A vázrajz méretek levételére nem alkalmas.',
    areaTable: 'full',
    dimensions: false,
    colored: false,
  },
  sketch: {
    title: 'MÉRÉSI VÁZLAT',
    subject: 'auto',
    left: ['place', 'taken', 'maker'],
    right: ['newmarked', 'cert'],
    notForMeasure: '',
    areaTable: null,
    dimensions: true,
    colored: true,
  },
};

export interface PlanOptions {
  template?: PlanTemplate;
  /** A munka fajtája: ettől függ, minek a méreteit írja a rajz (kitűzött földrészlet, új épület, új alrészlet). */
  job?: JobKind;
  /** A rajz méretaránya (pl. 500); ha nincs megadva, a legnagyobb, amelyben a kivágat a keretbe fér. */
  scale?: number;
}

/** A méretmegírással ellátott élek a munka fajtája szerint. */
function dimensionEdges(input: PlanInput, job: JobKind | undefined): [NamedPt, NamedPt][] {
  const beforeHrsz = new Set(input.before.map((p) => p.hrsz));
  if (job === 'setout') return [...edges(input.after).values()];
  if (job === 'building') {
    const out = new Map<string, [NamedPt, NamedPt]>();
    for (const d of input.drawing ?? [])
      if (d.kind === 'building' && d.type === 'new') d.ring.forEach((a, i) => out.set(edgeKey(a, d.ring[(i + 1) % d.ring.length]!), [a, d.ring[(i + 1) % d.ring.length]!]));
    return [...out.values()];
  }
  if (job === 'landuse') {
    const out = new Map<string, [NamedPt, NamedPt]>();
    for (const d of input.drawing ?? [])
      if (d.kind === 'sub' && d.isNew) d.ring.forEach((a, i) => out.set(edgeKey(a, d.ring[(i + 1) % d.ring.length]!), [a, d.ring[(i + 1) % d.ring.length]!]));
    return [...out.values()];
  }
  return [...edges(input.after.filter((p) => !beforeHrsz.has(p.hrsz))).values()];
}

/** A tárgymondat a mellékletminták szerint (pl. „a 12242 helyrajzi számú földrészlet megosztásáról”). */
export function subjectSentence(subject: JobKind | 'auto', input: PlanInput, fallback: string): string {
  const bh = [...new Set(input.before.map((p) => p.hrsz))].sort(byNumber);
  const ah = [...new Set(input.after.map((p) => p.hrsz))].sort(byNumber);
  const list = (h: string[]) => (h.length === 1 ? `a ${h[0]} helyrajzi számú földrészlet` : `a ${h.join(', ')} helyrajzi számú földrészletek`);
  switch (subject) {
    case 'setout':
      return `${list(ah.length ? ah : bh)} kitűzéséről`;
    case 'building':
      return `a ${(ah.length ? ah : bh).join(', ')} helyrajzi számú földrészlet${ah.length > 1 ? 'ek' : ''}en lévő épület feltüntetéséhez`;
    case 'landuse':
      return `${list(ah.length ? ah : bh)} művelési ág változásáról`;
    case 'subdivision':
      if (bh.length === 1 && ah.length > 1) return `${list(bh)} megosztásáról`;
      if (bh.length > 1 && ah.length === 1) return `${list(bh)} egyesítéséről`;
      return `${list(bh)} telekhatár-rendezéséről`;
    default:
      return fallback;
  }
}

/** Terület „ha.m²” alakban (1102 m² → 0.1102; 12 345 m² → 1.2345). */
export const haM2 = (m2: number | undefined) => {
  if (m2 === undefined || !Number.isFinite(m2)) return '';
  const a = Math.round(m2);
  return `${Math.floor(a / 10000)}.${String(a % 10000).padStart(4, '0')}`;
};

const RED = '#d01010';
const GREEN = '#118a2e';
const BLUE = '#1530c0';

/**
 * A4 álló oldal (210 × 297 mm) a földhivatal által közzétett mellékletminták elrendezésében: bal felül a
 * vállalkozás neve, székhelye és a munkaszám, jobb felül a település, a fekvés és az adatszolgáltatás
 * iktatószáma; középen a felirat, a tárgymondat és a méretarány; keret nélküli térképi kivágat; a
 * területkimutatás 14 (13) oszlopos táblázata ha.m² területekkel; a lábrész a minták szerinti
 * feliratokkal, aláírás- és záradékhelyekkel.
 */
/**
 * A jelkulcsi jel forgatása (fok, az óramutatóval ellentétesen): a megadott érték, vagy a jel tájolási
 * szabálya szerint a legközelebbi vonal (földrészlethatár, épület, alrészlet, vonal) irányában.
 */
export function symbolRotation(d: Extract<DrawingElement, { kind: 'symbol' }>, input: PlanInput): number {
  if (d.rotation !== null) return d.rotation;
  if (d.def.orient !== 'parallel' && d.def.orient !== 'perpendicular') return 0;
  const rings: [Pt[], boolean][] = [
    ...[...input.before, ...input.after].map((p): [Pt[], boolean] => [p.ring, true]),
    ...(input.background?.parcels ?? []).map((p): [Pt[], boolean] => [p.ring, true]),
    ...(input.background?.buildings ?? []).map((b): [Pt[], boolean] => [b.ring, true]),
    ...(input.drawing ?? []).flatMap((e): [Pt[], boolean][] => (e.kind === 'building' || e.kind === 'sub' ? [[e.ring, true]] : e.kind === 'polyline' ? [[e.pts, false]] : [])),
  ];
  let best: { d: number; ang: number } | null = null;
  for (const [ring, closed] of rings)
    for (let i = 0; i < ring.length - (closed ? 0 : 1); i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const dy = b.y - a.y;
      const dx = b.x - a.x;
      const l2 = dy * dy + dx * dx || 1;
      const u = Math.max(0, Math.min(1, ((d.at.y - a.y) * dy + (d.at.x - a.x) * dx) / l2));
      const dist = Math.hypot(a.y + u * dy - d.at.y, a.x + u * dx - d.at.x);
      if (!best || dist < best.d) best = { d: dist, ang: (Math.atan2(dx, dy) * 180) / Math.PI };
    }
  return best?.ang ?? 0;
}

export interface PlanRender {
  svg: string;
  scale: number;
  autoScale: number;
  /** A rajzlap egy pontjának (mm) terepi helye – a rajz kattintásos szerkesztéséhez. */
  toGround: (mmX: number, mmY: number) => Pt;
  /** Egy terepi pont helye a rajzlapon (mm). */
  toPaper: (p: Pt) => { x: number; y: number };
}

export function renderPlan(kind: 'change' | 'sketch', input: PlanInput, meta: PlanMeta, opts: PlanOptions = {}): PlanRender {
  const tpl = opts.template ?? DEFAULT_TEMPLATES[kind];
  const W = 210;
  const H = 297;
  const M = 12;
  const out: string[] = [];
  const t = (x: number, y: number, s: string, size = 3, extra = '') =>
    out.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${size}" ${extra}>${esc(s)}</text>`);
  const it = 'font-style="italic"';
  const bi = 'font-weight="bold" font-style="italic"';

  // Fejléc a minták szerint (keret nélkül)
  t(M, 17, meta.keszito || 'Geodéziai vállalkozás neve', 4, bi);
  t(M, 22, meta.szekhely || 'Székhelyének címe', 3.2, it);
  t(M, 26.5, `Munka száma: ${meta.munkaszam}`, 3.2, 'font-weight="bold"');
  t(W - M, 17, meta.telepules || 'Település neve', 4.4, `${it} text-anchor="end"`);
  t(W - M, 22, meta.fekves || 'fekvés (kerület)', 3.2, `${it} text-anchor="end"`);
  t(W - M, 26.5, `Adatszolg. ikt.sz.: ${meta.iktatoszam || '………/……….'}`, 3.2, `${it} text-anchor="end"`);
  t(W / 2, 38, tpl.title, 8, `${bi} text-anchor="middle"`);
  t(W / 2, 45.5, subjectSentence(tpl.subject, input, meta.megnevezes), 4.4, `${it} text-anchor="middle"`);

  // A térképi kivágat helye: a táblázat és a lábrész alatta
  const subRows = input.subs ?? { before: [], after: [] };
  const tableRows = tpl.areaTable ? Math.max(rowsFor(input.before, subRows.before).length, rowsFor(input.after, subRows.after).length, 1) : 0;
  const tableH = tpl.areaTable ? 15.5 + (tableRows + 1) * 5.5 : 0;
  const footerH = 58;
  const fy = H - M - footerH;
  const mapTop = 54;
  const mapBottom = fy - (tableH ? tableH + 11 : 0) - 8;
  const frame = { x: M, y: mapTop, w: W - 2 * M, h: mapBottom - mapTop };

  const all = [...input.before, ...input.after].flatMap((p) => p.ring);
  const ys = all.map((p) => p.y);
  const xs = all.map((p) => p.x);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const pad = 0.15;
  const autoScale = chooseScale((maxY - minY) * (1 + 2 * pad) || 1, (maxX - minX) * (1 + 2 * pad) || 1, frame.w, frame.h);
  const scale = opts.scale ?? autoScale;
  t(W / 2, 51.5, `M= 1:${scale}`, 3.8, `${it} text-anchor="middle"`);
  const k = 1000 / scale; // mm / m
  const cy = (minY + maxY) / 2;
  const cx = (minX + maxX) / 2;
  const sx = (y: number) => frame.x + frame.w / 2 + (y - cy) * k;
  const sy = (x: number) => frame.y + frame.h / 2 - (x - cx) * k;
  const line = (a: Pt, b: Pt, w: number, extra = '', color = '#000') =>
    out.push(`<line x1="${sx(a.y).toFixed(2)}" y1="${sy(a.x).toFixed(2)}" x2="${sx(b.y).toFixed(2)}" y2="${sy(b.x).toFixed(2)}" stroke="${color}" stroke-width="${w}" ${extra}/>`);
  const poly = (ring: Pt[], closed: boolean, attrs: string) =>
    out.push(`<${closed ? 'polygon' : 'polyline'} points="${ring.map((q) => `${sx(q.y).toFixed(2)},${sy(q.x).toFixed(2)}`).join(' ')}" fill="none" ${attrs}/>`);

  /** A méretszám helye és forgatása: az él közepén, az éllel párhuzamosan, alulról vagy jobbról olvasva. */
  const along = (a: Pt, b: Pt) => {
    const ang = (Math.atan2(sy(b.x) - sy(a.x), sx(b.y) - sx(a.y)) * 180) / Math.PI;
    const rot = ang >= 90 ? ang - 180 : ang < -90 ? ang + 180 : ang;
    const mx = (sx(a.y) + sx(b.y)) / 2;
    const my = (sy(a.x) + sy(b.x)) / 2;
    return { mx, my, tr: `transform="rotate(${rot.toFixed(1)} ${mx.toFixed(2)} ${my.toFixed(2)})"` };
  };

  out.push(`<g clip-path="url(#frame)">`);
  // Környezet
  const own = new Set([...input.before, ...input.after].map((p) => p.hrsz));
  for (const p of input.background?.parcels ?? [])
    if (!own.has(p.hrsz)) {
      poly(p.ring, true, 'stroke="#000" stroke-width="0.18"');
      const c = centroid(p.ring);
      t(sx(c.y), sy(c.x), p.hrsz, 2.8, `${it} text-anchor="middle"`);
    }
  for (const b of input.background?.buildings ?? []) poly(b.ring, true, 'stroke="#000" stroke-width="0.18"');

  // Határvonalak: változatlan vékony, megszűnő áthúzva, új vastag
  const cls = classifyPlan(input);
  for (const [a, b] of cls.kept) line(a, b, 0.25);
  for (const [a, b] of cls.removed) {
    line(a, b, 0.25, 'stroke-dasharray="1.5 1"');
    const m = { y: (a.y + b.y) / 2, x: (a.x + b.x) / 2 };
    // dupla megszüntető vonal
    out.push(`<path d="M ${(sx(m.y) - 1.4).toFixed(2)} ${(sy(m.x) - 1.6).toFixed(2)} l 1.6 3.2 M ${(sx(m.y) + 0.2).toFixed(2)} ${(sy(m.x) - 1.6).toFixed(2)} l 1.6 3.2" stroke="#000" stroke-width="0.35"/>`);
  }
  for (const [a, b] of cls.added) line(a, b, 0.7, '', tpl.colored ? RED : '#000');

  // Rajzelemek
  const obstacles = (input.drawing ?? []).flatMap((d) => (d.kind === 'building' ? [d.ring] : []));
  const hasNewSubs = (input.drawing ?? []).some((d) => d.kind === 'sub' && d.isNew);
  // a helyrajzi számok helye foglalt az alrészlet-feliratok elől
  const subLabels: [number, number][] = [...cls.sameHrsz, ...cls.newHrsz].map((p) => {
    const c = labelPoint(p.ring, obstacles);
    return [sx(c.y), sy(c.x) - 2.5];
  });
  const subEdges = (input.drawing ?? []).flatMap((d) => (d.kind === 'sub' || d.kind === 'building' ? d.ring.map((a, i): [Pt, Pt] => [a, d.ring[(i + 1) % d.ring.length]!]) : []));
  // az új alrészletek felirata kerül előbb a helyére
  const ordered = [...(input.drawing ?? [])].sort((p, q) => Number(q.kind === 'sub' && q.isNew) - Number(p.kind === 'sub' && p.isNew));
  for (const d of ordered) {
    if (d.kind === 'building') {
      if (d.type === 'new') poly(d.ring, true, 'stroke="#000" stroke-width="0.6"');
      else if (d.type === 'old') {
        poly(d.ring, true, 'stroke="#000" stroke-width="0.25"');
        d.ring.forEach((a, i) => {
          const b = d.ring[(i + 1) % d.ring.length]!;
          const m = { y: (a.y + b.y) / 2, x: (a.x + b.x) / 2 };
          out.push(`<path d="M ${(sx(m.y) - 1.2).toFixed(2)} ${(sy(m.x) - 1.4).toFixed(2)} l 1.4 2.8 M ${(sx(m.y) + 0.2).toFixed(2)} ${(sy(m.x) - 1.4).toFixed(2)} l 1.4 2.8" stroke="#000" stroke-width="0.4"/>`);
        });
      } else if (d.type === 'wall') poly(d.ring, true, 'stroke="#000" stroke-width="0.18" stroke-dasharray="1.5 0.5"');
      else poly(d.ring, true, 'stroke="#000" stroke-width="0.25"');
    } else if (d.kind === 'sub') {
      // 19. melléklet: az új alrészlethatár rövid szaggatott vastag, a megszűnő felirat áthúzva, az új vastagon
      const ending = !d.isNew && hasNewSubs;
      poly(d.ring, true, `stroke="#000" stroke-width="${d.isNew ? 0.45 : 0.2}" stroke-dasharray="${d.isNew ? '2 1' : '0.5 0.6'}"`);
      const c = labelPoint(d.ring, obstacles);
      // a megszűnő felirat az új alrészlet felirata mellé kerül, nem rá
      const spots: [number, number][] = ending ? [[0, 11], [14, 4], [-14, 4], [0, -6], [14, 11], [-14, 11], [0, -14], [0, 18]] : [[0, 4], [0, 11], [12, 4], [-12, 4]];
      const onLine = (x: number, y: number) =>
        subEdges.some(([a, b]) => {
          const ax = sx(a.y), ay = sy(a.x), bx = sx(b.y), by = sy(b.x);
          const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
          const u = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2));
          return Math.hypot(ax + u * (bx - ax) - x, ay + u * (by - ay) - y) < 5;
        });
      const [dx, dy] =
        spots.find(([ox, oy]) => !onLine(sx(c.y) + ox, sy(c.x) + oy) && subLabels.every(([px, py]) => Math.abs(sx(c.y) + ox - px) > 11 || Math.abs(sy(c.x) + oy - py) > 7)) ?? spots[0]!;
      const lx = sx(c.y) + dx;
      const ly = sy(c.x) + dy;
      subLabels.push([lx, ly]);
      t(lx, ly, d.letter, 2.8, `text-anchor="middle" ${it}${d.isNew ? ' font-weight="bold"' : ''}`);
      t(lx, ly + 3.4, landUseLabel(d.use), 2.6, `text-anchor="middle" ${it}${d.isNew ? ' font-weight="bold"' : ''}`);
      if (ending) {
        const w = Math.max(landUseLabel(d.use).length * 1.4, 3);
        out.push(`<line x1="${(lx - w / 2).toFixed(2)}" y1="${(ly - 1.2).toFixed(2)}" x2="${(lx + w / 2).toFixed(2)}" y2="${(ly + 2.6).toFixed(2)}" stroke="#000" stroke-width="0.35"/>`);
      }
    } else if (d.kind === 'dim') {
      const { mx, my, tr } = along(d.a, d.b);
      t(mx, my - 0.8, d.text || fix(distance(d.a, d.b), 2), 2.4, `data-line="${d.line}" text-anchor="middle"${d.text && tpl.colored ? ` fill="${BLUE}"` : ''} ${tr}`);
    } else if (d.kind === 'polyline') poly(d.pts, false, `stroke="#000" stroke-width="0.2"${d.layer === 'fence' ? ' stroke-dasharray="2 1"' : d.layer === 'servitude' ? ' stroke-dasharray="3 1"' : ''}`);
    else if (d.kind === 'symbol') {
      const x = sx(d.at.y);
      const y = sy(d.at.x);
      const paths = symbolPaths(d.def, symbolRotation(d, input));
      const color = d.def.color ?? '#000';
      const sw = d.def.width ?? 0.18;
      const ds = paths
        .map((p) => {
          const pts = p.pts.map(([u, v]) => `${(x + u).toFixed(3)} ${(y - v).toFixed(3)}`).join(' L ');
          const style = p.fill ? `fill="${color}" stroke="none"` : `fill="none" stroke="${color}" stroke-width="${sw}"`;
          return `<path d="M ${pts}${p.closed ? ' Z' : ''}" ${style}/>`;
        })
        .join('');
      // a megírás a jeltől jobbra 0,70 mm-re (DAT1-M2)
      const right = Math.max(0, ...paths.flatMap((p) => p.pts.map(([u]) => u)));
      const lab = d.label ? `<text x="${(x + right + 0.7).toFixed(2)}" y="${(y + 0.6).toFixed(2)}" font-size="1.8" ${it}>${esc(d.label)}</text>` : '';
      // átlátszó fogantyú, hogy a kis jel is megfogható legyen
      out.push(`<g data-line="${d.line}" data-px="${x.toFixed(2)}" data-py="${y.toFixed(2)}"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.6" fill="transparent"/>${ds}${lab}</g>`);
    } else {
      const x = sx(d.at.y);
      const y = sy(d.at.x);
      t(x, y, d.text, d.layer === 'houseNo' ? 2.6 : 3, `data-line="${d.line}" text-anchor="middle" ${it}${d.rotation ? ` transform="rotate(${(-d.rotation).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})"` : ''}`);
    }
  }

  // Méretek: a vázlaton és a kitűzési vázrajzon (11. melléklet: kitűzési méret aláhúzva, mért zölden)
  if (tpl.dimensions)
    for (const [a, b] of dimensionEdges(input, opts.job)) {
      const { mx, my, tr } = along(a, b);
      const setout = opts.job === 'setout';
      const color = setout && tpl.colored ? ` fill="${RED}"` : '';
      t(mx, my - 0.8, fix(distance(a, b), 2), 2.4, `text-anchor="middle"${setout ? ' text-decoration="underline"' : ''}${color} ${tr}`);
      const ma = input.measuredPts?.get(a.id);
      const mb = input.measuredPts?.get(b.id);
      if (tpl.colored && ma && mb) t(mx, my + 2.6, fix(distance(ma, mb), 2), 2.4, `text-anchor="middle" ${it} text-decoration="underline" fill="${GREEN}" ${tr}`);
    }

  // Helyrajzi számok: a megszűnő áthúzva, az új vastagon (a vázlaton pirosan)
  const segDist = (px: number, py: number, a: NamedPt, b: NamedPt) => {
    const ax = sx(a.y), ay = sy(a.x), bx = sx(b.y), by = sy(b.x);
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const u = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2));
    return Math.hypot(ax + u * (bx - ax) - px, ay + u * (by - ay) - py);
  };
  for (const p of cls.oldHrsz) {
    const c = centroid(p.ring);
    const spots: [number, number][] = [[0, 6], [0, -8], [9, 2], [-9, 2], [0, 12], [12, 6], [-12, 6]];
    const clear = (p.hrsz.length * 1.8) / 2 + 1.5;
    const free = spots.find(([dx, dy]) => cls.added.every(([a, b]) => segDist(sx(c.y) + dx, sy(c.x) + dy - 1, a, b) >= clear)) ?? spots[0]!;
    const x = sx(c.y) + free[0];
    const y = sy(c.x) + free[1];
    t(x, y, p.hrsz, 3.2, `text-anchor="middle" ${it}`);
    const w = p.hrsz.length * 1.8;
    out.push(`<line x1="${(x - w / 2).toFixed(2)}" y1="${(y - 1).toFixed(2)}" x2="${(x + w / 2).toFixed(2)}" y2="${(y - 1).toFixed(2)}" stroke="#000" stroke-width="0.5"/>`);
  }
  for (const p of [...cls.sameHrsz, ...cls.newHrsz]) {
    const c = labelPoint(p.ring, obstacles);
    const isNew = cls.newHrsz.includes(p);
    t(sx(c.y), sy(c.x) - 2.5, p.hrsz, 3.4, `text-anchor="middle" ${it}${isNew ? ` font-weight="bold"${tpl.colored ? ` fill="${RED}"` : ''}` : ''}`);
  }

  // Pontok és pontszámok (a vázlaton: mért zöld, új / kitűzött piros, aláhúzva)
  const beforeIds = new Set(input.before.flatMap((p) => p.ring.map((q) => q.id)));
  const seen = new Set<string>();
  const drawingPts = (input.drawing ?? []).flatMap((d) => (d.kind === 'building' || d.kind === 'sub' ? d.ring : d.kind === 'polyline' ? d.pts : []));
  for (const p of [...all, ...drawingPts]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const measured = input.measured?.has(p.id);
    const fresh = !beforeIds.has(p.id);
    out.push(
      measured
        ? `<path d="M ${(sx(p.y) - 1).toFixed(2)} ${sy(p.x).toFixed(2)} h 2 M ${sx(p.y).toFixed(2)} ${(sy(p.x) - 1).toFixed(2)} v 2" stroke="${tpl.colored ? GREEN : '#000'}" stroke-width="0.25"/>`
        : `<circle cx="${sx(p.y).toFixed(2)}" cy="${sy(p.x).toFixed(2)}" r="0.55" fill="#fff" stroke="#000" stroke-width="0.22"/>`,
    );
    const style = tpl.colored && measured ? `${it} text-decoration="underline" fill="${GREEN}"` : tpl.colored && fresh ? `text-decoration="underline" fill="${RED}"` : '';
    t(sx(p.y) + 1, sy(p.x) - 1, p.id, 2, style);
  }
  // Címkoordináták jele
  for (const a of input.address) {
    const x = sx(a.y);
    const y = sy(a.x);
    out.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.1" fill="none" stroke="#000" stroke-width="0.25"/>`);
    out.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.35" fill="#000"/>`);
    t(x + 1.4, y + 2.4, a.id, 2, it);
  }
  out.push('</g>');

  // Címkoordináták táblázata helyrajzi számonként (a kivágat jobb oldalán, a minták szerint)
  let ty = frame.y + 2;
  const byHrsz = new Map<string, AddressPoint[]>();
  for (const a of input.address) byHrsz.set(a.hrsz, [...(byHrsz.get(a.hrsz) ?? []), a]);
  for (const [h, list] of [...byHrsz].sort((p, q) => byNumber(p[0], q[0]))) {
    const tx = W - M - 58;
    const rows = list.length + 2;
    if (ty + rows * 4.4 > frame.y + frame.h) break;
    out.push(`<rect x="${tx}" y="${ty.toFixed(2)}" width="58" height="${(rows * 4.4).toFixed(2)}" fill="#fff" stroke="#000" stroke-width="0.25"/>`);
    t(tx + 29, ty + 3.2, `Címkoordináták ${h} hrsz`, 2.6, 'text-anchor="middle" font-weight="bold"');
    const cols = [tx, tx + 14, tx + 36, tx + 58];
    const hy = ty + 4.4;
    out.push(`<line x1="${tx}" y1="${hy.toFixed(2)}" x2="${tx + 58}" y2="${hy.toFixed(2)}" stroke="#000" stroke-width="0.2"/>`);
    t(tx + 7, hy + 3.2, 'Psz', 2.5, 'text-anchor="middle" font-weight="bold"');
    t(tx + 25, hy + 3.2, 'Y', 2.5, 'text-anchor="middle" font-weight="bold"');
    t(tx + 47, hy + 3.2, 'X', 2.5, 'text-anchor="middle" font-weight="bold"');
    for (const c of cols.slice(1, 3)) out.push(`<line x1="${c}" y1="${hy.toFixed(2)}" x2="${c}" y2="${(ty + rows * 4.4).toFixed(2)}" stroke="#000" stroke-width="0.2"/>`);
    list.forEach((a, i) => {
      const ry = hy + 4.4 * (i + 1);
      out.push(`<line x1="${tx}" y1="${ry.toFixed(2)}" x2="${tx + 58}" y2="${ry.toFixed(2)}" stroke="#000" stroke-width="0.15"/>`);
      t(tx + 7, ry + 3.2, a.id, 2.5, 'text-anchor="middle"');
      t(tx + 25, ry + 3.2, fix(a.y, 0), 2.5, 'text-anchor="middle"');
      t(tx + 47, ry + 3.2, fix(a.x, 0), 2.5, 'text-anchor="middle"');
    });
    ty += rows * 4.4 + 3;
  }

  // Északjel és a „méretek levételére nem alkalmas” felirat
  const nx = frame.x + frame.w - 6;
  out.push(`<path d="M ${nx} ${frame.y + frame.h - 14} l 2.2 6 l -2.2 -1.8 l -2.2 1.8 z" fill="#000"/>`);
  t(nx, frame.y + frame.h - 4.5, 'É', 2.8, 'text-anchor="middle"');
  if (tpl.notForMeasure) t(M + 2, frame.y + frame.h + 4, tpl.notForMeasure, 2.8, it);

  // Területkimutatás (5–6. melléklet szerinti oszlopok)
  if (tpl.areaTable) areaTableSvg(out, t, M, frame.y + frame.h + 7, W - 2 * M, tpl.areaTable, input, subRows);

  // Lábrész
  footerSvg(out, t, tpl.left, M, fy, 92, meta);
  footerSvg(out, t, tpl.right, W / 2 + 4, fy + 2, W / 2 - 4 - M, meta);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">` +
    `<defs><clipPath id="frame"><rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}"/></clipPath></defs>` +
    `<rect width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  return {
    svg,
    scale,
    autoScale,
    toGround: (mx, my) => ({ y: cy + (mx - frame.x - frame.w / 2) / k, x: cx - (my - frame.y - frame.h / 2) / k }),
    toPaper: (p) => ({ x: sx(p.y), y: sy(p.x) }),
  };
}

export interface SubLike {
  hrsz: string;
  letter: string;
  use: string;
  quality?: string;
  area: number;
}

/** A táblázat sorai egy oldalon: földrészletenként az alrészletek (ha vannak), különben egy sor. */
function rowsFor(parcels: PlanParcel[], subs: SubLike[]): { hrsz: string; jel: string; use: string; quality: string; area: number | undefined }[] {
  const rows: { hrsz: string; jel: string; use: string; quality: string; area: number | undefined }[] = [];
  for (const p of [...parcels].sort((a, b) => byNumber(a.hrsz, b.hrsz))) {
    const list = subs.filter((s) => s.hrsz === p.hrsz);
    if (list.length === 0) rows.push({ hrsz: p.hrsz, jel: '', use: '', quality: '', area: p.area });
    else list.forEach((s, i) => rows.push({ hrsz: i === 0 ? p.hrsz : '', jel: s.letter, use: s.use, quality: s.quality ?? '', area: s.area }));
  }
  return rows;
}

type TextFn = (x: number, y: number, s: string, size?: number, extra?: string) => void;

function areaTableSvg(out: string[], t: TextFn, x0: number, y0: number, w: number, variant: 'full' | 'note', input: PlanInput, subs: { before: SubLike[]; after: SubLike[] }): number {
  const side = [14, 6, 24, 6, 15, 10]; // hrsz, jel, műv.ága, min.o., ha.m², AK
  const sideW = side.reduce((s, v) => s + v, 0);
  const rest = w - 2 * sideW;
  const extra = variant === 'full' ? [rest - 9, 9] : [rest];
  const widths = [...side, ...side, ...extra];
  const xs = widths.reduce<number[]>((acc, v) => [...acc, acc.at(-1)! + v], [x0]);
  const before = rowsFor(input.before, subs.before);
  const after = rowsFor(input.after, subs.after);
  const n = Math.max(before.length, after.length, 1);
  const h1 = 5;
  const h2 = 7;
  const h3 = 3.5;
  const rh = 5.5;
  const yEnd = y0 + h1 + h2 + h3 + n * rh + rh;
  const L = (x1: number, y1: number, x2: number, y2: number, sw = 0.2) =>
    out.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#000" stroke-width="${sw}"/>`);
  out.push(`<rect x="${x0}" y="${y0.toFixed(2)}" width="${w}" height="${(yEnd - y0).toFixed(2)}" fill="none" stroke="#000" stroke-width="0.35"/>`);
  // fejléc
  t(x0 + sideW / 2, y0 + 3.8, 'Változás előtti állapot', 3, 'text-anchor="middle" font-weight="bold"');
  t(x0 + sideW * 1.5, y0 + 3.8, 'Változás utáni állapot', 3, 'text-anchor="middle" font-weight="bold"');
  L(x0, y0 + h1, x0 + 2 * sideW, y0 + h1);
  L(x0 + sideW, y0, x0 + sideW, yEnd, 0.35);
  L(x0 + 2 * sideW, y0, x0 + 2 * sideW, yEnd, 0.35);
  const heads = ['Hrsz', 'jel', 'műv. ága', 'min. o.', 'ha.m²', 'AK'];
  const extraHeads = variant === 'full' ? ['Szolgalmi és egyéb jogok', 'Megj.'] : ['Jegyzet'];
  const allHeads = [...heads, ...heads, ...extraHeads];
  allHeads.forEach((hd, i) => {
    const cx = (xs[i]! + xs[i + 1]!) / 2;
    const yy = i < 12 ? y0 + h1 + 4.6 : y0 + 7;
    t(cx, yy, hd, hd.length > 12 ? 2.2 : 2.5, 'text-anchor="middle"');
  });
  const yNum = y0 + h1 + h2;
  L(x0, yNum, x0 + w, yNum);
  allHeads.forEach((_, i) => t((xs[i]! + xs[i + 1]!) / 2, yNum + 2.8, String(i + 1), 2.2, 'text-anchor="middle" font-weight="bold"'));
  const yData = yNum + h3;
  L(x0, yData, x0 + w, yData, 0.3);
  for (let i = 1; i < widths.length; i++) if (i !== 6 && i !== 12) L(xs[i]!, i >= 12 ? y0 : y0 + h1, xs[i]!, yEnd);
  const cell = (i: number, r: number, s: string, extra = '') => t(i === 0 || i === 6 ? xs[i]! + 1 : (xs[i]! + xs[i + 1]!) / 2, yData + r * rh + 3.9, s, 2.6, `${i === 0 || i === 6 ? '' : 'text-anchor="middle"'} ${extra}`);
  for (let r = 0; r < n; r++) {
    const b = before[r];
    const a = after[r];
    if (b) {
      cell(0, r, b.hrsz, 'font-weight="bold" font-style="italic"');
      cell(1, r, b.jel, 'font-style="italic"');
      cell(2, r, b.use, 'font-style="italic"');
      cell(3, r, b.quality, 'font-style="italic"');
      cell(4, r, haM2(b.area), 'font-weight="bold" font-style="italic"');
      cell(5, r, '-', '');
    }
    if (a) {
      cell(6, r, a.hrsz, 'font-weight="bold" font-style="italic"');
      cell(7, r, a.jel, 'font-style="italic"');
      cell(8, r, a.use, 'font-style="italic"');
      cell(9, r, a.quality, 'font-style="italic"');
      cell(10, r, haM2(a.area), 'font-weight="bold" font-style="italic"');
      cell(11, r, '-', '');
    }
  }
  const yt = yData + n * rh;
  L(x0, yt, x0 + w, yt, 0.3);
  const sumB = input.before.reduce((s, p) => s + (p.area ?? 0), 0);
  const sumA = input.after.reduce((s, p) => s + (p.area ?? 0), 0);
  t(xs[0]! + 1, yt + 3.9, 'Összesen:', 2.6, 'font-weight="bold" font-style="italic"');
  t((xs[4]! + xs[5]!) / 2, yt + 3.9, haM2(sumB), 2.6, 'text-anchor="middle" font-weight="bold" font-style="italic"');
  t(xs[6]! + 1, yt + 3.9, 'Összesen:', 2.6, 'font-weight="bold" font-style="italic"');
  t((xs[10]! + xs[11]!) / 2, yt + 3.9, haM2(sumA), 2.6, 'text-anchor="middle" font-weight="bold" font-style="italic"');
  return yEnd;
}

/** A lábrész egy oszlopa a mellékletminták szövegeivel. */
function footerSvg(out: string[], t: TextFn, items: FooterItem[], x: number, y0: number, w: number, meta: PlanMeta): void {
  let y = y0;
  const it = 'font-style="italic"';
  const box = (lines: [string, string][], h: number) => {
    out.push(`<rect x="${x.toFixed(2)}" y="${(y - 3.5).toFixed(2)}" width="${w.toFixed(2)}" height="${h}" fill="none" stroke="#000" stroke-width="0.25"/>`);
    let yy = y;
    for (const [s, extra] of lines) {
      t(x + 2, yy, s, 2.5, extra);
      yy += 4.2;
    }
    y += h + 2;
  };
  for (const item of items) {
    switch (item) {
      case 'sign':
        t(x, y, 'A változás akaratunknak megfelelően történt:', 2.8, it);
        t(x, y + 6, '.............................................................', 2.6);
        t(x, y + 11, '.............................................................', 2.6);
        y += 17;
        break;
      case 'place':
        t(x, y, `Készítés helye, időpontja: ${meta.hely} ${meta.datum}`, 2.8, it);
        y += 9;
        break;
      case 'maker':
        t(x, y, `Készítő: ............................................  ${meta.keszito}`, 2.8, it);
        t(x + 14, y + 4, `földmérő ig. száma: ${meta.igazolvany}`, 2.6, it);
        y += 11;
        break;
      case 'cert':
        t(x, y, `Minőséget tanúsító: .......................................  ${meta.tanusito ?? ''}`, 2.8, it);
        t(x + 22, y + 4, `Ing.rend.min.sz.: ${meta.minosites}`, 2.6, it);
        y += 11;
        break;
      case 'makercert':
        t(x, y, `Készítő és minőséget tanúsító: .............................  ${meta.tanusito || meta.keszito}`, 2.8, it);
        t(x + 30, y + 4, `Ing.rend.min.sz.: ${meta.minosites}`, 2.6, it);
        y += 11;
        break;
      case 'taken':
        t(x, y, 'A …………. sz. záradékolt munkából átvett méretek.', 2.8, it);
        y += 8;
        break;
      case 'optional':
        box(
          [
            ['Szükség esetén:', 'font-weight="bold" font-style="italic"'],
            ['Megelőzi az ………… iktatószámú változási vázrajz átvezetése.', it],
            ['Hatályon kívül helyezi az ………… iktatószámú vázrajzot.', it],
          ],
          14,
        );
        break;
      case 'soil':
        box(
          [
            ['Ha a változási vázrajz termőföldet érint a 30. § (2) vagy (3)', 'font-weight="bold" font-style="italic"'],
            ['bekezdés szerinti földminősítési záradék.', 'font-weight="bold" font-style="italic"'],
            ['J.H. székhelye, 20…. ……………. hó ……… nap', it],
            ['                         Záradékoló: …………………………', it],
          ],
          18,
        );
        break;
      case 'clause511':
      case 'clause512':
        t(x, y, `Az 51. § (${item === 'clause511' ? 1 : 2}) bekezdés szerinti záradékszöveg.`, 2.6, it);
        t(x, y + 5, 'J.H. székhelye, 20…. ……………. hó ……… nap', 2.6, it);
        t(x, y + 11, 'P.H.', 2.6, it);
        t(x + 22, y + 11, 'Záradékoló: …………………………………', 2.6, it);
        t(x + 40, y + 15, 'Ing.rend.min.sz.:', 2.6, it);
        y += 19;
        break;
      case 'marked':
        t(x, y, 'A kitűzött földrészlet határpontjait ……………… jelöltem meg.', 2.6, it);
        y += 7;
        break;
      case 'newmarked':
        t(x, y, 'A változással érintett földrészlet új', 2.8, it);
        t(x, y + 4, 'határpontjait ……………..-val jelöltem meg.', 2.8, it);
        y += 11;
        break;
      case 'siteclause':
        t(x, y, 'A helyrajzi számozás és a területszámítás helyes. Ez a záradék a', 2.6, it);
        t(x, y + 4, 'keltezéstől számított egy évig hatályos.', 2.6, it);
        t(x, y + 10, 'J.H. székhelye, 20…. ……………. hó ……… nap', 2.6, it);
        t(x + 8, y + 16, 'P.H.', 2.6, it);
        t(x + 26, y + 16, 'Záradékoló: …………………………………', 2.6, it);
        t(x + 40, y + 20, 'Ing.rend.min.sz.: ………./………', 2.6, it);
        y += 24;
        break;
      case 'register':
        t(x, y, 'Nyilvántartásba véve:', 2.6, it);
        t(x, y + 6, 'J.H. székhelye, 20…. ……………. hó ……… nap', 2.6, it);
        t(x + 30, y + 12, 'Vizsgáló: ……………………………', 2.6, it);
        t(x + 36, y + 17, 'Ing.rend.min.sz.: ………./………', 2.6, it);
        t(x + 14, y + 21, 'P.H.', 2.6, it);
        y += 24;
        break;
    }
  }
}

/** A sokszög területe (m²) a vázrajz táblázatához, ha nincs megadva. */
export const ringArea = (ring: Pt[]) => polygonArea(ring);

/** A vázrajz tartalma DXF elemekként, a földhivatali rajzok rétegeire osztva (szöveg/jel: papír-mm). */
export function planEntities(kind: 'change' | 'sketch', input: PlanInput, scale: number, opts: PlanOptions = {}): DxfEntity[] {
  const e: DxfEntity[] = [];
  const mm = scale / 1000; // 1 papír-mm a terepen [m]
  const c = classifyPlan(input);
  const own = new Set([...input.before, ...input.after].map((p) => p.hrsz));
  for (const p of input.background?.parcels ?? [])
    if (!own.has(p.hrsz)) {
      e.push({ type: 'polyline', layer: 'parcel', pts: p.ring, closed: true });
      e.push({ type: 'text', layer: 'hrsz', at: centroid(p.ring), text: p.hrsz, height: 2, align: 'center' });
    }
  for (const b of input.background?.buildings ?? []) e.push({ type: 'polyline', layer: b.layer, pts: b.ring, closed: true });
  for (const [a, b] of c.kept) e.push({ type: 'polyline', layer: 'parcel', pts: [a, b], closed: false });
  for (const [a, b] of c.removed) e.push({ type: 'polyline', layer: 'oldParcel', pts: [a, b], closed: false });
  for (const [a, b] of c.added) e.push({ type: 'polyline', layer: 'newParcel', pts: [a, b], closed: false });
  const obstacles = (input.drawing ?? []).flatMap((d) => (d.kind === 'building' ? [d.ring] : []));
  for (const p of c.sameHrsz) e.push({ type: 'text', layer: 'hrsz', at: labelPoint(p.ring, obstacles), text: p.hrsz, height: 2, align: 'center' });
  for (const p of c.oldHrsz) e.push({ type: 'text', layer: 'oldHrsz', at: centroid(p.ring), text: p.hrsz, height: 2, align: 'center' });
  for (const p of c.newHrsz) e.push({ type: 'text', layer: 'newHrsz', at: labelPoint(p.ring, obstacles), text: p.hrsz, height: 2, align: 'center' });
  for (const d of input.drawing ?? []) {
    if (d.kind === 'building') e.push({ type: 'polyline', layer: d.layer, pts: d.ring, closed: true });
    else if (d.kind === 'sub') {
      const at = labelPoint(d.ring, obstacles);
      e.push({ type: 'polyline', layer: d.isNew ? 'newSub' : 'sub', pts: d.ring, closed: true });
      e.push({ type: 'text', layer: d.isNew ? 'newSubLetter' : 'subLetter', at, text: d.letter, height: 2, align: 'center' });
      e.push({ type: 'text', layer: d.isNew ? 'newSubUse' : 'subUse', at: { y: at.y, x: at.x - 2.5 * mm }, text: landUseLabel(d.use), height: 1.8, align: 'center' });
    } else if (d.kind === 'polyline') e.push({ type: 'polyline', layer: d.layer, pts: d.pts, closed: false });
    else if (d.kind === 'dim')
      e.push({ type: 'text', layer: 'distComputed', at: { y: (d.a.y + d.b.y) / 2, x: (d.a.x + d.b.x) / 2 }, text: d.text || fix(distance(d.a, d.b), 2), height: 1.8, align: 'center' });
    else if (d.kind === 'symbol') {
      // a jel vonalai terepi koordinátákban (1 rajzlap-mm = scale/1000 m)
      for (const p of symbolPaths(d.def, symbolRotation(d, input)))
        e.push({ type: 'polyline', layer: 'symbol', pts: p.pts.map(([u, v]) => ({ y: d.at.y + u * mm, x: d.at.x + v * mm })), closed: p.closed });
      if (d.label) e.push({ type: 'text', layer: 'symbol', at: { y: d.at.y + 2 * mm, x: d.at.x }, text: d.label, height: 1.8 });
    } else e.push({ type: 'text', layer: d.layer, at: d.at, text: d.text, height: d.layer === 'houseNo' ? 2 : 2.5, rotation: d.rotation, align: 'center' });
  }
  const seen = new Set<string>();
  const drawingPts = (input.drawing ?? []).flatMap((d) => (d.kind === 'building' || d.kind === 'sub' ? d.ring : d.kind === 'polyline' ? d.pts : []));
  for (const p of [...input.before, ...input.after].flatMap((q) => q.ring).concat(drawingPts)) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    e.push({ type: 'insert', layer: 'pointNo', block: 'Pont', at: p, scale: 1 });
    e.push({ type: 'text', layer: 'pointNo', at: { y: p.y + mm, x: p.x + mm }, text: p.id, height: 1.5 });
  }
  for (const a of input.address) {
    e.push({ type: 'insert', layer: 'address', block: 'Címkoordináta', at: a, scale: 1 });
    e.push({ type: 'text', layer: 'address', at: { y: a.y + 1.5 * mm, x: a.x - 2.5 * mm }, text: a.id, height: 1.5 });
  }
  if ((opts.template ?? DEFAULT_TEMPLATES[kind]).dimensions)
    for (const [a, b] of dimensionEdges(input, opts.job))
      e.push({ type: 'text', layer: 'distComputed', at: { y: (a.y + b.y) / 2, x: (a.x + b.x) / 2 }, text: fix(distance(a, b), 2), height: 1.8, align: 'center' });
  return e;
}
