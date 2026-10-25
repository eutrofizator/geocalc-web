import { interiorPoint } from './dat';
import { landUseLabel, type DrawingElement } from './drawing';
import type { DxfEntity } from './dxf-writer';
import type { LayerKey } from './layers';
import type { JobKind, PlanTemplate } from './jobs';
import { fix } from './format';
import { distance, polygonArea, type Pt } from './geometry';
import type { NamedPt } from './parcel';
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
export function generateAddressPoints(parcels: { hrsz: string; ring: Pt[] }[], prefix: string, first = 1): AddressPoint[] {
  return parcels.map((p, i) => {
    const c = interiorPoint(p.ring);
    return { id: `${prefix}${first + i}`, hrsz: p.hrsz, y: Math.round(c.y), x: Math.round(c.x), code: '5411' };
  });
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
    footer: ['A változás akaratunknak megfelelően történt:', '§sign', 'A vázrajz méretek levételére nem alkalmas.'],
    stampBox: 'Záradék (51. § (1)):',
    areaTable: true,
    dimensions: false,
  },
  sketch: {
    title: 'MÉRÉSI VÁZLAT',
    footer: ['A változással érintett földrészlet új határpontjait', '.......................................... -val jelöltem meg.'],
    stampBox: '',
    areaTable: false,
    dimensions: true,
  },
};

export interface PlanOptions {
  template?: PlanTemplate;
  /** A munka fajtája: ettől függ, minek a méreteit írja a rajz (kitűzött földrészlet, új épület, új alrészlet). */
  job?: JobKind;
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

export function renderPlan(kind: 'change' | 'sketch', input: PlanInput, meta: PlanMeta, opts: PlanOptions = {}): { svg: string; scale: number } {
  const tpl = opts.template ?? DEFAULT_TEMPLATES[kind];
  const W = 210;
  const H = 297;
  const M = 10;
  const header = { x: M, y: M, w: W - 2 * M, h: 30 };
  const frame = { x: M, y: header.y + header.h + 2, w: W - 2 * M, h: 150 };
  const all = [...input.before, ...input.after].flatMap((p) => p.ring);
  const ys = all.map((p) => p.y);
  const xs = all.map((p) => p.x);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const pad = 0.15;
  const scale = chooseScale((maxY - minY) * (1 + 2 * pad) || 1, (maxX - minX) * (1 + 2 * pad) || 1, frame.w, frame.h);
  const k = 1000 / scale; // mm / m
  const cy = (minY + maxY) / 2;
  const cx = (minX + maxX) / 2;
  const sx = (y: number) => frame.x + frame.w / 2 + (y - cy) * k;
  const sy = (x: number) => frame.y + frame.h / 2 - (x - cx) * k;
  const out: string[] = [];
  const t = (x: number, y: number, s: string, size = 3, extra = '') =>
    out.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${size}" ${extra}>${esc(s)}</text>`);
  const line = (a: Pt, b: Pt, w: number, extra = '') =>
    out.push(`<line x1="${sx(a.y).toFixed(2)}" y1="${sy(a.x).toFixed(2)}" x2="${sx(b.y).toFixed(2)}" y2="${sy(b.x).toFixed(2)}" stroke="#000" stroke-width="${w}" ${extra}/>`);

  // Fejléc (15. / 10. melléklet 1. pont)
  out.push(`<rect x="${header.x}" y="${header.y}" width="${header.w}" height="${header.h}" fill="none" stroke="#000" stroke-width="0.3"/>`);
  out.push(`<line x1="${header.x + 60}" y1="${header.y}" x2="${header.x + 60}" y2="${header.y + header.h}" stroke="#000" stroke-width="0.2"/>`);
  out.push(`<line x1="${header.x + header.w - 60}" y1="${header.y}" x2="${header.x + header.w - 60}" y2="${header.y + header.h}" stroke="#000" stroke-width="0.2"/>`);
  t(header.x + 2, header.y + 5, meta.keszito || 'Készítő', 3, 'font-weight="bold"');
  t(header.x + 2, header.y + 10, meta.szekhely, 2.6);
  t(header.x + 2, header.y + 16, `Munkaszám: ${meta.munkaszam}`, 2.6);
  const mid = header.x + header.w / 2;
  t(mid, header.y + 9, tpl.title, 5, 'font-weight="bold" text-anchor="middle"');
  t(mid, header.y + 16, meta.megnevezes, 3, 'text-anchor="middle"');
  const hrszList = [...new Set([...input.before, ...input.after].map((p) => p.hrsz))].sort(byNumber).join(', ');
  t(mid, header.y + 22, `Hrsz: ${hrszList}`, 2.8, 'text-anchor="middle"');
  const right = header.x + header.w - 58;
  t(right, header.y + 5, meta.telepules, 3, 'font-weight="bold"');
  t(right, header.y + 10, meta.fekves, 2.6);
  t(right, header.y + 16, `Iktatószám: ${meta.iktatoszam}`, 2.6);
  t(right, header.y + 22, `Méretarány: 1:${scale}`, 2.8, 'font-weight="bold"');

  // Térképi kivágat
  out.push(`<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="none" stroke="#000" stroke-width="0.3"/>`);
  out.push(`<g clip-path="url(#frame)">`);
  // Környezet: a szomszédos földrészletek és épületek vékony szürke vonallal.
  const poly = (ring: Pt[], closed: boolean, attrs: string) =>
    out.push(
      `<${closed ? 'polygon' : 'polyline'} points="${ring.map((q) => `${sx(q.y).toFixed(2)},${sy(q.x).toFixed(2)}`).join(' ')}" fill="none" ${attrs}/>`,
    );
  const own = new Set([...input.before, ...input.after].map((p) => p.hrsz));
  for (const p of input.background?.parcels ?? [])
    if (!own.has(p.hrsz)) {
      poly(p.ring, true, 'stroke="#777" stroke-width="0.15"');
      const c = centroid(p.ring);
      t(sx(c.y), sy(c.x), p.hrsz, 2.4, 'text-anchor="middle" fill="#777"');
    }
  for (const b of input.background?.buildings ?? []) poly(b.ring, true, 'stroke="#777" stroke-width="0.15"');
  const be = edges(input.before);
  const af = edges(input.after);
  for (const [key, [a, b]] of be)
    if (!af.has(key) && !covered(a, b, af)) {
      // Megszűnő határvonal: vékony szaggatott vonal, két áthúzással.
      line(a, b, 0.25, 'stroke-dasharray="1.5 1"');
      const m = { y: (a.y + b.y) / 2, x: (a.x + b.x) / 2 };
      out.push(`<path d="M ${(sx(m.y) - 1.2).toFixed(2)} ${(sy(m.x) - 1.2).toFixed(2)} l 2.4 2.4 m 0 -2.4 l -2.4 2.4" stroke="#000" stroke-width="0.3"/>`);
    } else line(a, b, 0.3);
  const lengths: [NamedPt, NamedPt][] = [];
  for (const [key, [a, b]] of af)
    if (!be.has(key) && !liesOn(a, b, be)) {
      line(a, b, 0.7); // új határ vastag vonallal
      lengths.push([a, b]);
    }
  // Méretek: a mérési vázlaton az új földrészletek / épület / alrészletek oldalai (10. melléklet 2. b)),
  // a kitűzési vázrajzon és vázlaton a kitűzött földrészlet kitűzési méretei (27–28. melléklet).
  if (tpl.dimensions)
    for (const [a, b] of dimensionEdges(input, opts.job)) {
      const ang = (Math.atan2(sy(b.x) - sy(a.x), sx(b.y) - sx(a.y)) * 180) / Math.PI;
      const rot = ang > 90 || ang < -90 ? ang + 180 : ang;
      const mx = (sx(a.y) + sx(b.y)) / 2;
      const my = (sy(a.x) + sy(b.x)) / 2;
      t(mx, my - 0.8, fix(distance(a, b), 2), 2.4, `text-anchor="middle" transform="rotate(${rot.toFixed(1)} ${mx.toFixed(2)} ${my.toFixed(2)})"`);
    }
  // Helyrajzi számok: a megszűnő áthúzva, az új vastagon.
  const afterH = new Set(input.after.map((p) => p.hrsz));
  const beforeH = new Set(input.before.map((p) => p.hrsz));
  for (const p of input.before)
    if (!afterH.has(p.hrsz)) {
      const c = centroid(p.ring);
      // A felirat helye: a belső pont közelében az első, amely nem esik új határvonalra (a felirat fél szélessége + 1,5 mm).
      const segDist = (px: number, py: number, a: NamedPt, b: NamedPt) => {
        const ax = sx(a.y), ay = sy(a.x), bx = sx(b.y), by = sy(b.x);
        const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
        const u = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2));
        return Math.hypot(ax + u * (bx - ax) - px, ay + u * (by - ay) - py);
      };
      const spots: [number, number][] = [[0, 6], [0, -8], [9, 2], [-9, 2], [0, 12], [12, 6], [-12, 6]];
      const clear = (p.hrsz.length * 1.8) / 2 + 1.5;
      const free = spots.find(([dx, dy]) => lengths.every(([a, b]) => segDist(sx(c.y) + dx, sy(c.x) + dy - 1, a, b) >= clear)) ?? spots[0]!;
      const x = sx(c.y) + free[0];
      const y = sy(c.x) + free[1];
      t(x, y, p.hrsz, 3.2, 'text-anchor="middle" fill="#555"');
      const w = p.hrsz.length * 1.8;
      out.push(`<line x1="${(x - w / 2).toFixed(2)}" y1="${(y - 1).toFixed(2)}" x2="${(x + w / 2).toFixed(2)}" y2="${(y - 1).toFixed(2)}" stroke="#000" stroke-width="0.6"/>`);
    }
  const obstacles = (input.drawing ?? []).flatMap((d) => (d.kind === 'building' ? [d.ring] : []));
  for (const p of input.after) {
    const c = labelPoint(p.ring, obstacles);
    // A címkoordináta jele a földrészlet belső pontján áll, a helyrajzi szám fölötte.
    t(sx(c.y), sy(c.x) - 2.5, p.hrsz, 3.4, `text-anchor="middle"${beforeH.has(p.hrsz) ? '' : ' font-weight="bold"'}`);
  }
  // Rajzelemek: épületek, alrészletek, vonalak, feliratok
  const hasNewSubs = (input.drawing ?? []).some((d) => d.kind === 'sub' && d.isNew);
  for (const d of input.drawing ?? []) {
    if (d.kind === 'building')
      poly(d.ring, true, d.type === 'new' ? 'stroke="#000" stroke-width="0.5"' : d.type === 'old' ? 'stroke="#000" stroke-width="0.2" stroke-dasharray="1 0.8"' : d.type === 'wall' ? 'stroke="#000" stroke-width="0.18" stroke-dasharray="1.5 0.5"' : 'stroke="#000" stroke-width="0.25"');
    else if (d.kind === 'sub') {
      // Ha van kialakuló alrészlet, a meglévők megszűnnek: betűjelük és művelési águk áthúzva (19. melléklet 2. b)).
      const ending = !d.isNew && hasNewSubs;
      poly(d.ring, true, `stroke="#000" stroke-width="${d.isNew ? 0.35 : 0.18}" stroke-dasharray="${d.isNew ? '1 0.6' : '0.5 0.5'}"`);
      const c = labelPoint(d.ring, obstacles);
      const lx = sx(c.y);
      const ly = sy(c.x) + (ending ? 11 : 4);
      t(lx, ly, d.letter, 3, `text-anchor="middle" font-style="italic"${d.isNew ? ' font-weight="bold"' : ending ? ' fill="#555"' : ''}`);
      t(lx, ly + 3.5, landUseLabel(d.use), 2.4, `text-anchor="middle"${d.isNew ? ' font-weight="bold"' : ending ? ' fill="#555"' : ''}`);
      if (ending) {
        const w = Math.max(landUseLabel(d.use).length * 1.4, 3);
        out.push(`<line x1="${(lx - w / 2).toFixed(2)}" y1="${(ly - 1).toFixed(2)}" x2="${(lx + w / 2).toFixed(2)}" y2="${(ly + 2.6).toFixed(2)}" stroke="#000" stroke-width="0.4"/>`);
      }
    } else if (d.kind === 'polyline') poly(d.pts, false, `stroke="#000" stroke-width="0.18"${d.layer === 'fence' ? ' stroke-dasharray="2 1"' : d.layer === 'servitude' ? ' stroke-dasharray="3 1"' : ''}`);
    else {
      const size = d.layer === 'houseNo' ? 2.4 : 2.8;
      const x = sx(d.at.y);
      const y = sy(d.at.x);
      t(x, y, d.text, size, `text-anchor="middle"${d.layer === 'street' || d.layer === 'place' ? ' font-style="italic"' : ''}${d.rotation ? ` transform="rotate(${(-d.rotation).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})"` : ''}`);
    }
  }
  // Pontok és pontszámok
  const seen = new Set<string>();
  // A földrészletek és a rajzelemek (épület, alrészlet, vonal) töréspontjai.
  const drawingPts = (input.drawing ?? []).flatMap((d) => (d.kind === 'building' || d.kind === 'sub' ? d.ring : d.kind === 'polyline' ? d.pts : []));
  for (const p of [...all, ...drawingPts]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const measured = input.measured?.has(p.id);
    out.push(
      measured
        ? `<rect x="${(sx(p.y) - 0.8).toFixed(2)}" y="${(sy(p.x) - 0.8).toFixed(2)}" width="1.6" height="1.6" fill="#000"/>`
        : `<circle cx="${sx(p.y).toFixed(2)}" cy="${sy(p.x).toFixed(2)}" r="0.6" fill="#fff" stroke="#000" stroke-width="0.25"/>`,
    );
    t(sx(p.y) + 1, sy(p.x) - 1, p.id, 2);
  }
  // Címkoordináták (jelkulcs: kereszt körben)
  for (const a of input.address) {
    const x = sx(a.y);
    const y = sy(a.x);
    out.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.2" fill="none" stroke="#000" stroke-width="0.25"/>`);
    out.push(`<path d="M ${(x - 1.2).toFixed(2)} ${y.toFixed(2)} h 2.4 M ${x.toFixed(2)} ${(y - 1.2).toFixed(2)} v 2.4" stroke="#000" stroke-width="0.2"/>`);
    t(x + 1.5, y + 2.5, a.id, 2);
  }
  out.push('</g>');
  // Északjel
  const nx = frame.x + frame.w - 8;
  const ny = frame.y + 12;
  out.push(`<path d="M ${nx} ${ny - 7} l 2.5 7 l -2.5 -2 l -2.5 2 z" fill="#000"/>`);
  t(nx, ny + 4, 'É', 3, 'text-anchor="middle"');

  // Területkimutatás és címkoordináták
  let y = frame.y + frame.h + 6;
  if (tpl.areaTable) {
    t(M, y, 'Területkimutatás', 3.2, 'font-weight="bold"');
    y += 4.5;
    t(M, y, 'Változás előtt', 2.6, 'font-weight="bold"');
    t(M + 95, y, 'Változás után', 2.6, 'font-weight="bold"');
    const bs = [...input.before].sort((p, q) => byNumber(p.hrsz, q.hrsz));
    const as = [...input.after].sort((p, q) => byNumber(p.hrsz, q.hrsz));
    const n = Math.max(bs.length, as.length);
    for (let i = 0; i < Math.min(n, 8); i++) {
      y += 3.8;
      const b = bs[i];
      const a = as[i];
      if (b) {
        t(M, y, b.hrsz, 2.6);
        t(M + 70, y, `${m2(b.area)} m²`, 2.6, 'text-anchor="end"');
      }
      if (a) {
        t(M + 95, y, a.hrsz, 2.6, afterH.has(a.hrsz) && !beforeH.has(a.hrsz) ? 'font-weight="bold"' : '');
        t(M + 165, y, `${m2(a.area)} m²`, 2.6, 'text-anchor="end"');
      }
    }
    y += 4.5;
    const sumB = input.before.reduce((s, p) => s + (p.area ?? 0), 0);
    const sumA = input.after.reduce((s, p) => s + (p.area ?? 0), 0);
    t(M, y, 'Összesen', 2.6, 'font-weight="bold"');
    t(M + 70, y, `${m2(sumB)} m²`, 2.6, 'text-anchor="end" font-weight="bold"');
    t(M + 165, y, `${m2(sumA)} m²`, 2.6, 'text-anchor="end" font-weight="bold"');
    if (input.address.length > 0) {
      y += 6;
      t(M, y, 'Címkoordináták', 2.8, 'font-weight="bold"');
      for (const a of input.address.slice(0, 6)) {
        y += 3.6;
        t(M, y, `${a.hrsz}   ${a.id}   Y = ${fix(a.y, 0)}   X = ${fix(a.x, 0)}`, 2.5);
      }
    }
  }

  // Lábrész (15. melléklet 4. pont, illetve 10. melléklet 3. pont)
  const fy = H - M - 38;
  out.push(`<rect x="${M}" y="${fy}" width="${W - 2 * M}" height="38" fill="none" stroke="#000" stroke-width="0.3"/>`);
  out.push(`<line x1="${M + 95}" y1="${fy}" x2="${M + 95}" y2="${fy + 38}" stroke="#000" stroke-width="0.2"/>`);
  let fl = fy + 5;
  for (const line of tpl.footer) {
    if (line === '§sign') {
      // A tulajdonosok aláírásának helye
      fl += 6;
      t(M + 2, fl, '..................................', 2.4);
      t(M + 50, fl, '..................................', 2.4);
    } else if (line) t(M + 2, fl, line, 2.5, /nem alkalmas/.test(line) ? 'font-style="italic"' : '');
    fl += 4.5;
  }
  if (kind === 'sketch') t(M + 2, Math.max(fl, fy + 20), '■ mért pont   ○ számított / átvett pont', 2.4);
  if (tpl.stampBox) t(M + 97, fy + 5, tpl.stampBox, 2.6, 'font-weight="bold"');
  t(M + 2, fy + 30, `Készült: ${meta.hely} ${meta.datum}`, 2.6);
  t(M + 2, fy + 35, `${meta.keszito}  ·  földmérő ig. sz.: ${meta.igazolvany}${meta.minosites ? `  ·  IRF minősítés: ${meta.minosites}` : ''}`, 2.4);
  t(M + 97, fy + 35, 'aláírás, bélyegző', 2.2, 'fill="#555"');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">` +
    `<defs><clipPath id="frame"><rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}"/></clipPath></defs>` +
    `<rect width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  return { svg, scale };
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
    else e.push({ type: 'text', layer: d.layer, at: d.at, text: d.text, height: d.layer === 'houseNo' ? 2 : 2.5, rotation: d.rotation, align: 'center' });
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
