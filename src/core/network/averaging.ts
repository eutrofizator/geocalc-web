import { formatDms, normDeg, parseDms, wrapDeg } from '../angle';
import { fix } from '../format';
import type { Issue, Row, Section } from '../types';
import type { NetObservation, NetStation } from './types';

/**
 * Kétállásos (I. és II. távcsőállású) jegyzőkönyv középelése.
 *
 * A GeoCalc GCAR_2T átalakítójának képletei (a program dekompilált kódjából):
 *   Hz = (Hz₁ + Hz₂ − 180°) / 2          (a II. állás irányértékét 180°-kal csökkentve)
 *   Zi = (Zi₁ + 360° − Zi₂) / 2          (a zenitszögek átlaga, az indexhiba kiesik)
 *   Tf, Tv: a mért értékek számtani közepe
 * Az átalakító célpontonként csak az első és az utolsó leolvasást veszi figyelembe, ezért a nulla irányt (amelyet
 * kétszer mérnek, a horizont zárásakor) hibásan középeli. Ez a megvalósítás az I. és a II. állás összes
 * leolvasását külön átlagolja, és a két állás átlagát veszi.
 */

export interface AveragingRow {
  station: string;
  target: string;
  /** Az I. és a II. állás leolvasásainak száma. */
  faceI: number;
  faceII: number;
  hzI: number | null;
  hzII: number | null;
  hz: number;
  ziI: number | null;
  ziII: number | null;
  zi: number | null;
  /** Az I. és II. állás zenitszög-összegének eltérése 360°-tól [″] (az indexhiba kétszerese). */
  indexError: number | null;
}

export interface AveragingResult {
  stations: NetStation[];
  rows: AveragingRow[];
  issues: Issue[];
  sections: Section[];
}

const meanCircular = (values: number[]): number => {
  const ref = values[0]!;
  return normDeg(ref + values.reduce((a, v) => a + wrapDeg(v - ref), 0) / values.length);
};
const mean = (values: number[]) => values.reduce((a, v) => a + v, 0) / values.length;

/** Egész másodpercre kerekített szög (a jegyzőkönyv FOK.PPMMSS formátuma egész másodpercet tárol). */
const wholeSeconds = (deg: number) => (Math.round(normDeg(deg) * 3600) / 3600) % 360;

export function averageFaces(stations: NetStation[]): AveragingResult {
  const issues: Issue[] = [];
  const rows: AveragingRow[] = [];
  const out: NetStation[] = [];

  for (const st of stations) {
    const groups = new Map<string, NetObservation[]>();
    for (const o of st.observations) {
      const list = groups.get(o.target) ?? [];
      list.push(o);
      groups.set(o.target, list);
    }
    const observations: NetObservation[] = [];
    for (const [target, list] of groups) {
      const first = list[0]!;
      if (list.length === 1) {
        observations.push(first);
        continue;
      }
      // Az első leolvasás az I. állás; a hozzá képest ~180°-ra levők a II. állás.
      const faceOf = (o: NetObservation) => (Math.abs(wrapDeg(o.hz - first.hz)) <= 90 ? 'I' : 'II');
      const I = list.filter((o) => faceOf(o) === 'I');
      const II = list.filter((o) => faceOf(o) === 'II');
      for (const o of II) {
        const dev = Math.abs(Math.abs(wrapDeg(o.hz - first.hz)) - 180);
        if (dev > 10) {
          issues.push({
            level: 'warning',
            message: `${st.id}→${target}: a II. állás irányértéke (${formatDms(o.hz)}) ${fix(dev, 1)}°-kal tér el a 180°-tól az I. álláshoz képest.`,
          });
        }
      }
      const hzI = meanCircular(I.map((o) => o.hz));
      const hzII = II.length > 0 ? meanCircular(II.map((o) => normDeg(o.hz - 180))) : null;
      const hz = hzII === null ? hzI : meanCircular([hzI, hzII]);

      const ziOf = (os: NetObservation[]) => {
        const v = os.map((o) => o.zi).filter((z): z is number => z !== null);
        return v.length > 0 ? mean(v) : null;
      };
      const ziI = ziOf(I);
      const ziII = ziOf(II);
      const zi = ziI !== null && ziII !== null ? (ziI + (360 - ziII)) / 2 : (ziI ?? (ziII !== null ? 360 - ziII : null));

      const num = (f: (o: NetObservation) => number | null) => {
        const v = list.map(f).filter((x): x is number => x !== null);
        return v.length > 0 ? mean(v) : null;
      };
      const merged: NetObservation = {
        target,
        hz: wholeSeconds(hz),
        zi: zi === null ? null : wholeSeconds(zi),
        slope: num((o) => o.slope),
        horizontal: num((o) => o.horizontal),
        dM: num((o) => o.dM),
        targetHeight: list.map((o) => o.targetHeight).find((h) => h !== null && h > 0) ?? first.targetHeight,
        distance: num((o) => o.distance),
      };
      observations.push(merged);
      rows.push({
        station: st.id,
        target,
        faceI: I.length,
        faceII: II.length,
        hzI: hzI,
        hzII,
        hz: merged.hz,
        ziI,
        ziII,
        zi: merged.zi,
        indexError: ziI !== null && ziII !== null ? (ziI + ziII - 360) * 3600 : null,
      });
    }
    out.push({ ...st, observations });
  }

  const tableRows: Row[] = rows.map((r) => ({
    cells: [
      r.station,
      r.target,
      `${r.faceI} + ${r.faceII}`,
      r.hzI === null ? '' : formatDms(r.hzI),
      r.hzII === null ? '' : formatDms(r.hzII),
      formatDms(r.hz),
      r.ziI === null ? '' : formatDms(r.ziI),
      r.ziII === null ? '' : formatDms(r.ziII),
      r.zi === null ? '' : formatDms(r.zi),
      r.indexError === null ? '' : fix(r.indexError, 0),
    ],
    role: 'base',
  }));
  const sections: Section[] =
    rows.length === 0
      ? []
      : [
          {
            kind: 'averaging',
            title: 'Középelés (I. és II. távcsőállás)',
            columns: ['Álláspont', 'Irányzott pont', 'Leolvasás (I + II)', 'Hz I.', 'Hz II. (−180°)', 'Hz közép', 'Zi I.', 'Zi II.', 'Zi közép', 'Indexhiba [″]'],
            rows: tableRows,
            footer: ['Hz = (Hz I. + Hz II. − 180°) / 2;  Zi = (Zi I. + 360° − Zi II.) / 2;  az indexhiba az I. és II. zenitszög összegének eltérése 360°-tól.'],
          },
        ];
  return { stations: out, rows, issues, sections };
}

/** Ellenőrzéshez: a szög a jegyzőkönyv formátumában (FOK.PPMMSS) → tizedes fok. */
export const dmsToDegrees = parseDms;
