import * as fs from 'node:fs';
const html = fs.readFileSync('src/portal/public/issuer.html', 'utf-8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('no script found'); process.exit(0); }
const src = m[1];
fs.writeFileSync('/tmp/issuer-script.js', src);
try { new Function(src); console.log('script parses OK'); }
catch (e) {
  console.log('SYNTAX ERROR:', (e as Error).message);
  // print lines around the reported position if possible
  const lines = src.split('\n');
  lines.forEach((l, i) => { if (/onclick/.test(l)) console.log((i + 1) + ': ' + l.slice(0, 160)); });
}
process.exit(0);
