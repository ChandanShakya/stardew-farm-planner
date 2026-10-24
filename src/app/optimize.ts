// Layout optimizer. Pipeline:
//  1. yard packer  – greedy placement of every building, scored by tillable tiles consumed
//                    (footprint + shared 1-tile path ring), walking distance to the house door,
//                    and row/column alignment with already-placed buildings.
//  2. extras       – tapper-tree avenue + bee-house row on the cheapest straight runs left.
//  3. field        – all 25 iridium lattice phases (lattice → greedy iridium/quality patch);
//                    each separate field patch keeps its own best phase, the composite is
//                    re-patched. Junimo huts: randomized-greedy set cover (summed-area table,
//                    lattice seeds, restarts) that may stand on non-crop ground, prune, then
//                    2-for-1 swap search. Deluxe scarecrows: randomized greedy, prune,
//                    relocate onto non-crop tiles.
//  4. finishing    – unwatered leftovers → flooring, fence ring around the field, every other
//                    open tile floored so weeds/debris cannot spawn.
// Budget mode ("use what I own"): same pipeline, but sprinklers / scarecrows / huts are capped at
// the counts you already own. The field grows outward from the house as a compact block: iridium
// lattice cells nearest the porch first, then quality/basic sprinklers by best gain, then
// scarecrows (deluxe, then regular) until they run out. Crops nothing can protect are dropped.
import { analyze, BUILDINGS, clonePlan, crowTiles, idx, inb, JUNIMO_R, TERRAIN, type PB, type Plan } from './engine.ts';

export type OptOptions = {
  buildings: string[];   // catalog keys to place in the yard
  tappers: number; beeHouses: number;
  huts: boolean; crows: boolean; fence: boolean; floorAll: boolean;
  restarts?: number; seed?: number;
  rods?: number;          // lightning rods to keep (battery packs) on spare ground
  budget?: Budget;        // cap equipment at what you own
  keepBuildings?: boolean; // optimize around the buildings where they stand
};
export type Budget = { I: number; Q: number; S: number; R: number; r: number; huts: number };
export const DEFAULT_YARD = ['slime', 'barn', 'shed', 'coop', 'pond', 'pond', 'pond', 'pond', 'silo', 'silo', 'mill', 'stable',
  'earthob', 'waterob', 'desertob', 'islandob', 'clock', 'petbowl', 'bin'];

const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export type OptResult = { plan: Plan; log: string[] };

export function optimizePlan(src: Plan, o: OptOptions, progress?: (s: string) => void): OptResult {
  const log: string[] = [];
  const p = clonePlan(src);
  const N = p.w * p.h;
  p.tiles = Array(N).fill('');
  delete p.notes;
  if (!o.keepBuildings) p.buildings = p.buildings.filter(b => b.fixed);
  p.rules = { ...p.rules, layout: true };
  let nextId = Math.max(0, ...p.buildings.map(b => b.id)) + 1;

  // used[i]: 0 free · 1 building · 2 path (reserved walkway) · 3 walking route to a map exit
  const used = new Uint8Array(N);
  const T = (i: number) => TERRAIN[p.base[i]] ?? TERRAIN.X;
  const setRect = (x: number, y: number, w: number, h: number, v: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inb(p, xx, yy)) {
      const i = idx(p, xx, yy);
      if (v === 1 || (used[i] === 0 && T(i).walk)) used[i] = v;
    }
  };
  for (const b of p.buildings) { setRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2, 2); setRect(b.x, b.y, b.w, b.h, 1); }
  const house = p.buildings.find(b => b.type === 'farmhouse');
  const anchor = house ? [house.x + 4, house.y + 5] : [p.w >> 1, p.h >> 1];
  if (house) setRect(house.x - 1, house.y + house.h, house.w + 2, 2, 2); // porch: 2 rows in front of the house stay open

  // Walking routes: shortest path from the porch to every map exit. Crops may sit on a route
  // (you walk over crops) but nothing solid may, so no building, sprinkler, scarecrow, hut,
  // bee house, rod or tree ever cuts you off from the bus stop, forest, backwoods or cave.
  const route = new Uint8Array(N);
  if (house) {
    // Dial's algorithm: stepping onto farmland costs 6, onto roads/spare ground 1, so routes follow
    // existing paths and field edges instead of slicing the crop field.
    const start = idx(p, house.x + 4, house.y + house.h);
    const dist = new Int32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), buckets: number[][] = [[start]];
    dist[start] = 0;
    for (let d = 0; d < buckets.length; d++) for (const j of buckets[d] ?? []) {
      if (dist[j] !== d) continue;
      const x = j % p.w, y = (j / p.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!inb(p, x + dx, y + dy)) continue;
        const k = idx(p, x + dx, y + dy);
        if (!T(k).walk || used[k] === 1) continue;
        const nd = d + (T(k).till && !used[k] ? 6 : 1);
        if (nd < dist[k]) { dist[k] = nd; prev[k] = j; (buckets[nd] ??= []).push(k); }
      }
    }
    // exits: 'w' tiles plus walkable tiles on the map edge (e.g. the path to the Backwoods)
    const isExit = (i: number) => { const x = i % p.w, y = (i / p.w) | 0; return dist[i] < 1e9 && (p.base[i] === 'w' || ((x === 0 || y === 0 || x === p.w - 1 || y === p.h - 1) && T(i).walk)); };
    const done = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (!isExit(i) || done[i]) continue;
      const grp = [i]; done[i] = 1;
      for (let h = 0; h < grp.length; h++) { const x = grp[h] % p.w, y = (grp[h] / p.w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = idx(p, x + dx, y + dy); if (inb(p, x + dx, y + dy) && !done[k] && isExit(k)) { done[k] = 1; grp.push(k); } } }
      const near = grp.reduce((m, k) => (dist[k] < dist[m] ? k : m), grp[0]);
      for (let k = near; k >= 0; k = prev[k]) { route[k] = 1; if (used[k] === 0 && !T(k).till) used[k] = 3; }
    }
    // narrow spots (cliff/water/building close on both sides) can't be stepped around: mark 2
    for (let i = 0; i < N; i++) if (route[i]) {
      const x = i % p.w, y = (i / p.w) | 0; let open = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inb(p, x + dx, y + dy) && T(idx(p, x + dx, y + dy)).walk && used[idx(p, x + dx, y + dy)] !== 1) open++;
      if (open <= 5) route[i] = 2;
    }
  }

  // ---------- 1. yard packer ----------
  const order = [...o.buildings].sort((a, b) => BUILDINGS[b].w * BUILDINGS[b].h - BUILDINGS[a].w * BUILDINGS[a].h);
  for (const type of order) {
    const d = BUILDINGS[type];
    let best: { x: number; y: number; c: number } | null = null;
    for (let y = 1; y + d.h < p.h - 1; y++) for (let x = 1; x + d.w < p.w - 1; x++) {
      let ok = true, till = 0;
      for (let yy = y; yy < y + d.h && ok; yy++) for (let xx = x; xx < x + d.w; xx++) {
        const i = idx(p, xx, yy);
        if (used[i] || route[i] || !T(i).build) { ok = false; break; }
        if (T(i).till) till++;
      }
      if (!ok) continue;
      let ring = 0, blockedFront = 0;
      for (let xx = x - 1; xx <= x + d.w; xx++) for (const yy of [y - 1, y + d.h]) {
        const i = idx(p, xx, yy);
        if (used[i] === 1) { ok = false; break; }
        if (!used[i] && T(i).till) ring++;
        if (yy === y + d.h && !T(i).walk) blockedFront++;
      }
      for (let yy = y; yy < y + d.h && ok; yy++) for (const xx of [x - 1, x + d.w]) {
        const i = idx(p, xx, yy);
        if (used[i] === 1) { ok = false; break; }
        if (!used[i] && T(i).till) ring++;
      }
      if (!ok || blockedFront > d.w / 2) continue; // door side must be reachable
      const cx = x + d.w / 2, cy = y + d.h;
      const dist = Math.abs(cx - anchor[0]) + Math.abs(cy - anchor[1]);
      let align = 0;
      for (const b of p.buildings) {
        if (b.y === y || b.y + b.h === y + d.h) align += 3;
        if (b.x === x || b.x + b.w === x + d.w || b.x + b.w + 1 === x || x + d.w + 1 === b.x) align += 2;
      }
      const c = 10 * (till + ring) + (type === 'bin' ? 6 : 1) * dist - align;
      if (!best || c < best.c) best = { x, y, c };
    }
    if (!best) { log.push(`⚠ no room for ${d.name}`); continue; }
    p.buildings.push({ id: nextId++, type, x: best.x, y: best.y, w: d.w, h: d.h });
    setRect(best.x - 1, best.y - 1, d.w + 2, d.h + 2, 2);
    setRect(best.x, best.y, d.w, d.h, 1);
  }
  progress?.('yard placed');

  // ---------- 2. tapper avenue + lightning rods (cheapest straight runs, off walkways) ----------
  const run = (len: number) => {
    let best: { x: number; y: number; c: number } | null = null;
    for (let y = 1; y < p.h - 1; y++) for (let x = 1; x + len < p.w - 1; x++) {
      let c = 0, ok = true;
      for (let k = 0; k < len; k++) { const i = idx(p, x + k, y); if (used[i] || route[i] || !T(i).build) { ok = false; break; } c += T(i).till ? 10 : 0; }
      if (!ok) continue;
      c += (Math.abs(x + len / 2 - anchor[0]) + Math.abs(y - anchor[1])) * 0.5;
      if (!best || c < best.c) best = { x, y, c };
    }
    return best;
  };
  if (o.tappers > 0) {
    const r = run(o.tappers * 2 - 1);
    if (r) for (let k = 0; k < o.tappers * 2 - 1; k++) { const i = idx(p, r.x + k, r.y); used[i] = 2; p.tiles[i] = k % 2 ? 'P' : 'A'; }
    else log.push('⚠ no straight run for the tapper avenue');
  }
  // Rods: position is irrelevant to the game (a strike picks any empty rod), so they go where they
  // cost the least: straight runs of spare ground, never crops or walkways ('p' tiles aren't buildable).
  let rodsLeft = o.rods ?? 0;
  for (let len = Math.min(rodsLeft, 12); rodsLeft > 0 && len > 0;) {
    const n = Math.min(len, rodsLeft), r = run(n);
    if (!r) { len--; continue; }
    for (let k = 0; k < n; k++) { const i = idx(p, r.x + k, r.y); used[i] = 2; p.tiles[i] = 'L'; }
    rodsLeft -= n;
  }
  if (rodsLeft) log.push(`⚠ only ${(o.rods ?? 0) - rodsLeft} of ${o.rods} lightning rods fit`);

  // ---------- 3. field ----------
  const field = new Uint8Array(N);
  // 1 = crop or equipment · 2 = narrow spot on a walking route: crop only
  for (let i = 0; i < N; i++) if (!used[i] && T(i).till && !p.tiles[i]) field[i] = route[i] === 2 ? 2 : 1;
  let fb: FieldResult;
  if (o.budget) {
    let best: FieldResult | null = null;
    for (let oy = 0; oy < 5; oy++) for (let ox = 0; ox < 5; ox++) {
      const r = solveBudget(p, field, ox, oy, o, o.budget, anchor);
      if (!best || r.crops > best.crops) best = r;
    }
    fb = best!;
  } else fb = solveField(p, field, used, o, log);
  progress?.('field solved');
  // hut footprints are buildings from here on (a hut may stand on spare ground outside the field)
  for (const h of fb.huts) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) used[idx(p, x, y)] = 1;
  if (o.crows && o.budget) {
    // deluxe first (bigger radius), then regular scarecrows on what is still exposed
    let left = placeCrows(p, fb.tiles, field, used, o, 'R', o.budget.R);
    left = placeCrows(p, fb.tiles, field, used, o, 'r', o.budget.r, left);
    for (const i of left) fb.tiles[i] = '';
    if (left.length) log.push(`${left.length} tiles dropped: not enough scarecrows to protect them`);
  } else if (o.crows) placeCrows(p, fb.tiles, field, used, o, 'R', Infinity);
  if (fb.handHarvest) { p.rules = { ...p.rules, junimo: false }; log.push(`${fb.handHarvest} crops outside hut range → hand harvest`); }
  if (o.budget) {
    const use = (c: string) => fb.tiles.filter(t => t === c).length;
    log.push(`uses ${use('I')}/${o.budget.I} iridium · ${use('Q')}/${o.budget.Q} quality · ${use('S')}/${o.budget.S} basic sprinklers · ${use('R')}/${o.budget.R} deluxe + ${use('r')}/${o.budget.r} scarecrows · ${fb.huts.length}/${o.budget.huts} new huts`);
  }
  for (let i = 0; i < N; i++) if (fb.tiles[i]) p.tiles[i] = fb.tiles[i];
  for (const h of fb.huts) p.buildings.push({ ...h, id: nextId++ });

  // ---------- 3b. bee houses around one flower ----------
  // Pick the crop tile with the most spare ground within 5 tiles, make it the flower (watered and
  // protected like any crop), and put the bee houses on spare ground around it; crop tiles only
  // if there is no spare ground left.
  if (o.beeHouses > 0) {
    const hutAt = new Uint8Array(N);
    for (const b of p.buildings) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inb(p, x, y)) hutAt[idx(p, x, y)] = 1;
    const spare = (i: number) => !p.tiles[i] && !hutAt[i] && !used[i] && !route[i] && T(i).build && p.base[i] !== 'p';
    const within = (f: number, test: (i: number) => boolean) => {
      const fx = f % p.w, fy = (f / p.w) | 0, out: number[] = [];
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if ((dx || dy) && Math.abs(dx) + Math.abs(dy) <= 5 && inb(p, fx + dx, fy + dy) && test(idx(p, fx + dx, fy + dy))) out.push(idx(p, fx + dx, fy + dy));
      return out.sort((a, b) => Math.abs(a % p.w - fx) + Math.abs(((a / p.w) | 0) - fy) - Math.abs(b % p.w - fx) - Math.abs(((b / p.w) | 0) - fy));
    };
    let bestF = -1, bestN = -1;
    for (let i = 0; i < N; i++) if (p.tiles[i] === 'C') { const n = Math.min(o.beeHouses, within(i, spare).length); if (n > bestN) { bestN = n; bestF = i; if (n >= o.beeHouses) break; } }
    if (bestF >= 0) {
      p.tiles[bestF] = 'Y';
      const spots = [...within(bestF, spare), ...within(bestF, i => p.tiles[i] === 'C' && !route[i])].slice(0, o.beeHouses);
      for (const i of spots) { p.tiles[i] = 'E'; used[i] = 2; }
      log.push(`${spots.length} bee houses around a flower at (${bestF % p.w}, ${(bestF / p.w) | 0})`);
    } else log.push('⚠ no crop tile to host the bee-house flower');
  }

  // ---------- 4. finishing ----------
  const hutOcc = new Uint8Array(N);
  for (const b of p.buildings) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inb(p, x, y)) hutOcc[idx(p, x, y)] = 1;
  const inField = (i: number) => field[i] && (p.tiles[i] === 'C' || p.tiles[i] === 'Y' || p.tiles[i] === 'I' || p.tiles[i] === 'Q' || p.tiles[i] === 'R' || hutOcc[i]);
  if (o.fence) for (let i = 0; i < N; i++) {
    if (inField(i) || hutOcc[i] || p.tiles[i] || !T(i).walk || used[i] >= 2 || route[i] || p.base[i] === 'w') continue;
    const x = i % p.w, y = (i / p.w) | 0;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(p, x + dx, y + dy) && inField(idx(p, x + dx, y + dy))) { near = true; break; }
    if (near) p.tiles[i] = 'F';
  }
  if (o.floorAll) for (let i = 0; i < N; i++) if (!p.tiles[i] && !hutOcc[i] && T(i).walk && p.base[i] !== 'w') p.tiles[i] = 'P';
  return { plan: p, log };
}

type FieldResult = { tiles: string[]; huts: PB[]; crops: number; handHarvest: number };

const wetFrom = (p: Plan, tiles: string[]) => {
  const W = p.w, wet = new Uint8Array(W * p.h);
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i] === 'I' ? 2 : tiles[i] === 'Q' ? 1 : 0; if (!r) continue;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if ((dx || dy) && inb(p, x + dx, y + dy)) wet[(y + dy) * W + x + dx] = 1;
  }
  return wet;
};

// Greedy patch: add the iridium/quality sprinkler with the best net gain until nothing gains >= 2 tiles.
function patch(p: Plan, field: Uint8Array, tiles: string[], wet: Uint8Array) {
  const W = p.w, N = W * p.h;
  const canSpr = (i: number) => field[i] === 1 && p.base[i] !== 's';
  for (; ;) {
    let bi = -1, br = 0, bg = 1;
    const near = new Uint8Array(N);
    for (let j = 0; j < N; j++) if (field[j] && !wet[j] && (!tiles[j] || tiles[j] === 'C')) {
      const x = j % W, y = (j / W) | 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inb(p, x + dx, y + dy)) near[(y + dy) * W + x + dx] = 1;
    }
    for (let i = 0; i < N; i++) {
      if (!near[i] || !canSpr(i) || (tiles[i] && tiles[i] !== 'C')) continue;
      const x = i % W, y = (i / W) | 0;
      for (const r of [1, 2]) {
        let g = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (!(dx || dy) || !inb(p, x + dx, y + dy)) continue;
          const j = (y + dy) * W + x + dx; if (field[j] && !wet[j] && (!tiles[j] || tiles[j] === 'C')) g++;
        }
        g -= wet[i] ? 1 : 0; // placing on a watered tile loses that crop
        if (g > bg || (g === bg && r === 1 && br === 2)) { bg = g; bi = i; br = r; }
      }
    }
    if (bi < 0 || bg < 2) break;
    tiles[bi] = br === 2 ? 'I' : 'Q';
    const x = bi % W, y = (bi / W) | 0;
    for (let dy = -br; dy <= br; dy++) for (let dx = -br; dx <= br; dx++) if ((dx || dy) && inb(p, x + dx, y + dy)) wet[(y + dy) * W + x + dx] = 1;
  }
  for (let i = 0; i < N; i++) if (field[i] && (!tiles[i] || tiles[i] === 'C')) tiles[i] = wet[i] ? 'C' : '';
}

// One sprinkler layout for a lattice phase: iridium lattice + greedy patch.
function sprinklerLayout(p: Plan, field: Uint8Array, ox: number, oy: number) {
  const W = p.w, H = p.h, tiles: string[] = Array(W * H).fill('');
  for (let y = oy; y < H; y += 5) for (let x = ox; x < W; x += 5) { const i = y * W + x; if (field[i] === 1 && p.base[i] !== 's') tiles[i] = 'I'; }
  patch(p, field, tiles, wetFrom(p, tiles));
  return tiles;
}

// Field: every separate patch of field gets its own best lattice phase (fragmented farms gain
// edge tiles), the composite is re-patched, then huts and their crop cost are solved once.
function solveField(p: Plan, field: Uint8Array, used: Uint8Array, o: OptOptions, log: string[]): FieldResult {
  const W = p.w, H = p.h, N = W * H;
  const comp = new Int32Array(N).fill(-1); let nComp = 0;
  for (let i = 0; i < N; i++) {
    if (!field[i] || comp[i] >= 0) continue;
    const q = [i]; comp[i] = nComp;
    while (q.length) {
      const j = q.pop()!, x = j % W, y = (j / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (y + dy) * W + x + dx; if (inb(p, x + dx, y + dy) && field[k] && comp[k] < 0) { comp[k] = nComp; q.push(k); } }
    }
    nComp++;
  }
  const layouts: string[][] = [];
  for (let oy = 0; oy < 5; oy++) for (let ox = 0; ox < 5; ox++) layouts.push(sprinklerLayout(p, field, ox, oy));
  const pick = new Int32Array(nComp), bestScore = new Float64Array(nComp).fill(-1e9);
  layouts.forEach((t, li) => {
    const sc = new Float64Array(nComp);
    for (let i = 0; i < N; i++) if (comp[i] >= 0) sc[comp[i]] += t[i] === 'C' ? 1 : t[i] ? -0.01 : 0;
    for (let c = 0; c < nComp; c++) if (sc[c] > bestScore[c]) { bestScore[c] = sc[c]; pick[c] = li; }
  });
  const tiles: string[] = Array(N).fill('');
  for (let i = 0; i < N; i++) if (comp[i] >= 0) { const t = layouts[pick[comp[i]]][i]; if (t === 'I' || t === 'Q') tiles[i] = t; }
  patch(p, field, tiles, wetFrom(p, tiles));
  log.push(`${nComp} field patch${nComp === 1 ? '' : 'es'} · lattice phase${nComp === 1 ? '' : 's'} ${[...new Set(pick)].map(li => `(${li % 5},${(li / 5) | 0})`).join(' ')}`);

  let huts: PB[] = [];
  if (o.huts) {
    // free tiles a hut may also stand on (costs no crop): dry leftovers and spare open ground
    const free = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (!tiles[i] && TERRAIN[p.base[i]]?.build && !p.tiles[i] && (field[i] === 1 || used[i] === 0)) free[i] = 1;
    huts = placeHuts(p, tiles, o, free, field);
    for (const h of huts) for (let y = h.y; y < h.y + 2; y++) for (let x = h.x; x < h.x + 3; x++) tiles[y * W + x] = '';
    let dropped = 0;
    for (let i = 0; i < N; i++) if (tiles[i] === 'C') {
      const x = i % W, y = (i / W) | 0;
      if (!huts.some(h => Math.abs(x - h.x - 1) <= JUNIMO_R && Math.abs(y - h.y - 1) <= JUNIMO_R)) { tiles[i] = ''; dropped++; }
    }
    const onCrops = huts.reduce((t, h) => t + (field[h.y * W + h.x] ? 1 : 0), 0);
    log.push(`${huts.length} huts (${huts.length - onCrops} on non-crop ground)${dropped ? ` · ${dropped} unreachable crops dropped` : ''}`);
  }
  let crops = 0; for (let i = 0; i < N; i++) if (tiles[i] === 'C') crops++;
  return { tiles, huts, crops, handHarvest: 0 };
}

// Budget phase: grow a compact watered block from the house using only owned sprinklers.
function solveBudget(p: Plan, field: Uint8Array, ox: number, oy: number, o: OptOptions, b: Budget, anchor: number[]) {
  const W = p.w, H = p.h, N = W * H;
  const tiles: string[] = Array(N).fill('');
  const wet = new Uint8Array(N);
  const canSpr = (i: number) => field[i] === 1 && p.base[i] !== 's' && !tiles[i];
  const dist = (i: number) => Math.hypot((i % W) - anchor[0], ((i / W) | 0) - anchor[1]);
  const offs = (code: string): [number, number][] => code === 'S' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [...Array(code === 'I' ? 25 : 9)].map((_, k) => { const r = code === 'I' ? 2 : 1, n = 2 * r + 1; return [(k % n) - r, ((k / n) | 0) - r] as [number, number]; }).filter(([dx, dy]) => dx || dy);
  const gain = (i: number, code: string) => {
    const x = i % W, y = (i / W) | 0; let g = 0;
    for (const [dx, dy] of offs(code)) { if (!inb(p, x + dx, y + dy)) continue; const j = (y + dy) * W + x + dx; if (field[j] && !wet[j] && !tiles[j]) g++; }
    return g - (wet[i] ? 1 : 0);
  };
  const put = (i: number, code: string) => { tiles[i] = code; const x = i % W, y = (i / W) | 0; for (const [dx, dy] of offs(code)) if (inb(p, x + dx, y + dy)) wet[(y + dy) * W + x + dx] = 1; };
  // iridium: lattice cells closest to the porch, only near-full cells
  const lat: number[] = [];
  for (let y = oy; y < H; y += 5) for (let x = ox; x < W; x += 5) { const i = y * W + x; if (canSpr(i)) lat.push(i); }
  lat.sort((a, c) => dist(a) - dist(c));
  let nI = 0;
  for (const i of lat) { if (nI >= b.I) break; if (gain(i, 'I') >= 16) { put(i, 'I'); nI++; } }
  // quality, then basic: best gain, ties toward the house so the block stays compact
  for (const [code, cap, min] of [['Q', b.Q, 5], ['S', b.S, 3]] as const) {
    for (let k = 0; k < cap; k++) {
      let bi = -1, bs = -1e9;
      for (let i = 0; i < N; i++) {
        if (!canSpr(i)) continue;
        const g = gain(i, code); if (g < min) continue;
        const sc = g - dist(i) * 0.15;
        if (sc > bs) { bs = sc; bi = i; }
      }
      if (bi < 0) break;
      put(bi, code);
    }
  }
  for (let i = 0; i < N; i++) if (field[i] && !tiles[i] && wet[i]) tiles[i] = 'C';
  let huts: PB[] = [], hand = 0;
  if (o.huts && b.huts > 0) {
    huts = placeHuts(p, tiles, o, undefined, field).slice(0, b.huts);
    for (const h of huts) for (let y = h.y; y < h.y + 2; y++) for (let x = h.x; x < h.x + 3; x++) tiles[y * W + x] = '';
    for (let i = 0; i < N; i++) if (tiles[i] === 'C' && !huts.some(h => Math.abs((i % W) - h.x - 1) <= JUNIMO_R && Math.abs(((i / W) | 0) - h.y - 1) <= JUNIMO_R)) hand++;
  }
  let crops = 0; for (let i = 0; i < N; i++) if (tiles[i] === 'C') crops++;
  return { tiles, huts, crops, handHarvest: hand };
}

// Junimo huts: randomized greedy set cover on a summed-area table, then prune redundant huts.
function placeHuts(p: Plan, tiles: string[], o: OptOptions, free?: Uint8Array, field?: Uint8Array): PB[] {
  const W = p.w, H = p.h, R = JUNIMO_R;
  const fits = (x: number, y: number) => {
    if (x < 0 || y < 0 || x + 3 > W || y + 2 > H) return false;
    for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 3; xx++) {
      const i = yy * W + xx;
      if (!TERRAIN[p.base[i]]?.build || field?.[i] === 2) return false; // a hut is a building; never on a walking route
      if (tiles[i] !== 'C' && !free?.[i]) return false;
    }
    return true;
  };
  const lostAt = (x: number, y: number) => { let n = 0; for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 3; xx++) if (tiles[yy * W + xx] === 'C') n++; return n; };
  const cover = (h: { x: number; y: number }, x: number, y: number) => Math.abs(x - h.x - 1) <= R && Math.abs(y - h.y - 1) <= R;
  const crops: number[] = []; for (let i = 0; i < W * H; i++) if (tiles[i] === 'C') crops.push(i);
  const cands: { x: number; y: number }[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fits(x, y)) cands.push({ x, y });
  const rand = rng(o.seed ?? 1);
  let best: { x: number; y: number }[] | null = null;
  const restarts = o.restarts ?? 24;
  const fitSet = new Set(cands.map(c => c.y * W + c.x));
  // Seeds: empty (pure greedy) for each restart, plus regular 17-tile hut lattices at several
  // phases, each hut nudged to the nearest legal spot — tidy grids that greedy then completes.
  const seeds: { x: number; y: number }[][] = Array.from({ length: restarts }, () => []);
  for (let py = 0; py < 17; py += restarts > 6 ? 2 : 6) for (let px = 0; px < 17; px += restarts > 6 ? 2 : 6) {
    const seed: { x: number; y: number }[] = [];
    for (let cy = py - 8; cy < H + 8; cy += 17) for (let cx = px - 8; cx < W + 8; cx += 17) {
      let has = false;
      for (let y = Math.max(0, cy - 8); y <= Math.min(H - 1, cy + 8) && !has; y++) for (let x = Math.max(0, cx - 8); x <= Math.min(W - 1, cx + 8); x++) if (tiles[y * W + x] === 'C') { has = true; break; }
      if (!has) continue;
      let pick: { x: number; y: number } | null = null, pd = 99;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx - 1 + dx, y = cy - 1 + dy;
        const d = Math.abs(dx) + Math.abs(dy) + lostAt(x, y) * 0.5; // prefer spots that destroy fewer crops
        if (fitSet.has(y * W + x) && d < pd && !seed.some(h => Math.abs(h.x - x) < 3 && Math.abs(h.y - y) < 2)) { pd = d; pick = { x, y }; }
      }
      if (pick) seed.push(pick);
    }
    seeds.push(seed);
  }
  for (let r = 0; r < seeds.length; r++) {
    const need = new Uint8Array(W * H); for (const i of crops) need[i] = 1;
    const chosen: { x: number; y: number }[] = [];
    let left = crops.length;
    const take = (h: { x: number; y: number }) => {
      chosen.push(h);
      for (let y = h.y; y < h.y + 2; y++) for (let x = h.x; x < h.x + 3; x++) if (need[y * W + x]) { need[y * W + x] = 0; left--; }
      for (let y = h.y + 1 - R; y <= h.y + 1 + R; y++) for (let x = h.x + 1 - R; x <= h.x + 1 + R; x++) if (inb(p, x, y) && need[y * W + x]) { need[y * W + x] = 0; left--; }
    };
    for (const h of seeds[r]) take(h);
    while (left > 0) {
      const S = new Int32Array((W + 1) * (H + 1));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) S[(y + 1) * (W + 1) + x + 1] = need[y * W + x] + S[y * (W + 1) + x + 1] + S[(y + 1) * (W + 1) + x] - S[y * (W + 1) + x];
      const sum = (x0: number, y0: number, x1: number, y1: number) => {
        x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
        return S[(y1 + 1) * (W + 1) + x1 + 1] - S[y0 * (W + 1) + x1 + 1] - S[(y1 + 1) * (W + 1) + x0] + S[y0 * (W + 1) + x0];
      };
      const scored: { c: { x: number; y: number }; g: number }[] = [];
      for (const c of cands) {
        if (chosen.some(h => Math.abs(h.x - c.x) < 3 && Math.abs(h.y - c.y) < 2)) continue;
        const g = sum(c.x + 1 - R, c.y + 1 - R, c.x + 1 + R, c.y + 1 + R) - sum(c.x, c.y, c.x + 2, c.y + 1);
        if (g > 0) scored.push({ c, g: g - 3 * lostAt(c.x, c.y) }); // a crop under the hut costs ~3 tiles of coverage
      }
      if (!scored.length) break;
      scored.sort((a, b) => b.g - a.g);
      const k = r === 0 || r >= restarts ? 0 : Math.floor(rand() * Math.min(3, scored.length) * rand());
      take(scored[k].c);
    }
    // prune redundant huts (largest-first removal check)
    for (let k = chosen.length - 1; k >= 0; k--) {
      const others = chosen.filter((_, j) => j !== k);
      // crops under the removed hut come back, so they must be covered too
      const ok = crops.every(i => { const x = i % W, y = (i / W) | 0; return others.some(h => cover(h, x, y) || (x >= h.x && x < h.x + 3 && y >= h.y && y < h.y + 2)); });
      if (ok) chosen.splice(k, 1);
    }
    const lost = (set: typeof chosen) => set.reduce((t, h) => t + lostAt(h.x, h.y), 0);
    if (!best || chosen.length < best.length || (chosen.length === best.length && lost(chosen) < lost(best))) best = chosen;
  }
  // 2-for-1 swaps: replace any pair of huts by one spot that still covers everything they covered
  const inFoot = (h: { x: number; y: number }, x: number, y: number) => x >= h.x && x < h.x + 3 && y >= h.y && y < h.y + 2;
  let set = best ?? [];
  for (let improved = true; improved;) {
    improved = false;
    outer: for (let a = 0; a < set.length; a++) for (let b = a + 1; b < set.length; b++) {
      const others = set.filter((_, k) => k !== a && k !== b);
      const left = crops.filter(i => { const x = i % W, y = (i / W) | 0; return !others.some(h => cover(h, x, y) || inFoot(h, x, y)); });
      if (!left.length) { set = others; improved = true; break outer; }
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const i of left) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (x1 - x0 > 2 * R || y1 - y0 > 2 * R) continue;
      for (const c of cands) {
        const cx = c.x + 1, cy = c.y + 1;
        if (cx < x1 - R || cx > x0 + R || cy < y1 - R || cy > y0 + R) continue;
        if (others.some(h => Math.abs(h.x - c.x) < 3 && Math.abs(h.y - c.y) < 2)) continue;
        // crops under the new hut disappear; everything else left must be in its range
        if (left.every(i => cover(c, i % W, (i / W) | 0) || inFoot(c, i % W, (i / W) | 0))) { set = [...others, c]; improved = true; break outer; }
      }
    }
  }
  return set.map(h => ({ id: 0, type: 'junimo', x: h.x, y: h.y, w: 3, h: 2 }));
}

// Scarecrows: randomized greedy cover; free (non-crop) tiles cost nothing, crop tiles cost one crop.
// At most `limit` are placed; returns the crop tiles still exposed.
function placeCrows(p: Plan, tiles: string[], field: Uint8Array, used: Uint8Array, o: OptOptions, code: 'R' | 'r', limit: number, targets?: number[]): number[] {
  const W = p.w, H = p.h, N = W * H, off = crowTiles(code), r2 = (code === 'R' ? 17 : 9) ** 2;
  const crops: number[] = targets ? targets.filter(i => tiles[i] === 'C') : [];
  if (!targets) for (let i = 0; i < N; i++) if (tiles[i] === 'C') crops.push(i);
  if (!crops.length || limit <= 0) return crops;
  const cands: number[] = [];
  for (let i = 0; i < N; i++) {
    if (tiles[i] === 'C' && field[i] !== 2) cands.push(i);
    // spare open ground only: never roads/porches ('p' walk-only tiles) or map exits, so walkways stay clear
    else if (!tiles[i] && !p.tiles[i] && !field[i] && used[i] !== 1 && used[i] !== 3 && TERRAIN[p.base[i]]?.build) cands.push(i);
  }
  const rand = rng((o.seed ?? 1) * 7);
  let best: number[] | null = null, bestCost = 1e9;
  for (let r = 0; r < 6; r++) {
    const need = new Uint8Array(N); for (const i of crops) need[i] = 1;
    let left = crops.length; const chosen: number[] = [];
    while (left > 0 && chosen.length < limit) {
      const sc: { i: number; s: number; g: number }[] = [];
      for (const i of cands) {
        if (chosen.includes(i)) continue;
        const x = i % W, y = (i / W) | 0; let g = 0;
        for (const [dx, dy] of off) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && need[yy * W + xx]) g++; }
        const cost = tiles[i] === 'C' ? 1 : 0;
        if (g > 0) sc.push({ i, g, s: g - 4 * cost - (need[i] ? 1 : 0) });
      }
      if (!sc.length) break;
      sc.sort((a, b) => b.s - a.s);
      const pick = sc[r === 0 ? 0 : Math.floor(rand() * Math.min(4, sc.length) * rand())].i;
      chosen.push(pick);
      if (need[pick]) { need[pick] = 0; left--; }
      const x = pick % W, y = (pick / W) | 0;
      for (const [dx, dy] of off) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && need[yy * W + xx]) { need[yy * W + xx] = 0; left--; } }
    }
    const covers = (s: number, i: number) => { const dx = (s % W) - (i % W), dy = ((s / W) | 0) - ((i / W) | 0); return dx * dx + dy * dy < r2; };
    const coveredBy = (set: number[]) => crops.filter(i => set.includes(i) || set.some(s => covers(s, i))).length;
    const full = coveredBy(chosen);
    for (let k = chosen.length - 1; k >= 0; k--) {
      const others = chosen.filter((_, j) => j !== k);
      if (coveredBy(others) === full) chosen.splice(k, 1);
    }
    // relocate each scarecrow onto a free tile if one still covers its exclusive crops
    for (let k = 0; k < chosen.length; k++) {
      if (tiles[chosen[k]] !== 'C') continue;
      const others = chosen.filter((_, j) => j !== k);
      const excl = crops.filter(i => i !== chosen[k] && !others.includes(i) && !others.some(s => covers(s, i)) && covers(chosen[k], i));
      const alt = cands.find(c => tiles[c] !== 'C' && !chosen.includes(c) && excl.every(i => covers(c, i)));
      if (alt !== undefined) chosen[k] = alt;
    }
    const cost = (crops.length - coveredBy(chosen)) * 10000 + chosen.length * 100 + chosen.filter(i => tiles[i] === 'C').length;
    if (cost < bestCost) { bestCost = cost; best = [...chosen]; }
  }
  for (const i of best ?? []) tiles[i] = code;
  const fin = best ?? [];
  return crops.filter(i => !fin.includes(i) && !fin.some(s => { const dx = (s % W) - (i % W), dy = ((s / W) | 0) - ((i / W) | 0); return dx * dx + dy * dy < r2; }));
}

// Fields with no buildings (Ginger Island, Greenhouse): lattice + patch only.
export function optimizeBed(src: Plan): Plan {
  return optimizePlan(src, { buildings: [], tappers: 0, beeHouses: 0, huts: false, crows: false, fence: false, floorAll: false }).plan;
}
export { analyze };

// Repair a hand-edited plan: greedily add the iridium sprinkler / deluxe scarecrow / Junimo hut
// that covers the most uncovered crops, preferring free tiles over sacrificing a crop.
export function fixGaps(src: Plan): { plan: Plan; added: Record<string, number> } {
  const p = clonePlan(src), W = p.w, added: Record<string, number> = { I: 0, R: 0, junimo: 0 };
  const free = (i: number, a: ReturnType<typeof analyze>) => a.occupied[i] < 0 && TERRAIN[p.base[i]]?.walk && p.base[i] !== 'w' && p.base[i] !== 'p' && (!p.tiles[i] || p.tiles[i] === 'C' || p.tiles[i] === 'P' || p.tiles[i] === 'D' || p.tiles[i] === 'W');
  for (let guard = 0; guard < 400; guard++) {
    const a = analyze(p);
    const kind = a.bad.water.length ? 'I' : a.bad.crow.length ? 'R' : a.bad.junimo.length ? 'junimo' : '';
    if (!kind) break;
    const bad = new Set(kind === 'I' ? a.bad.water : kind === 'R' ? a.bad.crow : a.bad.junimo);
    let best = -1, bs = 0;
    if (kind === 'junimo') {
      for (let y = 0; y + 2 <= p.h; y++) for (let x = 0; x + 3 <= W; x++) {
        let ok = true, lost = 0;
        for (let yy = y; yy < y + 2 && ok; yy++) for (let xx = x; xx < x + 3; xx++) { const i = yy * W + xx; if (!free(i, a) || !TERRAIN[p.base[i]].build || (p.tiles[i] && p.tiles[i] !== 'C' && p.tiles[i] !== 'P')) { ok = false; break; } if (p.tiles[i] === 'C') lost++; }
        if (!ok) continue;
        let g = 0; for (const i of bad) if (Math.abs((i % W) - x - 1) <= JUNIMO_R && Math.abs(((i / W) | 0) - y - 1) <= JUNIMO_R) g++;
        if (g - lost > bs) { bs = g - lost; best = y * W + x; }
      }
      if (best < 0) break;
      const x = best % W, y = (best / W) | 0;
      for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 3; xx++) p.tiles[yy * W + xx] = '';
      p.buildings.push({ id: Math.max(0, ...p.buildings.map(b => b.id)) + 1, type: 'junimo', x, y, w: 3, h: 2 });
    } else {
      const off = kind === 'I' ? [...Array(25)].map((_, k) => [(k % 5) - 2, ((k / 5) | 0) - 2]).filter(([dx, dy]) => dx || dy) : crowTiles('R');
      const cand = new Set<number>();
      const reach = kind === 'I' ? 2 : 16;
      for (const i of bad) { const x = i % W, y = (i / W) | 0; for (let dy = -reach; dy <= reach; dy += kind === 'I' ? 1 : 2) for (let dx = -reach; dx <= reach; dx += kind === 'I' ? 1 : 2) if (inb(p, x + dx, y + dy)) cand.add((y + dy) * W + x + dx); }
      for (const c of cand) {
        if (!free(c, a) || (kind === 'I' && p.base[c] === 's')) continue;
        const x = c % W, y = (c / W) | 0; let g = 0;
        for (const [dx, dy] of off) if (inb(p, x + dx, y + dy) && bad.has((y + dy) * W + x + dx)) g++;
        g -= p.tiles[c] === 'C' ? 1.5 : 0;
        if (g > bs) { bs = g; best = c; }
      }
      if (best < 0) break;
      p.tiles[best] = kind;
    }
    added[kind]++;
  }
  return { plan: p, added };
}
