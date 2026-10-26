import { describe, expect, it } from 'vitest';
import { SESSION_FORMAT, SESSION_PREFIX, SESSION_VERSION, newJobChanges, parseSession, sessionEntries, sessionFileName, serializeSession } from '../src/core/session';

const saved = '2026-10-19T14:00:00.000Z';

describe('munkamenet (.gcs)', () => {
  it('a program saját kulcsait gyűjti ki, rendezve', () => {
    const entries = sessionEntries({
      'geocalc-web.draft': 'IT\n1 2 3\n;;',
      'mas.program': 'x',
      'geocalc-web.network': '{}',
    });
    expect(Object.keys(entries)).toEqual(['geocalc-web.draft', 'geocalc-web.network']);
    expect(entries['mas.program']).toBeUndefined();
  });

  it('mentés és betöltés körbe jár', () => {
    const text = serializeSession({ 'geocalc-web.draft': 'kód', 'geocalc-web.transform': '{"twoD":false}' }, saved);
    const parsed = parseSession(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.format).toBe(SESSION_FORMAT);
    expect(parsed.file.version).toBe(SESSION_VERSION);
    expect(parsed.file.saved).toBe(saved);
    expect(parsed.file.program).toBe('GEOkalkulus 1.0');
    expect(parsed.entries).toHaveLength(2);
    expect(Object.fromEntries(parsed.entries)['geocalc-web.draft']).toBe('kód');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('idegen és hibás fájlra magyar nyelvű hibát ad', () => {
    const cases: [string, RegExp][] = [
      ['ez nem json', /JSON/],
      ['[]', /szerkezete/],
      ['{"format":"más"}', /nem GEOkalkulus 1.0 munkamenet-fájl/],
      [`{"format":"${SESSION_FORMAT}","version":${SESSION_VERSION + 1},"data":{}}`, /újabb programváltozásból/],
      [`{"format":"${SESSION_FORMAT}","version":1}`, /érvényes adatrész/],
      [`{"format":"${SESSION_FORMAT}","version":1,"data":{"${SESSION_PREFIX}x":7}}`, /nem szöveg/],
      [`{"format":"${SESSION_FORMAT}","version":1,"data":{"mas.program":"x"}}`, /nem tartalmaz mentett munkalapot/],
    ];
    for (const [text, re] of cases) {
      const parsed = parseSession(text);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error).toMatch(re);
    }
  });

  it('idegen kulcsot a betöltés kihagy, a hibás értéket jelzi', () => {
    const text = JSON.stringify({ format: SESSION_FORMAT, version: 1, saved, program: '', data: { 'mas.program': 'x', [`${SESSION_PREFIX}a`]: '1' } });
    const parsed = parseSession(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.entries).toEqual([[`${SESSION_PREFIX}a`, '1']]);
  });

  it('a fájlnév a mentés napját tartalmazza', () => {
    expect(sessionFileName(saved)).toBe('munkamenet-2026-10-19.gcs');
  });
});

describe('új munka', () => {
  const P = SESSION_PREFIX;
  const all: Record<string, string> = {
    [`${P}theme`]: 'dark',
    [`${P}lang`]: 'hu',
    [`${P}draft`]: 'PO 1 2',
    [`${P}transform`]: '{"points":"1 2 3"}',
    [`${P}exchange-file`]: '[{"id":"1"}]',
    [`${P}recorder`]: JSON.stringify({ recorder: 'gsi', k: 0.13, drafts: [{ no: '1' }] }),
    [`${P}cover`]: JSON.stringify({ keszitette: 'Minta Geodézia Kft.', munkanev: 'Fő utca 12.', msz: '2026/41', telepules: 'Kisváros', logo: 'data:x' }),
    [`${P}parcel`]: JSON.stringify({
      coords: '101 1 2',
      before: '123 ; 100 ; 101',
      after: '123 ; 101',
      owners: 'Kiss Anna ; Kisváros ; 123',
      raw: { name: 'a.mes', text: 'x' },
      annex: 8,
      job: 'setout',
      fees: { on: true },
      plan: { szekhely: '1111 Budapest', iktatoszam: '41/2026', igazolvany: 'G-1', hely: 'Kisváros', drawing: 'felirat ; x' },
      work: { megbizo: 'Kiss Anna', muszer: 'FOIF RTS102', ugyfelkod: '9', helyszin: 'Fő u. 12.' },
    }),
    'mas-program.adat': 'marad',
  };
  const ch = newJobChanges(all);

  it('a beállításokat és a más programok kulcsait nem bántja', () => {
    expect(`${P}theme` in ch).toBe(false);
    expect(`${P}lang` in ch).toBe(false);
    expect('mas-program.adat' in ch).toBe(false);
  });

  it('a mintapéldát betöltő munkalapokra üres értéket ír, a többit törli', () => {
    expect(ch[`${P}draft`]).toBe('');
    expect(ch[`${P}transform`]).toBeNull();
    expect(ch[`${P}exchange-file`]).toBeNull();
  });

  it('a műszerbeállítás és a készítő megmarad, a mérés és a munka adatai törlődnek', () => {
    expect(JSON.parse(ch[`${P}recorder`]!)).toEqual({ recorder: 'gsi', k: 0.13, drafts: [] });
    expect(JSON.parse(ch[`${P}cover`]!)).toEqual({ keszitette: 'Minta Geodézia Kft.', logo: 'data:x' });
  });

  it('a változási vázrajz munkaadatai törlődnek, a vállalkozó adatai maradnak', () => {
    const p = JSON.parse(ch[`${P}parcel`]!);
    expect(p).toMatchObject({ coords: '', before: '', after: '', owners: '', raw: null, annex: 8, job: 'setout' });
    expect(p.fees).toBeUndefined();
    expect(p.plan).toEqual({ szekhely: '1111 Budapest', igazolvany: 'G-1', hely: 'Kisváros' });
    expect(p.work).toEqual({ muszer: 'FOIF RTS102' });
  });

  it('másodszor futtatva már nincs mit változtatni', () => {
    const after = { ...all };
    for (const [k, v] of Object.entries(ch)) {
      if (v === null) delete after[k];
      else after[k] = v;
    }
    const again = newJobChanges(after);
    expect(Object.keys(again).filter((k) => again[k] !== '')).toEqual([]);
  });
});
