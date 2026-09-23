// Verification Schema AST — the generator's single source of truth.
// Derived from apps/credvault/docs/generator-core-architecture.md §1.1

export type Operator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq';

export interface Criterion {
  op: Operator;
  value: string; // display form, e.g. "3.50"
}

export interface DirectMatchField {
  kind: 'directMatch';
  name: string;
  type: 'string' | 'uint' | 'boolean' | 'timestamp';
  constant?: string;
  disclosure: ('reveal' | 'equality')[];
}

export interface ConditionalField {
  kind: 'conditional';
  name: string;
  type: 'uint';
  scale: number;
  uintBits: 64;
  disclosure: 'reveal'[];
  conditional: {
    operators: Operator[];
    criteria: Criterion[];
    novelThresholds: 'on-request';
  };
  predicateNames?: { gte?: string; lte?: string; range?: string };
}

export interface MatchSetItemField {
  name: string;
  type: 'string' | 'uint';
  scale?: number;
}

export interface MatchSetField {
  kind: 'matchSet';
  name: string;
  maxItems: number;
  itemFields: MatchSetItemField[];
  domainTag?: string;
  verification: {
    individual: boolean;
    group: boolean;
    selected: 'individual' | 'group';
  };
  disclosure: ('reveal' | 'subset')[];
}

export type Field = DirectMatchField | ConditionalField | MatchSetField;

export interface VerificationSchema {
  schemaVersion: string;
  name: string;
  displayName: string;
  issuerType: string;
  domainPrefix: string;
  packageFormat: string;
  privateStateId: string;
  fields: Field[];
  revocation: { enabled: boolean; cadence: 'batch' | 'prompt' };
  issuerRuntime: {
    mode: 'batch';
    preMint: ('L1' | 'L2')[];
    novelProofs: 'on-request';
  };
  compliance?: Record<string, unknown>;
  fees: { enabled: boolean };
}
