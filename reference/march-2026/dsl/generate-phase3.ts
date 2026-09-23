/**
 * Phase 3 Test Generator - Node.js version
 * Generates test-phase3.compact for compilation testing
 */

import { parseSchemaStrict } from './schema-parser.ts';
import { generateCompact, generateCompactToFile } from './compact-generator.ts';

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

async function main() {
  console.log("🧪 Phase 3 Test Generator\n");
  console.log("Generating Compact code with all three proof types...\n");

  try {
    // Parse schema
    const ast = parseSchemaStrict(transcriptSchemaPhase3);
    console.log("✅ Schema parsed successfully");

    // Generate code
    const code = generateCompact(ast);
    console.log("✅ Compact code generated");

    // Verify Phase 1 components
    const checks = [
      { pattern: /export struct Credential/, name: "Credential struct (Phase 1)" },
      { pattern: /export ledger merkleRoot: Bytes<32>/, name: "merkleRoot ledger (Phase 1)" },
      { pattern: /export circuit verifyMerkleProof4/, name: "verifyMerkleProof4 circuit (Phase 1)" },
      { pattern: /witness gpaValue\(\): Uint<64>/, name: "gpaValue witness (Phase 2)" },
      { pattern: /export circuit verifyMinGpa/, name: "verifyMinGpa circuit (Phase 2)" },
      { pattern: /export circuit verifyGpaRange/, name: "verifyGpaRange circuit (Phase 2)" },
      { pattern: /witness studentIdValue\(\): Bytes<256>/, name: "studentIdValue witness (Phase 3)" },
      { pattern: /export circuit verifyStudentIdEquals/, name: "verifyStudentIdEquals circuit (Phase 3)" },
      { pattern: /export circuit proveStudentIdKnowledge/, name: "proveStudentIdKnowledge circuit (Phase 3)" },
    ];

    console.log("\n📋 Verifying all components:\n");
    for (const check of checks) {
      if (check.pattern.test(code)) {
        console.log(`  ✅ ${check.name}`);
      } else {
        console.log(`  ❌ ${check.name}`);
        process.exit(1);
      }
    }

    // Verify no duplicate witnesses
    const gpaWitnessMatches = code.match(/witness gpaValue/g);
    const studentIdWitnessMatches = code.match(/witness studentIdValue/g);
    
    if (gpaWitnessMatches && gpaWitnessMatches.length > 1) {
      console.log(`\n  ❌ Duplicate gpaValue witness found (${gpaWitnessMatches.length} occurrences)`);
      process.exit(1);
    }
    
    if (studentIdWitnessMatches && studentIdWitnessMatches.length > 1) {
      console.log(`\n  ❌ Duplicate studentIdValue witness found (${studentIdWitnessMatches.length} occurrences)`);
      process.exit(1);
    }

    console.log("\n✅ No duplicate witnesses found");

    // Save to file
    const outputPath = './output/test-phase3.compact';
    await generateCompactToFile(ast, outputPath);
    console.log(`\n✅ Code saved to ${outputPath}`);

    console.log("\n📄 Generated code preview (first 100 lines):\n");
    const lines = code.split('\n');
    console.log(lines.slice(0, 100).join('\n'));
    console.log("\n... (truncated)\n");

    console.log("🎉 Phase 3 generation complete!");
    console.log("\nNext step: Compile with compactc --skip-zk on the test server");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
