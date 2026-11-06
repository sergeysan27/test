import { ITEM_DEFS } from './sim.js';

// ---------------------------------------------------------------------------
// Trading. The bakery sells warm bread and buys what you carry; the mill
// sells flour and buys nothing but has its own small talk.
// ---------------------------------------------------------------------------

export const SHOPS = {
  bakery: {
    title: 'Тёплая пекарня',
    owner: 'Пётр',
    greeting: 'Заходи, скорее! Свежий хлеб только из печи.',
    stock: [
      { id: 'bread', price: 6, desc: 'Тёплый, с корочкой' },
    ],
    buys: [
      { id: 'apple', price: 3, desc: 'Яблоки из сада' },
      { id: 'fish', price: 7, desc: 'Свежая рыба' },
    ],
  },
  mill: {
    title: 'Мельница',
    owner: 'Гриша',
    greeting: 'Мука свежая, помол мелкий. Куку, муку муку.',
    stock: [
      { id: 'flour', price: 4, desc: 'Пшеничная мука' },
    ],
    buys: [
      { id: 'bread', price: 4, desc: 'Хлеб — в муку помельче' },
    ],
  },
};

export function shopList(shopId) {
  const s = SHOPS[shopId] || SHOPS.bakery;
  return s;
}

// Buys one unit of `id` for the player. Returns { ok, message }.
export function buyItem(shopId, id, sim) {
  const shop = shopList(shopId);
  const entry = shop.stock.find((x) => x.id === id);
  if (!entry) return { ok: false, message: 'Такого здесь не продают.' };
  if (!sim.spend(entry.price)) return { ok: false, message: 'Не хватает монет.' };
  sim.addItem(id, 1);
  return { ok: true, message: `Куплено: ${ITEM_DEFS[id]?.label || id}` };
}

// Sells one unit of `id` to the shop. Returns { ok, message }.
export function sellItem(shopId, id, sim) {
  const shop = shopList(shopId);
  const entry = shop.buys.find((x) => x.id === id);
  if (!entry) return { ok: false, message: 'У нас это не берут.' };
  if (!sim.hasItem(id)) return { ok: false, message: 'Нечего продавать.' };
  sim.takeItem(id, 1);
  sim.earn(entry.price, `Продано: ${ITEM_DEFS[id]?.label || id}`);
  sim.stats.sold += 1;
  return { ok: true, message: `Продано за ${entry.price} монет` };
}
