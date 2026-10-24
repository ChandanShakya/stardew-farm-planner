// Original 16x16 pixel-art sprites (drawn for this planner; no game assets are bundled).
// Each sprite is a 16-row string map; '.' is transparent, other chars index the palette.
type Sprite = { pal: Record<string, string>; rows: string[] };

const S: Record<string, Sprite> = {
  C: { pal: { g: '#3f9b3a', l: '#7bd35a', d: '#2b6b2a', b: '#4f7ad8', s: '#7a5230' }, rows: [
    '................', '................', '.......l........', '......lgl..l....', '..l...lgl.lgl...', '.lgl..lgg.lgl...',
    '.lggl.lgg.gg....', '..lgg.lgglgd.l..', '...dgglgggd.lgl.', '....dgggggdlggl.', '..b..dgggdggd...', '.bbb..dggdd..b..',
    '..b...sggs..bbb.', '.......ss....b..', '................', '................'] },
  I: { pal: { a: '#e7e3ff', b: '#a78bfa', c: '#6d28d9', d: '#3b0f8a', w: '#7dd3fc' }, rows: [
    '................', '.......w........', '...w..www..w....', '....w.www.w.....', '.....aaaaa......', '....abbbbba.....',
    '...abbcccbba....', '...abcdddcba....', '...abcdwdcba....', '...abcdddcba....', '...abbcccbba....', '....abbbbba.....',
    '.....aaaaa......', '......ddd.......', '.....ddddd......', '................'] },
  Q: { pal: { a: '#fff4c2', b: '#f5c542', c: '#b7791f', d: '#6b4410', w: '#7dd3fc' }, rows: [
    '................', '................', '.......w........', '.....w.w.w......', '......www.......', '.....aaaaa......',
    '....abbbbba.....', '....abcccba.....', '....abcdcba.....', '....abcccba.....', '....abbbbba.....', '.....aaaaa......',
    '......ddd.......', '.....ddddd......', '................', '................'] },
  S: { pal: { a: '#e5e7eb', b: '#9ca3af', c: '#4b5563', w: '#7dd3fc' }, rows: [
    '................', '................', '................', '.......w........', '......www.......', '......aaa.......',
    '.....abbba......', '.....abcba......', '.....abbba......', '......aaa.......', '.......c........', '......ccc.......',
    '................', '................', '................', '................'] },
  R: { pal: { h: '#e2b53c', k: '#a87a12', f: '#f1d6a0', e: '#2b2b2b', s: '#d8b25c', c: '#7c3aed', p: '#6b4a2b' }, rows: [
    '......hh........', '.....hhhh.......', '...kkhhhhkk.....', '..kkkkkkkkkk....', '.....ffff.......', '.....fefe.......',
    '.....ffff.......', '..sssccccsss....', '.sssscccccsss...', '.s..cccccc..s...', '....cccccc......', '.....cccc.......',
    '.......p........', '.......p........', '......ppp.......', '................'] },
  r: { pal: { h: '#8b5a2b', f: '#f1d6a0', e: '#2b2b2b', s: '#d8b25c', c: '#3f7d4e', p: '#6b4a2b' }, rows: [
    '................', '......hh........', '....hhhhhh......', '.....ffff.......', '.....fefe.......', '.....ffff.......',
    '..ssscccccsss...', '.s..cccccc..s...', '....cccccc......', '.....cccc.......', '.......p........', '.......p........',
    '.......p........', '......ppp.......', '................', '................'] },
  F: { pal: { a: '#c08a4b', b: '#8b5a2b', c: '#5a3a1e' }, rows: [
    '................', '................', '.aab........aab.', '.aab........aab.', '.aabaaaaaaaaaab.', '.aabbbbbbbbbbab.',
    '.aab........aab.', '.aab........aab.', '.aabaaaaaaaaaab.', '.aabbbbbbbbbbab.', '.aab........aab.', '.aab........aab.',
    '.ccc........ccc.', '................', '................', '................'] },
  G: { pal: { a: '#c08a4b', b: '#8b5a2b', y: '#e2b53c' }, rows: [
    '................', '................', '.ab..........ab.', '.ab..........ab.', '.abaaaaaaaaaaab.', '.ab.b..b..b..ab.',
    '.ab..b.b.b...ab.', '.ab...yby....ab.', '.ab..b.b.b...ab.', '.ab.b..b..b..ab.', '.abaaaaaaaaaaab.', '.ab..........ab.',
    '................', '................', '................', '................'] },
  T: { pal: { g: '#2f7d32', l: '#4caf50', d: '#1b5e20', t: '#6d4c2f' }, rows: [
    '.......l........', '......lgl.......', '.....lgggl......', '....lgggggl.....', '.....dgggd......', '....lggggggl....',
    '...lggggggggl...', '....dggggggd....', '...lggggggggl...', '..lggggggggggl..', '..dddggggggddd..', '.....dddddd.....',
    '.......tt.......', '.......tt.......', '......tttt......', '................'] },
  A: { pal: { g: '#2f7d32', l: '#4caf50', d: '#1b5e20', t: '#6d4c2f', b: '#9ca3af', m: '#c2410c' }, rows: [
    '.......l........', '......lgl.......', '.....lgggl......', '....lgggggl.....', '...lggggggggl...', '....dggggggd....',
    '...lggggggggl...', '..lggggggggggl..', '..dddggggggddd..', '.....dddddd.....', '.......tt.......', '.......ttbbb....',
    '.......ttbmb....', '.......ttbbb....', '......tttt......', '................'] },
  U: { pal: { g: '#3f9b3a', l: '#7bd35a', t: '#6d4c2f', o: '#f97316', r: '#ef4444' }, rows: [
    '................', '.....llll.......', '...llggggll.....', '..lggoggggrl....', '..lgggggoggl....', '.lggrgggggggl...',
    '.lgggggggoggl...', '..lgoggggggl....', '..llgggrggll....', '....llllll......', '......tt........', '......tt........',
    '......tt........', '.....tttt.......', '................', '................'] },
  E: { pal: { a: '#e7c27d', b: '#b0813f', c: '#6b4a2b', y: '#facc15', k: '#1f2937' }, rows: [
    '................', '................', '....cccccccc....', '...cbbbbbbbbc...', '...caaaaaaaac...', '...cbbbbbbbbc...',
    '...caaayyaaac...', '...cbbykkybbc...', '...caaayyaaac...', '...cbbbbbbbbc...', '...caaaaaaaac...', '...cbbbbbbbbc...',
    '....c......c....', '....c......c....', '................', '................'] },
  M: { pal: { a: '#b7793f', b: '#7a4b22', c: '#d1d5db', d: '#4b5563' }, rows: [
    '................', '................', '.....aaaaaa.....', '....abbbbbba....', '....cccccccc....', '....abbbbbba....',
    '....abaaaaba....', '....abaaaaba....', '....cccccccc....', '....abaaaaba....', '....abaaaaba....', '....abbbbbba....',
    '....cccccccc....', '.....dddddd.....', '................', '................'] },
  J: { pal: { g: '#cbd5e1', w: '#f8fafc', l: '#94a3b8', f: '#c084fc', d: '#7e22ce', b: '#8b5a2b' }, rows: [
    '................', '................', '.....bbbbbb.....', '.....llllll.....', '....gwwwwwwg....', '....gwfffffg....',
    '....gwfdfffg....', '....gffffdfg....', '....gfdffffg....', '....gffffffg....', '....gfffdffg....', '....gffffffg....',
    '.....gggggg.....', '................', '................', '................'] },
  H: { pal: { a: '#c98b4a', b: '#8b5a2b', c: '#5a3a1e', y: '#facc15' }, rows: [
    '................', '................', '................', '...cccccccccc...', '..caaaaaaaaaac..', '..cabbbbbbbbac..',
    '..cccccccccccc..', '..caaaaayaaaac..', '..caaaayyyaaac..', '..cbbbbbbbbbbc..', '..caaaaaaaaaac..', '..cbbbbbbbbbbc..',
    '..cccccccccccc..', '................', '................', '................'] },
  L: { pal: { a: '#d1d5db', b: '#6b7280', y: '#facc15' }, rows: [
    '.......y........', '......yy........', '.......a........', '.......a........', '.......a........', '......aba.......',
    '.......a........', '.......a........', '.......a........', '......aba.......', '.......a........', '.......a........',
    '.....bbbbb......', '....bbbbbbb.....', '................', '................'] },
  O: { pal: { a: '#a8a29e', b: '#57534e' }, rows: [
    '................', '................', '................', '................', '.....aaaaaa.....', '....abbbbbba....',
    '....ab....ba....', '....ab....ba....', '....ab....ba....', '....ab....ba....', '....abbbbbba....', '.....aaaaaa.....',
    '................', '................', '................', '................'] },
  Z: { pal: { a: '#8d6e63', b: '#5d4037', c: '#a1887f' }, rows: [
    '................', '................', '................', '................', '.....cccccc.....', '....caaaaaac....',
    '...caabbbbaac...', '...cabaaaabac...', '...cabaaaabac...', '...caabbbbaac...', '...baaaaaaaab...', '..bbbaaaaaabbb..',
    '..b..bbbbbb..b..', '................', '................', '................'] },
  W: { pal: { g: '#4caf50', l: '#81c784' }, rows: [
    '................', '................', '................', '................', '................', '....l.....l.....',
    '...lg..l..lg....', '...g..lg..g..l..', '..lg..g..lg..lg.', '..g..lg..g...g..', '.....g..........', '................',
    '................', '................', '................', '................'] },
};

const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
const make = (w: number, h: number) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));

export function sprite(code: string) {
  let c = cache.get(code);
  if (c) return c;
  const s = S[code];
  c = make(16, 16);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  if (s) s.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = s.pal[ch]; g.fillRect(x, y, 1, 1); } }));
  cache.set(code, c);
  return c;
}
export const hasSprite = (code: string) => code in S;

// Terrain tiles: deterministic noise so soil/grass/water read as texture, not flat colour.
const TERR: Record<string, [string, string, string]> = {
  d: ['#8a6a43', '#7b5d39', '#9a7a4f'], D: ['#8a6a43', '#7b5d39', '#9a7a4f'], s: ['#e8d29a', '#dcc283', '#f2e0b0'],
  g: ['#5e9e45', '#548f3d', '#6aad50'], p: ['#a3896a', '#94795b', '#b19779'], w: ['#c4a675', '#b39360', '#d1b585'],
  '~': ['#3f7fae', '#36719d', '#5b97c2'], X: ['#24452c', '#1d3a25', '#2e5536'], o: ['#6b5a45', '#5d4d3a', '#7a6852'],
};
export const TERRAIN_COLOR = Object.fromEntries(Object.entries(TERR).map(([k, v]) => [k, v[0]]));
export function terrainTile(code: string, variant: number) {
  const key = 't' + code + (variant & 3);
  let c = cache.get(key);
  if (c) return c;
  c = make(16, 16);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const [base, dark, light] = TERR[code] ?? TERR.X;
  g.fillStyle = base; g.fillRect(0, 0, 16, 16);
  let s = (code.charCodeAt(0) * 31 + variant * 977) | 0;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < 18; k++) { g.fillStyle = r() < 0.5 ? dark : light; g.fillRect((r() * 16) | 0, (r() * 16) | 0, code === '~' ? 3 : 1, 1); }
  if (code === 'X') { g.fillStyle = '#1a3321'; g.beginPath(); g.arc(8, 8, 6, 0, 7); g.fill(); g.fillStyle = '#2f5d3a'; g.beginPath(); g.arc(6, 6, 3, 0, 7); g.fill(); }
  cache.set(key, c);
  return c;
}
// Path/flooring tile: stone pavers.
export function floorTile(variant: number) {
  const key = 'floor' + (variant & 3);
  let c = cache.get(key);
  if (c) return c;
  c = make(16, 16);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#6f6a62'; g.fillRect(0, 0, 16, 16);
  const stones = variant & 1 ? [[1, 1, 6, 6], [8, 1, 7, 5], [1, 8, 5, 7], [7, 7, 8, 8]] : [[1, 1, 8, 5], [10, 1, 5, 7], [1, 7, 6, 8], [8, 9, 7, 6]];
  for (const [x, y, w, h] of stones) { g.fillStyle = '#a8a29e'; g.fillRect(x, y, w, h); g.fillStyle = '#c4beb7'; g.fillRect(x, y, w, 1); g.fillStyle = '#857f77'; g.fillRect(x, y + h - 1, w, 1); }
  cache.set(key, c);
  return c;
}
export function hoeTile() {
  let c = cache.get('hoe');
  if (c) return c;
  c = make(16, 16);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#5b4026'; g.fillRect(1, 1, 14, 14); g.fillStyle = '#4a321d';
  for (let y = 3; y < 15; y += 4) g.fillRect(2, y, 12, 1);
  cache.set('hoe', c);
  return c;
}
// Icon for UI buttons (data URL), scaled crisp.
export function iconURL(code: string, size = 32) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  if (code === 'P') g.drawImage(floorTile(0) as CanvasImageSource, 0, 0, size, size);
  else g.drawImage(sprite(code) as CanvasImageSource, 0, 0, size, size);
  return c.toDataURL();
}
