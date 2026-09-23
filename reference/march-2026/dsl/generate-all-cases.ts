#!/usr/bin/env node
/**
 * Generate Compact code for all 16 test cases
 * Usage: node --experimental-strip-types generate-all-cases.ts
 */

import { parseSchema } from './schema-parser.ts';
import { generateCompact } from './compact-generator.ts';
import * as fs from 'fs/promises';
import * as path from 'path';

const TEST_SCHEMAS_DIR = './test-schemas';
const TEST_OUTPUT_DIR = './test-output';

interface TestCase {
  number: number;
  name: string;
  file: string;
}

const testCases: TestCase[] = [
  { number: 1, name: 'Merkle Only', file: 'case1-merkle-only.json' },
  { number: 2, name: 'Range Only', file: 'case2-range-only.json' },
  { number: 3, name: 'Equality Only', file: 'case3-equality-only.json' },
  { number: 4, name: 'Revocation Only', file: 'case4-revocation-only.json' },
  { number: 5, name: 'Merkle + Range', file: 'case5-merkle-range.json' },
  { number: 6, name: 'Merkle + Equality', file: 'case6-merkle-equality.json' },
  { number: 7, name: 'Merkle + Revocation', file: 'case7-merkle-revocation.json' },
  { number: 8, name: 'Range + Equality', file: 'case8-range-equality.json' },
  { number: 9, name: 'Range + Revocation', file: 'case9-range-revocation.json' },
  { number: 10, name: 'Equality + Revocation', file: 'case10-equality-revocation.json' },
  { number: 11, name: 'Merkle + Range + Equality', file: 'case11-merkle-range-equality.json' },
  { number: 12, name: 'Merkle + Range + Revocation', file: 'case12-merkle-range-revocation.json' },
  { number: 13, name: 'Merkle + Equality + Revocation', file: 'case13-merkle-equality-revocation.json' },
  { number: 14, name: 'Range + Equality + Revocation', file: 'case14-range-equality-revocation.json' },
  { number: 15, name: 'Merkle + Range + Equality + Revocation', file: 'case15-merkle-range-equality-revocation.json' },
  { number: 16, name: 'Storage Only', file: 'case16-storage-only.json' },
];

async function generateCase(testCase: TestCase): Promise<boolean> {
  try {
    const schemaPath = path.join(TEST_SCHEMAS_DIR, testCase.file);
    const outputPath = path.join(TEST_OUTPUT_DIR, `case${testCase.number}.compact`);
    
    console.log(`\n[Case ${testCase.number}] ${testCase.name}`);
    console.log(`  Reading: ${schemaPath}`);
    
    // Read and parse schema
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);
    
    // Parse with DSL parser
    const result = parseSchema(schema);
    
    if (!result.success || !result.ast) {
      console.error(`  ❌ Parse failed:`);
      for (const error of result.errors) {
        console.error(`     - ${error.path}: ${error.message}`);
      }
      return false;
    }
    
    console.log(`  ✓ Parsed successfully`);
    
    // Generate Compact code
    const code = generateCompact(result.ast);
    console.log(`  ✓ Generated ${code.split('\n').length} lines of Compact code`);
    
    // Write output
    await fs.writeFile(outputPath, code, 'utf-8');
    console.log(`  ✓ Written: ${outputPath}`);
    
    return true;
  } catch (error) {
    console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('CredVault Test Case Generator');
  console.log('Generating Compact code for all 16 use cases');
  console.log('='.repeat(60));
  
  // Ensure output directory exists
  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  
  let successCount = 0;
  let failCount = 0;
  
  for (const testCase of testCases) {
    const success = await generateCase(testCase);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Generation Summary');
  console.log('='.repeat(60));
  console.log(`Total:  ${testCases.length}`);
  console.log(`Passed: ${successCount} ✓`);
  console.log(`Failed: ${failCount} ❌`);
  
  if (failCount > 0) {
    process.exit(1);
  }
}

main();
