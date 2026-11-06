import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Builds a wall panel with rectangular openings cut out of it.
// Openings are given in the panel's local space: x across the wall,
// y up from the wall base, and every hole has a width, height and centre.
export function buildWallWithHoles(width, height, thickness, holes = [], material) {
  const group = new THREE.Group();
  const segments = [];

  // Sort holes by x so the wall can be split into vertical strips
  const sorted = [...holes].sort((a, b) => a.x - b.x);

  let cursor = -width / 2;
  for (const hole of sorted) {
    const holeLeft = hole.x - hole.w / 2;
    const holeRight = hole.x + hole.w / 2;
    if (holeLeft > cursor) {
      // solid strip between the previous hole and this one
      const stripW = holeLeft - cursor;
      segments.push({ x: cursor + stripW / 2, y: height / 2, w: stripW, h: height });
    }
    // below and above the hole
    if (hole.y - hole.h / 2 > 0.01) {
      segments.push({
        x: hole.x,
        y: (hole.y - hole.h / 2) / 2,
        w: hole.w,
        h: hole.y - hole.h / 2,
      });
    }
    const above = height - (hole.y + hole.h / 2);
    if (above > 0.01) {
      segments.push({
        x: hole.x,
        y: hole.y + hole.h / 2 + above / 2,
        w: hole.w,
        h: above,
      });
    }
    cursor = holeRight;
  }
  if (cursor < width / 2 - 0.01) {
    const stripW = width / 2 - cursor;
    segments.push({ x: cursor + stripW / 2, y: height / 2, w: stripW, h: height });
  }

  const geos = [];
  for (const s of segments) {
    const g = new THREE.BoxGeometry(s.w, s.h, thickness);
    g.translate(s.x, s.y, 0);
    geos.push(g);
  }
  if (!geos.length) return group;

  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
