import * as os from 'node:os';
const pkg = await (await fetch('http://localhost:4050/api/packages/CTU-001.json')).json() as any;
const presentation = { presentationType: 'full-reveal', ...pkg, courseCount: pkg.courses.length };
const v = await (await fetch('http://localhost:4050/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentation }) })).json() as any;
console.log('console-issued package verifies:', v.verdict, '—', v.values.fullName, '| courses:', v.courses?.length, 'of', v.courseCount);
const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
console.log('LAN address for phone testing: http://' + ip + ':4050');
process.exit(0);
