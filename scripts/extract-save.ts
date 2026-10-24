// Parse the real save (read-only) into src/data/save.json, the planner's embedded default.
// Usage: node scripts/extract-save.ts <path to save XML or .tar.gz>
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DOMParser } from '@xmldom/xmldom';
import { parseSave } from '../src/app/save.ts';

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/extract-save.ts <save>');
let buf: Buffer = readFileSync(src);
if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
let xml = buf.toString('utf8');
if (buf.subarray(257, 262).toString() === 'ustar') {
  for (let o = 0; o + 512 <= buf.length;) {
    const name = buf.subarray(o, o + 100).toString().replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(buf.subarray(o + 124, o + 136).toString().replace(/\0.*$/s, '').trim() || '0', 8);
    const p = name.split('/').filter(Boolean);
    if (p.length >= 2 && p.at(-1) === p.at(-2)) { xml = buf.subarray(o + 512, o + 512 + size).toString('utf8'); break; }
    o += 512 + Math.ceil(size / 512) * 512;
  }
}
const data = parseSave(new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ''), 'text/xml') as unknown as Document);
writeFileSync(new URL('../src/data/save.json', import.meta.url), JSON.stringify(data));
console.log(`${data.player} — ${data.season} ${data.day}, Y${data.year} · ${data.money}g · ${data.buildings.length} buildings · ${data.objects.length} objects · ${Object.keys(data.inventory).length} item types`);
