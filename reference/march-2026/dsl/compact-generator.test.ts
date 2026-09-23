/**
 * Compact Generator Tests
 * 
 * Tests for the Compact code generator - Phase 1: Merkle Existence Proof
 */

import { parseSchema, parseSchemaStrict, SchemaAST } from './schema-parser.ts';
import { generateCompact, generateCompactToFile } from './compact-generator.ts';

// ============================================================================
// Test Schemas
// ============================================================================

// Phase 1: Basic schema with only merkle existence proof
const transcriptSchemaPhase1 = {
  sot_type: "university",
  credential_name: "transcript",
  version: "1.0.0",
  description: "Academic transcript credential",
  fields: [
    { 
      name: "gpa", 
      type: "uint", 
      scale: 100, 
      verifiable: true, 
      proofs: [{ type: "merkle_existence" }] 
    }
  ],
  merkle_tree: { 
    depth: 4, 
    hash_algorithm: "pedersen" 
  },
  revocation: { 
    enabled: false, 
    sparse_tree_depth: 160 
  }
};

// Phase 2: Schema with BOTH merkle existence AND range proofs
const transcriptSchemaPhase2 = {
  sot_type: "university",
  credential_name: "transcript",
  version: "1.0.0",
  description: "Academic transcript with GPA verification",
  fields: [
    { 
      name: "gpa", 
      type: "uint", 
      scale: 100, 
      verifiable: true, 
      proofs: [
        { type: "merkle_existence" },
        { type: "range", min: 0, max: 400, comparison: ">=" }
      ] 
    }
  ],
  merkle_tree: { 
    depth: 4, 
    hash_algorithm: "pedersen" 
  },
  revocation: { 
    enabled: false, 
    sparse_tree_depth: 160 
  }
};

// Phase 3: Schema with ALL THREE proof types (merkle, range, equality)
const transcriptSchemaPhase3 = {
  sot_type: "university",
  credential_name: "transcript",
  version: "1.0.0",
  description: "Academic transcript with GPA and student ID verification",
  fields: [
    { 
      name: "gpa", 
      type: "uint", 
      scale: 100, 
      verifiable: true, 
      proofs: [
        { type: "merkle_existence" },
        { type: "range", min: 0, max: 400, comparison: ">=" }
      ] 
    },
    { 
      name: "studentId", 
      type: "string", 
      verifiable: true, 
      proofs: [
        { type: "merkle_existence" },
        { type: "equality", hash_algorithm: "persistentHash" }
      ] 
    }
  ],
  merkle_tree: { 
    depth: 4, 
    hash_algorithm: "pedersen" 
  },
  revocation: { 
    enabled: false, 
    sparse_tree_depth: 160 
  }
};

// Phase 4: Schema with ALL FOUR proof types + revocation
const transcriptSchemaPhase4 = {
  sot_type: "university",
  credential_name: "transcript",
  version: "1.0.0",
  description: "Academic transcript with full verification and revocation",
  fields: [
    { 
      name: "gpa", 
      type: "uint", 
      scale: 100, 
      verifiable: true, 
      proofs: [
        { type: "merkle_existence" },
        { type: "range", min: 0, max: 400, comparison: ">=" }
      ] 
    },
    { 
      name: "studentId", 
      type: "string", 
      verifiable: true, 
      proofs: [
        { type: "merkle_existence" },
        { type: "equality", hash_algorithm: "persistentHash" }
      ] 
    }
  ],
  merkle_tree: { 
    depth: 4, 
    hash_algorithm: "pedersen" 
  },
  revocation: { 
    enabled: true, 
    sparse_tree_depth: 32,
    update_frequency: "batch"
  }
};

// Case 16: Schema with storage-only fields (no proofs)
const transcriptSchemaCase16 = {
  sot_type: "university",
  credential_name: "transcript",
  version: "1.0.0",
  description: "Academic transcript with storage-only fields",
  fields: [
    { 
      name: "gpa", 
      type: "uint", 
      scale: 100, 
      verifiable: true, 
      proofs: [
        { type: "merkle_existence" },
        { type: "range", min: 0, max: 400, comparison: ">=" }
      ] 
    },
    { 
      name: "studentName", 
      type: "string", 
      verifiable: false  // Case 16: Storage only
    },
    { 
      name: "graduationDate", 
      type: "timestamp", 
      verifiable: false  // Case 16: Storage only
    }
  ],
  merkle_tree: { 
    depth: 4, 
    hash_algorithm: "pedersen" 
  },
  revocation: { 
    enabled: false, 
    sparse_tree_depth: 160 
  }
};

// ============================================================================
// Test Functions
// ============================================================================

/**
 * Run all tests
 */
export async function runTests(): Promise<void> {
  console.log("🧪 Running Compact Generator Tests - ALL PHASES (1-4)\n");

  let passed = 0;
  let failed = 0;

  // ========================================
  // Phase 1 Tests (Merkle Existence)
  // ========================================
  console.log("📦 PHASE 1: Merkle Existence Proofs\n");

  // Test 1: Parse schema successfully
  try {
    console.log("Test 1: Parse Phase 1 transcript schema...");
    const result = parseSchema(transcriptSchemaPhase1);
    if (!result.success) {
      throw new Error(`Parse failed: ${result.errors.map(e => e.message).join(', ')}`);
    }
    console.log("  ✅ Schema parsed successfully\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 2: Generate Compact code (Phase 1)
  let generatedCodePhase1 = '';
  try {
    console.log("Test 2: Generate Phase 1 Compact code...");
    const ast = parseSchemaStrict(transcriptSchemaPhase1);
    generatedCodePhase1 = generateCompact(ast);
    
    // Verify code contains expected Phase 1 components
    const checks = [
      { pattern: /export struct Credential/, name: "Credential struct" },
      { pattern: /export ledger merkleRoot: Bytes<32>/, name: "merkleRoot ledger" },
      { pattern: /export ledger sotAttestation: Bytes<32>/, name: "sotAttestation ledger" },
      { pattern: /constructor\(root: Bytes<32>, attestation: Bytes<32>\)/, name: "constructor" },
      { pattern: /circuit hashPair/, name: "hashPair helper" },
      { pattern: /export circuit verifyMerkleProof4/, name: "verifyMerkleProof4 circuit" },
      { pattern: /persistentHash/, name: "persistentHash usage" },
    ];

    for (const check of checks) {
      if (!check.pattern.test(generatedCodePhase1)) {
        throw new Error(`Missing: ${check.name}`);
      }
    }
    
    console.log("  ✅ Phase 1 Compact code generated with all expected components\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 3: Verify Phase 1 code structure
  try {
    console.log("Test 3: Verify Phase 1 code structure...");
    const ast = parseSchemaStrict(transcriptSchemaPhase1);
    const code = generateCompact(ast);

    // Check for proper Vector usage with correct depth
    const vectorPattern = /Vector<4, Bytes<32>>/;
    if (!vectorPattern.test(code)) {
      throw new Error("Missing or incorrect Vector<4, Bytes<32>> for depth 4");
    }

    // Check for level-by-level hash computation
    const levelPattern = /const left0 = isRight\[0\] \? siblings\[0\] : leafHash/;
    if (!levelPattern.test(code)) {
      throw new Error("Missing level 0 hash computation");
    }

    // Check final verification
    const finalVerifyPattern = /return hash3 == merkleRoot/;
    if (!finalVerifyPattern.test(code)) {
      throw new Error("Missing final verification (hash3 == merkleRoot)");
    }

    console.log("  ✅ Phase 1 code structure is correct\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // ========================================
  // Phase 2 Tests (Range Proofs)
  // ========================================
  console.log("📦 PHASE 2: Range Proofs\n");

  // Test 4: Parse Phase 2 schema (with range proofs)
  try {
    console.log("Test 4: Parse Phase 2 schema with range proofs...");
    const result = parseSchema(transcriptSchemaPhase2);
    if (!result.success) {
      throw new Error(`Parse failed: ${result.errors.map(e => e.message).join(', ')}`);
    }
    console.log("  ✅ Phase 2 schema parsed successfully\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 5: Generate Compact code with range proofs
  let generatedCodePhase2 = '';
  try {
    console.log("Test 5: Generate Phase 2 Compact code (with range proofs)...");
    const ast = parseSchemaStrict(transcriptSchemaPhase2);
    generatedCodePhase2 = generateCompact(ast);
    
    // Verify code contains BOTH Phase 1 AND Phase 2 components
    const checks = [
      // Phase 1 components (still required)
      { pattern: /export struct Credential/, name: "Credential struct" },
      { pattern: /export ledger merkleRoot: Bytes<32>/, name: "merkleRoot ledger" },
      { pattern: /export circuit verifyMerkleProof4/, name: "verifyMerkleProof4 circuit" },
      // Phase 2 components (NEW)
      { pattern: /witness gpaValue\(\): Uint<64>/, name: "gpaValue witness" },
      { pattern: /export circuit verifyMinGpa/, name: "verifyMinGpa circuit" },
      { pattern: /export circuit verifyGpaRange/, name: "verifyGpaRange circuit" },
      { pattern: /assert\(actualValue >= minValue/, name: "min value assertion" },
      { pattern: /assert\(actualValue <= maxValue/, name: "max value assertion" },
    ];

    for (const check of checks) {
      if (!check.pattern.test(generatedCodePhase2)) {
        throw new Error(`Missing: ${check.name}`);
      }
    }
    
    console.log("  ✅ Phase 2 Compact code generated with all expected components\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 6: Verify scale factor documentation
  try {
    console.log("Test 6: Verify scale factor documentation...");
    const ast = parseSchemaStrict(transcriptSchemaPhase2);
    const code = generateCompact(ast);

    // Check for scale documentation
    const scalePattern = /scale 100/;
    if (!scalePattern.test(code)) {
      throw new Error("Missing scale factor documentation (scale 100)");
    }

    console.log("  ✅ Scale factor documentation present\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 7: Save Phase 2 generated code to file
  try {
    console.log("Test 7: Save Phase 2 generated code to file...");
    const ast = parseSchemaStrict(transcriptSchemaPhase2);
    const outputPath = './output/test-phase2.compact';
    await generateCompactToFile(ast, outputPath);
    console.log(`  ✅ Code saved to ${outputPath}\n`);
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 8: Compile the Phase 2 generated code
  try {
    console.log("Test 8: Compile Phase 2 code with compactc...");
    const compileResult = await compileCompactCode('./output/test-phase2.compact');
    if (compileResult.success) {
      console.log("  ✅ Phase 2 compilation successful\n");
      passed++;
    } else {
      throw new Error(`Compilation failed:\n${compileResult.stderr}`);
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // ========================================
  // Phase 3 Tests (Equality Proofs)
  // ========================================
  console.log("📦 PHASE 3: Equality Proofs\n");

  // Test 9: Parse Phase 3 schema (with all three proof types)
  try {
    console.log("Test 9: Parse Phase 3 schema with all proof types...");
    const result = parseSchema(transcriptSchemaPhase3);
    if (!result.success) {
      throw new Error(`Parse failed: ${result.errors.map(e => e.message).join(', ')}`);
    }
    console.log("  ✅ Phase 3 schema parsed successfully\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 10: Generate Compact code with all three proof types
  let generatedCodePhase3 = '';
  try {
    console.log("Test 10: Generate Phase 3 Compact code (all proof types)...");
    const ast = parseSchemaStrict(transcriptSchemaPhase3);
    generatedCodePhase3 = generateCompact(ast);
    
    // Verify code contains ALL THREE Phase components
    const checks = [
      // Phase 1 components (still required)
      { pattern: /export struct Credential/, name: "Credential struct" },
      { pattern: /export ledger merkleRoot: Bytes<32>/, name: "merkleRoot ledger" },
      { pattern: /export circuit verifyMerkleProof4/, name: "verifyMerkleProof4 circuit" },
      // Phase 2 components (still required)
      { pattern: /witness gpaValue\(\): Uint<64>/, name: "gpaValue witness" },
      { pattern: /export circuit verifyMinGpa/, name: "verifyMinGpa circuit" },
      { pattern: /export circuit verifyGpaRange/, name: "verifyGpaRange circuit" },
      // Phase 3 components (NEW)
      { pattern: /witness studentIdValue\(\): Bytes<256>/, name: "studentIdValue witness" },
      { pattern: /export circuit verifyStudentIdEquals/, name: "verifyStudentIdEquals circuit" },
      { pattern: /export circuit proveStudentIdKnowledge/, name: "proveStudentIdKnowledge circuit" },
      { pattern: /assert\(actualHash == expectedHash/, name: "hash equality assertion" },
    ];

    for (const check of checks) {
      if (!check.pattern.test(generatedCodePhase3)) {
        throw new Error(`Missing: ${check.name}`);
      }
    }
    
    console.log("  ✅ Phase 3 Compact code generated with all expected components\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 11: Verify no duplicate witnesses
  try {
    console.log("Test 11: Verify no duplicate witnesses...");
    const ast = parseSchemaStrict(transcriptSchemaPhase3);
    const code = generateCompact(ast);

    // Count occurrences of "witness gpaValue" - should be exactly 1
    const gpaWitnessMatches = code.match(/witness gpaValue/g);
    if (gpaWitnessMatches && gpaWitnessMatches.length > 1) {
      throw new Error(`Duplicate gpaValue witness found (${gpaWitnessMatches.length} occurrences)`);
    }

    // Count occurrences of "witness studentIdValue" - should be exactly 1
    const studentIdWitnessMatches = code.match(/witness studentIdValue/g);
    if (studentIdWitnessMatches && studentIdWitnessMatches.length > 1) {
      throw new Error(`Duplicate studentIdValue witness found (${studentIdWitnessMatches.length} occurrences)`);
    }

    console.log("  ✅ No duplicate witnesses found\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 12: Save Phase 3 generated code to file
  try {
    console.log("Test 12: Save Phase 3 generated code to file...");
    const ast = parseSchemaStrict(transcriptSchemaPhase3);
    const outputPath = './output/test-phase3.compact';
    await generateCompactToFile(ast, outputPath);
    console.log(`  ✅ Code saved to ${outputPath}\n`);
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 13: Compile the Phase 3 generated code
  try {
    console.log("Test 13: Compile Phase 3 code with compactc...");
    const compileResult = await compileCompactCode('./output/test-phase3.compact');
    if (compileResult.success) {
      console.log("  ✅ Phase 3 compilation successful\n");
      passed++;
    } else {
      throw new Error(`Compilation failed:\n${compileResult.stderr}`);
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // ========================================
  // Phase 4 Tests (Revocation - Sparse Merkle Non-Existence)
  // ========================================
  console.log("📦 PHASE 4: Revocation (Sparse Merkle Non-Existence)\n");

  // Test 14: Parse Phase 4 schema (with all proof types + revocation)
  try {
    console.log("Test 14: Parse Phase 4 schema with revocation enabled...");
    const result = parseSchema(transcriptSchemaPhase4);
    if (!result.success) {
      throw new Error(`Parse failed: ${result.errors.map(e => e.message).join(', ')}`);
    }
    console.log("  ✅ Phase 4 schema parsed successfully\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 15: Generate Compact code with all four phases
  let generatedCodePhase4 = '';
  try {
    console.log("Test 15: Generate Phase 4 Compact code (ALL phases)...");
    const ast = parseSchemaStrict(transcriptSchemaPhase4);
    generatedCodePhase4 = generateCompact(ast);
    
    // Verify code contains ALL FOUR Phase components
    const checks = [
      // Phase 1 components (still required)
      { pattern: /export struct Credential/, name: "Credential struct" },
      { pattern: /export ledger merkleRoot: Bytes<32>/, name: "merkleRoot ledger" },
      { pattern: /export circuit verifyMerkleProof4/, name: "verifyMerkleProof4 circuit" },
      // Phase 2 components (still required)
      { pattern: /witness gpaValue\(\): Uint<64>/, name: "gpaValue witness" },
      { pattern: /export circuit verifyMinGpa/, name: "verifyMinGpa circuit" },
      { pattern: /export circuit verifyGpaRange/, name: "verifyGpaRange circuit" },
      // Phase 3 components (still required)
      { pattern: /witness studentIdValue\(\): Bytes<256>/, name: "studentIdValue witness" },
      { pattern: /export circuit verifyStudentIdEquals/, name: "verifyStudentIdEquals circuit" },
      { pattern: /export circuit proveStudentIdKnowledge/, name: "proveStudentIdKnowledge circuit" },
      // Phase 4 components (NEW)
      { pattern: /export struct SparseMerkleProof/, name: "SparseMerkleProof struct" },
      { pattern: /export ledger revocationRoot: Bytes<32>/, name: "revocationRoot ledger" },
      { pattern: /Vector<32, Bytes<32>>/, name: "Vector<32, Bytes<32>> for sparse tree" },
      { pattern: /export circuit verifyNotRevoked/, name: "verifyNotRevoked circuit" },
      { pattern: /export circuit updateRevocationRoot/, name: "updateRevocationRoot circuit" },
      { pattern: /sparseHashAtLevel/, name: "sparseHashAtLevel helper" },
      { pattern: /verifySparseMerkleNonExistence/, name: "verifySparseMerkleNonExistence circuit" },
    ];

    for (const check of checks) {
      if (!check.pattern.test(generatedCodePhase4)) {
        throw new Error(`Missing: ${check.name}`);
      }
    }
    
    console.log("  ✅ Phase 4 Compact code generated with ALL expected components\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 16: Verify constructor includes revocation root
  try {
    console.log("Test 16: Verify constructor includes revocation root...");
    const ast = parseSchemaStrict(transcriptSchemaPhase4);
    const code = generateCompact(ast);

    // Check for constructor with 3 parameters (root, attestation, revokeRoot)
    const constructorPattern = /constructor\(root: Bytes<32>, attestation: Bytes<32>, revokeRoot: Bytes<32>\)/;
    if (!constructorPattern.test(code)) {
      throw new Error("Missing constructor with revocation root parameter");
    }

    // Check that revocationRoot is set in constructor
    const revocationSetPattern = /revocationRoot = disclose\(revokeRoot\)/;
    if (!revocationSetPattern.test(code)) {
      throw new Error("Missing revocationRoot initialization in constructor");
    }

    console.log("  ✅ Constructor correctly includes revocation root\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 17: Save Phase 4 generated code to file
  try {
    console.log("Test 17: Save Phase 4 generated code to file...");
    const ast = parseSchemaStrict(transcriptSchemaPhase4);
    const outputPath = './output/test-phase4.compact';
    await generateCompactToFile(ast, outputPath);
    console.log(`  ✅ Code saved to ${outputPath}\n`);
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 18: Compile the Phase 4 generated code
  try {
    console.log("Test 18: Compile Phase 4 code with compactc...");
    const compileResult = await compileCompactCode('./output/test-phase4.compact');
    if (compileResult.success) {
      console.log("  ✅ Phase 4 compilation successful\n");
      passed++;
    } else {
      throw new Error(`Compilation failed:\n${compileResult.stderr}`);
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // ========================================
  // Case 16 Tests (Storage Only - No Proofs)
  // ========================================
  console.log("📦 CASE 16: Storage Only Fields (No Proofs)\n");

  // Test 19: Parse Case 16 schema (with storage-only fields)
  try {
    console.log("Test 19: Parse Case 16 schema with storage-only fields...");
    const result = parseSchema(transcriptSchemaCase16);
    if (!result.success) {
      throw new Error(`Parse failed: ${result.errors.map(e => e.message).join(', ')}`);
    }
    console.log("  ✅ Case 16 schema parsed successfully\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 20: Generate Compact code with storage-only fields
  let generatedCodeCase16 = '';
  try {
    console.log("Test 20: Generate Case 16 Compact code (storage-only fields)...");
    const ast = parseSchemaStrict(transcriptSchemaCase16);
    generatedCodeCase16 = generateCompact(ast);
    
    // Verify code contains struct with all fields including storage-only
    const checks = [
      // All fields should be in struct
      { pattern: /export struct Credential/, name: "Credential struct" },
      { pattern: /gpa: Uint<64>/, name: "gpa field in struct" },
      { pattern: /studentName: Bytes<256>/, name: "studentName field in struct" },
      { pattern: /graduationDate: Uint<64>/, name: "graduationDate field in struct" },
      // Storage-only comment
      { pattern: /Storage only - no verification/, name: "storage-only comment" },
      // GPA should have witness and circuits (has proofs)
      { pattern: /witness gpaValue\(\): Uint<64>/, name: "gpaValue witness" },
      { pattern: /export circuit verifyMinGpa/, name: "verifyMinGpa circuit" },
      { pattern: /export circuit verifyGpaRange/, name: "verifyGpaRange circuit" },
    ];

    for (const check of checks) {
      if (!check.pattern.test(generatedCodeCase16)) {
        throw new Error(`Missing: ${check.name}`);
      }
    }
    
    // Verify storage-only fields do NOT have witnesses
    if (/witness studentNameValue\(\)/.test(generatedCodeCase16)) {
      throw new Error("Storage-only field studentName should NOT have a witness");
    }
    if (/witness graduationDateValue\(\)/.test(generatedCodeCase16)) {
      throw new Error("Storage-only field graduationDate should NOT have a witness");
    }
    
    // Verify storage-only fields do NOT have verification circuits
    if (/export circuit verifyStudentName/.test(generatedCodeCase16)) {
      throw new Error("Storage-only field studentName should NOT have verification circuits");
    }
    if (/export circuit verifyGraduationDate/.test(generatedCodeCase16)) {
      throw new Error("Storage-only field graduationDate should NOT have verification circuits");
    }
    
    console.log("  ✅ Case 16 Compact code generated correctly - storage fields present, no circuits\n");
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 21: Save Case 16 generated code to file
  try {
    console.log("Test 21: Save Case 16 generated code to file...");
    const ast = parseSchemaStrict(transcriptSchemaCase16);
    const outputPath = './output/test-case16.compact';
    await generateCompactToFile(ast, outputPath);
    console.log(`  ✅ Code saved to ${outputPath}\n`);
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Test 22: Compile the Case 16 generated code
  try {
    console.log("Test 22: Compile Case 16 code with compactc...");
    const compileResult = await compileCompactCode('./output/test-case16.compact');
    if (compileResult.success) {
      console.log("  ✅ Case 16 compilation successful\n");
      passed++;
    } else {
      throw new Error(`Compilation failed:\n${compileResult.stderr}`);
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
    failed++;
  }

  // Summary
  console.log("=".repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
}

/**
 * Compile Compact code using compactc compiler
 */
async function compileCompactCode(filePath: string): Promise<{ success: boolean; stderr: string }> {
  const command = new Deno.Command('~/.compact/bin/compactc', {
    args: ['--skip-zk', filePath, '.'],
    stdout: 'piped',
    stderr: 'piped',
  });

  const { code, stderr } = await command.output();
  const decoder = new TextDecoder();
  
  return {
    success: code === 0,
    stderr: decoder.decode(stderr),
  };
}

// ============================================================================
// Run Tests if executed directly
// ============================================================================

if (import.meta.main) {
  runTests().catch(error => {
    console.error("Test suite failed:", error);
    process.exit(1);
  });
}
