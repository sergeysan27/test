import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Interior furnishings for the houses. They make the rooms feel lived in and
// they double as the geometry that is visible if the player peers in through
// a window.

export function buildInterior(spec, cache) {
  const group = new THREE.Group();
  const { w, d, h } = spec;
  const floorMat = cache.getWood(0x7a5b3e);
  const wallMat = cache.getWall(spec.wall);
  const trimMat = cache.getWood(spec.trim);
  const rng = mulberry(spec.index * 977 + 13);

  // floor
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.12, d - 0.12), floorMat);
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  group.add(floor);

  // inner wall shell so the room does not show the outside walls from within
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.16, h - 0.2, d - 0.16),
    new THREE.MeshStandardMaterial({ color: 0x6a5844, roughness: 0.95, side: THREE.BackSide })
  );
  shell.position.y = h / 2;
  shell.receiveShadow = true;
  group.add(shell);

  // ceiling
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.1, d - 0.12), wallMat);
  ceil.position.y = h - 0.12;
  group.add(ceil);

  // rug
  const rugMat = new THREE.MeshStandardMaterial({
    color: [0x8a4a3a, 0x4a6a7a, 0x7a6a3a][Math.floor(rng() * 3)],
    roughness: 1,
  });
  const rug = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.03, d * 0.36), rugMat);
  rug.position.set((rng() - 0.5) * w * 0.2, 0.14, (rng() - 0.5) * d * 0.2);
  group.add(rug);

  // table with a lamp
  const tx = (rng() - 0.5) * w * 0.3;
  const tz = (rng() - 0.5) * d * 0.3;
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.85), trimMat);
  top.position.y = 0.78;
  table.add(top);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.75, 6), trimMat);
    leg.position.set(sx * 0.48, 0.375, sz * 0.34);
    table.add(leg);
  }
  table.position.set(tx, 0.12, tz);
  table.rotation.y = rng() * Math.PI;
  group.add(table);

  // chairs
  for (let i = 0; i < 2; i++) {
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.4), trimMat);
    seat.position.y = 0.45;
    chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.06), trimMat);
    back.position.set(0, 0.72, -0.18);
    chair.add(back);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.035, 0.45, 5), trimMat);
      leg.position.set(sx * 0.16, 0.22, sz * 0.15);
      chair.add(leg);
    }
    chair.position.set(tx + (rng() - 0.5) * 1.6, 0.12, tz + (rng() - 0.5) * 1.6);
    chair.rotation.y = rng() * Math.PI * 2;
    group.add(chair);
  }

  // cupboard against the back wall
  const cup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.45), trimMat);
  body.position.y = 0.85;
  cup.add(body);
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 0.05), cache.getWood(0x5c4430));
    door.position.set(s * 0.22, 0.9, 0.24);
    cup.add(door);
  }
  cup.position.set((rng() - 0.5) * (w - 1.4), 0.12, -d / 2 + 0.35);
  group.add(cup);

  // bed
  const bed = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 1.9), trimMat);
  frame.position.y = 0.16;
  bed.add(frame);
  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 0.2, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.95 })
  );
  mattress.position.y = 0.42;
  bed.add(mattress);
  const quilt = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 0.12, 1.15),
    new THREE.MeshStandardMaterial({ color: [0x9a5a4a, 0x5a6a8a, 0x6a7a5a][Math.floor(rng() * 3)], roughness: 1 })
  );
  quilt.position.set(0, 0.55, 0.32);
  bed.add(quilt);
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.16, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xf0eade, roughness: 1 })
  );
  pillow.position.set(0, 0.58, -0.66);
  bed.add(pillow);
  bed.position.set(w / 2 - 0.85, 0.12, (rng() - 0.5) * d * 0.4);
  bed.rotation.y = Math.PI / 2;
  group.add(bed);

  // shelf with jars
  const shelf = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.25), trimMat);
  shelf.add(board);
  const jarColors = [0x8a9a5a, 0xa05a4a, 0x5a7a8a, 0x9a8a4a];
  for (let i = 0; i < 4; i++) {
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: jarColors[i], roughness: 0.5 })
    );
    jar.position.set(-0.36 + i * 0.24, 0.11, 0);
    shelf.add(jar);
  }
  shelf.position.set(-w / 2 + 0.25, 1.5, (rng() - 0.5) * d * 0.4);
  shelf.rotation.y = Math.PI / 2;
  group.add(shelf);

  // hearth and a warm lamp light
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.55), cache.getStone());
  hearth.position.set(-w / 2 + 0.42, 0.54, d / 2 - 0.45);
  group.add(hearth);
  const embers = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff6020, emissiveIntensity: 1.6 })
  );
  embers.position.set(-w / 2 + 0.42, 0.75, d / 2 - 0.5);
  embers.scale.set(1, 0.6, 0.8);
  embers.userData.dynamic = true;
  group.add(embers);

  // hanging oil lamp above the table
  const lamp = new THREE.Group();
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), cache.getWood(0x3a3a3a));
  chain.position.y = 0.25;
  lamp.add(chain);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, 0.18, 8),
    new THREE.MeshStandardMaterial({
      color: 0xffe9b8, emissive: 0xffb851, emissiveIntensity: 1.8,
      transparent: true, opacity: 0.9, roughness: 0.3,
    })
  );
  lamp.add(glass);
  const lampTop = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.09, 8), cache.getWood(0x3a3a3a));
  lampTop.position.y = 0.13;
  lamp.add(lampTop);
  lamp.position.set(tx, h - 0.95, tz);
  group.add(lamp);

  // emitters for the shared light pool
  group.userData.emitters = [
    { position: new THREE.Vector3(tx, h - 1.05, tz), color: 0xffb060, intensity: 0, distance: 6 },
    { position: new THREE.Vector3(-w / 2 + 0.42, 0.75, d / 2 - 0.5), color: 0xff9040, intensity: 0, distance: 5 },
  ];
  return group;
}

// deterministic rng so a house always looks the same
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a solid roof shell with an attic void, so the camera never sees
// through the roof into the room and the walls never z-fight with it.
// The slope triangles are wound so their normals point outwards; getting
// that wrong makes the roof render as a black hole from the outside.
export function buildRoof(spec, roofMat, wallMat = null) {
  const group = new THREE.Group();
  const { w, d, h, roofH } = spec;
  const hw = w / 2 + 0.45;
  const hd = d / 2 + 0.45;
  const thick = 0.16;

  // Six vertices: the two eaves and the ridge, front and back.
  const v = [
    -hw, 0, -hd, // 0 left eave, back
    hw, 0, -hd,  // 1 right eave, back
    0, roofH, -hd, // 2 ridge, back
    -hw, 0, hd,  // 3 left eave, front
    hw, 0, hd,   // 4 right eave, front
    0, roofH, hd, // 5 ridge, front
  ];

  const build = (verts, indices) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const uv = [];
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      uv.push(pos.getX(i) * 0.35, pos.getZ(i) * 0.35 + pos.getY(i) * 0.35);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };

  // Outer shell: the two slopes. Winding gives outward normals.
  const outerIdx = [
    0, 5, 2, 0, 3, 5, // left slope
    1, 2, 5, 1, 5, 4, // right slope
  ];
  const outer = build(v, outerIdx);
  const shell = new THREE.Mesh(outer, roofMat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  // Inner shell, slightly smaller and wound the other way, so the attic is
  // a closed volume and the eaves show real thickness.
  const iw = hw - thick;
  const id = hd - thick;
  const irh = roofH - thick;
  const iv = [
    -iw, 0, -id,
    iw, 0, -id,
    0, irh, -id,
    -iw, 0, id,
    iw, 0, id,
    0, irh, id,
  ];
  const innerIdx = [
    0, 2, 5, 0, 5, 3, // left slope, reversed
    1, 5, 2, 1, 4, 5, // right slope, reversed
  ];
  const innerShell = new THREE.Mesh(build(iv, innerIdx), roofMat);
  group.add(innerShell);

  // Eaves boards close the gap between the two shells
  for (const s of [-1, 1]) {
    const eave = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, thick, thick), roofMat);
    eave.position.set(0, -thick / 2, s * (hd - thick / 2));
    group.add(eave);
    const eave2 = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, hd * 2), roofMat);
    eave2.position.set(s * (hw - thick / 2), -thick / 2, 0);
    group.add(eave2);
  }

  // Gable end walls: the triangle above the room, in the plaster colour.
  const gableMat = wallMat || roofMat;
  for (const s of [-1, 1]) {
    const g = new THREE.Mesh(new THREE.BufferGeometry(), gableMat);
    const gv = [
      -hw, 0, 0,
      hw, 0, 0,
      0, roofH, 0,
    ];
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3));
    gGeo.setIndex(s > 0 ? [0, 1, 2] : [0, 2, 1]);
    gGeo.computeVertexNormals();
    g.geometry = gGeo;
    g.castShadow = true;
    g.receiveShadow = true;
    g.position.set(0, 0, s * hd);
    group.add(g);
  }

  group.position.y = h;
  return group;
}
