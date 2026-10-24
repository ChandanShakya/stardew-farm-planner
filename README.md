# Stardew Farm Planner

A farm planner for **Stardew Valley 1.6**. It reads your save file, shows your real farm, and computes an optimized layout. Every crop in that layout is watered, inside Junimo range and protected from crows. The planner then lists what you still need to build it.

Live: **https://stardew.chandanshakya.com.np**

It is built with Astro and deployed as a static site. The same build also produces one self-contained HTML file that works offline.

## Getting started

The planner opens empty: a blank farm and a welcome dialog. Nothing about anyone's farm ships with the site.

1. **Find your save.** Each farm has a folder named like `Farm_123456789` in:
   - Windows: `%AppData%\StardewValley\Saves`. Press Win+R, paste it, then press Enter.
   - Mac, Linux and Steam Deck: `~/.config/StardewValley/Saves`
   - Android: `Android/data/com.chucklefish.stardewvalley/files/Saves`. Copy it to your computer first.
2. **Pick the file with the same name as its folder.** It has no extension. `SaveGameInfo` is only a summary, and `_old` files are backups. You can also pick the whole folder, or a `.tar.gz` / `.gz` of it.
3. **Click Load save.** Your farm opens on the Current tab, and the optimizer lays out your own plan.

No save? Pick a farm type in the welcome dialog to see its best layout. A 42-second tutorial and a 50-second showcase play from the ▶ button. The files are in `public/media/`.

## Features

- **All 8 farm types:** Standard, Riverland, Forest, Hill-top, Wilderness, Four Corners, Beach and Meadowlands (approximate). Ginger Island and the Greenhouse interior are included too.
- **Custom and modded maps:** import a Tiled `.tmx` map, plus its `.tsx` tilesets. Tillable, water and blocked tiles are read from the map's own tile properties.
- **Save import:** accepts the raw save file, the whole save folder (or the Saves folder; the most recently played farm wins), the folder as `.tar.gz`, or a `.gz`. It is parsed in your browser and is never uploaded or modified. Picking `SaveGameInfo` by mistake gets a clear message. **Forget loaded save** in the ⋯ menu clears it and every stored plan.
- **Blank farms:** each of the 8 farm types ships with its precomputed best layout, so you can explore without a save.
- **Two optimizer modes**, both run in a Web Worker:
  - **Optimized ★** builds the best possible farm.
    - It packs every building into a compact yard.
    - It tries all 25 positions of the iridium sprinkler grid, and each separate field patch keeps its own best position.
    - Junimo huts are placed by set cover, may stand on non-crop ground, and are cut further with 2-for-1 swap searches.
    - Deluxe scarecrows cover the field. Leftover ground gets flooring and a fence ring so weeds can't spawn.
  - **Use what I own** re-lays your current farm using only the sprinklers, scarecrows and huts you already own, with buildings kept in place. Nothing to buy or craft.
- **Move plan:** an ordered in-game checklist for going from Current to a plan.
  - What to pick up, which buildings Robin moves and where, what to build, and what to place.
  - Exact coordinates for every sprinkler, scarecrow and hut.
  - A **Diff** overlay on the map: green = place, red = remove, amber = replace.
- **Crops & profit:** the best crop per season for each area, ranked by processed gold per tile.
  - Uses your professions from the save (Tiller, Artisan, Agriculturist).
  - Shows how many kegs or jars you need to keep up, and compares Ancient Fruit with Starfruit for the greenhouse and island.
- **Interiors:** the Big Shed machine hall is laid out automatically from the machines you own, with cellar cask counts.
- **Real game graphics (optional):** point the app at the `Content` folder of **your own** copy of the game.
  - It reads the game's own compressed `.xnb` files directly (LZX, decoded in the browser) or the `Content (unpacked)` PNGs from StardewXnbHack.
  - Sprites are decoded in your browser and cached only there (IndexedDB). No game art ships with the site.
  - They're used in 2D and in 3D. In 3D each sprite is extruded into a solid object: the sprite on the front and back, coloured side walls along its outline. Crops and trees use two crossed slabs so they look full from every side, and buildings are extruded back across their footprint. Anything without a loaded sprite keeps its built-in 3D shape.
- **Share links:** the whole plan is compressed into the URL (about 2 KB).
- **Editor:** grouped tools with icons and shortcuts, a building library with real footprints, rectangle, fill, eraser and move tools, undo/redo, and a keyboard map cursor (arrow keys, Enter, Shift+Enter).
- **Live checks:** water, Junimo and crow overlays, a problem-tile highlight, a stats bar and a problems badge.
- **2D canvas and 3D view** (three.js). The 3D view loads only when you open it.
- **Build list:** what the plan needs, what you own, what is missing, gold and materials (v1.6 costs), plus an endgame section.
- **House & chests:** a colour-coded Big Chest storage system sized from your real inventory.
- **Works everywhere:**
  - Phones: tools become a bottom bar, the panel becomes a bottom sheet, and you pinch to zoom.
  - Desktop: collapsible panels (`[` and `]`).
  - Installs as an offline app (PWA) on the website build.
- **Languages:** English, Español and Português (BR) for the app interface. The long guide pages are in English.
- **Privacy:** no accounts, analytics or trackers. Everything stays in your browser.

## Develop

Requires Node 22.18 or later (Node 24 recommended).

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # dist/ (static site, lazy 3D chunk) + dist/farm-planner.html (single offline file)
npm run defaults   # recompute the shipped blank-farm layouts (src/data/defaults.json, about 80 s)
npm run check      # optimize the test save and print the coverage proof
npm test           # game-rule + optimizer tests (node:test)
```

### Data

- `src/data/defaults.json` is **shipped**. It holds the optimized layout for every blank farm type plus the island and greenhouse beds. It contains no player data. Regenerate it with `npm run defaults` after changing the optimizer or the maps.
- `src/data/save.json` and `src/data/plans.json` are a **test fixture only**: one real save and its plans, used by `npm test`, `npm run check` and the videos. The app never imports them. Replace the fixture with:

```bash
npm run data -- path/to/SaveFolder.tar.gz   # or the raw save file; read-only
npm run check
```

## Deploy (Cloudflare Pages)

| Setting | Value |
| --- | --- |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION = 24` (also pinned in `.nvmrc`) |

To deploy from the CLI instead: `npx wrangler pages deploy dist --project-name stardew-farm-planner`.

## Project layout

```
src/pages/index.astro   page shell + styles
src/app/main.ts         UI: tabs, tools, editing, history, panels, touch, files
src/app/engine.ts       plan model, terrain + building catalog, v1.6 coverage rules, checker
src/app/optimize.ts     yard packer, sprinkler lattice, hut/scarecrow cover, budget mode, fix-gaps
src/app/save.ts         save parser (browser DOMParser or Node xmldom) + tar/gzip reader
src/app/fromSave.ts     save → Current plan (calibrates the terrain mask)
src/app/render2d.ts     canvas renderer        src/app/render3d.ts   three.js view
src/app/sprites.ts      original pixel-art sprites drawn in code
src/app/buildlist.ts    have-vs-need build list, owned-equipment budget
src/app/docs.ts         Build list + House & chests views
src/app/moves.ts        Current → plan diff + move checklist
src/app/crops.ts        crop data (v1.6) + profit model
src/app/interiors.ts    Big Shed machine layout, cellars
src/app/gameart.ts      loads the player's own game textures (XNB / PNG), IndexedDB cache
src/app/tmx.ts          Tiled .tmx farm map import
src/app/share.ts        compressed share links
src/app/i18n.ts         UI translations
public/                 PWA manifest, service worker, icons
tests/                  node:test rule + optimizer tests
src/data/               farms.json (tile masks), defaults.json (shipped plans), save.json + plans.json (test fixture)
scripts/                extract-save.ts, check.ts, defaults.ts, gen-farms.py, inline.mjs
public/media/           tutorial + showcase videos and posters (played from the ▶ button)
```

## Game rules implemented (v1.6)

| Item | Rule |
| --- | --- |
| Iridium Sprinkler | 5×5 area minus itself (24 tiles) |
| Quality Sprinkler | 3×3 area minus itself (8 tiles) |
| Sprinkler | 4 orthogonal tiles |
| Scarecrow / Rarecrow | protects tiles at distance < 9 |
| Deluxe Scarecrow | protects tiles at distance < 17 |
| Junimo Hut | 3×2 building; harvests the 17×17 square centred on (x+1, y+1) |
| Beach farm | sprinklers do not work on sand |
| Lightning Rod | a storm strike charges a random empty rod, giving 1 Battery Pack; where the rod stands doesn't matter |
| Bee House | flower honey needs a flower within 5 tiles (planned with Manhattan distance ≤ 5) |
| Wild trees | can't grow to full size next to another tree, so tapper trees stand every other tile |
| Fruit trees | the 8 surrounding tiles must stay clear |
| Walking routes | the optimizer keeps a walkable path from the farmhouse porch to every map exit: no fence, building, rod row or bee house on it, and no object at narrow spots |

Building footprints match the game (Slime Hutch 11×6, obelisks and Gold Clock 3×2, Fish Pond 5×5, and so on).

## Data and credits

- **Tile masks:** from [hpeinar/stardewplanner](https://github.com/hpeinar/stardewplanner) (Apache-2.0). `scripts/gen-farms.py` converts them; it uses the map screenshots only to tell water from cliff. A loaded save marks every tile where it has a building, object or crop as usable, so the save corrects the mask. Meadowlands has no published mask, so its map is approximate.
- **Sprites:** original pixel art drawn in code. No game assets are bundled.
- **Font:** [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) (SIL Open Font License 1.1), bundled through `@fontsource/pixelify-sans` so the app works offline.
- **Trademark:** Stardew Valley is a trademark of ConcernedApe. This is an unofficial fan tool.
