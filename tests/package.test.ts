import { describe, expect, it } from 'vitest';
import { clauseRequest, dataRequest, setoutMinutes, technicalReport, workNotice, type WorkData } from '../src/core/documents';
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
    expect(m).toContain('„A kitűzés jelenlétemben megtörtént, a kitűzött határpontokat elfogadom – nem fogadom el.”');
    expect(m).toContain('122 hrsz.:');
    expect(workNotice(work('setout'))).toContain('2026.11.05. 9:00');
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

  it('a telekalakítás csomagja: vázrajz (HTML, SVG, DXF), ve/vu.lst, DAT, dokumentumok', () => {
    const names = buildPackage(parts('subdivision')).map((f) => f.path);
    for (const n of ['02_Változási vázrajz/12_2026_valtozasi_vazrajz.dxf', '05_Területszámítás/12_2026_ve.lst', '05_Területszámítás/12_2026_vu.lst', '06_DAT állomány/12_2026_DAT.dat', '08_Záradékolási kérelem/12_2026_zaradekolasi_kerelem.html'])
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
