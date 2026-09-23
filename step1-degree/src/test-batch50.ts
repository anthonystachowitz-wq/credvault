import * as fs from 'node:fs';

// replicate the console's CSV parsing
const text = fs.readFileSync('data/batch-granular-50.csv', 'utf-8');
const rows = text.trim().split(/\r?\n/).map((r) => r.split(',').map((x) => x.trim()));
const students = new Map<string, any>();
for (const r of rows) {
  if (r[0].toLowerCase() === 'studentid') continue;
  const [id, name, degree, gpa, code, title, credits, grade] = r;
  if (!students.has(id)) students.set(id, { id, fullName: name, degree, gpa: Number(gpa), courses: [] });
  students.get(id).courses.push({ code, title, credits: Number(credits), grade });
}
const cohort = { issuer: 'Granular State (mock)', cohort: 'batch-granular-50', transcriptMode: 'granular', students: [...students.values()] };
console.log('parsed', cohort.students.length, 'students,', rows.length - 1, 'rows');

const r = await fetch('http://localhost:4050/api/issuer/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cohort }) });
const { jobId, error } = (await r.json()) as any;
if (error) { console.log('POST error:', error); process.exit(1); }
console.log('job:', jobId);
for (let i = 0; i < 90; i++) {
  await new Promise((r2) => setTimeout(r2, 4000));
  const j = (await (await fetch('http://localhost:4050/api/issuer/jobs/' + jobId)).json()) as any;
  if (j.status !== 'running') {
    console.log('job', j.status);
    console.log(j.log.slice(-8).join('\n'));
    break;
  }
  process.stdout.write('.');
}
process.exit(0);
