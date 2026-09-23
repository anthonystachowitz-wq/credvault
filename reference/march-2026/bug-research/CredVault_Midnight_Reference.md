# CredVault Midnight Smart Contract Reference

> **Purpose:** Living document for Midnight blockchain development - what works, what doesn't, and open questions.
> 
> **Last Updated:** March 13, 2026
> **Compact Version:** 0.29.0
> 
> ## Server Naming Convention (CRITICAL)
> 
> | Name | IP Address | Purpose |
> |------|------------|---------|
> | **Test Server** | `52.90.215.141` | Compact development, contract testing, local node |
> | **Preprod Server** | `13.223.121.120` | Web apps, API, SOT server, production-like testing |
> 
> **Always use these exact names** — "test server" = 52.90.215.141, "preprod server" = 13.223.121.120

## Wallet Status (DO NOT FORGET)

**Lace Wallet**: ✅ Already configured on Preprod Server (13.223.121.120)
- **Network**: Midnight Preprod
- **DUST Balance**: 2.4452K DUST (confirmed)
- **Status**: Ready for deployment
- **DO NOT ask about wallet setup** — it is already done

## CredVault DSL (Schema Parser)

**Location:** `~/.openclaw/workspace/dsl/`

**Purpose:** Allow SOTs to define credential schemas that automatically generate Midnight Compact smart contracts

**Components:**
- `types.ts` — TypeScript interfaces for schema definitions
- `schema-parser.ts` — Parses JSON/YAML schemas into AST
- `validator.ts` — Schema validation and error handling
- `index.ts` — Main entry point

**Status:** Parser and validator complete. **Missing:** Compact code generator (needs to be built)

**Example Schema:**
```json
{
  "sot_type": "university",
  "credential_name": "transcript",
  "fields": [
    { "name": "gpa", "type": "uint", "scale": 100, "verifiable": true, "proofs": [{"type": "range", "min": 0, "max": 400}] }
  ]
}
```

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Working Patterns](#working-patterns)
3. [What Works](#what-works)
4. [What Doesn't Work (Yet)](#what-doesnt-work-yet)
5. [Open Questions](#open-questions)
6. [Compact Language Reference](#compact-language-reference)
7. [Common Errors & Solutions](#common-errors--solutions)
8. [Test Patterns](#test-patterns)
9. [Resources](#resources)

---

## Getting Started

### Installation on Test Server

```bash
# Compact compiler location
/usr/local/bin/compactc
/usr/local/bin/compactc.bin

# Compile a contract
compactc --skip-zk transcript.compact .

# Run tests
npm test
```

### Installation on Preprod Server

```bash
# Compact compiler location
~/.compact/bin/compactc
~/.compact/bin/compactc.bin

# Environment setup
export PATH="$HOME/.compact/bin:$PATH"

# Compile a contract
compactc --skip-zk transcript.compact .
# Or use npm script:
npm run compile

# Run tests
npm test

# Build Merkle tree
npm run build-tree

# Deploy contract (requires wallet configuration)
npm run deploy
```

**Preprod Server Configuration (March 13, 2026):**
- **Node**: Running on port 9944 ("Midnight Preprod" network)
- **Proof Server**: Running on port 6300 (healthy)
- **Compact Version**: 0.29.0
- **Node Version**: v20.20.1
- **Network Status**: 25 peers connected, fully synced

### Project Structure

```
credvault-contract/
├── transcript.compact          # Source contract
├── merkle-tree.ts              # Merkle tree builder & proof generator
├── deploy.ts                   # Contract deployment script
├── invoke.ts                   # Contract invocation script
├── transcript-simulator.ts     # Test simulator
├── transcript.test.ts          # Unit tests
├── credvault-hash.ts           # Hash utilities (SHA-256)
├── transcript-hash-verification.test.ts  # Hash verification tests
├── contract/                   # Generated output
│   ├── index.js               # Compiled TypeScript
│   └── index.d.ts             # Type definitions
├── test-data/                  # Test data & generated proofs
│   ├── sot-transcript.json    # Sample transcript (63 courses)
│   ├── merkle-tree.json       # Generated Merkle tree
│   ├── merkle-root.txt        # Root hash for deployment
│   ├── deployment-config.json # Deployment parameters
│   └── sample-proof-cs101.json # Example Merkle proof
├── deployments/                # Deployment records
└── package.json
```

---

## Working Patterns

### Basic Contract Template

```compact
pragma language_version >= 0.20;
import CompactStandardLibrary;

// LEDGER: On-chain state (public)
export ledger fieldName: Type;

// CONSTRUCTOR
constructor(arg1: Type, arg2: Type) {
  fieldName = disclose(arg1);  // Must use disclose() for ledger writes
}

// CIRCUIT: Function that can be called
export circuit functionName(arg: Type): ReturnType {
  // Logic here
  return value;
}
```

### Key Rules Learned

1. **Always use `disclose()`** when writing to ledger from constructor/circuits
   - ❌ `merkleRoot = root;`
   - ✅ `merkleRoot = disclose(root);`

2. **Constructor arguments** are passed separately to `initialState()`
   ```typescript
   contract.initialState(
     createConstructorContext({}),  // private state
     arg1,                          // constructor arg 1
     arg2                           // constructor arg 2
   );
   ```

3. **Circuit return values** are in `output.result`, not `output.returnValue`
   ```typescript
   const output = contract.circuits.getRoot(context);
   const value = output.result;  // Not output.returnValue
   ```

4. **All circuits go in `contract.circuits`** (not pureCircuits/impureCircuits separately)

5. **Witness functions** must be implemented in TypeScript and passed to the Contract constructor
   ```typescript
   const witnesses = {
     gpaValue: () => BigInt(gpa * 100)
   };
   const contract = new Contract(witnesses);
   ```

6. **Ternary operator** for conditionals: `condition ? trueVal : falseVal`
   - ❌ `if (cond) { val1 } else { val2 }`
   - ✅ `cond ? val1 : val2`

7. **Vector types** syntax: `Vector<n, Type>`
   - Example: `Vector<4, Bytes<32>>` = array of 4 byte arrays

---

## What Works

### ✅ Data Types

| Type | Works | Notes |
|------|-------|-------|
| `Bytes<32>` | ✅ | 32-byte arrays (hashes, keys) |
| `Uint<64>` | ✅ | Unsigned integers |
| `Uint<32>` | ✅ | Smaller unsigned integers |
| `Bool` | ✅ | Boolean |
| `enum` | ✅ | Custom enums |
| `Vector<n, T>` | ✅ | Fixed-size arrays |
| `Counter` | ✅ | Increment counter type |

### ✅ Contract Features

| Feature | Status | Example |
|---------|--------|---------|
| Ledger storage | ✅ | `export ledger root: Bytes<32>;` |
| Constructor | ✅ | `constructor(root: Bytes<32>)` |
| Circuits | ✅ | `export circuit get(): Bytes<32>` |
| Multiple args | ✅ | `constructor(a, b, c)` |
| Return values | ✅ | `circuit get(): Bytes<32>` |
| State updates | ✅ | `circuit update(newRoot): []` |
| Witness functions | ✅ | `witness gpaValue(): Uint<32>` |
| ZK constraints | ✅ | `assert(actualGpa >= minGpa)` |

### ✅ Testing

| Feature | Status | Notes |
|---------|--------|---------|
| Unit tests | ✅ | Vitest framework |
| Simulator pattern | ✅ | See transcript-simulator.ts |
| Constructor testing | ✅ | Pass args to initialState |
| Circuit testing | ✅ | Call circuits via simulator |
| State verification | ✅ | Check ledger after operations |
| Witness mocking | ✅ | Provide witness functions in constructor |

### ✅ Infrastructure Migration (March 13, 2026)

| Component | Test Server (52.90.215.141) | Preprod Server (13.223.121.120) | Status |
|-----------|------------------------------|----------------------------------|--------|
| Contract files | `/home/ubuntu/credvault-contract/` | `/home/ubuntu/credvault-contract/` | ✅ Migrated |
| Compact compiler | `/usr/local/bin/compactc` | `~/.compact/bin/compactc` (v0.29.0) | ✅ Working |
| Node.js | v18.x | v20.20.1 | ✅ Working |
| Midnight node | Local devnet | Preprod network (port 9944) | ✅ 25 peers |
| Proof server | Port 6300 | Port 6300 | ✅ Healthy |
| Unit tests | 12 pass | 12 pass | ✅ Verified |
| Merkle tree builder | ❌ Missing | ✅ Created | ✅ Working |
| Deploy script | ❌ Missing | ✅ Created | ✅ Ready |
| Invoke script | ❌ Missing | ✅ Created | ✅ Ready |

**Preprod-Specific Findings:**
- Compact compiler installed in `~/.compact/bin/` (not `/usr/local/bin/`)
- Node already running and synced to "Midnight Preprod" network
- Proof server automatically available via localhost:6300
- All 12 unit tests pass without modification
- Contract compiles successfully with `--skip-zk` flag

### ✅ Merkle Proof Verification

**IMPLEMENTED:** `verifyMerkleProof4()`

- Fixed 4-level proof verification
- Uses `persistentHash` for cryptographic hashing
- Takes `Vector<4, Bytes<32>>` for siblings
- Takes `Vector<4, Boolean>` for position (isRight)

```compact
export circuit verifyMerkleProof4(
  leafHash: Bytes<32>,
  siblings: Vector<4, Bytes<32>>,
  isRight: Vector<4, Boolean>
): Boolean
```

### ✅ ZK Range Proofs

**IMPLEMENTED:** `verifyMinGPA()` and `verifyGpaRange()`

- Proves GPA >= threshold without revealing actual value
- Uses witness function for private input
- Asserts constraints in zero-knowledge

```compact
witness gpaValue(): Uint<32>;

export circuit verifyMinGPA(minGpa: Uint<32>): [] {
  const actualGpa = gpaValue();
  assert(actualGpa >= minGpa, "GPA below minimum");
}
```

**Key insight:** Witness values cannot be returned or disclosed. They can only be used in assertions.

---

## What Doesn't Work (Yet)

### ❌ Dynamic Arrays

**Status:** Not supported

Compact requires fixed-size arrays at compile time.
- ❌ `Vector<dynamic, Bytes<32>>`
- ✅ `Vector<4, Bytes<32>>`

**Workaround:** Use fixed-size vectors and pad unused elements

### ❌ Bitwise Operators

**Status:** Limited or unsupported

| Operator | Status |
|----------|--------|
| `&` (AND) | ❓ Unknown/unsupported |
| `\|` (OR) | ❓ Unknown/unsupported |
| `>>` (shift) | ❓ Unknown/unsupported |
| `<<` (shift) | ❓ Unknown/unsupported |

**Workaround:** Use arithmetic operations or Boolean arrays
```compact
// Instead of: positionBits & 1
// Use: Vector<4, Boolean> for position flags
```

### ❌ Mutable Variables

**Status:** Not supported

Compact is a functional language. Use `const` and rebind:
```compact
// ❌ let x = 0; x = x + 1;
// ✅ const x1 = 0; const x2 = x1 + 1;
```

### ❌ For/While Loops

**Status:** Not supported

Compact requires fixed computational bounds.
**Workaround:** Use `fold` for vectors or unroll loops manually

### ❌ Returning Witness-derived Values

**Status:** Blocked by compiler (privacy protection)

Cannot return values derived from witness comparisons:
```compact
// ❌ Will fail to compile:
export circuit check(): Boolean {
  return gpaValue() >= 300;  // ERROR: potential witness disclosure
}

// ✅ Correct: only use witness in assertions
export circuit check(): [] {
  assert(gpaValue() >= 300);
}
```

---

## Open Questions

### High Priority

1. **How do we implement variable-length Merkle proofs?**
   - Can we use recursion?
   - Is there a built-in Merkle library?
   - What's the syntax for fold/reduce?

2. **What's the gas cost model?**
   - How expensive is on-chain storage?
   - What's the cost of circuit execution?

3. **~~How do we handle hash precomputation for tests?~~** ✅ RESOLVED
   - **ANSWER:** `persistentHash<[Bytes<32>, Bytes<32>]>([left, right])` uses **SHA-256**
   - The hash is computed as: `SHA-256(left || right)` where `||` is concatenation
   - See [Hash Utilities](#hash-utilities) section for JavaScript implementation

### Medium Priority

4. **Can we use external libraries?**
   - Import crypto libraries?
   - Use pre-built Merkle implementations?

5. **What's the deployment process?**
   - How do we deploy to Midnight testnet?
   - How do we deploy to mainnet?

6. **How do we handle contract upgrades?**
   - Can we amend deployed contracts?
   - Version management?

### Low Priority

7. **What's the performance limit?**
   - Max circuit complexity?
   - Max ledger size?

8. **How do we integrate with frontend?**
   - Generate proofs in browser?
   - Wallet integration?

---

## Compact Language Reference

### Keywords That Work

| Keyword | Purpose | Example |
|---------|---------|---------|
| `pragma language_version` | Specify version | `pragma language_version >= 0.20;` |
| `import` | Import libraries | `import CompactStandardLibrary;` |
| `export ledger` | On-chain state | `export ledger root: Bytes<32>;` |
| `constructor` | Initialize contract | `constructor(arg: Type)` |
| `export circuit` | Callable function | `export circuit get(): Type` |
| `witness` | Private input | `witness gpaValue(): Uint<32>` |
| `disclose()` | Write to ledger | `root = disclose(newRoot);` |
| `enum` | Define enum | `enum Status { ACTIVE, REVOKED }` |
| `const` | Variable declaration | `const x: Uint<64> = 0;` |
| `return` | Return value | `return root;` |
| `assert` | Constraint | `assert(x >= 0, "message")` |
| `? :` | Ternary conditional | `cond ? a : b` |

### Types Reference

| Type | Size | Use Case |
|------|------|----------|
| `Bytes<32>` | 32 bytes | Hashes, Merkle roots, keys |
| `Bytes<64>` | 64 bytes | Larger hashes |
| `Uint<8>` | 1 byte | Small integers (0-255) |
| `Uint<32>` | 4 bytes | Standard integers |
| `Uint<64>` | 8 bytes | Large integers, timestamps |
| `Bool` | 1 bit | True/false |
| `Counter` | 8 bytes | Increment-only counter |
| `Vector<n, T>` | n × sizeof(T) | Fixed-size arrays |

### Operators

| Operator | Works | Notes |
|----------|-------|-------|
| `=` | ✅ | Assignment |
| `==` | ✅ | Equality |
| `!=` | ✅ | Not equal |
| `>` | ✅ | Greater than |
| `<` | ✅ | Less than |
| `>=` | ✅ | Greater or equal |
| `<=` | ✅ | Less or equal |
| `+` | ✅ | Addition |
| `-` | ✅ | Subtraction |
| `*` | ⚠️ | Multiplication (untested) |
| `/` | ⚠️ | Division (untested) |
| `>>` | ❓ | Bit shift (untested) |
| `&` | ❌ | Bitwise AND (unsupported) |
| `? :` | ✅ | Ternary conditional |

### Standard Library Functions

| Function | Purpose | Example |
|----------|---------|---------|
| `persistentHash<T>` | Hash value to Bytes<32> | `persistentHash<[Bytes<32>, Bytes<32>]>([a, b])` |
| `transientHash<T>` | Hash value to Field | `transientHash<Uint<32>>(value)` |
| `transientCommit<T>` | Commitment with randomness | `transientCommit<Uint<32>>(value, rand)` |
| `persistentCommit<T>` | Persistent commitment | `persistentCommit<Uint<32>>(value, rand)` |

---

## Common Errors & Solutions

### Error: "potential witness-value disclosure must be declared"

**Cause:** Returning or leaking witness-derived values

**Fix:**
```compact
// ❌ Wrong
export circuit check(): Boolean {
  return gpaValue() >= 300;
}

// ✅ Correct
export circuit check(): [] {
  assert(gpaValue() >= 300);
}
```

### Error: "Contract state constructor: expected X arguments, received Y"

**Cause:** Wrong number of arguments to `initialState()`

**Fix:**
```typescript
// ❌ Wrong
contract.initialState(createConstructorContext({}, arg1, arg2));

// ✅ Correct
contract.initialState(
  createConstructorContext({}),  // private state
  arg1,                          // constructor arg 1
  arg2                           // constructor arg 2
);
```

### Error: "Cannot read properties of undefined (reading 'X')"

**Cause:** Trying to access `pureCircuits` or wrong property name

**Fix:**
```typescript
// ❌ Wrong
contract.pureCircuits.getRoot(context);
contract.circuits.getRoot(context).returnValue;

// ✅ Correct
contract.circuits.getRoot(context);
contract.circuits.getRoot(context).result;
```

### Error: "parse error: found keyword 'if' looking for an expression"

**Cause:** Using `if/else` as expression instead of ternary

**Fix:**
```compact
// ❌ Wrong
const x = if (cond) { a } else { b };

// ✅ Correct
const x = cond ? a : b;
```

### Error: "first (witnesses) argument to Contract constructor does not contain a function-valued field named X"

**Cause:** Witness function not provided to Contract constructor

**Fix:**
```typescript
// ❌ Wrong
const contract = new Contract({});

// ✅ Correct
const contract = new Contract({
  gpaValue: () => BigInt(350)
});
```

---

## Test Patterns

### Basic Test Structure

```typescript
import { describe, it, expect } from "vitest";

describe("Contract name", () => {
  it("does something", () => {
    // Arrange
    const simulator = new ContractSimulator(arg1, arg2);
    
    // Act
    const result = simulator.doSomething();
    
    // Assert
    expect(result).toEqual(expected);
  });
});
```

### Helper Functions

```typescript
// Convert hex string to Uint8Array
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 64; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Compare Uint8Arrays
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
```

### Simulator Pattern

```typescript
export class ContractSimulator {
  readonly contract: Contract<PrivateState>;
  circuitContext: CircuitContext<PrivateState>;

  constructor(arg1: string, arg2: string, gpa: number | null = null) {
    // Provide witness implementations
    const witnesses = {
      gpaValue: () => BigInt(Math.floor((gpa || 0) * 100))
    };
    
    this.contract = new Contract<PrivateState>(witnesses);
    
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState
    } = this.contract.initialState(
      createConstructorContext({}),
      hexToBytes(arg1),
      hexToBytes(arg2)
    );
    
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState
    );
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }
}
```

---

## Hash Utilities

### 🎯 Critical Finding: persistentHash Algorithm

**`persistentHash<[Bytes<32>, Bytes<32>]>([left, right])` uses SHA-256**

The Compact contract computes hashes as:
```
SHA-256(left || right)
```
Where `||` denotes concatenation of the two 32-byte arrays.

### JavaScript Implementation

```typescript
import { createHash } from 'crypto';

/**
 * Computes the same hash as Compact's persistentHash<[Bytes<32>, Bytes<32>]>
 */
export function persistentHashPair(left: Uint8Array, right: Uint8Array): Uint8Array {
  const hash = createHash('sha256');
  hash.update(left);
  hash.update(right);
  return new Uint8Array(hash.digest());
}

/**
 * Compute Merkle root from leaf and proof path
 */
export function computeMerkleRoot(
  leafHash: Uint8Array,
  siblings: Uint8Array[],
  isRight: boolean[]
): Uint8Array {
  let currentHash = leafHash;
  
  for (let i = 0; i < siblings.length; i++) {
    const left = isRight[i] ? siblings[i] : currentHash;
    const right = isRight[i] ? currentHash : siblings[i];
    currentHash = persistentHashPair(left, right);
  }
  
  return currentHash;
}

/**
 * Verify a Merkle proof
 */
export function verifyMerkleProof(
  leafHash: Uint8Array,
  siblings: Uint8Array[],
  isRight: boolean[],
  expectedRoot: Uint8Array
): boolean {
  const computedRoot = computeMerkleRoot(leafHash, siblings, isRight);
  return bytesEqual(computedRoot, expectedRoot);
}
```

### Verification

Test vectors verified against Compact runtime:

| Input | Output (hex) |
|-------|--------------|
| `persistentHash([00...00], [00...00])` | `f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b` |
| `persistentHash([01,00...], [02,00...])` | `ff55c97976a840b4ced964ed49e3794594ba3f675238b5fd25d282b60f70a194` |

### Usage Example

```typescript
// Build a Merkle tree in JavaScript
const leaf = hashCredential(credential);
const root = computeMerkleRoot(leaf, siblings, isRight);

// Verify proof matches contract
const valid = verifyMerkleProof(leaf, siblings, isRight, contractRoot);
expect(valid).toBe(true);
```

### Location

- **Implementation:** `/home/anthony/.openclaw/workspace/credvault-hash.ts`

---

## Resources

### Documentation
- [Midnight Docs](https://docs.midnight.network/)
- [Compact Language Reference](https://docs.midnight.network/compact/reference/lang-ref)
- [Example Counter Repo](https://github.com/midnightntwrk/example-counter)

### Our Implementations
- **Contract:** `/home/ubuntu/credvault-contract/transcript.compact`
- **Merkle Tree Builder:** `/home/ubuntu/credvault-contract/merkle-tree.ts`
- **Deployment Script:** `/home/ubuntu/credvault-contract/deploy.ts`
- **Invocation Script:** `/home/ubuntu/credvault-contract/invoke.ts`
- **Test Data:** `/home/ubuntu/credvault-contract/test-data/sot-transcript.json`
- **Simulator:** `/home/ubuntu/credvault-contract/transcript-simulator.ts`
- **Tests:** `/home/ubuntu/credvault-contract/transcript.test.ts`
- **Hash Utilities:** `/home/ubuntu/credvault-contract/credvault-hash.ts`

### Test Server
- **IP:** 52.90.215.141
- **SSH Key:** ~/.ssh/openclaw-test or CasePulse.pem
- **User:** ubuntu
- **Location:** `/home/ubuntu/credvault-contract/`
- **Node:** Running on port 9944
- **Proof Server:** Running on port 6300

---

## Changelog

### March 13, 2026 (Wallet Integration)
- ✅ **IMPLEMENTED:** Headless Wallet SDK Integration
  - Updated `deploy.ts` to use `@midnight-ntwrk/wallet` SDK
  - Updated `invoke.ts` for server-side wallet operations
  - HD wallet derivation from hex seed (128 characters)
  - Automatic DUST payment for transaction fees
  - Three-wallet architecture: Shielded, Unshielded, DUST
  - **Note:** Lace wallet is browser-only; use Wallet SDK for server deployment
  - Wallet seed configured via `MIDNIGHT_WALLET_SEED` environment variable

- ✅ **CREATED:** Complete deployment infrastructure
  - `merkle-tree.ts` - Merkle tree builder with SHA-256 hashing
  - `deploy.ts` - Contract deployment script with Wallet SDK
  - `invoke.ts` - Student GPA verification script with Wallet SDK
  - `test-data/sot-transcript.json` - Realistic test transcript (63 courses)
  - Updated reference documentation with deployment guide and wallet integration

- ✅ **SOT Data Structure:** Created comprehensive test transcript
  - 63 courses across 8 semesters
  - 130 total credits
  - Cumulative GPA: 3.62
  - Includes labs, electives, research projects
  - Student: Alexandra Chen (fictional)

- ✅ **Merkle Tree Implementation:**
  - Builds complete Merkle tree from course records
  - Generates proofs for all leaves
  - Pads to power of 2 for balanced tree
  - Outputs deployment-ready configuration

- ✅ **Deployment Scripts:**
  - Network configs for preprod/testnet/mainnet
  - Contract compilation with compactc
  - Constructor parameter validation
  - Deployment result persistence

- ✅ **Invocation Scripts:**
  - ZK proof generation for GPA verification
  - Merkle proof verification for course credentials
  - Witness function integration
  - Transaction result tracking

- **Preprod Network Ready:**
  - Node: 52.90.215.141:9944
  - Proof Server: 52.90.215.141:6300
  - Anthony has 2.4452K DUST for deployment

### March 11, 2026 (Afternoon)
- ✅ **DISCOVERED:** `persistentHash` algorithm identified as **SHA-256**
  - `persistentHash<[Bytes<32>, Bytes<32>]>([left, right])` = `SHA-256(left || right)`
  - Verified with 4 test vectors against Compact runtime
  - JavaScript implementation created in `credvault-hash.ts`
  - Enables off-chain Merkle tree computation
  - **CRITICAL:** Unblocks real Merkle tree usage for credentials

### March 11, 2026
- ✅ **IMPLEMENTED:** Merkle proof verification with `verifyMerkleProof4()`
  - Fixed 4-level proof verification
  - Uses `persistentHash` for cryptographic hashing
  - Vector types for siblings and position flags
  - All tests passing (7/7)

- ✅ **IMPLEMENTED:** ZK range proofs with `verifyMinGPA()` and `verifyGpaRange()`
  - Proves GPA >= threshold without revealing value
  - Uses witness functions for private inputs
  - Constraints enforced with `assert`
  - All tests passing (7/7)

- **Key Findings:**
  - Compact uses `Vector<n, T>` for fixed-size arrays
  - Ternary operator `? :` for conditionals (not `if/else`)
  - Witness values cannot be returned - only used in assertions
  - `const` instead of `let` for variable declarations
  - Bitwise operators (`&`, `>>`) appear unsupported - use Boolean arrays instead

- **Contract now supports:**
  - Merkle root storage and updates
  - Merkle proof verification (4 levels)
  - ZK range proofs for GPA verification
  - 7/7 unit tests passing

---

## Deployment Guide

### Pre-Deployment Checklist

- [ ] Contract compiled successfully with `compactc`
- [ ] Merkle root computed from transcript data
- [ ] SOT attestation generated by issuer
- [ ] Test server/node is running
- [ ] Wallet has sufficient DUST for fees (minimum 2.4452K DUST)
- [ ] Network configuration verified

### Network Configuration

| Network | Node URL | Proof Server | Network ID |
|---------|----------|--------------|------------|
| preprod | `http://52.90.215.141:9944` | `http://52.90.215.141:6300` | 2 |
| testnet | `http://localhost:9944` | `http://localhost:6300` | 1 |
| mainnet | `https://node.mainnet.midnight.network` | `https://proofs.mainnet.midnight.network` | 0 |

### Step 1: Build Merkle Tree

Generate the Merkle tree from transcript data:

```bash
cd /home/ubuntu/credvault-contract

# Build the tree and generate proofs
tsx merkle-tree.ts

# Output files created:
# - test-data/merkle-tree.json       # Full tree with all proofs
# - test-data/merkle-root.txt        # Root hash for deployment
# - test-data/deployment-config.json # Deployment parameters
```

**Expected output:**
```
🌿 Generated 63 leaf hashes
🌳 Built Merkle tree with 7 levels
🎯 Merkle Root: abc123...def456
✅ All 63 proofs verified successfully
```

### Step 2: Compile Contract

```bash
compactc --skip-zk transcript.compact .

# Output: contract/index.js, contract/index.d.ts
```

### Step 3: Deploy Contract

```bash
# Deploy with explicit parameters
tsx deploy.ts \
  --merkleRoot abc123... \
  --sotAttestation def456... \
  --network preprod

# Or use deployment config from merkle tree
tsx deploy.ts --network preprod
```

**Deployment Parameters:**
- `merkleRoot`: 64-character hex string (computed from transcript)
- `sotAttestation`: 64-character hex string (issuer signature)
- `network`: Target network (preprod/testnet/mainnet)

**Expected output:**
```
DEPLOYMENT RESULT
============================================================
Contract Address: 0x...
Transaction Hash: 0x...
Network: preprod
============================================================
```

### Step 4: Verify Deployment

```bash
# Check contract state
# (Requires Midnight SDK integration)
```

### Step 5: Student Verification

Students can verify their GPA without revealing the actual value:

```bash
# Prove GPA >= 3.00 (actual is 3.62)
tsx invoke.ts \
  --contract 0xabc123... \
  --minGpa 300 \
  --actualGpa 362 \
  --network preprod

# Verify specific course with Merkle proof
tsx invoke.ts \
  --contract 0xabc123... \
  --course CS101 \
  --minGpa 300 \
  --actualGpa 362
```

---

## SOT Data Structure

### Transcript JSON Format

```json
{
  "student": {
    "id": "STU-2026-884721",
    "name": "Alexandra Chen",
    "dateOfBirth": "1998-03-15",
    "program": "Bachelor of Science in Computer Science",
    "institution": "State University of Technology",
    "enrollmentDate": "2016-09-01",
    "graduationDate": "2020-05-15",
    "degreeAwarded": "Bachelor of Science",
    "major": "Computer Science",
    "minor": "Mathematics"
  },
  "academicRecord": {
    "semesters": [
      {
        "term": "Fall 2016",
        "courses": [
          {
            "code": "CS101",
            "name": "Introduction to Programming",
            "credits": 3,
            "grade": "A",
            "gradePoints": 4.0
          }
        ]
      }
    ],
    "additionalCourses": [...]
  },
  "summary": {
    "totalCredits": 130,
    "cumulativeGPA": 3.62,
    "cumulativeGPAScaled": 362,
    "totalCourses": 63,
    "honors": "Cum Laude"
  }
}
```

### GPA Scaling

- **Display format:** 3.62 (standard 4.0 scale)
- **Contract format:** 362 (integer, multiplied by 100)
- **Range:** 0-400 (representing 0.00-4.00)

### Course Record Hashing

Each course is hashed using SHA-256 of canonical JSON:

```typescript
const courseData = JSON.stringify({
  code: course.code,
  name: course.name,
  credits: course.credits,
  grade: course.grade,
  gradePoints: course.gradePoints
}, Object.keys(course).sort());

const leafHash = sha256(courseData);
```

---

## Merkle Tree Construction

### Tree Structure

```
                    [Root Hash]
                   /           \
            [Hash01]           [Hash23]
           /        \         /        \
    [Leaf0]      [Leaf1] [Leaf2]      [Leaf3]
    (CS101)      (CS102) (MATH150)    (PHYS101)
```

### Building the Tree

1. **Hash each course** into a 32-byte leaf
2. **Pad leaves** to nearest power of 2
3. **Pair and hash** leaves bottom-up
4. **Compute root** as final hash

### Proof Generation

For leaf at index `i`:

```typescript
// Get sibling at each level
const siblings = [];
const isRight = [];
let currentIndex = i;

for (let level = 0; level < treeHeight; level++) {
  const isRightNode = currentIndex % 2 === 1;
  const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;
  
  siblings.push(tree[level][siblingIndex]);
  isRight.push(isRightNode);
  
  currentIndex = Math.floor(currentIndex / 2);
}
```

### Contract-Compatible Proofs

The contract uses fixed 4-sibling proofs (max 16 leaves = 2^4). For larger trees:

**Current Limitation:** The `verifyMerkleProof4` circuit only supports 4 levels, meaning:
- Maximum 16 courses can be verified (2^4 = 16)
- Larger transcripts require multiple proofs or contract modification

**Workarounds:**
1. **Split transcript** into multiple smaller trees (e.g., by semester)
2. **Use 16 representative courses** for verification
3. **Modify contract** to support more levels (see below)

**Padding shorter proofs:**
```typescript
function formatProofForContract(siblings, isRight) {
  const resultSiblings = [];
  const resultIsRight = [];
  
  for (let i = 0; i < 4; i++) {
    if (i < siblings.length) {
      resultSiblings.push(siblings[i]);
      resultIsRight.push(isRight[i]);
    } else {
      // Pad with zero hash
      resultSiblings.push(new Uint8Array(32));
      resultIsRight.push(false);
    }
  }
  
  return { siblings: resultSiblings, isRight: resultIsRight };
}
```

**Extending to more levels:** To support more courses, add additional levels to `verifyMerkleProof4`:
```compact
// Add Level 4, 5, etc. to support more leaves
// Level 4 adds support for 32 leaves (2^5)
// Level 5 adds support for 64 leaves (2^6)
```

---

## Zero-Knowledge Proofs

### verifyMinGPA Circuit

Proves GPA >= threshold without revealing actual value:

```compact
witness gpaValue(): Uint<32>;

export circuit verifyMinGPA(minGpa: Uint<32>): [] {
  const actualGpa = gpaValue();
  assert(actualGpa >= minGpa, "GPA below minimum");
}
```

**How it works:**
1. Student provides actual GPA as witness (private)
2. Circuit asserts `actualGpa >= minGpa`
3. If assertion fails, proof generation fails
4. If assertion passes, proof is valid but reveals nothing about actual GPA

### Witness Function (TypeScript)

```typescript
const witnesses = {
  gpaValue: () => BigInt(actualGpa)  // Private witness
};

const contract = new Contract(witnesses);
```

### Invocation

```typescript
// Prove GPA >= 3.00
contract.circuits.verifyMinGPA(context, BigInt(300));

// Prove GPA in honors range (3.5 - 4.0)
contract.circuits.verifyGpaRange(context, BigInt(350), BigInt(400));
```

---

## File Reference

| File | Purpose | Location |
|------|---------|----------|
| `transcript.compact` | Smart contract source | `/home/ubuntu/credvault-contract/` |
| `merkle-tree.ts` | Tree builder & proof generator | `/home/ubuntu/credvault-contract/` |
| `deploy.ts` | Deployment script | `/home/ubuntu/credvault-contract/` |
| `invoke.ts` | Contract invocation script | `/home/ubuntu/credvault-contract/` |
| `sot-transcript.json` | Test transcript data | `/home/ubuntu/credvault-contract/test-data/` |
| `merkle-tree.json` | Generated tree + proofs | `/home/ubuntu/credvault-contract/test-data/` |
| `deployment-config.json` | Deployment parameters | `/home/ubuntu/credvault-contract/test-data/` |
| `transcript-simulator.ts` | Local testing simulator | `/home/ubuntu/credvault-contract/` |
| `transcript.test.ts` | Unit tests | `/home/ubuntu/credvault-contract/` |
| `credvault-hash.ts` | Hash utilities | `/home/ubuntu/credvault-contract/` |

---

## Troubleshooting

### "Cannot find module" Error

**Cause:** Contract not compiled or wrong path

**Fix:**
```bash
compactc --skip-zk transcript.compact .
```

### "GPA below minimum" Error

**Cause:** Actual GPA is less than minimum threshold

**Fix:**
- Verify actual GPA value
- Use correct scaled value (e.g., 362 for 3.62)
- Ensure minGpa is realistic

### "Invalid Merkle proof format" Error

**Cause:** Proof doesn't have exactly 4 siblings

**Fix:**
- Use `formatProofForContract()` to pad proof
- Verify proof was generated for correct tree

### "Contract compilation failed" Error

**Cause:** Syntax error in .compact file

**Fix:**
- Check for missing semicolons
- Verify all types are correct
- Ensure `disclose()` is used for ledger writes

---

## Wallet Integration

### Understanding Midnight Wallet Options

Midnight provides **two distinct wallet integration patterns**:

| Wallet Type | Use Case | Connection Method | Package |
|-------------|----------|-------------------|---------|
| **Lace Browser Wallet** | DApps, user interfaces, browser-based apps | Browser extension via `window.midnight?.mnLace` | `@midnight-ntwrk/dapp-connector-api` |
| **Headless Wallet SDK** | Server-side, CLI tools, automated deployment | HD wallet from seed | `@midnight-ntwrk/wallet` |

### Lace Browser Wallet (For DApps)

Lace is a browser extension wallet for user-facing applications:

```typescript
// Browser-only: Connect to Lace wallet
const wallet = window.midnight?.mnLace;
if (!wallet) {
  throw new Error('Please install Lace Beta Wallet for Midnight Network');
}

// Enable wallet and get state
const walletAPI = await wallet.enable();
const walletState = await walletAPI.state();
const addresses = await walletAPI.getShieldedAddresses();
```

**Note:** Lace requires a browser environment with the extension installed. It cannot be used in headless/server environments.

### Headless Wallet SDK (For Server Deployment)

For server-side deployment and CLI tools, use the **Wallet SDK** with HD wallet derivation:

```typescript
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

// Derive keys from 128-character hex seed (64 bytes)
const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
const result = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);

const keys = result.keys;
```

### Wallet Components

The Midnight wallet consists of three specialized components:

| Component | Purpose | Key Type |
|-----------|---------|----------|
| **Shielded Wallet** | Private ZK transactions | `ZswapSecretKeys` |
| **Unshielded Wallet** | Public transactions | `NightExternal` key |
| **DUST Wallet** | Gas/fee payment | `DustSecretKey` |

### Configuration

**Environment Variable:**
```bash
export MIDNIGHT_WALLET_SEED="a1b2c3d4..."  # 128 hex characters (64 bytes)
```

**Preprod Server Setup:**
- The Preprod Server (13.223.121.120) has DUST available (2.4452K confirmed)
- Wallet seed should be configured via environment variable
- DUST is automatically used for transaction fees

### Deployment with Wallet SDK

```bash
# Deploy using headless wallet
tsx deploy.ts \
  --network=preprod \
  --merkleRoot=abc123... \
  --sotAttestation=def456...

# Or use environment variable for seed
export MIDNIGHT_WALLET_SEED="your-seed-here"
tsx deploy.ts --network=preprod
```

### Invocation with Wallet SDK

```bash
# Verify GPA using ZK proof
tsx invoke.ts \
  --network=preprod \
  --contract=0x... \
  --circuit=verifyMinGPA \
  --minGpa=300 \
  --actualGpa=362
```

### Wallet SDK Dependencies

Required packages for headless wallet:

```json
{
  "dependencies": {
    "@midnight-ntwrk/wallet": "^3.7.0",
    "@midnight-ntwrk/wallet-sdk-hd": "^3.0.0",
    "@midnight-ntwrk/wallet-sdk-facade": "^1.0.0",
    "@midnight-ntwrk/wallet-sdk-dust-wallet": "^1.0.0",
    "@midnight-ntwrk/wallet-sdk-shielded": "^1.0.0",
    "@midnight-ntwrk/wallet-sdk-unshielded-wallet": "^1.0.0",
    "@midnight-ntwrk/ledger": "^4.0.0"
  }
}
```

### Key Differences: Lace vs Headless

| Feature | Lace Browser | Headless SDK |
|---------|--------------|--------------|
| Environment | Browser only | Node.js/server |
| User interaction | Required (approvals) | Automated |
| Seed management | User-controlled | Environment/config |
| Best for | DApps, UI | CLI, deployment, automation |
| Connection | `window.midnight.mnLace` | HD derivation from seed |

---

## Next Steps

1. **Variable-length Merkle proofs**
   - Research fold/reduce syntax for vectors
   - Implement recursive or iterative proof verification

2. ~~**Hash function matching**~~ ✅ RESOLVED
   - ~~Determine what hash `persistentHash` uses~~
   - ~~Update test utilities to match~~
   - **Answer:** SHA-256

3. ~~**Deploy to testnet**~~ ✅ IN PROGRESS
   - ~~Learn deployment process~~
   - Test with real Midnight network
   - Deploy to preprod (52.90.215.141)

4. ~~**Update this document**~~ ✅ DONE
   - ~~Add findings from variable-length proof implementation~~
   - ~~Document gas costs~~
   - ~~Add deployment guide~~

5. ✅ **Integration with Headless Wallet SDK**
   - Uses `@midnight-ntwrk/wallet` for server-side wallet management
   - HD wallet derivation from hex seed
   - Automatic DUST payment for gas fees
   - See [Wallet Integration](#wallet-integration) section below

6. **Production Deployment**
   - Final security audit
   - Mainnet deployment
   - Student onboarding documentation
