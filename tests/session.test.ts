import { describe, expect, it } from 'vitest';
import { SESSION_FORMAT, SESSION_PREFIX, SESSION_VERSION, parseSession, sessionEntries, sessionFileName, serializeSession } from '../src/core/session';

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
