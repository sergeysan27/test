import * as THREE from 'three';
import { buildCharacter } from './props.js';
import { makeRng } from './util.js';
import { createContactShadow } from './shadows.js';

const NAMES = [
  ['Брат Антон', 'Хороший вечер, сосед. Слышал? Мельница опять скрипит — будто здоровается.'],
  ['Бабушка Оля', 'Иду я к колодцу за водой. Ночь уж близко, а днём жарко было.'],
  ['Кот Мурзик', 'Мяу.'],
  ['Девочка Аня', 'Мы собирали светлячков в банку! Мама сказала — выпусти, они по-другому не поймут.'],
  ['Пёс Шарик', 'Гав! Я сторожу тут. Все спят — а я работаю.'],
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

export function createNpcs(rng, layout, scene) {
  const npcs = [];
  for (let i = 0; i < NAMES.length; i++) {
    const [name, line] = NAMES[i];
    const isAnimal = name.startsWith('Кот') || name.startsWith('Пёс');
    const anchor = WANDER[i % WANDER.length];
    const extra = CHATTER[i % CHATTER.length];
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
      cat: name.startsWith('Кот'),
      dog: name.startsWith('Пёс'),
      catColor: rng.pick([0x3a3a42, 0x8a6a3a, 0xd8d0c0, 0x2a2a2a]),
      dogColor: rng.pick([0xa07a4a, 0x4a3a2a, 0xd8d0c0]),
      petOffset: { x: rng.range(-0.7, 0.7), z: rng.range(-0.7, 0.7) },
      petScale: rng.range(0.9, 1.15),
      wander: anchor,
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
export function updateNpcs(npcs, dt, time, terrainHeight, playerPos) {
  for (const npc of npcs) {
    const spec = npc.userData.spec;
    const data = npc.userData;
    const speed = spec.speed;
    const dx = spec.target.x - spec.home.x;
    const dz = spec.target.z - spec.home.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) {
      // pick new target in wander zone
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spec.wander.r;
      spec.target.x = spec.wander.x + Math.cos(a) * r;
      spec.target.z = spec.wander.z + Math.sin(a) * r;
      spec.home.x = spec.target.x;
      spec.home.z = spec.target.z;
    }
    const ang = Math.atan2(dx, dz);
    const move = Math.min(dist, speed * dt);
    npc.position.x += Math.sin(ang) * move;
    npc.position.z += Math.cos(ang) * move;
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
