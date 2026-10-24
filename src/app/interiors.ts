// Interiors: Big Shed machine hall auto-layout + cellar cask count, from the save's machines.
import type { SaveData } from './save.ts';
import { sprite } from './sprites.ts';
import { artOn, machineSrc } from './gameart.ts';

// Big Shed usable floor ≈ 17×12 (approximate). Machines go in back-to-back pairs of rows, each
// pair facing a walkway row; column 8 stays clear from the door (bottom centre) to every walkway.
const SW = 17, SH = 12, DOOR_X = 8;
const MACHINES = ['Keg', 'Preserves Jar', 'Dehydrator', 'Fish Smoker', 'Furnace', 'Crystalarium', 'Seed Maker', 'Loom', 'Oil Maker', 'Mayonnaise Machine', 'Cheese Press', 'Recycling Machine', 'Bone Mill', 'Charcoal Kiln', 'Geode Crusher', 'Bait Maker', 'Heavy Furnace', 'Worm Bin', 'Deluxe Worm Bin'];
const COLORS = ['#b7793f', '#a855f7', '#f97316', '#64748b', '#ef4444', '#22d3ee', '#84cc16', '#e879f9', '#facc15', '#f9a8d4', '#fde68a', '#94a3b8', '#d6d3d1', '#78716c', '#0ea5e9', '#14b8a6', '#dc2626', '#a3e635', '#65a30d'];

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

export function interiorsHTML(s: SaveData | null) {
  if (!s) return '<h2>Interiors</h2><p>Load a save to lay out your machines.</p>';
  const own = (n: string) => (s.placedAll[n] ?? 0) + (s.inventory[n]?.total ?? 0);
  const counts = MACHINES.map(n => [n, own(n)] as [string, number]).filter(([, n]) => n > 0);
  const L = shedLayout(counts);
  const casks = Object.entries(s.placedBy).filter(([k]) => k.startsWith('Cellar')).map(([k, o]) => [k, o.Cask ?? 0] as [string, number]);
  const legend = counts.map(([n, c]) => `<span class="lg"><i style="background:${COLORS[MACHINES.indexOf(n)]}"></i>${n} ×${c}</span>`).join('');
  return `<h2>Interiors</h2>
  <p>Every machine moves inside so the field keeps every tile. Layout: machines in back-to-back rows, each pair facing a walkway, and a clear aisle from the door. You can reach every machine without walking around anything.</p>
  <h3>Big Shed machine hall — ${L.placed.length} of ${L.capacity} spots used</h3>
  <div class="legend-row">${legend}</div>
  <canvas id="shedCanvas" width="${SW * 32}" height="${SH * 32}" style="width:100%;max-width:${SW * 32}px;image-rendering:pixelated;border-radius:10px;border:1px solid var(--line2)"></canvas>
  ${L.overflow ? `<p class="badc">${L.overflow} machines don't fit — put them in a second Big Shed, or keep only what your crop plan needs (Crops &amp; profit tab).</p>` : ''}
  <p class="muted">Big Shed floor taken as 17×12 tiles (approximate); the door is the gap at the bottom centre.</p>
  <h3>Cellars — ${casks.reduce((t, [, n]) => t + n, 0)} casks</h3>
  <table class="t"><tr><th>Cellar</th><th class="n">Casks</th></tr>${casks.map(([k, n]) => `<tr><td>${k}</td><td class="n">${n}</td></tr>`).join('')}</table>
  <p class="muted">Casks only age in the cellar. Ancient Fruit and Starfruit wine gain the most (iridium = 2× value after 56 days).</p>`;
}

export function drawShed(s: SaveData | null) {
  const cv = document.getElementById('shedCanvas') as HTMLCanvasElement | null;
  if (!cv || !s) return;
  const own = (n: string) => (s.placedAll[n] ?? 0) + (s.inventory[n]?.total ?? 0);
  const L = shedLayout(MACHINES.map(n => [n, own(n)] as [string, number]).filter(([, n]) => n > 0));
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
