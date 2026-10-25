import type { NamedPt } from './parcel';

/**
 * Kitűzési mérési jegyzőkönyv (.MES) – a terepi adatgyűjtő vesszővel tagolt naplója. A rekord első
 * mezője a fajtája; a koordináták sorrendje X (észak), Y (kelet), H:
 * - A: álláspont (pontszám, X, Y, H, műszermagasság);
 * - B, C, D: tájékozó (hátra)irány – ismert pont, mérés, tájékozás; K: a szabad álláspont maradékai;
 * - H: kitűzendő (tervezett, térképi) pont: pontszám, „------”, X, Y, H;
 * - F: a kitűzött (mért) pont: pontszám, irány, zenitszög, ferde és vízszintes távolság, magasság-
 *   különbség, jelmagasság, majd a mért X, Y, H;
 * - J: a kitűzés eltérése (terv − mért): dX, dY, dH.
 * Egy pontot többször is kitűzhetnek; a jegyzőkönyvben az utolsó számít.
 */

export interface StakeoutStation extends NamedPt {
  h: number;
  ih: number;
}

export interface StakeoutPoint {
  id: string;
  design: NamedPt & { h: number };
  staked: NamedPt & { h: number };
  /** A jegyzőkönyvben rögzített eltérés (terv − mért) [m]. */
  dX: number | null;
  dY: number | null;
  dH: number | null;
  /** Az álláspont pontszáma, ahonnan kitűzték. */
  station: string;
}

export interface StakeoutLog {
  job: string;
  stations: StakeoutStation[];
  /** Minden H rekord (kitűzendő pont), pontszám szerint az utolsó. */
  design: Map<string, NamedPt & { h: number }>;
  points: StakeoutPoint[];
  /** H rekord, amelyhez nem tartozik F (nem tűzték ki). */
  notStaked: string[];
  warnings: string[];
}

const num = (s: string | undefined) => (s === undefined || s.trim() === '' || /^-+$/.test(s.trim()) ? NaN : Number(s.trim()));

export function readStakeoutMes(text: string): StakeoutLog {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const job = lines[0]?.split(',')[0]?.trim() ?? '';
  const stations: StakeoutStation[] = [];
  const design = new Map<string, NamedPt & { h: number }>();
  const staked = new Map<string, StakeoutPoint>();
  const warnings: string[] = [];
  let station = '';
  for (const [i, line] of lines.entries()) {
    const f = line.split(',');
    const kind = f[0]!.trim();
    const id = f[1]?.trim() ?? '';
    switch (kind) {
      case 'A': {
        const x = num(f[2]);
        const y = num(f[3]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          warnings.push(`${i + 1}. sor: hibás álláspont-rekord.`);
          break;
        }
        station = id;
        stations.push({ id, x, y, h: num(f[4]) || 0, ih: num(f[5]) || 0 });
        break;
      }
      case 'H': {
        const x = num(f[3]);
        const y = num(f[4]);
        if (Number.isFinite(x) && Number.isFinite(y)) design.set(id, { id, x, y, h: num(f[5]) || 0 });
        break;
      }
      case 'F': {
        const x = num(f[8]);
        const y = num(f[9]);
        const d = design.get(id);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          warnings.push(`${i + 1}. sor: hibás kitűzési rekord (${id}).`);
          break;
        }
        if (!d) {
          warnings.push(`${id}: kitűzött pont tervezett (H) koordináta nélkül.`);
          break;
        }
        staked.set(id, { id, design: d, staked: { id, x, y, h: num(f[10]) || 0 }, dX: null, dY: null, dH: null, station });
        break;
      }
      case 'J': {
        const p = staked.get(id);
        if (p) {
          p.dX = num(f[2]);
          p.dY = num(f[3]);
          p.dH = num(f[4]);
        }
        break;
      }
    }
  }
  const points = [...staked.values()];
  for (const p of points)
    if (p.dX !== null && p.dY !== null && (Math.abs(p.design.x - p.staked.x - p.dX) > 0.002 || Math.abs(p.design.y - p.staked.y - p.dY) > 0.002))
      warnings.push(`${p.id}: a jegyzőkönyv eltérése (J) nem egyezik a terv és a mért koordináták különbségével.`);
  if (stations.length === 0 && points.length === 0) warnings.push('Az állományban nincs álláspont (A) és kitűzött pont (F) – nem kitűzési jegyzőkönyv?');
  return { job, stations, design, points, notStaked: [...design.keys()].filter((id) => !staked.has(id)), warnings };
}
