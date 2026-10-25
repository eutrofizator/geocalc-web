import type { Pt } from './geometry';
import { mtextPlain, parseDxfEntities, type DxfEntity } from './land-office';
import type { NamedPt } from './parcel';

/**
 * Egy tetszőleges (ASCII) DXF rajz megjelenítéshez: vonalak, vonalláncok, körök, ívek, feliratok és
 * pontszerű elemek (INSERT, POINT) fóliánként. A DXF 10-es csoportkódja az Y (kelet), a 20-as az X
 * (észak), mint a földhivatali térképeken. Az ívek és körök 5°-os húrokkal közelítve, a vonalláncok
 * íves szakaszai (bulge) egyenesként.
 */

export type DxfItem =
  | { kind: 'path'; layer: string; pts: Pt[]; closed: boolean; curve?: boolean }
  | { kind: 'text'; layer: string; at: Pt; text: string; height: number; rotation: number }
  | { kind: 'point'; layer: string; at: Pt; block: string };

export interface DxfDrawing {
  items: DxfItem[];
  /** A fóliák az elemszámukkal, név szerint rendezve. */
  layers: { name: string; count: number }[];
  /** A rajz befoglaló téglalapja (null, ha nincs megjeleníthető elem). */
  bounds: { minY: number; minX: number; maxY: number; maxX: number } | null;
  /** A pontszámmal ellátott pontok (pl. BHP + BHP_SZ: a pontszerű elem és a „_SZ” fólia 2 m-en belüli felirata). */
  named: NamedPt[];
  warnings: string[];
}

const num = (e: DxfEntity, code: number, def = NaN) => {
  const v = e.codes.find(([c]) => c === code)?.[1];
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : def;
};
const str = (e: DxfEntity, code: number) => e.codes.find(([c]) => c === code)?.[1] ?? '';
const at = (e: DxfEntity, cy = 10, cx = 20): Pt | null => {
  const y = num(e, cy);
  const x = num(e, cx);
  return Number.isFinite(y) && Number.isFinite(x) ? { y, x } : null;
};

function vertices(e: DxfEntity): Pt[] {
  const out: Pt[] = [];
  let y: number | null = null;
  for (const [c, v] of e.codes) {
    if (c === 10) y = Number(v);
    else if (c === 20 && y !== null) {
      const x = Number(v);
      if (Number.isFinite(y) && Number.isFinite(x)) out.push({ y, x });
      y = null;
    }
  }
  return out;
}

/** Körív pontjai (a szögek fokban, az Y tengelytől az óramutatóval ellentétesen, a DXF szerint). */
function arc(c: Pt, r: number, from: number, to: number): Pt[] {
  let span = to - from;
  while (span <= 0) span += 360;
  const n = Math.max(2, Math.ceil(span / 5));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((from + (span * i) / n) * Math.PI) / 180;
    out.push({ y: c.y + r * Math.cos(a), x: c.x + r * Math.sin(a) });
  }
  return out;
}

export function readDxfDrawing(text: string): DxfDrawing {
  const ents = parseDxfEntities(text);
  const items: DxfItem[] = [];
  const warnings: string[] = [];
  const skipped = new Map<string, number>();
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]!;
    const layer = e.layer || '0';
    switch (e.type) {
      case 'LINE': {
        const a = at(e);
        const b = at(e, 11, 21);
        if (a && b) items.push({ kind: 'path', layer, pts: [a, b], closed: false });
        break;
      }
      case 'LWPOLYLINE': {
        const pts = vertices(e);
        if (pts.length >= 2) items.push({ kind: 'path', layer, pts, closed: (num(e, 70, 0) & 1) === 1 });
        break;
      }
      case 'POLYLINE': {
        // A csúcsok a következő VERTEX elemekben, SEQEND-ig.
        const pts: Pt[] = [];
        let j = i + 1;
        for (; j < ents.length && ents[j]!.type === 'VERTEX'; j++) {
          const p = at(ents[j]!);
          if (p) pts.push(p);
        }
        if (ents[j]?.type === 'SEQEND') j++;
        i = j - 1;
        if (pts.length >= 2) items.push({ kind: 'path', layer, pts, closed: (num(e, 70, 0) & 1) === 1 });
        break;
      }
      case 'CIRCLE':
      case 'ARC': {
        const c = at(e);
        const r = num(e, 40);
        if (!c || !(r > 0)) break;
        const full = e.type === 'CIRCLE';
        items.push({ kind: 'path', layer, pts: arc(c, r, full ? 0 : num(e, 50, 0), full ? 360 : num(e, 51, 360)), closed: full, curve: true });
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const p = at(e);
        const s = e.type === 'MTEXT' ? mtextPlain(e.codes.filter(([c]) => c === 3 || c === 1).map(([, v]) => v).join('')) : str(e, 1).trim();
        if (p && s) items.push({ kind: 'text', layer, at: p, text: s, height: num(e, 40, 1), rotation: num(e, 50, 0) });
        break;
      }
      case 'INSERT':
      case 'POINT': {
        const p = at(e);
        if (p) items.push({ kind: 'point', layer, at: p, block: e.type === 'INSERT' ? str(e, 2).trim() : '' });
        break;
      }
      case 'VERTEX':
      case 'SEQEND':
        break;
      default:
        skipped.set(e.type, (skipped.get(e.type) ?? 0) + 1);
    }
  }
  if (skipped.size > 0)
    warnings.push(`Nem megjelenített DXF-elemek: ${[...skipped].map(([t, n]) => `${t} (${n})`).join(', ')}.`);
  const counts = new Map<string, number>();
  let b: DxfDrawing['bounds'] = null;
  const grow = (p: Pt) => {
    if (!b) b = { minY: p.y, minX: p.x, maxY: p.y, maxX: p.x };
    else {
      b.minY = Math.min(b.minY, p.y);
      b.minX = Math.min(b.minX, p.x);
      b.maxY = Math.max(b.maxY, p.y);
      b.maxX = Math.max(b.maxX, p.x);
    }
  };
  for (const it of items) {
    counts.set(it.layer, (counts.get(it.layer) ?? 0) + 1);
    if (it.kind === 'path') it.pts.forEach(grow);
    else grow(it.at);
  }
  if (items.length === 0) warnings.push('A DXF-ben nincs megjeleníthető elem (ENTITIES szakasz).');
  return {
    items,
    layers: [...counts].map(([name, count]) => ({ name, count })).sort((p, q) => p.name.localeCompare(q.name, 'hu', { numeric: true })),
    bounds: b,
    named: namedPoints(items),
    warnings,
  };
}

/** A pontszerű elemek pontszáma: a fólia „_SZ” párjának legközelebbi, 2 m-en belüli felirata. */
function namedPoints(items: DxfItem[]): NamedPt[] {
  const texts = new Map<string, { at: Pt; text: string }[]>();
  for (const it of items) if (it.kind === 'text') texts.set(it.layer, [...(texts.get(it.layer) ?? []), it]);
  const out: NamedPt[] = [];
  const used = new Set<string>();
  for (const it of items) {
    if (it.kind !== 'point') continue;
    let best: { d: number; s: string } | null = null;
    for (const t of texts.get(`${it.layer}_SZ`) ?? []) {
      const d = Math.hypot(t.at.y - it.at.y, t.at.x - it.at.x);
      if (d < 2 && (!best || d < best.d)) best = { d, s: t.text };
    }
    if (!best || used.has(best.s)) continue;
    used.add(best.s);
    out.push({ id: best.s, y: it.at.y, x: it.at.x });
  }
  return out;
}

export interface PointMatch {
  id: string;
  y: number;
  x: number;
  /** A legközelebbi DXF pont (pontszám vagy „töréspont”), ha a keresési sugáron belül van. */
  near: { name: string; y: number; x: number; dist: number } | null;
}

/**
 * A saját pontok legközelebbi DXF pontja: a pontszámos határpontok, a pontszerű elemek és a vonalak
 * töréspontjai közül, a megadott sugáron belül (m).
 */
export function matchPoints(drawing: DxfDrawing, own: NamedPt[], radius: number): PointMatch[] {
  const cand: { name: string; y: number; x: number }[] = drawing.named.map((p) => ({ name: p.id, y: p.y, x: p.x }));
  const seen = new Set(cand.map((p) => `${p.y.toFixed(2)}:${p.x.toFixed(2)}`));
  const add = (p: Pt) => {
    const k = `${p.y.toFixed(2)}:${p.x.toFixed(2)}`;
    if (seen.has(k)) return;
    seen.add(k);
    cand.push({ name: '', y: p.y, x: p.x });
  };
  for (const it of drawing.items) {
    if (it.kind === 'point') add(it.at);
    else if (it.kind === 'path' && !it.curve) it.pts.forEach(add);
  }
  return own.map((p) => {
    let best: PointMatch['near'] = null;
    for (const c of cand) {
      const d = Math.hypot(c.y - p.y, c.x - p.x);
      if (d <= radius && (!best || d < best.dist)) best = { name: c.name, y: c.y, x: c.x, dist: d };
    }
    return { id: p.id, y: p.y, x: p.x, near: best };
  });
}
