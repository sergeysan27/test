import * as THREE from 'three';
import { PLACES } from './world.js';

// ---------------------------------------------------------------------------
// Interactable places. Every one of them reacts to the E key when the player
// walks close enough, and a few of them open a small trade window.
// ---------------------------------------------------------------------------

export const INTERACT_DEFS = [
  {
    id: 'well',
    place: 'Колодец',
    label: 'Набрать воды',
    radius: 3.2,
    icon: '💧',
  },
  {
    id: 'bench',
    place: 'Скрипучая лавка',
    label: 'Отдохнуть',
    radius: 3.4,
    icon: '🪑',
  },
  {
    id: 'bonfire',
    label: 'Погреться у костра',
    radius: 3.4,
    icon: '🔥',
    x: 4.5,
    z: -4.5,
  },
  {
    id: 'church',
    place: 'Церковная площадь',
    label: 'Помолиться',
    radius: 5.0,
    icon: '🕯️',
  },
  {
    id: 'orchard',
    place: 'Яблоневый сад',
    label: 'Собрать яблоки',
    radius: 7.0,
    icon: '🍎',
  },
  {
    id: 'dock',
    place: 'Рыбацкая пристань',
    label: 'Поймать рыбу',
    radius: 4.5,
    icon: '🎣',
  },
  {
    id: 'bakery',
    place: 'Тёплая пекарня',
    label: 'Пекарня: купить и продать',
    radius: 4.0,
    icon: '🍞',
    shop: true,
  },
  {
    id: 'mill',
    place: 'Мельница',
    label: 'Мельница: купить муку',
    radius: 4.5,
    icon: '🌾',
    shop: 'mill',
  },
];

// Builds the world-space list of interactables from the village layout.
export function buildInteractables(layout, extra = []) {
  const list = [];
  for (const def of INTERACT_DEFS) {
    let x = def.x;
    let z = def.z;
    if (def.place) {
      const p = PLACES.find((q) => q.name === def.place);
      if (!p) continue;
      x = p.x;
      z = p.z;
    }
    list.push({
      ...def,
      position: new THREE.Vector3(x, 0, z),
    });
  }
  // every house can be entered: standing at the door lets you sleep
  for (const h of layout.houses) {
    const dx = Math.sin(h.rot) * (h.d / 2 + 1.6);
    const dz = Math.cos(h.rot) * (h.d / 2 + 1.6);
    list.push({
      id: `home-${h.index}`,
      label: 'Войти в дом и поспать',
      radius: 2.6,
      icon: '🏠',
      position: new THREE.Vector3(h.x + dx, 0, h.z + dz),
      house: h,
    });
  }
  for (const e of extra) list.push(e);
  return list;
}

// The closest interactable within reach of the player.
export function nearestInteractable(list, playerPos, ignore = null) {
  let best = null;
  let bestScore = Infinity;
  for (const it of list) {
    if (ignore && ignore.has(it.id)) continue;
    const d = Math.hypot(it.position.x - playerPos.x, it.position.z - playerPos.z);
    if (d > it.radius) continue;
    // prefer the one the player is looking at, but distance wins
    const score = d;
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

// The house the player can sleep in: the closest one to the plaza centre.
export function nearestHouse(layout, playerPos) {
  let best = null;
  let bestD = Infinity;
  for (const h of layout.houses) {
    const d = Math.hypot(h.x - playerPos.x, h.z - playerPos.z);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}
