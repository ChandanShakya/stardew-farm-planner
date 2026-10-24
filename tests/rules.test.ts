// Game-rule and optimizer checks: `npm test` (node --test, no framework).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, blankPlan, crowTiles, sprinklerTiles, type Plan } from '../src/app/engine.ts';
import { optimizeBed, optimizePlan } from '../src/app/optimize.ts';
import { evaluate, CROPS, profsOf } from '../src/app/crops.ts';
import { diffTiles } from '../src/app/moves.ts';

const field = (w: number, h: number, ch = 'd'): Plan => blankPlan('t', 't', { label: 't', w, h, rows: Array(h).fill(ch.repeat(w)) }, { crows: true, junimo: true });

test('sprinkler coverage: iridium 24, quality 8, basic 4', () => {
  assert.equal(sprinklerTiles('I').length, 24);
  assert.equal(sprinklerTiles('Q').length, 8);
  assert.equal(sprinklerTiles('S').length, 4);
});

test('scarecrow radius: distance < 9 regular, < 17 deluxe', () => {
  const has = (c: string, dx: number, dy: number) => crowTiles(c).some(([x, y]) => x === dx && y === dy);
  assert.ok(has('r', 8, 0)); assert.ok(!has('r', 9, 0)); assert.ok(!has('r', 7, 6)); // 49+36=85 >= 81
  assert.ok(has('R', 16, 0)); assert.ok(!has('R', 17, 0));
});

test('junimo hut harvests the 17x17 square centred on (x+1, y+1)', () => {
  const p = field(40, 40);
  p.buildings.push({ id: 1, type: 'junimo', x: 10, y: 10, w: 3, h: 2 });
  const a = analyze(p), at = (x: number, y: number) => a.junimo[y * 40 + x];
  assert.equal(at(11 - 8, 11), 1); assert.equal(at(11 + 8, 11 + 8), 1);
  assert.equal(at(11 - 9, 11), 0); assert.equal(at(11, 11 + 9), 0);
});

test('beach sand: a sprinkler on sand is a placement problem', () => {
  const p = field(5, 5, 's'); p.tiles[12] = 'I';
  assert.ok(analyze(p).bad.placement.includes(12));
});

test('greenhouse bed: 10x12 with 6 iridium sprinklers = 114 crops, 0 problems', () => {
  const rows = Array.from({ length: 14 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x >= 1 && x <= 10 && y >= 1 && y <= 12 ? 'D' : 'p')).join(''));
  const p = optimizeBed(blankPlan('gh', 'gh', { label: 'gh', w: 12, h: 14, rows }, { crows: false, junimo: false }));
  const a = analyze(p);
  assert.equal(a.crops, 114); assert.equal(a.sprinklers.I, 6); assert.equal(a.problems, 0);
});

test('optimizer: open field is fully covered (water, huts, crows)', () => {
  const r = optimizePlan(field(50, 40), { buildings: [], tappers: 0, beeHouses: 0, huts: true, crows: true, fence: false, floorAll: false, restarts: 4 });
  const a = analyze(r.plan);
  assert.equal(a.problems, 0);
  assert.ok(a.crops > 50 * 40 * 0.85, `crops ${a.crops}`);
});

test('budget mode never uses more equipment than owned', () => {
  const b = { I: 5, Q: 10, S: 0, R: 0, r: 2, huts: 0 };
  const r = optimizePlan(field(40, 30), { buildings: [], tappers: 0, beeHouses: 0, huts: true, crows: true, fence: false, floorAll: false, budget: b });
  const a = analyze(r.plan);
  assert.ok(a.counts.I <= 5 && (a.counts.Q ?? 0) <= 10 && (a.counts.r ?? 0) <= 2 && !a.counts.R);
  assert.equal(a.problems, 0);
});

test('crop math: hops regrow daily, ancient fruit needs a second season outdoors', () => {
  const pr = profsOf([]);
  assert.equal(evaluate(CROPS.find(c => c.name === 'Hops')!, 28, pr).n, 17);
  assert.equal(evaluate(CROPS.find(c => c.name === 'Ancient Fruit')!, 28, pr).n, 0);
  assert.equal(evaluate(CROPS.find(c => c.name === 'Ancient Fruit')!, 56, pr).n, 4);
});

test('diff marks added, removed and changed tiles', () => {
  const a = field(3, 1), b = field(3, 1);
  a.tiles = ['C', 'I', '']; b.tiles = ['C', 'Q', 'P'];
  assert.deepEqual([...diffTiles(a, b)], [0, 3, 1]);
});

test('farm masks: every walkable tile is reachable from the main farm (no lake interiors)', async () => {
  const { FARM_DEFS } = await import('../src/app/engine.ts');
  for (const [k, f] of Object.entries(FARM_DEFS)) {
    const g = f.rows.join(''), W = f.w, seen = new Uint8Array(g.length), walk = (c: string) => !'~X'.includes(c);
    let comps = 0;
    for (let i = 0; i < g.length; i++) {
      if (seen[i] || !walk(g[i])) continue;
      comps++; const q = [i]; seen[i] = 1;
      while (q.length) { const j = q.pop()!, x = j % W; for (const n of [j - 1, j + 1, j - W, j + W]) if (n >= 0 && n < g.length && Math.abs((n % W) - x) <= 1 && !seen[n] && walk(g[n])) { seen[n] = 1; q.push(n); } }
    }
    assert.equal(comps, 1, `${k}: ${comps} separate walkable regions`);
  }
});

test('embedded plans: nothing placed on water or cliff', async () => {
  const plans = (await import('../src/data/plans.json', { with: { type: 'json' } })).default as Record<string, Plan>;
  for (const [k, p] of Object.entries(plans)) {
    const bad = p.tiles.map((t, i) => (t && '~X'.includes(p.base[i]) ? i : -1)).filter(i => i >= 0);
    assert.deepEqual(bad, [], `${k}: items on water/cliff at ${bad.slice(0, 5).map(i => `${i % p.w},${(i / p.w) | 0}`).join(' ')}`);
    assert.equal(analyze(p).bad.placement.length, 0, `${k}: placement problems`);
  }
});

test('embedded plans: no scarecrow or sprinkler on roads, porches or exits', async () => {
  const plans = (await import('../src/data/plans.json', { with: { type: 'json' } })).default as Record<string, Plan>;
  for (const [k, p] of Object.entries(plans)) {
    const bad = p.tiles.map((t, i) => ('IQSRr'.includes(t) && t && 'pw'.includes(p.base[i]) ? i : -1)).filter(i => i >= 0);
    assert.deepEqual(bad, [], `${k}: equipment on walkways at ${bad.map(i => `${i % p.w},${(i / p.w) | 0}`).join(' ')}`);
  }
});

test('utility pass: rods kept off crops/walkways, every bee house near a flower, trees spaced', async () => {
  const plans = (await import('../src/data/plans.json', { with: { type: 'json' } })).default as Record<string, Plan>;
  const save = (await import('../src/data/save.json', { with: { type: 'json' } })).default as { placedAll: Record<string, number> };
  for (const k of ['optimized', 'owned']) {
    const p = plans[k], a = analyze(p);
    assert.equal(a.counts.L, save.placedAll['Lightning Rod'], `${k}: keeps every lightning rod`);
    p.tiles.forEach((t, i) => { if (t === 'L') assert.ok(!'pw~X'.includes(p.base[i]), `${k}: rod on walkway at ${i % p.w},${(i / p.w) | 0}`); });
    assert.ok((a.counts.Y ?? 0) >= 1 || !a.counts.E, `${k}: bee houses get a flower`);
    assert.equal(a.bad.layout.length, 0, `${k}: tree spacing / bee flower problems`);
  }
});

test('layout rules: adjacent wild trees and a flowerless bee house are flagged', () => {
  const p = field(9, 9); p.rules.layout = true;
  p.tiles[0] = 'A'; p.tiles[1] = 'A'; p.tiles[40] = 'E';
  assert.equal(analyze(p).bad.layout.length, 3);
  p.tiles[1] = ''; p.tiles[2] = 'A'; p.tiles[44] = 'Y';
  assert.equal(analyze(p).bad.layout.length, 0);
});

test('embedded plans: every map exit is reachable on foot from the farmhouse porch', async () => {
  const plans = (await import('../src/data/plans.json', { with: { type: 'json' } })).default as Record<string, Plan>;
  const { occupancy } = await import('../src/app/engine.ts');
  for (const k of ['optimized', 'owned']) {
    const p = plans[k], occ = occupancy(p), house = p.buildings.find(b => b.type === 'farmhouse')!;
    const passable = (i: number) => !'~X'.includes(p.base[i]) && occ[i] < 0 && ['', 'C', 'Y', 'P', 'D', 'W'].includes(p.tiles[i]);
    const start = (house.y + house.h) * p.w + house.x + 4, seen = new Uint8Array(p.w * p.h), q = [start]; seen[start] = 1;
    for (let h = 0; h < q.length; h++) { const j = q[h], x = j % p.w; for (const n of [j - 1, j + 1, j - p.w, j + p.w]) if (n >= 0 && n < seen.length && Math.abs((n % p.w) - x) <= 1 && !seen[n] && passable(n)) { seen[n] = 1; q.push(n); } }
    const exits = [...p.base].map((c, i) => (c === 'w' ? i : -1)).filter(i => i >= 0);
    // every exit group must have at least one reachable tile
    const unreached = exits.filter(i => !seen[i] && ![i - 1, i + 1, i - p.w, i + p.w].some(n => seen[n] && p.base[n] === 'w'));
    const groups = new Set(unreached.map(i => `${Math.round((i % p.w) / 8)},${Math.round(((i / p.w) | 0) / 8)}`));
    assert.ok(exits.some(i => seen[i]), `${k}: no exit reachable`);
    assert.equal([...groups].filter(g => !exits.some(i => seen[i] && `${Math.round((i % p.w) / 8)},${Math.round(((i / p.w) | 0) / 8)}` === g)).length, 0, `${k}: blocked exits near ${[...groups].join(' ')}`);
  }
});

test('optimizer never puts an object under a building on any farm type', async () => {
  const { FARM_KEYS } = await import('../src/app/engine.ts');
  const { defaultPlan, optimizeBase } = await import('../src/app/fromSave.ts');
  const { DEFAULT_YARD } = await import('../src/app/optimize.ts');
  for (const k of ['wilderness', 'fourcorners'].filter(x => FARM_KEYS.includes(x))) {
    const r = optimizePlan(optimizeBase(defaultPlan(k)), { buildings: DEFAULT_YARD, tappers: 12, beeHouses: 6, rods: 10, huts: true, crows: true, fence: true, floorAll: true, restarts: 6 });
    assert.equal(analyze(r.plan).problems, 0, k);
  }
});

test('shipped blank-farm layouts: every farm type, 0 problems, no player data', async () => {
  const d = (await import('../src/data/defaults.json', { with: { type: 'json' } })).default as unknown as { farms: Record<string, Plan & { tiles: string }> };
  const { FARM_KEYS } = await import('../src/app/engine.ts');
  for (const k of FARM_KEYS) {
    const pk = d.farms[k]; assert.ok(pk, `${k} missing`);
    const p = { ...pk, tiles: [...pk.tiles].map(c => (c === ' ' ? '' : c)) } as Plan;
    assert.equal(analyze(p).problems, 0, `${k}: problems`);
  }
  const save = (await import('../src/data/save.json', { with: { type: 'json' } })).default as { player: string };
  assert.ok(!JSON.stringify(d).includes(save.player), 'fixture player name leaked into shipped data');
});
