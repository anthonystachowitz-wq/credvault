// =============================================================================
// REFERENCE: deploy-transcript-v2.ts - Transcript Contract Deployment v2
// SOURCE: /home/ubuntu/credvault-contract/src/deploy/deploy-transcript-v2.ts
// STATUS: Working reference implementation (CURRENT)
// USE CASE: Deploy transcript contract with commitment pattern and witnesses
// =============================================================================

// Test deployment script for CredVault - Transcript Contract v2 with Commitment Pattern
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, InMemoryTransactionHistoryStorage, PublicKey, createKeystore, UnshieldedKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import * as ledger from '@midnight-ntwrk/ledger-v7';
import { deployContract, DeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { pathToFileURL } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { Buffer } from 'buffer';
import crypto from 'crypto';
import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;
import * as Rx from 'rxjs';

// Import witnesses for transcript contract
import { witnesses, TranscriptPrivateState } from './witnesses.js';

// Network configuration for Preprod
const networkConfig = {
  networkId: 'preprod',
  node: 'http://localhost:9944',
  indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  proofServer: 'http://localhost:6300',
};

// Parse command line arguments
const args = process.argv.slice(2);

function parseArg(flag: string, defaultValue: string): string {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return defaultValue;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

// Show help
if (hasFlag('--help') || hasFlag('-h')) {
  console.log('CredVault Transcript Contract Deployment (v2 with Commitment)');
  console.log('');
  console.log('Usage:');
  console.log('  npx tsx deploy-transcript.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --student <file>      Student data JSON file (default: student-STU-2024-001.json)');
  console.log('  --args <json>         Constructor arguments as JSON array [root, attestation, gpaCommitment]');
  console.log('  --seed <seed>         Wallet seed (or use MIDNIGHT_WALLET_SEED env var)');
  console.log('  --help, -h            Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  # Deploy with default student (STU-2024-001)');
  console.log('  npx tsx deploy-transcript.ts --seed $MIDNIGHT_WALLET_SEED');
  console.log('');
  console.log('  # Deploy with specific student');
  console.log('  npx tsx deploy-transcript.ts --student student-STU-2024-002.json --seed $MIDNIGHT_WALLET_SEED');
  console.log('');
  process.exit(0);
}

// CONFIGURABLE: Contract configuration for transcript
const CONTRACT_NAME = 'transcript';
const CONTRACT_OUTPUT = 'transcript-output';
const ZK_CONFIG_PATH = path.resolve(process.cwd(), CONTRACT_OUTPUT);

// Parse student data file
const studentFile = parseArg('--student', 'student-STU-2024-001.json');
const studentPath = path.join('student-packages', studentFile);

// Load student data if available
let studentData: any = null;
let initialPrivateState: TranscriptPrivateState = { gpa: 0n, salt: new Uint8Array(32) };
let constructorArgs: any[] = [];

// Helper function to convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Helper function to convert bytes to hex string
function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper function to compute GPA commitment
// In production, this should match the circuit's commitment calculation
function computeGpaCommitment(gpa: bigint, salt: Uint8Array): Uint8Array {
  // Simple hash of GPA + salt for testing
  // In production, use the same hashing as the circuit
  const gpaBytes = Buffer.alloc(4);
  gpaBytes.writeUInt32BE(Number(gpa), 0);
  const hash = crypto.createHash('sha256');
  hash.update(gpaBytes);
  hash.update(salt);
  return new Uint8Array(hash.digest());
}

if (fs.existsSync(studentPath)) {
  console.log('Loading student data from:', studentPath);
  studentData = JSON.parse(fs.readFileSync(studentPath, 'utf8'));
  
  // Extract GPA and convert to bigint
  const gpa = BigInt(studentData.transcript.gpa);
  
  // Generate a random salt for the student
  const salt = crypto.randomBytes(32);
  
  initialPrivateState = { gpa, salt };
  console.log('Student GPA:', studentData.transcript.gpa, '->', gpa.toString(), '(as bigint)');
  console.log('Generated salt:', bytesToHex(salt).slice(0, 20) + '...');
  
  // Compute GPA commitment
  const gpaCommitment = computeGpaCommitment(gpa, salt);
  console.log('GPA Commitment:', bytesToHex(gpaCommitment).slice(0, 20) + '...');
  
  // Extract leafHash for constructor
  const leafHashHex = studentData.leafHash;
  const leafHashBytes = hexToBytes(leafHashHex);
  
  // Load SOT attestation
  const sotAttestationPath = path.join('student-packages', 'sot-attestation.json');
  let attestationBytes: Uint8Array;
  
  if (fs.existsSync(sotAttestationPath)) {
    const sotData = JSON.parse(fs.readFileSync(sotAttestationPath, 'utf8'));
    attestationBytes = hexToBytes(sotData.attestationHash);
    console.log('Loaded SOT attestation from:', sotAttestationPath);
  } else {
    // Use dummy attestation if not found
    attestationBytes = new Uint8Array(32).fill(0x99);
    console.log('Warning: SOT attestation not found, using dummy value');
  }
  
  // Constructor args: root, attestation, gpaCommitment
  constructorArgs = [leafHashBytes, attestationBytes, gpaCommitment];
  console.log('Leaf Hash:', leafHashHex);
} else {
  console.log('Student file not found:', studentPath);
  console.log('Using manual constructor arguments...');
  
  // Parse constructor arguments from command line
  const argsFlag = parseArg('--args', '[]');
  try {
    const parsed = JSON.parse(argsFlag);
    constructorArgs = parsed.map((v: any) => {
      if (typeof v === 'number') return BigInt(v);
      if (typeof v === 'string' && v.startsWith('0x')) {
        return hexToBytes(v);
      }
      return v;
    });
  } catch (e) {
    console.error('Invalid constructor arguments JSON:', argsFlag);
    process.exit(1);
  }
}

console.log('Deploying contract:', CONTRACT_NAME);
console.log('Contract output path:', ZK_CONFIG_PATH);
console.log('Constructor args count:', constructorArgs.length);

// Key derivation using selectRole (singular) - same as check-balance.ts
function deriveKeys(seedHex: string): { zswap: Uint8Array; nightExternal: Uint8Array; dust: Uint8Array } {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');

  const accountKey = hdWallet.hdWallet.selectAccount(0);
  
  const zswapResult = accountKey.selectRole(Roles.Zswap).deriveKeyAt(0);
  const nightResult = accountKey.selectRole(Roles.NightExternal).deriveKeyAt(0);
  const dustResult = accountKey.selectRole(Roles.Dust).deriveKeyAt(0);
  
  if (zswapResult.type !== 'keyDerived' || nightResult.type !== 'keyDerived' || dustResult.type !== 'keyDerived') {
    throw new Error('Key derivation failed');
  }

  return {
    zswap: zswapResult.key,
    nightExternal: nightResult.key,
    dust: dustResult.key,
  };
}

// Initialize wallet with seed
async function initializeWallet(seedHex: string) {
  console.log('Creating wallet from seed...');
  
  setNetworkId(networkConfig.networkId);
  const networkId = getNetworkId();
  
  const keys = deriveKeys(seedHex);
  console.log('Keys derived successfully');
  
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const unshieldedKeystore = createKeystore(keys.nightExternal, networkId);

  const walletConfig = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: networkConfig.indexer,
      indexerWsUrl: networkConfig.indexerWS
    },
    provingServerUrl: new URL(networkConfig.proofServer),
    relayURL: new URL(networkConfig.node.replace(/^http/, 'ws')),
  };

  console.log('Creating shielded wallet...');
  const ShieldedWalletClass = ShieldedWallet(walletConfig);
  const shieldedWallet = ShieldedWalletClass.startWithSecretKeys(shieldedSecretKeys);

  console.log('Creating unshielded wallet...');
  const unshieldedWallet = UnshieldedWallet({
    networkId,
    indexerClientConnection: walletConfig.indexerClientConnection,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));

  console.log('Creating dust wallet...');
  const dustWallet = DustWallet({
    ...walletConfig,
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5
    },
  }).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust);

  console.log('Creating wallet facade...');
  const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
  
  console.log('Starting wallet...');
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  console.log('Waiting for wallet to sync (up to 5 minutes)...');
  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.filter((s) => s.isSynced),
      Rx.timeout({ first: 300000 })
    )
  );

  console.log('Wallet synced successfully');
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, shieldedWallet };
}

// Load and compile contract with witnesses
async function loadContract() {
  const contractPath = path.join(ZK_CONFIG_PATH, 'contract', 'index.js');
  if (!fs.existsSync(contractPath)) {
    throw new Error('Contract not compiled at: ' + contractPath);
  }

  console.log('Loading compiled contract...');
  const { Contract } = await import(pathToFileURL(contractPath).href);
  
  // Create contract instance WITH witnesses
  const compiledContract = CompiledContract.make(CONTRACT_NAME, Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  return compiledContract;
}

// Sign transaction intents workaround for wallet SDK bug
function signTransactionIntents(
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof'
): void {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize<
      ledger.SignatureEnabled,
      ledger.Proofish,
      ledger.PreBinding
    >('signature', proofMarker, 'pre-binding', intent.serialize());
    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);
    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: any, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: any, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
}

// Create wallet and midnight provider
async function createWalletAndMidnightProvider(
  facade: WalletFacade,
  shieldedSecretKeys: ledger.ZswapSecretKeys,
  dustSecretKey: ledger.DustSecretKey,
  unshieldedKeystore: UnshieldedKeystore
) {
  // Wait for sync to get the public keys from wallet state
  const state = await Rx.firstValueFrom(
    facade.state().pipe(Rx.filter((s) => s.isSynced))
  );

  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await facade.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
      );
      const signFn = (payload: Uint8Array) => unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      }
      return facade.finalizeRecipe(recipe);
    },
    submitTx(tx: any) {
      return facade.submitTransaction(tx) as any;
    },
  };
}

// Deploy contract
async function deploy(
  wallet: WalletFacade,
  shieldedSecretKeys: ledger.ZswapSecretKeys,
  dustSecretKey: ledger.DustSecretKey,
  unshieldedKeystore: UnshieldedKeystore,
  compiledContract: any,
  constructorArgs: any[],
  initialPrivateState: TranscriptPrivateState
): Promise<DeployedContract<any>> {
  console.log('Deploying contract...');
  console.log('Initial private state - GPA:', initialPrivateState.gpa.toString());
  console.log('Initial private state - Salt:', bytesToHex(initialPrivateState.salt).slice(0, 20) + '...');
  
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(
    wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore
  );

  const zkConfigProvider = new NodeZkConfigProvider(ZK_CONFIG_PATH);
  
  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: CONTRACT_NAME + '-state',
      walletProvider: walletAndMidnightProvider,
    }),
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };

  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: CONTRACT_NAME + '-state',
    initialPrivateState,
    args: constructorArgs,
  });

  return deployed;
}

// Main function
async function main() {
  console.log('='.repeat(60));
  console.log('CredVault Transcript Contract Deployment (v2)');
  console.log('='.repeat(60));

  // Get seed from command line or environment
  const seed = parseArg('--seed', process.env.MIDNIGHT_WALLET_SEED || '');
  if (!seed) {
    console.error('Missing wallet seed. Use --seed <seed> or set MIDNIGHT_WALLET_SEED environment variable');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  console.log('Network: preprod');
  console.log('Node:', networkConfig.node);
  console.log('Proof Server:', networkConfig.proofServer);
  console.log('');

  try {
    const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = await initializeWallet(seed);
    const compiledContract = await loadContract();
    
    console.log('Constructor Args: [merkleRoot, attestation, gpaCommitment]');
    console.log('');

    const deployed = await deploy(
      wallet, 
      shieldedSecretKeys, 
      dustSecretKey, 
      unshieldedKeystore, 
      compiledContract, 
      constructorArgs,
      initialPrivateState
    );

    console.log('\n' + '='.repeat(60));
    console.log('Deployment Successful!');
    console.log('='.repeat(60));
    console.log('Contract Address:', deployed.deployTxData.public.contractAddress);
    console.log('Transaction Hash:', deployed.deployTxData.public.txId);
    console.log('='.repeat(60));

    const deploymentInfo = {
      network: 'preprod',
      contractName: CONTRACT_NAME,
      contractAddress: deployed.deployTxData.public.contractAddress,
      deployTxHash: deployed.deployTxData.public.txId,
      timestamp: new Date().toISOString(),
      studentFile: studentFile,
      gpa: initialPrivateState.gpa.toString(),
      salt: bytesToHex(initialPrivateState.salt),
    };
    const outputFile = `deployment-info-${CONTRACT_NAME}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(deploymentInfo, null, 2));
    console.log('Deployment info saved to:', outputFile);

    // Stop wallet to clean up connections and exit cleanly
    console.log('Stopping wallet...');
    await wallet.stop();
    console.log('Wallet stopped. Exiting.');

  } catch (error) {
    console.error('\nDeployment failed:', error);
    process.exit(1);
  }
}

main();
