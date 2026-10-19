import { describe, expect, it } from 'vitest';
import { toPyx, toPyx2 } from '../src/core/export';
import type { Point } from '../src/core/types';

/**
 * A várt értékek a valódi GeoCalc 3.5 kimeneti állományaiból másolt sorok:
 *   Pelda/Szamitasok/ek.PYX, ek.PYX2   (magasság és kód nélkül, kiszámított pont)
 *   Névtelen.PYX, Névtelen.PYX2        (magassággal és "ko" jelleggel)
 * Ezért ezek a tesztek a régi program formátumát rögzítik, nem a sajátunkat.
 */
const p = (id: string, y: number, x: number, m: number | null, code = ''): Point => ({ id, y, x, m, code });

const lines = (s: string) => s.split('\r\n').slice(0, -1);

describe('.PYX – a GeoCalc 3.5 fix szélességű kimenete', () => {
  it('EK minta: jelleg nélkül minden sor pontosan 48 karakter', () => {
    const got = lines(
      toPyx([p('1', 3817.292, 7339.727, 0), p('5', 2852.34, 6562.88, 0), p('6/1', 3309.81, 8372.85, 0)]),
    );
    expect(got).toEqual([
      '1              3817.292    7339.727       0.000 ',
      '5              2852.340    6562.880       0.000 ',
      '6/1            3309.810    8372.850       0.000 ',
    ]);
    for (const l of got) expect(l).toHaveLength(48);
  });

  it('a magasság és a jelleg meghosszabbítja a sort, de a törzs 48 karakter marad', () => {
    const got = lines(toPyx([p('1', 590543.33, 209686.71, 273.09, 'ko'), p('10', 590623.12, 209798.94, 264.12, 'ko')]));
    expect(got).toEqual([
      '1            590543.330  209686.710     273.090 ko',
      '10           590623.120  209798.940     264.120 ko',
    ]);
    // a jelleg előtti rész mindig 48 karakter
    for (const l of got) expect(l.slice(0, 48)).toHaveLength(48);
    expect(got[0]!.slice(48)).toBe('ko');
  });

  it('a pontszám rendezése szöveges, ahogy a régi program teszi', () => {
    const got = lines(toPyx([p('10', 1, 1, 0), p('1', 2, 2, 0), p('1001', 3, 3, 0)]));
    expect(got.map((l) => l.trimStart().split(/\s+/)[0])).toEqual(['1', '10', '1001']);
  });

  it('magasság nélküli pont 0.000-ként jelenik meg', () => {
    expect(lines(toPyx([p('7', 4606.76, 8451.54, null)]))[0]).toBe(
      '7              4606.760    8451.540       0.000 ',
    );
  });
});

describe('.PYX2 – a `K>` direktíva vesszős kimenete', () => {
  it('EK minta: üres jelleg, az utolsó oszlop a számított pont jelzője', () => {
    const got = lines(
      toPyx2(
        [p('1', 3817.292, 7339.727, 0), p('5', 2852.34, 6562.88, 0)],
        new Set(['1']),
      ),
    );
    expect(got).toEqual(['1, 3817.292, 7339.727, 0.000, , 1', '5, 2852.340, 6562.880, 0.000, , 0']);
  });

  it('a pont kódja jellegként kerül ki', () => {
    const got = lines(toPyx2([p('1', 590543.33, 209686.71, 273.09, 'ko')], new Set()));
    expect(got).toEqual(['1, 590543.330, 209686.710, 273.090, ko, 0']);
  });

  it('a kód nélküli pont belső 0 kódja nem kerül ki jellegként', () => {
    const got = lines(toPyx2([p('2', 100, 0, 0, '0')], new Set(['2'])));
    expect(got).toEqual(['2, 100.000, 0.000, 0.000, , 1']);
    expect(lines(toPyx([p('2', 100, 0, 0, '0')]))[0]).toHaveLength(48);
  });
});
