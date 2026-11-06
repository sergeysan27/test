import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Normalises a geometry so it can be merged with any other: identical
// attribute sets, same index state, no extra attributes.
function prepareForMerge(g) {
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  }
  // mixed indexed / non-indexed geometries cannot be merged: make them all
  // non-indexed so the attribute layout always matches
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  g.morphAttributes = {};
  g.groups = [];
  return g;
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

    let g = o.geometry.clone();
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
