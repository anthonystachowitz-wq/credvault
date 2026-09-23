import type { VerificationSchema, Field, ConditionalField, MatchSetField } from './types.js';

export interface ValidationIssue { code: string; message: string; path: string }

export function validateSchema(s: VerificationSchema): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const names = new Set<string>();
  for (const f of s.fields) {
    if (names.has(f.name)) issues.push({ code: 'DUPLICATE_FIELD_NAME', message: `Duplicate field name: ${f.name}`, path: `fields[${f.name}]` });
    names.add(f.name);
    validateField(f, issues);
  }
  // at least one field must contribute to the leaf
  if (s.fields.length === 0) issues.push({ code: 'NO_FIELDS', message: 'Schema has no fields', path: 'fields' });
  // conditional vars must be uint and have criteria
  const conds: ConditionalField[] = s.fields.filter((f) => f.kind === 'conditional') as ConditionalField[];
  for (const c of conds) {
    if (c.conditional.criteria.length === 0) issues.push({ code: 'NO_CRITERIA', message: `Conditional field ${c.name} has no criteria`, path: `fields[${c.name}].conditional.criteria` });
    for (const crit of c.conditional.criteria) {
      if (!c.conditional.operators.includes(crit.op)) issues.push({ code: 'CRITERION_OP_NOT_DECLARED', message: `Criterion op ${crit.op} not in declared operators for ${c.name}`, path: `fields[${c.name}].conditional.criteria` });
    }
  }
  // match-set capacity sanity
  for (const f of s.fields) {
    if (f.kind === 'matchSet') {
      if (f.maxItems > 65536) issues.push({ code: 'MAX_ITEMS_TOO_LARGE', message: `${f.name}: maxItems > 65536`, path: `fields[${f.name}].maxItems` });
      if (f.itemFields.length === 0) issues.push({ code: 'EMPTY_ITEM_FIELDS', message: `${f.name}: no item fields`, path: `fields[${f.name}].itemFields` });
    }
  }
  // fees must stay disabled in v1
  if (s.fees.enabled) issues.push({ code: 'FEES_ENABLED', message: 'Verification fees are not implemented in v1', path: 'fees.enabled' });
  return issues;
}

function validateField(f: Field, issues: ValidationIssue[]) {
  if (f.kind === 'conditional') {
    // ConditionalField is typed as uint by construction; runtime parser enforces it.
    if (f.scale !== 1 && f.scale !== 10 && f.scale !== 100 && f.scale !== 1000) {
      issues.push({ code: 'UNUSUAL_SCALE', message: `Scale ${f.scale} for ${f.name} is unusual`, path: `fields[${f.name}].scale` });
    }
  }
}

export function assertValid(s: VerificationSchema) {
  const issues = validateSchema(s);
  if (issues.length > 0) {
    const summary = issues.map((i) => `${i.code} at ${i.path}: ${i.message}`).join('\n');
    throw new Error(`Schema validation failed:\n${summary}`);
  }
}