import {
  AKG_FIELDS,
  EMPTY_COMMON,
  EMPTY_RECORD,
  akgPointList,
  akgSections,
  buildParcels,
  normalizeCelprg,
  parseAkgCoordinates,
  parseAms,
  type AkgCommon,
  type AkgParcelData,
  type AkgRecord,
} from './core/akg';
import { CalcError } from './core/errors';
import type { Section } from './core/types';
import { downloadReport, onMeta, renderCover } from './report-view';
import { $, download, el, readText, renderSection, storage } from './ui';

/**
 * Az Adatcsere/AKG jegyzőkönyv munkalap (súgó 75. o.).
 *
 * A 61/2009. (V. 14.) FVM rendelet szerinti mérési és számítási jegyzőkönyv. A webes változat a
 * súgóban leírt kézi (koordináta-jegyzék) adatforrást dolgozza fel; a GIS adatbázisok és a
 * PDF/SHP kimenet a valódi programot igénylik.
 */

const STORAGE_KEY = 'geocalc-web.akg';
const AKG_TITLE = 'AKG JEGYZŐKÖNYV';

const SAMPLE_COORDS = [
  '101 602000.000 204500.000',
  '102 602100.000 204500.000',
  '103 602100.000 204600.000',
  '104 602000.000 204600.000',
  '105 602150.000 204650.000',
  '106 602250.000 204650.000',
].join('\r\n');

const SAMPLE_AMS = ['#', '101', '102', '103', '104', ';;', '#', '103', '104', '105', '106', ';;'].join('\r\n');

interface FormState {
  coords: string;
  ams: string;
  common: AkgCommon;
  selected: number;
  records: AkgRecord[];
}

const fix = (n: number, d: number) => {
  const s = n.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
};

export function initAkgView(): void {
  const coords = $<HTMLTextAreaElement>('akg-coords');
  const ams = $<HTMLTextAreaElement>('akg-ams');
  const parcelSel = $<HTMLSelectElement>('akg-parcel');
  const idInput = $<HTMLInputElement>('akg-id');
  const regsz = $<HTMLInputElement>('akg-regsz');
  const block = $<HTMLInputElement>('akg-block');
  const foldh = $<HTMLInputElement>('akg-foldh');
  const jelolo = $<HTMLInputElement>('akg-jelolo');
  const celprg = $<HTMLInputElement>('akg-celprg');
  const kivett = $<HTMLInputElement>('akg-kivett');
  const celprgText = $<HTMLInputElement>('akg-celprg-text');
  const mero = $<HTMLInputElement>('akg-mero');
  const ido = $<HTMLInputElement>('akg-ido');
  const muszer = $<HTMLInputElement>('akg-muszer');
  const telepules = $<HTMLInputElement>('akg-telepules');
  const issues = $('akg-issues');
  const results = $('akg-results');
  const downloads = $('akg-downloads');
  const status = $('akg-status');

  /** A parcellák leíró adatai (a súgó szerint parcellánként). */
  let records: AkgRecord[] = [];
  let rendering = false;

  const readRecord = (): AkgRecord => ({
    akgId: idInput.value,
    block: block.value,
    regsz: regsz.value,
    foldh: foldh.value,
    celprg: celprg.value,
    celprgSzoveg: celprgText.value,
    jeloloPont: jelolo.value,
    kivett: kivett.value,
  });

  const writeRecord = (r: AkgRecord) => {
    const set = (e: HTMLInputElement, v: string) => {
      if (e.value !== v) e.value = v;
    };
    set(idInput, r.akgId);
    set(block, r.block);
    set(regsz, r.regsz);
    set(foldh, r.foldh);
    set(celprg, r.celprg);
    set(celprgText, r.celprgSzoveg);
    set(jelolo, r.jeloloPont);
    set(kivett, r.kivett);
  };

  const common = (): AkgCommon => ({
    merteVegzo: mero.value,
    meresIdeje: ido.value,
    muszer: muszer.value,
    telepules: telepules.value,
  });

  const writeCommon = (c: AkgCommon) => {
    const set = (e: HTMLInputElement, v: string) => {
      if (e.value !== v) e.value = v;
    };
    set(mero, c.merteVegzo);
    set(ido, c.meresIdeje);
    set(muszer, c.muszer);
    set(telepules, c.telepules);
  };

  const showError = (message: string) => {
    const row = el('div', 'issue error');
    row.append(el('span', 'tag', 'Hiba'), el('span', undefined, message));
    issues.append(row);
  };

  const buildParcelOptions = (parcels: AkgParcelData[]) => {
    const previous = parcelSel.value;
    parcelSel.replaceChildren();
    parcels.forEach((p, i) => {
      const r = records[i] ?? EMPTY_RECORD;
      parcelSel.append(new Option(`${i + 1}. parcella – AKG_ID ${r.akgId || '?'} (${p.points.length} sarokpont)`, String(i)));
    });
    if (parcels.length > 0) parcelSel.value = [...parcelSel.options].some((o) => o.value === previous) ? previous : '0';
  };

  const compute = () => {
    const previous = parcelSel.value;
    issues.replaceChildren();
    results.replaceChildren();
    downloads.replaceChildren();
    status.textContent = '';
    const text = coords.value;
    const amsText = ams.value;
    storage.set(STORAGE_KEY, JSON.stringify({ coords: text, ams: amsText, common: common(), selected: Number(previous) || 0, records } satisfies FormState));
    if (text.trim() === '' || amsText.trim() === '') {
      results.append(el('p', 'empty', 'Add meg a koordináta-állományt és az AMS leíró állományt, vagy tölts be egy mintapéldát.'));
      return;
    }
    try {
      const points = parseAkgCoordinates(text);
      const parcelIds = parseAms(amsText);
      const built = buildParcels(points, parcelIds);
      for (const issue of built.issues) {
        const row = el('div', 'issue warning');
        row.append(el('span', 'tag', 'Figyelem'), el('span', undefined, issue));
        issues.append(row);
      }
      const parcels = built.parcels;
      if (parcels.length === 0) {
        results.append(el('p', 'empty', 'Egy parcella sem számítható.'));
        return;
      }
      // A leíró adatok sorszám szerinti megőrzése; új parcelláknál üres rekord.
      rendering = true;
      records = parcels.map((_, i) => records[i] ?? { ...EMPTY_RECORD, akgId: String(i + 1) });
      buildParcelOptions(parcels);
      const sel = Math.min(Math.max(Number(previous) || 0, 0), records.length - 1);
      parcelSel.value = String(sel);
      writeRecord(records[sel]!);
      rendering = false;

      const sections: Section[] = akgSections(parcels, records, common());
      for (const section of sections) results.append(renderSection(section));
      results.prepend(renderCover(AKG_TITLE));
      const total = parcels.reduce((s, p) => s + p.area, 0);
      status.textContent =
        `Kiszámítva ${new Date().toLocaleTimeString('hu-HU')} · ${parcels.length} parcella · ${fix(total / 10000, 4)} ha összterület`;

      const j = el('button', undefined, 'AKG jegyzőkönyv (.txt)');
      j.type = 'button';
      j.addEventListener('click', () => downloadReport('akg_jegyzokonyv.txt', AKG_TITLE, sections));
      downloads.append(j);

      const pt = el('button', undefined, 'Parcellák sarokpontjai (.txt)');
      pt.type = 'button';
      pt.addEventListener('click', () => download('akg_sarokpontok.txt', akgPointList(parcels)));
      downloads.append(pt);

      const names = el('button', undefined, 'A generált állományok nevei (.txt)');
      names.type = 'button';
      names.addEventListener('click', () => {
        const lines = parcels.flatMap((p, i) => {
          const r = records[i] ?? EMPTY_RECORD;
          return [`# ${i + 1}. parcella`, `AKG_${r.regsz || 'X'}_${r.block || 'X'}_${r.akgId || 'X'}.pdf`, `AKG_${r.regsz || 'X'}_${r.block || 'X'}_${r.akgId || 'X'}.shp`, `AKG_${r.regsz || 'X'}_${r.block || 'X'}_${r.akgId || 'X'}_P.shp`];
        });
        download('akg_allomanynevek.txt', [...lines, '', 'A PDF és SHP kimenet a valódi GeoCalc programot igényli.'].join('\r\n') + '\r\n');
      });
      downloads.append(names);
    } catch (e) {
      if (e instanceof CalcError) showError(e.message);
      else showError(`A feldolgozás nem futott le: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(compute, 350);
  };

  // A parcellánkénti leíró adatok a memóriában maradnak; a vezérlők a kiválasztott parcelláét mutatják.
  const storeRecord = () => {
    if (rendering) return;
    const sel = Number(parcelSel.value) || 0;
    records[sel] = readRecord();
  };
  for (const e of [idInput, regsz, block, foldh, jelolo, celprg, kivett, celprgText]) {
    e.addEventListener('input', () => {
      storeRecord();
      schedule();
    });
  }
  for (const e of [mero, ido, muszer, telepules]) e.addEventListener('input', schedule);
  coords.addEventListener('input', schedule);
  ams.addEventListener('input', schedule);
  parcelSel.addEventListener('change', () => {
    const sel = Number(parcelSel.value) || 0;
    rendering = true;
    writeRecord(records[sel] ?? EMPTY_RECORD);
    rendering = false;
    schedule();
  });

  $('akg-normalize').addEventListener('click', () => {
    const next = normalizeCelprg(celprg.value);
    celprg.value = next;
    storeRecord();
    status.textContent = next === '' ? 'A célprogram azonosítója üres.' : `A célprogram azonosítója kiegészítve: ${next}`;
    schedule();
  });

  $('akg-sample').addEventListener('click', () => {
    coords.value = SAMPLE_COORDS;
    ams.value = SAMPLE_AMS;
    records = [];
    writeCommon({ ...EMPTY_COMMON, merteVegzo: 'Példa mérést végző', meresIdeje: new Date().toLocaleDateString('hu-HU'), muszer: 'Leica TC-600', telepules: 'Iszkahegy' });
    compute();
  });

  const coordFile = $<HTMLInputElement>('akg-coords-file');
  $('akg-open-coords').addEventListener('click', () => {
    coordFile.value = '';
    coordFile.click();
  });
  coordFile.addEventListener('change', async () => {
    const file = coordFile.files?.[0];
    if (!file) return;
    try {
      coords.value = await readText(file);
      compute();
      status.textContent = `A(z) ${file.name} koordináta-állomány beolvasva.`;
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  });

  const amsFile = $<HTMLInputElement>('akg-ams-file');
  $('akg-open-ams').addEventListener('click', () => {
    amsFile.value = '';
    amsFile.click();
  });
  amsFile.addEventListener('change', async () => {
    const file = amsFile.files?.[0];
    if (!file) return;
    try {
      ams.value = await readText(file);
      compute();
      status.textContent = `A(z) ${file.name} AMS leíró állomány beolvasva.`;
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  });

  $('akg-print').addEventListener('click', () => window.print());
  onMeta(compute);

  // Indulás: az utolsó munka, különben a mintapélda.
  try {
    const saved = JSON.parse(storage.get(STORAGE_KEY) || 'null') as Partial<FormState> | null;
    // Az üres, de tárolt koordinátalista (új munka) üresen marad.
    if (saved && typeof saved.coords === 'string') {
      coords.value = saved.coords;
      ams.value = saved.ams ?? '';
      records = Array.isArray(saved.records) ? saved.records.map((r) => ({ ...EMPTY_RECORD, ...r })) : [];
      writeCommon({ ...EMPTY_COMMON, ...(saved.common ?? {}) });
      compute();
    } else {
      coords.value = SAMPLE_COORDS;
      ams.value = SAMPLE_AMS;
    }
  } catch {
    coords.value = SAMPLE_COORDS;
    ams.value = SAMPLE_AMS;
  }
  compute();

  // Az AKG_* mezők ismertetése a munkalap címkéihez (a súgó 75. o. szerint).
  const desc = AKG_FIELDS.map((f) => `${f.name}: ${f.description}`).join(' ');
  $('akg-parcel').title = desc;
}
