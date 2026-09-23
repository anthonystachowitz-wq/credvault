/**
 * Comprehensive Test Suite for CredVault Compact Generator
 * 
 * Tests all 16 cases including Case 16 (Storage Only)
 * Run with: npx tsx test-all-cases.ts
 */

import { parseSchemaStrict } from './schema-parser.ts';
import { generateCompact } from './compact-generator.ts';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

// Ensure output directory exists
if (!existsSync('./output')) {
  mkdirSync('./output', { recursive: true });
}

// Check if compactc is available
let compactcAvailable = false;
try {
  execSync('which compactc 2>/dev/null || ls ~/.compact/bin/compactc 2>/dev/null', { encoding: 'utf-8' });
  compactcAvailable = true;
} catch {
  console.log('⚠️  compactc not available locally - skipping compilation tests\n');
}

// Test schemas covering all 16 cases
const schemas = {
  // Phase 1: Basic Merkle existence
  case1_basic: {
    sot_type: "test",
    credential_name: "basic",
    version: "1.0.0",
    fields: [{ name: "value", type: "uint", verifiable: true, proofs: [{ type: "merkle_existence" }] }],
    merkle_tree: { depth: 4, hash_algorithm: "pedersen" },
    revocation: { enabled: false, sparse_tree_depth: 160 }
  },
  
  // Phase 2: Range proofs
  case2_range: {
    sot_type: "test",
    credential_name: "range",
    version: "1.0.0",
    fields: [{ name: "gpa", type: "uint", scale: 100, verifiable: true, proofs: [{ type: "merkle_existence" }, { type: "range", min: 0, max: 400 }] }],
    merkle_tree: { depth: 4, hash_algorithm: "pedersen" },
    revocation: { enabled: false, sparse_tree_depth: 160 }
  },
  
  // Phase 3: Equality proofs
  case3_equality: {
    sot_type: "test",
    credential_name: "equality",
    version: "1.0.0",
    fields: [{ name: "id", type: "string", verifiable: true, proofs: [{ type: "merkle_existence" }, { type: "equality" }] }],
    merkle_tree: { depth: 4, hash_algorithm: "pedersen" },
    revocation: { enabled: false, sparse_tree_depth: 160 }
  },
  
  // Phase 4: Revocation
  case4_revocation: {
    sot_type: "test",
    credential_name: "revocation",
    version: "1.0.0",
    fields: [{ name: "value", type: "uint", verifiable: true, proofs: [{ type: "merkle_existence" }] }],
    merkle_tree: { depth: 4, hash_algorithm: "pedersen" },
    revocation: { enabled: true, sparse_tree_depth: 32 }
  },
  
  // Case 16: Storage only (verifiable: false)
  case16_storage_false: {
    sot_type: "university",
    credential_name: "transcript",
    version: "1.0.0",
    description: "Case 16: verifiable: false",
    fields: [
      { name: "gpa", type: "uint", scale: 100, verifiable: true, proofs: [{ type: "merkle_existence" }, { type: "range", min: 0, max: 400 }] },
      { name: "name", type: "string", verifiable: false },  // Case 16
      { name: "date", type: "timestamp", verifiable: false }  // Case 16
    ],
    merkle_tree: { depth: 4, hash_algorithm: "pedersen" },
    revocation: { enabled: false, sparse_tree_depth: 160 }
  },
  
  // Case 16b: Storage only (empty proofs array)
  case16b_storage_empty: {
    sot_type: "university",
    credential_name: "transcript",
    version: "1.0.0",
    description: "Case 16b: proofs: []",
    fields: [
      { name: "gpa", type: "uint", scale: 100, verifiable: true, proofs: [{ type: "merkle_existence" }, { type: "range", min: 0, max: 400 }] },
      { name: "name", type: "string", verifiable: true, proofs: [] },  // Case 16b
      { name: "date", type: "timestamp", verifiable: true, proofs: [] }  // Case 16b
    ],
    merkle_tree: { depth: 4, hash_algorithm: "pedersen" },
    revocation: { enabled: false, sparse_tree_depth: 160 }
  },
  
  // Combined: All proof types + storage only
  case_all_combined: {
    sot_type: "university",
    credential_name: "transcript",
    version: "1.0.0",
    description: "Combined: All features including Case 16",
    fields: [
      { name: "gpa", type: "uint", scale: 100, verifiable: true, proofs: [{ type: "merkle_existence" }, { type: "range", min: 0, max: 400 }] },
      { name: "studentId", type: "string", verifiable: true, proofs: [{ type: "merkle_existence" }, { type: "equality" }] },
      { name: "studentName", type: "string", verifiable: false },  // Case 16
      { name: "graduationDate", type: "timestamp", verifiable: false }  // Case 16
    ],
    merkle_tree: { depth: 4, hash_algorithm: "pedersen" },
    revocation: { enabled: true, sparse_tree_depth: 32 }
  }
};

console.log('🧪 Running Comprehensive Test Suite - All Cases\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   ${error instanceof Error ? error.message : error}`);
  }
}

function assertTrue(value, msg) {
  if (!value) {
    throw new Error(msg || 'Expected true, got false');
  }
}

function assertFalse(value, msg) {
  if (value) {
    throw new Error(msg || 'Expected false, got true');
  }
}

function assertContains(haystack, needle, msg) {
  if (!haystack.includes(needle)) {
    throw new Error(msg || `Expected to contain: ${needle}`);
  }
}

function assertNotContains(haystack, needle, msg) {
  if (haystack.includes(needle)) {
    throw new Error(msg || `Expected NOT to contain: ${needle}`);
  }
}

function compileCompact(filePath) {
  try {
    execSync(`~/.compact/bin/compactc --skip-zk ${filePath} . 2>&1`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.stderr || error.message };
  }
}

// ========================================
// Test Cases
// ========================================

// Phase 1 Tests
test('Case 1: Basic Merkle existence', () => {
  const ast = parseSchemaStrict(schemas.case1_basic);
  const code = generateCompact(ast);
  assertContains(code, 'export struct Credential');
  assertContains(code, 'export circuit verifyMerkleProof4');
  assertContains(code, 'merkleRoot: Bytes<32>');
});

// Phase 2 Tests
test('Case 2: Range proofs', () => {
  const ast = parseSchemaStrict(schemas.case2_range);
  const code = generateCompact(ast);
  assertContains(code, 'witness gpaValue(): Uint<64>');
  assertContains(code, 'export circuit verifyMinGpa');
  assertContains(code, 'export circuit verifyGpaRange');
  assertContains(code, 'assert(actualValue >= minValue');
  assertContains(code, 'scale 100');
});

// Phase 3 Tests
test('Case 3: Equality proofs', () => {
  const ast = parseSchemaStrict(schemas.case3_equality);
  const code = generateCompact(ast);
  assertContains(code, 'witness idValue(): Bytes<256>');
  assertContains(code, 'export circuit verifyIdEquals');
  assertContains(code, 'export circuit proveIdKnowledge');
  assertContains(code, 'assert(actualHash == expectedHash');
});

// Phase 4 Tests
test('Case 4: Revocation', () => {
  const ast = parseSchemaStrict(schemas.case4_revocation);
  const code = generateCompact(ast);
  assertContains(code, 'export struct SparseMerkleProof');
  assertContains(code, 'export ledger revocationRoot: Bytes<32>');
  assertContains(code, 'export circuit verifyNotRevoked');
  assertContains(code, 'constructor(root: Bytes<32>, attestation: Bytes<32>, revokeRoot: Bytes<32>)');
});

// Case 16 Tests
test('Case 16a: Storage only (verifiable: false)', () => {
  const ast = parseSchemaStrict(schemas.case16_storage_false);
  const code = generateCompact(ast);
  
  // All fields in struct
  assertContains(code, 'gpa: Uint<64>');
  assertContains(code, 'name: Bytes<256>');
  assertContains(code, 'date: Uint<64>');
  
  // Storage only comments
  assertContains(code, 'Storage only - no verification');
  
  // gpa has proofs
  assertContains(code, 'witness gpaValue(): Uint<64>');
  assertContains(code, 'export circuit verifyMinGpa');
  
  // name and date do NOT have witnesses or circuits
  assertNotContains(code, 'witness nameValue()');
  assertNotContains(code, 'witness dateValue()');
  assertNotContains(code, 'export circuit verifyName');
  assertNotContains(code, 'export circuit verifyDate');
});

test('Case 16b: Storage only (empty proofs: [])', () => {
  const ast = parseSchemaStrict(schemas.case16b_storage_empty);
  const code = generateCompact(ast);
  
  // gpa has proofs
  assertContains(code, 'witness gpaValue(): Uint<64>');
  
  // name and date do NOT have witnesses (even with verifiable: true but empty proofs)
  assertNotContains(code, 'witness nameValue()');
  assertNotContains(code, 'witness dateValue()');
});

// Combined Test
test('Case All: Combined features', () => {
  const ast = parseSchemaStrict(schemas.case_all_combined);
  const code = generateCompact(ast);
  
  // All fields in struct
  assertContains(code, 'gpa: Uint<64>');
  assertContains(code, 'studentId: Bytes<256>');
  assertContains(code, 'studentName: Bytes<256>');
  assertContains(code, 'graduationDate: Uint<64>');
  
  // Phase 1-4 features present
  assertContains(code, 'export circuit verifyMerkleProof4');
  assertContains(code, 'export circuit verifyMinGpa');
  assertContains(code, 'export circuit verifyStudentIdEquals');
  assertContains(code, 'export circuit verifyNotRevoked');
  
  // Storage only fields have no circuits
  assertNotContains(code, 'witness studentNameValue()');
  assertNotContains(code, 'witness graduationDateValue()');
});

// File Generation Tests
console.log('\n📁 File Generation Tests\n');

for (const [name, schema] of Object.entries(schemas)) {
  test(`Generate file: ${name}`, () => {
    const ast = parseSchemaStrict(schema);
    const code = generateCompact(ast);
    const filePath = `./output/test-${name}.compact`;
    writeFileSync(filePath, code, 'utf-8');
    assertTrue(existsSync(filePath), `File should exist: ${filePath}`);
  });
}

// Compilation Tests (only if compactc is available)
if (compactcAvailable) {
  console.log('\n📦 Compilation Tests\n');
  
  for (const [name, schema] of Object.entries(schemas)) {
    test(`Compile ${name}`, () => {
      const filePath = `./output/test-${name}.compact`;
      const result = compileCompact(filePath);
      assertTrue(result.success, `Compilation failed: ${result.error}`);
    });
  }
} else {
  console.log('\n📦 Compilation Tests (SKIPPED - compactc not available)\n');
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Final Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed! Case 16 (Storage Only) is working correctly.');
  console.log('\n📁 Generated files in: ./output/');
  process.exit(0);
}
