// CredVault Step 2 — issuer runtime v1 (the "on in May, off after" batch tool)
// Usage:
//   npm run runtime batch           → deploy-if-needed + commit + anchor + packages v2
//   npm run runtime revoke STU-004  → revoke a credential
// One batch = ONE on-chain tx regardless of cohort size.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createUnprovenDeployTx, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  setupWalletAndProviders, loadCompiled, makeCompiledContract,
  PRIVATE_STATE_ID, initialPrivateState, projectRoot, mark, elapsed, ISSUER_SK,
} from './common';

const ISSUER_SK_BUF = Buffer.from(ISSUER_SK);
import * as C from './canonical';

const deploymentFile = path.join(projectRoot, 'data', 'deployment.json');
const packagesDir = path.join(projectRoot, 'packages');

interface StudentRecord { id: string; fullName: string; degree: string; gpa: number; courses?: C.Course[] }

function loadDeployment(): { address: string } | null {
  return fs.existsSync(deploymentFile) ? JSON.parse(fs.readFileSync(deploymentFile, 'utf-8')) : null;
}

/** Commit one student into a master leaf. Scheme v3: gpa commitment is a real
 *  persistentCommit<Uint<64>> (L1 recompute AND L2 predicates), and the
 *  student's courses form a sub-tree committed into the master leaf. */
export function commitStudent(s: StudentRecord, opts?: { transcriptMode?: 'granular' | 'monolithic' }) {
  // deterministic salts → idempotent re-batches (see canonical.kdfSalt)
  const salts = {
    fullName: C.kdfSalt(ISSUER_SK_BUF, s.id, 'fullName'),
    degree: C.kdfSalt(ISSUER_SK_BUF, s.id, 'degree'),
    gpa: C.kdfSalt(ISSUER_SK_BUF, s.id, 'gpa'),
    master: C.kdfSalt(ISSUER_SK_BUF, s.id, 'master'),
  };
  const gpaCommit = C.compactCommitUint64(s.gpa, salts.gpa);
  const commits = [
    C.fieldCommit('fullName', s.fullName, salts.fullName),
    C.fieldCommit('degree', s.degree, salts.degree),
    gpaCommit,
  ];
  // course commitment — two modes (Step 2b/2c), SAME leaf slot:
  const courses = s.courses ?? [];
  let subRoot: Buffer, courseSalts: Buffer[] = [], coursePaths: C.PathEntry[][] = [];
  let docSalt: Buffer | null = null;
  if (opts?.transcriptMode === 'monolithic') {
    // monolithic: whole transcript as ONE doc commitment (no subsets)
    docSalt = C.kdfSalt(ISSUER_SK_BUF, s.id, 'doc');
    subRoot = C.docCommit(C.canonicalTranscript(courses), docSalt);
  } else {
    // granular (default): per-course sub-tree (subset disclosure possible)
    courseSalts = courses.map((c) => C.kdfSalt(ISSUER_SK_BUF, s.id, 'course:' + c.code));
    const courseLeaves = courses.map((c, i) => C.courseLeaf(c, courseSalts[i]));
    const r = C.courseSubRoot(courseLeaves);
    subRoot = r.root;
    coursePaths = courses.map((_, i) => C.getPath(r.levels, i));
  }

  const leaf = C.masterLeafV3(commits, subRoot, salts.master);
  return { salts, gpaCommit, commits, courses, courseSalts, coursePaths, docSalt, subRoot, leaf, credId: C.credIdFromLeaf(leaf) };
}

async function connect() {
  const { walletCtx, providers } = await setupWalletAndProviders();
  const DegreeModule = await loadCompiled();
  const compiled = makeCompiledContract(DegreeModule);
  return { walletCtx, providers, compiled };
}

// Deploy WITH CAPTURE: the proven deploy tx is serialized to
// data/deploy-proof.bin so verifiers can replay it locally to reconstruct a
// ledger state WITH verifier keys (LedgerState.updateIndex drops them).
async function ensureDeployed(walletCtx: any, providers: any, compiled: any): Promise<string> {
  const existing = loadDeployment();
  if (existing) {
    // Guard against stale deployment files (e.g. copied from another machine or
    // a wiped devnet): findDeployedContract would otherwise poll FOREVER.
    const probe = await Promise.race([
      providers.publicDataProvider.queryContractState(existing.address),
      new Promise((r) => setTimeout(() => r('__timeout__'), 15000)),
    ]);
    if (probe === '__timeout__' || !probe) {
      console.log('⚠ deployment.json points to a contract not on THIS chain (' + existing.address.slice(0, 16) + '…) — redeploying fresh.');
      fs.rmSync(deploymentFile);
    } else {
      return existing.address;
    }
  }
  mark('deployStart');
  const unprovenData: any = await createUnprovenDeployTx(providers, {
    compiledContract: compiled as any,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState,
  } as any);
  mark('unproven');
  const provenTx = await providers.proofProvider.proveTx(unprovenData.private.unprovenTx);
  mark('proven');
  fs.writeFileSync(path.join(projectRoot, 'data', 'deploy-proof.bin'), Buffer.from(provenTx.serialize()));
  const address = unprovenData.public.contractAddress;
  const recipe = await walletCtx.wallet.balanceUnboundTransaction(
    provenTx,
    { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
    { ttl: new Date(Date.now() + 30 * 60 * 1000) },
  );
  const balanced = await walletCtx.wallet.finalizeRecipe(recipe);
  const txId = await walletCtx.wallet.submitTransaction(balanced);
  await providers.publicDataProvider.watchForTxData(txId);
  mark('deployed');
  fs.writeFileSync(deploymentFile, JSON.stringify({ address, deployedAt: new Date().toISOString() }, null, 2));
  console.log('✅ deployed (with capture):', address,
    '(unproven ' + elapsed('deployStart', 'unproven') + 's, prove ' + elapsed('unproven', 'proven') + 's, submit ' + elapsed('proven', 'deployed') + 's)');
  return address;
}

async function cmdBatch(cohortFile?: string) {
  const { walletCtx, providers, compiled } = await connect();
  const address = await ensureDeployed(walletCtx, providers, compiled);
  // ignore flag args (e.g. --network) when resolving the cohort file —
  // `npm run runtime batch -- --network preprod` must not treat it as a path
  const cohortPath = (cohortFile && !cohortFile.startsWith('--')) ? cohortFile : path.join(projectRoot, 'data', 'cohort.json');
  const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf-8'));
  console.log('cohort file:', path.basename(cohortPath), '—', cohort.issuer);

  const mode: 'granular' | 'monolithic' = cohort.transcriptMode === 'monolithic' ? 'monolithic' : 'granular';
  console.log('transcriptMode:', mode);
  const records = cohort.students.map((s: StudentRecord) => ({ student: s, ...commitStudent(s, { transcriptMode: mode }) }));
  const levels = C.buildTree(records.map((r) => r.leaf));
  const root = levels[levels.length - 1][0];
  console.log('cohort root:', C.toHex(root));

  // ── idempotence: is this EXACT root already anchored? (deterministic
  // salts make re-batches reproducible, so unchanged cohorts are no-ops)
  const DegreeModule = await loadCompiled();
  const pdp = providers.publicDataProvider;
  const contractState = await pdp.queryContractState(address);
  const { setHas } = await import('./verify-core');
  let alreadyAnchored = false;
  if (contractState) {
    const ls = DegreeModule.ledger(contractState.data);
    alreadyAnchored = setHas(ls.validRoots, root);
  }
  let anchoredTxId: string | null = null;

  if (alreadyAnchored) {
    console.log('⏭  root ALREADY anchored — unchanged cohort, skipping transaction (idempotent).');
  } else {
    const deployed = await findDeployedContract(providers, {
      compiledContract: compiled as any,
      contractAddress: address,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState,
    });
    mark('anchorStart');
    const tx = await (deployed as any).callTx.addCohortRoot(root);
    anchoredTxId = tx.public.txId;
    mark('anchored');
    console.log('✅ root anchored (' + records.length + ' students, ONE tx):', tx.public.txId,
      '[' + elapsed('anchorStart', 'anchored') + 's]');
  }

  fs.mkdirSync(packagesDir, { recursive: true });
  records.forEach((r, i) => {
    // preserve existing L2 proofs when the credential identity (credId) is
    // unchanged — deterministic salts make this comparison meaningful
    const pkgPath = path.join(packagesDir, r.student.id + '.package.json');
    let existingProofs: unknown[] = [];
    try {
      const old = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      // preserve proofs ONLY if both the credential identity AND the contract
      // match — L2 proofs are bound to the contract address, so after a
      // wipe+redeploy, old proofs are dead and must be re-minted
      if (old.credId === C.toHex(r.credId) && old.contractAddress === address && Array.isArray(old.l2Proofs)) existingProofs = old.l2Proofs;
    } catch { /* no prior package */ }
    const pkg = {
      schema: 'credvault-degree/0.3',
      issuer: cohort.issuer,
      cohort: cohort.cohort,
      studentId: r.student.id,
      values: { fullName: r.student.fullName, degree: r.student.degree, gpa: r.student.gpa },
      transcriptMode: mode,
      courses: mode === 'granular'
        ? r.courses.map((c, i) => ({ ...c, salt: C.toHex(r.courseSalts[i]), path: C.pathToHex(r.coursePaths[i]) }))
        : r.courses,   // monolithic: plain list, recompute blob from these
      docSalt: r.docSalt ? C.toHex(r.docSalt) : undefined,
      docCommit: mode === 'monolithic' ? C.toHex(r.subRoot) : undefined,
      courseSubRoot: mode === 'granular' ? C.toHex(r.subRoot) : undefined,
      salts: { fullName: C.toHex(r.salts.fullName), degree: C.toHex(r.salts.degree), gpa: C.toHex(r.salts.gpa), master: C.toHex(r.salts.master) },
      gpaCommit: C.toHex(r.gpaCommit),
      masterLeaf: C.toHex(r.leaf),
      credId: C.toHex(r.credId),
      path: C.pathToHex(C.getPath(levels, i)),
      cohortRoot: C.toHex(root),
      contractAddress: address,
      l2Proofs: existingProofs as unknown[],   // preserved if credId unchanged
    };
    fs.writeFileSync(path.join(packagesDir, r.student.id + '.package.json'), JSON.stringify(pkg, null, 2));
  });
  // runtime manifest
  fs.writeFileSync(path.join(projectRoot, 'data', 'manifest.json'), JSON.stringify({
    cohort: cohort.cohort, root: C.toHex(root), students: records.length,
    anchoredTx: anchoredTxId ?? '(skipped — already anchored)', anchoredAt: new Date().toISOString(), contractAddress: address,
  }, null, 2));
  console.log('✅', records.length, 'packages + manifest written');
  await walletCtx.wallet.stop();
  process.exit(0);
}

async function cmdRevoke(studentId: string) {
  const { walletCtx, providers, compiled } = await connect();
  const { address } = loadDeployment()!;
  const pkg = JSON.parse(fs.readFileSync(path.join(packagesDir, studentId + '.package.json'), 'utf-8'));
  const deployed = await findDeployedContract(providers, {
    compiledContract: compiled as any, contractAddress: address,
    privateStateId: PRIVATE_STATE_ID, initialPrivateState,
  });
  mark('revokeStart');
  const tx = await (deployed as any).callTx.revokeCredential(C.fromHex(pkg.credId));
  mark('revoked');
  console.log('✅ revoked', studentId, '[' + elapsed('revokeStart', 'revoked') + 's]');
  await walletCtx.wallet.stop();
  process.exit(0);
}

const [, , cmd, arg] = process.argv;
if (cmd === 'batch') await cmdBatch(arg);
else if (cmd === 'revoke' && arg) await cmdRevoke(arg);
else { console.log('usage: npm run runtime [batch|revoke <STU-ID>]'); process.exit(1); }
