const fs = require('fs');
const code = fs.readFileSync('/home/foxhound/webclients/karti-malta/js/ballun.js', 'utf8');
const G = {};
global.window = G;      // the IIFE picks window when defined
new Function('window', code + '\nreturn window;')(G);
module.exports = G.KARTI_BALLUN.engine;
