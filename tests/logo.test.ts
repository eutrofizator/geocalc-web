import { describe, expect, it } from 'vitest';
import { DEFAULT_LOGO_SVG, coverLogoSrc, logoDataUri } from '../src/core/logo';

describe('az alapértelmezett jelkép (logo.ts)', () => {
  it('önálló, beágyazható SVG (nincs külső hivatkozás és nincs cégnév)', () => {
    expect(DEFAULT_LOGO_SVG.startsWith('<svg')).toBe(true);
    expect(DEFAULT_LOGO_SVG).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(DEFAULT_LOGO_SVG).not.toMatch(/<text|<image|href=|xlink/);
    expect(/GeoCalc|gc35|Kulcsár/i.test(DEFAULT_LOGO_SVG)).toBe(false);
  });

  it('data: URI-t ad, a sortörések nélkül', () => {
    const uri = logoDataUri();
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(uri).not.toContain('\n');
    expect(decodeURIComponent(uri.slice('data:image/svg+xml;charset=utf-8,'.length))).toBe(
      DEFAULT_LOGO_SVG.replace(/\n\s*/g, ''),
    );
  });

  it('logó nélkül az alapértelmezett jelképet adja, logóval a feltöltöttet', () => {
    expect(coverLogoSrc('')).toBe(logoDataUri());
    expect(coverLogoSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
});
