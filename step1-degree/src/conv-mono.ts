// Convert batch-monolithic-50.csv → cohort JSON with monolithic mode, re-anchor correctly
import * as fs from 'node:fs';
const text = fs.readFileSync('data/batch-monolithic-50.csv', 'utf-8');
const rows = text.trim().split(/\r?\n/).map((r) => r.split(',').map((x) => x.trim()));
const students = new Map<string, any>();
for (const r of rows) {
  if (r[0].toLowerCase() === 'studentid') continue;
  const [id, name, degree, gpa, code, title, credits, grade] = r;
  if (!students.has(id)) students.set(id, { id, fullName: name, degree, gpa: Number(gpa), courses: [] });
  students.get(id).courses.push({ code, title, credits: Number(credits), grade });
}
const cohort = { issuer: 'Monolithic University (mock)', cohort: 'batch-monolithic-50', transcriptMode: 'monolithic', students: [...students.values()] };
fs.writeFileSync('data/cohort-mono-50.json', JSON.stringify(cohort, null, 2));
console.log('wrote data/cohort-mono-50.json:', cohort.students.length, 'students, monolithic');
