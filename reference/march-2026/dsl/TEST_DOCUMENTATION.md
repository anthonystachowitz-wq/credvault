# CredVault Use Case Test Documentation

## Overview

This document describes the comprehensive test suite for all 16 CredVault use cases. Each use case represents a unique combination of ZK proof types for credential verification on the Midnight Network.

## Test Coverage

| Case | Name | Schema File | Output File | Compilation | Simulator | Status |
|------|------|-------------|-------------|-------------|-----------|--------|
| 1 | Merkle Only | case1-merkle-only.json | case1.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 2 | Range Only | case2-range-only.json | case2.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 3 | Equality Only | case3-equality-only.json | case3.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 4 | Revocation Only | case4-revocation-only.json | case4.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 5 | Merkle + Range | case5-merkle-range.json | case5.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 6 | Merkle + Equality | case6-merkle-equality.json | case6.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 7 | Merkle + Revocation | case7-merkle-revocation.json | case7.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 8 | Range + Equality | case8-range-equality.json | case8.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 9 | Range + Revocation | case9-range-revocation.json | case9.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 10 | Equality + Revocation | case10-equality-revocation.json | case10.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 11 | Merkle + Range + Equality | case11-merkle-range-equality.json | case11.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 12 | Merkle + Range + Revocation | case12-merkle-range-revocation.json | case12.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 13 | Merkle + Equality + Revocation | case13-merkle-equality-revocation.json | case13.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 14 | Range + Equality + Revocation | case14-range-equality-revocation.json | case14.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 15 | Full (All Proofs) | case15-merkle-range-equality-revocation.json | case15.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |
| 16 | Storage Only | case16-storage-only.json | case16.compact | ⏳ | ✅ | SCHEMA + COMPACT READY |

## Test Results Summary

| Metric | Count | Status |
|--------|-------|--------|
| Total Cases | 16 | ✅ |
| Schemas Created | 16/16 | ✅ 100% |
| Compact Generated | 16/16 | ✅ 100% |
| Simulator Tests | 16/16 | ✅ 100% |
| Compilation | 16/16 | ⏳ PENDING (requires test server) |

**Overall Status:** ✅ Schemas and Compact code ready for compilation

## File Locations

### Test Schemas (JSON)
```
~/.openclaw/workspace/dsl/test-schemas/
├── case1-merkle-only.json
├── case2-range-only.json
├── case3-equality-only.json
├── case4-revocation-only.json
├── case5-merkle-range.json
├── case6-merkle-equality.json
├── case7-merkle-revocation.json
├── case8-range-equality.json
├── case9-range-revocation.json
├── case10-equality-revocation.json
├── case11-merkle-range-equality.json
├── case12-merkle-range-revocation.json
├── case13-merkle-equality-revocation.json
├── case14-range-equality-revocation.json
├── case15-merkle-range-equality-revocation.json
└── case16-storage-only.json
```

### Generated Compact Code
```
~/.openclaw/workspace/dsl/test-output/
├── case1.compact
├── case2.compact
├── case3.compact
├── case4.compact
├── case5.compact
├── case6.compact
├── case7.compact
├── case8.compact
├── case9.compact
├── case10.compact
├── case11.compact
├── case12.compact
├── case13.compact
├── case14.compact
├── case15.compact
└── case16.compact
```

### Simulator Tests
```
~/.openclaw/workspace/dsl/test-simulator/cases-1-16.test.ts
```

## Use Case Descriptions

### Case 1: Merkle Only
Basic credential verification using only Merkle existence proof.
- **Fields:** GPA (uint with scale 100)
- **Proofs:** Merkle existence only
- **Circuits:** `verifyMerkleProof4()`

### Case 2: Range Only
Range proof verification without Merkle existence.
- **Fields:** GPA (uint with scale 100)
- **Proofs:** Range proof (min: 200, max: 400)
- **Circuits:** `verifyMinGpa()`, `verifyGpaRange()`

### Case 3: Equality Only
Equality proof for exact match verification (e.g., license number).
- **Fields:** licenseNumber (string)
- **Proofs:** Equality proof with Pedersen hash
- **Circuits:** `verifyLicenseNumberEquals()`, `proveLicenseNumberKnowledge()`

### Case 4: Revocation Only
Credential with revocation checking only.
- **Fields:** licenseId (string)
- **Proofs:** Merkle existence + revocation checking
- **Circuits:** `verifyMerkleProof4()`, `verifyNotRevoked()`, `updateRevocationRoot()`

### Case 5: Merkle + Range
Combined Merkle existence and range proof.
- **Fields:** GPA (uint with scale 100)
- **Proofs:** Merkle existence + range proof
- **Circuits:** `verifyMerkleProof4()`, `verifyMinGpa()`, `verifyGpaRange()`

### Case 6: Merkle + Equality
Combined Merkle existence and equality proof.
- **Fields:** licenseNumber (string)
- **Proofs:** Merkle existence + equality proof
- **Circuits:** `verifyMerkleProof4()`, `verifyLicenseNumberEquals()`

### Case 7: Merkle + Revocation
Combined Merkle existence and revocation checking.
- **Fields:** licenseId (string)
- **Proofs:** Merkle existence + revocation
- **Circuits:** `verifyMerkleProof4()`, `verifyNotRevoked()`

### Case 8: Range + Equality
Combined range and equality proofs (no Merkle).
- **Fields:** salary (uint), employeeId (string)
- **Proofs:** Range proof on salary, equality proof on employeeId
- **Circuits:** `verifyMinSalary()`, `verifyEmployeeIdEquals()`

### Case 9: Range + Revocation
Combined range proof and revocation checking.
- **Fields:** score (uint)
- **Proofs:** Range proof + revocation
- **Circuits:** `verifyMinScore()`, `verifyNotRevoked()`

### Case 10: Equality + Revocation
Combined equality proof and revocation checking.
- **Fields:** voterIdHash (string)
- **Proofs:** Equality proof + revocation
- **Circuits:** `verifyVoterIdHashEquals()`, `verifyNotRevoked()`

### Case 11: Merkle + Range + Equality
Three proof types combined (no revocation).
- **Fields:** GPA (uint), studentId (string)
- **Proofs:** Merkle existence + range proof on GPA + equality proof on studentId
- **Circuits:** `verifyMerkleProof4()`, `verifyMinGpa()`, `verifyStudentIdEquals()`

### Case 12: Merkle + Range + Revocation
Merkle, range proof, and revocation checking.
- **Fields:** licenseId (string), expirationDate (timestamp)
- **Proofs:** Merkle existence + range proof on expiration + revocation
- **Circuits:** `verifyMerkleProof4()`, `verifyMinExpirationDate()`, `verifyNotRevoked()`

### Case 13: Merkle + Equality + Revocation
Merkle, equality proof, and revocation checking.
- **Fields:** licenseNumber (string)
- **Proofs:** Merkle existence + equality proof + revocation
- **Circuits:** `verifyMerkleProof4()`, `verifyLicenseNumberEquals()`, `verifyNotRevoked()`

### Case 14: Range + Equality + Revocation
Range, equality, and revocation (no Merkle).
- **Fields:** salary (uint), employeeId (string)
- **Proofs:** Range proof on salary + equality proof on employeeId + revocation
- **Circuits:** `verifyMinSalary()`, `verifyEmployeeIdEquals()`, `verifyNotRevoked()`

### Case 15: Full (All Proofs)
All proof types combined - full-featured credential.
- **Fields:** idNumber (string), age (uint)
- **Proofs:** Merkle existence + range proof on age + equality proof on idNumber + revocation
- **Circuits:** `verifyMerkleProof4()`, `verifyMinAge()`, `verifyIdNumberEquals()`, `verifyNotRevoked()`

### Case 16: Storage Only
Storage-only fields with no verification circuits.
- **Fields:** GPA (verifiable), studentName (storage-only), graduationDate (storage-only)
- **Proofs:** Only GPA has Merkle existence proof
- **Circuits:** `verifyMerkleProof4()` - NO circuits for storage-only fields

## Running Tests

### Generate All Compact Code
```bash
cd ~/.openclaw/workspace/dsl
npm run test:generate-all
```

### Compile All Cases (Requires Test Server)
```bash
cd ~/.openclaw/workspace/dsl
npm run test:compile-all
```

Or manually on test server (52.90.215.141):
```bash
cd ~/.openclaw/workspace/dsl
for i in {1..16}; do
  compactc --skip-zk test-output/case$i.compact compiler-output/case$i/
done
```

### Run Simulator Tests
```bash
cd ~/.openclaw/workspace/dsl
npm run test:simulator
```

### Run Full Test Suite
```bash
cd ~/.openclaw/workspace/dsl
npm run test:full
```

## Simulator Test Coverage

The simulator tests (`test-simulator/cases-1-16.test.ts`) verify:

1. **Parse Success:** All 16 schemas parse without errors
2. **Code Generation:** Compact code is generated for each case
3. **Circuit Presence:** Expected circuits exist in generated code
4. **Circuit Absence:** Unwanted circuits don't exist (e.g., no range circuits in Case 1)
5. **Witness Functions:** Private witnesses are generated for verifiable fields
6. **Storage-Only Handling:** Non-verifiable fields don't generate verification code

## Adding New Test Cases

1. **Create Schema:** Add new JSON file to `test-schemas/`
2. **Update Generator:** If needed, modify `generate-all-cases.ts`
3. **Add Tests:** Add corresponding test in `test-simulator/cases-1-16.test.ts`
4. **Update Docs:** Add entry to TEST_DOCUMENTATION.md
5. **Run Tests:** Execute `npm run test:full`

## Next Steps for Compilation

To complete the testing on the test server (52.90.215.141):

1. Copy files to test server:
```bash
scp -i ~/.openclaw/workspace/CasePulse.pem -r \
  ~/.openclaw/workspace/dsl/test-output \
  ubuntu@52.90.215.141:/home/ubuntu/credvault-test/
```

2. SSH to test server and compile:
```bash
ssh -i ~/.openclaw/workspace/CasePulse.pem ubuntu@52.90.215.141
cd /home/ubuntu/credvault-test
mkdir -p compiler-output
for i in {1..16}; do
  echo "Compiling Case $i..."
  ~/.compact/bin/compactc --skip-zk test-output/case$i.compact compiler-output/case$i/
done
```

3. Verify all compiled successfully (exit code 0 for each)

---

*Generated by CredVault DSL Test Suite v1.0.0*
*Last Updated: 2025-03-13*
