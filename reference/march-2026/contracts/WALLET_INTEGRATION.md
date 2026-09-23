# CredVault Wallet Integration Guide

This guide explains how the CredVault contract integrates with Midnight wallets for deployment and transaction signing.

## Overview

There are **two** ways to interact with the Midnight blockchain:

1. **Lace Browser Wallet** - For DApps and user interfaces (browser extension)
2. **Headless Wallet SDK** - For server-side deployment and CLI tools

This project uses the **Headless Wallet SDK** because it runs on a server (Preprod Server) without browser access.

---

## Architecture

### Three-Component Wallet

The Midnight Wallet SDK creates three specialized wallets from a single seed:

```
┌─────────────────────────────────────────────────────────┐
│                    WalletFacade                         │
│  (Coordinates between shielded, unshielded, and DUST)   │
└──────────────┬────────────────────┬─────────────────────┘
               │                    │
    ┌──────────▼────────┐  ┌────────▼─────────┐  ┌────────▼────────┐
    │  Shielded Wallet  │  │ Unshielded Wallet│  │   DUST Wallet   │
    │   (Private ZK)    │  │  (Public txs)    │  │   (Gas fees)    │
    └───────────────────┘  └──────────────────┘  └─────────────────┘
```

| Component | Purpose | Used For |
|-----------|---------|----------|
| **Shielded Wallet** | Private transactions using ZK proofs | Contract deployment, private circuits |
| **Unshielded Wallet** | Public transactions | tNight transfers, public state |
| **DUST Wallet** | Gas token for transaction fees | Paying for all transactions |

---

## Wallet Setup

### 1. Environment Configuration

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and add your wallet seed:

```bash
MIDNIGHT_WALLET_SEED=your128characterhexseedhere...
MIDNIGHT_NETWORK=preprod
```

### 2. Generate a New Wallet (if needed)

```bash
tsx wallet-setup.ts generate
```

This will output:
- A new 128-character hex seed
- Your wallet address
- Instructions for funding

⚠️ **CRITICAL:** Save the seed securely! It cannot be recovered if lost.

### 3. Check Wallet Status

```bash
# Show wallet address
tsx wallet-setup.ts info

# Check balances
export MIDNIGHT_WALLET_SEED=your-seed-here
tsx wallet-setup.ts balance
```

### 4. Fund Your Wallet

If you have no tNight balance:

1. Get your address: `tsx wallet-setup.ts info`
2. Visit https://faucet.preprod.midnight.network/
3. Enter your address and request tNight

DUST is generated automatically from tNight over time (usually within minutes).

---

## Deployment

### Prerequisites

- Wallet seed configured in environment
- DUST balance available (check with `tsx wallet-setup.ts balance`)
- Contract compiled: `npm run compile`
- Merkle tree built: `npm run build-tree`

### Deploy

```bash
# Deploy using environment variable for seed
export MIDNIGHT_WALLET_SEED=your-seed-here
tsx deploy.ts --network=preprod

# Or specify seed on command line
tsx deploy.ts \
  --network=preprod \
  --seed=your128characterhexseed \
  --merkleRoot=abc123... \
  --sotAttestation=def456...
```

### Expected Output

```
✅ Contract deployed successfully!

═══════════════════════════════════════════════════════════════
Contract Address: 0x1234567890abcdef...
Transaction Hash: 0xabcdef1234567890...
Network:          preprod
═══════════════════════════════════════════════════════════════

💾 Deployment saved to: deployments/deployment-1234567890.json
```

---

## Contract Invocation

### Verify GPA (ZK Proof)

```bash
tsx invoke.ts \
  --network=preprod \
  --contract=0x... \
  --circuit=verifyMinGPA \
  --minGpa=300 \
  --actualGpa=362
```

### Verify GPA Range

```bash
tsx invoke.ts \
  --network=preprod \
  --contract=0x... \
  --circuit=verifyGpaRange \
  --minRange=350 \
  --maxRange=400 \
  --actualGpa=362
```

### Verify Merkle Proof

```bash
tsx invoke.ts \
  --network=preprod \
  --contract=0x... \
  --circuit=verifyMerkleProof4 \
  --leafHash=abc123... \
  --siblings=sib1,sib2,sib3,sib4 \
  --isRight=true,false,true,false
```

### Read Contract State

```bash
tsx invoke.ts \
  --network=preprod \
  --contract=0x... \
  --circuit=getRoot
```

---

## Understanding the Code

### Key Files

| File | Purpose |
|------|---------|
| `deploy.ts` | Contract deployment with wallet SDK |
| `invoke.ts` | Circuit invocation with wallet SDK |
| `wallet-setup.ts` | Wallet generation and balance checking |
| `utils.ts` | Shared wallet and provider utilities |

### Wallet Creation Flow

```typescript
// 1. Derive keys from seed
const keys = deriveKeys(seed);

// 2. Create wallet components
const shieldedWallet = ShieldedWallet(config).startWithSecretKeys(shieldedKeys);
const unshieldedWallet = UnshieldedWallet(config).startWithPublicKey(publicKey);
const dustWallet = DustWallet(config).startWithSecretKey(dustKey);

// 3. Combine into facade
const wallet = new WalletFacade(shielded, unshielded, dust);
await wallet.start(shieldedKeys, dustKey);

// 4. Use for transactions
await wallet.submitTransaction(balancedTx);
```

### Provider Setup

```typescript
const providers = {
  privateStateProvider:    // Local state storage
  publicDataProvider:      // Indexer queries
  zkConfigProvider:        // ZK circuit configs
  proofProvider:           // Proof server
  walletProvider:          // Transaction signing
  midnightProvider:        // Network connection
};
```

---

## Troubleshooting

### "Invalid seed" Error

- Seed must be exactly 128 hexadecimal characters
- Check: `echo $MIDNIGHT_WALLET_SEED | wc -c` should show 129 (128 + newline)

### "Insufficient DUST" Error

- DUST is required for transaction fees
- Generate DUST by holding tNight (happens automatically)
- Check balance: `tsx wallet-setup.ts balance`
- Wait a few minutes after receiving tNight for DUST generation

### "Contract not compiled" Error

```bash
compactc --skip-zk transcript.compact .
```

### "Proof server connection" Error

Ensure proof server is running:
```bash
docker run -p 6300:6300 midnightntwrk/proof-server:7.0.0
```

---

## Security Best Practices

1. **Never commit seeds** - Add `.env` to `.gitignore`
2. **Use separate wallets** - Development vs production
3. **Secure your server** - Limit SSH access to Preprod Server
4. **Monitor balances** - Set up alerts for low DUST
5. **Backup seeds** - Store securely offline

---

## Lace vs Headless Wallet

| Feature | Lace (Browser) | Headless SDK (Server) |
|---------|----------------|----------------------|
| Best for | DApps, UI | CLI, automation |
| User approval | Required | Automated |
| Environment | Browser only | Node.js/server |
| Connection | `window.midnight.mnLace` | HD wallet from seed |
| Package | `@midnight-ntwrk/dapp-connector-api` | `@midnight-ntwrk/wallet` |

---

## Additional Resources

- [Midnight Wallet SDK Docs](https://docs.midnight.network/)
- [Midnight Network Faucet](https://faucet.preprod.midnight.network/)
- [Lace Wallet](https://www.lace.io/midnight) (for browser DApps)
