# CredVault Lace Wallet Integration Report

**Date:** March 13, 2026  
**Status:** ✅ COMPLETE - Ready for deployment

---

## 1. How Lace Wallet Integration Works

### Key Finding: Two Distinct Wallet Patterns

Midnight provides **two separate wallet integration approaches**:

| Pattern | Use Case | Environment | Package |
|---------|----------|-------------|---------|
| **Lace Browser Wallet** | DApps, user interfaces | Browser only | `@midnight-ntwrk/dapp-connector-api` |
| **Headless Wallet SDK** | Server deployment, CLI | Node.js/Server | `@midnight-ntwrk/wallet` |

### Important Discovery

**Lace wallet is a browser extension** that exposes `window.midnight?.mnLace`. It cannot be used in headless/server environments like the Preprod Server.

**For server-side deployment**, the correct approach is the **Wallet SDK** which creates a headless wallet from a hex seed using HD (Hierarchical Deterministic) wallet derivation.

### Wallet Architecture

The Wallet SDK creates a **three-component wallet**:

```
┌─────────────────────────────────────────────────────────┐
│                    WalletFacade                         │
├─────────────────────────────────────────────────────────┤
│  • Shielded Wallet  - Private ZK transactions           │
│  • Unshielded Wallet - Public transactions              │
│  • DUST Wallet      - Gas/fee payment                   │
└─────────────────────────────────────────────────────────┘
```

All three components are derived from a single 128-character hex seed (64 bytes).

---

## 2. Files Created/Updated

### New Files

| File | Purpose | Lines |
|------|---------|-------|
| `deploy.ts` | Contract deployment with Wallet SDK | 389 |
| `invoke.ts` | Circuit invocation with Wallet SDK | 448 |
| `wallet-setup.ts` | Wallet generation & balance checker | 242 |
| `package.json` | Complete dependency configuration | 48 |
| `tsconfig.json` | TypeScript configuration | 18 |
| `.env.example` | Environment variable template | 45 |
| `WALLET_INTEGRATION.md` | Comprehensive wallet guide | 293 |

### Updated Files

| File | Changes |
|------|---------|
| `CredVault_Midnight_Reference.md` | Added Wallet Integration section, updated changelog |

---

## 3. Wallet Configuration

### Environment Variable

```bash
export MIDNIGHT_WALLET_SEED="abcd1234..."  # 128 hex characters (64 bytes)
```

### Three-Wallet Derivation

```typescript
const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
const result = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);

// Keys for:
// - Roles.Zswap: Shielded wallet (private transactions)
// - Roles.NightExternal: Unshielded wallet (public transactions)  
// - Roles.Dust: DUST wallet (gas fees)
```

---

## 4. Usage Examples

### Generate New Wallet
```bash
tsx wallet-setup.ts generate
```

### Check Balance
```bash
export MIDNIGHT_WALLET_SEED=your-seed-here
tsx wallet-setup.ts balance
```

### Deploy Contract
```bash
export MIDNIGHT_WALLET_SEED=your-seed-here
tsx deploy.ts --network=preprod --merkleRoot=abc123... --sotAttestation=def456...
```

### Invoke Circuit
```bash
tsx invoke.ts \
  --network=preprod \
  --contract=0x... \
  --circuit=verifyMinGPA \
  --minGpa=300 \
  --actualGpa=362
```

---

## 5. Dependencies Added

### Wallet SDK Packages
```json
{
  "@midnight-ntwrk/wallet": "^3.7.0",
  "@midnight-ntwrk/wallet-sdk-hd": "^3.0.0",
  "@midnight-ntwrk/wallet-sdk-facade": "^1.0.0",
  "@midnight-ntwrk/wallet-sdk-dust-wallet": "^1.0.0",
  "@midnight-ntwrk/wallet-sdk-shielded": "^1.0.0",
  "@midnight-ntwrk/wallet-sdk-unshielded-wallet": "^1.0.0"
}
```

### Other Required Packages
```json
{
  "@midnight-ntwrk/midnight-js-contracts": "^3.0.0",
  "@midnight-ntwrk/midnight-js-http-client-proof-provider": "^3.0.0",
  "@midnight-ntwrk/midnight-js-indexer-public-data-provider": "^3.0.0",
  "@midnight-ntwrk/ledger": "^4.0.0",
  "rxjs": "^7.8.0",
  "ws": "^8.19.0"
}
```

---

## 6. Issues & Limitations Discovered

### ✅ Resolved

1. **Lace wallet not available server-side**
   - **Solution:** Use `@midnight-ntwrk/wallet` SDK for headless deployment
   - Wallet is derived from seed using HD wallet derivation

2. **DUST required for fees**
   - DUST is automatically used for transaction fees
   - Generated from tNight holdings over time
   - Preprod Server has 2.4452K DUST confirmed

3. **Three-wallet architecture complexity**
   - Solved with `WalletFacade` that coordinates all three wallet types
   - Single seed derives all keys

### ⚠️ Known Limitations

1. **Browser vs Server distinction**
   - Lace wallet only works in browsers with extension
   - Headless SDK cannot use browser extensions
   - Must choose based on deployment environment

2. **Seed security**
   - 128-character hex seed must be kept secure
   - Recommended: Environment variable, never committed

3. **DUST generation delay**
   - After receiving tNight, DUST generation takes several minutes
   - Cannot deploy until DUST is available

4. **Network synchronization**
   - Wallet must sync with network before use (~5-10 seconds)
   - Script handles this automatically with `Rx.firstValueFrom()`

---

## 7. Ready Status for Deployment

### ✅ Ready Checklist

| Component | Status | Notes |
|-----------|--------|-------|
| Wallet SDK integration | ✅ Ready | Headless wallet with seed derivation |
| DUST availability | ✅ Ready | 2.4452K DUST on Preprod Server |
| Network connection | ✅ Ready | Preprod network configured |
| Contract compilation | ✅ Ready | `compactc` available |
| Deployment script | ✅ Ready | `deploy.ts` implemented |
| Invocation script | ✅ Ready | `invoke.ts` implemented |
| Balance checker | ✅ Ready | `wallet-setup.ts` implemented |

### Deployment Command

```bash
# On Preprod Server (13.223.121.120)
cd /home/ubuntu/credvault-contract

# Install dependencies
npm install

# Set wallet seed
export MIDNIGHT_WALLET_SEED=your-128-char-hex-seed

# Build Merkle tree (if not done)
npm run build-tree

# Deploy contract
npm run deploy -- --network=preprod
```

### Expected Result

```
✅ Contract deployed successfully!

═══════════════════════════════════════════════════════════════
Contract Address: 0x...
Transaction Hash: 0x...
Network:          preprod
═══════════════════════════════════════════════════════════════
```

---

## 8. Migration from Browser Lace to Server SDK

### What Changed

| Aspect | Before (Browser) | After (Server) |
|--------|------------------|----------------|
| Wallet access | `window.midnight.mnLace` | HD derivation from seed |
| User approval | Manual browser popup | Automated |
| Connection | Extension API | Wallet SDK providers |
| Configuration | Browser prompt | Environment variable |

### Why This Approach

The Preprod Server is a headless Linux server without a browser. The Lace wallet requires a browser environment with the extension installed. The Wallet SDK is the official Midnight solution for server-side and CLI deployments.

---

## Summary

The CredVault contract is **ready for deployment** using the headless Wallet SDK. The integration:

1. ✅ Uses official `@midnight-ntwrk/wallet` SDK
2. ✅ Supports all three wallet types (Shielded, Unshielded, DUST)
3. ✅ Automatically pays DUST for transaction fees
4. ✅ Configurable via environment variables
5. ✅ Includes helper scripts for wallet management
6. ✅ Fully documented with usage examples

**Next Step:** Configure the wallet seed on the Preprod Server and run `npm run deploy`.
