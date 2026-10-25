/**
 * A földhivatalnak leadott rajzok rétegkiosztása (réteg neve, AutoCAD-szín, vonaltípus). A nevek és a
 * színek a leadott változási vázrajzok, mérési vázlatok és épületfeltüntetések DXF-jeiből valók, hogy
 * a kimenet ugyanabba a rétegrendbe kerüljön.
 */

export interface LineType {
  name: string;
  /** Vonalvastagság [mm] (a név elején). */
  width: number;
  /** Minta [mm]: pozitív vonal, negatív köz; üres = folyamatos. */
  pattern: number[];
}

export const LINE_TYPES: LineType[] = [
  { name: '0.18 - folyamatos', width: 0.18, pattern: [] },
  { name: '0.18 - pontsor (0.5-0.5)', width: 0.18, pattern: [0.5, -0.5] },
  { name: '0.18 - szaggatott (1.5-0.5)', width: 0.18, pattern: [1.5, -0.5] },
  { name: '0.18 - szaggatott (2-1)', width: 0.18, pattern: [2, -1] },
  { name: '0.18 - szaggatott (3-1)', width: 0.18, pattern: [3, -1] },
  { name: '0.30 - folyamatos', width: 0.3, pattern: [] },
  { name: '0.30 - szaggatott (0.5-0.5)', width: 0.3, pattern: [0.5, -0.5] },
  { name: '0.50 - folyamatos', width: 0.5, pattern: [] },
  { name: '0.18 - megszűnt', width: 0.18, pattern: [] },
  { name: '0.18 - megszűnt (0.5-0.5)', width: 0.18, pattern: [0.5, -0.5] },
];

export interface Layer {
  name: string;
  /** AutoCAD színindex (ACI). */
  color: number;
  /** Vonaltípus neve; szövegrétegnél „Continuous”. */
  ltype: string;
}

const L = (name: string, color: number, ltype = 'Continuous'): Layer => ({ name, color, ltype });

/** A rétegek a programban használt kulcsokkal. */
export const LAYERS = {
  parcel: L('Földrészlet határ', 100, '0.18 - folyamatos'),
  hrsz: L('Helyrajziszám', 100),
  newParcel: L('Előzetes földrészlet vonal', 1, '0.50 - folyamatos'),
  newHrsz: L('Előzetes helyrajziszám', 1),
  oldParcel: L('Megszűnő földrészlet vonal', 145, '0.18 - megszűnt'),
  oldHrsz: L('Megszűnő helyrajziszám', 153, '0.18 - megszűnt'),
  sub: L('Alrészlet határ', 104, '0.18 - pontsor (0.5-0.5)'),
  subLetter: L('Alrészlet betűjel', 104),
  subUse: L('Alrészlet művelési ág', 112),
  quality: L('Minőségi osztály', 112),
  newSub: L('Előzetes alrészlet vonal', 32, '0.30 - szaggatott (0.5-0.5)'),
  newSubLetter: L('Előzetes alrészlet betűjel', 32),
  newSubUse: L('Előzetes alrészlet művelési ág', 42),
  oldSub: L('Megszűnő alrészlet határ', 220, '0.18 - megszűnt (0.5-0.5)'),
  newBuilding: L('Új épület (bármilyen)', 130, '0.50 - folyamatos'),
  residential: L('Lakóépület', 140, '0.18 - folyamatos'),
  farm: L('Gazdasági és melléképület', 110, '0.18 - folyamatos'),
  holiday: L('Üdülőépület', 101, '0.18 - folyamatos'),
  oldBuilding: L('Megszűnő épület (bármilyen)', 141, '0.18 - megszűnt'),
  publicBuilding: L('Középület_ közintézmény', 60, '0.18 - folyamatos'),
  industrial: L('Üzemi épület_ építmény', 30, '0.18 - folyamatos'),
  mixed: L('Vegyes funkciójú épület', 99, '0.18 - folyamatos'),
  unsorted: L('Rendezetlen funkciójú épület', 139, '0.18 - folyamatos'),
  wallProjection: L('Terepszintre levetített külső falsík', 121, '0.18 - szaggatott (1.5-0.5)'),
  fence: L('Kerítés (jogi állapottal nem egyező)', 120, '0.18 - szaggatott (2-1)'),
  wall: L('Szabadon álló fal_ kerítéslábazat birtokhatáron', 57, '0.18 - folyamatos'),
  servitude: L('Szolgalmi_ kezelői_ használati_ stb. jog határa', 41, '0.18 - szaggatott (3-1)'),
  houseNo: L('Házszám', 51),
  street: L('Utcanév', 121),
  place: L('Dűlőnév_ földrajzi név', 75),
  address: L('Címkoordináta', 5),
  pointNo: L('Pontszám (mért)', 92),
  distMeasured: L('Távolság (mért)', 92, '0.18 - szaggatott (1.5-0.5)'),
  distComputed: L('Távolság (számított)', 8, '0.18 - szaggatott (1.5-0.5)'),
  objectType: L('Objektum féleség felirat', 1),
  symbol: L('Jelkulcsi jel', 7, '0.18 - folyamatos'),
  frame: L('Fekete keret', 7, '0.18 - folyamatos'),
  other: L('Egyéb', 1),
} satisfies Record<string, Layer>;

export type LayerKey = keyof typeof LAYERS;

export const lineTypeOf = (layer: Layer): LineType | undefined => LINE_TYPES.find((t) => t.name === layer.ltype);

/** Az ACI szín közelítő RGB-je a képernyős rajzhoz (a gyakori indexek; a többi szürke). */
export function aciColor(i: number): string {
  const base: Record<number, string> = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#000000', 8: '#808080', 9: '#c0c0c0' };
  if (base[i]) return base[i]!;
  if (i >= 250) return ['#333333', '#505050', '#696969', '#828282', '#bebebe', '#ffffff'][i - 250] ?? '#808080';
  if (i < 10) return '#808080';
  // 10–249: 24 színárnyalat × 10 fokozat
  const hue = (Math.floor((i - 10) / 10) * 15) % 360;
  const step = (i - 10) % 10;
  const light = [50, 75, 40, 65, 30, 50, 20, 35, 15, 25][step]!;
  const sat = step % 2 === 0 ? 100 : 50;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/** Az épület rétege a DAT objektumféleség-kódja (T_OBJ_ATTRCA obj_fels, DAT-M1) szerint. */
export function buildingLayer(objFels: string): LayerKey {
  switch (objFels) {
    case 'CA01':
      return 'residential';
    case 'CA02':
      return 'holiday';
    case 'CA03':
      return 'publicBuilding';
    case 'CA04':
      return 'industrial';
    case 'CA07':
      return 'mixed';
    case 'CA08':
      return 'unsorted';
    default:
      return 'farm';
  }
}
