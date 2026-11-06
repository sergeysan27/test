import * as THREE from 'three';

// Every generated texture is a 128-512 pixel canvas that lives in GPU
// memory for the whole session. A village with sixteen houses would
// otherwise end up with hundreds of identical-looking textures, so the
// results are cached by their parameters.
const textureCache = new Map();

function cached(key, factory) {
  let tex = textureCache.get(key);
  if (!tex) {
    tex = factory();
    textureCache.set(key, tex);
  }
  return tex;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(c, repeat = 1) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function grassTexture(base = '#4f7a3c', repeat = 40) {
  return cached(`grass(${base},${repeat})`, () => {
  const size = 512;
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 2 + Math.random() * 5;
    const shade = Math.random();
    g.strokeStyle = shade > 0.6 ? 'rgba(140,180,100,0.35)' : 'rgba(40,66,32,0.4)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 3, y - len);
    g.stroke();
  }
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 16;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() > 0.5;
    grad.addColorStop(0, dark ? 'rgba(60,90,45,0.28)' : 'rgba(110,150,80,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(c, repeat);
  });
}

export function pathTexture() {
  return cached('path', () => {
  const size = 512;
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = '#8c8272';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 3.5;
    const v = Math.random();
    g.fillStyle = v > 0.5 ? 'rgba(170,160,140,0.5)' : 'rgba(105,96,82,0.5)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c, 1);
  });
}

export function plasterTexture(base = '#d9c9a8') {
  return cached(`plaster(${base})`, () => {
  const size = 256;
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(90,75,55,0.10)';
    g.fillRect(x, y, 2 + Math.random() * 6, 2 + Math.random() * 4);
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 22;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(120,100,72,0.13)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(c, 1);
  });
}

export function roofTexture(base = '#9c4a3c') {
  return cached(`roof(${base})`, () => {
  const size = 256;
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const rows = 10;
  const cols = 10;
  const rh = size / rows;
  const cw = size / cols;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const offset = (r % 2) * cw * 0.5;
      const x = col * cw + offset - cw;
      const y = r * rh;
      g.fillStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.14})`;
      g.fillRect(x, y, cw - 1, rh - 1);
      g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.08})`;
      g.fillRect(x, y + 1, cw - 2, 2);
    }
  }
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(x, y, 1, 1);
  }
  return toTexture(c, 1);
  });
}

export function woodTexture(base = '#6b4f36') {
  return cached(`wood(${base})`, () => {
  const size = 256;
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * size;
    g.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
    g.lineWidth = 0.6 + Math.random() * 2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) {
      g.lineTo(x, y + Math.sin(x * 0.06 + i) * 2.5);
    }
    g.stroke();
  }
  return toTexture(c, 1);
  });
}

export function leafTexture(base = '#3f6b35') {
  return cached(`leaf(${base})`, () => {
  const size = 256;
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 10;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(120,165,85,0.35)' : 'rgba(35,60,28,0.4)';
    g.beginPath();
    g.ellipse(x, y, r, r * 0.7, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c, 1);
  });
}

export function glowSprite(color = '#ffd9a0', softness = 0.55) {
  return cached(`glow(${color},${softness})`, () => {
  const size = 128;
  const c = canvas(size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(softness, 'rgba(255,200,130,0.35)');
  grad.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
  });
}

export function starTexture() {
  return cached('star', () => {
  const size = 64;
  const c = canvas(size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(220,235,255,0.6)');
  grad.addColorStop(1, 'rgba(200,220,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
  });
}

export function windowTexture() {
  return cached('window', () => {
  const size = 128;
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = '#2a2018';
  g.fillRect(0, 0, size, size);
  const grad = g.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size * 0.7);
  grad.addColorStop(0, '#ffe9b0');
  grad.addColorStop(0.6, '#f7b95e');
  grad.addColorStop(1, '#b96b2c');
  g.fillStyle = grad;
  g.fillRect(8, 8, size - 16, size - 16);
  g.strokeStyle = '#3a2b1e';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(size / 2, 8);
  g.lineTo(size / 2, size - 16);
  g.moveTo(8, size / 2);
  g.lineTo(size - 8, size / 2);
  g.stroke();
  g.strokeRect(8, 8, size - 16, size - 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
  });
}
