import * as fs from 'node:fs';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { strictProofsOnly } from './l2';

const deployRaw = new Uint8Array(fs.readFileSync('data/deploy-proof.bin'));
const deployTx = ledger.Transaction.deserialize('signature', 'proof', 'pre-binding', deployRaw);
const blank = ledger.LedgerState.blank('undeployed');
for (const label of ['2026-09-03T22:00:00Z', '2026-09-03T22:30:00Z', '2026-09-03T23:00:00Z']) {
  try {
    deployTx.wellFormed(blank, strictProofsOnly(), new Date(label));
    console.log(label, '→ VALID');
  } catch (e) {
    console.log(label, '→', (e as Error).message?.slice(0, 120));
  }
}
process.exit(0);
