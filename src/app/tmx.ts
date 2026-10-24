// Import a Tiled .tmx farm map (vanilla export or a modded farm) into planner terrain codes.
// Rules, from the game's own map conventions:
//   Buildings layer tile (not marked Passable)      -> X (blocked)
//   Back tile with "Water"                          -> ~
//   Back tile with "Diggable"                       -> d (tillable + buildable)
//   Back tile with "NoFurniture"/"NoBuild"          -> p (walkable only)
//   any other Back tile                             -> g (buildable grass / path)
//   no Back tile                                    -> X
// Tile properties come from the tilesets (inline or external .tsx files picked alongside).
import type { FarmDef } from './engine.ts';

type Props = Map<number, Record<string, string>>; // gid -> properties

export async function parseTmx(files: File[]): Promise<FarmDef & { key: string }> {
  const tmxFile = files.find(f => f.name.toLowerCase().endsWith('.tmx'));
  if (!tmxFile) throw new Error('pick a .tmx file (plus its .tsx tilesets if they are separate)');
  const doc = new DOMParser().parseFromString(await tmxFile.text(), 'text/xml');
  const map = doc.querySelector('map');
  if (!map || doc.querySelector('parsererror')) throw new Error('not a Tiled map');
  const W = Number(map.getAttribute('width')), H = Number(map.getAttribute('height'));
  if (!(W > 0 && H > 0 && W <= 300 && H <= 300)) throw new Error('unexpected map size ' + W + '×' + H);
  const props: Props = new Map();
  for (const ts of Array.from(map.querySelectorAll(':scope > tileset'))) {
    const first = Number(ts.getAttribute('firstgid'));
    let el: Element = ts;
    const src = ts.getAttribute('source');
    if (src) {
      const f = files.find(x => x.name.toLowerCase() === src.split('/').pop()!.toLowerCase());
      if (!f) continue; // properties unknown -> those tiles count as plain ground
      el = new DOMParser().parseFromString(await f.text(), 'text/xml').documentElement;
    }
    for (const t of Array.from(el.querySelectorAll('tile'))) {
      const pr: Record<string, string> = {};
      for (const p of Array.from(t.querySelectorAll('property'))) pr[p.getAttribute('name') ?? ''] = p.getAttribute('value') ?? p.textContent ?? '';
      if (Object.keys(pr).length) props.set(first + Number(t.getAttribute('id')), pr);
    }
  }
  const layer = async (name: string) => {
    const l = Array.from(map.querySelectorAll('layer')).find(x => x.getAttribute('name')?.toLowerCase() === name);
    const data = l?.querySelector('data');
    if (!data) return null;
    const enc = data.getAttribute('encoding'), comp = data.getAttribute('compression');
    if (enc === 'csv') return data.textContent!.split(',').map(s => Number(s.trim()) & 0x1fffffff);
    if (enc === 'base64') {
      let bytes = Uint8Array.from(atob(data.textContent!.trim()), c => c.charCodeAt(0));
      if (comp) bytes = new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(comp === 'gzip' ? 'gzip' : 'deflate'))).arrayBuffer());
      const dv = new DataView(bytes.buffer); return Array.from({ length: W * H }, (_, i) => dv.getUint32(i * 4, true) & 0x1fffffff);
    }
    return Array.from(data.querySelectorAll('tile')).map(t => Number(t.getAttribute('gid') ?? 0) & 0x1fffffff);
  };
  const back = await layer('back'), build = await layer('buildings');
  if (!back) throw new Error('map has no "Back" layer');
  const has = (gid: number, k: string) => { const p = props.get(gid); return !!p && Object.keys(p).some(n => n.toLowerCase() === k.toLowerCase()); };
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let r = '';
    for (let x = 0; x < W; x++) {
      const i = y * W + x, b = back[i], bl = build?.[i] ?? 0;
      r += bl && !has(bl, 'Passable') ? 'X' : !b ? 'X' : has(b, 'Water') ? '~' : has(b, 'Diggable') ? 'd' : has(b, 'NoFurniture') || has(b, 'NoBuild') ? 'p' : 'g';
    }
    rows.push(r);
  }
  const name = tmxFile.name.replace(/\.tmx$/i, '');
  return { key: 'custom', label: 'Custom: ' + name, w: W, h: H, rows };
}
