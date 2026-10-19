import { CalcError } from '../errors';
import { fix } from '../format';
import { parseNum, splitFields } from '../parser';
import type { Handler, Row } from '../types';
import { headerFields } from './common';
import { computeTraverse } from './traverse';

const c3 = (n: number) => fix(n, 3);

/**
 * SM – magassági sokszögvonal: a vízszintes sokszögvonalat (mint az SV) és a hozzá tartozó
 * magassági vonalat számítja. Szakaszonként a „előre" és a „hátra" mért magasságkülönbségek átlagát
 * veszi, a magassági zárási hibát a szakaszhosszak arányában osztja el.
 *
 * Fejléc:  Psz(K), L(K-1), T(K-1), Psz(V), [L(V-n)], [dM(E): K→1], [dM(H): V→n]
 * Pontsor: Pszúj, L(hátra), L(előre), T(előre), [dM(H): hátra mért], [dM(E): előre mért]
 */
export const sm: Handler = (ctx, block) => {
  const horizontal = computeTraverse(ctx, block);
  const { K, V, vId, pointIds, lengths, totalLength } = horizontal;

  const { fields } = headerFields(block, 'a fejléc');
  const startForward = parseNum(fields[5], 'a kezdőpontról mért magasságkülönbség (dM(E))');
  const endBackward = parseNum(fields[6], 'a végpontról mért magasságkülönbség (dM(H))');

  const lines = block.lines.slice(1).map((l) => {
    const f = splitFields(l.text);
    return {
      back: parseNum(f[4], `${f[0] ?? ''}: hátra mért magasságkülönbség`),
      fwd: parseNum(f[5], `${f[0] ?? ''}: előre mért magasságkülönbség`),
    };
  });

  const legCount = lengths.length;
  const forwardAt = (leg: number) => (leg === 0 ? startForward : lines[leg - 1]?.fwd ?? null);
  const backwardAt = (leg: number) => (leg < pointIds.length ? lines[leg]?.back ?? null : endBackward);

  const anyHeight = [startForward, endBackward, ...lines.flatMap((l) => [l.back, l.fwd])].some((v) => v !== null);
  if (!anyHeight) {
    ctx.issues.push({ level: 'warning', message: 'SM: nincs magasságkülönbség megadva, csak a vízszintes vonal készült el.', line: block.no });
    return [horizontal.section];
  }
  if (K.m === null) throw new CalcError(`SM: a kezdőpont (${K.id}) magassága hiányzik.`, block.no);
  if (V && V.m === null) throw new CalcError(`SM: a végpont (${V.id}) magassága hiányzik.`, block.no);

  // Szakaszonkénti magasságkülönbség: az előre és a (megfordított) hátra mért érték átlaga.
  const dM: number[] = [];
  for (let leg = 0; leg < legCount; leg++) {
    const estimates: number[] = [];
    const f = forwardAt(leg);
    const b = backwardAt(leg);
    if (f !== null) estimates.push(f);
    if (b !== null) estimates.push(-b);
    if (estimates.length === 0) throw new CalcError(`SM: hiányzik a(z) ${leg + 1}. szakasz magasságkülönbsége.`, block.no);
    dM.push(estimates.reduce((a, v) => a + v, 0) / estimates.length);
  }

  const sumDm = dM.reduce((a, v) => a + v, 0);
  const closure = V ? V.m! - K.m - sumDm : 0;
  const corr = lengths.map((t) => (closure * t) / totalLength);

  const heights: number[] = [K.m];
  dM.forEach((d, i) => heights.push(heights[i]! + d + corr[i]!));

  // A kiszámított pontok magassága.
  pointIds.forEach((id, i) => {
    const p = ctx.points.get(id);
    if (p) ctx.setPoint({ ...p, m: heights[i + 1]! });
  });

  const rows: Row[] = [{ cells: [K.id, '', startForward === null ? '' : c3(startForward), '', '', '', c3(K.m)], role: 'base' }];
  pointIds.forEach((id, i) => {
    rows.push({
      cells: [id, lines[i]?.back == null ? '' : c3(lines[i]!.back!), lines[i]?.fwd == null ? '' : c3(lines[i]!.fwd!), c3(dM[i]!), c3(corr[i]!), fix(lengths[i]!, 1), c3(heights[i + 1]!)],
      role: 'result',
    });
  });
  if (V && vId) {
    const last = legCount - 1;
    rows.push({
      cells: [vId, endBackward === null ? '' : c3(endBackward), '', c3(dM[last]!), c3(corr[last]!), fix(lengths[last]!, 1), c3(V.m!)],
      role: 'base',
    });
  }
  rows.push({
    cells: ['Σ', '', '', c3(sumDm), c3(corr.reduce((a, v) => a + v, 0)), fix(totalLength, 1), c3(heights[heights.length - 1]! - K.m)],
    role: 'base',
  });

  return [
    horizontal.section,
    {
      kind: 'sm',
      title: 'Magassági sokszögvonal',
      columns: ['Pontszám', 'Mh', 'Me', 'dM', 'Mjav', 'T', 'M'],
      rows,
      footer: V ? [`Magassági zárási hiba: ${c3(-closure)} m`] : ['Nyitott magassági vonal: kiegyenlítés nélkül.'],
    },
  ];
};
