# Midnight Wallet-SDK Compatibility Issues Research Report

## Executive Summary

This research investigates wallet-sdk compatibility issues with Midnight preprod, specifically focusing on:
- The `pendingOutputs` error experienced by developers
- Version alignment issues between packages
- Phantom balance bugs
- Indexer synchronization problems

**Key Finding**: Most issues stem from version misalignment between wallet-sdk 1.0.0/2.0.0 and other packages. The Midnight team released major updates in February-March 2026 that introduced breaking changes.

---

## 1. What Other Developers Are Experiencing

### Primary Issues Documented

#### Issue A: Phantom Balance After Burns (GitHub Issue #610)
**Source**: https://github.com/midnightntwrk/midnight-js/issues/610
- **Symptom**: After burning shielded tokens, wallet reports phantom balance that reappears ~20 seconds later
- **Error**: "Failed to prove transaction" when attempting to spend phantom coins
- **Root Cause**: Indexer sync replays transaction and re-adds burned coins to available balance without accounting for the burn
- **Environment**: Preprod, wallet-sdk-shielded 1.0.0, wallet-sdk-facade 1.0.0, midnight-js 3.0.0
- **Status**: Open issue, no official fix yet
- **Workaround**: None reliable - phantom coins are unspendable

#### Issue B: SPA Fallback HTML Treated as Valid Key Material (GitHub Issue #536)
**Source**: https://github.com/midnightntwrk/midnight-js/issues/536
- **Symptom**: Proof generation fails with cryptic errors when ZK artifacts are missing
- **Root Cause**: `FetchZkConfigProvider.sendRequest()` accepts any 200 response, including HTML fallback pages from SPA dev servers
- **Affected Package**: `@midnight-ntwrk/midnight-js-fetch-zk-config-provider@3.0.0`
- **Workaround**: Wrap fetch to reject HTML responses:
```typescript
const safeFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const contentType = response.headers.get('content-type') || '';
  if (response.ok && contentType.includes('text/html')) {
    return new Response(null, { status: 404, statusText: 'SPA fallback detected' });
  }
  return response;
};
const provider = new FetchZkConfigProvider(baseURL, safeFetch);
```

#### Issue C: Pending Coins Not Cleared on Transaction Failure (Wallet SDK 1.0.0)
**Source**: https://github.com/midnightntwrk/midnight-wallet/blob/main/RELEASE_NOTES.md
- **Symptom**: When transaction submission or proof generation fails, coins marked as pending are not automatically released
- **Impact**: Wallet reports lower available balances until restart or re-sync
- **Workaround**: Restart the wallet or re-sync to clear stale pending state
- **Fix Status**: Partially addressed in Wallet SDK 2.0.0 with new `PendingTransactionsService`

#### Issue D: getKeyMaterial Silently Swallows Errors (GitHub Issue #603)
**Source**: https://github.com/midnightntwrk/midnight-js/issues/603
- **Symptom**: Proof failures become undiagnosable - no indication which circuit's key material failed to load
- **Root Cause**: `getKeyMaterial()` returns `undefined` on any error without logging
- **Workaround**: None available at SDK level - requires SDK fix

---

## 2. Official Responses from Midnight Team

### Compatibility Matrix (Official Documentation)
**Source**: https://docs.midnight.network/relnotes/overview

| Component | Preprod Version | Preview Version |
|-----------|----------------|-----------------|
| Ledger | 7.0.0 | 8.0.0 |
| Node | 0.21.0 | 0.22.0 |
| Proof Server | 7.0.0 | 7.0.0 |
| Compact Compiler | 0.29.0 | 0.30.0 |
| Indexer | 3.1.0 | 4.0.0 |
| **Wallet SDK** | **1.0.0** | **2.0.0** |
| **Midnight.js** | **3.1.0** | **3.2.0** |
| Compact JS | 2.4.0 | 2.5.0 |

**⚠️ CRITICAL WARNING**: There is a breaking change on Preprod in the Indexer that requires a reset for FNOs running their own indexer.

### Official Preprod Launch Announcement
**Source**: https://forum.midnight.network/t/preprod-is-live-updated-packages-examples-tooling/1040
- Preprod launched with updated packages 3 weeks ago (approx Feb 2026)
- Core packages: midnight-js 3.0.0, wallet-sdk 1.0.0, Compact 0.29.0, Proof Server 7.0.0
- Updated examples: Counter and Bulletin Board DApps fully updated for preprod

### Recommended Support Channel
**Source**: https://midnight.network/blog/state-of-the-network-february-2026
> "If you encounter issues during migration, reach out in the #dev-chat channel on Discord. When asking for help, include your Compact version, the network you are using, and the specific error message to receive a faster response."

---

## 3. Workarounds That Have Worked for Others

### Workaround 1: Package Version Alignment
Ensure strict version alignment per the compatibility matrix:
```json
{
  "dependencies": {
    "@midnight-ntwrk/wallet-sdk-facade": "1.0.0",
    "@midnight-ntwrk/wallet-sdk-shielded": "1.0.0",
    "@midnight-ntwrk/wallet-sdk-unshielded-wallet": "1.0.0",
    "@midnight-ntwrk/wallet-sdk-dust-wallet": "1.0.0",
    "@midnight-ntwrk/midnight-js-contracts": "3.0.0",
    "@midnight-ntwrk/midnight-js-indexer-public-data-provider": "3.0.0",
    "@midnight-ntwrk/compact-runtime": "0.14.0",
    "@midnight-ntwrk/ledger": "^4.0.0"
  }
}
```

### Workaround 2: Wallet Restart on Pending Coin Issues
When experiencing stuck pending states:
```typescript
// Stop and restart wallet to clear stale pending state
await wallet.stop();
// Re-create wallet with same seed
const walletCtx = await createWallet(seed);
```

### Workaround 3: Custom Fetch for ZK Config Provider
See Issue B workaround above for preventing HTML fallback issues.

### Workaround 4: Use Updated Examples as Templates
- Counter example: https://github.com/midnightntwrk/example-counter (updated for preprod)
- Bulletin Board example: https://github.com/midnightntwrk/example-bboard (updated for preprod)
- Both ship with ready-to-run Preprod configurations

### Workaround 5: Upgrade to Wallet SDK 2.0.0 (Preview Only)
**Note**: Only works on Preview environment, NOT Preprod
- Wallet SDK 2.0.0 includes `PendingTransactionsService` that auto-reverts failed transactions
- Includes standalone `ProvingService` and `SubmissionService`
- Breaking API changes: `WalletFacade.init()` static async initializer required

---

## 4. Recommended Approach Based on Community Consensus

### For Preprod Development (Current):
1. **Use Wallet SDK 1.0.0** - 2.0.0 is NOT compatible with Preprod
2. **Pin exact versions** - Use `1.0.0` not `^1.0.0`
3. **Restart wallet on failures** - Only reliable way to clear pending state
4. **Verify indexer endpoints** - Use v3 GraphQL endpoints:
   - HTTP: `https://indexer.preprod.midnight.network/api/v3/graphql`
   - WS: `wss://indexer.preprod.midnight.network/api/v3/graphql/ws`
5. **Start with official examples** - Clone and modify rather than starting from scratch

### Migration Path to Preview (For Testing):
If you need Wallet SDK 2.0.0 features:
1. Switch to Preview environment
2. Update all packages to Preview versions (see matrix above)
3. Migrate to new WalletFacade initialization pattern
4. Update contract compilation with Compact 0.30.0

### Best Practices from Successful Deployments:
- Always check `state.isSynced` before operations
- Use `waitForSyncedState` for reliable balance checks
- Implement transaction retry logic with exponential backoff
- Monitor the #dev-chat Discord channel for real-time updates

---

## 5. Relevant Resources and Links

### Official Resources:
- **Compatibility Matrix**: https://docs.midnight.network/relnotes/overview
- **Preprod Deployment Guide**: https://docs.midnight.network/guides/deploy-mn-app
- **Wallet SDK Release Notes**: https://github.com/midnightntwrk/midnight-wallet/blob/main/RELEASE_NOTES.md
- **State of Network (Feb 2026)**: https://midnight.network/blog/state-of-the-network-february-2026

### GitHub Issues:
- Phantom Balance Bug (#610): https://github.com/midnightntwrk/midnight-js/issues/610
- HTML Fallback Issue (#536): https://github.com/midnightntwrk/midnight-js/issues/536
- Silent Error Swallowing (#603): https://github.com/midnightntwrk/midnight-js/issues/603
- Historical Contract State (#251): https://github.com/midnightntwrk/midnight-js/issues/251

### Example Repositories:
- Counter: https://github.com/midnightntwrk/example-counter
- Bulletin Board: https://github.com/midnightntwrk/example-bboard

### Community Support:
- **Discord**: #dev-chat channel (primary support)
- **Forum**: https://forum.midnight.network

### NPM Packages:
- Wallet SDK Facade: https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-facade
- Midnight.js: https://www.npmjs.com/package/@midnight-ntwrk/midnight-js

---

## Key Gaps in Information

1. **No Stack Overflow presence** - Very few questions/answers about Midnight development
2. **Limited Reddit activity** - Most discussions are about token claims, not development
3. **Discord content inaccessible** - Real-time troubleshooting happens there but isn't indexed
4. **No official migration guide** from 0.x/older versions to 1.0.0/2.0.0
5. **PendingOutputs error** - The specific error "state.pendingOutputs.values.map is not a function" was not found in public sources, suggesting it may be:
   - A new/undocumented issue
   - Related to version mismatch between wallet-sdk-shielded and other packages
   - A local development environment issue

---

## Confidence Assessment

| Claim | Confidence | Source |
|-------|------------|--------|
| Wallet SDK 1.0.0 required for Preprod | [verified] | Official docs |
| Wallet SDK 2.0.0 has breaking changes | [verified] | Release notes |
| Phantom balance bug exists | [verified] | GitHub issue #610 |
| Pending coins not cleared on failure | [verified] | Release notes |
| Specific pendingOutputs.map error | [unverified] | Not found in public sources |

---

*Report compiled: 2026-03-14*
*Sources: GitHub, Midnight Docs, Midnight Forum, NPM*
