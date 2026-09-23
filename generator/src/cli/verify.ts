#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPresentation } from '../runtime/verify-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const descriptorFlag = args.indexOf('--descriptor');
const packageFlag = args.indexOf('--package');

if (descriptorFlag < 0 || packageFlag < 0) {
  console.log('Usage: npx tsx src/cli/verify.ts --descriptor <descriptor.json> --package <package.json>');
  process.exit(0);
}

const descriptorPath = args[descriptorFlag + 1];
const packagePath = args[packageFlag + 1];

const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

async function main() {
  // Use step1-degree's setup so WASM classes match the contract module
  const step1 = await import(path.join(__dirname, '..', '..', '..', 'step1-degree', 'src', 'common.ts'));
  const { providers } = await step1.setupWalletAndProviders();
  const Module = await step1.loadCompiled();

  const result = await verifyPresentation(
    descriptor,
    pkg,
    (addr) => providers.publicDataProvider.queryContractState(addr),
    async () => Module
  );
  console.log(result.verdict, '-', result.detail, '(', result.ms, 'ms)');
  process.exit(result.verdict === 'VERIFIED' ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
