/**
 * A térbeli transzformáció kiegészítő eljárásai (súgó 64–65. o.):
 *
 *  - **Keresősugár**: minden egyes átszámítandó ponthoz külön-külön kiválasztja a közös pontok
 *    állományából a megadott sugarú környezetben lévő pontokat, és azokból számolja a
 *    transzformációs paramétereket. Így annyi paraméterkészlet keletkezik, ahány pontot átszámítunk.
 *  - **Kétlépcsős módszer**: egy (pl. GPS-ből ismert és szintezett magasságú) pont átszámítása után a
 *    pont a közös pontok listájára fűzhető, hogy a további (3D) transzformációban már ismert pontként
 *    szerepeljen.
 */

import { CalcError } from '../errors';
import { SYSTEMS } from './systems';
import { spatialTransform, type SpatialRequest } from './spatial';
import type { Row, Section } from '../types';

const fixed = (n: number, d: number) => {
  const s = n.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
};

const PARAM_DIGITS = [4, 4, 4, 5, 5, 5, 2];

const dist3 = (a: number[], b: number[]): number =>
  Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));

export interface RadiusPointResult {
  id: string;
  /** A kiválasztott közös pontok száma. */
  count: number;
  /** A kiválasztott közös pontok azonosítói, a legközelebbitől. */
  common: string[];
  input: string[];
  output: string[];
  /** A ponthoz tartozó transzformációs paraméterek. */
  params: number[];
}

/** A Helmert-paraméterek sorrendje és egységei (a `spatialTransform` összegzésével egyezően). */
export const PARAM_LABELS = ['Eltolás X', 'Eltolás Y', 'Eltolás Z', 'Forgatás X', 'Forgatás Y', 'Forgatás Z', 'Méretarány'];
export const PARAM_UNITS = ['m', 'm', 'm', '″', '″', '″', 'mm/km'];

export interface RadiusResult {
  radius: number;
  points: RadiusPointResult[];
  /** A kiválasztott közös pont kevés volt (a sugár túl kicsi). */
  failed: { id: string; reason: string }[];
  sections: Section[];
}

/**
 * Keresősugaras átszámítás. A távolságot a kiinduló rendszer geocentrikus koordinátáiban méri
 * (vetületi rendszereknél is méterben), a sugár megadása méterben történik.
 */
export function transformWithRadius(req: SpatialRequest, radius: number): RadiusResult {
  if (!(radius > 0)) throw new CalcError('A keresősugár pozitív érték kell legyen.');
  const src = SYSTEMS[req.from];
  const dst = SYSTEMS[req.to];
  const byIdTo = new Map(req.commonTo.map((p) => [p.id, p] as const));
  const commons = req.commonFrom.filter((p) => byIdTo.has(p.id));
  if (commons.length < 3) {
    throw new CalcError(`A közös pontok száma (${commons.length}) kevés: legalább 3 azonos pontszámú pont kell mindkét rendszerben.`);
  }
  const commonXyz = commons.map((p) => src.toGeocentric(p.coords, req.twoD));

  const points: RadiusPointResult[] = [];
  const failed: { id: string; reason: string }[] = [];
  for (const p of req.points) {
    const xyz = src.toGeocentric(p.coords, req.twoD);
    const near = commons
      .map((c, i) => ({ c, d: dist3(commonXyz[i]!, xyz), to: byIdTo.get(c.id)! }))
      .filter((x) => x.d <= radius)
      .sort((a, b) => a.d - b.d);
    if (near.length < 3) {
      failed.push({
        id: p.id,
        reason: `A ${fixed(radius, 0)} m-es környezetben csak ${near.length} közös pont van; a transzformációhoz legalább 3 kell.`,
      });
      continue;
    }
    const one = spatialTransform({ ...req, points: [p], commonFrom: near.map((x) => x.c), commonTo: near.map((x) => x.to) });
    points.push({
      id: p.id,
      count: near.length,
      common: near.map((x) => x.c.id),
      input: src.format(p.coords),
      output: dst.format(one.convertedValues[0]!.coords),
      params: [...one.summary.values],
    });
  }

  const outCols = SYSTEMS[req.to].columns;
  const sections: Section[] = [];
  sections.push({
    kind: 'radius-points',
    title: `Keresősugaras átszámítás (${SYSTEMS[req.from].label} → ${SYSTEMS[req.to].label})`,
    columns: ['Pontszám', 'Közös pont', ...SYSTEMS[req.from].columns, ...outCols],
    rows: points.map<Row>((p) => ({ cells: [p.id, String(p.count), ...p.input, ...p.output], role: 'result' })),
    footer: [
      `Keresősugár: ${fixed(radius, 0)} m. Minden pont a saját ${fixed(radius, 0)} m-es környezetében lévő közös pontokból számolt paraméterekkel transzformálva.`,
    ],
  });
  if (points.length > 0) {
    sections.push({
      kind: 'radius-params',
      title: 'A pontonként számított transzformációs paraméterek',
      columns: ['Pontszám', ...PARAM_LABELS],
      rows: points.map<Row>((p) => ({
        cells: [p.id, ...p.params.map((v, i) => fixed(v, PARAM_DIGITS[i]!))],
        role: 'base',
      })),
      footer: [
        `Egységek: ${PARAM_LABELS.map((l, i) => `${l} [${PARAM_UNITS[i]}]`).join(', ')}.`,
        'Keresősugárnál annyi paraméterkészlet készül, ahány pontot átszámítunk; mentéskor csak a kiválasztott ponté.',
      ],
    });
  }
  if (failed.length > 0) {
    sections.push({
      kind: 'radius-failed',
      title: 'Nem számítható pontok',
      columns: ['Pontszám', 'Ok'],
      rows: failed.map<Row>((f) => ({ cells: [f.id, f.reason], role: 'base' })),
    });
  }
  return { radius, points, failed, sections };
}

export interface TwoStepResult {
  id: string;
  /** A közös pontok listájára fűzendő sor a kiinduló rendszerben. */
  fromLine: string;
  /** A közös pontok listájára fűzendő sor a cél rendszerben (a szintezett magassággal). */
  toLine: string;
}

/**
 * Kétlépcsős módszer: a kijelölt pont átszámítása, majd a közös pontokra fűzhető sorok előállítása.
 * A cél rendszerben a magasság helyére a megadott (pl. szintezésből ismert) magasság kerül, így a
 * transzformációt nem terheli a magasság bizonytalansága.
 */
export function twoStepCommon(req: SpatialRequest, id: string, height: number | null): TwoStepResult {
  const src = SYSTEMS[req.from];
  const dst = SYSTEMS[req.to];
  const p = req.points.find((x) => x.id === id) ?? req.commonFrom.find((x) => x.id === id);
  if (!p) throw new CalcError(`A(z) ${id} pont nincs az átszámítandó pontok között.`);
  const one = spatialTransform({ ...req, points: [p] });
  const out = [...one.convertedValues[0]!.coords];
  if (height !== null) {
    if (out.length < 3) throw new CalcError('A célrendszernek nincs magasság koordinátája.');
    out[2] = height;
  }
  return {
    id,
    fromLine: [p.id, ...src.format(p.coords)].join(' '),
    toLine: [p.id, ...dst.format(out)].join(' '),
  };
}

/** Sor hozzáfűzése egy koordináta-listához (a meglévő tartalom megtartásával). */
export function appendLine(text: string, line: string): string {
  const t = text.replace(/\s+$/, '');
  return t === '' ? `${line}\r\n` : `${t}\r\n${line}\r\n`;
}
