// Plan model + v1.6 rules + coverage checker. Pure TS (no DOM) so Node can run it for proofs.
import FARMS from '../data/farms.json' with { type: 'json' };

// ---------- terrain ----------
// d tillable+buildable · D tillable only · s Beach sand (tillable, sprinklers blocked) · g buildable grass
// p walkable only · w map exit · ~ water · X cliff/forest · o fixed feature
export type FarmDef = { label: string; w: number; h: number; rows: string[]; approx?: boolean; fixed?: [string, number, number, number, number][] };
export const FARM_DEFS = FARMS as unknown as Record<string, FarmDef>;
export const FARM_KEYS = ['standard', 'riverland', 'forest', 'hilltop', 'wilderness', 'fourcorners', 'beach', 'meadowlands'];
export const WHICH_FARM = FARM_KEYS; // save <whichFarm> index -> key
export const TERRAIN: Record<string, { name: string; till: boolean; build: boolean; walk: boolean }> = {
  d: { name: 'Tillable soil', till: true, build: true, walk: true },
  D: { name: 'Tillable soil (no buildings)', till: true, build: false, walk: true },
  s: { name: 'Beach sand (no sprinklers)', till: true, build: true, walk: true },
  g: { name: 'Grass (buildable, not tillable)', till: false, build: true, walk: true },
  p: { name: 'Path (walkable only)', till: false, build: false, walk: true },
  w: { name: 'Map exit', till: false, build: false, walk: true },
  '~': { name: 'Water', till: false, build: false, walk: false },
  X: { name: 'Cliff / forest', till: false, build: false, walk: false },
  o: { name: 'Fixed map feature', till: false, build: false, walk: false },
};

// ---------- tile items ----------
export const ITEMS: Record<string, { name: string; key: string; crop?: boolean; solid?: boolean }> = {
  C: { name: 'Crop', key: 'c', crop: true },
  Y: { name: 'Flower (for bee houses)', key: '', crop: true },
  I: { name: 'Iridium Sprinkler', key: 'i', solid: true },
  Q: { name: 'Quality Sprinkler', key: 'q', solid: true },
  S: { name: 'Sprinkler', key: '', solid: true },
  R: { name: 'Deluxe Scarecrow', key: 'r', solid: true },
  r: { name: 'Scarecrow', key: '', solid: true },
  F: { name: 'Hardwood Fence', key: 'f', solid: true },
  G: { name: 'Gate', key: '', solid: true },
  P: { name: 'Stone Floor', key: 'p', solid: false },
  T: { name: 'Tree', key: 't', solid: true },
  A: { name: 'Tapper Tree', key: '', solid: true },
  U: { name: 'Fruit Tree', key: '', solid: true },
  E: { name: 'Bee House', key: 'e', solid: true },
  M: { name: 'Machine', key: '', solid: true },
  H: { name: 'Chest', key: '', solid: true },
  L: { name: 'Lightning Rod', key: '', solid: true },
  O: { name: 'Object', key: '', solid: true },
  D: { name: 'Hoed dirt', key: '' },
  W: { name: 'Grass', key: '' },
  Z: { name: 'Stump / boulder', key: '', solid: true },
};

// ---------- buildings (v1.6 footprints) ----------
export type BDef = { name: string; w: number; h: number; color: string; roof: string; door?: [number, number]; height: number };
export const BUILDINGS: Record<string, BDef> = {
  farmhouse: { name: 'Farmhouse', w: 9, h: 5, color: '#9c6b3f', roof: '#b4413a', door: [5, 4], height: 3.2 },
  greenhouse: { name: 'Greenhouse', w: 7, h: 6, color: '#7fb6a5', roof: '#cfeee6', door: [3, 5], height: 3 },
  barn: { name: 'Deluxe Barn', w: 7, h: 4, color: '#a0522d', roof: '#7a2e1d', door: [3, 3], height: 3 },
  coop: { name: 'Deluxe Coop', w: 6, h: 3, color: '#c08a4b', roof: '#8f3b2c', door: [1, 2], height: 2.6 },
  silo: { name: 'Silo', w: 3, h: 3, color: '#b9b2a6', roof: '#7b8794', height: 4 },
  shed: { name: 'Big Shed', w: 7, h: 3, color: '#8c6a48', roof: '#5b4636', door: [3, 2], height: 2.6 },
  mill: { name: 'Mill', w: 4, h: 2, color: '#cfa66a', roof: '#a16207', height: 3.5 },
  stable: { name: 'Stable', w: 4, h: 2, color: '#8b5a2b', roof: '#5a3a1e', height: 2.2 },
  slime: { name: 'Slime Hutch', w: 11, h: 6, color: '#7c6aa8', roof: '#4c3d7a', door: [5, 5], height: 2.8 },
  pond: { name: 'Fish Pond', w: 5, h: 5, color: '#4b8bbe', roof: '#7c5c3b', height: 0.3 },
  well: { name: 'Well', w: 3, h: 3, color: '#9ca3af', roof: '#6b4f2f', height: 1.6 },
  junimo: { name: 'Junimo Hut', w: 3, h: 2, color: '#5e8f3e', roof: '#c9a227', door: [1, 1], height: 2.2 },
  earthob: { name: 'Earth Obelisk', w: 3, h: 2, color: '#6b8e4e', roof: '#3f5d2c', height: 4 },
  waterob: { name: 'Water Obelisk', w: 3, h: 2, color: '#3b82c4', roof: '#1e4e8c', height: 4 },
  desertob: { name: 'Desert Obelisk', w: 3, h: 2, color: '#d6a54a', roof: '#9c6d1c', height: 4 },
  islandob: { name: 'Island Obelisk', w: 3, h: 2, color: '#2fa58e', roof: '#11665a', height: 4 },
  clock: { name: 'Gold Clock', w: 3, h: 2, color: '#e2b53c', roof: '#a87a12', height: 4.5 },
  bin: { name: 'Shipping Bin', w: 2, h: 1, color: '#8b5a2b', roof: '#6b3f1d', height: 1 },
  petbowl: { name: 'Pet Bowl', w: 2, h: 2, color: '#94a3b8', roof: '#64748b', height: 0.4 },
  cabin: { name: 'Cabin', w: 5, h: 3, color: '#a47148', roof: '#6b8e23', door: [2, 2], height: 2.6 },
};
// save <buildingType> -> catalog key
export const SAVE_BUILDING: Record<string, string> = {
  Farmhouse: 'farmhouse', Greenhouse: 'greenhouse', Barn: 'barn', 'Big Barn': 'barn', 'Deluxe Barn': 'barn',
  Coop: 'coop', 'Big Coop': 'coop', 'Deluxe Coop': 'coop', Silo: 'silo', Shed: 'shed', 'Big Shed': 'shed',
  Mill: 'mill', Stable: 'stable', 'Slime Hutch': 'slime', 'Fish Pond': 'pond', Well: 'well', 'Junimo Hut': 'junimo',
  'Earth Obelisk': 'earthob', 'Water Obelisk': 'waterob', 'Desert Obelisk': 'desertob', 'Island Obelisk': 'islandob',
  'Gold Clock': 'clock', 'Shipping Bin': 'bin', 'Pet Bowl': 'petbowl', Cabin: 'cabin',
};

export type PB = { id: number; type: string; x: number; y: number; w: number; h: number; fixed?: boolean; label?: string };
// layout: strict checks for planned layouts (tree spacing, bee-house flowers); off for the as-is farm
export type Rules = { crows: boolean; junimo: boolean; layout?: boolean };
export type Plan = {
  key: string; title: string; w: number; h: number;
  base: string;            // terrain codes, w*h chars
  tiles: string[];         // item code per tile ('' = empty)
  buildings: PB[];
  rules: Rules;
  notes?: Record<number, string>; // e.g. crop names from the save
};

export const idx = (p: Plan, x: number, y: number) => y * p.w + x;
export const inb = (p: Plan, x: number, y: number) => x >= 0 && y >= 0 && x < p.w && y < p.h;
export function blankPlan(key: string, title: string, def: FarmDef, rules: Rules): Plan {
  return { key, title, w: def.w, h: def.h, base: def.rows.join(''), tiles: Array(def.w * def.h).fill(''), buildings: [], rules };
}
export const clonePlan = (p: Plan): Plan => structuredClone(p);

// ---------- v1.6 coverage rules ----------
// Iridium: 5x5 minus itself (24). Quality: 3x3 minus itself (8). Basic: 4 orthogonal.
export function sprinklerTiles(code: string): [number, number][] {
  const r = code === 'I' ? 2 : code === 'Q' ? 1 : 0, out: [number, number][] = [];
  if (code === 'S') return [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx || dy) out.push([dx, dy]);
  return out;
}
// Scarecrow: Vector2.Distance(scarecrow, crop) < radius; radius 9 (regular/rarecrow) or 17 (deluxe).
export const CROW_R: Record<string, number> = { r: 9, R: 17 };
const circle = new Map<number, [number, number][]>();
export function crowTiles(code: string) {
  const r = CROW_R[code];
  if (!circle.has(r)) {
    const o: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy < r * r) o.push([dx, dy]);
    circle.set(r, o);
  }
  return circle.get(r)!;
}
// Junimo Hut: 3x2 footprint; harvests a 17x17 square centred on the tile in front of the door row (x+1, y+1).
export const JUNIMO_R = 8;
export const hutCenter = (b: { x: number; y: number }) => [b.x + 1, b.y + 1] as const;

export type Analysis = {
  crops: number; sprinklers: Record<string, number>; huts: number; scarecrows: Record<string, number>;
  water: Uint8Array; junimo: Uint8Array; crow: Uint8Array; occupied: Int32Array;
  bad: { water: number[]; junimo: number[]; crow: number[]; placement: number[]; layout: number[] };
  problems: number; counts: Record<string, number>; buildingCounts: Record<string, number>;
};

export function occupancy(p: Plan) {
  const occ = new Int32Array(p.w * p.h).fill(-1);
  p.buildings.forEach((b, i) => { for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inb(p, x, y)) occ[idx(p, x, y)] = i; });
  return occ;
}

export function analyze(p: Plan): Analysis {
  const N = p.w * p.h, water = new Uint8Array(N), junimo = new Uint8Array(N), crow = new Uint8Array(N);
  const counts: Record<string, number> = {}, bc: Record<string, number> = {};
  const occ = occupancy(p);
  const bad = { water: [] as number[], junimo: [] as number[], crow: [] as number[], placement: [] as number[], layout: [] as number[] };
  for (let i = 0; i < N; i++) {
    const c = p.tiles[i]; if (!c) continue;
    counts[c] = (counts[c] ?? 0) + 1;
    const x = i % p.w, y = (i / p.w) | 0;
    if (c === 'I' || c === 'Q' || c === 'S') {
      if (p.base[i] === 's') bad.placement.push(i); // Beach farm: sprinklers don't work on sand
      for (const [dx, dy] of sprinklerTiles(c)) if (inb(p, x + dx, y + dy)) water[idx(p, x + dx, y + dy)] = 1;
    } else if (c === 'R' || c === 'r') {
      for (const [dx, dy] of crowTiles(c)) if (inb(p, x + dx, y + dy)) crow[idx(p, x + dx, y + dy)] = 1;
    }
    const t = TERRAIN[p.base[i]];
    if (occ[i] >= 0 || !t?.walk || ((c === 'C' || c === 'Y') && !t.till)) bad.placement.push(i);
  }
  let huts = 0;
  for (const b of p.buildings) {
    bc[b.type] = (bc[b.type] ?? 0) + 1;
    if (b.type === 'junimo') {
      huts++;
      const [cx, cy] = hutCenter(b);
      for (let y = cy - JUNIMO_R; y <= cy + JUNIMO_R; y++) for (let x = cx - JUNIMO_R; x <= cx + JUNIMO_R; x++) if (inb(p, x, y)) junimo[idx(p, x, y)] = 1;
    }
    if (!b.fixed) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      const i = idx(p, x, y);
      if (!inb(p, x, y) || !TERRAIN[p.base[i]]?.build || occ[i] !== p.buildings.indexOf(b)) bad.placement.push(inb(p, x, y) ? i : 0);
    }
  }
  let crops = 0;
  for (let i = 0; i < N; i++) if (p.tiles[i] === 'C' || p.tiles[i] === 'Y') {
    if (p.tiles[i] === 'C') crops++;
    if (!water[i]) bad.water.push(i);
    if (p.rules.junimo && huts && !junimo[i]) bad.junimo.push(i); // no huts = hand harvest, nothing to check
    if (p.rules.crows && !crow[i]) bad.crow.push(i);
  }
  bad.placement = [...new Set(bad.placement)];
  if (p.rules.layout) {
    const at = (x: number, y: number) => (inb(p, x, y) ? p.tiles[idx(p, x, y)] : '');
    for (let i = 0; i < N; i++) {
      const c = p.tiles[i]; if (!c) continue;
      const x = i % p.w, y = (i / p.w) | 0;
      const near = (test: (n: string, j: number) => boolean) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inb(p, x + dx, y + dy) && test(at(x + dx, y + dy), idx(p, x + dx, y + dy))) return true; return false; };
      // a wild tree can't grow to full size next to another tree
      if ((c === 'A' || c === 'T') && near(n => n === 'A' || n === 'T' || n === 'U')) bad.layout.push(i);
      // a fruit tree needs its 8 surrounding tiles clear
      if (c === 'U' && near((n, j) => (!!n && n !== 'W' && n !== 'P' && n !== 'D') || occ[j] >= 0)) bad.layout.push(i);
      // a bee house only makes flower honey with a flower within 5 tiles
      if (c === 'E') {
        let ok = false;
        for (let dy = -5; dy <= 5 && !ok; dy++) for (let dx = -5; dx <= 5; dx++) if (Math.abs(dx) + Math.abs(dy) <= 5 && at(x + dx, y + dy) === 'Y') { ok = true; break; }
        if (!ok) bad.layout.push(i);
      }
    }
  }
  return {
    crops, huts, water, junimo, crow, occupied: occ, bad, counts, buildingCounts: bc,
    sprinklers: { I: counts.I ?? 0, Q: counts.Q ?? 0, S: counts.S ?? 0 },
    scarecrows: { R: counts.R ?? 0, r: counts.r ?? 0 },
    problems: bad.water.length + bad.junimo.length + bad.crow.length + bad.placement.length + bad.layout.length,
  };
}
