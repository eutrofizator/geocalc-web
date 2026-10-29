import { polygonArea, type Pt } from './geometry';
import type { NamedPt } from './parcel';

/**
 * A földhivatali adatszolgáltatás csomagja (ZIP): az ingatlan-nyilvántartási térkép DXF-ben
 * (a DAT szerinti fóliákkal), a földrészlet-információ (Report.txt) és a földkönyvi kivonat
 * (foldm_foldk-*.txt). A DXF fóliái:
 * - BHP (INSERT): határpont, BHP_SZ (MTEXT): a határpont száma (pl. 1-10_17);
 * - *_FRSZ (zárt LWPOLYLINE): földrészlet (KNK, BNK, BK, KK – kül-/belterület, (nem) közterület);
 * - HRSZ (MTEXT): helyrajzi szám a földrészleten belül (zárójelben is lehet).
 */

/* ---------- DXF ---------- */

export interface DxfEntity {
  type: string;
  layer: string;
  /** A csoportkódok és értékeik sorrendben (ismétlődő kódokkal, pl. a csúcsok 10/20 párjai). */
  codes: [number, string][];
}

/** Az ENTITIES szakasz elemei (ASCII DXF). */
export function parseDxfEntities(text: string): DxfEntity[] {
  const lines = text.split(/\r?\n/);
  const out: DxfEntity[] = [];
  let inEntities = false;
  let expectName = false;
  let cur: DxfEntity | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    const value = lines[i + 1]!.replace(/\s+$/, '');
    if (code === 0) {
      if (cur) out.push(cur);
      cur = null;
      const v = value.trim();
      if (v === 'SECTION') expectName = true;
      else if (v === 'ENDSEC') inEntities = false;
      else if (inEntities) cur = { type: v, layer: '', codes: [] };
      continue;
    }
    if (expectName && code === 2) {
      inEntities = value.trim() === 'ENTITIES';
      expectName = false;
      continue;
    }
    if (!cur) continue;
    if (code === 8) cur.layer = value.trim();
    cur.codes.push([code, value]);
  }
  if (cur) out.push(cur);
  return out;
}

const first = (e: DxfEntity, code: number) => e.codes.find(([c]) => c === code)?.[1];
const pos = (e: DxfEntity): Pt | null => {
  const y = Number(first(e, 10));
  const x = Number(first(e, 20));
  return Number.isFinite(y) && Number.isFinite(x) ? { y, x } : null;
};

/** Az MTEXT formázókódjainak eltávolítása ({\f…;szöveg}, \P, \~ …). */
export function mtextPlain(s: string): string {
  return s
    .replace(/\\[Pp]/g, ' ')
    .replace(/\\~/g, ' ')
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/[{}]/g, '')
    .trim();
}

const vertices = (e: DxfEntity): Pt[] => {
  const out: Pt[] = [];
  let y: number | null = null;
  for (const [c, v] of e.codes) {
    if (c === 10) y = Number(v);
    else if (c === 20 && y !== null) {
      out.push({ y, x: Number(v) });
      y = null;
    }
  }
  return out;
};

function inside(p: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.x > p.x !== b.x > p.x && p.y < ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x) + a.y) c = !c;
  }
  return c;
}

export interface OfficeParcel {
  hrsz: string;
  /** A DXF fólia (pl. BNK_FRSZ). */
  layer: string;
  ring: string[];
  computed: number;
}

export interface CadastralMap {
  points: NamedPt[];
  parcels: OfficeParcel[];
  /** Épületek a DXF épületfóliáiról (LAKOEPULET, GAZD_EPULET, UDULOEPULET). */
  buildings: { layer: 'residential' | 'farm' | 'holiday'; ring: Pt[] }[];
  warnings: string[];
}

const key = (p: Pt) => `${Math.round(p.y * 100)}:${Math.round(p.x * 100)}`;
const cleanHrsz = (s: string) => s.replace(/[()\s]/g, '').replace(/\/$/, '');

/** Az ingatlan-nyilvántartási térkép DXF-jéből a földrészletek (helyrajzi számmal) és a határpontok. */
export function readCadastralDxf(text: string): CadastralMap {
  const ents = parseDxfEntities(text);
  const warnings: string[] = [];

  // Határpontok és pontszámaik: a szám a pont helyén áll (vagy annak közelében).
  const numbers = ents.filter((e) => e.layer === 'BHP_SZ' && /TEXT/.test(e.type));
  const byPos = new Map<string, string>();
  for (const t of numbers) {
    const p = pos(t);
    const s = mtextPlain(first(t, 1) ?? '');
    if (p && s) byPos.set(key(p), s);
  }
  const named = new Map<string, NamedPt>();
  const usedNames = new Set<string>();
  for (const e of ents.filter((x) => x.layer === 'BHP' && x.type === 'INSERT')) {
    const p = pos(e);
    if (!p) continue;
    let name = byPos.get(key(p));
    if (!name) {
      // A legközelebbi, 2 m-en belüli pontszám.
      let best: { d: number; s: string } | null = null;
      for (const t of numbers) {
        const q = pos(t);
        if (!q) continue;
        const d = Math.hypot(q.y - p.y, q.x - p.x);
        if (d < 2 && (!best || d < best.d)) best = { d, s: mtextPlain(first(t, 1) ?? '') };
      }
      name = best?.s;
    }
    if (!name || usedNames.has(name)) continue;
    usedNames.add(name);
    named.set(key(p), { id: name, y: p.y, x: p.x });
  }

  // Földrészletek: zárt vonallánc a *_FRSZ fóliákon, a benne álló helyrajzi számmal.
  const labels = ents
    .filter((e) => e.layer === 'HRSZ' && /TEXT/.test(e.type))
    .map((e) => ({ at: pos(e), hrsz: cleanHrsz(mtextPlain(first(e, 1) ?? '')) }))
    .filter((l): l is { at: Pt; hrsz: string } => l.at !== null && l.hrsz !== '');
  const points = new Map<string, NamedPt>();
  let unnamed = 0;
  let noLabel = 0;
  const parcels: OfficeParcel[] = [];
  for (const e of ents.filter((x) => x.type === 'LWPOLYLINE' && /_FRSZ$/.test(x.layer))) {
    const vs = vertices(e);
    if (vs.length > 1 && key(vs[0]!) === key(vs.at(-1)!)) vs.pop();
    if (vs.length < 3) continue;
    const here = labels.filter((l) => inside(l.at, vs));
    if (here.length === 0) {
      noLabel++;
      continue;
    }
    const hrsz = here[0]!.hrsz;
    const ring = vs.map((v) => {
      const k = key(v);
      let p = named.get(k) ?? points.get(k);
      if (!p) {
        unnamed++;
        p = { id: `DXF${unnamed}`, y: v.y, x: v.x };
      }
      points.set(k, p);
      return p.id;
    });
    parcels.push({ hrsz, layer: e.layer, ring, computed: polygonArea(vs) });
  }
  if (noLabel > 0) warnings.push(`${noLabel} földrészlet-sokszögben nincs helyrajzi szám (jellemzően a kivágat szélén) – ezeket kihagyta.`);
  if (unnamed > 0) warnings.push(`${unnamed} töréspontnak nincs pontszáma a DXF-ben (DXF1, DXF2… nevet kapott).`);
  const seen = new Map<string, number>();
  for (const p of parcels) seen.set(p.hrsz, (seen.get(p.hrsz) ?? 0) + 1);
  const dup = [...seen].filter(([, n]) => n > 1).map(([h]) => h);
  if (dup.length > 0) warnings.push(`Több sokszögben is szereplő helyrajzi szám: ${dup.slice(0, 10).join(', ')}${dup.length > 10 ? '…' : ''}.`);
  const BUILDING_LAYERS: Record<string, 'residential' | 'farm' | 'holiday'> = { LAKOEPULET: 'residential', GAZD_EPULET: 'farm', UDULOEPULET: 'holiday' };
  const buildings: CadastralMap['buildings'] = [];
  for (const e of ents.filter((x) => x.type === 'LWPOLYLINE' && BUILDING_LAYERS[x.layer])) {
    const vs = vertices(e);
    if (vs.length > 1 && key(vs[0]!) === key(vs.at(-1)!)) vs.pop();
    if (vs.length >= 3) buildings.push({ layer: BUILDING_LAYERS[e.layer]!, ring: vs });
  }
  return {
    points: [...points.values()],
    parcels: parcels.sort((a, b) => a.hrsz.localeCompare(b.hrsz, 'hu', { numeric: true })),
    buildings,
    warnings,
  };
}

/* ---------- Report.txt és földkönyv ---------- */

export interface RegisteredParcel {
  hrsz: string;
  /** Tulajdoni lapi (nyilvántartott) terület [m²]. */
  area: number;
  /** A földrészlet-információ műszaki területe [m²], ha szerepel. */
  technical?: number;
  /** A földrészlet-információ határpontjai (ha szerepel geometria). */
  points?: NamedPt[];
}

const decimal = (s: string) => Number(s.replace(/\s+/g, '').replace(',', '.'));

/** „ha.m2” alakú terület (0.1064 = 1064 m², 1.2345 = 1 ha 2345 m²). */
function haM2(s: string): number {
  const [ha, m2 = '0'] = s.trim().split('.');
  return Number(ha) * 10_000 + Number(m2.padEnd(4, '0').slice(0, 4));
}

/**
 * A földhivatali szöveges kimenetek nyilvántartott területei: a földrészlet-információ
 * („Helyrajzi szám: … Terület: … m2 Műszaki terület: …”, geometriával) és a földkönyvi kivonat
 * (hrsz-fejléc, majd „ÖSSZESEN: ha.m2”).
 */
export function readRegisteredAreas(text: string): RegisteredParcel[] {
  const out: RegisteredParcel[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  // Földrészlet-információ (Report.txt)
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i]!.match(/Helyrajzi sz[áa]m:\s*([0-9]+(?:\/[0-9]+)?)/i);
    if (!h) continue;
    const rest = lines.slice(i, i + 6).join(' ');
    const a = rest.match(/(?<!Műszaki )Terület:\s*([\d\s]+(?:[.,]\d+)?)\s*m2/i);
    const t = rest.match(/Műszaki terület:\s*([\d\s]+(?:[.,]\d+)?)\s*m2/i);
    const rec: RegisteredParcel = { hrsz: h[1]!, area: a ? decimal(a[1]!) : NaN };
    if (t) rec.technical = decimal(t[1]!);
    const pts: NamedPt[] = [];
    let j = lines.findIndex((l, k) => k > i && /Pontsz[áa]m\s+Y/i.test(l));
    if (j > 0)
      for (j = j + 1; j < lines.length; j++) {
        const m = lines[j]!.match(/^\s*(\S+)\s+(\d+[,.]\d+)\s*,\s*(\d+[,.]\d+)\s*$/);
        if (!m) break;
        pts.push({ id: m[1]!, y: decimal(m[2]!), x: decimal(m[3]!) });
      }
    if (pts.length > 1 && pts[0]!.id === pts.at(-1)!.id) pts.pop();
    if (pts.length >= 3) rec.points = pts;
    if (Number.isFinite(rec.area)) out.push(rec);
  }

  // Földkönyvi kivonat: „   100/     ” fejléc … „ÖSSZESEN:      0.0502”
  let current: string | null = null;
  for (const l of lines) {
    const h = l.match(/^\s{1,8}(\d+(?:\/\d+)?)\/?\s*$/);
    if (h) {
      current = h[1]!;
      continue;
    }
    const s = l.match(/^\s+ÖSSZESEN:\s+(\d+\.\d+)/);
    if (s && current) {
      if (!out.some((o) => o.hrsz === current)) out.push({ hrsz: current, area: haM2(s[1]!) });
      current = null;
    }
  }
  return out;
}

/**
 * A földkönyvi kivonat fejlécéből a település és a fekvés (pl. „ 1234 KISVÁROS   BELTERÜLET”):
 * a településnév nagy kezdőbetűvel, a többi kisbetűvel.
 */
export function readSettlement(text: string): { telepules: string; fekves: string } | null {
  const m = text.match(/^\s*\d{4}\s+(\S.*?)\s{2,}(BELTERÜLET|KÜLTERÜLET|ZÁRTKERT)\s*$/mu);
  if (!m) return null;
  const cap = (w: string) => w.charAt(0).toLocaleUpperCase('hu') + w.slice(1).toLocaleLowerCase('hu');
  return { telepules: m[1]!.trim().split(/(\s+|-)/).map((w) => (/^[\s-]+$/.test(w) ? w : cap(w))).join(''), fekves: cap(m[2]!) };
}

/** Több szöveges kimenet összevonása: helyrajzi számonként egy rekord (a geometriát tartalmazó az erősebb). */
export function mergeRegistered(lists: RegisteredParcel[][]): RegisteredParcel[] {
  const out = new Map<string, RegisteredParcel>();
  for (const r of lists.flat()) {
    const old = out.get(r.hrsz);
    if (!old) out.set(r.hrsz, r);
    else out.set(r.hrsz, { ...r, ...old, points: old.points ?? r.points, technical: old.technical ?? r.technical });
  }
  return [...out.values()];
}

/* ---------- ZIP (a böngésző beépített kicsomagolójával) ---------- */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** ZIP állomány kibontása (tárolt és „deflate” tömörítésű tagok). */
export async function readZip(buf: ArrayBuffer): Promise<ZipEntry[]> {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('Nem ZIP állomány.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Sérült ZIP könyvtár.');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nameBytes = new Uint8Array(buf, p + 46, nameLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const lstart = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = new Uint8Array(buf, lstart, csize);
    if (method === 0) out.push({ name, data: raw.slice() });
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out.push({ name, data: new Uint8Array(await new Response(stream).arrayBuffer()) });
    } else throw new Error(`${name}: nem támogatott tömörítés (${method}).`);
  }
  return out;
}

/** Szöveg dekódolása: UTF-8, ha érvényes, különben Windows-1250 (a DXF $DWGCODEPAGE = ANSI_1250). */
export function decodeText(data: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return new TextDecoder('windows-1250').decode(data);
  }
}
