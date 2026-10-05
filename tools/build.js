// Baut eine einzelne HTML-Datei (alles eingebettet).
//   dist/tabwerk.html   eigenständig, zum Weitergeben oder Offline-Nutzen
//   dist/artifact.html  Seiteninhalt ohne <html>/<head>, zum Veröffentlichen als Claude-Artefakt
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const between = (a, b) => html.slice(html.indexOf(a) + a.length, html.indexOf(b));
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const head = between('<!--HEAD-->', '<!--/HEAD-->').replace(/<link rel="stylesheet" href="css\/style.css">/, `<style>\n${css}</style>`);
const body = between('<!--BODY-->', '<!--/BODY-->');
const scripts = [...between('<!--SCRIPTS-->', '<!--/SCRIPTS-->').matchAll(/src="([^"]+)"/g)]
  .map(m => `<script>\n${fs.readFileSync(path.join(root, m[1]), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`).join('\n');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), `${head.trim()}\n${body.trim()}\n${scripts}\n`);
fs.writeFileSync(path.join(root, 'dist/tabwerk.html'), `<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head.trim()}\n</head>\n<body>\n${body.trim()}\n${scripts}\n</body>\n</html>\n`);
console.log('dist/tabwerk.html und dist/artifact.html erstellt');
