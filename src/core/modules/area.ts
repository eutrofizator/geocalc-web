import { CalcError } from '../errors';
import { fix } from '../format';
import { polygonArea } from '../geometry';
import type { Handler, Row } from '../types';
import { idTokens } from './common';

/** TE – területszámítás a töréspontok pontszámaiból (bármely körüljárási irányban). */
export const te: Handler = (ctx, block) => {
  const label = block.head.trim();
  const pts = idTokens(block.lines).map((t) => ctx.getPoint(t.id, t.no));
  if (pts.length < 3) throw new CalcError('A területszámításhoz legalább három töréspont szükséges.', block.no);
  const area = polygonArea(pts);
  ctx.areas.push(area);
  const rows: Row[] = pts.map((p) => ({ cells: [p.id, fix(p.y, 3), fix(p.x, 3)], role: 'base' }));
  return [
    {
      kind: 'te',
      title: label ? `Területszámítás  ${label}` : 'Területszámítás',
      columns: ['Pontszám', 'Y', 'X'],
      rows,
      footer: [`Terület = ${fix(area, 5)} m2`],
    },
  ];
};

/** TO – az addig kiszámított területek összesítése; utána az összeadás újrakezdődik. */
export const to: Handler = (ctx) => {
  const sum = ctx.areas.reduce((a, b) => a + b, 0);
  ctx.areas.length = 0;
  return [
    {
      kind: 'to',
      title: 'Terület összesítés',
      columns: [],
      rows: [],
      footer: [`Az előző területek összesen: ${fix(sum, 5)}`],
    },
  ];
};
