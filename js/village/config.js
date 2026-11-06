export const WORLD = {
  seed: 20261106,
  size: 190,
  groundRadius: 92,
  houseCount: 16,
  treeCount: 190,
  lampCount: 14,
  npcCount: 12,
};

export const TIME_PHASES = [
  { at: 0.0, key: 'night', label: 'Ночь' },
  { at: 5.0, key: 'dawn', label: 'Рассвет' },
  { at: 7.5, key: 'morning', label: 'Утро' },
  { at: 11.0, key: 'day', label: 'День' },
  { at: 16.5, key: 'afternoon', label: 'После полудня' },
  { at: 18.6, key: 'dusk', label: 'Сумерки' },
  { at: 20.4, key: 'evening', label: 'Вечер' },
  { at: 22.4, key: 'night', label: 'Ночь' },
  { at: 24.0, key: 'night', label: 'Ночь' },
];

export function phaseForTime(hours) {
  let label = TIME_PHASES[0].label;
  let key = TIME_PHASES[0].key;
  for (const p of TIME_PHASES) {
    if (hours >= p.at) {
      label = p.label;
      key = p.key;
    }
  }
  return { label, key };
}

// Sky/light keyframes: hour -> colors
export const SKY_KEYS = [
  { h: 0, top: 0x080d1c, bottom: 0x121a2e, sun: 0x2a3a63, fog: 0x0b1020, amb: 0x3d4f7d, ambI: 0.42 },
  { h: 5, top: 0x1d2747, bottom: 0x5a4560, sun: 0x7a5c7a, fog: 0x28304a, amb: 0x4d5580, ambI: 0.5 },
  { h: 6.8, top: 0x5b83b8, bottom: 0xf0a06a, sun: 0xffb277, fog: 0xc9a68d, amb: 0x8b8fa8, ambI: 0.7 },
  { h: 9, top: 0x7fb2e0, bottom: 0xbfe0f0, sun: 0xfff1d0, fog: 0xc6dced, amb: 0xa8bcd4, ambI: 0.9 },
  { h: 13, top: 0x74aade, bottom: 0xcbe6f2, sun: 0xfffbe8, fog: 0xcfe4ef, amb: 0xb6c9dc, ambI: 1.0 },
  { h: 16.5, top: 0x6f9fd0, bottom: 0xf3c48c, sun: 0xffd9a0, fog: 0xdcc4a6, amb: 0xa8b0c2, ambI: 0.85 },
  { h: 18.6, top: 0x3c4c86, bottom: 0xe08a5c, sun: 0xff9a52, fog: 0x8c6e7e, amb: 0x6d70a0, ambI: 0.62 },
  { h: 19.8, top: 0x222f5e, bottom: 0x8a4f6b, sun: 0xd8654f, fog: 0x4a3d5c, amb: 0x51598c, ambI: 0.5 },
  { h: 21.2, top: 0x0f1733, bottom: 0x2c2a4a, sun: 0x5a4a78, fog: 0x1e2038, amb: 0x3f4a78, ambI: 0.44 },
  { h: 24, top: 0x080d1c, bottom: 0x121a2e, sun: 0x2a3a63, fog: 0x0b1020, amb: 0x3d4f7d, ambI: 0.42 },
];

export function lerpHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function skyStateFor(hours) {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].h <= h) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[Math.min(i + 1, SKY_KEYS.length - 1)];
  const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
  return {
    top: lerpHex(a.top, b.top, t),
    bottom: lerpHex(a.bottom, b.bottom, t),
    sun: lerpHex(a.sun, b.sun, t),
    fog: lerpHex(a.fog, b.fog, t),
    amb: lerpHex(a.amb, b.amb, t),
    ambI: a.ambI + (b.ambI - a.ambI) * t,
  };
}

export const PALETTE = {
  grass: [0x4f7a3c, 0x5d8a44, 0x446b35, 0x6b9750],
  path: [0x8c8272, 0x9a8f7c],
  roof: [0x9c4a3c, 0x7d4438, 0x5c6b74, 0x8a6a45, 0x6a5a7a],
  wall: [0xd9c9a8, 0xe0d3b4, 0xcbb894, 0xc2b6a0, 0xd3c3a4],
  wood: [0x6b4f36, 0x7a5b3e, 0x5c4430],
  leaf: [0x3f6b35, 0x4c7c3d, 0x365c2e, 0x588a42],
  trunk: [0x5a4331, 0x4b3928],
  water: 0x2f5a72,
  night: 0x0b1020,
};
