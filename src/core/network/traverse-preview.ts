/**
 * Sokszögvonal-előzetes az álláspontok listájából (súgó 55. o.).
 *
 * A hálózat előzetes koordinátáinak számításához a programban a kijelölt sokszögvonalból indulhatunk ki.
 * Az álláspontok listájában az óramutató járásával egyező értelemben kijelölt pontokból a jegyzőkönyv
 * az egyes pontokon mért hátra- és előreirányokat (Hz), a belőlük számított törésszöget (dHZ), az
 * „oda-vissza” mért távolságokat (T(1), T(2)), továbbá a szög- és vonalas záróhibát adja.
 *
 *  - **Kétoldalt csatlakozó (beillesztett) vonal**: a sorrend első pontja ismert, a végpont ismert.
 *    Két ismert pontból a kezdő irányszög adott; ha a végén két ismert pont van, a szögzáró hiba is
 *    számítható.
 *  - **Zárt poligon**: a sorrend utolsó pontja megegyezik az elsővel; a szögzáró hiba a törésszögek
 *    összegéből (elméletileg 360°) adódik, a vonalas záróhiba pedig a kezdőpontra való visszatérésből.
 */

import { formatDms, normDeg, wrapDeg } from '../angle';
import { CalcError } from '../errors';
import { fix } from '../format';
import { linearTolerance } from '../modules/traverse';
import type { Row, Section } from '../types';
import { robustOrientation, type Pt } from './preliminary';
import type { NetStation } from './types';

const c3 = (n: number) => fix(n, 3);
const RAD = Math.PI / 180;
const azimuthIn = (a: Pt, b: Pt) => normDeg(Math.atan2(b.y - a.y, b.x - a.x) / RAD);
/** −180°…180° közé szorítás. */
const pm180 = (deg: number) => normDeg(deg + 180) - 180;

export interface TraverseVertex {
  id: string;
  /** A hátrairány (az előző pont felé) leolvasása [fok]. */
  back: number | null;
  /** Az előreirány (a következő pont felé) leolvasása [fok]. */
  forward: number | null;
  /** A belőlük számított törésszög [fok]. */
  dHz: number | null;
  /** A következő pontra mért távolság ezen az állásponton [m]. */
  t1: number | null;
  /** Ugyanaz a visszairányból mérve [m]. */
  t2: number | null;
  /** Az ebből a pontból kiinduló szakasz javított irányszöge [fok]. */
  azimuth: number | null;
  /** Az ebből a pontból kiinduló szakasz hossza [m]. */
  length: number | null;
}

export interface TraversePreview {
  order: string[];
  closed: boolean;
  vertices: TraverseVertex[];
  points: { id: string; y: number; x: number; known: boolean }[];
  /** Szögzáró hiba [″] (a mérési eredményhez adandó javítás); null, ha nem számítható. */
  angularClosure: number | null;
  /** Vonalas záróhiba; null, ha a zárópont nem ismert. */
  linear: { dy: number; dx: number; length: number; totalLength: number; allowed: number } | null;
  sections: Section[];
}

export function traversePreview(
  order: string[],
  known: Map<string, Pt>,
  stations: NetStation[],
  orientationThresholdArcsec = 600,
): TraversePreview {
  const closed = order.length >= 4 && order[order.length - 1] === order[0];
  const pts = closed ? order.slice(0, -1) : [...order];
  if (pts.length < 3) throw new CalcError('A sokszögvonalhoz legalább három pont kell (kezdő-, sokszög- és végpont).');
  const seen = new Set<string>();
  for (const id of pts) {
    if (seen.has(id)) throw new CalcError(`A(z) ${id} pontszám többször szerepel a sokszögvonalban.`);
    seen.add(id);
  }
  const m = pts.length;
  const legCount = closed ? m : m - 1;

  const reading = (from: string, to: string): { hz: number | null; dist: number | null } => {
    const st = stations.find((s) => s.id === from);
    const o = st?.observations.find((x) => x.target === to);
    return { hz: o ? o.hz : null, dist: o ? o.distance ?? o.horizontal ?? o.slope ?? null : null };
  };
  const need = (value: number | null, what: string): number => {
    if (value === null) throw new CalcError(what);
    return value;
  };

  // --- Kezdő irányszög
  const first = pts[0]!;
  const second = pts[1]!;
  const k0 = known.get(first);
  let az0: number;
  let azNote: string;
  if (k0 && known.has(second)) {
    az0 = azimuthIn(k0, known.get(second)!);
    azNote = `A kezdő irányszög a(z) ${first}–${second} ismert pontokból: ${formatDms(az0)}.`;
  } else {
    if (!k0 && !closed) throw new CalcError(`A(z) ${first} kezdőpont koordinátája nem ismert.`);
    const st = stations.find((s) => s.id === first);
    const rd = need(reading(first, second).hz, `A(z) ${first} ponton nincs mért irány a(z) ${second} pontra.`);
    let zk = 0;
    let oriented = false;
    if (k0 && st) {
      const threshold = (orientationThresholdArcsec / 3600) * RAD;
      const zi = st.observations
        .filter((o) => known.has(o.target))
        .map((o) => Math.atan2(known.get(o.target)!.y - k0.y, known.get(o.target)!.x - k0.x) - o.hz * RAD);
      const rob = robustOrientation(zi, threshold);
      if (rob) {
        zk = rob.zk;
        oriented = true;
      }
    }
    az0 = normDeg(rd + zk / RAD);
    azNote = oriented
      ? `A kezdő irányszög a(z) ${first} pont tájékozásából: ${formatDms(az0)}.`
      : `A kezdő irányszög a(z) ${first} pont első leolvasása szerint (tájékozatlan vonal): ${formatDms(az0)}.`;
  }

  // --- Szakaszok (nyers irányszögek) és törésszögek
  const rawAz: number[] = [];
  for (let i = 0; i < legCount; i++) {
    if (i === 0) {
      rawAz.push(az0);
      continue;
    }
    const from = pts[i]!;
    const back = need(reading(from, pts[i - 1]!).hz, `A(z) ${from} ponton hiányzik a hátrairány leolvasása.`);
    const fwd = need(reading(from, pts[(i + 1) % m]!).hz, `A(z) ${from} ponton hiányzik az előreirány leolvasása.`);
    rawAz.push(normDeg(rawAz[i - 1]! + 180 + normDeg(fwd - back)));
  }

  const vertices: TraverseVertex[] = pts.map((id, j) => {
    const hasBack = closed || j > 0;
    const hasFwd = closed || j < m - 1;
    const prevId = hasBack ? pts[(j - 1 + m) % m]! : null;
    const nextId = hasFwd ? pts[(j + 1) % m]! : null;
    const back = prevId ? reading(id, prevId).hz : null;
    const fwd = nextId ? reading(id, nextId).hz : null;
    const t1 = nextId ? reading(id, nextId).dist : null;
    const t2 = nextId ? reading(nextId, id).dist : null;
    return {
      id,
      back,
      forward: fwd,
      dHz: back !== null && fwd !== null ? normDeg(fwd - back) : null,
      t1,
      t2,
      azimuth: nextId === null ? null : rawAz[j]!,
      length: nextId === null ? null : t1 ?? t2,
    };
  });
  for (const v of vertices) {
    if (v.forward !== null && v.length === null) {
      throw new CalcError(`A(z) ${v.id} pontról nincs mért távolság a következő pontra.`);
    }
  }
  const legs = vertices.filter((v) => v.length !== null) as (TraverseVertex & { length: number; azimuth: number })[];

  // --- Szögzáró hiba
  let angularClosure: number | null = null;
  let angleCount = 0;
  if (closed) {
    const sum = vertices.reduce((a, v) => a + (v.dHz ?? 0), 0);
    angularClosure = pm180(360 - sum) * 3600; // a törésszögek összegének 360°-ot kell adnia
    angleCount = m;
  } else if (known.has(pts[m - 1]!) && known.has(pts[m - 2]!)) {
    const knownEnd = azimuthIn(known.get(pts[m - 2]!)!, known.get(pts[m - 1]!)!);
    angularClosure = wrapDeg(knownEnd - rawAz[legCount - 1]!) * 3600;
    angleCount = m - 2;
  }
  // A szögzáró hiba a törésszögekhez adandó javítás; az utolsó szakasz irányszöge az összes
  // megelőző törésszöget összegzi, ezért a „perAngle”-t minden törésszögre egyszer adjuk.
  const perAngle = angularClosure !== null && angleCount > 0 ? angularClosure / 3600 / angleCount : 0;
  const azimuths = rawAz.map((a, i) => normDeg(a + i * perAngle));
  vertices.forEach((v, i) => {
    if (v.azimuth !== null && i < azimuths.length) v.azimuth = azimuths[i]!;
  });

  // --- Vonalas záróhiba
  const total = legs.reduce((a, v) => a + v.length, 0);
  if (total <= 0) throw new CalcError('A sokszögvonal hossza nulla.');
  const deltas = legs.map((v, i) => ({
    dy: v.length * Math.sin(azimuths[i]! * RAD),
    dx: v.length * Math.cos(azimuths[i]! * RAD),
  }));
  const start = k0 ?? { y: 0, x: 0 };
  const computed = deltas.reduce((a, d) => ({ y: a.y + d.dy, x: a.x + d.dx }), { y: start.y, x: start.x });
  const endId = closed ? first : pts[m - 1]!;
  const endKnown = closed ? k0 : known.get(endId);
  let linear: TraversePreview['linear'] = null;
  const adj = deltas.map((d, i) => ({ ...d }));
  if (endKnown) {
    const dy = endKnown.y - computed.y;
    const dx = endKnown.x - computed.x;
    linear = { dy, dx, length: Math.hypot(dy, dx), totalLength: total, allowed: linearTolerance(total) };
    deltas.forEach((d, i) => {
      adj[i] = { dy: d.dy + (dy * legs[i]!.length) / total, dx: d.dx + (dx * legs[i]!.length) / total };
    });
  }
  const points: { id: string; y: number; x: number; known: boolean }[] = [{ id: first, y: start.y, x: start.x, known: k0 !== undefined }];
  {
    let y = start.y;
    let x = start.x;
    for (let i = 0; i < legs.length; i++) {
      y += adj[i]!.dy;
      x += adj[i]!.dx;
      const id = pts[(i + 1) % m]!;
      points.push({ id, y, x, known: known.has(id) });
    }
  }

  // --- Jegyzőkönyv
  const vertRows: Row[] = vertices.map<Row>((v) => ({
    cells: [
      v.id,
      v.back === null ? '' : formatDms(v.back),
      v.forward === null ? '' : formatDms(v.forward),
      v.dHz === null ? '' : formatDms(v.dHz),
      v.t1 === null ? '' : c3(v.t1),
      v.t2 === null ? '' : c3(v.t2),
      v.azimuth === null ? '' : formatDms(v.azimuth),
      v.length === null ? '' : c3(v.length),
    ],
    role: 'base',
  }));

  const notes: string[] = [azNote];
  if (angularClosure !== null) {
    notes.push(
      closed
        ? `Szögzáró hiba: ${fix(angularClosure, 0)}″ (a törésszögek összege ${formatDms(normDeg((360 - angularClosure / 3600) % 360))}, elméletileg 360°); a törésszögek között egyenletesen elosztva.`
        : `Szögzáró hiba: ${fix(angularClosure, 0)}″ (a törésszögek között egyenletesen elosztva).`,
    );
  } else {
    notes.push('A szögzáró hiba nem számítható: a végirány nem ismert (a végponton nincs ismert irányzott pont).');
  }
  if (linear) {
    notes.push(
      `Vonalas záróhiba: ${c3(linear.length)} m (ΔY = ${c3(linear.dy)} m, ΔX = ${c3(linear.dx)} m); ` +
        `a vonal hossza ${c3(linear.totalLength)} m, megengedett ${c3(linear.allowed)} m.`,
    );
  } else {
    notes.push(`Vonalas záróhiba: nem számítható (a ${endId} zárópont koordinátája nem ismert).`);
  }

  const sections: Section[] = [
    {
      kind: 'traverse-vertices',
      title: closed ? 'Zárt poligon előírása' : 'Sokszögvonal-előzetes – a vonal előírása',
      columns: ['Pontszám', 'Hátra (Hz)', 'Előre (Hz)', 'dHZ', 'T(1) [m]', 'T(2) [m]', 'Irányszög', 'Hossz [m]'],
      rows: vertRows,
      footer: notes,
    },
    {
      kind: 'traverse-points',
      title: 'Sokszögvonal-előzetes – előzetes koordináták',
      columns: ['Pontszám', 'Y', 'X', 'Megjegyzés'],
      rows: points
        .filter((p, i) => !(closed && i === points.length - 1))
        .map<Row>((p) => ({ cells: [p.id, c3(p.y), c3(p.x), p.known ? 'ismert' : 'előzetes'], role: p.known ? 'base' : 'result' })),
      footer: [
        'Az előzetes koordináták a mért hátra-/előreirányokból és a távolságokból számolt értékek; a hálózatkiegyenlítés ezekből indul ki.',
      ],
    },
  ];
  return { order, closed, vertices, points, angularClosure, linear, sections };
}

/** A sokszögvonal-pontok sorrendje szövegből (vessző, pontosvessző, szóköz vagy sorhatár választja el). */
export function parseTraverseOrder(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t !== '');
}
