import { formatDms, normDeg, parseDms } from '../angle';
import { CalcError } from '../errors';
import { fix } from '../format';
import { azimuthDeg, baseOffsets, distance, intersectLines, intersectRays, polar } from '../geometry';
import { parseNum, requireNum, splitFields } from '../parser';
import type { Handler, Row, Section } from '../types';
import { headerFields, idTokens, lineError, newPoint, requireId } from './common';

const c3 = (n: number) => fix(n, 3);

/** IT – irányszög és távolság számítás. */
export const it: Handler = (ctx, block) => {
  const { fields, no } = headerFields(block, 'a kiinduló pont száma');
  const start = ctx.getPoint(requireId(fields, 'a kiinduló pont száma', no), no);
  const rows: Row[] = [{ cells: [start.id, c3(start.y), c3(start.x), '', ''], role: 'base' }];
  for (const t of idTokens(block.lines.slice(1))) {
    try {
      const p = ctx.getPoint(t.id, t.no);
      rows.push({
        cells: [p.id, c3(p.y), c3(p.x), formatDms(azimuthDeg(start, p)), c3(distance(start, p))],
        role: 'result',
      });
    } catch (e) {
      lineError(ctx, e, t.no);
    }
  }
  return [{ kind: 'it', title: 'Irányszög és távolság számítása', columns: ['Pontszám', 'Y', 'X', 'd', 't'], rows }];
};

/** PO – polárisan bemért pont(ok) számítása; figyelembe veszi a tárolt tájékozási szöget. */
export const po: Handler = (ctx, block) => {
  const { fields, no } = headerFields(block, 'az álláspont száma');
  const sid = requireId(fields, 'az álláspont száma', no);
  const st = ctx.getPoint(sid, no);
  const zk = ctx.getZk(sid);
  const rows: Row[] = [
    { cells: [st.id, c3(st.y), c3(st.x), '', '', formatDms(zk), '', c3(st.m ?? 0)], role: 'base' },
  ];
  for (const l of block.lines.slice(1)) {
    try {
      const f = splitFields(l.text);
      const id = requireId(f, 'az új pont száma', l.no);
      const li = parseDms(f[1] ?? '');
      const t = requireNum(f[2], `${id}: távolság`);
      const dM = parseNum(f[4], `${id}: magasságkülönbség`);
      const az = normDeg(li + zk);
      const q = polar(st, az, t);
      const m = dM === null ? null : (st.m ?? 0) + dM;
      ctx.setPoint(newPoint(id, q.y, q.x, m, f[3]));
      rows.push({
        cells: [id, c3(q.y), c3(q.x), formatDms(li), c3(t), formatDms(az), c3(dM ?? 0), c3(m ?? 0)],
        role: 'result',
      });
    } catch (e) {
      lineError(ctx, e, l.no);
    }
  }
  return [
    {
      kind: 'po',
      title: `Polárisan bemért pont(ok) számítása [${sid}]`,
      columns: ['Pontszám', 'Y', 'X', 'Li', 'T', 'Zi/d', 'dM', 'M'],
      rows,
    },
  ];
};

/** EM – két egyenes metszése (1-2 és 3-4 pontok által meghatározott egyenesek). */
export const em: Handler = (ctx, block) => {
  const { fields, no } = headerFields(block, 'a metszéspont száma');
  const id = requireId(fields, 'a metszéspont száma', no);
  const ids = idTokens(block.lines.slice(1));
  if (ids.length < 4) throw new CalcError('Az egyenesek metszéséhez 4 pontszám szükséges.', block.no);
  const [a, b, c, d] = ids.slice(0, 4).map((t) => ctx.getPoint(t.id, t.no)) as [
    ReturnType<typeof ctx.getPoint>,
    ReturnType<typeof ctx.getPoint>,
    ReturnType<typeof ctx.getPoint>,
    ReturnType<typeof ctx.getPoint>,
  ];
  const q = intersectLines(a, b, c, d);
  ctx.setPoint(newPoint(id, q.y, q.x, null, fields[1]));
  const pr = (label: string, p: typeof a): Row => ({ cells: [label, p.id, c3(p.y), c3(p.x)], role: 'base' });
  return [
    {
      kind: 'em',
      title: 'Egyenesek metszése',
      columns: ['#', 'Pontszám', 'Y', 'X'],
      rows: [
        pr('A', a),
        pr('', b),
        pr('B', c),
        pr('', d),
        { cells: ['', id, c3(q.y), c3(q.x)], role: 'result' },
      ],
    },
  ];
};

function intersectionSection(kind: string, title: string, rows: Row[], id: string, y: number, x: number): Section[] {
  return [
    {
      kind,
      title,
      columns: ['Pontszám', 'Y', 'X', 'd'],
      rows: [...rows, { cells: [id, c3(y), c3(x), ''], role: 'result' }],
    },
  ];
}

/** EB – előmetszés belső (háromszög-) szögekkel; a szögeket az óramutató járásával megegyezően kell megadni. */
export const eb: Handler = (ctx, block) => {
  const { fields, no } = headerFields(block, 'az új pont száma');
  const id = requireId(fields, 'az új pont száma', no);
  const obs = block.lines.slice(1).map((l) => {
    const f = splitFields(l.text);
    return { p: ctx.getPoint(requireId(f, 'az ismert pont száma', l.no), l.no), angle: parseDms(f[1] ?? ''), raw: f[1] ?? '' };
  });
  if (obs.length !== 2) throw new CalcError('Az előmetszéshez pontosan két ismert pont és a belső szögek szükségesek.', block.no);
  const [a, b] = obs as [(typeof obs)[number], (typeof obs)[number]];
  const azAB = azimuthDeg(a.p, b.p);
  const azBA = azimuthDeg(b.p, a.p);
  const q = intersectRays([
    { from: a.p, azDeg: azAB + a.angle },
    { from: b.p, azDeg: azBA - b.angle },
  ]);
  ctx.setPoint(newPoint(id, q.y, q.x, null, fields[1]));
  const rows = obs.map<Row>((o) => ({ cells: [o.p.id, c3(o.p.y), c3(o.p.x), formatDms(o.angle)], role: 'base' }));
  return intersectionSection('eb', 'Előmetszés számítása belső szögekkel', rows, id, q.y, q.x);
};

/** ET – előmetszés tájékozott iránymérésekkel (a tárolt tájékozási szögeket figyelembe veszi). */
export const et: Handler = (ctx, block) => {
  const { fields, no } = headerFields(block, 'az új pont száma');
  const id = requireId(fields, 'az új pont száma', no);
  const rays = block.lines.slice(1).map((l) => {
    const f = splitFields(l.text);
    const p = ctx.getPoint(requireId(f, 'az ismert pont száma', l.no), l.no);
    const li = parseDms(f[1] ?? '');
    return { p, li, az: normDeg(li + ctx.getZk(p.id)) };
  });
  if (rays.length < 2) throw new CalcError('Az előmetszéshez legalább két ismert pont és irány szükséges.', block.no);
  const q = intersectRays(rays.map((r) => ({ from: r.p, azDeg: r.az })));
  ctx.setPoint(newPoint(id, q.y, q.x, null, fields[1]));
  const rows = rays.map<Row>((r) => ({ cells: [r.p.id, c3(r.p.y), c3(r.p.x), formatDms(r.li)], role: 'base' }));
  return intersectionSection('et', 'Előmetszés számítása tájékozott irányértékekkel', rows, id, q.y, q.x);
};

/**
 * DK – derékszögű koordinátamérés: új pontok koordinátái a kezdő–végpont alapvonalhoz mért
 * abszcissza (a) és ordináta (b, balra pozitív) méretekből. Ha a mért alaphosszat megadják, a méreteket
 * a (számított/mért) aránnyal skálázza.
 */
export const dk: Handler = (ctx, block) => {
  const { fields, no } = headerFields(block, 'a kezdő- és végpont száma');
  const k = ctx.getPoint(requireId(fields, 'a kezdőpont száma', no), no);
  const v = ctx.getPoint(requireId(fields.slice(1), 'a végpont száma', no), no);
  const tCalc = distance(k, v);
  if (tCalc === 0) throw new CalcError('A kezdő- és a végpont egybeesik.', no);
  const tMeasured = parseNum(fields[2], 'a mért távolság');
  if (tMeasured !== null && tMeasured <= 0) throw new CalcError('A mért távolságnak pozitívnak kell lennie.', no);
  const scale = tMeasured === null ? 1 : tCalc / tMeasured;
  const pkod = block.args[0];

  const uy = (v.y - k.y) / tCalc;
  const ux = (v.x - k.x) / tCalc;
  const rows: Row[] = [
    { cells: [k.id, 'Tszám =', c3(tCalc), c3(k.y), c3(k.x)], role: 'base' },
    { cells: [v.id, 'Tmért =', c3(tMeasured ?? tCalc), c3(v.y), c3(v.x)], role: 'base' },
  ];
  for (const l of block.lines.slice(1)) {
    try {
      const f = splitFields(l.text);
      const id = requireId(f, 'az új pont száma', l.no);
      const a = requireNum(f[1], `${id}: abszcissza`) * scale;
      const b = requireNum(f[2], `${id}: ordináta`) * scale;
      const y = k.y + a * uy - b * ux;
      const x = k.x + a * ux + b * uy;
      ctx.setPoint(newPoint(id, y, x, null, f[3] || pkod));
      rows.push({ cells: [id, c3(requireNum(f[1], 'a')), c3(requireNum(f[2], 'b')), c3(y), c3(x)], role: 'result' });
    } catch (e) {
      lineError(ctx, e, l.no);
    }
  }
  return [{ kind: 'dk', title: 'Koordináták számítása derékszögű méretekből', columns: ['Pontszám', 'a', 'b', 'Y', 'X'], rows }];
};

/** KM – kitűzési méretek (abszcissza, ordináta) a kezdő- és végpont által meghatározott alapvonalra. */
export const km: Handler = (ctx, block) => {
  const { fields, no } = headerFields(block, 'a kezdő- és végpont száma');
  const k = ctx.getPoint(requireId(fields, 'a kezdőpont száma', no), no);
  const v = ctx.getPoint(requireId(fields.slice(1), 'a végpont száma', no), no);
  const rows: Row[] = [
    { cells: [k.id, c3(k.y), c3(k.x), 'd =', formatDms(azimuthDeg(k, v))], role: 'base' },
    { cells: [v.id, c3(v.y), c3(v.x), 't =', c3(distance(k, v))], role: 'base' },
  ];
  for (const t of idTokens(block.lines.slice(1))) {
    try {
      const p = ctx.getPoint(t.id, t.no);
      const o = baseOffsets(k, v, p);
      rows.push({ cells: [p.id, c3(p.y), c3(p.x), c3(o.a), c3(o.b)], role: 'result' });
    } catch (e) {
      lineError(ctx, e, t.no);
    }
  }
  return [{ kind: 'km', title: 'Kitűzési méretek számítása koordinátákból', columns: ['Pontszám', 'Y', 'X', 'a', 'b'], rows }];
};
