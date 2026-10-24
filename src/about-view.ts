import { DEFAULT_LOGO_SVG } from './core/logo';
import { createPage } from './shell';
import { el, svgElement } from './ui';

/**
 * Beállítások/Névjegy – a valódi program induló képe (a GeoCalc 3.5 képernyőképei szerint): középen
 * egy keretes lap a jelképpel, a program nevével és változatával, alatta az adatlap. A GEOkalkulus
 * saját jelképet és saját adatokat mutat (a valódi program cégadatait és rajzát nem veszi át).
 */

export const PROGRAM = {
  name: 'GEOkalkulus',
  version: '1.0',
  author: 'by_safi01',
} as const;

const FACTS: [string, string][] = [
  ['Program', `${PROGRAM.name} ${PROGRAM.version}`],
  ['Előd', 'GeoCalc 3.5 földmérési program'],
  ['Modulok', 'Adatrögzítő, Geodéziai számítások, Hálózatkiegyenlítés, Térbeli transzformáció, Adatcsere'],
  ['Bemenet', 'GeoCalc .gcd kódolás, GMJ jegyzőkönyv, .PYX / .PYX2 / .EOV koordináták'],
  ['Futtatás', 'böngészőben, telepítés és hálózat nélkül'],
  ['Adatok', 'csak ezen a gépen (a böngésző tárolójában)'],
  ['Készítette', PROGRAM.author],
];

export function initAboutView(): void {
  const { body } = createPage('about', 'Beállítások / Névjegy');
  body.classList.add('about-body');

  const card = el('div', 'about-card');
  const top = el('div', 'about-top');
  const logo = el('div', 'about-logo');
  const svg = svgElement(DEFAULT_LOGO_SVG);
  if (svg) {
    svg.setAttribute('width', '128');
    svg.setAttribute('height', '128');
    logo.append(svg);
  }
  const head = el('div', 'about-head');
  const title = el('div', 'about-title');
  title.append(el('span', 'about-name', PROGRAM.name), el('span', 'about-ver', PROGRAM.version));
  head.append(
    title,
    el('div', 'about-line', `Verzió: ${PROGRAM.version} – a GeoCalc 3.5 webes változata`),
    el('div', 'about-line strong', 'Földmérési számítások a böngészőben'),
    el('div', 'about-line dim', 'Geodéziai számítások · hálózatkiegyenlítés · térbeli transzformáció · adatcsere'),
  );
  top.append(logo, head);

  const table = el('table', 'about-facts');
  for (const [k, v] of FACTS) {
    const tr = el('tr');
    tr.append(el('th', undefined, k), el('td', undefined, v));
    table.append(tr);
  }

  const hint = el(
    'p',
    'about-hint',
    'A munka a bal oldali modulpanelről, a menüsorból vagy az ikonsávról indítható. Súgó: F1.',
  );
  card.append(top, table, hint);
  body.append(card);
}
