// Build the embedded Optimized/Island/Greenhouse plans from the save and print the proof.
import { writeFileSync } from 'node:fs';
import save from '../src/data/save.json' with { type: 'json' };
import { analyze, blankPlan, FARM_DEFS } from '../src/app/engine.ts';
import { currentPlan, optimizeBase } from '../src/app/fromSave.ts';
import { DEFAULT_YARD, optimizePlan, optimizeBed } from '../src/app/optimize.ts';
import type { SaveData } from '../src/app/save.ts';

const t0 = performance.now();
const cur = currentPlan(save as unknown as SaveData);
const { plan, log } = optimizePlan(optimizeBase(cur), { buildings: DEFAULT_YARD, tappers: 12, beeHouses: 6, rods: ownedBudget(save as unknown as SaveData).rods, huts: true, crows: true, fence: true, floorAll: true });
// "Use what I own": same farm, current buildings where they stand, equipment capped at what you own.
import { ownedBudget } from '../src/app/buildlist.ts';
const ob = ownedBudget(save as unknown as SaveData);
const owned = optimizePlan(cur, { buildings: [], keepBuildings: true, tappers: Math.min(12, ob.tappers), beeHouses: Math.min(6, ob.beeHouses), rods: ob.rods, huts: true, crows: true, fence: false, floorAll: true, budget: ob });
owned.plan.title = 'Use what I own';
const island = optimizeBed(blankPlan('island', 'Ginger Island farm', FARM_DEFS.island, { crows: false, junimo: false }));
const gh = optimizeBed(greenhouse());
function greenhouse() {
  const rows = Array.from({ length: 14 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x >= 1 && x <= 10 && y >= 1 && y <= 12 ? 'D' : 'p')).join(''));
  return blankPlan('greenhouse', 'Greenhouse', { label: 'Greenhouse', w: 12, h: 14, rows }, { crows: false, junimo: false });
}
writeFileSync(new URL('../src/data/plans.json', import.meta.url), JSON.stringify({ optimized: plan, owned: owned.plan, island, greenhouse: gh }));
const show = (name: string, p: typeof plan) => {
  const a = analyze(p);
  console.log(`${name}: ${a.crops} crops · ${a.sprinklers.I} iridium + ${a.sprinklers.Q} quality sprinklers · ${a.huts} huts · ${a.scarecrows.R} deluxe scarecrows · unwatered ${a.bad.water.length} · outside Junimo ${a.bad.junimo.length} · crow-exposed ${a.bad.crow.length} · placement ${a.bad.placement.length}`);
  return a;
};
show('Current', cur);
const a = show('Optimized', plan);
show('Owned', owned.plan); console.log(owned.log.join('\n'), JSON.stringify(ob));
show('Island', island); show('Greenhouse', gh);
console.log(log.join('\n'), `\n${((performance.now() - t0) / 1000).toFixed(1)}s`);
if (a.problems) process.exit(1);

import { buildList } from '../src/app/buildlist.ts';
const bl = buildList(save as unknown as SaveData, plan, 10);
for (const r of [...bl.rows, ...bl.endgame]) console.log(`${r.item.padEnd(28)} need ${String(r.need).padStart(5)} have ${String(r.have).padStart(5)} missing ${String(r.missing).padStart(5)} gold ${r.gold.toLocaleString().padStart(11)} ${r.hard?.join(', ') ?? ''}`);
for (const m of bl.materials) console.log(`  ${m.name.padEnd(26)} need ${m.need} have ${m.have} ${m.note ?? ''}`);
console.log(`Build phase ${bl.gold.toLocaleString()}g vs ${bl.money.toLocaleString()}g on hand · endgame ${bl.endGold.toLocaleString()}g`);
