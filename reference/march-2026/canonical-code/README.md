# Midnight Compact Reference Implementations

**Location:** `/home/anthony/.openclaw/workspace/agents/midnight-coder/references/`

These are working, tested reference implementations for Midnight Compact development. Use these as canonical examples when writing tests or new contracts.

---

## Files Overview

| File | Purpose | Key Features |
|------|---------|--------------|
| `deploy.ts` | General contract deployment | CLI args, configurable constructor, basic pattern |
| `deploy-transcript-v2.ts` | Transcript-specific deployment | Witnesses, commitment pattern, student data loading |
| `check-balance.ts` | Wallet balance checker | Simple wallet sync, balance display |

---

## Key Patterns to Remember

### 1. Network Configuration
```typescript
const networkConfig = {
  networkId: 'preprod',
  node: 'http://localhost:9944',           // OR 'https://rpc.preprod.midnight.network'
  indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  proofServer: 'http://localhost:6300',
};
```

### 2. Key Derivation (CRITICAL - Use This Exact Pattern)
```typescript
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';

function deriveKeys(seedHex: string) {
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
```

### 3. Wallet Initialization
```typescript
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, InMemoryTransactionHistoryStorage, PublicKey, createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import * as ledger from '@midnight-ntwrk/ledger-v7';

async function initializeWallet(seedHex: string) {
  setNetworkId('preprod');
  const networkId = getNetworkId();
  
  const keys = deriveKeys(seedHex);
  
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

  const shieldedWallet = ShieldedWallet(walletConfig).startWithSecretKeys(shieldedSecretKeys);
  const unshieldedWallet = UnshieldedWallet({
    networkId,
    indexerClientConnection: walletConfig.indexerClientConnection,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));

  const dustWallet = DustWallet({
    ...walletConfig,
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5
    },
  }).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust);

  const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  // Wait for sync
  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.filter((s) => s.isSynced),
      Rx.timeout({ first: 300000 })
    )
  );

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}
```

### 4. Wallet Sync (RxJS Pattern)
```typescript
import * as Rx from 'rxjs';

const state = await Rx.firstValueFrom(
  wallet.state().pipe(
    Rx.throttleTime(5_000),                    // Throttle updates
    Rx.filter((s) => s.isSynced),              // Wait until synced
    Rx.timeout({ first: 300000 })              // 5 minute timeout
  )
);
```

### 5. Contract Loading (Without Witnesses)
```typescript
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { pathToFileURL } from 'url';

async function loadContract() {
  const contractPath = path.join(ZK_CONFIG_PATH, 'contract', 'index.js');
  const { Contract } = await import(pathToFileURL(contractPath).href);
  
  const compiledContract = CompiledContract.make(CONTRACT_NAME, Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  return compiledContract;
}
```

### 6. Contract Loading (With Witnesses)
```typescript
import { witnesses, TranscriptPrivateState } from './witnesses.js';

async function loadContractWithWitnesses() {
  const contractPath = path.join(ZK_CONFIG_PATH, 'contract', 'index.js');
  const { Contract } = await import(pathToFileURL(contractPath).href);
  
  const compiledContract = CompiledContract.make(CONTRACT_NAME, Contract).pipe(
    CompiledContract.withWitnesses(witnesses),   // <-- KEY DIFFERENCE
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  return compiledContract;
}
```

### 7. Provider Setup
```typescript
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

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
```

### 8. Contract Deployment
```typescript
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';

const deployed = await deployContract(providers, {
  compiledContract,
  privateStateId: CONTRACT_NAME + '-state',
  initialPrivateState: { gpa: 0n, salt: new Uint8Array(32) },  // Or {}
  args: constructorArgs,  // [merkleRoot, attestation, gpaCommitment]
});

// deployed.deployTxData.public.contractAddress
// deployed.deployTxData.public.txId
```

### 9. Transaction Intent Signing (Required Workaround)
```typescript
import * as ledger from '@midnight-ntwrk/ledger-v7';

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
```

### 10. Creating Wallet/Midnight Provider
```typescript
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
```

---

## Helper Functions

### Hex String to Uint8Array
```typescript
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}
```

### Uint8Array to Hex String
```typescript
function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `MIDNIGHT_WALLET_SEED` | Wallet seed hex string (required) |
| `CONTRACT_NAME` | Default contract name |
| `CONTRACT_OUTPUT` | Path to compiled contract output |
| `CONSTRUCTOR_ARGS` | JSON array of constructor arguments |

---

## Running the Scripts

```bash
# Check balance
export MIDNIGHT_WALLET_SEED="your_seed_here"
npx tsx check-balance.ts

# Deploy transcript contract
npx tsx deploy-transcript-v2.ts --seed $MIDNIGHT_WALLET_SEED

# Deploy with specific student
npx tsx deploy-transcript-v2.ts --student student-STU-2024-002.json --seed $MIDNIGHT_WALLET_SEED

# Deploy generic contract
npx tsx deploy.ts --name mycontract --output mycontract-output --args "[0]" --seed $MIDNIGHT_WALLET_SEED
```

---

## Critical Gotchas

1. **Always use `selectRole` (singular)** - The SDK has `selectRole` and `selectRoles` - use singular
2. **WebSocket is required** - Must set `globalThis.WebSocket = WebSocket` for wallet sync
3. **BigInt constructor args** - Numbers must be converted to BigInt: `BigInt(value)`
4. **Hex to Uint8Array** - Constructor args that are hex strings must be converted to Uint8Array
5. **Transaction intent signing** - The `signTransactionIntents` workaround is required for wallet SDK bug
6. **5-minute timeout** - Wallet sync can take time, use timeout in RxJS pipe
7. **Stop the wallet** - Always call `wallet.stop()` to clean up connections

---

## Source Locations on Preprod Server

| File | Path |
|------|------|
| deploy.ts | `/home/ubuntu/credvault-contract/archive/deploy.ts` |
| deploy-transcript-v2.ts | `/home/ubuntu/credvault-contract/src/deploy/deploy-transcript-v2.ts` |
| check-balance.ts | `/home/ubuntu/credvault-contract/src/utils/check-balance.ts` |

---

**Last Updated:** 2026-03-17
**Status:** Working, tested on Midnight Preprod
