// CredVault Step 1 — issuer CLI (mock Penn State)
// Usage:
//   npm run issuer deploy          → deploy the contract
//   npm run issuer add-cohort      → anchor the cohort root on-chain + emit packages
//   npm run issuer revoke STU-004  → revoke one credential
import * as fs from 'node:fs';
import * as path from 'node:path';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  setupWalletAndProviders, loadCompiled, makeCompiledContract,
  PRIVATE_STATE_ID, initialPrivateState, projectRoot, mark, marks, elapsed,
} from './common';
import * as C from './canonical';

const deploymentFile = path.join(projectRoot, 'data', 'deployment.json');
const packagesDir = path.join(projectRoot, 'packages');

function saveDeployment(address: string) {
  fs.writeFileSync(deploymentFile, JSON.stringify({ address, deployedAt: new Date().toISOString() }, null, 2));
}
function loadDeployment(): { address: string } {
  return JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'));
}

async function connect() {
  const { walletCtx, providers } = await setupWalletAndProviders();
  const DegreeModule = await loadCompiled();
  const compiled = makeCompiledContract(DegreeModule);
  return { walletCtx, providers, DegreeModule, compiled };
}

async function cmdDeploy() {
  const { walletCtx, providers, compiled } = await connect();
  mark('deployStart');
  const deployed = await deployContract(providers, {
    compiledContract: compiled as any,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState,
  });
  mark('deployed');
  const address = deployed.deployTxData.public.contractAddress;
  saveDeployment(address);
  console.log('\n✅ Contract deployed:', address);
  console.log('   deploy tx (incl. constructor proving):', elapsed('deployStart', 'deployed') + 's');
  await walletCtx.wallet.stop();
  process.exit(0);
}

async function cmdAddCohort() {
  const { walletCtx, providers, compiled } = await connect();
  const cohort = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'cohort.json'), 'utf-8'));
  const { address } = loadDeployment();

  // 1. Commit every student into a master leaf (off-chain, OUR canonical scheme)
  const records = cohort.students.map((s: any) => {
    const fieldSalts = { fullName: C.newSalt(), degree: C.newSalt(), gpa: C.newSalt() };
    const masterSalt = C.newSalt();
    const commits = [
      C.fieldCommit('fullName', s.fullName, fieldSalts.fullName),
      C.fieldCommit('degree', s.degree, fieldSalts.degree),
      C.fieldCommit('gpa', s.gpa, fieldSalts.gpa),
    ];
    const leaf = C.masterLeaf(commits, masterSalt);
    return { student: s, fieldSalts, masterSalt, leaf, credId: C.credIdFromLeaf(leaf) };
  });

  // 2. Build the cohort tree
  const levels = C.buildTree(records.map((r: any) => r.leaf));
  const root = levels[levels.length - 1][0];
  console.log('cohort root:', C.toHex(root));

  // 3. Anchor the root on-chain (THE proving benchmark for a real circuit)
  const deployed = await findDeployedContract(providers, {
    compiledContract: compiled as any,
    contractAddress: address,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState,
  });
  mark('addStart');
  const tx = await (deployed as any).callTx.addCohortRoot(root);
  mark('added');
  console.log('✅ root anchored. txId:', tx.public.txId);
  console.log('   addCohortRoot FULL TX LOOP (real circuit):', elapsed('addStart', 'added') + 's');

  // 4. Emit one proof package per student
  fs.mkdirSync(packagesDir, { recursive: true });
  records.forEach((r: any, i: number) => {
    const pkg = {
      schema: 'credvault-degree/0.1',
      issuer: cohort.issuer,
      cohort: cohort.cohort,
      studentId: r.student.id,
      values: { fullName: r.student.fullName, degree: r.student.degree, gpa: r.student.gpa },
      salts: {
        fullName: C.toHex(r.fieldSalts.fullName),
        degree: C.toHex(r.fieldSalts.degree),
        gpa: C.toHex(r.fieldSalts.gpa),
        master: C.toHex(r.masterSalt),
      },
      masterLeaf: C.toHex(r.leaf),
      credId: C.toHex(r.credId),
      path: C.pathToHex(C.getPath(levels, i)),
      cohortRoot: C.toHex(root),
      contractAddress: address,
    };
    fs.writeFileSync(path.join(packagesDir, r.student.id + '.package.json'), JSON.stringify(pkg, null, 2));
  });
  console.log('✅ wrote', records.length, 'packages to packages/');
  await walletCtx.wallet.stop();
  process.exit(0);
}

async function cmdRevoke(studentId: string) {
  const { walletCtx, providers, compiled } = await connect();
  const { address } = loadDeployment();
  const pkg = JSON.parse(fs.readFileSync(path.join(packagesDir, studentId + '.package.json'), 'utf-8'));

  const deployed = await findDeployedContract(providers, {
    compiledContract: compiled as any,
    contractAddress: address,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState,
  });
  mark('revokeStart');
  const tx = await (deployed as any).callTx.revokeCredential(C.fromHex(pkg.credId));
  mark('revoked');
  console.log('✅ revoked', studentId, '(credId', pkg.credId.slice(0, 16) + '…). txId:', tx.public.txId);
  console.log('   revokeCredential FULL TX LOOP:', elapsed('revokeStart', 'revoked') + 's');
  await walletCtx.wallet.stop();
  process.exit(0);
}

const [, , cmd, arg] = process.argv;
if (cmd === 'deploy') await cmdDeploy();
else if (cmd === 'add-cohort') await cmdAddCohort();
else if (cmd === 'revoke' && arg) await cmdRevoke(arg);
else {
  console.log('usage: npm run issuer [deploy|add-cohort|revoke <STU-ID>]');
  process.exit(1);
}
