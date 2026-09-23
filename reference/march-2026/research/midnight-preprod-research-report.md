# Midnight Network Preprod Limitations - Comprehensive Research Report

**Research Date:** March 9, 2026  
**Purpose:** Medical credentialing platform (CredVault) planning to use Midnight for credential verification with privacy-preserving ZK proofs  
**Researcher:** Research Scout 🔍

---

## 1. PREPROD NETWORK LIMITATIONS

### Testnet-02 to Preprod Migration Overview

Midnight has transitioned from **Testnet-02** to **Preprod** as the primary testing environment. This transition involves significant changes [verified]:

| Phase | Status | Timeline |
|-------|--------|----------|
| Testnet-02 | Deprecated | Validators could run until February 28, 2026 |
| Preview | Active | Maintained by core engineering for rapid iterations |
| Preprod | **Current Primary** | Live and stable |

Source: https://docs.midnight.network/blog/testnet-02-transition

### Key Differences: Testnet-02 vs Preprod

**What Changed:**
- **Ledger Upgrade:** Preprod runs **Ledger 7.0** (major runtime upgrade) [verified]
- **Proving System:** Transition from Pluto-Eris to **BLS12-381** proving system [verified]
- **Package Alignment:** Core packages updated to preprod-compatible versions:
  - `midnight-js` 3.0.0
  - `wallet-sdk` 1.0.0
  - `Compact` compiler 0.28.0-0.29.0
  - `Proof Server` 7.0.0

Source: https://forum.midnight.network/t/preprod-is-live-updated-packages-examples-tooling/1040

### Features Available on Preprod

✅ **Working Features:**
- Smart contract deployment and interaction
- Shielded transactions via ZK proofs
- DUST generation and fee payments
- Wallet SDK operations
- Local proof server support
- Contract state management
- GraphQL indexer API (v3)

Source: https://docs.midnight.network/getting-started/hello-world

### Shielded Address Limitations on Preprod

⚠️ **Important Limitations:**

1. **No Native DUST Generation from Real NIGHT:** On preprod, DUST is obtained via faucet, not generated from NIGHT holdings (since NIGHT on preprod is test tokens) [verified]

2. **Registration Table Dependency:** Dust addresses must be registered and linked to Night addresses via the Registration Table [verified]

3. **Cross-chain DUST Generation NOT Available:** The full DUST generation flow from Cardano NIGHT token requires mainnet Cardano integration, which is not available on preprod [verified]

Source: https://docs.midnight.network/blog/dust-architecture

### Disabled/Experimental Features

⚠️ **Not Available on Preprod:**
- DUST Capacity Exchange (still in development) [verified]
- Decentralized validator set (preprod uses federated setup) [verified]
- Full cross-chain bridging from Cardano mainnet [estimated]

Source: https://docs.midnight.network/blog/testnet-02-transition

---

## 2. ADDRESS SYSTEM DEEP DIVE

### Address Types Overview

Midnight uses a **three-component wallet system** [verified]:

| Component | Address Type | Purpose | Visibility |
|-----------|-------------|---------|------------|
| **Shielded (ZSwap)** | Shielded Address | Private transactions, ZK operations | Private |
| **Unshielded** | Unshielded Address | Public token holdings (NIGHT) | Public |
| **DUST** | DUST Address | Transaction fees, gas | Shielded |

Source: https://docs.midnight.network/guides/deploy-mn-app

### Address Format Specifications

**Unshielded Address Format:**
- Format: **Bech32m** encoded
- Example prefix: `mn_addr_test1...` (testnet) / `mn_addr_preprod1...` (preprod)
- Used for: NIGHT token holdings, public balances

**Shielded Address Format:**
- Format: Shielded ZSwap addresses
- Example prefix: `mn_shield-addr_preprod1...`
- Used for: Private transaction outputs, ZK contract interactions

**DUST Address:**
- Format: Shielded, non-transferable resource
- Derived from: Linked Night UTXO via Registration Table
- Used for: Gas fees only

Source: https://docs.midnight.network/api-reference/midnight-indexer

### Generating Addresses

**Via Lace Wallet:**
```
1. Install Lace Midnight Preview wallet (Chrome extension)
2. Create new wallet or restore from seed
3. Select network: Preprod
4. Wallet automatically generates:
   - Shielded address (for private transactions)
   - Unshielded address (for NIGHT/test tokens)
   - DUST address (for fees)
```

Source: https://docs.midnight.network/guides/lace-wallet

**Via SDK (Code Example):**
```typescript
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';

// Generate seed
const seed = generateRandomSeed();

// Derive keys for all three wallet components
const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
const keys = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);
```

Source: https://docs.midnight.network/guides/deploy-mn-app

### Which Address Type for What Purpose?

| Use Case | Address Type | Why |
|----------|-------------|-----|
| Receiving test NIGHT tokens | **Unshielded** | Faucet sends to unshielded address |
| Deploying smart contracts | **All three** | Deployment requires DUST fees |
| Private credential verification | **Shielded** | ZK proofs keep data private |
| Checking token balances | **Unshielded** | Public ledger data |
| Paying transaction fees | **DUST** | Automatically used for gas |

---

## 3. DUST TOKEN (TRANSACTION FEES)

### What is DUST?

DUST is a **shielded, non-transferable resource** used exclusively for:
- Transaction fees (gas)
- Smart contract execution
- ZK proof verification costs

**Key Properties:** [verified]
- Shielded (private)
- Non-transferable between users
- Generated by holding NIGHT
- Decays over time after NIGHT is spent
- Maximum capacity: 5 DUST per 1 NIGHT held

Source: https://midnight.network/night

### DUST Generation Mechanism

**On Mainnet (for reference):**
- **Generation Rate:** 8,267 Specks per Star per second [verified]
- **Units:** 
  - 1 NIGHT = 10^6 Stars
  - 1 DUST = 10^15 Specks
- **Time to Cap:** Approximately 1 week
- **Ratio:** 5 DUST per NIGHT (5_000_000_000 ratio)

Source: https://docs.midnight.network/api-reference/midnight-indexer

### Obtaining DUST on Preprod

**Via Faucet (tDUST):**

1. **Get test NIGHT from faucet:**
   - URL: https://faucet.preprod.midnight.network/
   - Paste your **unshielded** address
   - Request tokens

2. **Generate tDUST:**
   ```
   In Lace wallet:
   1. Click "Generate tDUST"
   2. Select your wallet address
   3. Click "Review transaction"
   4. Click "Confirm"
   ```

Source: https://docs.midnight.network/guides/lace-wallet

**Faucet Limits:**
- tDUST has no real-world value
- Testnet-only resource
- No documented hard limits (generous for testing)

Source: https://midnight.network/test-faucet

### Transaction Fee Structure

**Fee Characteristics:** [verified]
- **Dynamic fees:** Adjusted based on network usage and capacity demand
- **Paid only in DUST:** No NIGHT-denominated fees
- **Shielded payments:** Fee transactions don't expose user metadata

Source: https://www.midnight.gd/faq

**Typical Deployment Costs:**
- Contract deployment: Requires sufficient DUST balance
- First deployment often fails with "Not enough Dust generated" error
- Solution: Wait for DUST generation or request more from faucet

Source: https://docs.midnight.network/getting-started/hello-world

### Checking DUST Balance

**Via Lace Wallet:**
- Dashboard shows tDUST balance after generation

**Via Indexer API (GraphQL):**
```graphql
query {
  dustGenerationStatus(
    cardanoRewardAddresses: ["stake_test1uqtgpdz0chm6jnxx7erfd7rhqfud7t4ajazx8es8xk8x3ts06psdv"]
  ) {
    cardanoRewardAddress
    dustAddress
    registered
    nightBalance
    generationRate
    currentCapacity
  }
}
```

Source: https://docs.midnight.network/api-reference/midnight-indexer

---

## 4. LACE WALLET ISSUES

### Known Issues

**1. Browser Compatibility** [verified]
- **Chrome ONLY:** Full support only on Google Chrome
- **Chrome Derivatives Issues:** Brave, Edge may have connection problems with local proof server
- **Workaround for Brave:** Disable Brave shields when running DApps

Source: https://docs.midnight.network/guides/lace-wallet

**2. Wallet Syncing Issues** [verified]
- Symptom: "Wallet syncing (0%)" stuck
- Affects: Preview network connections
- Reported on: Chrome 142, macOS 15.5

Source: https://forum.midnight.network/t/lace-midnight-preview-wallet-doesnt-sync/662

**3. Hardware Wallet (Ledger) Incompatibility** [verified] ⚠️ **CRITICAL**
- **Ledger + Lace does NOT work** for signing
- Issue: "Lace wallet signature hash is too big for Ledger"
- Affects: NIGHT claims, transactions

**Workaround:**
- Use Yoroi wallet instead of Lace for Ledger
- Or restore hardware wallet to Yoroi extension

Source: https://www.reddit.com/r/Midnight/comments/1mj9x8q/night_claim_confusion_in_lace/

**4. Connection Issues to Local Proof Server** [verified]
- Symptom: "We could not connect" errors
- Often happens after signature approval
- May require page refresh after installing/enabling extension

Source: https://forum.midnight.network/t/lace-wallet-connection-jamminceo/581

### Configuration Requirements

**For Preprod Network:**
```
Settings > Midnight:
- Network: Preprod
- Proof Server: Local (http://localhost:6300) OR Remote
```

**Prerequisites:**
- Google Chrome browser (not derivatives)
- Docker Desktop running (for local proof server)
- Proof server running on port 6300

Source: https://docs.midnight.network/getting-started/installation

### Alternative Wallets

| Wallet | Preprod Support | Hardware Wallet | Notes |
|--------|----------------|-----------------|-------|
| **Lace** | ✅ Yes | ❌ Ledger incompatible | Primary recommended wallet |
| **Yoroi** | ✅ Yes | ✅ Ledger compatible | Use for hardware wallet needs |
| **CLI Wallet** | ✅ Yes | N/A | For programmatic interactions |

Source: https://docs.midnight.network/guides/lace-wallet

---

## 5. SMART CONTRACT DEPLOYMENT

### Requirements for Preprod Deployment

**1. Development Environment:**
- Node.js v22+
- Docker Desktop
- Google Chrome
- Visual Studio Code (recommended)

**2. Core Tools:**
```bash
# Compact compiler
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

# Proof server (Docker)
docker run -p 6300:6300 midnightntwrk/proof-server:7.0.0 -- midnight-proof-server -v
```

Source: https://docs.midnight.network/getting-started/installation

### Package Versions (Preprod Compatible)

**Required Package Versions:** [verified]
```json
{
  "dependencies": {
    "@midnight-ntwrk/compact-runtime": "0.14.0",
    "@midnight-ntwrk/ledger": "^4.0.0",
    "@midnight-ntwrk/midnight-js-contracts": "3.0.0",
    "@midnight-ntwrk/midnight-js-http-client-proof-provider": "3.0.0",
    "@midnight-ntwrk/midnight-js-indexer-public-data-provider": "3.0.0",
    "@midnight-ntwrk/midnight-js-network-id": "3.0.0",
    "@midnight-ntwrk/wallet-sdk-facade": "1.0.0",
    "@midnight-ntwrk/wallet-sdk-dust-wallet": "1.0.0"
  }
}
```

Source: https://forum.midnight.network/t/preprod-is-live-updated-packages-examples-tooling/1040

### Proof Server Setup

**Local Proof Server:**
```bash
# Run proof server
docker run -p 6300:6300 midnightntwrk/proof-server:7.0.0 -- midnight-proof-server -v

# Verify running
curl http://localhost:6300/health
```

**Configuration in Lace:**
```
Settings > Midnight > Proof Server:
- Select "Local (http://localhost:6300)"
```

Source: https://docs.midnight.network/getting-started/installation

### Compact Compiler Compatibility

**Current Preprod Version:** 0.28.0 - 0.29.0

**Language Version in Contracts:**
```compact
pragma language_version 0.21;

export ledger message: Opaque<"string">;

export circuit storeMessage(newMessage: Opaque<"string">): [] {
  message = disclose(newMessage);
}
```

Source: https://docs.midnight.network/getting-started/hello-world

### Deployment Costs (DUST)

**Cost Factors:**
- Contract deployment: Moderate DUST cost
- Contract calls: Lower DUST cost
- Failed deployments: Still consume DUST (for attempted transaction)

**First Deployment Issue:**
```
Error: Wallet.Transacting: Not enough Dust generated to pay the fee
```

**Solution:**
1. Request tDUST from faucet
2. Generate tDUST in wallet
3. Wait for DUST to be available
4. Retry deployment

Source: https://docs.midnight.network/getting-started/hello-world

### Preprod Network Configuration

**Network Endpoints:**
```typescript
export const CONFIG = {
  indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
};

setNetworkId('preprod');
```

Source: https://docs.midnight.network/guides/deploy-mn-app

### Deployment Script Example

```typescript
// deploy.ts
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

// Set to preprod
setNetworkId('preprod');

// Deploy contract
const deployment = await deployContract(
  providers,
  compiledContract,
  'hello-world'
);
```

Source: https://docs.midnight.network/guides/deploy-mn-app

---

## GAPS AND UNCERTAINTIES

### Information Not Found:

1. **Specific DUST costs** for common operations (exact fee schedule not documented)
2. **Faucet rate limits** - no explicit limits documented, appears generous
3. **Preprod network uptime SLAs** - federated network, no SLA guarantees
4. **Contract size limits** - maximum contract size not documented
5. **Exact transaction throughput** - TPS figures not found in documentation

### Conflicting Information:

1. **Ledger compatibility:** Documentation suggests some compatibility but community reports significant issues
2. **Testnet-02 deprecation timeline:** Multiple dates mentioned (Feb 28, 2026 vs ongoing migration)

---

## SUMMARY FOR CREDVAULT

### Recommended Approach for Medical Credentialing:

✅ **Preprod is Suitable For:**
- Prototype development
- Testing ZK proof logic for credential verification
- Smart contract development
- Integration testing

⚠️ **Considerations:**
1. Use **CLI wallet** for automated testing (more reliable than Lace)
2. Ensure sufficient **tDUST** before deployment attempts
3. Use **Yoroi** instead of Lace if hardware wallet needed
4. Run **local proof server** for development

🔗 **Key Resources:**
- Docs: https://docs.midnight.network/
- Faucet: https://faucet.preprod.midnight.network/
- Explorer: https://preprod.midnightexplorer.com
- Forum: https://forum.midnight.network/
- GitHub: https://github.com/midnightntwrk

---

**Report Confidence:** High for verified items, Medium for estimated items

**Sources Used:**
- Official Midnight Documentation
- Midnight Network Forum posts
- GitHub repositories
- Midnight Blog posts
- Community reports (Reddit)
