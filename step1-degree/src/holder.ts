// CredVault — holder CLI (mock student)
// Usage:
//   npm run holder STU-001                          → full reveal (all courses)
//   npm run holder STU-001 -- --courses MATH420,CS460   → SUBSET: only those courses
// The presentation is the QR-equivalent payload handed to a verifier.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectRoot } from './common';

const [, , studentId, ...rest] = process.argv;
if (!studentId) { console.log('usage: npm run holder <STU-ID> [-- --courses CODE1,CODE2]'); process.exit(1); }
const ci = rest.indexOf('--courses');
const wanted: string[] | null = ci > -1 ? rest[ci + 1].split(',').map((s) => s.trim().toUpperCase()) : null;

const pkgPath = path.join(projectRoot, 'packages', studentId + '.package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
if (wanted && pkg.transcriptMode === 'monolithic') {
  console.log('✗ this issuer uses MONOLITHIC mode — subsets are not possible; share the full transcript instead.');
  process.exit(1);
}

const all = pkg.courses ?? [];
let revealed = all;
if (wanted) {
  revealed = all.filter((c) => wanted.includes(c.code.toUpperCase()));
  const missing = wanted.filter((w) => !all.some((c) => c.code.toUpperCase() === w));
  if (missing.length) { console.log('✗ courses not in package:', missing.join(', ')); process.exit(1); }
}

const presentation = {
  presentationType: wanted ? 'course-subset' : 'full-reveal',
  ...pkg,
  courses: revealed,
  courseCount: all.length,
  presentedAt: new Date().toISOString(),
};
// the holder package itself is never shared — only the presentation
const outName = studentId + (wanted ? '-' + wanted.join('+') : '') + '.presentation.json';
const outPath = path.join(projectRoot, 'presentations', outName);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(presentation, null, 2));
console.log('✅', presentation.presentationType, 'presentation:', outPath);
console.log('   revealed', revealed.length, 'of', all.length, 'courses' + (wanted ? ' (' + wanted.join(', ') + ')' : ''));
