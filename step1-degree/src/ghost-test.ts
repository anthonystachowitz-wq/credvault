// Test: is the deploy address deterministic from (compiledContract + initialPrivateState)?
import { createUnprovenDeployTx } from '@midnight-ntwrk/midnight-js-contracts';
import { setupWalletAndProviders, loadCompiled, makeCompiledContract, PRIVATE_STATE_ID, initialPrivateState, networkConfig } from './common';
import * as fs from 'node:fs';

const { walletCtx, providers } = await setupWalletAndProviders();
const DegreeModule = await loadCompiled();
const compiled = makeCompiledContract(DegreeModule);

const mk = () => createUnprovenDeployTx(providers as any, {
  compiledContract: compiled as any,
  privateStateId: PRIVATE_STATE_ID,
  initialPrivateState,
} as any);

const d1: any = await mk();
const d2: any = await mk();
const a1 = d1?.public?.contractAddress ?? d1?.contractAddress ?? JSON.stringify(Object.keys(d1?.public ?? d1));
const a2 = d2?.public?.contractAddress ?? d2?.contractAddress ?? JSON.stringify(Object.keys(d2?.public ?? d2));
console.log('deploy address 1:', a1);
console.log('deploy address 2:', a2);
console.log('deterministic?', a1 === a2);
const real = JSON.parse(fs.readFileSync('data/deployment.json', 'utf-8')).address;
console.log('matches REAL deployment e4b7...?', a1 === real, '(real:', real.slice(0, 16) + '…)');
await walletCtx.wallet.stop();
process.exit(0);
