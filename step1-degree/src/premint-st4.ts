// Step 2.5 EXPERIMENT — pre-mint one L2 proof (STU-004 @ GPA>=3.50) and introspect shapes
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createUnprovenCallTx, createCallTxOptions } from '@midnight-ntwrk/midnight-js-contracts';
import {
  setupWalletAndProviders, loadCompiled, makeCompiledContract,
  PRIVATE_STATE_ID, initialPrivateState, projectRoot, mark, elapsed,
} from './common';
import * as C from './canonical';

const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'packages', 'STU-004.package.json'), 'utf-8'));
const MIN_GPA = 350n;

const { walletCtx, providers } = await setupWalletAndProviders();
const DegreeModule = await loadCompiled();
const compiled = makeCompiledContract(DegreeModule);

// 1. Per-student private state for the L2 witnesses
await providers.privateStateProvider.setContractAddress(pkg.contractAddress);
await providers.privateStateProvider.set(PRIVATE_STATE_ID, {
  issuerSk: initialPrivateState.issuerSk,
  gpa: BigInt(pkg.values.gpa),
  gpaSalt: new Uint8Array(C.fromHex(pkg.salts.gpa)),
});

// 2. Build the unproven verifyMinGPA call
const options = createCallTxOptions(
  compiled, 'verifyMinGPA', pkg.contractAddress, PRIVATE_STATE_ID, undefined,
  [C.fromHex(pkg.credId), C.fromHex(pkg.gpaCommit), MIN_GPA],
);
mark('unprovenStart');
const unprovenData = await createUnprovenCallTx(providers as any, options);
mark('unproven');
console.log('unproven call built [' + elapsed('unprovenStart', 'unproven') + 's]');

// 3. Prove it (off-chain — no balancing, no submission)
mark('proveStart');
const provenTx = await providers.proofProvider.proveTx(unprovenData.private.unprovenTx);
mark('proven');
console.log('proof generated [' + elapsed('proveStart', 'proven') + 's]');

// 4. Introspect for serialization options
console.log('provenTx constructor:', provenTx?.constructor?.name);
const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(provenTx));
console.log('methods:', proto.filter((m) => !m.startsWith('_')).join(', '));
try {
  // @ts-ignore
  const ser = provenTx.serialize ? provenTx.serialize() : null;
  console.log('serialize() →', ser ? ser.length + ' bytes' : 'n/a');
  if (ser) {
    fs.writeFileSync(path.join(projectRoot, 'data', 'st1-l2-proof.bin'), Buffer.from(ser));
    console.log('wrote data/st1-l2-proof.bin');
  }
} catch (e) { console.log('serialize failed:', (e as Error).message); }

await walletCtx.wallet.stop();
process.exit(0);
