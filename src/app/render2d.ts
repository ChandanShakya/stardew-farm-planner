// 2D canvas renderer: a 16px-per-tile world layer (rebuilt only when the plan changes) drawn
// through a pan/zoom camera at devicePixelRatio, plus screen-space labels and overlays.
import { BUILDINGS, type Analysis, type PB, type Plan } from './engine.ts';
import { floorTile, hoeTile, sprite, terrainTile } from './sprites.ts';
import { artOn, buildingSrc, fenceSrc, floorSrc, hoeSrc, itemSrc, treeSrc, type Src } from './gameart.ts';

export const TILE = 16;
export type Overlays = { water: boolean; junimo: boolean; crow: boolean; problems: boolean; grid: boolean; labels: boolean; diff?: boolean };
export type Cam = { x: number; y: number; z: number }; // world px at screen origin, zoom (screen px per world px)

const mk = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// ground3d: texture for the 3D view — items that exist as 3D meshes are left off (only soil/paths).
export function buildWorld(p: Plan, ground3d = false): HTMLCanvasElement {
  const c = mk(p.w * TILE, p.h * TILE), g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const real = artOn();
  const blit = (s: Src, x: number, y: number, w = s.sw, h = s.sh) => g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x, y, w, h);
  const tall: { y: number; draw: () => void }[] = []; // sprites taller than a tile, drawn back-to-front
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = y * p.w + x, v = (x * 7 + y * 13) & 3, X = x * TILE, Y = y * TILE;
    g.drawImage(terrainTile(p.base[i], v) as CanvasImageSource, X, Y);
    const t = p.tiles[i];
    if (!t) continue;
    if (ground3d && t !== 'P') { if (t === 'C' || t === 'D') g.drawImage(hoeTile() as CanvasImageSource, X, Y); continue; }
    if (real) {
      if (t === 'P') { const s = floorSrc(); s ? blit(s, X, Y) : g.drawImage(floorTile(v) as CanvasImageSource, X, Y); continue; }
      if (t === 'C' || t === 'D') { const s = hoeSrc(); s ? blit(s, X, Y) : g.drawImage(hoeTile() as CanvasImageSource, X, Y); }
      if (t === 'D') continue;
      if (t === 'T' || t === 'A') { const s = treeSrc(); if (s) { tall.push({ y, draw: () => { blit(s, X - 16, Y - 80); if (t === 'A') { const tp = itemSrc('A'); if (tp) blit(tp, X, Y - 16); } } }); continue; } }
      if (t === 'F') { const s = fenceSrc(); if (s) { tall.push({ y, draw: () => blit(s, X, Y - 16) }); continue; } }
      const s = itemSrc(t, p.notes?.[i]);
      if (s) {
        if (t === 'C') blit(s, X + 2, Y + 1, 12, 12);
        else if (s.sh > 16) tall.push({ y, draw: () => blit(s, X, Y - 16) });
        else blit(s, X, Y);
        continue;
      }
    }
    if (t === 'P') { g.drawImage(floorTile(v) as CanvasImageSource, X, Y); continue; }
    if (t === 'C' || t === 'D') g.drawImage(hoeTile() as CanvasImageSource, X, Y);
    if (t !== 'D') g.drawImage(sprite(t) as CanvasImageSource, X, Y);
  }
  if (ground3d) return c;
  for (const b of p.buildings) {
    const s = real ? buildingSrc(b.type, b.w) : null;
    if (s) tall.push({ y: b.y + b.h - 1, draw: () => { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(b.x * TILE + 3, b.y * TILE + 4, b.w * TILE, b.h * TILE); blit(s, b.x * TILE + (b.w * TILE - s.sw) / 2, (b.y + b.h) * TILE - s.sh); } });
    else tall.push({ y: b.y + b.h - 1, draw: () => drawBuilding(g, b) });
  }
  tall.sort((a, b) => a.y - b.y).forEach(d => d.draw());
  return c;
}

function drawBuilding(g: CanvasRenderingContext2D, b: PB) {
  const d = BUILDINGS[b.type] ?? BUILDINGS.well, X = b.x * TILE, Y = b.y * TILE, W = b.w * TILE, H = b.h * TILE;
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(X + 3, Y + 4, W, H);
  if (b.type === 'pond') {
    g.fillStyle = '#8d8478'; g.fillRect(X, Y, W, H);
    g.fillStyle = '#6f675c'; for (let k = 0; k < W; k += 8) { g.fillRect(X + k, Y, 4, 3); g.fillRect(X + k + 4, Y + H - 3, 4, 3); }
    g.fillStyle = '#2f6f9f'; g.fillRect(X + 6, Y + 6, W - 12, H - 12);
    g.fillStyle = '#5ba3d0'; g.fillRect(X + 10, Y + 12, 10, 2); g.fillRect(X + W - 26, Y + H - 22, 12, 2);
    g.fillStyle = '#f97316'; g.fillRect(X + W / 2 - 4, Y + H / 2, 8, 3); g.fillRect(X + W / 2 + 4, Y + H / 2 - 1, 3, 5);
    return;
  }
  if (b.type.endsWith('ob') || b.type === 'clock') {
    g.fillStyle = '#9e9688'; g.fillRect(X, Y + H - 12, W, 12);
    g.fillStyle = d.roof; g.beginPath(); g.moveTo(X + W / 2, Y - 18); g.lineTo(X + W / 2 + 12, Y + H - 10); g.lineTo(X + W / 2 - 12, Y + H - 10); g.closePath(); g.fill();
    g.fillStyle = d.color; g.beginPath(); g.moveTo(X + W / 2, Y - 14); g.lineTo(X + W / 2 + 6, Y + H - 12); g.lineTo(X + W / 2 - 6, Y + H - 12); g.closePath(); g.fill();
    if (b.type === 'clock') { g.fillStyle = '#fff7d6'; g.beginPath(); g.arc(X + W / 2, Y + 4, 6, 0, 7); g.fill(); g.strokeStyle = '#6b4a12'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X + W / 2, Y + 4); g.lineTo(X + W / 2, Y); g.moveTo(X + W / 2, Y + 4); g.lineTo(X + W / 2 + 3, Y + 5); g.stroke(); }
    return;
  }
  // walls
  g.fillStyle = d.color; g.fillRect(X, Y, W, H);
  // roof: top 60%, gabled shading
  const rh = Math.max(TILE * 0.8, H * 0.6);
  const grad = g.createLinearGradient(X, Y, X, Y + rh);
  grad.addColorStop(0, shade(d.roof, 1.25)); grad.addColorStop(1, shade(d.roof, 0.8));
  g.fillStyle = grad; g.fillRect(X - 2, Y - 3, W + 4, rh + 3);
  g.fillStyle = 'rgba(255,255,255,.12)'; for (let k = Y; k < Y + rh; k += 4) g.fillRect(X - 2, k, W + 4, 1);
  g.fillStyle = shade(d.roof, 0.6); g.fillRect(X - 2, Y + rh, W + 4, 2);
  if (b.type === 'greenhouse') { g.fillStyle = 'rgba(200,255,240,.55)'; for (let k = 0; k < W; k += 10) g.fillRect(X + k + 2, Y + 2, 6, rh - 4); }
  if (b.type === 'junimo') { g.fillStyle = '#7ad151'; g.beginPath(); g.arc(X + W / 2, Y + rh / 2, 4, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(X + W / 2 - 1, Y + rh / 2 - 2, 2, 2); }
  if (b.type === 'silo') { g.fillStyle = shade(d.color, 1.15); g.beginPath(); g.ellipse(X + W / 2, Y + H / 2, W / 2 - 2, H / 2 - 2, 0, 0, 7); g.fill(); g.fillStyle = d.roof; g.beginPath(); g.ellipse(X + W / 2, Y + H / 2 - 4, W / 2 - 6, H / 2 - 8, 0, 0, 7); g.fill(); }
  if (b.type === 'slime') { g.fillStyle = '#86efac'; for (const [u, v] of [[0.25, 0.8], [0.5, 0.85], [0.75, 0.8]]) { g.beginPath(); g.arc(X + W * u, Y + H * v, 4, 0, 7); g.fill(); } }
  if (b.type === 'bin') { g.fillStyle = '#5a3a1e'; g.fillRect(X + 2, Y + 2, W - 4, H - 4); g.fillStyle = '#c08a4b'; g.fillRect(X + 3, Y + 3, W - 6, 4); }
  if (d.door) { g.fillStyle = '#3b2414'; g.fillRect(X + d.door[0] * TILE + 3, Y + d.door[1] * TILE + 2, TILE - 6, TILE - 2); }
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1; g.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1);
}
const SHORT: Record<string, string> = { earthob: 'Earth', waterob: 'Water', desertob: 'Desert', islandob: 'Island', clock: 'Clock', bin: 'Bin', petbowl: 'Bowl', greenhouse: 'GH', farmhouse: 'House', slime: 'Slime', pond: 'Pond', barn: 'Barn', coop: 'Coop', shed: 'Shed' };
export function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16), c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// 1px-per-tile overlay images, scaled up with nearest-neighbour.
export function overlayImage(p: Plan, a: Analysis, ov: Overlays, diff?: Uint8Array | null) {
  const c = mk(p.w, p.h), g = c.getContext('2d')!, img = g.createImageData(p.w, p.h);
  const put = (i: number, r: number, gg: number, b: number, al: number) => {
    const o = i * 4, k = al / 255, ik = 1 - k * (img.data[o + 3] ? 1 : 0);
    img.data[o] = img.data[o] * ik + r * k; img.data[o + 1] = img.data[o + 1] * ik + gg * k; img.data[o + 2] = img.data[o + 2] * ik + b * k;
    img.data[o + 3] = Math.max(img.data[o + 3], al);
  };
  for (let i = 0; i < p.w * p.h; i++) {
    if (ov.junimo && a.junimo[i]) put(i, 250, 204, 21, 70);
    if (ov.crow && p.rules.crows && a.crow[i]) put(i, 249, 115, 22, 60);
    if (ov.water && a.water[i]) put(i, 56, 189, 248, 95);
  }
  if (ov.diff && diff) for (let i = 0; i < diff.length; i++) {
    if (diff[i] === 1) put(i, 74, 222, 128, 150); else if (diff[i] === 2) put(i, 239, 68, 68, 150); else if (diff[i] === 3) put(i, 251, 191, 36, 150);
  }
  if (ov.problems) for (const i of [...a.bad.water, ...a.bad.junimo, ...a.bad.crow, ...a.bad.placement]) put(i, 239, 68, 68, 220);
  g.putImageData(img, 0, 0);
  return c;
}

// One canvas per overlay so each can fade / reveal on its own.
export type OvKey = 'junimo' | 'crow' | 'water' | 'diff' | 'problems';
export type OvDraw = { img: HTMLCanvasElement; alpha: number; reveal: number };
export function overlayLayers(p: Plan, a: Analysis, diff?: Uint8Array | null): Partial<Record<OvKey, HTMLCanvasElement>> {
  const out: Partial<Record<OvKey, HTMLCanvasElement>> = {};
  const layer = (k: OvKey, fill: (put: (i: number, r: number, g: number, b: number, al: number) => void) => void) => {
    const c = mk(p.w, p.h), g = c.getContext('2d')!, img = g.createImageData(p.w, p.h);
    fill((i, r, gg, b, al) => { const o = i * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = al; });
    g.putImageData(img, 0, 0); out[k] = c;
  };
  layer('junimo', put => { for (let i = 0; i < a.junimo.length; i++) if (a.junimo[i]) put(i, 250, 204, 21, 70); });
  if (p.rules.crows) layer('crow', put => { for (let i = 0; i < a.crow.length; i++) if (a.crow[i]) put(i, 249, 115, 22, 60); });
  layer('water', put => { for (let i = 0; i < a.water.length; i++) if (a.water[i]) put(i, 56, 189, 248, 95); });
  if (diff) layer('diff', put => { for (let i = 0; i < diff.length; i++) { if (diff[i] === 1) put(i, 74, 222, 128, 150); else if (diff[i] === 2) put(i, 239, 68, 68, 150); else if (diff[i] === 3) put(i, 251, 191, 36, 150); } });
  layer('problems', put => { for (const i of [...a.bad.water, ...a.bad.junimo, ...a.bad.crow, ...a.bad.placement]) put(i, 239, 68, 68, 220); });
  return out;
}

export function drawView(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement, dpr: number, p: Plan, world: HTMLCanvasElement,
  over: HTMLCanvasElement | OvDraw[] | null, cam: Cam, ov: Overlays, hover: { x: number; y: number; w: number; h: number; ok: boolean } | null,
  rect: { x0: number; y0: number; x1: number; y1: number } | null, accent: string) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0f1412'; ctx.fillRect(0, 0, cv.width, cv.height);
  const s = cam.z * dpr;
  ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(world, 0, 0);
  if (over instanceof HTMLCanvasElement) ctx.drawImage(over, 0, 0, p.w * TILE, p.h * TILE);
  else if (over) for (const o of over) {
    if (o.alpha <= 0.01) continue;
    ctx.save(); ctx.globalAlpha = Math.min(1, o.alpha);
    if (o.reveal < 1) { // circular reveal from the map centre
      const W = p.w * TILE, H = p.h * TILE, r = Math.hypot(W, H) / 2 * (1 - Math.pow(1 - o.reveal, 3));
      ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2); ctx.clip();
    }
    ctx.drawImage(o.img, 0, 0, p.w * TILE, p.h * TILE); ctx.restore();
  }
  if (ov.grid && cam.z >= 1.2) {
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1 / s; ctx.beginPath();
    for (let x = 0; x <= p.w; x++) { ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, p.h * TILE); }
    for (let y = 0; y <= p.h; y++) { ctx.moveTo(0, y * TILE); ctx.lineTo(p.w * TILE, y * TILE); }
    ctx.stroke();
  }
  if (rect) {
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.strokeStyle = accent; ctx.lineWidth = 2 / s;
    const x = Math.min(rect.x0, rect.x1), y = Math.min(rect.y0, rect.y1), w = Math.abs(rect.x1 - rect.x0) + 1, h = Math.abs(rect.y1 - rect.y0) + 1;
    ctx.fillRect(x * TILE, y * TILE, w * TILE, h * TILE); ctx.strokeRect(x * TILE, y * TILE, w * TILE, h * TILE);
  }
  if (hover) {
    ctx.strokeStyle = hover.ok ? accent : '#ef4444'; ctx.lineWidth = 2 / s;
    ctx.fillStyle = hover.ok ? 'rgba(74,222,128,.15)' : 'rgba(239,68,68,.2)';
    ctx.fillRect(hover.x * TILE, hover.y * TILE, hover.w * TILE, hover.h * TILE);
    ctx.strokeRect(hover.x * TILE, hover.y * TILE, hover.w * TILE, hover.h * TILE);
  }
  // screen-space labels (crisp text at any zoom)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (ov.labels) {
    const z = cam.z * TILE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let hutN = 0;
    const placed: [number, number, number, number][] = [];
    for (const b of p.buildings) {
      const d = BUILDINGS[b.type]; if (!d) continue;
      if (z * b.w < 26) { if (b.type === 'junimo') hutN++; continue; }
      const full = b.type === 'junimo' ? 'H' + ++hutN : (b.label && b.label !== d.name && !b.label.startsWith('Starting') ? b.label : d.name);
      const fs = Math.max(9, Math.min(13, z * 0.5));
      ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
      // too wide for the footprint? fall back to the short name (Earth Obelisk -> Earth)
      const name = ctx.measureText(full).width > z * b.w * 1.15 ? SHORT[b.type] ?? full.split(' ')[0] : full;
      const cx = (b.x + b.w / 2) * z - cam.x * cam.z, cy = (b.y + b.h / 2) * z - cam.y * cam.z;
      const tw = ctx.measureText(name).width + 10, th = fs * 1.6;
      const r: [number, number, number, number] = [cx - tw / 2, cy - th / 2, tw, th];
      if (placed.some(q => r[0] < q[0] + q[2] && q[0] < r[0] + r[2] && r[1] < q[1] + q[3] && q[1] < r[1] + r[3])) continue;
      placed.push(r);
      ctx.fillStyle = 'rgba(10,14,12,.78)'; ctx.beginPath(); ctx.roundRect(r[0], r[1], tw, th, 5); ctx.fill();
      ctx.fillStyle = '#f1f5f2'; ctx.fillText(name, cx, cy + 0.5);
    }
  }
}
