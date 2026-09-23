# Wallet SDK v2.0.0 Upgrade Report

## Executive Summary

**Status: FAILED** - wallet-sdk v2.0.0 does not sync with preprod indexer.

While the v2.0.0 packages install without conflicts and the wallet initializes successfully, the wallet never reaches `isSynced: true` state, preventing any contract deployments.

## Packages Upgraded

| Package | Old Version | New Version |
|---------|-------------|-------------|
| @midnight-ntwrk/wallet-sdk-shielded | 1.0.0 | 2.0.0 |
| @midnight-ntwrk/wallet-sdk-facade | 1.0.0 | 2.0.0 |
| @midnight-ntwrk/wallet-sdk-dust-wallet | 1.0.0 | 2.0.0 |
| @midnight-ntwrk/wallet-sdk-hd | 1.0.0 | 2.0.0 |
| @midnight-ntwrk/wallet-sdk-unshielded-wallet | 1.0.0 | 2.0.0 |
| @midnight-ntwrk/wallet-sdk-address-format | 1.0.0 | 3.0.1 (transitive) |

## Breaking Changes Encountered

### 1. HD Wallet Key Derivation API
**v1.0.0:**
```typescript
const result = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);
```

**v2.0.0:**
```typescript
// Must call selectRole for each role individually
const zswapResult = account.selectRole(Roles.Zswap).deriveKeyAt(0);
const nightResult = account.selectRole(Roles.NightExternal).deriveKeyAt(0);
const dustResult = account.selectRole(Roles.Dust).deriveKeyAt(0);
```

### 2. WalletFacade Initialization
**v1.0.0:**
```typescript
const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
await wallet.start(shieldedSecretKeys, dustSecretKey);
```

**v2.0.0:**
```typescript
const wallet = await WalletFacade.init({
  configuration: walletConfig,
  shielded: (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
  unshielded: (config) => UnshieldedWallet({...}).startWithPublicKey(...),
  dust: (config) => DustWallet({...}).startWithSecretKey(...),
});
```

### 3. HDWallet.clear() Removed
**v1.0.0:**
```typescript
hdWallet.hdWallet.clear();
```

**v2.0.0:** Method removed (no replacement)

## Sync Test Results

The test creates a wallet successfully with the following state structure:
```json
{
  "isSynced": false,
  "shielded": { "protocolVersion": ..., "state": ..., "capabilities": ... },
  "unshielded": { "protocolVersion": ..., "state": ..., "capabilities": ... },
  "dust": { "protocolVersion": ..., "state": ..., "capabilities": ... },
  "pending": { ... }
}
```

However, `isSynced` never becomes `true` even after 120+ seconds.

## Root Cause Analysis

The wallet-sdk v2.0.0 appears to have compatibility issues with:
1. The current preprod indexer (https://indexer.preprod.midnight.network)
2. The current midnight-js packages (v3.1.0)
3. Network configuration format

The indexer is reachable (HTTP 405 on GET, which is expected for GraphQL), but the wallet never completes sync.

## Recommended Next Steps

### Option 1: Downgrade to v1.0.0 with Patch
Instead of upgrading to v2.0.0, patch the v1.0.0 pendingOutputs issue:
- The error `state.pendingOutputs.values.map is not a function` suggests a data structure mismatch
- Could be fixed by normalizing the pendingOutputs data before access

### Option 2: Update All Midnight Packages
Try upgrading all @midnight-ntwrk/* packages to their latest compatible versions:
- midnight-js-* packages may need to be upgraded beyond v3.1.0
- Check for v4.x or newer versions

### Option 3: Wait for Official Migration Guide
Contact Midnight team for:
- Official v1.0.0 to v2.0.0 migration guide
- Compatible package version matrix
- Preprod network requirements for v2.0.0

### Option 4: Use Raw Indexer API
Bypass the wallet SDK sync and use direct indexer queries:
- Use `@midnight-ntwrk/wallet-sdk-indexer-client` directly
- Query UTXOs and transactions manually
- Construct transactions without wallet state sync

## Files Modified

1. `/home/ubuntu/credvault-contract/package.json` - Updated wallet-sdk dependencies
2. `/home/ubuntu/credvault-contract/test-sync-v2.ts` - Test script for v2.0.0 (compatible with new API)

## Conclusion

Wallet SDK v2.0.0 introduces significant API changes and appears incompatible with the current preprod network configuration. The wallet initializes but cannot sync, blocking all contract deployments.

**Recommendation:** Attempt Option 1 (patch v1.0.0) or Option 2 (upgrade all packages) before proceeding.
