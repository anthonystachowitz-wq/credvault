// CredVault — verifier CLI (mock employer)
// Usage: npm run verifier <presentation.json> [-- --min-gpa 350]
import * as fs from 'node:fs';
import { verifyPresentation } from './verify-core';

const [, , file, ...rest] = process.argv;
if (!file) { console.log('usage: npm run verifier <presentation.json> [-- --min-gpa 350]'); process.exit(1); }
const mi = rest.indexOf('--min-gpa');
const minGpa = mi > -1 ? Number(rest[mi + 1]) : undefined;

const p = JSON.parse(fs.readFileSync(file, 'utf-8'));
const r = await verifyPresentation(p, minGpa);

if (r.verdict === 'VERIFIED') {
  console.log('\n✅ VERIFIED');
  console.log('   Issuer:  ', p.issuer);
  console.log('   Cohort:  ', p.cohort);
  console.log('   Name:    ', r.values!.fullName);
  console.log('   Degree:  ', r.values!.degree);
  console.log('   GPA:     ', (r.values!.gpa / 100).toFixed(2));
  if (Array.isArray(p.courses) && p.courses.length) {
    console.log('   Courses:  (revealed ' + p.courses.length + ' of ' + (p.courseCount ?? p.courses.length) + ')');
    for (const c of p.courses) console.log('      ', c.code.padEnd(8), c.grade.padEnd(3), c.title, '(' + c.credits + ' cr)');
    if ((p.courseCount ?? 0) > p.courses.length) {
      console.log('      … ' + ((p.courseCount ?? 0) - p.courses.length) + ' more course(s) SEALED (not disclosed by holder)');
    }
  }
  if (r.l2?.ok) console.log('   L2:      ✅ ZK PROOF VALID — GPA >= ' + (r.l2.minGpa / 100).toFixed(2) + ' (GPA never revealed)');
} else {
  console.log('\n✗', r.verdict, '—', r.detail);
}
console.log('   verify time:', (r.ms / 1000).toFixed(1) + 's');
process.exit(r.verdict === 'VERIFIED' ? 0 : 1);
