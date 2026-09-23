# Midnight Compact Smart Contract Blockchain Engineer

## Critical Code Patterns & Fixes

This document contains essential patterns and fixes discovered during CredVault development. All Midnight coders must review this before writing deployment code.

---

## 1. Required Global WebSocket Assignment

The wallet SDK sub-wallets (ShieldedWallet, DustWallet) need WebSocket available globally to establish connections to the indexer and relay node.

```typescript
import WebSocket from 'ws';

// REQUIRED for wallet sub-wallets to connect to indexer/node
// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;
```

**Failure symptom:** `Timeout has occurred` with `seen: 0` - wallet state observable never emits.

---

## 2. httpClientProofProvider Requires zkConfigProvider

The proof provider must be initialized with both the proof server URL AND the zkConfigProvider.

```typescript
// WRONG - missing zkConfigProvider:
proofProvider: httpClientProofProvider(networkConfig.proofServer),

// CORRECT:
proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
```

---

## 3. networkId — Must Be String Literal

The SDK v3.0.0+ requires string literals, not enums.

```typescript
// WRONG - uses enum:
import { NetworkId } from '@midnight-ntwrk/wallet-sdk-abstractions';
const networkId = NetworkId.PreProd;

// CORRECT - use string literal:
setNetworkId('preprod');
const networkId = getNetworkId(); // returns 'preprod' string
```

---

## 4. nativeToken vs unshieldedToken().raw for Balance Lookups

Critical bug: Using `nativeToken` as a key returns zero balances.

```typescript
// WRONG - always returns zero:
import { nativeToken } from '@midnight-ntwrk/ledger-v7';
const balance = state.unshielded.balances[nativeToken];

// CORRECT - use unshieldedToken().raw:
import { unshieldedToken } from '@midnight-ntwrk/ledger-v7';
const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
```

---

## 5. Correct Balance State Shape

```typescript
// WRONG state shapes:
state.dust?.balances?.total?.[nativeToken]
state.unshielded?.balances?.total?.[nativeToken]

// CORRECT state shapes:
state.unshielded.balances[unshieldedToken().raw] ?? 0n
state.dust.walletBalance(new Date())
```

---

## 6. wallet.start() Arguments

Do NOT wrap shieldedSecretKeys in an array.

```typescript
// WRONG - array wrapping:
await wallet.start([shieldedSecretKeys], dustSecretKey);

// CORRECT - no array:
await wallet.start(shieldedSecretKeys, dustSecretKey);
```

---

## 7. State Subscription Pattern

Use RxJS `firstValueFrom` with `filter`, not manual Promise + subscribe.

```typescript
// WRONG - manual pattern:
const state = await new Promise((resolve) => {
  const sub = wallet.state().subscribe(s => {
    if (s.isSynced) {
      sub.unsubscribe();
      resolve(s);
    }
  });
});

// CORRECT - RxJS pattern:
const state = await Rx.firstValueFrom(
  wallet.state().pipe(
    Rx.throttleTime(5_000),
    Rx.filter((s) => s.isSynced),
  )
);
```

---

## 8. Key Derivation API (wallet-sdk-hd@1.0.0)

Version 1.0.0 uses `selectRole` (singular) + `deriveKeyAt`, NOT `selectRoles` (plural).

```typescript
// CORRECT for @midnight-ntwrk/wallet-sdk-hd@1.0.0:
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

**Note:** `selectRoles` + `deriveKeysAt` (plural) does NOT exist in version 1.0.0.

---

## 9. WebSocket URL Format

Correct WebSocket URL for preprod indexer:

```typescript
// CORRECT:
indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws'

// WRONG (returns 308 redirect):
indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql-ws'
```

---

## 10. Wallet Sync Timeout

Wallet sync takes 3-5 minutes on preprod. Use appropriate timeouts.

```typescript
const state = await Rx.firstValueFrom(
  wallet.state().pipe(
    Rx.filter((s) => s.isSynced),
    Rx.timeout({ first: 300000 }) // 5 minutes
  )
);
```

---

## Reference Links

- [Network Configuration](https://docs.midnight.network/how-to/migrate-from-testnet-02-to-preview#network-configuration)
- [Migration Guide](https://github.com/midnightntwrk/example-counter/blob/main/MIGRATION_GUIDE.md)
- [Wallet Sync](https://docs.midnight.network/tutorials/counter/counter-cli#wallet-synchronization-and-funding-functions)

---

## Version Compatibility Matrix

| Component | Required Version | Notes |
|-----------|-----------------|-------|
| @midnight-ntwrk/ledger-v7 | 7.0.0 | Exact version |
| @midnight-ntwrk/wallet-sdk-* | 1.0.0 | All wallet packages |
| @midnight-ntwrk/midnight-js-* | 3.1.0 | All midnight-js packages |
| @midnight-ntwrk/compact-runtime | 0.14.0 | Runtime library |
| @midnight-ntwrk/onchain-runtime-v2 | 2.0.0 | On-chain runtime |
| Proof Server Docker | 7.0.0 | `midnightntwrk/proof-server:7.0.0` |

---

Last Updated: 2026-03-15
