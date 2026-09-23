import * as fs from 'node:fs';
async function post(file: string, minGpa?: number) {
  const presentation = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const res = await fetch('http://localhost:4050/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(minGpa ? { presentation, minGpa } : { presentation }),
  });
  const j: any = await res.json();
  console.log(file, '→', res.status, j.verdict, '—', j.detail, '(' + j.ms + 'ms)');
}
await post('presentations/STU-001.presentation.json', 350);
await post('presentations/STU-004.presentation.json');
await post('presentations/STU-001-old-root.presentation.json');
process.exit(0);
