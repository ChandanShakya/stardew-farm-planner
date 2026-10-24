// Interiors: Big Shed machine hall auto-layout + the cellars, from the save. 2D canvases here,
// the 3D view lives in interiors3d.ts (loaded on demand).
import type { SaveData } from './save.ts';
import { sprite } from './sprites.ts';
import { artOn, machineSrc } from './gameart.ts';

// Big Shed usable floor ≈ 17×12 (approximate). Machines go in back-to-back pairs of rows, each
// pair facing a walkway row; column 8 stays clear from the door (bottom centre) to every walkway.
export const SW = 17, SH = 12, DOOR_X = 8;
export const MACHINES = ['Keg', 'Preserves Jar', 'Dehydrator', 'Fish Smoker', 'Furnace', 'Crystalarium', 'Seed Maker', 'Loom', 'Oil Maker', 'Mayonnaise Machine', 'Cheese Press', 'Recycling Machine', 'Bone Mill', 'Charcoal Kiln', 'Geode Crusher', 'Bait Maker', 'Heavy Furnace', 'Worm Bin', 'Deluxe Worm Bin'];
export const COLORS = ['#b7793f', '#a855f7', '#f97316', '#64748b', '#ef4444', '#22d3ee', '#84cc16', '#e879f9', '#facc15', '#f9a8d4', '#fde68a', '#94a3b8', '#d6d3d1', '#78716c', '#0ea5e9', '#14b8a6', '#dc2626', '#a3e635', '#65a30d'];

export function shedLayout(counts: [string, number][]) {
  const slots: [number, number][] = [];
  for (let y = 0; y < SH - 1; y++) {
    if (y % 3 === 2) continue; // walkway rows 2, 5, 8 (+ row 11 at the door)
    for (let x = 0; x < SW; x++) if (x !== DOOR_X) slots.push([x, y]);
  }
  const placed: { name: string; x: number; y: number }[] = [];
  let k = 0;
  for (const [name, n] of counts) for (let j = 0; j < n && k < slots.length; j++, k++) placed.push({ name, x: slots[k][0], y: slots[k][1] });
  const total = counts.reduce((t, [, n]) => t + n, 0);
  return { placed, capacity: slots.length, overflow: Math.max(0, total - slots.length) };
}
export const machineCounts = (s: SaveData) =>
  MACHINES.map(n => [n, (s.placedAll[n] ?? 0) + (s.inventory[n]?.total ?? 0)] as [string, number]).filter(([, n]) => n > 0);
// the cellar you can actually walk into (older saves without cellar data fall back to "Cellar")
export const myCellar = (s: SaveData) => (s.cellars ?? []).find(c => c.owner === 'you') ?? (s.cellars ?? []).find(c => c.name === 'Cellar');

export function interiorsHTML(s: SaveData | null, view: '2d' | '3d') {
  if (!s) return '<h2>Interiors</h2><p>Load a save to lay out your machines.</p>';
  const counts = machineCounts(s), L = shedLayout(counts), mine = myCellar(s);
  const spare = (s.cellars ?? []).filter(c => c.owner === 'unassigned'), co = (s.cellars ?? []).filter(c => c.owner === 'farmhand');
  const aging = mine ? mine.casks.filter(c => c[2]).length : 0;
  const legend = counts.map(([n, c]) => `<span class="lg"><i style="background:${COLORS[MACHINES.indexOf(n)]}"></i>${n} ×${c}</span>`).join('');
  const seg = `<div class="seg doc-seg" role="tablist"><button data-iv="2d" class="${view === '2d' ? 'on' : ''}">2D</button><button data-iv="3d" class="${view === '3d' ? 'on' : ''}">3D</button></div>`;
  return `${seg}<h2>Interiors</h2>
  <p>Every machine moves inside so the field keeps every tile. In the Big Shed, machines stand in back-to-back rows facing a walkway, with a clear aisle from the door, so you can reach every machine without walking around anything.</p>
  ${view === '3d' ? `<div id="int3d" class="int3d" aria-label="3D view of the Big Shed and your cellar"></div><p class="muted">Drag to orbit · wheel to zoom. Left: Big Shed. Right: your cellar (casks glowing purple are aging).</p>` : ''}
  <h3>Big Shed machine hall — ${L.placed.length} of ${L.capacity} spots used</h3>
  <div class="legend-row">${legend}</div>
  ${view === '2d' ? `<canvas id="shedCanvas" width="${SW * 32}" height="${SH * 32}" style="width:100%;max-width:${SW * 32}px"></canvas>` : ''}
  ${L.overflow ? `<p class="badc">${L.overflow} machines don't fit. Put them in a second Big Shed, or keep only what your crop plan needs (Crops tab).</p>` : ''}
  <p class="muted">The Big Shed floor is taken as 17×12 tiles (approximate). The door is the gap at the bottom centre.</p>
  <h3>Your cellar — ${mine ? `${mine.casks.length} casks, ${aging} aging` : 'none yet'}</h3>
  ${view === '2d' && mine ? `<canvas id="cellarCanvas" width="${20 * 32}" height="${16 * 32}" style="width:100%;max-width:${20 * 32}px"></canvas>` : ''}
  <div class="rooms">
    <div class="room"><h4>What the cellar is</h4><p>The third farmhouse upgrade (Robin) adds a cellar under the house. Casks only age there: wine and cheese climb from base quality to iridium. Iridium wine sells for 2× after 56 days for most wines.</p>
      <p>${mine ? `Yours holds <b>${mine.casks.length}</b> casks${aging === mine.casks.length ? ', all of them aging something' : `, ${aging} of them aging`}. The cellar starts with 33.` : 'Upgrade the farmhouse a third time to get one. It comes with 33 casks.'}</p></div>
    <div class="room"><h4>How many casks fit</h4><p>Community-tested counts:</p><ul>
      <li><b>125</b> on PC with every cask still reachable on foot</li>
      <li><b>118</b> on mobile and Switch, where diagonal movement is more limited</li>
      <li><b>189</b> if you fill the floor completely. With no walking space, you place and fill casks working inward, then collect and remove them in reverse order.</li></ul>
      <p>${mine ? `You have room for <b>${125 - mine.casks.length}</b> more casks in the walkable layout.` : ''}</p></div>
    <div class="room"><h4>Why your save lists ${(s.cellars ?? []).length} cellars</h4><p>The game keeps one cellar per player slot. <b>Cellar</b> is yours. <b>Cellar2 to Cellar8</b> are reserved for co-op farmhands, one per cabin.</p>
      <p>${spare.length ? `In your save, ${spare.map(c => c.name).join(', ')} are unassigned, so nobody can enter them in solo play. Their ${spare.reduce((t, c) => t + c.casks.length, 0)} empty casks can't be reached or used.` : ''}${co.length ? ` ${co.map(c => c.name).join(', ')} belong to your farmhands.` : ''}</p></div>
    <div class="room"><h4>How to get more than one cellar</h4><p>Only through co-op. Build a Cabin (Robin), invite a farmhand, and have them upgrade their cabin like a farmhouse. The final upgrade gives that cabin its own cellar, one of Cellar2 to Cellar8. Each cellar belongs to its cabin's player.</p>
      <p>Playing solo, you get one cellar. To age more at once, pack more casks into it.</p></div>
  </div>`;
}

export function drawShed(s: SaveData | null) {
  const cv = document.getElementById('shedCanvas') as HTMLCanvasElement | null;
  if (!cv || !s) return;
  const L = shedLayout(machineCounts(s));
  const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { g.fillStyle = (x + y) % 2 ? '#6b4f36' : '#735640'; g.fillRect(x * 32, y * 32, 32, 32); }
  g.fillStyle = 'rgba(255,255,255,.06)';
  for (let y = 0; y < SH; y++) if (y % 3 === 2 || y === SH - 1) g.fillRect(0, y * 32, SW * 32, 32);
  g.fillRect(DOOR_X * 32, 0, 32, SH * 32);
  g.fillStyle = '#2b1a0e'; g.fillRect(DOOR_X * 32 + 4, (SH - 1) * 32 + 8, 24, 24);
  for (const m of L.placed) {
    g.fillStyle = COLORS[MACHINES.indexOf(m.name)]; g.fillRect(m.x * 32 + 2, m.y * 32 + 26, 28, 4);
    const real = artOn() ? machineSrc(m.name) : null;
    if (real) g.drawImage(real.img, real.sx, real.sy, real.sw, real.sh, m.x * 32 + 8, m.y * 32 - 6, 16, 32);
    else g.drawImage(sprite(m.name === 'Preserves Jar' ? 'J' : 'M') as CanvasImageSource, m.x * 32, m.y * 32 - 2, 32, 32);
  }
}

// Cellar floor plan with the casks at their real save positions (aging ones glow).
export function drawCellar(s: SaveData | null) {
  const cv = document.getElementById('cellarCanvas') as HTMLCanvasElement | null;
  const mine = s && myCellar(s);
  if (!cv || !mine) return;
  const g = cv.getContext('2d')!, T = 32, cw = 20, ch = 16;
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { g.fillStyle = (x * 7 + y * 3) % 5 ? '#4a4038' : '#544a40'; g.fillRect(x * T, y * T, T, T); }
  g.fillStyle = '#2a170b'; g.fillRect(0, 0, cw * T, T * 2); // back wall
  g.fillStyle = '#5c3218'; g.fillRect(2 * T, T, T * 2, T); // stairs up to the house
  g.fillStyle = '#f4d495'; g.font = "600 13px 'Pixelify Sans', monospace"; g.fillText('stairs', 2 * T + 6, T + 20);
  for (const [x, y, aging] of mine.casks) {
    if (x >= cw || y >= ch) continue;
    g.fillStyle = '#5a3a1e'; g.fillRect(x * T + 3, y * T + 6, T - 6, T - 10);
    g.fillStyle = '#8b5a2b'; g.fillRect(x * T + 5, y * T + 8, T - 10, T - 14);
    g.fillStyle = '#c0c4c8'; g.fillRect(x * T + 3, y * T + 11, T - 6, 2); g.fillRect(x * T + 3, y * T + T - 10, T - 6, 2);
    if (aging) { g.fillStyle = '#c084fc'; g.fillRect(x * T + 12, y * T + 2, 8, 6); }
  }
}
