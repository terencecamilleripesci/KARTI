/* ═══════════════════════════════════════════════════════════════════
   SHOP — what the tavern sells, and the one verb that sells it.

   Pure rules over PURSE and PANELS: this file decides what a thing costs and
   whether you may have it, and nothing else in the game prices anything. A
   second price list is a second thing to forget to update.

   THE KEY IS THE INTERESTING STOCK. The dungeons were a bare level gate —
   reach 10, walk in — which made the whole island skippable: nothing between
   the ruin and the crypt had to be touched. Incarnam does not work that way.
   There the dungeon key drops from the zone's monsters, so the open world is
   the way in rather than a formality. Here it is bought from the tavern with
   coins the monsters paid for, which keeps that property and gives the village
   a reason to exist.

   Level stays a FLOOR — you still cannot buy your way into the necropolis at
   level 3 — and the key becomes the door.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.SHOP = (function () {

  /* Prices are in KARTI coins. A monster is worth 2 + 1.5/level (purse.js),
     so a level-5 kill pays about 10: bread is a couple of fights, a crypt key
     is a solid session. The daily ceiling is 400, which is the real limit on
     how fast any of this can be bought. */
  const STOCK = [
    { id: 'bread', name: 'Loaf of Bread', price: 12,
      note: 'Restores 20 HP. Keeps for a week, which is longer than most ' +
            'things last on this island.',
      use: { heal: 20 } },
    { id: 'potion', name: 'Potion', price: 30,
      note: 'Restores 30 HP.', use: { heal: 30 } },
    { id: 'crypt-key', name: 'Crypt Key', price: 120, need: 10,
      opens: 'sunken-crypt',
      note: 'Cold iron, green with salt. Opens the Sunken Crypt once.' },
    { id: 'necro-key', name: 'Necropolis Key', price: 400, need: 25,
      opens: 'necropolis',
      note: 'It hums, faintly, in the key of something you would rather not ' +
            'hear. Opens the Necropolis once.' }
  ];

  const BY_ID = {};
  for (const it of STOCK) BY_ID[it.id] = it;

  function byId(id) { return BY_ID[id] || null; }
  function list() { return STOCK.slice(); }

  /* KEYS ARE ITEMS, so they sit in the bag with everything else and the
     player can see they have one. Which dungeon a key opens lives on the item
     rather than in the dungeon, so adding a third dungeon is data here. */
  function keyFor(bossOrDungeon) {
    return STOCK.find(s => s.opens === bossOrDungeon) || null;
  }

  /* MAY I BUY THIS? A reason, never a bare false — a button that refuses
     silently is indistinguishable from a broken one. */
  function canBuy(id, level, balance) {
    const it = byId(id);
    if (!it) return { ok: false, why: 'The keeper does not sell that.' };
    if (it.need && (level | 0) < it.need)
      return { ok: false, why: it.name + ' is for level ' + it.need +
                              ' and up. You are ' + (level | 0) + '.' };
    if ((balance | 0) < it.price)
      return { ok: false, why: 'That costs ' + it.price + ' coins. You have ' +
                              (balance | 0) + '.',
               short: it.price - (balance | 0) };
    return { ok: true, price: it.price };
  }

  /* BUY. Takes the coins FIRST, then gives the goods — and if handing the
     goods over fails, refunds. The other order can pay you an item for free;
     this order can, at worst, take coins and give them straight back. */
  function buy(id, level) {
    const it = byId(id);
    if (!it) return { ok: false, why: 'No such thing.' };
    const P = window.PURSE;
    if (!P) return { ok: false, why: 'No purse.' };
    const v = canBuy(id, level, P.balance());
    if (!v.ok) return v;

    const paid = P.spend(it.price, 'qawmien-shop:' + id);
    if (!paid.ok)
      return { ok: false, why: 'That costs ' + it.price + ' coins. You have ' +
                              P.balance() + '.' };
    const rec = { id: it.id, name: it.name, qty: 1, note: it.note };
    try {
      if (window.PANELS && PANELS.give) PANELS.give(rec);
      else {
        const PL = window.PLAYER;
        if (!PL) throw new Error('nowhere to put it');
        PL.items = PL.items || [];
        const have = PL.items.find(x => x.id === rec.id);
        if (have) have.qty += 1; else PL.items.push(rec);
      }
    } catch (e) {
      P.earn(it.price, 'qawmien-shop-refund');    /* never take and not give */
      return { ok: false, why: 'The keeper could not find one after all.' };
    }
    return { ok: true, item: rec, paid: it.price, balance: P.balance() };
  }

  /* SPEND A KEY at a door. Consumed, which is what makes a run a decision
     rather than a habit — and what stops one purchase opening the crypt
     forever. */
  function useKey(dungeonId) {
    const k = keyFor(dungeonId);
    if (!k) return { ok: true, why: 'no key needed' };     /* ungated dungeon */
    const PL = window.PLAYER;
    const bag = (PL && PL.items) || [];
    const have = bag.find(x => x.id === k.id && (x.qty | 0) > 0);
    if (!have) return { ok: false, why: 'need-key', key: k };
    have.qty -= 1;
    if (have.qty <= 0) bag.splice(bag.indexOf(have), 1);
    return { ok: true, used: k.id };
  }

  function hasKey(dungeonId) {
    const k = keyFor(dungeonId);
    if (!k) return true;
    const bag = (window.PLAYER && window.PLAYER.items) || [];
    return bag.some(x => x.id === k.id && (x.qty | 0) > 0);
  }

  return { STOCK, list, byId, keyFor, canBuy, buy, useKey, hasKey };
})();
