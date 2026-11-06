import { clamp } from './util.js';

// ---------------------------------------------------------------------------
// Life simulation: needs, inventory, money, quests, friendships and the
// daily rhythm of the village. Everything the player does feeds into this
// state, and the state feeds back into movement, lighting and the HUD.
// ---------------------------------------------------------------------------

export const NEED_DEFS = [
  { key: 'hunger', label: 'Сытость', color: '#e0a054' },
  { key: 'energy', label: 'Сила', color: '#78bfe0' },
  { key: 'thirst', label: 'Вода', color: '#74c9a4' },
  { key: 'mood', label: 'Настроение', color: '#ffc27a' },
];

export const ITEM_DEFS = {
  apple: { label: 'Яблоко', short: 'Яблоко' },
  bread: { label: 'Хлеб', short: 'Хлеб' },
  fish: { label: 'Рыба', short: 'Рыба' },
  flour: { label: 'Мука', short: 'Мука' },
  water: { label: 'Вода', short: 'Вода' },
};

export const QUESTS = [
  { id: 'water', title: 'Глоток воды', desc: 'Наберите воды у колодца', goal: 1, stat: 'water', reward: 6 },
  { id: 'rest', title: 'Передышка', desc: 'Отдохните на скрипучей лавке', goal: 1, stat: 'rested', reward: 6 },
  { id: 'warm', title: 'У костра', desc: 'Погрейтесь у костра на площади', goal: 1, stat: 'warmed', reward: 6 },
  { id: 'pray', title: 'Вечерняя молитва', desc: 'Помолитесь у церкви', goal: 1, stat: 'prayed', reward: 7 },
  { id: 'apples', title: 'Яблоки', desc: 'Соберите 3 яблока в саду', goal: 3, stat: 'apples', reward: 12 },
  { id: 'talk', title: 'Соседи', desc: 'Поговорите с тремя разными жителями', goal: 3, stat: 'talked', reward: 12 },
  { id: 'fish', title: 'Рыбка', desc: 'Поймайте рыбу у пристани', goal: 1, stat: 'fished', reward: 10 },
  { id: 'bake', title: 'Хлеб', desc: 'Испеките хлеб на пекарне', goal: 1, stat: 'baked', reward: 14 },
  { id: 'caught', title: 'Светлячки', desc: 'Поймайте 5 светлячков вечером', goal: 5, stat: 'caught', reward: 16 },
  { id: 'cat', title: 'Рыжий кот', desc: 'Найдите рыжего кота и покормите его', goal: 1, stat: 'catFed', reward: 10 },
];

const NEED_START = { hunger: 82, energy: 88, thirst: 76, mood: 74 };

export class LifeSim {
  constructor() {
    this.day = 1;
    this.coins = 14;
    this.needs = { ...NEED_START };
    this.inventory = { apple: 0, bread: 0, fish: 0, flour: 0, water: 0 };
    this.stats = {
      water: 0, rested: 0, warmed: 0, prayed: 0, apples: 0, talked: 0,
      fished: 0, baked: 0, caught: 0, catFed: 0, sold: 0, meals: 0,
    };
    this.friendship = new Map();
    this.greeted = new Set();
    this.done = new Set();
    this.journal = [];
    this.flags = { catFollowing: false, dayBonusGiven: false, sleptToday: false };
  }

  resetDay() {
    this.done.clear();
    this.greeted.clear();
    this.flags.sleptToday = false;
    this.flags.dayBonusGiven = false;
  }

  // Needs drain with the passing hours. Walking costs more energy.
  advance(dt, hours, walking, weather = null) {
    const dh = dt * 0.035; // in-game hours per real second
    const cold = weather?.rainAmount ?? 0;
    this.needs.hunger = clamp(this.needs.hunger - dh * 7.5, 0, 100);
    this.needs.thirst = clamp(this.needs.thirst - dh * (9.5 + cold * 5), 0, 100);
    this.needs.energy = clamp(this.needs.energy - dh * (walking ? 7.5 : 4.5) + cold * dh * 2.5, 0, 100);
    // mood follows the worst need, and the night is a little sadder
    const worst = Math.min(this.needs.hunger, this.needs.thirst, this.needs.energy);
    const night = hours < 6 || hours > 21 ? 1 : 0;
    this.needs.mood = clamp(
      this.needs.mood + (worst - 55) * dh * 0.22 - night * dh * 1.2 + dh * 1.6,
      0, 100
    );
  }

  // How the body feels: 1 = full of energy, 0 = barely standing.
  get condition() {
    const n = this.needs;
    return clamp(Math.min(n.hunger, n.energy, n.thirst) / 100, 0, 1);
  }

  get moodLevel() {
    const m = this.needs.mood;
    if (m > 78) return 'отличное';
    if (m > 58) return 'хорошее';
    if (m > 38) return 'ровное';
    if (m > 20) return 'уставшее';
    return 'скучное';
  }

  get friendCount() {
    let n = 0;
    for (const v of this.friendship.values()) if (v >= 60) n++;
    return n;
  }

  addItem(key, count = 1) {
    this.inventory[key] = (this.inventory[key] || 0) + count;
    return this.inventory[key];
  }

  takeItem(key, count = 1) {
    if ((this.inventory[key] || 0) < count) return false;
    this.inventory[key] -= count;
    if (this.inventory[key] <= 0) this.inventory[key] = 0;
    return true;
  }

  hasItem(key, count = 1) {
    return (this.inventory[key] || 0) >= count;
  }

  useItem(key) {
    if (!this.takeItem(key)) return null;
    switch (key) {
      case 'apple':
        this.needs.hunger = clamp(this.needs.hunger + 14, 0, 100);
        this.needs.mood = clamp(this.needs.mood + 4, 0, 100);
        this.stats.meals++;
        return 'Яблоко сладкое и сочное. Настроение чуть улучшилось.';
      case 'bread':
        this.needs.hunger = clamp(this.needs.hunger + 34, 0, 100);
        this.needs.energy = clamp(this.needs.energy + 8, 0, 100);
        this.needs.mood = clamp(this.needs.mood + 7, 0, 100);
        this.stats.meals++;
        return 'Тёплый хлеб из пекарни. Сытно и уютно.';
      case 'fish':
        this.needs.hunger = clamp(this.needs.hunger + 26, 0, 100);
        this.needs.mood = clamp(this.needs.mood + 2, 0, 100);
        this.stats.meals++;
        return 'Сырая рыба... но сытость важнее.';
      case 'water':
        this.needs.thirst = clamp(this.needs.thirst + 40, 0, 100);
        return 'Прохладная вода из колодца. Пивоть не хочется.';
      default:
        return null;
    }
  }

  earn(amount, reason = '') {
    this.coins += amount;
    if (reason) this.log(`${reason} (+${amount})`);
  }

  spend(amount) {
    if (this.coins < amount) return false;
    this.coins -= amount;
    return true;
  }

  log(text) {
    this.journal.unshift({ text, day: this.day });
    if (this.journal.length > 30) this.journal.pop();
  }

  friendLevel(name) {
    return this.friendship.get(name) || 0;
  }

  befriend(name, amount = 4) {
    const next = clamp(this.friendLevel(name) + amount, 0, 100);
    this.friendship.set(name, next);
    return next;
  }

  questProgress(quest) {
    return Math.min(quest.goal, this.stats[quest.stat] || 0);
  }

  questDone(quest) {
    return this.done.has(quest.id);
  }

  // Called every frame: finishes quests that met their goal.
  checkQuests() {
    const finished = [];
    for (const q of QUESTS) {
      if (this.done.has(q.id)) continue;
      if (this.questProgress(q) >= q.goal) {
        this.done.add(q.id);
        this.coins += q.reward;
        this.log(`«${q.title}» — выполнено (+${q.reward})`);
        finished.push(q);
      }
    }
    return finished;
  }

  get allQuestsDone() {
    return QUESTS.every((q) => this.done.has(q.id));
  }

  // A new day starts in the morning after a good sleep.
  startNewDay() {
    this.day++;
    this.resetDay();
    this.needs.energy = 100;
    this.needs.hunger = clamp(this.needs.hunger - 22, 25, 100);
    this.needs.thirst = clamp(this.needs.thirst - 12, 25, 100);
    this.needs.mood = clamp(this.needs.mood + 12, 0, 100);
  }
}
