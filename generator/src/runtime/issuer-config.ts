// Emit issuer-side configuration from a descriptor + issuer preferences.
import type { AppDescriptor } from '../schemas/descriptor.js';

export interface IssuerConfig {
  configType: 'credvault-issuer-config/1.0';
  issuerId: string;
  schemaRef: { id: string; version: string; hash: string };
  contractAddress?: string;
  network: string;
  upload: {
    format: 'csv';
    rowGrouping: 'holderId';
    columns: {
      holderRef: string;
      fields: Record<string, string>;
      sets: Record<string, Record<string, string>>;
    };
    valueChecks: Record<string, string>;
  };
  premint: Array<{ field: string; op: string; value: number }>;
  revocation: { cadence: 'batch' | 'prompt' };
  delivery: { packageLinks: boolean };
  sampleCsvPath?: string;
}

export function emitIssuerConfig(descriptor: AppDescriptor, descriptorHash: string, opts?: { network?: string; sampleCsvPath?: string }): IssuerConfig {
  const fields: Record<string, string> = {};
  const valueChecks: Record<string, string> = {};
  for (const f of descriptor.fields) {
    fields[f.name] = f.name;
    if (f.kind === 'metric') {
      valueChecks[f.name] = `uint, scale ${f.scale}`;
    }
  }
  const sets: Record<string, Record<string, string>> = {};
  for (const s of descriptor.sets) {
    const setColumns: Record<string, string> = {};
    for (const f of s.itemFields) setColumns[f.name] = f.name;
    sets[s.name] = setColumns;
  }
  const premint: Array<{ field: string; op: string; value: number }> = [];
  for (const f of descriptor.fields) {
    if (f.kind === 'metric') {
      for (const p of f.predicates.premint) premint.push({ field: f.name, op: p.op, value: p.value });
    }
  }
  return {
    configType: 'credvault-issuer-config/1.0',
    issuerId: descriptor.schemaId,
    schemaRef: { id: descriptor.schemaId, version: descriptor.schemaVersion, hash: descriptorHash },
    network: opts?.network ?? 'undeployed',
    upload: {
      format: 'csv',
      rowGrouping: 'holderId',
      columns: { holderRef: 'id', fields, sets },
      valueChecks,
    },
    premint,
    revocation: { cadence: descriptor.issuerRuntime.revocationCadence },
    delivery: { packageLinks: true },
    sampleCsvPath: opts?.sampleCsvPath,
  };
}