// Parse a Verification Schema AST from JSON (questionnaire-faithful format).
import type { VerificationSchema, Field, Operator, Criterion } from './types.js';

export function parseSchema(json: unknown): VerificationSchema {
  if (json === null || typeof json !== 'object') throw new Error('SCHEMA_NOT_OBJECT');
  const s = json as Record<string, unknown>;
  const fields = parseFields(s.fields);
  return {
    schemaVersion: requireString(s.schemaVersion, 'schemaVersion'),
    name: requireString(s.name, 'name'),
    displayName: requireString(s.displayName, 'displayName'),
    issuerType: requireString(s.issuerType, 'issuerType'),
    domainPrefix: requireString(s.domainPrefix, 'domainPrefix'),
    packageFormat: requireString(s.packageFormat, 'packageFormat'),
    privateStateId: requireString(s.privateStateId, 'privateStateId'),
    fields,
    revocation: parseRevocation(s.revocation),
    issuerRuntime: parseIssuerRuntime(s.issuerRuntime),
    compliance: s.compliance as Record<string, unknown> | undefined,
    fees: parseFees(s.fees),
  };
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new Error(`FIELD_REQUIRED:${field}`);
  return v;
}

function parseFields(v: unknown): Field[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error('FIELDS_MISSING');
  return v.map(parseField);
}

function parseField(v: unknown): Field {
  if (!v || typeof v !== 'object') throw new Error('FIELD_NOT_OBJECT');
  const f = v as Record<string, unknown>;
  const kind = requireString(f.kind, 'field.kind');
  switch (kind) {
    case 'directMatch':
      return {
        kind,
        name: requireString(f.name, 'field.name'),
        type: parseType(f.type),
        constant: f.constant === undefined ? undefined : String(f.constant),
        disclosure: parseDisclosure(f.disclosure, ['reveal', 'equality']) as ('reveal' | 'equality')[],
      };
    case 'conditional':
      return {
        kind,
        name: requireString(f.name, 'field.name'),
        type: 'uint',
        scale: requirePositiveInt(f.scale, 'field.scale'),
        uintBits: 64,
        disclosure: parseDisclosure(f.disclosure, ['reveal']) as 'reveal'[],
        conditional: {
          operators: parseOperators(f.operators ?? (f as any).conditional?.operators),
          criteria: parseCriteria(f.criteria ?? (f as any).conditional?.criteria),
          novelThresholds: 'on-request',
        },
        predicateNames: f.predicateNames as any,
      };
    case 'matchSet':
      return {
        kind,
        name: requireString(f.name, 'field.name'),
        maxItems: requirePositiveInt(f.maxItems, 'field.maxItems'),
        itemFields: parseItemFields(f.itemFields),
        domainTag: f.domainTag === undefined ? undefined : String(f.domainTag),
        verification: parseVerification(f.verification),
        disclosure: parseDisclosure(f.disclosure, ['reveal', 'subset']) as ('reveal' | 'subset')[],
      };
    default:
      throw new Error(`UNKNOWN_FIELD_KIND:${kind}`);
  }
}

function parseType(v: unknown): 'string' | 'uint' | 'boolean' | 'timestamp' {
  const s = requireString(v, 'field.type');
  if (s !== 'string' && s !== 'uint' && s !== 'boolean' && s !== 'timestamp') throw new Error(`UNKNOWN_TYPE:${s}`);
  return s;
}

function parseDisclosure(v: unknown, allowed: string[]): string[] {
  if (!Array.isArray(v)) throw new Error('DISCLOSURE_NOT_ARRAY');
  for (const x of v) if (!allowed.includes(String(x))) throw new Error(`UNKNOWN_DISCLOSURE:${x}`);
  return v.map(String);
}

function parseOperators(v: unknown): Operator[] {
  const arr = Array.isArray(v) ? v : [];
  const allowed: Operator[] = ['gt', 'lt', 'gte', 'lte', 'eq'];
  for (const x of arr) if (!allowed.includes(String(x) as Operator)) throw new Error(`UNKNOWN_OPERATOR:${x}`);
  return arr.map(String) as Operator[];
}

function parseCriteria(v: unknown): Criterion[] {
  if (!Array.isArray(v)) throw new Error('CRITERIA_NOT_ARRAY');
  return v.map((c) => {
    if (!c || typeof c !== 'object') throw new Error('CRITERION_NOT_OBJECT');
    return { op: parseOperators([c.op])[0], value: requireString(c.value, 'criterion.value') };
  });
}

function parseItemFields(v: unknown): { name: string; type: 'string' | 'uint'; scale?: number }[] {
  if (!Array.isArray(v)) throw new Error('ITEMFIELDS_NOT_ARRAY');
  return v.map((f) => {
    if (!f || typeof f !== 'object') throw new Error('ITEMFIELD_NOT_OBJECT');
    const r = f as Record<string, unknown>;
    return {
      name: requireString(r.name, 'itemField.name'),
      type: parseType(r.type) as 'string' | 'uint',
      scale: r.scale === undefined ? undefined : requirePositiveInt(r.scale, 'itemField.scale'),
    };
  });
}

function parseVerification(v: unknown): { individual: boolean; group: boolean; selected: 'individual' | 'group' } {
  if (!v || typeof v !== 'object') throw new Error('VERIFICATION_NOT_OBJECT');
  const r = v as Record<string, unknown>;
  const selected = requireString(r.selected, 'verification.selected');
  if (selected !== 'individual' && selected !== 'group') throw new Error(`UNKNOWN_VERIFICATION_SELECTED:${selected}`);
  return { individual: !!r.individual, group: !!r.group, selected };
}

function parseRevocation(v: unknown): { enabled: boolean; cadence: 'batch' | 'prompt' } {
  if (!v || typeof v !== 'object') throw new Error('REVOCATION_NOT_OBJECT');
  const r = v as Record<string, unknown>;
  const cadence = requireString(r.cadence, 'revocation.cadence');
  if (cadence !== 'batch' && cadence !== 'prompt') throw new Error(`UNKNOWN_REVOCATION_CADENCE:${cadence}`);
  return { enabled: !!r.enabled, cadence };
}

function parseIssuerRuntime(v: unknown): { mode: 'batch'; preMint: ('L1' | 'L2')[]; novelProofs: 'on-request' } {
  if (!v || typeof v !== 'object') throw new Error('ISSUERRUNTIME_NOT_OBJECT');
  const r = v as Record<string, unknown>;
  const mode = requireString(r.mode, 'issuerRuntime.mode');
  if (mode !== 'batch') throw new Error(`UNKNOWN_RUNTIME_MODE:${mode}`);
  const preMint = Array.isArray(r.preMint) ? r.preMint.map(String) : [];
  for (const x of preMint) if (x !== 'L1' && x !== 'L2') throw new Error(`UNKNOWN_PREMINT:${x}`);
  return { mode, preMint: preMint as ('L1' | 'L2')[], novelProofs: 'on-request' };
}

function parseFees(v: unknown): { enabled: boolean } {
  if (!v || typeof v !== 'object') return { enabled: false };
  return { enabled: !!(v as any).enabled };
}

function requirePositiveInt(v: unknown, field: string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) throw new Error(`POSITIVE_INT_REQUIRED:${field}`);
  return n;
}