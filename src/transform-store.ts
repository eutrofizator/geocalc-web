import type { ParamFields } from './core/geo/apply';
import type { InterpolationAnchor } from './core/geo/interpolate';
import type { SystemId } from './core/geo/systems';

/**
 * A Térbeli transzformáció két munkalapja közötti kapcsolat: a paraméterszámítás eredményét a
 * Átszámítás munkalap átveheti, és az átszámított pont a közös pontok listájára fűzhető.
 * A valódi program ezt a két munkalap együttes használatával oldja meg (súgó 63–64. o.).
 */

export interface FittedParams {
  from: SystemId;
  to: SystemId;
  twoD: boolean;
  /** A 7 paraméter a felületi mezők alakjában (eltolás m, forgatás ″, méretarány mm/km). */
  fields: ParamFields;
  /** Hány közös pontból számolt. */
  commonCount: number;
  /** Az illesztés középhibája [m]. */
  sigma0: number;
  /** A közös pontok helye (a cél rendszerben) és javítása az interpolációhoz. */
  anchors?: InterpolationAnchor[];
}

let last: FittedParams | null = null;
const listeners: (() => void)[] = [];
let appender: ((fromLine: string, toLine: string) => void) | null = null;

export function setFittedParams(p: FittedParams | null): void {
  last = p;
  for (const cb of listeners) cb();
}

export function getFittedParams(): FittedParams | null {
  return last;
}

export function onFittedParams(cb: () => void): void {
  listeners.push(cb);
}

/** A paraméterszámítás munkalap regisztrálja a közös pontokhoz fűző műveletet. */
export function setCommonAppender(fn: ((fromLine: string, toLine: string) => void) | null): void {
  appender = fn;
}

/** Az átszámított pont felvétele a közös pontok listájára (kétlépcsős módszer). */
export function appendCommonPoint(fromLine: string, toLine: string): boolean {
  if (!appender) return false;
  appender(fromLine, toLine);
  return true;
}
