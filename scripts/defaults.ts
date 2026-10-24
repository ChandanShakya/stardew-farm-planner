// Build the plans the site ships with (no save needed): the optimized layout for every farm type
// from its blank starting map, plus the Ginger Island and Greenhouse beds. Contains no player data.
// Run: node scripts/defaults.ts  (about 80 s)
import { writeFileSync } from 'node:fs';
import { analyze, blankPlan, FARM_DEFS, FARM_KEYS, type Plan } from '../src/app/engine.ts';
import { defaultPlan, optimizeBase } from '../src/app/fromSave.ts';
import { DEFAULT_YARD, optimizeBed, optimizePlan } from '../src/app/optimize.ts';

const pack = (p: Plan) => ({ ...p, tiles: p.tiles.map(t => t || ' ').join('') });
const farms: Record<string, ReturnType<typeof pack>> = {};
for (const k of FARM_KEYS) {
  const t = performance.now();
  const { plan } = optimizePlan(optimizeBase(defaultPlan(k)), { buildings: DEFAULT_YARD, tappers: 12, beeHouses: 6, rods: 0, huts: true, crows: true, fence: true, floorAll: true });
  const a = analyze(plan);
  console.log(`${k.padEnd(12)} ${a.crops} crops · ${a.problems} problems · ${((performance.now() - t) / 1000).toFixed(1)}s`);
  if (a.problems) process.exit(1);
  farms[k] = pack(plan);
}
const island = optimizeBed(blankPlan('island', 'Ginger Island farm', FARM_DEFS.island, { crows: false, junimo: false }));
const rows = Array.from({ length: 14 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x >= 1 && x <= 10 && y >= 1 && y <= 12 ? 'D' : 'p')).join(''));
const greenhouse = optimizeBed(blankPlan('greenhouse', 'Greenhouse', { label: 'Greenhouse', w: 12, h: 14, rows }, { crows: false, junimo: false }));
writeFileSync(new URL('../src/data/defaults.json', import.meta.url), JSON.stringify({ farms, island: pack(island), greenhouse: pack(greenhouse) }));
