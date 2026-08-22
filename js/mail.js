/* ═══════════════════════════════════════════════════════════════════════════
   KARTI — IL-KAXXA TAL-ITTRI                              window.KARTI_MAIL
   ───────────────────────────────────────────────────────────────────────────
   The mailbox: the owner sends a player a gift, the player finds a letter
   waiting for them and opens it.

   WHY IT IS SERVER-HELD. A gift has to survive the recipient being offline,
   reinstalling, or playing on a different phone — so it cannot live in the
   sender's browser and it cannot ride a lobby message. The relay keeps it
   against the ACCOUNT and hands it over the next time that account signs in,
   wherever that is.

   WHY THE ADMIN CHECK IS NOT HERE. js/progress.js has isAdmin(), and it is
   fine for deciding whether to DRAW the console — but it is client-side, so
   it is worth exactly nothing as a permission. Anyone can edit their own
   JavaScript and call the endpoint by hand. The relay decides who may send,
   from the account the request is authenticated as; this file only decides
   who is shown the button.

   THE WIRE (all POST, all under the existing /karti/acct prefix):

     gift   { u, tok, to, gift, note }  -> { ok, id }
              admin only. `to` is the recipient's account name.
     mail   { u, tok }                  -> { ok, mail:[{id, note, gift, at}] }
              this account's UNCLAIMED letters.
     claim  { u, tok, id }              -> { ok, gift } | { ok, already:true }
              idempotent: claiming twice pays once.

   THE GIFT PAYLOAD is opaque to the relay and validated here on arrival —
   the server must never need to understand the economy to carry a parcel:

     { coins:N, chips:N, packs:N, xp:N, excl:'<setKey>', cosm:'<cosmeticId>' }

   Every field optional. Unknown fields are ignored rather than rejected, so
   an older client can still open a letter written by a newer one.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  if (global.KARTI_MAIL) return;

  /* Placeholder shell. The mailbox screen, the unread badge and the owner's
     send console are built on top of this contract. */
  var api = {
    /* filled in by the implementation */
    _contract: 'gift|mail|claim'
  };

  global.KARTI_MAIL = api;

})(typeof window !== 'undefined' ? window : this);
