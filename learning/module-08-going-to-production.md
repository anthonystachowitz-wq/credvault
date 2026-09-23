# Module 8: Going to Production

> Time: ~4.5 hours | Prerequisites: Module 7

Everything so far ran on `undeployed` — the Docker devnet on your own machine, with a genesis wallet that never runs out and services that answer in milliseconds. This module takes the working demo to **preprod**, Midnight's hosted public test network: real infrastructure, a faucet that rate-limits you, finality you can feel, and a portal your phone can reach over HTTPS. Then it covers the discipline that separates a demo from an operation — idempotence, the gotchas anthology, and security hygiene — and ends with the **capstone project**: standing up a brand-new issuer (a licensing board) end to end.

## Learning objectives

By the end of this module you can:

- **Explain** the network ladder — `undeployed` → `preview` → `preprod` → `mainnet` — and what does and does not change at each rung.
- **Describe** the hosted-network mental model: 'nothing runs but the proof server.'
- **Fund** a preprod wallet from the faucet, and explain NIGHT, DUST, and tNIGHT in one sentence each.
- **Migrate** the stack to preprod: which files to delete first, why, and what timings to expect.
- **Explain** idempotence as an operational property — deterministic salts, already-anchored skip, proof preservation, deploy probes.
- **Recount** the operational gotchas (TTL, stale presentations, ordering traps, duplicate runtimes) as stories *with morals you can apply*.
- **Apply** the security rules: what never goes on-chain, salt discipline, key hygiene.
- **Sketch** the roadmap: verification fees, on-chain receipts, and the generator vision.
- **Build** the capstone: a new issuer with its own schema, batch, verifier flow, and operations drill — scored against `learning/assessments/capstone-rubric.md`.

## 1. Concepts from scratch

### 1.1 The network ladder

A 'network' is a whole answering machine for the chain: a **node RPC** (submit transactions), an **indexer** (query contract state), and a **proof server** (generate ZK proofs). CredVault keeps every network detail in ONE config object — `NETWORK_CONFIGS` in `src/network.ts` — with presets you select by name:

| Preset | What it is | Node + indexer | Wallet funding | Use it for |
|---|---|---|---|---|
| `undeployed` | Your local Docker devnet | yours (localhost :9944 / :8088) | genesis seed, infinite | daily development |
| `preview` | Hosted by Midnight | theirs | faucet | early experiments with new releases |
| `preprod` | Hosted by Midnight, **tracks mainnet** | theirs | faucet | pilots, dress rehearsals — **our choice** |
| `mainnet` | The real thing (future) | theirs | real NIGHT | production |

Selection is three lines of precedence in `resolveNetwork()`: the `--network` flag beats the `.midnight-state.json` `activeNetwork` field, which beats the default (`undeployed`). Environment variables (`MIDNIGHT_INDEXER_URL`, `MIDNIGHT_NODE_URL`, `MIDNIGHT_PROOF_SERVER_URL`, `MIDNIGHT_FAUCET_URL`, plus the WS variant) override individual endpoints. So switching networks is config-only: **the code never changes.** When someone says 'run it on preprod,' the literal difference is `-- --network preprod` on the command you already know.

### 1.2 The hosted mental model: nothing runs but the proof server

On the devnet you ran three Docker services. On preprod, Midnight runs two of them for you:

```
Your machine:      portal + issuer runtime + proof server :6300   ← yours
preprod (hosted):  node RPC + indexer GraphQL                     ← theirs
```

No node, no db-sync, no relay to babysit. Contracts deploy through the hosted RPC; the network executes them. **Only the proof server stays yours** — and that is a privacy decision, not an oversight: the proof server sees witness data (at premint time it sees the actual GPA and salt), so it must live where the private data is allowed to be. The hosted node and indexer only ever see public anchors — which is all the chain ever holds, by design.

### 1.3 Money: NIGHT, DUST, and the faucet

Three nouns, one sentence each:

- **NIGHT** is the network's token — the asset an account holds.
- **DUST** is the resource that pays transaction fees, and it *accrues to NIGHT holders over time* — even while their server is off. (This is why the issuer pitch is one sentence: 'you hold NIGHT tokens that pay for on-chain updates.')
- **tNIGHT** is valueless test-network NIGHT, dispensed free by a web faucet.

On `undeployed` you never thought about money: `GENESIS_SEED` in `src/network.ts` is pre-funded forever. On preprod you must (1) create a wallet, (2) ask the faucet for tNIGHT, (3) **wait** — the faucet is rate-limited and slow (minutes, not seconds).

**The seed is the wallet.** The first time anything needs a preprod wallet, `getOrCreateWallet()` generates a 24-word BIP-39 recovery phrase, derives the seed, and persists both to `.midnight-state.json` — written atomically, owner-read-only (`mode 0600`). That file is the keys to the kingdom: anyone holding the phrase controls the wallet and its tNIGHT. The same phrase restores the identical wallet in the Lace browser wallet (derivation is standard `mnemonicToSeed` — a code comment in network.ts warns that the look-alike `mnemonicToEntropy` silently derives a *different* wallet from the same words). You will print your funding address in Lab 8.1 with a small, offline script — key derivation needs no network.

### 1.4 The migration, condensed from the runbook

The full procedure lives at `docs/preprod-migration-runbook.md`; the shape is six steps, ~60–90 minutes, mostly faucet-and-sync waiting:

1. **Fund a wallet** from the preprod faucet (Lab 8.1). Save the seed/phrase.
2. **Point the stack at preprod** — verify the hosted endpoints in `src/network.ts` (`rpc.preprod.midnight.network`, `indexer.preprod.midnight.network/api/v4/graphql` + the WS path); they are already the presets.
3. **Delete the devnet deployment artifacts**: `rm -f data/deployment.json data/deploy-proof.bin`. This is not housekeeping — `deploy-proof.bin` is the *captured deploy transaction* that L2 verification replays, and a capture from the wrong network fails with 'does not have a verifier key.' Migrating means re-capturing on the new network.
4. **`npm run runtime batch -- --network preprod`.** First wallet sync takes **minutes, not 0.5 s** (one-time; it restores from saved state afterwards). Watch for `deployed (with capture): <address>` — the fresh deploy tx is saved — and `root anchored` — your first real preprod transaction.
5. **Premint + re-run the test matrix** (`npm run premint -- --network preprod`, then valid / revoked / tampered / subset / L2). Everything behaves identically; only finality changes.
6. **Put the portal behind HTTPS** (Caddy reverse-proxying :4050) so phones can install the PWA and use camera QR scanning — both require a secure context. Plain `http://IP:4050` works in-browser without the install prompt.

Expected timings (runbook §6):

| Operation | undeployed | preprod |
|---|---|---|
| First wallet sync | 0.5 s | minutes (one-time) |
| Tx loop (deploy / anchor / revoke) | ~20 s | ~20–60 s (finality) |
| L2 premint per proof | ~2 s | ~2 s (local CPU, unchanged) |
| Verification (L1/L2) | 0.1–0.2 s | ~1 s (hosted indexer latency) |

**Rollback is one flag.** The devnet is untouched the whole time; drop the `--network` flag (or flip `activeNetwork` back) and you are local again. Pilots do not burn down the workshop.

### 1.5 Idempotence as an operational property

Module 7 covered deterministic salts as a batching feature. In production, idempotence is bigger than that: it is the property that **running the same operation twice is safe and cheap**, and it shows up in four places you should be able to name on demand:

1. **Deterministic salts** (`kdfSalt = H(kdf-domain ‖ issuerSecret ‖ studentId ‖ field)`): an unchanged cohort reproduces bit-identical commitments. This is the foundation — everything below follows from it.
2. **Already-anchored skip**: the batch checks the computed root against `validRoots` *before* paying for a transaction (`⏭ root ALREADY anchored`). Graduation-week panic double-clicks cost nothing.
3. **Proof preservation + premint skipping**: unchanged `credId` ⇒ keep existing `l2Proofs`; already-minted thresholds are skipped. Re-runs converge instead of compounding.
4. **Deploy-with-capture probes**: `ensureDeployed()` probes the recorded contract address with a 15-second timeout before trusting `deployment.json` — a stale file (copied from another machine, or a wiped devnet) used to make `findDeployedContract` poll *forever*. Now: probe fails → log a warning → redeploy fresh.

The mindset: **local files are caches of chain truth.** `deployment.json`, `deploy-proof.bin`, `manifest.json`, and the package files are all re-derivable or re-checkable. Treat them as caches — validate before trusting, regenerate when in doubt — and operations become boring in the best way.

### 1.6 The gotchas anthology (each a story with a moral)

Production skill is mostly scar tissue. These are CredVault's scars, in the order they happened, with the transferable lesson made explicit.

**Story 1 — the TTL saga (the one that bit hardest).** L2 verification suddenly failed with 'Intent TTL has expired' on proofs that were mathematically sound. Three discoveries untangled it: midnight-js stamps transaction intents with a ~1-hour TTL, which is a **submission window** (how long the network will accept the tx), not a statement about proof soundness; the ledger's TTL check is driven by the **`tblock` argument** passed to `wellFormed`, so the 'current time' is whatever the caller says it is; and setting `intent.ttl` from JS mutates only the JS view of the transaction — the WASM snapshot underneath is unchanged, so the mutation was useless for validation. The fixes, all in the repo: replay the deploy with `tblock = deployedAt + 30 min` (inside its window); validate each L2 proof with `tblock = its mint time`; and slim off-chain proofs to just the contract-call intent (the wallet's dust offers carry their own expiring TTLs). **Moral: when a time check fails, find out which clock it reads before touching anything — and verify clock hypotheses with tiny probes (`src/ttl-probe.ts`), not with the full stack.**

**Story 2 — the stale presentation.** A student shared a package link right after a re-batch; the verifier reported `L2_UNAVAILABLE` on a credential that obviously had proofs yesterday. Cause: every batch rewrites the package files, and fresh packages start with empty `l2Proofs`; the presentation in flight carried the old, now-replaced state. The rule was always *batch → premint → share*, but it lived in documentation and kept being violated. **Moral (module 7 saw the fix): an ordering rule that humans keep breaking is a tooling bug — the portal now chains premint inside the batch job, so 'done' means 'shareable.'**

**Story 3 — the deployment that was not there.** After copying the project to a fresh instance (and once after `docker compose down -v` wiped the devnet), `runtime batch` hung after printing the cohort root. The code was polling `findDeployedContract` for a contract address that existed only on the *other* chain — politely, forever. The fix is the probe from §1.5: 15-second `queryContractState` race, and on failure, delete `deployment.json` and redeploy. **Moral: a hung 'poll forever' is a missing timeout; and cached addresses must be re-validated against the chain they claim to be on.**

**Story 4 — the verifier key from the wrong network.** After migrating networks without deleting `data/deploy-proof.bin`, every L2 check failed with 'does not have a verifier key.' The deploy-tx replay builds the ledger state that *carries the verifier keys*; replaying last network's deploy builds last network's state. **Moral: captured artifacts are bound to their network. Migration checklist item zero: `rm -f data/deployment.json data/deploy-proof.bin`, then re-capture.**

**Story 5 — the duplicate runtime (the silent killer).** On a fresh install, every contract call died with 'expected instance of StateValue.' Nothing in our code had changed. The cause was one level down: `compact-runtime` accepted `onchain-runtime-v3` ^3.0.0 and npm had installed 3.1.0 (published after the compatibility matrix), while `midnight-js-protocol` pinned exactly 3.0.0 — so *two copies of the WASM runtime* existed in one process, and `instanceof` across them is false even for 'the same' class. Fix: a package.json `overrides` pin to 3.0.0 plus `npm dedupe`, then verify exactly one copy in the lockfile. **Moral: WASM classes do not survive duplication — `instanceof` across package copies lies. After every install on a new machine: `npm dedupe`, and check the lockfile shows exactly ONE `onchain-runtime` line at the pinned version.**

**Story 6 — the compiler that would not let us leak.** Writing the issuer's authority hash to the ledger failed to compile: 'potential witness-value disclosure must be declared.' `persistentHash` *binds* a value but does not cryptographically *hide* it (a hash of low-entropy input can be brute-forced), so the compiler taints witness-derived data until you say `disclose()`. The authority hash is a public key — disclosing it is safe, the same reasoning as publishing a nullifier — so the fix was one honest word: `disclose(...)`. **Moral: the taint system is a friend that asks 'are you sure this is safe to publish?' — answer it deliberately, and remember `persistentCommit` hides, `persistentHash` only binds.**

Quick-reference for the rest (details in the runbooks):

| Gotcha | One-line fix | Moral |
|---|---|---|
| Decoded on-chain `Set` shape is undocumented | `setHas` tries 4 shapes | decode defensively |
| Console read `transcriptMode` at CSV-parse time | read the dropdown **at click time** | snapshot user intent at the moment of action |
| `stdin` piping does not reach `npm run` interactive CLIs | drive with scripts, not pipes | test harnesses need non-interactive drivers |
| `LedgerState.updateIndex` drops operation verifier keys | replay the captured deploy tx instead | know what your state source includes |
| `privateStateProvider.set()` before address set | `setContractAddress()` first | initialization order is part of the API |

### 1.7 Security best practices

**Rule 1 — what NEVER goes on-chain.** No names, degrees, GPAs, license numbers, dates of birth — nothing a human can read. The chain holds only 32-byte anchors: commitments, Merkle roots, credential IDs. And the subtler corollary: **a bare hash of low-entropy PII is still PII** — the dictionary of human names is small enough to brute-force, so an unsalted `H(fullName)` is a lookup table, not a protection. That is exactly why commitments carry 32-byte salts and why the rule is 'commitments, not hashes, for anything tied to a person.'

**Rule 2 — salt discipline.** Never reuse a salt across different data (reuse links two commitments to the same subject). Domain-separate every derivation (`credvault:field:`, `credvault:course:`, `credvault:kdf:` …) so values from different purposes can never collide. Deterministic derivation from `(issuerSecret, recordId, field)` is the one licensed exception to 'fresh randomness every time' — safe because any change in the inputs yields a different salt, and the secret half never leaves the issuer's server.

**Rule 3 — key hygiene.** Three secrets, three policies:

- **Issuer secret (authority).** It can anchor and revoke — it *is* the issuer, on-chain. The repo carries an obviously-labeled dev placeholder (`credvault:dev-issuer-sk:` in `src/common.ts`); production means a per-issuer generated secret that lives only in the issuer's runtime environment, never in git, never in tickets or chat.
- **Wallet seed / 24-word phrase.** It is money. `.midnight-state.json` is `0600` and must never be committed; on servers, prefer `MIDNIGHT_WALLET_SEED` / `MIDNIGHT_WALLET_MNEMONIC` environment variables injected by your secret manager over files. Write the phrase on paper for any wallet you care about.
- **Private-state password.** Minimum 16 characters (the SDK enforces it); treat it like any other production credential.

**Rule 4 — keep the proof server private.** It is the one component that sees witness data (real GPAs and salts at premint time). Localhost or private network only — never expose :6300. The hosted node and indexer see only public anchors and can stay public.

**Rule 5 — demo conveniences are not production settings.** The portal's `Access-Control-Allow-Origin: *`, the missing issuer login, and plain HTTP are labeled demo choices in the code. Production: restrict CORS to your origins, put the console behind issuer staff authentication, and terminate HTTPS (Caddy) — which you need anyway for PWA install and camera scanning. The data-flow rules from MVP.md stay non-negotiable: holder data goes only to the verifier; nothing is sent back to the school after verification; any telemetry is aggregate-only; no PII persisted anywhere by CredVault.

### 1.8 The roadmap beyond (so you know where this is all going)

**Verification fees — deliberately parked.** The industry norm is requester-pays, $5–$20 per lookup (the National Student Clearinghouse charges ≈ $20). v1 ships free on purpose; the seams are already in place: every schema carries a `fees:` block with `enabled: false`, the portal has a paywall hook spot in the QR→result flow, and per-issuer pricing/revenue-split config has a documented shape (example: of $20 — issuer $10, platform $5, operations $5; settlement off-chain first, on-chain splits later). A live question parked with it: if CredVault *sells* verification reports used in hiring, it may itself become a Consumer Reporting Agency under FCRA — a business-model decision, not code. One strategic idea on record: keep L1 degree-checks free forever as the adoption wedge; charge for depth.

**On-chain receipts — the premium tier (R1, parked).** Today's verification is off-chain and instant, but leaves no artifact. A `recordVerification` circuit would verify the predicate AND write a receipt on-chain (credId + claim type + timestamp + requester commitment) — non-repudiable evidence for audits and disputes, with the fee split settling *atomically in the same transaction*. The accepted trade: ~22 s latency, wallet friction (the verifier or a CredVault relay submits), and a metadata leak (the tx publicly reveals contract, timing, and credId — mitigated by relay batching and credId-only disclosure). The other trigger that pulls this forward: **single-use credentials** (tickets, one-time registrations) are impossible off-chain — they need on-chain nullifier insertion to prevent replay. Off-chain stays the default; on-chain becomes the premium tier.

**The generator — the actual product.** Everything you hand-built in Modules 1–7 is *one issuer template*. Step 3 generates such stacks from a questionnaire: the issuer answers questions (direct-match variables, conditional variables with thresholds, multiple-match sets), the platform normalizes the answers into a **Verification Schema AST**, and **two emitters from one IR** produce the Compact contract and its off-chain twin — so the two halves cannot drift (that drift was the March DSL's fatal gap). The exit test is poetic: regenerate the hand-built `step1-degree` from `schemas/college-degree.yaml` and pass its full test matrix. After that, the apps you just learned stop caring: they become pure functions of a **descriptor** (a hash-pinned JSON description served by a registry), a new issuer means a new descriptor — never a new app. That is why Module 7 hammered 'no issuer-specific code': the universal apps are the generator's delivery vehicle.

## 2. Hands-on lab

Labs 8.0 and 8.4 run locally. Labs 8.1–8.3 touch the real preprod network: they need internet access and patience (the faucet is rate-limited — budget the waiting). If your class cannot reach preprod, do 8.0 + 8.4 and read 8.1–8.3 as a guided walkthrough.

### Lab 8.0 — Tour the network machinery (10 min, local)

```bash
cd apps/credvault/step1-degree
grep -n -A8 "preprod: {" src/network.ts | head -12
```

Find the three hosted endpoints (`rpc.preprod…`, `indexer.preprod…/api/v4/graphql`, the WS twin) and the faucet URL. Then the precedence logic: `grep -n -A20 "export function resolveNetwork" src/network.ts` — flag > state file > default. Check the CLI:

```bash
npx tsx src/network.ts            # prints: Active network: undeployed (default)
```

### Lab 8.1 — Create a preprod wallet and fund it (15 min + faucet wait)

**① Print your address — offline.** Key derivation needs no network. Create `src/print-address.ts`:

```ts
import { getOrCreateWallet } from './network';
import { HDWallet, Roles, createKeystore } from '@midnight-ntwrk/wallet-sdk';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
setNetworkId('preprod');
const { seed, mnemonic, created } = getOrCreateWallet('preprod');
const hd = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
if (hd.type !== 'seedOk') throw new Error('bad seed');
const res = hd.hdWallet.selectAccount(0).selectRoles([Roles.NightExternal]).deriveKeysAt(0);
if (res.type !== 'keysDerived') throw new Error('derivation failed');
const ks = createKeystore(res.keys[Roles.NightExternal], 'preprod');
console.log('address:', ks.getBech32Address().toString());
console.log('created-new-wallet:', created);
if (created && mnemonic) console.log('recovery phrase (WRITE IT DOWN):', mnemonic);
```

```bash
npx tsx src/print-address.ts
# address: mn_addr_preprod1…     ← this is what the faucet wants
# created-new-wallet: true       ← first run only; phrase printed once — save it
```

The wallet is now persisted in `.midnight-state.json` (owner-read-only). **That file + the printed phrase are the wallet.** Delete both and the tNIGHT is gone forever.

**② Set the active network:**

```bash
npx tsx src/network.ts preprod
# Active network is now: preprod
```

**③ Faucet.** Open https://midnight-tmnight-preprod.nethermind.dev/ in a browser, paste your `mn_addr_preprod1…` address, request tNIGHT. Rate-limited: one request, then **wait 5–10 minutes**. There is no status API to poll from our stack — the honest check is to attempt the next lab and, if the wallet is still unfunded, wait longer.

### Lab 8.2 — Deploy and anchor on preprod (30–45 min, mostly waiting)

**① Delete the devnet deployment artifacts** (§1.4 step 3 — re-capture on the new network):

```bash
rm -f data/deployment.json data/deploy-proof.bin
```

**② A word about flags (a real bug, worth your attention).** `runtime.ts` parses its arguments naively (`const [, , cmd, arg] = process.argv`), while `--network` is *scanned but not consumed* by `parseNetworkFlag`. So this natural-looking command is **broken**:

```bash
npm run runtime batch -- --network preprod     # ✗ arg becomes '--network':
#   the runtime tries to read a cohort file literally named '--network' and crashes
```

Either put the cohort file first (flag last):

```bash
npm run runtime batch -- data/cohort.json --network preprod   # ✓
```

…or — cleaner — you already set the active network in Lab 8.1, so just run:

```bash
npm run runtime batch        # resolveNetwork reads 'preprod' from the state file
```

**③ Watch the first-run differences.** The first wallet sync takes **minutes** (one-time). Then: `deployed (with capture): <address>` (the preprod deploy tx is saved to `data/deploy-proof.bin`), and `root anchored` — your first real preprod transaction. Tx loop: ~20–60 s (finality, not your machine). If it fails for lack of funds: the faucet has not landed yet — wait and re-run; the batch is idempotent, re-running is safe.

**④ Premint + test matrix on preprod:**

```bash
npm run premint -- --network preprod          # flag is safe here: premint has no positional args
npm run holder STU-001
npm run verifier presentations/STU-001.presentation.json -- --min-gpa 350
```

Expect VERIFIED in ~1 s (hosted-indexer latency vs 0.15 s local). Re-run the gauntlet: revoked (needs a fresh `npm run runtime revoke STU-004` on preprod) / tampered / subset / L2. Everything behaves identically — that is the point of one config.

**⑤ HTTPS for phones (optional, needs a server + domain):** Caddy reverse-proxy to 127.0.0.1:4050 (three lines of Caddyfile, see `docs/preprod-migration-runbook.md` §5), then phone → `https://your-domain/holder.html` → install the PWA → import → share → camera-scan the QR. Camera access and PWA install both require HTTPS; plain `http://IP:4050` still works in-browser.

### Lab 8.3 — Roll back to the devnet (2 min)

```bash
npx tsx src/network.ts undeployed
npm run verifier presentations/STU-001.presentation.json   # instant again
```

(If you redeployed on preprod, your local `data/deployment.json` now points at preprod — delete it plus `data/deploy-proof.bin` and `npm run runtime batch` once to re-capture on the devnet. The probe from Story 3 protects you here: it would detect the mismatch on its own, but being deliberate is faster.)

### Lab 8.4 — The gotcha gallery, safely reproduced (20 min, local devnet)

Reproduce the scars without bleeding:

1. **Idempotent re-run:** `npm run runtime batch` twice back-to-back. Second run: `⏭ root ALREADY anchored — unchanged cohort, skipping transaction (idempotent).` Then `npm run premint`: `already minted, skipping` for every student.
2. **The duplicate-runtime check:** `node -e "const l=require('./package-lock.json'); for (const [k,v] of Object.entries(l.packages)) if (k.includes('onchain-runtime')) console.log(k, '→', v.version)"` — must print exactly ONE line at 3.0.0. If a fresh `npm install` ever prints two lines or 3.1.0: `npm dedupe`, re-check (Story 5).
3. **The stale-deployment probe (Story 3):** `cp data/deployment.json /tmp/dep.json`, edit the address's first two hex chars (`node -e "const f='data/deployment.json';const d=JSON.parse(require('fs').readFileSync(f));d.address='ff'+d.address.slice(2);require('fs').writeFileSync(f,JSON.stringify(d))"`), then `npm run runtime batch` — watch it warn (`deployment.json points to a contract not on THIS chain … redeploying fresh`) and self-heal. Restore your original: `cp /tmp/dep.json data/deployment.json` (and note it would redeploy+re-capture on its own anyway — that's the probe working).
4. **The flag-vs-positional trap (Lab 8.2 ②):** `npm run runtime batch -- --network undeployed` — watch it crash with a file-not-found for a file named `--network`. Now you have felt naive argv parsing from the inside; the fix is Exercise 8.3.
5. **TTL, by reading:** open `src/l2.ts` and find the three clock decisions (deploy replay at `deployedAt + 30 min`, L2 proof at its `mintedAt`, slim intents in `src/premint-l2.ts`). You do not reproduce this one for fun — you learn to *ask of every time check: which clock?*

## 3. Exercises

**Exercise 8.1 (warm-up).** Without editing code, make every command in the project talk to a *different* proof server running on port 6301. Then list, in precedence order, every way a network gets chosen and every way an endpoint gets overridden.

<details><summary>Solution</summary>

`MIDNIGHT_PROOF_SERVER_URL=http://127.0.0.1:6301 npm run premint` (the env var is read by `applyEnvOverrides` in `src/network.ts`). Precedence — network choice: `--network` flag > `.midnight-state.json` `activeNetwork` > default `undeployed`. Endpoint overrides (win over the preset): `MIDNIGHT_INDEXER_URL`, `MIDNIGHT_INDEXER_WS_URL`, `MIDNIGHT_NODE_URL`, `MIDNIGHT_FAUCET_URL`, `MIDNIGHT_PROOF_SERVER_URL`. Wallet identity: `MIDNIGHT_WALLET_SEED` or `MIDNIGHT_WALLET_MNEMONIC` (setting both is an error — they would select different wallets) > persisted per-network wallet.
</details>

**Exercise 8.2 (warm-up).** Explain to a new registrar, in one sentence each: NIGHT, DUST, tNIGHT, the faucet. Then answer their follow-up: 'our IT policy says credential data can't leave our building — which of the three services we run actually sees student GPAs?'

<details><summary>Solution</summary>

NIGHT: the network token an account holds. DUST: the fee-paying resource that accrues to NIGHT holders over time, even while the server is off. tNIGHT: valueless test-network NIGHT. Faucet: the website that dispenses tNIGHT for test wallets, rate-limited. Only the **proof server** sees GPAs (as witness data at premint time) — it stays on the issuer's own machine; the hosted node and indexer see only 32-byte anchors.
</details>

**Exercise 8.3 (medium).** Fix the naive argv parsing in `runtime.ts` so `npm run runtime batch -- --network preprod` works (flag anywhere, optional cohort file anywhere). Hint: `parseNetworkFlag` already finds the flag; your job is to stop treating it as a positional argument.

<details><summary>Solution</summary>

```ts
const args = process.argv.slice(2).filter((a, i, arr) =>
  a !== '--network' && !a.startsWith('--network=') && arr[i - 1] !== '--network');
const [cmd, arg] = args;
```
(The third filter clause drops the flag's *value* — the element right after a bare `--network`.) Now `batch --network preprod`, `batch data/cohort.json --network preprod`, and `batch` all behave. Verify with the probe from Lab 8.4 #4. Moral recorded: flags that are scanned-but-not-consumed collide with positional args — consume them in one place.
</details>

**Exercise 8.4 (medium).** A teammate ran `docker compose down -v` and wiped the devnet. Write the recovery runbook. For each artifact (`deployment.json`, `deploy-proof.bin`, `packages/*.json`, the `l2Proofs` inside them, `presentations/*.json`), say whether it survives, regenerates, or dies — and explain the trap that makes 'just re-run premint' insufficient.

<details><summary>Solution</summary>

1. `docker compose up -d --wait` (fresh chain, genesis re-funded). 2. `rm -f data/deployment.json data/deploy-proof.bin` (the probe would catch #1 anyway — Story 3 — but be deliberate). 3. Clear the stale proofs: `node -e "const fs=require('fs');for(const f of fs.readdirSync('packages')){if(!f.endsWith('.package.json'))continue;const p='packages/'+f;const j=JSON.parse(fs.readFileSync(p));j.l2Proofs=[];fs.writeFileSync(p,JSON.stringify(j,null,2))}"`. **This is the trap:** an L2 proof is a proven transaction *addressed to the old contract address* — after a redeploy the address changes and old proofs can never verify against the new deploy replay. Worse, the batch's proof-preservation (unchanged `credId` ⇒ keep `l2Proofs`) would faithfully carry the dead proofs over, and premint's 'already minted, skipping' would then refuse to re-mint. So 'just re-run premint' silently leaves every threshold broken. 4. `npm run runtime batch` — fresh deploy + re-capture + re-anchor (deterministic salts reproduce the SAME root, so the new anchor matches the old packages' math) and packages are rewritten with the NEW `contractAddress`. 5. `npm run premint` — fresh proofs against the new address — then regenerate presentations and re-verify. Artifact table: `deployment.json` regenerates, `deploy-proof.bin` regenerates (network-bound), `packages/*.json` regenerate from the cohort file, `l2Proofs` die (address-bound), `presentations/*.json` always regenerate from packages.
</details>

**Exercise 8.5 (harder, security).** A well-meaning teammate proposes: 'Let's also anchor `H(fullName)` for each student so employers can look up whether Alice Johnson has *any* credential.' Kill the proposal: name the attack, show why it works against names specifically, and state the design rule it violates.

<details><summary>Solution</summary>

Attack: dictionary brute-force. The space of human names is tiny (millions, not 2^256) — anyone can hash 'ALICE JOHNSON' and compare, turning the 'anonymous' anchor into a public membership list of who has credentials. This is exactly why `persistentHash` *binds but does not hide*, and why every person-linked value on-chain is a **salted commitment** (`H(value ‖ 32-byte random salt)`): the salt makes the input space astronomical. Rule violated: Rule 1 + corollary — a bare hash of low-entropy PII is still PII. (Bonus: the proposed feature also breaks the data-flow rules — CredVault deliberately has no lookup-who-has-credentials capability; verification is holder-initiated only.)
</details>

**Exercise 8.6 (hard, design).** Sketch the v2 fee flow: where exactly in the QR→result journey a paywall would sit, what config the portal reads, how settlement starts, and why L1 stays free. Ground every claim in the parked design (ARCHITECTURE.md §12, §10a).

<details><summary>Solution sketch</summary>

Hook point: after the drop fetch but before `verifyPresentation` runs (the portal already has the bundle → knows issuer + disclosure level → looks up that issuer's `pricing` block from its schema config). Config: per-issuer `{amount, currency, revenueSplit}` riding the schema's existing `fees:` block (flipped to `enabled: true`), e.g. of $20: issuer $10 / platform $5 / operations $5. Settlement: off-chain first (Stripe/invoice — no on-chain micropayments in v2); the on-chain split arrives with R1 receipts, atomically in the receipt tx. L1 stays free forever as the adoption wedge; only L2/L3 depth is metered. Guard the FCRA question: selling verification reports for hiring decisions may make CredVault a Consumer Reporting Agency — that classification review gates the launch, not the code.
</details>

## 4. Checkpoint quiz

**Q1.** Why does only the proof server stay on the issuer's infrastructure when moving to a hosted network?
<details><summary>Answer</summary>The proof server is the one component that sees private witness data (real values + salts at proving time). The hosted node and indexer only ever see public 32-byte anchors, so outsourcing them leaks nothing.</details>

**Q2.** Before deploying on preprod you delete `data/deployment.json` AND `data/deploy-proof.bin`. What breaks if you keep the old `deploy-proof.bin`?
<details><summary>Answer</summary>L2 verification replays the captured deploy tx to rebuild a ledger state carrying the verifier keys; a capture from the wrong network builds the wrong state and every L2 check fails with 'does not have a verifier key.' Captured artifacts are network-bound: migrate = delete + re-capture.</details>

**Q3.** Put these in precedence order: `.midnight-state.json` activeNetwork, `--network` flag, default `undeployed`. And name the five env vars that override individual endpoints.
<details><summary>Answer</summary>Flag > state file > default. Overrides: `MIDNIGHT_INDEXER_URL`, `MIDNIGHT_INDEXER_WS_URL`, `MIDNIGHT_NODE_URL`, `MIDNIGHT_FAUCET_URL`, `MIDNIGHT_PROOF_SERVER_URL`.</details>

**Q4.** 'Running the same operation twice is safe and cheap.' Name the four mechanisms that make batching idempotent, and the root mechanism they all depend on.
<details><summary>Answer</summary>Deterministic salts (the root mechanism: `kdfSalt` over issuerSecret+studentId+field reproduces identical commitments), already-anchored root skip, L2-proof preservation by unchanged `credId`, and premint skipping. (The deploy probe is idempotence's cousin: validate cached chain pointers before trusting them.)</details>

**Q5.** Recount the TTL saga in three beats and give its moral.
<details><summary>Answer</summary>(1) midnight-js stamps intents with a ~1h TTL that is a *submission window*, not a proof-soundness property; (2) `wellFormed`'s TTL check reads the caller-supplied `tblock` argument, so 'now' is whatever you pass; (3) the JS `intent.ttl` setter mutates only the JS view, not the WASM snapshot. Moral: when a time check fails, find which clock it reads — and probe small (`src/ttl-probe.ts`), not with the full stack.</details>

**Q6.** Why is `H(fullName)` on-chain a privacy breach, and what is the correct primitive for person-linked values?
<details><summary>Answer</summary>Names are low-entropy: anyone can dictionary-hash candidate names and match, turning the anchor into a public membership list. Correct primitive: a salted commitment (`H(value ‖ 32-byte salt)`) — `persistentHash` binds but does not hide; `persistentCommit` hides.</details>

**Q7.** A fresh `npm install` on a new machine makes every contract call fail with 'expected instance of StateValue'. Diagnose and fix, including the verification step.
<details><summary>Answer</summary>Two copies of `@midnight-ntwrk/onchain-runtime-v3` (3.1.0 via a caret range vs 3.0.0 pinned) → two WASM runtimes → `instanceof` fails across them. Fix: package.json `overrides` pin to 3.0.0 + `npm dedupe`; verify the lockfile shows exactly ONE `onchain-runtime` line at 3.0.0.</details>

**Q8.** The issuer's one-sentence blockchain brief is 'you hold NIGHT tokens that pay for on-chain updates.' Unpack it in two more sentences, including what happens while their server is off.
<details><summary>Answer</summary>NIGHT holdings generate DUST over time, and DUST is what transaction fees are paid in — so the issuer's gas budget refills itself, including while the server is off (batch-only issuers turn on, anchor, turn off, and still accrue). On test networks the NIGHT is tNIGHT from a faucet; on mainnet it is a real but tiny operational asset.</details>

## 5. Capstone project: a licensing board goes live

**Time:** ~6–8 hours (plan on two sessions). **Mode:** individual or pairs. **Scored with:** `learning/assessments/capstone-rubric.md`. This is the course's integrative assessment — everything from hashing to operations, in service of a client who is not a university.

### The client

The **State Board of Physical Therapy Examiners** (fictional) licenses 8,200 physical therapists. Hospitals and clinics verify licenses before granting privileges. The board's world differs from Penn State's in exactly the two ways that matter to your design:

1. **Prompt revocation is the point.** A degree is revoked ~never; a license can be revoked *today*, for public safety. The issuer runtime cannot be 'on in May, off after' — the architecture flags licensing schemas as prompt-revocation duty: the board's runtime stays reachable (ARCHITECTURE.md §5).
2. **Specific coursework is a real requirement.** Hiring managers never ask for single university courses; privileging committees *do* ask 'did they complete the ethics and jurisprudence modules?' This is why per-course selective disclosure lives in the license-authority pattern library.

Licensees must log **30.0 continuing-education (CE) hours per cycle**; employers commonly ask 'current license + CE requirement met + ethics module completed.'

### Deliverable 1 — the schema design doc (1–2 pages)

Define the credential on paper, using the questionnaire's three kinds from the generator apps architecture:

- **Direct-match fields** (name-the-value checks): `licenseeName` (reveal), `licenseType` (reveal + equality — 'Physical Therapist' vs 'PT Assistant').
- **Conditional field** (threshold provable): `ceHours`, unsigned integer, **scale ×10** (30.0 → 300 — remember: no floats, comparisons on `Uint<N>` only), operator `>=`, pre-mint criterion ≥ 30.0.
- **Multiple-match set** (the CE modules): `{moduleCode, title, hours, grade}`, max 40.
- **Revocation:** cadence `prompt`, mechanism revocation-set.

Then the decision: **granular or monolithic?** Choose, and justify in 3–5 sentences. (Strong answers pick *granular* and cite the privileging-committee use case — individual module verification — and note the anti-cherry-picking convergence check. A monolithic answer must explain how a committee proves the ethics module specifically.)

### Deliverable 2 — implement it on today's pipeline (with an honest constraint)

The hand-built stack is the *college* template: the field names `fullName`, `degree`, `gpa` are baked into `canonical.ts`, `runtime.ts`, `verify-core.ts`, and the UIs. Two tiers:

**Tier A (required) — field mapping.** Produce `data/board-roster.csv` in the existing 8-column format with a documented mapping: `fullName` ← licenseeName, `degree` ← licenseType, `gpa` ← ceHours ×10, courses ← CE modules. Include at least 10 licensees with deliberate edge cases: one who will be revoked (PT-007), one *below* 30.0 CE hours (their threshold proof must fail to mint), one with 8+ modules. Note in your design doc that UI labels still read 'degree/GPA' — a known limitation until the generator exists.

**Tier B (stretch) — rename the fields for real.** Guided scavenger hunt: change the schema's public names everywhere they live (`runtime.ts` `commitStudent` + package writer, `verify-core.ts` values and `fieldCommit` calls, the portal's students API, the three HTML apps' labels, `verifier.ts`, and the package `schema` string — bump it to `credvault-ptlicense/0.1`) and re-run the full test matrix. Two designed discoveries: `canonical.ts` needs **no change** (it takes field names as parameters — the 'one canonical library' design working), and renaming changes every commitment (the name is inside the hash), so all credIds change and the pipeline must be fully refreshed. The full rename map is in the rubric (§8). The takeaway is the generator's reason to exist: a schema name lives in ~8 places, and one IR + two emitters is how you keep them from drifting.

### Deliverable 3 — run the batch

Anchor the roster (console or CLI), premint, and confirm: one anchor tx for the whole roster; `already minted, skipping` on re-premint; an unchanged re-run prints `⏭ root ALREADY anchored`. Capture the log lines as evidence.

### Deliverable 4 — the board's three daily verification flows

Build and demonstrate each, through the apps:

1. **'Is this license current?'** — L1 check: share a licensee's bundle, verify (degree check only) → VERIFIED.
2. **'Did they meet the CE requirement?'** — threshold flow: holder hides the CE-hours value (uncheck 'Show GPA' — the mapped field), verifier checks ≥ 300 (the 30.0 × 10 mapping — document it in your flow) → VERIFIED with the ZK pill, value never revealed. Then show PT-below-30 → `L2_UNAVAILABLE`, and name the reason no proof can exist.
3. **'Did they complete the ethics module?'** — subset flow: holder shares only `PT-ETH-101` (plus nothing else), verifier sees 'revealed 1 of N, N−1 SEALED'. Then show the honest refusal if you built Tier A monolithic instead — and reflect on what that refusal would cost the board.

### Deliverable 5 — the operations drill

- **Prompt revocation:** revoke PT-007; re-open their *previously shared* link → REVOKED. Write one sentence about why this drill justifies 'runtime stays reachable' for license boards.
- **Rectification:** a licensee's CE total was mis-entered. Correct the roster, re-batch, revoke the old credId; show the corrected record verifies and the old one stays revoked forever (corrections create new anchors; history is never rewritten).
- **Idempotence evidence:** the unchanged re-run log from Deliverable 3.

### Deliverable 6 — demo + rubric

A ≤10-minute live demo: batch → three verifier flows → operations drill, narrated. Submission = design doc + roster CSV + captured logs + demo. Scoring per `learning/assessments/capstone-rubric.md` — six weighted dimensions (schema design 20, pipeline & idempotence 20, verifier flows 20, operations drill 15, security analysis 15, presentation 10), summarized:

| Criterion | What 'excellent' looks like |
|---|---|
| Schema design | Correct kinds, ×10 scale justified, granular choice defended against the monolithic alternative, prompt-revocation cadence |
| Working pipeline | Batch + premint + packages run clean; idempotent re-run demonstrated with logs |
| Verifier flows | All three checks incl. the negative cases (revoked, below-threshold, tampered) |
| Security analysis | States what is on-chain (anchors only), salt discipline, why the board — not CredVault — holds the data |
| Presentation | Demo runs without notes, timings stated, limitations named honestly (field labels, single contract) |

## Agent teacher notes

**Pacing.** ~4.5 h of material + the 6–8 h capstone (schedule it as two sessions with a midpoint review of the schema design doc — catching a bad granular/monolithic decision at the doc stage saves hours). Concepts ~90 min, Labs ~90 min (faucet waits overlap: request tNIGHT, teach §1.6 stories during the wait), Exercises ~45 min, capstone kickoff ~30 min.

**Common misconceptions.**

- *'Preprod is a different product.'* Students expect the code to change. Show them the diff of nothing: same repo, same commands, one flag. The only new variables are faucet time, first-sync time, and finality.
- *'The faucet is instant like the genesis wallet.'* It is rate-limited and slow; plan around it (request early, teach during the wait). A student who requests at minute 40 stalls the lab.
- *'Deleting deployment.json destroys something.'* It is a cache of chain truth, re-creatable by deploying. Conversely, `.midnight-state.json` is NOT a cache — deleting it destroys the wallet. Make students classify every file in `data/` as cache-vs-precious before Lab 8.2.
- *'A hash anonymizes personal data.'* The Exercise-8.5 trap catches this every cohort. Low-entropy input + hash = lookup table. Salted commitments are the answer; unsalted hashes of names are just names with extra steps.
- *'Idempotence is a batch trick.'* It is an operational philosophy: deterministic inputs → reproducible outputs → re-runs converge. The deploy probe, the root-exists skip, and proof preservation are one idea wearing three hats.

**Checking understanding before advancing (to the capstone).** Each student must answer, unprompted: (1) 'Which service sees GPAs on preprod, and why is that acceptable?' (2) 'Your L2 checks fail after migrating — name the file you forgot to delete.' (3) 'Re-run a batch twice: what does the second run cost and why?' (4) 'Tell me the TTL story in three beats.' If any answer wobbles, revisit §1.4–§1.6 before the capstone — the capstone assumes all four are solid.

**FAQ answers.**

- *'Why preprod and not preview?'* Preprod tracks mainnet — it is the dress rehearsal; preview is for early experiments with new releases. (The runbook's troubleshooting table says it in one line.)
- *'Is tNIGHT real money? Can we lose anything?'* No and no — the worst case is waiting for the faucet again. The hygiene (seed handling, 0600 files) is practice for mainnet, where the answers flip.
- *'Why not just run our own node on preprod?'* You could; the hosted model exists so issuers run exactly one privacy-sensitive component (the proof server) and zero chain infrastructure. 'Nothing runs but the proof server' is a security posture, not a convenience.
- *'The portal has no login — is that shippable?'* The verifier side is public by design (accountless verification is the product). The *issuer console* behind authentication is a listed MVP cut; call it out when students demo — naming your own limitations is a rubric criterion.
- *'Do we need the capstone to touch preprod?'* No — undeployed is fine and faster to iterate. The schema, flows, and drills are the assessment; the network is a footnote. (Strong students may do Deliverable 3 on preprod for the full arc.)

**When to let them struggle.** Let students hit the `--network`-as-cohort-file crash (Lab 8.2 ② / Lab 8.4 #4) *before* showing the fix — the 30 seconds of confusion teaches argument parsing better than the explanation does. Let them wait out one faucet cycle without rescuing them. Intervene immediately on: seeds pasted into shared channels (rotate: generate a fresh wallet and explain why), and any student about to `rm -rf midnight-level-db` without knowing what it is (the wallet's synced state — re-syncable but expensive on preprod).

**Capstone facilitation.** The midpoint review checks the design doc only: correct field kinds, the ×10 scale, the granular/monolithic defense, prompt-revocation. During Deliverable 4, watch for the classic error: students verify the CE threshold on the *wrong* mapping (checking 350 because '3.50' — re-anchor them to the ×10 table). During Deliverable 5, require the exact sentence 'the same link now says REVOKED' — if they re-shared instead of re-opening, they missed the lesson. The rubric's honesty criterion is not a formality: a demo that names its own limitations scores higher than a slick one that hides them.

**Advance-when criteria (course completion).** A student has finished CredVault 101 when they can: migrate networks without the runbook; classify every file as cache vs precious; tell the TTL, StateValue, and stale-presentation stories with morals; and ship the capstone at 'proficient' or better on every rubric row. They leave knowing more operational truth about Midnight than most people who have deployed to it.

## References

**Code:**
- `apps/credvault/step1-degree/src/network.ts` — presets, precedence, env overrides, BIP-39 wallet creation, state file
- `apps/credvault/step1-degree/src/wallet.ts` — key derivation, wallet facade, state restore
- `apps/credvault/step1-degree/src/runtime.ts` — deploy-with-capture, the stale-deployment probe, idempotent batch
- `apps/credvault/step1-degree/src/{premint-l2.ts, l2.ts}` — the TTL fixes in their natural habitat
- `apps/credvault/step1-degree/src/common.ts` — the dev issuer secret (see the 'Production:' comment) and provider wiring
- `apps/credvault/step1-degree/src/ttl-probe.ts` — how the TTL hypotheses were probe-tested

**Project docs:**
- `apps/credvault/docs/preprod-migration-runbook.md` — the full procedure this module condenses (faucet, endpoints, timings, troubleshooting, rollback)
- `apps/credvault/docs/step2-runtime-and-l2-runbook.md` — the TTL gotcha section + full test matrix
- `apps/credvault/ARCHITECTURE.md` §8 (environment strategy), §10a (R1 receipts), §12 (fees), §16 (TTL saga), §18 (idempotent batching)
- `apps/credvault/MVP.md` — data-flow hard rules + deliberate cuts
- `apps/credvault/schemas/college-degree.yaml` — the `fees:` seam and compliance hooks in situ
- `apps/credvault/docs/{generator-core-architecture.md, generator-apps-architecture.md}` — the Step-3 vision behind §1.8
- `learning/assessments/capstone-rubric.md` — capstone scoring

**Official / external:**
- Midnight networks & environments: https://docs.midnight.network/guides/networks-and-environments
- Midnight release support matrix (version source of truth): https://docs.midnight.network/relnotes/support-matrix
- Preprod faucet: https://midnight-tmnight-preprod.nethermind.dev/
- Preview faucet: https://midnight-tmnight-preview.nethermind.dev
- BIP-39 (recovery phrases): https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
