/* maps/index.js — the roster of every map and its neighbour links.
   Load AFTER all maps/<id>.js files. world.html can read files[] for its
   script tags and neighbours{} mirrors each map's own neighbours field
   (tools/checkmaps.js asserts they agree).

   DOFUS SCREEN MODEL: every map is 10x10 — one whole screen, framed
   entirely by the camera; walking off an edge swaps to the neighbour.
   Layout (ruins seam into the field grid via ruin-02's east arch):

       ruin-01 ─e─ ruin-02 ─exit─ field-0-0 … field-4-0
                                      │            │
                                  field-0-1 … field-4-1
                                      │            │
                                  field-0-2 … field-4-2   */
'use strict';
window.MAP_INDEX = {
  files: [
    'maps/ruin-01.js',
    'maps/ruin-02.js',
    'maps/field-0-0.js',
    'maps/field-1-0.js',
    'maps/field-2-0.js',
    'maps/field-3-0.js',
    'maps/field-4-0.js',
    'maps/field-0-1.js',
    'maps/field-1-1.js',
    'maps/field-2-1.js',
    'maps/field-3-1.js',
    'maps/field-4-1.js',
    'maps/field-0-2.js',
    'maps/field-1-2.js',
    'maps/field-2-2.js',
    'maps/field-3-2.js',
    'maps/field-4-2.js'
  ],
  list: [
    'ruin-01',
    'ruin-02',
    'field-0-0',
    'field-1-0',
    'field-2-0',
    'field-3-0',
    'field-4-0',
    'field-0-1',
    'field-1-1',
    'field-2-1',
    'field-3-1',
    'field-4-1',
    'field-0-2',
    'field-1-2',
    'field-2-2',
    'field-3-2',
    'field-4-2'
  ],
  start: 'ruin-01',
  fieldGrid: [
    ['field-0-0', 'field-1-0', 'field-2-0', 'field-3-0', 'field-4-0'],
    ['field-0-1', 'field-1-1', 'field-2-1', 'field-3-1', 'field-4-1'],
    ['field-0-2', 'field-1-2', 'field-2-2', 'field-3-2', 'field-4-2']
  ],
  neighbours: {
    'ruin-01':   { n:null, e:'ruin-02', s:null, w:null },
    'ruin-02':   { n:null, e:null, s:null, w:'ruin-01' },
    'field-0-0': { n:null, e:'field-1-0', s:'field-0-1', w:null },
    'field-1-0': { n:null, e:'field-2-0', s:'field-1-1', w:'field-0-0' },
    'field-2-0': { n:null, e:'field-3-0', s:'field-2-1', w:'field-1-0' },
    'field-3-0': { n:null, e:'field-4-0', s:'field-3-1', w:'field-2-0' },
    'field-4-0': { n:null, e:null, s:'field-4-1', w:'field-3-0' },
    'field-0-1': { n:'field-0-0', e:'field-1-1', s:'field-0-2', w:null },
    'field-1-1': { n:'field-1-0', e:'field-2-1', s:'field-1-2', w:'field-0-1' },
    'field-2-1': { n:'field-2-0', e:'field-3-1', s:'field-2-2', w:'field-1-1' },
    'field-3-1': { n:'field-3-0', e:'field-4-1', s:'field-3-2', w:'field-2-1' },
    'field-4-1': { n:'field-4-0', e:null, s:'field-4-2', w:'field-3-1' },
    'field-0-2': { n:'field-0-1', e:'field-1-2', s:null, w:null },
    'field-1-2': { n:'field-1-1', e:'field-2-2', s:null, w:'field-0-2' },
    'field-2-2': { n:'field-2-1', e:'field-3-2', s:null, w:'field-1-2' },
    'field-3-2': { n:'field-3-1', e:'field-4-2', s:null, w:'field-2-2' },
    'field-4-2': { n:'field-4-1', e:null, s:null, w:'field-3-2' }
  }
};
