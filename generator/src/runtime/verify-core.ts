// Schema-driven verification engine (universal apps consume this).
import type { AppDescriptor, DescriptorField, DescriptorSet } from '../schemas/descriptor.js';
import * as C from './canonical.js';

export type Verdict = 'VERIFIED' | 'TAMPERED' | 'REVOKED' | 'UNKNOWN_ANCHOR' | 'CONTRACT_NOT_FOUND' | 'INVALID';

export interface VerifyOptions {
  predicate?: { field: string; op: string; value: number };
}

export interface VerifyResult {
  verdict: Verdict;
  detail: string;
  ms: number;
}

export interface PresentationLike {
  values: Record<string, unknown>;
  salts: Record<string, string>;
  commitments: Record<string, string>;
  sets?: Record<string, any>;
  masterLeaf: string;
  credId: string;
  path: C.PathEntryHex[];
  cohortRoot: string;
  contractAddress: string;
  network: string;
  predicateProofs?: Array<{ field: string; op: string; value: number; provenTx: string; mintedAt: string }>;
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

export async function verifyPresentation(
  descriptor: AppDescriptor,
  p: PresentationLike,
  queryContractState: (address: string) => Promise<any | null>,
  loadCompiledContract: () => Promise<any>,
  opts?: VerifyOptions
): Promise<VerifyResult> {
  const t0 = Date.now();
  const ms = () => Date.now() - t0;

  // 1. Recompute field commitments
  const slots: Buffer[] = [];
  for (const slotRef of descriptor.leafLayout) {
    if (slotRef.startsWith('field:')) {
      const name = slotRef.slice('field:'.length);
      const field = descriptor.fields.find((f) => f.name === name);
      if (!field) return { verdict: 'INVALID', detail: `Unknown field in layout: ${name}`, ms: ms() };
      const revealed = p.values[name] !== undefined;
      if (revealed) {
        const value = p.values[name];
        const salt = C.fromHex(p.salts[name]);
        if (field.kind === 'value') {
          slots.push(C.fieldCommit(descriptor, name, String(value), salt));
        } else if (field.kind === 'metric') {
          const scaled = Math.round(Number(value) * field.scale);
          slots.push(C.metricCommit(descriptor, name, BigInt(scaled), salt));
        }
      } else {
        // sealed: take the presented commitment
        if (!p.commitments[name]) return { verdict: 'TAMPERED', detail: `Field ${name} is sealed but no commitment supplied`, ms: ms() };
        slots.push(C.fromHex(p.commitments[name]));
      }
    } else if (slotRef.startsWith('set:')) {
      const name = slotRef.slice('set:'.length);
      const set = descriptor.sets.find((s) => s.name === name);
      const setData = p.sets?.[name];
      if (!set || !setData) return { verdict: 'INVALID', detail: `Missing set data for ${name}`, ms: ms() };
      if (setData.mode === 'monolithic') {
        const salt = C.fromHex(p.salts[name]);
        const docCommit = C.docCommit(descriptor, name, setData.items, salt);
        slots.push(docCommit);
      } else {
        // granular: recompute sub-root from revealed items
        const revealed: any[] = setData.items ?? [];
        if (revealed.length === 0 && (setData.itemCount ?? 0) > 0) {
          return { verdict: 'TAMPERED', detail: `No items revealed for set ${name}`, ms: ms() };
        }
        let subRoot: Buffer | null = null;
        for (const it of revealed) {
          const salt = C.fromHex(it.salt);
          const leaf = C.setItemCommit(descriptor, name, it, salt);
          const r = C.recomputeRoot(leaf, C.pathFromHex(it.path));
          if (subRoot && C.toHex(r) !== C.toHex(subRoot)) {
            return { verdict: 'TAMPERED', detail: `Set ${name} paths do not converge`, ms: ms() };
          }
          subRoot = r;
        }
        slots.push(subRoot ?? C.EMPTY_COURSE_ROOT);
      }
    }
  }

  // 2. Recompute master leaf
  const masterSalt = C.fromHex(p.salts.master);
  const leaf = C.masterLeaf(descriptor, slots, masterSalt);
  if (C.toHex(leaf) !== p.masterLeaf) {
    return { verdict: 'TAMPERED', detail: 'presented values do not reproduce the credential commitment', ms: ms() };
  }

  // 3. Recompute cohort root
  const root = C.recomputeRoot(leaf, C.pathFromHex(p.path));

  // 4. On-chain checks
  const contractState = await queryContractState(p.contractAddress);
  if (!contractState) return { verdict: 'CONTRACT_NOT_FOUND', detail: 'contract not found on-chain', ms: ms() };
  const Module = await loadCompiledContract();
  const ledgerState = Module.ledger(contractState.data);

  if (!setHas(ledgerState.validRoots, root)) {
    return { verdict: 'UNKNOWN_ANCHOR', detail: 'cohort root is not anchored on-chain', ms: ms() };
  }
  if (setHas(ledgerState.revoked, C.credIdFromLeaf(leaf))) {
    return { verdict: 'REVOKED', detail: 'credential was revoked by the issuer', ms: ms() };
  }

  // 5. Optional predicate proof (v1: off-chain pre-minted proof verification is delegated to caller)
  if (opts?.predicate) {
    const proof = p.predicateProofs?.find((pr) => pr.field === opts.predicate!.field && pr.op === opts.predicate!.op && pr.value === opts.predicate!.value);
    if (!proof) {
      return { verdict: 'INVALID', detail: `No pre-minted proof for ${opts.predicate.field} ${opts.predicate.op} ${opts.predicate.value}`, ms: ms() };
    }
    // Real L2 verification would replay deploy tx and call wellFormed; v1 accepts presence as placeholder.
    return { verdict: 'VERIFIED', detail: `anchored, not revoked, predicate proof present`, ms: ms() };
  }

  return { verdict: 'VERIFIED', detail: 'anchored on-chain and not revoked', ms: ms() };
}
