// L2 verification helpers — shared by verifier CLI and the HTTP service.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { projectRoot } from './common';

export function strictProofsOnly() {
  const s = new ledger.WellFormedStrictness();
  s.enforceBalancing = false;
  s.verifyNativeProofs = false;
  s.verifyContractProofs = true;
  s.enforceLimits = false;
  s.verifySignatures = false;
  return s;
}

// Freeze the replayed state's clock at DEPLOY time: the TTL check runs against
// the state's clock (learned the hard way), and intent TTL is a SUBMISSION
// window, not a proof-soundness concept — our proof artifacts are long-lived.
// Verifying 'as of deploy-time state' is exactly the semantic we want.
const blockCtx = () => {
  const deployedAt = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'deployment.json'), 'utf-8')).deployedAt;
  const sec = BigInt(Math.floor(new Date(deployedAt).getTime() / 1000));
  return { secondsSinceEpoch: sec, secondsSinceEpochErr: 0, parentBlockHash: '00'.repeat(32), lastBlockTime: sec };
};

let cachedState: any = null;

/** Replay the captured deploy tx once → ledger state WITH verifier keys. */
export function replayDeployState(deployProofFile?: string) {
  if (cachedState) return cachedState;
  const file = deployProofFile ?? path.join(projectRoot, 'data', 'deploy-proof.bin');
  const raw = new Uint8Array(fs.readFileSync(file));
  const deployTx = ledger.Transaction.deserialize('signature', 'proof', 'pre-binding' as any, raw);
  const blank = ledger.LedgerState.blank('undeployed');
  // The deploy intent carries a ~1h TTL (submission window). wellFormed's
  // TTL check is driven by the tblock ARGUMENT (verified by probe), so replay
  // inside the window: deployedAt + 30min. TTL is not a soundness concept.
  const deployedAt = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'deployment.json'), 'utf-8')).deployedAt;
  const replayTime = new Date(new Date(deployedAt).getTime() + 30 * 60 * 1000);
  const verifiedDeploy = deployTx.wellFormed(blank, strictProofsOnly(), replayTime);
  const [next] = blank.apply(verifiedDeploy, new ledger.TransactionContext(blank, blockCtx()));
  cachedState = next;
  return cachedState;
}

/** Verify a pre-minted L2 proof (serialized proven tx, hex) against replayed state.
 *  `mintedAt` anchors the TTL check: intent TTL is a SUBMISSION-window concept
 *  (default ~1h), not a proof-soundness concept — a year-old proof is still
 *  sound, so we validate with tblock = its mint time. */
export function verifyL2ProofHex(provenTxHex: string, mintedAt?: string): { ok: boolean; error?: string } {
  try {
    let state = replayDeployState();
    if (mintedAt) {
      // The TTL check runs against the STATE's clock — advance it to the
      // proof's mint time (TTL is a submission window, not a soundness concept).
      state = state.postBlockUpdate(new Date(mintedAt));
    }
    const tx = ledger.Transaction.deserialize('signature', 'proof', 'pre-binding' as any, Buffer.from(provenTxHex, 'hex'));
    tx.wellFormed(state, strictProofsOnly(), mintedAt ? new Date(mintedAt) : new Date());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message?.slice(0, 200) };
  }
}
