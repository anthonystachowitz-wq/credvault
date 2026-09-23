// ═══════════════════════════════════════════════════════════════════════════
// CredVault canonical commitment scheme (Step 1)
//
// OUR OWN SHA-256 construction — deliberately NOT Compact's persistentHash.
// The contract stores opaque 32-byte anchors, so nothing here needs to match
// on-chain hashing; it only needs to be identical across issuer, holder, and
// verifier (this one lib is used by all three — structurally prevents the
// March hash-mismatch class of bug).
//
// Layout (all hashes are sha256 over: pad32(domain) || parts... ):
//   fieldCommit = H("credvault:field:" || fieldName || normalize(value) || salt)
//   masterLeaf  = H("credvault:leaf:"  || fieldCommits...         || masterSalt)
//   credId      = H("credvault:credid:"|| masterLeaf)
//   treeNode    = H("credvault:node:"  || left || right)
//   emptyLeaf   = H("credvault:empty:")
// ═══════════════════════════════════════════════════════════════════════════
import { createHash, randomBytes } from 'node:crypto';

export const toHex = (b: Buffer | Uint8Array): string => Buffer.from(b).toString('hex');
export const fromHex = (h: string): Buffer => Buffer.from(h, 'hex');
export const newSalt = (): Buffer => randomBytes(32);

// ─── Deterministic salts (idempotent batching) ──────────────────────────────
// salt = H(kdf-domain || issuerSecret || studentId || fieldName). Re-running a
// batch on an UNCHANGED record reproduces the identical commitment — so
// re-batches are no-ops (root already anchored), and existing packages/proofs
// stay valid. Only new/changed records produce new leaves. The issuer secret
// stays server-side; observers can't derive salts.
export function kdfSalt(issuerSecret: Buffer, studentId: string, field: string): Buffer {
  return sha256(pad32('credvault:kdf:'), issuerSecret, Buffer.from(studentId, 'utf8'), Buffer.from(field, 'utf8'));
}

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

/** Canonical normalization: strings -> utf8/trim/UPPERCASE; numbers -> decimal string. */
export function normalize(value: string | number): Buffer {
  if (typeof value === 'string') return Buffer.from(value.trim().toUpperCase(), 'utf8');
  return Buffer.from(String(value), 'utf8');
}

export function fieldCommit(fieldName: string, value: string | number, salt: Buffer): Buffer {
  return sha256(pad32('credvault:field:'), Buffer.from(fieldName, 'utf8'), normalize(value), salt);
}

// ─── Compact-compatible commitments (VERIFIED against compactc 0.31.1 via ───
// probe: contracts/probe.compact + src/probe.ts) ────────────────────────────
// persistentCommit<Uint<64>>(x, rand) = SHA-256(rand || le64(x))
// persistentCommit<Bytes<32>>(b, rand) = SHA-256(rand || b)
// persistentHash<[Bytes32,Bytes32]>([l,r]) = SHA-256(l || r)
// Used for the GPA field commitment so the SAME commitment serves L1
// tamper-evidence (JS recompute) and L2 ZK predicates (in-circuit).
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
export function compactHashPair(l: Buffer, r: Buffer): Buffer {
  return sha256(l, r);
}
// Probe test vectors (regression): pcUint(385, 0x0707..07) =
//   a5c8056f0217cb89918487e23326ee8bf6265b5f6113213eced4748ffe599460
// pcBytes(0x0303..03, 0x0707..07) =
//   46df2f81386a0f40ecbb003e48324a2cb398375847b9759d20347554f65e8063

// ─── Courses (scheme v3, Step 2b) ───────────────────────────────────────────
// Each course is one leaf; the student's courses form a sub-tree whose root
// is committed into the master leaf. Reveal-style only — no circuit reads
// these, so our own canonical scheme suffices (no Compact compat needed).
export interface Course { code: string; title: string; credits: number; grade: string }

export function courseLeaf(c: Course, salt: Buffer): Buffer {
  return sha256(
    pad32('credvault:course:'),
    normalize(c.code),
    normalize(c.title),
    normalize(c.credits),
    normalize(c.grade),
    salt,
  );
}

export const EMPTY_COURSE_ROOT: Buffer = sha256(pad32('credvault:empty-course-root:'));

/** Root of a student's course sub-tree (empty list → defined constant). */
export function courseSubRoot(courseLeaves: Buffer[]): { root: Buffer; levels: Buffer[][] } {
  if (courseLeaves.length === 0) return { root: EMPTY_COURSE_ROOT, levels: [] };
  const levels = buildTree(courseLeaves);
  return { root: levels[levels.length - 1][0], levels };
}

/** Scheme v3 master leaf: the course sub-root is committed alongside the 3 field commits. */
export function masterLeafV3(fieldCommits: Buffer[], courseRoot: Buffer, masterSalt: Buffer): Buffer {
  return sha256(pad32('credvault:leaf:'), ...fieldCommits, courseRoot, masterSalt);
}

// ─── Monolithic transcript mode (Step 2c) ───────────────────────────────────
// For issuers who do NOT want per-course granularity: the WHOLE transcript is
// committed as one blob. Same CSV ingestion; different commitment policy.
// Canonical doc form (stable, order-independent): one "CODE|TITLE|CREDITS|GRADE"
// line per course, normalized, sorted by course code, joined with '\n'.
export function canonicalTranscript(courses: Course[]): Buffer {
  const lines = courses
    .map((c) => [c.code, c.title, String(c.credits), c.grade].map((x) => normalize(x).toString('utf8')).join('|'))
    .sort();
  return Buffer.from(lines.join('\n'), 'utf8');
}

export function docCommit(canonicalDoc: Buffer, docSalt: Buffer): Buffer {
  return sha256(pad32('credvault:doc:'), canonicalDoc, docSalt);
}

export function masterLeaf(fieldCommits: Buffer[], masterSalt: Buffer): Buffer {
  return sha256(pad32('credvault:leaf:'), ...fieldCommits, masterSalt);
}

export function credIdFromLeaf(leaf: Buffer): Buffer {
  return sha256(pad32('credvault:credid:'), leaf);
}

export const EMPTY_LEAF: Buffer = sha256(pad32('credvault:empty:'));

export function nodeHash(left: Buffer, right: Buffer): Buffer {
  return sha256(pad32('credvault:node:'), left, right);
}

export interface PathEntryHex { sibling: string; goesLeft: boolean }
export interface PathEntry { sibling: Buffer; goesLeft: boolean }

export function nextPow2(n: number): number { let p = 1; while (p < n) p *= 2; return p; }

/** Build a padded binary tree; levels[0] = leaves, last = [root]. */
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

/** goesLeft = the node itself is the left child at that level. */
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
