// A build után egyetlen, önálló HTML fájlt készít (GEOkalkulus-1.0.html): a szkript és a stílus a fájlba kerül,
// így az oldal duplakattintással, szerver nélkül is működik (a böngésző fájlból nem tölt be külön modul-szkriptet).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

const assets = readdirSync(join(dist, 'assets'));
const jsFile = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('A build kimenete hiányos (nincs JS vagy CSS).');

const js = readFileSync(join(dist, 'assets', jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(dist, 'assets', cssFile), 'utf8');

html = html
  .replace(/<script\b[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '')
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>\s*/g, '')
  .replace(/<link\b[^>]*rel="modulepreload"[^>]*>\s*/g, '')
  .replace('</head>', () => `<style>${css}</style>\n</head>`)
  .replace('</body>', () => `<script>${js}</script>\n</body>`);

writeFileSync(join(dist, 'GEOkalkulus-1.0.html'), html);
console.log(`GEOkalkulus-1.0.html kész (${(html.length / 1024).toFixed(0)} KB)`);
