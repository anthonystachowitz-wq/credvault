#!/usr/bin/env node
// Generator CLI: schema → descriptor + issuer config + compiled contract + packages.
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { parseSchema } from '../schemas/parser.js';
import { assertValid } from '../schemas/validator.js';
import { emitDescriptor, canonicalJson } from '../schemas/descriptor.js';
import { yamlToAst } from '../schemas/yaml-adapter.js';
import { emitIssuerConfig } from '../runtime/issuer-config.js';
import { generatePackages } from '../runtime/package.js';
import { createHash } from 'node:crypto';
import { pad32 } from '../runtime/canonical.js';

function die(msg: string) { console.error(msg); process.exit(1); }

function loadSchema(path: string) {
  const text = fs.readFileSync(path, 'utf8');
  const ext = path.split('.').pop()?.toLowerCase();
  const raw = ext === 'yaml' || ext === 'yml' ? yamlToAst(yaml.load(text) as any) : JSON.parse(text);
  const schema = parseSchema(raw);
  assertValid(schema);
  return schema;
}

function sha256Hex(data: string) { return createHash('sha256').update(data).digest('hex'); }

async function main() {
  const args = process.argv.slice(2);
  const schemaFlag = args.indexOf('--schema');
  const outFlag = args.indexOf('--out');
  const cohortFlag = args.indexOf('--cohort');
  const secretFlag = args.indexOf('--issuer-secret');
  const networkFlag = args.indexOf('--network');

  if (schemaFlag < 0 || outFlag < 0) {
    console.log('Usage: npm run generate -- --schema <schema.yaml|json> --out <dir> [--cohort <cohort.json>] [--issuer-secret <hex>] [--network <undeployed|preprod|mainnet>]');
    process.exit(0);
  }

  const schemaPath = args[schemaFlag + 1];
  const outDir = args[outFlag + 1];
  const cohortPath = cohortFlag >= 0 ? args[cohortFlag + 1] : undefined;
  const network = networkFlag >= 0 ? args[networkFlag + 1] : 'undeployed';
  const issuerSecret = secretFlag >= 0
    ? Buffer.from(args[secretFlag + 1].replace(/^0x/, ''), 'hex')
    : createHash('sha256').update(pad32('credvault:dev-issuer-sk:')).digest();

  const schema = loadSchema(schemaPath);
  const descriptor = emitDescriptor(schema);
  const descriptorHash = sha256Hex(canonicalJson(descriptor));
  const issuerConfig = emitIssuerConfig(descriptor, descriptorHash, { network });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'descriptor.json'), JSON.stringify(descriptor, null, 2));
  fs.writeFileSync(path.join(outDir, 'issuer-config.json'), JSON.stringify(issuerConfig, null, 2));
  fs.writeFileSync(path.join(outDir, 'schema.ast.json'), JSON.stringify(schema, null, 2));

  // Compile universal contract
  const contractSrc = path.join(import.meta.dirname, '..', '..', 'contracts', 'anchor-core.compact');
  const contractOut = path.join(outDir, 'managed', 'anchor-core');
  fs.mkdirSync(path.dirname(contractOut), { recursive: true });
  const { execSync } = await import('node:child_process');
  try {
    execSync(`compact compile "${contractSrc}" "${contractOut}"`, { stdio: 'inherit', env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` } });
  } catch (e) {
    die('Contract compilation failed. Is compact on PATH?');
  }

  // Generate packages if cohort provided
  if (cohortPath) {
    const rawCohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
    const cohort = {
      issuer: { id: schema.name, displayName: schema.displayName },
      cohort: rawCohort.cohort,
      students: rawCohort.students.map((s: any) => ({ ...s, courseGrades: s.courses })),
    };
    // Convert scaled metric values to raw values based on descriptor scale
    for (const f of descriptor.fields) {
      if (f.kind === 'metric') {
        cohort.students = cohort.students.map((s: any) => ({ ...s, [f.name]: s[f.name] / f.scale }));
      }
    }
    const pkgs = generatePackages(descriptor, descriptorHash, cohort, issuerSecret, 'DEPLOYMENT_ADDRESS_PLACEHOLDER', network);
    const packagesDir = path.join(outDir, 'packages');
    fs.mkdirSync(packagesDir, { recursive: true });
    for (const pkg of pkgs) {
      fs.writeFileSync(path.join(packagesDir, pkg.holderRef + '.package.json'), JSON.stringify(pkg, null, 2));
    }
    console.log('✅ wrote', pkgs.length, 'packages to', packagesDir);
  }

  console.log('✅ generated artifacts in', outDir);
  console.log('   descriptor hash:', descriptorHash);
}

main().catch((e) => { console.error(e); process.exit(1); });