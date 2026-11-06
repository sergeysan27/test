import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Normalises a geometry so it can be merged with any other: identical
// attribute sets, same index state, no extra attributes.
function prepareForMerge(g, { keepColor = false } = {}) {
  for (const name of Object.keys(g.attributes)) {
    const keep = name === 'position' || name === 'normal' || name === 'uv';
    if (!keep && !(keepColor && name === 'color')) g.deleteAttribute(name);
  }
  // mixed indexed / non-indexed geometries cannot be merged: make them all
  // non-indexed so the attribute layout always matches
  if (g.index) g = toNonIndexedSafe(g);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (keepColor && !g.attributes.color) {
    const count = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  }
  g.morphAttributes = {};
  g.groups = [];
  return g;
}

// toNonIndexed() drops the vertex colour when the geometry has one, so the
// colour is copied over by hand.
function toNonIndexedSafe(g) {
  const flat = g.toNonIndexed();
  if (g.attributes.color && !flat.attributes.color) {
    flat.setAttribute('color', g.attributes.color.clone());
  }
  return flat;
}

// Rewrites a group so that all static meshes sharing a material become a
// single merged mesh. Dramatically lowers the draw call count of the village.
//
// Meshes are merged in the group's local space, so the group can still be
// moved, rotated or scaled afterwards.
export function mergeStaticGroup(group, { keepNames = [], keepSubtrees = [] } = {}) {
  group.updateMatrixWorld(true);

  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const buckets = new Map();
  const removals = [];

  const isDynamic = (o) => {
    let p = o;
    while (p && p !== group) {
      if (p.userData?.dynamic) return true;
      if (keepSubtrees.includes(p)) return true;
      p = p.parent;
    }
    return false;
  };

  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (keepNames.includes(o.name)) return;
    if (Array.isArray(o.material)) return;
    if (o.userData.dynamic || isDynamic(o)) return;
    if (o.material.transparent && o.material.blending === THREE.AdditiveBlending) return;

    const key = o.material.uuid;
    if (!buckets.has(key)) {
      buckets.set(key, { material: o.material, geos: [], castShadow: false, receiveShadow: false });
    }
    const b = buckets.get(key);

    // The mesh has to be baked into the group's local space, otherwise every
    // merged part collapses onto the origin and the body disappears into the
    // ground.
    let g = o.geometry.clone();
    local.multiplyMatrices(inverse, o.matrixWorld);
    g.applyMatrix4(local);
    g = prepareForMerge(g);
    b.geos.push(g);
    b.castShadow = b.castShadow || o.castShadow;
    b.receiveShadow = b.receiveShadow || o.receiveShadow;
    removals.push(o);
  });

  for (const mesh of removals) {
    mesh.parent?.remove(mesh);
  }

  for (const b of buckets.values()) {
    if (!b.geos.length) continue;
    let geo;
    try {
      geo = mergeGeometries(b.geos, false);
    } catch {
      geo = null;
    }
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.castShadow = b.castShadow;
    mesh.receiveShadow = b.receiveShadow;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  return group;
}

// Rewrites a group so that all of its meshes become one mesh with the
// colours baked into the vertices. This is how the characters are built:
// a villager has about twenty little pieces (hat, brows, blush, nose...) and
// every one of them would otherwise cost a draw call, twice over once the
// shadow pass is counted.
//
// Materials that cannot be represented as a plain colour - emissive glass,
// transparent parts, metal - are left alone.
export function mergeToVertexColors(group, { keepSubtrees = [] } = {}) {
  group.updateMatrixWorld(true);

  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const geos = [];
  const removals = [];

  const skip = (o) => {
    let p = o;
    while (p && p !== group) {
      if (p.userData?.dynamic) return true;
      if (keepSubtrees.includes(p)) return true;
      p = p.parent;
    }
    return false;
  };

  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (Array.isArray(o.material)) return;
    if (skip(o)) return;
    const m = o.material;
    // only plain opaque standard materials can become a vertex colour
    if (!m.isMeshStandardMaterial) return;
    if (m.transparent || m.opacity < 1) return;
    if (m.emissive && m.emissive.getHex() !== 0) return;
    if (m.metalness > 0.15) return;

    let g = o.geometry.clone();
    local.multiplyMatrices(inverse, o.matrixWorld);
    g.applyMatrix4(local);
    g = prepareForMerge(g, { keepColor: true });
    // the colour has to be added after preparing, otherwise the helper
    // strips it as an unknown attribute
    const count = g.attributes.position.count;
    const col = new Float32Array(count * 3);
    const c = m.color;
    for (let i = 0; i < count; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
    removals.push(o);
  });

  if (!geos.length) return group;

  for (const mesh of removals) mesh.parent?.remove(mesh);

  let geo = null;
  try {
    geo = mergeGeometries(geos, false);
  } catch {
    geo = null;
  }
  if (!geo) {
    // the merge failed: put the originals back rather than losing the body
    for (const mesh of removals) group.add(mesh);
    return group;
  }

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

// Merges the children of a single group into one mesh with the colours baked
// into the vertices. Used for the head and the limbs of a character: the
// group itself keeps moving, only its contents are collapsed.
export function mergeChildrenToVertexColors(group) {
  const meshes = [];
  const removals = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (o === group) return;
    if (Array.isArray(o.material)) return;
    const m = o.material;
    if (!m.isMeshStandardMaterial && !m.isMeshBasicMaterial) return;
    if (m.transparent || m.opacity < 1) return;
    if (m.emissive && m.emissive.getHex() !== 0) return;
    if (m.metalness > 0.15) return;
    meshes.push(o);
    removals.push(o);
  });
  if (meshes.length < 2) return group;

  group.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const geos = [];

  for (const o of meshes) {
    let g = o.geometry.clone();
    local.multiplyMatrices(inverse, o.matrixWorld);
    g.applyMatrix4(local);
    g = prepareForMerge(g, { keepColor: true });
    const count = g.attributes.position.count;
    const col = new Float32Array(count * 3);
    const c = o.material.color;
    for (let i = 0; i < count; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }

  for (const mesh of removals) mesh.parent?.remove(mesh);

  let geo = null;
  try { geo = mergeGeometries(geos, false); } catch { geo = null; }
  if (!geo) {
    for (const mesh of removals) group.add(mesh);
    return group;
  }
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

// Merges many groups into one set of meshes per material. Used to collapse
// the whole static village into a handful of draw calls.
export function mergeAll(groups, { keepDynamic = true } = {}) {
  const buckets = new Map();
  const removals = [];
  const world = new THREE.Matrix4();
  const local = new THREE.Matrix4();

  for (const group of groups) {
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      if (Array.isArray(o.material)) return;
      if (o.userData.dynamic) return;
      if (o.material.transparent && o.material.blending === THREE.AdditiveBlending) return;

      const key = o.material.uuid;
      if (!buckets.has(key)) {
        buckets.set(key, { material: o.material, geos: [], castShadow: false, receiveShadow: false });
      }
      const b = buckets.get(key);

      let g = o.geometry.clone();
      world.copy(o.matrixWorld);
      g.applyMatrix4(world);
      g = prepareForMerge(g);
      b.geos.push(g);
      b.castShadow = b.castShadow || o.castShadow;
      b.receiveShadow = b.receiveShadow || o.receiveShadow;
      removals.push(o);
    });
  }

  for (const mesh of removals) {
    mesh.parent?.remove(mesh);
  }

  const out = new THREE.Group();
  out.name = 'merged-village';
  for (const b of buckets.values()) {
    if (!b.geos.length) continue;
    let geo;
    try {
      geo = mergeGeometries(b.geos, false);
    } catch {
      geo = null;
    }
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.castShadow = b.castShadow;
    mesh.receiveShadow = b.receiveShadow;
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  return out;
}

// Collapses the whole static village into a small number of meshes with the
// colours baked into the vertices.
//
// Merging by material leaves one mesh per material, and a village with
// sixteen houses has hundreds of them: hundreds of draw calls and hundreds
// of shader programs. Baking the colour into the vertices instead collapses
// the entire village into a couple of meshes.
export function mergeVillage(groups, { keepDynamic = true } = {}) {
  // Two passes: the plain surfaces collapse into one mesh with vertex
  // colours, the textured ones are merged per texture.
  const plainGeos = [];
  const textured = new Map();
  const removals = [];
  const world = new THREE.Matrix4();

  for (const group of groups) {
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      if (Array.isArray(o.material)) return;
      if (o.userData.dynamic) return;
      const m = o.material;
      // A little metalness is fine: the merged surface loses the shine, but
      // for a lamp post or a window frame nobody notices, and every mesh
      // that stays separate is a draw call in every frame.
      if (m.metalness > 0.5) return;
      // Transparent surfaces are merged as well, but they keep their own
      // material so they are still drawn after the opaque ones.
      const transparent = m.transparent || m.opacity < 1;

      let g = o.geometry.clone();
      world.copy(o.matrixWorld);
      g.applyMatrix4(world);

      if (m.map) {
        // a texture carries detail a vertex colour cannot: keep the
        // material and merge with the others that share it
        g = prepareForMerge(g);
        const key = m.uuid;
        if (!textured.has(key)) {
          textured.set(key, { material: m, geos: [], castShadow: false, receiveShadow: false });
        }
        const b = textured.get(key);
        b.geos.push(g);
        b.castShadow = b.castShadow || o.castShadow;
        b.receiveShadow = b.receiveShadow || o.receiveShadow;
      } else if (m.emissive && m.emissive.getHex() !== 0) {
        // glowing surfaces are merged with the others that share the same
        // material, so the whole village has a handful of window meshes
        // instead of one per house
        g = prepareForMerge(g);
        const key = m.uuid;
        if (!textured.has(key)) {
          textured.set(key, { material: m, geos: [], castShadow: false, receiveShadow: false });
        }
        const b = textured.get(key);
        b.geos.push(g);
        b.castShadow = b.castShadow || o.castShadow;
        b.receiveShadow = b.receiveShadow || o.receiveShadow;
      } else if (transparent) {
        // glass and other see-through bits: merged, but with the original
        // material so they keep their transparency
        g = prepareForMerge(g);
        const key = m.uuid;
        if (!textured.has(key)) {
          textured.set(key, { material: m, geos: [], castShadow: false, receiveShadow: false });
        }
        const b = textured.get(key);
        b.geos.push(g);
        b.castShadow = b.castShadow || o.castShadow;
        b.receiveShadow = b.receiveShadow || o.receiveShadow;
      } else {
        g = prepareForMerge(g, { keepColor: true });
        const count = g.attributes.position.count;
        const col = new Float32Array(count * 3);
        const c = m.color;
        for (let i = 0; i < count; i++) {
          col[i * 3] = c.r;
          col[i * 3 + 1] = c.g;
          col[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        plainGeos.push(g);
      }
      removals.push(o);
    });
  }

  if (!plainGeos.length && !textured.size) return new THREE.Group();

  for (const mesh of removals) mesh.parent?.remove(mesh);

  const out = new THREE.Group();
  out.name = 'merged-village';

  if (plainGeos.length) {
    let geo = null;
    try { geo = mergeGeometries(plainGeos, false); } catch { geo = null; }
    if (geo) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0,
      }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      out.add(mesh);
    }
  }

  for (const b of textured.values()) {
    if (!b.geos.length) continue;
    let geo = null;
    try { geo = mergeGeometries(b.geos, false); } catch { geo = null; }
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.castShadow = b.castShadow;
    mesh.receiveShadow = b.receiveShadow;
    mesh.matrixAutoUpdate = false;
    // the see-through parts are drawn after the solid ones
    if (b.material.transparent) mesh.renderOrder = 2;
    out.add(mesh);
  }
  return out;
}
