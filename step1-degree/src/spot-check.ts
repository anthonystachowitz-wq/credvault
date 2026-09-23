import * as fs from 'node:fs';
async function check(id: string, minGpa: number) {
  const pkg = JSON.parse(fs.readFileSync('packages/' + id + '.package.json', 'utf-8'));
  const presentation = { presentationType: 'full-reveal', ...pkg, courseCount: pkg.courses.length };
  const v = await (await fetch('http://localhost:4050/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentation, minGpa }) })).json() as any;
  console.log(id, '(gpa ' + (pkg.values.gpa / 100).toFixed(2) + ') @>=' + (minGpa / 100).toFixed(2) + ':', v.verdict, v.l2?.ok ? '— ZK proof VALID' : '— ' + v.detail);
}
await check('GRA-001', 300);
await check('GRA-003', 350);
await check('MONO-002', 300);
await check('MONO-003', 350);
process.exit(0);
