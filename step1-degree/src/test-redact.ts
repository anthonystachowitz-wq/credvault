import * as fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync('packages/STU-001.package.json', 'utf-8'));

// Path A: GPA SHOWN (default)
const shown = { presentationType: 'full-reveal', ...pkg, courseCount: pkg.courses.length };
const va = await (await fetch('http://localhost:4050/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentation: shown }) })).json() as any;
console.log('A. GPA shown:    ', va.verdict, '| gpa =', va.values?.gpa, va.values?.gpaRedacted ? '(redacted)' : '(visible)');

// Path B: GPA HIDDEN + threshold proof
const hidden = { presentationType: 'full-reveal', ...pkg, courseCount: pkg.courses.length };
hidden.values = { ...hidden.values };
delete hidden.values.gpa;
delete hidden.salts.gpa;
hidden.gpaRedacted = true;
const vb = await (await fetch('http://localhost:4050/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentation: hidden, minGpa: 350 }) })).json() as any;
console.log('B. GPA hidden+ZK:', vb.verdict, '| gpa =', vb.values?.gpa ?? 'SEALED', '| L2 ok:', vb.l2?.ok);

// Path C: HIDDEN + threshold the student can't meet
const vc = await (await fetch('http://localhost:4050/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentation: hidden, minGpa: 399 }) })).json() as any;
console.log('C. hidden @3.99:  ', vc.verdict, '—', vc.detail);
process.exit(0);
