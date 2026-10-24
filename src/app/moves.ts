// Current → target migration: tile diff (for the map overlay) and an ordered in-game checklist.
// Coordinates are game tile coordinates (same as the save and the Inspector).
import { BUILDINGS, ITEMS, occupancy, type PB, type Plan } from './engine.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const f = (n: number) => n.toLocaleString('en-US');
// Items that are just ground state, not things you carry around.
const GROUND = new Set(['', 'W', 'D']);

// 0 same · 1 add · 2 remove · 3 change
export function diffTiles(cur: Plan, tgt: Plan) {
  const N = tgt.w * tgt.h, out = new Uint8Array(N);
  if (cur.w !== tgt.w || cur.h !== tgt.h) return out;
  const oc = occupancy(cur), ot = occupancy(tgt);
  const key = (p: Plan, occ: Int32Array, i: number) => occ[i] >= 0 ? 'b:' + p.buildings[occ[i]].type + '@' + p.buildings[occ[i]].x + ',' + p.buildings[occ[i]].y : GROUND.has(p.tiles[i]) ? '' : p.tiles[i];
  for (let i = 0; i < N; i++) {
    const a = key(cur, oc, i), b = key(tgt, ot, i);
    if (a === b) continue;
    out[i] = !a ? 1 : !b ? 2 : 3;
  }
  return out;
}

// Pair each target building with the nearest current building of the same type (greedy).
function matchBuildings(cur: PB[], tgt: PB[]) {
  const left = [...cur.filter(b => !b.fixed)], moves: { from: PB; to: PB }[] = [], build: PB[] = [];
  for (const t of tgt.filter(b => !b.fixed)) {
    let bi = -1, bd = 1e9;
    left.forEach((c, k) => { if (c.type !== t.type) return; const d = Math.abs(c.x - t.x) + Math.abs(c.y - t.y); if (d < bd) { bd = d; bi = k; } });
    if (bi >= 0) { const c = left.splice(bi, 1)[0]; if (c.x !== t.x || c.y !== t.y) moves.push({ from: c, to: t }); }
    else build.push(t);
  }
  return { moves, build, extra: left };
}

export function movesHTML(cur: Plan, tgt: Plan, label: string) {
  if (cur.w !== tgt.w || cur.h !== tgt.h) return '<h2>Move plan</h2><p>The target plan is for a different map size.</p>';
  const N = tgt.w * tgt.h, W = tgt.w, ot = occupancy(tgt);
  const name = (p: Plan, i: number) => p.notes?.[i] && p.tiles[i] !== 'C' ? p.notes[i] : ITEMS[p.tiles[i]]?.name ?? p.tiles[i];
  const pick: Record<string, number> = {}, place: Record<string, number> = {};
  let harvest = 0, chop = 0, unfloor = 0;
  for (let i = 0; i < N; i++) {
    const a = cur.tiles[i], b = ot[i] >= 0 ? '#' : tgt.tiles[i];
    if (a === b || GROUND.has(a) && GROUND.has(b)) continue;
    if (a === 'C') harvest++;
    else if (a === 'T' || a === 'U') chop++;
    else if (a === 'P') unfloor++;
    else if (!GROUND.has(a)) { const n = name(cur, i); pick[n] = (pick[n] ?? 0) + 1; }
    if (b !== '#' && !GROUND.has(b) && b !== 'C') { const n = ITEMS[b]?.name ?? b; place[n] = (place[n] ?? 0) + 1; }
  }
  let plantCrops = 0; for (let i = 0; i < N; i++) if (tgt.tiles[i] === 'C') plantCrops++;
  const { moves, build, extra } = matchBuildings(cur.buildings, tgt.buildings);
  const at = (b: PB) => `(${b.x}, ${b.y})`;
  const list = (o: Record<string, number>) => Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<li><b>${f(v)}</b> × ${esc(k)}</li>`).join('') || '<li class="muted">nothing</li>';
  // exact placement coordinates, grouped by row
  const coords = (code: string) => {
    const rows: Record<number, number[]> = {};
    for (let i = 0; i < N; i++) if (tgt.tiles[i] === code) (rows[(i / W) | 0] ??= []).push(i % W);
    const ys = Object.keys(rows).map(Number).sort((a, b) => a - b);
    return ys.length ? `<table class="t"><tr><th class="n">Row y</th><th>x positions</th></tr>${ys.map(y => `<tr><td class="n">${y}</td><td>${rows[y].join(', ')}</td></tr>`).join('')}</table>` : '<p class="muted">none</p>';
  };
  const huts = tgt.buildings.filter(b => b.type === 'junimo');
  const step = (n: number, title: string, body: string) => `<div class="room step"><h4><span class="num">${n}</span>${title}</h4>${body}</div>`;
  return `<h2>Move plan — Current → ${esc(label)}</h2>
  <p>Do these in order, ideally on Winter 1 so nothing is growing. Tile coordinates match the game and the Inspector. On the map tabs, turn on the <b>Diff</b> overlay to see changes: green = place, red = remove, amber = replace.</p>
  <div class="rooms">
  ${step(1, 'Empty and pick up', `<p class="muted">Empty chests into the house chest wall first (House &amp; chests tab).</p><ul>${list(pick)}</ul><p>${harvest ? `Harvest or clear <b>${f(harvest)}</b> crops. ` : ''}${chop ? `Chop <b>${f(chop)}</b> trees in the way. ` : ''}${unfloor ? `Lift <b>${f(unfloor)}</b> flooring tiles.` : ''}</p>`)}
  ${step(2, 'Robin: move buildings (free)', moves.length ? `<ul>${moves.map(m => `<li>${esc(BUILDINGS[m.to.type].name)}: ${at(m.from)} → <b>${at(m.to)}</b></li>`).join('')}</ul>` : '<p class="muted">No buildings move.</p>')}
  ${step(3, 'Build', build.filter(b => b.type !== 'junimo').length || huts.length ? `<ul>${build.filter(b => b.type !== 'junimo').map(b => `<li>${esc(BUILDINGS[b.type].name)} at <b>${at(b)}</b></li>`).join('')}${build.some(b => b.type === 'junimo') ? `<li>${build.filter(b => b.type === 'junimo').length} Junimo Huts (Wizard) at ${build.filter(b => b.type === 'junimo').map(at).join(' ')}</li>` : ''}</ul>${extra.length ? `<p class="muted">Not in the plan (demolish or keep elsewhere): ${extra.map(b => esc(b.label ?? BUILDINGS[b.type].name) + ' ' + at(b)).join(', ')}</p>` : ''}` : '<p class="muted">Nothing new to build.</p>')}
  ${step(4, 'Place equipment', `<ul>${list(place)}</ul><p>Then hoe and plant <b>${f(plantCrops)}</b> crop tiles.</p>`)}
  </div>
  <h3>Exact positions</h3>
  <details open><summary><b>Iridium Sprinklers</b></summary>${coords('I')}</details>
  <details><summary><b>Quality Sprinklers</b></summary>${coords('Q')}</details>
  <details><summary><b>Scarecrows</b></summary>${coords('R')}${coords('r')}</details>
  <details><summary><b>Junimo Huts</b></summary><p>${huts.map(at).join(' · ') || 'none'}</p></details>`;
}
