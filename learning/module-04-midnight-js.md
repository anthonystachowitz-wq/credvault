# Module 4: Midnight.js — The SDK That Talks to the Chain

> Time: ~6 hours | Prerequisites: Modules 2–3 (the devnet runs; you can read degree.compact); TypeScript: async/await, objects, imports.

You know the stack (Module 2) and the language (Module 3). Now the glue: **Midnight.js**, the TypeScript SDK your application code actually touches. Everything CredVault does — deploy, anchor, revoke, verify, pre-mint proofs — is Midnight.js calls. This module teaches the SDK the way the codebase uses it: the provider model, the transaction pipeline, wallets, private state, and the two war stories (`StateValue` and the ledger decode) that will save you days.

## Learning objectives

When you finish this module, you can:

- **Name the 7 providers**, state what each one does, and wire them from scratch.
- **Narrate the transaction pipeline** — local execution -> prove -> balance -> submit -> watch — including what runs on your laptop vs. the proof server vs. the node vs. the indexer, and what each stage costs in time.
- **Build a wallet**: seed -> HD derivation -> three child wallets -> facade -> sync, and read its NIGHT and DUST balances.
- **Explain private state**: what it is, where it lives, how it's encrypted, and the `setContractAddress` rule.
- **Diagnose** `expected instance of StateValue` and fix it with npm overrides + dedupe (and explain *why* the fix works).
- **Read contract state** through the indexer and decode it with the compiled contract's `ledger()` — defensively.
- **Write and run** a script that deploys/calls a contract end-to-end.

## 1. Concepts from scratch

### 1.1 The 7-provider model — pluggable everything

Midnight.js is built on one idea: **every capability your DApp needs is an injectable provider object.** You don't configure a monolith; you assemble seven small objects, each with one job, and pass them as a bundle (conventionally called `providers`) into every SDK call.

```
MidnightProviders
├── privateStateProvider   your local, encrypted vault for secrets      (LevelDB)
├── publicDataProvider     reads the chain through the indexer          (GraphQL)
├── zkConfigProvider       serves the compiled ZK artifacts (keys/zkir) (filesystem or HTTP)
├── proofProvider          turns unproven txs into proven txs           (local proof server)
├── walletProvider         balances + signs txs (fees, keys)
├── midnightProvider       submits txs to the node
└── loggerProvider         optional diagnostics (Pino)
```

Why a provider model? Because each piece has *swappable implementations*: the proof provider can talk to a local proof server (our setup) or to a browser wallet's DApp Connector; the zkConfig provider reads from disk in Node (`NodeZkConfigProvider`) or fetches over HTTP in a browser (`FetchZkConfigProvider`); the private state provider could be LevelDB today and something else tomorrow. Your application code never changes — only the wiring.

The interfaces live in `@midnight-ntwrk/midnight-js-types`; the implementations are separate packages. Here is the *actual* wiring CredVault uses (`step1-degree/src/common.ts`), which you'll recognize piece by piece by the end of this module:

```typescript
const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
return {
  privateStateProvider: levelPrivateStateProvider({
    privateStateStoreName: 'step1-degree-state',
    accountId: walletCtx.unshieldedKeystore.getBech32Address().toString(),
    privateStoragePasswordProvider: () => privateStatePassword,
  }),
  publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
  zkConfigProvider,
  proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
  walletProvider,
  midnightProvider: walletProvider,   // same object: it both balances AND submits
};
```

Note the last two lines: in a Node.js script, the wallet IS the submitter, so one object serves both roles. (In a browser DApp, a wallet extension would fill them instead.)

### 1.2 The providers, one by one

**privateStateProvider — your encrypted vault.** Contracts have secrets (witness values); those live in *private state*, kept on YOUR machine, never on-chain. The LevelDB implementation encrypts it at rest (AES-256-GCM, key derived from your password with PBKDF2-SHA256, 600k iterations) and isolates stores per wallet account (`accountId`). Two hard rules from the field: the **password must be at least 16 characters** (the SDK enforces it), and — the gotcha that cost us real debugging time — **you must call `setContractAddress()` before `set()`** when writing private state manually (our pre-minting script does exactly that, line by line, in section 1.6).

**publicDataProvider — your eyes.** Everything the indexer knows: `queryContractState(address)` (current state of one contract), `watchForTxData(txId)` (wait for a transaction to finalize), `watchForContractState`/`contractStateObservable` (live updates). Our whole verifier — the 0.1 s employer check — is this provider plus hash recomputation. No wallet needed for reads.

**zkConfigProvider — the artifact librarian.** Knows where the compiled contract's prover keys, verifier keys, and ZKIR live. In Node: point `NodeZkConfigProvider` at `contracts/managed/degree` (the directory the compiler made in Module 3's lab). The proof provider consults it automatically.

**proofProvider — the proving client.** Sends unproven transactions to the local proof server (:6300) and returns proven ones. One call you'll use constantly: `proofProvider.proveTx(unprovenTx)`.

**walletProvider — the money handler.** Three jobs: hand out the wallet's public keys (`getCoinPublicKey`, `getEncryptionPublicKey`), **balance** transactions (`balanceTx` — add fee payment in DUST plus any token change), and **sign**. In Midnight.js 4.1.x the key getters return key *objects* (not hex strings — that changed across versions; see the obsolescence table in ARCHITECTURE.md §13).

**midnightProvider — the courier.** `submitTx(tx)` — hands the finalized transaction to the node. Same object as walletProvider in our wiring because the wallet submits what it balances.

**loggerProvider — optional.** A Pino logger for SDK internals. Skip it until you're debugging the SDK itself.

### 1.3 CompiledContract — where Compact meets TypeScript

In Module 3 you compiled `degree.compact` and got `contracts/managed/degree/contract/index.js`. Midnight.js wraps that generated module in a `CompiledContract`, and THIS is where the Compact witnesses get their TypeScript bodies:

```typescript
const witnesses = {
  issuerSecretKey: (ctx) => [ctx.privateState, ctx.privateState.issuerSk],
  gpaValue:        (ctx) => [ctx.privateState, ctx.privateState.gpa ?? 0n],
  gpaSalt:         (ctx) => [ctx.privateState, ctx.privateState.gpaSalt ?? new Uint8Array(32)],
};
const compiled = CompiledContract.make('degree', DegreeModule.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);
```

Read the witness shape carefully: each witness receives a **context** (`ctx` — which carries the current private state and ledger view) and returns a **tuple: [newPrivateState, witnessValue]**. `issuerSecretKey` reads the issuer's secret out of private state and hands it to the circuit; the private state passes through unchanged. When `verifyMinGPA` is proven, `gpaValue`/`gpaSalt` supply the actual GPA and salt — set into private state beforehand (section 1.6 shows the pre-mint script doing it).

(A contract with NO witnesses, like hello-world, uses `CompiledContract.withVacantWitnesses` instead — you'll see that in the lab.)

### 1.4 The transaction pipeline — the five stages every call goes through

This is the heart of the module. Every on-chain action — deploy, anchor, revoke — flows through the same five stages. Learn them with the real timings from our benchmarks (`undeployed`, proof-server 8.1.0, a real circuit: ~20–25 s total):

```
 YOUR LAPTOP                PROOF SERVER (:6300)          NODE (:9944)            INDEXER (:8088)
 ─────────────              ─────────────────────         ─────────────           ───────────────
 1. LOCAL EXECUTION
    circuit runs against
    current state; witnesses
    supply secrets
    -> UnprovenTransaction
         |
 2. PROVE  ----------------> proof server builds the
    proofProvider.proveTx    ZK proof (~2 s raw)
         |                   -> ProvenTransaction
 3. BALANCE
    wallet adds DUST fee
    payment + change,
    signs, stamps TTL
    -> FinalizedTransaction
         |
 4. SUBMIT  ------------------------------------------->  enters mempool,
    midnightProvider.submitTx                             included in a block
         |                                                (~6 s heartbeat)
 5. WATCH   ------------------------------------------------------------------>  tx appears in
    publicDataProvider.watchForTxData                       indexed state
    -> txId, blockHeight
```

What each stage really does:

1. **Local execution** — the compact-runtime runs your circuit *on your machine*, against a local copy of the contract state, with your witnesses feeding secrets. Output: an **UnprovenTransaction** — "here's the state transition I claim is valid."
2. **Prove** — the proof server turns that claim into a ZK proof. Raw proving of our small circuits is **1.7–2.5 s** — much faster than people expect (the March-era fear was 1–2 *minutes* on proof-server 7.0.0; re-benchmarking killed that ghost).
3. **Balance** — the wallet adds the fee: a DUST spend covering the transaction's cost, plus change back to you, and stamps a **TTL** (a *submission window* — see the TTL note below). This is the stage that fails with `Not enough Dust` when your DUST hasn't accrued (Module 2, section 1.6).
4. **Submit** — the transaction goes to the node and waits for block inclusion. Blocks every ~6 s; realistically this plus finalization is where most of the ~20 s goes.
5. **Watch** — `watchForTxData(txId)` polls the indexer until the transaction is final and returns its public data (`txId`, `blockHeight`, status). Your app now *knows* it landed.

**The punchline for application design:** the whole ~20–25 s is *fixed overhead*, not per-circuit cost — deploy (21.5 s), anchor a 5-student cohort (22.1 s), and revoke (24.8 s) all cost the same, and 10,000 students would anchor in the same single ~22 s transaction. Meanwhile reads are ~0.1 s. This asymmetry — expensive writes, instant reads — is exactly why CredVault's design has the issuer write once per graduation batch and everyone else only read. (And it's why proof *pre-minting* works: raw proving is ~2 s of offline CPU.)

**Two API styles for the same pipeline:**
- **All-in-one (the usual):** `deployContract(providers, {...})` runs every stage including proving the constructor; `deployed.callTx.myCircuit(args)` runs all five stages and returns the final result. You'll use this 95% of the time.
- **Stage-by-stage (when you need control):** `createUnprovenDeployTx`/`createUnprovenCallTx`, then `proofProvider.proveTx` yourself, then `wallet.balanceUnboundTransaction` -> `finalizeRecipe` -> `submitTransaction` -> `watchForTxData`. Our issuer runtime uses this to *capture the proven deploy transaction to disk* (`data/deploy-proof.bin`) so verifiers can replay it later — see `src/runtime.ts`, the `ensureDeployed` function, which is the best stage-by-stage reference in the codebase.

> **The TTL note (from the Step-2b "TTL saga," ARCHITECTURE.md §16).** Transactions carry a time-to-live, but it is a **submission window**, not a "proof expires" concept: midnight-js stamps intents with ~1 hour; our walletProvider passes `now + 30 min`. The ledger checks TTL against a *block time argument* at validation — which is why the off-chain L2 proof verifier in `src/l2.ts` validates with `tblock = mint time`, making long-lived proof artifacts possible. Moral: when you see TTL, ask "which clock, and which window?"

### 1.5 Wallets — one seed, three wallets, a facade

A Midnight "wallet" is really **three child wallets** wearing one trenchcoat (the `WalletFacade`), because the chain has three kinds of state:

| Child wallet | Holds | Key type |
|---|---|---|
| **Shielded** (Zswap) | shielded tokens, the shielded coin/encryption keys | `ZswapSecretKeys` |
| **Unshielded** | NIGHT (always unshielded, always public) | a keystore (`createKeystore`) |
| **Dust** | your DUST capacity (fees) | `DustSecretKey` |

The key-derivation path (from `src/wallet.ts`, and worth reading line by line once):

```typescript
const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
const result = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);
// result.type === 'keysDerived' -> result.keys[Roles.Zswap], [Roles.NightExternal], [Roles.Dust]
const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
const dustSecretKey      = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);
```

That's **hierarchical deterministic (HD) derivation**: one seed deterministically produces role-separated keys (Zswap = shielded role, NightExternal = unshielded NIGHT role, Dust = fee role). Version-drift alert: the March-era API was singular (`selectRole(r).deriveKeyAt(0)`); today it's plural (`selectRoles([...]).deriveKeysAt(0)` returning `keysDerived`). This rename alone broke half the archived code — another entry in the "patterns yes, pins no" file.

**Seeds and phrases.** On public networks, wallets are **BIP-39 mnemonic-first**: a 24-word phrase -> 64-byte seed via `mnemonicToSeed` (NOT `mnemonicToEntropy` — both "work" and produce *different* wallets; the code comments in `network.ts` shout about this because Lace, the browser wallet, derives the same way, so phrases interchange). On `undeployed` there's no ceremony: the genesis seed is the constant `0000...0001`, pre-funded and pre-registered for DUST.

**Sync.** A wallet learns its state from the indexer (that's why `globalThis.WebSocket = WebSocket` must be set in Node — the wallet syncs over the indexer's WebSocket, and Node has no built-in WebSocket). `await wallet.waitForSyncedState()` blocks until the wallet has caught up: ~0.5 s on the devnet with a restored state file, longer on first sync or public networks. Our `createWallet` also *restores* each child from `.midnight-wallet-state/` and falls back to fresh sync if restore fails — that's why your second run is instant.

**Reading balances — the two idioms you'll type forever:**

```typescript
const state = await walletCtx.wallet.waitForSyncedState();
const tNight = state.unshielded.balances[unshieldedToken().raw] ?? 0n;  // NIGHT is THE unshielded token
const dust   = state.dust.balance(new Date());                          // DUST is a time-projection
```

NIGHT is unshielded, so it lives in the unshielded child's balance map, keyed by the raw identifier of the built-in unshielded token type (`unshieldedToken().raw` — the `.raw` matters). DUST is different in kind: it's a *projection* of what your registered NIGHT has generated **as of a timestamp**, which is why you pass `new Date()` — and why on a fresh devnet the wallet's projected balance can run ~1 block ahead of what the tx-builder is allowed to spend (the 6-second sleep in our deploy script exists to close exactly that gap).

### 1.6 Private state — the encrypted vault, up close

Where do witness values *live* between calls? In **private state**: a per-contract, per-account document store on your disk, encrypted with your password. In the project directory it's the `midnight-level-db/` folder (LevelDB); it's keyed by a `privateStateId` string your app chooses (`'credvaultDegreeState'` for us) and scoped to your wallet address (`accountId`).

The canonical write, from our proof pre-minter (`src/premint-l2.ts`) — the script that loads each student's GPA + salt into private state so the `gpaValue`/`gpaSalt` witnesses can feed them to `verifyMinGPA`:

```typescript
await providers.privateStateProvider.setContractAddress(pkg.contractAddress);  // RULE: address first
await providers.privateStateProvider.set(PRIVATE_STATE_ID, {
  issuerSk: initialPrivateState.issuerSk,
  gpa: BigInt(pkg.values.gpa),
  gpaSalt: new Uint8Array(C.fromHex(pkg.salts.gpa)),
});
// now createUnprovenCallTx will find these in ctx.privateState when the witnesses run
```

Forget the `setContractAddress` line and your `set` goes to the wrong (or no) contract slot — the state simply isn't there when the witness reads it, and you debug a ghost. This is a recorded gotcha (ARCHITECTURE.md §15): respect the order.

### 1.7 War story: `expected instance of StateValue` and the npm override

The single most valuable debugging lesson in this module — because it WILL happen to you on a fresh install.

**The symptom (Step 0, 2026-09-03):** everything compiles, the devnet is healthy, the wallet syncs — and `callTx` throws `expected instance of StateValue`.

**The cause:** two packages in your dependency tree need the on-chain runtime (a WASM module): `compact-runtime@0.16.0` declares `onchain-runtime-v3: ^3.0.0` and npm helpfully resolves that to **3.1.0** (published *after* the compatibility matrix), while `midnight-js-protocol@4.1.1` pins exactly **3.0.0**. npm installs **both**. Now two copies of the same WASM runtime exist in memory — and WASM classes don't do `instanceof` across copies. A `StateValue` created by copy A is literally not an `instanceof StateValue` as far as copy B is concerned. The check fails, and the error tells you nothing about versions.

**The fix (three moves, now baked into both projects' package.json):**

```json
"overrides": { "@midnight-ntwrk/onchain-runtime-v3": "3.0.0" }
```

```bash
npm install && npm dedupe
# verify EXACTLY ONE copy, version 3.0.0:
node -e "const l=require('./package-lock.json');
for (const [k,v] of Object.entries(l.packages))
  if (k.includes('onchain-runtime')) console.log(k, '->', v.version)"
# must print: node_modules/@midnight-ntwrk/onchain-runtime-v3 -> 3.0.0   (one line only)
```

`overrides` forces every request for the package to 3.0.0; `dedupe` collapses the tree to one hoisted copy; the one-liner proves it. **Morals: (1) the compatibility matrix is law, and packages published after it can silently break you; (2) `instanceof` across duplicated WASM packages is a lie — when you see an impossible type error, count your copies first; (3) verify with the lockfile, not vibes.** (The same lesson, generalized, appears in the L2 work: WASM classes don't survive crossing package boundaries at all — bridge them with `serialize()`/`deserialize()`.)

### 1.8 Reading state through the indexer — and the Set-shape gotcha

Writes need the full pipeline. Reads are refreshingly simple — this is the *entire* pattern, from our verifier (`src/verify-core.ts`):

```typescript
const pdp = indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS);
const contractState = await pdp.queryContractState(contractAddress);  // indexer -> ContractState
const ledgerState = DegreeModule.ledger(contractState.data);          // decode with the compiled contract
// ledgerState.authority, ledgerState.validRoots, ledgerState.revoked — typed ledger fields
```

Three steps: query the indexer (no wallet, no account — this is why employer verification is accountless and 0.1 s), get the raw state, decode it with the generated `ledger()` function from YOUR compiled contract (Module 3's `contract/index.js`). The decoded object mirrors your Compact ledger declarations.

**The gotcha:** the *shape* of a decoded ADT is not documented. A `Set<Bytes<32>>` might surface with a `.member()` method, as an iterable, as a `Map`, or as a plain object, depending on versions and paths. Our answer is the defensive `setHas` helper in `src/verify-core.ts` — it tries all four shapes before giving up. Copy that helper's attitude: when decoding ledger ADTs, never assume; probe. (This is also why the *architecture* prefers comparing raw values where possible — the fewer ADT methods you depend on, the fewer shapes you defend against.)

## 2. Hands-on lab

**Where:** `apps/credvault/step0-hello/` (Labs 2.1–2.2) and `apps/credvault/step1-degree/` (Lab 2.3). Devnet up: `cd step0-hello && docker compose ps` — three healthy containers.

### Lab 2.1 — Read the step0-driver like a circuit diagram

Run it, then map every printed line to a pipeline stage:

```bash
cd /home/anthony/midnight/apps/credvault/step0-hello
npx tsx src/step0-driver.ts
```

```
wallet address: mn_addr_undeployed1...
tNight: 250,000,000,000,000
DUST: <nonzero>
connected to contract: 20311ad6088ccbbe772431735d0cc9b945931480e80a4b2697cb6547e7bcd444
stored message. txId: 001f54c8... block: 26439
read back: "CredVault says hello from the devnet"
=== STEP-0 BENCHMARKS (undeployed, proof-server 8.1.0) ===
wallet create + sync (restored): 0.5s
connect (findDeployedContract):   0.4s
storeMessage FULL TX LOOP:        ~17-20s
read (indexer query + decode):    <0.1s
```

Now open `src/step0-driver.ts` (115 lines) and annotate it. With section 1.4 fresh, you should be able to point at:

- The one line that is **stages 1–5 in a single call** (`deployed.callTx.storeMessage(message)`).
- Where each provider from section 1.2 is constructed.
- The `globalThis.WebSocket` line and why it exists (section 1.5).
- The walletProvider object — notice `balanceUnboundTransaction` + `finalizeRecipe`, the wallet-sdk 1.x balancing path.
- The read path at the bottom — `queryContractState` + `HelloWorld.ledger(...)`, exactly section 1.8.
- `CompiledContract.withVacantWitnesses` — hello-world has no witnesses (section 1.3).

**Check yourself:** which line number talks to the proof server? (Trick question — none directly; the *proofProvider* does, inside `callTx`. The driver only wires it.) You may see `RPC-CORE ... disconnected ... Normal Closure` warnings during sync — harmless noise from the node's WebSocket cycling; our deploy script's comments call this out as expected.

### Lab 2.2 — Write `my-call.ts`: your first transaction, written by you

Create `src/my-call.ts` in `step0-hello`. Requirements: connect to the already-deployed hello-world contract, store a message taken from the command line, print the txId and block height, read the message back through the indexer. Use this skeleton — every `TODO` is one to three lines, and the sections map 1:1 to the module:

```typescript
// src/my-call.ts — YOUR first Midnight transaction.
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { resolveNetwork, getOrCreateWallet, getDeployment } from './network';
import { createWallet } from './wallet';

// TODO 1: the WebSocket shim (one line — section 1.5 says why)

const PRIVATE_STATE_ID = 'helloWorldPrivateState';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'hello-world');

// TODO 2: resolve network, get the seed, and load the deployment record
//         (resolveNetwork(), getOrCreateWallet(network), getDeployment(network))
//         throw 'no deployment on file — run: npm run deploy' if missing

// TODO 3: import contracts/managed/hello-world/contract/index.js dynamically,
//         then CompiledContract.make(...).pipe(withVacantWitnesses, withCompiledFileAssets(...))

// TODO 4: createWallet({network, networkConfig, seed}) and waitForSyncedState()

// TODO 5: build the 6 providers (copy the shape from step0-driver.ts — that's allowed;
//         understanding each line as you copy is the exercise)

// TODO 6: findDeployedContract(providers, { compiledContract, contractAddress, privateStateId,
//         initialPrivateState: {} }) and log 'connected:'

// TODO 7: const message = process.argv[2] ?? 'module 4 was here';
//         time the deployed.callTx.storeMessage(message) call; log txId + blockHeight

// TODO 8: queryContractState + HelloWorld.ledger(...) + Buffer.from(...).toString()
//         log 'read back:' — then wallet.stop() and process.exit(0)
```

Run it: `npx tsx src/my-call.ts "hello from <your name>"` — expect ~17–20 s for stage 7 and your message back in stage 8.

<details><summary>Full solution (try for 30 minutes before opening)</summary>

```typescript
// src/my-call.ts — YOUR first Midnight transaction.
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { resolveNetwork, getOrCreateWallet, getDeployment } from './network';
import { createWallet } from './wallet';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const PRIVATE_STATE_ID = 'helloWorldPrivateState';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'hello-world');

const { network, config: networkConfig } = resolveNetwork();
const { seed } = getOrCreateWallet(network);
const deployment = getDeployment(network);
if (!deployment) throw new Error('no deployment on file — run: npm run deploy');

const HelloWorld = await import(pathToFileURL(path.join(zkConfigPath, 'contract', 'index.js')).href);
const compiledContract = CompiledContract.make('hello-world', HelloWorld.Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

const walletCtx = await createWallet({ network, networkConfig, seed });
await walletCtx.wallet.waitForSyncedState();

const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';
const walletProvider = {
  getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
  getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
  async balanceTx(tx: any, ttl?: Date) {
    const recipe = await walletCtx.wallet.balanceUnboundTransaction(
      tx,
      { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
      { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
    );
    return walletCtx.wallet.finalizeRecipe(recipe);
  },
  submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
};
const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
const providers = {
  privateStateProvider: levelPrivateStateProvider({
    privateStateStoreName: 'hello-world-state',
    accountId: walletCtx.unshieldedKeystore.getBech32Address().toString(),
    privateStoragePasswordProvider: () => privateStatePassword,
  }),
  publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
  zkConfigProvider,
  proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
  walletProvider,
  midnightProvider: walletProvider,
};

const deployed: any = await findDeployedContract(providers, {
  compiledContract: compiledContract as any,
  contractAddress: deployment.address,
  privateStateId: PRIVATE_STATE_ID,
  initialPrivateState: {},
});
console.log('connected:', deployment.address);

const message = process.argv[2] ?? 'module 4 was here';
const t0 = Date.now();
const tx = await deployed.callTx.storeMessage(message);
console.log('stored in', ((Date.now() - t0) / 1000).toFixed(1) + 's. txId:', tx.public.txId, 'block:', tx.public.blockHeight);

const state = await providers.publicDataProvider.queryContractState(deployment.address);
const ledgerState = HelloWorld.ledger(state.data);
console.log('read back:', JSON.stringify(Buffer.from(ledgerState.message).toString()));

await walletCtx.wallet.stop();
process.exit(0);
```

Verified output against the live devnet: `connected: 20311ad6...`, `stored in 17.3s. txId: 001f54c8... block: 26439`, `read back: "hello from the module-4 lab test"`.

</details>

### Lab 2.3 — Read the LIVE degree contract's anchors

Now the same read pattern against the real degree contract. Create `src/read-degree.ts` in `step1-degree`: load `data/deployment.json` for the address, query the state, decode it, and answer two questions — is the manifest's cohort root anchored, and is STU-004's credId revoked? Use `setHas` from `src/verify-core.ts` for the Set membership checks (section 1.8's gotcha — do NOT call `.member()` directly).

```bash
cd /home/anthony/midnight/apps/credvault/step1-degree
npx tsx src/read-degree.ts
```

<details><summary>Solution + verified output</summary>

```typescript
// src/read-degree.ts — read the degree contract's anchors through the indexer.
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { networkConfig, loadCompiled, projectRoot } from './common';
import { setHas } from './verify-core';
import * as C from './canonical';

const { address } = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'deployment.json'), 'utf-8'));
const pdp = indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS);
const contractState = await pdp.queryContractState(address);
if (!contractState) throw new Error('contract not found');

const DegreeModule = await loadCompiled();
const ledgerState = DegreeModule.ledger(contractState.data);

const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'manifest.json'), 'utf-8'));
const pkg4 = JSON.parse(fs.readFileSync(path.join(projectRoot, 'packages', 'STU-004.package.json'), 'utf-8'));
console.log('contract:', address);
console.log('authority:', Buffer.from(ledgerState.authority).toString('hex'));
console.log('manifest root anchored?', setHas(ledgerState.validRoots, C.fromHex(manifest.root)));
console.log('STU-004 revoked?', setHas(ledgerState.revoked, C.fromHex(pkg4.credId)));
process.exit(0);
```

Verified output:

```
contract: c3b82a86c2b4fe3b2414caef250008731c79b45e93ec0edcca7faf2867325d92
authority: e041f7465efb527df170df1b39e6c1b11547cda6d3ea700453930ce5e81977fa
manifest root anchored? true
STU-004 revoked? true
```

</details>

Look at what you just did: a **trustless, accountless read of a live contract** — the exact mechanic that lets an employer verify a diploma in 0.1 s with no wallet. No transaction, no DUST, no proof: indexer query + decode + compare.

## 3. Exercises

**Exercise 1 (provider triage).** Which provider handles each task? (a) "prove this transaction"; (b) "has my transaction finalized?"; (c) "store the student's GPA where the witness can find it"; (d) "add the DUST fee to this transaction"; (e) "where are the prover keys for `verifyMinGPA`?"; (f) "hand this finalized transaction to the network."

<details><summary>Solution</summary>

(a) proofProvider (`proveTx`). (b) publicDataProvider (`watchForTxData`). (c) privateStateProvider (`setContractAddress` then `set`). (d) walletProvider (`balanceTx`). (e) zkConfigProvider (`NodeZkConfigProvider` pointed at `contracts/managed/degree`). (f) midnightProvider (`submitTx` — same object as the walletProvider in our wiring).

</details>

**Exercise 2 (pipeline ordering + geography).** Put the stages in order and label where each runs (laptop / proof server / node / indexer): balance, local execution, prove, submit, watch-for-finalization.

<details><summary>Solution</summary>

local execution (laptop: compact-runtime + witnesses) -> prove (proof server, ~2 s raw) -> balance (laptop: wallet adds DUST fee + signs + TTL) -> submit (node: mempool -> block inclusion) -> watch (indexer: `watchForTxData` confirms finality).

</details>

**Exercise 3 (the StateValue diagnosis).** A teammate clones `step1-degree`, runs `npm install`, and gets `expected instance of StateValue` on their first `callTx`. `npm ls @midnight-ntwrk/onchain-runtime-v3` shows TWO versions: 3.0.0 and 3.1.0. Explain the root cause in two sentences and give the three-part fix.

<details><summary>Solution</summary>

Root cause: `compact-runtime@0.16.0`'s `^3.0.0` range resolved to 3.1.0 (published after the matrix) while `midnight-js-protocol@4.1.1` pins 3.0.0, so two WASM runtime copies are installed — and `instanceof` fails across WASM package copies, so a StateValue made by one copy is rejected by the other. Fix: (1) add `"overrides": {"@midnight-ntwrk/onchain-runtime-v3": "3.0.0"}` to package.json; (2) `npm install && npm dedupe`; (3) verify via the lockfile one-liner that exactly ONE hoisted 3.0.0 remains.

</details>

**Exercise 4 (wallet archaeology).** This March-2026 snippet is dead. Rewrite it for wallet-sdk 1.2.0, and name every change:

```typescript
const hd = HDWallet.fromSeed(seedBytes);
const zk = hd.hdWallet.selectAccount(0).selectRole(Roles.Zswap).deriveKeyAt(0);
```

<details><summary>Solution</summary>

```typescript
const hdWallet = HDWallet.fromSeed(seedBytes);
if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');
const result = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);
if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
hdWallet.hdWallet.clear();
const zk = result.keys[Roles.Zswap];
```

Changes: `selectRole` (singular) -> `selectRoles` (plural, array); `deriveKeyAt` -> `deriveKeysAt`; result is now a discriminated union — check `seedOk`/`keysDerived` before use; keys come back in one `result.keys` map keyed by role; the HD wallet should be `clear()`ed after derivation. (All in `step1-degree/src/wallet.ts`, and all recorded in the §13 obsolescence table.)

</details>

**Exercise 5 (private state debugging).** Your pre-mint loop sets private state per student, but the `verifyMinGPA` proving fails with the witnesses returning defaults (`gpa ?? 0n`). You wrote:

```typescript
await providers.privateStateProvider.set(PRIVATE_STATE_ID, { gpa: 385n, gpaSalt: salt });
```

What's missing, and why does the failure look like "witnesses return defaults"?

<details><summary>Solution</summary>

Missing `await providers.privateStateProvider.setContractAddress(pkg.contractAddress);` **before** `set`. Without it the state is written to no (or the wrong) contract slot, so when the circuit runs, `ctx.privateState` is empty for this contract and the witness fallbacks (`gpa ?? 0n`, zero salt) fire — which then fails the commitment assert in-circuit. This is the recorded §15 gotcha; the correct order is setContractAddress -> set, per student, per address.

</details>

**Exercise 6 (stretch — design the read path).** The verifier portal must show "not revoked as of block N." Using only what you learned in 1.8, sketch (in words or code) how the portal obtains: the contract state, the revocation check, and the block number to display. Why is no wallet involved?

<details><summary>Solution</summary>

`indexerPublicDataProvider(indexer, indexerWS)` -> `queryContractState(address)` -> decode with `DegreeModule.ledger(state.data)` -> `setHas(ledgerState.revoked, credId)` for the revocation verdict. For "as of block N": query the indexer for the current block (`{ block { height } }` — the same GraphQL endpoint the provider wraps; the SDK also exposes block-height queries on the publicDataProvider) and display the height observed at read time. No wallet because reads are pure indexer queries — public data, no keys, no signing, no DUST; that's precisely why verification is accountless and ~0.1 s.

</details>

## 4. Checkpoint quiz

1. **Name the 7 providers.**
   *Answer:* privateStateProvider, publicDataProvider, zkConfigProvider, proofProvider, walletProvider, midnightProvider, loggerProvider.
2. **In our Node wiring, why are walletProvider and midnightProvider the same object?**
   *Answer:* The wallet both balances/signs AND submits transactions in a script context — one object implements both interfaces. (A browser DApp would get them from a wallet extension instead.)
3. **Put the pipeline in order and give the rough time share of the slowest stage: prove / balance / local execution / submit+finalize.**
   *Answer:* local execution -> prove (~2 s raw for our small circuits) -> balance -> submit+finalize. The ~20–25 s total is dominated by balancing/submission/finalization (block inclusion at ~6 s/block), NOT proving.
4. **What are the three child wallets, and which role key does each derive from?**
   *Answer:* Shielded (Zswap role), Unshielded (NightExternal role — NIGHT), Dust (Dust role — fees); all HD-derived from one seed via `selectAccount(0).selectRoles([...]).deriveKeysAt(0)`.
5. **Why does the driver print NIGHT via `state.unshielded.balances[unshieldedToken().raw]` but DUST via `state.dust.balance(new Date())`?**
   *Answer:* NIGHT is an unshielded token — a plain balance in the unshielded child's map, keyed by the token's raw type id. DUST is not a token balance at all: it's a *time-projection* of fee capacity generated by registered NIGHT, so you ask "how much capacity exists as of this timestamp."
6. **Your `set(privateStateId, ...)` seems to vanish — the witnesses see defaults. What's the rule you broke?**
   *Answer:* `setContractAddress(contractAddress)` must be called before `set()` — private state is stored per contract address, per account.
7. **What two facts about a fresh `create-mn-app` install combine to produce `expected instance of StateValue`?**
   *Answer:* `compact-runtime@0.16.0`'s `^3.0.0` resolves to 3.1.0 (published after the matrix) while `midnight-js-protocol@4.1.1` pins 3.0.0 -> two onchain-runtime-v3 copies; WASM classes don't `instanceof` across package copies. Fix: `overrides` to 3.0.0 + `npm dedupe` + lockfile verification.
8. **Why is `globalThis.WebSocket = WebSocket` (from the `ws` package) the first line of every script?**
   *Answer:* The wallet syncs through the indexer's WebSocket endpoint; Node.js has no built-in WebSocket global, so the `ws` implementation must be installed on `globalThis` before any wallet sync happens.
9. **Why shouldn't you call `.member()` directly on a decoded ledger `Set`? What do we do instead?**
   *Answer:* The decoded ADT shape is undocumented — it may be a method-object, iterable, Map, or plain object depending on version/path. We use the defensive `setHas` helper (tries all shapes) from `verify-core.ts`.
10. **What does `CompiledContract.withWitnesses({...})` actually connect, and what's the shape of a witness function?**
    *Answer:* It binds the Compact `witness` declarations to their TypeScript implementations. Each witness receives a context (`ctx`, carrying private state + ledger view) and returns a tuple `[newPrivateState, witnessValue]`.

## Agent teacher notes

**Pacing.** Two sessions. Session 1: sections 1.1–1.4 + Lab 2.1 (providers and the pipeline — the mental model everything hangs on). Session 2: sections 1.5–1.8 + Labs 2.2/2.3 + exercises. Lab 2.2 is the module's summit — protect a full uninterrupted hour for it; students who rush it learn nothing but copying.

**Check understanding before advancing.**
- After 1.4: give the student five shuffled stage cards (exec/prove/balance/submit/watch) and have them lay the pipeline out and assign a machine to each. If they put "balance" on the proof server or "prove" on the node, re-teach with the diagram.
- Before Lab 2.2: quiz the skeleton verbally — "which TODO calls the proof server?" (none directly; `callTx` orchestrates; the proofProvider is just wired in). Students who can't answer will flail in the lab.
- After Lab 2.3: "explain to me why the employer needs no account." (Reads are indexer queries of public data; verification is recomputation. No keys, no DUST, no tx.) That answer *is* the product pitch — they should feel it.

**Common misconceptions.**
- *"Proving is the slow part."* The March-era 1–2 min fear is dead: raw proving is ~2 s; the ~20 s loop is balancing + submission + finality. Show the premint benchmark (~2 s/proof) as the proof.
- *"The wallet holds my tokens."* The wallet holds *keys*; balances live on-chain (NIGHT) or as projections (DUST); the wallet learns them by syncing from the indexer. This reframes "lost my wallet" correctly: lost keys = lost access; lost device with seed backup = fine.
- *"callTx is one network call."* It's an orchestration of all five stages; the step-by-step API exists when you need the intermediate artifacts (our deploy-capture in `runtime.ts`).
- *"Private state is on-chain somewhere encrypted."* It's a local encrypted LevelDB vault (`midnight-level-db/`); only disclosures ever reach the chain. Delete the folder and it's gone (no built-in recovery — the SDK docs warn about this).
- *"npm warnings are noise."* Version drift is THE killer on this stack. The StateValue story is the vaccination; tell it with the lockfile one-liner in hand.
- *"DUST balance is a number you read."* It's a function of time — `balance(new Date())`. Students who cache it get stale-value bugs.

**FAQ answers ready.**
- *"Why does my script hang at waitForSyncedState?"* Usually: indexer down (`docker compose ps`), wrong network endpoints, or the WebSocket shim missing/wrong import. Check in that order.
- *"Can I skip the 20-second wait?"* No — it's block inclusion + finality, physics of the chain. Design around it (batch writes; read fast). Our whole architecture (one tx per cohort, everything else reads) is that design.
- *"Where did my private state go after I wiped the devnet?"* The LevelDB folder persists locally — but it now references a contract that no longer exists on the fresh chain. Redeploy; the runtime's stale-deployment guard (`runtime.ts` `ensureDeployed`) exists for exactly this.
- *"Do I need to understand the proof itself?"* No — treat `proveTx` as a black box that turns claims into receipts. The *interface* (what's provable: Module 3, section 1.6) is what matters.
- *"Why `?? 0n` in the witnesses?"* So deploy/anchor calls (which don't set GPA state) still work — the witness must always return something; defaults keep non-L2 calls alive.

**Let them struggle vs. help.** Struggle: Lab 2.2's TODOs (the skeleton is enough — resist answering for 30 minutes; the struggle IS the learning), the Exercise 3 diagnosis, the provider triage. Help: npm/lockfile surgery (pair on it — one wrong move and node_modules is soup), wallet derivation type errors (the discriminated-union checks are fiddly; show the pattern once), anything involving `any` casts (our code uses them at SDK boundaries where types widen — explain that this is deliberate and localized, not a style to copy).

**Advance when:** the student can (1) draw the provider diagram and the pipeline diagram from memory, (2) write Lab 2.2's script from the skeleton without the solution, (3) recite the StateValue story including the fix, and (4) explain why reads need no wallet. They now hold the complete stack: language (M3), infrastructure (M2), and SDK (M4) — ready for the CredVault deep-dive modules that follow.

## References

**This repo (ground truth):**
- `apps/credvault/step0-hello/src/step0-driver.ts` — the annotated full-pipeline driver (Lab 2.1)
- `apps/credvault/step0-hello/src/deploy.ts` — providers, DUST registration, retry loops, proof-server polling
- `apps/credvault/step1-degree/src/common.ts` — the canonical provider wiring + witness implementations
- `apps/credvault/step1-degree/src/wallet.ts` — HD derivation, three child wallets, restore/sync
- `apps/credvault/step1-degree/src/network.ts` — BIP-39 seeds (the `mnemonicToSeed` warning), network presets, genesis seed
- `apps/credvault/step1-degree/src/runtime.ts` — stage-by-stage pipeline with deploy-tx capture (`ensureDeployed`)
- `apps/credvault/step1-degree/src/premint-l2.ts` — the `setContractAddress` -> `set` pattern; slim-transaction proving
- `apps/credvault/step1-degree/src/verify-core.ts` — indexer reads + the defensive `setHas`
- `apps/credvault/step1-degree/package.json` — the `overrides` block (StateValue fix)
- `apps/credvault/ARCHITECTURE.md` §13 (workaround obsolescence + StateValue story), §15 (proving benchmarks, private-state gotchas), §16 (TTL saga)

**Reference repos:**
- `midnight-js/llms.txt` — the SDK API summary (providers, transaction flow, private-state security parameters)
- `midnight-js/CLAUDE.md` — the 7-provider architecture and transaction flow diagram
- `midnight-js/testkit-js/testkit-js-e2e/` — reference contracts and canonical provider wiring (`testkit-js/src/contract/providers.ts`)
- `midnight-docs/docs/guides/networks-and-environments.mdx` — `setNetworkId` rules, endpoint wiring — https://docs.midnight.network/guides/networks-and-environments
- `midnight-docs/docs/guides/deploy-and-operate.mdx` — the full providers object in the official docs — https://docs.midnight.network/guides/deploy-and-operate
- `midnight-docs/docs/relnotes/support-matrix.mdx` — version law — https://docs.midnight.network/relnotes/support-matrix
