import { clamp, lerp } from './util.js';

// ---------------------------------------------------------------------------
// The living world.
//
// Everything in this file runs on a fixed tick that is completely independent
// of the render loop. The renderer only *reads* the state that this module
// produces, which means:
//
//   * the village keeps breathing while the tab is in the background
//   * the village keeps breathing while the game is closed - on the next
//     launch the world catches up on everything it missed, in fast-forward
//   * the simulation is deterministic, so the same inputs always produce the
//     same world
//
// The world is deliberately a plain data structure (no Three.js) so it can be
// serialised to JSON and stored, and so it can run headlessly.
// ---------------------------------------------------------------------------

// The world is stepped on a fixed tick. The tick has to be short enough
// that the villagers move smoothly - a tenth of a second is enough for
// the movement to look continuous, while the decisions themselves are
// still made far more rarely (see planTicks in the world).
export const TICK = 0.1;            // seconds of real time per world tick
export const HOURS_PER_TICK = 0.02; // in-game hours that pass per tick
export const MAX_CATCHUP_TICKS = 60000;

// How much world time passes for one second of real time while the player
// is watching: 0.05 h per tick / 0.25 s per tick = 0.2 h per second, so one
// in-game day takes about 12 real minutes.
export const LIVE_RATE = HOURS_PER_TICK / TICK;

// While the player is away the village keeps exactly the same rhythm it has
// while you are watching: one real hour away is twelve in-game hours. It is
// capped at three in-game days, so a long absence never buries you in
// hundreds of village days.
export const OFFLINE_RATE = LIVE_RATE;
export const MAX_OFFLINE_HOURS = 72;

// ---- villager personalities ------------------------------------------------

export const TRAITS = [
  { key: 'sociable', label: 'общительный', social: 0.9, work: 0.5, rest: 0.5, food: 0.6 },
  { key: 'tidy', label: 'аккуратный', social: 0.4, work: 0.9, rest: 0.6, food: 0.5 },
  { key: 'lazy', label: 'ленивый', social: 0.6, work: 0.2, rest: 0.9, food: 0.7 },
  { key: 'cheerful', label: 'весёлый', social: 0.8, work: 0.6, rest: 0.5, food: 0.8 },
  { key: 'gruff', label: ' угрюмый', social: 0.2, work: 0.8, rest: 0.5, food: 0.4 },
  { key: 'dreamer', label: 'мечтатель', social: 0.6, work: 0.4, rest: 0.7, food: 0.6 },
  { key: 'hardworking', label: 'трудолюбивый', social: 0.5, work: 1.0, rest: 0.4, food: 0.5 },
  { key: 'moody', label: 'капризный', social: 0.45, work: 0.6, rest: 0.6, food: 0.55 },
];

export const JOBS = [
  { key: 'baker', label: 'пекарь', place: 'Тёплая пекарня', needs: ['flour', 'bread'] },
  { key: 'miller', label: 'мельник', place: 'Мельница', needs: ['flour'] },
  { key: 'fisher', label: 'рыбак', place: 'Рыбацкая пристань', needs: ['fish'] },
  { key: 'gardener', label: 'садовник', place: 'Яблоневый сад', needs: ['apple'] },
  { key: 'carpenter', label: 'плотник', place: 'Тихая аллея', needs: [] },
  { key: 'shepherd', label: 'пастух', place: 'Тихая аллея', needs: [] },
  { key: 'smith', label: 'кузнец', place: 'Церковная площадь', needs: [] },
  { key: 'herbalist', label: 'травница', place: 'Яблоневый сад', needs: ['apple'] },
  { key: 'postman', label: 'почтальон', place: 'Центральная площадь', needs: [] },
  { key: 'nurse', label: 'лекарь', place: 'Колодец', needs: [] },
];

export const VILLAGER_NAMES = [
  'Брат Антон', 'Бабушка Оля', 'Тётушка Марфа', 'Девочка Аня', 'Дедушка Егор',
  'Дядя Гриша', 'Мастер Пётр', 'Странник Илья', 'Тётушка Вера', 'Мальчик Тимка',
  'Староста Пётр', 'Прасковья',
];

// ---- world places ----------------------------------------------------------

// Named places the villagers can walk to. `weight` is how likely they are to
// pick this place when several options are equally attractive.
export const SPOTS = [
  { id: 'plaza', name: 'Центральная площадь', x: 0, z: 0, r: 12, tags: ['social', 'work'] },
  { id: 'well', name: 'Колодец', x: 9, z: 6, r: 5, tags: ['chore'] },
  { id: 'bench', name: 'Скрипучая лавка', x: -11, z: 5, r: 5, tags: ['rest', 'social'] },
  { id: 'mill', name: 'Мельница', x: -34, z: -26, r: 8, tags: ['work'] },
  { id: 'dock', name: 'Рыбацкая пристань', x: 42, z: 30, r: 9, tags: ['work'] },
  { id: 'church', name: 'Церковная площадь', x: 30, z: -34, r: 9, tags: ['rest', 'social'] },
  { id: 'bakery', name: 'Тёплая пекарня', x: 44, z: -6, r: 7, tags: ['work', 'trade'] },
  { id: 'orchard', name: 'Яблоневый сад', x: 4, z: -50, r: 10, tags: ['work'] },
  { id: 'alley', name: 'Тихая аллея', x: -18, z: -50, r: 8, tags: ['rest', 'work'] },
  { id: 'redhouse', name: 'Дом с красной крышей', x: -46, z: 22, r: 7, tags: ['rest'] },
  { id: 'river', name: 'Тропа к реке', x: 52, z: 12, r: 6, tags: ['chore', 'rest'] },
  { id: 'bonfire', name: 'Костёр', x: 4.5, z: -4.5, r: 4, tags: ['social', 'rest'] },
];

export function spotById(id) {
  return SPOTS.find((s) => s.id === id) || SPOTS[0];
}

// ---- the world -------------------------------------------------------------

export class World {
  constructor(options = {}) {
    this.seed = options.seed ?? 20261106;
    this.time = options.time ?? 19.6 * 60; // absolute in-game minutes
    this.day = options.day ?? 1;
    this.tickCount = 0;
    // when the last tick happened, so the renderer can interpolate
    this.lastTickAt = Date.now();

    this.villagers = [];
    this.relationships = new Map();   // "a|b" -> { value, meetings }
    this.chronicle = [];              // the village diary, newest first
    this.market = { bread: 4, apple: 6, fish: 3, flour: 5, water: 99 };
    this.stock = { bread: 12, apple: 20, fish: 8, flour: 10 };
    this.weather = { kind: 'clear', since: 0, next: 'clear', nextIn: 6 };
    this.season = 'autumn';
    this.festival = null;             // { name, until, kind }
    this.nextFestivalDay = 4;
    this.weatherTimer = 0;
    this.rngState = options.rngState ?? this.seed;

    if (!options.villagers) this.createVillagers();
  }

  // A small deterministic RNG so the world can be replayed exactly.
  rand() {
    // xorshift32
    let x = this.rngState | 0;
    x ^= x << 13; x |= 0;
    x ^= x >>> 17;
    x ^= x << 5; x |= 0;
    this.rngState = x >>> 0;
    return this.rngState / 4294967296;
  }

  range(a, b) { return a + this.rand() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
  chance(p) { return this.rand() < p; }

  get hours() { return (this.time / 60) % 24; }
  get minuteOfDay() { return this.time % 60; }

  createVillagers() {
    this.villagers = VILLAGER_NAMES.map((name, i) => {
      const trait = TRAITS[i % TRAITS.length];
      const job = JOBS[i % JOBS.length];
      const home = SPOTS[(i * 3 + 2) % SPOTS.length];
      return {
        id: i,
        name,
        trait: trait.key,
        traitData: trait,
        job: job.key,
        jobLabel: job.label,
        workSpot: spotById(job.place),
        homeSpot: home,
        // needs, 0..100
        hunger: this.range(55, 90),
        energy: this.range(55, 95),
        social: this.range(40, 85),
        fun: this.range(40, 85),
        hygiene: this.range(50, 95),
      // behaviour
      activity: 'idle',
      targetSpot: 'plaza',
      targetX: 0,
      targetZ: 0,
      x: 0,
      z: 0,
      // walking speed in units per second - a little slower than the
      // player, so the villagers look like they are going about their day
      speed: this.range(1.4, 2.0),
      // each villager has its own favourite haunts
      socialSpot: this.pick(['plaza', 'plaza', 'bonfire', 'bench', 'church', 'orchard']),
      eatSpot: this.pick(['bakery', 'plaza', 'bakery', 'well']),
      playSpot: this.pick(['orchard', 'river', 'orchard', 'plaza']),
      choreSpot: this.pick(['bench', 'well', 'river']),
      restSpot: this.pick(['church', 'bench', 'alley', 'river']),
      marketSpot: this.pick(['plaza', 'plaza', 'bakery']),
      planTicks: 0,
        // social
        talkTo: null,
        talkTimer: 0,
        mood: 'neutral',
        // memory of recent things
        lastEvent: '',
        visits: {},
      };
    });
    // scatter them around the plaza to begin with, and give everybody
    // something to do right away
    for (const v of this.villagers) {
      const a = this.rand() * Math.PI * 2;
      const r = this.rand() * 10;
      v.x = Math.cos(a) * r;
      v.z = Math.sin(a) * r;
      v.targetX = v.x;
      v.targetZ = v.z;
    }
    // let everybody make their first decision straight away
    for (const v of this.villagers) {
      const act = this.chooseActivity(v);
      v.activity = act;
      const spot = this.spotFor(v, act);
      v.targetSpot = spot.id;
      const a = this.rand() * Math.PI * 2;
      const r = this.rand() * spot.r;
      v.targetX = spot.x + Math.cos(a) * r;
      v.targetZ = spot.z + Math.sin(a) * r;
      v.planTicks = this.int(24, 70);
    }
  }

  // ---- relationships ------------------------------------------------------

  relKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  relation(a, b) {
    const k = this.relKey(a, b);
    let r = this.relationships.get(k);
    if (!r) {
      r = { value: 0, meetings: 0, lastMet: -999 };
      this.relationships.set(k, r);
    }
    return r;
  }

  adjustRelation(a, b, delta) {
    const r = this.relation(a, b);
    r.value = clamp(r.value + delta, -100, 100);
    return r;
  }

  friendsOf(id) {
    const out = [];
    for (const [k, r] of this.relationships) {
      const [x, y] = k.split('|').map(Number);
      if (x !== id && y === id && r.value > 35) out.push(x);
      if (y !== id && x === id && r.value > 35) out.push(x);
    }
    return out;
  }

  // ---- chronicle ----------------------------------------------------------

  log(text, kind = 'plain') {
    this.chronicle.unshift({
      text,
      kind,
      day: this.day,
      time: Math.floor(this.hours),
      minute: Math.floor(this.minuteOfDay),
    });
    if (this.chronicle.length > 120) this.chronicle.pop();
  }

  // ---- calendar -----------------------------------------------------------

  get clockString() {
    const h = Math.floor(this.hours) % 24;
    const m = Math.floor(this.minuteOfDay);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get isNight() { return this.hours < 5.5 || this.hours > 20; }

  // ---- the tick -----------------------------------------------------------

  // Advances the world by one fixed tick. This is the only place where the
  // world changes; the renderer just observes the result.
  step() {
    this.tickCount++;
    this.lastTickAt = Date.now();
    // Remember where everybody was before this tick, so the renderer can
    // draw them smoothly in between two ticks instead of jumping.
    for (const v of this.villagers) {
      v.prevX = v.x;
      v.prevZ = v.z;
    }
    this.time += HOURS_PER_TICK * 60;
    const prevDay = this.day;
    if (this.time >= 24 * 60) {
      this.time -= 24 * 60;
      this.day += 1;
      this.onNewDay();
    }
    this.updateWeather();
    this.updateFestival();
    this.updateVillagers();
    this.updateSocial();
    this.updateEconomy();
    return this.day !== prevDay;
  }

  onNewDay() {
    this.log(`Наступил ${this.day}-й день.`, 'day');
    // everybody wakes up a bit happier
    for (const v of this.villagers) {
      v.energy = clamp(v.energy + 45, 0, 100);
      v.hunger = clamp(v.hunger - 25, 5, 100);
      v.hygiene = clamp(v.hygiene - 30, 5, 100);
      v.fun = clamp(v.fun + 20, 0, 100);
      v.activity = 'idle';
    }
    // the market restocks
    this.stock.bread += this.int(4, 9);
    this.stock.apple += this.int(3, 8);
    this.stock.fish += this.int(2, 6);
    this.stock.flour += this.int(2, 6);
    // a festival now and then
    if (this.day >= this.nextFestivalDay) {
      this.planFestival();
    }
  }

  planFestival() {
    const kinds = [
      { kind: 'market', name: 'Ярмарка', text: 'На площади развернули ярмарку. Торговцы уже расставляют товар.' },
      { kind: 'dance', name: 'Хоровод', text: 'Вечером у костра соберутся на хоровод. Музыканты настраивают скрипку.' },
      { kind: 'fair', name: 'Праздник урожая', text: 'Праздник урожая: пекут пироги, вяжут венки из колосьев.' },
      { kind: 'fair', name: 'Проводы лета', text: 'Проводы лета: зажигают костры на берегу и пускают бумажных фонариков.' },
    ];
    const f = this.pick(kinds);
    this.festival = { ...f, until: this.time + 6 * 60, day: this.day };
    this.nextFestivalDay = this.day + this.int(3, 7);
    this.log(`${f.name}: ${f.text}`, 'festival');
  }

  updateFestival() {
    if (this.festival && this.time >= this.festival.until) {
      this.log(`${this.festival.name} закончился. Площадь снова пуста.`, 'festival');
      this.festival = null;
    }
  }

  updateWeather() {
    this.weatherTimer += HOURS_PER_TICK;
    if (this.weatherTimer < this.weather.nextIn) return;
    this.weatherTimer = 0;
    // the weather rolls over
    const roll = this.rand();
    const next = roll < 0.55 ? 'clear' : roll < 0.82 ? 'rain' : 'fog';
    if (next !== this.weather.kind) {
      this.weather.kind = next;
      this.weather.nextIn = this.range(3, 10);
      const labels = { clear: 'Небо прояснилось', rain: 'Начался дождь', fog: 'Опустился туман' };
      this.log(labels[next], 'weather');
      // rain makes everybody grumpier and drives them indoors
      for (const v of this.villagers) {
        v.mood = next === 'rain' ? 'grumpy' : next === 'fog' ? 'quiet' : 'happy';
      }
    } else {
      this.weather.nextIn = this.range(3, 10);
    }
  }

  // Picks what a villager should be doing right now, based on needs,
  // the hour of day and the weather.
  chooseActivity(v) {
    const h = this.hours;
    const night = this.isNight;
    const rain = this.weather.kind === 'rain';

    // hard needs first
    if (v.energy < 22) return 'sleep';
    if (v.hunger < 25) return 'eat';
    // after midnight people sleep, in the small hours they really sleep
    if (night && (h >= 21 || h < 6)) return 'sleep';
    if (rain && this.chance(0.7)) return 'shelter';
    if (v.hygiene < 20) return 'wash';

    // festival time: everybody gathers
    if (this.festival && this.festival.kind === 'market') {
      if (v.traitData.social > 0.5 && this.chance(0.6)) return 'market';
    }
    if (this.festival && this.festival.kind === 'dance' && h > 18) {
      return 'dance';
    }

    // scoring: each candidate is scored, the best one wins. The scores are
    // balanced so that a day contains work, meals, rest and company in
    // believable proportions instead of one activity swallowing the day.
    const hungry = v.hunger < 55;
    const tired = v.energy < 55;
    const lonely = v.social < 55;
    const bored = v.fun < 55;
    const dirty = v.hygiene < 55;

    const candidates = [
      {
        act: 'work',
        score: v.traitData.work * 0.7 + (h > 7 && h < 18 ? 0.55 : -0.3) + (tired ? -0.6 : 0),
      },
      {
        act: 'social',
        score: v.traitData.social * 0.5 + (lonely ? 0.5 : -0.15) + (h > 10 && h < 20 ? 0.2 : -0.2),
      },
      {
        act: 'rest',
        score: v.traitData.rest * 0.5 + (tired ? 0.75 : -0.25),
      },
      {
        act: 'play',
        score: v.traitData.social * 0.3 + (bored ? 0.7 : -0.3) + (h > 9 && h < 20 ? 0.25 : -0.3),
      },
      {
        act: 'chore',
        score: v.traitData.work * 0.3 + (dirty ? 0.7 : -0.45),
      },
      {
        act: 'eat',
        score: hungry ? 0.8 : -0.6,
      },
    ];
    // a little randomness so nobody is a perfect clock
    for (const c of candidates) c.score += this.rand() * 0.5;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].act;
  }

  spotFor(v, activity) {
    // every villager has their own favourite corner of the village, so the
    // plaza never fills up with everybody standing in one spot
    const own = (id) => spotById(id);
    switch (activity) {
      case 'work': return v.workSpot;
      case 'sleep': return v.homeSpot;
      case 'eat': return own(v.eatSpot || 'bakery');
      case 'wash': return own('well');
      case 'market': return own(v.marketSpot || 'plaza');
      case 'dance': return own('bonfire');
      case 'social': return own(v.socialSpot || 'plaza');
      case 'play': return own(v.playSpot || 'orchard');
      case 'chore': return own(v.choreSpot || 'bench');
      case 'rest': return own(v.restSpot || 'church');
      case 'shelter': return v.homeSpot;
      case 'greet': return spotById('plaza');
      default: return own('plaza');
    }
  }

  updateVillagers() {
    for (const v of this.villagers) {
      // needs drift
      v.hunger = clamp(v.hunger - 0.022 - (this.isNight ? 0 : 0.005), 0, 100);
      v.energy = clamp(v.energy - (v.activity === 'sleep' ? -0.22 : 0.03), 0, 100);
      v.social = clamp(v.social - 0.024, 0, 100);
      v.fun = clamp(v.fun - 0.02, 0, 100);
      v.hygiene = clamp(v.hygiene - 0.02, 0, 100);

      // decide, but not every tick: a villager keeps their plan for a while
      // so they look purposeful instead of dithering
      v.planTicks = (v.planTicks ?? 0) - 1;
      if (!v.activity || v.activity === 'idle' || v.planTicks <= 0) {
        const act = this.chooseActivity(v);
        if (act !== v.activity) {
          v.activity = act;
          const spot = this.spotFor(v, act);
          v.targetSpot = spot.id;
          const a = this.rand() * Math.PI * 2;
          const r = this.rand() * spot.r;
          v.targetX = spot.x + Math.cos(a) * r;
          v.targetZ = spot.z + Math.sin(a) * r;
          v.visits[spot.id] = (v.visits[spot.id] || 0) + 1;
        }
        // a plan lasts a while; short plans for urgent needs
        v.planTicks = act === 'eat' || act === 'wash' ? 40 : this.int(120, 350);
      }

      // walk towards the target
      const dx = v.targetX - v.x;
      const dz = v.targetZ - v.z;
      const dist = Math.hypot(dx, dz);
      const moving = v.activity !== 'sleep';
      if (dist > 0.6 && moving) {
        // v.speed is in units per second; the tick is 0.1 s
        const step = Math.min(dist, v.speed * 0.1);
        v.x += (dx / dist) * step;
        v.z += (dz / dist) * step;
        v.moving = true;
        v.facing = Math.atan2(dx, dz);
      } else {
        v.moving = false;
        if (v.activity === 'sleep') v.facing = v.facing ?? 0;
      }

      // the visible effect of what they are doing
      switch (v.activity) {
        case 'sleep':
          v.emote = null;
          break;
        case 'eat':
          v.emote = 'eat';
          // eating takes a little while and actually fills them up
          if (this.chance(0.015)) {
            v.hunger = clamp(v.hunger + 14, 0, 100);
            v.fun = clamp(v.fun + 2, 0, 100);
            if (this.stock.bread > 0) {
              this.stock.bread--;
              this.market.bread = Math.max(0, this.market.bread - 1);
            }
            // they had their meal, they can get on with the day
            v.activity = 'idle';
          }
          break;
        case 'wash':
          v.emote = 'wash';
          v.hygiene = clamp(v.hygiene + 1.6, 0, 100);
          break;
        case 'work':
          v.emote = 'work';
          v.energy = clamp(v.energy - 0.05, 0, 100);
          break;
        case 'market':
          v.emote = 'trade';
          break;
        case 'dance':
          v.emote = 'dance';
          v.fun = clamp(v.fun + 0.4, 0, 100);
          break;
        case 'social':
          v.emote = 'talk';
          break;
        case 'play':
          v.emote = 'play';
          v.fun = clamp(v.fun + 0.3, 0, 100);
          break;
      case 'shelter':
        v.emote = null;
        break;
      case 'greet':
        // the villager has come over to say hello to the player
        v.emote = 'greet';
        v.facing = Math.atan2(
          (this.playerPos?.x ?? v.x) - v.x,
          (this.playerPos?.z ?? v.z) - v.z
        );
        if (v.greeted) {
          v.greeted = false;
          v.activity = 'idle';
          v.planTicks = 20;
        }
        break;
      default:
        v.emote = null;
      }
    }
  }

  // Villagers meet each other and change how they feel about one another.
  updateSocial() {
    for (const v of this.villagers) {
      if (v.talkTimer > 0) {
        v.talkTimer -= 1;
        continue;
      }
      if (v.activity === 'sleep') continue;

      // a villager who spots the player walks over to them
      if (this.playerPos) {
        const dp = Math.hypot(this.playerPos.x - v.x, this.playerPos.z - v.z);
        if (dp < 9 && v.traitData.social > 0.55 && this.chance(0.015) && v.activity !== 'sleep') {
          v.activity = 'greet';
          v.targetSpot = 'player';
          const a = this.rand() * Math.PI * 2;
          v.targetX = this.playerPos.x + Math.cos(a) * 2.2;
          v.targetZ = this.playerPos.z + Math.sin(a) * 2.2;
          v.planTicks = 14;
          v.greeted = true;
          continue;
        }
      }

      // find somebody nearby who is also awake
      let best = null;
      let bestD = 3.2;
      for (const o of this.villagers) {
        if (o === v || o.activity === 'sleep') continue;
        const d = Math.hypot(o.x - v.x, o.z - v.z);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (!best) continue;
      if (!this.chance(0.06 + v.traitData.social * 0.1)) continue;

      v.talkTo = best.id;
      best.talkTo = v.id;
      v.talkTimer = 15 + this.int(0, 15);
      best.talkTimer = v.talkTimer;

      const rel = this.relation(v.id, best.id);
      rel.meetings++;
      rel.lastMet = this.tickCount;

      // the outcome depends on the personalities and the mood of the day
      const rain = this.weather.kind === 'rain';
      let delta = 0;
      if (rain) delta -= 0.4;
      if (this.festival) delta += 1.2;
      const affinity = (v.traitData.social + best.traitData.social) / 2;
      delta += (affinity - 0.5) * 2.4;
      delta += this.range(-0.9, 1.3);
      if (rel.value > 40 && this.chance(0.35)) delta += 1.1;
      this.adjustRelation(v.id, best.id, delta);

      // both feel a bit better
      v.social = clamp(v.social + 3.5, 0, 100);
      best.social = clamp(best.social + 3.5, 0, 100);
      v.fun = clamp(v.fun + 1.2, 0, 100);
      best.fun = clamp(best.fun + 1.2, 0, 100);

      // a friendship worth writing about
      if (rel.value >= 55 && rel.meetings % 4 === 1) {
        this.log(`${v.name} и ${best.name} подружились.`, 'social');
      } else if (rel.value <= -35 && this.chance(0.3)) {
        this.log(`${v.name} поссорился с ${best.name}.`, 'social');
      }
    }
  }

  // A tiny economy: villagers buy bread and apples from the market, and the
  // bakery produces more bread over time.
  updateEconomy() {
    if (this.tickCount % 20 !== 0) return;
    if (this.weather.kind === 'rain') {
      this.stock.bread = Math.max(0, this.stock.bread - 1);
    } else {
      this.stock.bread = Math.min(30, this.stock.bread + 1);
      if (this.chance(0.35)) this.stock.apple = Math.min(40, this.stock.apple + 1);
      if (this.chance(0.2)) this.stock.fish = Math.min(24, this.stock.fish + 1);
    }
    this.market.bread = Math.min(this.stock.bread, 40);
    this.market.apple = Math.min(this.stock.apple, 40);
    this.market.fish = Math.min(this.stock.fish, 24);
  }

  // ---- serialisation ------------------------------------------------------

  // The whole world is plain data, so it can be written to storage and read
  // back. The villagers' positions are included, so a returning player finds
  // everybody exactly where the simulation left them.
  toJSON() {
    return {
      v: 2,
      seed: this.seed,
      time: this.time,
      day: this.day,
      tickCount: this.tickCount,
      rngState: this.rngState,
      weather: this.weather,
      season: this.season,
      festival: this.festival,
      nextFestivalDay: this.nextFestivalDay,
      weatherTimer: this.weatherTimer,
      market: this.market,
      stock: this.stock,
      villagers: this.villagers.map((v) => ({
        id: v.id, name: v.name, trait: v.trait, job: v.job, jobLabel: v.jobLabel,
        workSpot: v.workSpot, homeSpot: v.homeSpot,
        hunger: v.hunger, energy: v.energy, social: v.social, fun: v.fun, hygiene: v.hygiene,
        activity: v.activity, targetSpot: v.targetSpot, targetX: v.targetX, targetZ: v.targetZ,
        x: v.x, z: v.z, prevX: v.prevX ?? v.x, prevZ: v.prevZ ?? v.z,
        speed: v.speed, talkTo: v.talkTo, talkTimer: v.talkTimer,
        mood: v.mood, lastEvent: v.lastEvent, visits: v.visits,
        socialSpot: v.socialSpot, eatSpot: v.eatSpot, playSpot: v.playSpot,
        choreSpot: v.choreSpot, restSpot: v.restSpot, marketSpot: v.marketSpot,
        planTicks: v.planTicks ?? 0,
      })),
      relationships: [...this.relationships.entries()].map(([k, r]) => [k, r.value, r.meetings, r.lastMet]),
      chronicle: this.chronicle.slice(0, 40),
    };
  }

  static fromJSON(data) {
    const w = new World({ seed: data.seed, time: data.time, day: data.day, rngState: data.rngState });
    w.tickCount = data.tickCount ?? 0;
    w.weather = data.weather ?? w.weather;
    w.season = data.season ?? 'autumn';
    w.festival = data.festival ?? null;
    w.nextFestivalDay = data.nextFestivalDay ?? 4;
    w.weatherTimer = data.weatherTimer ?? 0;
    w.market = data.market ?? w.market;
    w.stock = data.stock ?? w.stock;

    if (data.villagers?.length) {
      w.villagers = data.villagers.map((v) => ({
        ...v,
        traitData: TRAITS.find((t) => t.key === v.trait) ?? TRAITS[0],
        workSpot: v.workSpot && typeof v.workSpot === 'object' ? v.workSpot : spotById(v.workSpot),
        homeSpot: v.homeSpot && typeof v.homeSpot === 'object' ? v.homeSpot : spotById(v.homeSpot),
        moving: false, facing: 0, emote: null,
      }));
    }
    if (data.relationships?.length) {
      w.relationships = new Map(data.relationships.map(([k, value, meetings, lastMet]) => [k, { value, meetings, lastMet }]));
    }
    w.chronicle = data.chronicle ?? [];
    return w;
  }

  // Runs the simulation forward without anybody watching. This is what makes
  // the village keep living while the game is closed.
  //
  // `realSeconds` is how long the player was away. The village continues at
  // a slower offline rhythm and never fast-forwards more than a week, so
  // the world stays believable no matter how long you were gone.
  catchUp(realSeconds, onProgress = null) {
    const worldHours = Math.min(realSeconds * OFFLINE_RATE, MAX_OFFLINE_HOURS);
    const ticks = Math.min(MAX_CATCHUP_TICKS, Math.floor(worldHours / HOURS_PER_TICK));
    let daysPassed = 0;
    for (let i = 0; i < ticks; i++) {
      const newDay = this.step();
      if (newDay) daysPassed++;
      if (onProgress && i % 500 === 0) onProgress(i, ticks);
    }
    return { ticks, daysPassed, worldHours };
  }
}

// ---- storage ---------------------------------------------------------------

const STORAGE_KEY = 'tihaya-derevnya.world.v2';
const STAMP_KEY = 'tihaya-derevnya.savedAt.v2';

// Reads the world from storage. Returns { world, awaySeconds } where
// awaySeconds is how long the player was away.
export function loadWorld() {
  if (typeof localStorage === 'undefined') return { world: null, awaySeconds: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stamp = Number(localStorage.getItem(STAMP_KEY) || 0);
    if (!raw) return { world: null, awaySeconds: 0 };
    const data = JSON.parse(raw);
    const world = World.fromJSON(data);
    const awaySeconds = stamp ? Math.max(0, (Date.now() - stamp) / 1000) : 0;
    return { world, awaySeconds };
  } catch (e) {
    console.warn('Не удалось загрузить состояние мира:', e);
    return { world: null, awaySeconds: 0 };
  }
}

// Writes the world to storage.
export function saveWorld(world) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(world.toJSON()));
    localStorage.setItem(STAMP_KEY, String(Date.now()));
    return true;
  } catch (e) {
    console.warn('Не удалось сохранить состояние мира:', e);
    return false;
  }
}

export function clearWorld() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STAMP_KEY);
  } catch (e) { /* ignore */ }
}

// How fast the world runs compared to real time. One in-game day takes
// about 12 real minutes while the player is watching.
export const TIME_SCALE = 0.05;
