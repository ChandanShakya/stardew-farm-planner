// 3D view (three.js): textured ground from the 2D world layer, instanced meshes for every
// tile item, extruded buildings with roofs and floating labels. Orbit / pan / zoom.
// Animated: buildings rise and crops grow in on a fresh view, crops sway, sprinklers spray their
// real coverage square, Junimos hop around their huts. All animation is a pure function of
// time (setTime) so the brag video can render it frame by frame.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUILDINGS, type Plan } from './engine.ts';

export class View3D {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; controls: OrbitControls;
  root = new THREE.Group(); raf = 0; el: HTMLElement; ro: ResizeObserver;
  anims: ((t: number) => void)[] = []; t0 = 0; introAt = 0;
  constructor(el: HTMLElement) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.47;
    this.scene.background = new THREE.Color('#0f1412');
    this.scene.fog = new THREE.Fog('#0f1412', 160, 320);
    this.scene.add(new THREE.HemisphereLight('#e6f2ff', '#3b3423', 1.1));
    const sun = new THREE.DirectionalLight('#fff3dc', 1.6);
    sun.position.set(-60, 90, -40); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 300 });
    this.scene.add(sun, sun.target, this.root);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el);
  }
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  setTime(t: number) { for (const a of this.anims) a(t); }
  start() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = () => { this.controls.update(); this.setTime(reduce ? 1e4 : (performance.now() - this.t0) / 1000); this.renderer.render(this.scene, this.camera); this.raf = requestAnimationFrame(loop); };
    cancelAnimationFrame(this.raf); this.resize(); loop();
  }
  stop() { cancelAnimationFrame(this.raf); }
  snapshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }

  show(p: Plan, world: HTMLCanvasElement, keepCamera: boolean) {
    this.root.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }); });
    this.root.clear();
    this.anims = []; this.t0 = performance.now();
    this.introAt = keepCamera ? -100 : 0; // edits refresh the scene without replaying the intro
    const W = p.w, H = p.h, cx = W / 2, cz = H / 2;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const easeBack = (v: number) => { v = clamp(v); return 1 + 2.7 * Math.pow(v - 1, 3) + 1.7 * Math.pow(v - 1, 2); };
    const delayOf = (x: number, z: number) => 0.15 + Math.hypot(x - cx, z - cz) * 0.018;
    const tx = new THREE.CanvasTexture(world); tx.magFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tx, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.root.add(ground);
    const at = (x: number, y: number) => [x + 0.5 - cx, y + 0.5 - cz] as const;

    // collect instances per kind
    const kinds: Record<string, [number, number][]> = {};
    for (let i = 0; i < W * H; i++) {
      const c = p.base[i] === 'X' ? '#X' : p.base[i] === '~' ? '#~' : p.tiles[i];
      if (c) (kinds[c] ??= []).push([i % W, (i / W) | 0]);
    }
    const inst = (geo: THREE.BufferGeometry, color: string, list: [number, number][] | undefined, y: number, opts: { scale?: number; rough?: number; emissive?: string; jitter?: boolean } = {}) => {
      if (!list?.length) return;
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.8, emissive: opts.emissive ?? '#000' }), list.length);
      const o = new THREE.Object3D();
      list.forEach(([x, z], k) => {
        const [px, pz] = at(x, z);
        o.position.set(px, y, pz); o.rotation.y = opts.jitter ? ((x * 31 + z * 17) % 7) * 0.4 : 0;
        o.scale.setScalar(opts.scale ?? 1); if (opts.jitter) o.scale.multiplyScalar(0.85 + ((x * 13 + z * 7) % 5) * 0.06);
        o.updateMatrix(); m.setMatrixAt(k, o.matrix);
      });
      m.castShadow = true; m.receiveShadow = true; this.root.add(m);
      return m;
    };
    inst(new THREE.BoxGeometry(1, 1.6, 1), '#21402a', kinds['#X'], 0.8);
    inst(new THREE.ConeGeometry(0.45, 1.2, 6), '#2e5a36', kinds['#X'], 2.1, { jitter: true });
    inst(new THREE.BoxGeometry(1, 0.05, 1), '#3f7fae', kinds['#~'], 0.03, { rough: 0.2 });
    const crops = inst(new THREE.SphereGeometry(0.28, 6, 5), '#4f9d3a', kinds.C, 0.25, { jitter: true });
    if (crops && kinds.C) {
      // grow in from the centre outward, then sway in a slow wave
      const list = kinds.C, o = new THREE.Object3D();
      const base = list.map(([x, z]) => ({ x: x + 0.5 - cx, z: z + 0.5 - cz, ry: ((x * 31 + z * 17) % 7) * 0.4, s: 0.85 + ((x * 13 + z * 7) % 5) * 0.06, d: delayOf(x, z) + 0.25 }));
      this.anims.push(t => {
        const ti = t - this.introAt;
        base.forEach((b, k) => {
          const g = ti > 6 ? 1 : easeBack((ti - b.d) / 0.5);
          o.position.set(b.x, 0.25 * g, b.z); o.rotation.set(Math.sin(t * 1.7 + b.x * 0.35 + b.z * 0.25) * 0.14, b.ry, Math.cos(t * 1.3 + b.x * 0.2) * 0.1);
          o.scale.set(b.s * Math.max(0.001, g), b.s * Math.max(0.001, g) * (1 + 0.06 * Math.sin(t * 2.1 + b.z)), b.s * Math.max(0.001, g));
          o.updateMatrix(); crops.setMatrixAt(k, o.matrix);
        });
        crops.instanceMatrix.needsUpdate = true;
      });
    }
    // sprinkler spray: a square ring expanding to the real coverage (iridium 5x5, quality 3x3)
    for (const [k, half, col] of [['I', 2.5, '#a5b4fc'], ['Q', 1.5, '#7dd3fc']] as const) {
      const list = kinds[k]; if (!list?.length) continue;
      for (const off of [0, 0.5]) {
        const geo = new THREE.RingGeometry(half * Math.SQRT2 - 0.2, half * Math.SQRT2, 4, 1); geo.rotateZ(Math.PI / 4); geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false });
        const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
        this.root.add(m);
        const d = list.map(([x, z]) => delayOf(x, z) + 0.6);
        this.anims.push(t => {
          const ph = (t * 0.7 + off) % 1, ti = t - this.introAt;
          mat.opacity = (1 - ph) * 0.8 * clamp((ti - 1.0) / 0.5);
          list.forEach(([x, z], j) => { o.position.set(x + 0.5 - cx, 0.62 + ph * 0.3, z + 0.5 - cz); o.scale.setScalar(ti > d[j] ? 0.15 + 0.85 * ph : 0.001); o.updateMatrix(); m.setMatrixAt(j, o.matrix); });
          m.instanceMatrix.needsUpdate = true;
        });
      }
    }
    inst(new THREE.CylinderGeometry(0.16, 0.22, 0.45, 8), '#8b5cf6', kinds.I, 0.22, { emissive: '#2e1065', rough: 0.3 });
    inst(new THREE.CylinderGeometry(0.14, 0.2, 0.38, 8), '#f5c542', kinds.Q, 0.19, { rough: 0.3 });
    inst(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 8), '#9ca3af', kinds.S, 0.15);
    for (const [k, col, h] of [['R', '#e2b53c', 1.5], ['r', '#d8b25c', 1.2]] as const) {
      inst(new THREE.CylinderGeometry(0.05, 0.05, h, 5), '#6b4a2b', kinds[k], h / 2);
      inst(new THREE.BoxGeometry(0.8, 0.1, 0.1), '#6b4a2b', kinds[k], h * 0.7);
      inst(new THREE.SphereGeometry(0.2, 8, 6), col, kinds[k], h + 0.1);
    }
    inst(new THREE.BoxGeometry(0.15, 0.8, 0.15), '#8b5a2b', [...(kinds.F ?? []), ...(kinds.G ?? [])], 0.4);
    inst(new THREE.BoxGeometry(1, 0.1, 0.08), '#a87545', [...(kinds.F ?? []), ...(kinds.G ?? [])], 0.55);
    const trees = [...(kinds.T ?? []), ...(kinds.A ?? []), ...(kinds.U ?? [])];
    inst(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), '#6d4c2f', trees, 0.5);
    inst(new THREE.ConeGeometry(0.75, 2.2, 7), '#2f7d32', [...(kinds.T ?? []), ...(kinds.A ?? [])], 2, { jitter: true });
    inst(new THREE.SphereGeometry(0.8, 8, 6), '#4caf50', kinds.U, 1.6, { jitter: true });
    inst(new THREE.BoxGeometry(0.2, 0.25, 0.2), '#c2410c', kinds.A, 0.75);
    inst(new THREE.BoxGeometry(0.6, 0.7, 0.6), '#d9b26f', kinds.E, 0.35);
    inst(new THREE.CylinderGeometry(0.3, 0.3, 0.75, 10), '#8b5a2b', kinds.M, 0.38);
    inst(new THREE.BoxGeometry(0.75, 0.55, 0.6), '#a0632f', kinds.H, 0.28);
    inst(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5), '#cbd5e1', kinds.L, 0.9, { rough: 0.3 });
    inst(new THREE.BoxGeometry(0.5, 0.5, 0.5), '#a8a29e', kinds.O, 0.25);
    inst(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 8), '#7a5a40', kinds.Z, 0.2);

    // buildings
    let hutN = 0;
    for (const b of p.buildings) {
      const d = BUILDINGS[b.type]; if (!d) continue;
      const g = new THREE.Group();
      g.position.set(b.x + b.w / 2 - cx, 0, b.y + b.h / 2 - cz);
      const h = d.height;
      const mat = (c: string, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
      if (b.type === 'pond') {
        const rim = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.3, b.h), mat('#8d8478')); rim.position.y = 0.15;
        const wat = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.8, 0.05, b.h - 0.8), mat('#2f6f9f', 0.15)); wat.position.y = 0.31;
        g.add(rim, wat);
      } else if (b.type.endsWith('ob') || b.type === 'clock') {
        const base = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.4, b.h), mat('#9e9688')); base.position.y = 0.2;
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.8, h, 4), new THREE.MeshStandardMaterial({ color: d.color, emissive: d.roof, emissiveIntensity: 0.35, roughness: 0.3 }));
        spire.position.y = 0.4 + h / 2; g.add(base, spire);
      } else if (b.type === 'silo') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(b.w / 2 - 0.2, b.w / 2 - 0.2, h, 16), mat(d.color)); body.position.y = h / 2;
        const top = new THREE.Mesh(new THREE.SphereGeometry(b.w / 2 - 0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(d.roof)); top.position.y = h;
        g.add(body, top);
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.1, h, b.h - 0.1), mat(d.color)); body.position.y = h / 2;
        const roofH = Math.min(b.w, b.h) * 0.45 + 0.4;
        const roofGeo = new THREE.CylinderGeometry(0, 1, roofH, 4, 1); roofGeo.rotateY(Math.PI / 4);
        const roof = new THREE.Mesh(roofGeo, mat(d.roof, 0.6));
        roof.scale.set((b.w + 0.4) / Math.SQRT2, 1, (b.h + 0.4) / Math.SQRT2); roof.position.y = h + roofH / 2;
        g.add(body, roof);
        if (d.door) { const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.05), mat('#3b2414')); door.position.set(d.door[0] + 0.5 - b.w / 2, 0.6, b.h / 2 + 0.01); g.add(door); }
      }
      g.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
      const bd = delayOf(b.x + b.w / 2, b.y + b.h / 2) * 0.6;
      this.anims.push(t => { const v = easeBack((t - this.introAt - bd) / 0.55); g.scale.set(1, Math.max(0.001, v), 1); g.visible = v > 0.001; });
      if (b.type === 'junimo') {
        // two Junimos hop in circles around each hut
        const hx = b.x + b.w / 2 - cx, hz = b.y + b.h / 2 - cz, seed = b.x * 7 + b.y;
        const cols = ['#86efac', '#fca5a5', '#93c5fd', '#fde68a', '#d8b4fe'];
        for (let j = 0; j < 2; j++) {
          const jm = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshStandardMaterial({ color: cols[(seed + j) % cols.length], roughness: 0.4, emissive: cols[(seed + j) % cols.length], emissiveIntensity: 0.25 }));
          jm.castShadow = true; this.root.add(jm);
          this.anims.push(t => {
            const a = t * 0.9 + j * Math.PI + seed, r = 2.4 + Math.sin(t * 0.5 + j) * 0.6, ti = t - this.introAt;
            jm.visible = ti > bd + 0.6;
            jm.position.set(hx + Math.cos(a) * r, 0.32 + Math.abs(Math.sin(t * 6 + j * 1.3)) * 0.35, hz + Math.sin(a) * r);
            jm.scale.set(1, 0.85 + Math.abs(Math.cos(t * 6 + j * 1.3)) * 0.25, 1);
          });
        }
      }
      const name = b.type === 'junimo' ? 'H' + ++hutN : d.name;
      const label = labelSprite(name); label.position.y = h + (b.type === 'pond' ? 1.2 : 2.2); g.add(label);
      this.root.add(g);
    }
    this.setTime(0);
    if (!keepCamera) {
      this.camera.position.set(0, Math.max(W, H) * 0.75, H * 0.85);
      this.controls.target.set(0, 0, 0); this.controls.update();
    }
  }
}

function labelSprite(text: string) {
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  g.font = '600 40px Inter, system-ui, sans-serif';
  const w = g.measureText(text).width + 32; c.width = w; c.height = 64;
  g.font = '600 40px Inter, system-ui, sans-serif';
  g.fillStyle = 'rgba(10,14,12,.82)'; g.beginPath(); g.roundRect(0, 4, w, 56, 14); g.fill();
  g.fillStyle = '#f1f5f2'; g.textBaseline = 'middle'; g.fillText(text, 16, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(w / 64 * 0.9, 0.9, 1); s.renderOrder = 10;
  return s;
}
