/** Közös típusok a számítómaghoz. A mag tiszta: a futások között nincs megosztott állapot. */

export interface Point {
  id: string;
  /** Y = keleti irány (EOV-ban a vízszintes koordináta). */
  y: number;
  /** X = északi irány. */
  x: number;
  /** Magasság; null, ha nincs megadva. */
  m: number | null;
  code: string;
}

export type RowRole = 'base' | 'input' | 'result';

/** Jelölőnégyzet egy táblázatsorban (a felületi műveletekhez, pl. mérés kizárása a kiegyenlítésből). */
export interface RowCheck {
  /** A művelet azonosítója (a nézet a `data-check` attribútumból olvassa ki). */
  key: string;
  checked: boolean;
  /** Rövidített leírás (a négyzet címkéje és a képernyőolvasó szövege). */
  label: string;
  /** Kiszámított (nem kézzel beállítható) állapot. */
  disabled?: boolean;
}

export interface Row {
  cells: string[];
  role?: RowRole;
  /** Azonosító a felületi műveletekhez (pl. mérés kizárása a kiegyenlítésből). */
  key?: string;
  /** Jelölőnégyzet a sor első cellája helyén; a `cells[0]` szövege a szöveges jegyzőkönyvbe kerül. */
  check?: RowCheck;
}

/** Egy számítás eredményének megjeleníthető része (táblázat). */
export interface Section {
  kind: string;
  title: string;
  columns: string[];
  rows: Row[];
  footer?: string[];
}

export interface Issue {
  level: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
}

export interface BlockLine {
  text: string;
  no: number;
}

/** Egy kódolt számítás: fejléc (kód + paraméterek) és adatsorok a `;;` jelig. */
export interface Block {
  code: string;
  /** A kód utáni nyers szöveg (pl. a TE fejléce). */
  head: string;
  args: string[];
  lines: BlockLine[];
  /** Második `;;`-lal lezárt lista (AF, HE: az átszámítandó pontok). */
  lines2?: BlockLine[];
  no: number;
}

export interface Program {
  hasHeader: boolean;
  kFile: string | null;
  hideCoords: boolean;
  coordLines: BlockLine[];
  blocks: Block[];
  issues: Issue[];
}

export interface Context {
  /** Ismert és eddig kiszámított pontok. */
  points: Map<string, Point>;
  /** Csak a futás során kiszámított pontok, számítási sorrendben. */
  computed: Map<string, Point>;
  /** Tájékozási szögek (fok, tizedes). */
  zk: Map<string, number>;
  /** A legutóbbi TO óta kiszámított területek. */
  areas: number[];
  /** Transzformációval (AF, HE) az új rendszerbe átszámított pontok; külön rendszer, ezért nem keverednek a `points`-szal. */
  transformed: Point[];
  issues: Issue[];
  getPoint(id: string, line?: number): Point;
  getZk(id: string): number;
  setPoint(p: Point): void;
}

export type Handler = (ctx: Context, block: Block) => Section[];
