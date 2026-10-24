"""Build src/data/farms.json from the Apache-2.0 tile layers of hpeinar/stardewplanner
(accessible / buildable / tillable) plus the map screenshots (used only to tell water
from cliff, and Beach sand from the dirt patch). Run once; output is committed.

Tile codes: d tillable+buildable, D tillable only, s beach sand (tillable, no sprinklers),
g buildable not tillable (grass), p walkable only, w warp/exit, ~ water, X cliff/forest,
o fixed feature (non-editable)."""
import json, sys
from collections import deque
from PIL import Image
L = sys.argv[1]
FARMS = {  # key: (layer name, image, label)
    'standard': ('regular', 'full_background', 'Standard'),
    'riverland': ('fishing', 'farm_fishing', 'Riverland'),
    'forest': ('foraging', 'farm_foraging', 'Forest'),
    'hilltop': ('mining', 'farm_mining', 'Hill-top'),
    'wilderness': ('combat', 'farm_combat', 'Wilderness'),
    'fourcorners': ('fourcorners', 'farm_fourcorners', 'Four Corners'),
    'beach': ('beach', 'farm_beach', 'Beach'),
    'island': ('ginger_island', 'ginger_island', 'Ginger Island'),
}
def load(n, k):
    d = json.load(open(f'{L}/{n}_{k}.json'))
    return {kk.split('.')[1]: {tuple(map(int, t.split(','))) for t in v['Tiles']} for kk, v in d.items()}
def build(n, img):
    a, b, t = load(n, 'accessible'), load(n, 'buildable'), load(n, 'tillable')
    im = Image.open(f'{L}/{img}.jpg').convert('RGB'); W, H = im.size[0] // 16, im.size[1] // 16
    def col(x, y):
        px = [im.getpixel((x*16+i, y*16+j)) for i in range(2, 14, 3) for j in range(2, 14, 3)]
        return [sum(q[c] for q in px) / len(px) for c in range(3)]
    g = []
    for y in range(H):
        r = []
        for x in range(W):
            p = (x, y); R, G, B = col(x, y); blue = B > R + 30 and B >= G - 5
            if p in a.get('impassable', ()): c = '~' if blue else 'X'
            elif p in a.get('warp', ()): c = 'w'
            elif p in t.get('tillable', ()):
                c = ('d' if p in b.get('buildable', ()) else 'D')
                if n == 'beach' and not (B < 110 and R > 170): c = 's'
            elif p in b.get('buildable', ()): c = 'g'
            elif p in a.get('clear', ()): c = '~' if blue else 'p'
            else: c = 'X'
            r.append(c)
        g.append(r)
    # water must be a component of >=4 tiles; isolated blue specks are cliff shadows
    seen = set()
    for y in range(H):
        for x in range(W):
            if g[y][x] != '~' or (x, y) in seen: continue
            comp, q = [], deque([(x, y)]); seen.add((x, y))
            while q:
                cx, cy = q.popleft(); comp.append((cx, cy))
                for nx, ny in ((cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)):
                    if 0 <= nx < W and 0 <= ny < H and g[ny][nx] == '~' and (nx, ny) not in seen:
                        seen.add((nx, ny)); q.append((nx, ny))
            if len(comp) < 4:
                for cx, cy in comp: g[cy][cx] = 'X'
    # The source masks mark some pond/river interiors (rocks, lily pads) and cut-off specks as
    # walkable. Only the main walkable region (the one you can actually walk to) is usable;
    # every other pocket becomes water (if it touches water) or cliff.
    walk = lambda c: c not in '~X'
    comps, seen = [], set()
    for y in range(H):
        for x in range(W):
            if not walk(g[y][x]) or (x, y) in seen: continue
            comp, q = [], deque([(x, y)]); seen.add((x, y))
            while q:
                cx, cy = q.popleft(); comp.append((cx, cy))
                for nx, ny in ((cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)):
                    if 0 <= nx < W and 0 <= ny < H and walk(g[ny][nx]) and (nx, ny) not in seen:
                        seen.add((nx, ny)); q.append((nx, ny))
            comps.append(comp)
    comps.sort(key=len, reverse=True)
    for comp in comps[1:]:
        for x, y in comp:
            wet = any(0 <= x + dx < W and 0 <= y + dy < H and g[y + dy][x + dx] == '~' for dx in (-1, 0, 1) for dy in (-1, 0, 1))
            g[y][x] = '~' if wet else 'X'
    return W, H, g
out = {}
for k, (n, img, label) in FARMS.items():
    W, H, g = build(n, img)
    out[k] = {'label': label, 'w': W, 'h': H, 'rows': [''.join(r) for r in g]}
# Standard: the greenhouse can be relocated (1.5+); its original 7x6 ruin footprint becomes open dirt.
st = out['standard']['rows']
for y in range(10, 16):
    st[y] = st[y][:25] + 'd' * 7 + st[y][32:]
out['standard']['rows'] = st
# Meadowlands (1.6): no open tile data exists. Approximation = Standard outline, with the
# starting coop footprint fixed; flagged in the UI as approximate.
md = [list(r) for r in out['standard']['rows']]
for y in range(17, 20):
    for x in range(51, 57): md[y][x] = 'o'
out['meadowlands'] = {'label': 'Meadowlands', 'w': 80, 'h': 65, 'approx': True,
                      'rows': [''.join(r) for r in md], 'fixed': [['Coop', 51, 17, 6, 3]]}
json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'))
for k, v in out.items():
    from collections import Counter
    print(k, v['w'], v['h'], dict(Counter(''.join(v['rows']))))
