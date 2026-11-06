import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';
import { makeRng, valueNoise2D, fbm, clamp } from './util.js';
import { grassTexture } from './textures.js';

// ---------- Terrain ----------
// The village sits in a gentle bowl: flat around the plaza, rolling hills at the rim.
export function terrainHeight(x, z) {
  const noise = valueNoise2D(WORLD.seed);
  const r = Math.hypot(x, z);
  const rolling = (fbm(noise, x * 0.011, z * 0.011, 4) - 0.5) * 4.2;
  const detail = (fbm(noise, x * 0.05, z * 0.05, 2) - 0.5) * 0.7;
  const edgeLift = Math.max(0, (r - 34) / 46) * 3.2;
  const flat = 1 - Math.min(1, Math.max(0, (r - 12) / 16));
  return (rolling + detail) * (1 - flat * 0.85) + edgeLift;
}

export function buildGround(rng) {
  const noise = valueNoise2D(WORLD.seed);
  const size = WORLD.size;
  const geo = new THREE.PlaneGeometry(size, size, 120, 120);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(PALETTE.grass[0]);
  const c2 = new THREE.Color(PALETTE.grass[2]);
  const c3 = new THREE.Color(PALETTE.grass[1]);
  const dry = new THREE.Color(0x8a8a52);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const t = clamp((h + 2.4) / 5.2, 0, 1);
    const col = c2.clone().lerp(c3, t).lerp(base, 0.35);
    const patch = fbm(noise, x * 0.08, z * 0.08, 2);
    if (patch > 0.62) col.lerp(dry, (patch - 0.62) * 1.6);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: grassTexture('#ffffff'),
    roughness: 0.98,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

// ---------- Layout ----------
export const PLACES = [
  { name: 'Центральная площадь', sub: 'Тихо пахнет дымом и яблоками', x: 0, z: 0, r: 16 },
  { name: 'Колодец', sub: 'Ведро на верёвке, рядом — глиняные горшки', x: 9, z: 6, r: 7 },
  { name: 'Скрипучая лавка', sub: 'Старый счётчик и кружка остывшего чая', x: -11, z: 5, r: 6 },
  { name: 'Мельница', sub: 'Крылья поскрипывают, будто здороваясь', x: -34, z: -26, r: 10 },
  { name: 'Рыбацкая пристань', sub: 'Вода плещется о чёрные сваи', x: 42, z: 30, r: 12 },
  { name: 'Церковная площадь', sub: 'Колокол зовёт к вечерней молитве', x: 30, z: -34, r: 11 },
  { name: 'Дом с красной крышей', sub: 'На крыше — старый спутник', x: -46, z: 22, r: 9 },
  { name: 'Тёплая пекарня', sub: 'Из трубы идёт дым, пахнет хлебом', x: 44, z: -6, r: 9 },
  { name: 'Яблоневый сад', sub: 'Ветки гнутся под спелыми яблоками', x: 4, z: -50, r: 13 },
  { name: 'Тихая аллея', sub: 'Фонари горят один за другим', x: -18, z: -50, r: 10 },
  { name: 'Тропа к реке', sub: 'Каблуки оставляют следы в грязи', x: 52, z: 12, r: 8 },
];

export function buildLayout(rng) {
  const roads = [];
  // Main crossroads: plaza -> 4 directions
  const dirs = [
    { a: Math.PI * 0.25, len: 62 },
    { a: Math.PI * 0.75, len: 62 },
    { a: Math.PI * 1.25, len: 58 },
    { a: Math.PI * 1.75, len: 58 },
  ];
  for (const d of dirs) {
    roads.push({ from: [0, 0], to: [Math.cos(d.a) * d.len, Math.sin(d.a) * d.len], width: 4.2 });
  }
  // Ring road around plaza
  roads.push({ from: [-17, -17], to: [17, -17], width: 3.0 });
  roads.push({ from: [17, -17], to: [17, 17], width: 3.0 });
  roads.push({ from: [17, 17], to: [-17, 17], width: 3.0 });
  roads.push({ from: [-17, 17], to: [-17, -17], width: 3.0 });
  // Branch to river
  roads.push({ from: [42, 30], to: [58, 40], width: 2.6 });
  roads.push({ from: [30, -34], to: [40, -46], width: 2.6 });
  roads.push({ from: [-34, -26], to: [-44, -38], width: 2.6 });
  roads.push({ from: [-46, 22], to: [-52, 30], width: 2.4 });

  // Houses along the four spokes, offset to both sides
  const houses = [];
  const occupied = [];
  const tooClose = (x, z, min) => occupied.some((o) => Math.hypot(o.x - x, o.z - z) < min);

  for (const d of dirs) {
    const count = Math.round(WORLD.houseCount / dirs.length);
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 0.4);
      const dist = 24 + t * 34;
      const baseX = Math.cos(d.a) * dist;
      const baseZ = Math.sin(d.a) * dist;
      for (const side of [-1, 1]) {
        const nx = Math.cos(d.a + Math.PI / 2) * side;
        const nz = Math.sin(d.a + Math.PI / 2) * side;
        const off = rng.range(6.5, 9.5);
        const jitterX = rng.range(-2.2, 2.2);
        const jitterZ = rng.range(-2.2, 2.2);
        const x = baseX + nx * off + jitterX;
        const z = baseZ + nz * off + jitterZ;
        if (Math.hypot(x, z) > WORLD.groundRadius - 12) continue;
        if (tooClose(x, z, 13)) continue;
        occupied.push({ x, z });
        houses.push(makeHouse(rng, x, z, d.a + Math.PI / 2 * side, i));
      }
    }
  }

  // Lamps along roads
  const lamps = [];
  for (const road of roads) {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[1] - road.from[1];
    const len = Math.hypot(dx, dz);
    const count = Math.max(1, Math.floor(len / 13));
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      const px = road.from[0] + dx * t;
      const pz = road.from[1] + dz * t;
      const nx = -dz / len;
      const nz = dx / len;
      const side = i % 2 === 0 ? 1 : -1;
      const ox = px + nx * side * (road.width * 0.5 + 1.1);
      const oz = pz + nz * side * (road.width * 0.5 + 1.1);
      if (Math.hypot(ox, oz) > WORLD.groundRadius - 4) continue;
      if (occupied.some((o) => Math.hypot(o.x - ox, o.z - oz) < 5.5)) continue;
      lamps.push({ x: ox, z: oz, rot: Math.atan2(dx, dz) });
    }
  }

  // Trees
  const trees = [];
  let guard = 0;
  while (trees.length < WORLD.treeCount && guard++ < 8000) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * (WORLD.groundRadius + 6);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x, z) < 14) continue;
    if (occupied.some((o) => Math.hypot(o.x - x, o.z - z) < 7.5)) continue;
    if (lamps.some((o) => Math.hypot(o.x - x, o.z - z) < 3.2)) continue;
    if (isOnRoad(x, z, roads, 3.4)) continue;
    trees.push({ x, z, scale: rng.range(0.75, 1.55), type: rng.next() });
  }

  // Bushes, fences, crates, wells
  const props = [];
  for (const p of PLACES) {
    props.push({ kind: 'place', ...p });
  }
  props.push({ kind: 'bonfire', x: 4.5, z: -4.5, rot: 0, scale: 1 });
  props.push({ kind: 'garland', x: -8, z: 11, rot: 0.35, scale: 1 });
  props.push({ kind: 'garland', x: 9, z: 13, rot: -0.5, scale: 1 });
  guard = 0;
  while (props.length < 90 && guard++ < 3000) {
    const a = rng.next() * Math.PI * 2;
    const r = 18 + Math.sqrt(rng.next()) * (WORLD.groundRadius - 14);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isOnRoad(x, z, roads, 2.6)) continue;
    if (occupied.some((o) => Math.hypot(o.x - x, o.z - z) < 4.4)) continue;
    props.push({ kind: rng.pick(['bush', 'bush', 'crate', 'barrel', 'bench', 'fence', 'hay', 'stump', 'bike', 'cart', 'flowers', 'flowers']), x, z, rot: rng.next() * Math.PI * 2, scale: rng.range(0.85, 1.3) });
  }

  return { roads, houses, lamps, trees, props };
}

export function isOnRoad(x, z, roads, margin = 3) {
  for (const r of roads) {
    const ax = r.from[0], az = r.from[1];
    const bx = r.to[0], bz = r.to[1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 === 0 ? 0 : ((x - ax) * dx + (z - az) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t;
    const pz = az + dz * t;
    if (Math.hypot(x - px, z - pz) < r.width * 0.5 + margin) return true;
  }
  return false;
}

function makeHouse(rng, x, z, rot, index) {
  const wallColors = PALETTE.wall;
  const roofColors = PALETTE.roof;
  return {
    x, z, rot,
    w: rng.range(5.2, 7.6),
    d: rng.range(4.6, 6.6),
    h: rng.range(3.2, 4.4),
    roofH: rng.range(1.9, 3.0),
    wall: wallColors[rng.int(0, wallColors.length - 1)],
    roof: roofColors[rng.int(0, roofColors.length - 1)],
    trim: PALETTE.wood[rng.int(0, PALETTE.wood.length - 1)],
    chimney: rng.chance(0.75),
    attic: rng.chance(0.45),
    balcony: rng.chance(0.35),
    porch: rng.chance(0.6),
    windows: rng.int(2, 4),
    lit: rng.chance(0.8),
    doorColor: rng.pick([0x7d4a32, 0x5a3f2c, 0x84613b, 0x3f5a4a]),
    flowerBox: rng.chance(0.55),
    sign: rng.chance(0.3),
    index,
  };
}
