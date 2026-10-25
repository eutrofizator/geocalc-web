import { interiorPoint } from './dat';
import { distance, polygonArea } from './geometry';
import type { NamedPt } from './parcel';

/**
 * Területszámítási lista az ITR .lst kimenetének szerkezetében (a változás előtti állapot ve.lst, a
 * változás utáni vu.lst néven kerül a földhivatalnak leadott munkarészek közé). Földrészletenként:
 *
 *   *
 *   hrsz (művelési ág),<TAB>Y<TAB>X          ← a felirat (geokód) helye
 *   ----------------------------------------------------------------------
 *                   pontszám<TAB>Y<TAB>X<TAB>    oldalhossz
 *   **--------------------------------------------------------------------
 *       területm²<TAB><TAB>AK=0.00
 *
 * A kerület a kezdőponttal zárul, a határ az óramutató járásával egyező irányú.
 */

export interface LstParcel {
  hrsz: string;
  /** Művelési ág (pl. „kivett, beépítettlen ter.”); üresen elmarad a zárójel. */
  use?: string;
  ring: NamedPt[];
}

const f3 = (n: number) => n.toFixed(3);

export function writeLst(parcels: LstParcel[]): string {
  const out: string[] = [];
  for (const p of parcels) {
    const signed = p.ring.reduce((s, a, k) => {
      const b = p.ring[(k + 1) % p.ring.length]!;
      return s + (a.y * b.x - b.y * a.x);
    }, 0);
    const ring = signed > 0 ? [...p.ring].reverse() : p.ring;
    const label = interiorPoint(ring);
    out.push('*');
    out.push(`${p.hrsz}${p.use ? ` (${p.use})` : ''},\t${f3(label.y)}\t${f3(label.x)}`);
    out.push('-'.repeat(70));
    [...ring, ring[0]!].forEach((q, i, all) => {
      const row = `${q.id.padStart(20)}\t${f3(q.y)}\t${f3(q.x)}`;
      out.push(i === 0 ? row : `${row}\t${f3(distance(all[i - 1]!, q)).padStart(10)}`);
    });
    out.push(`**${'-'.repeat(68)}`);
    out.push(`${polygonArea(ring).toFixed(6).padStart(15)}\t\tAK=0.00`);
    out.push('');
  }
  return `${out.join('\r\n')}\r\n`;
}
