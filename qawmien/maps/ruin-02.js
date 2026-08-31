/* ruin-02 — the lesson room, east of ruin-01. Open floor with room to move
   and cast; the Restless Bones practice fight stands mid-room. The arch in
   the EAST wall is an exit marker out to field-0-0 (the way back in lands
   one tile inside the field so the return exit does not re-fire).
   WEST column is the seam with ruin-01 and is tile-for-tile identical to
   ruin-01's east column in all three layers. Pure data. */
'use strict';
window.MAPS = window.MAPS || {};
window.MAPS['ruin-02'] = {
  id: 'ruin-02', w: 12, h: 12, atlas: 'art/world.png',
  /* ground: 1 floor  2 floor2  3 crack  5 rubble-floor */
  ground: [
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,3,1,1,2,1,1,1,2,1,1],
    [1,2,1,1,1,1,1,2,1,1,1,1],
    [1,1,1,1,2,1,1,1,1,1,2,1],
    [1,1,2,1,1,1,3,1,1,1,1,1],
    [1,1,1,1,1,2,1,1,2,1,1,1],
    [1,2,1,1,3,1,1,1,1,1,2,1],
    [1,1,1,2,1,1,1,2,1,1,1,1],
    [1,1,1,1,1,3,1,1,1,5,1,1],
    [1,1,1,1,2,1,1,1,1,1,1,1],
    [1,2,1,1,1,1,2,1,1,5,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1]
  ],
  /* decor: 8 wall  9 wall-crk  10 pillar  11 arch  13 crate
            14 barrel  15 rubble */
  decor: [
    [8,8,8,8,9,8,8,8,8,8,8,8],
    [8,0,0,0,0,0,0,0,0,0,0,8],
    [8,0,0,0,0,0,0,0,0,0,0,9],
    [8,0,10,0,0,0,0,0,10,0,0,8],
    [8,0,0,0,0,0,0,0,0,0,0,8],
    [9,0,0,0,0,0,0,0,0,0,0,8],
    [11,0,0,0,0,0,0,0,0,0,0,11],
    [8,0,0,0,0,0,0,0,0,0,0,8],
    [8,0,0,0,0,0,0,0,0,15,0,8],
    [9,0,13,0,0,0,0,0,0,0,0,8],
    [8,0,0,0,0,0,0,0,0,14,0,8],
    [8,8,8,8,8,8,9,8,8,8,8,8]
  ],
  block: [
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,1,0,0,0,0,0,1,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1]
  ],
  markers: [
    { type:'fight', id:'bones', name:'Restless Bones', c:7, r:5,
      sprite:'skeleton', dir:'SW', foes:['grunt'] },
    { type:'exit', c:11, r:6, to:'field-0-0', at:{ c:1, r:6 } }
  ],
  neighbours: { n:null, e:null, s:null, w:'ruin-01' }
};
