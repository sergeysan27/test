import * as THREE from 'three';
import { starTexture } from './textures.js';

// A small flock of birds that circles over the village at dusk and dawn.
export function buildBirds(count = 12) {
  const group = new THREE.Group();
  const birds = [];
  const wingMat = new THREE.MeshBasicMaterial({ color: 0x2a2630, side: THREE.DoubleSide });

  for (let i = 0; i < count; i++) {
    const bird = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), wingMat);
    body.scale.set(0.7, 0.6, 1.8);
    bird.add(body);
    const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.1), wingMat);
    wingL.position.set(-0.09, 0.03, 0);
    wingL.rotation.x = -Math.PI / 2;
    bird.add(wingL);
    const wingR = wingL.clone();
    wingR.position.x = 0.09;
    bird.add(wingR);
    group.add(bird);
    birds.push({
      obj: bird,
      wingL, wingR,
      radius: 18 + Math.random() * 32,
      height: 12 + Math.random() * 14,
      speed: 0.12 + Math.random() * 0.12,
      phase: Math.random() * Math.PI * 2,
      flap: 8 + Math.random() * 5,
    });
  }
  group.userData.birds = birds;
  group.visible = false;
  return group;
}

export function updateBirds(group, dt, time, hours, center) {
  const active = (hours > 5.5 && hours < 8.5) || (hours > 17.5 && hours < 20.5);
  group.visible = active;
  if (!active) return;
  for (const b of group.userData.birds) {
    const t = time * b.speed + b.phase;
    const x = center.x + Math.cos(t) * b.radius;
    const z = center.z + Math.sin(t) * b.radius;
    const y = center.y + b.height + Math.sin(t * 2.1) * 1.6;
    b.obj.position.set(x, y, z);
    b.obj.rotation.y = -t + Math.PI / 2;
    b.obj.rotation.z = Math.sin(t * 2.1) * 0.15;
    const flap = Math.sin(time * b.flap + b.phase);
    b.wingL.rotation.z = flap * 0.85;
    b.wingR.rotation.z = -flap * 0.85;
  }
}

// Low ground mist that drifts across the village in the early morning.
export function buildGroundMist() {
  const count = 26;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const homes = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 70;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    pos[i * 3] = x;
    pos[i * 3 + 1] = 0.25 + Math.random() * 0.5;
    pos[i * 3 + 2] = z;
    homes.push({ x, z, phase: Math.random() * Math.PI * 2, speed: 0.15 + Math.random() * 0.25 });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 7,
    map: starTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    color: 0xd8e4f0,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.homes = homes;
  return points;
}

export function updateMist(points, dt, time, hours) {
  const amount = Math.max(
    1 - Math.min(1, Math.abs(hours - 6.2) / 1.8),
    1 - Math.min(1, Math.abs(hours - 5.2) / 1.8)
  );
  const target = amount * 0.22;
  points.material.opacity += (target - points.material.opacity) * Math.min(1, dt * 1.5);
  points.visible = points.material.opacity > 0.005;
  if (!points.visible) return;
  const pos = points.geometry.attributes.position;
  const arr = pos.array;
  const homes = points.userData.homes;
  for (let i = 0; i < homes.length; i++) {
    const h = homes[i];
    const t = time * h.speed + h.phase;
    arr[i * 3] = h.x + Math.sin(t) * 6;
    arr[i * 3 + 2] = h.z + Math.cos(t * 0.7) * 6;
  }
  pos.needsUpdate = true;
}
