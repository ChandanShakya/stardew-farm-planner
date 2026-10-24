// Optional real game graphics, loaded from the player's OWN copy of Stardew Valley.
// Nothing from the game ships with this app: the user picks their Content folder (raw .xnb or the
// "Content (unpacked)" PNGs from StardewXnbHack); the textures are decoded in the browser and
// cached in this browser's IndexedDB only.
import { lzxXnb } from './lzx.ts';

export type Tex = ImageBitmap;
const KEYS: Record<string, string[]> = {
  objects: ['maps/springobjects'], craftables: ['tilesheets/craftables'], hoe: ['terrainfeatures/hoedirt'],
  floor: ['terrainfeatures/flooring'], fence: ['loosesprites/fence5'], oak: ['terrainfeatures/tree1_spring'],
  pine: ['terrainfeatures/tree3_spring'], fruit: ['tilesheets/fruittrees'],
  farmhouse: ['buildings/houses'], greenhouse: ['buildings/greenhouse'], barn: ['buildings/deluxe barn', 'buildings/barn'],
  coop: ['buildings/deluxe coop', 'buildings/coop'], silo: ['buildings/silo'], shed: ['buildings/big shed', 'buildings/shed'],
  mill: ['buildings/mill'], stable: ['buildings/stable'], slime: ['buildings/slime hutch'], pond: ['buildings/fish pond'],
  well: ['buildings/well'], junimo: ['buildings/junimo hut'], earthob: ['buildings/earth obelisk'], waterob: ['buildings/water obelisk'],
  desertob: ['buildings/desert obelisk'], islandob: ['buildings/island obelisk'], clock: ['buildings/gold clock'],
  bin: ['buildings/shipping bin'], petbowl: ['buildings/petbowl', 'buildings/pet bowl'], cabin: ['buildings/cabin', 'buildings/plank cabin'],
};
const tex: Record<string, Tex> = {};
export const artReady = () => !!tex.objects;
export const artCount = () => Object.keys(tex).length;
let enabled = true;
export const artOn = () => enabled && artReady();
export const setArtOn = (v: boolean) => { enabled = v; };

// ---------- loading ----------
const norm = (path: string) => {
  const p = path.replace(/\\/g, '/').toLowerCase();
  const m = p.match(/content(?: \(unpacked\))?\/(.+)\.(xnb|png)$/) ?? p.match(/([^/]+\/[^/]+)\.(xnb|png)$/);
  return m ? m[1] : '';
};
export async function loadFromFiles(files: FileList | File[]): Promise<{ loaded: string[]; errors: string[] }> {
  const byKey = new Map<string, File>();
  for (const f of Array.from(files)) {
    const k = norm((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev || f.name.endsWith('.png')) byKey.set(k, f); // prefer unpacked PNG over XNB
  }
  const loaded: string[] = [], errors: string[] = [];
  for (const [name, cands] of Object.entries(KEYS)) {
    const file = cands.map(c => byKey.get(c)).find(Boolean);
    if (!file) continue;
    try {
      const bmp = file.name.endsWith('.png') ? await createImageBitmap(file) : await decodeXnb(new Uint8Array(await file.arrayBuffer()));
      tex[name] = bmp; loaded.push(name); framesCache.clear();
      await idbPut(name, bmp);
    } catch (e) { errors.push(`${file.name}: ${(e as Error).message}`); }
  }
  return { loaded, errors };
}
export async function restoreCache() {
  try {
    const all = await idbAll();
    for (const [k, blob] of all) tex[k] = await createImageBitmap(blob);
  } catch { /* no IndexedDB (private mode): graphics just aren't remembered */ }
}
export async function clearArt() { framesCache.clear(); for (const k of Object.keys(tex)) delete tex[k]; try { await idbClear(); } catch { /* ignore */ } }

// ---------- XNB Texture2D (uncompressed, LZX — what the PC game ships — or LZ4) ----------
async function decodeXnb(b: Uint8Array): Promise<ImageBitmap> {
  if (b[0] !== 0x58 || b[1] !== 0x4e || b[2] !== 0x42) throw new Error('not an XNB file');
  const flags = b[5];
  let body: Uint8Array;
  const head = new DataView(b.buffer, b.byteOffset);
  if (flags & 0x80) body = lzxXnb(b.subarray(14), head.getUint32(6, true) - 14, head.getUint32(10, true));
  else if (flags & 0x40) {
    const size = new DataView(b.buffer, b.byteOffset).getUint32(10, true);
    body = lz4(b.subarray(14), size);
  } else body = b.subarray(10);
  let o = 0;
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const v7 = () => { let r = 0, s = 0, c; do { c = body[o++]; r |= (c & 0x7f) << s; s += 7; } while (c & 0x80); return r; };
  const str = () => { const n = v7(); const t = new TextDecoder().decode(body.subarray(o, o + n)); o += n; return t; };
  const readers = v7(); const names: string[] = [];
  for (let i = 0; i < readers; i++) { names.push(str()); o += 4; }
  v7(); // shared resources
  const ti = v7();
  if (!names[ti - 1]?.includes('Texture2D')) throw new Error('not a texture');
  const fmt = dv.getInt32(o, true), w = dv.getUint32(o + 4, true), h = dv.getUint32(o + 8, true); o += 16;
  const n = dv.getUint32(o, true); o += 4;
  if (fmt !== 0 || n !== w * h * 4) throw new Error('unsupported texture format ' + fmt);
  const px = new Uint8ClampedArray(body.subarray(o, o + n));
  for (let i = 0; i < px.length; i += 4) { const a = px[i + 3]; if (a && a < 255) { px[i] = px[i] * 255 / a; px[i + 1] = px[i + 1] * 255 / a; px[i + 2] = px[i + 2] * 255 / a; } } // un-premultiply
  return createImageBitmap(new ImageData(px, w, h));
}
function lz4(src: Uint8Array, size: number) {
  const out = new Uint8Array(size); let i = 0, o = 0;
  while (i < src.length && o < size) {
    const tok = src[i++]; let lit = tok >> 4;
    if (lit === 15) { let x; do { x = src[i++]; lit += x; } while (x === 255); }
    out.set(src.subarray(i, i + lit), o); i += lit; o += lit;
    if (o >= size || i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8); i += 2;
    let ml = tok & 15;
    if (ml === 15) { let x; do { x = src[i++]; ml += x; } while (x === 255); }
    ml += 4;
    for (let k = 0; k < ml; k++, o++) out[o] = out[o - off];
  }
  if (o !== size) throw new Error('LZ4 size mismatch; unpack the Content folder with StardewXnbHack instead');
  return out;
}

// ---------- IndexedDB cache ----------
const DB = 'sdv-planner-art';
const db = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('tex'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbPut(k: string, bmp: ImageBitmap) {
  const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext('2d')!.drawImage(bmp, 0, 0);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const d = await db(); await new Promise((res, rej) => { const t = d.transaction('tex', 'readwrite'); t.objectStore('tex').put(blob, k); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
async function idbAll(): Promise<[string, Blob][]> {
  const d = await db();
  return new Promise((res, rej) => {
    const out: [string, Blob][] = []; const t = d.transaction('tex'); const c = t.objectStore('tex').openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out.push([cur.key as string, cur.value as Blob]); cur.continue(); } else res(out); };
    c.onerror = () => rej(c.error);
  });
}
async function idbClear() { const d = await db(); await new Promise(res => { const t = d.transaction('tex', 'readwrite'); t.objectStore('tex').clear(); t.oncomplete = res; }); }

// ---------- sprite lookup ----------
// Object sheet is 16x16 cells, 24 per row; big craftables are 16x32 cells, 8 per row.
const OBJ = (id: number) => tex.objects && { img: tex.objects, sx: (id % 24) * 16, sy: ((id / 24) | 0) * 16, sw: 16, sh: 16 };
const BC = (id: number) => tex.craftables && { img: tex.craftables, sx: (id % 8) * 16, sy: ((id / 8) | 0) * 32, sw: 16, sh: 32 };
const CROP_ID: Record<string, number> = {
  Parsnip: 24, 'Green Bean': 188, Cauliflower: 190, Potato: 192, Garlic: 248, Kale: 250, Rhubarb: 252, Melon: 254, Tomato: 256,
  Blueberry: 258, 'Hot Pepper': 260, Wheat: 262, Radish: 264, 'Red Cabbage': 266, Starfruit: 268, Corn: 270, Eggplant: 272,
  Artichoke: 274, Pumpkin: 276, 'Bok Choy': 278, Yam: 280, Cranberries: 282, Beet: 284, Amaranth: 300, Hops: 304, Grape: 398,
  Strawberry: 400, 'Ancient Fruit': 454, Pineapple: 832, 'Taro Root': 830, 'Cactus Fruit': 90, 'Sweet Gem Berry': 417, Sunflower: 421,
  'Fairy Rose': 595, 'Blue Jazz': 597, Tulip: 591, 'Summer Spangle': 593, Poppy: 376, 'Coffee Bean': 433,
};
const MACHINE_BC: Record<string, number> = { Keg: 12, Furnace: 13, 'Preserves Jar': 15, Cask: 163, 'Seed Maker': 25, Crystalarium: 21, 'Charcoal Kiln': 114, 'Recycling Machine': 20, Loom: 17, 'Oil Maker': 19, 'Mayonnaise Machine': 24, 'Cheese Press': 16 };
export type Src = { img: Tex; sx: number; sy: number; sw: number; sh: number };

// Sprite for a tile item; `tall` sprites (16x32) are drawn one tile up from their base.
export function itemSrc(code: string, note?: string, defaultCrop = 'Ancient Fruit'): Src | null | undefined {
  switch (code) {
    case 'C': return OBJ(CROP_ID[note ?? ''] ?? CROP_ID[defaultCrop]);
    case 'Y': return OBJ(595); // Fairy Rose
    case 'I': return OBJ(645);
    case 'Q': return OBJ(621);
    case 'S': return OBJ(599);
    case 'R': return BC(167);
    case 'r': return BC(note === 'Rarecrow' ? 110 : 8);
    case 'E': return BC(10);
    case 'M': return BC(MACHINE_BC[note ?? ''] ?? 12);
    case 'H': return BC(130);
    case 'L': return BC(9);
    case 'A': return BC(105);
  }
  return null;
}
export const machineSrc = (name: string) => BC(MACHINE_BC[name] ?? 12);
export const hoeSrc = () => tex.hoe && { img: tex.hoe, sx: 0, sy: 0, sw: 16, sh: 16 };
export const floorSrc = () => tex.floor && { img: tex.floor, sx: 64 + 16, sy: 16, sw: 16, sh: 16 }; // Stone Floor, inner piece
export const fenceSrc = () => tex.fence && { img: tex.fence, sx: 0, sy: 0, sw: 16, sh: 32 };
export const treeSrc = () => (tex.oak ?? tex.pine) && { img: (tex.oak ?? tex.pine)!, sx: 0, sy: 0, sw: 48, sh: 96 };
// Building sheets pack several frames: ruined + repaired greenhouse, the three house levels,
// obelisk glow frames, fish pond pieces, seasonal huts. Frames are found in two passes:
//  1. split the first footprint-wide column at fully transparent rows (gaps);
//  2. a block taller than a building of this footprint could be (footprint + roof) is cut into
//     equal frames (houses: 3 levels, greenhouse: 2 states) even when they touch.
// Each frame is trimmed to its opaque pixels. The default frame per building can be changed in
// the Game graphics dialog; the choice is remembered.
const framesCache = new Map<string, Src[]>();
let houseLevel = 3;
export const setHouseLevel = (n: number) => { houseLevel = n; };
const FRAME_KEY = 'sdv-planner-v7:artFrame:';
export function buildingFrames(type: string, w: number, h: number): Src[] {
  const img = tex[type]; if (!img) return [];
  const key = `${type}:${w}x${h}`;
  const hit = framesCache.get(key); if (hit) return hit;
  const one = type === 'farmhouse' ? 160 : w * 16, fw = type === 'pond' ? Math.min(img.width, one) : img.width < one * 1.5 ? img.width : Math.min(img.width, one), H = img.height;
  const c = new OffscreenCanvas(fw, H), g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, fw, H, 0, 0, fw, H);
  const px = g.getImageData(0, 0, fw, H).data, on = (x: number, y: number) => px[(y * fw + x) * 4 + 3] > 16;
  const rowOn = (y: number) => { for (let x = 0; x < fw; x++) if (on(x, y)) return true; return false; };
  const segs: [number, number][] = [];
  for (let y = 0, start = -1, gap = 0; y <= H; y++) {
    const r = y < H && rowOn(y);
    if (r) { if (start < 0) start = y; gap = 0; }
    else if (start >= 0 && (++gap > 2 || y === H)) { segs.push([start, y - gap]); start = -1; gap = 0; }
  }
  const minH = h * 16 * 0.75, maxH = h * 16 + 112;
  let frames: [number, number][] = segs;
  if (type === 'pond') frames = [[0, Math.min(H, h * 16) - 1]]; // drawn top-down: the footprint square at the top-left
  else if (segs.some(([a, b]) => b - a + 1 > maxH)) {
    // frames touch: cut the whole sheet into equal frames of a plausible building height
    let k = 0; for (let n = 2; n <= 8 && !k; n++) if (H / n >= minH && H / n <= maxH) k = n;
    if (k) frames = Array.from({ length: k }, (_, i) => [Math.round(i * H / k), Math.round((i + 1) * H / k) - 1] as [number, number]);
  }
  const out: Src[] = [];
  for (const [a, b] of frames) {
    let x0 = fw, x1 = -1, y0 = b, y1 = a;
    for (let y = a; y <= b; y++) for (let x = 0; x < fw; x++) if (on(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= x0 && (y1 - y0 + 1) >= 8) out.push({ img, sx: x0, sy: y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1 });
  }
  framesCache.set(key, out);
  return out;
}
export function defaultFrame(type: string, frames: Src[]) {
  if (type === 'farmhouse') return Math.min(Math.max(0, houseLevel >= 2 ? 2 : houseLevel), frames.length - 1);
  if (type === 'greenhouse') return frames.length - 1; // repaired
  let best = 0; frames.forEach((f, i) => { if (f.sh * f.sw > frames[best].sh * frames[best].sw * 1.15) best = i; }); // biggest piece (pond base etc.)
  return best;
}
export const frameChoice = (type: string): number | null => { try { const v = localStorage.getItem(FRAME_KEY + type); return v === null ? null : Number(v); } catch { return null; } };
export const setFrameChoice = (type: string, i: number | null) => { try { if (i === null) localStorage.removeItem(FRAME_KEY + type); else localStorage.setItem(FRAME_KEY + type, String(i)); } catch { /* ignore */ } };
export function buildingSrc(type: string, w: number, h: number): Src | null {
  const fr = buildingFrames(type, w, h); if (!fr.length) return null;
  const pick = frameChoice(type);
  return fr[pick !== null && pick < fr.length ? pick : defaultFrame(type, fr)];
}
export const loadedBuildingTypes = () => Object.keys(KEYS).filter(k => tex[k] && k !== 'objects' && k !== 'craftables' && k !== 'hoe' && k !== 'floor' && k !== 'fence' && k !== 'oak' && k !== 'pine' && k !== 'fruit');
