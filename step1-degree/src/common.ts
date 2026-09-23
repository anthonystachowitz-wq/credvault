// Shared Step-1 setup: wallet, providers, compiled contract with witnesses.
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { sha256, pad32 } from './canonical';

import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { resolveNetwork, getOrCreateWallet } from './network';
import { createWallet, type WalletContext } from './wallet';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

export const PRIVATE_STATE_ID = 'credvaultDegreeState';

// Dev-only issuer secret (Step 1). Production: per-issuer generated secret,
// held only by the issuer runtime — see ARCHITECTURE.md.
export const ISSUER_SK: Uint8Array = sha256(pad32('credvault:dev-issuer-sk:'));
export const initialPrivateState = { issuerSk: ISSUER_SK };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'degree');
export const projectRoot = path.resolve(__dirname, '..');

export const { network, config: networkConfig } = resolveNetwork();
export const SEED = getOrCreateWallet(network).seed;

export async function loadCompiled() {
  const mod = await import(pathToFileURL(path.join(zkConfigPath, 'contract', 'index.js')).href);
  return mod;
}

export function makeCompiledContract(DegreeModule: any) {
  const witnesses = {
    issuerSecretKey: (ctx: any): [any, Uint8Array] => [ctx.privateState, ctx.privateState.issuerSk],
    // L2 witnesses: private GPA + salt, set in private state at premint/prove
    // time (per student). Defaults keep deploy/anchor calls working.
    gpaValue: (ctx: any): [any, bigint] => [ctx.privateState, ctx.privateState.gpa ?? 0n],
    gpaSalt: (ctx: any): [any, Uint8Array] => [ctx.privateState, ctx.privateState.gpaSalt ?? new Uint8Array(32)],
  };
  return CompiledContract.make('degree', DegreeModule.Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}

export async function createProviders(walletCtx: WalletContext) {
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';
  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'step1-degree-state',
      accountId: walletCtx.unshieldedKeystore.getBech32Address().toString(),
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

export async function setupWalletAndProviders() {
  const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
  await walletCtx.wallet.waitForSyncedState();
  const providers = await createProviders(walletCtx);
  return { walletCtx, providers };
}

export const marks: Record<string, number> = {};
export const mark = (k: string) => { marks[k] = Date.now(); };
export const elapsed = (a: string, b: string) => ((marks[b] - marks[a]) / 1000).toFixed(1);
