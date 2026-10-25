import { formatDms, parseDms } from './angle';
import { CalcError } from './errors';
import { fix } from './format';
import { reduceMeasurement, type RecorderSettings } from './recorder';
import type { Issue, Row, Section } from './types';

/**
 * Adatrögzítő / Mérési adatok - koordináták (súgó 11–12. és 17. o.): a terepi mérési jegyzőkönyv
 * munkaterülete. A műszerből kiolvasott nyers adatok és a GeoCalc saját GMJ (GeoCalc-AR) állománya
 * ide olvasható be; itt számolható a vetületi távolság (Tvet) és a magasságkülönbség (dM), itt hagyhatók
 * ki mérések, és innen konvertálható a jegyzőkönyv a hálózatkiegyenlítésbe.
 *
 * A GeoCalc-AR formátum (súgó 17. o.) soronként 14 mező: ADR_ID, PSZ, HZ, ZI, TF, TV, DM, PKOD, MM, MJ,
 * TVET, AP1, AP2, AP3, ahol AP3 = −1 álláspont, −2 irányzott pont.
 */

export interface FieldRow {
  kind: 'station' | 'obs';
  /** Pontszám (álláspontnál az álláspont, mérésnél az irányzott pont). */
  id: string;
  hz: number | null;
  zi: number | null;
  tf: number | null;
  tv: number | null;
  dm: number | null;
  code: string;
  /** Műszermagasság (álláspont) [m]. */
  mm: number | null;
  /** Jelmagasság [m]. */
  mj: number | null;
  /** Vetületi távolság [m]. */
  tvet: number | null;
  ap1: string;
  ap2: string;
  /**
   * A feldolgozásból kimaradó adat: `skip` – kézzel kihagyva (szürke), `merged` – a bal/jobb irány
   * középelése után az eredeti irány (piros); `mean` – a középelt irány (új sor).
   */
  state: 'ok' | 'skip' | 'merged' | 'mean';
}

export interface FieldParseResult {
  rows: FieldRow[];
  issues: Issue[];
  format: string;
}

const num = (t: string | undefined): number | null => {
  const s = (t ?? '').trim().replace(',', '.');
  if (s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

const angle = (t: string | undefined): number | null => {
  const s = (t ?? '').trim();
  if (s === '') return null;
  const v = parseDms(s);
  return v;
};

const positive = (v: number | null) => (v !== null && v > 0 ? v : null);

const emptyRow = (kind: FieldRow['kind'], id: string): FieldRow => ({
  kind,
  id,
  hz: null,
  zi: null,
  tf: null,
  tv: null,
  dm: null,
  code: '',
  mm: null,
  mj: null,
  tvet: null,
  ap1: '',
  ap2: '',
  state: 'ok',
});

/* ------------------------------------------------------------------ *
 * GeoCalc-AR (GMJ)
 * ------------------------------------------------------------------ */

/** GeoCalc-AR / GMJ beolvasása; a mezők vesszővel vagy szóközzel tagoltak (súgó 17. o.). */
export function parseGeoCalcAr(text: string): FieldParseResult {
  const rows: FieldRow[] = [];
  const issues: Issue[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') return;
    const f = line.includes(',') ? line.split(',').map((t) => t.trim()) : line.split(/\s+/);
    let flagIdx = f.length - 1;
    while (flagIdx > 0 && f[flagIdx] === '') flagIdx--;
    const flag = f[flagIdx];
    const id = (f[1] ?? '').trim();
    if (flag !== '-1' && flag !== '-2') {
      issues.push({ level: 'warning', message: `Ismeretlen sortípus („${flag ?? ''}”), a sor kimarad.`, line: i + 1 });
      return;
    }
    if (id === '') {
      issues.push({ level: 'error', message: 'Hiányzó pontszám.', line: i + 1 });
      return;
    }
    try {
      const r = emptyRow(flag === '-1' ? 'station' : 'obs', id);
      r.hz = angle(f[2]);
      const zi = angle(f[3]);
      r.zi = zi === 0 ? null : zi;
      r.tf = positive(num(f[4]));
      r.tv = positive(num(f[5]));
      r.dm = num(f[6]);
      r.code = f[7] ?? '';
      r.mm = num(f[8]);
      r.mj = num(f[9]);
      r.tvet = positive(num(f[10]));
      r.ap1 = f[11] ?? '';
      r.ap2 = f[12] ?? '';
      if (r.kind === 'obs' && r.hz === null) issues.push({ level: 'warning', message: `${id}: nincs irányérték.`, line: i + 1 });
      rows.push(r);
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      issues.push({ level: 'error', message: `${id}: ${e.message}`, line: i + 1 });
    }
  });
  return { rows, issues, format: 'GeoCalc-AR (GMJ)' };
}

const f4 = (n: number | null) => (n === null ? '' : n.toFixed(4));
/** Szög a GMJ írásmódjában: FOK.PPMMSS, egész másodpercre kerekítve (mint a GeoCalc). */
const fAngle = (n: number | null) => (n === null ? '' : formatDms(n));

/** A munkaterület mentése GeoCalc GMJ formátumba (14 mező, a GeoCalc 3.5 írásmódjával). */
export function toGeoCalcAr(rows: FieldRow[]): string {
  let n = 0;
  return (
    rows
      .filter((r) => r.state !== 'mean')
      .map((r) => {
        n++;
        if (r.kind === 'station') return [n, r.id, '', '', '', '', '', r.code, f4(r.mm), '', '', r.ap1, r.ap2, '-1'].join(',');
        return [
          n,
          r.id,
          fAngle(r.hz),
          r.zi === null ? '0.0000' : fAngle(r.zi),
          r.tf === null ? '' : String(r.tf),
          r.tv === null ? '' : String(r.tv),
          r.dm === null ? '' : f4(r.dm),
          r.code,
          '',
          r.mj === null ? '' : String(r.mj),
          f4(r.tvet),
          r.ap1,
          r.ap2,
          '-2',
        ].join(',');
      })
      .join('\r\n') + '\r\n'
  );
}

/* ------------------------------------------------------------------ *
 * Leica GSI-8 / GSI-16 (és a GeoMAX, amely ugyanezt a szóelrendezést használja)
 * ------------------------------------------------------------------ */

/** Egy GSI-szó értéke a mértékegység-jelző (6. karakter) szerint. */
function gsiValue(word: string): { wi: number; unit: string; raw: string; value: number | null } {
  const wi = Number(word.slice(0, 2));
  const unit = word[5] ?? '';
  const signPos = word.search(/[+-]/);
  const raw = signPos >= 0 ? word.slice(signPos + 1) : word.slice(7);
  const sign = signPos >= 0 && word[signPos] === '-' ? -1 : 1;
  const digits = /^\d+$/.test(raw) ? Number(raw) : null;
  return { wi, unit, raw, value: digits === null ? null : sign * digits };
}

/** GSI szög tizedes fokban: 2 = gon, 3 = tizedes fok, 4 = fok-perc-másodperc (DDDMMSSs), 5 = mil. */
function gsiAngle(unit: string, v: number): number {
  switch (unit) {
    case '2':
      return (v / 100000) * 0.9;
    case '3':
      return v / 100000;
    case '4': {
      const a = Math.abs(v);
      const tenth = a % 10;
      const ss = Math.floor(a / 10) % 100;
      const mm = Math.floor(a / 1000) % 100;
      const dd = Math.floor(a / 100000);
      return Math.sign(v) * (dd + mm / 60 + (ss + tenth / 10) / 3600);
    }
    case '5':
      return ((v / 10000) * 360) / 6400;
    default:
      throw new CalcError(`Ismeretlen GSI szögegység: „${unit}”.`);
  }
}

/** GSI távolság méterben: 0 = mm, 1 = láb/1000, 6 = 0.1 mm, 7 = láb/10000, 8 = 0.01 mm. */
function gsiDistance(unit: string, v: number): number {
  switch (unit) {
    case '0':
    case '.':
    case '':
      return v / 1000;
    case '1':
      return (v / 1000) * 0.3048;
    case '6':
      return v / 10000;
    case '7':
      return (v / 10000) * 0.3048;
    case '8':
      return v / 100000;
    default:
      throw new CalcError(`Ismeretlen GSI távolságegység: „${unit}”.`);
  }
}

/** Az információs szó (kódblokk) szövege: a vezető nullák nélkül. */
const gsiText = (raw: string) => raw.replace(/^0+(?=.)/, '');

/** Kódblokk szöveges értéke számként (pl. a TC-600 In1 műszermagassága: „1.52” vagy „1520” mm). */
function gsiNumber(raw: string): number | null {
  const t = gsiText(raw);
  if (t === '') return null;
  if (t.includes('.')) return num(t);
  const v = Number(t);
  return Number.isFinite(v) ? v / 1000 : null;
}

/**
 * Leica GSI-8 / GSI-16 beolvasása. Egy sor egy blokk; a szavak szóközzel tagoltak (a GSI-16 sorai
 * `*`-gal kezdődnek). Szóazonosítók: 11 pontszám, 21 Hz, 22 zenitszög, 31 ferde távolság,
 * 32 vízszintes távolság, 33 magasságkülönbség, 87 jelmagasság, 88 műszermagasság, 84–86 az álláspont
 * koordinátái, 71 pontkód, 41–49 kódblokk.
 *
 * Álláspont: a 84–86/88 szavas, irányérték nélküli blokk (a pontszám a 11-es szó), illetve a Leica
 * TC-600 technikája szerinti kódblokk (súgó 16. o.): 41 = álláspont száma, 42 (In1) = műszermagasság,
 * 43 (In2) = azonosító.
 */
export function parseGsi(text: string): FieldParseResult {
  const rows: FieldRow[] = [];
  const issues: Issue[] = [];
  let lastMj: number | null = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim().replace(/^\*/, '');
    if (line === '') return;
    try {
      const words = line.split(/\s+/).filter((w) => /^\d{2}/.test(w));
      if (words.length === 0) return;
      const w = new Map<number, ReturnType<typeof gsiValue>>();
      for (const word of words) {
        const v = gsiValue(word);
        if (!w.has(v.wi)) w.set(v.wi, v);
      }
      const point = w.get(11);
      const id = point ? gsiText(point.raw) : '';
      const code = w.get(71) ? gsiText(w.get(71)!.raw) : '';
      if (!w.has(21) && w.has(41)) {
        // TC-600 kódblokk: álláspont (Cod), műszermagasság (In1), azonosító (In2).
        const st = emptyRow('station', gsiText(w.get(41)!.raw));
        st.mm = w.get(42) ? gsiNumber(w.get(42)!.raw) : null;
        st.ap1 = w.get(43) ? gsiText(w.get(43)!.raw) : '';
        rows.push(st);
        return;
      }
      if (!w.has(21)) {
        if (w.has(84) || w.has(85) || w.has(86) || w.has(88)) {
          if (!id) throw new CalcError('Az álláspont blokkjában nincs pontszám (11-es szó).');
          const st = emptyRow('station', id);
          const ih = w.get(88);
          st.mm = ih && ih.value !== null ? gsiDistance(ih.unit, ih.value) : null;
          st.code = code;
          rows.push(st);
        }
        return;
      }
      if (!id) throw new CalcError('A mérési blokkban nincs pontszám (11-es szó).');
      const r = emptyRow('obs', id);
      r.code = code;
      const hz = w.get(21)!;
      if (hz.value !== null) r.hz = ((gsiAngle(hz.unit, hz.value) % 360) + 360) % 360;
      const v = w.get(22);
      if (v && v.value !== null && v.value !== 0) r.zi = gsiAngle(v.unit, v.value);
      const sd = w.get(31);
      if (sd && sd.value !== null) r.tf = positive(gsiDistance(sd.unit, sd.value));
      const hd = w.get(32);
      if (hd && hd.value !== null) r.tv = positive(gsiDistance(hd.unit, hd.value));
      const dh = w.get(33);
      if (dh && dh.value !== null && (r.tf !== null || r.tv !== null)) r.dm = gsiDistance(dh.unit, dh.value);
      const hr = w.get(87);
      if (hr && hr.value !== null) lastMj = gsiDistance(hr.unit, hr.value);
      r.mj = r.tf !== null || r.tv !== null ? lastMj : null;
      if (rows.length === 0 || !rows.some((x) => x.kind === 'station')) {
        issues.push({ level: 'warning', message: `${id}: mérés álláspont nélkül (a jegyzőkönyv elején nincs álláspont blokk).`, line: i + 1 });
      }
      rows.push(r);
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      issues.push({ level: 'error', message: e.message, line: i + 1 });
    }
  });
  return { rows, issues, format: 'Leica GSI' };
}

/* ------------------------------------------------------------------ *
 * Szögegységek a nyers állományokhoz
 * ------------------------------------------------------------------ */

/** A nyers állomány szögegysége, ha az állomány maga nem jelöli. */
export type AngleUnit = 'dms' | 'deg' | 'gon' | 'mil';

export const ANGLE_UNITS: { id: AngleUnit; label: string }[] = [
  { id: 'dms', label: 'fok-perc-másodperc (FOK.PPMMSS)' },
  { id: 'deg', label: 'tizedes fok' },
  { id: 'gon', label: 'gon (újfok)' },
  { id: 'mil', label: 'mil (6400)' },
];

export interface FieldParseOptions {
  /** A szögegység, ha az állomány nem jelöli (Geodimeter, Topcon UNITS nélkül). */
  angleUnit?: AngleUnit;
}

/** Szög tizedes fokra: FOK.PPMMSS (tetszőleges tizedessel), tizedes fok, gon vagy mil. */
export function angleToDeg(text: string, unit: AngleUnit): number {
  const t = text.trim();
  const v = Number(t);
  if (t === '' || !Number.isFinite(v)) throw new CalcError(`Érvénytelen szög: „${text}”.`);
  switch (unit) {
    case 'deg':
      return v;
    case 'gon':
      return v * 0.9;
    case 'mil':
      return (v * 360) / 6400;
    case 'dms': {
      const m = /^([+-])?(\d+)(?:\.(\d*))?$/.exec(t);
      if (!m) throw new CalcError(`Érvénytelen szög: „${text}”.`);
      const frac = (m[3] ?? '').padEnd(4, '0');
      const mm = Number(frac.slice(0, 2));
      const ss = Number(`${frac.slice(2, 4)}.${frac.slice(4) || '0'}`);
      if (mm >= 60 || ss >= 60) throw new CalcError(`Érvénytelen szög (perc vagy másodperc ≥ 60): „${text}”.`);
      return (m[1] === '-' ? -1 : 1) * (Number(m[2]) + mm / 60 + ss / 3600);
    }
  }
}

const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** Egy mérés sorának kitöltése; a nulla távolság nem távolságmérés. */
function obsRow(id: string, hz: number | null, zi: number | null, tf: number | null, tv: number | null, mj: number | null, code = ''): FieldRow {
  const r = emptyRow('obs', id);
  r.hz = hz === null ? null : norm360(hz);
  r.zi = zi === null || zi === 0 ? null : zi;
  r.tf = positive(tf);
  r.tv = positive(tv);
  r.mj = r.tf !== null || r.tv !== null ? mj : null;
  r.code = code;
  return r;
}

/* ------------------------------------------------------------------ *
 * Sokkia SDR (SDR2x: 4 jegyű, SDR33: 16 karakteres pontszám) – a Sokkia „SDR Electronic Field Book”
 * formátumleírása szerint (3.6.1 és 3.6.2 fejezet)
 * ------------------------------------------------------------------ */

/**
 * Sokkia SDR beolvasása. A rekord első két karaktere a típus, a 3–4. a származtatási kód.
 * 00 fejléc (41. karakter: szögegység 1 = fok, 2 = gon, 3 = mil), 01 műszer (51. karakter: 1 = zenit-,
 * 2 = magassági szög), 02 álláspont (pontszám, N, E, magasság, műszermagasság), 03 jelmagasság,
 * 09 mérés (F1, F2, MD, MC: álláspont, irányzott pont, ferde távolság, zenitszög, Hz, leírás).
 * A pontszám szélessége (4 vagy 16) a rekord hosszából adódik.
 */
export function parseSdr(text: string): FieldParseResult {
  const rows: FieldRow[] = [];
  const issues: Issue[] = [];
  let unit: AngleUnit = 'deg';
  let vertical: 'zenith' | 'horizontal' = 'zenith';
  let mj: number | null = null;
  let current: string | null = null;
  const real = (s: string) => {
    const t = s.trim();
    if (t === '') return null;
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  };
  const ang = (s: string) => {
    const t = s.trim();
    return t === '' ? null : angleToDeg(t, unit);
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (line.length < 4) return;
    const type = line.slice(0, 2);
    const derv = line.slice(2, 4);
    try {
      // Alfanumerikus (SDR33) rekord: hosszabb, mint a 4 jegyű pontszámú változat legnagyobb rekordja.
      const alpha = line.length > 64 || (type === '09' && line.length > 58) || (type === '03' && line.length > 14);
      switch (type) {
        case '00': {
          const u = line[40];
          unit = u === '2' ? 'gon' : u === '3' ? 'mil' : 'deg';
          break;
        }
        case '01':
          vertical = line[50] === '2' ? 'horizontal' : 'zenith';
          break;
        case '02': {
          const id = (alpha ? line.slice(4, 20) : line.slice(4, 8)).trim();
          const ih = real(alpha ? line.slice(68, 84) : line.slice(38, 48));
          const st = emptyRow('station', id);
          st.mm = ih;
          st.code = (alpha ? line.slice(84, 100) : line.slice(48, 64)).trim();
          rows.push(st);
          current = id;
          break;
        }
        case '03':
          mj = real(alpha ? line.slice(4, 20) : line.slice(4, 14));
          break;
        case '09': {
          if (!['F1', 'F2', 'MD', 'MC'].includes(derv)) break;
          const from = (alpha ? line.slice(4, 20) : line.slice(4, 8)).trim();
          const to = (alpha ? line.slice(20, 36) : line.slice(8, 12)).trim();
          const sd = real(alpha ? line.slice(36, 52) : line.slice(12, 22));
          let v = ang(alpha ? line.slice(52, 68) : line.slice(22, 32));
          const hz = ang(alpha ? line.slice(68, 84) : line.slice(32, 42));
          const code = (alpha ? line.slice(84, 100) : line.slice(42, 58)).trim();
          if (v !== null && vertical === 'horizontal' && derv !== 'MC') v = 90 - v;
          if (from !== current) {
            // A mérés új álláspontról: az álláspont sora a műszermagasság nélkül.
            rows.push(emptyRow('station', from));
            current = from;
          }
          rows.push(obsRow(to, hz, v, sd, null, mj, code));
          break;
        }
      }
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      issues.push({ level: 'error', message: e.message, line: i + 1 });
    }
  });
  return { rows, issues, format: 'Sokkia SDR' };
}

/* ------------------------------------------------------------------ *
 * Geodimeter (UDS / job állomány: címke=érték)
 * ------------------------------------------------------------------ */

/**
 * Geodimeter job állomány: soronként (vagy szóközzel tagolva) „címke=érték”. Álláspont: 2= (Stn),
 * 3= (IH); mérés: 5= (Pno), 4= (Pcode), 6= (SH), 7= (HA), 8= (VA), 9= (SD), 11= (HD). A szögegységet az
 * állomány nem jelöli: a munkalapon választható (alapértelmezés FOK.PPMMSS).
 */
export function parseGeodimeter(text: string, unit: AngleUnit = 'dms'): FieldParseResult {
  const rows: FieldRow[] = [];
  const issues: Issue[] = [];
  let station: FieldRow | null = null;
  let obs: { id: string; code: string; sh: number | null; ha: number | null; va: number | null; sd: number | null; hd: number | null } | null = null;
  let sh: number | null = null;
  const flush = () => {
    if (obs && obs.ha !== null) rows.push(obsRow(obs.id, obs.ha, obs.va, obs.sd, obs.hd, obs.sh ?? sh, obs.code));
    obs = null;
  };
  const num = (s: string) => {
    const v = Number(s.trim());
    return s.trim() !== '' && Number.isFinite(v) ? v : null;
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const tokens = raw.trim().match(/\d+=[^\s=]*(?:\s+(?!\d+=)[^\s=]+)*/g) ?? [];
    for (const tok of tokens) {
      const eq = tok.indexOf('=');
      const label = Number(tok.slice(0, eq));
      const value = tok.slice(eq + 1).trim();
      try {
        switch (label) {
          case 2:
            flush();
            station = emptyRow('station', value);
            rows.push(station);
            break;
          case 3:
            if (station) station.mm = num(value);
            break;
          case 5:
            flush();
            obs = { id: value, code: '', sh: null, ha: null, va: null, sd: null, hd: null };
            break;
          case 4:
            if (obs) obs.code = value;
            break;
          case 6:
            sh = num(value);
            if (obs) obs.sh = sh;
            break;
          case 7:
            if (obs) obs.ha = angleToDeg(value, unit);
            break;
          case 8:
            if (obs) obs.va = angleToDeg(value, unit);
            break;
          case 9:
            if (obs) obs.sd = num(value);
            break;
          case 11:
            if (obs) obs.hd = num(value);
            break;
        }
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        issues.push({ level: 'error', message: e.message, line: i + 1 });
      }
    }
  });
  flush();
  return { rows, issues, format: 'Geodimeter' };
}

/* ------------------------------------------------------------------ *
 * Topcon GTS-7
 * ------------------------------------------------------------------ */

/**
 * Topcon GTS-7: rekordtípus (az első szó), utána vesszővel tagolt értékek. UNITS (M/F, D/G), STN
 * (pontszám, műszermagasság, azonosító), BS/FS/SS (pontszám, jelmagasság, kód), SD (Hz, zenitszög, ferde
 * távolság), HD (Hz, vízszintes távolság, magasságkülönbség), HV (Hz, zenitszög). A fokos szög
 * FOK.PPMMSS alakú.
 */
export function parseGts7(text: string, unit: AngleUnit = 'dms'): FieldParseResult {
  const rows: FieldRow[] = [];
  const issues: Issue[] = [];
  let target: { id: string; th: number | null; code: string } | null = null;
  let feet = false;
  const num = (s: string | undefined) => {
    const t = (s ?? '').trim();
    const v = Number(t);
    return t !== '' && Number.isFinite(v) ? v : null;
  };
  const dist = (s: string | undefined) => {
    const v = num(s);
    return v === null ? null : feet ? v * 0.3048 : v;
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') return;
    const m = /^([A-Za-z][A-Za-z0-9-]*)\s*,?\s*(.*)$/.exec(line);
    if (!m) return;
    const type = m[1]!.toUpperCase();
    const f = m[2]!.split(',').map((x) => x.trim());
    try {
      switch (type) {
        case 'UNITS':
          feet = /^F/i.test(f[0] ?? '');
          if (/^G/i.test(f[1] ?? '')) unit = 'gon';
          else if (/^D/i.test(f[1] ?? '') && unit === 'gon') unit = 'dms';
          break;
        case 'STN': {
          const st = emptyRow('station', f[0] ?? '');
          st.mm = dist(f[1]);
          st.ap1 = f[2] ?? '';
          rows.push(st);
          target = null;
          break;
        }
        case 'BS':
        case 'FS':
        case 'SS':
          target = { id: f[0] ?? '', th: dist(f[1]), code: f[2] ?? '' };
          break;
        case 'SD':
        case 'HV':
        case 'HD': {
          if (!target) throw new CalcError(`${type} rekord BS/FS/SS nélkül.`);
          const hz = f[0] ? angleToDeg(f[0], unit) : null;
          if (type === 'HD') rows.push(obsRow(target.id, hz, null, null, dist(f[1]), target.th, target.code));
          else rows.push(obsRow(target.id, hz, f[1] ? angleToDeg(f[1], unit) : null, type === 'SD' ? dist(f[2]) : null, null, target.th, target.code));
          break;
        }
      }
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      issues.push({ level: 'error', message: e.message, line: i + 1 });
    }
  });
  return { rows, issues, format: 'Topcon GTS-7' };
}

/* ------------------------------------------------------------------ *
 * Carlson / TDS RW5 (a FOIF műszereken futó FieldGenius és SurvCE nyers állománya)
 * ------------------------------------------------------------------ */

/**
 * RW5: soronként egy rekord, a mezők kétbetűs előtaggal, vesszővel tagolva. MO (AU0 = fok, FOK.PPMMSS;
 * AU1 = gon; UN0 láb, UN1 méter, UN2 US láb), OC (OP álláspont), LS (HI műszer-, HR jelmagasság),
 * BK (OP, BP hátrapont, BC leolvasás), SS/TR/BD/BR/FD/FR (OP, FP, AR/AL irány, ZE/VA szög, SD/HD
 * távolság, -- megjegyzés).
 */
export function parseRw5(text: string): FieldParseResult {
  const rows: FieldRow[] = [];
  const issues: Issue[] = [];
  let unit: AngleUnit = 'dms';
  let distScale = 1;
  let hi: number | null = null;
  let hr: number | null = null;
  let current: string | null = null;
  let backsight: { op: string; bp: string; bc: number | null; used: boolean } | null = null;
  const ensureStation = (id: string) => {
    if (id === current) return;
    const st = emptyRow('station', id);
    st.mm = hi;
    rows.push(st);
    current = id;
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') return;
    const parts = line.split(',');
    const type = parts[0]!.trim().toUpperCase();
    const fields = new Map<string, string>();
    for (const p of parts.slice(1)) {
      const t = p.trim();
      if (t.startsWith('--')) fields.set('--', t.slice(2));
      else if (t.length >= 2) fields.set(t.slice(0, 2).toUpperCase(), t.slice(2).trim());
    }
    const num = (k: string) => {
      const t = fields.get(k);
      const v = Number(t);
      return t !== undefined && t !== '' && Number.isFinite(v) ? v : null;
    };
    try {
      switch (type) {
        case 'MO': {
          const au = fields.get('AU');
          if (au === '1') unit = 'gon';
          else if (au === '0') unit = 'dms';
          const un = fields.get('UN');
          distScale = un === '0' ? 0.3048 : un === '2' ? 1200 / 3937 : 1;
          break;
        }
        case 'OC':
          ensureStation(fields.get('OP') ?? '');
          if (hi !== null) rows[rows.length - 1]!.mm = hi;
          break;
        case 'LS':
          if (num('HI') !== null) {
            hi = num('HI')! * distScale;
            const st = [...rows].reverse().find((r) => r.kind === 'station');
            if (st && st.id === current) st.mm = hi;
          }
          if (num('HR') !== null) hr = num('HR')! * distScale;
          break;
        case 'BK': {
          const op = fields.get('OP') ?? '';
          ensureStation(op);
          backsight = { op, bp: fields.get('BP') ?? '', bc: fields.get('BC') ? angleToDeg(fields.get('BC')!, unit) : null, used: false };
          break;
        }
        case 'SS':
        case 'TR':
        case 'BD':
        case 'BR':
        case 'FD':
        case 'FR': {
          const op = fields.get('OP') ?? current ?? '';
          ensureStation(op);
          const fp = fields.get('FP') ?? '';
          let hz: number | null = null;
          if (fields.has('AR')) hz = angleToDeg(fields.get('AR')!, unit);
          else if (fields.has('AL')) hz = -angleToDeg(fields.get('AL')!, unit);
          else if (fields.has('AZ')) hz = angleToDeg(fields.get('AZ')!, unit);
          let zi: number | null = null;
          if (fields.has('ZE')) zi = angleToDeg(fields.get('ZE')!, unit);
          else if (fields.has('VA')) zi = 90 - angleToDeg(fields.get('VA')!, unit);
          const sd = num('SD');
          const hd = num('HD');
          if (backsight && fp === backsight.bp && op === backsight.op) backsight.used = true;
          rows.push(obsRow(fp, hz, zi, sd === null ? null : sd * distScale, hd === null ? null : hd * distScale, hr, fields.get('--') ?? ''));
          break;
        }
      }
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      issues.push({ level: 'error', message: e.message, line: i + 1 });
    }
  });
  return { rows, issues, format: 'RW5 (Carlson/TDS, FOIF FieldGenius)' };
}

/** Az adatrögzítő típusa szerinti beolvasás. */
/**
 * FOIF nyers mérés (.MES): vesszővel tagolt rekordok, az első mező a fajtájuk. A szögek egysége
 * 1/7200 fok (0,5″); a vízszintes irány tájékozott irány, a magassági szög 360° − zenitszög
 * alakú (pl. 270.13° = 89.87° zenitszög). A rekordok:
 * - A: álláspont – pontszám, X, Y, H, műszermagasság;
 * - F: mérés (kitűzés) – pontszám, Hz, V, vízszintes távolság, ferde távolság, magasságkülönbség,
 *   jelmagasság, majd a számított X, Y, H;
 * - H: kitűzendő pont, J: kitűzési eltérés, B/C/D/K: tájékozás és szabad álláspont (ezek nem mérések).
 * Az ellenőrzés: a valódi állományban a Hz/7200 a koordinátákból számolt irányszöggel, a 4. mező a
 * koordinátákból számolt távolsággal egyezik.
 */
export function parseFoifMes(text: string): FieldParseResult {
  const rows: FieldRow[] = [];
  const issues: Issue[] = [];
  const unit = 7200;
  text.split(/\r?\n/).forEach((raw, i) => {
    const f = raw.trim().split(',').map((x) => x.trim());
    const n = (k: number) => {
      const v = Number(f[k]);
      return f[k] !== undefined && f[k] !== '' && Number.isFinite(v) ? v : null;
    };
    switch (f[0]) {
      case 'A': {
        const st = emptyRow('station', f[1] ?? '');
        st.mm = n(5);
        rows.push(st);
        break;
      }
      case 'F': {
        if (!rows.some((r) => r.kind === 'station')) {
          issues.push({ level: 'error', message: `${f[1]}: mérés álláspont (A rekord) előtt.`, line: i + 1 });
          return;
        }
        const hz = n(2);
        const v = n(3);
        const o = emptyRow('obs', f[1] ?? '');
        o.hz = hz === null ? null : (((hz / unit) % 360) + 360) % 360;
        o.zi = v === null ? null : v / unit > 180 ? 360 - v / unit : v / unit;
        o.tv = n(4);
        o.tf = n(5);
        o.mj = n(7);
        rows.push(o);
        break;
      }
    }
  });
  if (rows.length === 0) issues.push({ level: 'error', message: 'Az állományban nincs álláspont (A) és mérés (F) rekord.' });
  return { rows, issues, format: 'FOIF MES' };
}

export function parseFieldData(text: string, recorder: string, opts: FieldParseOptions = {}): FieldParseResult {
  switch (recorder) {
    case 'geocalc-ar':
      return parseGeoCalcAr(text);
    case 'leica-gsi8':
    case 'leica-gsi16':
    case 'leica-tc':
    case 'geomax':
      return parseGsi(text);
    case 'sokkia-sdr-a':
    case 'sokkia-sdr-n':
      return parseSdr(text);
    case 'geodimeter-uds':
      return parseGeodimeter(text, opts.angleUnit ?? 'dms');
    case 'topcon':
      return parseGts7(text, opts.angleUnit ?? 'dms');
    case 'foif-rw5':
      return parseRw5(text);
    case 'foif-mes':
      return parseFoifMes(text);
    default:
      throw new CalcError(
        'Ehhez az adatrögzítő-típushoz még nincs beolvasó. Küldj egy mintaállományt a műszerből, vagy mentsd az adatokat a gyári programmal GSI vagy GeoCalc GMJ formátumba.',
      );
  }
}

/** A formátum felismerése a tartalom alapján (GMJ, GSI, SDR, RW5, GTS-7, Geodimeter). */
export function detectFieldFormat(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const first = lines[0] ?? '';
  if (/^\*?\d{2}[.\d]{4}[+-]/.test(first)) return 'leica-gsi16';
  if (/,-[12]\s*$/.test(first) || /,\s*-[12](,|\s*$)/.test(first)) return 'geocalc-ar';
  if (/^00NM/.test(first) || lines.some((l) => /^09(F1|F2|MD|MC)/.test(l))) return 'sokkia-sdr-n';
  if (lines.some((l) => /^(MO|OC|LS|BK|SS|TR),/.test(l))) return 'foif-rw5';
  if (lines.some((l) => /^A,/.test(l)) && lines.some((l) => /^F,/.test(l))) return 'foif-mes';
  if (/^GTS-?7/i.test(first) || lines.some((l) => /^(STN|BS|FS|SS)[ ,]/.test(l)) && lines.some((l) => /^(SD|HD|HV)[ ,]/.test(l))) return 'topcon';
  if (lines.slice(0, 20).filter((l) => /^\d+=/.test(l)).length >= 3) return 'geodimeter-uds';
  return null;
}

/* ------------------------------------------------------------------ *
 * Számítások a munkaterületen
 * ------------------------------------------------------------------ */

/** A mérési sorok műszermagassága az előző álláspontról. */
function stationOf(rows: FieldRow[], index: number): FieldRow | null {
  for (let i = index; i >= 0; i--) if (rows[i]!.kind === 'station') return rows[i]!;
  return null;
}

/** Távolságredukció (Tvet) a beállítások szerint (súgó 12. és 14. o.). */
export function computeTvet(rows: FieldRow[], s: RecorderSettings): FieldRow[] {
  return rows.map((r, i) => {
    if (r.kind !== 'obs') return r;
    const st = stationOf(rows, i);
    const res = reduceMeasurement(
      { no: i + 1, hz: r.hz, zi: r.zi, tf: r.tf, tv: r.tv, dm: r.dm, mj: r.mj, mm: st?.mm ?? null, code: r.code },
      s,
    );
    return { ...r, tvet: res.tv === null ? null : Math.round(res.tv * 10000) / 10000 };
  });
}

/** Magasságkülönbség a ferde távolságból és a zenitszögből: dM = Tf · cos(Zi) + Mm − Mj. */
export function computeDm(rows: FieldRow[]): FieldRow[] {
  return rows.map((r, i) => {
    if (r.kind !== 'obs' || r.zi === null || r.tf === null) return r;
    const st = stationOf(rows, i);
    const dm = r.tf * Math.cos((r.zi * Math.PI) / 180) + (st?.mm ?? 0) - (r.mj ?? 0);
    return { ...r, dm: Math.round(dm * 10000) / 10000 };
  });
}

/**
 * Bal-jobb irányok középelése (súgó 12. o.): a „-b”/„_b” és „-j”/„_j” végű, egymást követő irányok
 * középértéke új irányként a közös pontszámmal; az eredeti két irány pirosra vált (kimarad).
 */
export function averageLeftRight(rows: FieldRow[]): { rows: FieldRow[]; count: number } {
  const out: FieldRow[] = [];
  let count = 0;
  const base = (id: string, side: 'b' | 'j') => {
    const m = new RegExp(`^(.*)[-_]${side}$`, 'i').exec(id);
    return m ? m[1]! : null;
  };
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]!;
    const b = rows[i + 1];
    const left = a.kind === 'obs' && a.state === 'ok' ? base(a.id, 'b') : null;
    const right = b && b.kind === 'obs' && b.state === 'ok' ? base(b.id, 'j') : null;
    if (left !== null && right !== null && left === right && a.hz !== null && b!.hz !== null) {
      let d = b!.hz - a.hz;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      const mean: FieldRow = {
        ...a,
        id: left,
        hz: (((a.hz + d / 2) % 360) + 360) % 360,
        zi: a.zi !== null && b!.zi !== null ? (a.zi + b!.zi) / 2 : (a.zi ?? b!.zi),
        tf: a.tf !== null && b!.tf !== null ? (a.tf + b!.tf) / 2 : (a.tf ?? b!.tf),
        tv: a.tv !== null && b!.tv !== null ? (a.tv + b!.tv) / 2 : (a.tv ?? b!.tv),
        tvet: a.tvet !== null && b!.tvet !== null ? (a.tvet + b!.tvet) / 2 : (a.tvet ?? b!.tvet),
        state: 'mean',
      };
      out.push({ ...a, state: 'merged' }, { ...b!, state: 'merged' }, mean);
      count++;
      i++;
      continue;
    }
    out.push(a);
  }
  return { rows: out, count };
}

/* ------------------------------------------------------------------ *
 * Két távcsőállás középelése (a GeoCalc GCAR_2T átalakítójának helyett)
 * ------------------------------------------------------------------ */

const meanOf = (v: number[]) => v.reduce((a, x) => a + x, 0) / v.length;
/** Körös átlag fokban (a 0°/360° átfordulással). */
const circularMean = (v: number[]) => {
  const ref = v[0]!;
  const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
  return (((ref + meanOf(v.map((x) => wrap(x - ref)))) % 360) + 360) % 360;
};
/** Egész másodpercre kerekítés (a GMJ FOK.PPMMSS egész másodpercet tárol). */
const wholeSec = (deg: number) => (Math.round(deg * 3600) / 3600) % 360;

export interface TwoFaceResult {
  rows: FieldRow[];
  /** A középelt célpontok száma. */
  count: number;
  /** Az egy állásban mért (pár nélküli) célpontok. */
  single: number;
  /** A legnagyobb indexhiba-kétszeres (Zi₁ + Zi₂ − 360°) másodpercben. */
  maxIndexError: number | null;
}

/**
 * Az I. és II. távcsőállásban mért irányok középelése álláspontonként és célpontonként (a GeoCalc
 * GCAR_2T programjának képleteivel): Hz = (Hz₁ + Hz₂ − 180°) / 2 körös átlagként, Zi = (Zi₁ + 360° − Zi₂) / 2,
 * a ferde, vízszintes és vetületi távolság, valamint a magasságkülönbség a mért értékek átlaga. A II. állás
 * a 180°-nál nagyobb zenitszögű (zenitszög nélkül: az I. álláshoz képest ~180°-kal elforgatott) irány.
 * Több I. és II. állású leolvasásnál mindegyiket átlagolja. Csak az azonos pontszámú irányok párosulnak
 * (pl. a „54-2070” és a „54-2070_” külön marad); a pár nélküli irány változatlan. Az eredeti irányok
 * pirosra váltanak (kimaradnak), a középelt irány az első leolvasás helyére kerül.
 */
export function averageTwoFaces(rows: FieldRow[]): TwoFaceResult {
  const out: FieldRow[] = [];
  let count = 0;
  let single = 0;
  let maxIndexError: number | null = null;
  let i = 0;
  while (i < rows.length) {
    // Egy álláspont blokkja: az álláspont sora és a következő álláspontig tartó mérések.
    const start = i;
    i++;
    while (i < rows.length && rows[i]!.kind !== 'station') i++;
    const block = rows.slice(start, i);
    const groups = new Map<string, number[]>();
    block.forEach((r, k) => {
      if (r.kind !== 'obs' || r.state !== 'ok' || r.hz === null) return;
      const list = groups.get(r.id) ?? [];
      list.push(k);
      groups.set(r.id, list);
    });
    const means = new Map<number, FieldRow>();
    const merged = new Set<number>();
    for (const [id, idx] of groups) {
      const list = idx.map((k) => block[k]!);
      const first = list[0]!;
      const faceII = (r: FieldRow) =>
        r.zi !== null && first.zi !== null ? r.zi > 180 : Math.abs(((((r.hz! - first.hz! + 180) % 360) + 360) % 360) - 180) > 90;
      const I = list.filter((r) => !faceII(r));
      const II = list.filter((r) => faceII(r));
      if (I.length === 0 || II.length === 0) {
        if (list.length > 0) single++;
        continue;
      }
      const hz = circularMean([circularMean(I.map((r) => r.hz!)), circularMean(II.map((r) => (r.hz! + 180) % 360))]);
      const ziI = I.map((r) => r.zi).filter((z): z is number => z !== null);
      const ziII = II.map((r) => r.zi).filter((z): z is number => z !== null);
      let zi: number | null = null;
      if (ziI.length > 0 && ziII.length > 0) {
        zi = (meanOf(ziI) + 360 - meanOf(ziII)) / 2;
        const ie = Math.abs((meanOf(ziI) + meanOf(ziII) - 360) * 3600);
        maxIndexError = maxIndexError === null ? ie : Math.max(maxIndexError, ie);
      } else if (ziI.length > 0) zi = meanOf(ziI);
      else if (ziII.length > 0) zi = 360 - meanOf(ziII);
      const avg = (f: (r: FieldRow) => number | null) => {
        const v = list.map(f).filter((x): x is number => x !== null);
        return v.length > 0 ? Math.round(meanOf(v) * 10000) / 10000 : null;
      };
      means.set(idx[0]!, {
        ...first,
        id,
        hz: wholeSec(hz),
        zi: zi === null ? null : wholeSec(zi),
        tf: avg((r) => r.tf),
        tv: avg((r) => r.tv),
        tvet: avg((r) => r.tvet),
        dm: avg((r) => r.dm),
        mj: list.map((r) => r.mj).find((m) => m !== null && m > 0) ?? first.mj,
        state: 'mean',
      });
      for (const k of idx) merged.add(k);
      count++;
    }
    block.forEach((r, k) => {
      out.push(merged.has(k) ? { ...r, state: 'merged' } : r);
      const m = means.get(k);
      if (m) out.push(m);
    });
  }
  return { rows: out, count, single, maxIndexError };
}

/** A középelés visszavonása: a középelt sorok törlődnek, az eredeti irányok ismét felhasználódnak. */
export function undoAveraging(rows: FieldRow[]): FieldRow[] {
  return rows.filter((r) => r.state !== 'mean').map((r) => (r.state === 'merged' ? { ...r, state: 'ok' } : r));
}

/**
 * Konvertálás a hálózatkiegyenlítéshez (súgó 12. o.): GMJ a feldolgozandó sorokból – a kihagyott
 * (szürke) és a középelt eredeti (piros) irányok nélkül, a középelt irányokkal. A hálózat távolsága a
 * Tvet, ennek hiányában a Tv.
 */
export function toNetworkGmj(rows: FieldRow[]): { text: string; stations: number; observations: number } {
  const used = rows.filter((r) => r.state === 'ok' || r.state === 'mean');
  let stations = 0;
  let observations = 0;
  const lines: string[] = [];
  let n = 0;
  for (const r of used) {
    n++;
    if (r.kind === 'station') {
      stations++;
      lines.push([n, r.id, '', '', '', '', '', r.code, f4(r.mm), '', '', '', '', '-1'].join(','));
      continue;
    }
    if (r.hz === null) continue;
    observations++;
    const dist = r.tvet ?? r.tv ?? (r.tf !== null && r.zi !== null ? r.tf * Math.sin((r.zi * Math.PI) / 180) : null);
    lines.push(
      [
        n,
        r.id,
        fAngle(r.hz),
        r.zi === null ? '' : fAngle(r.zi),
        r.tf === null ? '' : f4(r.tf),
        r.tv === null ? '' : f4(r.tv),
        r.dm === null ? '' : f4(r.dm),
        r.code,
        '',
        r.mj === null ? '' : f4(r.mj),
        f4(dist),
        '',
        '',
        '-2',
      ].join(','),
    );
  }
  return { text: lines.join('\r\n') + '\r\n', stations, observations };
}

/** A mérési jegyzőkönyv nyomtatható szakasza (súgó 12. o.: „Mérési jegyzőkönyv nyomtatása”). */
export function fieldBookSection(rows: FieldRow[], source: string): Section {
  const ang = (n: number | null) => (n === null ? '' : fAngle(n));
  const d = (n: number | null, dec = 3) => (n === null ? '' : fix(n, dec));
  return {
    kind: 'field-book',
    title: 'Mérési jegyzőkönyv',
    columns: ['#', 'Pontszám', 'Hz', 'Zi', 'Tf', 'Tv', 'Tvet', 'dM', 'Mj', 'Mm', 'Pontkód'],
    rows: rows.map<Row>((r, i) => ({
      cells: [String(i + 1), r.id, ang(r.hz), ang(r.zi), d(r.tf), d(r.tv), d(r.tvet, 4), d(r.dm, 4), d(r.mj, 2), d(r.mm, 2), r.code],
      role: r.kind === 'station' ? 'result' : r.state === 'ok' || r.state === 'mean' ? 'base' : 'input',
    })),
    footer: [
      `Forrás: ${source || 'kézi adatbevitel'}. Álláspontok: ${rows.filter((r) => r.kind === 'station').length}, mérések: ${rows.filter((r) => r.kind === 'obs').length}, kihagyott: ${rows.filter((r) => r.state === 'skip').length}.`,
    ],
  };
}
