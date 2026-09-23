// Schema-driven canonical commitment scheme (cv-core v1.0).
// One library serves every issuer schema; the descriptor names the scheme for each element.
import { createHash, randomBytes } from 'node:crypto';
import type { AppDescriptor, DescriptorField, DescriptorSet } from '../schemas/descriptor.js';

export const toHex = (b: Buffer | Uint8Array): string => Buffer.from(b).toString('hex');
export const fromHex = (h: string): Buffer => Buffer.from(h, 'hex');
export const newSalt = (): Buffer => randomBytes(32);

export function pad32(domain: string): Buffer {
  const b = Buffer.alloc(32, 0);
  Buffer.from(domain, 'utf8').copy(b, 0, 0, Math.min(32, Buffer.byteLength(domain, 'utf8')));
  return b;
}

export function sha256(...parts: (Buffer | Uint8Array)[]): Buffer {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
}

export function le64(n: number | bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

export function compactCommitUint64(x: number | bigint, rand: Buffer): Buffer {
  return sha256(rand, le64(x));
}

export function compactCommitBytes32(b: Buffer, rand: Buffer): Buffer {
  return sha256(rand, b);
}

export function normalize(value: string | number): Buffer {
  if (typeof value === 'string') return Buffer.from(value.trim().toUpperCase(), 'utf8');
  return Buffer.from(String(value), 'utf8');
}

// ─── Scheme registry ───────────────────────────────────────────────────────
export interface SchemeContext {
  descriptor: AppDescriptor;
  fieldName?: string;
  setName?: string;
}

export type CommitFn = (ctx: SchemeContext, value: unknown, salt: Buffer) => Buffer;

const schemes: Record<string, CommitFn> = {
  'canonical-field/v1': (_ctx, value, salt) => {
    if (_ctx.fieldName === undefined) throw new Error('fieldName required for canonical-field/v1');
    return sha256(pad32('credvault:field:'), Buffer.from(_ctx.fieldName, 'utf8'), normalize(value as string | number), salt);
  },
  'compact-commit-uint64/v1': (_ctx, value, salt) => {
    return sha256(salt, le64(value as number | bigint));
  },
  'canonical-setitem/v1': (_ctx, value, salt) => {
    if (_ctx.setName === undefined) throw new Error('setName required for canonical-setitem/v1');
    const item = value as Record<string, string | number>;
    const set = _ctx.descriptor.sets.find((s) => s.name === _ctx.setName)!;
    const parts = [pad32('credvault:setitem:'), Buffer.from(_ctx.setName, 'utf8')];
    for (const f of set.itemFields) parts.push(normalize(item[f.name]));
    return sha256(...parts, salt);
  },
  // Legacy shim for existing college-degree packages
  'canonical-course-leaf/v0': (_ctx, value, salt) => {
    const c = value as { code: string; title: string; credits: number; grade: string };
    return sha256(pad32('credvault:course:'), normalize(c.code), normalize(c.title), normalize(c.credits), normalize(c.grade), salt);
  },
  'canonical-doc/v1': (_ctx, value, salt) => {
    if (_ctx.setName === undefined) throw new Error('setName required for canonical-doc/v1');
    const doc = value as Buffer;
    return sha256(pad32('credvault:doc:'), doc, salt);
  },
  'canonical-leaf/v1': (_ctx, value, salt) => {
    const slots = value as Buffer[];
    return sha256(pad32('credvault:leaf:'), ...slots, salt);
  },
  'canonical-credid/v1': (_ctx, value) => {
    return sha256(pad32('credvault:credid:'), value as Buffer);
  },
  'kdf-salt/v1': (_ctx, value) => {
    const { issuerSecret, holderRef, fieldName } = value as { issuerSecret: Buffer; holderRef: string; fieldName: string };
    return sha256(pad32('credvault:kdf:'), issuerSecret, Buffer.from(holderRef, 'utf8'), Buffer.from(fieldName, 'utf8'));
  },
};

export function commit(schemeId: string, ctx: SchemeContext, value: unknown, salt: Buffer): Buffer {
  const fn = schemes[schemeId];
  if (!fn) throw new Error(`UNKNOWN_SCHEME:${schemeId}`);
  return fn(ctx, value, salt);
}

export function kdfSalt(issuerSecret: Buffer, holderRef: string, field: string): Buffer {
  return commit('kdf-salt/v1', { descriptor: null as any }, { issuerSecret, holderRef, fieldName: field }, Buffer.alloc(0));
}

export function fieldCommit(descriptor: AppDescriptor, fieldName: string, value: string | number, salt: Buffer): Buffer {
  const field = descriptor.fields.find((f) => f.name === fieldName);
  if (!field) throw new Error(`FIELD_NOT_FOUND:${fieldName}`);
  return commit(field.scheme, { descriptor, fieldName }, value, salt);
}

export function metricCommit(descriptor: AppDescriptor, fieldName: string, value: number | bigint, salt: Buffer): Buffer {
  return commit('compact-commit-uint64/v1', { descriptor, fieldName }, value, salt);
}

export function setItemCommit(descriptor: AppDescriptor, setName: string, item: Record<string, string | number>, salt: Buffer): Buffer {
  const set = descriptor.sets.find((s) => s.name === setName);
  if (!set) throw new Error(`SET_NOT_FOUND:${setName}`);
  return commit(set.itemScheme, { descriptor, setName }, item, salt);
}

export function canonicalDoc(set: DescriptorSet, items: Record<string, string | number>[]): Buffer {
  const sortKey = set.canonicalSort[0];
  const lines = items
    .map((it) => set.itemFields.map((f) => normalize(it[f.name]).toString('utf8')).join('|'))
    .sort();
  return Buffer.from(lines.join('\n'), 'utf8');
}

export function docCommit(descriptor: AppDescriptor, setName: string, items: Record<string, string | number>[], salt: Buffer): Buffer {
  const set = descriptor.sets.find((s) => s.name === setName)!;
  return commit(set.docScheme, { descriptor, setName }, canonicalDoc(set, items), salt);
}

export function masterLeaf(descriptor: AppDescriptor, slots: Buffer[], masterSalt: Buffer): Buffer {
  return commit('canonical-leaf/v1', { descriptor }, slots, masterSalt);
}

export function credIdFromLeaf(leaf: Buffer): Buffer {
  return commit('canonical-credid/v1', { descriptor: null as any }, leaf, Buffer.alloc(0));
}

export const EMPTY_LEAF: Buffer = sha256(pad32('credvault:empty:'));
export const EMPTY_COURSE_ROOT: Buffer = sha256(pad32('credvault:empty-course-root:'));

/** Root of a set sub-tree (empty list → defined constant). */
export function setSubRoot(leaves: Buffer[]): { root: Buffer; levels: Buffer[][] } {
  if (leaves.length === 0) return { root: EMPTY_COURSE_ROOT, levels: [] };
  const levels = buildTree(leaves);
  return { root: levels[levels.length - 1][0], levels };
}

export function nodeHash(left: Buffer, right: Buffer): Buffer {
  return sha256(pad32('credvault:node:'), left, right);
}

export function nextPow2(n: number): number { let p = 1; while (p < n) p *= 2; return p; }

export interface PathEntry { sibling: Buffer; goesLeft: boolean }
export interface PathEntryHex { sibling: string; goesLeft: boolean }

export function buildTree(leavesIn: Buffer[]): Buffer[][] {
  const size = nextPow2(Math.max(1, leavesIn.length));
  const leaves = [...leavesIn];
  while (leaves.length < size) leaves.push(EMPTY_LEAF);
  const levels: Buffer[][] = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const up: Buffer[] = [];
    for (let i = 0; i < cur.length; i += 2) up.push(nodeHash(cur[i], cur[i + 1]));
    levels.push(up);
  }
  return levels;
}

export function getPath(levels: Buffer[][], index: number): PathEntry[] {
  const path: PathEntry[] = [];
  let idx = index;
  for (let level = 0; level < levels.length - 1; level++) {
    const nodes = levels[level];
    const isLeft = idx % 2 === 0;
    const siblingIdx = isLeft ? idx + 1 : idx - 1;
    path.push({ sibling: nodes[siblingIdx], goesLeft: isLeft });
    idx = Math.floor(idx / 2);
  }
  return path;
}

export function recomputeRoot(leaf: Buffer, path: PathEntry[]): Buffer {
  let cur = leaf;
  for (const e of path) cur = e.goesLeft ? nodeHash(cur, e.sibling) : nodeHash(e.sibling, cur);
  return cur;
}

export function pathToHex(path: PathEntry[]): PathEntryHex[] {
  return path.map((e) => ({ sibling: toHex(e.sibling), goesLeft: e.goesLeft }));
}
export function pathFromHex(path: PathEntryHex[]): PathEntry[] {
  return path.map((e) => ({ sibling: fromHex(e.sibling), goesLeft: e.goesLeft }));
}