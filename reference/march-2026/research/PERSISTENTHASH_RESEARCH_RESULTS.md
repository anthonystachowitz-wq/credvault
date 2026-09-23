# persistentHash Research Results

## Executive Summary

**URGENT TASK COMPLETED:** The `persistentHash` function in Compact has been identified and documented.

### Key Finding

`persistentHash<[Bytes<32>, Bytes<32>]>([left, right])` uses **SHA-256**

Specifically:
```
persistentHash([left, right]) = SHA-256(left || right)
```

Where:
- `left` and `right` are 32-byte arrays (`Bytes<32>`)
- `||` denotes concatenation (64 bytes total input)
- Output is a 32-byte hash (`Bytes<32>`)

## Verification

Verified against Compact runtime v0.29.0 with 4 test vectors:

| Test | Left Input | Right Input | Output (hex) |
|------|------------|-------------|--------------|
| Zeros | `00...00` (32 bytes) | `00...00` (32 bytes) | `f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b` |
| Custom | `01,00...` (32 bytes) | `02,00...` (32 bytes) | `ff55c97976a840b4ced964ed49e3794594ba3f675238b5fd25d282b60f70a194` |
| Elevens | `11,11...` (32 bytes) | `11,11...` (32 bytes) | `9aed5fce4bb60c40cb8a2983b43540adb4c8ac8aa1ef1f20de57526f9ed86e38` |
| Patterns | pad(32, "a") | pad(32, "b") | `d917f7343859f0d5c45b8e7e11617af24f02aaba0b0873de9e128a522ae1541c` |

All 4 test vectors match between JavaScript SHA-256 and Compact's `persistentHash`.

## Deliverables

### 1. Documentation ✅
- Updated `/home/anthony/.openclaw/workspace/CredVault_Midnight_Reference.md`
- Added "Hash Utilities" section with implementation details
- Updated Open Questions to mark hash question as resolved
- Added changelog entry for this discovery

### 2. JavaScript Implementation ✅
File: `/home/anthony/.openclaw/workspace/credvault-hash.ts`

Key functions:
- `persistentHashPair(left, right)` - Matches Compact's hash
- `computeMerkleRoot(leaf, siblings, isRight)` - Build Merkle trees
- `verifyMerkleProof(leaf, siblings, isRight, root)` - Verify proofs
- `hexToBytes(hex)` / `bytesToHex(bytes)` - Conversion utilities
- `bytesEqual(a, b)` - Constant-time comparison

### 3. Test Suite ✅
File: `/home/anthony/.openclaw/workspace/credvault-hash.test.ts`

- 12 tests covering hash functions and Merkle operations
- All tests pass ✅

### 4. Contract Integration ✅
File: `/home/ubuntu/credvault-contract/transcript-hash-verification.test.ts`

- 5 integration tests proving JavaScript and Compact agree
- Tests real Merkle proof verification with computed roots
- All tests pass ✅

## Usage Example

```typescript
import { persistentHashPair, computeMerkleRoot, verifyMerkleProof } from './credvault-hash';

// Build a Merkle tree
const leaf = hashCredential(credential);
const siblings = [sibling0, sibling1, sibling2, sibling3];
const isRight = [false, true, false, false];
const root = computeMerkleRoot(leaf, siblings, isRight);

// Store root in contract
const simulator = new TranscriptSimulator(bytesToHex(root), attestation);

// Later: verify proof
const valid = simulator.verifyMerkleProof4(leaf, siblings, isRight);
expect(valid).toBe(true);
```

## Impact

This discovery **unblocks all real Merkle tree usage**:

1. ✅ Build Merkle trees in JavaScript
2. ✅ Generate valid proofs  
3. ✅ Verify credentials properly
4. ✅ Create real test data
5. ✅ Off-chain proof generation

## Technical Details

### How the Discovery Was Made

1. Created a test contract (`hash-test.compact`) with circuits exposing hash outputs
2. Compiled with `compactc --skip-zk hash-test.compact hash-test-contract`
3. Used `pureCircuits` to get direct access to hash functions
4. Ran test vectors through Compact runtime
5. Compared outputs against SHA-256, Blake2b, and other candidates
6. **Result:** SHA-256 matched all test vectors perfectly

### Why SHA-256 Makes Sense

- Standard, well-tested hash function
- 32-byte output matches `Bytes<32>` type
- Efficient in both circuit and non-circuit contexts
- Widely supported in JavaScript (Node.js `crypto` module)

## Files Created/Modified

### Local Workspace
- ✅ `/home/anthony/.openclaw/workspace/credvault-hash.ts` - Hash implementation
- ✅ `/home/anthony/.openclaw/workspace/credvault-hash.test.ts` - Test suite
- ✅ `/home/anthony/.openclaw/workspace/CredVault_Midnight_Reference.md` - Documentation
- ✅ `/home/anthony/.openclaw/workspace/credvault-hash-test.ts` - Research verification script

### Test Server (52.90.215.141)
- ✅ `/home/ubuntu/credvault-contract/credvault-hash.ts` - Hash implementation
- ✅ `/home/ubuntu/credvault-contract/transcript-hash-verification.test.ts` - Integration tests
- ✅ `/home/ubuntu/credvault-contract/hash-test.compact` - Test contract
- ✅ `/home/ubuntu/credvault-contract/hash-extract.ts` - Hash extraction script

## Next Steps

1. Use `persistentHashPair()` to build real Merkle trees for credentials
2. Update existing tests to use real hash-computed roots
3. Document Merkle tree construction patterns
4. Create credential issuance workflow

## Conclusion

The `persistentHash` mystery is **SOLVED**. The hash algorithm is SHA-256, and we now have working JavaScript utilities that match the Compact contract exactly. This enables real Merkle tree operations for the CredVault system.

---

**Status:** ✅ COMPLETE  
**Priority:** URGENT (BLOCKING) → RESOLVED  
**Date:** March 11, 2026  
