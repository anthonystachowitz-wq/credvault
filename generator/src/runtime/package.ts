// Generate credvault-package/1.0 files from a descriptor + cohort data.
import type { AppDescriptor, DescriptorField, DescriptorSet } from '../schemas/descriptor.js';
import * as C from './canonical.js';

export interface CohortInput {
  issuer: { id: string; displayName: string };
  cohort: string;
  transcriptMode?: 'granular' | 'monolithic';
  students: StudentRecord[];
}

export interface StudentRecord {
  id: string;
  [field: string]: unknown;
}

export interface GeneratedPackage {
  packageType: 'credvault-package/1.0';
  schemaRef: { id: string; version: string; hash: string };
  issuer: { id: string; displayName: string };
  cohort: string;
  holderRef: string;
  values: Record<string, unknown>;
  salts: Record<string, string>;
  commitments: Record<string, string>;
  sets: Record<string, unknown>;
  masterLeaf: string;
  credId: string;
  path: C.PathEntryHex[];
  cohortRoot: string;
  contractAddress: string;
  network: string;
  predicateProofs: unknown[];
}

export function generatePackages(
  descriptor: AppDescriptor,
  descriptorHash: string,
  cohort: CohortInput,
  issuerSecret: Buffer,
  contractAddress: string,
  network: string,
  opts?: { transcriptMode?: 'granular' | 'monolithic' }
): GeneratedPackage[] {
  const mode = opts?.transcriptMode ?? (cohort.transcriptMode ?? 'granular');
  const committed = cohort.students.map((s) => commitStudent(descriptor, s, issuerSecret, mode));
  const levels = C.buildTree(committed.map((c) => c.leaf));
  const root = levels[levels.length - 1][0];

  return committed.map((c, i) => ({
    packageType: 'credvault-package/1.0',
    schemaRef: { id: descriptor.schemaId, version: descriptor.schemaVersion, hash: descriptorHash },
    issuer: cohort.issuer,
    cohort: cohort.cohort,
    holderRef: c.record.id,
    values: c.values,
    salts: objectMap(c.salts, (b) => C.toHex(b)),
    commitments: objectMap(c.commits, (b) => C.toHex(b)),
    sets: c.sets,
    masterLeaf: C.toHex(c.leaf),
    credId: C.toHex(c.credId),
    path: C.pathToHex(C.getPath(levels, i)),
    cohortRoot: C.toHex(root),
    contractAddress,
    network,
    predicateProofs: [],
  }));
}

function objectMap<T, U>(obj: Record<string, T>, fn: (v: T) => U): Record<string, U> {
  const out: Record<string, U> = {};
  for (const k of Object.keys(obj)) out[k] = fn(obj[k]);
  return out;
}

function commitStudent(descriptor: AppDescriptor, record: StudentRecord, issuerSecret: Buffer, mode: 'granular' | 'monolithic') {
  const salts: Record<string, Buffer> = {};
  const commits: Record<string, Buffer> = {};
  const values: Record<string, unknown> = {};
  const slots: Buffer[] = [];

  for (const f of descriptor.fields) {
    const val = record[f.name];
    const salt = C.kdfSalt(issuerSecret, record.id, f.name);
    salts[f.name] = salt;
    if (f.kind === 'value') {
      const v = String(val);
      values[f.name] = v;
      commits[f.name] = C.fieldCommit(descriptor, f.name, v, salt);
    } else if (f.kind === 'metric') {
      const raw = Number(val);
      const scaled = Math.round(raw * f.scale);
      values[f.name] = raw; // store raw (human-readable) value
      commits[f.name] = C.metricCommit(descriptor, f.name, BigInt(scaled), salt);
    }
    slots.push(commits[f.name]);
  }

  const sets: Record<string, unknown> = {};
  for (const s of descriptor.sets) {
    const items = (record[s.name] as Record<string, string | number>[] | undefined) ?? [];
    if (s.mode === 'monolithic' || mode === 'monolithic') {
      const salt = C.kdfSalt(issuerSecret, record.id, s.name);
      salts[s.name] = salt;
      const docCommit = C.docCommit(descriptor, s.name, items, salt);
      commits[s.name] = docCommit;
      sets[s.name] = { mode: 'monolithic', items };
      slots.push(docCommit);
    } else {
      const itemSalts = items.map((it) => C.kdfSalt(issuerSecret, record.id, `${s.itemScheme === 'canonical-course-leaf/v0' ? 'course' : s.name}:${it[s.canonicalSort[0] ?? Object.keys(it)[0]]}`));
      const leaves = items.map((it, i) => C.setItemCommit(descriptor, s.name, it, itemSalts[i]));
      const r = C.setSubRoot(leaves);
      const paths = items.map((_, i) => C.getPath(r.levels, i));
      commits[s.name] = r.root;
      sets[s.name] = {
        mode: 'granular',
        itemCount: items.length,
        subRoot: C.toHex(r.root),
        items: items.map((it, i) => ({ ...it, salt: C.toHex(itemSalts[i]), path: C.pathToHex(paths[i]) })),
      };
      slots.push(r.root);
    }
  }

  const masterSalt = C.kdfSalt(issuerSecret, record.id, 'master');
  salts['master'] = masterSalt;
  const leaf = C.masterLeaf(descriptor, slots, masterSalt);
  return { record, values, salts, commits, sets, leaf, credId: C.credIdFromLeaf(leaf) };
}