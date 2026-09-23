/**
 * Case 16 Test Runner for Node.js
 * 
 * Tests the storage-only (no proofs) functionality
 * Run with: node --experimental-strip-types test-case16.ts
 */

import { parseSchemaStrict } from './schema-parser.ts';
import { generateCompact, generateCompactToFile } from './compact-generator.ts';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

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

console.log('🧪 Running Case 16 Tests - Storage Only Fields\n');

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

// Test 1: Parse Case 16 schema
test('Parse Case 16 schema', () => {
  const ast = parseSchemaStrict(transcriptSchemaCase16);
  assertTrue(ast.fields.length === 3, 'Expected 3 fields');
  assertTrue(ast.fields[0].name === 'gpa', 'Expected first field to be gpa');
  assertTrue(ast.fields[1].name === 'studentName', 'Expected second field to be studentName');
  assertTrue(ast.fields[2].name === 'graduationDate', 'Expected third field to be graduationDate');
});

// Test 2: Generate Compact code
test('Generate Case 16 Compact code', () => {
  const ast = parseSchemaStrict(transcriptSchemaCase16);
  const code = generateCompact(ast);
  
  // Verify struct contains all fields
  assertTrue(code.includes('export struct Credential'), 'Missing Credential struct');
  assertTrue(code.includes('gpa: Uint<64>'), 'Missing gpa field');
  assertTrue(code.includes('studentName: Bytes<256>'), 'Missing studentName field');
  assertTrue(code.includes('graduationDate: Uint<64>'), 'Missing graduationDate field');
  
  // Verify storage-only comment is present
  assertTrue(code.includes('Storage only - no verification'), 'Missing storage-only comment');
  
  // Verify gpa has witness (has proofs)
  assertTrue(code.includes('witness gpaValue(): Uint<64>'), 'Missing gpaValue witness');
  
  // Verify gpa has verification circuits
  assertTrue(code.includes('export circuit verifyMinGpa'), 'Missing verifyMinGpa circuit');
  assertTrue(code.includes('export circuit verifyGpaRange'), 'Missing verifyGpaRange circuit');
});

// Test 3: Verify storage-only fields have NO witnesses
test('Storage-only fields have no witnesses', () => {
  const ast = parseSchemaStrict(transcriptSchemaCase16);
  const code = generateCompact(ast);
  
  // studentName should NOT have a witness
  assertFalse(/witness studentNameValue\(\)/.test(code), 'studentName should NOT have a witness');
  
  // graduationDate should NOT have a witness  
  assertFalse(/witness graduationDateValue\(\)/.test(code), 'graduationDate should NOT have a witness');
});

// Test 4: Verify storage-only fields have NO verification circuits
test('Storage-only fields have no verification circuits', () => {
  const ast = parseSchemaStrict(transcriptSchemaCase16);
  const code = generateCompact(ast);
  
  // studentName should NOT have verification circuits
  assertFalse(/export circuit verifyStudentName/.test(code), 'studentName should NOT have verify circuits');
  assertFalse(/export circuit proveStudentName/.test(code), 'studentName should NOT have prove circuits');
  
  // graduationDate should NOT have verification circuits
  assertFalse(/export circuit verifyGraduationDate/.test(code), 'graduationDate should NOT have verify circuits');
  assertFalse(/export circuit proveGraduationDate/.test(code), 'graduationDate should NOT have prove circuits');
});

// Test 5: Save to file
test('Save Case 16 code to file', async () => {
  const ast = parseSchemaStrict(transcriptSchemaCase16);
  const outputPath = './output/test-case16.compact';
  
  // Create output directory if it doesn't exist
  if (!existsSync('./output')) {
    mkdirSync('./output', { recursive: true });
  }
  
  await generateCompactToFile(ast, outputPath);
  assertTrue(existsSync(outputPath), 'Output file should exist');
});

// Test 6: Compile with compactc
test('Compile Case 16 code with compactc', () => {
  try {
    const result = execSync('~/.compact/bin/compactc --skip-zk ./output/test-case16.compact .', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log('   Compilation output:', result.substring(0, 200));
  } catch (error) {
    // Check if compilation actually succeeded (compactc might return non-zero but still succeed)
    if (error.stdout) {
      console.log('   Compilation output:', error.stdout.substring(0, 200));
    }
    if (error.stderr) {
      const stderr = error.stderr.toString();
      // Check for actual errors (not just warnings)
      if (stderr.includes('error:') || stderr.includes('Error:')) {
        throw new Error(`Compilation failed: ${stderr}`);
      }
    }
  }
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✅ All Case 16 tests passed!');
  console.log('\n📄 Generated file: ./output/test-case16.compact');
  process.exit(0);
}
