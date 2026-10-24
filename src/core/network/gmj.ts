import { formatDms, parseDms } from '../angle';
import { CalcError } from '../errors';
import { splitFields } from '../parser';
import type { Issue } from '../types';
import type { NetObservation, NetPoint, NetStation } from './types';

const num = (t: string | undefined): number | null => {
  const s = (t ?? '').trim();
  if (s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

const dms = (t: string | undefined): number | null => {
  const s = (t ?? '').trim();
  return s === '' ? null : parseDms(s);
};

/**
 * A GeoCalc GMJ mérési jegyzőkönyv beolvasása (a GeoCalc-AR formátum, súgó 17. o.): soronként 14 mező,
 * ADR_ID, PSZ, HZ, ZI, TF, TV, DM, PKOD, MM, MJ, TVET, AP1, AP2, AP3 (AP3: −1 álláspont, −2 irányzott pont).
 *
 * A hálózat távolsága a vetületi (TVET), ennek hiányában a vízszintes (TV) távolság. A nem mért magassági
 * szöget a GeoCalc 0.0000-ként írja: ez hiányzó adat.
 */
export function parseGmj(text: string): { stations: NetStation[]; issues: Issue[] } {
  const stations: NetStation[] = [];
  const issues: Issue[] = [];
  let current: NetStation | null = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') return;
    const f = line.split(',').map((t) => t.trim());
    let flagIdx = f.length - 1;
    while (flagIdx > 0 && f[flagIdx] === '') flagIdx--;
    const flag = f[flagIdx];
    const id = f[1];
    if (!id) {
      issues.push({ level: 'error', message: 'Hiányzó pontszám a mérési jegyzőkönyvben.', line: i + 1 });
      return;
    }
    try {
      if (flag === '-1') {
        current = { id, instrumentHeight: num(f[8]), observations: [] };
        stations.push(current);
      } else if (flag === '-2') {
        if (!current) throw new CalcError('Mérési sor állásponti sor nélkül.', i + 1);
        const hz = dms(f[2]);
        if (hz === null) throw new CalcError(`${id}: hiányzik az irányérték.`, i + 1);
        const zi = dms(f[3]);
        const reduced = num(f[10]);
        const slope = num(f[4]);
        const horizontal = num(f[5]);
        const mj = num(f[9]);
        // A nyers (műszerből konvertált) jegyzőkönyvben a nem távolsággal mért célpontok sorában az előző mérés
        // távolsága beragad; ott a jelmagasság kifejezetten 0. Ez nem távolságmérés.
        const stale = (f[9] ?? '').trim() !== '' && mj === 0 && slope !== null && slope > 0;
        const distance = stale ? null : reduced !== null && reduced > 0 ? reduced : horizontal !== null && horizontal > 0 ? horizontal : null;
        const obs: NetObservation = {
          target: id,
          hz,
          zi: zi === 0 ? null : zi,
          slope: slope !== null && slope > 0 ? slope : null,
          horizontal: horizontal !== null && horizontal > 0 ? horizontal : null,
          dM: num(f[6]),
          targetHeight: mj,
          distance,
        };
        current.observations.push(obs);
      } else {
        issues.push({ level: 'warning', message: `Ismeretlen sortípus a jegyzőkönyvben („${flag ?? ''}”), a sor kimarad.`, line: i + 1 });
      }
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      issues.push({ level: 'error', message: e.message, line: e.line ?? i + 1 });
    }
  });
  return { stations, issues };
}

/** Koordináta-lista: pontszám, Y, X, [M], [jelölés]; vesszővel vagy szóközzel tagolva. */
export function parseNetworkCoordinates(text: string): { points: NetPoint[]; issues: Issue[] } {
  const points: NetPoint[] = [];
  const issues: Issue[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line === ';;') return;
    const f = splitFields(line);
    const id = f[0];
    const y = num(f[1]);
    const x = num(f[2]);
    if (!id || y === null || x === null) {
      issues.push({ level: 'error', message: `Érvénytelen koordinátasor: „${line}”.`, line: i + 1 });
      return;
    }
    if (seen.has(id)) {
      issues.push({ level: 'warning', message: `A(z) ${id} pont többször szerepel, az első adat érvényes.`, line: i + 1 });
      return;
    }
    seen.add(id);
    const m = num(f[3]);
    points.push({ id, y, x, m, mark: f.slice(m === null ? 3 : 4).filter((t) => t !== '').join(' ') });
  });
  return { points, issues };
}

/** Állomások kiírása GMJ jegyzőkönyv formátumban (pl. a középelt jegyzőkönyv letöltéséhez). */
export function toGmj(stations: NetStation[]): string {
  const f4 = (n: number | null) => (n === null ? '' : n.toFixed(4));
  const lines: string[] = [];
  let n = 0;
  for (const st of stations) {
    lines.push(`${++n},${st.id},,,,,,,${st.instrumentHeight === null ? '' : st.instrumentHeight.toFixed(2)},,,,,-1`);
    for (const o of st.observations) {
      lines.push(
        [
          ++n,
          o.target,
          formatDms(o.hz),
          o.zi === null ? '' : formatDms(o.zi),
          o.slope === null ? '0' : f4(o.slope),
          o.horizontal === null ? '0' : f4(o.horizontal),
          o.dM === null ? '' : f4(o.dM),
          '',
          '',
          o.targetHeight === null ? '0' : o.targetHeight.toFixed(2),
          o.distance === null ? '' : f4(o.distance),
          '',
          '',
          '-2',
        ].join(','),
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}
