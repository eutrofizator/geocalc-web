import { polygonArea, type Pt } from './geometry';
import type { NamedPt } from './parcel';

/**
 * DAT adatcsere-formátum (DAT Szabályzat, DAT-M1 melléklet, G Függelék; MSZ 7772-1):
 * - egyetlen ASCII állomány, .dat kiterjesztéssel, az első rekord a címrekord;
 * - két táblázat rekordjait a következő táblázat nevét tartalmazó rekord választja el;
 * - minden adat (a táblázatnevek is) után * határolójel áll, az üres (NULL) mezőt is a határolójel jelöli;
 * - a rekordok CR LF-fel záródnak, az állomány végén CTRL-Z (EOF) lehet.
 *
 * A földrészlet geometriája: T_OBJ_ATTRBC / BD (felulet_id) → T_FELULET (külső határ „+”, belső „–”)
 * → T_HATAR (határvonalak, irany_valt „+”/„–”) → T_HATARVONAL (pontpárok hvsub_id szerint) → T_PONT.
 */

export interface DatTables {
  title: string[];
  tables: Map<string, string[][]>;
}

/** A pontok mezői (T_PONT): pont_id, pont_x, pont_y, pont_H, kozephiba_oszt_V, kozephiba_oszt_M. */
const T_PONT = ['pont_id', 'pont_x', 'pont_y', 'pont_H', 'kozephiba_oszt_V', 'kozephiba_oszt_M'];
const T_HATARVONAL = ['hatarvonal_id', 'hvsub_id', 'pont_id_1', 'pont_id_2', 'osszekot_mod', 'osszekot_id'];
const T_HATAR = ['hatar_id', 'hsub_id', 'hatarvonal_id', 'irany_valt'];
const T_FELULET = ['felulet_id', 'subfel_id', 'hatar_id', 'hatar_valt'];
/** T_OBJ_ATTRBC: földrészletek I. (közterületi). */
export const T_OBJ_ATTRBC = [
  'parcel_id', 'obj_fels', 'felulet_id', 'helyr_szam', 'cim_id', 'fekves', 'kozter_jell', 'terulet', 'foldert', 'forg_ertek',
  'val_nem', 'szerv_tip', 'jogi_jelleg', 'jogallas', 'ceg_id', 'elhat_jell', 'elhat_mod', 'elozo_parcel_id', 'l_datum',
  'hatarozat', 'valt_jell', 'tar_hely', 'blokk_id', 'megsz_datum', 'jelkulcs', 'munkater_id', 'pont_id',
];
/** T_OBJ_ATTRBD: földrészletek II. (nem közterületi). */
export const T_OBJ_ATTRBD = [
  'parcel_id', 'obj_fels', 'felulet_id', 'helyr_szam', 'cim_id', 'fekves', 'terulet', 'foldert', 'forg_ertek', 'val_nem',
  'szerv_tip', 'jogi_jelleg', 'jogallas', 'szemely_id', 'ceg_id', 'elhat_jell', 'elhat_mod', 'elozo_parcel_id', 'l_datum',
  'hatarozat', 'valt_jell', 'tar_hely', 'blokk_id', 'megsz_datum', 'jelkulcs', 'munkater_id', 'pont_id',
];
/** A pontszámot adó táblázatok: alappontok (AA: pont_szam), magassági alappontok (AB: mpont_szam), részletpontok (AC). */
const NAME_TABLES: [string, number, number][] = [
  ['T_OBJ_ATTRAA', 2, 3],
  ['T_OBJ_ATTRAB', 2, 3],
  ['T_OBJ_ATTRAC', 2, 3],
];

const isTableName = (rec: string) => /^T_[A-Z0-9_ ]+\*?$/.test(rec.trim());

/** A rekord mezői: a * határolójelek közötti értékek (az utolsó * utáni üres rész nem mező). */
export function splitRecord(line: string): string[] {
  const f = line.split('*');
  if (f.length > 1 && f.at(-1)!.trim() === '') f.pop();
  return f.map((s) => s.trim());
}

export function parseDatTables(text: string): DatTables {
  const lines = text.replace(/\u001a/g, '').split(/\r?\n/);
  const tables = new Map<string, string[][]>();
  let title: string[] = [];
  let current: string[][] | null = null;
  let first = true;
  for (const raw of lines) {
    if (raw.trim() === '') continue;
    if (isTableName(raw)) {
      const name = raw.trim().replace(/\*$/, '').replace(/\s+/g, '');
      current = tables.get(name) ?? [];
      tables.set(name, current);
      first = false;
      continue;
    }
    if (first) {
      // A címrekord: az első, táblázatnév előtti rekord.
      title = splitRecord(raw);
      first = false;
      continue;
    }
    if (current) current.push(splitRecord(raw));
    else if (title.length === 0) title = splitRecord(raw);
  }
  // A címrekord a T_CIMREK táblázatnév után is állhat.
  const cim = tables.get('T_CIMREK');
  if (title.length === 0 && cim?.[0]) title = cim[0];
  return { title, tables };
}

export interface DatParcel {
  table: 'T_OBJ_ATTRBC' | 'T_OBJ_ATTRBD';
  hrsz: string;
  /** A nyilvántartott (DAT-ban tárolt) terület [m²]. */
  area: number | null;
  /** A külső határ pontjainak azonosítói (a pontlista neveivel). */
  ring: string[];
  /** A belső határok (lyukak). */
  holes: string[][];
  /** A koordinátákból számolt terület (külső − belső) [m²]. */
  computed: number;
  /** Az eredeti rekord (az attribútumok megtartásához a visszaírásnál). */
  record: string[];
}

export interface DatImport {
  title: string[];
  points: NamedPt[];
  parcels: DatParcel[];
  warnings: string[];
  tableCounts: [string, number][];
  /** A pontok eredeti rekordjai (T_PONT és T_OBJ_ATTRAC) a pontszám szerint, a visszaíráshoz. */
  pointRecords: Map<string, PointRecords>;
}

export interface PointRecords {
  pont: string[];
  ac?: string[];
}

const num = (s: string | undefined) => (s === undefined || s === '' ? NaN : Number(s.replace(',', '.')));

/** A DAT állomány pontjai és földrészletei (a földrészletek határa pontsorrá fűzve). */
export function readDat(text: string): DatImport {
  const { title, tables } = parseDatTables(text);
  const warnings: string[] = [];
  const get = (n: string) => tables.get(n) ?? [];

  // Pontok és pontszámaik
  const names = new Map<string, string>();
  for (const [t, nameCol, idCol] of NAME_TABLES)
    for (const r of get(t)) {
      const name = r[nameCol]?.trim();
      const id = r[idCol]?.trim();
      if (name && id && !names.has(id)) names.set(id, name);
    }
  const usedNames = new Map<string, number>();
  for (const n of names.values()) usedNames.set(n, (usedNames.get(n) ?? 0) + 1);
  const label = (id: string) => {
    const n = names.get(id);
    return n && usedNames.get(n) === 1 ? n : id;
  };
  const points = new Map<string, NamedPt>();
  const pointRecords = new Map<string, PointRecords>();
  const acById = new Map(get('T_OBJ_ATTRAC').map((r) => [r[3]?.trim() ?? '', r]));
  for (const r of get('T_PONT')) {
    const id = r[0]?.trim() ?? '';
    const x = num(r[1]);
    const y = num(r[2]);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) {
      warnings.push(`T_PONT: hibás rekord (${r.join('*')}).`);
      continue;
    }
    points.set(id, { id: label(id), y, x });
    pointRecords.set(label(id), { pont: r, ac: acById.get(id) });
  }

  // Határvonalak: pontsor a hvsub_id sorrendjében
  const lines = new Map<string, { sub: number; a: string; b: string; arc: boolean }[]>();
  for (const r of get('T_HATARVONAL')) {
    const list = lines.get(r[0]!) ?? [];
    list.push({ sub: num(r[1]), a: r[2]!, b: r[3]!, arc: r[4] === '1' });
    lines.set(r[0]!, list);
  }
  let arcs = 0;
  const lineChain = (id: string): string[] | null => {
    const segs = lines.get(id);
    if (!segs) return null;
    segs.sort((p, q) => p.sub - q.sub);
    const out = [segs[0]!.a];
    for (const s of segs) {
      if (s.arc) arcs++;
      if (out.at(-1) !== s.a) out.push(s.a);
      out.push(s.b);
    }
    return out;
  };
  const borders = new Map<string, { sub: number; line: string; rev: boolean }[]>();
  for (const r of get('T_HATAR')) {
    const list = borders.get(r[0]!) ?? [];
    list.push({ sub: num(r[1]), line: r[2]!, rev: (r[3] ?? '+').replace('–', '-') === '-' });
    borders.set(r[0]!, list);
  }
  const borderRing = (id: string): string[] | null => {
    const parts = borders.get(id);
    if (!parts) return null;
    parts.sort((p, q) => p.sub - q.sub);
    const ring: string[] = [];
    for (const p of parts) {
      const chain = lineChain(p.line);
      if (!chain) return null;
      const c = p.rev ? [...chain].reverse() : chain;
      for (const pid of c) if (ring.at(-1) !== pid) ring.push(pid);
    }
    if (ring.length > 1 && ring[0] === ring.at(-1)) ring.pop();
    return ring;
  };
  const surfaces = new Map<string, { sub: number; border: string; inner: boolean }[]>();
  for (const r of get('T_FELULET')) {
    const list = surfaces.get(r[0]!) ?? [];
    list.push({ sub: num(r[1]), border: r[2]!, inner: (r[3] ?? '+').replace('–', '-') === '-' });
    surfaces.set(r[0]!, list);
  }

  const parcels: DatParcel[] = [];
  for (const [table, fields] of [
    ['T_OBJ_ATTRBC', T_OBJ_ATTRBC],
    ['T_OBJ_ATTRBD', T_OBJ_ATTRBD],
  ] as const) {
    const iF = fields.indexOf('felulet_id');
    const iH = fields.indexOf('helyr_szam');
    const iT = fields.indexOf('terulet');
    const iM = fields.indexOf('megsz_datum');
    const done = new Set<string>();
    for (const r of get(table)) {
      if (r[iM] && r[iM] !== '0') continue; // megszűnt rekord
      // Az ITR néha ugyanazt a földrészletet kétszer írja ki (azonos hrsz és felület).
      const dupKey = `${r[iH]}|${r[iF]}`;
      if (done.has(dupKey)) continue;
      done.add(dupKey);
      const hrsz = r[iH] ?? '';
      const surf = surfaces.get(r[iF] ?? '');
      if (!surf) {
        warnings.push(`${hrsz}: a(z) ${r[iF]} felület hiányzik a T_FELULET táblázatból.`);
        continue;
      }
      const outer = surf.filter((s) => !s.inner);
      if (outer.length > 1) warnings.push(`${hrsz}: összetett felület (${outer.length} külső határ) – csak az elsőt használja.`);
      const ring = outer[0] ? borderRing(outer[0].border) : null;
      if (!ring || ring.length < 3 || ring.some((p) => !points.has(p))) {
        warnings.push(`${hrsz}: a határ nem fűzhető pontsorrá (hiányzó határ, határvonal vagy pont).`);
        continue;
      }
      const holes = surf
        .filter((s) => s.inner)
        .map((s) => borderRing(s.border))
        .filter((h): h is string[] => h !== null && h.every((p) => points.has(p)));
      const poly = (ids: string[]) => ids.map((p) => points.get(p)!);
      const computed = polygonArea(poly(ring)) - holes.reduce((s, h) => s + polygonArea(poly(h)), 0);
      const area = num(r[iT]);
      parcels.push({
        table,
        hrsz,
        area: Number.isFinite(area) ? area : null,
        ring: ring.map((p) => points.get(p)!.id),
        holes: holes.map((h) => h.map((p) => points.get(p)!.id)),
        computed,
        record: r,
      });
    }
  }
  if (arcs > 0) warnings.push(`${arcs} íves határszakasz egyenesként szerepel (az ív a területet módosítja).`);
  if (points.size === 0) warnings.push('Az állományban nincs T_PONT táblázat – nem DAT adatcsere-állomány?');

  return {
    title,
    points: [...points.values()],
    parcels: parcels.sort((p, q) => p.hrsz.localeCompare(q.hrsz, 'hu', { numeric: true })),
    warnings,
    tableCounts: [...tables.entries()].map(([n, r]) => [n, r.length]),
    pointRecords,
  };
}

/* ---------- visszaírás ---------- */

export interface DatExportParcel {
  hrsz: string;
  area: number;
  ring: NamedPt[];
  /** A beolvasott rekord (ha volt), az attribútumai megmaradnak. */
  template?: { table: 'T_OBJ_ATTRBC' | 'T_OBJ_ATTRBD'; record: string[] };
}

export interface DatExportOptions {
  /** Az állomány neve kiterjesztés nélkül. */
  name: string;
  date: Date;
  /** A beolvasott pontok rekordjai (pontossági osztály, állandósítás, pontkód). */
  pointRecords?: Map<string, PointRecords>;
}

const f3 = (n: number) => String(Math.round(n * 1000) / 1000);
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const rec = (fields: (string | number | null | undefined)[]) => `${fields.map((v) => (v === null || v === undefined ? '' : String(v))).join('*')}*`;

/**
 * DAT adatcsere-állomány a földrészletek geometriájával, az ITR 5 DAT kimenetének szerkezetében:
 * címrekord, T_PONT, T_HATARVONAL (élenként egy határvonal, a szomszédos földrészletek közös éle
 * egyszer), T_HATAR (az óramutató járásával egyező irányban, a közös él „–” irányváltással),
 * T_FELULET, T_OBJ_ATTRAC (a pontszámok) és T_OBJ_ATTRBC / BD. A beolvasott pontok és földrészletek
 * rekordjai (pontossági osztály, állandósítás, objektumféleség, fekvés, elhatárolás…) megmaradnak, az
 * új földrészletek a „szülő” (a / előtti hrsz) attribútumait kapják. Windows-1250 kódolásra szánt szöveg.
 */
export function writeDat(parcels: DatExportParcel[], opts: DatExportOptions): string {
  const recs = opts.pointRecords ?? new Map<string, PointRecords>();
  const date = ymd(opts.date);
  const ptIds = new Map<string, number>();
  const pts: NamedPt[] = [];
  const clockwise = (ring: NamedPt[]) => {
    const signed = ring.reduce((s, a, k) => {
      const b = ring[(k + 1) % ring.length]!;
      return s + (a.y * b.x - b.y * a.x);
    }, 0);
    // Y kelet, X észak: az óramutató járásával egyező körüljárásnál az előjeles összeg negatív.
    return signed > 0 ? [...ring].reverse() : ring;
  };
  const rings = parcels.map((p) => clockwise(p.ring));
  for (const ring of rings)
    for (const q of ring)
      if (!ptIds.has(q.id)) {
        ptIds.set(q.id, ptIds.size + 1);
        pts.push(q);
      }

  const out: string[] = [];
  const file = opts.name.replace(/[^A-Za-z0-9_$-]/g, '_') || 'valtozas';
  out.push(rec(['GEOK_DAT', file, '', '-', '-', '-', date, 'GEOkalkulus 1.0', '2015.07.01 1.1']));

  out.push('T_PONT*');
  for (const p of pts) {
    const r = recs.get(p.id)?.pont;
    out.push(rec([ptIds.get(p.id), f3(p.x), f3(p.y), r?.[3] || '0', r?.[4] ?? '0', r?.[5] ?? '0']));
  }
  // Geokódpontok (a földrészlet pont_id mezője): a földrészleten belüli pont, középhiba nélkül (0*0, mint az ITR-ben).
  const geocodes = rings.map((ring) => {
    const id = ptIds.size + 1;
    ptIds.set(`#geo${id}`, id);
    const g = interiorPoint(ring);
    out.push(rec([id, f3(g.x), f3(g.y), '0', '0', '0']));
    return id;
  });

  // Határvonalak: élenként egy, a második földrészlet ellentétes irányban („–”) hivatkozik rá.
  const edges = new Map<string, { id: number; a: string; b: string }>();
  const borders: string[][] = [];
  rings.forEach((ring, i) => {
    ring.forEach((a, k) => {
      const b = ring[(k + 1) % ring.length]!;
      const key = [a.id, b.id].sort().join('|');
      let e = edges.get(key);
      if (!e) {
        e = { id: edges.size + 1, a: a.id, b: b.id };
        edges.set(key, e);
      }
      borders.push([String(i + 1), String(k + 1), String(e.id), e.a === a.id ? '+' : '-']);
    });
  });
  out.push('T_HATARVONAL*');
  for (const e of edges.values()) out.push(rec([e.id, 1, ptIds.get(e.a), ptIds.get(e.b), 0, '']));
  out.push('T_HATAR*');
  for (const b of borders) out.push(rec(b));
  out.push('T_FELULET*');
  parcels.forEach((_, i) => out.push(rec([i + 1, 1, i + 1, '+'])));

  // Részletpontok: a pontszám a T_OBJ_ATTRAC táblázatban (a beolvasott rekord, vagy új pontnál új rekord).
  const acs = pts.map((p) => recs.get(p.id)?.ac).filter((r): r is string[] => r !== undefined);
  const common = (k: number) => {
    const c = new Map<string, number>();
    for (const r of acs) c.set(r[k] ?? '', (c.get(r[k] ?? '') ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  };
  out.push('T_OBJ_ATTRAC*');
  pts.forEach((p, i) => {
    const src = recs.get(p.id)?.ac;
    if (src) {
      const r = [...src];
      r[0] = String(i + 1);
      r[3] = String(ptIds.get(p.id));
      r[7] = String(i + 1);
      out.push(rec(r));
    } else out.push(rec([i + 1, common(1) || 'AC02', p.id, ptIds.get(p.id), common(4), common(5), date, i + 1, '0', common(9) || '0', '', common(11)]));
  });

  const parentOf = (hrsz: string) => parcels.find((q) => q.template && q.hrsz === hrsz.split('/')[0])?.template;
  for (const table of ['T_OBJ_ATTRBC', 'T_OBJ_ATTRBD'] as const) {
    const fields = table === 'T_OBJ_ATTRBC' ? T_OBJ_ATTRBC : T_OBJ_ATTRBD;
    const rows: string[] = [];
    parcels.forEach((p, i) => {
      const tpl = p.template ?? parentOf(p.hrsz) ?? parcels.find((q) => q.template)?.template;
      if ((tpl?.table ?? 'T_OBJ_ATTRBD') !== table) return;
      const r = fields.map((_, k) => tpl?.record[k] ?? '');
      const set = (f: string, v: string | number) => {
        r[fields.indexOf(f)] = String(v);
      };
      set('parcel_id', i + 1);
      set('felulet_id', i + 1);
      set('helyr_szam', p.hrsz);
      set('terulet', Math.round(p.area));
      set('megsz_datum', '0');
      set('elozo_parcel_id', i + 1);
      if (!tpl) {
        set('obj_fels', 'BD01');
        set('jelkulcs', '114');
      }
      set('pont_id', geocodes[i]!);
      rows.push(rec(r));
    });
    if (rows.length > 0) out.push(`${table}*`, ...rows);
  }
  return `${out.join('\r\n')}\r\n`;
}

/** A sokszög egy belső pontja: a súlypont, ha belül van, különben egy vízszintes metszet felezőpontja. */
export function interiorPoint(ring: Pt[]): Pt {
  const n = ring.length;
  let a = 0;
  let cy = 0;
  let cx = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    const f = p.y * q.x - q.y * p.x;
    a += f;
    cy += (p.y + q.y) * f;
    cx += (p.x + q.x) * f;
  }
  const c = a !== 0 ? { y: cy / (3 * a), x: cx / (3 * a) } : ring[0]!;
  const inside = (pt: Pt) => {
    let r = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const u = ring[i]!;
      const v = ring[j]!;
      if (u.x > pt.x !== v.x > pt.x && pt.y < ((v.y - u.y) * (pt.x - u.x)) / (v.x - u.x) + u.y) r = !r;
    }
    return r;
  };
  if (inside(c)) return c;
  // A súlypont X-én átmenő vízszintes egyenes első belső szakaszának felezőpontja.
  const xs: number[] = [];
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const u = ring[i]!;
    const v = ring[j]!;
    if (u.x > c.x !== v.x > c.x) xs.push(u.y + ((v.y - u.y) * (c.x - u.x)) / (v.x - u.x));
  }
  xs.sort((p, q) => p - q);
  return xs.length >= 2 ? { y: (xs[0]! + xs[1]!) / 2, x: c.x } : c;
}

/** Windows-1250 kódolás (a DAT állományok ITR szerinti kódlapja); a nem ábrázolható jel helyén „?”. */
export function encodeWindows1250(text: string): Uint8Array<ArrayBuffer> {
  const dec = new TextDecoder('windows-1250');
  const table = new Map<string, number>();
  for (let b = 0x80; b <= 0xff; b++) table.set(dec.decode(new Uint8Array([b])), b);
  const out = new Uint8Array(text.length);
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    out[n++] = c < 0x80 ? c : (table.get(ch) ?? 0x3f);
  }
  return out.slice(0, n);
}
