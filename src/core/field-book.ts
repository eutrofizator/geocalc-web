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

/** Az adatrögzítő típusa szerinti beolvasás. */
export function parseFieldData(text: string, recorder: string): FieldParseResult {
  switch (recorder) {
    case 'geocalc-ar':
      return parseGeoCalcAr(text);
    case 'leica-gsi8':
    case 'leica-gsi16':
    case 'leica-tc':
    case 'geomax':
      return parseGsi(text);
    default:
      throw new CalcError(
        'Ehhez az adatrögzítő-típushoz még nincs beolvasó. Küldj egy mintaállományt a műszerből, vagy mentsd az adatokat a gyári programmal GSI vagy GeoCalc GMJ formátumba.',
      );
  }
}

/** Ha a formátum nincs megadva: a GMJ és a GSI felismerése a tartalom alapján. */
export function detectFieldFormat(text: string): string | null {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '')?.trim() ?? '';
  if (/^\*?\d{2}[.\d]{4}[+-]/.test(first)) return 'leica-gsi16';
  if (/,-[12]\s*$/.test(first) || /,\s*-[12](,|\s*$)/.test(first)) return 'geocalc-ar';
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
