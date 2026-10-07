// Lädt die Browser-Skripte in einen gemeinsamen Kontext für Node-Tests.
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = function load(files = ['theory.js', 'model.js', 'harmony.js', 'musicxml.js', 'gpimport.js', 'examples.js']) {
  const ctx = vm.createContext({ console, TextEncoder, TextDecoder, Date, Math, JSON, Blob, Response, DecompressionStream, Uint8Array });
  const src = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n;\n');
  // const/function-Deklarationen sichtbar machen
  const names = [...src.matchAll(/^(?:const|function|let)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]).concat(['MEASURE']);
  vm.runInContext(src + `\n;({${[...new Set(names)].join(',')}})`, ctx);
  return vm.runInContext(`({${[...new Set(names)].join(',')}})`, ctx);
};
