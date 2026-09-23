# Compact Compiler Bug Report: Circuits Calling Witnesses Marked as "proof": false

## Summary
The Compact compiler (version 0.29.0) is incorrectly classifying circuits that call witness functions as pure circuits (`"proof": false`), which prevents the generation of ZK prover/verifier key pairs. This contradicts the documented behavior in the Compact language reference.

## Environment
- **Compiler Version:** 0.29.0
- **Language Version Tested:** >= 0.20 and 0.21
- **Runtime Version:** 0.14.0
- **OS:** Ubuntu (x86_64-unknown-linux-musl)

## Contract Code (Minimal Reproduction)

```compact
pragma language_version 0.21;

import CompactStandardLibrary;

// Ledger state
export ledger merkleRoot: Bytes<32>;
export ledger sotAttestation: Bytes<32>;
export ledger issuedAt: Uint<64>;

// Constructor
constructor(root: Bytes<32>, attestation: Bytes<32>) {
  merkleRoot = disclose(root);
  sotAttestation = disclose(attestation);
  issuedAt = 0;
}

// WITNESS: Private GPA value
witness gpaValue(): Uint<32>;

// CIRCUIT: Should be impure (calls witness), but compiler marks as pure
export circuit verifyMinGPA(minGpa: Uint<32>): Boolean {
  const actualGpa = gpaValue();  // <-- CALLS WITNESS
  assert(actualGpa >= minGpa, "GPA below minimum");
  return true;
}

// CIRCUIT: Should be impure (calls witness), but compiler marks as pure
export circuit verifyGpaRange(minGpa: Uint<32>, maxGpa: Uint<32>): Boolean {
  const actualGpa = gpaValue();  // <-- CALLS WITNESS
  assert(actualGpa >= minGpa, "GPA below minimum");
  assert(actualGpa <= maxGpa, "GPA above maximum");
  return true;
}

// This circuit correctly generates proof keys (doesn't call witness)
export circuit verifyMerkleProof4(
  leafHash: Bytes<32>,
  siblings: Vector<4, Bytes<32>>,
  isRight: Vector<4, Boolean>
): Boolean {
  // ... implementation ...
  return hash3 == merkleRoot;
}
```

## Compilation Command

```bash
compactc transcript.compact transcript-output
```

## Expected Behavior (Per Documentation)

According to the Compact language reference:

> "In practice, the compiler considers a circuit to be impure if the body of the circuit contains a ledger operation, a call to any impure circuit, or a call to a witness."
> 
> Source: [Compact reference - Circuits](https://docs.midnight.network/compact/reference/lang-ref#circuits)

> "For each of the impure circuits, a zero-knowledge prover/verifier key pair is also generated, as well as instructions for proof generation."
>
> Source: [Compact reference - TypeScript target](https://docs.midnight.network/compact/reference/lang-ref#typescript-target)

**Expected:** `verifyMinGPA` and `verifyGpaRange` should be classified as impure circuits and generate `.prover` and `.verifier` key files.

## Actual Behavior

**Actual:** The compiler outputs only 3 circuits with proof keys:

```
transcript-output/keys/
├── getRoot.prover
├── getRoot.verifier
├── updateRoot.prover
├── updateRoot.verifier
├── verifyMerkleProof4.prover
└── verifyMerkleProof4.verifier
```

**Missing:** No key files for `verifyMinGPA` or `verifyGpaRange`.

The `contract-info.json` shows:

```json
{
  "circuits": [
    {
      "name": "verifyMerkleProof4",
      "proof": true
    },
    {
      "name": "verifyMinGPA",
      "proof": false  // <-- SHOULD BE true
    },
    {
      "name": "verifyGpaRange",
      "proof": false  // <-- SHOULD BE true
    }
  ]
}
```

## Impact

This causes deployment failures when using midnight-js:

```
ZKConfigurationReadError: Failed to read verifier key for transcript#verifyMinGPA
```

The NodeZkConfigProvider attempts to load verifier keys for all exported circuits, but the keys don't exist because the compiler didn't generate them.

## Workarounds Attempted

1. **Changed pragma version:** Tested both `>= 0.20` and `0.21` - same result
2. **Added return values:** Changed return type from `[]` to `Boolean` and added `return true` - same result
3. **Dummy key files:** Copying existing verifier files as placeholders allows deployment to proceed, but this is not a correct solution

## Questions for the Dev Team

1. Is this a known compiler bug or intentional behavior?
2. Are there specific conditions under which witness calls don't make a circuit impure?
3. Is there a compiler flag or configuration to force proof generation for specific circuits?
4. Should midnight-js be updated to skip key loading for pure circuits?

## Additional Context from Midnight AI

> "The knowledge sources do not contain enough information to explain why a circuit explicitly calling a witness would be marked as 'proof': false in contract-info.json. This behavior directly contradicts the documented rule. This could indicate a compiler bug or an edge case not covered in the available documentation."

## Request

Please investigate and confirm:
1. Whether this is a bug in compiler version 0.29.0
2. If there's a workaround or fix available
3. If the documentation needs to be updated to reflect actual behavior

---

**Reported by:** CredVault Development Team
**Date:** March 16, 2026
**Contact:** [Your contact info]
