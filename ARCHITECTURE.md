# CredVault — Application Architecture

> Status: **Brainstorm complete, pre-Step-0.** This is the working design doc for what we are
> building. It reflects the 2026-09-02 architecture discussion. Update it as decisions change.

---

## 1. The thesis: adoption through invisibility

Blockchain has no mass adoption outside DeFi speculation because users are asked to *care*
(seed phrases, gas, wallets). CredVault's bet: **the blockchain is infrastructure that none of
the end users ever see.** The value is felt as a 2-second, free, accountless verification —
not as "using a dapp."

Midnight is the enabling platform because selective disclosure makes verification
GDPR/HIPAA-compatible: private data never touches the chain, only commitments, roots, and
nullifiers do.

## 2. The product

**CredVault is a verification platform.** An issuer (university, licensing board, employer)
describes what holders must be able to prove; CredVault **generates a custom Midnight contract
from that description** plus the issuer's off-chain runtime. The generator is the product;
everything else is plumbing that serves it.

### Actors

| Actor | What they do | What they know about blockchain |
|---|---|---|
| **CredVault** (us) | Onboards issuers, generates + deploys contracts, hosts the public verifier portal | Everything |
| **Issuer** (e.g. Penn State) | Holds all credential data on its own server; runs the generated runtime to anchor batches + revocations on-chain | One sentence: "you hold NIGHT tokens that pay for on-chain updates" (NIGHT→DUST accrues even while their server is off) |
| **Holder** (e.g. student) | Has an app; downloads a pre-minted proof package; presents proofs (QR/link) | Nothing. No wallet, no tokens, no keys |
| **Verifier** (e.g. employer) | Scans/pastes a proof into the free portal; gets result + on-chain anchor | Nothing. No account needed |

### Data custody

**The issuer holds the data, not CredVault.** CredVault never touches PII — no FERPA/GDPR
target on us. The chain stores only cryptographic anchors. Verification works **even when the
issuer's server is off**, because roots and the revocation registry live on-chain.

## 3. The verification algebra (the 7 patterns)

Every contract is a composition of these primitives (per the midnight-expert
`core-concepts:privacy-patterns` skill — the canonical enumeration):

1. **Commitment** — hide a value on-chain, bound to the committer (`persistentCommit`, salt)
2. **Merkle membership** — "in the issued set," without revealing which member (`HistoricMerkleTree` + `merkleTreePathRoot` + `checkRoot`)
3. **Nullifier** — prevent double-actions / replay without identity (domain-separated `persistentHash` + `Set<Bytes32>`)
4. **Round-based unlinkability** — repeated proofs can't be correlated
5. **Commit–reveal** — two-phase hidden values (sealed bids/offers)
6. **Shielded tokens** — private value transfer (Zswap) — *not in v1 scope*
7. **Selective disclosure** — threshold (`x ≥ 18`), range (`min ≤ x ≤ max`), equality — disclose the boolean, never the value (comparisons only on `Uint<N>`)

Plus the mirror of #2: **non-membership** (revocation via sparse Merkle tree / nullifier set).

"Degree valid ∧ not revoked ∧ GPA ≥ 3.5" = membership ∧ non-membership ∧ threshold.
The generator maps schema rules → composed primitives with parameters. **Configuration, not
code** — the constrained menu is a feature: auditable, safe, always compilable.

### The size rule (generator MUST enforce)

No circuit ever processes a full document. Commitments are 32 bytes regardless of
input size; large documents are hashed OFF-circuit. L3 full-reveal verification =
recompute-hash-and-compare against the on-chain commitment — no ZK proof at all.
ZK circuits only touch small values (thresholds, codes, salts, Merkle paths);
within-document selection uses Merkle sub-trees (log-depth paths, never the whole
document). In-circuit hashing of kilobytes = millions of constraints — forbidden.

### Gotchas baked into every generated contract
- `persistentHash` binds but does NOT hide → use `persistentCommit` to hide
- Domain-separate every nullifier (`pad(32, "app:purpose:")`)
- Never reuse salts
- Comparisons only on `Uint<N>`, never `Field`
- JS-side hashing must byte-match Compact `persistentHash` (SHA-256; see
  `~/.openclaw/workspace/credvault-hash.ts` and `PERSISTENTHASH_RESEARCH_RESULTS.md`)

## 4. Components

1. **Schema intake** — issuer describes credential fields + provable rules + attestation and
   revocation policy → versioned **Verification Schema** (JSON/YAML).
2. **Contract generator** — schema → `.compact` **AND the off-chain twin**: TS witness
   implementations, Merkle tree manager, commitment hashing, API wrapper. (The March DSL only
   generated the `.compact` half — that was its gap.) Validation built in: compile, simulator
   tests, circuit cost estimate, on/off-chain hash-consistency check.
3. **Issuer runtime** (given to the issuer) — credential DB connector, batched Merkle root
   updates, revocation updates, **proof service** (generates ZK proofs via local proof server),
   chain client holding NIGHT. Uptime model below.
4. **Holder app** — requests proof from issuer when needed, stores proof packages, presents
   them (QR/link). No keys, no tokens. (Optional invisible app-generated secret for
   holder-binding nullifiers — deferred decision.)
5. **Verifier portal** (CredVault-hosted) — free, accountless: proof → query indexer →
   "VALID: Penn State degree, issued May 2027, not revoked as of block N."

## 5. Issuer runtime uptime model (decided 2026-09-02)

| Job | Cadence | Server can be off? |
|---|---|---|
| Anchor cohort on-chain (batched root update, one tx per batch) | Graduation batches (e.g. May/Aug/Dec) | ✅ Turn on, ingest, submit, turn off |
| Revocations | Event-driven | Degrees: batch-only OK (rarely revoked). **License boards: keep reachable** — prompt revocation is the point. Generator flags schemas with prompt-revocation duty |
| Proof service | Per holder request, year-round | ✅ Avoidable via **pre-minted proof packages** at issuance (standard proofs generated during the batch run). Holder only needs issuer online for a *novel* proof not in the standard package |

**Students generate zero transactions** — proofs are verified, not submitted. 10,000 graduates
= a handful of batched txs. Proving happens server-side (proof server, local, port 6300);
March-2026 benchmarks were 1–2 min per proof (proof-server 7.0.0) — re-benchmark on 8.1.0.

## 6. Scale & cost

- Per-issuer contracts (isolation + custom rules + issuer ownership story). Contracts will need
  a **versioning/migration story** (rule change = new contract + re-anchoring; the schema
  registry makes this tractable).
- Merkle sizing: `HistoricMerkleTree<16>` = 65,536 leaves per tree; use cohort trees
  (one tree per graduation batch) to stay well under depth limits. March note: fixed-depth
  proofs only — variable length needs multiple circuits or fold pattern
  (`~/.openclaw/workspace/memory/2026-03-11-merkle-proof-limitations.md`).
- Issuer cost ≈ batch txs only. CredVault may sponsor fees during onboarding; issuers pay
  eventually (they understand "hold tokens for gas"; tooling handles everything else).

## 7. Build plan (staged — agreed 2026-09-02)

| Step | Deliverable | Exit criterion |
|---|---|---|
| **0** | Toolchain loop on local devnet (`create-mn-app` hello-world, current versions) | Compile → deploy → call works on today's stack; identify which March workarounds are obsolete |
| **1** | **One hand-written contract**: degree + revocation (membership ∧ non-membership); mock-Penn-State issuer CLI, holder CLI, verifier CLI on `undeployed` | Full flow runs on current Compact; we know today's real ergonomics |
| **2** | Issuer runtime around the hand-written contract: batched roots, proof service, revocation flow, pre-minted packages | Off-chain half proven: tree management, hash matching, proving pipeline |
| **3** | **Generator v1**: schema → the Step 1–2 shape (parameterized). Then add patterns one at a time | Schema round-trips to a working deployed contract |
| **4** | Platform: issuer onboarding UI, verifier portal, deployment pipeline → preview → preprod | Real issuer pilot |

**Discipline: no generator before Step 2.** Never generate code we haven't hand-run on the
current toolchain (the March compiler bug and hash-mismatch wall came from exactly that).

## 8. Environment strategy

- Develop on `undeployed` (local Docker devnet: node + indexer + proof server; genesis-funded).
- All network specifics live in ONE `NetworkConfig` (endpoints + network ID) with presets for
  `undeployed` / `preview` / `preprod` / `mainnet` — switching networks is config-only
  (per midnight-docs `guides/networks-and-environments.mdx`). Services per network: node RPC,
  indexer GraphQL, local proof server (:6300).
- Current stable matrix (docs `relnotes/support-matrix.mdx`, refreshed 2026-09-22):
  Compact devtools **0.5.1** (`compact` CLI; local install is 0.5.2 and works),
  Compact compiler (`compact compile`) **0.31.1**, Compact runtime **0.16.0**, Compact JS
  **2.5.1**, Platform JS **2.2.4**, On-chain runtime **3.0.0** (override still required),
  Midnight.js **4.1.1**, Wallet SDK **1.2.0**, testkit-js **4.1.1**, DApp Connector API
  **4.0.1**, Proof server **8.1.0**, Node **1.0.2** (preview/mainnet) / **1.0.3** (preprod),
  Midnight Indexer **4.3.5** (preview) / **4.3.302** (preprod/mainnet) (API **v4** paths),
  Ledger **8.1.2** (security patch; step1-degree lockfile currently resolves ledger-v8 **8.1.0**).
  The March-2026 pins (compactc 0.29, midnight-js 3.1.0, indexer v3) are historical reference only.

## 9. Recovered assets from the March 2026 CredVault project

Located under `~/.openclaw/workspace/` (see workspace root AGENTS.md for the full map):
- `credvault-contract/` — transcript.compact, transcript-v2.compact, working deploy/invoke
  scripts, COMPILER_BUG_REPORT.md (0.29.0 witness-classification bug — verify fixed in 0.31.1)
- `dsl/` — schema→Compact generator (4 patterns, 30 sample outputs, tests) — resume the
  *ideas*, not the pins
- `CREDVAULT_MIDNIGHT_PREPROD_WORKING_CONFIG.md`, `agents/coder/FIRST_SUCCESSFUL_DEPLOYMENT.md`
  — validated config + 16 error→fix pairs (mostly March-era; re-verify each on current stack)
- `agents/midnight-coder/references/README.md` — 10 canonical patterns
- Old servers are decommissioned; old credentials are dead (confirmed by owner).

---

## 11. Suggested issuer template: "college-degree" (added 2026-09-03)

Source: user's Gemini discussion (`zk conversation.pdf`; transcription in
`.scratch/zk-conversation.txt`). The full encoding lives at
`schemas/college-degree.yaml` — it is the design target for the Step-3 generator.

**The flow (matches our architecture):** university signs each graduate's
transcript at issuance (per-field commitments + one issuer-signed Merkle leaf,
one cohort tree per graduation batch) → graduate downloads pre-minted proof
packages (L1/L2) + their human-readable transcript (L3) → holder presents QR →
verifier checks instantly against the chain. Issuer runtime is batch-only;
students generate zero transactions.

**Disclosure levels** — simplified to what the market actually does (decided
2026-09-03): employers ask "did they graduate?" or "send the transcript";
students don't mind sharing full transcripts (today's norm). The suggested
college template ships TWO levels:
- **L1 instant degree check** — degree valid + not revoked (binary)
- **L3 full transcript + tamper-proof seal** — the student's app delivers the
  canonical package via a time-limited QR link; the PORTAL renders the
  authoritative transcript after recompute-and-compare (single-character
  alteration ⇒ FALSE). No student-rendered document is in the trust path
  (kills the doctored-PDF-with-valid-QR attack); trivially explainable to
  hiring managers: 'read the transcript on the verification page.'
- **L2 GPA-threshold** remains an optional per-issuer flag (recruiting cutoffs
  exist) but is not in the default pitch. **Per-course selective disclosure is
  NOT in the college template** — it moves to the pattern library for
  LICENSE-AUTHORITY templates, where specific coursework is a real requirement
  (CPA credit hours, nursing pharmacology, teacher pedagogy).

**Five claims**: fullName, university, degree, gpa (Uint x100), courseGrades
(fixed-size vector, ≤40, per-course sub-tree). All proven fields must belong to
the same leaf — the anti-cherry-picking binding.

**Compliance hooks** (schema-level): FERPA school-official designation; FCRA
consent + dispute mechanism when the verifier makes hiring decisions (the
"signature is consent" claim is NOT legally sufficient); GDPR break-link
deletion + DPIA for EU; privacy-minimal immutable audit log; SOC 2 Type II as
the enterprise trust target.

**Corrections to Gemini's claims** (design accordingly): proof *generation* is
NOT instant — on-chain *verification* of an existing proof is milliseconds, but
generation is client-side compute (March test-chain benchmarks: 1–2 min on
proof-server 7.0.0; re-benchmark on 8.1.0 in Step 0). Pre-minted packages make
employer checks fast regardless. "Low regulatory burden" is overstated — but see
the refined compliance model below.

**Refined compliance model (agreed 2026-09-03):**
- **CredVault holds NO personal data.** The school holds the records; the student
  presents them. CredVault is tooling/protocol, not a data custodian — FERPA/GDPR
  apparatus stays with the school, which already carries it today.
- **Consent is naturally captured** in the student-presents-QR flow (signed
  employer application release + the student's active presentation). The
  "signature ≠ consent" caveat applies only to *passive* background API lookups
  (traditional clearinghouse model), which we are not.
- **Residual FCRA question (business-model, not code):** if CredVault sells
  verification reports used in hiring decisions, it may itself be classified a
  Consumer Reporting Agency — bringing accuracy/dispute/adverse-action
  obligations. Park for the fee milestone (§12).
- **DPIA** (GDPR Art. 35 impact assessment) is the *school's* obligation as data
  controller, not CredVault's. CredVault's role: supply technical documentation
  for the school's DPIA. Nothing to build.
- **Distribution model (refined 2026-09-03): BOTH hold the data, with roles.**
  School = system of record (authoritative copy, recovery, corrections,
  re-issuance). Student = presentation cache (instant, offline-capable, private).
  Lost/corrupted/modified student copy ⇒ self-service re-download from the school
  portal. CredVault stays PII-free. School-mediated verification (school's server
  answers requests under student authorization) remains a per-issuer option later.
- **Tamper model:** proofs bind CANONICAL FIELD VALUES, never rendered file bytes
  — re-saving/printing/converting a transcript stays valid; editing a value fails
  (that is tampering). There is no 'lock/unlock': the student's data is never
  encrypted from them; alter-and-still-verify is intentionally impossible (that
  impossibility IS the product). Genuine errors are fixed by RECTIFICATION AT THE
  SOURCE: school corrects → re-issues → new commitment anchored → old leaf
  superseded/revoked. Ties into the parked dispute mechanism (§11, §12).

## 12. Verification fees — FUTURE, parked by design (added 2026-09-03)

**Decision: do NOT build the verification fee in v1.** Leave the seams:
- `schemas/*.yaml` carry a `fees:` block with `enabled: false`
- verifier portal gets a paywall hook in the QR→result flow
- per-issuer pricing config + revenue-split model (industry norm: requester
  pays $5–$20/lookup; issuers free or revenue-shared)
- settlement off-chain first (Stripe/invoice); on-chain micropayment splits
  (pattern 6, shielded tokens) later
- consider L1-free-forever as the adoption wedge

---

## 13. Step-0 report — toolchain loop VERIFIED (2026-09-03)

**Stack (current matrix):** compactc 0.31.1, Midnight.js 4.1.1, wallet-sdk 1.2.0,
compact-runtime 0.16.0, onchain-runtime-v3 **3.0.0**, indexer 4.3.3 (API v4),
proof-server 8.1.0, midnight-node 1.0.0. Scaffold: `apps/credvault/step0-hello/`
(create-mn-app hello-world). Contract: `20311ad6088ccbbe772431735d0cc9b945931480e80a4b2697cb6547e7bcd444` on undeployed.

### Benchmarks (undeployed devnet, proof-server 8.1.0)

| Measurement | March 2026 (testnet-era) | Step 0 result |
|---|---|---|
| Full tx loop (local exec → prove → balance → submit → finalize) | proving alone 1–2 min (7.0.0) | **20.0 s** |
| Wallet sync (restored state) | 3–5 min (preprod) | **0.5 s** |
| Deploy end-to-end (incl. image pulls, first run) | 6–7 min | **~2–3 min** |
| findDeployedContract (connect) | — | 0.4 s |
| Indexer state read + ledger decode | ~5 s | **<0.1 s** |

Re-benchmark with a REAL circuit in Step 1 (bigger circuits = longer proving;
20 s here is for a 1-circuit hello-world).

### March workaround obsolescence

| March workaround | Status on current stack |
|---|---|
| `globalThis.WebSocket = WebSocket` (ws) | **STILL REQUIRED** (template uses it, marked "required for wallet sync") |
| `unshieldedToken().raw` balance idiom (not `nativeToken`) | **STILL REQUIRED** |
| `signTransactionIntents` manual signing workaround | **DEAD** — replaced by `wallet.balanceUnboundTransaction(tx, keys, {ttl})` → `wallet.finalizeRecipe(recipe)` |
| wallet-sdk v1.0.0 pin (v2 broken) | **DEAD** — consolidated `@midnight-ntwrk/wallet-sdk` 1.2.0 barrel (facade/hd/shielded/dust/unshielded re-exported) |
| `selectRole(r).deriveKeyAt(0)` (singular) | **CHANGED** — now plural `selectRoles([Zswap, NightExternal, Dust]).deriveKeysAt(0)` → `keysDerived` |
| `findContract` rename | settled: `findDeployedContract`; read state via `publicDataProvider.queryContractState(addr)` + compiled `ledger(state.data)` |
| `wallet.start(sk, dustKey)` no array | unchanged |
| wallet-provider returns hex keys | **CHANGED** — Midnight.js 4.1.x WalletProvider returns key OBJECTS (`shieldedSecretKeys.coinPublicKey`) |
| private-state password | NEW RULE: min 16 chars |

### NEW issue found (current-generation ledger-v7-override analog)

`create-mn-app` fresh installs resolve `compact-runtime@0.16.0`'s
`onchain-runtime-v3: ^3.0.0` to **3.1.0** (published after the matrix), while
`midnight-js-protocol@4.1.1` pins **3.0.0** → two WASM runtime copies →
`instanceof StateValue` fails at `callTx` ("expected instance of StateValue").
**Fix:** package.json `"overrides": { "@midnight-ntwrk/onchain-runtime-v3": "3.0.0" }`
+ `npm dedupe` (must end with exactly ONE hoisted 3.0.0). Recorded in step0-hello.

### Environment gotchas encountered

- `npm run cli` is readline-interactive; **stdin piping does NOT reach it through
  npm/npx/tsx** → use a non-interactive driver script instead (pattern:
  `step0-hello/src/step0-driver.ts`, instrumented with timing marks).
- Sandbox: npm needs a workspace-local cache (`--cache <workspace>/.npm-cache`)
  to avoid home-dir writes; `compact compile` needs home access (zkir cache).
- Template compose comments confirm: proof-server 7.x hangs on Apple Silicon
  (documented upstream now); indexer-standalone 4.3.3 is the stable pin
  (4.3.4/4.4.0 are pre-alpha); node healthcheck must gate on block 1 for the SPO
  component.

### Step-0 exit criteria: ALL MET
Compile → deploy → call → read on undeployed with current versions ✓;
benchmarks recorded ✓; workaround obsolescence recorded ✓.

---

## 14. Step-1 report — degree + revocation contract WORKING (2026-09-03)

**Delivered:** hand-written `degree.compact` (membership ∧ non-membership) +
mock issuer/holder/verifier CLIs, full flow on `undeployed`.
Project: `apps/credvault/step1-degree/`.
Contract: `16312e677740daad2114cdb13eb40952957ef4c3b356715577ed8642b15ee0ab`.

### Exit test — all three cases PASS

| Case | Result | Time |
|---|---|---|
| Valid student (STU-001 Alice Johnson) | ✅ VERIFIED — name, degree, GPA 3.85 confirmed against on-chain anchor, not revoked | **0.1 s** |
| Revoked student (STU-004) | ✗ REVOKED — credential found in on-chain revocation set | 0.1 s |
| Tampered package (GPA 3.85 → 3.95) | ✗ INVALID — presented values don't reproduce the commitment | <0.1 s |

**The 2-second, accountless, issuer-offline verification promise is real: 0.1 s.**

### Benchmarks (undeployed, proof-server 8.1.0)

| Tx | Loop time |
|---|---|
| deploy (incl. constructor proving) | 21.5 s |
| addCohortRoot (real circuit: in-circuit persistentHash + Set insert) | 22.1 s |
| revokeCredential | 24.8 s |

**Finding: small-circuit proving is fixed-overhead-dominated** — a real circuit
costs the same ~20–25 s as hello-world. Batch-friendly: one tx anchors a whole
cohort (our 5-student cohort = 1 tx; 10,000 students = same 1 tx).

### Design decisions validated

1. **Opaque anchors beat ADT trees (for now).** Contract stores our own
   32-byte values (`validRoots: Set<Bytes<32>>`, `revoked: Set<Bytes<32>>`)
   instead of `HistoricMerkleTree` — zero off-chain hash-matching needed.
   Historic roots = just… never removing from the set. (Revisit the ADT in
   Step 2/3 if on-chain-native proofs become necessary.)
2. **In-circuit authority.** Issuer secret → `persistentHash` → compare to
   sealed ledger key; constructor and guard share one in-circuit function, so
   authority needs no off-chain hashing either.
3. **One canonical JS lib** (`src/canonical.ts`, OUR SHA-256 scheme, explicitly
   not Compact's persistentHash) used identically by issuer/holder/verifier —
   the March hash-mismatch class of bug is structurally impossible.
4. **Students generate zero transactions** — confirmed in practice: all holder/
   verifier steps are file + indexer reads.

### New gotchas for the book (compactc 0.31.1)

- **Witness taint on hashes:** writing `authority = persistentHash(sk)` to the
  ledger FAILS to compile ("potential witness-value disclosure must be
  declared") — `persistentHash` doesn't clear taint; must
  `disclose()` the derived key (safe: it's a public key, like a nullifier).
- Decoded ledger Set shape isn't documented — verifier's `setHas` helper
  handles member()/iterable/Map/object shapes defensively.

### Files
`contracts/degree.compact` · `src/{common,canonical,issuer,holder,verifier}.ts` ·
`data/cohort.json` · `packages/*.package.json` (5) · `presentations/`

---

## 15. Step-2 report — issuer runtime + L2 ZK predicates WORKING (2026-09-03)

**Delivered (all in `apps/credvault/step1-degree/`):**
- **Issuer runtime v1** (`src/runtime.ts`): one batch command — ingest cohort →
  commit → tree → anchor (ONE tx, any cohort size) → v2 packages + manifest;
  deploy-with-capture (serializes the proven deploy tx); revoke companion.
- **L2 `verifyMinGPA` circuit** — the first true ZK predicate: witnesses
  (gpa, salt) → in-circuit `persistentCommit` recompute → assert match →
  assert `gpa >= min` → assert not revoked (the ledger read also makes the
  circuit provable — pure computation circuits are NOT provable).
- **Pre-minted L2 proofs** (`src/premint-l2.ts`): ~2 s/proof, off-chain, no gas.
- **Trustless off-chain L2 verification** (`src/l2.ts`): deploy-tx replay →
  `wellFormed` → valid in ~0.15 s. No submission, no trusted server.
- **Stateless verifier HTTP service** (`src/service.ts`): `POST /verify` →
  VERIFIED(200)/REVOKED+INVALID(422). 13–15 ms L1, ~150 ms with L2. Portal precursor.

### Full test matrix — ALL PASS
valid ✓ · revoked ✗ (0.1 s, current chain state) · tampered ✗ (1 char) ·
historic roots (old packages survive new batches) ✓ · rectification
(correct → re-anchor → new verifies, old stays revoked) ✓ ·
L2 valid (≥3.00, ≥3.50 minted per record) ✓ · L2 invalid (below threshold
rejected at the circuit assert before proving) ✓

### Research wins (the hard part)

1. **persistentCommit byte layout CRACKED** (verified on compactc 0.31.1 via
   `contracts/probe.compact` + `src/probe.ts`):
   `persistentCommit<Uint<64>>(x, rand) = SHA-256(rand || le64(x))`;
   `persistentCommit<Bytes<32>>(b, rand) = SHA-256(rand || b)`;
   `persistentHash` pairs = SHA-256(l||r) (March result, still true).
   The GPA field commitment is now a REAL persistentCommit — one commitment
   serves L1 tamper-evidence AND L2 ZK predicates.
2. **Raw proving is FAST: 1.7–2.5 s** per small circuit. The ~22 s full tx
   loop is dominated by balancing/submission/finalization, NOT proving →
   on-demand proof generation is entirely viable UX (pre-minting stays the
   default; novel proofs are a ~3 s issuer-side operation).
3. **Off-chain proof VERIFICATION recipe** (was undocumented): the proof
   server's `/check` only validates preimages — real verification =
   `LedgerState.blank` → replay the captured proven DEPLOY tx
   (`wellFormed` + `apply`) → state with verifier keys →
   `l2Tx.wellFormed(state, strictness{verifyContractProofs only})`.
4. **Gotchas for the book**: `Transaction.deserialize('signature','proof',
   'pre-binding', raw)` for proven-but-unbound txs ('binding' for finalized);
   `LedgerState.updateIndex` DROPS operation verifier keys (use deploy replay);
   WASM classes don't `instanceof` across packages (onchain-runtime-v3 vs
   ledger-v8) — bridge via `serialize()`/`deserialize()`;
   `privateStateProvider.setContractAddress()` required before `set()`.

### Revocation semantics (settled)
L2 proofs are frozen to their mint-time state — revocation is NOT consulted
from stale proofs. Revocation lives in the L1 check, which always runs against
CURRENT chain state before any L2 evaluation. Layered and correct.

### ADT decision (checkpoint)
**Keep the opaque-roots design** (validRoots: never-remove Set). It gave
historic roots for free, full control of hashing, and zero ADT coupling.
`HistoricMerkleTree` adds nothing our zero-tx model needs; revisit only if a
future template requires on-chain member-proof evaluation.

### Cost model confirmed
5→6 students = same ONE anchor tx. 10,000-student cohort = one ~25 s tx/year
+ ~2 s × (students × thresholds) of parallelizable off-chain premint CPU.
Students generate ZERO transactions, always.

---

## 16. Step-2b report — per-course selective disclosure WORKING (2026-09-04)

**Delivered:** scheme v3 — every student's courses form a Merkle sub-tree
(`courseLeaf = H("credvault:course:" || code||title||credits||grade||salt)`)
committed into the master leaf via `masterLeafV3`. Holder reveals ANY subset;
verifier recomputes the sub-root from revealed leaves+paths — every revealed
path must converge to the SAME sub-root (that convergence check IS the
anti-cherry-picking guarantee). Reveal-style only: zero new circuits, zero new
transactions, zero proving. Package schema `credvault-degree/0.3`.

### Test matrix — ALL PASS
full reveal (5/5) ✓ · subset (2/5 + "3 SEALED") ✓ · tampered course grade ✗ ·
mixed credentials (another student's course stitched in) ✗ · revocation ✗ ·
L2 threshold on v3 ✓

### TTL saga (the gotcha of the day, now settled)
- midnight-js stamps intents with ~1h TTL (ttlOneHour) — a SUBMISSION window.
- `wellFormed`'s TTL check is driven by its **tblock argument** (probe-verified).
- The JS `intent.ttl` setter mutates the JS view but NOT the WASM snapshot —
  mutation is useless for validation.
- Recipes: deploy replay → tblock = deployedAt + 30min; L2 proof check →
  tblock = proof mint time; off-chain proofs slimmed to the call intent only
  (dust offers carry their own expiring TTLs).
- **Verifier-CLI refactor:** `verifier.ts` now sits on `verify-core.ts`
  (same logic as the HTTP service — one implementation, two front-ends).

---

## 17. Step-2c report — monolithic transcript mode (2026-09-04)

**Delivered:** issuers now choose `transcriptMode: granular | monolithic` at
onboarding. Monolithic = the whole transcript committed as ONE blob
(`docCommit = H("credvault:doc:" || canonicalTranscript || docSalt)`) in the
SAME master-leaf slot as the course sub-root — no per-course structure needed,
all-or-nothing verification. **One contract serves both modes** (anchors are
opaque roots). Canonical doc form: sorted "CODE|TITLE|CREDITS|GRADE" lines,
normalized — order-independent and size-independent (4 or 400 courses, any
document shape). Test matrix: monolithic verify ✓ · tampered blob ✗ · subset
on monolithic issuer → honest refusal ✓ · granular regression ✓.

**Onboarding ingestion (settled):** colleges never parse PDFs — SIS CSV/API
exports are the path (that's how they feed the Clearinghouse today). Ladder:
CSV cohort file → per-school SIS connector → PDF extraction as fallback only.
PDFs are rendered FROM data, never trusted as input.

---

## 18. Idempotent batching (2026-09-05, user-requested)

**Problem:** every batch used fresh random salts → re-running a batch re-minted
everything (new leaves, new root, new proofs). Wasteful and confusing.

**Fix — deterministic salts:** `kdfSalt = H("credvault:kdf:" || issuerSecret ||
studentId || field)`. Re-running an unchanged cohort reproduces IDENTICAL
commitments, enabling:
- **Root-exists check**: batch computes the root, checks `validRoots` on-chain,
  and SKIPS the transaction when unchanged ("⏭ already anchored") — no 20s tx.
- **Proof preservation**: packages carry over `l2Proofs` when the credId is
  unchanged (stable credential identity across re-batches).
- **Premint skipping**: students holding all standard thresholds are skipped
  ("already minted").
- Rectification still works naturally: a changed record = new leaf/credId
  (old credId should be revoked per the rectification flow).

**Answer to "mint once?" — yes now:** batch is a no-op unless the cohort data
actually changed; re-minting is reserved for changes/lost-info, exactly as the
user proposed. Storage note: packages are per-student files overwritten in
place (~10–30 KB); on-chain only 32-byte roots accumulate, one per DISTINCT
cohort batch.

## 10a. To-revisit list (deferred features, with design seeds)

### R1. On-chain verification premium tier — RECEIPTS + atomic fee settlement (parked 2026-09-03, user-requested)

**Why it matters:** an on-chain verification is a non-repudiable RECEIPT
("this claim was verified, at this time, for this requester") — a product
feature in its own right (FCRA audits, disputes, court-grade evidence), and
the fee split (§12) can settle ATOMICALLY in the same transaction as the check.

**The trade (accepted):** cost + ~22s latency + wallet-friction (verifier or a
CredVault relay submits) + a metadata leak (the tx publicly discloses contract,
timing, and credId → holder activity tracking). Off-chain stays the DEFAULT;
on-chain is the premium tier.

**Design seeds for when we pick it up:**
- A `recordVerification` circuit: verifies the predicate AND writes a receipt
  (credId + claim type + timestamp + requester commitment) into a receipts
  log on-chain. Receipts reveal nothing about the holder beyond what the
  verifier already knows.
- Submitter options: verifier's own wallet (enterprise tier) OR CredVault
  relay (needs key management, rate limiting, abuse protection; relay pays
  DUST, recoups via the §12 fee).
- Atomic settlement: the $20 split (issuer/platform/ops) in the SAME tx as
  the receipt write — reconciliation-free revenue.
- ANTI-REPLAY is the other trigger: single-use credentials (one-time
  registrations, tickets) REQUIRE on-chain nullifier insertion — impossible
  off-chain. First issuer needing it forces this milestone.
- Mitigation for the metadata leak: requester-side batching (one receipt tx
  per N checks via a relay), and credId-only disclosure (no holder linkage).

**Triggers to pull it forward:** (a) §12 fee milestone; (b) any issuer with
single-use credentials; (c) a pilot customer asking for audit receipts
(enterprise differentiator, near-zero extra build on the L2 work).

### R2. Power-user schema JSON upload/export (Step-3 requirement, user-requested 2026-09-05)

The generator's canonical input is the Schema AST (JSON); the questionnaire is
only a VIEW that produces it. So: wizard for business users, **JSON upload for
power users** — same engine, same 6-gate validation pipeline. Design seeds:
- `POST /schemas` accepts raw schema JSON → validate → dry-run report (no deploy)
  → generate; better raw diagnostics than the wizard path.
- Round-trip export: any wizard-made schema downloadable as JSON for hand-editing.
- Version pinning to the descriptor spec; explicit migration notes or rejection.
- Escape hatch bounded by "configuration, not code": JSON composes audited
  primitives only; arbitrary custom Compact stays a v2 seam with review gates.
- Enables git-managed schemas, CI generation, and devnet→preprod→mainnet
  promotion of the same JSON.

## 10. Open questions (parked)

- Holder app: pre-minted packages only, or also live proof requests? (Likely both, per-schema.)
- Holder-binding: does the holder app get an invisible secret for nullifiers, or is binding
  issuer-side only? Decide in Step 1.
- Revocation granularity for licenses vs degrees — one registry design or two?
- Contract migration UX when an issuer changes rules (Step 3).
- Proving time on proof-server 8.1.0 (Step 0/1 benchmark).