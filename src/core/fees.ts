import type { Row, Section } from './types';

/**
 * Igazgatási szolgáltatási díjak az 1/2024. (I. 30.) KTM rendelet szerint (a földmérő munkájához
 * kapcsolódó tételek):
 * - 10. §: telekalakítás engedélyezése;
 * - 12–16. §: a változási vázrajz vizsgálata (földrészlethatár, építmény, művelési ág, jog és tény,
 *   közigazgatási/fekvéshatár, használati megosztás és kitűzés), újrazáradékolás 50%;
 * - 4. melléklet 41–42. tétel: az adatszolgáltatás földrészletenként, a terület szerint (b), c), d) megjegyzés).
 * A sávhatárokon a „…-tól földrészletenként további” díj a sáv első földrészletétől számít (így a sávok
 * folytonosan illeszkednek: pl. 15 földrészlet 96 000 + 10 · 16 000 = 256 000 Ft, a következő sáv alapja).
 */

export type ChangeKind =
  | 'subdivision' // telekfelosztás, telekcsoport-újraosztás
  | 'boundary' // telekhatár-rendezés
  | 'merge' // telekegyesítés
  | 'setout-14-8' // az Fttv. 14. § (8) szerinti kitűzés
  | 'expropriation' // kisajátítás
  | 'building' // építmény feltüntetése, változása, megszüntetése
  | 'condo' // társasház, szövetkezeti ház alaprajza
  | 'cultivation' // művelési ág változása
  | 'right' // jog bejegyzése, tény feljegyzése
  | 'admin-border' // közigazgatási és fekvéshatár módosítása
  | 'use-split' // használati megosztás
  | 'setout'; // földrészlethatár-kitűzési vázrajz

export const CHANGE_KINDS: { id: ChangeKind; label: string }[] = [
  { id: 'subdivision', label: 'Telekfelosztás, telekcsoport-újraosztás' },
  { id: 'boundary', label: 'Telekhatár-rendezés' },
  { id: 'merge', label: 'Telekegyesítés' },
  { id: 'setout-14-8', label: 'Kitűzés (Fttv. 14. § (8))' },
  { id: 'expropriation', label: 'Kisajátítás' },
  { id: 'building', label: 'Épületfeltüntetés (építmény változása)' },
  { id: 'condo', label: 'Társasház, szövetkezeti ház alaprajza' },
  { id: 'cultivation', label: 'Művelési ág változása' },
  { id: 'right', label: 'Jog bejegyzése, tény feljegyzése' },
  { id: 'admin-border', label: 'Közigazgatási vagy fekvéshatár módosítása' },
  { id: 'use-split', label: 'Használati megosztás' },
  { id: 'setout', label: 'Földrészlethatár-kitűzési vázrajz' },
];

export interface FeeInput {
  kind: ChangeKind;
  /** A változás előtti földrészletek száma. */
  before: number;
  /** A változás utáni földrészletek száma. */
  after: number;
  /** Új, változott vagy megszűnt építmények (épületfeltüntetés). */
  buildings: number;
  /** Kialakuló vagy módosított egyéb önálló ingatlanok (társasház). */
  units: number;
  /** Új alrészletek (művelési ág változása). */
  subparcels: number;
  /** A változás előtti földrészletek területe [m²] (az adatszolgáltatás díjához). */
  areas: number[];
  /** Újrazáradékolás (a vizsgálati díj 50%-a, 16. §). */
  reissue: boolean;
  /** Az adatszolgáltatás díja is (4. melléklet 41–42. tétel). */
  withData: boolean;
}

export interface FeeLine {
  item: string;
  basis: string;
  amount: number;
}

const BORDER_KINDS: ChangeKind[] = ['subdivision', 'boundary', 'merge', 'setout-14-8', 'expropriation'];

/** 10. §: telekalakítás engedélyezése; n = érintett földrészletek száma. */
export function permitFee(n: number): number {
  if (n < 2) return 0;
  if (n <= 5) return 19_000 * n;
  if (n <= 15) return 96_000 + 16_000 * (n - 5);
  if (n <= 25) return 256_000 + 1_600 * (n - 15);
  return 272_000 + 800 * (n - 25);
}

/** 12. § (1) b): a földrészlethatár változásával kapcsolatos vázrajz vizsgálata; n = a változás utáni földrészletek száma. */
export function borderReviewFee(n: number): number {
  if (n <= 5) return 4_000;
  if (n <= 10) return 5_600;
  if (n <= 30) return 9_600;
  if (n <= 50) return 12_000;
  if (n <= 100) return 17_600;
  // „100 földrészlet fölött 17 600 forint, és a századik földrészlettől földrészletenként további 160 forint”
  return 17_600 + 160 * (n - 99);
}

/** 4. melléklet 41–42. tétel: egy földrészlet adatainak díja a területe szerint (100 ha fölött arányosan, c) megj.). */
export function dataFeeFor(areaM2: number, item: '41' | '42'): number {
  const ha = areaM2 / 10_000;
  const [t10, t50, t100] = item === '41' ? [10_000, 16_000, 19_000] : [6_500, 13_000, 14_500];
  if (ha <= 10) return t10;
  if (ha <= 50) return t50;
  if (ha <= 100) return t100;
  return Math.round(t100 * Number((ha / 100).toFixed(3)));
}

const ft = (n: number) => `${Math.round(n).toLocaleString('hu-HU')} Ft`;

export function computeFees(f: FeeInput): { lines: FeeLine[]; total: number } {
  const lines: FeeLine[] = [];
  const border = BORDER_KINDS.includes(f.kind);
  const add = (item: string, basis: string, amount: number) => lines.push({ item, basis, amount });

  // A telekalakítási engedélyezés (10. §; az érintett földrészletek száma a 10. § (3) szerint).
  if (f.kind === 'subdivision' || f.kind === 'boundary' || f.kind === 'merge') {
    const n = f.kind === 'subdivision' ? f.after : f.before;
    add('Telekalakítás engedélyezése (10. §)', `${n} érintett földrészlet (${f.kind === 'subdivision' ? 'a változás utáni' : 'a változás előtti'} állapot szerint)`, permitFee(n));
  }

  // A változási vázrajz vizsgálata (12–15. §)
  let review = 0;
  let basis = '';
  switch (f.kind) {
    case 'merge':
      review = 4_000;
      basis = '12. § (1) a) – a földrészletek számától függetlenül';
      break;
    case 'subdivision':
    case 'boundary':
    case 'setout-14-8':
    case 'expropriation':
      review = borderReviewFee(f.after);
      basis = `12. § (1) b) – ${f.after} földrészlet a változás után`;
      break;
    case 'building':
      review = 10_600 + 2_000 * f.buildings;
      basis = `13. § (1) – 10 600 Ft + ${f.buildings} építmény · 2000 Ft`;
      break;
    case 'condo':
      review = 2_000 * f.units;
      basis = `13. § (2) – ${f.units} egyéb önálló ingatlan · 2000 Ft`;
      break;
    case 'cultivation':
      review = 1_000 * Math.min(f.subparcels, 5) + 200 * Math.max(0, f.subparcels - 5);
      basis = `14. § (1) – ${f.subparcels} új alrészlet (5-ig 1000 Ft, utána 200 Ft)`;
      break;
    case 'right':
      review = f.before > 0 ? 1_500 + 500 * (f.before - 1) : 0;
      basis = `15. § (1) – ${f.before} földrészlet (1500 Ft + további 500 Ft)`;
      break;
    case 'admin-border':
      review = 4_000;
      basis = '15. § (2) – a földrészletek számától függetlenül';
      break;
    case 'use-split':
    case 'setout':
      review = 3_200;
      basis = '15. § (4)';
      break;
  }
  if (f.reissue) {
    review = Math.round(review / 2);
    basis += '; újrazáradékolás: 50% (16. §)';
  }
  add('A változási vázrajz vizsgálata', basis, review);

  // Adatszolgáltatás (4. melléklet 41–42. tétel)
  if (f.withData && f.areas.length > 0) {
    const item = border ? '41' : '42';
    const sorted = [...f.areas].sort((a, b) => b - a);
    // b) megj.: a legnagyobbra 100%, a többire 50% (telekegyesítésnél 20%); d) megj.: jog, tény, művelési ág 20%.
    const rest = f.kind === 'merge' || f.kind === 'right' || f.kind === 'cultivation' ? 0.2 : border ? 0.5 : 1;
    const amount = sorted.reduce((s, a, i) => s + dataFeeFor(a, item) * (i === 0 ? 1 : rest), 0);
    add(
      `Adatszolgáltatás (4. melléklet ${item}. tétel)`,
      `${sorted.length} földrészlet; a legnagyobbra 100%${sorted.length > 1 ? `, a többire ${Math.round(rest * 100)}%` : ''}`,
      Math.round(amount),
    );
  }
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

export function feesSection(f: FeeInput): Section {
  const { lines, total } = computeFees(f);
  const rows: Row[] = lines.map((l) => ({ cells: [l.item, l.basis, ft(l.amount)], role: 'result' }));
  rows.push({ cells: ['Összesen', '', ft(total)], role: 'base' });
  return {
    kind: 'fees',
    title: `Igazgatási szolgáltatási díjak – ${CHANGE_KINDS.find((k) => k.id === f.kind)!.label}`,
    columns: ['Tétel', 'Alap', 'Díj'],
    rows,
    footer: [
      '1/2024. (I. 30.) KTM rendelet. A díj nem tartalmazza a változás ingatlan-nyilvántartási bejegyzésének díját; ' +
        'a díjat a hatóság állapítja meg – a számítás tájékoztató jellegű.',
    ],
  };
}
