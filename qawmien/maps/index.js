/* maps/index.js — the roster of every map and its neighbour links.
   Load AFTER all maps/<id>.js files. world.html can read files[] for its
   script tags and neighbours{} mirrors each map's own neighbours field
   (tools/checkmaps.js asserts they agree). Layout:

       ruin-01 ─e─ ruin-02 ─exit─ field-0-0 ─ field-1-0 ─ field-2-0
                                      │            │           │
                                  field-0-1 ─ field-1-1 ─ field-2-1   */
'use strict';
window.MAP_INDEX = {
  files: [
    'maps/ruin-01.js', 'maps/ruin-02.js',
    'maps/field-0-0.js', 'maps/field-1-0.js', 'maps/field-2-0.js',
    'maps/field-0-1.js', 'maps/field-1-1.js', 'maps/field-2-1.js'
  ],
  list: [
    'ruin-01', 'ruin-02',
    'field-0-0', 'field-1-0', 'field-2-0',
    'field-0-1', 'field-1-1', 'field-2-1'
  ],
  start: 'ruin-01',
  fieldGrid: [
    ['field-0-0', 'field-1-0', 'field-2-0'],
    ['field-0-1', 'field-1-1', 'field-2-1']
  ],
  neighbours: {
    'ruin-01':   { n:null, e:'ruin-02', s:null, w:null },
    'ruin-02':   { n:null, e:null, s:null, w:'ruin-01' },
    'field-0-0': { n:null, e:'field-1-0', s:'field-0-1', w:null },
    'field-1-0': { n:null, e:'field-2-0', s:'field-1-1', w:'field-0-0' },
    'field-2-0': { n:null, e:null, s:'field-2-1', w:'field-1-0' },
    'field-0-1': { n:'field-0-0', e:'field-1-1', s:null, w:null },
    'field-1-1': { n:'field-1-0', e:'field-2-1', s:null, w:'field-0-1' },
    'field-2-1': { n:'field-2-0', e:null, s:null, w:'field-1-1' }
  }
};
