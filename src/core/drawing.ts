import type { Pt } from './geometry';
import type { LayerKey } from './layers';
import type { NamedPt } from './parcel';
import type { Issue } from './types';

/**
 * Rajzelemek a vázrajzhoz, soronként beírva (pontosvesszővel tagolva, # után megjegyzés):
 *
 *   épület ; új | lakó | gazdasági | üdülő | megszűnő | falsík ; pontok… [; CA01…CA10] – zárt épületkontúr,
 *     a 4. mező a DAT objektumféleség-kódja (az új épületnél alapértelmezésben CA01 lakóépület)
 *   alrészlet ; betűjel ; művelési ág ; pontok…                          – meglévő alrészlet
 *   új alrészlet ; betűjel ; művelési ág ; pontok…                       – kialakuló alrészlet
 *   vonal ; kerítés | fal | szolgalmi ; pontok…                            – nyitott vonal
 *   felirat ; házszám | utcanév | dűlőnév | egyéb ; szöveg ; @pontszám | Y X [; forgatás°]
 *
 * A pontok a koordináták pontszámai. A rétegek a földhivatali rajzok rétegrendjét követik.
 */

export type DrawingElement =
  | { kind: 'building'; type: BuildingType; layer: LayerKey; ring: NamedPt[]; code: string; line: number }
  | { kind: 'sub'; letter: string; use: string; isNew: boolean; ring: NamedPt[]; line: number }
  | { kind: 'polyline'; layer: LayerKey; pts: NamedPt[]; line: number }
  | { kind: 'label'; layer: LayerKey; text: string; at: Pt; rotation: number; line: number };

export type BuildingType = 'new' | 'residential' | 'farm' | 'holiday' | 'old' | 'wall';

const BUILDING: Record<string, { type: BuildingType; layer: LayerKey }> = {
  új: { type: 'new', layer: 'newBuilding' },
  uj: { type: 'new', layer: 'newBuilding' },
  lakó: { type: 'residential', layer: 'residential' },
  lako: { type: 'residential', layer: 'residential' },
  gazdasági: { type: 'farm', layer: 'farm' },
  gazdasagi: { type: 'farm', layer: 'farm' },
  melléképület: { type: 'farm', layer: 'farm' },
  üdülő: { type: 'holiday', layer: 'holiday' },
  udulo: { type: 'holiday', layer: 'holiday' },
  megszűnő: { type: 'old', layer: 'oldBuilding' },
  megszuno: { type: 'old', layer: 'oldBuilding' },
  bontott: { type: 'old', layer: 'oldBuilding' },
  falsík: { type: 'wall', layer: 'wallProjection' },
  falsik: { type: 'wall', layer: 'wallProjection' },
};

/** Az épület DAT-kódja, ha a sor nem adja meg (DAT-M1: CA01 lakó, CA02 üdülő, CA06 gazdasági). */
const DEFAULT_CODE: Record<BuildingType, string> = { new: 'CA01', residential: 'CA01', farm: 'CA06', holiday: 'CA02', old: 'CA01', wall: 'CA01' };

const LINE: Record<string, LayerKey> = {
  kerítés: 'fence',
  kerites: 'fence',
  fal: 'wall',
  szolgalmi: 'servitude',
  egyéb: 'other',
  egyeb: 'other',
};

const LABEL: Record<string, LayerKey> = {
  házszám: 'houseNo',
  hazszam: 'houseNo',
  utcanév: 'street',
  utcanev: 'street',
  dűlőnév: 'place',
  dulonev: 'place',
  objektum: 'objectType',
  egyéb: 'other',
  egyeb: 'other',
};

/** A művelési ágak rövidítése a 8/2018. AM rendelet 18. § (2) szerint (a „kivett” megnevezéssel marad). */
export const LAND_USE: Record<string, string> = {
  szántó: 'Sz',
  rét: 'R',
  legelő: 'L',
  szőlő: 'Sző',
  kert: 'K',
  gyümölcsös: 'Gy',
  nádas: 'N',
  erdő: 'E',
  'fásított terület': 'Ft',
  halastó: 'Ht',
};

export const landUseLabel = (use: string) => LAND_USE[use.trim().toLowerCase()] ?? use.trim();

export function parseDrawing(text: string, points: Map<string, NamedPt>): { elements: DrawingElement[]; issues: Issue[] } {
  const elements: DrawingElement[] = [];
  const issues: Issue[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const f = line.split(';').map((s) => s.trim());
    const cmd = f[0]!.toLowerCase();
    const no = i + 1;
    const err = (m: string) => issues.push({ level: 'error', line: no, message: `Rajzelemek ${no}. sor: ${m}` });
    const resolve = (list: string, min: number): NamedPt[] | null => {
      const ids = list.split(/[\s,]+/).filter(Boolean);
      if (ids.length > 1 && ids[0] === ids.at(-1)) ids.pop();
      const missing = ids.filter((id) => !points.has(id));
      if (missing.length > 0) {
        err(`ismeretlen pont(ok): ${missing.join(', ')}.`);
        return null;
      }
      if (ids.length < min) {
        err(`legalább ${min} pont kell.`);
        return null;
      }
      return ids.map((id) => points.get(id)!);
    };
    switch (cmd) {
      case 'épület':
      case 'epulet': {
        const b = BUILDING[(f[1] ?? '').toLowerCase()];
        if (!b) return err(`ismeretlen épülettípus „${f[1]}” (új, lakó, gazdasági, üdülő, megszűnő, falsík).`);
        const ring = resolve(f[2] ?? '', 3);
        const code = (f[3] ?? '').toUpperCase() || DEFAULT_CODE[b.type];
        if (!/^CA(0[1-9]|10)$/.test(code)) return err(`ismeretlen épületkód „${f[3]}” (CA01…CA10).`);
        if (ring) elements.push({ kind: 'building', type: b.type, layer: b.layer, ring, code, line: no });
        return;
      }
      case 'alrészlet':
      case 'alreszlet':
      case 'új alrészlet':
      case 'uj alreszlet': {
        const letter = f[1] ?? '';
        if (!/^[a-zA-Z]{1,3}$/.test(letter)) return err('az alrészlet betűjele kisbetű (pl. a, b).');
        const ring = resolve(f[3] ?? '', 3);
        if (ring) elements.push({ kind: 'sub', letter: letter.toLowerCase(), use: f[2] ?? '', isNew: cmd.startsWith('új') || cmd.startsWith('uj'), ring, line: no });
        return;
      }
      case 'vonal': {
        const layer = LINE[(f[1] ?? '').toLowerCase()];
        if (!layer) return err(`ismeretlen vonalfajta „${f[1]}” (kerítés, fal, szolgalmi, egyéb).`);
        const pts = resolve(f[2] ?? '', 2);
        if (pts) elements.push({ kind: 'polyline', layer, pts, line: no });
        return;
      }
      case 'felirat': {
        const layer = LABEL[(f[1] ?? '').toLowerCase()];
        if (!layer) return err(`ismeretlen feliratfajta „${f[1]}” (házszám, utcanév, dűlőnév, objektum, egyéb).`);
        const txt = f[2] ?? '';
        if (!txt) return err('hiányzik a felirat szövege.');
        const where = (f[3] ?? '').trim();
        let at: Pt | null = null;
        if (where.startsWith('@')) {
          const p = points.get(where.slice(1).trim());
          if (!p) return err(`ismeretlen pont: ${where.slice(1)}.`);
          at = { y: p.y, x: p.x };
        } else {
          const [y, x] = where.split(/[\s,]+/).map((v) => Number(v.replace(',', '.')));
          if (Number.isFinite(y) && Number.isFinite(x)) at = { y: y!, x: x! };
        }
        if (!at) return err('a felirat helye „@pontszám” vagy „Y X” legyen.');
        const rot = Number((f[4] ?? '0').replace(',', '.'));
        elements.push({ kind: 'label', layer, text: txt, at, rotation: Number.isFinite(rot) ? rot : 0, line: no });
        return;
      }
      default:
        err(`ismeretlen elem „${f[0]}” (épület, alrészlet, új alrészlet, vonal, felirat).`);
    }
  });
  return { elements, issues };
}
