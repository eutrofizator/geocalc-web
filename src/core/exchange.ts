/**
 * Az Adatcsere/Koordináta kezelő munkalap logikája (súgó 72. o.).
 *
 * A munkalap a GeoCalc adatbázisban tárolt koordinátákat válogatja, csoportosítja és konvertálja:
 * a mezők sorrendje és a feltétel az SQL `select` logikája szerint adható meg, a kimenet pedig a
 * mezőjellemzők (hossz, tizedesek, elválasztó) szerint készül.
 */

import { compareIds, fix } from './format';
import type { Point } from './types';

export type FieldKey = 'id' | 'y' | 'x' | 'm' | 'code';

export interface ExchangeField {
  key: FieldKey;
  label: string;
  /** A kimenetben szerepel-e. */
  enabled: boolean;
}

/** A [Mező(k)] gomb alapértelmezett oszlopai, a valódi program sorrendjében. */
export const DEFAULT_FIELDS: ExchangeField[] = [
  { key: 'id', label: 'Pontszám', enabled: true },
  { key: 'y', label: 'Y', enabled: true },
  { key: 'x', label: 'X', enabled: true },
  { key: 'm', label: 'M', enabled: true },
  { key: 'code', label: 'Kód', enabled: false },
];

export const FIELD_LABEL: Record<FieldKey, string> = {
  id: 'Pontszám',
  y: 'Y',
  x: 'X',
  m: 'M',
  code: 'Kód',
};

/** A mező alapértelmezett hossza (karakter) az exportban. */
export const FIELD_WIDTH: Record<FieldKey, number> = { id: 10, y: 12, x: 12, m: 10, code: 4 };

export type Op = '=' | '!=' | '<' | '>' | '<=' | '>=' | 'contains' | 'startsWith' | 'endsWith';

export const OPS: { op: Op; label: string }[] = [
  { op: '=', label: '=' },
  { op: '!=', label: '≠' },
  { op: '<', label: '<' },
  { op: '>', label: '>' },
  { op: '<=', label: '≤' },
  { op: '>=', label: '≥' },
  { op: 'contains', label: 'tartalmazza' },
  { op: 'startsWith', label: 'ezzel kezdődik' },
  { op: 'endsWith', label: 'ezzel végződik' },
];

export interface Condition {
  field: FieldKey;
  op: Op;
  value: string;
}

const NUMERIC: Record<FieldKey, boolean> = { id: false, y: true, x: true, m: true, code: false };

/** Egy mező értéke szövegként (a feltétel-kiértékeléshez). */
export function fieldText(p: Point, key: FieldKey): string {
  switch (key) {
    case 'id':
      return p.id;
    case 'y':
      return String(p.y);
    case 'x':
      return String(p.x);
    case 'm':
      return String(p.m ?? 0);
    case 'code':
      return p.code;
  }
}

/** Egy feltétel kiértékelése egy pontra. */
export function matches(p: Point, c: Condition): boolean {
  const left = fieldText(p, c.field);
  const right = c.value.trim();
  if (NUMERIC[c.field]) {
    const a = Number(left);
    const b = Number(right);
    if (!Number.isFinite(b)) {
      // Számmezőhöz nem szám érték: csak az egyenlőség/tartalmazás értelmezhető szövegként.
      if (c.op === '=') return left === right;
      if (c.op === '!=') return left !== right;
      if (c.op === 'contains') return left.includes(right);
      if (c.op === 'startsWith') return left.startsWith(right);
      if (c.op === 'endsWith') return left.endsWith(right);
      return true;
    }
    switch (c.op) {
      case '=':
        return a === b;
      case '!=':
        return a !== b;
      case '<':
        return a < b;
      case '>':
        return a > b;
      case '<=':
        return a <= b;
      case '>=':
        return a >= b;
      default:
        return left.includes(right);
    }
  }
  switch (c.op) {
    case '=':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      return left < right;
    case '>':
      return left > right;
    case '<=':
      return left <= right;
    case '>=':
      return left >= right;
    case 'contains':
      return left.includes(right);
    case 'startsWith':
      return left.startsWith(right);
    case 'endsWith':
      return left.endsWith(right);
  }
}

/** A pontok szűrése a feltételek szerint (SQL `WHERE` logika: `AND` vagy `OR` kapcsolat). */
export function filterPoints(points: Point[], conditions: Condition[], mode: 'and' | 'or'): Point[] {
  const active = conditions.filter((c) => c.value.trim() !== '');
  if (active.length === 0) return [...points];
  return points.filter((p) => (mode === 'and' ? active.every((c) => matches(p, c)) : active.some((c) => matches(p, c))));
}

/** Rendezés a GeoCalc szerint: pontszám szerint szövegesen (1, 10, 13, 2). */
export function sortPoints(points: Point[]): Point[] {
  return [...points].sort((a, b) => compareIds(a.id, b.id));
}

export interface FormatOptions {
  /** Elválasztó: sokszorozva a mezők közé (alapértelmezés: egy szóköz). */
  separator: string;
  decimals: number;
  /** „Üres helyeket levágni”: a beállított hossztól függetlenül, csonkolás nélkül. */
  trim: boolean;
  /** A „számított” jelző oszlop (a `K>` kimenet utolsó mezője). */
  withFlag: boolean;
  /** Mezőnkénti hossz felülírása. */
  widths?: Partial<Record<FieldKey, number>>;
}

export const DEFAULT_FORMAT: FormatOptions = { separator: ' ', decimals: 3, trim: false, withFlag: false };

export function formatValue(p: Point, key: FieldKey, decimals: number): string {
  switch (key) {
    case 'id':
      return p.id;
    case 'y':
      return fix(p.y, decimals);
    case 'x':
      return fix(p.x, decimals);
    case 'm':
      return fix(p.m ?? 0, decimals);
    case 'code':
      return p.code;
  }
}

/** Egy sor formázása a kiválasztott mezőkkel és a mezőjellemzők szerint. */
export function formatRow(p: Point, fields: ExchangeField[], opts: FormatOptions, computed?: Set<string>): string {
  const cells: string[] = [];
  for (const f of fields) {
    if (!f.enabled) continue;
    const v = formatValue(p, f.key, opts.decimals);
    if (opts.trim) {
      cells.push(v.trim());
      continue;
    }
    const w = opts.widths?.[f.key] ?? FIELD_WIDTH[f.key];
    // A szöveges mező balra, a számmezők jobbra igazodnak.
    cells.push(f.key === 'id' || f.key === 'code' ? v.padEnd(w) : v.padStart(w));
  }
  if (opts.withFlag) cells.push(computed?.has(p.id) ? '1' : '0');
  return cells.join(opts.separator);
}

/** A teljes kimenet előállítása a szűrt, rendezett pontokból. */
export function formatTable(
  points: Point[],
  fields: ExchangeField[],
  opts: FormatOptions,
  computed?: Set<string>,
): string {
  const rows = sortPoints(points).map((p) => formatRow(p, fields, opts, computed));
  return rows.length === 0 ? '' : rows.join('\r\n') + '\r\n';
}

/** A kiválasztott mezők fejléce (a felületi előnézethez). */
export function enabledFields(fields: ExchangeField[]): ExchangeField[] {
  return fields.filter((f) => f.enabled);
}
