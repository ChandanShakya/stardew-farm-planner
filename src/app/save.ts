// Stardew Valley 1.6 save parser. Works on any W3C-style DOM (browser DOMParser or
// @xmldom/xmldom in Node), so the same code builds the embedded default and parses uploads.
// Read-only: it never writes the save.

export type Building = { type: string; x: number; y: number; w: number; h: number };
export type Placed = { name: string; id: string; x: number; y: number };
export type Feature = { kind: string; x: number; y: number; sub?: string };
export type ItemCount = { total: number; cat: number; where: Record<string, number> };

export type SaveData = {
  player: string; farmName: string; money: number; totalEarned: number;
  season: string; day: number; year: number; farmType: number; houseLevel: number;
  gameVersion: string; walnuts: number; qiGems: number;
  recipes: string[];
  professions: number[];   // 1 Tiller, 4 Artisan, 5 Agriculturist, ...
  buildings: Building[];
  objects: Placed[];          // placed objects on the Farm
  features: Feature[];        // hoe dirt / flooring / trees / grass on the Farm
  inventory: Record<string, ItemCount>;  // everything stored: chests, fridge, backpack, building chests
  placedAll: Record<string, number>;      // placed objects in every location
  placedBy: Record<string, Record<string, number>>; // location -> name -> count
  rarecrows: string[];        // distinct rarecrow item ids owned (placed or stored)
  chests: { loc: string; x: number; y: number; name: string; slots: number }[];
  // Cellar = the farmhouse cellar; Cellar2..8 belong to farmhand cabins in co-op. `owner`:
  // 'you' (assigned to this player), 'farmhand' (assigned to someone else) or 'unassigned'.
  cellars: { name: string; owner: 'you' | 'farmhand' | 'unassigned'; casks: [number, number, boolean][] }[];
};

// Item ids of the 8 Rarecrows (big craftables) — owning all 8 unlocks the Deluxe Scarecrow recipe.
export const RARECROW_IDS = ['110', '113', '126', '136', '137', '138', '139', '140'];

const XSI = 'xsi:type';
type El = Element;
const kids = (e: El | null | undefined, tag?: string): El[] => {
  const out: El[] = [];
  if (!e) return out;
  for (let n = e.firstChild; n; n = n.nextSibling)
    if (n.nodeType === 1 && (!tag || (n as El).tagName === tag)) out.push(n as El);
  return out;
};
const kid = (e: El | null | undefined, tag: string) => kids(e, tag)[0] ?? null;
const path = (e: El | null | undefined, p: string) => p.split('/').reduce<El | null>((a, t) => kid(a, t), e ?? null);
const txt = (e: El | null | undefined, p: string) => path(e, p)?.textContent ?? '';
const num = (e: El | null | undefined, p: string) => Number(txt(e, p)) || 0;

const HARVEST: Record<string, string> = {
  '24': 'Parsnip', '188': 'Green Bean', '190': 'Cauliflower', '192': 'Potato', '248': 'Garlic', '250': 'Kale',
  '252': 'Rhubarb', '254': 'Melon', '256': 'Tomato', '258': 'Blueberry', '260': 'Hot Pepper', '262': 'Wheat',
  '264': 'Radish', '266': 'Red Cabbage', '268': 'Starfruit', '270': 'Corn', '272': 'Eggplant', '274': 'Artichoke',
  '276': 'Pumpkin', '278': 'Bok Choy', '280': 'Yam', '282': 'Cranberries', '284': 'Beet', '300': 'Amaranth',
  '304': 'Hops', '376': 'Poppy', '398': 'Grape', '400': 'Strawberry', '421': 'Sunflower', '433': 'Coffee Bean',
  '454': 'Ancient Fruit', '591': 'Tulip', '593': 'Summer Spangle', '595': 'Fairy Rose', '597': 'Blue Jazz',
  '830': 'Taro Root', '832': 'Pineapple', '90': 'Cactus Fruit', '417': 'Sweet Gem Berry', '271': 'Unmilled Rice',
};
export const cropName = (id?: string) => (id ? HARVEST[id] ?? id : 'Seedling');

export function parseSave(doc: Document): SaveData {
  const root = doc.documentElement;
  if (root.tagName !== 'SaveGame') throw new Error('Not a Stardew Valley save file (root is <' + root.tagName + '>)');
  const player = kid(root, 'player');
  const locs = kids(kid(root, 'locations'), 'GameLocation');
  const farm = locs.find(l => txt(l, 'name') === 'Farm');
  if (!farm) throw new Error('Save has no Farm location');

  const buildings: Building[] = kids(kid(farm, 'buildings'), 'Building').map(b => ({
    type: txt(b, 'buildingType'), x: num(b, 'tileX'), y: num(b, 'tileY'), w: num(b, 'tilesWide'), h: num(b, 'tilesHigh'),
  }));

  const objOf = (loc: El) => kids(kid(loc, 'objects'), 'item').map(it => ({ k: path(it, 'key/Vector2'), v: path(it, 'value/Object') }));
  const objects: Placed[] = objOf(farm).filter(o => o.v).map(({ k, v }) => ({
    name: txt(v, 'name'), id: txt(v, 'itemId'), x: num(k, 'X'), y: num(k, 'Y'),
  }));

  const features: Feature[] = [];
  for (const it of kids(kid(farm, 'terrainFeatures'), 'item')) {
    const k = path(it, 'key/Vector2'), v = path(it, 'value/TerrainFeature');
    if (!v) continue;
    const t = v.getAttribute(XSI) ?? '', x = num(k, 'X'), y = num(k, 'Y');
    if (t === 'HoeDirt') {
      const c = kid(v, 'crop');
      features.push(c ? { kind: 'crop', x, y, sub: cropName(txt(c, 'indexOfHarvest') || undefined) } : { kind: 'hoe', x, y });
    } else if (t === 'Flooring') features.push({ kind: 'floor', x, y, sub: txt(v, 'whichFloor') });
    else if (t === 'Tree') features.push({ kind: 'tree', x, y, sub: txt(v, 'treeType') });
    else if (t === 'FruitTree') features.push({ kind: 'fruittree', x, y, sub: txt(v, 'treeId') });
    else if (t === 'Grass') features.push({ kind: 'grass', x, y });
  }
  for (const it of kids(kid(farm, 'resourceClumps'), 'ResourceClump'))
    features.push({ kind: 'clump', x: num(it, 'Tile/X'), y: num(it, 'Tile/Y') });

  // Every location to walk: top-level locations plus building interiors (sheds, barns, cabins...).
  // Only the player's own spaces count as storage; chests in the mines/town are loot, not inventory.
  const OWN = /^(Farm|FarmHouse|FarmCave|Greenhouse|Cellar\d*|IslandWest|IslandFarmHouse|Cabin.*)$/;
  const all: { name: string; el: El; own: boolean }[] = [];
  for (const l of locs) {
    all.push({ name: txt(l, 'name'), el: l, own: OWN.test(txt(l, 'name')) });
    for (const b of kids(kid(l, 'buildings'), 'Building')) {
      const ind = kid(b, 'indoors');
      if (ind) all.push({ name: txt(ind, 'name') || txt(b, 'buildingType'), el: ind, own: true });
    }
  }

  const inventory: Record<string, ItemCount> = {};
  const rare = new Set<string>();
  const add = (it: El, where: string) => {
    const name = txt(it, 'name'); if (!name) return;
    const n = Math.max(1, num(it, 'stack'));
    const c = (inventory[name] ??= { total: 0, cat: num(it, 'category'), where: {} });
    c.total += n; c.where[where] = (c.where[where] ?? 0) + n;
    if (name === 'Rarecrow') rare.add(txt(it, 'itemId'));
  };
  const addItems = (items: El | null, where: string) => { for (const it of kids(items, 'Item')) add(it, where); };
  addItems(kid(player, 'items'), 'Backpack');
  for (const fh of kids(kid(root, 'farmhands'))) addItems(kid(fh, 'items'), 'Farmhand');

  const placedAll: Record<string, number> = {};
  const placedBy: SaveData['placedBy'] = {};
  const chests: SaveData['chests'] = [];
  const myId = txt(player, 'UniqueMultiplayerID');
  const assigned = new Map(kids(kid(root, 'cellarAssignments'), 'item').map(it => [Number(txt(it, 'key/int')), txt(it, 'value/long')]));
  const cellars: SaveData['cellars'] = [];
  for (const { name, el, own } of all) {
    if (!own) continue;
    const fr = kid(el, 'fridge');
    if (fr && kids(kid(fr, 'items'), 'Item').length) addItems(kid(fr, 'items'), name + ' fridge');
    for (const { k, v } of objOf(el)) {
      if (!v) continue;
      const on = txt(v, 'name');
      placedAll[on] = (placedAll[on] ?? 0) + 1;
      const pb = (placedBy[name] ??= {}); pb[on] = (pb[on] ?? 0) + 1;
      if (on === 'Rarecrow') rare.add(txt(v, 'itemId'));
      const items = kid(v, 'items');
      if (v.getAttribute(XSI) === 'Chest' && items) {
        chests.push({ loc: name, x: num(k, 'X'), y: num(k, 'Y'), name: on, slots: kids(items, 'Item').length });
        addItems(items, `${name} ${on} (${num(k, 'X')},${num(k, 'Y')})`);
      }
      const held = kid(v, 'heldObject');             // auto-grabber / machine storage chests
      if (held && held.getAttribute(XSI) === 'Chest') addItems(kid(held, 'items'), name + ' ' + on);
    }
    const cm = name.match(/^Cellar(\d*)$/);
    if (cm) {
      const n = Number(cm[1] || 1), who = assigned.get(n);
      cellars.push({ name, owner: who === undefined ? 'unassigned' : who === myId ? 'you' : 'farmhand',
        casks: objOf(el).filter(o => o.v && txt(o.v, 'name') === 'Cask').map(o => [num(o.k, 'X'), num(o.k, 'Y'), !!kid(o.v, 'heldObject')] as [number, number, boolean]) });
    }
    for (const b of kids(kid(el, 'buildings'), 'Building'))
      for (const c of kids(kid(b, 'buildingChests'), 'Chest')) addItems(kid(c, 'items'), txt(b, 'buildingType') + ' ' + txt(c, 'Name'));
  }

  return {
    player: txt(player, 'name'), farmName: txt(player, 'farmName'), money: num(player, 'money'),
    totalEarned: num(player, 'totalMoneyEarned'), season: txt(root, 'currentSeason'), day: num(root, 'dayOfMonth'),
    year: num(root, 'year'), farmType: num(root, 'whichFarm'), houseLevel: num(player, 'houseUpgradeLevel'),
    gameVersion: txt(root, 'gameVersion'), walnuts: num(root, 'goldenWalnutsFound'), qiGems: num(player, 'qiGems'),
    recipes: kids(kid(player, 'craftingRecipes'), 'item').map(i => txt(i, 'key/string')),
    professions: kids(kid(player, 'professions'), 'int').map(e => Number(e.textContent)),
    buildings, objects, features, inventory, placedAll, placedBy, rarecrows: [...rare].sort(), chests, cellars,
  };
}

// --- Upload helpers (browser): accepts the raw save XML, a .tar.gz/.tgz/.tar of the save folder, or a .gz.
export async function readSaveFile(file: File): Promise<{ name: string; xml: string }> {
  let bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
  if (isTar(bytes)) {
    const entries = untar(bytes);
    // Main save = file named like its folder; skip SaveGameInfo and *_old backups.
    const main = entries.find(e => { const p = e.name.split('/').filter(Boolean); return p.length >= 2 && p.at(-1) === p.at(-2); })
      ?? entries.find(e => !/SaveGameInfo|_old$/.test(e.name) && e.data.length > 100000);
    if (!main) throw new Error('No main save file found in archive');
    return { name: main.name, xml: new TextDecoder().decode(main.data) };
  }
  return { name: file.name, xml: new TextDecoder().decode(bytes) };
}
async function gunzip(b: Uint8Array) {
  const s = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const isTar = (b: Uint8Array) => b.length > 512 && new TextDecoder().decode(b.slice(257, 262)) === 'ustar';
function untar(b: Uint8Array) {
  const out: { name: string; data: Uint8Array }[] = [];
  const dec = new TextDecoder();
  for (let o = 0; o + 512 <= b.length;) {
    const name = dec.decode(b.slice(o, o + 100)).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(dec.decode(b.slice(o + 124, o + 136)).replace(/\0.*$/s, '').trim() || '0', 8);
    const type = String.fromCharCode(b[o + 156]);
    const prefix = dec.decode(b.slice(o + 345, o + 500)).replace(/\0.*$/s, '');
    if (type === '0' || type === '\0') out.push({ name: (prefix ? prefix + '/' : '') + name, data: b.slice(o + 512, o + 512 + size) });
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}
