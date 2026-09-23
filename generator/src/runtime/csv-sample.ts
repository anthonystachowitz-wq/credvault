// Generate a sample CSV upload file + README from a descriptor.
import type { AppDescriptor } from '../schemas/descriptor.js';

export interface CsvSample {
  csv: string;
  readme: string;
}

export function generateCsvSample(descriptor: AppDescriptor, options?: { holderRef?: string }): CsvSample {
  const holderRef = options?.holderRef ?? 'HOLDER-001';

  // Build header
  const headerParts = ['holderRef'];
  const valueParts = [holderRef];

  for (const f of descriptor.fields) {
    if (f.kind === 'value') {
      headerParts.push(f.name);
      valueParts.push(sampleValue(f.type, f.name));
    } else if (f.kind === 'metric') {
      headerParts.push(f.name);
      valueParts.push(sampleMetric(f.scale));
    }
  }

  for (const s of descriptor.sets) {
    headerParts.push(s.name);
    const sampleItems = s.mode === 'granular'
      ? [sampleSetItem(s.itemFields), sampleSetItem(s.itemFields)]
      : [sampleSetItem(s.itemFields)];
    valueParts.push(JSON.stringify(sampleItems));
  }

  const csv = [headerParts.map(csvEscape).join(','), valueParts.map(csvEscape).join(',')].join('\n');

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

  const readme = [
    '# CSV Upload Format',
    '',
    'One row per credential holder.',
    '',
    '## Columns',
    '',
    '| Column | Kind | Example | Notes |',
    '|---|---|---|---|',
    '| holderRef | identifier | HOLDER-001 | unique reference for the holder |',
    ...descriptor.fields.map((f: any) => {
      if (f.kind === 'value') return `| ${f.name} | value | ${sampleValue(f.type, f.name)} | ${f.type}`;
      if (f.kind === 'metric') return `| ${f.name} | metric | ${sampleMetric(f.scale)} | raw decimal value; scale ${f.scale}`;
      return `| ${f.name} | unknown | | `;
    }),
    ...descriptor.sets.map((s) => `| ${s.name} | set | JSON array | ${s.mode} mode; each item has ${s.itemFields.map((f) => f.name).join(', ')}`),
    '',
    '## Set column format',
    '',
    'Set columns contain a JSON array of objects. Examples:',
    '',
    'Granular (individual item disclosure):',
    '',
    `${JSON.stringify([sampleSetItem(descriptor.sets[0]?.itemFields ?? [])])}`,
    '',
    'Group (all-or-nothing disclosure):',
    '',
    `${JSON.stringify(descriptor.sets[0]?.itemFields ? [sampleSetItem(descriptor.sets[0].itemFields)] : [])}`,
    '',
    '## Scale for metric fields',
    '',
    ...descriptor.fields
      .filter((f: any) => f.kind === 'metric')
      .map((f: any) => `- ${f.name}: multiply raw value by ${f.scale}. Example: 3.85 → 385 in the commitment.`),
    '',
  ].join('\n');

  return { csv, readme };
}

function sampleValue(type: string, fieldName: string): string {
  if (type === 'uint') return '42';
  if (type === 'boolean') return 'true';
  if (type === 'timestamp') return '2026-05-01T00:00:00Z';
  // realistic string samples based on common field names
  const lower = fieldName.toLowerCase();
  if (lower.includes('name')) return 'Alice Example';
  if (lower.includes('degree') || lower.includes('title')) return 'Bachelor of Science';
  if (lower.includes('major')) return 'Computer Science';
  if (lower.includes('license')) return 'L-12345678';
  if (lower.includes('email')) return 'alice@example.edu';
  if (lower.includes('id') || lower.includes('student')) return 'STU-001';
  return 'Sample value';
}

function sampleMetric(scale: number): string {
  if (scale === 100) return '3.85';
  if (scale === 10) return '8.5';
  return '100';
}

function sampleSetItem(fields: { name: string; type: string }[]): Record<string, string | number> {
  const item: Record<string, string | number> = {};
  for (const f of fields) {
    if (f.type === 'uint') item[f.name] = 3;
    else item[f.name] = 'Example';
  }
  return item;
}