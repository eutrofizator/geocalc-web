import { CalcError } from './errors';

export const DEG = Math.PI / 180;

export function normDeg(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** Szög a (−180, 180] tartományba, pl. két közeli irányszög előjeles különbségéhez. */
export function wrapDeg(d: number): number {
  const r = normDeg(d);
  return r > 180 ? r - 360 : r;
}

/**
 * A GeoCalc szögformátuma: FOK.PPMMSS, azaz 104.5900 = 104°59'00".
 * Visszaadja a szöget tizedes fokban.
 */
export function parseDms(token: string): number {
  const v = Number(token.trim());
  if (token.trim() === '' || !Number.isFinite(v)) {
    throw new CalcError(`Érvénytelen szög: "${token}"`);
  }
  const sign = v < 0 ? -1 : 1;
  const s = Math.round(Math.abs(v) * 1e6);
  const dd = Math.floor(s / 1e6);
  const rem = s - dd * 1e6;
  const mm = Math.floor(rem / 1e4);
  const ss = (rem - mm * 1e4) / 100;
  if (mm >= 60 || ss >= 60) {
    throw new CalcError(`Érvénytelen szög (a perc vagy a másodperc nem lehet 60 vagy több): "${token}"`);
  }
  return sign * (dd + mm / 60 + ss / 3600);
}

/** Előjeles szög (pl. irányjavítás) FOK.PPMMSS formában, előjellel: -10.4625. */
export function formatDmsSigned(deg: number): string {
  const s = formatDms(Math.abs(deg));
  return deg < 0 && s !== '0.0000' ? `-${s}` : s;
}

/** Tizedes fok → FOK.PPMMSS szöveg, egész másodpercre kerekítve, 0..360 tartományban. */
export function formatDms(deg: number): string {
  let total = Math.round(normDeg(deg) * 3600);
  if (total >= 360 * 3600) total -= 360 * 3600;
  const dd = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${dd}.${String(mm).padStart(2, '0')}${String(ss).padStart(2, '0')}`;
}

/**
 * Tizedes fok → FOK.PPMMSS szöveg **hat tizedesjeggyel** (DD.MMSSss): a másodperc tizedesjegyei is
 * megmaradnak, ezért a `parseDms` ugyanazt az értéket olvassa vissza (adatcsere-állományokhoz).
 */
export function formatDmsPrecise(deg: number): string {
  const total = normDeg(deg) * 3600;
  let dd = Math.floor(total / 3600);
  let mm = Math.floor((total - dd * 3600) / 60);
  let ss = Math.round((total - dd * 3600 - mm * 60) * 100) / 100;
  if (ss >= 60) {
    ss = 0;
    mm += 1;
  }
  if (mm >= 60) {
    mm = 0;
    dd += 1;
  }
  if (dd >= 360) dd -= 360;
  const sec = ss.toFixed(2).replace('.', '').padStart(4, '0');
  return `${dd}.${String(mm).padStart(2, '0')}${sec}`;
}

/**
 * Tizedes fok → emberi (fok-perc-másodperc) alak a felületi visszajelzéshez:
 * `91.2345` → `91°23′45″`. A másodperc tizedesjegyei megadhatók, az érték a 0..360
 * tartományba kerül, és a kerekítés túlcsordulása (60″ → 1′) is kezelt.
 */
export function formatDmsText(deg: number, secDecimals = 0): string {
  const total = normDeg(deg) * 3600;
  let dd = Math.floor(total / 3600);
  let mm = Math.floor((total - dd * 3600) / 60);
  const f = 10 ** secDecimals;
  let ss = Math.round((total - dd * 3600 - mm * 60) * f) / f;
  if (ss >= 60) {
    ss = 0;
    mm += 1;
  }
  if (mm >= 60) {
    mm = 0;
    dd += 1;
  }
  if (dd >= 360) dd -= 360;
  const secStr = ss.toFixed(secDecimals);
  return `${dd}°${String(mm).padStart(2, '0')}′${(ss < 10 ? '0' : '') + secStr}″`;
}
