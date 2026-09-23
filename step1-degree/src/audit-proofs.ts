import * as fs from 'node:fs';
const files = fs.readdirSync('packages').filter((f) => f.endsWith('.package.json'));
let withProofs = 0;
const without: string[] = [];
for (const f of files) {
  const p = JSON.parse(fs.readFileSync('packages/' + f, 'utf-8'));
  if ((p.l2Proofs ?? []).length > 0) withProofs++;
  else without.push(p.studentId);
}
console.log('packages with L2 proofs:', withProofs, '/', files.length);
console.log('without proofs:', without.join(', ') || 'none');
process.exit(0);
