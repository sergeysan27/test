import * as THREE from 'three';

// Collision world for the village: solid buildings the player, the camera
// and the villagers cannot walk through.
export class CollisionWorld {
  constructor() {
    this.boxes = [];
  }

  // A rectangular obstacle in world space (axis aligned after rotation is
  // baked in by the caller).
  addBox(x, z, halfW, halfD, rot = 0, height = 4) {
    this.boxes.push({ x, z, halfW, halfD, rot, height, cos: Math.cos(rot), sin: Math.sin(rot) });
  }

  // Pushes a point out of every obstacle it overlaps.
  // Returns the corrected position.
  resolve(x, z, radius = 0.35) {
    let px = x;
    let pz = z;
    for (let iter = 0; iter < 3; iter++) {
      let hit = false;
      for (const b of this.boxes) {
        // to local space
        const dx = px - b.x;
        const dz = pz - b.z;
        const lx = dx * b.cos + dz * b.sin;
        const lz = -dx * b.sin + dz * b.cos;
        const ox = b.halfW + radius - Math.abs(lx);
        const oz = b.halfD + radius - Math.abs(lz);
        if (ox > 0 && oz > 0) {
          hit = true;
          // push out along the shallower axis
          let nx = 0, nz = 0;
          if (ox < oz) {
            nx = Math.sign(lx || 1) * ox;
          } else {
            nz = Math.sign(lz || 1) * oz;
          }
          // back to world space
          px += nx * b.cos - nz * b.sin;
          pz += nx * b.sin + nz * b.cos;
        }
      }
      if (!hit) break;
    }
    return { x: px, z: pz };
  }

  // True when the segment from a to b passes through any obstacle.
  // Used to keep the camera outside buildings.
  segmentBlocked(ax, ay, az, bx, by, bz, padding = 0.3) {
    for (const b of this.boxes) {
      if (this.segmentHitsBox(ax, ay, az, bx, by, bz, b, padding)) return true;
    }
    return false;
  }

  segmentHitsBox(ax, ay, az, bx, by, bz, b, padding) {
    // to local space of the box
    const lax = (ax - b.x) * b.cos + (az - b.z) * b.sin;
    const laz = -(ax - b.x) * b.sin + (az - b.z) * b.cos;
    const lbx = (bx - b.x) * b.cos + (bz - b.z) * b.sin;
    const lbz = -(bx - b.x) * b.sin + (bz - b.z) * b.cos;

    const minX = -b.halfW - padding, maxX = b.halfW + padding;
    const minZ = -b.halfD - padding, maxZ = b.halfD + padding;
    const minY = 0, maxY = b.height;

    // slab method
    const dx = lbx - lax;
    const dy = by - ay;
    const dz = lbz - laz;

    let tmin = 0;
    let tmax = 1;

    // slab method against the box bounds
    const axis = (p, q, lo, hi) => {
      if (Math.abs(p) < 1e-8) return q >= lo && q <= hi;
      const t1 = (lo - q) / p;
      const t2 = (hi - q) / p;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
      return tmax >= tmin;
    };

    if (!axis(dx, lax, minX, maxX)) return false;
    if (!axis(dy, ay, minY, maxY)) return false;
    if (!axis(dz, laz, minZ, maxZ)) return false;
    return tmax >= tmin && tmax >= 0 && tmin <= 1;
  }

  // Finds the closest free distance from `from` towards `to` so the camera
  // stops right before a wall instead of clipping through it.
  clampCamera(ax, ay, az, bx, by, bz, padding = 0.35) {
    const steps = 12;
    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      if (!this.segmentBlocked(ax, ay, az, x, y, z, padding)) {
        return { x, y, z, t };
      }
    }
    return { x: ax, y: ay, z: az, t: 0 };
  }

  // Finds a free camera spot by fanning out rays around the desired boom
  // direction. Instead of pulling the camera straight into the character
  // when a wall is in the way, it slides sideways around the obstacle.
  // Returns the closest workable position and the yaw offset that was used.
  resolveCameraBoom(ax, ay, az, bx, by, bz, padding = 0.35) {
    const direct = this.clampCamera(ax, ay, az, bx, by, bz, padding);
    if (direct.t >= 0.999) {
      return { x: bx, y: by, z: bz, t: 1, yaw: 0 };
    }
    // the boom is blocked: try to swing around the obstacle
    const dx = bx - ax;
    const dz = bz - az;
    const baseAngle = Math.atan2(dx, dz);
    const radius = Math.hypot(dx, dz);
    const height = by - ay;
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      for (const sign of [1, -1]) {
        const a = baseAngle + (sign * i * Math.PI) / steps;
        // shorten the boom a little so we clear the corner
        const r = radius * (1 - Math.min(0.35, i * 0.02));
        const x = ax + Math.sin(a) * r;
        const z = az + Math.cos(a) * r;
        const y = ay + height * (1 - Math.min(0.2, i * 0.012));
        if (!this.segmentBlocked(ax, ay, az, x, y, z, padding)) {
          return { x, y, z, t: r / radius, yaw: a - baseAngle };
        }
      }
    }
    return direct;
  }
}
