#!/usr/bin/env node
/**
 * Compile all generated Compact test cases using compactc
 * Usage: node --experimental-strip-types compile-all-cases.ts
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

const TEST_OUTPUT_DIR = './test-output';
const COMPILER_OUTPUT_DIR = './compiler-output';

interface CompileResult {
  caseNumber: number;
  success: boolean;
  output: string;
  error?: string;
}

async function compileCase(caseNumber: number): Promise<CompileResult> {
  const inputFile = path.join(TEST_OUTPUT_DIR, `case${caseNumber}.compact`);
  const outputDir = path.join(COMPILER_OUTPUT_DIR, `case${caseNumber}`);
  
  console.log(`\n[Case ${caseNumber}] Compiling...`);
  
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    // Run compactc compiler
    const result = execSync(
      `~/.compact/bin/compactc --skip-zk "${inputFile}" "${outputDir}"`,
      { encoding: 'utf-8', timeout: 60000 }
    );
    
    console.log(`  ✓ Compilation successful`);
    
    return {
      caseNumber,
      success: true,
      output: result
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Compilation failed`);
    console.error(`     ${errorMessage.substring(0, 200)}...`);
    
    return {
      caseNumber,
      success: false,
      output: '',
      error: errorMessage
    };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('CredVault Test Case Compiler');
  console.log('Compiling all 16 generated Compact contracts');
  console.log('='.repeat(60));
  
  // Ensure output directory exists
  await fs.mkdir(COMPILER_OUTPUT_DIR, { recursive: true });
  
  const results: CompileResult[] = [];
  
  for (let i = 1; i <= 16; i++) {
    const result = await compileCase(i);
    results.push(result);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Compilation Summary');
  console.log('='.repeat(60));
  
  let successCount = 0;
  let failCount = 0;
  
  for (const result of results) {
    const status = result.success ? '✓ PASS' : '❌ FAIL';
    console.log(`Case ${result.caseNumber.toString().padStart(2)}: ${status}`);
    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log('-'.repeat(60));
  console.log(`Total:  16`);
  console.log(`Passed: ${successCount} ✓`);
  console.log(`Failed: ${failCount} ❌`);
  
  if (failCount > 0) {
    console.log('\nFailed cases:');
    for (const result of results.filter(r => !r.success)) {
      console.log(`  Case ${result.caseNumber}: ${result.error?.substring(0, 100)}...`);
    }
    process.exit(1);
  }
}

main();
