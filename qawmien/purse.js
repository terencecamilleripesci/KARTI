/* ═══════════════════════════════════════════════════════════════════
   PURSE — the ONE door between this game and KARTI's coins.

   The owner's decision: coins are used everywhere in Il-Qawmien and drop from
   monsters. That reverses the old "XP and items only" rule, which was right
   while the RPG was standalone and had no way to reach a real wallet.

   WHY EVERYTHING GOES THROUGH HERE. KARTI keeps its wallet in progress.js and
   exposes exactly four verbs. They cap a single transaction, commit the
   balance, and fire the one event the home screen's count-up animation hangs
   off. Reaching around them — touching wallet() or localStorage directly —
   skips all three, so the number changes and the app does not notice. One door
   means one place to get that right, and one place to change it.

   THE FAUCET IS REAL AND IS NOT A SECRET. KARTI's own games taper their
   payouts daily; §7b calls it "the same WEIGHT, same speed factor, same daily
   taper as the XP, so the anti-farm machinery is shared and cannot drift". The
   party games are BALANCED against that taper. A monster that pays coins on
   every kill, in a beta whose encounters respawn, is a faucet the taper never
   sees — so this file keeps its own daily ceiling. Not because coins are
   precious, but because the alternative is quietly rebalancing games that are
   already live.

   Worth stating plainly, because it changes how careful to be: the wallet is
   CLIENT-SIDE. Anyone who wants a different balance can open devtools today,
   with or without this file. The ceiling here is about not breaking the
   party games' economy by accident, not about stopping a determined player.

   STANDALONE. The RPG also runs outside KARTI (world.html on its own, for
   testing), where there is no parent and no wallet. Then this keeps a local
   practice purse instead, so the shop and the drops are still testable. It
   says which mode it is in rather than pretending.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

window.PURSE = (function () {

  const KEY = 'qawmien.purse.v1';      /* the standalone practice purse   */
  const DAY = 'qawmien.purse.day.v1';  /* what has been paid out today    */
  const DAILY_MAX = 400;               /* coins this game may mint in a day */

  /* KARTI's wallet, if we are inside KARTI. Same-origin iframe, so the
     parent's module is reachable; absent when running standalone. */
  function karti() {
    try {
      if (window.KARTI_XP && window.KARTI_XP.addCoins) return window.KARTI_XP;
      if (window.parent && window.parent !== window &&
          window.parent.KARTI_XP && window.parent.KARTI_XP.addCoins)
        return window.parent.KARTI_XP;
    } catch (e) {}                     /* cross-origin: treat as standalone */
    return null;
  }

  function local() {
    try { return Math.max(0, parseInt(localStorage.getItem(KEY), 10) || 0); }
    catch (e) { return 0; }
  }
  function setLocal(v) {
    try { localStorage.setItem(KEY, String(Math.max(0, v | 0))); } catch (e) {}
  }

  /* today's minting, reset on the date changing rather than on a timer, so
     closing the tab overnight does not carry yesterday's total forward */
  function today() {
    const d = new Date().toISOString().slice(0, 10);
    let rec = { d: d, n: 0 };
    try {
      const raw = JSON.parse(localStorage.getItem(DAY) || 'null');
      if (raw && raw.d === d) rec = raw;
    } catch (e) {}
    return rec;
  }
  function bumpToday(n) {
    const rec = today();
    rec.n += n;
    try { localStorage.setItem(DAY, JSON.stringify(rec)); } catch (e) {}
  }

  return {
    /* is there a real wallet behind this? */
    live() { return !!karti(); },

    balance() {
      const K = karti();
      if (K) { try { return K.coinsBal() | 0; } catch (e) {} }
      return local();
    },

    /* how much this game may still mint today */
    headroom() { return Math.max(0, DAILY_MAX - today().n); },

    /* PAY IN. Returns what was actually paid, which may be less than asked
       for — or nothing — once the day's ceiling is reached. Callers must use
       the RETURN VALUE when they tell the player what they got, or the
       end-of-fight screen will promise coins the wallet never received. */
    earn(n, reason) {
      n = Math.max(0, n | 0);
      if (!n) return 0;
      const room = this.headroom();
      if (!room) return 0;
      const pay = Math.min(n, room);
      const K = karti();
      if (K) {
        try {
          const r = K.addCoins(pay, reason || 'qawmien');
          if (!r || !r.ok) return 0;
        } catch (e) { return 0; }
      } else {
        setLocal(local() + pay);
      }
      bumpToday(pay);
      return pay;
    },

    /* PAY OUT. Never partial: you can afford it or you cannot, because a
       half-paid price with no goods is worse than a refusal. */
    spend(n, reason) {
      n = Math.max(0, n | 0);
      if (!n) return { ok: true, spent: 0, balance: this.balance() };
      const K = karti();
      if (K) {
        try {
          const r = K.spendCoins(n, reason || 'qawmien');
          return r && r.ok ? { ok: true, spent: n, balance: r.balance }
                           : { ok: false, why: 'coins', balance: this.balance() };
        } catch (e) { return { ok: false, why: 'wallet', balance: 0 }; }
      }
      const have = local();
      if (have < n) return { ok: false, why: 'coins', short: n - have, balance: have };
      setLocal(have - n);
      return { ok: true, spent: n, balance: have - n };
    },

    /* WHAT A MONSTER IS WORTH. Scales with its level so the necropolis pays
       better than the terraces, which is what makes moving on worth doing.
       Deliberately small: the ceiling above is the real limit, and a big
       per-kill number would only mean hitting it in ten minutes. */
    forKill(level) {
      const L = Math.max(1, level | 0);
      return 2 + Math.round(L * 1.5);
    }
  };
})();
