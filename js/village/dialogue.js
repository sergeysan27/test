// Dialogue lines for the simulated villagers. The lines depend on what the
// villager is doing right now, on the hour of the day and on the weather,
// so talking to somebody always tells you something about the village right
// now.

const ACTIVITY_LINES = {
  work: [
    'Дело не ждёт. {job} — работа не переwait.',
  ],
  sleep: [
    'Мм… что? А, это ты. Я уже спать собирался.',
  ],
  eat: [
    'Спешу. Горячего хочется.',
  ],
  wash: [
    'Вода сегодня ледяная, руки немеют.',
  ],
  social: [
    'А, привет. Я тут по делу, по людским.',
  ],
  play: [
    'Отдыхаю. День-то какой выдался!',
  ],
  rest: [
    'Присяду на минутку. Ноги затекли.',
  ],
  market: [
    'На ярмарке заглянул. Там очередь!',
  ],
  dance: [
    'Хоровод собираем у костра. Подходи!',
  ],
  chore: [
    'Дел хватает. Деревня не убирает себя сама.',
  ],
  shelter: [
    'Дождь всё льёт. Ну и постой тут.',
  ],
};

const TRAIT_LINES = {
  sociable: ['Всё деревенское знаю. И всех знаю.'],
  tidy: ['У меня дома всё по полочкам. Проверено.'],
  lazy: ['Может, завтра? Нет, ну ладно…'],
  cheerful: ['Хороший день выдался! Правда хороший.'],
  gruff: ['Ну. Что ещё?'],
  dreamer: ['Я вот думаю… Про деревню, конечно.'],
  hardworking: ['Работать надо. Не сидеть.'],
  moody: ['Всё нормально. Просто не спрашивай.'],
};

const WEATHER_LINES = {
  clear: ['Погода хорошая, хоть на рынок сходить.'],
  rain: ['Дождь опять. Топтали дороги развезло.'],
  fog: ['В тумане и то моё, и это. Только колокол слышно.'],
};

const TIME_LINES = [
  { from: 0, to: 5, lines: ['Ты чего не спишь? Ну, доброй ночи.'] },
  { from: 5, to: 9, lines: ['Рано встаёшь. Или поздно лёг?', 'Утро нынче ясное, будто нарочно.'] },
  { from: 9, to: 13, lines: ['День в разгаре. Дел много.'] },
  { from: 13, to: 17, lines: ['После обеда дел поменьше. Вот и сбежался я.'] },
  { from: 17, to: 20, lines: ['Вечер золотой. День прожит — и ладно.'] },
  { from: 20, to: 24, lines: ['Ночь наступает. Светлячки уже пошли.'] },
];

const FRIEND_LINES = [
  'Рад тебя видеть. Правда рад.',
  'Я как раз про тебя вспоминал.',
  'Заходи, коли будешь. Всегда рады.',
];

const STRANGER_LINES = [
  'Мы, кажется, не знакомы. Здравствуй.',
  'Ты, наверное, не отсюда. Расскажешь?',
  'Приятно познакомиться.',
];

const FESTIVAL_LINES = [
  'Ну как, {festival}? Я весь день ждал!',
  'Говорят, в прошлый год было ещё лучше.',
];

const RUMOUR_LINES = [
  'Слышал? {rumour}',
  'Хочешь знать? {rumour}',
];

const RUMOURS = [
  'мельница опять скрипит, будто здоровается',
  'у колодца вода стала вкуснее',
  'в саду здоровая яблоки уродились',
  'ночью светлячки собираются у старой яблони',
  'на той неделе в горах гроза была',
  'где-то рядом волки воют, я слышал',
  'дедушка Егор клянчит, что видел сон про волков',
  'деревне сто лет, а она всё молодая',
];

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// Builds a line for a villager, using the live simulation state.
export function villagerLine(villager, world, hours, rand = Math.random) {
  const parts = [];

  // what they are doing right now
  const act = villager.activity;
  const actPool = ACTIVITY_LINES[act] ?? [];
  if (actPool.length) {
    let line = pick(actPool, rand);
    line = line.replace('{job}', villager.jobLabel || 'человек');
    parts.push(line);
  }

  // how they feel about the player (friendship is tracked by the world)
  const rel = world?.relationships;
  let friendship = 0;
  if (rel) {
    for (const [k, r] of rel) {
      const [x, y] = k.split('|').map(Number);
      if ((x === villager.id && y === 0) || (y === villager.id && x === 0)) {
        friendship = r.value;
      }
    }
  }
  if (friendship > 25) parts.push(pick(FRIEND_LINES, rand));
  else if (friendship > -25) parts.push(pick(STRANGER_LINES, rand));

  // the festival, if there is one
  if (world?.festival) {
    parts.push(pick(FESTIVAL_LINES, rand).replace('{festival}', world.festival.name));
  } else {
    // a rumour about the village
    if (rand() < 0.5) {
      parts.push(pick(RUMOUR_LINES, rand).replace('{rumour}', pick(RUMOURS, rand)));
    }
  }

  // the weather
  if (world?.weather?.kind && rand() < 0.45) {
    parts.push(pick(WEATHER_LINES[world.weather.kind] ?? [], rand));
  }

  // the hour
  for (const slot of TIME_LINES) {
    if (hours >= slot.from && hours < slot.to) {
      if (rand() < 0.5) parts.push(pick(slot.lines, rand));
      break;
    }
  }

  // their own personality
  if (rand() < 0.35) {
    parts.push(pick(TRAIT_LINES[villager.trait] ?? [], rand));
  }

  if (!parts.length) parts.push('Ну, здравствуй.');

  // join at most two parts, so the speech stays short
  return parts.slice(0, 2).join(' ');
}

// A short status line used in the HUD when you look at somebody.
export function villagerStatus(villager) {
  const act = villager.activity;
  const map = {
    work: 'работает', sleep: 'спит', eat: 'ест', wash: 'умывается',
    social: 'разговаривает', play: 'гуляет', rest: 'отдыхает',
    market: 'на ярмарке', dance: 'танцует', chore: 'по делу', shelter: 'ждёт', idle: 'стоит',
  };
  return map[act] ?? 'стоит';
}
