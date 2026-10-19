import { CalcError } from '../errors';
import { splitFields } from '../parser';
import type { Block, BlockLine, Context, Point } from '../types';

/** Az adatsorok minden mezője, üres mezők nélkül (pl. ponthivatkozások listája). */
export function idTokens(lines: BlockLine[]): { id: string; no: number }[] {
  const out: { id: string; no: number }[] = [];
  for (const l of lines) {
    for (const t of splitFields(l.text)) if (t !== '') out.push({ id: t, no: l.no });
  }
  return out;
}

/** Az első adatsor mezői (pl. álláspont, új pont); hiány esetén hibát dob. */
export function headerFields(block: Block, what: string): { fields: string[]; no: number } {
  const first = block.lines[0];
  if (!first) throw new CalcError(`Hiányzik ${what}.`, block.no);
  return { fields: splitFields(first.text), no: first.no };
}

export function requireId(fields: string[], what: string, no: number): string {
  const id = fields[0];
  if (!id) throw new CalcError(`Hiányzik ${what}.`, no);
  return id;
}

/** Új, kiszámított pont létrehozása a számítási kóddal (alapértelmezett: 0). */
export function newPoint(id: string, y: number, x: number, m: number | null, pkod?: string): Point {
  return { id, y, x, m, code: pkod && pkod !== '' ? pkod : '0' };
}

/** Egy soron belüli hiba: jelentés a futás eredményében, a többi sor számítása folytatódik. */
export function lineError(ctx: Context, e: unknown, fallbackLine: number): void {
  if (e instanceof CalcError) {
    ctx.issues.push({ level: 'error', message: e.message, line: e.line ?? fallbackLine });
  } else {
    throw e;
  }
}
