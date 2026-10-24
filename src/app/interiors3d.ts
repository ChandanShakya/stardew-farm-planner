// 3D view of the Big Shed machine hall and your cellar, side by side. Loaded on demand.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SaveData } from './save.ts';
import { COLORS, DOOR_X, machineCounts, MACHINES, myCellar, SH, shedLayout, SW } from './interiors.ts';

export function mountInteriors3D(el: HTMLElement, s: SaveData) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#1d2b16');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.46; controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches; controls.autoRotateSpeed = 0.5;
  scene.add(new THREE.HemisphereLight('#fff3dc', '#3b2a18', 1.2));
  const lamp = new THREE.DirectionalLight('#ffe2b0', 1.4); lamp.position.set(-10, 30, 15); lamp.castShadow = true; scene.add(lamp);
  const mat = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };

  // ---- Big Shed (left) ----
  const ox = -SW - 3, oz = -SH / 2;
  add(new THREE.Mesh(new THREE.BoxGeometry(SW, 0.2, SH), mat('#735640')), ox + SW / 2, -0.1, oz + SH / 2);
  for (let y = 2; y < SH; y += 3) add(new THREE.Mesh(new THREE.BoxGeometry(SW, 0.02, 1), mat('#8a6a4c')), ox + SW / 2, 0.01, oz + y + 0.5);
  add(new THREE.Mesh(new THREE.BoxGeometry(SW + 1, 2.4, 0.5), mat('#5c3218')), ox + SW / 2, 1.2, oz - 0.25); // back wall
  add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, SH), mat('#5c3218')), ox - 0.25, 1.2, oz + SH / 2);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, SH), mat('#5c3218')), ox + SW + 0.25, 1.2, oz + SH / 2);
  add(new THREE.Mesh(new THREE.BoxGeometry(DOOR_X, 1.2, 0.5), mat('#5c3218')), ox + DOOR_X / 2, 0.6, oz + SH + 0.25); // front wall, door gap
  add(new THREE.Mesh(new THREE.BoxGeometry(SW - DOOR_X - 1, 1.2, 0.5), mat('#5c3218')), ox + DOOR_X + 1 + (SW - DOOR_X - 1) / 2, 0.6, oz + SH + 0.25);
  const L = shedLayout(machineCounts(s));
  const geoOf = (name: string) => name === 'Keg' ? new THREE.CylinderGeometry(0.33, 0.36, 0.85, 10)
    : name === 'Preserves Jar' ? new THREE.CylinderGeometry(0.28, 0.3, 0.7, 10)
    : name === 'Furnace' || name === 'Heavy Furnace' ? new THREE.BoxGeometry(0.7, 0.8, 0.6) : new THREE.BoxGeometry(0.66, 0.75, 0.6);
  for (const name of new Set(L.placed.map(m => m.name))) {
    const list = L.placed.filter(m => m.name === name);
    const color = COLORS[MACHINES.indexOf(name)];
    const m = new THREE.InstancedMesh(geoOf(name), mat(color, name === 'Preserves Jar' ? { transparent: true, opacity: 0.85, roughness: 0.2 } : name.includes('Furnace') ? { emissive: '#7c2d12', emissiveIntensity: 0.6 } : {}), list.length);
    const o = new THREE.Object3D();
    list.forEach((p, i) => { o.position.set(ox + p.x + 0.5, 0.42, oz + p.y + 0.5); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = true; scene.add(m);
  }

  // ---- your cellar (right) ----
  const mine = myCellar(s);
  const cx = 3, cz = -8;
  add(new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 16), mat('#4a4038')), cx + 10, -0.1, cz + 8);
  add(new THREE.Mesh(new THREE.BoxGeometry(20, 3, 0.5), mat('#2a170b')), cx + 10, 1.5, cz + 0.25);
  add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1.2), mat('#5c3218')), cx + 3, 0.5, cz + 1.6); // stairs
  if (mine) {
    const caskGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.9, 12); caskGeo.rotateZ(Math.PI / 2);
    for (const aging of [true, false]) {
      const list = mine.casks.filter(c => c[2] === aging); if (!list.length) continue;
      const m = new THREE.InstancedMesh(caskGeo, mat('#8b5a2b', aging ? { emissive: '#7e22ce', emissiveIntensity: 0.35 } : {}), list.length);
      const o = new THREE.Object3D();
      list.forEach(([x, y], i) => { o.position.set(cx + x + 0.5, 0.42, cz + y + 0.5); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.castShadow = true; scene.add(m);
    }
  }
  const label = (text: string, x: number, z: number) => {
    const c = document.createElement('canvas'), g = c.getContext('2d')!; g.font = "700 44px 'Pixelify Sans', monospace";
    const w = g.measureText(text).width + 40; c.width = w; c.height = 72;
    g.fillStyle = '#3e2210'; g.fillRect(0, 0, w, 72); g.fillStyle = '#f4d495'; g.fillRect(5, 5, w - 10, 62);
    g.font = "700 44px 'Pixelify Sans', monospace"; g.fillStyle = '#3a2310'; g.textBaseline = 'middle'; g.fillText(text, 20, 38);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); sp.scale.set(w / 36, 2, 1); sp.position.set(x, 4.2, z); scene.add(sp);
  };
  label(`Big Shed · ${L.placed.length} machines`, ox + SW / 2, oz + 1);
  if (mine) label(`Cellar · ${mine.casks.filter(c => c[2]).length}/${mine.casks.length} aging`, cx + 10, cz + 1);

  camera.position.set(0, 19, 23); controls.target.set(0, 0, 0); controls.update();
  const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(el); resize();
  let raf = 0; const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); }; loop();
  return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.innerHTML = ''; };
}
