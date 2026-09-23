# 🎉 FIRST SUCCESSFUL CONTRACT DEPLOYMENT - March 15, 2026

## Deployment Summary

**Status:** ✅ **SUCCESS** - First working contract deployment on Midnight Preprod  
**Date:** March 15, 2026  
**Contract Address:** `5c7f7f2271b2fab3c7684854a962afd56672d90b1a14caf8740266a7305a3378`  
**Transaction Hash:** `007fad4f21b6fb899984d18941936fe57ac4f6061e348f79bed08d73e6e166b463`

---

## What Was Deployed

**Contract:** `test-contract` (simple counter contract)  
**Initial State:** Counter = 0  
**Network:** Preprod  
**Wallet:** `mn_addr_undefined1dpjp7m2wdxqh3gsuqntldu57x4fy30m3jj37s643vucexw2nch0sh4c52s`

---

## Critical Success Factors

This deployment succeeded because ALL of the following were correctly configured:

### 1. ✅ Exact Package Versions
All packages pinned to exact versions (no `^` or `~` ranges):
- `@midnight-ntwrk/ledger-v7`: `7.0.0`
- `@midnight-ntwrk/wallet-sdk-*`: `1.0.0`
- `@midnight-ntwrk/midnight-js-*`: `3.1.0`
- `@midnight-ntwrk/onchain-runtime-v2`: `2.0.0`
- `@midnight-ntwrk/proof-server`: `7.0.0` (Docker)

### 2. ✅ Global WebSocket Assignment
```typescript
import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;  // REQUIRED
```

### 3. ✅ Both Providers Required
```typescript
const providers = {
  privateStateProvider: levelPrivateStateProvider({
    privateStateStoreName: CONTRACT_NAME + '-state',
    walletProvider: walletAndMidnightProvider,
  }),
  proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
  publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
  zkConfigProvider,
  walletProvider: walletAndMidnightProvider,
  midnightProvider: walletAndMidnightProvider,  // ← CRITICAL: Was missing!
};
```

### 4. ✅ Complete Provider Implementation
```typescript
return {
  getCoinPublicKey() { 
    return state.shielded.coinPublicKey.toHexString();  // Hex string, not object
  },
  getEncryptionPublicKey() { 
    return state.shielded.encryptionPublicKey.toHexString();  // Hex string
  },
  async balanceTx(tx: any, ttl?: Date) { 
    // ... with signTransactionIntents workaround
  },
  submitTx(tx: any) { 
    return facade.submitTransaction(tx);  // ← REQUIRED: Was missing!
  },
};
```

### 5. ✅ signTransactionIntents Workaround
Required function to avoid "Failed to clone intent" error:
```typescript
function signTransactionIntents(
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof'
): void {
  // ... implementation
}
```

### 6. ✅ Correct Key Derivation
Using `selectRole` (singular) + `deriveKeyAt` for wallet-sdk-hd@1.0.0:
```typescript
const zswapResult = accountKey.selectRole(Roles.Zswap).deriveKeyAt(0);
const nightResult = accountKey.selectRole(Roles.NightExternal).deriveKeyAt(0);
const dustResult = accountKey.selectRole(Roles.Dust).deriveKeyAt(0);
```

### 7. ✅ Wallet Sync Timeout
Wallet sync takes 3-5 minutes on preprod. Must use appropriate timeout:
```typescript
const state = await Rx.firstValueFrom(
  wallet.state().pipe(
    Rx.filter((s) => s.isSynced),
    Rx.timeout({ first: 300000 })  // 5 minutes
  )
);
```

### 8. ✅ zkConfigProvider Variable Ordering
Must be defined BEFORE the providers object:
```typescript
const zkConfigProvider = new NodeZkConfigProvider(ZK_CONFIG_PATH);  // ← FIRST

const providers = {
  // ... use zkConfigProvider here
  zkConfigProvider,  // ← reference the same instance
};
```

---

## Deployment Output

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

## Common Errors We Fixed

| Error | Cause | Solution |
|-------|-------|----------|
| "expected instance of ZswapSecretKeys" | Incorrect key derivation API | Use `selectRole` + `deriveKeyAt` (singular) |
| "Timeout has occurred" with seen: 0 | Missing global WebSocket | Add `globalThis.WebSocket = WebSocket` |
| "submitTxCore is not a function" | Missing `midnightProvider` | Add `midnightProvider` to providers object |
| "Failed to clone intent" | Missing `signTransactionIntents` | Add the workaround function |
| "zkConfigProvider is not defined" | Variable ordering | Define `zkConfigProvider` before providers object |
| "Cannot read property 'toHexString' of undefined" | Wrong public key access | Get keys from wallet state after sync |

---

## Files Modified for Success

1. `/home/ubuntu/credvault-contract/package.json` - Exact versions
2. `/home/ubuntu/credvault-contract/deploy.ts` - Complete working deployment script
3. `/home/ubuntu/midnight-node-docker/proof-server.yml` - Version 7.0.0

---

## Reference Documentation

- Full working configuration: `CREDVAULT_MIDNIGHT_PREPROD_WORKING_CONFIG.md`
- Code patterns: `midnight-compact-smart-contract-blockchain-engineer.md`

---

**Milestone:** This is the FIRST successful smart contract deployment for the CredVault project on the Midnight network!

**Next Steps:**
- Deploy the actual transcript contract
- Test contract interactions
- Build the SOT Portal integration

---

Documented: 2026-03-15
Validated By: Successful deployment to preprod
