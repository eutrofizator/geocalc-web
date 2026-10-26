import { encodeWindows1250 } from './dat';
import {
  clauseRequest,
  dataRequest,
  htmlDocument,
  mapCopyOrder,
  sectionsPage,
  setoutMinutes,
  setoutReport,
  svgDocument,
  tableOfContents,
  technicalReport,
  workNotice,
  type StakedPoint,
  type WorkData,
} from './documents';
import { JOBS, type JobKind } from './jobs';
import type { Section } from './types';
import type { ZipFile } from './zip-writer';

/**
 * A leadandó munkarészek csomagja a munka fajtája szerinti mappaszerkezetben (a leadott munkák
 * mappáinak sorrendjében): szöveges munkarészek HTML-ben (nyomtatható, PDF-be menthető), rajzok SVG +
 * HTML + DXF, DAT, területszámítás (.lst), koordinátajegyzék (Windows-1250 szöveg).
 */

export interface PackageParts {
  work: WorkData;
  plan: { svg: string; dxf: string };
  sketch: { svg: string; dxf: string };
  /** Telekalakítási helyszínrajz (telekalakításnál). */
  siteplan?: { svg: string; dxf: string };
  dat?: string;
  lstBefore?: string;
  lstAfter?: string;
  coordList: string;
  /** A koordinátajegyzék táblázatai (a nyomtatható változathoz). */
  coordSections?: Section[];
  addressList?: string;
  addressSections?: Section[];
  /** A kitűzött / mért pontok és a határpont-azonosítás jegyzőkönyve. */
  measured?: string;
  subList?: string;
  /** A nyers mérés (pl. FOIF .MES) eredeti állománya. */
  raw?: { name: string; text: string };
  /** A mérési jegyzőkönyv oldala (a nyers mérésből). */
  record?: string;
  /** A kitűzött pontok (a kitűzési jegyzőkönyvhöz). */
  staked?: StakedPoint[];
  /** Az új épületek ellenőrző területszámítása (szöveg). */
  buildingArea?: string;
}

const cp = (s: string) => encodeWindows1250(s);

export function buildPackage(p: PackageParts): ZipFile[] {
  const job: JobKind = p.work.job;
  const def = JOBS[job];
  const pre = (p.work.munkaszam || 'munka').replace(/[^0-9A-Za-z]+/g, '_').replace(/^_+|_+$/g, '') || 'munka';
  const folder = (n: number) => def.folders[n - 1]!;
  const f = (n: number, name: string, data: Uint8Array | string): ZipFile => ({ path: `${folder(n)}/${pre}_${name}`, data });
  const doc = (title: string, page: string) => htmlDocument(title, [page]);
  const drawing = (n: number, base: string, title: string, d: { svg: string; dxf: string }): ZipFile[] => [
    f(n, `${base}.html`, svgDocument(title, d.svg)),
    f(n, `${base}.svg`, d.svg),
    f(n, `${base}.dxf`, cp(d.dxf)),
  ];
  const w = p.work;
  const files: ZipFile[] = [];
  /** A koordinátajegyzék szövegként, táblázatkezelőbe (CSV) és nyomtatható oldalként. */
  const coordFiles = (n: number, base = 'koordinatajegyzek'): ZipFile[] => [
    f(n, `${base}.txt`, cp(p.coordList)),
    f(n, `${base}.csv`, cp(p.coordList.replace(/\t/g, ';'))),
    ...(p.coordSections ? [f(n, `${base}.html`, doc('Koordinátajegyzék', sectionsPage(w, 'KOORDINÁTAJEGYZÉK', p.coordSections)))] : []),
  ];
  const measureFiles = (n: number): ZipFile[] => [
    ...(p.record ? [f(n, 'meresi_jegyzokonyv.html', doc('Mérési jegyzőkönyv', p.record))] : []),
    ...(p.raw ? [{ path: `${folder(n)}/${pre}_${p.raw.name.replace(/[\\/:*?"<>|]+/g, '_')}`, data: cp(p.raw.text) }] : []),
  ];
  switch (job) {
    case 'setout':
      files.push(
        f(2, 'adatigenyles.html', doc('Adatigénylés', dataRequest(w))),
        f(3, 'terkepmasolat_megrendelo.html', doc('Térképmásolat megrendelő', mapCopyOrder(w))),
        f(4, 'muszaki_leiras.html', doc('Műszaki leírás', technicalReport(w))),
        ...measureFiles(5),
      );
      if (p.staked && p.staked.length > 0) files.push(f(5, 'kituzesi_jegyzokonyv.html', doc('Kitűzési jegyzőkönyv', setoutReport(w, p.staked))));
      if (p.measured) files.push(f(5, 'kituzes_meres.txt', cp(p.measured)));
      files.push(...drawing(6, 'kituzesi_vazlat', 'Kitűzési vázlat', p.sketch), ...drawing(7, 'kituzesi_vazrajz', 'Kitűzési vázrajz', p.plan));
      files.push(f(8, 'helyszini_jegyzokonyv.html', doc('Helyszíni jegyzőkönyv', setoutMinutes(w))), ...coordFiles(9));
      if (p.lstAfter) files.push(f(10, 'teruletszamitas.lst', cp(p.lstAfter)));
      files.push(f(11, 'ertesites_kituzesrol.html', doc('Értesítés', workNotice(w))));
      break;
    case 'subdivision':
      files.push(
        f(1, 'adatigenyles.html', doc('Adatigénylés', dataRequest(w))),
        f(1, 'terkepmasolat_megrendelo.html', doc('Térképmásolat megrendelő', mapCopyOrder(w))),
        ...drawing(2, 'valtozasi_vazrajz', 'Változási vázrajz', p.plan),
        ...drawing(3, 'meresi_vazlat', 'Mérési vázlat', p.sketch),
        ...measureFiles(3),
        ...(p.siteplan ? drawing(4, 'telekalakitasi_helyszinrajz', 'Telekalakítási helyszínrajz', p.siteplan) : []),
        ...coordFiles(5),
      );
      if (p.lstBefore) files.push(f(6, 've.lst', cp(p.lstBefore)));
      if (p.lstAfter) files.push(f(6, 'vu.lst', cp(p.lstAfter)));
      if (p.subList) files.push(f(6, 'alreszletek.txt', cp(p.subList)));
      if (p.dat) files.push(f(7, 'DAT.dat', cp(p.dat)));
      files.push(f(8, 'muszaki_leiras.html', doc('Műszaki leírás', technicalReport(w))), f(9, 'zaradekolasi_kerelem.html', doc('Záradékolási kérelem', clauseRequest(w))));
      break;
    case 'building':
      files.push(
        f(1, 'adatigenyles.html', doc('Adatigénylés', dataRequest(w))),
        f(1, 'terkepmasolat_megrendelo.html', doc('Térképmásolat megrendelő', mapCopyOrder(w))),
        ...drawing(2, 'valtozasi_vazrajz', 'Változási vázrajz', p.plan),
        ...drawing(3, 'meresi_vazlat', 'Mérési vázlat', p.sketch),
        ...measureFiles(3),
        ...coordFiles(4),
      );
      if (p.addressList) files.push(f(5, 'cimkoordinatak.txt', cp(p.addressList)));
      if (p.addressSections) files.push(f(5, 'cimkoordinatak.html', doc('Címkoordináták', sectionsPage(w, 'CÍMKOORDINÁTÁK', p.addressSections))));
      if (p.lstAfter) files.push(f(6, 'ellenorzo_teruletszamitas.lst', cp(p.lstAfter)));
      if (p.buildingArea) files.push(f(6, 'epulet_terulete.txt', cp(p.buildingArea)));
      files.push(f(7, 'muszaki_leiras.html', doc('Műszaki leírás', technicalReport(w))), f(8, 'zaradekolasi_kerelem.html', doc('Záradékolási kérelem', clauseRequest(w))));
      if (p.dat) files.push(f(9, 'DAT.dat', cp(p.dat)));
      break;
    case 'landuse':
      files.push(
        f(1, 'adatigenyles.html', doc('Adatigénylés', dataRequest(w))),
        f(1, 'terkepmasolat_megrendelo.html', doc('Térképmásolat megrendelő', mapCopyOrder(w))),
        ...drawing(2, 'valtozasi_vazrajz', 'Változási vázrajz', p.plan),
        ...drawing(3, 'meresi_vazlat', 'Mérési vázlat', p.sketch),
        ...measureFiles(3),
        ...coordFiles(4),
      );
      if (p.lstBefore) files.push(f(5, 've.lst', cp(p.lstBefore)));
      if (p.lstAfter) files.push(f(5, 'vu.lst', cp(p.lstAfter)));
      if (p.subList) files.push(f(5, 'alreszletek.txt', cp(p.subList)));
      if (p.dat) files.push(f(6, 'DAT.dat', cp(p.dat)));
      files.push(f(7, 'muszaki_leiras.html', doc('Műszaki leírás', technicalReport(w))), f(8, 'zaradekolasi_kerelem.html', doc('Záradékolási kérelem', clauseRequest(w))));
      break;
  }
  if (job === 'setout') {
    // a tartalomjegyzék a többi munkarész állományneveivel
    const byFolder: Record<string, string[]> = {};
    for (const x of files) {
      const [dir, name] = x.path.split('/') as [string, string];
      (byFolder[dir] ??= []).push(name);
    }
    byFolder[folder(1)] = [`${pre}_tartalomjegyzek.html`];
    files.unshift(f(1, 'tartalomjegyzek.html', doc('Tartalomjegyzék', tableOfContents(w, byFolder))));
  }
  return files;
}

/** Az összes nyomtatandó oldal egy HTML-ben (a szöveges munkarészek és a rajzok, munkarész-sorrendben). */
export function printAll(p: PackageParts): string {
  const w = p.work;
  const page = (svg: string) => `<div class="page drawing">${svg}</div>`;
  const coords = p.coordSections ? [sectionsPage(w, 'KOORDINÁTAJEGYZÉK', p.coordSections)] : [];
  const record = p.record ? [p.record] : [];
  const docs: Record<JobKind, string[]> = {
    setout: [
      tableOfContents(w),
      dataRequest(w),
      mapCopyOrder(w),
      technicalReport(w),
      ...record,
      ...(p.staked && p.staked.length > 0 ? [setoutReport(w, p.staked)] : []),
      page(p.sketch.svg),
      page(p.plan.svg),
      setoutMinutes(w),
      ...coords,
      workNotice(w),
    ],
    subdivision: [dataRequest(w), mapCopyOrder(w), page(p.plan.svg), page(p.sketch.svg), ...record, ...(p.siteplan ? [page(p.siteplan.svg)] : []), ...coords, technicalReport(w), clauseRequest(w)],
    building: [
      dataRequest(w),
      mapCopyOrder(w),
      page(p.plan.svg),
      page(p.sketch.svg),
      ...record,
      ...coords,
      ...(p.addressSections ? [sectionsPage(w, 'CÍMKOORDINÁTÁK', p.addressSections)] : []),
      technicalReport(w),
      clauseRequest(w),
    ],
    landuse: [dataRequest(w), mapCopyOrder(w), page(p.plan.svg), page(p.sketch.svg), ...record, ...coords, technicalReport(w), clauseRequest(w)],
  };
  return htmlDocument(`${JOBS[w.job].label} – munkarészek`, docs[w.job]);
}
