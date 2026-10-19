import { CalcError } from './core/errors';
import {
  POINT_KINDS,
  checkRegister,
  formatGeographic,
  kindMeta,
  parseGeographic,
  registerToGeoCalcDb,
  registerToGeographicText,
  registerToPyx,
  type PointKind,
  type RegisterRow,
} from './core/coords-file';
import { fix } from './core/format';
import { parseCoordLine } from './core/parser';
import type { Row, Section } from './core/types';
import { downloadReport, onMeta, renderCover } from './report-view';
import { $, download, el, readText, renderSection, storage } from './ui';

/**
 * Az Adatcsere/Koordináta állomány készítése munkalap (súgó 74. o.).
 *
 * Kézzel begépelt pontok jegyzéke. A pontok típusa oszlopban a szokásos Y, X, M; az X, Y, Z
 * (geocentrikus) vagy a földrajzi koordináták formában adhatók meg, a jegyzék pedig GeoCalc
 * formátumú adatbázisban menthető.
 */

const STORAGE_KEY = 'geocalc-web.exchange-file';
const XF_TITLE = 'KOORDINÁTA ÁLLOMÁNY KÉSZÍTÉSE';

/** A szerkesztés közbeni sor: a beírt szöveget tárolja, hogy a gépelés ne vesszen el. */
interface RowDraft {
  id: string;
  kind: PointKind;
  a: string;
  b: string;
  c: string;
}

const draft = (id = '', kind: PointKind = 'yxm'): RowDraft => ({ id, kind, a: '', b: '', c: '' });

export function initExchangeFileView(): void {
  const body = $<HTMLTableSectionElement>('xf-body');
  const status = $('xf-status');
  const issues = $('xf-issues');
  const preview = $('xf-preview');
  const downloads = $('xf-downloads');
  const count = $('xf-count');

  let rows: RowDraft[] = [draft('1')];
  let timer: number | undefined;

  const kindSelect = (value: PointKind, onChange: (v: PointKind) => void): HTMLSelectElement => {
    const sel = el('select', 'xf-kind');
    for (const k of POINT_KINDS) sel.append(new Option(k.label, k.kind));
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value as PointKind));
    return sel;
  };

  const cell = (value: string, placeholder: string, onInput: (v: string) => void): HTMLInputElement => {
    const i = el('input', 'xf-cell');
    i.type = 'text';
    i.autocomplete = 'off';
    i.value = value;
    i.placeholder = placeholder;
    i.addEventListener('input', () => onInput(i.value));
    return i;
  };

  /** A sor aktuális oszlopnevei. */
  const labels = (r: RowDraft) => kindMeta(r.kind).columns;

  const updateHeaders = () => {
    const first = rows[0];
    const allSame = first !== undefined && rows.every((r) => r.kind === first.kind);
    const cols = allSame ? labels(first) : ['1. koordináta', '2. koordináta', '3. koordináta'];
    $('xf-h1').textContent = cols[0]!;
    $('xf-h2').textContent = cols[1]!;
    $('xf-h3').textContent = cols[2]!;
  };

  const render = () => {
    body.replaceChildren();
    rows.forEach((r, i) => {
      const tr = el('tr');
      const tdId = el('td');
      tdId.append(
        cell(r.id, 'pl. 101', (v) => {
          r.id = v;
          schedule();
        }),
      );
      const tdKind = el('td');
      tdKind.append(
        kindSelect(r.kind, (v) => {
          r.kind = v;
          render();
          schedule();
        }),
      );
      const cols = labels(r);
      const tds = [0, 1, 2].map((k) => {
        const td = el('td');
        const key = (['a', 'b', 'c'] as const)[k]!;
        const ph = r.kind === 'geo' ? (k < 2 ? 'pl. 19.182231643' : 'pl. 145.000') : (cols[k] ?? '');
        td.append(
          cell(r[key], ph, (v) => {
            r[key] = v;
            schedule();
          }),
        );
        return td;
      });
      const tdDel = el('td');
      const del = el('button', 'glyph', '×');
      del.type = 'button';
      del.title = 'A sor törlése';
      del.addEventListener('click', () => {
        rows.splice(i, 1);
        if (rows.length === 0) rows.push(draft());
        render();
        schedule();
      });
      tdDel.append(del);
      tr.append(tdId, tdKind, ...tds, tdDel);
      body.append(tr);
    });
    updateHeaders();
  };

  /** A szerkesztett sorok értelmezése. Hibás bevitelnél CalcError-t dob. */
  const toRegister = (): RegisterRow[] =>
    rows.map((r, i) => {
      const no = i + 1;
      const num = (text: string, what: string): number | null => {
        if (text.trim() === '') return null;
        if (r.kind === 'geo') {
          try {
            return parseGeographic(text);
          } catch {
            throw new CalcError(`${no}. sor (${r.id || '?'}): érvénytelen ${what}: „${text}”.`);
          }
        }
        const v = Number(text.trim().replace(',', '.'));
        if (!Number.isFinite(v)) throw new CalcError(`${no}. sor (${r.id || '?'}): érvénytelen ${what}: „${text}”.`);
        return v;
      };
      const cols = labels(r);
      return {
        id: r.id.trim(),
        kind: r.kind,
        a: num(r.a, cols[0]!),
        b: num(r.b, cols[1]!),
        c: num(r.c, cols[2]!),
      };
    });

  const sectionOfRows = (parsed: RegisterRow[]): Section => {
    const cols = [...new Set(parsed.map((r) => r.kind))];
    const sameKind = cols.length <= 1;
    const labelsAll = sameKind ? kindMeta(cols[0] ?? 'yxm').columns : ['1.', '2.', '3.'];
    return {
      kind: 'xf-rows',
      title: 'A jegyzék pontjai',
      columns: ['Pontszám', 'Típus', ...labelsAll],
      rows: parsed.map<Row>((r) => {
        const d = kindMeta(r.kind).decimals;
        return {
          cells: [
            r.id,
            kindMeta(r.kind).label,
            r.a === null ? '' : r.kind === 'geo' ? formatGeographic(r.a) : fix(r.a, d[0]),
            r.b === null ? '' : r.kind === 'geo' ? formatGeographic(r.b) : fix(r.b, d[1]),
            r.c === null ? '' : fix(r.c, d[2]),
          ],
          role: 'base',
        };
      }),
      footer: [`${parsed.length} pont. Földrajzi értékeknél a bevitel „áldecimális” alakú (19.182231643 = 19°18′22.31643″).`],
    };
  };

  const sectionOfDb = (text: string): Section => ({
    kind: 'xf-db',
    title: 'GeoCalc adatbázis formátuma (pontszám, majd a típus szerinti három koordináta)',
    columns: ['Sor'],
    rows: text
      .split('\r\n')
      .filter((l) => l !== '')
      .map<Row>((l) => ({ cells: [l], role: 'base' })),
  });

  const compute = () => {
    window.clearTimeout(timer);
    issues.replaceChildren();
    preview.replaceChildren();
    downloads.replaceChildren();
    status.textContent = '';
    storage.set(STORAGE_KEY, JSON.stringify(rows));
    count.textContent = `${rows.length} sor`;
    try {
      const parsed = toRegister();
      const problems = checkRegister(parsed);
      for (const p of problems) {
        const row = el('div', 'issue warning');
        row.append(el('span', 'tag', 'Figyelem'), el('span', undefined, p));
        issues.append(row);
      }
      preview.append(renderSection(sectionOfRows(parsed)));
      const db = registerToGeoCalcDb(parsed);
      if (db !== '') preview.append(renderSection(sectionOfDb(db)));
      preview.prepend(renderCover(XF_TITLE));
      const ok = problems.length === 0;
      status.textContent =
        `Kiszámítva ${new Date().toLocaleTimeString('hu-HU')} · ${parsed.length} pont` + (ok ? '' : ` · ${problems.length} megjegyzés`);
      const b = el('button', undefined, 'GeoCalc adatbázis (.pyx2)');
      b.type = 'button';
      b.disabled = !ok;
      b.addEventListener('click', () => download('koordinatak.pyx2', db));
      downloads.append(b);
      const p = el('button', undefined, '.PYX (fix szélességű)');
      p.type = 'button';
      p.addEventListener('click', () => {
        try {
          download('koordinatak.pyx', registerToPyx(parsed));
        } catch (e) {
          showIssue(e instanceof Error ? e.message : String(e));
        }
      });
      downloads.append(p);
      const g = el('button', undefined, 'Földrajzi (szöveges)');
      g.type = 'button';
      g.addEventListener('click', () => download('koordinatak_foldrajzi.txt', registerToGeographicText(parsed)));
      downloads.append(g);
      const j = el('button', undefined, 'Jegyzőkönyv (.txt)');
      j.type = 'button';
      j.addEventListener('click', () => downloadReport('koordinata_allomany.txt', XF_TITLE, [sectionOfRows(parsed), sectionOfDb(db)]));
      downloads.append(j);
    } catch (e) {
      if (e instanceof CalcError) showIssue(e.message);
      else showIssue(`A feldolgozás nem futott le: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const showIssue = (message: string) => {
    const row = el('div', 'issue error');
    row.append(el('span', 'tag', 'Hiba'), el('span', undefined, message));
    issues.append(row);
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(compute, 300);
  };

  $('xf-add').addEventListener('click', () => {
    const last = rows[rows.length - 1];
    const nextNo = rows.length === 0 ? '1' : String(Number(last?.id) + 1 || rows.length + 1);
    rows.push(draft(nextNo, last?.kind ?? 'yxm'));
    render();
    schedule();
    const inputs = body.querySelectorAll('input.xf-cell');
    const target = inputs[(rows.length - 1) * 3];
    if (target instanceof HTMLInputElement) target.focus();
  });

  $('xf-del').addEventListener('click', () => {
    if (rows.length === 0) return;
    rows.pop();
    if (rows.length === 0) rows.push(draft());
    render();
    schedule();
  });

  $('xf-clear').addEventListener('click', () => {
    if (!confirm('A teljes jegyzéket törli. Folytatod?')) return;
    rows = [draft('1')];
    render();
    schedule();
  });

  $('xf-save-db').addEventListener('click', compute);
  $('xf-save-pyx').addEventListener('click', () => {
    try {
      download('koordinatak.pyx', registerToPyx(toRegister()));
    } catch (e) {
      showIssue(e instanceof Error ? e.message : String(e));
    }
  });
  $('xf-save-geo').addEventListener('click', () => download('koordinatak_foldrajzi.txt', registerToGeographicText(toRegister())));

  // Meglévő koordináta-állomány betöltése (a .PYX2 és a szöveges formátum is).
  const file = $<HTMLInputElement>('xf-file');
  $('xf-load').addEventListener('click', () => {
    file.value = '';
    file.click();
  });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const text = await readText(f);
      const loaded: RowDraft[] = [];
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed === '' || /^[#*]/.test(trimmed) || /^(k|p)_/i.test(trimmed) || /^[A-Z]>/.test(trimmed)) return;
        try {
          const point = parseCoordLine(line, loaded.length + 1);
          loaded.push({ id: point.id, kind: 'yxm', a: String(point.y), b: String(point.x), c: point.m === null ? '' : String(point.m) });
        } catch {
          /* a nem értelmezhető sor kimarad */
        }
      });
      if (loaded.length === 0) {
        showIssue(`A(z) ${f.name} állományból nem sikerült pontot beolvasni.`);
        return;
      }
      rows = loaded;
      render();
      compute();
      status.textContent = `A(z) ${f.name} állomány ${loaded.length} pontját betöltöttem.`;
    } catch (e) {
      showIssue(e instanceof Error ? e.message : String(e));
    }
  });

  onMeta(compute);

  try {
    const saved = JSON.parse(storage.get(STORAGE_KEY) || 'null') as RowDraft[] | null;
    if (Array.isArray(saved) && saved.length > 0) rows = saved.map((r) => ({ ...draft(), ...r }));
  } catch {
    /* sérült tárolt adat – üres jegyzékkel indulunk */
  }
  render();
  compute();
}
