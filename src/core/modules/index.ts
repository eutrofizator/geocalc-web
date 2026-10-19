import type { Handler } from '../types';
import { ek, vp } from './adjust';
import { te, to } from './area';
import { kp } from './eccentric';
import { sm } from './heights';
import { tj, zk } from './orientation';
import { dk, eb, em, et, it, km, po } from './points';
import { iv } from './intersect';
import { af, he } from './transform';
import { sv } from './traverse';

/** A megvalósított számítási kódok. */
export const HANDLERS: Record<string, Handler> = {
  IT: it,
  PO: po,
  EM: em,
  EB: eb,
  ET: et,
  IV: iv,
  KM: km,
  DK: dk,
  TE: te,
  TO: to,
  ZK: zk,
  TJ: tj,
  SV: sv,
  SM: sm,
  KP: kp,
  VP: vp,
  EK: ek,
  AF: af,
  HE: he,
};
