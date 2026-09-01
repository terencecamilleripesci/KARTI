/* ═══════════════════════════════════════════════════════════════════
   SOCIAL — tap another player, get a small sheet.        window.SOCIAL

   Slides up from the bottom edge, because that is where the thumb is and
   because a sheet that grows from the edge reads as "attached to what I
   tapped" rather than a dialog that has interrupted me.

   THREE VERBS: spar, trade, add friend.

   WHAT IS REAL TODAY, said plainly rather than discovered by tapping:
     · ADD FRIEND is real. KARTI already has a complete friends system —
       js/friends.js, with presence, invites and push-on-invite — and this
       calls it. We do not build a second one, for the same reason the RPG
       has no wallet: KARTI owns it.
     · SPAR is half real. The relay has rooms (open/join/act/poll/leave on
       port 8102, two seats, opaque action blobs) and this opens one and
       shows the code. What does NOT exist yet is the other half: sending
       the invite to them, and syncing combat over it.
     · TRADE is not built at all. The button is present because the owner
       asked for the three together, and it says so instead of pretending.

   A button that looks alive and does nothing teaches the player not to
   trust the interface, so each one states what it can actually do.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const SOCIAL = (() => {

let sheet = null, backdrop = null;

/* Reach the parent for anything KARTI owns. Same-origin, and guarded: the
   RPG also runs standalone, where there is no parent to ask. */
function host(name) {
  try { if (window[name]) return window[name]; } catch (e) {}
  try {
    if (window.parent && window.parent !== window && window.parent[name])
      return window.parent[name];
  } catch (e) {}
  return null;
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function close() {
  if (!backdrop) return;
  const b = backdrop;
  sheet = backdrop = null;
  b.classList.remove('soc-on');
  /* let it slide out before it is removed; reduced-motion skips the wait */
  const wait = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
  setTimeout(() => { try { b.remove(); } catch (e) {} }, wait);
}

function toast(msg) {
  try { if (window.QUEST && QUEST.toast) return QUEST.toast(msg, 2600); } catch (e) {}
  try { if (window.HUD && HUD.toast) return HUD.toast(msg); } catch (e) {}
}

/* ── the sheet ─────────────────────────────────────────────────────
   p = { name, key, cls, level }  — key is the KARTI account name, which
   is what the friends system takes. */
function openPlayer(p) {
  if (!p || !p.name) return;
  close();

  const F = host('KARTI_FRIENDS');
  const already = !!(F && F.isFriend && F.isFriend(p.key || p.name));

  backdrop = document.createElement('div');
  backdrop.className = 'soc-back';
  sheet = document.createElement('div');
  sheet.className = 'soc-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Actions for ' + p.name);

  const sub = [p.cls, p.level ? 'level ' + p.level : ''].filter(Boolean).join(' · ');
  sheet.innerHTML =
    '<div class="soc-grab" aria-hidden="true"></div>' +
    '<div class="soc-who"><b>' + esc(p.name) + '</b>' +
      (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' +
    '<div class="soc-acts">' +
      '<button type="button" class="soc-b" data-a="spar">' +
        '<span class="soc-t">Spar</span>' +
        '<span class="soc-s">A friendly fight. Nobody dies.</span></button>' +
      '<button type="button" class="soc-b" data-a="trade">' +
        '<span class="soc-t">Trade</span>' +
        '<span class="soc-s">Swap items face to face.</span></button>' +
      '<button type="button" class="soc-b" data-a="friend"' + (already ? ' disabled' : '') + '>' +
        '<span class="soc-t">' + (already ? 'Already friends' : 'Add friend') + '</span>' +
        '<span class="soc-s">' + (already ? 'You two are already on each other\'s list.'
                                          : 'Through your KARTI account.') + '</span></button>' +
    '</div>' +
    '<button type="button" class="soc-x">Close</button>';

  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  /* one frame before adding the class, or the transition has nothing to
     animate from and it simply appears */
  requestAnimationFrame(() => backdrop.classList.add('soc-on'));

  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  sheet.querySelector('.soc-x').addEventListener('click', close);
  document.addEventListener('keydown', function esckey(e) {
    if (e.key === 'Escape') { document.removeEventListener('keydown', esckey); close(); }
  });

  sheet.addEventListener('click', e => {
    const b = e.target.closest('.soc-b');
    if (!b || b.disabled) return;
    const a = b.dataset.a;
    try { if (window.HUD && HUD.sfx) HUD.sfx('tap'); } catch (e2) {}

    if (a === 'friend') {
      const F2 = host('KARTI_FRIENDS');
      if (!F2 || !F2.add) return toast('Friends live in KARTI — open the game from there.');
      try { F2.add(p.key || p.name); toast('Friend request sent to ' + p.name + '.'); }
      catch (e3) { toast('Could not send that just now.'); }
      close();
      return;
    }

    if (a === 'spar') {
      const N = window.NET;
      if (!N || !N.sparOpen) return toast('Sparring needs you signed in to KARTI.');
      N.sparOpen().then(r => {
        if (r && r.code) toast('Spar room ' + r.code + ' — invites are not wired up yet.');
        else toast('Could not open a spar room.');
      }).catch(() => toast('Could not open a spar room.'));
      close();
      return;
    }

    if (a === 'trade') {
      /* honest rather than a dead button: trading is not built */
      toast('Trading is not built yet.');
      close();
    }
  });
}

return { openPlayer, close };
})();

if (typeof window !== 'undefined') window.SOCIAL = SOCIAL;
