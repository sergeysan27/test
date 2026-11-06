import * as THREE from 'three';
import { starTexture } from './textures.js';
import { clamp } from './util.js';

// ---------------------------------------------------------------------------
// Small living details: falling leaves, butterflies, water ripples and the
// wind that sways the trees. They are all cheap and only spawn around the
// player so the cost stays flat no matter how big the village is.
// ---------------------------------------------------------------------------

// A single leaf texture sheet with four leaf shapes.
function leafSheet() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  const colors = ['#c8862f', '#d9a03a', '#a8622a', '#b8863a'];
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(16 + (i % 2) * 32, 16 + Math.floor(i / 2) * 32);
    g.fillStyle = colors[i];
    g.beginPath();
    g.ellipse(0, 0, 11, 6, i * 0.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(80,50,20,0.6)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-11, 0);
    g.lineTo(11, 0);
    g.stroke();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Falling leaves: a pool of sprites that drift down around the player and
// are recycled when they reach the ground.
export function buildFallingLeaves(count = 90) {
  const tex = leafSheet();
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const rot = new Float32Array(count);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: tex },
      opacity: { value: 0.95 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aRot;
      varying vec2 vUv;
      varying float vRot;
      void main() {
        vUv = uv;
        vRot = aRot;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * 300.0 / max(-mv.z, 0.1);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      varying vec2 vUv;
      varying float vRot;
      void main() {
        // pick one of the four leaves from the sheet
        float quadrant = mod(floor(vRot), 4.0);
        vec2 uv = vUv;
        if (quadrant > 0.5) uv.x = fract(uv.x + 0.5);
        if (quadrant > 1.5) uv.y = fract(uv.y + 0.5);
        if (quadrant > 2.5) uv.x = fract(uv.x + 0.5);
        vec4 tex = texture2D(map, uv);
        if (tex.a < 0.2) discard;
        gl_FragColor = vec4(tex.rgb, tex.a * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  const leaves = [];
  for (let i = 0; i < count; i++) {
    leaves.push({
      x: 0, y: 0, z: 0,
      fall: 0.4 + Math.random() * 0.5,
      sway: 0.6 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      spin: Math.random() * Math.PI * 2,
      spinSpeed: 0.8 + Math.random() * 2.2,
      quad: Math.floor(Math.random() * 4),
      scale: 0.055 + Math.random() * 0.05,
    });
    pos[i * 3] = 0;
    pos[i * 3 + 1] = -999;
    pos[i * 3 + 2] = 0;
    size[i] = leaves[i].scale;
    rot[i] = leaves[i].quad;
  }
  points.userData.leaves = leaves;
  points.userData.spawned = false;
  return points;
}

export function updateLeaves(points, dt, time, center, groundHeight, strength = 1) {
  const leaves = points.userData.leaves;
  const pos = points.geometry.attributes.position;
  const rot = points.geometry.attributes.aRot;
  const arr = pos.array;

  // leaves only fall in the second half of autumn day, and stop in rain
  const target = strength;
  points.visible = target > 0.02;
  if (!points.visible) return;

  for (let i = 0; i < leaves.length; i++) {
    const l = leaves[i];
    if (l.y < -50) {
      // respawn above the player
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 22;
      l.x = center.x + Math.cos(a) * r;
      l.z = center.z + Math.sin(a) * r;
      l.y = groundHeight(l.x, l.z) + 7 + Math.random() * 8;
      continue;
    }
    const t = time * l.sway + l.phase;
    l.y -= l.fall * dt * target;
    l.x += Math.sin(t) * dt * 0.9;
    l.z += Math.cos(t * 0.7) * dt * 0.7;
    l.spin += l.spinSpeed * dt * target;
    const gy = groundHeight(l.x, l.z);
    if (l.y <= gy + 0.05) l.y = -60;
    arr[i * 3] = l.x;
    arr[i * 3 + 1] = l.y;
    arr[i * 3 + 2] = l.z;
    rot.array[i] = l.quad + (l.spin % 1);
  }
  pos.needsUpdate = true;
  rot.needsUpdate = true;
}

// Butterflies: little quads that flutter around the flower beds.
export function buildButterflies(count = 14) {
  const group = new THREE.Group();
  const wings = [];
  const colors = [0xf6c445, 0xe87fa8, 0x8fc4f0, 0xf0f0e8];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const color = colors[i % colors.length];
    const m = new THREE.MeshStandardMaterial({
      color, roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.95,
    });
    const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.22), m);
    wingL.position.x = -0.08;
    const wingR = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.22), m);
    wingR.position.x = 0.08;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.16, 5), new THREE.MeshBasicMaterial({ color: 0x3a3020 }));
    body.rotation.x = Math.PI / 2;
    b.add(wingL, wingR, body);
    b.scale.setScalar(0.9 + Math.random() * 0.5);
    group.add(b);
    wings.push({
      obj: b, wingL, wingR,
      cx: 0, cz: 0, radius: 2 + Math.random() * 4,
      height: 0.8 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.25 + Math.random() * 0.35,
      flap: 12 + Math.random() * 8,
    });
  }
  group.userData.butterflies = wings;
  return group;
}

export function updateButterflies(group, dt, time, hours, center) {
  const active = hours > 7 && hours < 19.5;
  group.visible = active;
  if (!active) return;
  for (const b of group.userData.butterflies) {
    const t = time * b.speed + b.phase;
    // drift slowly around the player so butterflies are always nearby
    b.cx += (center.x - b.cx) * Math.min(1, dt * 0.12);
    b.cz += (center.z - b.cz) * Math.min(1, dt * 0.12);
    const x = b.cx + Math.cos(t) * b.radius;
    const z = b.cz + Math.sin(t * 1.3) * b.radius;
    const y = b.height + Math.sin(t * 2.2) * 0.4;
    b.obj.position.set(x, y, z);
    b.obj.rotation.y = -t + Math.PI / 2;
    const flap = Math.sin(time * b.flap + b.phase);
    b.wingL.rotation.y = -flap * 0.9;
    b.wingR.rotation.y = flap * 0.9;
    b.wingL.rotation.z = flap * 0.4;
    b.wingR.rotation.z = -flap * 0.4;
  }
}

// Expanding rings on the pond surface.
export function buildRipples(count = 12) {
  const geo = new THREE.RingGeometry(0.55, 0.62, 24);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xd8ecff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  const rings = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat.clone());
    group.add(m);
    rings.push({ mesh: m, t: Math.random(), life: 2.4 + Math.random() * 1.6, x: 0, z: 0 });
  }
  group.userData.rings = rings;
  group.visible = false;
  return group;
}

export function updateRipples(group, dt, time, center, waterCenter, radius = 13) {
  const rings = group.userData.rings;
  for (const r of rings) {
    r.t += dt / r.life;
    if (r.t >= 1) {
      r.t = 0;
      // new ring somewhere on the pond
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * (radius - 1.5);
      r.x = waterCenter.x + Math.cos(a) * d;
      r.z = waterCenter.z + Math.sin(a) * d;
      r.life = 2.4 + Math.random() * 1.6;
    }
    const s = 0.4 + r.t * 2.6;
    r.mesh.position.set(r.x, 0.02, r.z);
    r.mesh.scale.setScalar(s);
    r.mesh.material.opacity = 0.28 * (1 - r.t) * (1 - r.t);
  }
}

// Wind that sways the trees. The tree mesh itself is instanced, so the sway
// is applied as a gentle rotation of the whole group plus a shader-free
// scale pulse on the crown - cheap, but it reads as wind.
export function applyTreeSway(treeGroup, time, strength = 1) {
  if (!treeGroup) return;
  const s = Math.sin(time * 0.7) * 0.006 + Math.sin(time * 1.9) * 0.003;
  treeGroup.rotation.z = s * strength;
  treeGroup.rotation.x = Math.cos(time * 0.53) * 0.005 * strength;
}

// Small drifting dust motes / pollen that catch the light.
export function buildMotes(count = 60) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const homes = [];
  for (let i = 0; i < count; i++) {
    homes.push({
      x: 0, y: 0, z: 0,
      phase: Math.random() * Math.PI * 2,
      speed: 0.2 + Math.random() * 0.4,
      radius: 0.6 + Math.random() * 2.2,
      height: 0.4 + Math.random() * 3.2,
      settled: false,
    });
    pos[i * 3 + 1] = -999;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // Same clamped-size shader as the fireflies so a mote close to the camera
  // never becomes a blinding blob.
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      map: { value: starTexture() },
      opacity: { value: 0.45 },
      pixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: `
      uniform float pixelRatio;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = max(-mv.z, 0.001);
        gl_PointSize = clamp(14.0 / dist, 1.0, 5.0) * pixelRatio;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      void main() {
        vec4 tex = texture2D(map, gl_PointCoord);
        if (tex.a < 0.05) discard;
        gl_FragColor = vec4(tex.rgb, tex.a * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.homes = homes;
  return points;
}

export function updateMotes(points, dt, time, center, groundHeight) {
  const homes = points.userData.homes;
  const pos = points.geometry.attributes.position;
  const arr = pos.array;
  for (let i = 0; i < homes.length; i++) {
    const h = homes[i];
    if (!h.settled) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 18;
      h.x = center.x + Math.cos(a) * r;
      h.z = center.z + Math.sin(a) * r;
      h.y = groundHeight(h.x, h.z) + h.height;
      h.settled = true;
    }
    const t = time * h.speed + h.phase;
    arr[i * 3] = h.x + Math.sin(t) * h.radius;
    arr[i * 3 + 1] = h.y + Math.sin(t * 1.7) * 0.35;
    arr[i * 3 + 2] = h.z + Math.cos(t * 0.9) * h.radius;
  }
  pos.needsUpdate = true;
}
