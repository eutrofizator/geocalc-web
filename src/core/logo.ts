/**
 * A GeoCalc-jellegű, alapértelmezett jelkép a jegyzőkönyv előlapjára.
 *
 * Saját, eredeti rajz (nincs benne cégnév és nem származik külső forrásból): koordináta-háló,
 * geodéziai háromszög, szögív és a bemért pontok. Beágyazott SVG, ezért az önálló HTML hálózat
 * és webfont nélkül is megjeleníti.
 */

/** A jelkép SVG-forrása (96×96). */
export const DEFAULT_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" role="img" aria-label="Geodéziai számítás">
  <rect x="3" y="3" width="90" height="90" rx="12" fill="#f2f6fb" stroke="#0a246a" stroke-width="3"/>
  <g stroke="#c3d3e8" stroke-width="1.5" stroke-linecap="square">
    <path d="M27 9V87M51 9V87M75 9V87"/>
    <path d="M9 27H87M9 51H87M9 75H87"/>
  </g>
  <path d="M24 72 L48 30 L72 72 Z" fill="none" stroke="#0a246a" stroke-width="4.5" stroke-linejoin="round"/>
  <path d="M39.5 45.5 A 13 13 0 0 1 56.5 45.5" fill="none" stroke="#3a6ea5" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="24" cy="72" r="5" fill="#0a246a"/>
  <circle cx="72" cy="72" r="5" fill="#0a246a"/>
  <circle cx="48" cy="30" r="5" fill="#3a6ea5"/>
</svg>`;

/** A jelkép `data:` URI-ja (a `<img src>`-hez). */
export function logoDataUri(svg: string = DEFAULT_LOGO_SVG): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`;
}

/** Az előlapra kerülő logó forrása: a feltöltött kép, vagy az alapértelmezett jelkép. */
export function coverLogoSrc(logo: string): string {
  return logo !== '' ? logo : logoDataUri();
}
