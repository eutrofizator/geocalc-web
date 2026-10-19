import { CalcError } from './errors';
import { formatFor, toPyx, toPyx2, withExtension } from './export';
import { coordsSection } from './format';
import { HANDLERS } from './modules';
import { parseCoordLine, parseProgram } from './parser';
import type { Context, Issue, Point, Section } from './types';

export interface RunOptions {
  /** Betöltött koordináta-állományok: kisbetűs fájlnév → tartalom (a K_ sorban megadott névhez). */
  files?: Record<string, string>;
}

export interface ExportFile {
  name: string;
  content: string;
  /** A formátum leírása (a felületen tájékoztatásul). */
  note?: string;
}

export interface RunResult {
  sections: Section[];
  issues: Issue[];
  /** A futás során kiszámított pontok. */
  computed: Point[];
  /** Az összes pont (ismert + számított). */
  points: Point[];
  /** Az új koordináta-rendszerbe átszámított pontok (AF, HE). */
  transformed: Point[];
  exports: ExportFile[];
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function createContext(): Context {
  const issues: Issue[] = [];
  const points = new Map<string, Point>();
  const computed = new Map<string, Point>();
  return {
    points,
    computed,
    zk: new Map(),
    areas: [],
    transformed: [],
    issues,
    getPoint(id, line) {
      const p = points.get(id);
      if (!p) throw new CalcError(`Ismeretlen pont: ${id}`, line);
      return p;
    },
    getZk(id) {
      return this.zk.get(id) ?? 0;
    },
    setPoint(p) {
      points.set(p.id, p);
      computed.set(p.id, p);
    },
  };
}

/**
 * Egy teljes bemeneti szöveg feldolgozása. A függvény tiszta: minden hívás friss állapotból indul,
 * így két futás eredménye sosem keveredhet össze, és a program újraindítása sem szükséges.
 */
export function run(source: string, options: RunOptions = {}): RunResult {
  const program = parseProgram(source);
  const ctx = createContext();
  ctx.issues.push(...program.issues);
  const sections: Section[] = [];
  const exports: ExportFile[] = [];
  const known: Point[] = [];

  const addKnown = (p: Point) => {
    if (ctx.points.has(p.id)) {
      ctx.issues.push({ level: 'warning', message: `A(z) ${p.id} pont többször szerepel, az utolsó adat érvényes.` });
      const i = known.findIndex((k) => k.id === p.id);
      if (i >= 0) known.splice(i, 1);
    }
    ctx.points.set(p.id, p);
    known.push(p);
  };

  if (program.kFile) {
    const key = baseName(program.kFile).toLowerCase();
    const content = options.files?.[key];
    if (content === undefined) {
      ctx.issues.push({
        level: 'warning',
        message: `A(z) „${baseName(program.kFile)}” koordináta-állomány nincs betöltve. Töltsd fel a Koordináta-állományok részen.`,
        line: 1,
      });
    } else {
      content.split(/\r?\n/).forEach((text, i) => {
        if (text.trim() === '' || text.trim() === ';;') return;
        try {
          addKnown(parseCoordLine(text, i + 1));
        } catch (e) {
          if (!(e instanceof CalcError)) throw e;
          // A sorszám a koordináta-állományra vonatkozik, nem a szerkesztőre, ezért az üzenetbe kerül.
          ctx.issues.push({ level: 'error', message: `${baseName(program.kFile!)}, ${e.line}. sor: ${e.message}` });
        }
      });
    }
  }
  for (const l of program.coordLines) {
    try {
      addKnown(parseCoordLine(l.text, l.no));
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      ctx.issues.push({ level: 'error', message: e.message, line: e.line });
    }
  }
  if (program.hasHeader && !program.hideCoords && known.length > 0) sections.push(coordsSection(known));

  for (const block of program.blocks) {
    const code = block.code;
    const format = formatFor(code);
    if (format) {
      const all = [...ctx.points.values()];
      const raw = baseName(block.args[0] || `koordinatak${format.ext}`);
      exports.push({
        name: withExtension(raw, format.ext, code === 'A>'),
        content: format.write(all, new Set(ctx.computed.keys())),
        note: format.note,
      });
      continue;
    }
    const handler = HANDLERS[code];
    if (!handler) {
      ctx.issues.push({ level: 'error', message: `Ismeretlen számítási kód: ${code}`, line: block.no });
      continue;
    }
    try {
      sections.push(...handler(ctx, block));
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      ctx.issues.push({ level: 'error', message: `${code}: ${e.message}`, line: e.line ?? block.no });
    }
  }

  const computed = [...ctx.computed.values()];
  const points = [...ctx.points.values()];
  if (computed.length > 0) {
    const ids = new Set(computed.map((p) => p.id));
    exports.push({ name: 'eredmeny.PYX', content: toPyx(points) }, { name: 'eredmeny.PYX2', content: toPyx2(points, ids) });
  }
  if (ctx.transformed.length > 0) exports.push({ name: 'eredmeny.TTR', content: toPyx(ctx.transformed) });
  return { sections, issues: ctx.issues, computed, points, transformed: ctx.transformed, exports };
}
