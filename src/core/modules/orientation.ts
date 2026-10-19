import { formatDms, normDeg, parseDms, wrapDeg } from '../angle';
import { CalcError } from '../errors';
import { fix } from '../format';
import { azimuthDeg, distance } from '../geometry';
import { splitFields } from '../parser';
import type { Handler, Row } from '../types';
import { headerFields, lineError, requireId } from './common';

/** ZK – tájékozási szög tárolása; a további számítások az újonnan megadott szöget használják. */
export const zk: Handler = (ctx, block) => {
  const id = block.args[0];
  if (!id) throw new CalcError('A ZK kód után meg kell adni az álláspont számát.', block.no);
  const angle = parseDms(block.args[1] ?? '');
  ctx.zk.set(id, angle);
  return [{ kind: 'zk', title: `Zk[${id}] = ${formatDms(angle)}`, columns: [], rows: [] }];
};

const wholeSec = (deg: number) => (Math.round(normDeg(deg) * 3600) / 3600) % 360;

export interface OrientationObs {
  /** A pont által adott tájékozási szög: irányszög − leolvasás. */
  zi: number;
  /** Súly: a vizsgált irány hossza (a hosszabb irány pontosabban tájékoztat). */
  weight: number;
}

/**
 * A tájékozási szög a (távolsággal súlyozott) körkörös átlag. Az irányonkénti `zi` egész másodpercre
 * kerekítve, az átlag is egész másodpercre kerekítve tárolódik, ahogy a régi program kinyomtatja és használja.
 * Az irányonkénti eltérést (e″) a pontos átlagtól mérjük.
 */
export function orientationMean(obs: OrientationObs[]): { zk: number; residualsArcsec: number[] } {
  const first = obs[0];
  if (!first) throw new CalcError('A tájékozáshoz legalább egy ismert pontra mért irány szükséges.');
  const mean = (values: number[]) => {
    const ref = values[0]!;
    const sw = obs.reduce((a, o) => a + o.weight, 0);
    return normDeg(ref + obs.reduce((a, o, i) => a + o.weight * wrapDeg(values[i]! - ref), 0) / sw);
  };
  const rounded = obs.map((o) => wholeSec(o.zi));
  const exact = mean(obs.map((o) => o.zi));
  return {
    zk: wholeSec(mean(rounded)),
    residualsArcsec: obs.map((o) => Math.round(wrapDeg(o.zi - exact) * 3600)),
  };
}

/**
 * TJ – iránysorozat tájékozása ismert pontokra. Minden irányra zi = irányszög − leolvasás,
 * a tájékozási szög ezek átlaga, e″ az egyes irányok eltérése az átlagtól.
 */
export const tj: Handler = (ctx, block) => {
  const { fields, no } = headerFields(block, 'az álláspont száma');
  const sid = requireId(fields, 'az álláspont száma', no);
  const st = ctx.getPoint(sid, no);

  const obs: { id: string; l: number; az: number; t: number; zi: number }[] = [];
  for (const line of block.lines.slice(1)) {
    try {
      const f = splitFields(line.text);
      const id = requireId(f, 'az irányzott pont száma', line.no);
      const p = ctx.getPoint(id, line.no);
      const l = parseDms(f[1] ?? '');
      const az = azimuthDeg(st, p);
      obs.push({ id, l, az, t: distance(st, p), zi: normDeg(az - l) });
    } catch (e) {
      lineError(ctx, e, line.no);
    }
  }
  if (obs.length === 0) throw new CalcError('A tájékozáshoz legalább egy ismert pontra mért irány szükséges.', block.no);

  const { zk: mean, residualsArcsec } = orientationMean(obs.map((o) => ({ zi: o.zi, weight: o.t })));
  ctx.zk.set(sid, mean);

  const rows: Row[] = [{ cells: [sid, '', '', '', `Zk = ${formatDms(mean)}`, ''], role: 'base' }];
  obs.forEach((o, i) => {
    rows.push({
      cells: [o.id, formatDms(o.l), formatDms(o.az), fix(o.t, 3), formatDms(o.zi), String(residualsArcsec[i])],
      role: 'result',
    });
  });
  return [
    {
      kind: 'tj',
      title: `Végleges tájékozás [${sid}]`,
      columns: ['Pontszám', 'l', 'de', 't', 'zi', 'e″'],
      rows,
    },
  ];
};
