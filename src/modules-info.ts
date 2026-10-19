/** A GeoCalc 3.5 geodéziai számítási kódjai az oldalsávhoz; a sablonok a súgó „Kódolás” részei. */
export interface ModuleInfo {
  code: string;
  name: string;
  ready: boolean;
  template: string;
  /** A tartozó példa azonosítója (src/examples.ts), ha van. */
  exampleId?: string;
}

export const MODULES: ModuleInfo[] = [
  { code: 'IT', name: 'Irányszög és távolság', ready: true, exampleId: 'it', template: 'it\n<kiinduló pont>\n<pont>\n;;\n' },
  {
    code: 'PO',
    name: 'Polárisan bemért pont',
    ready: true,
    exampleId: 'po',
    template: 'po\n<álláspont>\n<új pont>, <irány>, <távolság> [, kód] [, dM]\n;;\n',
  },
  { code: 'EM', name: 'Egyenesek metszése', ready: true, exampleId: 'em', template: 'em\n<metszéspont>\n<p1> <p2> <p3> <p4>\n;;\n' },
  {
    code: 'EB',
    name: 'Előmetszés belső irányokkal',
    ready: true,
    exampleId: 'eb',
    template: 'eb\n<új pont>\n<ismert pont>, <belső szög>\n<ismert pont>, <belső szög>\n;;\n',
  },
  {
    code: 'ET',
    name: 'Előmetszés tájékozott irányokkal',
    ready: true,
    exampleId: 'et',
    template: 'et\n<új pont>\n<ismert pont>, <irány>\n<ismert pont>, <irány>\n;;\n',
  },
  { code: 'KM', name: 'Kitűzési méretek', ready: true, exampleId: 'km', template: 'km\n<kezdőpont>, <végpont>\n<pont>\n;;\n' },
  {
    code: 'IV',
    name: 'Ív-/távolságmetszés',
    ready: true,
    exampleId: 'iv',
    template: 'IV\n<új pont>\n<ismert pont>  <távolság>\n<ismert pont>  <távolság>\n;;\n',
  },
  { code: 'TE', name: 'Területszámítás', ready: true, exampleId: 'te', template: 'te, <fejléc>\n<pont>\n<pont>\n<pont>\n;;\n' },
  { code: 'TO', name: 'Terület összesítés', ready: true, exampleId: 'to', template: 'to\n' },
  { code: 'ZK', name: 'Tájékozási szög tárolása', ready: true, exampleId: 'zk', template: 'zk, <álláspont>, <tájékozási szög>\n' },
  { code: 'TJ', name: 'Iránysorozat tájékozása', ready: true, exampleId: 'tj', template: 'tj\n<álláspont>\n<pont>, <irány>\n;;\n' },
  {
    code: 'SV',
    name: 'Sokszögvonal',
    ready: true,
    exampleId: 'sv',
    template: 'sv\n<kezdőpont> <irány> <távolság> [<végpont> <irány>]\n<pont> <hátra> <előre> <távolság>\n;;\n',
  },
  {
    code: 'SM',
    name: 'Magassági sokszögvonal',
    ready: true,
    exampleId: 'sm',
    template:
      'sm\n<kezdőpont> <irány> <távolság> <végpont> [<irány>] [<dM előre>] [<dM hátra a végpontról>]\n<pont> <hátra> <előre> <távolság> [<dM hátra>] [<dM előre>]\n;;\n',
  },
  {
    code: 'EK',
    name: 'Egypontos kiegyenlítés',
    ready: true,
    exampleId: 'ek',
    template: 'ek\n<új pont> [<Mi″> <Ti cm>]\n<ismert pont>, [<külső irány>], [<belső irány>], [<távolság>]\n;;\n',
  },
  {
    code: 'KP',
    name: 'Külpontos mérés központosítása',
    ready: true,
    exampleId: 'kp',
    template: 'kp\n<központ> <irány a központra> <külpontosság R>\n<pont> <irány> [<távolság>]\n;;\n',
  },
  {
    code: 'VP',
    name: 'Vesztett pont',
    ready: true,
    exampleId: 'vp',
    template: 'vp\n<új pont> [<Mi″> <Ti cm>]\n<ismert pont>, [<irány>], [<távolság>]\n;;\n',
  },
  {
    code: 'DK',
    name: 'Derékszögű koordinátamérés',
    ready: true,
    exampleId: 'dk',
    template: 'dk\n<kezdőpont>, <végpont> [, <mért távolság>]\n<új pont>, <a>, <b>\n;;\n',
  },
  {
    code: 'AF',
    name: 'Affin transzformáció',
    ready: true,
    exampleId: 'af',
    template: 'af\n<közös pont> <új Y> <új X>\n<közös pont> <új Y> <új X>\n<közös pont> <új Y> <új X>\n;;\n<átszámítandó pont>\n;;\n',
  },
  {
    code: 'HE',
    name: 'Helmert-transzformáció',
    ready: true,
    exampleId: 'he',
    template: 'he\n<közös pont> <új Y> <új X>\n<közös pont> <új Y> <új X>\n;;\n<átszámítandó pont>\n;;\n',
  },
];
