// Turn a 2D sprite into a solid 3D object (the "extruded pixel sprite" technique):
// front + back faces carry the sprite texture, and every pixel on the silhouette edge gets a side
// face that samples that pixel's colour. Result: real depth from every angle, a few hundred
// triangles per sprite, one texture.
import * as THREE from 'three';

export function extrudeSprite(pixels: ImageData, w: number, h: number, depth: number, cross = false): THREE.BufferGeometry {
  const { width: pw, height: ph, data } = pixels;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < pw && y < ph && data[(y * pw + x) * 4 + 3] > 127;
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  const sx = w / pw, sy = h / ph, z0 = -depth / 2, z1 = depth / 2;
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], uvs: number[][]) => {
    const base = pos.length / 3;
    for (const [i, p] of [a, b, c, d].entries()) { pos.push(...p); nrm.push(...n); uv.push(...uvs[i]); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // front / back: whole sprite, alpha-tested
  quad([-w / 2, 0, z1], [w / 2, 0, z1], [w / 2, h, z1], [-w / 2, h, z1], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  quad([w / 2, 0, z0], [-w / 2, 0, z0], [-w / 2, h, z0], [w / 2, h, z0], [0, 0, -1], [[1, 0], [0, 0], [0, 1], [1, 1]]);
  // side walls along the silhouette, each painted with its pixel (sampled at the pixel centre)
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    if (!solid(x, y)) continue;
    const u = (x + 0.5) / pw, v = 1 - (y + 0.5) / ph, c = [[u, v], [u, v], [u, v], [u, v]];
    const X0 = -w / 2 + x * sx, X1 = X0 + sx, Y1 = h - y * sy, Y0 = Y1 - sy;
    if (!solid(x - 1, y)) quad([X0, Y0, z0], [X0, Y0, z1], [X0, Y1, z1], [X0, Y1, z0], [-1, 0, 0], c);
    if (!solid(x + 1, y)) quad([X1, Y0, z1], [X1, Y0, z0], [X1, Y1, z0], [X1, Y1, z1], [1, 0, 0], c);
    if (!solid(x, y - 1)) quad([X0, Y1, z1], [X1, Y1, z1], [X1, Y1, z0], [X0, Y1, z0], [0, 1, 0], c);
    if (!solid(x, y + 1)) quad([X0, Y0, z0], [X1, Y0, z0], [X1, Y0, z1], [X0, Y0, z1], [0, -1, 0], c);
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  if (cross) { // plants and trees: a second slab at 90° so they read as round from every side
    const b = geo.clone(); b.rotateY(Math.PI / 2);
    geo = merge(geo, b);
  }
  return geo;
}

function merge(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const out = new THREE.BufferGeometry(), n = a.getAttribute('position').count;
  for (const name of ['position', 'normal', 'uv']) {
    const A = a.getAttribute(name) as THREE.BufferAttribute, B = b.getAttribute(name) as THREE.BufferAttribute;
    const arr = new Float32Array(A.array.length + B.array.length); arr.set(A.array as Float32Array); arr.set(B.array as Float32Array, A.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, A.itemSize));
  }
  const ia = Array.from(a.getIndex()!.array), ib = Array.from(b.getIndex()!.array).map(i => i + n);
  out.setIndex([...ia, ...ib]);
  return out;
}
