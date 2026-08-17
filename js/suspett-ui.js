/* ═══════════════════════════════════════════════════════════════════
   SUSPETT — the screen.  js/suspett.js is the engine; this file is
   everything a finger touches: the setup sheet with the host's role
   pool, the pass-the-phone curtain, the online table, the chat, the
   hidden role card, and the referee.

   ── WHAT IS SECRET FROM WHOM — the honest version ──────────────────
   IN THE ROOM (both modes): a role, and a night target, exist in the
   DOM only while their sheet is deliberately open. Closing the sheet
   WIPES the nodes — the text is not hidden with CSS, it is not in the
   document. The sheet also wipes itself when the app loses focus or
   is backgrounded, so a grabbed phone or a repaint shows nothing.

   ON THE WIRE (online): game MOVES ride the relay's normal broadcast
   — every phone receives every move and rebuilds the same state from
   the shared seed. That means role secrecy online is CLIENT-SIDE: a
   player who opens the developer console can read the whole village.
   Among friends at one table that is the accepted trade (it is the
   architecture every KARTI table game runs on), and nothing in this
   file claims otherwise. CHAT is different: it goes over a dedicated
   {t:'chat'} message that the relay forwards ONLY to the seats named
   in `to` — that list is built from the engine's chanReaders() and
   the filtering happens ON THE SERVER, so the klikka's night talk
   and the dead's room never reach the wrong phone at all. On a relay
   that has not learned {t:'chat'} yet (health JSON without chat:1),
   chat is switched off and the screen says so out loud rather than
   pretending.

   ── THE REFEREE ────────────────────────────────────────────────────
   The game is played in one physical room with the phones as the
   private channel, so the app cannot enforce silence — it can only
   make the rule impossible to miss. Hence the permanent SPEAK/SILENT
   bar: gold rounded pill + speech glyph + "TISTA' TITKELLEM" when
   you may talk out loud; dark hatched square + crossed glyph +
   "SKIET - IKTEB BISS" when you may not. Colour AND shape AND words,
   never colour alone, visible with the keyboard up. Dead players'
   bars never return to SPEAK, and death itself interrupts with a
   full-screen notice that must be acknowledged.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const K = window.KARTI || {};
const P = window.KARTI_PARTY;
const S = window.SUSPETT;
if (!P || !P.register || !S) return;

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
function sfx(id){ try { if (window.KARTI_SFX && KARTI_SFX.play) KARTI_SFX.play(id); } catch (e){} }
function toast(m){ try { if (K.toast) K.toast(m); } catch (e){} }

/* ── the tile's mark: an eye over a card, ours ────────────────────── */
function injectSprite(){
  if (document.getElementById('su-sprite')) return;
  const d = document.createElement('div');
  d.id = 'su-sprite';
  d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  d.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<symbol id="su-mark" viewBox="0 0 24 24">' +
    '<path fill="currentColor" d="M12 5C7 5 3.2 8.1 1.5 12 3.2 15.9 7 19 12 19s8.8-3.1 ' +
    '10.5-7C20.8 8.1 17 5 12 5zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9z"/>' +
    '<circle fill="currentColor" cx="12" cy="12" r="2.2"/>' +
    '</symbol></svg>';
  document.body.appendChild(d);
}

/* ═══════════════ persistence ═══════════════ */
const STORE = 'karti_suspett_v1';
let ST = { rec:{ w:0, l:0 }, pref:{}, save:null };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    if (j.rec && typeof j.rec === 'object') ST.rec = j.rec;
    if (j.pref && typeof j.pref === 'object') ST.pref = j.pref;
    if (j.save && typeof j.save === 'object') ST.save = j.save;
  }
} catch (e){}
function persist(){ try { localStorage.setItem(STORE, JSON.stringify(ST)); return true; } catch (e){ return false; } }

/* ═══════════════ runtime ═══════════════ */
let U = null;      /* the open game: see openPNP / onlineStart */
let secretOpen = null;   /* the one concealment overlay, if open */

function stash(){
  if (!U || U.mode !== 'pnp' || !U.G || U.G.over){ if (U && U.G && U.G.over) clearSlot(); return; }
  ST.save = { v:1, at: Date.now(), snap: S.snapshot(U.G), names: U.names };
  persist();
}
function clearSlot(){ if (ST.save){ ST.save = null; persist(); } }
document.addEventListener('visibilitychange', () => { if (document.hidden){ stash(); hideSecret(); } });
window.addEventListener('pagehide', () => stash());
window.addEventListener('blur', () => hideSecret());

/* ═══════════════ css ═══════════════ */
function injectCSS(){
  try { P.ui.css(); } catch (e){}
  if (document.getElementById('su-css')) return;
  const st = document.createElement('style');
  st.id = 'su-css';
  st.textContent =
  '#scr-party .su-wrap{display:flex;flex-direction:column;height:100%;min-height:0;gap:8px;' +
    'font-family:var(--disp,system-ui);}' +
  /* ── the referee: SPEAK / SILENT. Colour AND shape AND words. ── */
  '#scr-party .su-ref{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:9px 13px;' +
    'font-weight:900;font-size:14px;letter-spacing:.4px;user-select:none}' +
  '#scr-party .su-ref .g{width:20px;height:20px;flex:0 0 auto}' +
  '#scr-party .su-ref.speak{background:rgba(255,197,66,.16);border:2px solid var(--gold,#FFC542);' +
    'border-radius:999px;color:var(--gold,#FFC542)}' +
  '#scr-party .su-ref.silent{background:rgba(232,69,44,.14);border:2px dashed #FF7A6B;' +
    'border-radius:4px;color:#FF9C90}' +
  '#scr-party .su-ref i{font-style:normal;font-weight:600;font-size:11px;opacity:.85;margin-left:auto;text-align:right}' +
  /* phase bar */
  '#scr-party .su-phase{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 12px;' +
    'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;' +
    'font-size:13px;font-weight:800}' +
  '#scr-party .su-phase .clk{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:900;' +
    'color:var(--gold,#FFC542)}' +
  '#scr-party .su-phase.night{background:rgba(138,92,255,.14)}' +
  /* roster */
  '#scr-party .su-seats{flex:0 0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:5px}' +
  '#scr-party .su-seat{padding:6px 8px;border-radius:10px;background:rgba(255,255,255,.05);' +
    'border:1px solid rgba(255,255,255,.1);font-size:11.5px;font-weight:700;display:flex;gap:6px;' +
    'align-items:center;min-width:0}' +
  '#scr-party .su-seat b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
  '#scr-party .su-seat.dead{opacity:.45;text-decoration:line-through}' +
  '#scr-party .su-seat.me{border-color:var(--gold,#FFC542)}' +
  '#scr-party .su-seat.acc{border-color:#FF5468;background:rgba(255,84,104,.14)}' +
  '#scr-party .su-seat i{font-style:normal;font-size:9.5px;opacity:.8;margin-left:auto;flex:0 0 auto}' +
  '#scr-party .su-seat .vt{background:rgba(255,197,66,.25);border-radius:8px;padding:0 5px;' +
    'font-size:10px;font-weight:900;flex:0 0 auto}' +
  /* log + chat column */
  '#scr-party .su-mid{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:6px}' +
  '#scr-party .su-log{flex:0 0 auto;max-height:22%;overflow-y:auto;padding:7px 10px;' +
    'background:rgba(0,0,0,.25);border-radius:10px;font-size:12px;line-height:1.45}' +
  '#scr-party .su-log p{margin:2px 0;color:var(--dim,#A093C4)}' +
  '#scr-party .su-log p.hot{color:#FF9C90;font-weight:700}' +
  '#scr-party .su-log p:last-child{color:var(--txt,#F4EFFF)}' +
  /* chat */
  '#scr-party .su-tabs{flex:0 0 auto;display:flex;gap:6px}' +
  '#scr-party .su-tab{flex:1;padding:7px 4px;border-radius:10px 10px 0 0;border:1px solid rgba(255,255,255,.14);' +
    'border-bottom:none;background:rgba(255,255,255,.04);color:var(--dim,#A093C4);font-weight:800;' +
    'font-size:12px;text-align:center}' +
  '#scr-party .su-tab.on.day{background:rgba(255,197,66,.2);color:var(--gold,#FFC542);border-color:var(--gold,#FFC542)}' +
  '#scr-party .su-tab.on.kill{background:rgba(232,69,44,.22);color:#FF9C90;border-color:#FF7A6B}' +
  '#scr-party .su-tab.on.dead{background:rgba(138,92,255,.22);color:#C9B4FF;border-color:#8A5CFF}' +
  '#scr-party .su-tab .n{display:inline-block;min-width:15px;background:#FF5468;color:#fff;' +
    'border-radius:8px;font-size:9px;padding:0 3px;margin-left:4px}' +
  '#scr-party .su-chat{flex:1 1 auto;min-height:60px;overflow-y:auto;padding:8px 10px;border-radius:0 0 10px 10px;' +
    'border:1px solid rgba(255,255,255,.14);border-top:none;background:rgba(0,0,0,.3);' +
    'font-size:13px;line-height:1.4;overflow-wrap:anywhere;word-break:break-word}' +
  '#scr-party .su-chat.day{border-color:var(--gold,#FFC542)}' +
  '#scr-party .su-chat.kill{border-color:#FF7A6B;background:rgba(40,8,8,.5)}' +
  '#scr-party .su-chat.dead{border-color:#8A5CFF;background:rgba(20,10,45,.55)}' +
  '#scr-party .su-msg{margin:3px 0}' +
  '#scr-party .su-msg b{color:var(--gold,#FFC542);font-size:11.5px}' +
  '#scr-party .su-msg.kill b{color:#FF9C90}' +
  '#scr-party .su-msg.dead b{color:#C9B4FF}' +
  '#scr-party .su-msg.sys{color:var(--dim,#A093C4);font-style:italic;font-size:11.5px}' +
  /* the input row says WHERE the words go */
  '#scr-party .su-inrow{flex:0 0 auto;display:flex;gap:6px;align-items:stretch}' +
  '#scr-party .su-in{flex:1;min-width:0;padding:10px 12px;border-radius:12px;font-size:16px;' +
    'border:2px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-in.day{border-color:var(--gold,#FFC542)}' +
  '#scr-party .su-in.kill{border-color:#FF7A6B}' +
  '#scr-party .su-in.dead{border-color:#8A5CFF}' +
  '#scr-party .su-send{flex:0 0 auto;padding:0 16px;border-radius:12px;border:none;font-weight:900;' +
    'background:var(--gold,#FFC542);color:#221;font-size:13px}' +
  '#scr-party .su-send:disabled{opacity:.35}' +
  '#scr-party .su-canned{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}' +
  '#scr-party .su-can{flex:0 0 auto;padding:6px 10px;border-radius:999px;font-size:11.5px;font-weight:700;' +
    'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:var(--txt,#F4EFFF)}' +
  /* action bar */
  '#scr-party .su-bar{flex:0 0 auto;display:flex;gap:8px}' +
  '#scr-party .su-btn{flex:1;padding:12px 8px;border-radius:12px;border:none;font-weight:900;font-size:13.5px;' +
    'background:rgba(255,255,255,.1);color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-btn.gold{background:var(--gold,#FFC542);color:#221}' +
  '#scr-party .su-btn.red{background:#B3362B;color:#fff}' +
  '#scr-party .su-btn:disabled{opacity:.4}' +
  /* ── concealment: the secret sheet ── */
  '#scr-party .su-veil{position:absolute;inset:0;z-index:60;background:rgba(10,7,18,.97);display:flex;' +
    'flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:22px;text-align:center}' +
  '#scr-party .su-card{width:min(330px,88%);border-radius:16px;padding:18px 16px;' +
    'background:linear-gradient(160deg,#241A3E,#141020);border:2px solid var(--gold,#FFC542)}' +
  '#scr-party .su-card h3{margin:0 0 4px;font-size:22px;color:var(--gold,#FFC542)}' +
  '#scr-party .su-card .side{font-size:11px;font-weight:900;letter-spacing:1px;margin-bottom:8px}' +
  '#scr-party .su-card .side.rahal{color:#3DDC84}' +
  '#scr-party .su-card .side.klikka{color:#FF7A6B}' +
  '#scr-party .su-card .side.newtral{color:#C9B4FF}' +
  '#scr-party .su-card p{margin:0;font-size:13px;line-height:1.5;text-align:left}' +
  '#scr-party .su-card .mate{margin-top:8px;font-size:12px;color:#FF9C90;text-align:left}' +
  '#scr-party .su-card .news{margin-top:8px;font-size:12.5px;color:var(--gold,#FFC542);text-align:left;font-weight:700}' +
  '#scr-party .su-tgts{width:min(360px,94%);display:grid;grid-template-columns:repeat(2,1fr);gap:7px;' +
    'max-height:44vh;overflow-y:auto}' +
  '#scr-party .su-tgt{padding:11px 8px;border-radius:11px;border:1px solid rgba(255,255,255,.2);' +
    'background:rgba(255,255,255,.07);color:var(--txt,#F4EFFF);font-weight:800;font-size:13px}' +
  '#scr-party .su-tgt.on{background:rgba(255,197,66,.25);border-color:var(--gold,#FFC542)}' +
  '#scr-party .su-veil .hint{font-size:11px;color:var(--dim,#A093C4);max-width:300px}' +
  /* the curtain (pass-the-phone) */
  '#scr-party .su-curtain{position:absolute;inset:0;z-index:70;background:#0C0913;display:flex;' +
    'flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:26px;text-align:center}' +
  '#scr-party .su-curtain h2{margin:0;font-size:16px;letter-spacing:2px;color:var(--dim,#A093C4)}' +
  '#scr-party .su-curtain .who{font-size:30px;font-weight:900;color:var(--gold,#FFC542)}' +
  /* death notice */
  '#scr-party .su-death{position:absolute;inset:0;z-index:80;background:rgba(12,6,10,.985);display:flex;' +
    'flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:26px;text-align:center}' +
  /* buttons grow to fill a row (.su-bar) but must NOT grow inside the
     column-flex overlays — without this the FHIMT button eats the screen */
  '#scr-party .su-death .su-btn,#scr-party .su-veil .su-btn,#scr-party .su-curtain .su-btn{flex:0 0 auto}' +
  '#scr-party .su-death h2{margin:0;font-size:30px;color:#FF5468;letter-spacing:2px}' +
  '#scr-party .su-death p{margin:0;font-size:14.5px;line-height:1.6;max-width:330px}' +
  '#scr-party .su-death .may{color:#C9B4FF;font-size:13px}' +
  /* setup sheet */
  '#scr-party .su-set{display:flex;flex-direction:column;gap:12px;padding:4px 2px 20px;overflow-y:auto}' +
  '#scr-party .su-set h4{margin:8px 0 0;font-size:13px;letter-spacing:1px;color:var(--dim,#A093C4)}' +
  '#scr-party .su-opts{display:flex;flex-direction:column;gap:8px}' +
  '#scr-party .su-opt{display:flex;gap:10px;align-items:center;text-align:left;padding:11px 12px;' +
    'border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);' +
    'color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-opt.on{border-color:var(--gold,#FFC542);background:rgba(255,197,66,.12)}' +
  '#scr-party .su-opt b{font-size:14px}#scr-party .su-opt i{display:block;font-style:normal;' +
    'font-size:11px;color:var(--dim,#A093C4);margin-top:2px}' +
  '#scr-party .su-step{display:flex;align-items:center;gap:14px;justify-content:center}' +
  '#scr-party .su-stepb{width:46px;height:46px;border-radius:50%;border:none;font-size:22px;font-weight:900;' +
    'background:rgba(255,255,255,.1);color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-stepn{font-size:26px;font-weight:900;min-width:56px;text-align:center;color:var(--gold,#FFC542)}' +
  '#scr-party .su-names{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}' +
  '#scr-party .su-name{padding:9px 10px;border-radius:10px;font-size:14px;border:1px solid rgba(255,255,255,.18);' +
    'background:rgba(0,0,0,.3);color:var(--txt,#F4EFFF);min-width:0}' +
  '#scr-party .su-pool{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}' +
  '#scr-party .su-role{display:flex;gap:8px;align-items:center;text-align:left;padding:8px 9px;border-radius:10px;' +
    'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:var(--txt,#F4EFFF)}' +
  '#scr-party .su-role.off{opacity:.4}' +
  '#scr-party .su-role.far{border-style:dashed}' +
  '#scr-party .su-role b{font-size:12.5px}' +
  '#scr-party .su-role i{display:block;font-style:normal;font-size:9.5px;color:var(--dim,#A093C4)}' +
  '#scr-party .su-role .dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}' +
  '#scr-party .su-role .dot.rahal{background:#3DDC84}' +
  '#scr-party .su-role .dot.klikka{background:#FF5468}' +
  '#scr-party .su-role .dot.newtral{background:#8A5CFF}' +
  '#scr-party .su-bal{padding:9px 12px;border-radius:10px;background:rgba(0,0,0,.3);font-size:12.5px;' +
    'font-weight:700;line-height:1.5}' +
  '#scr-party .su-bal .k{color:#FF9C90}#scr-party .su-bal .v{color:#3DDC84}#scr-party .su-bal .n{color:#C9B4FF}' +
  '#scr-party .su-net-banner{flex:0 0 auto;padding:7px 11px;border-radius:10px;background:rgba(232,69,44,.15);' +
    'border:1px solid #B3362B;font-size:11.5px;line-height:1.4}' +
  '#scr-party .su-net-banner{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;' +
    'overflow:hidden}' +
  '#scr-party .su-net-banner.full{display:block;-webkit-line-clamp:unset}' +
  /* short screens: the roster and log give way, the chat keeps its room */
  '@media (max-height:700px){' +
    '#scr-party .su-seats{max-height:74px;overflow-y:auto}' +
    '#scr-party .su-log{max-height:56px}' +
    '#scr-party .su-canned{display:none}}' +
  /* landscape: chat beside roster */
  '@media (orientation:landscape) and (max-height:520px){' +
    '#scr-party .su-seats{grid-template-columns:repeat(auto-fill,minmax(84px,1fr));max-height:70px;overflow-y:auto}' +
    '#scr-party .su-log{max-height:16%}}';
  document.head.appendChild(st);
}

/* ═══════════════ the concealment overlay ═══════════════
   render(host) fills it; hideSecret() WIPES it. Nothing the sheet
   showed survives in the DOM after it closes. */
function showSecret(render, opts){
  hideSecret();
  const root = U && U.ctx ? U.ctx.rootEl : screenRoot();
  if (!root) return;
  const v = document.createElement('div');
  v.className = 'su-veil';
  v.id = 'su-veil';
  render(v);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;width:min(330px,88%)';
  const closeB = document.createElement('button');
  closeB.className = 'su-btn gold';
  closeB.textContent = (opts && opts.closeLabel) || 'Aħbi u agħlaq';
  closeB.onclick = () => { hideSecret(); if (opts && opts.onClose) opts.onClose(); };
  row.appendChild(closeB);
  v.appendChild(row);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Din il-karta tinħeba waħedha jekk titlaq mill-app. Xejn minnha ma jibqa’ fuq l-iskrin.';
  v.appendChild(hint);
  root.appendChild(v);
  secretOpen = v;
  sfx('ui.sheet');
}
function hideSecret(){
  if (!secretOpen) return;
  try { secretOpen.innerHTML = ''; secretOpen.remove(); } catch (e){}
  secretOpen = null;
}
function screenRoot(){ try { return P.ui.screenEl(); } catch (e){ return null; } }

/* the private role card, rendered ONLY inside a secret sheet */
function roleCardInto(host, G, seat){
  const v = S.view(G, seat);
  if (!v) return;
  const card = document.createElement('div');
  card.className = 'su-card';
  const sideWord = v.role.side === 'rahal' ? 'MAR-RAĦAL' :
                   v.role.side === 'klikka' ? 'MAL-KLIKKA' : 'GĦALIK WAĦDEK';
  let inner =
    '<div class="side ' + v.role.side + '">' + sideWord + '</div>' +
    '<h3>' + esc(v.role.name) + '</h3>' +
    '<p>' + esc(v.role.what) + '</p>';
  if (v.converted)
    inner += '<div class="news">Il-mira tiegħek mietet bil-lejl — issa int il-Miġnun.</div>';
  if (v.mates.length)
    inner += '<div class="mate">Sħabek: ' + v.mates.map(m => esc(m.name) + ' (' + esc(m.role) + ')').join(', ') + '</div>';
  if (v.mira)
    inner += '<div class="news">Il-MIRA tiegħek: ' + esc(v.mira.name) + '. Ġibha fuq il-planka.</div>';
  if (v.role.id === 'kuntrabandist')
    inner += '<div class="news">Moħbi li fadal: ' + v.hideLeft + '</div>';
  if (v.role.id === 'tarronda'){
    inner += '<div class="news">Tiri li fadal: ' + v.rondaShots + '</div>';
    if (v.rondaGuilt)
      inner += '<div class="news">Qtilt wieħed tar-raħal. Il-kuxjenza qed ' +
               'tikolk — dan hu l-aħħar jum tiegħek.</div>';
  }
  if (v.poisoned)
    inner += '<div class="news">INT AVVELENAT! Jekk it-Tabib ma jsibekx ' +
             'il-lejla d-dieħla, tmut ma’ sbiħ il-jum. Għajjat għalih.</div>';
  if (v.muted)
    inner += '<div class="news">Is-sarima f’ħalqek: illum tivvota biss — ' +
             'la titkellem u lanqas tikteb fil-pjazza.</div>';
  if (v.news)
    for (const nw of v.news) inner += '<div class="news">' + esc(newsLine(nw)) + '</div>';
  card.innerHTML = inner;
  host.appendChild(card);
}
/* the weapons, as il-Ħaffier names them */
const WEAPON_MT = {
  klikka:   'daqqa tal-klikka',
  biccier:  'is-sikkina tal-Biċċier',
  ronda:    'tir ta’ senter fil-lejl',
  shot:     'l-aħħar tir ta’ Kaċċatur',
  velenu:   'il-velenu',
  xewka:    'ix-xewka',
  kuxjenza: 'il-kuxjenza — mewt minn ġewwa',
  vote:     'il-planka tal-pjazza',
  night:    'daqqa fil-lejl (qabel żmienek)'
};
function newsLine(nw){
  if (nw.kind === 'nanna')
    return 'Lejl ' + nw.night + ': ' + nw.name + ' ' + (nw.clean ? 'NADIF/A.' : 'SUSPETTUŻ/A.');
  if (nw.kind === 'kappillan')
    return 'Lejl ' + nw.night + ': ' + nw.name + ' u ' + nw.name2 + ' ' +
           (nw.same ? 'fuq L-ISTESS naħa.' : 'fuq naħat DIFFERENTI.');
  if (nw.kind === 'ghassies')
    return 'Lejl ' + nw.night + ': għand ' + nw.name + ' ' +
           (nw.who.length ? 'mar: ' + nw.who.map(w => w.name).join(', ') + '.' : 'ma mar ĦADD.');
  if (nw.kind === 'xummiemu')
    return 'Lejl ' + nw.night + ': ' + nw.name + ' ' +
           (nw.who.length ? 'mar għand: ' + nw.who.map(w => w.name).join(', ') + '.'
                          : 'baqa’ d-dar il-lejl kollu.');
  if (nw.kind === 'haffier')
    return 'Lejl ' + nw.night + ': ' + nw.name + ' inqatel bi: ' +
           (WEAPON_MT[nw.weapon] || 'arma li ma tagħrafhiex') + '.';
  if (nw.kind === 'velenat')
    return 'Lejl ' + nw.night + ': tħossok ĦAŻIN — xi ħadd avvelenak. It-Tabib biss isalvak.';
  if (nw.kind === 'kurat')
    return 'Lejl ' + nw.night + ': it-Tabib sabek fil-ħin. Il-velenu ħareġ.';
  if (nw.kind === 'ronda')
    return 'Lejl ' + nw.night + ': it-tir tiegħek laqat wieħed tar-raħal. Il-lejl li ġej il-kuxjenza tiġbrok.';
  return '';
}

/* ═══════════════ the referee bar ═══════════════ */
function refBar(speak, why){
  const glyphSpeak = '<svg class="g" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" ' +
    'd="M4 4h16v12H8l-4 4V4z"/></svg>';
  const glyphSil = '<svg class="g" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" ' +
    'd="M4 4h16v12H8l-4 4V4zm2.3 2.3l11.4 7.4-1.1 1.7L5.2 8l1.1-1.7z"/></svg>';
  return '<div class="su-ref ' + (speak ? 'speak' : 'silent') + '" id="su-ref" role="status">' +
    (speak ? glyphSpeak : glyphSil) +
    '<span>' + (speak ? 'TISTA’ TITKELLEM' : 'SKIET — IKTEB BISS') + '</span>' +
    '<i>' + esc(why || '') + '</i></div>';
}
function refWhy(v){
  if (!v.alive) return 'Int mejjet. Skiet sal-aħħar.';
  if (v.phase === 'night' || v.phase === 'shot') return 'Bil-lejl ħadd ma jitkellem.';
  if (v.phase === 'defence') return v.seat === v.accused ? 'Il-planka tiegħek.' : 'Ħalli lill-akkużat jitkellem.';
  if (v.muted) return 'Is-sarima f’ħalqek — illum tivvota biss.';
  return 'Il-pjazza miftuħa.';
}

/* ═══════════════ THE SETUP SHEET ═══════════════ */
function menu(){
  injectCSS(); injectSprite();
  closeGame();
  const el = screenRoot();
  if (!el) return;
  P.show();                    /* the party screen, without the hub painting over us */
  const pf = ST.pref;
  let mode  = pf.mode === 'pnp' ? 'pnp' : 'net';
  let seats = Math.min(16, Math.max(5, pf.seats | 0 || 7));
  let pmode = pf.pmode === 'borma' ? 'borma' : 'bilanc';
  /* poolV 2 marks a pool saved AGAINST THE NEW CATALOGUE — an older
     saved pool predates the new roles and is reset to its mode */
  let pool  = (Array.isArray(pf.pool) && pf.poolV === 2)
    ? pf.pool.slice() : modePool(pmode);
  let names = Array.isArray(pf.names) ? pf.names.slice() : [];
  let reveal = pf.reveal !== false;
  let dayT  = [180, 240, 300, 420].indexOf(pf.dayT) >= 0 ? pf.dayT : 240;
  let showPool = false;
  function modePool(id){
    const m = S.MODES.find(x => x.id === id);
    return (m ? m.pool : S.POOL_DEFAULT).slice();
  }
  function samePool(a, b){
    if (a.length !== b.length) return false;
    const s2 = b.slice().sort();
    return a.slice().sort().every((x, i) => x === s2[i]);
  }

  function draw(){
    const saved = ST.save && ST.save.snap;
    const roster = S.rosterFromPool(seats, pool);
    const bal = S.rosterBalance(roster);
    const valid = S.validateRoster(roster, seats);
    el.innerHTML =
      '<div class="tbar"><button class="iconbtn" id="su-back" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M15 18l-6-6 6-6-1.4-1.4L6.2 12l7.4 7.4z"/></svg>' +
      '</button><h2>SUSPETT</h2></div>' +
      '<div class="su-set">' +
      (saved ? '<button class="su-opt on" id="su-resume"><b>Kompli l-logħba ta’ qabel</b>' +
               '<i>Hemm waħda nofsha lesta fuq dan it-telefon.</i></button>' : '') +
      '<h4>KIF SE TILAGĦBU</h4><div class="su-opts">' +
      '<button class="su-opt' + (mode === 'net' ? ' on' : '') + '" data-m="net"><b>Kulħadd fuq il-mowbajl tiegħu</b>' +
      '<i>Online mir-relay — il-chat hu l-logħba. L-aqwa mod, sa sittax.</i></button>' +
      '<button class="su-opt' + (mode === 'pnp' ? ' on' : '') + '" data-m="pnp"><b>Telefon wieħed idur mal-mejda</b>' +
      '<i>Bil-purtiera bejn kull tidwira. Bla chat — titkellmu intom.</i></button></div>' +
      (mode === 'pnp' ?
        '<h4>KEMM INTOM</h4><div class="su-step">' +
        '<button class="su-stepb" id="su-less">-</button><span class="su-stepn">' + seats + '</span>' +
        '<button class="su-stepb" id="su-more">+</button></div>' +
        '<h4>MIN INTOM</h4><div class="su-names" id="su-names">' +
        Array.from({ length: seats }, (_, i) =>
          '<input class="su-name" maxlength="14" data-i="' + i + '" placeholder="Plejer ' + (i + 1) + '"' +
          ' value="' + esc(names[i] || '') + '">').join('') + '</div>'
        : '') +
      '<h4>IR-RWOLI FIL-BORMA <span style="opacity:.6">(' +
        (mode === 'pnp' ? seats : 'skont il-kamra') + ' siġġu)</span></h4>' +
      /* THE TWO MODES — starting points, both editable afterwards */
      '<div class="su-opts">' + S.MODES.map(m => {
        const on = samePool(pool, m.pool);
        return '<button class="su-opt' + (on ? ' on' : '') + '" data-pm="' + m.id + '">' +
          '<b>' + esc(m.name) + '</b><i>' + esc(m.note) + '</i></button>';
      }).join('') +
      (S.MODES.some(m => samePool(pool, m.pool)) ? '' :
        '<div class="su-bal">Borma tiegħek — bdilt ir-rwoli b’idejk. ' +
        'Agħfas mod biex terġa’ lura.</div>') + '</div>' +
      '<button class="su-opt" id="su-poolbtn"><b>' + (showPool ? 'Aħbi l-lista' : 'Biddel ir-rwoli') + '</b>' +
      '<i>Neħħi u żid rwoli fuq il-mod li għażilt — il-logħba tinbena minn dak li tħalli.</i></button>' +
      (showPool ? '<div class="su-pool" id="su-pool">' +
        S.POOL_ALL.map(id => {
          const R = S.ROLES[id];
          const inPool = pool.indexOf(id) >= 0;
          const min = S.MIN_TABLE[id] || 0;
          const far = mode === 'pnp' && min > seats;
          return '<button class="su-role' + (inPool ? '' : ' off') + (far ? ' far' : '') + '" data-r="' + id + '">' +
            '<span class="dot ' + R.side + '"></span><span style="min-width:0"><b>' + esc(R.name) + '</b>' +
            '<i>' + (inPool ? (far ? 'jidħol minn ' + min + ' ’il fuq' : 'fil-borma') : 'BARRA') + '</i></span></button>';
        }).join('') + '</div>' : '') +
      '<div class="su-bal">' + (mode === 'pnp'
        ? 'B’dawn: <span class="k">' + bal.killers + ' qattiela</span> kontra <span class="v">' +
          bal.village + ' tar-raħal</span>' + (bal.neutral ? ' u <span class="n">' + bal.neutral +
          ' għal rashom</span>' : '') + '.' +
          (valid.ok ? '' : ' <span class="k">' + esc(valid.why) + '</span>')
        : 'Il-bilanċ jinħadem mill-kamra skont kemm tidħlu. Bl-għaxra: eżempju <span class="k">2 qattiela</span>, ' +
          '<span class="v">7 tar-raħal</span>, <span class="n">1 għal rasu</span>.') + '</div>' +
      '<h4>REGOLI TAL-LEJLA</h4><div class="su-opts">' +
      '<button class="su-opt' + (reveal ? ' on' : '') + '" id="su-rev"><b>Il-mejtin jikxfu r-rwol</b>' +
      '<i>' + (reveal ? 'IVA — kull katavru jgħid x’kien. Eħfef u aktar daħq.'
                      : 'LE — il-katavri jibqgħu mistoqsija. Itqal sew.') + '</i></button>' +
      '<button class="su-opt" id="su-dayt"><b>Ħin il-pjazza: ' + (dayT / 60) + ' min</b>' +
      '<i>Kemm iddum id-diskussjoni ta’ binhar qabel il-vot.</i></button></div>' +
      '<button class="su-btn gold" id="su-go" style="padding:14px">' +
      (mode === 'net' ? 'SIB KAMRA ONLINE' : 'QASSAM IR-RWOLI') + '</button>' +
      '<button class="su-btn" id="su-rules">X’jagħmel xiex? Ir-regoli u r-rwoli</button>' +
      '</div>';

    el.querySelector('#su-back').onclick = () => { savePrefs(); P.open(); };
    const rs = el.querySelector('#su-resume');
    if (rs) rs.onclick = resumeSaved;
    el.querySelectorAll('.su-opt[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
    el.querySelectorAll('.su-opt[data-pm]').forEach(b => b.onclick = () => {
      pmode = b.dataset.pm; pool = modePool(pmode); sfx('ui.toggle'); draw();
    });
    if (mode === 'pnp'){
      el.querySelector('#su-less').onclick = () => { if (seats > 5){ seats--; draw(); } };
      el.querySelector('#su-more').onclick = () => { if (seats < 16){ seats++; draw(); } };
      el.querySelectorAll('.su-name').forEach(inp =>
        inp.oninput = () => { names[+inp.dataset.i] = inp.value; });
    }
    el.querySelector('#su-poolbtn').onclick = () => { showPool = !showPool; draw(); };
    el.querySelectorAll('.su-role').forEach(b => b.onclick = () => {
      const id = b.dataset.r;
      const at = pool.indexOf(id);
      if (at >= 0) pool.splice(at, 1); else pool.push(id);
      sfx('ui.toggle'); draw();
    });
    el.querySelector('#su-rev').onclick = () => { reveal = !reveal; draw(); };
    el.querySelector('#su-dayt').onclick = () => {
      const steps = [180, 240, 300, 420];
      dayT = steps[(steps.indexOf(dayT) + 1) % steps.length]; draw();
    };
    el.querySelector('#su-rules').onclick = () => rulesSheet(pool);
    el.querySelector('#su-go').onclick = () => {
      savePrefs();
      if (mode === 'net'){
        if (window.KARTI_MP && KARTI_MP.openFor) KARTI_MP.openFor('suspett');
        else toast('L-online mhux fuq dan il-build.');
        return;
      }
      const list = Array.from({ length: seats }, (_, i) =>
        (names[i] || '').trim() || ('Plejer ' + (i + 1)));
      const roster2 = S.rosterFromPool(seats, pool);
      const chk = S.validateRoster(roster2, seats);
      if (!chk.ok){ toast(chk.why); return; }
      openPNP(list, roster2);
    };
  }
  function savePrefs(){
    ST.pref = Object.assign({}, ST.pref,
      { mode, seats, pmode, pool, poolV: 2, names, reveal, dayT });
    persist();
  }
  draw();
}

/* ═══════════════ "X’JAGĦMEL XIEX" — the teaching panel ═══════════════
   ONE generator, built from the ENGINE's ROLES and HOW so it can never
   drift from what the code does. It leads with TONIGHT'S pot (the pool
   the host actually left on), the full catalogue underneath. Used by
   the in-game rules sheet AND published to the shared lobby through
   LOBBY.rulesHTML() — the lobby's fold-open rules door renders it while
   the room fills, for every player, without touching their seat. */
function roleLineHTML(id){
  const R = S.ROLES[id];
  if (!R) return '';
  const col = R.side === 'rahal' ? '#3DDC84' : R.side === 'klikka' ? '#FF7A6B' : '#C9B4FF';
  const min = S.MIN_TABLE[id] || 0;
  return '<p style="margin:7px 0 0"><b style="color:' + col + '">' + esc(R.name) + '</b>' +
    (min > 5 ? ' <span style="opacity:.55;font-size:10px">(minn ' + min + ' ’il fuq)</span>' : '') +
    ' — ' + esc(R.what) + '</p>';
}
function prefPool(){
  const pf = ST.pref;
  return (Array.isArray(pf.pool) && pf.poolV === 2) ? pf.pool.slice() : S.POOL_DEFAULT.slice();
}
function buildTeachHTML(pool){
  pool = (Array.isArray(pool) && pool.length ? pool : S.POOL_DEFAULT)
    .filter(id => S.ROLES[id]);
  const H = S.HOW;
  let h = '<p><b>SUSPETT</b> — raħal wieħed, klikka waħda moħbija ġo fih, u ' +
    Object.keys(S.ROLES).length + '-il rwol fil-katalgu. Aqra hawn sakemm ' +
    'timtela l-kamra — ħadd ma jitlef postu.</p>';
  h += H.basics.map(b => '<p>• ' + esc(b) + '</p>').join('');
  h += '<p style="margin-top:10px"><b>X’JIĠRI BIL-LEJL, BL-ORDNI:</b></p>' +
    H.night.map((s, i) => '<p>' + (i + 1) + '. <b>' + esc(s.n) + '</b> — ' + esc(s.t) + '</p>').join('');
  h += '<p style="margin-top:10px"><b>X’JIĠRI BINHAR:</b></p>' +
    H.day.map(d => '<p>• ' + esc(d) + '</p>').join('');
  h += '<p style="margin-top:12px"><b>IR-RWOLI FIL-BORMA TAL-LEJLA:</b></p>' +
    ['klikka', 'rahli'].concat(pool).map(roleLineHTML).join('');
  const rest = S.POOL_ALL.filter(id => pool.indexOf(id) < 0);
  if (rest.length)
    h += '<p style="margin-top:12px"><b>IL-BQIJA TAL-KATALGU (barra mil-lejla):</b></p>' +
      rest.map(roleLineHTML).join('');
  return h;
}
function rulesSheet(pool){
  showSecret(host => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.style.maxHeight = '68vh';
    d.style.overflowY = 'auto';
    d.innerHTML = '<h3>X’JAGĦMEL XIEX</h3>' + buildTeachHTML(pool || prefPool());
    host.appendChild(d);
  }, { closeLabel: 'Għalaqt' });
}

/* ═══════════════ SHARED GAME SCREEN ═══════════════ */
function board(){
  P.show();
  const el = screenRoot();
  el.innerHTML =
    '<div class="tbar"><button class="iconbtn" id="su-quit" aria-label="Leave">' +
    '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M15 18l-6-6 6-6-1.4-1.4L6.2 12l7.4 7.4z"/></svg>' +
    '</button><h2>SUSPETT</h2><span id="su-net" style="margin-left:auto;font-size:10.5px;color:var(--dim)"></span></div>' +
    '<div class="su-wrap" id="su-wrap"></div>';
  el.querySelector('#su-quit').onclick = confirmQuit;
  U.ctx = { rootEl: el, wrap: el.querySelector('#su-wrap'), netEl: el.querySelector('#su-net') };
}
function confirmQuit(){
  showSecret(host => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.innerHTML = '<h3>Titlaq?</h3><p>' + (U && U.mode === 'pnp'
      ? 'Il-logħba tibqa’ merfugħa fuq dan it-telefon — tkompluha meta tridu.'
      : 'Jekk titlaq mill-kamra, is-siġġu tiegħek jibqa’ vojt sa ma tirritorna.') + '</p>';
    host.appendChild(d);
    const b = document.createElement('button');
    b.className = 'su-btn red';
    b.style.width = 'min(330px,88%)';
    b.textContent = 'Iva, itlaq';
    b.onclick = () => { hideSecret(); leaveGame(); };
    host.appendChild(b);
  }, { closeLabel: 'Le, nibqa’' });
}
function leaveGame(){
  stash();
  const net = U && U.net;
  closeGame();
  if (net && net.onLeave) net.onLeave(); else menu();
}
function closeGame(){
  hideSecret();
  if (U){
    if (U.clock) clearInterval(U.clock);
    if (U.wsGuard) clearInterval(U.wsGuard);
    if (U.unwrap){ try { U.unwrap(); } catch (e){} }
  }
  U = null;
}

/* ═══════════════ RENDER ═══════════════ */
function phaseName(G){
  return G.phase === 'night' ? 'LEJL ' + G.night :
         G.phase === 'shot' ? 'IS-SENTER' :
         G.phase === 'day' ? 'IL-PJAZZA — JUM ' + G.night :
         G.phase === 'defence' ? 'ID-DIFIŻA' :
         G.phase === 'verdict' ? 'IL-VERDETT' : 'SPIĊĊAT';
}
function render(){
  if (!U || !U.ctx) return;
  const G = U.G;
  if (U.mode === 'net') renderNet();
  else renderPNPShared();
  if (G.over) showResult();
}

/* roster strip (public knowledge only) */
function seatsHTML(G, mySeat){
  const tally = {};
  if (G.phase === 'day')
    for (const k in G.votes){
      const t = G.votes[k];
      if (t >= 0) tally[t] = (tally[t] || 0) + (G.mayor === +k ? 2 : 1);
    }
  return '<div class="su-seats">' + G.P.map(p => {
    const pub = S.publicSeat(G, p.seat);
    return '<div class="su-seat' + (pub.alive ? '' : ' dead') +
      (p.seat === mySeat ? ' me' : '') + (G.accused === p.seat ? ' acc' : '') + '">' +
      '<b>' + esc(pub.name) + '</b>' +
      (tally[p.seat] ? '<span class="vt">' + tally[p.seat] + '</span>' : '') +
      '<i>' + (pub.alive
        ? (pub.mayor ? 'SINDKU' : (G.muted === p.seat ? 'SARIMA' : ''))
        : (pub.role ? esc(pub.role) : 'MEJTA')) + '</i>' +
      '</div>';
  }).join('') + '</div>';
}
function logHTML(G, n){
  const rows = G.log.slice(-(n || 6));
  return '<div class="su-log" id="su-log">' + rows.map(r =>
    '<p' + (/mejjet|barra mir|spara/i.test(r.txt) ? ' class="hot"' : '') + '>' + esc(r.txt) + '</p>').join('') + '</div>';
}

/* ═══════════════════════════════════════════════════════════════════
   PASS-THE-PHONE
   One phone, sixteen suspects. Private things happen behind the
   CURTAIN: a full black screen naming who may pick the phone up;
   the private screen exists in the DOM only between "Jien X" and
   "Aħbi u agħlaq". The shared screen never contains a role.
   ═══════════════════════════════════════════════════════════════════ */
function openPNP(names, roster){
  closeGame();
  injectCSS();
  const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  const G = S.create({
    players: names, roster: roster, seed: seed,
    revealRoles: ST.pref.reveal !== false, dayTimer: ST.pref.dayT || 240
  });
  U = { mode:'pnp', G, names, ctx:null, dealt:[], voteTurn:null, verdictQ:[] };
  board();
  stash();
  pnpDeal(0);
}
function resumeSaved(){
  const sv = ST.save;
  if (!sv || !sv.snap) return;
  const G = S.load(sv.snap);
  if (!G || G.over){ clearSlot(); toast('Dik il-logħba kienet spiċċat.'); return; }
  closeGame(); injectCSS();
  U = { mode:'pnp', G, names: sv.names || G.P.map(p => p.name), ctx:null,
        dealt: G.P.map(p => p.seat), voteTurn:null, verdictQ:[] };
  board();
  pnpFlow();
}

function curtain(name, note, go){
  const root = U.ctx.rootEl;
  const old = root.querySelector('.su-curtain');
  if (old) old.remove();
  U.ctx.wrap.innerHTML =
    refBar(false, 'Il-purtiera — ħadd ma jgħid xejn.') +
    '<div class="su-phase night"><span>' + esc(phaseName(U.G)) + '</span></div>';
  const c = document.createElement('div');
  c.className = 'su-curtain';
  c.innerHTML = '<h2>GĦADDI T-TELEFON LIL</h2><div class="who">' + esc(name) + '</div>' +
    '<p style="color:var(--dim);font-size:12.5px;max-width:280px">' + esc(note || '') + '</p>';
  const b = document.createElement('button');
  b.className = 'su-btn gold';
  b.style.cssText = 'width:min(300px,80%);padding:15px';
  b.textContent = 'JIEN ' + name.toUpperCase();
  b.onclick = () => { c.remove(); go(); };
  c.appendChild(b);
  U.ctx.rootEl.appendChild(c);
  sfx('ui.swipe');
}

/* the deal: everyone meets their role once, in seat order */
function pnpDeal(i){
  const G = U.G;
  if (i >= G.P.length){ stash(); pnpFlow(); return; }
  const p = G.P[i];
  curtain(p.name, 'Ħa tara r-rwol tiegħek. Ara li ħadd ma jittawwal.', () => {
    showSecret(host => {
      roleCardInto(host, G, i);
    }, { closeLabel: 'Rajtu — aħbih', onClose: () => pnpDeal(i + 1) });
  });
}

/* the night, one actor at a time */
function pnpFlow(){
  const G = U.G;
  stash();
  if (G.over){ render(); return; }
  if (G.phase === 'night'){
    const pending = S.actorsTonight(G).filter(s => G.acts[s] === undefined);
    if (!pending.length){ S.act(G, { t:'nightEnd' }); pnpFlow(); return; }
    const s = pending[0];
    curtain(G.P[s].name, 'Imissek taġixxi bil-lejl. Kollox bil-moħbi.', () => pnpNight(s));
    return;
  }
  if (G.phase === 'shot'){
    const s = G.shotQueue[0];
    curtain(G.P[s].name, 'Is-senter f’idejk. L-aħħar tir.', () => pnpShot(s));
    return;
  }
  render();
}

/* who this role may point at tonight — ONE list for PnP and online */
function nightOpts(G, v, seat){
  if (v.role.id === 'haffier') return G.P.filter(p => !p.alive).map(p => p.seat);
  const noSelf = ['nanna', 'barman', 'ghassies', 'pittur', 'biccier', 'surgent',
                  'talbieb', 'xummiemu', 'velenu', 'sarima', 'tarronda', 'kappillan'];
  return S.alive(G).map(p => p.seat).filter(s => {
    if (v.role.id === 'kuntrabandist') return s === seat;
    if (v.role.id === 'tabib') return s !== G.lastProtect;
    if (v.role.id === 'surgent' && s === G.lastJail) return false;
    if (noSelf.indexOf(v.role.id) >= 0 && s === seat) return false;
    if (v.role.side === 'klikka' && S.ROLES[G.P[s].role].side === 'klikka') return false;
    return true;
  });
}
function targetGridInto(host, G, seats, onPick){
  const grid = document.createElement('div');
  grid.className = 'su-tgts';
  seats.forEach(s => {
    const b = document.createElement('button');
    b.className = 'su-tgt';
    b.textContent = G.P[s].name;
    b.onclick = () => onPick(s, b);
    grid.appendChild(b);
  });
  host.appendChild(grid);
  return grid;
}

function pnpNight(seat){
  const G = U.G;
  const v = S.view(G, seat);
  showSecret(host => {
    roleCardInto(host, G, seat);
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:900;font-size:13px;color:var(--dim)';
    title.textContent = v.role.two ? 'Agħżel TNEJN:' :
      v.role.id === 'haffier' ? 'Agħżel katavru:' : 'Agħżel:';
    host.appendChild(title);
    let first = -1;
    const opts = nightOpts(G, v, seat);
    targetGridInto(host, G, opts, (s, btn) => {
      if (v.role.two && first < 0){
        first = s; btn.classList.add('on'); return;
      }
      const mv = { t:'night', seat: seat, target: v.role.two ? first : s };
      if (v.role.two) mv.target2 = s;
      const r = S.act(G, mv);
      if (!r.ok){ toast(r.why); return; }
      sfx('ui.tap'); hideSecret(); pnpFlow();
    });
  }, { closeLabel: 'Orqod (tagħmel xejn)', onClose: () => {
    if (G.acts[seat] === undefined && G.phase === 'night') S.act(G, { t:'night', seat: seat, target: -1, target2: -1 });
    pnpFlow();
  } });
}
function pnpShot(seat){
  const G = U.G;
  showSecret(host => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.innerHTML = '<h3>Il-Kaċċatur</h3><p>Qatluk — imma s-senter għadu mimli. Ħu lil xi ħadd miegħek, jew spara fl-ajru.</p>';
    host.appendChild(d);
    targetGridInto(host, G, S.alive(G).map(p => p.seat), s => {
      S.act(G, { t:'shot', seat: seat, target: s });
      hideSecret(); pnpFlow();
    });
  }, { closeLabel: 'Spara fl-ajru', onClose: () => {
    if (G.phase === 'shot' && G.shotQueue[0] === seat) S.act(G, { t:'shot', seat: seat, target: -1 });
    pnpFlow();
  } });
}

/* the shared daytime screen: the phone lies on the table */
function renderPNPShared(){
  const G = U.G;
  const w = U.ctx.wrap;
  const silent = G.phase === 'night' || G.phase === 'shot';
  const deadNow = G.P.filter(p => !p.alive).map(p => p.name);
  let html =
    refBar(!silent && !G.over,
      silent ? 'Bil-lejl ħadd ma jitkellem.' :
      deadNow.length ? 'Il-mejtin (' + deadNow.join(', ') + ') MA jitkellmux.' : 'Il-pjazza miftuħa.') +
    '<div class="su-phase' + (silent ? ' night' : '') + '"><span>' + esc(phaseName(G)) + '</span>' +
    '<span class="clk" id="su-clk"></span></div>' +
    seatsHTML(G, -1) + '<div class="su-mid">' + logHTML(G, 8) + '</div>';

  if (G.phase === 'day'){
    html += '<div class="su-bar">' +
      '<button class="su-btn gold" id="su-votebtn">IVVOTA</button>' +
      '<button class="su-btn" id="su-endday">Agħlaq il-jum</button></div>';
  } else if (G.phase === 'defence'){
    html += '<div class="su-bar"><button class="su-btn gold" id="su-endef">Spiċċat id-difiża</button></div>';
  } else if (G.phase === 'verdict'){
    html += '<div class="su-bar"><button class="su-btn gold" id="su-verd">IL-VOT SIGRIET</button></div>';
  }
  w.innerHTML = html;
  const vb = w.querySelector('#su-votebtn');
  if (vb) vb.onclick = pnpVote;
  const ed = w.querySelector('#su-endday');
  if (ed) ed.onclick = () => { S.act(U.G, { t:'dayEnd' }); afterMove(); };
  const ef = w.querySelector('#su-endef');
  if (ef) ef.onclick = () => { S.act(U.G, { t:'defEnd' }); afterMove(); };
  const ve = w.querySelector('#su-verd');
  if (ve) ve.onclick = () => pnpVerdict();
}
/* open voting: voter taps their name, then a target — public, like
   pointing across the pjazza */
function pnpVote(){
  const G = U.G;
  showSecret(host => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.innerHTML = '<h3>Min qed jivvota?</h3><p>Il-vot tal-pjazza hu FIL-BERAĦ — bħal ma tipponta b’sebgħek.</p>';
    host.appendChild(d);
    targetGridInto(host, G, S.alive(G).map(p => p.seat), voter => {
      hideSecret();
      showSecret(h2 => {
        const dd = document.createElement('div');
        dd.className = 'su-card';
        dd.innerHTML = '<h3>' + esc(G.P[voter].name) + ' jakkuża lil…</h3>';
        h2.appendChild(dd);
        const sindku = G.P[voter].role === 'sindku' && G.mayor !== voter;
        targetGridInto(h2, G, S.alive(G).map(p => p.seat).filter(s => s !== voter), t => {
          const r = S.act(G, { t:'vote', seat: voter, target: t });
          if (!r.ok){ toast(r.why); return; }
          hideSecret(); afterMove();
        });
        if (sindku){
          const rb = document.createElement('button');
          rb.className = 'su-btn';
          rb.style.width = 'min(330px,88%)';
          rb.textContent = 'JIEN IS-SINDKU (ikxef ruħek)';
          rb.onclick = () => { S.act(G, { t:'reveal', seat: voter }); hideSecret(); afterMove(); };
          h2.appendChild(rb);
        }
      }, { closeLabel: 'Astjeni', onClose: () => {
        if (G.phase === 'day') S.act(G, { t:'vote', seat: voter, target: -1 });
        afterMove();
      } });
    });
  }, { closeLabel: 'Agħlaq' });
}
/* the verdict is a SECRET ballot: each voter behind the curtain */
function pnpVerdict(){
  const G = U.G;
  const voters = S.alive(G).filter(a => a.seat !== G.accused && G.verdict[a.seat] === undefined)
                  .map(a => a.seat);
  if (!voters.length){ S.act(G, { t:'verdictEnd' }); afterMove(); return; }
  const s = voters[0];
  curtain(G.P[s].name, 'Vot sigriet fuq ' + G.P[G.accused].name + ': ħati jew le?', () => {
    showSecret(host => {
      const d = document.createElement('div');
      d.className = 'su-card';
      d.innerHTML = '<h3>' + esc(G.P[G.accused].name) + '</h3><p>Ħati… jew le? Ħadd ma jara x’għażilt.</p>';
      host.appendChild(d);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;width:min(330px,88%)';
      [['ĦATI', true, 'red'], ['MHUX ĦATI', false, 'gold']].forEach(([lbl, val, cls]) => {
        const b = document.createElement('button');
        b.className = 'su-btn ' + cls;
        b.textContent = lbl;
        b.onclick = () => {
          S.act(G, { t:'verdict', seat: s, guilty: val });
          hideSecret();
          if (G.phase === 'verdict') pnpVerdict(); else afterMove();
        };
        row.appendChild(b);
      });
      host.appendChild(row);
    }, { closeLabel: 'Astjeni', onClose: () => {
      if (G.phase === 'verdict' && G.verdict[s] === undefined){
        S.act(G, { t:'verdict', seat: s, guilty: false });
      }
      if (G.phase === 'verdict') pnpVerdict(); else afterMove();
    } });
  });
}
function afterMove(){
  stash();
  if (!U) return;
  if (U.mode === 'pnp'){
    if (U.G.phase === 'night' || U.G.phase === 'shot') pnpFlow();
    else render();
  } else render();
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — everyone on their own phone, the chat is the game.
   ═══════════════════════════════════════════════════════════════════ */
function subOnMove(cb){
  MOVE_SUBS.push(cb);
  return () => { const i = MOVE_SUBS.indexOf(cb); if (i >= 0) MOVE_SUBS.splice(i, 1); };
}
const MOVE_SUBS = [];
function announce(mv, info){
  for (const cb of MOVE_SUBS.slice()){ try { cb(mv, info); } catch (e){} }
}
/* our move object <-> the relay codec's field names.
   IMPORTANT: js/mp.js cannot read our published wire list (its
   LOBBY_GLOBAL table predates us), so it folds our moves onto the
   tombla fallback fields ['s','v','k','n','c','i','p','to']. Every
   key we use MUST come from that list or toWire() refuses the move
   and stops the table: target rides `i`, the second target rides `c`
   (NOT `j`), the verdict rides `v`. */
function toNet(mv){
  const w = { t: mv.t };
  if (typeof mv.target === 'number' && mv.target >= 0) w.i = mv.target;
  if (typeof mv.target2 === 'number' && mv.target2 >= 0) w.c = mv.target2;
  if (mv.guilty !== undefined) w.v = !!mv.guilty;
  return w;
}
function fromNet(seat, d){
  const mv = { t: d.t, seat: seat };
  mv.target = (typeof d.i === 'number') ? d.i : -1;
  mv.target2 = (typeof d.c === 'number') ? d.c : -1;
  if (d.v !== undefined) mv.guilty = !!d.v;
  return mv;
}
/* a local player action: apply, then put it on the wire */
function netAct(mv){
  const G = U.G;
  const wasAlive = myAlive();
  const r = S.act(G, mv);
  if (!r.ok){ toast(r.why); return false; }
  announce(toNet(mv), { src:'local' });
  afterNetApply(wasAlive);
  return true;
}
function myAlive(){ return U && U.G.P[U.seat] ? U.G.P[U.seat].alive : true; }
function afterNetApply(wasAlive){
  if (!U) return;
  if (wasAlive && !myAlive()) deathNotice();
  syncPhaseClock();
  render();
}

function onlineStart(cfg){
  cfg = cfg || {};
  closeGame(); injectCSS();
  const seats = cfg.seats || [];
  const names = seats.map((s2, i) => (s2 && s2.name) || ('Siġġu ' + (i + 1)));
  const bots = [];
  seats.forEach((s2, i) => { if (s2 && (s2.own === 'cpu' || s2.kind === 'cpu')) bots.push(i); });
  /* room settings ride cfg.opts — the same object every phone receives
     from the lobby, so every phone deals the identical game. The shape
     matches LOBBY.settings below; a room that sends nothing gets the
     balanced defaults. */
  const op = cfg.opts || {};
  const md = S.MODES.find(m => m.id === op.mode);
  const G = S.create({
    players: names, seed: (cfg.seed >>> 0) || 1, bots: bots,
    pool: md ? md.pool : null,
    revealRoles: op.reveal !== false,
    dayTimer: [180, 240, 300, 420].indexOf(op.dayT) >= 0 ? op.dayT : 240
  });
  U = { mode:'net', G, names, seat: cfg.you | 0, host: (cfg.host | 0) === (cfg.you | 0) || cfg.you === 0,
        net: cfg.net || null, ctx:null,
        chat: { cap: null, active:'pjazza', chans:{}, unread:{} },
        deadline: 0, clock: 0, wsGuard: 0, unwrap: null, ackDead: false };
  board();
  chatProbe();
  wsWrap();
  U.wsGuard = setInterval(wsWrap, 2500);
  syncPhaseClock(true);
  U.clock = setInterval(tickClock, 1000);
  render();
  sfx('amb.kazin');
  return { ok: true };
}
function onlineRemote(seat, mv){
  if (!U || U.mode !== 'net') return { ok:false, why:'no suspett open' };
  const wasAlive = myAlive();
  const r = S.act(U.G, fromNet(seat, mv));
  /* phase-end moves race benignly: a vote landing after dayEnd is
     refused on every phone the same way; do not call that a desync */
  if (!r.ok && ['nightEnd','dayEnd','defEnd','verdictEnd','shotEnd'].indexOf(mv.t) < 0 &&
      /Mossa mhux/.test(r.why || '')) return r;
  afterNetApply(wasAlive);
  return { ok:true };
}
function onlineNote(text, tone){
  if (U && U.ctx && U.ctx.netEl){
    U.ctx.netEl.textContent = text || '';
    U.ctx.netEl.style.color = tone === 'bad' ? '#FF5468' : 'var(--dim)';
  }
}
function onlineStop(why){
  if (!U) return;
  const root = U.ctx && U.ctx.rootEl;
  closeGame();
  if (root){
    showResultRaw(root, 'draw', 'Waqfet', why || 'Il-kamra waqfet.', () => menu());
  }
}

/* ── the host's clock: phases end by MOVES so every phone agrees ── */
function phaseSeconds(G){
  return G.phase === 'night' ? G.opt.nightTimer :
         G.phase === 'day' ? G.opt.dayTimer :
         G.phase === 'defence' ? 45 :
         G.phase === 'verdict' ? 40 :
         G.phase === 'shot' ? 30 : 0;
}
function syncPhaseClock(first){
  if (!U || U.mode !== 'net') return;
  const key = U.G.phase + ':' + U.G.night + ':' + U.G.log.length;
  if (U.phaseKey === key && !first) return;
  U.phaseKey = key;
  U.deadline = Date.now() + phaseSeconds(U.G) * 1000;
}
function tickClock(){
  if (!U || U.mode !== 'net' || U.G.over) return;
  const left = Math.max(0, Math.round((U.deadline - Date.now()) / 1000));
  const clk = U.ctx.rootEl.querySelector('#su-clk');
  if (clk) clk.textContent = fmtClock(left);
  if (left <= 0 && U.host){
    const G = U.G;
    const end = G.phase === 'night' ? 'nightEnd' : G.phase === 'day' ? 'dayEnd' :
                G.phase === 'defence' ? 'defEnd' : G.phase === 'verdict' ? 'verdictEnd' :
                G.phase === 'shot' ? 'shotEnd' : null;
    if (end) netAct({ t: end, seat: U.seat });
  }
}
function fmtClock(s){ return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

/* ── death: the unmissable notice ── */
function deathNotice(){
  if (!U || !U.ctx) return;
  sfx('board.mate');
  const d = document.createElement('div');
  d.className = 'su-death';
  d.innerHTML = '<h2>INT MEJJET</h2>' +
    '<p><b>Ma tistax titkellem aktar mal-kamra.</b> La b’leħnek, la ċċaqlaq xufftejk, ' +
    'u lanqas tonfoħ. Il-vot tiegħek spiċċa.</p>' +
    '<p class="may">Li FADALLEK: taqra kollox, u tikteb lill-mejtin l-oħra fil-kanal ' +
    'IL-MEJTIN. Il-ħajjin ma jarawx dak li tikteb.</p>';
  const b = document.createElement('button');
  b.className = 'su-btn red';
  b.style.cssText = 'width:min(300px,84%);padding:15px';
  b.textContent = 'FHIMT — SKIET';
  b.onclick = () => { d.remove(); render(); };
  d.appendChild(b);
  U.ctx.rootEl.appendChild(d);
}

/* ── chat: server-filtered private channels ─────────────────────────
   Capability first: GET the relay's /health and look for chat:1.
   Without it we say so and stay silent rather than leak. */
function chatProbe(){
  U.chat.cap = null;
  const url = (window.KARTI_MP && KARTI_MP.RELAY_HEALTH) || null;
  if (!url){ U.chat.cap = false; return; }
  fetch(url, { mode:'cors' }).then(r => r.json()).then(j => {
    if (U && U.chat) U.chat.cap = !!(j && j.chat);
    if (U) render();
  }).catch(() => { if (U && U.chat){ U.chat.cap = false; render(); } });
}
function wsWrap(){
  const MP = window.KARTI_MP && KARTI_MP.MP;
  if (!MP || !MP.ws || MP.ws.__suWrapped) return;
  const ws = MP.ws;
  const prev = ws.onmessage;
  ws.__suWrapped = true;
  ws.onmessage = e => {
    try {
      const m = JSON.parse(e.data);
      if (m && m.t === 'chat'){ chatIn(m); return; }
    } catch (err){}
    if (prev) prev(e);
  };
  if (U) U.unwrap = () => { try { ws.onmessage = prev; ws.__suWrapped = false; } catch (e){} };
}
function chatSend(text){
  if (!U || U.mode !== 'net') return;
  text = String(text || '').trim().slice(0, 240);
  if (!text) return;
  const ch = U.chat.active;
  if (!S.chanWrite(U.G, U.seat, ch)){ toast('Dan il-kanal magħluq għalik bħalissa.'); return; }
  if (U.chat.cap === false){ toast('Ir-relay għad m’għandux chat — ara l-avviż.'); return; }
  const to = S.chanReaders(U.G, ch).filter(s => s !== U.seat);
  const MP = window.KARTI_MP && KARTI_MP.MP;
  if (MP && MP.ws && MP.ws.readyState === 1){
    try { MP.ws.send(JSON.stringify({ t:'chat', ch: ch, x: text, to: to })); } catch (e){}
  }
  chatPush(ch, U.seat, text, true);
  render();
}
function chatIn(m){
  if (!U || U.mode !== 'net') return;
  const ch = typeof m.ch === 'string' ? m.ch.slice(0, 12) : 'pjazza';
  const s = m.s | 0;
  /* the engine is the authority on whether WE may read this channel;
     a frame that slips through for a channel we cannot read is dropped
     (belt to the server's braces) */
  if (!S.channels(U.G, U.seat).some(c => c.id === ch && c.read)) return;
  chatPush(ch, s, String(m.x || '').slice(0, 240), false);
  if (ch !== U.chat.active) U.chat.unread[ch] = (U.chat.unread[ch] || 0) + 1;
  sfx('ui.note');
  render();
}
function chatPush(ch, seat, text, me){
  const list = U.chat.chans[ch] || (U.chat.chans[ch] = []);
  list.push({ s: seat, x: text, me: !!me });
  if (list.length > 200) list.shift();
}
/* who a chat line is signed as — the seance writes as her ROLE */
function chatLabel(ch, seat){
  const p = U.G.P[seat];
  if (!p) return 'Siġġu ' + (seat + 1);
  if (ch === 'mejtin' && p.alive) return 'Tal-Karti';
  return p.name;
}
function cannedFor(ch, phase){
  if (ch === 'klikka') return ['Lil min illejla?', 'Iva, naqbel', 'Le, mhux dak', 'Oqogħdu attenti għalija'];
  if (ch === 'mejtin') return ['Min qatilkom?', 'X’rajtu qabel mittu?', 'Tafu xi ħaġa fuq il-klikka?'];
  if (phase === 'verdict') return ['ĦATI', 'MHUX ĦATI', 'Mhux konvint'];
  return ['Jien nadif', 'Fejn kont ilbieraħ?', 'Dan qed jigdeb', 'Għandi prova — staqsuni', 'Ivvutaw miegħi'];
}

function renderNet(){
  const G = U.G;
  const w = U.ctx.wrap;
  const v = S.view(G, U.seat);
  const chans = S.channels(G, U.seat);
  if (!chans.some(c => c.id === U.chat.active)) U.chat.active = chans[0].id;
  const active = chans.find(c => c.id === U.chat.active);
  const msgs = U.chat.chans[active.id] || [];
  U.chat.unread[active.id] = 0;
  const silent = !v.speak;

  let html =
    refBar(v.speak, refWhy(v)) +
    '<div class="su-phase' + (v.phase === 'night' || v.phase === 'shot' ? ' night' : '') + '">' +
    '<span>' + esc(phaseName(G)) + '</span><span class="clk" id="su-clk"></span></div>';
  if (U.chat.cap === false)
    html += '<div class="su-net-banner">Dan ir-relay għad ma jafx bil-chat privata — il-kanali ' +
      'mitfija. Il-logħba xorta timxi (l-azzjonijiet jgħaddu), imma aġġornaw is-server biex ' +
      'il-klikka u l-mejtin ikollhom fejn jiktbu.</div>';
  html += seatsHTML(G, U.seat) +
    '<div class="su-mid">' + logHTML(G, 5) +
    '<div class="su-tabs">' + chans.map(c =>
      '<button class="su-tab ' + c.cls + (c.id === active.id ? ' on' : '') + '" data-ch="' + c.id + '">' +
      esc(c.name) + (U.chat.unread[c.id] ? '<span class="n">' + U.chat.unread[c.id] + '</span>' : '') +
      '</button>').join('') + '</div>' +
    '<div class="su-chat ' + active.cls + '" id="su-chatbox">' +
    (msgs.length ? msgs.map(m2 =>
      '<div class="su-msg ' + active.cls + '"><b>' + esc(chatLabel(active.id, m2.s)) + ':</b> ' +
      esc(m2.x) + '</div>').join('')
      : '<div class="su-msg sys">' + esc(active.note || 'Xejn għadu ma ntqal hawn.') + '</div>') +
    '</div>' +
    '<div class="su-canned">' + cannedFor(active.id, v.phase).map((c, i) =>
      '<button class="su-can" data-c="' + i + '">' + esc(c) + '</button>').join('') + '</div>' +
    '<div class="su-inrow">' +
    '<input class="su-in ' + active.cls + '" id="su-in" maxlength="240" autocomplete="off" ' +
      'placeholder="' + (active.write ? 'Ikteb lil ' + esc(active.name) + String.fromCharCode(8230) : 'Taqra biss hawn bħalissa') + '"' +
      (active.write && U.chat.cap !== false ? '' : ' disabled') + '>' +
    '<button class="su-send" id="su-send"' + (active.write && U.chat.cap !== false ? '' : ' disabled') + '>IBGĦAT</button>' +
    '</div></div>';

  /* action bar per phase — the night action opens a CONCEALED sheet */
  if (!G.over){
    if (v.alive){
      if (v.phase === 'night' && v.canAct && !v.acted)
        html += '<div class="su-bar"><button class="su-btn gold" id="su-act">AZZJONI TAL-LEJL (bil-moħbi)</button>' +
                '<button class="su-btn" id="su-role">Ir-rwol</button></div>';
      else if (v.phase === 'day')
        html += '<div class="su-bar"><button class="su-btn gold" id="su-vote">IVVOTA' +
          (G.votes[U.seat] !== undefined && G.votes[U.seat] >= 0 ? ': ' + esc(G.P[G.votes[U.seat]].name) : '') +
          '</button><button class="su-btn" id="su-role">Ir-rwol</button></div>';
      else if (v.phase === 'verdict' && U.seat !== v.accused && G.verdict[U.seat] === undefined)
        html += '<div class="su-bar"><button class="su-btn red" id="su-hati">ĦATI</button>' +
                '<button class="su-btn gold" id="su-le">MHUX ĦATI</button></div>';
      else if (v.mustShoot)
        html += '<div class="su-bar"><button class="su-btn red" id="su-shoot">IS-SENTER</button></div>';
      else
        html += '<div class="su-bar"><button class="su-btn" id="su-role">Ir-rwol tiegħek (bil-moħbi)</button></div>';
    } else {
      html += '<div class="su-bar"><button class="su-btn" id="su-role">X’kont? (bil-moħbi)</button></div>';
    }
  }
  w.innerHTML = html;

  const box = w.querySelector('#su-chatbox');
  if (box) box.scrollTop = box.scrollHeight;
  const ban = w.querySelector('.su-net-banner');
  if (ban) ban.onclick = () => ban.classList.toggle('full');
  w.querySelectorAll('.su-tab').forEach(b => b.onclick = () => {
    U.chat.active = b.dataset.ch; sfx('ui.tap'); render();
  });
  const inp = w.querySelector('#su-in');
  const send = w.querySelector('#su-send');
  if (send) send.onclick = () => { chatSend(inp.value); inp.value = ''; };
  if (inp) inp.onkeydown = e => { if (e.key === 'Enter'){ chatSend(inp.value); inp.value = ''; } };
  w.querySelectorAll('.su-can').forEach(b => b.onclick = () => {
    chatSend(b.textContent);
  });
  const roleB = w.querySelector('#su-role');
  if (roleB) roleB.onclick = () => showSecret(h => roleCardInto(h, G, U.seat));
  const actB = w.querySelector('#su-act');
  if (actB) actB.onclick = () => netNightSheet(v);
  const voteB = w.querySelector('#su-vote');
  if (voteB) voteB.onclick = () => netVoteSheet(v);
  const hati = w.querySelector('#su-hati');
  if (hati) hati.onclick = () => netAct({ t:'verdict', seat: U.seat, guilty: true });
  const le = w.querySelector('#su-le');
  if (le) le.onclick = () => netAct({ t:'verdict', seat: U.seat, guilty: false });
  const sh = w.querySelector('#su-shoot');
  if (sh) sh.onclick = () => showSecret(h => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.innerHTML = '<h3>L-aħħar tir</h3><p>Ħu lil xi ħadd miegħek, jew spara fl-ajru.</p>';
    h.appendChild(d);
    targetGridInto(h, G, S.alive(G).map(p => p.seat), s => {
      hideSecret(); netAct({ t:'shot', seat: U.seat, target: s });
    });
  }, { closeLabel: 'Spara fl-ajru', onClose: () => netAct({ t:'shot', seat: U.seat, target: -1 }) });
  tickClock();
}
function netNightSheet(v){
  const G = U.G;
  showSecret(host => {
    roleCardInto(host, G, U.seat);
    let first = -1;
    const opts = nightOpts(G, v, U.seat);
    const t2 = document.createElement('div');
    t2.style.cssText = 'font-weight:900;font-size:13px;color:var(--dim)';
    t2.textContent = v.role.two ? 'Agħżel TNEJN:' :
      v.role.id === 'haffier' ? 'Agħżel katavru:' : 'Agħżel:';
    host.appendChild(t2);
    targetGridInto(host, G, opts, (s, btn) => {
      if (v.role.two && first < 0){ first = s; btn.classList.add('on'); return; }
      const mv = { t:'night', seat: U.seat, target: v.role.two ? first : s };
      if (v.role.two) mv.target2 = s;
      hideSecret();
      netAct(mv);
    });
  }, { closeLabel: 'Orqod (xejn illejla)', onClose: () => {
    if (U.G.acts[U.seat] === undefined && U.G.phase === 'night')
      netAct({ t:'night', seat: U.seat, target: -1, target2: -1 });
  } });
}
function netVoteSheet(v){
  const G = U.G;
  showSecret(host => {
    const d = document.createElement('div');
    d.className = 'su-card';
    d.innerHTML = '<h3>Akkuża</h3><p>Il-vot tal-pjazza jidher fuq l-iskrin ta’ kulħadd. Tista’ tibdlu sakemm jagħlaq il-jum.</p>';
    host.appendChild(d);
    targetGridInto(host, G, S.alive(G).map(p => p.seat).filter(s => s !== U.seat), s => {
      hideSecret(); netAct({ t:'vote', seat: U.seat, target: s });
    });
    if (v.canReveal){
      const rb = document.createElement('button');
      rb.className = 'su-btn';
      rb.style.width = 'min(330px,88%)';
      rb.textContent = 'IKXEF RUĦEK BĦALA SINDKU';
      rb.onclick = () => { hideSecret(); netAct({ t:'reveal', seat: U.seat }); };
      host.appendChild(rb);
    }
  }, { closeLabel: 'Astjeni', onClose: () => {
    if (U.G.phase === 'day') netAct({ t:'vote', seat: U.seat, target: -1 });
  } });
}

/* ═══════════════ THE END ═══════════════ */
function showResult(){
  const G = U.G;
  if (U.resultShown) return;
  U.resultShown = true;
  clearSlot();
  const winners = (G.winners || []).map(s => G.P[s].name).join(', ');
  const iWon = U.mode === 'net' && (G.winners || []).indexOf(U.seat) >= 0;
  if (U.mode === 'net'){
    ST.rec[iWon ? 'w' : 'l'] = (ST.rec[iWon ? 'w' : 'l'] || 0) + 1;
    persist();
    try { if (window.KARTI_STATS && KARTI_STATS.record) KARTI_STATS.record('suspett', { result: iWon ? 'w' : 'l' }); } catch (e){}
  }
  sfx(iWon ? 'trick.win' : 'call.bell');
  showResultRaw(U.ctx.rootEl, G.winner,
    G.winner === 'rahal' ? 'Rebaħ ir-raħal' :
    G.winner === 'klikka' ? 'Rebħet il-klikka' :
    G.winner === 'biccier' ? 'Rebaħ il-Biċċier' : 'Ħadd ma rebaħ',
    (G.log[G.log.length - 1] || {}).txt + (winners ? ' Rebbieħa: ' + winners + '.' : ''),
    () => { const net = U && U.net; closeGame(); if (net && net.onLeave) net.onLeave(); else menu(); },
    G);
}
function showResultRaw(root, tone, head, why, back, G){
  const d = document.createElement('div');
  d.className = 'su-death';
  d.style.background = 'rgba(10,8,18,.97)';
  let roles = '';
  if (G){
    roles = '<div style="max-height:34vh;overflow-y:auto;font-size:12.5px;line-height:1.7">' +
      G.P.map(p => '<div>' + esc(p.name) + ' — <b style="color:var(--gold)">' +
        esc(S.ROLES[p.role].name) + '</b>' + (p.alive ? '' : ' (mejjet)') + '</div>').join('') + '</div>';
  }
  d.innerHTML = '<h2 style="color:' + (tone === 'rahal' ? '#3DDC84' : tone === 'klikka' ? '#FF7A6B' : '#C9B4FF') +
    '">' + esc(head) + '</h2><p>' + esc(why || '') + '</p>' + roles;
  const b = document.createElement('button');
  b.className = 'su-btn gold';
  b.style.cssText = 'width:min(300px,84%);padding:14px';
  b.textContent = 'Lura';
  b.onclick = () => { d.remove(); back(); };
  d.appendChild(b);
  root.appendChild(d);
}

/* ═══════════════ REGISTRATION ═══════════════ */
const LOBBY = {
  id:'suspett', name:'SUSPETT', mt:'Is-Suspett',
  minSeats: 5, maxSeats: 16, defaultSeats: 9, defaultLevel: 1,
  levels: [{ level:1, name:'Siġġu vojt', note:'Il-magni ma jafux jigdbu — dan logħob tal-bnedmin. Siġġu magni jintasa bħala Raħli rieqed.' }],
  isReady: s => !!(s && (s.kind === 'cpu' || s.ready)),
  autoReady: s => (s && s.kind === 'cpu') ? Object.assign({}, s, { ready:true }) : s,
  canStart(list){
    const n = (list || []).length;
    if (n < 5) return { ok:false, why:'Suspett irid mill-inqas ħamsa.' };
    if (n > 16) return { ok:false, why:'Sittax hu l-limitu tal-pjazza.' };
    const humans = (list || []).filter(x => x && x.kind !== 'cpu').length;
    if (humans < 3) return { ok:false, why:'Tliet bnedmin veri mill-inqas — il-magni ma jigdbux.' };
    const not = (list || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (not) return { ok:false, why: not + (not > 1 ? ' għadhom' : ' għadu') + ' mhux lest.' };
    return { ok:true, why:'' };
  },
  /* the lobby's fold-open rules door: the full teaching panel, tonight's
     pot first — this is the "what does what" reading for the wait */
  rulesHTML(){
    return buildTeachHTML(prefPool());
  },
  /* ── ROOM SETTINGS, DECLARATIVELY ────────────────────────────────
     Published for the shared lobby's settings mechanism (being built
     in js/mp.js): the host changes these IN THE LOBBY, everybody sees
     them change, nobody loses a chair. The chosen values arrive back
     as `opts` on start() and ride cfg.opts into onlineStart — which
     already consumes exactly these ids. Until the lobby mechanism
     lands, rooms simply start with the defaults. */
  settings: {
    v: 1,
    hostOnly: true,
    fields: [
      { id:'mode', type:'choice', label:'Il-borma tar-rwoli', def:'bilanc',
        options: S.MODES.map(m => ({ v: m.id, label: m.name, note: m.note })) },
      { id:'reveal', type:'bool', label:'Il-mejtin jikxfu r-rwol', def:true },
      { id:'dayT', type:'choice', label:'Ħin il-pjazza', def:240,
        options:[{ v:180, label:'3 min' }, { v:240, label:'4 min' },
                 { v:300, label:'5 min' }, { v:420, label:'7 min' }] }
    ]
  },
  blurb:'Min qed jigdeb? Raħal wieħed, klikka moħbija, u l-chat hu l-logħba.',
  myName(){
    try {
      const n = K && K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch (e){}
    return 'You';
  },
  start(seatList, opts){
    return onlineStart({ seats: seatList, seed: opts && opts.seed, you: 0, host: 0, net: null,
                         opts: opts || {} });
  },
  /* published for honesty, though mp.js reads its tombla fallback —
     these are a subset of it, so both agree byte for byte */
  wire: { fields: ['s', 'v', 'k', 'n', 'c', 'i', 'p', 'to'] },
  takeback: false
};

P.online = P.online || {};
P.online.suspett = {
  start: onlineStart,
  remote: onlineRemote,
  note: onlineNote,
  stop: onlineStop,
  live: () => !!(U && U.mode === 'net'),
  hooks: { onMove: subOnMove }
};

window.KARTI_SUSPETT = { open: menu, engine: S, lobby: LOBBY, ui: { menu, board } };

/* teach js/mp.js the id, the way gin and rummy do — without touching it */
(function teachLobby(){
  const MPX = window.KARTI_MP;
  if (!MPX || !Array.isArray(MPX.GAMES) || !Array.isArray(MPX.GAME_KEYS)) return;
  if (MPX.GAME_KEYS.indexOf('suspett') >= 0) return;
  MPX.GAMES.push({ k:'suspett', name:'Suspett', short:'SUSPETT', sym:'su-mark',
    blurb:'Raħal wieħed, klikka moħbija. Il-chat hu l-logħba.' });
  MPX.GAME_KEYS.push('suspett');
  if (MPX.SEATS_FALLBACK) MPX.SEATS_FALLBACK.suspett = [5, 16, 9];
})();

P.register({
  id:'suspett', order:65, kind:'other', name:'SUSPETT', mt:'Is-Suspett',
  sprite:'su-mark', status:'live',
  get tag(){
    return 'One village, one hidden klikka, and everybody typing so the person beside you ' +
      'hears nothing. Five to sixteen. ' + Object.keys(S.ROLES).length + ' roles in the pot.' +
      (ST.save ? ' There is a village mid-argument on this phone.' : '');
  },
  open: menu,
  seats: { min: 5, max: 16 },
  levels: LOBBY.levels,
  rulesHTML: () => LOBBY.rulesHTML(),
  start: (seatList, o) => LOBBY.start(seatList, o)
});

if (document.body) injectSprite();
else document.addEventListener('DOMContentLoaded', injectSprite);

/* ── test hooks — inert unless the page is opened with ?sutest ──── */
try {
  if (String(location.search).indexOf('sutest') >= 0){
    window.__SU = {
      U: () => U, ST: () => ST,
      menu, openPNP, onlineStart, onlineRemote, netAct, render,
      showSecret, hideSecret, secretOpen: () => secretOpen,
      chatIn, chatSend, deathNotice, curtainless: true
    };
  }
} catch (e){}
})();
