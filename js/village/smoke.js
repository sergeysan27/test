import * as THREE from 'three';

// A soft column of chimney smoke: stacked sprites that rise, drift and fade.
// The puffs are few on purpose - every sprite is a draw call, and a
// village full of chimneys adds up quickly.
export function buildSmoke(x, y, z, count = 4) {
  const group = new THREE.Group();
  const puffs = [];
  const tex = makePuffTexture();
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0xd8d4cc,
    }));
    s.position.set(x, y, z);
    s.scale.setScalar(0.6 + i * 0.22);
    s.visible = false;
    group.add(s);
    puffs.push({ sprite: s, offset: i / count, drift: (Math.random() - 0.5) * 0.9 });
  }
  group.userData.puffs = puffs;
  return group;
}

export function updateSmoke(group, dt, time, intensity = 1) {
  const puffs = group.userData?.puffs;
  if (!puffs) return;
  // when the chimney is cold there is nothing to draw
  const on = intensity > 0.06;
  for (const p of puffs) {
    const t = (time * 0.22 + p.offset) % 1;
    const s = p.sprite;
    if (!on) {
      s.visible = false;
      continue;
    }
    s.position.y += dt * (0.55 + t * 1.2);
    s.position.x += dt * (0.28 + p.drift * 0.4);
    s.position.z += dt * 0.12;
    const fade = Math.sin(t * Math.PI);
    s.material.opacity = fade * 0.24 * intensity;
    // a fully faded puff is not worth a draw call
    s.visible = s.material.opacity > 0.012;
    s.scale.setScalar((0.5 + t * 2.4) * (0.9 + p.offset * 0.3));
    if (t < 0.05) {
      s.position.y = s.userData.baseY ?? (s.userData.baseY = s.position.y);
    }
  }
}

function makePuffTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.45, 'rgba(240,238,232,0.35)');
  grad.addColorStop(1, 'rgba(230,228,222,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
