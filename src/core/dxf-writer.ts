import { LAYERS, LINE_TYPES, type Layer, type LayerKey } from './layers';
import type { Pt } from './geometry';

/**
 * ASCII DXF (R12, AC1009) a földhivatali rajzok rétegrendjével. A koordináta-tengelyek a magyar
 * gyakorlat szerint: DXF X = EOV Y (kelet), DXF Y = EOV X (észak). A szöveg- és jelméretek a papíron
 * mm-ben értendők, a rajzba a méretarány szerint méterre átszámítva kerülnek; a vonaltípus-minta
 * (mm) a $LTSCALE-lel skálázódik. Kódlap: ANSI_1250 (a szöveget Windows-1250 bájtokra kell kódolni).
 */

export type DxfEntity =
  | { type: 'polyline'; layer: LayerKey; pts: Pt[]; closed: boolean }
  | { type: 'text'; layer: LayerKey; at: Pt; text: string; height: number; rotation?: number; align?: 'left' | 'center' }
  | { type: 'insert'; layer: LayerKey; block: 'Címkoordináta' | 'Pont'; at: Pt; scale: number };

const r = (n: number) => (Math.round(n * 1000) / 1000).toString();

export function writeDxf(entities: DxfEntity[], scale: number): string {
  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code).padStart(3), String(value));
  const used = new Set<LayerKey>(entities.map((e) => e.layer));
  const layers: Layer[] = [...used].map((k) => LAYERS[k]);
  const ltypes = LINE_TYPES.filter((t) => layers.some((l) => l.ltype === t.name));
  const all = entities.flatMap((e) => (e.type === 'polyline' ? e.pts : [e.at]));
  const min = all.length ? { y: Math.min(...all.map((p) => p.y)), x: Math.min(...all.map((p) => p.x)) } : { y: 0, x: 0 };
  const max = all.length ? { y: Math.max(...all.map((p) => p.y)), x: Math.max(...all.map((p) => p.x)) } : { y: 0, x: 0 };
  const m = scale / 1000; // papír-mm → méter

  // HEADER
  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(9, '$DWGCODEPAGE');
  g(3, 'ANSI_1250');
  g(9, '$EXTMIN');
  g(10, r(min.y));
  g(20, r(min.x));
  g(9, '$EXTMAX');
  g(10, r(max.y));
  g(20, r(max.x));
  g(9, '$LTSCALE');
  g(40, r(m));
  g(0, 'ENDSEC');

  // TABLES: vonaltípusok, rétegek, szövegstílus
  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LTYPE');
  g(70, ltypes.length + 1);
  g(0, 'LTYPE');
  g(2, 'CONTINUOUS');
  g(70, 0);
  g(3, 'Solid line');
  g(72, 65);
  g(73, 0);
  g(40, 0);
  for (const t of ltypes) {
    g(0, 'LTYPE');
    g(2, t.name);
    g(70, 0);
    g(3, t.name);
    g(72, 65);
    g(73, t.pattern.length);
    g(40, r(t.pattern.reduce((s, v) => s + Math.abs(v), 0)));
    for (const v of t.pattern) g(49, r(v));
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, layers.length + 1);
  g(0, 'LAYER');
  g(2, '0');
  g(70, 0);
  g(62, 7);
  g(6, 'CONTINUOUS');
  for (const l of layers) {
    g(0, 'LAYER');
    g(2, l.name);
    g(70, 0);
    g(62, l.color);
    g(6, l.ltype === 'Continuous' ? 'CONTINUOUS' : l.ltype);
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'STYLE');
  g(70, 1);
  g(0, 'STYLE');
  g(2, 'STANDARD');
  g(70, 0);
  g(40, 0);
  g(41, 1);
  g(50, 0);
  g(71, 0);
  g(42, 2);
  g(3, 'arial.ttf');
  g(4, '');
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  // BLOCKS: címkoordináta (kör kereszttel) és pont (kis kör); 1 egység = 1 mm a papíron
  g(0, 'SECTION');
  g(2, 'BLOCKS');
  const block = (name: string, body: () => void) => {
    g(0, 'BLOCK');
    g(8, '0');
    g(2, name);
    g(70, 0);
    g(10, 0);
    g(20, 0);
    g(30, 0);
    g(3, name);
    body();
    g(0, 'ENDBLK');
    g(8, '0');
  };
  const circle = (rad: number) => {
    g(0, 'CIRCLE');
    g(8, '0');
    g(10, 0);
    g(20, 0);
    g(40, rad);
  };
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    g(0, 'LINE');
    g(8, '0');
    g(10, x1);
    g(20, y1);
    g(11, x2);
    g(21, y2);
  };
  block('Címkoordináta', () => {
    circle(1.2);
    seg(-1.2, 0, 1.2, 0);
    seg(0, -1.2, 0, 1.2);
  });
  block('Pont', () => circle(0.5));
  g(0, 'ENDSEC');

  // ENTITIES
  g(0, 'SECTION');
  g(2, 'ENTITIES');
  for (const e of entities) {
    const layer = LAYERS[e.layer].name;
    if (e.type === 'polyline') {
      g(0, 'POLYLINE');
      g(8, layer);
      g(66, 1);
      g(10, 0);
      g(20, 0);
      g(30, 0);
      g(70, e.closed ? 1 : 0);
      for (const p of e.pts) {
        g(0, 'VERTEX');
        g(8, layer);
        g(10, r(p.y));
        g(20, r(p.x));
        g(30, 0);
      }
      g(0, 'SEQEND');
      g(8, layer);
    } else if (e.type === 'text') {
      g(0, 'TEXT');
      g(8, layer);
      g(10, r(e.at.y));
      g(20, r(e.at.x));
      g(30, 0);
      g(40, r(e.height * m));
      g(1, e.text);
      if (e.rotation) g(50, r(e.rotation));
      if (e.align === 'center') {
        g(72, 1);
        g(11, r(e.at.y));
        g(21, r(e.at.x));
        g(31, 0);
      }
    } else {
      g(0, 'INSERT');
      g(8, layer);
      g(2, e.block);
      g(10, r(e.at.y));
      g(20, r(e.at.x));
      g(30, 0);
      g(41, r(e.scale * m));
      g(42, r(e.scale * m));
      g(43, r(e.scale * m));
    }
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return `${out.join('\r\n')}\r\n`;
}
