/**
 * Jelkulcsi jelek a „DAT1-M2. A digitális alaptérkép jelkulcsai” szabályzatmelléklet (FM, 24.459/1996.)
 * szimbólumlapjai szerint. A méretek a rajzlapon mm-ben, az 1:1000 (1:500) méretarány oszlopából; a jel
 * a vonatkozási pontjára (origó) illesztve, É-i irányban (y felfelé). Vonalvastagság 0,18 mm (az
 * alappontoknál 0,16 mm), a pontjel 0,18 mm átmérőjű kitöltött kör.
 *
 * A tájolás: „north” – nem forgatható (É-i irányú); „parallel” – a legközelebbi vonallal (fal, vezeték)
 * párhuzamos; „perpendicular” – merőleges rá (kapcsolójel); „free” – a megadott forgatás szerint.
 */

export type XY = [number, number];

export type Shape =
  | { t: 'line'; pts: XY[]; closed?: boolean; fill?: boolean }
  | { t: 'circle'; c: XY; r: number }
  /** Körök uniójának körvonala (pl. kővel állandósított határpont: nagy és kis kör). */
  | { t: 'circles'; list: [number, number, number][] }
  /** Körív a középponttól, fokban (0° = kelet, az óramutatóval ellentétesen). */
  | { t: 'arc'; c: XY; r: number; from: number; to: number }
  | { t: 'dot'; c: XY };

export type Orientation = 'north' | 'parallel' | 'perpendicular' | 'free';

export interface SymbolDef {
  /** A T_JELKULCS kód (pl. JKDATC21). */
  code: string;
  /** A rajzelem-sorban használt név. */
  key: string;
  name: string;
  orient: Orientation;
  shapes: Shape[];
  /** A jel mellé írandó magyarázó megírás (a melléklet szerint). */
  label?: string;
  width?: number;
  color?: string;
}

const dot: Shape = { t: 'dot', c: [0, 0] };
const ring = (d: number): Shape => ({ t: 'circle', c: [0, 0], r: d / 2 });
const D45 = Math.SQRT1_2;
/** A kör négy átlós irányába kifelé álló 0,20 mm-es vonalkák (határdomb). */
const ticks = (r: number, len: number): Shape[] =>
  [45, 135, 225, 315].map((a) => {
    const c = Math.cos((a * Math.PI) / 180);
    const s = Math.sin((a * Math.PI) / 180);
    return { t: 'line', pts: [[r * c, r * s], [(r + len) * c, (r + len) * s]] };
  });
const square = (a: number): Shape => ({ t: 'line', pts: [[-a / 2, -a / 2], [a / 2, -a / 2], [a / 2, a / 2], [-a / 2, a / 2]], closed: true });

export const SYMBOLS: SymbolDef[] = [
  // A – Geodéziai pontok
  { code: 'JKDATA10', key: 'ötödrendű alappont', name: 'Ötödrendű vízszintes alappont', orient: 'north', width: 0.16, shapes: [ring(2.5), dot] },
  {
    code: 'JKDATA16',
    key: 'kőalappont',
    name: 'Kővel állandósított felmérési alappont',
    orient: 'north',
    shapes: [{ t: 'circles', list: [[0, 0, 0.75], [0, 0.88, 0.5]] }, dot],
  },
  { code: 'JKDATA22', key: 'felmérési alappont', name: 'Felmérési alappont egyéb módon állandósítva', orient: 'north', shapes: [ring(1.5), dot] },
  {
    code: 'JKDATA26',
    key: 'magassági alappont',
    name: 'I–IV. rendű magassági alappont',
    orient: 'north',
    shapes: [ring(1.5), { t: 'line', pts: [[-0.75 * D45, 0.75 * D45], [0.75 * D45, -0.75 * D45]] }, { t: 'line', pts: [[0.75 * D45, 0.75 * D45], [-0.75 * D45, -0.75 * D45]] }],
  },
  {
    code: 'JKDATA29',
    key: 'határkő',
    name: 'Kővel állandósított földrészlethatár-pont',
    orient: 'north',
    shapes: [{ t: 'circles', list: [[0, 0, 0.5], [0, 0.59, 0.3]] }, dot],
  },
  { code: 'JKDATA30', key: 'határpont', name: 'Egyéb módon állandósított földrészlethatár-pont', orient: 'north', shapes: [ring(1), dot] },
  { code: 'JKDATA32', key: 'határdomb', name: 'Határdomb', orient: 'north', shapes: [ring(1), ...ticks(0.5, 0.2), dot] },
  {
    code: 'JKDATA33',
    key: 'határdomb kővel',
    name: 'Kővel állandósított határdomb',
    orient: 'north',
    shapes: [{ t: 'circles', list: [[0, 0, 0.5], [0, 0.6, 0.25]] }, ...ticks(0.5, 0.2), dot],
  },
  {
    code: 'JKDATA34',
    key: 'határdomb faoszloppal',
    name: 'Faoszloppal állandósított határdomb',
    orient: 'north',
    shapes: [ring(1), ...ticks(0.5, 0.2), { t: 'line', pts: [[0, 0.5], [0, 0.7]] }, dot],
  },
  // B – Határok
  {
    code: 'JKDATB04',
    key: 'kapcsolójel',
    name: 'Kapcsolójel',
    orient: 'perpendicular',
    shapes: [
      { t: 'arc', c: [0, 0.3], r: 0.3, from: 90, to: 270 },
      { t: 'arc', c: [0, -0.3], r: 0.3, from: -90, to: 90 },
    ],
  },
  // C – Épületek, kerítések és tereptárgyak
  { code: 'JKDATC01', key: 'épület jel', name: 'Mérethelyesen nem ábrázolható állandó épület', orient: 'parallel', shapes: [square(1)] },
  { code: 'JKDATC02', key: 'négyzetes pillér', name: 'Négyzet alapú tartópillér', orient: 'parallel', shapes: [square(1), dot] },
  { code: 'JKDATC03', key: 'kerek pillér', name: 'Kör alapú tartópillér', orient: 'north', shapes: [ring(1)] },
  { code: 'JKDATC04', key: 'fényakna', name: 'Alagsor és pince fedetlen fényaknája', orient: 'parallel', shapes: [{ t: 'line', pts: [[-0.5, 0], [0.5, 0]] }] },
  {
    code: 'JKDATC05',
    key: 'fedett fényakna',
    name: 'Alagsor és pince fedett fényaknája',
    orient: 'parallel',
    shapes: [{ t: 'line', pts: [[-0.5, 0], [0.5, 0]] }, { t: 'line', pts: [[-0.3, 0], [-0.3, 0.2]] }, { t: 'line', pts: [[0.3, 0], [0.3, 0.2]] }],
  },
  {
    code: 'JKDATC20',
    key: 'tűlevelű fa',
    name: 'Egyedül álló tűlevelű fa',
    orient: 'north',
    shapes: [{ t: 'line', pts: [[1, 0], [0, 0], [0, 1]] }, { t: 'line', pts: [[-1, 1], [1, 1], [0, 5]], closed: true }],
  },
  {
    code: 'JKDATC21',
    key: 'lombos fa',
    name: 'Egyedül álló lombos fa',
    orient: 'north',
    shapes: [
      { t: 'line', pts: [[1, 0], [0, 0], [0, 1]] },
      { t: 'line', pts: [[-0.5, 1], [0.5, 1]] },
      { t: 'circles', list: [[0, 1.8, 1], [0, 3.4, 0.75], [0, 4.5, 0.5]] },
    ],
  },
  {
    code: 'JKDATC23',
    key: 'akna',
    name: 'Függőleges akna nyílása',
    orient: 'north',
    label: 'Akna',
    shapes: [
      { t: 'line', pts: Array.from({ length: 19 }, (_, i): XY => [1.5 * Math.cos(((45 + i * 10) * Math.PI) / 180), 1.5 * Math.sin(((45 + i * 10) * Math.PI) / 180)]), closed: true, fill: true },
      ring(3),
    ],
  },
  { code: 'JKDATC26', key: 'dögkút', name: 'Dögkút, siló', orient: 'north', label: 'dögk.', shapes: [ring(1), dot] },
  {
    code: 'JKDATC27',
    key: 'kereszt',
    name: 'Kőkereszt, képoszlop',
    orient: 'north',
    shapes: [{ t: 'line', pts: [[0, 0], [0, 4]] }, { t: 'line', pts: [[-1, 3], [1, 3]] }],
  },
  {
    code: 'JKDATC31',
    key: 'sír',
    name: 'Sír, kripta',
    orient: 'north',
    label: 'sír',
    shapes: [
      { t: 'line', pts: [[-1, 0], [1, 0]] },
      { t: 'line', pts: [[-0.5, 0], [-0.5, 1]] },
      { t: 'line', pts: [[0.5, 0], [0.5, 1]] },
      { t: 'arc', c: [0, 1], r: 0.5, from: 0, to: 180 },
    ],
  },
  // E – Távvezetékek, függőpályák
  { code: 'JKDATE01', key: 'alapozott oszlop', name: 'Elektromos vezeték pontszerűen ábrázolt alapozott tartója', orient: 'parallel', shapes: [square(1), dot] },
  { code: 'JKDATE02', key: 'villanyoszlop', name: 'Elektromos vezeték nem alapozott tartója (villanyoszlop)', orient: 'north', shapes: [ring(1), dot] },
  {
    code: 'JKDATE03',
    key: 'nagyfeszültség nyíl',
    name: 'Nagyfeszültségű vezeték nyilai (a tartótól 5 mm-re, a vezeték irányában)',
    orient: 'free',
    shapes: [3.5, 5].map((x): Shape => ({ t: 'line', pts: [[x - 1.5 * Math.cos(Math.PI / 6), 1.5 * Math.sin(Math.PI / 6)], [x, 0], [x - 1.5 * Math.cos(Math.PI / 6), -1.5 * Math.sin(Math.PI / 6)]] })),
  },
  {
    code: 'JKDATE04',
    key: 'földelő kút',
    name: 'Elektromos távvezeték biztonsági földelő kútja',
    orient: 'north',
    shapes: [
      ring(1.5),
      dot,
      { t: 'line', pts: [[0, -0.75], [0, -3.75]] },
      { t: 'line', pts: [[-1, -1.75], [1, -1.75]] },
      { t: 'line', pts: [[-0.625, -2.75], [0.625, -2.75]] },
      { t: 'line', pts: [[-0.15, -3.75], [0.15, -3.75]] },
    ],
  },
  {
    code: 'JKDATE07',
    key: 'oszloptrafó',
    name: 'Transzformátor villanyoszlopon',
    orient: 'north',
    shapes: [
      ring(1.5),
      dot,
      // villám: a kör É-K-i pontjából fel, vízszintesen balra, majd ismét fel; a nyíl a körnél
      { t: 'line', pts: [[0.375, 0.65], [1.375, 3.15], [-0.625, 3.15], [0.375, 5.65]] },
      { t: 'line', pts: [[0.375 + 0.75 * Math.cos(1.19 + Math.PI / 6), 0.65 + 0.75 * Math.sin(1.19 + Math.PI / 6)], [0.375, 0.65], [0.375 + 0.75 * Math.cos(1.19 - Math.PI / 6), 0.65 + 0.75 * Math.sin(1.19 - Math.PI / 6)]] },
    ],
  },
  {
    code: 'JKDATE12',
    key: 'trafóház',
    name: 'Transzformátorház',
    orient: 'free',
    shapes: [
      { t: 'line', pts: [[-0.5, 1.875], [-0.5, -0.125], [0.5, 0.125], [0.5, -1.875]] },
      { t: 'line', pts: [[0.5, -1.875], [0.2, -1.355], [0.8, -1.355]], closed: true },
    ],
  },
  // F – Vizek és vízügyi létesítmények
  {
    code: 'JKDATF01',
    key: 'tűzcsap',
    name: 'Tűzcsap',
    orient: 'north',
    shapes: [ring(1.5), dot, { t: 'line', pts: [[-0.75, 1.75], [-0.5, 1.75], [-0.5, 0.559]] }, { t: 'line', pts: [[0.75, 1.75], [0.5, 1.75], [0.5, 0.559]] }],
  },
  {
    code: 'JKDATF04',
    key: 'forrás',
    name: 'Forrás',
    orient: 'free',
    shapes: [ring(1.5), dot, { t: 'line', pts: [[0, -0.75], [0, -1.25], [0.433, -1.5], [0.433, -2]] }],
  },
  { code: 'JKDATF06', key: 'közkút', name: 'Vezetékes közkút, artézi kút', orient: 'north', label: 'Vk', shapes: [ring(1.5), dot] },
  {
    code: 'JKDATF07',
    key: 'gémeskút',
    name: 'Gémeskút',
    orient: 'north',
    shapes: [ring(1.5), dot, { t: 'line', pts: [[0, 0.75], [0, 2.375]] }, { t: 'line', pts: [[-1, 2], [1, 2.75], [1, 2]] }],
  },
  {
    code: 'JKDATF08',
    key: 'szökőkút',
    name: 'Szökőkút, díszkút',
    orient: 'north',
    shapes: [ring(1.5), dot, { t: 'line', pts: [[0, 0.75], [0, 2.25]] }, { t: 'arc', c: [-0.5, 2.25], r: 0.5, from: 0, to: 180 }, { t: 'arc', c: [0.5, 2.25], r: 0.5, from: 0, to: 180 }],
  },
  { code: 'JKDATF09', key: 'kút', name: 'Egyéb kút', orient: 'north', label: 'k', shapes: [ring(1.5), dot] },
  {
    code: 'JKDATF11',
    key: 'aknafedlap',
    name: 'Aknafedlap, földalatti vezetékek szellőzőaknái (kerek)',
    orient: 'north',
    shapes: [ring(1.5), { t: 'line', pts: [[-0.75 * D45, -0.75 * D45], [0.75 * D45, 0.75 * D45]] }, dot],
  },
  {
    code: 'JKDATF12',
    key: 'szögletes aknafedlap',
    name: 'Aknafedlap, földalatti vezetékek szellőzőaknái (szögletes)',
    orient: 'parallel',
    shapes: [square(1.5), { t: 'line', pts: [[-0.75, -0.75], [0.75, 0.75]] }, dot],
  },
  // G – Domborzat
  { code: 'JKDATG08', key: 'kótált pont', name: 'Kótált pont, relatív magassági pont', orient: 'north', color: '#e37b21', shapes: [dot] },
];

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

/** A jel a neve (ékezet nélkül is) vagy a T_JELKULCS kódja szerint. */
export function findSymbol(key: string): SymbolDef | undefined {
  const k = norm(key);
  return SYMBOLS.find((s) => norm(s.key) === k || s.code.toLowerCase() === k);
}

/**
 * A jel vonalai a rajzlapon: a vonatkozási pont (px, py, mm, y lefelé), a forgatás fokban (az óramutatóval
 * ellentétesen). A körök és ívek sokszögként, hogy a DXF-be is ugyanígy kerüljenek.
 */
export function symbolPaths(def: SymbolDef, rot: number): { pts: XY[]; closed: boolean; fill: boolean }[] {
  const a = (rot * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const tr = ([x, y]: XY): XY => [x * ca - y * sa, x * sa + y * ca];
  const circle = (c: XY, r: number, from = 0, to = 360): XY[] => {
    const n = Math.max(8, Math.ceil(((to - from) / 360) * 48));
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = ((from + ((to - from) * i) / n) * Math.PI) / 180;
      return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] as XY;
    });
  };
  const out: { pts: XY[]; closed: boolean; fill: boolean }[] = [];
  for (const s of def.shapes) {
    if (s.t === 'line') out.push({ pts: s.pts.map(tr), closed: !!s.closed, fill: !!s.fill });
    else if (s.t === 'circle') out.push({ pts: circle(s.c, s.r).slice(0, -1).map(tr), closed: true, fill: false });
    else if (s.t === 'arc') out.push({ pts: circle(s.c, s.r, s.from, s.to).map(tr), closed: false, fill: false });
    else if (s.t === 'dot') out.push({ pts: circle(s.c, 0.09).slice(0, -1).map(tr), closed: true, fill: true });
    else {
      // Körök uniója: minden kör azon ívei, amelyek nem esnek másik kör belsejébe.
      s.list.forEach(([cx, cy, r], i) => {
        const pts = circle([cx, cy], r, 0, 360).slice(0, -1);
        const out1 = pts.map((p) => s.list.every(([ox, oy, or], j) => j === i || Math.hypot(p[0] - ox, p[1] - oy) >= or - 1e-9));
        // a kint lévő pontok összefüggő szakaszai (a kör eleje és vége összekötve)
        const start = out1.indexOf(false);
        if (start < 0) {
          out.push({ pts: pts.map(tr), closed: true, fill: false });
          return;
        }
        let run: XY[] = [];
        for (let k = 1; k <= pts.length; k++) {
          const idx = (start + k) % pts.length;
          if (out1[idx]) run.push(pts[idx]!);
          else if (run.length > 0) {
            out.push({ pts: run.map(tr), closed: false, fill: false });
            run = [];
          }
        }
        if (run.length > 0) out.push({ pts: run.map(tr), closed: false, fill: false });
      });
    }
  }
  return out;
}
