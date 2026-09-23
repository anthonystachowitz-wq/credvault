// Emit the App Descriptor (the generator ↔ apps contract) from a VerificationSchema AST.
import type { VerificationSchema, Field, DirectMatchField, ConditionalField, MatchSetField } from './types.js';

export interface AppDescriptor {
  descriptorType: 'credvault-descriptor/1.0';
  schemaId: string;
  schemaVersion: string;
  displayName: string;
  issuerType: string;
  display: {
    icon: string;
    cardTitle: string;
    cardSubtitle: string;
    verifyTitle: string;
    verifySubtitle: string;
  };
  fields: DescriptorField[];
  sets: DescriptorSet[];
  leafLayout: string[];
  issuerRuntime: {
    mode: 'batch';
    revocationCadence: 'batch' | 'prompt';
    novelProofs: 'on-request';
  };
  contract: {
    template: 'credvault-anchor-core/1';
    predicateSupport: 'universal-range-v1';
  };
  fees: { enabled: boolean };
}

export type DescriptorField =
  | { kind: 'value'; name: string; label: string; type: 'string' | 'uint' | 'boolean' | 'timestamp'; scheme: string; disclosable: string[]; defaultDisclosure: string }
  | { kind: 'metric'; name: string; label: string; type: 'uint'; scale: number; format: string; scheme: string; disclosable: string[]; predicates: { mechanism: 'universal-range-v1'; operators: string[]; premint: Array<{ op: string; value: number }> }; defaultDisclosure: string };

export interface DescriptorSet {
  name: string;
  label: string;
  mode: 'granular' | 'monolithic';
  maxItems: number;
  itemScheme: string;
  docScheme: string;
  canonicalSort: string[];
  itemFields: { name: string; label: string; type: 'string' | 'uint' }[];
  itemDisplay: string;
}

export function emitDescriptor(schema: VerificationSchema): AppDescriptor {
  const fields: DescriptorField[] = [];
  const sets: DescriptorSet[] = [];
  const leafLayout: string[] = [];

  for (const f of schema.fields) {
    if (f.kind === 'directMatch' || f.kind === 'conditional') {
      leafLayout.push(`field:${f.name}`);
    }
    if (f.kind === 'matchSet') {
      leafLayout.push(`set:${f.name}`);
    }
    const df = emitField(f);
    if (df) fields.push(df);
    const ds = emitSet(f);
    if (ds) sets.push(ds);
  }

  return {
    descriptorType: 'credvault-descriptor/1.0',
    schemaId: schema.name,
    schemaVersion: schema.schemaVersion,
    displayName: schema.displayName,
    issuerType: schema.issuerType,
    display: inferDisplay(schema),
    fields,
    sets,
    leafLayout,
    issuerRuntime: {
      mode: schema.issuerRuntime.mode,
      revocationCadence: schema.revocation.cadence,
      novelProofs: schema.issuerRuntime.novelProofs,
    },
    contract: {
      template: 'credvault-anchor-core/1',
      predicateSupport: 'universal-range-v1',
    },
    fees: { enabled: schema.fees.enabled },
  };
}

function emitField(f: Field): DescriptorField | null {
  if (f.kind === 'directMatch') {
    return {
      kind: 'value',
      name: f.name,
      label: titleCase(f.name),
      type: f.type,
      scheme: f.type === 'uint' ? 'compact-commit-uint64/v1' : 'canonical-field/v1',
      disclosable: f.disclosure,
      defaultDisclosure: f.disclosure[0] ?? 'reveal',
    };
  }
  if (f.kind === 'conditional') {
    return {
      kind: 'metric',
      name: f.name,
      label: titleCase(f.name),
      type: 'uint',
      scale: f.scale,
      format: scaleToFormat(f.scale),
      scheme: 'compact-commit-uint64/v1',
      disclosable: ['reveal', 'threshold', 'range'],
      predicates: {
        mechanism: 'universal-range-v1',
        operators: f.conditional.operators,
        premint: f.conditional.criteria.map((c) => ({ op: c.op, value: Math.round(Number(c.value) * f.scale) })),
      },
      defaultDisclosure: f.disclosure[0] ?? 'reveal',
    };
  }
  return null;
}

function emitSet(f: Field): DescriptorSet | null {
  if (f.kind !== 'matchSet') return null;
  return {
    name: f.name,
    label: titleCase(f.name),
    mode: f.verification.selected === 'individual' ? 'granular' : 'monolithic',
    maxItems: f.maxItems,
    itemScheme: f.domainTag === 'course' ? 'canonical-course-leaf/v0' : 'canonical-setitem/v1',
    docScheme: 'canonical-doc/v1',
    canonicalSort: f.itemFields.filter((i) => i.type === 'string').map((i) => i.name).slice(0, 1),
    itemFields: f.itemFields.map((i) => ({ name: i.name, label: titleCase(i.name), type: i.type })),
    itemDisplay: f.itemFields.map((i) => `{{${i.name}}}`).join(' — '),
  };
}

function inferDisplay(schema: VerificationSchema): AppDescriptor['display'] {
  const firstString = schema.fields.find((f) => (f.kind === 'directMatch' || f.kind === 'conditional') && f.type === 'string')?.name ?? 'credential';
  return {
    icon: schema.issuerType === 'university' ? '🎓' : schema.issuerType === 'license-board' ? '🩺' : '📜',
    cardTitle: `{{fields.${firstString}}}`,
    cardSubtitle: `{{issuer.displayName}} · {{cohort}}`,
    verifyTitle: `{{fields.${firstString}}}`,
    verifySubtitle: schema.name,
  };
}

function titleCase(s: string) {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, (m) => m.toUpperCase()).trim();
}

function scaleToFormat(scale: number): string {
  if (scale === 1) return 'x';
  if (scale === 10) return 'x.x';
  if (scale === 100) return 'x.xx';
  if (scale === 1000) return 'x.xxx';
  return 'x';
}

export function canonicalJson(descriptor: AppDescriptor): string {
  return JSON.stringify(descriptor, Object.keys(descriptor).sort());
}