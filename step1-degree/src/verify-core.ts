// verify-core — shared verification logic used by the CLI and the HTTP service.
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { networkConfig, loadCompiled } from './common';
import { verifyL2ProofHex } from './l2';
import * as C from './canonical';

export type Verdict = 'VERIFIED' | 'TAMPERED' | 'REVOKED' | 'UNKNOWN_ANCHOR' | 'CONTRACT_NOT_FOUND' | 'L2_INVALID' | 'L2_UNAVAILABLE';
export interface VerifyResult {
  verdict: Verdict;
  detail: string;
  values?: { fullName: string; degree: string; gpa: number };
  courses?: { code: string; title: string; credits: number; grade: string }[];
  courseCount?: number;
  l2?: { minGpa: number; ok: boolean };
  ms: number;
}

export function setHas(decodedSet: any, value: Buffer): boolean {
  const hex = C.toHex(value);
  try { if (typeof decodedSet?.member === 'function' && decodedSet.member(value)) return true; } catch { /* shape */ }
  const entries: any[] = [];
  try { for (const e of decodedSet ?? []) entries.push(e); } catch { /* not iterable */ }
  if (!entries.length && decodedSet instanceof Map) for (const k of decodedSet.keys()) entries.push(k);
  if (!entries.length && decodedSet && typeof decodedSet === 'object') for (const k of Object.keys(decodedSet)) entries.push(k);
  return entries.some((e) => (typeof e === 'string' ? e.replace(/^0x/, '') : C.toHex(e)) === hex);
}

export async function verifyPresentation(p: any, minGpa?: number): Promise<VerifyResult> {
  const t0 = Date.now();
  const ms = () => Date.now() - t0;
  const values = { fullName: p.values.fullName, degree: p.values.degree, gpa: p.values.gpa, gpaRedacted: p.values.gpa === undefined || p.values.gpa === null };

  // 1. tamper check (recompute master leaf)
  // GPA may be REDACTED (holder withheld the value): then the commitment is
  // taken from the package's gpaCommit field directly — the leaf still
  // recomputes, and only an L2 proof can make claims about the hidden value.
  const gpaRedacted = p.values.gpa === undefined || p.values.gpa === null;
  if (gpaRedacted && !p.gpaCommit) {
    return { verdict: 'TAMPERED', detail: 'GPA value withheld but no gpaCommit supplied', values, ms: ms() };
  }
  const commits = [
    C.fieldCommit('fullName', p.values.fullName, C.fromHex(p.salts.fullName)),
    C.fieldCommit('degree', p.values.degree, C.fromHex(p.salts.degree)),
    gpaRedacted ? C.fromHex(p.gpaCommit) : C.compactCommitUint64(p.values.gpa, C.fromHex(p.salts.gpa)),
  ];
  let leaf: Buffer;
  if (p.docCommit !== undefined) {
    // ── monolithic mode: recompute the whole-transcript blob hash
    const blob = C.canonicalTranscript((p.courses ?? []).map((c: any) => ({ code: c.code, title: c.title, credits: c.credits, grade: c.grade })));
    const recomputed = C.docCommit(blob, C.fromHex(p.docSalt));
    if (C.toHex(recomputed) !== p.docCommit) {
      return { verdict: 'TAMPERED', detail: 'transcript document does not match its commitment (altered content)', values, ms: ms() };
    }
    leaf = C.masterLeafV3(commits, recomputed, C.fromHex(p.salts.master));
  } else if (p.courseSubRoot !== undefined) {
    // ── scheme v3: courses committed via sub-tree. Recompute the sub-root
    // from the REVEALED courses only; every revealed course's path must lead
    // to the SAME sub-root (consistency = anti-cherry-picking).
    const revealed: any[] = p.courses ?? [];
    if (revealed.length === 0 && (p.courseCount ?? 0) > 0) {
      return { verdict: 'TAMPERED', detail: 'no courses revealed but the credential has them', values, ms: ms() };
    }
    let subRoot: Buffer | null = null;
    for (const c of revealed) {
      const cLeaf = C.courseLeaf({ code: c.code, title: c.title, credits: c.credits, grade: c.grade }, C.fromHex(c.salt));
      const r = C.recomputeRoot(cLeaf, C.pathFromHex(c.path));
      if (subRoot && C.toHex(r) !== C.toHex(subRoot)) {
        return { verdict: 'TAMPERED', detail: 'course paths do not converge to one sub-root (mixed credentials?)', values, ms: ms() };
      }
      subRoot = r;
    }
    leaf = C.masterLeafV3(commits, subRoot ?? C.EMPTY_COURSE_ROOT, C.fromHex(p.salts.master));
  } else {
    // legacy v2 (no courses)
    leaf = C.masterLeaf(commits, C.fromHex(p.salts.master));
  }
  if (C.toHex(leaf) !== p.masterLeaf) {
    return { verdict: 'TAMPERED', detail: 'presented values do not reproduce the credential commitment', values, ms: ms() };
  }

  // 2. recompute cohort root
  const root = C.recomputeRoot(leaf, C.pathFromHex(p.path));

  // 3. on-chain anchors
  const pdp = indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS);
  const contractState = await pdp.queryContractState(p.contractAddress);
  if (!contractState) return { verdict: 'CONTRACT_NOT_FOUND', detail: 'contract not found on-chain', values, ms: ms() };
  const DegreeModule = await loadCompiled();
  const ledgerState = DegreeModule.ledger(contractState.data);

  // 4. membership
  if (!setHas(ledgerState.validRoots, root)) {
    return { verdict: 'UNKNOWN_ANCHOR', detail: 'cohort root is not anchored on-chain', values, ms: ms() };
  }

  // 5. revocation (always checked against CURRENT chain state)
  if (setHas(ledgerState.revoked, C.credIdFromLeaf(leaf))) {
    return { verdict: 'REVOKED', detail: 'credential was revoked by the issuer', values, ms: ms() };
  }

  // 5b. attach revealed courses for rendering (only what the holder disclosed)
  const courses = Array.isArray(p.courses) ? p.courses.map((c: any) => ({ code: c.code, title: c.title, credits: c.credits, grade: c.grade })) : [];
  const courseCount = p.courseCount ?? courses.length;

  // 6. optional L2 threshold proof
  if (minGpa !== undefined) {
    const proof = (p.l2Proofs ?? []).find((x: any) => x.minGpa === minGpa);
    if (!proof) {
      return { verdict: 'L2_UNAVAILABLE', detail: 'no pre-minted proof for GPA >= ' + (minGpa / 100).toFixed(2), values, courses, courseCount, l2: { minGpa, ok: false }, ms: ms() };
    }
    const r = verifyL2ProofHex(proof.provenTx, proof.mintedAt);
    if (!r.ok) return { verdict: 'L2_INVALID', detail: 'ZK proof invalid: ' + r.error, values, l2: { minGpa, ok: false }, ms: ms() };
    return { verdict: 'VERIFIED', detail: 'anchored, not revoked, and GPA >= ' + (minGpa / 100).toFixed(2) + ' proven in zero knowledge', values, courses, courseCount, l2: { minGpa, ok: true }, ms: ms() };
  }

  return { verdict: 'VERIFIED', detail: 'anchored on-chain and not revoked', values, courses, courseCount, ms: ms() };
}
