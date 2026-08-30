/* ═══════════════════════════════════════════════════════════════════════════
   FRIENDS — the social layer (v1)
   ─────────────────────────────────────────────────────────────────────────
   A self-contained module, in the same shape as party.js / stats.js: an IIFE
   that builds its own #scr-friends screen, injects its own scoped CSS, and
   publishes one global (window.KARTI_FRIENDS). It owns the FRIENDS bottom-nav
   tab (#btn-friends) that replaced the old Guide tab.

   IT RIDES THE EXISTING RELAY SOCKET. Nothing here opens a socket of its own.
   Every message goes out through KARTI_MP.friendSend() (the exported wrapper
   around mp.js's sendAny — the live room socket, else the home-screen
   presence beacon). Every reply arrives on the ONE namespaced type t:'friend'
   which mp.js hands to us through MP.friendHook (set once, on boot).

   THE PROTOCOL (client <-> relay), all additive to the relay:
     out {t:'friendhello'}                     -> in {t:'friend',k:'hello',...}
     out {t:'friendadd', code|name}            -> in {t:'friend',k:'added'|'err'}
     out {t:'friendaccept', id}                -> in {t:'friend',k:'accepted'}
     out {t:'frienddecline', id}               (silent)
     out {t:'friendremove', k}                 -> in {t:'friend',k:'removed'}
     out {t:'friendlist'}                      -> in {t:'friend',k:'list',...}
     out {t:'friendmsg', to, x}                -> in {t:'friend',k:'dm',...}
     out {t:'friendhist', with}                -> in {t:'friend',k:'hist',...}
     out {t:'friendinvite', to, game}          -> reuses the relay's invite
   Pushed to us unprompted:
     {t:'friend',k:'req',...}   an incoming friend request
     {t:'friend',k:'dm',...}    a direct message from a friend
     {t:'friend',k:'presence'}  a friend's online/activity changed (re-poll)

   SAFETY: only mutual friends can DM / see activity / invite. Every action is
   account-gated by the relay; the client shows only name / avatar / online /
   current-game. See server/karti_server.py's FRIENDS block for the guard.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var K  = function(){ return window.KARTI; };
  var MP = function(){ return window.KARTI_MP; };

  function $(sel, root){ return (root || document).querySelector(sel); }
  function $$(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function toast(m){ try { K().toast(m); } catch (e){} }

  /* ── module state ───────────────────────────────────────────────────── */
  var scr = null;                 // the #scr-friends section
  var live = false;               // are we the on-screen screen?
  var mo = null;                  // MutationObserver that lets us stand down
  var booted = false;

  var ST = {
    code: '',                     // this account's own friend code (from relay)
    friends: [],                  // [{k,n,s,g,id,pv,rec}] key,name,state,game,roomid,avatarVer,record
    incoming: [],                 // [{id,n,k}] pending requests TO me
    outgoing: [],                 // [{n,k}]    pending requests FROM me
    view: 'list',                 // list | add | chat | profile
    chatWith: null,               // {k,n} of the friend a chat is open with
    profileOf: null,              // {k,n} of the friend whose profile is open
    chats: {},                    // key -> [{me:bool, x, t}]  (session cache)
    unread: {},                   // key -> count of DMs not yet viewed in a chat
    lastList: 0
  };

  /* ── the notification tally: pending things worth a bubble ──────────────
     requests (incoming friend requests) + messages (unread DMs) + invites
     (live game invites in mp.js's INBOX). One total for the tab bubble, and
     a per-kind breakdown for the in-screen strip. */
  function inviteCount(){
    try {
      var m = MP();
      if (m && m.inboxLive) return m.inboxLive().length;
      if (m && m.INBOX && Array.isArray(m.INBOX.list)) return m.INBOX.list.length;
    } catch (e){}
    return 0;
  }
  function unreadTotal(){
    var n = 0; for (var k in ST.unread){ n += ST.unread[k] | 0; } return n;
  }
  function tally(){
    return { req: ST.incoming.length, msg: unreadTotal(), inv: inviteCount() };
  }
  function tallyTotal(){ var t = tally(); return t.req + t.msg + t.inv; }

  /* ── are we signed in? the whole feature needs an account ───────────── */
  function signedIn(){ try { return !!MP().canInvite(); } catch (e){ return false; } }
  function myName(){ try { return (K().displayName() || '').toString(); } catch (e){ return ''; } }

  /* Push notifications are supported here but not yet enabled — so an invite
     could NOT open the app on iOS. Reuses the app's own push plumbing. */
  function pushOffButAvailable(){
    try {
      var k = K();
      if (!k || !k.pushSupported || !k.pushSupported()) return false;
      var st = k.pushState ? k.pushState() : null;
      return !!(st && st.mode === 'off');
    } catch (e){ return false; }
  }
  function enableInviteAlerts(){
    try { if (K() && K().pushToggleTap){ K().pushToggleTap(); } }
    catch (e){ toast('Could not turn on alerts.'); }
    setTimeout(function(){ if (live && ST.view === 'list') render(); }, 1200);
  }

  /* ── the wire ───────────────────────────────────────────────────────── */
  function tx(o){
    try {
      if (MP() && MP().friendSend) return MP().friendSend(o);
    } catch (e){}
    return false;
  }

  /* Keep the relay socket alive while we are on the Friends screen. mp.js only
     mounts its presence beacon on Home/Online; we borrow the same mount so our
     socket (and its account auth) stays up here too. */
  function keepSocket(){
    try {
      if (MP() && MP().presenceMount) MP().presenceMount('home');
      if (MP() && MP().presenceBeaconOpen) MP().presenceBeaconOpen();
    } catch (e){}
  }

  /* ── boot: subscribe to inbound friend messages exactly once ────────── */
  function boot(){
    if (booted) return;
    var m = MP();
    if (!m || !m.MP){ setTimeout(boot, 400); return; }   // mp.js not up yet
    m.MP.friendHook = onFriend;
    booted = true;
  }

  /* ── inbound router (mp.js hands us every t:'friend' message) ───────── */
  function onFriend(m){
    var k = m && m.k;
    if (k === 'hello' || k === 'list'){
      if (typeof m.code === 'string') ST.code = m.code;
      if (Array.isArray(m.friends))  ST.friends  = m.friends;
      if (Array.isArray(m.incoming)) ST.incoming = m.incoming;
      if (Array.isArray(m.outgoing)) ST.outgoing = m.outgoing;
      ST.lastList = Date.now();
      badge();
      if (live) render();
      return;
    }
    if (k === 'req'){                       // a new incoming request
      if (!ST.incoming.some(function(r){ return r.id === m.id; })){
        ST.incoming.push({ id: m.id, n: m.n || 'SOMEBODY', k: m.from || '' });
      }
      badge();
      toast((m.n || 'Somebody') + ' wants to be friends.');
      if (live) render();
      return;
    }
    if (k === 'added'){                      // our outgoing request was accepted-for-send
      toast('Friend request sent to ' + (m.n || 'them') + '.');
      list(true);
      return;
    }
    if (k === 'accepted'){                    // a request (either side) became a friendship
      toast((m.n || 'You') + ' are now friends.');
      list(true);
      return;
    }
    if (k === 'removed'){ list(true); return; }
    if (k === 'dm'){                          // an incoming direct message
      var key = m.from || (ST.chatWith && ST.chatWith.k);
      if (key){
        (ST.chats[key] = ST.chats[key] || []).push({ me:false, x: String(m.x || ''), t: m.t2 || m.t || Date.now() });
      }
      var viewing = live && ST.view === 'chat' && ST.chatWith && ST.chatWith.k === key;
      if (viewing){
        renderChat(); scrollChat();          // seen right now -> stays read
      } else {
        /* unread: bump the per-friend counter that feeds the tab bubble and
           the chat-button badge, and toast a peek. */
        if (key) ST.unread[key] = (ST.unread[key] | 0) + 1;
        badge();
        if (live && ST.view === 'list') render();
        var who = friendName(key) || (m.n || 'A friend');
        toast(who + ': ' + String(m.x || '').slice(0, 40));
      }
      return;
    }
    if (k === 'hist'){                        // chat history for a friend
      if (m.with){
        ST.chats[m.with] = (Array.isArray(m.msgs) ? m.msgs : []).map(function(r){
          return { me: !!r.me, x: String(r.x || ''), t: r.t || 0 };
        });
        if (live && ST.view === 'chat' && ST.chatWith && ST.chatWith.k === m.with){
          renderChat(); scrollChat();
        }
      }
      return;
    }
    if (k === 'presence'){ list(); return; }  // a friend's activity changed -> re-poll
    if (k === 'err'){ toast(m.why || 'That did not work.'); return; }
  }

  function friendName(key){
    var f = ST.friends.filter(function(x){ return x.k === key; })[0];
    return f ? f.n : null;
  }

  /* ── talking to the relay ───────────────────────────────────────────── */
  function hello(){ boot(); keepSocket(); tx({ t:'friendhello' }); }
  function list(force){
    if (!force && Date.now() - ST.lastList < 1500) return;
    keepSocket(); tx({ t:'friendlist' });
  }
  function addByCode(code){
    code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4){ toast('That friend code looks too short.'); return; }
    if (ST.code && code === ST.code){ toast('That is your own code.'); return; }
    tx({ t:'friendadd', code: code });
  }
  function addByName(name){
    name = String(name || '').trim();
    if (!name){ return; }
    tx({ t:'friendadd', name: name });
  }
  function accept(id){ tx({ t:'friendaccept', id: id }); ST.incoming = ST.incoming.filter(function(r){ return r.id !== id; }); badge(); render(); }
  function decline(id){ tx({ t:'frienddecline', id: id }); ST.incoming = ST.incoming.filter(function(r){ return r.id !== id; }); badge(); render(); }
  function remove(key){ tx({ t:'friendremove', k: key }); }
  function sendDM(key, text){
    text = String(text || '').trim().slice(0, 240);
    if (!text) return;
    (ST.chats[key] = ST.chats[key] || []).push({ me:true, x:text, t: Date.now() });
    tx({ t:'friendmsg', to: key, x: text });
  }
  function history(key){ tx({ t:'friendhist', with: key }); }

  /* Invite a friend to a game — reuse mp.js's room+invite machinery exactly
     as the "recently played with" strip does: aim the auto-invite at the
     friend, then open a room for the chosen game. The instant the relay
     creates the room, mp.js fires the invite to that account. */
  function inviteToGame(name, game){
    try {
      var m = MP();
      if (!m){ toast('Multiplayer is not ready.'); return; }
      if (m.MP) m.MP.askBack = name;         // invite the moment a room exists
      if (m.openFor) m.openFor(game);         // opens the room -> auto-invites
      toast('Opening a room and inviting ' + name + '…');
    } catch (e){ toast('Could not open a room.'); }
  }

  /* ── the screen ─────────────────────────────────────────────────────── */
  function screenEl(){
    if (scr && scr.isConnected) return scr;
    scr = document.getElementById('scr-friends');
    if (!scr){
      scr = document.createElement('section');
      scr.className = 'screen';
      scr.id = 'scr-friends';
      (document.getElementById('app') || document.body).appendChild(scr);
    }
    return scr;
  }

  function show(){
    injectCSS();
    var el = screenEl();
    var app = document.getElementById('app');
    if (app) for (var i = 0; i < app.children.length; i++){
      var s = app.children[i];
      if (s !== el && s.classList && s.classList.contains('screen')) s.classList.remove('on');
    }
    el.classList.add('on');
    live = true;
    /* mirror the router's aria-current onto the Friends tab (go() does this for
       the built-in screens; we set it here because open() may add .on directly). */
    try {
      $$('#home-nav .tab').forEach(function(t){
        if (t.dataset && t.dataset.scr === 'friends') t.setAttribute('aria-current', 'page');
        else t.removeAttribute('aria-current');
      });
    } catch (e){}
    watch();
  }

  function watch(){
    if (mo) return;
    mo = new MutationObserver(function(){
      if (scr && !scr.classList.contains('on') && live){ live = false; }
    });
    if (scr) mo.observe(scr, { attributes:true, attributeFilter:['class'] });
  }

  /* entry point — wired to #btn-friends and exported */
  function open(){
    boot();
    show();
    ST.view = 'list';
    render();
    if (signedIn()){ hello(); list(true); }
  }

  /* ── render ─────────────────────────────────────────────────────────── */
  function render(){
    var el = screenEl();
    if (!signedIn()){ el.innerHTML = shell(guestBody()); wireBack(); return; }
    if (ST.view === 'add'){  el.innerHTML = shell(addBody());  wireBack(); wireAdd();  return; }
    if (ST.view === 'chat'){ renderChat(); return; }
    if (ST.view === 'profile'){ renderProfile(); return; }
    el.innerHTML = shell(listBody());
    wireBack(); wireList();
    paintFaces();
    badge();
  }

  function shell(body){
    return (
      '<div class="tbar">' +
        '<button class="iconbtn" id="fr-back" aria-label="Back to home">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-back"></use></svg></button>' +
        '<h2>' + (ST.view === 'chat' && ST.chatWith ? esc(ST.chatWith.n) : 'Friends') + '</h2>' +
        (ST.view === 'list'
          ? '<button class="fr-addbtn" id="fr-goadd" type="button">' +
              '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-plus"></use></svg>Add</button>'
          : '<span class="pill mono" id="fr-hdrpill"></span>') +
      '</div>' +
      '<div class="scroll fr-scroll">' + body + '</div>'
    );
  }

  function guestBody(){
    return (
      '<div class="fr-empty">' +
        '<svg class="fr-bigico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-users"></use></svg>' +
        '<p class="fr-elead">Sign in to add friends</p>' +
        '<p class="fr-esub">Friends are tied to your account so they follow you to any phone. ' +
          'Create an account or log in, then come back here.</p>' +
        '<button class="btn primary" id="fr-signin" type="button">Sign in</button>' +
      '</div>'
    );
  }

  /* ── FRIENDS LIST + incoming requests + your code ───────────────────── */
  function listBody(){
    var out = '';

    /* your own friend code — copy / share */
    out += '<div class="fr-codecard">' +
      '<div class="fr-codelead">YOUR FRIEND CODE</div>' +
      '<div class="fr-coderow">' +
        '<span class="fr-code" id="fr-code">' + esc(ST.code || '· · · ·') + '</span>' +
        '<button class="fr-cbtn" id="fr-copy" type="button" aria-label="Copy your friend code">' +
          '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-pile"></use></svg></button>' +
        '<button class="fr-cbtn" id="fr-share" type="button" aria-label="Share your friend code">' +
          '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-arrow-right"></use></svg></button>' +
      '</div>' +
      '<p class="fr-codehint">Give this to a friend so they can add you.</p>' +
    '</div>';

    /* THE PENDING-THINGS STRIP — a clear breakdown of what wants attention,
       each chip jumping to the right place. Mirrors the tab bubble total. */
    out += breakdownStrip();

    /* NOTIFICATIONS — the only way a game invite can open the installed app on
       iPhone is a push notification tap (a plain link always opens Safari), so
       gently offer to turn them on. Shown only when supported and currently off. */
    if (pushOffButAvailable()){
      out += '<button class="fr-notify" id="fr-notify" type="button">' +
        '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-warn"></use></svg>' +
        '<span><b>Turn on invite alerts</b><small>So a friend’s game invite can open KARTI on your phone.</small></span>' +
      '</button>';
    }

    /* incoming requests — accept / decline */
    if (ST.incoming.length){
      out += '<div class="fr-sect">REQUESTS <span class="fr-cnt">' + ST.incoming.length + '</span></div>';
      out += ST.incoming.map(function(r){
        return '<div class="fr-row fr-req">' +
          /* a requester is a real account (r.k came off the wire with the
             request), so give the ONE renderer everything the row carries.
             The relay does not yet stamp pv on request rows; the moment it
             does, the photograph lights up here with no client change. */
          avatar(r.n, 40, r.pv, r.k, r.av, r.bd) +
          '<div class="fr-who"><span class="fr-name">' + esc(r.n) + '</span>' +
            '<span class="fr-sub">wants to be friends</span></div>' +
          '<div class="fr-reqbtns">' +
            '<button class="fr-acc" data-acc="' + esc(r.id) + '" type="button">Accept</button>' +
            '<button class="fr-dec" data-dec="' + esc(r.id) + '" type="button" aria-label="Decline">' +
              '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-close"></use></svg></button>' +
          '</div></div>';
      }).join('');
    }

    /* pending outgoing */
    if (ST.outgoing.length){
      out += '<div class="fr-sect">SENT</div>';
      out += ST.outgoing.map(function(r){
        return '<div class="fr-row fr-pending">' +
          avatar(r.n, 40, r.pv, r.k, r.av, r.bd) +
          '<div class="fr-who"><span class="fr-name">' + esc(r.n) + '</span>' +
            '<span class="fr-sub">request pending…</span></div></div>';
      }).join('');
    }

    /* the friends themselves — presence + activity */
    out += '<div class="fr-sect">FRIENDS <span class="fr-cnt">' + ST.friends.length + '</span></div>';
    if (!ST.friends.length){
      out += '<p class="fr-hint">No friends yet. Add one by their code, or from the ' +
        '“recently played” list below.</p>';
    } else {
      var sorted = ST.friends.slice().sort(function(a, b){
        var oa = (a.s && a.s !== 'off') ? 0 : 1, ob = (b.s && b.s !== 'off') ? 0 : 1;
        if (oa !== ob) return oa - ob;
        return String(a.n).toLowerCase() < String(b.n).toLowerCase() ? -1 : 1;
      });
      out += sorted.map(friendRow).join('');
    }

    /* recently played online — one-tap add. From KARTI_MP.recent() (display
       names only; the relay never hands out account keys). We hide anyone who
       is already a friend or already has a pending request. */
    var rec = recentOpponents();
    if (rec.length){
      out += '<div class="fr-sect">RECENTLY PLAYED</div>';
      out += rec.map(function(p){
        /* Recently-played rows carry pv but no account key — the relay
           deliberately names people by display name only. Its own contract
           (server v_username) is that the account key IS the name lower-cased,
           and the "who" answer's comment says the photo URL is built exactly
           that way — so derive it, and ONLY when pv says a photograph exists,
           so no URL is ever invented for somebody without one. */
        return '<div class="fr-row">' +
          avatar(p.n, 40, p.pv, p.pv ? String(p.n || '').toLowerCase() : '', p.av, p.bd) +
          '<div class="fr-who"><span class="fr-name">' + esc(p.n) + '</span>' +
            '<span class="fr-sub">' + (p.games ? p.games + (p.games === 1 ? ' game' : ' games') + ' together' : 'played online') + '</span></div>' +
          '<button class="fr-add1" data-addname="' + esc(p.n) + '" type="button">' +
            '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-plus"></use></svg>Add</button>' +
        '</div>';
      }).join('');
    }

    return out;
  }

  function recentOpponents(){
    var rec = [];
    try { rec = (MP() && MP().recent) ? MP().recent() : []; } catch (e){ rec = []; }
    var mine = {};
    ST.friends.forEach(function(f){ mine[String(f.n).toLowerCase()] = 1; });
    ST.outgoing.forEach(function(r){ mine[String(r.n).toLowerCase()] = 1; });
    var meLower = myName().toLowerCase();
    var seen = {};
    return rec.filter(function(p){
      var kk = String(p.n || '').toLowerCase();
      if (!kk || kk === meLower || mine[kk] || seen[kk]) return false;
      seen[kk] = 1; return true;
    }).slice(0, 8);
  }

  function friendRow(f){
    var st = presenceOf(f);
    var un = ST.unread[f.k] | 0;
    return '<div class="fr-row fr-friend s-' + st.cls + '" data-fk="' + esc(f.k) + '" data-fn="' + esc(f.n) + '" ' +
      'role="button" tabindex="0" aria-label="Open ' + esc(f.n) + '’s profile">' +
      '<div class="fr-avwrap">' + avatar(f.n, 44, f.pv, f.k, f.av, f.bd) + '<i class="fr-dot ' + st.cls + '"></i></div>' +
      '<div class="fr-who"><span class="fr-name">' + esc(f.n) + '</span>' +
        '<span class="fr-sub">' + esc(st.word) + '</span></div>' +
      '<button class="fr-chatbtn" data-chat="' + esc(f.k) + '" type="button" aria-label="Chat with ' + esc(f.n) + '">' +
        '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-book"></use></svg>' +
        (un ? '<i class="fr-unread" aria-label="' + un + ' unread">' + (un > 9 ? '9+' : un) + '</i>' : '') +
      '</button>' +
      '<button class="fr-invbtn" data-inv="' + esc(f.k) + '" type="button" aria-label="Invite ' + esc(f.n) + ' to a game">' +
        '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-play"></use></svg></button>' +
    '</div>';
  }

  /* the friend behind a key, or a minimal stub so a profile still opens */
  function friendBy(key){
    var f = ST.friends.filter(function(x){ return x.k === key; })[0];
    return f || { k:key, n: (ST.profileOf && ST.profileOf.k === key ? ST.profileOf.n : key), s:'off' };
  }

  function presenceOf(f){
    if (!f.s || f.s === 'off') return { cls:'off', word:'Offline' };
    if (f.g){
      var nm = gameName(f.g);
      if (f.s === 'playing') return { cls:'playing', word:'Playing ' + nm };
      if (f.s === 'waiting') return { cls:'waiting', word:'Waiting in ' + nm };
      return { cls:'online', word:'In ' + nm };
    }
    return { cls:'online', word:'Online' };
  }

  function gameName(id){
    try {
      var m = MP();
      if (m && m.gameMeta) return m.gameMeta(m.cleanGame ? m.cleanGame(id) : id).name;
    } catch (e){}
    return id || 'a game';
  }

  /* THE REAL AVATAR. The same declarative span the leaderboard, roster and
     seat plates use: KARTI_XP.repaintAvatars() reads data-kx-av (+ data-kx-pv,
     the relay-published photo version) and mounts the actual profile photo the
     moment it decodes — no photo, no request, drawn face as the always-there
     fallback. `pv` is the friend's avatar version the relay sends per row. */
  function avatar(name, size, pv, who, hint, border){
    /* who = the friend's ACCOUNT KEY (f.k). The photo URL is built from the key,
       NOT the display name, so without it a friend's photograph never loads —
       which is exactly why friends showed no picture. pv is their photo version.
       hint/border = the face and ring THEY chose, whenever the relay publishes
       them beside the row (the same k-look blob the room roster carries) — so a
       friend with no photograph still shows the face they picked, not a
       name-derived default. Absent fields simply write no attribute, exactly
       like pv, so an older relay changes nothing. */
    var av = '<span class="fr-av" data-kx-av="' + esc(name || '') + '"' +
      ' data-kx-size="' + (size || 40) + '"' +
      (who ? ' data-kx-who="' + esc(who) + '"' : '') +
      (pv ? ' data-kx-pv="' + (pv | 0) + '"' : '') +
      (hint ? ' data-kx-face="' + esc(hint) + '"' : '') +
      (border ? ' data-kx-border="' + esc(border) + '"' : '') + '></span>';
    return av;
  }
  /* mount the photos after any render that drew avatars */
  function paintFaces(){
    try { var x = window.KARTI_XP; if (x && x.repaintAvatars) x.repaintAvatars(screenEl()); }
    catch (e){}
  }

  /* ── the pending-things breakdown strip ─────────────────────────────── */
  function breakdownStrip(){
    var t = tally();
    if (!t.req && !t.msg && !t.inv) return '';
    var chips = '';
    if (t.req) chips += '<button class="fr-chip" data-jump="req" type="button">' +
      '<b>' + t.req + '</b> ' + (t.req === 1 ? 'request' : 'requests') + '</button>';
    if (t.msg) chips += '<button class="fr-chip msg" data-jump="msg" type="button">' +
      '<b>' + t.msg + '</b> ' + (t.msg === 1 ? 'message' : 'messages') + '</button>';
    if (t.inv) chips += '<button class="fr-chip inv" data-jump="inv" type="button">' +
      '<b>' + t.inv + '</b> ' + (t.inv === 1 ? 'invite' : 'invites') + '</button>';
    return '<div class="fr-breakdown" role="group" aria-label="Pending notifications">' + chips + '</div>';
  }

  /* ── PROFILE VIEW — a clean card for one friend ─────────────────────── */
  function renderProfile(){
    var el = screenEl();
    var f = ST.profileOf ? friendBy(ST.profileOf.k) : null;
    if (!f){ ST.view = 'list'; render(); return; }
    var st = presenceOf(f);
    var rec = f.rec || null;                 // {w,l[,d]} if the relay ever sends it
    var games = (f.rec && f.rec.p != null) ? f.rec.p
              : (typeof f.games === 'number' ? f.games : null);

    var statCards = '';
    if (rec && (rec.w != null || rec.l != null)){
      statCards =
        '<div class="fr-stats">' +
          '<div class="fr-stat"><span class="fr-stat-n">' + (rec.w | 0) + '</span><span class="fr-stat-l">Wins</span></div>' +
          '<div class="fr-stat"><span class="fr-stat-n">' + (rec.l | 0) + '</span><span class="fr-stat-l">Losses</span></div>' +
          (games != null ? '<div class="fr-stat"><span class="fr-stat-n">' + (games | 0) + '</span><span class="fr-stat-l">Played</span></div>' : '') +
        '</div>';
    } else {
      statCards = '<p class="fr-nostat">Win record is private for now.</p>';
    }

    el.innerHTML =
      '<div class="tbar">' +
        '<button class="iconbtn" id="fr-back" aria-label="Back to friends">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-back"></use></svg></button>' +
        '<h2>Profile</h2>' +
        '<span class="pill mono"></span>' +
      '</div>' +
      '<div class="scroll fr-scroll">' +
        '<div class="fr-profcard s-' + st.cls + '">' +
          '<div class="fr-profav">' + avatar(f.n, 96, f.pv, f.k, f.av, f.bd) + '<i class="fr-dot big ' + st.cls + '"></i></div>' +
          '<h3 class="fr-profname">' + esc(f.n) + '</h3>' +
          '<div class="fr-profstatus"><i class="fr-dot ' + st.cls + '"></i>' + esc(st.word) + '</div>' +
          statCards +
        '</div>' +
        '<div class="fr-profactions">' +
          '<button class="btn primary fr-pa" id="fr-pa-msg" type="button">' +
            '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-book"></use></svg>Message</button>' +
          '<button class="btn fr-pa" id="fr-pa-inv" type="button">' +
            '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-play"></use></svg>Invite to a game</button>' +
          '<button class="btn ghost fr-pa fr-pa-remove" id="fr-pa-rm" type="button">Unfriend</button>' +
        '</div>' +
      '</div>';

    var back = $('#fr-back');
    if (back) back.onclick = function(){ ST.view = 'list'; ST.profileOf = null; render(); };
    var msg = $('#fr-pa-msg'); if (msg) msg.onclick = function(){ openChat(f.k); };
    var inv = $('#fr-pa-inv'); if (inv) inv.onclick = function(){ pickGameFor(f.k); };
    var rm = $('#fr-pa-rm');   if (rm)  rm.onclick  = function(){ confirmUnfriend(f); };
    paintFaces();
  }

  function openProfile(key){
    var f = friendBy(key);
    ST.profileOf = { k: f.k, n: f.n };
    ST.view = 'profile';
    render();
    list(true);                              // refresh presence/record for this view
  }

  function confirmUnfriend(f){
    var html =
      '<h3 class="fr-sheet-h">Remove ' + esc(f.n) + '?</h3>' +
      '<p class="fr-hint" style="text-align:center;margin:0 0 14px">You’ll both drop off each other’s ' +
        'friends list. You can add them again with their code.</p>' +
      '<div class="fr-confirm">' +
        '<button class="btn ghost" id="fr-cf-no" type="button">Cancel</button>' +
        '<button class="btn hot" id="fr-cf-yes" type="button">Unfriend</button>' +
      '</div>';
    var host = openSheet(html);
    if (!host) { remove(f.k); ST.view = 'list'; ST.profileOf = null; render(); return; }
    var no = $('#fr-cf-no', host); if (no) no.onclick = closeSheet;
    var yes = $('#fr-cf-yes', host); if (yes) yes.onclick = function(){
      closeSheet(); remove(f.k); ST.view = 'list'; ST.profileOf = null; render();
    };
  }

  /* ── ADD screen ─────────────────────────────────────────────────────── */
  function addBody(){
    return (
      '<div class="fr-addwrap">' +
        '<label class="fr-lbl" for="fr-codein">ADD BY FRIEND CODE</label>' +
        '<div class="fr-inrow">' +
          '<input class="field fr-codein" id="fr-codein" type="text" inputmode="latin" autocapitalize="characters" ' +
            'autocomplete="off" spellcheck="false" maxlength="12" placeholder="e.g. K7QF3M" aria-label="Friend code">' +
          '<button class="btn primary sm fr-send" id="fr-addcode" type="button">Send</button>' +
        '</div>' +
        '<p class="fr-hint">A friend request needs to be accepted before you become friends.</p>' +
        '<div class="fr-yourcode">Your code: <b>' + esc(ST.code || '· · · ·') + '</b> ' +
          '<button class="fr-inlinecopy" id="fr-copy2" type="button">copy</button></div>' +
      '</div>'
    );
  }

  /* ── CHAT screen ────────────────────────────────────────────────────── */
  function renderChat(){
    var el = screenEl();
    var msgs = (ST.chatWith && ST.chats[ST.chatWith.k]) || [];
    var body =
      '<div class="fr-chatlog" id="fr-chatlog">' +
        (msgs.length
          ? msgs.map(function(mm){
              return '<div class="fr-bubble ' + (mm.me ? 'me' : 'them') + '">' + esc(mm.x) + '</div>';
            }).join('')
          : '<p class="fr-hint fr-chatempty">Say hi — plan a game. Messages reach ' +
              esc(ST.chatWith ? ST.chatWith.n : 'your friend') + ' wherever they are signed in.</p>') +
      '</div>' +
      '<form class="fr-chatbar" id="fr-chatbar">' +
        '<input class="field fr-chatin" id="fr-chatin" type="text" maxlength="240" ' +
          'autocomplete="off" placeholder="Message…" aria-label="Type a message">' +
        '<button class="fr-sendmsg" id="fr-chatsend" type="submit" aria-label="Send message">' +
          '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-arrow-right"></use></svg></button>' +
      '</form>';
    el.innerHTML =
      '<div class="tbar">' +
        '<button class="iconbtn" id="fr-back" aria-label="Back to friends">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-back"></use></svg></button>' +
        '<h2>' + esc(ST.chatWith ? ST.chatWith.n : 'Chat') + '</h2>' +
        '<button class="fr-invbtn hdr" id="fr-chatinv" type="button" aria-label="Invite to a game">' +
          '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-play"></use></svg></button>' +
      '</div>' +
      '<div class="fr-chatpane">' + body + '</div>';
    wireChat();
    scrollChat();
  }

  function scrollChat(){
    var log = $('#fr-chatlog');
    if (log) log.scrollTop = log.scrollHeight;
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */
  function wireBack(){
    var b = $('#fr-back');
    if (b) b.onclick = function(){
      if (ST.view === 'add' || ST.view === 'chat'){ ST.view = 'list'; ST.chatWith = null; render(); }
      else { try { K().go('home'); } catch (e){} }
    };
    var si = $('#fr-signin');
    if (si) si.onclick = function(){ try { K().go('auth'); } catch (e){} };
  }

  function wireList(){
    var ga = $('#fr-goadd');
    if (ga) ga.onclick = function(){ ST.view = 'add'; render(); };

    var copy = $('#fr-copy');
    if (copy) copy.onclick = function(){ copyCode(); };
    var share = $('#fr-share');
    if (share) share.onclick = function(){ shareCode(); };

    var notify = $('#fr-notify');
    if (notify) notify.onclick = function(){ enableInviteAlerts(); };

    $$('.fr-acc').forEach(function(b){ b.onclick = function(){ accept(b.dataset.acc); }; });
    $$('.fr-dec').forEach(function(b){ b.onclick = function(){ decline(b.dataset.dec); }; });
    $$('[data-addname]').forEach(function(b){ b.onclick = function(){ addByName(b.dataset.addname); b.disabled = true; b.textContent = 'Sent'; }; });

    $$('[data-chat]').forEach(function(b){ b.onclick = function(e){ e.stopPropagation(); openChat(b.dataset.chat); }; });
    $$('[data-inv]').forEach(function(b){ b.onclick = function(e){ e.stopPropagation(); pickGameFor(b.dataset.inv); }; });
    /* tapping the row body opens that friend's PROFILE (chat/invite live on
       their own buttons and stop propagation) */
    $$('.fr-friend').forEach(function(row){
      row.onclick = function(){ openProfile(row.dataset.fk); };
      row.onkeydown = function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openProfile(row.dataset.fk); } };
    });

    /* the pending-things chips jump to their section / surface */
    $$('.fr-chip').forEach(function(c){
      c.onclick = function(){
        var j = c.dataset.jump;
        if (j === 'req'){ var r = $('.fr-req'); if (r) r.scrollIntoView({ block:'center' }); }
        else if (j === 'inv'){ try { K().go('mp'); } catch (e){} }
        else if (j === 'msg'){
          /* open the chat of the first friend with unread messages */
          var key = null; for (var kk in ST.unread){ if (ST.unread[kk] > 0){ key = kk; break; } }
          if (key) openChat(key);
        }
      };
    });
  }

  function wireAdd(){
    var send = $('#fr-addcode');
    var inp = $('#fr-codein');
    if (send && inp){
      send.onclick = function(){ addByCode(inp.value); inp.value = ''; };
      inp.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); send.click(); } });
    }
    var c2 = $('#fr-copy2');
    if (c2) c2.onclick = function(){ copyCode(); };
  }

  function wireChat(){
    wireBack();
    var form = $('#fr-chatbar');
    var inp = $('#fr-chatin');
    if (form && inp){
      form.addEventListener('submit', function(e){
        e.preventDefault();
        var v = inp.value;
        if (!v.trim() || !ST.chatWith) return;
        sendDM(ST.chatWith.k, v);
        inp.value = '';
        renderChat();
      });
    }
    var inv = $('#fr-chatinv');
    if (inv && ST.chatWith) inv.onclick = function(){ pickGameFor(ST.chatWith.k); };
  }

  function openChat(key){
    var f = friendBy(key);
    if (!f) return;
    ST.chatWith = { k: f.k, n: f.n };
    ST.view = 'chat';
    /* opening the chat marks it READ — clears this friend's unread tally and
       updates the tab bubble. */
    if (ST.unread[key]){ ST.unread[key] = 0; badge(); }
    if (!ST.chats[key]) history(key);        // pull persisted history from relay
    renderChat();
  }

  /* ── friend code copy / share ───────────────────────────────────────── */
  function copyCode(){
    if (!ST.code){ toast('Your code is loading…'); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(ST.code).then(function(){ toast('Friend code copied.'); },
          function(){ legacyCopy(ST.code); });
        return;
      }
    } catch (e){}
    legacyCopy(ST.code);
  }
  function legacyCopy(t){
    try {
      var ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      toast('Friend code copied.');
    } catch (e){ toast('Your code is ' + t); }
  }
  function shareCode(){
    if (!ST.code){ toast('Your code is loading…'); return; }
    var msg = 'Add me on KARTI — my friend code is ' + ST.code;
    try {
      if (navigator.share){ navigator.share({ title:'KARTI', text: msg }).catch(function(){}); return; }
    } catch (e){}
    copyCode();
  }

  /* ── pick-a-game sheet for an invite ────────────────────────────────── */
  function pickGameFor(key){
    var f = ST.friends.filter(function(x){ return x.k === key; })[0];
    if (!f){ toast('That friend is not in your list.'); return; }
    var games = onlineGames();
    var html =
      '<h3 class="fr-sheet-h">Invite ' + esc(f.n) + ' to…</h3>' +
      '<div class="fr-gamegrid">' +
        games.map(function(g){
          return '<button class="fr-gametile" data-g="' + esc(g.id) + '" type="button">' +
            '<span class="fr-gname">' + esc(g.name) + '</span></button>';
        }).join('') +
      '</div>';
    var host = openSheet(html);
    if (!host) return;
    $$('.fr-gametile', host).forEach(function(b){
      b.onclick = function(){ closeSheet(); inviteToGame(f.n, b.dataset.g); };
    });
  }

  function onlineGames(){
    var out = [];
    try {
      var m = MP();
      var keys = m && m.GAME_KEYS ? m.GAME_KEYS : (m && m.GAMES ? Object.keys(m.GAMES) : []);
      keys.forEach(function(id){
        try {
          if (!m.gamePlayable || m.gamePlayable(id)){
            out.push({ id: id, name: (m.gameMeta ? m.gameMeta(id).name : id) });
          }
        } catch (e){}
      });
    } catch (e){}
    if (!out.length) out = [{ id:'cards', name:'Card duel' }];
    return out.slice(0, 24);
  }

  /* borrow the app's own sheet if present, else build a minimal one */
  function openSheet(html){
    var sheet = document.getElementById('sheet');
    var scrim = document.getElementById('scrim');
    if (sheet && scrim){
      sheet.innerHTML = '<div class="fr-sheet">' + html + '</div>';
      sheet.classList.add('on'); scrim.classList.add('on');
      scrim.onclick = closeSheet;
      return sheet;
    }
    return null;
  }
  function closeSheet(){
    var sheet = document.getElementById('sheet');
    var scrim = document.getElementById('scrim');
    if (sheet) sheet.classList.remove('on');
    if (scrim) scrim.classList.remove('on');
  }

  /* ── the notification bubble on the Friends tab ─────────────────────────
     A count bubble showing the TOTAL of pending things: incoming friend
     requests + unread direct messages + live game invites. It reuses the
     #fr-badge element already in the tabbar; when there is a count it becomes
     a numbered bubble, otherwise it hides. Called on every data change. */
  function badge(){
    var dot = document.getElementById('fr-badge');
    if (!dot) return;
    var n = tallyTotal();
    if (n > 0){
      dot.textContent = n > 99 ? '99+' : String(n);
      dot.classList.add('fr-bubble-tab');
      dot.removeAttribute('hidden');
      dot.setAttribute('aria-label', n + ' pending: ' +
        [tally().req + ' requests', tally().msg + ' messages', tally().inv + ' invites'].join(', '));
    } else {
      dot.textContent = '';
      dot.classList.remove('fr-bubble-tab');
      dot.setAttribute('hidden', '');
    }
    /* keep the in-screen breakdown strip live if we are looking at the list */
    if (live && ST.view === 'list'){
      var strip = screenEl().querySelector('.fr-breakdown');
      var host = screenEl().querySelector('.fr-codecard');
      var fresh = breakdownStrip();
      if (strip){
        if (fresh){ strip.outerHTML = fresh; } else { strip.remove(); }
        rewireChips();
      } else if (fresh && host && host.parentNode){
        host.insertAdjacentHTML('afterend', fresh);
        rewireChips();
      }
    }
  }
  function rewireChips(){
    $$('.fr-chip').forEach(function(c){
      c.onclick = function(){
        var j = c.dataset.jump;
        if (j === 'req'){ var r = $('.fr-req'); if (r) r.scrollIntoView({ block:'center' }); }
        else if (j === 'inv'){ try { K().go('mp'); } catch (e){} }
        else if (j === 'msg'){
          var key = null; for (var kk in ST.unread){ if (ST.unread[kk] > 0){ key = kk; break; } }
          if (key) openChat(key);
        }
      };
    });
  }

  /* ── boot-time: keep the badge/list warm even off-screen ────────────── */
  function heartbeat(){
    if (!signedIn()){ return; }
    boot();
    /* if the relay socket is up (Home/Online/Friends), keep our data fresh so
       the tab badge lights up without needing to open the tab. */
    if (Date.now() - ST.lastList > 20000){ hello(); }
    /* game invites arrive on mp.js's INBOX (not our hook), so re-tally the
       bubble every heartbeat to fold live invite count in. */
    badge();
  }

  /* ── CSS (scoped to #scr-friends), injected once ────────────────────── */
  var cssDone = false;
  function injectCSS(){
    if (cssDone) return; cssDone = true;
    var css =
    '#scr-friends .fr-scroll{display:flex;flex-direction:column;gap:9px;padding-bottom:24px}' +
    '#scr-friends .fr-addbtn{display:inline-flex;align-items:center;gap:4px;font-family:var(--disp);' +
      'font-weight:900;font-size:11px;letter-spacing:.06em;color:#241800;background:var(--gold);' +
      'border:0;border-radius:99px;padding:7px 12px}' +
    '#scr-friends .fr-addbtn .ico{font-size:13px}' +
    '#scr-friends .fr-addbtn:active{transform:scale(.94)}' +
    /* code card */
    '#scr-friends .fr-codecard{border:1px solid var(--line);border-radius:15px;padding:12px 13px 11px;' +
      'background:radial-gradient(120% 130% at 100% 0%,rgba(138,92,255,.18),rgba(27,20,48,.6))}' +
    '#scr-friends .fr-codelead{font-size:10px;letter-spacing:.16em;color:var(--dim);font-weight:800}' +
    '#scr-friends .fr-coderow{display:flex;align-items:center;gap:8px;margin-top:6px}' +
    '#scr-friends .fr-code{flex:1;min-width:0;font-family:var(--disp);font-weight:900;font-size:26px;' +
      'letter-spacing:.14em;color:var(--gold);text-shadow:0 0 22px rgba(255,197,66,.28);overflow:hidden;' +
      'text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-friends .fr-cbtn{width:38px;height:38px;flex:0 0 auto;display:grid;place-items:center;' +
      'border-radius:11px;border:1px solid var(--line2);background:rgba(255,255,255,.05);color:var(--txt)}' +
    '#scr-friends .fr-cbtn .ico{font-size:16px}' +
    '#scr-friends .fr-cbtn:active{transform:scale(.9);background:rgba(255,255,255,.12)}' +
    '#scr-friends .fr-codehint{font-size:10.5px;color:var(--dim);margin:8px 0 0}' +
    /* notifications nudge */
    '#scr-friends .fr-notify{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'padding:10px 12px;border-radius:13px;border:1px solid rgba(138,92,255,.4);' +
      'background:rgba(138,92,255,.12);color:#F4EFFF}' +
    '#scr-friends .fr-notify .ico{font-size:18px;color:var(--neon);flex:0 0 auto}' +
    '#scr-friends .fr-notify b{display:block;font-family:var(--disp);font-weight:900;font-size:12px}' +
    '#scr-friends .fr-notify small{display:block;font-size:10.5px;color:var(--dim);margin-top:1px;line-height:1.4}' +
    '#scr-friends .fr-notify:active{transform:scale(.99);background:rgba(138,92,255,.2)}' +
    /* section headers */
    '#scr-friends .fr-sect{display:flex;align-items:center;gap:7px;font-size:10px;letter-spacing:.16em;' +
      'font-weight:800;color:var(--dim2);text-transform:uppercase;margin:6px 2px 1px}' +
    '#scr-friends .fr-cnt{font-family:var(--disp);font-weight:900;font-size:10px;color:#241800;' +
      'background:var(--gold);border-radius:99px;padding:1px 7px;letter-spacing:.04em}' +
    '#scr-friends .fr-hint{font-size:11px;line-height:1.5;color:var(--dim);margin:2px 2px 4px}' +
    /* rows */
    '#scr-friends .fr-row{display:flex;align-items:center;gap:10px;min-height:52px;padding:7px 10px;' +
      'border-radius:13px;background:rgba(255,255,255,.045);border:1px solid transparent}' +
    '#scr-friends .fr-friend{cursor:pointer}' +
    '#scr-friends .fr-friend:active{background:rgba(255,255,255,.09)}' +
    '#scr-friends .fr-avwrap{position:relative;flex:0 0 auto}' +
    '#scr-friends .fr-av{width:40px;height:40px;border-radius:11px;overflow:hidden;display:grid;' +
      'place-items:center;font-family:var(--disp);font-weight:900;background:var(--panel2);color:var(--gold)}' +
    '#scr-friends .fr-dot{position:absolute;right:-2px;bottom:-2px;width:12px;height:12px;border-radius:50%;' +
      'border:2px solid var(--bg);background:var(--dim2)}' +
    '#scr-friends .fr-dot.online,#scr-friends .fr-dot.waiting{background:var(--ok);box-shadow:0 0 6px var(--ok)}' +
    '#scr-friends .fr-dot.playing{background:var(--hot);box-shadow:0 0 6px var(--hot)}' +
    '#scr-friends .fr-dot.off{background:var(--dim2)}' +
    '#scr-friends .fr-who{flex:1;min-width:0}' +
    '#scr-friends .fr-name{display:block;font-family:var(--disp);font-weight:900;font-size:13px;' +
      'letter-spacing:.02em;color:#F4EFFF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-friends .fr-sub{display:block;font-size:10.5px;color:var(--dim);margin-top:1px;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-friends .s-playing .fr-sub{color:#FFB59E}' +
    '#scr-friends .s-online .fr-sub,#scr-friends .s-waiting .fr-sub{color:#9CE9BE}' +
    /* row action buttons */
    '#scr-friends .fr-chatbtn,#scr-friends .fr-invbtn{width:38px;height:38px;flex:0 0 auto;display:grid;' +
      'place-items:center;border-radius:11px;border:1px solid var(--line2);background:rgba(255,255,255,.05);' +
      'color:var(--txt)}' +
    '#scr-friends .fr-invbtn{color:#241800;background:var(--gold);border-color:transparent}' +
    '#scr-friends .fr-invbtn.hdr{width:40px;height:40px}' +
    '#scr-friends .fr-chatbtn .ico,#scr-friends .fr-invbtn .ico{font-size:16px}' +
    '#scr-friends .fr-chatbtn:active,#scr-friends .fr-invbtn:active{transform:scale(.9)}' +
    /* requests */
    '#scr-friends .fr-req{border-color:rgba(255,197,66,.35);background:rgba(255,197,66,.08)}' +
    '#scr-friends .fr-reqbtns{display:flex;align-items:center;gap:6px;flex:0 0 auto}' +
    '#scr-friends .fr-acc{font-family:var(--disp);font-weight:900;font-size:11px;letter-spacing:.05em;' +
      'color:#241800;background:var(--gold);border:0;border-radius:99px;padding:8px 13px}' +
    '#scr-friends .fr-acc:active{transform:scale(.94)}' +
    '#scr-friends .fr-dec{width:34px;height:34px;flex:0 0 auto;display:grid;place-items:center;border-radius:10px;' +
      'border:1px solid var(--line2);background:rgba(255,255,255,.05);color:var(--dim)}' +
    '#scr-friends .fr-dec .ico{font-size:14px}' +
    '#scr-friends .fr-pending{opacity:.72}' +
    '#scr-friends .fr-add1{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;font-family:var(--disp);' +
      'font-weight:900;font-size:10.5px;letter-spacing:.05em;color:var(--gold);background:rgba(255,197,66,.12);' +
      'border:1px solid rgba(255,197,66,.4);border-radius:99px;padding:6px 11px}' +
    '#scr-friends .fr-add1 .ico{font-size:12px}' +
    '#scr-friends .fr-add1:active{transform:scale(.94)}' +
    '#scr-friends .fr-add1[disabled]{opacity:.55;border-color:var(--line)}' +
    /* add screen */
    '#scr-friends .fr-addwrap{display:flex;flex-direction:column;gap:9px;padding-top:4px}' +
    '#scr-friends .fr-lbl{font-size:10px;letter-spacing:.16em;font-weight:800;color:var(--dim);text-transform:uppercase}' +
    '#scr-friends .fr-inrow{display:flex;gap:8px;align-items:stretch}' +
    '#scr-friends .fr-codein{flex:1;min-width:0;text-transform:uppercase;letter-spacing:.14em;' +
      'font-family:var(--disp);font-weight:800;font-size:18px}' +
    '#scr-friends .fr-send{flex:0 0 auto;white-space:nowrap}' +
    '#scr-friends .fr-yourcode{font-size:11.5px;color:var(--dim);margin-top:4px}' +
    '#scr-friends .fr-yourcode b{color:var(--gold);letter-spacing:.1em;font-family:var(--disp)}' +
    '#scr-friends .fr-inlinecopy,#scr-friends .fr-yourcode .fr-inlinecopy{background:none;border:0;' +
      'color:var(--neon);font-size:11.5px;text-decoration:underline;padding:2px 4px}' +
    /* empty / guest */
    '#scr-friends .fr-empty{display:flex;flex-direction:column;align-items:center;text-align:center;' +
      'gap:10px;padding:26px 16px 8px}' +
    '#scr-friends .fr-bigico{width:52px;height:52px;color:var(--neon);opacity:.9}' +
    '#scr-friends .fr-elead{font-family:var(--disp);font-weight:900;font-size:17px;color:#F4EFFF;margin:0}' +
    '#scr-friends .fr-esub{font-size:12px;line-height:1.55;color:var(--dim);max-width:280px;margin:0}' +
    '#scr-friends .fr-empty .btn{margin-top:6px;min-width:160px}' +
    /* chat */
    '#scr-friends .fr-chatpane{flex:1;min-height:0;display:flex;flex-direction:column}' +
    '#scr-friends .fr-chatlog{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;' +
      'gap:6px;padding:6px 2px 10px}' +
    '#scr-friends .fr-bubble{max-width:78%;padding:8px 12px;border-radius:15px;font-size:13px;line-height:1.4;' +
      'word-break:break-word}' +
    '#scr-friends .fr-bubble.me{align-self:flex-end;background:var(--gold);color:#241800;border-bottom-right-radius:5px}' +
    '#scr-friends .fr-bubble.them{align-self:flex-start;background:var(--panel2);color:#F4EFFF;' +
      'border-bottom-left-radius:5px;border:1px solid var(--line)}' +
    '#scr-friends .fr-chatempty{text-align:center;margin:auto;max-width:250px}' +
    '#scr-friends .fr-chatbar{display:flex;gap:8px;align-items:stretch;padding:6px 0 2px;flex:0 0 auto}' +
    '#scr-friends .fr-chatin{flex:1;min-width:0}' +
    '#scr-friends .fr-sendmsg{width:46px;flex:0 0 auto;display:grid;place-items:center;border-radius:12px;' +
      'border:0;background:var(--gold);color:#241800}' +
    '#scr-friends .fr-sendmsg .ico{font-size:18px}' +
    '#scr-friends .fr-sendmsg:active{transform:scale(.92)}' +
    /* invite sheet */
    '.fr-sheet{padding:14px 16px 20px}' +
    '.fr-sheet-h{font-family:var(--disp);font-weight:900;font-size:15px;color:#F4EFFF;margin:0 0 12px;text-align:center}' +
    '.fr-gamegrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}' +
    '.fr-gametile{min-height:52px;border-radius:12px;border:1px solid var(--line2);background:rgba(255,255,255,.05);' +
      'color:#F4EFFF;font-family:var(--disp);font-weight:800;font-size:12.5px;padding:8px;display:flex;' +
      'align-items:center;justify-content:center;text-align:center}' +
    '.fr-gametile:active{transform:scale(.96);border-color:var(--gold);background:rgba(255,197,66,.12)}' +
    /* ── the tab notification bubble ── */
    '#btn-friends{position:relative}' +
    '#fr-badge.fr-bubble-tab{position:absolute;top:3px;right:22%;min-width:16px;height:16px;padding:0 4px;' +
      'display:grid;place-items:center;border-radius:99px;background:var(--hot);color:#fff;' +
      'font-family:var(--disp);font-weight:900;font-size:9.5px;line-height:1;border:1.5px solid var(--bg);' +
      'box-shadow:0 0 8px rgba(232,69,44,.6)}' +
    /* ── pending-things breakdown strip ── */
    '#scr-friends .fr-breakdown{display:flex;gap:7px;flex-wrap:wrap}' +
    '#scr-friends .fr-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;letter-spacing:.02em;' +
      'color:#F4EFFF;background:rgba(255,255,255,.06);border:1px solid var(--line2);border-radius:99px;' +
      'padding:6px 11px}' +
    '#scr-friends .fr-chip b{font-family:var(--disp);font-weight:900;color:var(--gold)}' +
    '#scr-friends .fr-chip.msg b{color:var(--neon)}' +
    '#scr-friends .fr-chip.inv b{color:var(--ok)}' +
    '#scr-friends .fr-chip:active{transform:scale(.96);background:rgba(255,255,255,.12)}' +
    /* ── unread badge on a friend row chat button ── */
    '#scr-friends .fr-chatbtn{position:relative}' +
    '#scr-friends .fr-unread{position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;padding:0 4px;' +
      'display:grid;place-items:center;border-radius:99px;background:var(--neon);color:#fff;' +
      'font-family:var(--disp);font-weight:900;font-size:9px;line-height:1;border:1.5px solid var(--bg)}' +
    /* ── PROFILE VIEW ── */
    '#scr-friends .fr-profcard{display:flex;flex-direction:column;align-items:center;text-align:center;' +
      'gap:8px;padding:20px 16px 18px;border:1px solid var(--line);border-radius:18px;' +
      'background:radial-gradient(130% 120% at 50% 0%,rgba(138,92,255,.18),rgba(27,20,48,.55))}' +
    '#scr-friends .fr-profav{position:relative;width:96px;height:96px}' +
    '#scr-friends .fr-profav .fr-av{width:96px;height:96px;border-radius:26px;overflow:hidden;display:grid;' +
      'place-items:center}' +
    '#scr-friends .fr-dot.big{width:20px;height:20px;right:0;bottom:0;border-width:3px}' +
    '#scr-friends .fr-profname{font-family:var(--disp);font-weight:900;font-size:21px;color:#F4EFFF;margin:2px 0 0;' +
      'letter-spacing:.02em}' +
    '#scr-friends .fr-profstatus{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dim)}' +
    '#scr-friends .fr-profstatus .fr-dot{position:static;border:0;width:9px;height:9px}' +
    '#scr-friends .s-playing .fr-profstatus{color:#FFB59E}' +
    '#scr-friends .s-online .fr-profstatus,#scr-friends .s-waiting .fr-profstatus{color:#9CE9BE}' +
    '#scr-friends .fr-stats{display:flex;gap:9px;margin-top:10px;width:100%;justify-content:center}' +
    '#scr-friends .fr-stat{flex:1;max-width:110px;display:flex;flex-direction:column;align-items:center;gap:2px;' +
      'padding:10px 8px;border-radius:13px;background:rgba(255,255,255,.05);border:1px solid var(--line)}' +
    '#scr-friends .fr-stat-n{font-family:var(--disp);font-weight:900;font-size:20px;color:var(--gold)}' +
    '#scr-friends .fr-stat-l{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}' +
    '#scr-friends .fr-nostat{font-size:11px;color:var(--dim2);margin:10px 0 0}' +
    '#scr-friends .fr-profactions{display:flex;flex-direction:column;gap:8px;margin-top:14px}' +
    '#scr-friends .fr-pa{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:7px}' +
    '#scr-friends .fr-pa .ico{font-size:16px}' +
    '#scr-friends .fr-pa-remove{color:var(--bad);border-color:rgba(255,84,104,.35)}' +
    /* confirm sheet */
    '.fr-confirm{display:flex;gap:9px}' +
    '.fr-confirm .btn{flex:1}';
    var tag = document.createElement('style');
    tag.id = 'fr-css';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  /* ── wire the tab + a delegated fallback, boot the hook ─────────────── */
  function wireTab(){
    var b = document.getElementById('btn-friends');
    if (b && !b.onclick) b.onclick = function(){ open(); };
    /* delegated fallback in case the button is repainted */
    document.addEventListener('click', function(e){
      var t = e.target && e.target.closest && e.target.closest('#btn-friends,[data-friends]');
      if (!t) return;
      e.preventDefault();
      open();
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ wireTab(); boot(); });
  } else { wireTab(); boot(); }
  /* keep the tab badge warm */
  setInterval(heartbeat, 15000);

  window.KARTI_FRIENDS = {
    open: open,
    onFriend: onFriend,          // surfaced for the headless verification harness
    /* THE ONE add-a-friend call, surfaced so other screens can offer it
       without building a second friends system. `addByName` is what the
       "recently played" rows already use; the relay lower-cases whatever
       arrives (v_username) and looks it up as an account key, so an account
       key IS a valid argument and is the exact thing the record book has.
       `isFriend` lets a caller hide an offer that would be a no-op. */
    add: addByName,
    addByCode: addByCode,
    isFriend: function(key){
      key = String(key || '').toLowerCase();
      if (!key) return false;
      return ST.friends.some(function(f){ return String(f.k || '').toLowerCase() === key; }) ||
             ST.outgoing.some(function(r){ return String(r.n || '').toLowerCase() === key; });
    },
    _state: ST,
    refresh: function(){ list(true); },
    /* test hooks */
    _inject: function(m){ onFriend(m); }
  };

})();
