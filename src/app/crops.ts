// Crop & profit planner (v1.6 base prices, base quality, no fertilizer or Speed-Gro).
// Harvest model: planted on day 1, a crop is ready `days` later; single-harvest crops are
// replanted the same day; regrowing crops produce again every `regrow` days.
export type Crop = {
  name: string; seasons: ('spring' | 'summer' | 'fall')[]; price: number; seed: number | null;
  days: number; regrow?: number; yield?: number; kind: 'fruit' | 'veg' | 'flower' | 'other'; island?: boolean;
};
export const CROPS: Crop[] = [
  { name: 'Parsnip', seasons: ['spring'], price: 35, seed: 20, days: 4, kind: 'veg' },
  { name: 'Green Bean', seasons: ['spring'], price: 40, seed: 60, days: 10, regrow: 3, kind: 'veg' },
  { name: 'Cauliflower', seasons: ['spring'], price: 175, seed: 80, days: 12, kind: 'veg' },
  { name: 'Potato', seasons: ['spring'], price: 80, seed: 50, days: 6, kind: 'veg' },
  { name: 'Kale', seasons: ['spring'], price: 110, seed: 70, days: 6, kind: 'veg' },
  { name: 'Garlic', seasons: ['spring'], price: 60, seed: 40, days: 4, kind: 'veg' },
  { name: 'Rhubarb', seasons: ['spring'], price: 220, seed: 100, days: 13, kind: 'fruit' },
  { name: 'Strawberry', seasons: ['spring'], price: 120, seed: 100, days: 8, regrow: 4, kind: 'fruit' },
  { name: 'Blue Jazz', seasons: ['spring'], price: 50, seed: 30, days: 7, kind: 'flower' },
  { name: 'Tulip', seasons: ['spring'], price: 30, seed: 20, days: 6, kind: 'flower' },
  { name: 'Blueberry', seasons: ['summer'], price: 50, seed: 80, days: 13, regrow: 4, yield: 3, kind: 'fruit' },
  { name: 'Melon', seasons: ['summer'], price: 250, seed: 80, days: 12, kind: 'fruit' },
  { name: 'Hot Pepper', seasons: ['summer'], price: 40, seed: 40, days: 5, regrow: 3, kind: 'fruit' },
  { name: 'Tomato', seasons: ['summer'], price: 60, seed: 50, days: 11, regrow: 4, kind: 'veg' },
  { name: 'Hops', seasons: ['summer'], price: 25, seed: 60, days: 11, regrow: 1, kind: 'other' },
  { name: 'Radish', seasons: ['summer'], price: 90, seed: 40, days: 6, kind: 'veg' },
  { name: 'Red Cabbage', seasons: ['summer'], price: 260, seed: 100, days: 9, kind: 'veg' },
  { name: 'Starfruit', seasons: ['summer'], price: 750, seed: 400, days: 13, kind: 'fruit' },
  { name: 'Wheat', seasons: ['summer', 'fall'], price: 25, seed: 10, days: 4, kind: 'other' },
  { name: 'Summer Spangle', seasons: ['summer'], price: 90, seed: 50, days: 8, kind: 'flower' },
  { name: 'Poppy', seasons: ['summer'], price: 140, seed: 100, days: 7, kind: 'flower' },
  { name: 'Corn', seasons: ['summer', 'fall'], price: 50, seed: 150, days: 14, regrow: 4, kind: 'veg' },
  { name: 'Cranberries', seasons: ['fall'], price: 75, seed: 240, days: 7, regrow: 5, yield: 2, kind: 'fruit' },
  { name: 'Pumpkin', seasons: ['fall'], price: 320, seed: 100, days: 13, kind: 'veg' },
  { name: 'Grape', seasons: ['fall'], price: 80, seed: 60, days: 10, regrow: 3, kind: 'fruit' },
  { name: 'Amaranth', seasons: ['fall'], price: 150, seed: 70, days: 7, kind: 'veg' },
  { name: 'Artichoke', seasons: ['fall'], price: 160, seed: 30, days: 8, kind: 'veg' },
  { name: 'Beet', seasons: ['fall'], price: 100, seed: 20, days: 6, kind: 'veg' },
  { name: 'Bok Choy', seasons: ['fall'], price: 80, seed: 50, days: 4, kind: 'veg' },
  { name: 'Eggplant', seasons: ['fall'], price: 60, seed: 20, days: 5, regrow: 5, kind: 'veg' },
  { name: 'Yam', seasons: ['fall'], price: 160, seed: 60, days: 10, kind: 'veg' },
  { name: 'Fairy Rose', seasons: ['fall'], price: 290, seed: 200, days: 12, kind: 'flower' },
  { name: 'Sweet Gem Berry', seasons: ['fall'], price: 3000, seed: 1000, days: 24, kind: 'other' },
  { name: 'Ancient Fruit', seasons: ['spring', 'summer', 'fall'], price: 550, seed: null, days: 28, regrow: 7, kind: 'fruit' },
  { name: 'Pineapple', seasons: ['summer'], price: 300, seed: null, days: 14, regrow: 7, kind: 'fruit', island: true },
];

// Artisan goods: keg wine 3x (≈7 days), keg juice 2.25x (≈4 days), jar jelly/pickles 2x+50 (≈3 days),
// hops -> Pale Ale 300 (≈1.5 days), wheat -> Beer 200 (≈1.2 days).
export function artisan(c: Crop): { name: string; value: number; days: number; machine: 'Keg' | 'Preserves Jar' } | null {
  if (c.name === 'Hops') return { name: 'Pale Ale', value: 300, days: 1.6, machine: 'Keg' };
  if (c.name === 'Wheat') return { name: 'Beer', value: 200, days: 1.2, machine: 'Keg' };
  if (c.kind === 'fruit') {
    const wine = { name: 'Wine', value: c.price * 3, days: 7, machine: 'Keg' as const };
    const jelly = { name: 'Jelly', value: c.price * 2 + 50, days: 2.8, machine: 'Preserves Jar' as const };
    return wine.value >= jelly.value ? wine : jelly;
  }
  if (c.kind === 'veg') {
    const juice = { name: 'Juice', value: Math.round(c.price * 2.25), days: 4, machine: 'Keg' as const };
    const pickles = { name: 'Pickles', value: c.price * 2 + 50, days: 2.8, machine: 'Preserves Jar' as const };
    return juice.value >= pickles.value ? juice : pickles;
  }
  return null;
}

export type Prof = { tiller: boolean; artisan: boolean; agri: boolean };
export const profsOf = (ids: number[] = []): Prof => ({ tiller: ids.includes(1), artisan: ids.includes(4), agri: ids.includes(5) });

// Harvests for a crop planted on day 1 with `span` growing days available (season length - 1).
export function harvests(c: Crop, span: number, pr: Prof) {
  const d = pr.agri ? Math.max(1, Math.floor(c.days * 0.9)) : c.days;
  if (d > span) return { n: 0, plantings: 1 };
  if (c.regrow) return { n: 1 + Math.floor((span - d) / c.regrow), plantings: 1 };
  const n = Math.floor(span / d);
  return { n, plantings: n };
}

export type Row = { crop: Crop; n: number; raw: number; art: number; artName: string; machine: string; machines: number; seasons: number };
// Gold per tile over a window of `days` (28 per season), raw sale vs. processed.
export function evaluate(c: Crop, days: number, pr: Prof): Row {
  const h = harvests(c, days - 1, pr), y = c.yield ?? 1;
  const seeds = (c.seed ?? 0) * h.plantings;
  const raw = h.n * y * c.price * (pr.tiller && c.kind !== 'other' ? 1.1 : 1) - seeds;
  const a = artisan(c);
  const art = a ? h.n * y * a.value * (pr.artisan ? 1.4 : 1) - seeds : raw;
  // machines per tile to keep up: output per day x processing days
  const period = c.regrow ? c.regrow : (pr.agri ? Math.floor(c.days * 0.9) : c.days);
  return { crop: c, n: h.n, raw: Math.round(raw), art: Math.round(art), artName: a?.name ?? '—', machine: a?.machine ?? '—', machines: a ? (y / period) * a.days : 0, seasons: Math.round(days / 28) };
}

export function seasonTable(season: 'spring' | 'summer' | 'fall', pr: Prof, island = false) {
  // multi-season crops planted now keep growing into the following seasons: count that whole run
  return CROPS.filter(c => c.seasons.includes(season) && (!c.island || island))
    .map(c => evaluate(c, 28 * (c.seasons.length - c.seasons.indexOf(season)), pr))
    .sort((a, b) => b.art / b.seasons - a.art / a.seasons);
}

const f = (n: number) => Math.round(n).toLocaleString('en-US');
export function cropsHTML(areas: { name: string; tiles: number; note: string }[], pr: Prof, owned: { kegs: number; jars: number; casks: number }) {
  const prof = [pr.tiller && 'Tiller (+10% crops)', pr.artisan && 'Artisan (+40% artisan goods)', pr.agri && 'Agriculturist (-10% growth)'].filter(Boolean).join(' · ') || 'no farming professions';
  const [farm, gh, island] = areas;
  const season = (s: 'spring' | 'summer' | 'fall') => {
    const rows = seasonTable(s, pr).slice(0, 6), top = rows[0];
    const kegsNeed = Math.ceil(top.machines * farm.tiles);
    return `<h3>${s[0].toUpperCase() + s.slice(1)} — main farm (${f(farm.tiles)} tiles)</h3>
    <table class="t"><tr><th>Crop</th><th class="n">Harvests</th><th class="n">Raw g/tile</th><th class="n">Processed g/tile</th><th>Best product</th><th class="n">Farm total (processed)</th><th class="n">Machines to keep up</th></tr>
    ${rows.map(r => `<tr><td><b>${r.crop.name}</b>${r.crop.regrow ? ` <span class="muted">regrows ${r.crop.regrow}d</span>` : ''}${r.seasons > 1 ? ` <span class="flag">${r.seasons} seasons</span>` : ''}${r.crop.seed === null ? ' <span class="flag">no shop seeds</span>' : ''}</td><td class="n">${r.n}</td><td class="n">${f(r.raw)}</td><td class="n">${f(r.art)}</td><td>${r.artName}${r.machine !== '—' ? ` <span class="muted">(${r.machine})</span>` : ''}</td><td class="n">${f(r.art * farm.tiles)}g</td><td class="n">${r.machines ? f(r.machines * farm.tiles) : '—'}</td></tr>`).join('')}
    </table><p class="muted">Best: <b>${top.crop.name}</b> → ${top.artName}. Processing a full field needs ~${f(kegsNeed)} ${top.machine === '—' ? 'machines' : top.machine + 's'} running continuously; you own ${owned.kegs} kegs and ${owned.jars} jars, so sell the overflow raw (${f(top.raw * farm.tiles)}g) or stagger it through the casks/kegs you have.</p>`;
  };
  // year-round: greenhouse + island ancient fruit vs starfruit
  const yr = (name: string, tiles: number) => {
    const af = CROPS.find(c => c.name === 'Ancient Fruit')!, sf = CROPS.find(c => c.name === 'Starfruit')!;
    const a = evaluate({ ...af, seasons: ['spring'] }, 112, pr), s = evaluate({ ...sf, seasons: ['spring'] }, 112, pr);
    return `<tr><td><b>${name}</b> <span class="muted">${f(tiles)} tiles, 112 days</span></td><td>Ancient Fruit → Wine: <b>${f(a.art * tiles)}g</b> <span class="muted">(${f(a.machines * tiles)} kegs)</span></td><td>Starfruit → Wine: <b>${f(s.art * tiles)}g</b> <span class="muted">(${f(s.machines * tiles)} kegs, seeds ${f((sf.seed ?? 0) * s.n * tiles)}g)</span></td></tr>`;
  };
  return `<h2>Crops &amp; profit</h2>
  <p>What to plant on each part of the farm, ranked by processed gold per tile per season (crops that span several seasons are ranked by their per-season average; their totals cover the whole run). Professions from your save: <b>${prof}</b>. Base quality, no fertilizer, planted on day 1; single-harvest crops are replanted the same day. v1.6 shop prices.</p>
  ${season('spring')}${season('summer')}${season('fall')}
  <h3>Year-round areas (any season)</h3>
  <table class="t"><tr><th>Area</th><th>Ancient Fruit</th><th>Starfruit</th></tr>${yr(gh.name, gh.tiles)}${yr(island.name, island.tiles)}</table>
  <p class="muted">Ancient Fruit seeds come from the Seed Maker (no shop), so they cost nothing once you have a few; it out-earns Starfruit per tile in any year-round area because it regrows every week. ${owned.casks ? `Your ${owned.casks} cellar casks age the best wine to iridium (2× value).` : ''}</p>`;
}
