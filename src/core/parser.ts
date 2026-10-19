import { CalcError } from './errors';
import type { Block, BlockLine, Issue, Point, Program } from './types';

/**
 * Egy sor mezőire bontása. A mezőket vessző és/vagy szóköz választhatja el;
 * vesszők között üres mező = hiányzó adat ("6-65, 3092.68, 8273.89 , , 24").
 */
export function splitFields(line: string): string[] {
  const out: string[] = [];
  for (const seg of line.split(',')) {
    const t = seg.trim();
    if (t === '') out.push('');
    else out.push(...t.split(/\s+/));
  }
  return out;
}

/** Üres mező → null, egyébként szám; érvénytelen szövegre hibát dob. */
export function parseNum(token: string | undefined, what: string): number | null {
  if (token === undefined || token.trim() === '') return null;
  const v = Number(token.trim());
  if (!Number.isFinite(v)) throw new CalcError(`Érvénytelen szám (${what}): "${token}"`);
  return v;
}

export function requireNum(token: string | undefined, what: string): number {
  const v = parseNum(token, what);
  if (v === null) throw new CalcError(`Hiányzó adat: ${what}`);
  return v;
}

/** Koordinátasor: pontszám, Y, X, [M], [kód]. */
export function parseCoordLine(text: string, no: number): Point {
  const f = splitFields(text);
  const id = f[0];
  if (!id) throw new CalcError('Hiányzó pontszám a koordinátasorban.', no);
  try {
    return {
      id,
      y: requireNum(f[1], 'Y koordináta'),
      x: requireNum(f[2], 'X koordináta'),
      m: parseNum(f[3], 'magasság'),
      // A régi program a kód nélküli pontot 0-ként tárolja; ez a kimenetben jelleg nélkül jelenik meg.
      code: f[4] && f[4] !== '' ? f[4] : '0',
    };
  } catch (e) {
    if (e instanceof CalcError) throw new CalcError(`${id}: ${e.message}`, no);
    throw e;
  }
}

/** Egyszerű RTF → szöveg átalakítás (a régi programban mentett .gcd állományok RTF-ek lehetnek). */
export function stripRtf(src: string): string {
  if (!/^\s*\{\\rtf/i.test(src)) return src;
  let out = '';
  let depth = 0;
  let skipDepth = -1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === '{') {
      depth++;
      const rest = src.slice(i + 1, i + 14);
      if (skipDepth < 0 && /^\\(\*|fonttbl|colortbl|stylesheet|info)/.test(rest)) skipDepth = depth;
    } else if (c === '}') {
      if (depth === skipDepth) skipDepth = -1;
      depth--;
    } else if (c === '\\') {
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i));
      if (m) {
        if (skipDepth < 0) {
          if (m[1] === 'par' || m[1] === 'line') out += '\n';
          else if (m[1] === 'tab') out += '\t';
        }
        i += m[0].length - 1;
      } else {
        const n = src[i + 1];
        if (n === "'" && /^[0-9a-fA-F]{2}$/.test(src.slice(i + 2, i + 4))) {
          if (skipDepth < 0) out += String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16));
          i += 3;
        } else if (n === '\\' || n === '{' || n === '}') {
          if (skipDepth < 0) out += n;
          i += 1;
        } else if (n === '\n' || n === '\r') {
          if (skipDepth < 0) out += '\n';
          i += 1;
        }
      }
    } else if (skipDepth < 0 && c !== '\r' && c !== '\n') {
      out += c;
    }
  }
  return out;
}

const EXPORT_RE = /^([KUWGALM])>\s*(.*)$/i;

/** Adatsor nélküli kódok: a paraméterek a fejlécben vannak, a blokk a fejléc sorával véget ér (a `;;` elhagyható). */
const NO_BODY = new Set(['TO', 'ZK']);

/** Két listás kódok: a közös pontok után egy második, `;;`-lal lezárt lista következik (az átszámítandó pontok). */
const TWO_PART = new Set(['AF', 'HE']);

/** A bemeneti szöveg szerkezeti elemzése: K_ blokk (koordináták) és a kódolt számítások blokkjai. */
export function parseProgram(source: string): Program {
  const text = stripRtf(source.replace(/^﻿/, ''));
  const rows = text.split(/\r?\n/).map((t, i) => ({ text: t, no: i + 1 }));
  const issues: Issue[] = [];
  const program: Program = { hasHeader: false, kFile: null, hideCoords: false, coordLines: [], blocks: [], issues };

  let i = 0;
  while (i < rows.length && rows[i]!.text.trim() === '') i++;

  const first = rows[i];
  if (first && /^(k|p)_/i.test(first.text.trim())) {
    program.hasHeader = true;
    const rest = first.text.trim().slice(2).trim();
    if (rest) {
      const m = /^(.*?)(?:[\s,]+X)?$/i.exec(rest);
      const hasX = /(^|[\s,])X$/i.test(rest);
      const file = (m?.[1] ?? rest).replace(/[\s,]+$/, '').trim();
      program.hideCoords = hasX;
      if (file && file.toUpperCase() !== 'X') program.kFile = file;
    }
    i++;
    for (; i < rows.length; i++) {
      const r = rows[i]!;
      if (r.text.trim() === ';;') {
        i++;
        break;
      }
      if (r.text.trim() !== '') program.coordLines.push(r as BlockLine);
    }
  } else if (first) {
    issues.push({
      level: 'warning',
      message: 'A bemenő szöveg nem K_ azonosítóval kezdődik; a koordináta-blokk hiányzik.',
      line: first.no,
    });
  }

  while (i < rows.length) {
    const r = rows[i]!;
    const t = r.text.trim();
    if (t === '' || t === ';;') {
      i++;
      continue;
    }
    const exp = EXPORT_RE.exec(t);
    if (exp) {
      program.blocks.push({ code: `${exp[1]!.toUpperCase()}>`, head: exp[2]!.trim(), args: [exp[2]!.trim()], lines: [], no: r.no });
      i++;
      continue;
    }
    const m = /^([^\s,]+)[\s,]*(.*)$/.exec(t);
    const code = m![1]!.toUpperCase();
    const head = m![2]!.trim();
    const block: Block = { code, head, args: head ? splitFields(head) : [], lines: [], no: r.no };
    i++;
    if (NO_BODY.has(code)) {
      program.blocks.push(block);
      continue;
    }
    for (; i < rows.length; i++) {
      const d = rows[i]!;
      const dt = d.text.trim();
      if (dt === ';;') {
        i++;
        break;
      }
      if (dt !== '') block.lines.push({ text: dt, no: d.no });
    }
    if (TWO_PART.has(code)) {
      block.lines2 = [];
      for (; i < rows.length; i++) {
        const d = rows[i]!;
        const dt = d.text.trim();
        if (dt === ';;') {
          i++;
          break;
        }
        if (dt !== '') block.lines2.push({ text: dt, no: d.no });
      }
    }
    program.blocks.push(block);
  }
  return program;
}
