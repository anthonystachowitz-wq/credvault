// Convert the human-friendly college-degree.yaml into the questionnaire-faithful AST.
// This is a transitional adapter; future schemas should be authored directly in AST JSON.
import type { VerificationSchema, Field, ConditionalField, MatchSetField } from './types.js';

export interface YamlFieldSpec {
  type: 'string' | 'uint' | 'list';
  disclosable?: string[];
  maxItems?: number;
}

export interface YamlSchema {
  schemaVersion: string;
  name: string;
  displayName: string;
  issuerType: string;
  transcriptMode?: 'granular' | 'monolithic';
  fields: Record<string, YamlFieldSpec>;
  disclosureLevels?: Record<string, {
    proves?: string[];
    reveals?: string[];
  }>;
  issuerRuntime?: {
    mode?: string;
    revocation?: { cadence?: string };
    proofPackages?: { preMinted?: string[]; novelProofs?: string };
  };
  compliance?: Record<string, unknown>;
  fees?: { enabled?: boolean };
}

export function yamlToAst(yaml: YamlSchema): VerificationSchema {
  const fields: Field[] = [];
  for (const [name, spec] of Object.entries(yaml.fields)) {
    if (spec.type === 'list') {
      // Default college set: 4 item fields. In a real adapter these would come from YAML.
      const selected = yaml.transcriptMode === 'monolithic' ? 'group' : 'individual';
      const f: MatchSetField = {
        kind: 'matchSet',
        name,
        maxItems: spec.maxItems ?? 100,
        domainTag: name === 'courseGrades' ? 'course' : name,
        itemFields: [
          { name: 'courseCode', type: 'string' },
          { name: 'courseTitle', type: 'string' },
          { name: 'credits', type: 'uint', scale: 1 },
          { name: 'grade', type: 'string' },
        ],
        verification: { individual: true, group: true, selected },
        disclosure: (spec.disclosable ?? ['reveal']) as any,
      };
      fields.push(f);
    } else if (isConditional(yaml, name)) {
      const cond: ConditionalField = {
        kind: 'conditional',
        name,
        type: 'uint',
        scale: inferScale(name, yaml),
        uintBits: 64,
        disclosure: ['reveal'],
        conditional: {
          operators: ['gte'],
          criteria: inferCriteria(name, yaml),
          novelThresholds: 'on-request',
        },
        predicateNames: { gte: 'verifyMin' + capitalize(name) },
      };
      fields.push(cond);
    } else {
      fields.push({
        kind: 'directMatch',
        name,
        type: spec.type,
        disclosure: (spec.disclosable ?? ['reveal']) as any,
      });
    }
  }
  return {
    schemaVersion: yaml.schemaVersion === '0.1' ? '0.3' : (yaml.schemaVersion ?? '0.3'),
    name: yaml.name,
    displayName: yaml.displayName,
    issuerType: yaml.issuerType,
    domainPrefix: 'credvault:',
    packageFormat: `credvault-${yaml.name}/0.3`,
    privateStateId: 'credvault' + capitalize(yaml.name) + 'State',
    fields,
    revocation: { enabled: true, cadence: (yaml.issuerRuntime?.revocation?.cadence as any) ?? 'batch' },
    issuerRuntime: {
      mode: 'batch',
      preMint: ['L1', 'L2'],
      novelProofs: 'on-request',
    },
    compliance: yaml.compliance,
    fees: { enabled: !!yaml.fees?.enabled },
  };
}

function isConditional(yaml: YamlSchema, name: string): boolean {
  const l2 = yaml.disclosureLevels?.['L2-threshold'];
  if (!l2?.proves) return false;
  return l2.proves.some((p: string) => p.includes(`threshold(${name}`) || p.includes(`${name} >=`));
}

function inferScale(name: string, yaml: YamlSchema): number {
  // College GPA is x.xx. In a real adapter this would be explicit in YAML.
  if (name === 'gpa') return 100;
  return 1;
}

function inferCriteria(name: string, yaml: YamlSchema): { op: 'gte'; value: string }[] {
  // College template default criteria. Real adapter would read from YAML.
  if (name === 'gpa') return [{ op: 'gte', value: '3.00' }, { op: 'gte', value: '3.50' }];
  return [];
}

function capitalize(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}