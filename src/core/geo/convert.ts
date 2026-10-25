import { CalcError } from '../errors';
import { GRS67, WGS84, geocentricToGeodetic, geodeticToGeocentric, type Xyz } from './ellipsoid';
import { EOV } from './eov';
import { applyHelmert, applyHelmertInverse, type Helmert3dParams } from './helmert3d';
import { UTM33, UTM34 } from './utm';

/**
 * Földrajzi koordináták konvertálása (Adatcsere, súgó 9. o.): a kézi GPS-vevők és más programok
 * különböző szögírásainak átalakítása, valamint a WGS 84 földrajzi, geocentrikus és UTM koordináták
 * közötti átszámítás. Ezek ugyanazon az ellipszoidon (WGS 84) történnek, ezért pontosak. Az EOV
 * (HD72) és a WGS 84 / ETRS89 közötti átszámítás az országos 7 paraméteres transzformációval
 * (MSZ 7222, EPSG 1449) kb. ± 1 m pontosságú; centiméteres átszámításhoz a Térbeli transzformáció
 * modul (közös pontok, interpoláció) vagy a GNSS Szolgáltató Központ EHT² szolgáltatása kell.
 */

const DEG = Math.PI / 180;

export type GeoFormat = 'PSEUDO' | 'DECIMAL' | 'DMS' | 'XYZ' | 'UTM33' | 'UTM34' | 'EOV';

export const GEO_FORMATS: { id: GeoFormat; label: string; columns: string[] }[] = [
  { id: 'PSEUDO', label: 'WGS 84 földrajzi – áldecimális (FOK.PPMMSSsss)', columns: ['φ', 'λ', 'h'] },
  { id: 'DECIMAL', label: 'WGS 84 földrajzi – tizedes fok', columns: ['φ [°]', 'λ [°]', 'h [m]'] },
  { id: 'DMS', label: 'WGS 84 földrajzi – fok, perc, másodperc', columns: ['φ', 'λ', 'h [m]'] },
  { id: 'XYZ', label: 'WGS 84 geocentrikus (X, Y, Z)', columns: ['X [m]', 'Y [m]', 'Z [m]'] },
  { id: 'UTM33', label: 'UTM 33 (WGS 84)', columns: ['Y [m]', 'X [m]', 'h [m]'] },
  { id: 'UTM34', label: 'UTM 34 (WGS 84)', columns: ['Y [m]', 'X [m]', 'h [m]'] },
  { id: 'EOV', label: 'EOV (HD72) – országos átszámítás, ± 1 m', columns: ['Y [m]', 'X [m]', 'M [m]'] },
];

/**
 * HD72 → ETRS89 (MSZ 7222; EPSG 1449, illetve HD72 → WGS 84 (3), EPSG 1448): tX = 52,684 m,
 * tY = −71,194 m, tZ = −13,975 m, rX = 0,312″, rY = 0,1063″, rZ = 0,3729″, ds = 1,0191 ppm,
 * „coordinate frame” értelmezéssel – a pozíció-vektoros Helmert-képletben a forgatások előjele fordított.
 */
const ARCSEC = Math.PI / 180 / 3600;
export const HD72_TO_ETRS89: Helmert3dParams = {
  t: [52.684, -71.194, -13.975],
  r: [-0.312 * ARCSEC, -0.1063 * ARCSEC, -0.3729 * ARCSEC],
  s: 1.0191e-6,
};

/** EOV → WGS 84 / ETRS89 földrajzi (a magasság – M – változatlanul, geoidmodell nélkül). */
export function eovToWgs84(y: number, x: number, m = 0): LatLonH {
  const hd = EOV.inverse(y, x);
  const g = geocentricToGeodetic(WGS84, applyHelmert(HD72_TO_ETRS89, geodeticToGeocentric(GRS67, { phi: hd.phi, lam: hd.lam, h: 0 })));
  return { lat: g.phi / DEG, lon: g.lam / DEG, h: m };
}

/** WGS 84 / ETRS89 földrajzi → EOV (a magasság változatlanul). */
export function wgs84ToEov(geo: LatLonH): { y: number; x: number; m: number } {
  const hd = geocentricToGeodetic(GRS67, applyHelmertInverse(HD72_TO_ETRS89, geodeticToGeocentric(WGS84, { phi: geo.lat * DEG, lam: geo.lon * DEG, h: 0 })));
  const p = EOV.forward(hd.phi, hd.lam);
  return { y: p.y, x: p.x, m: geo.h };
}

/** WGS 84 ellipszoidi koordináták fokban (h méterben). */
export interface LatLonH {
  lat: number;
  lon: number;
  h: number;
}

/**
 * Áldecimális szög (FOK.PPMMSSsss, a súgó szerint `19° 18′ 22.31643″` = `19.182231643`) tizedes fokra.
 * A másodperc tizedesjegyeinek száma tetszőleges.
 */
export function parsePseudoDecimal(token: string): number {
  const t = token.trim();
  const m = /^([+-])?(\d+)(?:\.(\d*))?$/.exec(t);
  if (!m) throw new CalcError(`Érvénytelen áldecimális szög: "${token}"`);
  const sign = m[1] === '-' ? -1 : 1;
  const frac = (m[3] ?? '').padEnd(4, '0');
  const deg = Number(m[2]);
  const min = Number(frac.slice(0, 2));
  const sec = Number(`${frac.slice(2, 4)}.${frac.slice(4) || '0'}`);
  if (min >= 60 || sec >= 60) throw new CalcError(`Érvénytelen áldecimális szög (perc vagy másodperc ≥ 60): "${token}"`);
  return sign * (deg + min / 60 + sec / 3600);
}

/** Tizedes fok fok-perc-másodperc részekre, a kerekítés túlcsordulását (60″ → 1′) is kezelve. */
function splitDms(value: number, secDecimals: number): { sign: string; d: number; m: number; s: string } {
  const sign = value < 0 ? '-' : '';
  const scale = 10 ** secDecimals;
  let units = Math.round(Math.abs(value) * 3600 * scale);
  const perMin = 60 * scale;
  const perDeg = 3600 * scale;
  const d = Math.floor(units / perDeg);
  units -= d * perDeg;
  const m = Math.floor(units / perMin);
  units -= m * perMin;
  const s = (units / scale).toFixed(secDecimals);
  return { sign: units === 0 && d === 0 && m === 0 ? '' : sign, d, m, s };
}

/** Tizedes fok → áldecimális alak (a másodperc `secDecimals` tizedesjeggyel). */
export function formatPseudoDecimal(value: number, secDecimals = 5): string {
  const { sign, d, m, s } = splitDms(value, secDecimals);
  const [si, sf = ''] = s.split('.');
  return `${sign}${d}.${String(m).padStart(2, '0')}${si!.padStart(2, '0')}${sf}`;
}

/** Tizedes fok → `19° 18′ 22.31643″`. */
export function formatDmsSymbols(value: number, secDecimals = 5): string {
  const { sign, d, m, s } = splitDms(value, secDecimals);
  const [si, sf] = s.split('.');
  return `${sign}${d}° ${String(m).padStart(2, '0')}′ ${si!.padStart(2, '0')}${sf !== undefined ? `.${sf}` : ''}″`;
}

/**
 * Fok-perc-másodperc szöveg tizedes fokra. Elfogadja a jeles (`47°30′12.3″`, `47°30'12.3"`) és a
 * szóközzel tagolt (`47 30 12.3`) alakot is, opcionális előjellel vagy É/D/K/Ny (N/S/E/W) betűvel.
 */
export function parseDmsText(text: string): number {
  let t = text.trim();
  let sign = 1;
  const hemi = /^(NY|[NSEWÉDK])\s*|\s*(NY|[NSEWÉDK])$/i.exec(t);
  if (hemi) {
    const letter = (hemi[1] ?? hemi[2] ?? '').toUpperCase();
    if (letter === 'S' || letter === 'W' || letter === 'D' || letter === 'NY') sign = -1;
    t = t.replace(hemi[0], '');
  }
  if (t.startsWith('-')) {
    sign = -sign;
    t = t.slice(1);
  }
  const parts = t
    .replace(/[°º′'″"]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((p) => p !== '');
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) {
    throw new CalcError(`Érvénytelen fok-perc-másodperc szög: "${text}"`);
  }
  const [d, m = '0', s = '0'] = parts;
  const mm = Number(m);
  const ss = Number(s);
  if (mm >= 60 || ss >= 60) throw new CalcError(`Érvénytelen szög (perc vagy másodperc ≥ 60): "${text}"`);
  return sign * (Number(d) + mm / 60 + ss / 3600);
}

const num = (token: string, what: string): number => {
  const v = Number(token.replace(',', '.'));
  if (token.trim() === '' || !Number.isFinite(v)) throw new CalcError(`Érvénytelen ${what}: "${token}"`);
  return v;
};

/** Egy pont a bemenet egy sorából: pontszám és a formátum szerinti koordináták. */
export interface GeoRow {
  id: string;
  geo: LatLonH;
}

/** A bemeneti sor értelmezése az adott formátumban (elválasztó: szóköz, tab, vessző vagy pontosvessző). */
export function parseGeoLine(line: string, fmt: GeoFormat): GeoRow {
  if (fmt === 'DMS') {
    // Pontszám, majd a két szög és a magasság; a szögek jelekkel vagy három számmal is írhatók.
    const m = /^\s*(\S+)[\s,;]+(.*)$/.exec(line);
    if (!m) throw new CalcError(`Hiányzó adat: "${line.trim()}"`);
    const rest = m[2]!.trim();
    const symbolic = /[°º′'″"]/.test(rest);
    let lat: number;
    let lon: number;
    let h = 0;
    if (symbolic) {
      const angles = [...rest.matchAll(/-?[NSEWÉDK]?\s*\d+(?:\.\d+)?\s*[°º](?:\s*\d+(?:\.\d+)?\s*[′'])?(?:\s*\d+(?:\.\d+)?\s*[″"])?\s*[NSEWÉDK]?/gi)];
      if (angles.length < 2) throw new CalcError(`Két szög kell (φ és λ): "${line.trim()}"`);
      lat = parseDmsText(angles[0]![0]);
      lon = parseDmsText(angles[1]![0]);
      const tail = rest.slice(angles[1]!.index! + angles[1]![0].length).replace(/^[\s,;]+/, '');
      if (tail !== '') h = num(tail.split(/[\s,;]+/)[0]!, 'magasság');
    } else {
      const t = rest.split(/[\s,;]+/).filter((x) => x !== '');
      if (t.length !== 6 && t.length !== 7) throw new CalcError(`Fok, perc, másodperc kell mindkét szöghöz: "${line.trim()}"`);
      lat = parseDmsText(t.slice(0, 3).join(' '));
      lon = parseDmsText(t.slice(3, 6).join(' '));
      if (t.length === 7) h = num(t[6]!, 'magasság');
    }
    return { id: m[1]!, geo: { lat, lon, h } };
  }
  const t = line
    .trim()
    .split(/[\s,;]+/)
    .filter((x) => x !== '');
  if (t.length < 3) throw new CalcError(`Hiányzó adat (pontszám és legalább két koordináta kell): "${line.trim()}"`);
  const [id, a, b, c] = t as [string, string, string, string | undefined];
  switch (fmt) {
    case 'PSEUDO':
      return { id, geo: { lat: parsePseudoDecimal(a), lon: parsePseudoDecimal(b), h: c ? num(c, 'magasság') : 0 } };
    case 'DECIMAL':
      return { id, geo: { lat: num(a, 'szélesség'), lon: num(b, 'hosszúság'), h: c ? num(c, 'magasság') : 0 } };
    case 'XYZ': {
      if (!c) throw new CalcError(`A geocentrikus koordinátához X, Y és Z kell: "${line.trim()}"`);
      const g = geocentricToGeodetic(WGS84, [num(a, 'X'), num(b, 'Y'), num(c, 'Z')]);
      return { id, geo: { lat: g.phi / DEG, lon: g.lam / DEG, h: g.h } };
    }
    case 'UTM33':
    case 'UTM34': {
      const p = (fmt === 'UTM33' ? UTM33 : UTM34).inverse(num(a, 'Y'), num(b, 'X'));
      return { id, geo: { lat: p.phi / DEG, lon: p.lam / DEG, h: c ? num(c, 'magasság') : 0 } };
    }
    case 'EOV': {
      const y = num(a, 'Y');
      const x = num(b, 'X');
      if (y < 384000 || y > 960000 || x < 32000 || x > 384000) throw new CalcError(`EOV koordináta a Magyarországot lefedő tartományon kívül: "${line.trim()}"`);
      return { id, geo: eovToWgs84(y, x, c ? num(c, 'magasság') : 0) };
    }
  }
}

const fixed = (v: number, d: number) => {
  const s = v.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
};

/** A pont koordinátái a kimeneti formátumban (szövegként, a szögek másodperce `secDecimals` jeggyel). */
export function formatGeo(geo: LatLonH, fmt: GeoFormat, secDecimals = 5): string[] {
  switch (fmt) {
    case 'PSEUDO':
      return [formatPseudoDecimal(geo.lat, secDecimals), formatPseudoDecimal(geo.lon, secDecimals), fixed(geo.h, 3)];
    case 'DECIMAL':
      return [fixed(geo.lat, 9), fixed(geo.lon, 9), fixed(geo.h, 3)];
    case 'DMS':
      return [formatDmsSymbols(geo.lat, secDecimals), formatDmsSymbols(geo.lon, secDecimals), fixed(geo.h, 3)];
    case 'XYZ': {
      const x: Xyz = geodeticToGeocentric(WGS84, { phi: geo.lat * DEG, lam: geo.lon * DEG, h: geo.h });
      return x.map((v) => fixed(v, 3));
    }
    case 'UTM33':
    case 'UTM34': {
      const p = (fmt === 'UTM33' ? UTM33 : UTM34).forward(geo.lat * DEG, geo.lon * DEG);
      return [fixed(p.y, 3), fixed(p.x, 3), fixed(geo.h, 3)];
    }
    case 'EOV': {
      const p = wgs84ToEov(geo);
      return [fixed(p.y, 3), fixed(p.x, 3), fixed(p.m, 3)];
    }
  }
}

export interface ConvertResult {
  rows: { id: string; values: string[] }[];
  errors: { line: number; message: string }[];
}

/** A teljes bemenet átalakítása; a hibás sorok kimaradnak, a többi feldolgozható marad. */
export function convertGeo(text: string, from: GeoFormat, to: GeoFormat, secDecimals = 5): ConvertResult {
  const rows: ConvertResult['rows'] = [];
  const errors: ConvertResult['errors'] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s*(#|\/\/).*$/, '');
    if (line.trim() === '') return;
    try {
      const r = parseGeoLine(line, from);
      if (Math.abs(r.geo.lat) > 90 || Math.abs(r.geo.lon) > 180) throw new CalcError(`A szög a megengedett tartományon kívül esik: "${line.trim()}"`);
      rows.push({ id: r.id, values: formatGeo(r.geo, to, secDecimals) });
    } catch (e) {
      errors.push({ line: i + 1, message: e instanceof Error ? e.message : String(e) });
    }
  });
  return { rows, errors };
}
