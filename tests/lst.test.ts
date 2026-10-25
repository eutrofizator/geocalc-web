import { describe, expect, it } from 'vitest';
import { writeLst } from '../src/core/lst';

/** Területszámítási lista az ITR .lst szerkezetében (ve.lst / vu.lst). */

describe('ITR .lst területszámítási lista', () => {
  const text = writeLst([
    {
      hrsz: '123/1',
      use: 'kivett, beépítetlen terület',
      ring: [
        { id: '101', y: 650000, x: 240000 },
        { id: '102', y: 650020, x: 240000 },
        { id: '103', y: 650020, x: 240025 },
        { id: '104', y: 650000, x: 240025 },
      ],
    },
  ]);
  const lines = text.split('\r\n');

  it('fejléc: hrsz (művelési ág), a felirat helye', () => {
    expect(lines[0]).toBe('*');
    expect(lines[1]).toBe('123/1 (kivett, beépítetlen terület),\t650010.000\t240012.500');
    expect(lines[2]).toBe('-'.repeat(70));
  });

  it('a kerület az óramutató járásával egyező irányban, zárva, oldalhosszakkal', () => {
    expect(lines.slice(3, 8)).toEqual([
      '                 104\t650000.000\t240025.000',
      '                 103\t650020.000\t240025.000\t    20.000',
      '                 102\t650020.000\t240000.000\t    25.000',
      '                 101\t650000.000\t240000.000\t    20.000',
      '                 104\t650000.000\t240025.000\t    25.000',
    ]);
  });

  it('a terület 6 tizedessel', () => {
    expect(lines[8]).toBe(`**${'-'.repeat(68)}`);
    expect(lines[9]).toBe('     500.000000\t\tAK=0.00');
    expect(text.endsWith('AK=0.00\r\n\r\n')).toBe(true);
  });
});
