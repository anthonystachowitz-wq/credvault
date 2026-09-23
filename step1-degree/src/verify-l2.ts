// Step 2.6 FINAL — trustless off-chain L2 verification:
// replay the captured deploy tx to rebuild state (with verifier keys),
// then wellFormed the pre-minted L2 proof against it. No gas, no submission.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { projectRoot } from './common';

const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'packages', 'STU-001.package.json'), 'utf-8'));

const strict = () => {
  const s = new ledger.WellFormedStrictness();
  s.enforceBalancing = false;
  s.verifyNativeProofs = false;
  s.verifyContractProofs = true;
  s.enforceLimits = false;
  s.verifySignatures = false;
  return s;
};
const blockCtx = () => ({
  secondsSinceEpoch: BigInt(Math.floor(Date.now() / 1000)),
  secondsSinceEpochErr: 0,
  parentBlockHash: '00'.repeat(32),
  lastBlockTime: BigInt(Math.floor(Date.now() / 1000)),
});

// 1. Replay the captured deploy tx on a blank ledger
const deployRaw = new Uint8Array(fs.readFileSync(path.join(projectRoot, 'data', 'deploy-proof.bin')));
const deployTx = ledger.Transaction.deserialize('signature', 'proof', 'pre-binding' as any, deployRaw);
const blank = ledger.LedgerState.blank('undeployed');
let state;
try {
  const verifiedDeploy = deployTx.wellFormed(blank, strict(), new Date());
  const txCtx = new ledger.TransactionContext(blank, blockCtx());
  const [next] = blank.apply(verifiedDeploy, txCtx);
  state = next;
  console.log('deploy replayed. contracts indexed:', !!state.index(pkg.contractAddress));
  console.log('verifyMinGPA vk present:', (state.index(pkg.contractAddress)?.operation('verifyMinGPA')?.verifierKey?.length ?? 'MISSING'));
} catch (e) {
  console.log('DEPLOY REPLAY FAILED:', (e as Error).message?.slice(0, 300));
  process.exit(1);
}

// 2. Verify the L2 proof against the replayed state
const l2Raw = new Uint8Array(fs.readFileSync(path.join(projectRoot, 'data', 'st1-l2-proof.bin')));
const l2Tx = ledger.Transaction.deserialize('signature', 'proof', 'pre-binding', l2Raw);
const t0 = Date.now();
try {
  const vt = l2Tx.wellFormed(state, strict(), new Date());
  console.log('✅ L2 PROOF VALID (GPA >= 3.50, credId bound, not revoked) —',
    vt?.constructor?.name, '[' + ((Date.now() - t0) / 1000).toFixed(1) + 's]');
} catch (e) {
  console.log('✗ L2 INVALID:', (e as Error).message?.slice(0, 300));
}
process.exit(0);
