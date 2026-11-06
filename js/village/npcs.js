import * as THREE from 'three';
import { buildCharacter } from './props.js';
import { makeRng } from './util.js';
import { createContactShadow } from './shadows.js';

const NAMES = [
  ['Брат Антон', 'Хороший вечер, сосед. Слышал? Мельница опять скрипит — будто здоровается.'],
  ['Бабушка Оля', 'Иду я к колодцу за водой. Ночь уж близко, а днём жарко было.'],
  ['Тётушка Марфа', 'Кот у меня рыжий, как ты. Мурчит на коленях всю ночь.'],
  ['Девочка Аня', 'Мы собирали светлячков в банку! Мама сказала — выпусти, они по-другому не поймут.'],
  ['Дедушка Егор', 'Гав! То есть... я сторожу тут. Все спят — а я работаю.'],
  ['Дядя Гриша', 'Слышал, на той неделе в горах гроза была. Вот до сих пор гул стоит.'],
  ['Мастер Пётр', 'Столярничаю по вечерам. Пилить при луне — дело смирное.'],
  ['Странник Илья', 'Я из-за реки. Иду уже третий день. Здесь тихо. Хорошо.'],
  ['Тётушка Вера', 'Собираю травы на отвары. Ночью особенно.'],
  ['Мальчик Тимка', 'А у вас тут есть привидение? Мне сказали — есть! Вот это было бы интересно.'],
  ['Староста Пётр', 'Деревня наша — сто лет. Стоит. Никуда не денется.'],
  ['Прасковья', 'Поём мы о старом, о праздниках. Свадьбы, ярмарки... А нынче тихо стало.'],
];

const WANDER = [
  { x: 0, z: 0, r: 12 },
  { x: 9, z: 6, r: 6 },
  { x: -11, z: 5, r: 5 },
  { x: -34, z: -26, r: 9 },
  { x: 42, z: 30, r: 10 },
  { x: 30, z: -34, r: 9 },
  { x: 44, z: -6, r: 8 },
  { x: 4, z: -50, r: 10 },
  { x: -18, z: -50, r: 8 },
  { x: -46, z: 22, r: 7 },
  { x: 52, z: 12, r: 6 },
  { x: 18, z: 18, r: 7 },
];

const CHATTER = [
  ['Сегодня дым от пекарни пахнет особенно хорошо.', 'Заходите к нам на запах.'],
  ['В саду яблоки поспели. Сорвите, если хотите.', 'Только ветки не ломайте.'],
  ['Дорогу пересыпали, теперь не боюсь, что колёса застрянут.', 'Спасибо всем, кто помог.'],
  ['Ночью слышно, как светлячки собираются в саду.', 'Говорят, они ждут, пока их отпустят.'],
  ['У мельницы опять скрипит крыло. Старое, но живое.', 'Надо бы подтянуть верёвку.'],
  ['Я тут с прошлого лета. Понравилось.', 'Здесь никто не торопит.'],
  ['Пекарня открыта, заходите на чай.', 'Свежий хлеб, только из печи.'],
  ['На той неделе гроза была. Вот до сих пор гул стоит.', 'Говорят, это гора поёт.'],
  ['Колодец сегодня чистый. Вода — ледяная.', 'Берите с собой вёдра.'],
  ['Кот мой опять куда-то сбежал. Наверно, за светлячками.', 'Ругаю, а он только урчит.'],
  ['Свадьбу в следующем месяце играем. Вся улица пойдёт.', 'Гостиняк готовим с утра.'],
  ['Я столярничаю по вечерам. Пилить при луне — дело смирное.', 'Приходите, покажу, как делаю шкатулки.'],
];

// A daily routine: each villager has a place to be in the morning, at noon
// and in the evening. It gives the village a pulse - the plaza is busy at
// midday and empties out at night.
const SCHEDULE = [
  { from: 0, to: 6, place: 0 },      // asleep in their own house
  { from: 6, to: 11, place: 1 },     // morning: well, bench, the shops
  { from: 11, to: 16, place: 0 },    // midday: the plaza
  { from: 16, to: 20, place: 2 },    // afternoon: the orchard and the far end
  { from: 20, to: 24, place: 1 },    // evening: back to the lit streets
];

export function createNpcs(rng, layout, scene) {
  const npcs = [];
  for (let i = 0; i < NAMES.length; i++) {
    const [name, line] = NAMES[i];
    const isAnimal = false;
    const anchor = WANDER[i % WANDER.length];
    const extra = CHATTER[i % CHATTER.length];
    // Two of the villagers walk a dog; the rest are ordinary people.
    const withPet = name === 'Дедушка Егор';
    const spec = {
      name, line,
      lines: [line, ...extra],
      skinIdx: rng.int(0, 4),
      shirtIdx: rng.int(0, 6),
      pantsIdx: rng.int(0, 2),
      hairIdx: rng.int(0, 5),
      longHair: rng.chance(0.4),
      hat: rng.chance(0.35),
      hatColor: rng.pick([0x4a3a2a, 0x6a5a3a, 0x3a4a5a, 0x7a4a3a]),
      smile: rng.chance(0.75),
      scale: isAnimal ? 1 : rng.range(0.94, 1.06),
      lantern: rng.chance(0.35),
      basket: rng.chance(0.25),
      cat: false,
      dog: withPet,
      catColor: rng.pick([0x3a3a42, 0x8a6a3a, 0xd8d0c0, 0x2a2a2a]),
      dogColor: rng.pick([0xa07a4a, 0x4a3a2a, 0xd8d0c0]),
      petOffset: { x: rng.range(-0.7, 0.7), z: rng.range(-0.7, 0.7) },
      petScale: rng.range(0.9, 1.15),
      wander: anchor,
      // a second spot the villager drifts towards in the afternoon
      eveningAnchor: WANDER[(i + 5) % WANDER.length],
      speed: isAnimal ? rng.range(0.8, 1.4) : rng.range(0.7, 1.2),
      home: { x: anchor.x + rng.range(-3, 3), z: anchor.z + rng.range(-3, 3) },
      target: { x: anchor.x, z: anchor.z },
      phase: rng.next() * Math.PI * 2,
      id: i,
    };
    const obj = buildCharacter(spec);
    obj.position.set(spec.home.x, 0, spec.home.z);
    obj.rotation.y = rng.next() * Math.PI * 2;
    obj.userData.isNpc = true;
    const shadow = createContactShadow(isAnimal ? 0.5 : 0.6, 0.45);
    scene.add(shadow);
    obj.userData.shadow = shadow;
    npcs.push(obj);
  }
  return npcs;
}

// Picks the spot a villager should be heading to at the given hour.
function scheduleAnchor(spec, hours) {
  let slot = SCHEDULE[0];
  for (const s of SCHEDULE) if (hours >= s.from && hours < s.to) slot = s;
  if (slot.place === 1) return spec.wander;
  if (slot.place === 2) return spec.eveningAnchor;
  return { x: 0, z: 0, r: 9 };
}

export function updateNpcs(npcs, dt, time, terrainHeight, playerPos, collision, hours = 12) {
  for (const npc of npcs) {
    const spec = npc.userData.spec;
    const data = npc.userData;
    const speed = spec.speed;
    // the villager drifts towards the place that belongs to this hour
    const anchor = scheduleAnchor(spec, hours);
    const dx = spec.target.x - spec.home.x;
    const dz = spec.target.z - spec.home.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) {
      // pick a new target inside the zone that belongs to this hour
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * anchor.r;
      spec.target.x = anchor.x + Math.cos(a) * r;
      spec.target.z = anchor.z + Math.sin(a) * r;
      spec.home.x = spec.target.x;
      spec.home.z = spec.target.z;
    }
    const ang = Math.atan2(dx, dz);
    const move = Math.min(dist, speed * dt);
    let nx = npc.position.x + Math.sin(ang) * move;
    let nz = npc.position.z + Math.cos(ang) * move;

    // villagers walk around buildings instead of through them
    if (collision) {
      const fixed = collision.resolve(nx, nz, 0.45);
      if (Math.abs(fixed.x - nx) > 0.001 || Math.abs(fixed.z - nz) > 0.001) {
        // blocked: pick a new destination next time
        spec.home.x = fixed.x;
        spec.home.z = fixed.z;
        spec.target.x = fixed.x;
        spec.target.z = fixed.z;
      }
      nx = fixed.x;
      nz = fixed.z;
    }

    npc.position.x = nx;
    npc.position.z = nz;
    npc.rotation.y = dampAngle(npc.rotation.y, ang, 6, dt);
    npc.position.y = terrainHeight(npc.position.x, npc.position.z);
    const sh = data.shadow;
    if (sh) {
      sh.position.set(npc.position.x, npc.position.y + 0.04, npc.position.z);
      sh.updateMatrix();
    }

    // walk animation
    const parts = data.parts;
    const isAnimal = spec.cat || spec.dog;
    const w = Math.sin(time * 7 * speed + spec.phase);
    if (isAnimal) {
      const pet = data.pet;
      pet.position.y = Math.abs(Math.sin(time * 9 * speed + spec.phase)) * 0.06;
      if (data.petTail) data.petTail.rotation.z = Math.sin(time * 6 + spec.phase) * 0.5;
    } else {
      parts.legL.rotation.x = w * 0.55;
      parts.legR.rotation.x = -w * 0.55;
      parts.armL.rotation.x = -w * 0.42;
      parts.armR.rotation.x = w * 0.42;
      parts.body.position.y = Math.abs(w) * 0.045;
      parts.head.rotation.y = Math.sin(time * 0.6 + spec.phase) * 0.35;
    }
    // lantern swing
    if (data.lampGroup) {
      data.lampGroup.rotation.z = Math.sin(time * 3 + spec.phase) * 0.12;
    }
  }
}

export function npcLine(spec, hours) {
  const lines = spec.lines?.length ? spec.lines : [spec.line];
  const night = hours < 6 || hours > 19.6;
  const morning = hours >= 6 && hours < 11;
  const pool = [...lines];
  if (night) pool.push('Спите уже? А я не могу заснуть — слишком красиво.');
  if (morning) pool.push('Доброе утро! Слышите, как птицы поют?');
  if (night) pool.push('Ночью в деревне спит всё, кроме меня и светлячков.');
  return pool[Math.floor(Math.random() * pool.length)];
}

export function dampAngle(current, target, lambda, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}
