// Have-vs-Need build list for a plan, counted from the save's real inventory (v1.6 costs).
import { analyze, type Plan } from './engine.ts';
import { RARECROW_IDS, type SaveData } from './save.ts';

export type Mat = [string, number];
export type Row = { item: string; need: number; have: number; haveNote?: string; missing: number; gold: number; mats: Mat[]; note?: string; hard?: string[] };
export type BuildList = { rows: Row[]; endgame: Row[]; materials: { name: string; need: number; have: number; note?: string }[]; gold: number; endGold: number; money: number; hard: string[] };

// v1.6 Robin / Wizard / Qi costs.
const BUILD: Record<string, { gold: number; mats: Mat[] }> = {
  junimo: { gold: 20000, mats: [['Stone', 200], ['Starfruit', 9], ['Fiber', 100]] },
  slime: { gold: 10000, mats: [['Stone', 500], ['Refined Quartz', 10], ['Iridium Bar', 1]] },
  pond: { gold: 5000, mats: [['Stone', 200], ['Seaweed', 5], ['Green Algae', 5]] },
  shed: { gold: 20000, mats: [['Wood', 550], ['Stone', 300]] }, // Shed -> Big Shed upgrade
  barn: { gold: 25000, mats: [['Wood', 550], ['Stone', 300]] },
  coop: { gold: 20000, mats: [['Wood', 500], ['Stone', 200]] },
  silo: { gold: 100, mats: [['Stone', 100], ['Clay', 10], ['Copper Bar', 5]] },
  mill: { gold: 2500, mats: [['Stone', 50], ['Wood', 150], ['Cloth', 4]] },
  stable: { gold: 10000, mats: [['Hardwood', 100], ['Iron Bar', 5]] },
  well: { gold: 1000, mats: [['Stone', 75]] },
  bin: { gold: 250, mats: [['Wood', 150]] },
  petbowl: { gold: 5000, mats: [['Hardwood', 25]] },
  earthob: { gold: 500000, mats: [['Iridium Bar', 10], ['Earth Crystal', 10]] },
  waterob: { gold: 500000, mats: [['Iridium Bar', 5], ['Clam', 10], ['Coral', 10]] },
  desertob: { gold: 1000000, mats: [['Iridium Bar', 20], ['Coconut', 10], ['Cactus Fruit', 10]] },
  islandob: { gold: 1000000, mats: [['Iridium Bar', 10], ['Dragon Tooth', 10], ['Banana', 10]] },
  clock: { gold: 10000000, mats: [] },
};
const CRAFT: Record<string, Mat[]> = {
  I: [['Gold Bar', 1], ['Iridium Bar', 1], ['Battery Pack', 1]],
  Q: [['Iron Bar', 1], ['Gold Bar', 1], ['Refined Quartz', 1]],
  R: [['Wood', 50], ['Iridium Ore', 1], ['Fiber', 40]],
  F: [['Hardwood', 1]],
  P: [['Stone', 1]],
  E: [['Wood', 40], ['Coal', 8], ['Iron Bar', 1], ['Maple Syrup', 1]],
  A: [['Wood', 40], ['Copper Bar', 2]],
  L: [['Iron Bar', 1], ['Refined Quartz', 1], ['Bat Wing', 5]],
  BigChest: [['Wood', 120], ['Copper Bar', 2]],
};
const HARD = new Set(['Iridium Bar', 'Iridium Ore', 'Battery Pack', 'Starfruit', 'Dragon Tooth', 'Banana', 'Cactus Fruit', 'Refined Quartz']);
const ENDGAME = ['earthob', 'waterob', 'desertob', 'islandob', 'clock'];
const NAMES: Record<string, string> = { junimo: 'Junimo Hut', slime: 'Slime Hutch', pond: 'Fish Pond', shed: 'Big Shed (upgrade Shed)', barn: 'Deluxe Barn', coop: 'Deluxe Coop', silo: 'Silo', mill: 'Mill', stable: 'Stable', well: 'Well', bin: 'Shipping Bin', petbowl: 'Pet Bowl', earthob: 'Earth Obelisk', waterob: 'Water Obelisk', desertob: 'Desert Obelisk', islandob: 'Island Obelisk', clock: 'Gold Clock' };
const SAVE_KEY: Record<string, string[]> = { shed: ['Big Shed'], barn: ['Deluxe Barn'], coop: ['Deluxe Coop'], silo: ['Silo'], mill: ['Mill'], stable: ['Stable'], bin: ['Shipping Bin'], petbowl: ['Pet Bowl'], slime: ['Slime Hutch'], pond: ['Fish Pond'], junimo: ['Junimo Hut'], well: ['Well'], earthob: ['Earth Obelisk'], waterob: ['Water Obelisk'], desertob: ['Desert Obelisk'], islandob: ['Island Obelisk'], clock: ['Gold Clock'] };

// What you can place today without buying or crafting anything (stored + already on the farm).
export function ownedBudget(s: SaveData) {
  const own = (n: string) => (s.inventory[n]?.total ?? 0) + (s.placedBy.Farm?.[n] ?? 0);
  return {
    I: own('Iridium Sprinkler'), Q: own('Quality Sprinkler'), S: own('Sprinkler'),
    R: own('Deluxe Scarecrow'), r: own('Scarecrow') + own('Rarecrow'),
    huts: s.buildings.filter(b => b.type === 'Junimo Hut').length,
    tappers: own('Tapper') + own('Heavy Tapper'), beeHouses: own('Bee House'), rods: own('Lightning Rod'),
  };
}

export function buildList(s: SaveData, plan: Plan, bigChests: number): BuildList {
  const a = analyze(plan);
  const inv = (n: string) => s.inventory[n]?.total ?? 0;
  const farmPlaced = (n: string) => s.placedBy.Farm?.[n] ?? 0;
  const rows: Row[] = [], endgame: Row[] = [];
  const mk = (item: string, need: number, have: number, mats: Mat[], gold = 0, extra: Partial<Row> = {}): Row => {
    const missing = Math.max(0, need - have);
    return { item, need, have, missing, gold: gold * missing, mats: mats.map(([m, q]) => [m, q * missing] as Mat).filter(([, q]) => q > 0), ...extra };
  };
  // equipment (placed-on-farm items are re-used when you redesign; greenhouse/island ones stay put)
  const own = (n: string) => inv(n) + farmPlaced(n);
  rows.push(mk('Iridium Sprinkler', a.counts.I ?? 0, own('Iridium Sprinkler'), CRAFT.I, 0, { haveNote: `${farmPlaced('Iridium Sprinkler')} on farm + ${inv('Iridium Sprinkler')} stored` }));
  rows.push(mk('Quality Sprinkler', a.counts.Q ?? 0, own('Quality Sprinkler'), CRAFT.Q, 0, { haveNote: `${farmPlaced('Quality Sprinkler')} on farm + ${inv('Quality Sprinkler')} stored` }));
  const rare = s.rarecrows.length, recipe = s.recipes.includes('Deluxe Scarecrow');
  const missRare = RARECROW_IDS.filter(i => !s.rarecrows.includes(i)).map(i => '#' + (RARECROW_IDS.indexOf(i) + 1));
  rows.push(mk('Deluxe Scarecrow', a.counts.R ?? 0, own('Deluxe Scarecrow'), CRAFT.R, 0, {
    note: recipe ? 'Recipe known' : `Recipe locked: ${rare}/8 Rarecrows owned — missing ${missRare.join(', ')}. Bridge with regular Scarecrows (radius 8) until then.`,
    hard: recipe ? [] : ['Rarecrows ' + missRare.join(', ')],
  }));
  rows.push(mk('Hardwood Fence', a.counts.F ?? 0, own('Hardwood Fence'), CRAFT.F));
  rows.push(mk('Stone Floor', a.counts.P ?? 0, own('Stone Floor'), CRAFT.P, 0, { note: 'Weed-proofing: debris cannot spawn on flooring' }));
  rows.push(mk('Tapper', a.counts.A ?? 0, own('Tapper') + own('Heavy Tapper'), CRAFT.A, 0, { note: `Tree seeds on hand: ${inv('Maple Seed')} maple · ${inv('Acorn')} acorn · ${inv('Pine Cone')} pine cone` }));
  rows.push(mk('Bee House', a.counts.E ?? 0, own('Bee House'), CRAFT.E));
  rows.push(mk('Fairy Seeds (bee-house flower)', a.counts.Y ?? 0, inv('Fairy Seeds'), [], 200, { note: 'Pierre, fall, 200g. Any flower works; Fairy Rose makes the most valuable honey.' }));
  rows.push(mk('Lightning Rod', a.counts.L ?? 0, own('Lightning Rod'), CRAFT.L, 0, { note: 'Each strike in a storm charges an empty rod → 1 Battery Pack (Iridium Sprinklers need one each)' }));
  rows.push(mk('Big Chest (house storage)', bigChests, own('Big Chest') + inv('Big Chest'), CRAFT.BigChest, 0, { note: s.recipes.includes('Big Chest') ? 'Recipe known' : 'Recipe from Robin' }));
  // buildings
  const have: Record<string, number> = {};
  for (const b of s.buildings) for (const [k, names] of Object.entries(SAVE_KEY)) if (names.includes(b.type)) have[k] = (have[k] ?? 0) + 1;
  const needB: Record<string, number> = {};
  // buildings carried over from the save (they have a save label) already exist where they stand
  for (const b of plan.buildings) if (BUILD[b.type] && !b.fixed && !b.label) needB[b.type] = (needB[b.type] ?? 0) + 1;
  for (const [k, n] of Object.entries(needB)) {
    const c = BUILD[k], row = mk(NAMES[k] ?? k, n, have[k] ?? 0, c.mats, c.gold);
    if (k === 'shed' && s.buildings.some(b => b.type === 'Shed')) row.note = 'You own a Shed — Robin upgrades it in place';
    (ENDGAME.includes(k) ? endgame : rows).push(row);
  }
  for (const r of [...rows, ...endgame]) r.hard = [...(r.hard ?? []), ...r.mats.filter(([m]) => HARD.has(m)).map(([m, q]) => `${q} ${m}`)];
  // material roll-up
  const tally = (list: Row[]) => {
    const t: Record<string, number> = {};
    for (const r of list) for (const [m, q] of r.mats) t[m] = (t[m] ?? 0) + q;
    return Object.entries(t).sort((x, y) => y[1] - x[1]).map(([name, need]) => ({
      name, need, have: inv(name),
      note: name === 'Iridium Bar' ? `+${Math.floor(inv('Iridium Ore') / 5)} more by smelting ${inv('Iridium Ore')} ore` : undefined,
    }));
  };
  const gold = rows.reduce((t, r) => t + r.gold, 0), endGold = endgame.reduce((t, r) => t + r.gold, 0);
  const materials = tally(rows);
  const hard = materials.filter(m => m.need > m.have + (m.name === 'Iridium Bar' ? Math.floor(inv('Iridium Ore') / 5) : 0)).map(m => m.name);
  return { rows, endgame, materials: [...materials, ...tally(endgame).map(m => ({ ...m, name: m.name + ' (endgame)' }))], gold, endGold, money: s.money, hard };
}
