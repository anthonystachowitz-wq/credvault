// Step 2.5 — pre-mint L2 proofs for every student at standard thresholds.
// Issuer-side, off-chain, no gas: ~2s per proof, parallelizable CPU work.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createUnprovenCallTx, createCallTxOptions } from '@midnight-ntwrk/midnight-js-contracts';
import {
  setupWalletAndProviders, loadCompiled, makeCompiledContract,
  PRIVATE_STATE_ID, initialPrivateState, projectRoot, mark, elapsed,
} from './common';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as C from './canonical';

const THRESHOLDS = [300n, 350n];   // standard: 3.00 and 3.50
const packagesDir = path.join(projectRoot, 'packages');

const { walletCtx, providers } = await setupWalletAndProviders();
const DegreeModule = await loadCompiled();
const compiled = makeCompiledContract(DegreeModule);

const files = fs.readdirSync(packagesDir).filter((f) => f.endsWith('.package.json'));
for (const f of files) {
  const pkgPath = path.join(packagesDir, f);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  // idempotence: skip students who already hold every standard threshold —
  // but never trust proofs bound to a DIFFERENT contract address (wipe+redeploy)
  const deployment = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'deployment.json'), 'utf-8'));
  const proofsHere = (pkg.l2Proofs ?? []).filter((x: any) => !x.contractAddress || x.contractAddress === deployment.address);
  const have = new Set(proofsHere.map((x: any) => Number(x.minGpa)));
  const missing = THRESHOLDS.filter((t) => !have.has(Number(t)));
  if (missing.length === 0) {
    console.log('  ' + pkg.studentId + ': already minted, skipping');
    continue;
  }
  const proofs: any[] = pkg.l2Proofs ?? [];
  const thresholdsToMint = missing;
  for (const minGpa of thresholdsToMint) {
    await providers.privateStateProvider.setContractAddress(pkg.contractAddress);
    await providers.privateStateProvider.set(PRIVATE_STATE_ID, {
      issuerSk: initialPrivateState.issuerSk,
      gpa: BigInt(pkg.values.gpa),
      gpaSalt: new Uint8Array(C.fromHex(pkg.salts.gpa)),
    });
    const options = createCallTxOptions(
      compiled, 'verifyMinGPA', pkg.contractAddress, PRIVATE_STATE_ID, undefined,
      [C.fromHex(pkg.credId), C.fromHex(pkg.gpaCommit), minGpa],
    );
    try {
      mark('b');
      const unprovenData = await createUnprovenCallTx(providers as any, options);
      // Long-lived proof artifacts: midnight-js stamps intents with ~1h TTL
      // (a submission-window default), and the ledger's TTL check reads the
      // HOST clock — so unpatched proofs expire ~1h after minting. Push the
      // intent TTL out; TTL is not part of the ZK statement.
      // Off-chain proofs carry no fees: drop the wallet's dust/zswap offers
      // (their TTLs expire too). Keep ONLY the contract-call intent.
      // Verification uses tblock = mint time, inside the intent's TTL window.
      const builtTx: any = unprovenData.private.unprovenTx;
      const slimIntents = [...builtTx.intents.values()];
      const slimTx = ledger.Transaction.fromParts(getNetworkId() as any, undefined, undefined, slimIntents[0]);
      const provenTx = await providers.proofProvider.proveTx(slimTx);
      mark('p');
      proofs.push({
        minGpa: Number(minGpa),
        provenTx: Buffer.from(provenTx.serialize()).toString('hex'),
        mintedAt: new Date().toISOString(),
      });
      console.log('  ' + pkg.studentId + ' @>=' + (Number(minGpa) / 100).toFixed(2) + ': minted [' + elapsed('b', 'p') + 's]');
    } catch (e) {
      console.log('  ' + pkg.studentId + ' @>=' + (Number(minGpa) / 100).toFixed(2) + ': NOT minted (' + (e as Error).message?.split('\n')[0] + ')');
    }
  }
  pkg.l2Proofs = proofs;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}
console.log('✅ pre-minting complete');
await walletCtx.wallet.stop();
process.exit(0);
