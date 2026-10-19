import { DEG, formatDms, formatDmsSigned, normDeg, parseDms, wrapDeg } from '../angle';
import { CalcError } from '../errors';
import { fix } from '../format';
import { azimuthDeg, distance, polar } from '../geometry';
import { parseNum, requireNum, splitFields } from '../parser';
import type { Handler, Row } from '../types';
import { headerFields, lineError, newPoint, requireId } from './common';
import { orientationMean } from './orientation';

const c3 = (n: number) => fix(n, 3);

interface Obs {
  id: string;
  /** A külpontos álláspontról mért irány (leolvasás). */
  l: number;
  /** Mért távolság a külpontos álláspontról (ha megadták). */
  tMeasured: number | null;
  /** Az ismert pont koordinátái, ha ismert. */
  known: { y: number; x: number } | undefined;
  /** Központosított irány (leolvasási rendszerben). */
  lkp: number;
  /** Központosított távolság (a központtól). */
  tkp: number;
  no: number;
}

/**
 * KP – külpontos irány- és távmérés központosítása.
 *
 * Az álláspont a központtól `R` távolságra, a `L(kp)` irányban van. Ismert pontokra mért irányokból
 * tájékozási szöget számol, majd az ismeretlen pontokat a központosított irányokkal és távolságokkal
 * polárisan számítja.
 *
 * A központosítás pontos háromszög-geometriával történik. A régi program az ismeretlen pontoknál a
 * szinusztételben a külpontból mért távolságot használta a központ–pont távolság helyett, ami
 * nagy külpontosságnál (R/T ≈ 25%) méteres hibát okozott; ismert pontoknál a két megoldás azonos.
 */
export const kp: Handler = (ctx, block) => {
  const { fields, no } = headerFields(block, 'a központ száma, a rá mért irány és a külpontosság');
  const cid = requireId(fields, 'a központ száma', no);
  const C = ctx.getPoint(cid, no);
  const lc = parseDms(fields[1] ?? '');
  const r = requireNum(fields[2], 'a külpontosság (R)');
  if (r <= 0) throw new CalcError('A külpontosságnak (R) pozitívnak kell lennie.', no);

  // A külpontos álláspont helyi rendszerében (leolvasás = irányszög) a központ helye.
  const cLocal = { y: r * Math.sin(lc * DEG), x: r * Math.cos(lc * DEG) };

  const obs: Obs[] = [];
  for (const line of block.lines.slice(1)) {
    try {
      const f = splitFields(line.text);
      const id = requireId(f, 'a pont száma', line.no);
      const l = parseDms(f[1] ?? '');
      const t = parseNum(f[2], `${id}: távolság`);
      const known = ctx.points.get(id);
      if (t !== null) {
        const p = { y: t * Math.sin(l * DEG), x: t * Math.cos(l * DEG) };
        obs.push({
          id, l, tMeasured: t, known, no: line.no,
          lkp: azimuthDeg(cLocal, p),
          tkp: distance(cLocal, p),
        });
      } else if (known) {
        const tc = distance(C, known);
        const arg = (r * Math.sin((lc - l) * DEG)) / tc;
        if (Math.abs(arg) > 1) throw new CalcError(`${id}: a központosítás nem számítható (a külpontosság nagyobb a központ–pont távolságnál).`, line.no);
        obs.push({ id, l, tMeasured: null, known, no: line.no, lkp: normDeg(l - Math.asin(arg) / DEG), tkp: tc });
      } else {
        throw new CalcError(`${id}: ismeretlen pontra a távolság megadása kötelező.`, line.no);
      }
    } catch (e) {
      lineError(ctx, e, line.no);
    }
  }
  if (obs.length === 0) throw new CalcError('Nincs számítható irány.', block.no);

  const knownObs = obs.filter((o) => o.known);
  const unknownObs = obs.filter((o) => !o.known);

  // Tájékozás az ismert pontokból (vagy a korábban tárolt tájékozási szög).
  let zkValue: number;
  let residuals: number[] = [];
  const ziOf = (o: Obs) => normDeg(azimuthDeg(C, o.known!) - o.lkp);
  if (knownObs.length > 0) {
    const m = orientationMean(knownObs.map((o) => ({ zi: ziOf(o), weight: o.tkp })));
    zkValue = m.zk;
    residuals = m.residualsArcsec;
    ctx.zk.set(cid, zkValue);
  } else if (ctx.zk.has(cid)) {
    zkValue = ctx.zk.get(cid)!;
  } else {
    throw new CalcError('A központosított irányok tájékozásához legalább egy ismert pontra mért irány kell, vagy előzetes tájékozás (TJ, ZK).', block.no);
  }

  // 1. Központosítás
  const centering: Row[] = [
    { cells: [cid, c3(C.y), c3(C.x), formatDms(lc), `r = ${c3(r)}`, '', ''], role: 'base' },
  ];
  for (const o of obs) {
    centering.push({
      cells: [
        o.id,
        o.known ? c3(o.known.y) : '',
        o.known ? c3(o.known.x) : '',
        formatDms(o.l),
        c3(o.tMeasured ?? o.tkp),
        formatDmsSigned(wrapDeg(o.lkp - o.l)),
        formatDms(o.lkp),
      ],
      role: o.known ? 'base' : 'result',
    });
  }

  // 2. Végleges tájékozás
  const orient: Row[] = [{ cells: [cid, '', '', '', `Zk = ${formatDms(zkValue)}`, ''], role: 'base' }];
  knownObs.forEach((o, i) => {
    orient.push({
      cells: [o.id, formatDms(o.lkp), formatDms(azimuthDeg(C, o.known!)), c3(o.tkp), formatDms(ziOf(o)), String(residuals[i])],
      role: 'result',
    });
  });

  // 3. Poláris számítás az ismeretlen pontokra
  const polarRows: Row[] = [{ cells: [cid, c3(C.y), c3(C.x), '', '', formatDms(zkValue)], role: 'base' }];
  for (const o of unknownObs) {
    const az = normDeg(o.lkp + zkValue);
    const q = polar(C, az, o.tkp);
    ctx.setPoint(newPoint(o.id, q.y, q.x, null));
    polarRows.push({ cells: [o.id, c3(q.y), c3(q.x), formatDms(o.lkp), c3(o.tkp), formatDms(az)], role: 'result' });
  }

  const sections = [
    { kind: 'kp', title: `Külpontos iránymérés központosítása [${cid}]`, columns: ['Pontszám', 'Y', 'X', 'Li', 'T', 'Ejav', 'Lkp'], rows: centering },
    { kind: 'kp-orient', title: `Végleges tájékozás [${cid}]`, columns: ['Pontszám', 'Lkp', 'de', 't', 'zi', 'e″'], rows: orient },
  ];
  if (unknownObs.length > 0) {
    sections.push({
      kind: 'kp-polar',
      title: `Polárisan bemért pont(ok) számítása [${cid}]`,
      columns: ['Pontszám', 'Y', 'X', 'Lkp', 'Tkp', 'Zi/d'],
      rows: polarRows,
    });
  }
  return sections;
};
