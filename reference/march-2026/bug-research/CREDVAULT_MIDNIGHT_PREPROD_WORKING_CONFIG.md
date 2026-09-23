# CredVault Midnight Preprod Deployment - WORKING CONFIGURATION

**Date:** 2026-03-15  
**Status:** ✅ FULLY WORKING - First successful contract deployment  
**Contract Address:** `5c7f7f2271b2fab3c7684854a962afd56672d90b1a14caf8740266a7305a3378`  
**Transaction Hash:** `007fad4f21b6fb899984d18941936fe57ac4f6061e348f79bed08d73e6e166b463`

---

## 🎯 Executive Summary

This document contains the EXACT working configuration for deploying Midnight Compact smart contracts to the preprod network. This setup was validated with a successful deployment on March 15, 2026.

**Key Success Factors:**
1. Correct package versions (exact versions, not ranges)
2. Proper provider configuration (walletProvider + midnightProvider)
3. Required global WebSocket assignment
4. Working proof server 7.0.0
5. Correct key derivation pattern
6. All 5 Midnight AI code corrections applied

---

## 📦 Package Versions (EXACT)

### Midnight Core Packages
```json
{
  "@midnight-ntwrk/compact-js": "2.4.0",
  "@midnight-ntwrk/compact-runtime": "0.14.0",
  "@midnight-ntwrk/dapp-connector-api": "4.0.0",
  "@midnight-ntwrk/ledger-v7": "7.0.0",
  "@midnight-ntwrk/midnight-js-contracts": "3.1.0",
  "@midnight-ntwrk/midnight-js-http-client-proof-provider": "3.1.0",
  "@midnight-ntwrk/midnight-js-indexer-public-data-provider": "3.1.0",
  "@midnight-ntwrk/midnight-js-level-private-state-provider": "3.1.0",
  "@midnight-ntwrk/midnight-js-network-id": "3.1.0",
  "@midnight-ntwrk/midnight-js-node-zk-config-provider": "3.1.0",
  "@midnight-ntwrk/midnight-js-types": "3.1.0",
  "@midnight-ntwrk/midnight-js-utils": "3.1.0",
  "@midnight-ntwrk/onchain-runtime-v2": "2.0.0",
  "@midnight-ntwrk/wallet-sdk-address-format": "1.0.0",
  "@midnight-ntwrk/wallet-sdk-dust-wallet": "1.0.0",
  "@midnight-ntwrk/wallet-sdk-facade": "1.0.0",
  "@midnight-ntwrk/wallet-sdk-hd": "1.0.0",
  "@midnight-ntwrk/wallet-sdk-shielded": "^1.0.0",
  "@midnight-ntwrk/wallet-sdk-unshielded-wallet": "^1.0.0"
}
```

### Supporting Packages
```json
{
  "@scure/bip39": "^2.0.1",
  "rxjs": "^7.8.0",
  "ws": "^8.19.0"
}
```

### DevDependencies
```json
{
  "@types/node": "^22.0.0",
  "@types/ws": "^8.18.1",
  "patch-package": "^8.0.1",
  "postinstall-postinstall": "^2.1.0",
  "tsx": "^4.21.0",
  "typescript": "^5.9.3",
  "vitest": "^1.0.0"
}
```

### Package Overrides (CRITICAL)
```json
{
  "overrides": {
    "@midnight-ntwrk/ledger-v7": "7.0.0"
  }
}
```

---

## 🖥️ Infrastructure Requirements

### Docker Services

#### 1. Proof Server (REQUIRED)
```yaml
# proof-server.yml
services:
  proof-server:
    image: midnightntwrk/proof-server:7.0.0
    ports:
      - "6300:6300"
    command: 'midnight-proof-server'
    healthcheck:
      test: ["CMD", "/bin/bash", "-c", ":> /dev/tcp/127.0.0.1/6300 || exit 1"]
```

**Verification:**
```bash
curl -s http://localhost:6300/health
# Expected: {"status":"ok","timestamp":"..."}
```

#### 2. Midnight Node (Optional but recommended)
```yaml
# docker-compose.yml snippet
services:
  midnight-node:
    image: midnightntwrk/midnight-node:0.22.0-rc.6
    ports:
      - 9944:9944
      - 30333:30333
```

---

## 🔑 Wallet Configuration

### Environment Variables
```bash
export MIDNIGHT_WALLET_SEED=[REDACTED-DEAD-SEED]
export MIDNIGHT_NETWORK=preprod
```

### Wallet Details (Preprod)
- **Address:** `mn_addr_undefined1dpjp7m2wdxqh3gsuqntldu57x4fy30m3jj37s643vucexw2nch0sh4c52s`
- **tNIGHT Balance:** 2000000000 (2 tNIGHT)
- **DUST Balance:** 5524009400000000000 (~5.5 DUST)

---

## 🌐 Network Configuration

### Preprod Network Settings
```typescript
const networkConfig = {
  networkId: 'preprod',
  node: 'https://rpc.preprod.midnight.network',
  indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  proofServer: 'http://localhost:6300',
};
```

### WebSocket Subprotocol (REQUIRED)
```typescript
const ws = new WebSocket(
  'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  'graphql-transport-ws'  // REQUIRED subprotocol
);
```

---

## 📄 COMPLETE WORKING deploy.ts

```typescript
// Test deployment script for CredVault
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, InMemoryTransactionHistoryStorage, PublicKey, createKeystore, UnshieldedKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import * as ledger from '@midnight-ntwrk/ledger-v7';
import { deployContract, DeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { pathToFileURL } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { Buffer } from 'buffer';
import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;
import * as Rx from 'rxjs';

const networkConfig = {
  networkId: 'preprod',
  node: 'https://rpc.preprod.midnight.network',
  indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  proofServer: 'http://localhost:6300',
};

const CONTRACT_NAME = 'test-contract';
const ZK_CONFIG_PATH = path.resolve(process.cwd(), 'contract-output');

// Key derivation using selectRole (singular) - CORRECT for wallet-sdk-hd@1.0.0
function deriveKeys(seedHex: string): { zswap: Uint8Array; nightExternal: Uint8Array; dust: Uint8Array } {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');

  const accountKey = hdWallet.hdWallet.selectAccount(0);
  
  const zswapResult = accountKey.selectRole(Roles.Zswap).deriveKeyAt(0);
  const nightResult = accountKey.selectRole(Roles.NightExternal).deriveKeyAt(0);
  const dustResult = accountKey.selectRole(Roles.Dust).deriveKeyAt(0);
  
  if (zswapResult.type !== 'keyDerived' || nightResult.type !== 'keyDerived' || dustResult.type !== 'keyDerived') {
    throw new Error('Key derivation failed');
  }

  return {
    zswap: zswapResult.key,
    nightExternal: nightResult.key,
    dust: dustResult.key,
  };
}

async function initializeWallet(seedHex: string) {
  console.log('Creating wallet from seed...');
  
  setNetworkId(networkConfig.networkId);
  const networkId = getNetworkId();
  
  const keys = deriveKeys(seedHex);
  console.log('Keys derived successfully');
  
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const unshieldedKeystore = createKeystore(keys.nightExternal, networkId);

  const walletConfig = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: networkConfig.indexer,
      indexerWsUrl: networkConfig.indexerWS
    },
    provingServerUrl: new URL(networkConfig.proofServer),
    relayURL: new URL(networkConfig.node.replace(/^http/, 'ws')),
  };

  console.log('Creating shielded wallet...');
  const ShieldedWalletClass = ShieldedWallet(walletConfig);
  const shieldedWallet = ShieldedWalletClass.startWithSecretKeys(shieldedSecretKeys);

  console.log('Creating unshielded wallet...');
  const unshieldedWallet = UnshieldedWallet({
    networkId,
    indexerClientConnection: walletConfig.indexerClientConnection,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));

  console.log('Creating dust wallet...');
  const dustWallet = DustWallet({
    ...walletConfig,
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5
    },
  }).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust);

  console.log('Creating wallet facade...');
  const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
  
  console.log('Starting wallet...');
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  console.log('Waiting for wallet to sync (up to 5 minutes)...');
  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.filter((s) => s.isSynced),
      Rx.timeout({ first: 300000 })
    )
  );

  console.log('Wallet synced successfully');
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, shieldedWallet };
}

async function loadContract() {
  const contractPath = path.join(ZK_CONFIG_PATH, 'contract', 'index.js');
  if (!fs.existsSync(contractPath)) {
    throw new Error('Contract not compiled at: ' + contractPath);
  }

  console.log('Loading compiled contract...');
  const { Contract } = await import(pathToFileURL(contractPath).href);
  
  const compiledContract = CompiledContract.make(CONTRACT_NAME, Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  return compiledContract;
}

// Sign transaction intents workaround for wallet SDK bug
function signTransactionIntents(
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof'
): void {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize<
      ledger.SignatureEnabled,
      ledger.Proofish,
      ledger.PreBinding
    >('signature', proofMarker, 'pre-binding', intent.serialize());
    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);
    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: any, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: any, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
}

// Create wallet and midnight provider
async function createWalletAndMidnightProvider(
  facade: WalletFacade,
  shieldedSecretKeys: ledger.ZswapSecretKeys,
  dustSecretKey: ledger.DustSecretKey,
  unshieldedKeystore: UnshieldedKeystore
) {
  const state = await Rx.firstValueFrom(
    facade.state().pipe(Rx.filter((s) => s.isSynced))
  );

  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await facade.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
      );
      const signFn = (payload: Uint8Array) => unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      }
      return facade.finalizeRecipe(recipe);
    },
    submitTx(tx: any) {
      return facade.submitTransaction(tx) as any;
    },
  };
}

async function deploy(
  wallet: WalletFacade,
  shieldedSecretKeys: ledger.ZswapSecretKeys,
  dustSecretKey: ledger.DustSecretKey,
  unshieldedKeystore: UnshieldedKeystore,
  compiledContract: any,
  constructorArgs: any[]
): Promise<DeployedContract<any>> {
  console.log('Deploying contract...');
  
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(
    wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore
  );

  const zkConfigProvider = new NodeZkConfigProvider(ZK_CONFIG_PATH);
  
  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: CONTRACT_NAME + '-state',
      walletProvider: walletAndMidnightProvider,
    }),
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };

  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: CONTRACT_NAME + '-state',
    initialPrivateState: {},
    args: constructorArgs,
  });

  return deployed;
}

async function main() {
  console.log('CredVault Contract Deployment');

  const seed = process.env.MIDNIGHT_WALLET_SEED;
  if (!seed) {
    console.error('Missing MIDNIGHT_WALLET_SEED environment variable');
    process.exit(1);
  }

  console.log('Network: preprod');
  console.log('Node:', networkConfig.node);
  console.log('Proof Server:', networkConfig.proofServer);

  try {
    const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = await initializeWallet(seed);
    const compiledContract = await loadContract();
    const initialCounter = 0n;
    
    console.log('Constructor Args:');
    console.log('Initial counter:', initialCounter.toString());

    const deployed = await deploy(wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, compiledContract, [initialCounter]);

    console.log('Contract deployed successfully!');
    console.log('Contract Address:', deployed.deployTxData.public.contractAddress);
    console.log('Transaction Hash:', deployed.deployTxData.public.txId);

    const deploymentInfo = {
      network: 'preprod',
      contractAddress: deployed.deployTxData.public.contractAddress,
      deployTxHash: deployed.deployTxData.public.txId,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync('deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
    console.log('Deployment info saved to deployment-info.json');

  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

main();
```

---

## ✅ Critical Success Patterns

### 1. Global WebSocket Assignment (REQUIRED)
```typescript
import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;
```

### 2. Provider Object Structure (CRITICAL)
```typescript
const providers = {
  privateStateProvider: levelPrivateStateProvider({
    privateStateStoreName: CONTRACT_NAME + '-state',  // REQUIRED
    walletProvider: walletAndMidnightProvider,
  }),
  proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
  publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
  zkConfigProvider,
  walletProvider: walletAndMidnightProvider,
  midnightProvider: walletAndMidnightProvider,  // REQUIRED - was missing!
};
```

### 3. Wallet/Midnight Provider Methods (REQUIRED)
```typescript
return {
  getCoinPublicKey() { return state.shielded.coinPublicKey.toHexString(); },
  getEncryptionPublicKey() { return state.shielded.encryptionPublicKey.toHexString(); },
  async balanceTx(tx: any, ttl?: Date) { /* with signTransactionIntents workaround */ },
  submitTx(tx: any) { return facade.submitTransaction(tx); },  // REQUIRED
};
```

### 4. signTransactionIntents Workaround (REQUIRED)
Must be called in `balanceTx` method to avoid "Failed to clone intent" error.

---

## 🔧 Troubleshooting Guide

### Error: "expected instance of ZswapSecretKeys"
**Cause:** Key derivation using wrong API pattern  
**Fix:** Use `selectRole` (singular) + `deriveKeyAt`, NOT `selectRoles`

### Error: "Timeout has occurred" with seen: 0
**Cause:** Missing global WebSocket  
**Fix:** Add `globalThis.WebSocket = WebSocket`

### Error: "submitTxCore is not a function"
**Cause:** Missing `midnightProvider` in providers object  
**Fix:** Add `midnightProvider: walletAndMidnightProvider`

### Error: "Failed to clone intent"
**Cause:** Missing `signTransactionIntents` workaround  
**Fix:** Add the `signTransactionIntents` function and call it in `balanceTx`

### Error: "zkConfigProvider is not defined"
**Cause:** Variable ordering issue  
**Fix:** Define `zkConfigProvider` before the providers object

---

## 📋 Deployment Checklist

- [ ] Proof server 7.0.0 running on port 6300
- [ ] All packages installed with exact versions
- [ ] `globalThis.WebSocket = WebSocket` added
- [ ] `midnightProvider` included in providers
- [ ] `submitTx` method implemented
- [ ] `signTransactionIntents` workaround added
- [ ] `privateStateStoreName` set in levelPrivateStateProvider
- [ ] Wallet has DUST balance (> 0)
- [ ] 5-minute timeout set for wallet sync
- [ ] WebSocket URL correct (`/graphql/ws` not `/graphql-ws`)

---

## 🎉 Success Output

```
CredVault Contract Deployment
Network: preprod
Node: https://rpc.preprod.midnight.network
Proof Server: http://localhost:6300
Creating wallet from seed...
Keys derived successfully
Creating shielded wallet...
Creating unshielded wallet...
Creating dust wallet...
Creating wallet facade...
Starting wallet...
Waiting for wallet to sync (up to 5 minutes)...
Wallet synced successfully
Loading compiled contract...
Constructor Args:
Initial counter: 0
Deploying contract...
Contract deployed successfully!
Contract Address: 5c7f7f2271b2fab3c7684854a962afd56672d90b1a14caf8740266a7305a3378
Transaction Hash: 007fad4f21b6fb899984d18941936fe57ac4f6061e348f79bed08d73e6e166b463
Deployment info saved to deployment-info.json
```

---

## 📚 Reference Links

- [Midnight Counter CLI Tutorial](https://docs.midnight.network/tutorials/counter/counter-cli)
- [Migration Guide](https://github.com/midnightntwrk/example-counter/blob/main/MIGRATION_GUIDE.md)
- [Network Configuration](https://docs.midnight.network/how-to/migrate-from-testnet-02-to-preview#network-configuration)
- [Private State Storage](https://docs.midnight.network/how-to/migrate-from-testnet-02-to-preview#private-state-storage-leveldb)

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-15  
**Validated By:** Successful deployment to preprod
