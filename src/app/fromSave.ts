// Turn parsed save data into planner Plans (Current farm + the base for the Optimized plan).
import { BUILDINGS, FARM_DEFS, SAVE_BUILDING, WHICH_FARM, blankPlan, idx, inb, type Plan } from './engine.ts';
import type { SaveData } from './save.ts';

const OBJ: [RegExp, string][] = [
  [/^Iridium Sprinkler$/, 'I'], [/^Quality Sprinkler$/, 'Q'], [/^Sprinkler$/, 'S'],
  [/^Deluxe Scarecrow$/, 'R'], [/^(Scarecrow|Rarecrow)$/, 'r'], [/Fence$/, 'F'], [/^Gate$/, 'G'],
  [/Chest$|^Mini-Fridge$/, 'H'], [/^Bee House$/, 'E'], [/^Lightning Rod$/, 'L'], [/^Tapper|^Heavy Tapper/, 'A'],
  [/^(Keg|Cask|Preserves Jar|Furnace|Dehydrator|Fish Smoker|Crystalarium|Recycling Machine|Seed Maker|Loom|Oil Maker|Mayonnaise Machine|Cheese Press|Bone Mill|Geode Crusher|Charcoal Kiln|Worm Bin|Deluxe Worm Bin|Mushroom Log|Solar Panel|Bait Maker|Heavy Furnace|Crab Pot)$/, 'M'],
];

export const farmKeyOf = (s: SaveData) => WHICH_FARM[s.farmType] ?? 'standard';

export function currentPlan(s: SaveData): Plan {
  const key = farmKeyOf(s), def = FARM_DEFS[key];
  const p = blankPlan(key, 'Current farm', def, { crows: true, junimo: true });
  p.notes = {};
  for (const f of s.features) {
    if (!inb(p, f.x, f.y)) continue;
    const i = idx(p, f.x, f.y);
    const c = { crop: 'C', hoe: 'D', floor: 'P', tree: 'T', fruittree: 'U', grass: 'W', clump: 'Z' }[f.kind];
    if (c) p.tiles[i] = c;
    if (f.kind === 'crop' && f.sub) p.notes[i] = f.sub;
  }
  for (const o of s.objects) {
    if (!inb(p, o.x, o.y)) continue;
    const i = idx(p, o.x, o.y);
    const hit = OBJ.find(([re]) => re.test(o.name));
    if (hit) p.tiles[i] = hit[1] === 'A' && p.tiles[i] !== 'T' ? 'O' : hit[1];
    else if (o.name !== 'Weeds' && o.name !== 'Twig' && o.name !== 'Stone' && o.name !== 'Artifact Spot') p.tiles[i] = 'O';
    p.notes[i] = o.name;
  }
  p.buildings = s.buildings.map((b, i) => {
    const type = SAVE_BUILDING[b.type] ?? 'well';
    return { id: i + 1, type, x: b.x, y: b.y, w: b.w || BUILDINGS[type].w, h: b.h || BUILDINGS[type].h, fixed: type === 'farmhouse' || type === 'greenhouse', label: b.type };
  });
  // The save is ground truth: anything the game let you build/place proves the tile is usable,
  // so calibrate the community tile mask with it.
  const base = [...p.base];
  for (const b of p.buildings) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inb(p, x, y)) {
    const i = idx(p, x, y);
    p.tiles[i] = ''; // tiles under buildings carry no items
    if (base[i] === 'D') base[i] = 'd'; else if (!'dgs'.includes(base[i])) base[i] = 'g';
  }
  for (let i = 0; i < base.length; i++) {
    const c = p.tiles[i];
    if (!c || c === 'W') continue;
    if ((c === 'C' || c === 'D') && !'dDs'.includes(base[i])) base[i] = 'd';
    else if (!'dDsgpw'.includes(base[i])) base[i] = 'g';
  }
  p.base = base.join('');
  return p;
}

// Base for optimizing: same terrain, only the fixed buildings kept (house + greenhouse stay put).
export function optimizeBase(cur: Plan, title = 'Optimized farm'): Plan {
  const p = blankPlan(cur.key, title, FARM_DEFS[cur.key], { crows: true, junimo: true });
  p.base = cur.base;
  p.buildings = cur.buildings.filter(b => b.fixed && b.type !== 'bin').map(b => ({ ...b })); // the yard packer places the bin
  for (const f of FARM_DEFS[cur.key].fixed ?? []) p.buildings.push({ id: 900 + p.buildings.length, type: 'coop', x: f[1], y: f[2], w: f[3], h: f[4], fixed: true, label: 'Starting ' + f[0] });
  return p;
}

// Default plans for a farm type with no save loaded.
export function defaultPlan(key: string): Plan {
  const def = FARM_DEFS[key];
  const p = blankPlan(key, 'Current farm', def, { crows: true, junimo: true });
  if (key === 'custom') return p; // imported map: no known house position, stamp buildings yourself
  const gx = key === 'beach' ? 14 : key === 'fourcorners' ? 36 : 25, gy = key === 'beach' ? 14 : key === 'fourcorners' ? 29 : 10;
  p.buildings = [
    { id: 1, type: 'farmhouse', x: 60, y: 10, w: 9, h: 5, fixed: true },
    { id: 2, type: 'greenhouse', x: gx, y: gy, w: 7, h: 6, fixed: true },
    { id: 3, type: 'bin', x: 71, y: 14, w: 2, h: 1, fixed: true }, // the map tiles under the starting bin are marked blocked
  ];
  for (const f of def.fixed ?? []) p.buildings.push({ id: 4, type: 'coop', x: f[1], y: f[2], w: f[3], h: f[4], fixed: true, label: 'Starting ' + f[0] });
  return p;
}
