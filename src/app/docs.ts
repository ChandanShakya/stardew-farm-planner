// HTML views: Build list (have vs need) and House + Chests storage system.
import { analyze, type Plan } from './engine.ts';
import { buildList } from './buildlist.ts';
import type { SaveData } from './save.ts';

const f = (n: number) => n.toLocaleString('en-US');
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// Storage design: category -> Big Chest. Categories are the game's item category ids.
export const CHESTS: { name: string; color: string; cats: number[]; hint: string }[] = [
  { name: 'Crops & Forage', color: '#4ade80', cats: [-75, -79, -80, -81, -17], hint: 'veg, fruit, flowers, forage' },
  { name: 'Artisan Goods', color: '#c084fc', cats: [-26, -27], hint: 'wine, jelly, honey, syrups' },
  { name: 'Fish & Ocean', color: '#60a5fa', cats: [-4, -23, -21, -22, -20], hint: 'fish, shellfish, bait, tackle, trash' },
  { name: 'Ores & Bars', color: '#9ca3af', cats: [-15], hint: 'ores, bars, coal' },
  { name: 'Gems & Minerals', color: '#22d3ee', cats: [-2, -12], hint: 'gems, geodes, minerals' },
  { name: 'Seeds & Fertilizer', color: '#a3e635', cats: [-74, -19], hint: 'seeds, saplings, fertilizer' },
  { name: 'Building Resources', color: '#d6a15b', cats: [-16, -8, -9, -24], hint: 'wood, stone, crafted items, decor' },
  { name: 'Animal & Kitchen Out', color: '#f9a8d4', cats: [-5, -6, -14, -18, -7], hint: 'eggs, milk, wool, cooked dishes' },
  { name: 'Monster Loot', color: '#f87171', cats: [-28], hint: 'slime, bat wings, essences' },
  { name: 'Gear & Rare', color: '#facc15', cats: [-96, -97, -98, -99, -100, 0], hint: 'rings, boots, weapons, artifacts, specials' },
];
const FRIDGE_CATS = [-25];

export function houseHTML(s: SaveData | null) {
  const inv = s ? Object.entries(s.inventory) : [];
  const groups = CHESTS.map(c => ({ ...c, items: inv.filter(([, v]) => c.cats.includes(v.cat)) }));
  const known = new Set([...CHESTS.flatMap(c => c.cats), ...FRIDGE_CATS]);
  const other = inv.filter(([, v]) => !known.has(v.cat));
  groups[9].items.push(...other);
  const fridge = inv.filter(([, v]) => FRIDGE_CATS.includes(v.cat));
  // only the cellar you can enter (Cellar2..8 belong to co-op cabins, see the Interiors tab)
  const casks = s ? ((s.cellars ?? []).find(c => c.owner === 'you') ?? (s.cellars ?? []).find(c => c.name === 'Cellar'))?.casks.length ?? 0 : 0;
  const machines = s ? Object.entries(s.placedAll).filter(([k]) => /^(Keg|Preserves Jar|Furnace|Dehydrator|Fish Smoker|Crystalarium|Seed Maker|Loom|Oil Maker|Mayonnaise Machine|Cheese Press|Recycling Machine|Bone Mill|Charcoal Kiln|Geode Crusher|Worm Bin|Bee House)$/.test(k)) : [];
  const chestCount = s ? s.chests.length : 0;
  const top = (items: [string, { total: number }][]) => items.sort((a, b) => b[1].total - a[1].total).slice(0, 4).map(([n, v]) => `${esc(n)} ${f(v.total)}`).join(' · ');
  return `
  <h2>House &amp; chests</h2>
  <p>Every chest moves indoors. Big Chests (70 slots) line the living room, one per category, colour-coded. The fridge holds cooking ingredients only, so recipes pull from it. The cellar is for casks. The Big Shed is the machine hall. ${s ? `Your save has <b>${chestCount}</b> chests spread across ${new Set(s.chests.map(c => c.loc)).size} locations; this system replaces them.` : ''}</p>
  <h3>Living room — chest wall</h3>
  <div class="chests">${groups.map((g, i) => {
    const stacks = g.items.length, need = Math.max(1, Math.ceil(stacks / 70));
    return `<div class="chest" style="background:${g.color}"><span class="n">${i + 1}</span><b>${g.name}</b><small>${g.hint}</small>
      <small>${stacks} item types · ${need > 1 ? need + ' chests' : '1 chest'}</small><small style="opacity:.7">${top(g.items) || '—'}</small></div>`;
  }).join('')}</div>
  <div class="rooms" style="margin-top:12px">
    <div class="room"><h4>🧊 Kitchen — fridge</h4><p class="muted">Cooking ingredients only (oil, flour, sugar, rice, vinegar…). Cooking pulls from it directly.</p>
      <p>${fridge.length ? top(fridge) + (fridge.length > 4 ? ` · +${fridge.length - 4} more` : '') : 'No cooking ingredients in storage yet.'}</p></div>
    <div class="room"><h4>📥 Drop chest by the door</h4><p class="muted">Empty Junimo-hut harvests and your pockets here. Sort into the wall once a week.</p></div>
    <div class="room"><h4>🍷 Cellar — ${casks} casks</h4><p class="muted">Ancient Fruit / Starfruit wine ages to iridium quality in 56 days. A wine chest sits at the stairs: finished wine out, new wine in.</p></div>
    <div class="room"><h4>🏚 Big Shed — machine hall</h4><p class="muted">All processing machines move inside (they don't need field tiles).</p>
      <p>${machines.map(([k, n]) => `${esc(k)} ×${n}`).join(' · ') || '—'}</p></div>
  </div>`;
}

export function buildHTML(s: SaveData | null, plan: Plan | null, chests = CHESTS.length) {
  if (!s || !plan) return '<h2>Build list</h2><p>Load a save to see what you own versus what the plan needs.</p>';
  const b = buildList(s, plan, chests), a = analyze(plan);
  const ok = b.gold <= b.money;
  const row = (r: typeof b.rows[0]) => `<tr>
    <td><b>${esc(r.item)}</b>${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}</td>
    <td class="n">${f(r.need)}</td>
    <td class="n">${f(r.have)}${r.haveNote ? `<div class="muted">${esc(r.haveNote)}</div>` : ''}</td>
    <td class="n ${r.missing ? 'badc' : 'okc'}">${r.missing ? f(r.missing) : '✓'}</td>
    <td>${r.mats.map(([m, q]) => `${f(q)} ${esc(m)}`).join(' · ') || '—'}</td>
    <td class="n">${r.gold ? f(r.gold) + 'g' : '—'}</td>
    <td>${(r.hard ?? []).map(h => `<span class="flag">${esc(h)}</span>`).join('')}</td></tr>`;
  const head = '<tr><th>Item</th><th class="n">Plan needs</th><th class="n">You own</th><th class="n">Missing</th><th>Materials for the missing</th><th class="n">Gold</th><th>Hard to get</th></tr>';
  const mats = b.materials.map(m => {
    const pct = Math.min(100, m.need ? (m.have / m.need) * 100 : 100), short = m.have < m.need;
    return `<tr><td>${esc(m.name)}${m.note ? `<div class="muted">${esc(m.note)}</div>` : ''}</td><td class="n">${f(m.need)}</td><td class="n">${f(m.have)}</td>
      <td class="n ${short ? 'badc' : 'okc'}">${short ? f(m.need - m.have) + ' short' : '✓'}</td><td><div class="bar ${short ? 'short' : ''}"><i style="width:${pct}%"></i></div></td></tr>`;
  }).join('');
  return `
  <h2>Build list — ${esc(plan.title)}</h2>
  <p>Counted from your save: backpack, every chest you own (farm, house, sheds, cellar, greenhouse, island), building output chests and placed objects. Sprinklers and scarecrows already on the farm count as owned because you re-use them in the redesign. Costs are v1.6 (Robin, Wizard, crafting recipes).</p>
  <div class="kpis">
    <div class="kpi"><div class="v">${f(b.money)}g</div><div class="l">Gold on hand (save)</div></div>
    <div class="kpi ${ok ? 'ok' : 'bad'}"><div class="v">${f(b.gold)}g</div><div class="l">Build phase gold · ${ok ? 'fully affordable ✓' : 'short ' + f(b.gold - b.money) + 'g'}</div></div>
    <div class="kpi"><div class="v">${f(b.money - b.gold)}g</div><div class="l">Left after build phase</div></div>
    <div class="kpi"><div class="v">${f(a.crops)}</div><div class="l">Crop tiles in plan · ${a.huts} huts · ${a.counts.I ?? 0} iridium</div></div>
    <div class="kpi ${b.hard.length ? 'bad' : 'ok'}"><div class="v">${b.hard.length}</div><div class="l">Materials short: ${esc(b.hard.join(', ') || 'none')}</div></div>
  </div>
  <h3>Build phase</h3><table class="t">${head}${b.rows.map(row).join('')}</table>
  <h3>Materials roll-up</h3><table class="t"><tr><th>Material</th><th class="n">Needed</th><th class="n">Have</th><th class="n">Gap</th><th>Progress</th></tr>${mats}</table>
  <h3>Endgame (save up) — ${f(b.endGold)}g</h3><table class="t">${head}${b.endgame.map(row).join('')}</table>
  <p class="muted">v1.6 prices: Earth and Water Obelisks are 500,000g each, Desert and Island Obelisks 1,000,000g each, and the Gold Clock is 10,000,000g. The Gold Clock also stops fences from decaying and stops debris from spawning on the farm.</p>`;
}
