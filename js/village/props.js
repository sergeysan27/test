import * as THREE from 'three';
import { PALETTE } from './config.js';
import { plasterTexture, roofTexture, woodTexture, leafTexture, windowTexture, glowSprite, starTexture } from './textures.js';
import { buildSmoke } from './smoke.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeStaticGroup } from './merge.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const planeGeo = new THREE.PlaneGeometry(1, 1);

// Shared materials keep the shader program count low: the whole village
// reuses a handful of programs instead of compiling one per colour.
const sharedMat = new Map();

function mat(color, opts = {}) {
  const key = `${color}_${opts.roughness ?? 0.85}_${opts.metalness ?? 0}_${opts.side ?? 0}_${opts.transparent ?? 0}_${opts.opacity ?? 1}_${opts.emissive ?? 0}_${opts.emissiveIntensity ?? 1}_${opts.map?.uuid ?? 'x'}`;
  if (!sharedMat.has(key)) {
    sharedMat.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0,
      map: opts.map ?? null,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    }));
  }
  return sharedMat.get(key);
}

function addBox(parent, matl, w, h, d, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(boxGeo, matl);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------------- House ----------------
export function buildHouse(spec, cache) {
  const group = new THREE.Group();
  const { w, d, h, roofH } = spec;

  const wallMat = cache.getWall(spec.wall);
  const roofMat = cache.getRoof(spec.roof);
  const trimMat = cache.getWood(spec.trim);
  const doorMat = mat(spec.doorColor, { roughness: 0.7 });

  addBox(group, wallMat, w, h, d, 0, h / 2, 0);
  // stone base
  addBox(group, cache.getStone(), w + 0.18, 0.45, d + 0.18, 0, 0.22, 0);

  // gable roof (prism)
  const roofGeo = new THREE.BufferGeometry();
  const hw = w / 2 + 0.45;
  const hd = d / 2 + 0.45;
  const v = [
    -hw, 0, -hd, hw, 0, -hd, 0, roofH, -hd,
    -hw, 0, hd, hw, 0, hd, 0, roofH, hd,
  ];
  const idx = [
    0, 1, 2, 3, 5, 4, // front/back
    0, 3, 4, 0, 4, 1, // left slope
    1, 4, 5, 1, 5, 2, // right slope
    2, 5, 3, 2, 3, 0, // bottom
  ];
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  roofGeo.setIndex(idx);
  roofGeo.computeVertexNormals();
  // UVs for roof texture
  const uv = [];
  const pos = roofGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.push(pos.getX(i) * 0.35, pos.getZ(i) * 0.35 + pos.getY(i) * 0.35);
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = h;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // gable end triangles (fill)
  const gableMat = wallMat;
  for (const s of [-1, 1]) {
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -hw, 0, 0, hw, 0, 0, 0, roofH, 0,
    ], 3));
    gGeo.setIndex(s > 0 ? [0, 1, 2] : [2, 1, 0]);
    gGeo.computeVertexNormals();
    const g = new THREE.Mesh(gGeo, gableMat);
    g.position.set(0, h, s * hd);
    g.castShadow = true;
    group.add(g);
  }

  // door
  const dw = 0.95, dh = 1.9;
  const door = addBox(group, doorMat, dw, dh, 0.12, 0, dh / 2, d / 2 + 0.03);
  door.castShadow = false;
  // door frame
  addBox(group, trimMat, dw + 0.18, 0.12, 0.16, 0, dh + 0.02, d / 2 + 0.02);
  addBox(group, trimMat, 0.1, dh, 0.16, -dw / 2 - 0.04, dh / 2, d / 2 + 0.02);
  addBox(group, trimMat, 0.1, dh, 0.16, dw / 2 + 0.04, dh / 2, d / 2 + 0.02);
  // handle
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xc9a44a, { metalness: 0.7, roughness: 0.3 }));
  knob.position.set(dw * 0.3, dh * 0.5, d / 2 + 0.12);
  group.add(knob);

  // porch
  if (spec.porch) {
    addBox(group, cache.getWood(spec.trim), dw + 0.9, 0.16, 1.1, 0, 0.08, d / 2 + 0.6);
    for (const s of [-1, 1]) {
      addBox(group, trimMat, 0.12, 2.3, 0.12, s * (dw / 2 + 0.35), 1.15, d / 2 + 1.05);
    }
    const awning = addBox(group, cache.getRoof(spec.roof), dw + 1.0, 0.1, 1.25, 0, 2.4, d / 2 + 0.55);
    awning.rotation.x = -0.16;
  }

  // windows
  const winMat = cache.getWindow().clone();
  const winFrames = [];
  const positions = [];
  const winCount = spec.windows;
  for (let i = 0; i < winCount; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const alongX = i < 2;
    const t = (Math.floor(i / 2) + 1) / (Math.ceil(winCount / 2) + 1);
    if (alongX) {
      positions.push({ x: (t - 0.5) * w * 0.9, y: h * 0.55, z: side * (d / 2 + 0.02), rot: 0, side });
    } else {
      positions.push({ x: side * (w / 2 + 0.02), y: h * 0.55, z: (t - 0.5) * d * 0.85, rot: Math.PI / 2, side });
    }
  }
  for (const p of positions) {
    const frame = addBox(group, trimMat, 1.0, 1.15, 0.1, p.x, p.y, p.z, p.rot);
    const pane = new THREE.Mesh(planeGeo, winMat);
    pane.scale.set(0.82, 0.95, 1);
    pane.position.set(p.x, p.y, p.z);
    pane.rotation.y = p.rot;
    pane.userData.dynamic = true;
    const off = 0.07;
    pane.position.x += Math.sin(p.rot) * off;
    pane.position.z += Math.cos(p.rot) * off;
    group.add(pane);
    winFrames.push({ pane, side: p.side });
    // shutters
    if (rngBool(spec.index + positions.indexOf(p))) {
      const sh = mat(PALETTE.wood[0], { roughness: 0.8 });
      for (const s of [-1, 1]) {
        const shutter = addBox(group, sh, 0.38, 1.15, 0.06,
          p.x + (p.rot === 0 ? s * 0.68 : 0), p.y,
          p.z + (p.rot === 0 ? 0 : s * 0.68), p.rot);
        shutter.position.x += Math.sin(p.rot) * 0.03;
        shutter.position.z += Math.cos(p.rot) * 0.03;
      }
    }
    // flower box
    if (spec.flowerBox && rngBool(spec.index * 7 + 3)) {
      const box = addBox(group, cache.getWood(spec.trim), 0.95, 0.22, 0.26, p.x, p.y - 0.72, p.z, p.rot);
      box.position.x += Math.sin(p.rot) * 0.14;
      box.position.z += Math.cos(p.rot) * 0.14;
      for (let f = 0; f < 5; f++) {
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), mat(rngColor([0xd94f6a, 0xe8a13c, 0xc457d6, 0xf0e07a])));
        const t2 = (f / 4 - 0.5) * 0.8;
        fl.position.set(
          p.x + Math.sin(p.rot) * 0.14 + (p.rot === 0 ? t2 : 0),
          p.y - 0.55 + Math.random() * 0.12,
          p.z + Math.cos(p.rot) * 0.14 + (p.rot === 0 ? 0 : t2)
        );
        group.add(fl);
      }
    }
  }

  // attic window
  if (spec.attic) {
    const round = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), winMat);
    round.position.set(0, h + roofH * 0.42, d / 2 + 0.3);
    group.add(round);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 16), trimMat);
    rim.position.set(0, h + roofH * 0.42, d / 2 + 0.3);
    group.add(rim);
  }

  // chimney
  if (spec.chimney) {
    const ch = addBox(group, cache.getStone(), 0.7, 1.6, 0.7, w * 0.28, h + roofH * 0.55, -d * 0.2);
    ch.rotation.y = 0.2;
    addBox(group, cache.getStone(), 0.85, 0.16, 0.85, w * 0.28, h + roofH * 0.55 + 0.8, -d * 0.2);
    // chimney smoke
    const smoke = buildSmoke(w * 0.28, h + roofH * 0.55 + 0.95, -d * 0.2);
    group.add(smoke);
    group.userData.smoke = smoke;
  }

  // balcony
  if (spec.balcony) {
    const by = h * 0.62;
    addBox(group, trimMat, w * 0.7, 0.12, 0.9, 0, by, d / 2 + 0.45);
    for (let i = 0; i <= 6; i++) {
      addBox(group, trimMat, 0.07, 0.6, 0.07, -w * 0.35 + (i / 6) * w * 0.7, by + 0.36, d / 2 + 0.85);
    }
    addBox(group, trimMat, w * 0.72, 0.08, 0.1, 0, by + 0.66, d / 2 + 0.85);
  }

  // sign
  if (spec.sign) {
    const board = addBox(group, cache.getWood(spec.trim), 1.1, 0.42, 0.07, w * 0.5 + 0.5, h * 0.8, 0);
    const s = board;
    s.rotation.z = 0.05;
  }

  // stacked firewood against the wall
  if (spec.index % 2 === 0) {
    const logMat = cache.getTrunk();
    const sx = spec.index % 3 === 0 ? -1 : 1;
    const bx = sx * (w / 2 + 0.35);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4 - row; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.62, 7), logMat);
        log.rotation.z = Math.PI / 2;
        log.position.set(bx, 0.12 + row * 0.19, -d * 0.22 + i * 0.2 + row * 0.1);
        log.castShadow = true;
        log.receiveShadow = true;
        group.add(log);
      }
    }
  }

  // barrel and crates by the door
  if (spec.index % 3 === 1) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.72, 10), cache.getWood(0x6b4f36));
    barrel.position.set(w * 0.28, 0.36, d / 2 + 0.55);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 5, 12), mat(0x4a4a4a, { metalness: 0.6, roughness: 0.5 }));
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(w * 0.28, 0.52, d / 2 + 0.55);
    group.add(hoop);
  }
  if (spec.index % 3 === 2) {
    const crate = addBox(group, cache.getWood(0x7a5b3e), 0.62, 0.5, 0.62, -w * 0.3, 0.25, d / 2 + 0.5);
    crate.rotation.y = 0.3;
    const crate2 = addBox(group, cache.getWood(0x5c4430), 0.48, 0.38, 0.48, -w * 0.3 + 0.1, 0.69, d / 2 + 0.45);
    crate2.rotation.y = -0.2;
  }

  // laundry line between two posts
  if (spec.index % 4 === 1) {
    const ropeMat = mat(0x9a8a6a, { roughness: 1 });
    const postX = -w / 2 - 0.9;
    addBox(group, cache.getWood(spec.trim), 0.09, 1.7, 0.09, postX, 0.85, d / 2 + 0.4);
    addBox(group, cache.getWood(spec.trim), 0.09, 1.7, 0.09, w / 2 + 0.9, 0.85, d / 2 + 0.4);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, w + 1.8, 4), ropeMat);
    rope.rotation.z = Math.PI / 2;
    rope.position.set(0, 1.62, d / 2 + 0.4);
    group.add(rope);
    const clothColors = [0xd8d0c0, 0xa8c4d8, 0xd8a8a8, 0xc8d8b0, 0xe8d8a8];
    for (let i = 0; i < 3; i++) {
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), mat(clothColors[i % clothColors.length], { side: THREE.DoubleSide, roughness: 0.95 }));
      cloth.position.set(-w * 0.3 + i * w * 0.3, 1.28, d / 2 + 0.4);
      cloth.castShadow = true;
      cloth.userData.dynamic = true;
      group.add(cloth);
      group.userData.cloth = group.userData.cloth || [];
      group.userData.cloth.push(cloth);
    }
  }

  group.userData.windows = winFrames;
  group.userData.spec = spec;
  return group;
}

function rngBool(seed) {
  return ((Math.sin(seed * 127.1) * 43758.5453) % 1 + 1) % 1 > 0.45;
}function rngColor(arr) {
  const i = Math.floor((Math.sin(99.7) * 4321) % 1 * arr.length + arr.length) % arr.length;
  return arr[Math.abs(i)];
}

// ---------------- Tree ----------------
// Trees are the most repeated prop in the village, so they are built as
// reusable prototypes and rendered with InstancedMesh.
export function buildTreeGeometry(scale = 1) {
  const parts = [];
  const trunkH = 4.2 * scale * 0.62;

  const trunk = new THREE.CylinderGeometry(0.16 * scale, 0.3 * scale, trunkH, 8);
  trunk.translate(0, trunkH / 2, 0);
  parts.push({ geo: trunk, kind: 'trunk' });

  const flare = new THREE.CylinderGeometry(0.3 * scale, 0.46 * scale, 0.36 * scale, 8);
  flare.translate(0, 0.12 * scale, 0);
  parts.push({ geo: flare, kind: 'trunk' });

  const blobs = 4;
  for (let i = 0; i < blobs; i++) {
    const r = 1.3 * scale;
    const geo = new THREE.IcosahedronGeometry(r, 0);
    geo.scale(1, 0.8, 1);
    const a = (i / blobs) * Math.PI * 2;
    const spread = 0.6 * scale;
    geo.translate(
      Math.cos(a) * spread,
      trunkH + (i === 0 ? 0.5 : 0.5 + (i / blobs) * 0.9) * scale,
      Math.sin(a) * spread
    );
    parts.push({ geo, kind: 'leaf' });
  }
  return parts;
}

export function buildTreeInstances(specs, cache) {
  const group = new THREE.Group();
  if (!specs.length) return group;
  const parts = buildTreeGeometry(1);

  const trunkMat = cache.getTrunk();
  const leafMat = cache.getLeaf();

  const matrices = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  for (const kind of ['trunk', 'leaf']) {
    const geos = parts.filter((p) => p.kind === kind).map((p) => p.geo);
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const inst = new THREE.InstancedMesh(merged, kind === 'trunk' ? trunkMat : leafMat, specs.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      pos.set(s.x, s.y, s.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
      scl.setScalar(s.scale);
      matrices.compose(pos, q, scl);
      inst.setMatrixAt(i, matrices);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }
  return group;
}

export function buildTree(spec, cache) {
  const group = new THREE.Group();
  const trunkMat = cache.getTrunk();
  const leafMat = cache.getLeaf();
  const h = 4.2 * spec.scale;
  const trunkH = h * 0.62;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * spec.scale, 0.3 * spec.scale, trunkH, 8), trunkMat);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);

  // root flare so the trunk sits into the ground instead of floating
  const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * spec.scale, 0.46 * spec.scale, 0.36 * spec.scale, 8), trunkMat);
  flare.position.y = 0.12 * spec.scale;
  flare.castShadow = true;
  group.add(flare);

  const blobs = spec.type < 0.45 ? 3 : spec.type < 0.8 ? 4 : 5;
  const canopyY = trunkH;
  for (let i = 0; i < blobs; i++) {
    const r = (1.15 + Math.random() * 0.6) * spec.scale;
    const geo = new THREE.IcosahedronGeometry(r, 0);
    const m = new THREE.Mesh(geo, leafMat);
    const a = (i / blobs) * Math.PI * 2 + Math.random();
    const spread = blobs === 1 ? 0 : 0.6 * spec.scale;
    m.position.set(
      Math.cos(a) * spread,
      canopyY + (i === 0 ? 0.5 : 0.15 + Math.random() * 0.95) * spec.scale,
      Math.sin(a) * spread
    );
    m.scale.y = 0.8;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  // a couple of branch stubs
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * spec.scale, 0.09 * spec.scale, 1.2 * spec.scale, 5), trunkMat);
    b.position.set(Math.cos(i * 2.4) * 0.3, trunkH * 0.72, Math.sin(i * 2.4) * 0.3);
    b.rotation.z = Math.cos(i * 2.4) * 0.85;
    b.rotation.x = Math.sin(i * 2.4) * 0.85;
    group.add(b);
  }
  return group;
}

// ---------------- Lamp ----------------
export function buildLamp(spec, cache) {
  const group = new THREE.Group();

  // soft pool of light on the ground
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 20),
    new THREE.MeshBasicMaterial({
      map: glowSprite('#ffb867', 0.25),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.05;
  pool.renderOrder = 1;
  group.add(pool);

  const postMat = mat(0x2f3138, { roughness: 0.6, metalness: 0.4 });
  const h = 3.4;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, h, 8), postMat);
  post.position.y = h / 2;
  post.castShadow = true;
  group.add(post);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 8), postMat);
  base.position.y = 0.15;
  base.castShadow = true;
  group.add(base);

  // arm
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 6, 12, Math.PI / 2), postMat);
  arm.position.set(0.28, h, 0);
  arm.rotation.y = Math.PI / 2;
  arm.rotation.z = 0;
  group.add(arm);

  // lantern
  const lantern = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffe6b0,
    emissive: 0xffc46a,
    emissiveIntensity: 2.2,
    roughness: 0.3,
    transparent: true,
    opacity: 0.92,
  });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.34, 6), glassMat);
  lantern.add(glass);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.18, 6), postMat);
  cap.position.y = 0.26;
  lantern.add(cap);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.07, 6), postMat);
  bottom.position.y = -0.2;
  lantern.add(bottom);
  lantern.position.set(0.55, h - 0.06, 0);
  group.add(lantern);

  // the actual PointLight comes from the shared LightPool; the emissive
  // glass and the sprite carry the visible glow
  const emitter = {
    position: new THREE.Vector3(0.55, h - 0.12, 0),
    intensity: 0,
    color: 0xffb867,
    distance: 12,
  };
  group.userData.emitter = emitter;

  // glow sprite
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowSprite('#ffcf8a'),
    color: 0xffb867,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  glow.scale.set(1.5, 1.5, 1);
  glow.position.copy(emitter.position);
  group.add(glow);

  group.userData = { ...group.userData, glow, glassMat, pool, seed: Math.random() * 10, flicker: 0.86 + Math.random() * 0.25 };
  return group;
}

// ---------------- Props ----------------
export function buildProp(spec, cache) {
  const group = new THREE.Group();
  const kind = spec.kind;
  const s = spec.scale ?? 1;
  if (kind === 'bush') {
    const leafMat = cache.getLeaf();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 * s * (0.7 + Math.random() * 0.5), 0), leafMat);
      m.position.set((Math.random() - 0.5) * 0.6 * s, 0.3 * s + Math.random() * 0.2, (Math.random() - 0.5) * 0.6 * s);
      m.castShadow = true;
      group.add(m);
    }
  } else if (kind === 'crate') {
    addBox(group, cache.getWood(0x7a5b3e), 0.75 * s, 0.75 * s, 0.75 * s, 0, 0.375 * s, 0);
    addBox(group, cache.getWood(0x5c4430), 0.8 * s, 0.08 * s, 0.1 * s, 0, 0.4 * s, 0.36 * s);
  } else if (kind === 'barrel') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * s, 0.3 * s, 0.85 * s, 10), cache.getWood(0x6b4f36));
    m.position.y = 0.42 * s;
    m.castShadow = true;
    group.add(m);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33 * s, 0.03, 5, 12), mat(0x4a4a4a, { metalness: 0.6, roughness: 0.5 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.62 * s;
    group.add(ring);
  } else if (kind === 'bench') {
    const wood = cache.getWood(0x7a5b3e);
    addBox(group, wood, 1.7 * s, 0.1 * s, 0.45 * s, 0, 0.45 * s, 0);
    addBox(group, wood, 1.7 * s, 0.45 * s, 0.08 * s, 0, 0.7 * s, -0.2 * s);
    for (const sx of [-1, 1]) {
      addBox(group, mat(0x3d3128), 0.1 * s, 0.45 * s, 0.4 * s, sx * 0.7 * s, 0.22 * s, 0);
    }
  } else if (kind === 'fence') {
    const wood = cache.getWood(0x6b4f36);
    const posts = 3;
    for (let i = 0; i < posts; i++) {
      addBox(group, wood, 0.12, 1.0, 0.12, (i - 1) * 0.75 * s, 0.5 * s, 0);
    }
    addBox(group, wood, posts * 0.75 * s, 0.09, 0.07, (posts - 1) * 0.375 * s, 0.78 * s, 0);
    addBox(group, wood, posts * 0.75 * s, 0.09, 0.07, (posts - 1) * 0.375 * s, 0.45 * s, 0);
  } else if (kind === 'hay') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * s, 0.55 * s, 1.0 * s, 9), mat(0xd8b45e, { roughness: 1 }));
    m.position.y = 0.5 * s;
    m.rotation.z = Math.PI / 2;
    m.castShadow = true;
    group.add(m);
  } else if (kind === 'stump') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * s, 0.46 * s, 0.5 * s, 9), cache.getTrunk());
    m.position.y = 0.25 * s;
    m.castShadow = true;
    group.add(m);
  } else if (kind === 'place') {
    buildPlaceMarker(spec, cache, group);
  } else if (kind === 'bonfire') {
    buildBonfire(cache, group);
  } else if (kind === 'bike') {
    buildBike(cache, group);
  } else if (kind === 'cart') {
    buildCart(cache, group);
  } else if (kind === 'flowers') {
    buildFlowers(cache, group);
  } else if (kind === 'garland') {
    buildGarland(cache, group);
  }
  return group;
}

// A string of little paper lanterns hung between two posts.
function buildGarland(cache, group) {
  const postMat = cache.getWood(0x6b4f36);
  const span = 7.5;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 4.2, 8), postMat);
    post.position.set(s * span / 2, 2.1, 0);
    post.castShadow = true;
    group.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.24, 8), cache.getStone());
    base.position.set(s * span / 2, 0.12, 0);
    group.add(base);
  }
  // sagging rope
  const points = [];
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = -span / 2 + t * span;
    const y = 4.0 - Math.sin(t * Math.PI) * 0.62;
    points.push(new THREE.Vector3(x, y, 0));
  }
  const ropeCurve = new THREE.CatmullRomCurve3(points);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 32, 0.018, 5, false), mat(0x6b5a42, { roughness: 1 }));
  group.add(rope);

  const lanternColors = [0xffb45c, 0xff8a6a, 0xffd98a, 0xffa0b0, 0xa8d8ff];
  const lanterns = [];
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    const p = ropeCurve.getPointAt(t);
    const l = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 10, 8),
      new THREE.MeshStandardMaterial({
        color: lanternColors[i % lanternColors.length],
        emissive: lanternColors[i % lanternColors.length],
        emissiveIntensity: 0.2,
        roughness: 0.6,
      })
    );
    l.position.set(p.x, p.y - 0.13, p.z);
    l.scale.y = 1.25;
    l.userData.dynamic = true;
    group.add(l);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSprite('#ffcf8a'), color: lanternColors[i % lanternColors.length],
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(0.32, 0.32, 1);
    glow.position.copy(l.position);
    group.add(glow);
    lanterns.push({ mesh: l, glow, phase: Math.random() * 6 });
  }
  const emitter = {
    position: new THREE.Vector3(0, 3.4, 0),
    intensity: 0,
    color: 0xffc078,
    distance: 14,
  };
  group.userData.garland = { lanterns, emitter };}

function buildBike(cache, group) {
  const metal = mat(0x50555c, { metalness: 0.6, roughness: 0.45 });
  const rubber = mat(0x2a2724, { roughness: 0.9 });
  const paint = mat(0x8a4a3a, { metalness: 0.2, roughness: 0.6 });
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.045, 8, 18), rubber);
    wheel.position.set(s * 0.52, 0.33, 0);
    wheel.rotation.y = Math.PI / 2;
    wheel.castShadow = true;
    group.add(wheel);
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 3), metal);
      spoke.position.set(s * 0.52, 0.33, 0);
      spoke.rotation.set(0, Math.PI / 2, (i / 6) * Math.PI);
      group.add(spoke);
    }
  }
  const frame = addBox(group, paint, 0.9, 0.05, 0.05, 0, 0.62, 0);
  frame.rotation.z = 0.12;
  addBox(group, paint, 0.05, 0.42, 0.05, -0.2, 0.45, 0);
  addBox(group, paint, 0.05, 0.05, 0.34, 0.42, 0.72, 0);
  const seat = addBox(group, mat(0x3a2c22), 0.24, 0.06, 0.12, -0.22, 0.82, 0);
  addBox(group, metal, 0.04, 0.24, 0.04, 0.42, 0.62, 0);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.2, 10, 1, true), mat(0xb08a4a, { side: THREE.DoubleSide }));
  basket.position.set(0.56, 0.66, 0);
  group.add(basket);
}

function buildCart(cache, group) {
  const wood = cache.getWood(0x7a5b3e);
  addBox(group, wood, 1.4, 0.5, 0.9, 0, 0.55, 0);
  addBox(group, cache.getWood(0x5c4430), 1.5, 0.07, 0.1, 0, 0.78, -0.42);
  addBox(group, cache.getWood(0x5c4430), 1.5, 0.07, 0.1, 0, 0.78, 0.42);
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 14), cache.getWood(0x5c4430));
    wheel.position.set(s * 0.5, 0.32, 0.5);
    wheel.rotation.y = Math.PI / 2;
    wheel.castShadow = true;
    group.add(wheel);
  }
  // produce in the cart
  const colors = [0xc0392b, 0xd8b45e, 0x7a9a3a, 0xb05a2a];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(colors[i % colors.length]));
    f.position.set((Math.random() - 0.5) * 1.0, 0.85, (Math.random() - 0.5) * 0.6);
    f.castShadow = true;
    group.add(f);
  }
}

function buildFlowers(cache, group) {
  const stem = mat(0x4a7a3a, { roughness: 1 });
  const colors = [0xe8d05a, 0xd9647a, 0xa87fd0, 0xf0f0e0, 0xe88a4a];
  for (let i = 0; i < 9; i++) {
    const h = 0.18 + Math.random() * 0.22;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, h, 4), stem);
    s.position.set((Math.random() - 0.5) * 0.9, h / 2, (Math.random() - 0.5) * 0.9);
    group.add(s);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), mat(colors[i % colors.length]));
    bloom.position.set(s.position.x, h + 0.03, s.position.z);
    bloom.scale.y = 0.6;
    group.add(bloom);
  }
}

function buildBonfire(cache, group) {
  const stone = cache.getStone();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + Math.random() * 0.07, 0), stone);
    s.position.set(Math.cos(a) * 0.85, 0.08, Math.sin(a) * 0.85);
    s.rotation.set(Math.random(), Math.random(), Math.random());
    s.castShadow = true;
    group.add(s);
  }
  const logMat = cache.getTrunk();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.95, 6), logMat);
    log.position.set(Math.cos(a) * 0.16, 0.24, Math.sin(a) * 0.16);
    log.rotation.set(Math.cos(a) * 0.9, a, Math.sin(a) * 0.9);
    log.castShadow = true;
    group.add(log);
  }
  const flames = new THREE.Group();
  const tex = glowSprite('#ff9a3c', 0.3);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: i % 2 ? 0xffb04a : 0xff7a2a, transparent: true,
      opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.position.set((Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2);
    s.scale.setScalar(0.45 + Math.random() * 0.35);
    s.userData.dynamic = true;
    flames.add(s);
  }
  group.add(flames);
  const emitter = {
    position: new THREE.Vector3(0, 0.7, 0),
    intensity: 0,
    color: 0xff8030,
    distance: 15,
  };
  group.userData.bonfire = { flames, emitter };
}

function buildPlaceMarker(spec, cache, group) {
  if (spec.name === 'Колодец') {
    const stone = cache.getStone();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.85, 14), stone);
    ring.position.y = 0.42;
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 14), mat(0x11161f));
    inner.position.y = 0.7;
    group.add(inner);
    const roofM = cache.getRoof(0x7d4438);
    for (const s of [-1, 1]) {
      const p = addBox(group, cache.getWood(0x5c4430), 0.14, 1.9, 0.14, s * 0.85, 1.4, 0);
    }
    const g = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.5), roofM);
    g.position.y = 2.4;
    g.rotation.x = 0.35;
    g.castShadow = true;
    group.add(g);
    const g2 = g.clone();
    g2.rotation.x = -0.35;
    group.add(g2);
    // bucket
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.28, 9), cache.getWood(0x7a5b3e));
    bucket.position.set(0, 1.45, 0);
    group.add(bucket);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 4), mat(0x6b5a42));
    rope.position.set(0, 1.95, 0);
    group.add(rope);
  } else if (spec.name === 'Скрипучая лавка') {
    const wood = cache.getWood(0x7a5b3e);
    addBox(group, wood, 3.4, 0.14, 1.2, 0, 0.9, 0);
    addBox(group, cache.getRoof(0x5c6b74), 4.0, 0.1, 1.8, 0, 2.4, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      addBox(group, cache.getWood(0x5c4430), 0.14, 2.4, 0.14, sx * 1.8, 1.2, sz * 0.75);
    }
    addBox(group, mat(0x8a5a3a), 0.5, 0.5, 0.5, 1.1, 1.22, 0.2);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.16, 8), mat(0xd8d2c0));
    mug.position.set(-0.9, 1.05, 0.2);
    group.add(mug);
  } else if (spec.name === 'Мельница') {
    const stone = cache.getStone();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.6, 7.0, 14), stone);
    tower.position.y = 3.5;
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.8, 14), cache.getRoof(0x7d4438));
    cap.position.y = 7.6;
    cap.castShadow = true;
    group.add(cap);
    const hub = new THREE.Group();
    hub.position.set(0, 6.0, 2.1);
    for (let i = 0; i < 4; i++) {
      const blade = addBox(group, cache.getWood(0x8a6a45), 0.5, 5.4, 0.12, 0, 0, 0);
      blade.position.set(0, 0, 0);
      const holder = new THREE.Group();
      holder.rotation.z = (i / 4) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.6, 0.1), cache.getWood(0x8a6a45));
      b.position.set(0, 2.6, 0);
      b.castShadow = true;
      holder.add(b);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.6), mat(0xd9cbb0, { side: THREE.DoubleSide }));
      sail.position.set(0.6, 2.7, 0.04);
      holder.add(sail);
      hub.add(holder);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 8), cache.getWood(0x5c4430));
    axle.rotation.x = Math.PI / 2;
    hub.add(axle);
    group.add(hub);
    group.userData.spinner = hub;
  } else if (spec.name === 'Церковная площадь') {
    const stone = cache.getStone();
    const body = addBox(group, stone, 5.0, 6.0, 7.0, 0, 3.0, 0);
    const roofM = cache.getRoof(0x5c6b74);
    const pr = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.6, 4), roofM);
    pr.position.y = 7.2;
    pr.rotation.y = Math.PI / 4;
    pr.castShadow = true;
    group.add(pr);
    const tower = addBox(group, stone, 2.6, 11.0, 2.6, 0, 5.5, -4.6);
    const troof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.0, 4), roofM);
    troof.position.y = 12.5;
    troof.rotation.y = Math.PI / 4;
    troof.castShadow = true;
    group.add(troof);
    const cross = new THREE.Group();
    addBox(group, mat(0x3a3a3a, { metalness: 0.6 }), 0.12, 1.4, 0.12, 0, 0.7, 0);
    addBox(group, mat(0x3a3a3a, { metalness: 0.6 }), 0.7, 0.12, 0.12, 0, 0.95, 0);
    cross.position.set(0, 14.2, -4.6);
    group.add(cross);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xa8813c, { metalness: 0.8, roughness: 0.35 }));
    bell.position.set(0, 10.4, -4.6);
    group.add(bell);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8), cache.getWindow());
    win.position.set(0, 3.4, 3.51);
    group.add(win);
  } else if (spec.name === 'Тёплая пекарня') {
    // already a house; add bakery sign + oven glow
    const sign = addBox(group, cache.getWood(0x5c4430), 1.6, 0.5, 0.08, 2.4, 3.0, 0);
    sign.rotation.z = 0.04;
  } else if (spec.name === 'Дом с красной крышей') {
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(0xd8d2c8));
    dish.position.set(0, 5.2, 0);
    dish.rotation.set(Math.PI * 0.75, 0, 0.4);
    dish.castShadow = true;
    group.add(dish);
    const pole = addBox(group, mat(0x444444, { metalness: 0.5 }), 0.09, 1.2, 0.09, 0, 4.6, 0);
  } else if (spec.name === 'Яблоневый сад') {
    // handled by apple trees
  }
  return group;
}

// ---------------- Character ----------------
const SKIN = [0xf0c9a0, 0xe0b088, 0xc98f68, 0x9c6b4a, 0x7a4f36];
const CLOTH = [0x5a7fa8, 0x8a5a6a, 0x6a8a6a, 0xa88a4a, 0x6a5a8a, 0xa85a4a, 0x4a6a8a];
const HAIR = [0x2b1f18, 0x4a3428, 0x6b4a2a, 0x8a6a3a, 0xb0b0b8, 0x6a3a2a];

function shared(color, roughness = 0.85, metalness = 0) {
  return mat(color, { roughness, metalness });
}

export function buildCharacter(spec) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const skin = shared(SKIN[spec.skinIdx], 0.75);
  const shirt = shared(CLOTH[spec.shirtIdx], 0.9);
  const pants = shared(spec.pantsIdx === 0 ? 0x3a3f4a : spec.pantsIdx === 1 ? 0x4a3a2a : 0x2f3a44, 0.9);
  const hair = shared(HAIR[spec.hairIdx], 0.95);
  const shoe = shared(0x2a2520, 0.9);

  const scale = spec.scale ?? 1;
  const h = 1.72 * scale;

  // legs
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  for (const [g, s] of [[legL, -1], [legR, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * scale, 0.1 * scale, 0.75 * scale, 8), pants);
    leg.position.y = -0.37 * scale;
    leg.castShadow = true;
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.1 * scale, 0.28 * scale), shoe);
    foot.position.set(0, -0.76 * scale, 0.06 * scale);
    foot.castShadow = true;
    g.add(foot);
    g.position.set(s * 0.13 * scale, 0.75 * scale, 0);
    body.add(g);
  }

  // torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * scale, 0.22 * scale, 0.62 * scale, 10), shirt);
  torso.position.y = 1.05 * scale;
  torso.castShadow = true;
  body.add(torso);
  // hips
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.21 * scale, 0.2 * scale, 10), pants);
  hips.position.y = 0.7 * scale;
  body.add(hips);

  // arms
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  for (const [g, s] of [[armL, -1], [armR, 1]]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * scale, 0.075 * scale, 0.58 * scale, 8), shirt);
    arm.position.y = -0.29 * scale;
    arm.castShadow = true;
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085 * scale, 8, 6), skin);
    hand.position.y = -0.6 * scale;
    g.add(hand);
    g.position.set(s * 0.3 * scale, 1.3 * scale, 0);
    body.add(g);
  }

  // head
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21 * scale, 14, 12), skin);
  skull.position.y = 0.2 * scale;
  skull.castShadow = true;
  head.add(skull);  // hair
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.225 * scale, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), hair);
  hairCap.position.y = 0.22 * scale;
  head.add(hairCap);
  if (spec.longHair) {
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.225 * scale, 0.19 * scale, 0.34 * scale, 12, 1, true), hair);
    back.position.set(0, 0.06 * scale, -0.04 * scale);
    head.add(back);
  }
  if (spec.hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36 * scale, 0.36 * scale, 0.04 * scale, 14), mat(spec.hatColor ?? 0x4a3a2a));
    brim.position.y = 0.33 * scale;
    head.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.22 * scale, 0.22 * scale, 12), mat(spec.hatColor ?? 0x4a3a2a));
    crown.position.y = 0.45 * scale;
    head.add(crown);
  }
  // eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1512 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.033 * scale, 8, 6), eyeMat);
    eye.position.set(s * 0.075 * scale, 0.21 * scale, 0.185 * scale);
    head.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.07 * scale, 0.016 * scale, 0.02), hair);
    brow.position.set(s * 0.075 * scale, 0.26 * scale, 0.19 * scale);
    brow.rotation.z = s * 0.12;
    head.add(brow);
  }
  // nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035 * scale, 0.07 * scale, 6), skin);
  nose.position.set(0, 0.17 * scale, 0.2 * scale);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);
  // mouth
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05 * scale, 0.012 * scale, 5, 10, Math.PI), mouthMat(spec.smile));
  mouth.position.set(0, 0.115 * scale, 0.185 * scale);
  mouth.rotation.z = Math.PI;
  head.add(mouth);
  // cheeks blush
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xe08a7a, transparent: true, opacity: 0.35 });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.045 * scale, 8), blushMat);
    b.position.set(s * 0.13 * scale, 0.155 * scale, 0.165 * scale);
    b.rotation.y = s * 0.5;
    head.add(b);
  }
  head.position.y = 1.5 * scale;
  body.add(head);

  // accessories
  if (spec.lantern) {
    const lampGroup = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09 * scale, 0.014 * scale, 5, 10), mat(0x3a3a3a, { metalness: 0.6 }));
    handle.position.y = 0.16 * scale;
    lampGroup.add(handle);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * scale, 0.085 * scale, 0.18 * scale, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffb851, emissiveIntensity: 1.8, transparent: true, opacity: 0.9 }));
    lampGroup.add(glass);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.1 * scale, 0.07 * scale, 8), mat(0x3a3a3a, { metalness: 0.5 }));
    top.position.y = 0.13 * scale;
    lampGroup.add(top);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSprite('#ffcf8a'), color: 0xffb060, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(1.1 * scale, 1.1 * scale, 1);
    lampGroup.add(glow);
    lampGroup.position.set(0.3 * scale, 1.0 * scale, 0.12 * scale);
    body.add(lampGroup);
    group.userData.lampGroup = lampGroup;
    group.userData.lampGlass = glass;
  }
  if (spec.basket) {
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.19 * scale, 0.15 * scale, 0.2 * scale, 10, 1, true), mat(0xb08a4a, { side: THREE.DoubleSide }));
    basket.position.set(-0.3 * scale, 0.85 * scale, 0.14 * scale);
    basket.rotation.x = 0.4;
    body.add(basket);
    for (let i = 0; i < 3; i++) {
      const apple = new THREE.Mesh(new THREE.SphereGeometry(0.05 * scale, 8, 6), mat([0xc0392b, 0xd84f3b, 0xe0b83a][i % 3]));
      apple.position.set(-0.3 * scale + (i - 1) * 0.07 * scale, 0.94 * scale, 0.14 * scale + (i - 1) * 0.05 * scale);
      body.add(apple);
    }
  }
  if (spec.cat) {
    buildCat(spec, group);
  }
  if (spec.dog) {
    buildDog(spec, group);
  }

  group.userData.parts = { body, legL, legR, armL, armR, head, height: h };
  group.userData.spec = spec;

  // Collapse the static body parts so every villager costs only a handful of
  // draw calls. Limbs and the head stay separate because they animate.
  mergeStaticGroup(body, { keepSubtrees: [legL, legR, armL, armR, head] });

  return group;
}

function mouthMat(smile) {
  const geo = new THREE.TorusGeometry(0.05, 0.012, 5, 10, Math.PI);
  return new THREE.MeshStandardMaterial({ color: smile ? 0x8a4a4a : 0x7a5a4a, roughness: 0.6 });
}

function buildCat(spec, group) {
  const cat = new THREE.Group();
  const fur = mat(spec.catColor ?? 0x3a3a42, { roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 8), fur);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.26;
  body.castShadow = true;
  cat.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), fur);
  head.position.set(0, 0.34, 0.2);
  head.castShadow = true;
  cat.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 4), fur);
    ear.position.set(s * 0.08, 0.45, 0.19);
    ear.rotation.y = Math.PI / 4;
    cat.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), new THREE.MeshBasicMaterial({ color: 0xd8e85a }));
    eye.position.set(s * 0.06, 0.36, 0.31);
    cat.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 5, 12, Math.PI * 1.3), fur);
  tail.position.set(0, 0.32, -0.22);
  tail.rotation.set(0.6, 0, 0);
  cat.add(tail);
  for (const s of [-1, 1]) {
    for (const f of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.26, 6), fur);
      leg.position.set(s * 0.08, 0.13, f * 0.13);
      cat.add(leg);
    }
  }
  cat.position.set(spec.petOffset?.x ?? 0.6, 0, spec.petOffset?.z ?? 0.4);
  cat.scale.setScalar(spec.petScale ?? 1);
  group.add(cat);
  group.userData.pet = cat;
  group.userData.petTail = tail;
}

function buildDog(spec, group) {
  const dog = new THREE.Group();
  const fur = mat(spec.dogColor ?? 0xa07a4a, { roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.35, 4, 8), fur);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.4;
  body.castShadow = true;
  dog.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fur);
  head.position.set(0, 0.52, 0.26);
  head.castShadow = true;
  dog.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.16), fur);
  snout.position.set(0, 0.48, 0.4);
  dog.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), mat(0x2a2020));
  nose.position.set(0, 0.49, 0.48);
  dog.add(nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), fur);
    ear.position.set(s * 0.14, 0.56, 0.2);
    ear.scale.set(0.5, 1.2, 0.7);
    dog.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 5), new THREE.MeshBasicMaterial({ color: 0x2a1a12 }));
    eye.position.set(s * 0.06, 0.55, 0.37);
    dog.add(eye);
    for (const f of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.38, 6), fur);
      leg.position.set(s * 0.1, 0.19, f * 0.18);
      dog.add(leg);
    }
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.3, 6), fur);
  tail.position.set(0, 0.55, -0.28);
  tail.rotation.x = -0.9;
  dog.add(tail);
  dog.position.set(spec.petOffset?.x ?? -0.6, 0, spec.petOffset?.z ?? 0.4);
  dog.scale.setScalar(spec.petScale ?? 1);
  group.add(dog);
  group.userData.pet = dog;
  group.userData.petTail = tail;
}

// ---------------- Fireflies ----------------
export function buildFireflies(count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const geo2 = new THREE.BufferGeometry();
  const phases = new Float32Array(count);
  const homes = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 62;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = 0.5 + Math.random() * 2.6;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    phases[i] = Math.random() * Math.PI * 2;
    homes.push({ x, y, z, phase: phases[i], speed: 0.4 + Math.random() * 0.8, radius: 0.6 + Math.random() * 1.6 });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.24,
    map: starTexture(),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffe89a,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData = { homes, phases };
  return points;
}

// ---------------- Material cache ----------------
export function createMaterialCache() {
  const walls = new Map();
  const roofs = new Map();
  const woods = new Map();
  const cache = {
    getWall(color) {
      if (!walls.has(color)) walls.set(color, mat(color, { map: plasterTexture('#' + color.toString(16).padStart(6, '0')), roughness: 0.92 }));
      return walls.get(color);
    },
    getRoof(color) {
      if (!roofs.has(color)) roofs.set(color, mat(color, { map: roofTexture('#' + color.toString(16).padStart(6, '0')), roughness: 0.9 }));
      return roofs.get(color);
    },
    getWood(color) {
      if (!woods.has(color)) woods.set(color, mat(color, { map: woodTexture('#' + color.toString(16).padStart(6, '0')), roughness: 0.85 }));
      return woods.get(color);
    },
    getStone() {
      if (!cache._stone) cache._stone = mat(0x8d8578, { map: plasterTexture('#8d8578'), roughness: 0.95 });
      return cache._stone;
    },
    getLeaf() {
      if (!cache._leaf) cache._leaf = mat(0xffffff, { map: leafTexture('#4c7c3d'), roughness: 0.95 });
      return cache._leaf;
    },
    getTrunk() {
      if (!cache._trunk) cache._trunk = mat(0x5a4331, { map: woodTexture('#5a4331'), roughness: 0.95 });
      return cache._trunk;
    },
    getWindow() {
      if (!cache._window) cache._window = new THREE.MeshStandardMaterial({
        map: windowTexture(),
        emissiveMap: windowTexture(),
        emissive: 0xffffff,
        emissiveIntensity: 0.15,
        roughness: 0.4,
        metalness: 0,
      });
      return cache._window;
    },
  };
  return cache;
}
