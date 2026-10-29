import { describe, expect, it } from 'vitest';
import { clauseRequest, dataRequest, measurementRecord, parseOwners, setoutMinutes, setoutReport, technicalReport, workNotice, type RecordRow, type WorkData } from '../src/core/documents';
import { JOBS, type JobKind } from '../src/core/jobs';
import { decodeText, readZip } from '../src/core/land-office';
import { buildPackage, printAll, type PackageParts } from '../src/core/package';
import { crc32, writeZip } from '../src/core/zip-writer';

/** A leadandó munkarészek: dokumentumok (8/2018. AM rendelet 1., 3., 25., 29., 30. melléklet) és a csomag. */

const work = (job: JobKind): WorkData => ({
  job,
  keszito: 'Minta Földmérő Kft.',
  szekhely: '1111 Budapest, Minta u. 1.',
  munkaszam: '12/2026',
  telepules: 'Mintafalva',
  fekves: 'belterület',
  iktatoszam: '700/1/2026',
  hrsz: ['123', '123/1', '123/2'],
  szomszedok: '122, 124',
  megbizo: 'Minta Megrendelő',
  megbizoCim: '2222 Mintafalva, Fő u. 2.',
  hivatal: 'Minta Vármegyei Kormányhivatal',
  ugyfelkod: 'U-1',
  okmany: '',
  statisztikai: '',
  email: 'iroda@minta.hu',
  igazolvany: '1234',
  minosites: 'IRF-56',
  minosegtanusito: 'Minta Mérnök',
  muszer: 'FOIF RTS102',
  gyariszam: 'A123',
  leiras: '',
  feljegyzes: '',
  megjeloles: 'fakaróval',
  idopont: '2026.11.05. 9:00',
  hely: 'Budapest,',
  datum: '2026.10.25.',
  adatallomany: 'proba_valtozas',
});

const parts = (job: JobKind): PackageParts => ({
  work: work(job),
  plan: { svg: '<svg>VÁZRAJZ</svg>', dxf: '0\r\nEOF\r\n' },
  sketch: { svg: '<svg>VÁZLAT</svg>', dxf: '0\r\nEOF\r\n' },
  dat: 'GEOK_DAT*proba**-*-*-*20261025*GEOkalkulus 1.0*2015.07.01 1.1*\r\n',
  lstBefore: '*\r\n',
  lstAfter: '*\r\n',
  coordList: 'Pontszám\tY\tX\tZ\tPontkód\r\n',
  addressList: '123/1\tC1\t650000\t240000\t5411',
  measured: '101 650000 240000',
  subList: '123/1\ta\tkivett\t600',
  siteplan: job === 'subdivision' ? { svg: '<svg>HELYSZÍNRAJZ</svg>', dxf: '0\r\nEOF\r\n' } : undefined,
  coordSections: [{ kind: 'coord-list-detail', title: 'Koordinátajegyzék', columns: ['Pontszám', 'Y [m]', 'X [m]'], rows: [{ cells: ['101', '650000.00', '240000.00'], role: 'result' }] }],
  raw: { name: 'proba.MES', text: 'A,1\r\n' },
  record: '<div class="page">MÉRÉSI JEGYZŐKÖNYV</div>',
  staked: [{ id: '101', planY: 650000, planX: 240000, y: 650000.02, x: 240000.01 }],
});

describe('dokumentumok', () => {
  it('adatigénylő lap (1. melléklet)', () => {
    const h = dataRequest(work('subdivision'));
    for (const s of ['INGATLAN-NYILVÁNTARTÁSI CÉLRA', 'Ügyfélkód', 'földmérő igazolvány: 1234', '123, 123/1, 123/2', 'csak hitelesítve szolgáltathatók']) expect(h).toContain(s);
  });
  it('műszaki leírás (29. melléklet) a munka fajtája szerinti leírással', () => {
    const h = technicalReport(work('setout'));
    expect(h).toContain('MŰSZAKI LEÍRÁS');
    expect(h).toContain('FOIF RTS102');
    expect(h).toContain('fakaróval jelöltem meg');
  });
  it('záradékolási kérelem (30. melléklet), helyszíni jegyzőkönyv (25.), értesítés', () => {
    expect(clauseRequest(work('building'))).toContain('Tisztelt Minta Vármegyei Kormányhivatal!');
    expect(clauseRequest(work('building'))).toContain('épület feltüntetésével összefüggő változási vázrajz');
    const m = setoutMinutes(work('setout'));
    expect(m).toContain('A kitűzés jelenlétemben megtörtént, a kitűzött határpontokat elfogadom* – nem fogadom el*.');
    expect(m).toContain('122 hrsz.:');
    expect(m).toContain('* A megfelelő rész aláhúzandó!');
    expect(workNotice(work('setout'))).toContain('2026.11.05. 9:00');
  });

  it('a tulajdonosok: a helyszíni jegyzőkönyvben név szerint, értesítés tulajdonosonként', () => {
    const w = {
      ...work('setout'),
      hrsz: ['124'],
      tulajdonosok: ['# név ; lakcím ; hrsz', 'Kiss Anna ; 1111 Kisváros, Fő u. 1. ; 124', 'Nagy Béla ; 1111 Kisváros, Fő u. 3. ; 125'].join('\n'),
      helyszin: 'Kisváros, Fő u. 1.',
      telefon: '+36 30 000 0000',
    };
    expect(parseOwners(w.tulajdonosok)).toEqual([
      { name: 'Kiss Anna', address: '1111 Kisváros, Fő u. 1.', hrsz: '124' },
      { name: 'Nagy Béla', address: '1111 Kisváros, Fő u. 3.', hrsz: '125' },
    ]);
    const m = setoutMinutes(w);
    expect(m).toMatch(/A kitűzött földrészlet tulajdonosa \(képviselője\)<\/th><td>Kiss Anna</);
    expect(m).toContain('Nagy Béla (125 hrsz.):');
    const n = workNotice(w);
    expect(n.match(/<div class="page">/g)).toHaveLength(2);
    for (const s of ['Tisztelt Kiss Anna!', 'Tisztelt Nagy Béla!', '6. § (4)', 'Kisváros, Fő u. 1.', '+36 30 000 0000', 'kitűzési munkálatait elvégezzük']) expect(n).toContain(s);
  });

  it('kitűzési jegyzőkönyv: terv és kitűzött koordináta, eltérés', () => {
    const h = setoutReport(work('setout'), [{ id: '105', planY: 650190.4, planX: 241242.05, y: 650190.43, x: 241242.01 }]);
    for (const s of ['KITŰZÉSI JEGYZŐKÖNYV', '>105<', '>0.030<', '>-0.040<', '>0.050<', 'a legnagyobb eltérés: 0.050 m']) expect(h).toContain(s);
  });

  it('mérési jegyzőkönyv a nyers mérésből: álláspontonként', () => {
    const rows: RecordRow[] = [
      { kind: 'station', id: '1', hz: null, zi: null, tf: null, tv: null, mj: null, mm: 1.56, code: '', tvet: null, dm: null },
      { kind: 'obs', id: '105', hz: 158.5, zi: 90.25, tf: 20.43, tv: 20.428, mj: 1.55, mm: null, code: 'HP', tvet: 20.427, dm: 0.056 },
    ];
    const h = measurementRecord(work('setout'), rows, 'proba.MES', (d) => d.toFixed(4));
    for (const s of ['MÉRÉSI JEGYZŐKÖNYV KITŰZÉSRŐL', 'Álláspont: 1 (műszermagasság = 1.560)', '>158.5000<', '>20.428<', '>HP<', 'proba.MES', 'EOV']) expect(h).toContain(s);
  });

  it('mérési jegyzőkönyv: tájékozás és poláris részletpontok álláspontonként', () => {
    const h = measurementRecord(work('setout'), [], '–', (d) => d.toFixed(4), {
      orientation: [
        {
          station: '101',
          source: 'known',
          y: 650000,
          x: 240000,
          z: 10,
          m0: 4.2,
          rows: [{ id: '1001', hz: 35, bearing: 45, z: 10, v: 3, e: 0.3, dist: 20, dd: 0.001 }],
          freeCheck: { dy: 0.001, dx: -0.002 },
          points: [{ id: '2001', y: 649994.87, x: 239985.9, dist: 15, dy: 0.002, dx: null }],
        },
      ],
    });
    for (const s of ['Tájékozás – álláspont: 101', 'ismert koordináta', '>10.0000<', '± 4.2″', 'Ellenőrzés szabad álláspontként', 'Részletpontok számítása – álláspont: 101', '>2001<', '>649994.870<'])
      expect(h).toContain(s);
  });

  it('mérési jegyzőkönyv GNSS-mérésről: alappontok a jelükkel, mért pontok koordinátái', () => {
    const h = measurementRecord(work('setout'), [], '–', (d) => d.toFixed(4), {
      bases: [{ id: '1001', y: 650100.31, x: 241278.359, m: 109.841 }],
      points: [{ id: '5001', y: 650106.548, x: 241281.398, m: null }],
    });
    for (const s of ['Felhasznált alappontok', '>1001<', '>650100.310<', '>109.841<', '<svg', 'JKDATA22', 'Mért pontok koordinátái', '>5001<']) expect(h).toContain(s);
    expect(h).not.toContain('Nincs beolvasott nyers mérés');
  });
});

describe('a leadandó csomag', () => {
  for (const job of ['setout', 'subdivision', 'building', 'landuse'] as JobKind[])
    it(`${JOBS[job].label}: a mappák a munka sorrendjében, minden mappában munkarész`, () => {
      const files = buildPackage(parts(job));
      const folders = [...new Set(files.map((f) => f.path.split('/')[0]))];
      expect(folders).toEqual(JOBS[job].folders);
      expect(files.every((f) => f.path.split('/')[1]!.startsWith('12_2026_'))).toBe(true);
    });

  it('a telekalakítás csomagja: vázrajz (HTML, SVG, DXF), helyszínrajz, ve/vu.lst, DAT, dokumentumok', () => {
    const names = buildPackage(parts('subdivision')).map((f) => f.path);
    for (const n of [
      '02_Változási vázrajz/12_2026_valtozasi_vazrajz.dxf',
      '04_Telekalakítási helyszínrajz/12_2026_telekalakitasi_helyszinrajz.html',
      '05_Koordináta jegyzék/12_2026_koordinatajegyzek.csv',
      '05_Koordináta jegyzék/12_2026_koordinatajegyzek.html',
      '06_Területszámítás/12_2026_ve.lst',
      '06_Területszámítás/12_2026_vu.lst',
      '07_DAT állomány/12_2026_DAT.dat',
      '09_Záradékolási kérelem/12_2026_zaradekolasi_kerelem.html',
    ])
      expect(names).toContain(n);
  });

  it('a kitűzés csomagja: mérési és kitűzési jegyzőkönyv, nyers mérés, tartalomjegyzék az állománynevekkel', () => {
    const files = buildPackage(parts('setout'));
    const names = files.map((f) => f.path);
    for (const n of ['05_Mérési jegyzőkönyv/12_2026_meresi_jegyzokonyv.html', '05_Mérési jegyzőkönyv/12_2026_proba.MES', '05_Mérési jegyzőkönyv/12_2026_kituzesi_jegyzokonyv.html', '11_Értesítés kitűzési munkavégzésről/12_2026_ertesites_kituzesrol.html'])
      expect(names).toContain(n);
    const toc = files.find((f) => f.path.endsWith('tartalomjegyzek.html'))!.data as string;
    expect(toc).toContain('12_2026_kituzesi_vazrajz.dxf');
    expect(toc).toContain('Munkarész adatállományai');
  });

  it('épületfeltüntetés: címkoordináta és koordinátajegyzék nyomtathatóan, az épület területe', () => {
    const names = buildPackage({ ...parts('building'), buildingArea: 'Terület: 131.996 m²', addressSections: [{ kind: 'a', title: 'Címkoordináták', columns: ['Hrsz'], rows: [{ cells: ['123/1'], role: 'result' }] }] }).map((f) => f.path);
    for (const n of ['05_Címkoordináta/12_2026_cimkoordinatak.html', '06_Ellenőrző területszámítás/12_2026_epulet_terulete.txt', '04_Koordinátajegyzék/12_2026_koordinatajegyzek.html'])
      expect(names).toContain(n);
  });

  it('a ZIP visszaolvasható, az ékezetes mappanevekkel', async () => {
    const files = buildPackage(parts('building'));
    const zip = writeZip(files);
    const back = await readZip(zip.buffer);
    expect(back.map((f) => f.name)).toEqual(files.map((f) => f.path));
    expect(decodeText(back.find((f) => f.name.endsWith('DAT.dat'))!.data)).toContain('GEOK_DAT');
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('az összes munkarész egy nyomtatásban', () => {
    const h = printAll(parts('setout'));
    expect(h).toContain('TARTALOMJEGYZÉK');
    expect(h).toContain('VÁZLAT');
    expect(h).toContain('HELYSZÍNI JEGYZŐKÖNYV');
  });
});
