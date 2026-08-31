/* ruin-01 — the summoning chamber. The player wakes on the floor engraving
   (the RUG tiles) with the Summoner standing over them. Enclosed by walls;
   the only way on is the arch in the EAST wall, which seams into ruin-02.
   10x10 like EVERY map (Dofus screen model — each map is one whole framed
   screen). Pure data — see WORLD_SPEC.md §3 for the format. */
'use strict';
window.MAPS = window.MAPS || {};
window.MAPS['ruin-01'] = {
  id: 'ruin-01', w: 10, h: 10, atlas: 'art/world.png',
  /* ground: 1 floor  2 floor2  3 crack  4 rug (the summoning engraving) */
  ground: [
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,2,1,1,3,1,1,2,1],
    [1,2,1,1,1,1,1,1,1,1],
    [1,1,1,2,1,1,1,3,1,1],
    [1,1,1,4,4,4,1,1,2,1],
    [1,2,1,4,4,4,1,1,1,1],
    [1,1,1,4,4,4,1,2,1,1],
    [1,1,3,1,1,1,1,1,1,1],
    [1,1,1,1,2,1,1,3,1,1],
    [1,1,1,1,1,1,1,1,1,1]
  ],
  /* decor: 8 wall  9 wall-crk  10 pillar  11 arch  12 brazier
            13 crate  15 rubble */
  decor: [
    [8,8,8,9,8,8,8,8,9,8],
    [8,0,0,0,0,0,0,0,0,8],
    [9,0,0,0,0,12,0,0,0,8],
    [8,0,10,0,0,0,0,10,0,8],
    [8,0,0,0,0,0,0,0,0,9],
    [8,0,0,0,0,0,0,0,0,11],
    [8,0,0,0,0,0,0,0,0,8],
    [9,0,10,0,0,0,0,10,0,8],
    [8,0,13,0,0,0,0,0,15,8],
    [8,8,8,8,9,8,8,8,8,8]
  ],
  block: [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,1,0,0,0,1],
    [1,0,1,0,0,0,0,1,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,1,0,0,0,0,1,0,1],
    [1,0,1,0,0,0,0,0,1,1],
    [1,1,1,1,1,1,1,1,1,1]
  ],
  markers: [
    { type:'player', c:4, r:5 },
    { type:'npc', id:'elder', name:'The Caretaker', c:6, r:4,
      sprite:'skelmage', dir:'SW' }
  ],
  neighbours: { n:null, e:'ruin-02', s:null, w:null }
};
