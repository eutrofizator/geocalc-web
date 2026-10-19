import { DEG, formatDms, normDeg, parseDms, wrapDeg } from '../angle';
import { CalcError } from '../errors';
import { fix } from '../format';
import { azimuthDeg, distance } from '../geometry';
import { requireNum, splitFields } from '../parser';
import type { Block, Context, Handler, Point, Row, Section } from '../types';
import { headerFields, newPoint, requireId } from './common';

/**
 * A lineáris zárási hiba megengedett értéke (belterület): 0.048 + 0.00012·L méter.
 * A régi program két közölt értékére illesztett összefüggés (L = 1039.74 m → 0.173 m, L = 41.81 m → 0.053 m);
 * a program saját képletét a súgó nem közli.
 */
export function linearTolerance(totalLength: number): number {
  return 0.048 + 0.00012 * totalLength;
}

export interface TraverseResult {
  section: Section;
  K: Point;
  V: Point | undefined;
  vId: string | undefined;
  /** A sokszögpontok azonosítói (a kezdő- és végpont nélkül). */
  pointIds: string[];
  /** A szakaszok hossza: K→1, 1→2, …, (n→V). */
  lengths: number[];
  /** A szakaszok hossza összesen. */
  totalLength: number;
}

const c3 = (n: number) => fix(n, 3);

/**
 * Egész másodpercre kerekített szög (0 ≤ szög < 360). A GeoCalc a sokszögvonal irányszögeit és a
 * tájékozási szöget egész másodpercre kerekítve használja – a kinyomtatott értékekből így az
 * eredmény újraszámolható.
 */
function wholeSeconds(deg: number): number {
  const r = Math.round(normDeg(deg) * 3600) / 3600;
  return r >= 360 ? 0 : r;
}

/**
 * SV – sokszögvonal számítása.
 *
 *  - Kezdőpont tájékozott (TJ/ZK), a végpont ismert → beillesztett vonal: a lineáris zárási hibát
 *    a vonal hosszával arányosan osztja el.
 *  - Egyik végén sincs tájékozás, de a kezdő- és végpont ismert → tájékozatlan beillesztett vonal:
 *    a vonalat a kezdő- és végpont által adott húr irányába forgatja, a maradék hibát elosztja.
 *  - Kezdő- és végpont is tájékozott (TJ/ZK), és a végpontról az utolsó pontra mért irány is meg van adva →
 *    kétoldalt tájékozott vonal: a szögzáró hibát (ismert − számított végirány) egyenletesen osztja el a vonal
 *    szögei között, majd a lineáris zárási hibát a hosszak arányában. (Az eljárás a magyar geodéziai tankönyvek
 *    és a GeoEasy leírása szerinti szabvány szerinti; a GeoCalc súgója erre nem közöl mintát.)
 *  - Nincs végpont → nyitott vonal (kiegyenlítés nélkül), tájékozott kezdőpontból.
 */
export function computeTraverse(ctx: Context, block: Block): TraverseResult {
  const { fields, no } = headerFields(block, 'a kezdőpont és az első irány');
  const kId = requireId(fields, 'a kezdőpont száma', no);
  const K = ctx.getPoint(kId, no);
  const l1 = parseDms(fields[1] ?? '');
  const t1 = requireNum(fields[2], 'a kezdőpontról az első sokszögpontra mért távolság');
  const vId = fields[3] ? fields[3] : undefined;
  const V = vId ? ctx.getPoint(vId, no) : undefined;
  const lVn = fields[4] ? parseDms(fields[4]) : undefined;

  const pts = block.lines.slice(1).map((l) => {
    const f = splitFields(l.text);
    return {
      id: requireId(f, 'a sokszögpont száma', l.no),
      lh: parseDms(f[1] ?? ''),
      le: parseDms(f[2] ?? ''),
      t: requireNum(f[3], `${f[0] ?? ''}: a következő pontra mért távolság`),
    };
  });
  if (pts.length === 0) throw new CalcError('A sokszögvonalnak legalább egy sokszögpontot meg kell adni.', block.no);
  const seen = new Set<string>([kId, ...(vId ? [vId] : [])]);
  for (const p of pts) {
    if (seen.has(p.id)) throw new CalcError(`A(z) ${p.id} pontszám többször szerepel a sokszögvonalban.`, block.no);
    seen.add(p.id);
  }

  // Szakaszok: K→p1, p1→p2, …, (pn→V, ha van végpont).
  const n = pts.length;
  const legCount = V ? n + 1 : n;
  const lengths = [t1, ...pts.map((p) => p.t)].slice(0, legCount);

  // Irányszögek tájékozás nélkül (a kezdő irány a leolvasás), majd a tájékozási szöggel eltolva.
  const rawAz: number[] = [l1];
  for (let i = 0; i < legCount - 1; i++) {
    const p = pts[i]!;
    rawAz.push(normDeg(rawAz[i]! + 180 + (p.le - p.lh)));
  }
  // `perAngle`: a szögzáró hiba egy szögre jutó javítása; az i. szakasz irányszöge (i + 1) szöget tartalmaz.
  const increments = (rot: number, perAngle = 0) =>
    rawAz.map((a, i) => {
      const az = wholeSeconds(a + rot + (i + 1) * perAngle);
      return { az, dy: lengths[i]! * Math.sin(az * DEG), dx: lengths[i]! * Math.cos(az * DEG) };
    });

  let rot: number;
  let note: string | undefined;
  if (ctx.zk.has(kId)) {
    rot = ctx.zk.get(kId)!;
  } else if (V) {
    const raw = increments(0);
    const sy = raw.reduce((a, r) => a + r.dy, 0);
    const sx = raw.reduce((a, r) => a + r.dx, 0);
    if (Math.hypot(sy, sx) === 0 || distance(K, V) === 0) {
      throw new CalcError('A kezdőpont tájékozása nem határozható meg: adj meg tájékozást (TJ vagy ZK).', block.no);
    }
    rot = wholeSeconds(azimuthDeg(K, V) - normDeg(Math.atan2(sy, sx) / DEG));
    ctx.zk.set(kId, rot);
    note = `Tájékozás a kezdő- és végpont irányából: Zk[${kId}] = ${formatDms(rot)}`;
  } else {
    throw new CalcError(
      'A kezdőpont tájékozása hiányzik: add meg a végpontot, vagy előzetesen végezz tájékozást (TJ vagy ZK).',
      block.no,
    );
  }

  // Kétoldalt tájékozott vonal: a végpontra mért irány és a végpont tájékozása is ismert → szögzáró hiba.
  // A szögzáró hibát egyenletesen osztjuk el a vonal összes szöge között (törésszögek + a két csatlakozó szög).
  const twoSided = V !== undefined && vId !== undefined && lVn !== undefined && ctx.zk.has(kId) && ctx.zk.has(vId);
  let angularMisclosure = 0;
  let anglesCorrected = 0;
  let inc = increments(rot);
  if (twoSided) {
    const given = normDeg(lVn! + ctx.zk.get(vId!)!);
    angularMisclosure = wrapDeg(given - (inc[legCount - 1]!.az + 180)); // ismert − számított
    anglesCorrected = pts.length + 2;
    inc = increments(rot, angularMisclosure / anglesCorrected);
  }
  const sumT = lengths.reduce((a, b) => a + b, 0);
  const sumY = inc.reduce((a, r) => a + r.dy, 0);
  const sumX = inc.reduce((a, r) => a + r.dx, 0);

  // Zárási hiba (számított − ismert) és annak elosztása a szakaszhosszak arányában.
  const fy = V ? V.y - K.y - sumY : 0;
  const fx = V ? V.x - K.x - sumX : 0;
  const corr = inc.map((_, i) => ({ y: (fy * lengths[i]!) / sumT, x: (fx * lengths[i]!) / sumT }));
  const adj = inc.map((r, i) => ({ dy: r.dy + corr[i]!.y, dx: r.dx + corr[i]!.x }));

  const coords: { id: string; y: number; x: number }[] = [{ id: kId, y: K.y, x: K.x }];
  let cy = K.y;
  let cx = K.x;
  pts.forEach((p, i) => {
    cy += adj[i]!.dy;
    cx += adj[i]!.dx;
    coords.push({ id: p.id, y: cy, x: cx });
  });
  for (const c of coords.slice(1)) ctx.setPoint(newPoint(c.id, c.y, c.x, null));

  // A végpont tájékozása az utolsó szakasz irányából, ha megadták a rá mért irányt.
  if (V && vId && lVn !== undefined && !ctx.zk.has(vId)) {
    ctx.zk.set(vId, wholeSeconds(inc[legCount - 1]!.az + 180 - lVn));
  }

  const rows: Row[] = [];
  const legCells = (i: number): string[] =>
    i < legCount
      ? [formatDms(inc[i]!.az), c3(lengths[i]!), c3(inc[i]!.dy), c3(inc[i]!.dx), c3(corr[i]!.y), c3(corr[i]!.x), c3(adj[i]!.dy), c3(adj[i]!.dx)]
      : ['', '', '', '', '', '', '', ''];
  rows.push({ cells: [kId, '', formatDms(l1), ...legCells(0), c3(K.y), c3(K.x)], role: 'base' });
  pts.forEach((p, i) => {
    const c = coords[i + 1]!;
    rows.push({ cells: [p.id, formatDms(p.lh), formatDms(p.le), ...legCells(i + 1), c3(c.y), c3(c.x)], role: 'result' });
  });
  if (V && vId) rows.push({ cells: [vId, '', '', ...legCells(legCount), c3(V.y), c3(V.x)], role: 'base' });
  rows.push({
    cells: ['Σ', '', '', '', c3(sumT), c3(sumY), c3(sumX), c3(corr.reduce((a, r) => a + r.y, 0)), c3(corr.reduce((a, r) => a + r.x, 0)), c3(adj.reduce((a, r) => a + r.dy, 0)), c3(adj.reduce((a, r) => a + r.dx, 0)), '', ''],
    role: 'base',
  });

  const footer: string[] = [];
  if (note) footer.push(note);
  if (twoSided) {
    footer.push(
      `Szögzáró hiba: fβ = ${fix(angularMisclosure * 3600, 1)}″; szögenkénti javítás: ${fix((angularMisclosure * 3600) / anglesCorrected, 2)}″ (${anglesCorrected} szög)`,
    );
  }
  if (V) {
    const d = Math.hypot(fy, fx);
    const tol = linearTolerance(sumT);
    footer.push(
      `Zárási hiba: fy = ${c3(-fy)}, fx = ${c3(-fx)}, d = ${c3(d)} m, D = ${formatDms(azimuthDeg(K, V))} (a záróvonal irányszöge), megengedett: ${c3(tol)} m`,
    );
    if (d > tol) {
      ctx.issues.push({
        level: 'warning',
        message: `${block.code}: a lineáris zárási hiba (${c3(d)} m) meghaladja a megengedettet (${c3(tol)} m).`,
        line: block.no,
      });
    }
  } else {
    footer.push('Nyitott sokszögvonal: kiegyenlítés nélkül.');
  }

  return {
    section: {
      kind: 'sv',
      title: twoSided
        ? 'Kétoldalt tájékozott sokszögvonal számítása'
        : V
          ? 'Beillesztett sokszögvonal számítása'
          : 'Nyitott sokszögvonal számítása',
      columns: ['Pontszám', 'Lh', 'Le', 'D', 'T', 'DYi', 'DXi', 'DYjav', 'DXjav', 'dy', 'dx', 'Y', 'X'],
      rows,
      footer,
    },
    K,
    V,
    vId,
    pointIds: pts.map((p) => p.id),
    lengths,
    totalLength: sumT,
  };
}

export const sv: Handler = (ctx, block) => [computeTraverse(ctx, block).section];
