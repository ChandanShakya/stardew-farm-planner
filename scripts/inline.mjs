// After the SINGLE=1 build: inline its bundled JS (and any CSS link) into one HTML file and write
// dist/farm-planner.html — self-contained, works offline by double-clicking it.
import { readFileSync, writeFileSync } from 'node:fs';
const dist = new URL('../dist-single/', import.meta.url), out = new URL('../dist/', import.meta.url);
let html = readFileSync(new URL('index.html', dist), 'utf8');
html = html.replace(/<script type="module" src="\/?([^"]+)"><\/script>/g, (_, src) => {
  const js = readFileSync(new URL(src, dist), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="(?:icon|manifest)"[^>]*href="\/(?!data:)[^"]*"[^>]*>/g, '');
html = html.replace(/<link rel="stylesheet" href="\/?([^"]+)"\s*\/?>/g, (_, href) => `<style>${readFileSync(new URL(href, dist), 'utf8')}</style>`);
if (/src="\/?_astro|href="\/?_astro/.test(html)) throw new Error('unresolved asset reference left in HTML');
writeFileSync(new URL('farm-planner.html', out), html);
console.log(`dist/farm-planner.html ${(html.length / 1024).toFixed(0)} KB `);
