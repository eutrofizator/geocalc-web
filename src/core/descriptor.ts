/**
 * Az Adatleíró munkalap logikája (súgó 44. o.).
 *
 * A munkalap a mérési adatokból (álláspont, irányzott pont, irány/leolvasás, távolság) űrlaposan
 * állítja elő a Munkaterület `.gcd` kódját. A kódblokkok pontosan a `tj`, `po`, `kp`, `vp`, `et`,
 * `sv`, `sm` számítások fejezetei, ezért a generált szöveg azonnal futtatható.
 */

import { CalcError } from './errors';

/** Egy mérés az Adatleíró táblázatában. */
export interface Observation {
  /** Álláspont száma (AP). */
  station: string;
  /** Az irányzott pont száma (IP). */
  id: string;
  /** Irány (leolvasás) GeoCalc FOK.PPMMSS formában, pl. `182.0324`. */
  dir: string;
  /** Mért távolság méterben (szöveg); üres, ha nem mérték. */
  dist: string;
}

export type CalcType = 'TJ' | 'PO' | 'KP' | 'VP' | 'ET' | 'IV' | 'SV' | 'SM';

export interface TypeInfo {
  code: CalcType;
  name: string;
  /** A súgó 44. oldala szerinti kódváz. */
  hint: string;
}

/** Az Adatleíró Számítás oszlopában választható kódok, a súgó sorrendjében. */
export const CALC_TYPES: TypeInfo[] = [
  { code: 'TJ', name: 'Tájékozás', hint: 'tj / álláspont / pont, irány … ;;' },
  { code: 'PO', name: 'Poláris pont számítása', hint: 'po / álláspont / új pont, irány, távolság … ;;' },
  { code: 'KP', name: 'Központosítás', hint: 'kp / központ, irány a központra, R / pont, irány [, távolság] … ;;' },
  { code: 'VP', name: 'Vesztett pont', hint: 'vp / új pont / ismert pont, irány, távolság … ;;' },
  { code: 'ET', name: 'Előmetszés', hint: 'et / új pont / ismert pont, irány … ;;' },
  {
    code: 'IV',
    name: 'Ív-/távolságmetszés',
    hint: 'iv / új pont / ismert pont, távolság … ;; (távolság–távolság metszés)',
  },
  {
    code: 'SV',
    name: 'Sokszögvonal',
    hint: 'sv / kezdőpont, irány, távolság, végpont / pont, hátra, előre, távolság … ;;',
  },
  {
    code: 'SM',
    name: 'Magassági sokszögvonal',
    hint: 'sm / kezdőpont, irány, távolság, végpont / pont, hátra, előre, távolság … ;;',
  },
];

/** Álláspontok a mérésekből, az első előfordulás sorrendjében. */
export function stations(obs: Observation[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of obs) {
    const s = o.station.trim();
    if (s !== '' && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** Egy álláspont irányzott pontjai, a mérések sorrendjében. */
export function observationsOf(obs: Observation[], station: string): Observation[] {
  return obs.filter((o) => o.station.trim() === station);
}

/**
 * Mezők összefűzése a GeoCalc jelölésével (vessző + szóköz). A belső üres mezőket megtartja
 * (`6, , 321.2330`), a záró üreseket elhagyja, ahogy a program is teszi.
 */
export function joinFields(parts: (string | undefined)[]): string {
  let end = parts.length;
  while (end > 0 && (parts[end - 1] ?? '').trim() === '') end--;
  return parts.slice(0, end).map((p) => (p ?? '').trim()).join(', ');
}

export interface DescriptorRequest {
  type: CalcType;
  /** AP – a kiválasztott álláspont. */
  station: string;
  /** A kiválasztott irányzott pontok (IP). */
  obs: Observation[];
  /** Az új pont (PO, VP, ET), illetve a végpont (SV, SM). */
  target?: string;
  /** SV/SM: a kezdőpontról az első sokszögpontra mért irány. */
  startDir?: string;
  /** KP: a központra (központ számára) mért irány. */
  centerDir?: string;
  /** KP: a külpontosság (R). */
  eccentricity?: string;
}

function need(value: string | undefined, what: string): string {
  const v = (value ?? '').trim();
  if (v === '') throw new CalcError(`Add meg: ${what}.`);
  return v;
}

/**
 * A kiválasztott adatokból előállítja a kért számítás kódblokkját. A blokkok azonnal futtathatók a
 * Munkaterületen. A `;;` lezárás minden blokk végén szerepel.
 */
export function generateCode(req: DescriptorRequest): string {
  // Az IV (ív-/távolságmetszés) álláspont nélküli kód; minden más számítás álláspontot igényel.
  const station = req.type === 'IV' ? (req.station ?? '').trim() : need(req.station, 'az álláspontot (AP)');
  if (req.obs.length === 0) throw new CalcError('Jelölj ki legalább egy irányzott pontot (IP).');
  const rows: string[] = [];
  let head: string[];

  switch (req.type) {
    case 'TJ':
      head = ['tj', station];
      for (const o of req.obs) rows.push(joinFields([need(o.id, 'az irányzott pont számát'), o.dir]));
      break;
    case 'PO':
      head = ['po', station];
      for (const o of req.obs) {
        if ((o.dist ?? '').trim() === '') throw new CalcError(`PO: a(z) ${o.id} pontra mért távolság hiányzik.`);
        rows.push(joinFields([need(o.id, 'az új pont számát'), o.dir, o.dist]));
      }
      break;
    case 'KP': {
      head = ['kp', joinFields([station, need(req.centerDir, 'a központra mért irányt'), need(req.eccentricity, 'a külpontosságot (R)')])];
      for (const o of req.obs) rows.push(joinFields([need(o.id, 'a pont számát'), o.dir, o.dist]));
      break;
    }
    case 'VP': {
      head = ['vp', need(req.target, 'az új pont számát')];
      for (const o of req.obs) {
        if ((o.dir ?? '').trim() === '' && (o.dist ?? '').trim() === '') {
          throw new CalcError(`VP: a(z) ${o.id} pontra irány vagy távolság kell.`);
        }
        rows.push(joinFields([need(o.id, 'az ismert pont számát'), o.dir, o.dist]));
      }
      break;
    }
    case 'ET':
      head = ['et', need(req.target, 'az új pont számát')];
      for (const o of req.obs) rows.push(joinFields([need(o.id, 'az ismert pont számát'), o.dir]));
      break;
    case 'IV':
      head = ['iv', need(req.target, 'az új pont számát')];
      for (const o of req.obs) {
        if ((o.dist ?? '').trim() === '') throw new CalcError(`IV: a(z) ${o.id} pontra mért távolság hiányzik.`);
        rows.push(joinFields([need(o.id, 'az ismert pont számát'), o.dist]));
      }
      break;
    case 'SV':
    case 'SM': {
      const code = req.type.toLowerCase();
      const first = req.obs[0]!;
      head = [code, joinFields([station, need(req.startDir ?? first.dir, 'a kezdő irányt'), first.dist, req.target])];
      // A további pontok: „hátra” szög 0, az „előre” irány a következő pontra mutat.
      for (let i = 1; i < req.obs.length; i++) {
        const o = req.obs[i]!;
        rows.push(joinFields([need(o.id, 'a sokszögpont számát'), '0', o.dir, o.dist]));
      }
      break;
    }
    default: {
      const never: never = req.type;
      throw new CalcError(`Ismeretlen számítási típus: ${String(never)}`);
    }
  }

  return [...head, ...(rows.length > 0 ? rows : []), ';;'].join('\r\n') + '\r\n';
}

export interface AutoRequest {
  obs: Observation[];
  /** Az ismert pontok (a koordináta-állományból). */
  known: Set<string>;
  /** Az álláspont számítási kódja: `tj` (ismert ponton állunk fel) vagy `vp` (szabad álláspont). */
  stationCode: 'tj' | 'vp';
  /** A tájékozáshoz felhasznált ismert irányok száma. */
  orientCount: number;
}

/**
 * Automatikus kódolás (súgó 44. o.): álláspontonként a tájékozó irányokból `TJ` (illetve szabad
 * álláspontnál `VP`), a többi irányból `PO` blokk készül. A blokkok sorrendje a számításhoz megfelelő:
 * előbb a tájékozás, utána a poláris pontok.
 */
export function autoCode(req: AutoRequest): string {
  const n = Math.max(1, Math.floor(req.orientCount));
  const blocks: string[] = [];
  for (const s of stations(req.obs)) {
    const rows = observationsOf(req.obs, s);
    const orient = rows.slice(0, n);
    const rest = rows.slice(n);
    if (req.stationCode === 'vp') {
      blocks.push(['vp', s, ...orient.map((o) => joinFields([o.id, o.dir, o.dist])), ';;'].join('\r\n'));
    } else {
      blocks.push(['tj', s, ...orient.map((o) => joinFields([o.id, o.dir])), ';;'].join('\r\n'));
    }
    if (rest.length > 0) {
      blocks.push(['po', s, ...rest.map((o) => joinFields([o.id, o.dir, o.dist])), ';;'].join('\r\n'));
    }
  }
  return blocks.length === 0 ? '' : blocks.join('\r\n') + '\r\n';
}

/**
 * Mérési sorok beolvasása egyszerű szövegből: `álláspont, pont, irány[, távolság]` soronként.
 * A `#` kezdetű sor fejléc/megjegyzés, kimarad. A vesszős és a szóközös elválasztást is kezeli.
 */
export function parseObservations(text: string): { obs: Observation[]; skipped: number } {
  const obs: Observation[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const byComma = line.split(/[,;\t]+/).map((t) => t.trim());
    const fields = byComma.length >= 3 ? byComma : line.split(/\s+/);
    if (fields.length < 3 || fields[0] === '' || fields[1] === '' || fields[2] === '') {
      skipped++;
      continue;
    }
    obs.push({ station: fields[0]!, id: fields[1]!, dir: fields[2]!, dist: fields[3] ?? '' });
  }
  return { obs, skipped };
}
