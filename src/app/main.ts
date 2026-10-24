// App controller: tabs, tools, editing, history, autosave, import/export, save upload, views.
import { analyze, BUILDINGS, clonePlan, FARM_DEFS, FARM_KEYS, idx, inb, ITEMS, TERRAIN, type Analysis, type Plan } from './engine.ts';
import { currentPlan, defaultPlan, farmKeyOf, optimizeBase } from './fromSave.ts';
import { DEFAULT_YARD, fixGaps, type Budget, type OptOptions } from './optimize.ts';
import { ownedBudget } from './buildlist.ts';
import { buildWorld, drawView, overlayLayers, TILE, type Cam, type Overlays, type OvDraw, type OvKey } from './render2d.ts';
import { iconURL, TERRAIN_COLOR } from './sprites.ts';
import { parseSave, readSaveFile, type SaveData } from './save.ts';
import type { View3D } from './render3d.ts';
import { buildHTML, houseHTML } from './docs.ts';
import { cropsHTML, profsOf } from './crops.ts';
import { diffTiles, movesHTML } from './moves.ts';
import { drawShed, interiorsHTML } from './interiors.ts';
import { artCount, artReady, clearArt, loadFromFiles, restoreCache, setArtOn } from './gameart.ts';
import { parseTmx } from './tmx.ts';
import { decodeShare, encodeShare } from './share.ts';
import { detectLang, LANGS, setLang, t as tr } from './i18n.ts';
import OptWorker from './opt.worker.ts?worker&inline';
import SAVE from '../data/save.json';
import PLANS from '../data/plans.json';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const ACCENT = '#4ade80';
const STORE = 'sdv-planner-v7';
// bump when embedded maps/plans change in a way that invalidates old autosaves (v2: lake interiors fixed)
const PLAN_KEY = 'plans-v2:';

// ---------- state ----------
type TabKey = 'current' | 'optimized' | 'owned' | 'island' | 'greenhouse' | 'house' | 'build' | 'moves' | 'crops' | 'interiors';
const TABS: [TabKey, string][] = [['current', 'Current farm'], ['optimized', 'Optimized ★'], ['owned', 'Use what I own'], ['island', 'Ginger Island'], ['greenhouse', 'Greenhouse'], ['build', 'Build list'], ['moves', 'Move plan'], ['crops', 'Crops & profit'], ['house', 'House & chests'], ['interiors', 'Interiors']];
const GRID: TabKey[] = ['current', 'optimized', 'owned', 'island', 'greenhouse'];
type GridKey = 'current' | 'optimized' | 'owned' | 'island' | 'greenhouse';

// imported custom map (.tmx) survives reloads
const customMap = load<typeof FARM_DEFS[string]>('customMap');
if (customMap) { FARM_DEFS.custom = customMap; if (!FARM_KEYS.includes('custom')) FARM_KEYS.push('custom'); }
setLang(load<string>('lang') ?? detectLang());
let save: SaveData | null = load<SaveData>('save') ?? (SAVE as SaveData);
let farmKey: string = load<string>('farm') ?? farmKeyOf(save);
let plans = {} as Record<GridKey, Plan | null>;
let tab: TabKey = (load<TabKey>('tab') ?? 'optimized');
let view: '2d' | '3d' = '2d';
let tool = 'C', rectMode = false;
let ov: Overlays = { water: false, junimo: false, crow: false, problems: true, grid: true, labels: true, diff: false, ...load<Partial<Overlays>>('ov') };
const cams: Record<string, Cam> = {};
const hist: Record<string, { u: string[]; r: string[] }> = {};
let A: Analysis | null = null, world: HTMLCanvasElement | null = null, layers: Partial<Record<OvKey, HTMLCanvasElement>> = {};
// overlay animation state: current opacity + when its reveal started
const ovAnim: Record<OvKey, { a: number; start: number }> = { junimo: { a: 0, start: -1e9 }, crow: { a: 0, start: -1e9 }, water: { a: 0, start: -1e9 }, diff: { a: 0, start: -1e9 }, problems: { a: 1, start: -1e9 } };
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastFrame = performance.now();
let buildFor: 'optimized' | 'owned' = load<'optimized' | 'owned'>('buildFor') ?? 'optimized';
const ownOpts = { keepBuildings: true, fence: false, floorAll: true, ...load<{ keepBuildings: boolean; fence: boolean; floorAll: boolean }>('ownOpt') };
const optOpts: OptOptions = { buildings: DEFAULT_YARD, tappers: 12, beeHouses: 6, huts: true, crows: true, fence: true, floorAll: true, ...load<Partial<OptOptions>>('opt') };

function load<T>(k: string): T | null { try { const v = localStorage.getItem(STORE + ':' + k); return v ? JSON.parse(v) : null; } catch { return null; } }
function store(k: string, v: unknown) { try { localStorage.setItem(STORE + ':' + k, JSON.stringify(v)); } catch { /* quota or private mode: autosave is best-effort */ } }
const pack = (p: Plan) => ({ ...p, tiles: p.tiles.map(t => t || ' ').join('') });
const unpack = (p: ReturnType<typeof pack> | Plan): Plan => ({ ...p, tiles: typeof p.tiles === 'string' ? [...p.tiles].map(c => (c === ' ' ? '' : c)) : p.tiles } as Plan);
const plan = () => (GRID.includes(tab) ? plans[tab as GridKey] : null);

function loadFarm(key: string) {
  farmKey = key;
  if (!FARM_DEFS[key]) key = 'standard';
  farmKey = key;
  const saved = load<Record<string, ReturnType<typeof pack> | null>>(PLAN_KEY + key);
  const fromSave = save && farmKeyOf(save) === key;
  const d = SAVE as SaveData; // the embedded plans were computed from this exact save
  const embedded = fromSave && save!.player === d.player && save!.money === d.money && save!.day === d.day && save!.year === d.year;
  plans = {
    current: saved?.current ? unpack(saved.current) : fromSave ? currentPlan(save!) : defaultPlan(key),
    optimized: saved?.optimized ? unpack(saved.optimized) : embedded ? unpack(PLANS.optimized as Plan) : null,
    owned: saved?.owned ? unpack(saved.owned) : embedded ? unpack(PLANS.owned as Plan) : null,
    island: saved?.island ? unpack(saved.island) : unpack(PLANS.island as Plan),
    greenhouse: saved?.greenhouse ? unpack(saved.greenhouse) : unpack(PLANS.greenhouse as Plan),
  };
  store('farm', key);
  if (FARM_DEFS[key].approx) toast('Meadowlands terrain is approximate (no verified tile data). Load your save to calibrate it.', 6000);
}
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => store(PLAN_KEY + farmKey, Object.fromEntries(Object.entries(plans).map(([k, p]) => [k, p ? pack(p) : null]))), 300);
}

// ---------- history ----------
const H = () => (hist[farmKey + tab] ??= { u: [], r: [] });
function snap() { const p = plan(); if (!p) return; const h = H(); h.u.push(JSON.stringify(pack(p))); if (h.u.length > 120) h.u.shift(); h.r = []; }
function undo() { const p = plan(), h = H(); const s = h.u.pop(); if (!p || !s) return; h.r.push(JSON.stringify(pack(p))); plans[tab as GridKey] = unpack(JSON.parse(s)); changed(); }
function redo() { const p = plan(), h = H(); const s = h.r.pop(); if (!p || !s) return; h.u.push(JSON.stringify(pack(p))); plans[tab as GridKey] = unpack(JSON.parse(s)); changed(); }

// ---------- tools ----------
type Tool = { id: string; label: string; key: string; shift?: boolean; icon?: string; glyph?: string };
const BLIB = ['junimo', 'barn', 'coop', 'silo', 'shed', 'mill', 'stable', 'slime', 'pond', 'well', 'earthob', 'waterob', 'desertob', 'islandob', 'clock', 'bin', 'petbowl', 'cabin'];
const TOOLS: [string, Tool[]][] = [
  ['Edit', [{ id: 'select', label: 'Select / move', key: 'V', glyph: '⬚' }, { id: 'erase', label: 'Eraser', key: 'E', glyph: '⌫' }, { id: 'fill', label: 'Fill area', key: 'B', glyph: '◧' }, { id: 'rect', label: 'Rectangle mode', key: 'R', glyph: '▭' }]],
  ['Crops', [{ id: 'C', label: 'Crop', key: 'C', icon: 'C' }]],
  ['Sprinklers', [{ id: 'I', label: 'Iridium (5×5)', key: 'I', icon: 'I' }, { id: 'Q', label: 'Quality (3×3)', key: 'Q', icon: 'Q' }, { id: 'S', label: 'Basic (4 tiles)', key: 'S', icon: 'S' }]],
  ['Scarecrows', [{ id: 'R', label: 'Deluxe (r 16)', key: 'D', icon: 'R' }, { id: 'r', label: 'Scarecrow (r 8)', key: 'K', icon: 'r' }]],
  ['Fences & paths', [{ id: 'F', label: 'Fence', key: 'F', icon: 'F' }, { id: 'G', label: 'Gate', key: 'G', icon: 'G' }, { id: 'P', label: 'Path / flooring', key: 'P', icon: 'P' }]],
  ['Trees', [{ id: 'T', label: 'Tree', key: 'T', icon: 'T' }, { id: 'A', label: 'Tapper tree', key: 'A', icon: 'A' }, { id: 'U', label: 'Fruit tree', key: 'O', icon: 'U' }]],
  ['Objects', [{ id: 'E', label: 'Bee house', key: 'H', icon: 'E' }, { id: 'M', label: 'Machine', key: 'M', icon: 'M' }, { id: 'H', label: 'Chest', key: 'X', icon: 'H' }, { id: 'L', label: 'Lightning rod', key: 'L', icon: 'L' }]],
  ['Buildings', BLIB.map((b, i) => ({ id: 'b:' + b, label: `${BUILDINGS[b].name} ${BUILDINGS[b].w}×${BUILDINGS[b].h}`, key: String((i % 9) + 1), shift: i >= 9, glyph: '' }))],
];
const ALL_TOOLS = TOOLS.flatMap(([, t]) => t);

function renderTools() {
  $('tools').innerHTML = TOOLS.map(([g, ts]) => `<div class="tgroup" role="group" aria-label="${tr(g)}"><h4>${tr(g)}</h4>${ts.map(t => {
    const ic = t.icon ? `<img src="${iconURL(t.icon)}" alt="">` : t.id.startsWith('b:') ? `<span class="glyph" style="background:${BUILDINGS[t.id.slice(2)].roof}"></span>` : `<span class="glyph">${t.glyph}</span>`;
    const on = t.id === tool || (t.id === 'rect' && rectMode);
    const label = t.id.startsWith('b:') ? t.label : tr(t.label);
    return `<button class="tool ${on ? 'on' : ''}" data-tool="${t.id}" aria-pressed="${on}" title="${label} (${t.shift ? 'Shift+' : ''}${t.key})">${ic}<span class="lbl">${label}</span><kbd>${t.shift ? '⇧' : ''}${t.key}</kbd></button>`;
  }).join('')}</div>`).join('');
}
$('tools').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]'); if (!b) return;
  pick(b.dataset.tool!);
});
function pick(id: string) {
  if (id === 'rect') rectMode = !rectMode; else tool = id;
  renderTools(); render();
}

// ---------- tabs / layout ----------
function renderTabs() {
  $('tabs').innerHTML = TABS.map(([k, n]) => `<button role="tab" data-tab="${k}" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${tr(n)}</button>`).join('');
}
$('tabs').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]'); if (b) setTab(b.dataset.tab as TabKey); });
function setTab(t: TabKey) {
  tab = t; store('tab', t); renderTabs();
  const grid = GRID.includes(t);
  $('canvasWrap').hidden = !grid; $('doc').hidden = grid; $('stats').hidden = !grid;
  document.querySelector<HTMLElement>('.viewbar')!.style.display = grid ? '' : 'none';
  $('tools').style.visibility = grid ? '' : 'hidden';
  if (!grid) { v3?.stop(); renderDoc(); }
  if ((t === 'optimized' || t === 'owned') && !plans[t] && plans.current) runOptimize(t);
  changed(true);
}

function renderDoc() {
  const doc = $('doc');
  if (tab === 'house') { doc.innerHTML = houseHTML(save); return; }
  if (tab === 'interiors') { doc.innerHTML = interiorsHTML(save); drawShed(save); return; }
  const seg = `<div class="seg doc-seg" role="tablist">${([['optimized', 'Optimized ★'], ['owned', 'Use what I own']] as const).map(([k, n]) => `<button data-bf="${k}" class="${buildFor === k ? 'on' : ''}">${tr(n)}</button>`).join('')}</div>`;
  const p = plans[buildFor];
  const missing = `<h2>${tr(TABS.find(x => x[0] === tab)![1])}</h2><p>Open the “${tr(buildFor === 'owned' ? 'Use what I own' : 'Optimized ★')}” tab once to generate that plan.</p>`;
  if (tab === 'build') doc.innerHTML = seg + (p ? buildHTML(save, p) : missing);
  else if (tab === 'moves') doc.innerHTML = seg + (p && plans.current ? movesHTML(plans.current, p, tr(buildFor === 'owned' ? 'Use what I own' : 'Optimized ★')) : missing);
  else if (tab === 'crops') {
    const crops = (q: Plan | null) => q ? q.tiles.filter(x => x === 'C').length : 0;
    const own = (n: string) => save ? (save.placedAll[n] ?? 0) + (save.inventory[n]?.total ?? 0) : 0;
    doc.innerHTML = seg + cropsHTML([
      { name: tr(buildFor === 'owned' ? 'Use what I own' : 'Optimized ★'), tiles: crops(p), note: '' },
      { name: tr('Greenhouse'), tiles: crops(plans.greenhouse), note: '' },
      { name: tr('Ginger Island'), tiles: crops(plans.island), note: '' },
    ], profsOf(save?.professions), { kegs: own('Keg'), jars: own('Preserves Jar'), casks: own('Cask') });
  }
}
$('doc').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-bf]'); if (!b) return;
  buildFor = b.dataset.bf as 'optimized' | 'owned'; store('buildFor', buildFor); renderDoc();
});

// ---------- analysis + rendering ----------
const cv = $<HTMLCanvasElement>('cv'), ctx = cv.getContext('2d')!;
let dirty = true, rafPending = false, worldFor: Plan | null = null;
let hover: { x: number; y: number } | null = null, rectDrag: { x0: number; y0: number; x1: number; y1: number } | null = null;
let v3: View3D | null = null;

function changed(fit = false) {
  const p = plan();
  dirty = true;
  if (p) { A = analyze(p); persist(); if (fit || !cams[farmKey + tab]) fitCam(); }
  renderStats(); renderOverlays(); renderOpt(); render();
  if (view === '3d' && p) show3d(false);
}
function render() { if (!rafPending) { rafPending = true; requestAnimationFrame(frame); } }
function frame() {
  rafPending = false;
  const p = plan(); if (!p || view !== '2d') return;
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  if (dirty || worldFor !== p) {
    world = buildWorld(p);
    const diff = ov.diff && (tab === 'optimized' || tab === 'owned') && plans.current ? diffTiles(plans.current, p) : null;
    layers = A ? overlayLayers(p, A, diff) : {}; dirty = false; worldFor = p;
  }
  const cam = cams[farmKey + tab];
  if (!cam) { fitCam(); return; }
  let hv: { x: number; y: number; w: number; h: number; ok: boolean } | null = null;
  if (hover) {
    if (tool.startsWith('b:')) { const d = BUILDINGS[tool.slice(2)]; hv = { x: hover.x, y: hover.y, w: d.w, h: d.h, ok: canBuild(p, tool.slice(2), hover.x, hover.y) }; }
    else if (moving) hv = { x: moving.b.x, y: moving.b.y, w: moving.b.w, h: moving.b.h, ok: canBuild(p, moving.b.type, moving.b.x, moving.b.y, moving.b.id) };
    else hv = { x: hover.x, y: hover.y, w: 1, h: 1, ok: tool === 'select' || tool === 'erase' || tool === 'fill' || canPaint(p, hover.x, hover.y, tool) };
  }
  // animate overlays: fade toward target, circular reveal on enable, gentle pulse on problems
  const now = performance.now(), dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  let animating = false;
  const draws: OvDraw[] = [];
  for (const k of ['junimo', 'crow', 'water', 'diff', 'problems'] as OvKey[]) {
    const st = ovAnim[k], target = ov[k] && layers[k] ? 1 : 0;
    st.a = REDUCE ? target : st.a + (target - st.a) * Math.min(1, dt * 9);
    if (Math.abs(st.a - target) > 0.01) animating = true; else st.a = target;
    const reveal = REDUCE ? 1 : Math.min(1, (now - st.start) / 550);
    if (reveal < 1) animating = true;
    let alpha = st.a;
    if (k === 'problems' && A && A.problems && !REDUCE) { alpha *= 0.7 + 0.3 * Math.sin(now / 160); animating = true; }
    if (layers[k]) draws.push({ img: layers[k]!, alpha, reveal });
  }
  drawView(ctx, cv, dpr, p, world!, draws, cam, ov, hv, rectDrag, ACCENT);
  if (animating) render();
}
function fitCam() {
  const p = plan(); if (!p) return;
  const w = cv.clientWidth || 800, h = cv.clientHeight || 600;
  const z = Math.min(w / (p.w * TILE), h / (p.h * TILE)) * 0.96;
  cams[farmKey + tab] = { z, x: -(w / z - p.w * TILE) / 2, y: -(h / z - p.h * TILE) / 2 };
  render();
}
function zoomAt(f: number, sx = cv.clientWidth / 2, sy = cv.clientHeight / 2) {
  const c = cams[farmKey + tab]; if (!c) return;
  const z = Math.max(0.25, Math.min(8, c.z * f));
  const wx = c.x + sx / c.z, wy = c.y + sy / c.z;
  c.z = z; c.x = wx - sx / z; c.y = wy - sy / z; render();
}
new ResizeObserver(() => render()).observe($('canvasWrap'));

// ---------- stats / panels ----------
function pct(bad: number, n: number) { return n ? Math.floor(((n - bad) / n) * 1000) / 10 : 100; }
function renderStats() {
  const p = plan(), a = A;
  if (!p || !a) { $('stats').innerHTML = ''; return; }
  const chip = (t: string, cls = '') => `<span class="chip ${cls}">${t}</span>`;
  const cov = (name: string, bad: number, active: boolean) => active ? chip(`<span class="dot"></span>${name} <b>${pct(bad, a.crops)}%</b>`, bad ? 'bad' : 'ok') : chip(`${name} n/a`);
  $('stats').innerHTML = [
    chip(`${tr('Crops')} <b>${a.crops.toLocaleString()}</b>`),
    chip(`${tr('Sprinklers')} <b>${a.sprinklers.I}</b> ${tr('iridium')} · <b>${a.sprinklers.Q}</b> ${tr('quality')}${a.sprinklers.S ? ` · <b>${a.sprinklers.S}</b> ${tr('basic')}` : ''}`),
    p.rules.junimo ? chip(`${tr('Huts')} <b>${a.huts}</b>`) : '',
    p.rules.crows ? chip(`${tr('Scarecrows')} <b>${a.scarecrows.R}</b> ${tr('deluxe')} · <b>${a.scarecrows.r}</b> ${tr('regular')}`) : '',
    cov(tr('Water'), a.bad.water.length, true),
    cov(tr('Junimo'), a.bad.junimo.length, p.rules.junimo && a.huts > 0),
    cov(tr('Crows'), a.bad.crow.length, p.rules.crows),
    chip(a.problems ? `⚠ ${a.problems.toLocaleString()} ${tr('problems')}` : `✓ 0 ${tr('problems')}`, 'badge ' + (a.problems ? 'bad' : 'ok')),
  ].join('');
}
const OVS: [keyof Overlays, string, string, string][] = [['water', 'Water', '#38bdf8', 'W'], ['junimo', 'Junimo', '#facc15', 'J'], ['crow', 'Crows', '#f97316', 'Y'], ['problems', 'Problems', '#ef4444', 'N'], ['grid', 'Grid', '#64748b', 'Shift+G'], ['labels', 'Labels', '#e2e8f0', 'Z'], ['diff', 'Diff', 'linear-gradient(90deg,#4ade80,#fbbf24,#ef4444)', 'Shift+D']];
function renderOverlays() {
  const vs = tab === 'optimized' || tab === 'owned';
  $('overlays').innerHTML = OVS.filter(([k]) => k !== 'diff' || vs).map(([k, n, c, key]) => `<button class="tog ${ov[k] ? 'on' : ''}" data-ov="${k}" aria-pressed="${!!ov[k]}" title="${tr(n)} (${key})${k === 'diff' ? ' — vs Current farm' : ''}"><span class="sw" style="background:${c}"></span>${tr(n)}</button>`).join('');
}
$('overlays').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ov]'); if (b) toggleOv(b.dataset.ov as keyof Overlays); });
function toggleOv(k: keyof Overlays) {
  ov[k] = !ov[k]; store('ov', ov);
  if (ov[k] && k in ovAnim) ovAnim[k as OvKey].start = performance.now();
  if (k === 'diff') dirty = true; // diff layer is built on demand
  renderOverlays(); render();
  if (view === '3d') show3d(false);
}

function renderLegend() {
  const items = ['C', 'I', 'Q', 'S', 'R', 'r', 'F', 'G', 'P', 'T', 'A', 'U', 'E', 'M', 'H', 'L'];
  const terr = ['d', 's', 'g', 'p', '~', 'X'];
  $('legend').innerHTML = items.map(c => `<div><img src="${iconURL(c, 16)}" alt="">${ITEMS[c].name}</div>`).join('') +
    terr.map(t => `<div><i style="background:${TERRAIN_COLOR[t]}"></i>${TERRAIN[t].name.replace(/ \(.*/, '')}</div>`).join('') +
    `<div><i style="background:${BUILDINGS.junimo.roof}"></i>Junimo Hut</div><div><i style="background:${BUILDINGS.pond.color}"></i>Fish Pond</div><div><i style="background:${BUILDINGS.earthob.color}"></i>Obelisk</div><div><i style="background:#ef4444"></i>Problem tile</div>`;
}

function renderOpt() {
  const p = plan();
  const box = $('optBox');
  if (!p) { box.innerHTML = '<span class="muted">Switch to a map tab.</span>'; return; }
  const bed = tab === 'island' || tab === 'greenhouse';
  if (tab === 'owned') {
    const b = budget();
    const ck = (k: keyof typeof ownOpts, l: string) => `<label>${tr(l)}<input type="checkbox" data-w="${k}" ${ownOpts[k] ? 'checked' : ''}></label>`;
    box.innerHTML = `<div class="opt"><p class="muted" style="margin:0 0 6px">Re-lays the farm using only equipment you already own${save && farmKeyOf(save) === farmKey ? ' (save: stored + on the farm)' : ' (counted from the Current tab)'}. Nothing to buy or craft.</p>
      <div class="own">${[['Iridium', b.I], ['Quality', b.Q], ['Basic', b.S], ['Deluxe crow', b.R], ['Scarecrow', b.r], ['Junimo huts', b.huts]].map(([n, v]) => `<span><b>${v}</b> ${n}</span>`).join('')}</div>
      ${ck('keepBuildings', 'Keep buildings where they are')}${ck('fence', 'Fence ring')}${ck('floorAll', 'Floor every open tile (weed-proof)')}
      <button class="btn primary" id="optRun">${tr('Re-optimize with what I own')}</button><div class="log" id="optLog"></div></div>`;
    box.querySelectorAll<HTMLInputElement>('[data-w]').forEach(i => i.onchange = () => { (ownOpts as Record<string, boolean>)[i.dataset.w!] = i.checked; store('ownOpt', ownOpts); });
    $('optRun').onclick = () => runOptimize('owned');
    return;
  }
  const num = (k: 'tappers' | 'beeHouses', l: string) => `<label>${tr(l)}<input type="number" min="0" max="40" data-o="${k}" value="${optOpts[k]}"></label>`;
  const chk = (k: 'huts' | 'crows' | 'fence' | 'floorAll', l: string) => `<label>${tr(l)}<input type="checkbox" data-o="${k}" ${optOpts[k] ? 'checked' : ''}></label>`;
  box.innerHTML = `<div class="opt">${bed ? '<p class="muted" style="margin:0">Hand-harvest bed: 5×5 iridium lattice, no huts or crows.</p>' :
    chk('huts', 'Junimo huts') + chk('crows', 'Deluxe scarecrows') + chk('fence', 'Fence ring') + chk('floorAll', 'Floor every open tile (weed-proof)') + num('tappers', 'Tapper trees') + num('beeHouses', 'Bee houses')}
    <button class="btn primary" id="optRun">${tr(bed ? 'Re-lay sprinklers' : tab === 'current' ? 'Best possible → Optimized tab' : 'Re-optimize this farm')}</button>
    ${tab === 'current' ? `<button class="btn" id="optOwn">${tr('With what I own → its tab')}</button>` : ''}
    <button class="btn" id="fixGaps">${tr('Fix coverage gaps')}</button><div class="log" id="optLog"></div></div>`;
  box.querySelectorAll<HTMLInputElement>('[data-o]').forEach(i => i.onchange = () => {
    const k = i.dataset.o as keyof OptOptions;
    (optOpts as Record<string, unknown>)[k] = i.type === 'checkbox' ? i.checked : Math.max(0, Math.min(40, +i.value || 0));
    store('opt', optOpts);
  });
  $('optRun').onclick = () => runOptimize();
  document.getElementById('optOwn')?.addEventListener('click', () => runOptimize('owned'));
  $('fixGaps').onclick = () => {
    const p2 = plan(); if (!p2) return;
    snap(); const r = fixGaps(p2); plans[tab as GridKey] = r.plan; changed();
    toast(`Added ${r.added.I} sprinklers · ${r.added.R} deluxe scarecrows · ${r.added.junimo} huts`);
  };
}

// Owned equipment: from the save when it matches this farm type, else counted off the Current tab.
function budget(): Budget & { tappers: number; beeHouses: number } {
  if (save && farmKeyOf(save) === farmKey) return ownedBudget(save);
  const p = plans.current, n = (c: string) => p ? p.tiles.filter(t => t === c).length : 0;
  return { I: n('I'), Q: n('Q'), S: n('S'), R: n('R'), r: n('r'), huts: p ? p.buildings.filter(b => b.type === 'junimo').length : 0, tappers: n('A'), beeHouses: n('E') };
}

let worker: Worker | null = null;
function runOptimize(mode?: 'optimized' | 'owned') {
  const src = plan() ?? plans.current; if (!src) return;
  const bed = tab === 'island' || tab === 'greenhouse';
  const target: GridKey = bed ? (tab as GridKey) : mode ?? (tab === 'owned' ? 'owned' : 'optimized');
  let base: Plan, opts: OptOptions;
  if (bed) { base = clonePlan(src); opts = { buildings: [], tappers: 0, beeHouses: 0, huts: false, crows: false, fence: false, floorAll: false }; }
  else if (target === 'owned') {
    const b = budget();
    base = ownOpts.keepBuildings ? clonePlan(plans.current!) : optimizeBase(plans.current!, 'Use what I own');
    base.title = 'Use what I own';
    opts = { buildings: ownOpts.keepBuildings ? [] : plans.current!.buildings.filter(x => !x.fixed && x.type !== 'junimo').map(x => x.type), keepBuildings: ownOpts.keepBuildings, tappers: Math.min(12, b.tappers), beeHouses: Math.min(6, b.beeHouses), huts: true, crows: true, fence: ownOpts.fence, floorAll: ownOpts.floorAll, budget: { ...b, huts: ownOpts.keepBuildings ? 0 : b.huts } };
  } else { base = optimizeBase(plans.current!, 'Optimized farm'); opts = { ...optOpts, buildings: DEFAULT_YARD.filter(b => !(FARM_DEFS[farmKey].fixed ?? []).some(f => f[0].toLowerCase() === b)) }; }
  worker?.terminate();
  worker = new OptWorker();
  $('busy').hidden = false; $('busyText').textContent = 'Optimizing… screening 25 sprinkler lattices';
  const t0 = performance.now();
  worker.onmessage = (e: MessageEvent) => {
    if (e.data.progress) { $('busyText').textContent = 'Optimizing… ' + e.data.progress; return; }
    $('busy').hidden = true; worker?.terminate(); worker = null;
    if (e.data.error) { toast('Optimizer failed: ' + e.data.error, 6000); return; }
    const prev = tab; tab = target; snap(); tab = prev;
    plans[target] = e.data.result.plan;
    if (tab !== target) setTab(target); else changed(true);
    const a = analyze(plans[target]!);
    const log = `${a.crops} crops · ${a.sprinklers.I}+${a.sprinklers.Q} sprinklers · ${a.huts} huts · ${a.scarecrows.R} scarecrows · ${a.problems} problems · ${((performance.now() - t0) / 1000).toFixed(1)}s\n${e.data.result.log.join('\n')}`;
    const el = document.getElementById('optLog'); if (el) el.textContent = log;
    toast(`Optimized: ${a.crops.toLocaleString()} crops, ${a.problems} problems`);
  };
  worker.postMessage({ plan: base, opts });
}

// ---------- editing ----------
function canPaint(p: Plan, x: number, y: number, t: string) {
  if (!inb(p, x, y)) return false;
  const i = idx(p, x, y), ter = TERRAIN[p.base[i]];
  if (!ter?.walk || p.base[i] === 'w' || occAt(p, x, y) >= 0) return false;
  if (t === 'C' && !ter.till) return false;
  if ((t === 'I' || t === 'Q' || t === 'S') && p.base[i] === 's') return false; // Beach sand
  return true;
}
function occAt(p: Plan, x: number, y: number, ignore = -1) { return p.buildings.findIndex(b => b.id !== ignore && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h); }
function canBuild(p: Plan, type: string, x: number, y: number, ignore = -1) {
  const d = BUILDINGS[type];
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    if (!inb(p, xx, yy) || !TERRAIN[p.base[idx(p, xx, yy)]]?.build || occAt(p, xx, yy, ignore) >= 0) return false;
  }
  return true;
}
function paintAt(x: number, y: number, t: string) {
  const p = plan(); if (!p || !inb(p, x, y)) return;
  if (t === '') { const bi = occAt(p, x, y); if (bi >= 0) { if (!p.buildings[bi].fixed) p.buildings.splice(bi, 1); else toast(`${BUILDINGS[p.buildings[bi].type].name} is fixed`); return; } p.tiles[idx(p, x, y)] = ''; if (p.notes) delete p.notes[idx(p, x, y)]; return; }
  if (canPaint(p, x, y, t)) { p.tiles[idx(p, x, y)] = t; if (p.notes) delete p.notes[idx(p, x, y)]; }
}
function placeBuilding(type: string, x: number, y: number) {
  const p = plan(); if (!p) return;
  if (!canBuild(p, type, x, y)) { toast('Not buildable here'); return; }
  snap();
  const d = BUILDINGS[type];
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) p.tiles[idx(p, xx, yy)] = '';
  p.buildings.push({ id: Math.max(0, ...p.buildings.map(b => b.id)) + 1, type, x, y, w: d.w, h: d.h });
  changed();
}
function flood(x: number, y: number, t: string) {
  const p = plan(); if (!p) return;
  const i0 = idx(p, x, y), from = p.tiles[i0], fromBase = TERRAIN[p.base[i0]]?.till;
  if (from === t) return;
  const seen = new Uint8Array(p.w * p.h), q = [i0]; seen[i0] = 1; let n = 0;
  while (q.length && n < 6000) {
    const i = q.pop()!, cx = i % p.w, cy = (i / p.w) | 0;
    paintAt(cx, cy, t); n++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy; if (!inb(p, nx, ny)) continue;
      const j = idx(p, nx, ny);
      if (!seen[j] && p.tiles[j] === from && TERRAIN[p.base[j]]?.till === fromBase && occAt(p, nx, ny) < 0 && TERRAIN[p.base[j]]?.walk) { seen[j] = 1; q.push(j); }
    }
  }
}

// ---------- pointer ----------
let panning: { sx: number; sy: number; cx: number; cy: number } | null = null, painting = false, paintTool = '', space = false;
let moving: { b: Plan['buildings'][0]; dx: number; dy: number; ox: number; oy: number } | null = null;
const toTile = (e: PointerEvent | WheelEvent) => {
  const r = cv.getBoundingClientRect(), c = cams[farmKey + tab];
  return { x: Math.floor((c.x + (e.clientX - r.left) / c.z) / TILE), y: Math.floor((c.y + (e.clientY - r.top) / c.z) / TILE) };
};
// Touch: two fingers pinch-zoom + pan (cancelling any stroke the first finger started);
// one finger pans with the Select tool, paints with the others.
const touches = new Map<number, { x: number; y: number }>();
let pinch: { d: number; z: number; wx: number; wy: number } | null = null;
const mid = () => { const [a, b] = [...touches.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  const p = plan(); if (!p) return;
  cv.setPointerCapture(e.pointerId);
  const c = cams[farmKey + tab];
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      if (painting || rectDrag) { painting = false; rectDrag = null; undo(); H().r.pop(); }
      if (moving) { moving.b.x = moving.ox; moving.b.y = moving.oy; moving = null; H().u.pop(); }
      panning = null;
      const m = mid(), r = cv.getBoundingClientRect();
      pinch = { d: m.d || 1, z: c.z, wx: c.x + (m.x - r.left) / c.z, wy: c.y + (m.y - r.top) / c.z };
      return;
    }
    if (touches.size > 2) return;
  }
  if (e.button === 1 || space || (e.button === 0 && e.altKey) || (e.pointerType === 'touch' && tool === 'select' && occAt(p, toTile(e).x, toTile(e).y) < 0)) { panning = { sx: e.clientX, sy: e.clientY, cx: c.x, cy: c.y }; cv.style.cursor = 'grabbing'; return; }
  const { x, y } = toTile(e);
  if (!inb(p, x, y)) return;
  if (tool.startsWith('b:') && e.button === 0) { placeBuilding(tool.slice(2), x, y); return; }
  if (tool === 'select' && e.button === 0) {
    const bi = occAt(p, x, y);
    if (bi >= 0 && !p.buildings[bi].fixed) { snap(); const b = p.buildings[bi]; moving = { b, dx: x - b.x, dy: y - b.y, ox: b.x, oy: b.y }; }
    return;
  }
  paintTool = e.button === 2 || tool === 'erase' ? '' : tool;
  if (tool === 'fill' && e.button === 0) { snap(); flood(x, y, plan()!.tiles[idx(p, x, y)] === 'C' ? '' : 'C'); changed(); return; }
  snap();
  if (rectMode || e.shiftKey) { rectDrag = { x0: x, y0: y, x1: x, y1: y }; render(); return; }
  painting = true; paintAt(x, y, paintTool); changed();
});
cv.addEventListener('pointermove', e => {
  const p = plan(); if (!p) return;
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size === 2) {
    const m = mid(), r = cv.getBoundingClientRect(), c = cams[farmKey + tab];
    c.z = Math.max(0.25, Math.min(8, pinch.z * (m.d / pinch.d)));
    c.x = pinch.wx - (m.x - r.left) / c.z; c.y = pinch.wy - (m.y - r.top) / c.z;
    render(); return;
  }
  if (panning) { const c = cams[farmKey + tab]; c.x = panning.cx - (e.clientX - panning.sx) / c.z; c.y = panning.cy - (e.clientY - panning.sy) / c.z; render(); return; }
  const { x, y } = toTile(e);
  hover = inb(p, x, y) ? { x, y } : null;
  if (moving) { moving.b.x = x - moving.dx; moving.b.y = y - moving.dy; render(); }
  else if (rectDrag) { rectDrag.x1 = x; rectDrag.y1 = y; render(); }
  else if (painting && hover) { paintAt(x, y, paintTool); A = analyze(p); dirty = true; renderStats(); render(); }
  else render();
  inspect(x, y);
});
const endTouch = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
cv.addEventListener('pointercancel', e => { endTouch(e); painting = false; panning = null; });
cv.addEventListener('pointerup', e => {
  const p = plan();
  if (e.pointerType === 'touch') { const was = !!pinch || touches.size > 1; endTouch(e); if (was) return; }
  if (panning) { panning = null; cv.style.cursor = ''; return; }
  if (moving && p) {
    if (!canBuild(p, moving.b.type, moving.b.x, moving.b.y, moving.b.id)) { moving.b.x = moving.ox; moving.b.y = moving.oy; H().u.pop(); toast('Not buildable here'); }
    else for (let yy = moving.b.y; yy < moving.b.y + moving.b.h; yy++) for (let xx = moving.b.x; xx < moving.b.x + moving.b.w; xx++) p.tiles[idx(p, xx, yy)] = '';
    moving = null; changed(); return;
  }
  if (rectDrag) {
    const r = rectDrag; rectDrag = null;
    for (let y = Math.min(r.y0, r.y1); y <= Math.max(r.y0, r.y1); y++) for (let x = Math.min(r.x0, r.x1); x <= Math.max(r.x0, r.x1); x++) paintAt(x, y, paintTool);
    changed(); return;
  }
  if (painting) { painting = false; changed(); }
});
cv.addEventListener('pointerleave', () => { hover = null; render(); });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
  else { const c = cams[farmKey + tab]; c.x += e.deltaX / c.z; render(); }
}, { passive: false });

function inspect(x: number, y: number) {
  const p = plan(), a = A; if (!p || !a) return;
  if (!inb(p, x, y)) { $('inspect').innerHTML = '<span class="muted">Outside the map</span>'; return; }
  const i = idx(p, x, y), t = p.tiles[i], bi = a.occupied[i];
  const yn = (v: boolean | number, yes = tr('yes'), no = tr('no')) => `<span class="${v ? 'yes' : 'no'}">${v ? yes : no}</span>`;
  const rows: [string, string][] = [['Tile', `${x}, ${y}`], ['Terrain', TERRAIN[p.base[i]]?.name ?? '?']];
  if (bi >= 0) { const b = p.buildings[bi]; rows.push(['Building', `${b.label ?? BUILDINGS[b.type].name} (${b.w}×${b.h} @ ${b.x},${b.y})${b.fixed ? ' · fixed' : ''}`]); }
  if (t) rows.push(['On tile', t === 'C' && p.notes?.[i] ? `Crop · ${p.notes[i]}` : p.notes?.[i] ?? ITEMS[t]?.name ?? t]);
  rows.push(['Watered', yn(a.water[i])]);
  if (p.rules.junimo) rows.push(['Junimo range', a.huts ? yn(a.junimo[i], 'in range', 'outside') : '<span class="muted">no huts</span>']);
  if (p.rules.crows) rows.push(['Scarecrow', yn(a.crow[i], 'protected', 'exposed')]);
  $('inspect').innerHTML = rows.map(([k, v]) => `<div class="row"><span class="k">${tr(k)}</span><span>${v}</span></div>`).join('');
}

// ---------- keyboard ----------
const KEYMAP: Record<string, string> = Object.fromEntries(ALL_TOOLS.filter(t => !t.id.startsWith('b:')).map(t => [t.key.toLowerCase(), t.id]));
addEventListener('keydown', e => {
  if ((e.target as HTMLElement).closest?.('input,select,textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { space = true; cv.style.cursor = 'grab'; e.preventDefault(); return; }
  if (/^Digit[1-9]$/.test(e.code)) { const n = +e.code.slice(5) - 1 + (e.shiftKey ? 9 : 0); if (BLIB[n]) pick('b:' + BLIB[n]); return; }
  if (k === '+' || k === '=') return zoomAt(1.25);
  if (k === '-') return zoomAt(0.8);
  if (k === '0') return fitCam();
  if (k === '[') return $('toolsToggle').click();
  if (k === ']') return $('panelToggle').click();
  if (k === 'escape') { tool = 'select'; rectDrag = null; renderTools(); render(); return; }
  if (k === 'w') return toggleOv('water');
  if (k === 'j') return toggleOv('junimo');
  if (k === 'y') return toggleOv('crow');
  if (k === 'n') return toggleOv('problems');
  if (k === 'z') return toggleOv('labels');
  if (k === 'd' && e.shiftKey) return toggleOv('diff');
  // keyboard cursor on the map: arrows move, Enter paints / places, Shift+Enter erases
  if (document.activeElement === cv && plan()) {
    const p = plan()!, h = hover ?? { x: p.w >> 1, y: p.h >> 1 };
    const mv: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (mv[k]) {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      hover = { x: Math.max(0, Math.min(p.w - 1, h.x + mv[k][0] * step)), y: Math.max(0, Math.min(p.h - 1, h.y + mv[k][1] * step)) };
      inspect(hover.x, hover.y); render(); return;
    }
    if (k === 'enter') {
      e.preventDefault(); hover = h;
      if (tool.startsWith('b:') && !e.shiftKey) placeBuilding(tool.slice(2), h.x, h.y);
      else { snap(); paintAt(h.x, h.y, e.shiftKey || tool === 'erase' ? '' : tool === 'select' || tool === 'fill' ? 'C' : tool); changed(); }
      inspect(h.x, h.y); return;
    }
  }
  if (KEYMAP[k] && !e.shiftKey) pick(KEYMAP[k]);
  else if (k === 'g' && e.shiftKey) toggleOv('grid');
});
addEventListener('keyup', e => { if (e.code === 'Space') { space = false; cv.style.cursor = ''; } });

// ---------- view toggle (2D / 3D) ----------
$('viewSeg').addEventListener('click', async e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]'); if (!b) return;
  view = b.dataset.v as '2d' | '3d';
  $('viewSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  $('three').hidden = view !== '3d'; cv.style.display = view === '3d' ? 'none' : '';
  $('hint').textContent = view === '3d' ? 'Drag to orbit · right-drag to pan · wheel to zoom · edit in 2D' : tr('Space+drag or middle-drag to pan · wheel to zoom · Shift+drag = rectangle');
  if (view === '3d') await show3d(true); else { v3?.stop(); render(); }
});
async function show3d(reset: boolean) {
  const p = plan(); if (!p) return;
  if (!v3) { const { View3D: V } = await import('./render3d.ts'); v3 = new V($('three')); }
  // ground texture = 2D world + whichever overlays are on
  const w = buildWorld(p, true), g = w.getContext('2d')!;
  if (A) {
    const diff = ov.diff && (tab === 'optimized' || tab === 'owned') && plans.current ? diffTiles(plans.current, p) : null;
    const L = overlayLayers(p, A, diff);
    g.imageSmoothingEnabled = false;
    for (const k of ['junimo', 'crow', 'water', 'diff', 'problems'] as OvKey[]) if (ov[k] && L[k]) g.drawImage(L[k]!, 0, 0, w.width, w.height);
  }
  v3.show(p, w, !reset); v3.start();
}
$('zoomIn').onclick = () => zoomAt(1.25); $('zoomOut').onclick = () => zoomAt(0.8); $('zoomFit').onclick = () => fitCam();
$('undo').onclick = undo; $('redo').onclick = redo;

// ---------- files ----------
$('moreBtn').onclick = e => { e.stopPropagation(); $('morePop').classList.toggle('open'); };
addEventListener('click', () => $('morePop').classList.remove('open'));
const download = (name: string, href: string) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
$('exportJson').onclick = () => {
  const data = { app: 'stardew-farm-planner', version: 7, farmKey, plans: Object.fromEntries(Object.entries(plans).map(([k, p]) => [k, p ? pack(p) : null])) };
  download(`farm-plan-${farmKey}.json`, URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })));
};
$('importJson').onclick = () => $('jsonFile').click();
$<HTMLInputElement>('jsonFile').onchange = async ev => {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d?.app !== 'stardew-farm-planner' || !d.plans || !FARM_DEFS[d.farmKey]) throw new Error('not a planner file');
    for (const [k, p] of Object.entries(d.plans) as [GridKey, ReturnType<typeof pack> | null][]) {
      if (!p) continue;
      if (typeof p.tiles !== 'string' || typeof p.base !== 'string' || p.tiles.length !== p.w * p.h || p.base.length !== p.w * p.h || !Array.isArray(p.buildings)) throw new Error('corrupt plan ' + k);
    }
    loadFarm(d.farmKey); ($('farmType') as HTMLSelectElement).value = d.farmKey;
    for (const [k, p] of Object.entries(d.plans) as [GridKey, ReturnType<typeof pack> | null][]) if (p) plans[k] = unpack(p);
    changed(true); toast('Plan imported');
  } catch (err) { toast('Import failed: ' + (err as Error).message, 5000); }
  (ev.target as HTMLInputElement).value = '';
};
$('exportPng').onclick = () => {
  if (view === '3d' && v3) return download(`farm-${tab}-3d.png`, v3.snapshot());
  frame(); cv.toBlob(b => b && download(`farm-${tab}.png`, URL.createObjectURL(b)));
};
$('resetTab').onclick = () => {
  if (!GRID.includes(tab) || !confirm('Reset this tab to its default?')) return;
  snap();
  const embedded = PLANS as Record<string, unknown>;
  plans[tab as GridKey] = tab === 'current' ? (save && farmKeyOf(save) === farmKey ? currentPlan(save) : defaultPlan(farmKey)) : tab === 'optimized' || tab === 'owned' ? null : unpack(embedded[tab] as Plan);
  if (tab === 'optimized' || tab === 'owned') runOptimize(tab); else changed(true);
};
$('loadSave').onclick = () => $('saveFile').click();
$<HTMLInputElement>('saveFile').onchange = async ev => {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
  (ev.target as HTMLInputElement).value = '';
  try {
    if (f.size > 200 * 1024 * 1024) throw new Error('file too large');
    const { xml } = await readSaveFile(f);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('not valid XML');
    const s = parseSave(doc);
    if (!confirm(`Load ${s.player}'s farm (${FARM_DEFS[farmKeyOf(s)].label}, ${cap(s.season)} ${s.day} Y${s.year}, ${s.money.toLocaleString()}g)?\nThis replaces the Current and Optimized tabs for that farm type. The save file itself is never modified.`)) return;
    save = s; store('save', s);
    const key = farmKeyOf(s);
    localStorage.removeItem(STORE + ':' + PLAN_KEY + key);
    loadFarm(key); ($('farmType') as HTMLSelectElement).value = key;
    renderSaveInfo(); setTab('current'); runOptimize();
    toast('Save loaded — optimizing…');
  } catch (err) { toast('Could not read save: ' + (err as Error).message, 6000); }
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function renderSaveInfo() {
  $('saveInfo').textContent = save ? `${save.player} · ${cap(save.season)} ${save.day}, Y${save.year} · ${save.money.toLocaleString()}g` : 'No save loaded';
}

// ---------- farm type ----------
const sel = $<HTMLSelectElement>('farmType');
const renderFarmSelect = () => { sel.innerHTML = FARM_KEYS.map(k => `<option value="${k}">${FARM_DEFS[k].label}${k === 'custom' ? '' : ' farm'}${FARM_DEFS[k].approx ? ' (approx.)' : ''}</option>`).join(''); sel.value = farmKey; };
renderFarmSelect();
sel.onchange = () => { loadFarm(sel.value); setTab(tab === 'island' || tab === 'greenhouse' ? tab : GRID.includes(tab) ? tab : 'current'); };

// ---------- misc ----------
// Collapsible side panels (desktop: collapse the column; narrow screens: drawers / bottom sheet).
const layout = { tools: true, panel: true, ...load<{ tools: boolean; panel: boolean }>('layout') };
const narrow = () => matchMedia('(max-width: 1040px)').matches;
function applyLayout() {
  $('shell').classList.toggle('no-tools', !layout.tools);
  $('shell').classList.toggle('no-panel', !layout.panel || narrow());
  $('panel').classList.toggle('open', narrow() && layout.panel && panelOpen);
  $('toolsToggle').classList.toggle('on', layout.tools); $('panelToggle').classList.toggle('on', narrow() ? panelOpen : layout.panel);
  setTimeout(fitCam, 220); // after the column transition, refit the map to the new canvas size
}
let panelOpen = false;
$('toolsToggle').onclick = () => { layout.tools = !layout.tools; store('layout', layout); applyLayout(); };
$('panelToggle').onclick = () => { if (narrow()) { panelOpen = !panelOpen; layout.panel = true; } else layout.panel = !layout.panel; store('layout', layout); applyLayout(); };
$('panelClose').onclick = () => { panelOpen = false; applyLayout(); };
matchMedia('(max-width: 1040px)').addEventListener('change', applyLayout);
let toastT = 0;
function toast(msg: string, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('show'), ms); }

// ---------- share links ----------
async function shareLink() {
  const p = plan() ?? plans.optimized ?? plans.current; if (!p) return;
  const key = GRID.includes(tab) ? tab : p === plans.optimized ? 'optimized' : 'current';
  const code = await encodeShare({ app: 'stardew-farm-planner', v: 1, farmKey, tab: key, plan: pack(p), custom: farmKey === 'custom' ? FARM_DEFS.custom : undefined });
  const url = `${location.href.split('#')[0]}#s=${code}`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title: 'My Stardew farm plan', url }); return; } catch { /* cancelled: fall back to copying */ } }
  try { await navigator.clipboard.writeText(url); toast(`Link copied (${(url.length / 1024).toFixed(1)} KB)`); }
  catch { prompt('Copy this link:', url); }
}
$('shareBtn').onclick = shareLink; $('shareLink').onclick = shareLink;
async function openSharedFromHash() {
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/); if (!m) return;
  history.replaceState(null, '', location.href.split('#')[0]);
  try {
    const d = await decodeShare(m[1]) as { app?: string; farmKey?: string; tab?: string; plan?: ReturnType<typeof pack>; custom?: typeof FARM_DEFS[string] };
    const pl = d.plan;
    if (d.app !== 'stardew-farm-planner' || !pl || !GRID.includes(d.tab as TabKey)) throw new Error('not a planner link');
    if (d.farmKey === 'custom' && d.custom && d.custom.rows?.length === d.custom.h) { FARM_DEFS.custom = d.custom; if (!FARM_KEYS.includes('custom')) FARM_KEYS.push('custom'); renderFarmSelect(); }
    if (!FARM_DEFS[d.farmKey!] || typeof pl.tiles !== 'string' || typeof pl.base !== 'string' || pl.tiles.length !== pl.w * pl.h || pl.base.length !== pl.w * pl.h || !Array.isArray(pl.buildings)) throw new Error('corrupt plan');
    if (!confirm(`Open the shared ${FARM_DEFS[d.farmKey!].label} plan in the “${tr(TABS.find(x => x[0] === d.tab)![1])}” tab? (Undo brings back yours.)`)) return;
    loadFarm(d.farmKey!); sel.value = d.farmKey!;
    tab = d.tab as TabKey; snap();
    plans[d.tab as GridKey] = unpack(pl);
    setTab(d.tab as TabKey); toast('Shared plan opened');
  } catch (err) { toast('Could not open link: ' + (err as Error).message, 5000); }
}
addEventListener('hashchange', openSharedFromHash);

// ---------- real game graphics ----------
const artDlg = $<HTMLDialogElement>('artDlg');
const artStatus = () => { $('artStatus').textContent = artReady() ? `${artCount()} texture sheets loaded from your game files.` : 'No game graphics loaded — using the built-in pixel art.'; };
$('artOpen').onclick = () => { artStatus(); artDlg.showModal(); };
$('artClose').onclick = () => artDlg.close();
$('artPick').onclick = () => $('artDir').click();
$<HTMLInputElement>('artToggle').checked = load<boolean>('artOn') ?? true; setArtOn($<HTMLInputElement>('artToggle').checked);
$<HTMLInputElement>('artToggle').onchange = e => { const v = (e.target as HTMLInputElement).checked; setArtOn(v); store('artOn', v); dirty = true; render(); };
$<HTMLInputElement>('artDir').onchange = async ev => {
  const files = (ev.target as HTMLInputElement).files; if (!files?.length) return;
  $('artStatus').textContent = `Reading ${files.length} files…`;
  const r = await loadFromFiles(files);
  (ev.target as HTMLInputElement).value = '';
  $('artStatus').textContent = r.loaded.length ? `Loaded ${r.loaded.length} sheets: ${r.loaded.join(', ')}.${r.errors.length ? ' Problems: ' + r.errors.slice(0, 3).join(' · ') : ''}` : `Nothing usable found. ${r.errors[0] ?? 'Pick the Content folder (or “Content (unpacked)”).'}`;
  dirty = true; render(); if (view === '3d') show3d(false);
};
$('artClear').onclick = async () => { await clearArt(); artStatus(); dirty = true; render(); };

// ---------- custom map (.tmx) ----------
$('tmxOpen').onclick = () => $('tmxFile').click();
$<HTMLInputElement>('tmxFile').onchange = async ev => {
  const files = Array.from((ev.target as HTMLInputElement).files ?? []); (ev.target as HTMLInputElement).value = '';
  if (!files.length) return;
  try {
    const def = await parseTmx(files);
    FARM_DEFS.custom = def; if (!FARM_KEYS.includes('custom')) FARM_KEYS.push('custom');
    store('customMap', def); localStorage.removeItem(STORE + ':' + PLAN_KEY + 'custom');
    loadFarm('custom'); renderFarmSelect(); setTab('current');
    toast(`Imported ${def.label} (${def.w}×${def.h}). Stamp your buildings, then optimize.`, 5000);
  } catch (err) { toast('Map import failed: ' + (err as Error).message, 6000); }
};

// ---------- about, language ----------
const aboutDlg = $<HTMLDialogElement>('aboutDlg');
$('aboutOpen').onclick = () => aboutDlg.showModal(); $('aboutClose').onclick = () => aboutDlg.close();
const langSel = $<HTMLSelectElement>('langSel');
langSel.innerHTML = Object.entries(LANGS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
function applyI18n() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = (el.textContent?.startsWith(' ') ? ' ' : '') + tr(el.dataset.i18n!); });
  const l = document.querySelector('#loadSave .t'); if (l) l.textContent = ' ' + tr('Load save');
  document.querySelectorAll('#panel .card h3').forEach((h, i) => { h.textContent = tr(['Inspector', 'Overlays', 'Optimizer', 'Legend'][i]); });
  $('hint').textContent = tr('Space+drag or middle-drag to pan · wheel to zoom · Shift+drag = rectangle');
  $('panelClose').textContent = tr('Close') + ' ✕';
}
langSel.onchange = () => { setLang(langSel.value); store('lang', langSel.value); applyI18n(); renderTools(); renderTabs(); renderLegend(); renderOverlays(); renderOpt(); renderStats(); if (!GRID.includes(tab)) renderDoc(); };

// ---------- offline install (PWA, website build only) ----------
if (location.protocol.startsWith('http') && 'serviceWorker' in navigator && !location.hostname.match(/^(localhost|127\.)/)) {
  const link = document.createElement('link'); link.rel = 'manifest'; link.href = '/manifest.webmanifest'; document.head.appendChild(link);
  navigator.serviceWorker.register('/sw.js').catch(() => { /* offline install is optional */ });
}

// ---------- boot ----------
loadFarm(farmKey);
langSel.value = (load<string>('lang') ?? detectLang()) in LANGS ? (load<string>('lang') ?? detectLang()) : 'en';
applyI18n();
renderTools(); renderTabs(); renderLegend(); renderSaveInfo(); applyLayout();
requestAnimationFrame(() => { setTab(GRID.includes(tab) || TABS.some(x => x[0] === tab) ? tab : 'optimized'); openSharedFromHash(); });
restoreCache().then(() => { if (artReady()) { dirty = true; render(); } });
