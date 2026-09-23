# Module 6: Zero-Knowledge Predicates (L2) — Proving Without Revealing

> Time: ~5 hours | Prerequisites: Module 5 (you can build the commitment chain and run all L1 verdicts). Devnet running, `step1-degree` compiled.

Module 5's verification is **reveal-style**: the holder shows values, the
verifier recomputes hashes. But what if the holder doesn't want to show the
value at all? "Is my GPA ≥ 3.50?" should be answerable **without ever
disclosing the GPA** — not to the employer, not to the chain, not to anyone.
That is what zero-knowledge proofs are for, and in this module we build the
whole thing: the byte-level commitment research, the three-line circuit, the
~2-second off-chain proof minting, the trustless verification recipe, and the
two war stories (the probe and the TTL saga) that taught us how this platform
really works.

## Learning objectives

By the end of this module:

- You can **explain** what a ZK proof is at the right intuition level: a proof that *some* hidden inputs satisfy a public program — revealing nothing else.
- You can **read** the `verifyMinGPA` circuit line by line and justify every `assert` — including why the ledger read makes the circuit provable at all.
- You can **reproduce** the `persistentCommit` byte layout in JavaScript and explain the probe method that cracked it (with the real test vectors).
- You can **pre-mint** L2 proofs and explain why minting is off-chain, ~2 s, gas-free — and why a *false* claim dies before any proving happens.
- You can **perform** trustless off-chain verification: replay the deploy transaction, rebuild the ledger state, run `wellFormed` — and articulate exactly what you are trusting.
- You can **tell the TTL saga**: submission window vs proof soundness, the `tblock` discovery, and the three recipes that settled it.
- You can **assemble and attack** subset disclosures, and explain why sub-root convergence is the anti-cherry-picking guarantee.
- You can **explain** the layered revocation semantics: why L2 proofs are frozen in time, and why that is safe.

---

## 1. Concepts from scratch

### 1.1 From "show and recompute" to "prove and reveal nothing"

L1 verification (Module 5) answers: "are these *shown* values the committed
ones?" The employer learns Alice's GPA because Alice shows it. Fine for "send
the transcript". But some questions are **predicates**, not documents:

- "GPA ≥ 3.50?" (a recruiting cutoff)
- "Age ≥ 18?" / "License current?" / "Credit hours ≥ 30?"

For these, the value itself is nobody's business — only the boolean is. The
naive approach (show the value, let the verifier compute the boolean) leaks
exactly what we wanted to protect: 3.98 vs 3.62 is invisible in a predicate,
fully visible in a reveal.

A **zero-knowledge proof** lets a prover convince anyone of:

> "I know hidden inputs (called **witnesses**) such that this public program,
> run on (public inputs + my witnesses), completes without failing any
> assertion."

…while revealing **nothing** about the witnesses beyond what the public
inputs and the assertions already imply. Three properties, in plainer words
than the textbooks use:

- **Soundness:** you cannot produce a proof of a false statement. No
  satisfying witnesses exist, so no proof exists. (We will watch this happen,
  live, in Lab 4.)
- **Zero-knowledge:** the proof leaks nothing about the witnesses. The
  verifier sees "≥ 3.50: TRUE" and literally nothing about the GPA.
- **Completeness:** a true statement (with honest witnesses) always proves.

The "public program" in Midnight is a **circuit** — the Compact circuits you
have already met (`addCohortRoot`, `revokeCredential`). Time to meet the
third one.

### 1.2 The circuit, line by line: `verifyMinGPA`

Here is the entire L2 circuit from `contracts/degree.compact` — six lines
of body that took a research saga to get right:

```compact
witness gpaValue(): Uint<64>;
witness gpaSalt(): Bytes<32>;

export circuit verifyMinGPA(credId: Bytes<32>, gpaCommit: Bytes<32>, minGpa: Uint<64>): [] {
  const gpa = gpaValue();
  assert(persistentCommit<Uint<64>>(gpa, gpaSalt()) == gpaCommit, "GPA/salt do not match the credential commitment");
  assert(gpa >= minGpa, "GPA below the required minimum");
  assert(!revoked.member(disclose(credId)), "credential is revoked");
}
```

**The cast.** `credId`, `gpaCommit`, `minGpa` are **public inputs** —
visible to everyone, including on-chain if this proof were ever submitted.
`gpaValue()` and `gpaSalt()` are **witnesses** — hidden inputs supplied
by the prover at proving time. The whole ZK magic is: the proof convinces you
the asserts held for *some* witnesses, without showing them.

**Assert 1 — the binding.** `persistentCommit<Uint<64>>(gpa, gpaSalt()) ==
gpaCommit`. The prover's hidden GPA and salt must reproduce the *public*
commitment — the very same `gpaCommit` that sits in the credential package
and is welded into the anchored master leaf (Module 5, §1.6). This is what
ties the proof to **this credential**: you cannot prove things about a GPA
you made up; you must know the opening of a real commitment. Note
`persistentCommit` (not `persistentHash`): it takes the salt, so the
commitment *hides* — and as the privacy-patterns catalog documents,
`persistentCommit` also "clears witness taint" (the compiler treats its
output as safely hidden), which `persistentHash` does not.

**Assert 2 — the predicate.** `gpa >= minGpa`. The actual claim. Two
details that are easy to miss and expensive to learn:

- The comparison is on `Uint<64>`, never on `Field`. Compact's finite
  field wraps around, so ordering comparisons on field elements are
  meaningless — the privacy-patterns catalog lists "comparisons only on
  `Uint<N>`" as a standing gotcha. (This is also why GPA is ×100: no floats
  in circuits, ever.)
- The prover chooses which `minGpa` proofs to mint — but `minGpa` is a
  public input, so a proof is valid **only for the exact threshold it was
  minted for**. A "≥ 3.00" proof says nothing about "≥ 3.50". That is why
  packages carry an *array* of proofs, one per standard threshold.

**Assert 3 — the liveness read, and the provability trick.**
`assert(!revoked.member(disclose(credId)), ...)` reads the on-chain
revocation set and demands this credential is not in it. Two jobs in one line:

1. **It binds the proof to a live credential** — at mint time, a revoked
   credential cannot even mint a proof.
2. **It makes the circuit provable at all.** A circuit that only computes on
   witnesses — hash this, compare that — is a *pure computation*: there is no
   public, on-chain statement for a verifier to check the proof against, and
   Midnight's pipeline will not produce a transaction proof for it. Reading
   the ledger turns the circuit into a real contract call with a state
   dependency, which *is* provable. When we first tried a ledger-free version
   of this circuit, proving simply didn't work; the revocation read was the
   fix, and it earns its keep semantically too. **Moral: if your predicate
   circuit won't prove, give it a ledger read.**

> What does the proof *say*, in one sentence? "Whoever minted this knew a GPA
> and salt opening `gpaCommit` — the commitment welded into credential
> `credId` — the GPA was at least `minGpa`, and `credId` was not revoked
> at the time." All four public values are visible; the GPA and salt are not.

### 1.3 The probe: reverse-engineering `persistentCommit`'s byte layout

Assert 1 forces a hard requirement: the **JavaScript** side (issuer runtime,
verifier) and the **Compact** side (the circuit) must compute the *identical*
commitment for the same (gpa, salt) — byte for byte. The docs say
`persistentCommit` is SHA-256-based, but the exact byte layout was
undocumented. Salt first or last? How is a `Uint<64>` serialized —
8 bytes little-endian, big-endian, 32-byte padded? Guess wrong and you get the
March-2026 class of bug: two implementations that each look correct and
silently disagree.

We didn't guess. We **probed**. The method is worth learning because it works
for any undocumented serialization:

**Step 1 — ask the compiler directly.** Write a throwaway contract
(`contracts/probe.compact`) whose circuits do nothing but return the
primitive's output for caller-supplied inputs:

```compact
export circuit pcUint(x: Uint<64>, rand: Bytes<32>): Bytes<32> {
  return persistentCommit<Uint<64>>(x, rand);
}
export circuit pcBytes(b: Bytes<32>, rand: Bytes<32>): Bytes<32> {
  return persistentCommit<Bytes<32>>(b, rand);
}
export circuit phPair(l: Bytes<32>, r: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([l, r]);
}
```

**Step 2 — call it from JS with known inputs.** The compiled contract exposes
`pureCircuits` — circuits callable locally, no chain, no proof server:

```ts
const x = 385n;                       // GPA 3.85
const rand = Buffer.alloc(32, 7);     // salt = 0x0707...07
const b32  = Buffer.alloc(32, 3);     // bytes = 0x0303...03
console.log(hex(pureCircuits.pcUint(x, rand)));
```

**Step 3 — race candidate layouts against the truth.** Enumerate every
plausible serialization in JS and see which one matches:

```
compact pcUint(385, 07..07): a5c8056f0217cb89918487e23326ee8bf6265b5f6113213eced4748ffe599460

=== candidates for pcUint ===
           sha256(le64||rand):    3f62782f65...
           sha256(be64||rand):    5d63c1c6d0...
           sha256(pad32le||rand): dab2075bed...
           sha256(pad32be||rand): ed98ba53a7...
✅ MATCH  sha256(rand||le64):    a5c8056f0217cb89918487e23326ee8bf6265b5f6113213eced4748ffe599460
           sha256(rand||pad32le): c637f9c73d...
           sha256(le64):          39fea3826f...
           sha256(pad32le):       0fd907de47...
```

**The cracked layout** (verified on compactc 0.31.1, and now regression-pinned
as test vectors in `src/canonical.ts`):

```
persistentCommit<Uint<64>>(x, rand)  = SHA-256(rand ‖ le64(x))     le64 = 8-byte little-endian
persistentCommit<Bytes<32>>(b, rand) = SHA-256(rand ‖ b)
persistentHash<[Bytes32, Bytes32]>   = SHA-256(l ‖ r)

test vectors:
  pcUint(385, 0x0707…07)        = a5c8056f0217cb89918487e23326ee8bf6265b5f6113213eced4748ffe599460
  pcBytes(0x0303…03, 0x0707…07) = 46df2f81386a0f40ecbb003e48324a2cb398375847b9759d20347554f65e8063
```

**Why this matters so much:** because the GPA field commitment uses this exact
layout (`compactCommitUint64` in `canonical.ts`), **one commitment serves
two masters** — L1 recomputation (Module 5's tamper check) and L2 in-circuit
predicates (Assert 1). No parallel commitment schemes, no drift. When someone
asks "how do you know your JS matches the chain's math?", the honest answer
is: *we extracted the ground truth from the compiler itself and pinned it
with test vectors.* (Lab 1 reproduces the whole probe.)

### 1.4 Minting: witnesses in, proof out — and false claims die at the door

Pre-minting (`src/premint-l2.ts`) is the issuer's graduation-day job: for
every student, for every standard threshold (`THRESHOLDS = [300n, 350n]` —
3.00 and 3.50), mint one L2 proof into the student's package. The flow per
proof:

1. **Load the witnesses into private state** — the student's actual GPA and
   their gpa salt, straight from the package:
   `ts
   await providers.privateStateProvider.setContractAddress(pkg.contractAddress);
   await providers.privateStateProvider.set(PRIVATE_STATE_ID, {
     issuerSk: initialPrivateState.issuerSk,
     gpa: BigInt(pkg.values.gpa),
     gpaSalt: new Uint8Array(C.fromHex(pkg.salts.gpa)),
   });
   `
2. **Build the call** with the public inputs (credId, gpaCommit, minGpa) and
   run `createUnprovenCallTx`. This executes the circuit **locally** with
   your witnesses — which means **the asserts run here**. If the GPA is below
   the threshold, the circuit throws *right now*, before any proving:
   `
   STU-002 @>=3.50: NOT minted (failed assert: GPA below the required minimum)
   `
   Brian's 3.42 cannot mint a "≥ 3.50" proof — not by him, not by the issuer,
   not by anyone. **This is soundness you can watch.** A ZK proof is a
   certificate that satisfying witnesses exist; for a false statement there
   are none, and witness generation is exactly where that fact bites.
3. **Slim the transaction** (drop the wallet's fee machinery — §1.6) and send
   it to the local proof server: `proofProvider.proveTx(slimTx)`. Raw
   proving of this small circuit takes **~1.7–2.5 s**. (The ~22 s you saw for
   on-chain txs in Module 5 is balancing/submission/finalization overhead,
   not proving — a useful myth to kill early.)
4. **Store the artifact**: the serialized proven transaction (hex), the
   `minGpa` it is valid for, and `mintedAt` — a timestamp that becomes
   crucial in §1.6.

No gas, no submission, no chain involvement: minting is **off-chain CPU
work**, embarrassingly parallel (10,000 students × 2 thresholds = 20,000
proofs ≈ a few CPU-hours you can spread across cores). Students remain at
zero transactions, forever. A novel threshold later (an employer demanding
≥ 3.70) is a ~3 s issuer-side operation — or the holder hides the GPA and
shares an existing threshold proof (§1.8).

### 1.5 Trustless off-chain verification: the assembled recipe (taught honestly)

A minted proof is a **serialized proven transaction that is never submitted**.
How does a verifier check it without a node, an account, or a trusted server?
The answer is a recipe we assembled from SDK pieces — it was **not**
documented anywhere, so I will teach both the recipe and the honest trust
argument.

```ts
// src/l2.ts (simplified narrative)
const deployTx = ledger.Transaction.deserialize('signature', 'proof', 'pre-binding', rawDeploy);
const blank    = ledger.LedgerState.blank('undeployed');
const okDeploy = deployTx.wellFormed(blank, strictProofsOnly(), deployReplayTime);   // verify the deploy proof
const [state]  = blank.apply(okDeploy, new ledger.TransactionContext(blank, blockCtx)); // execute it locally
// ...then, per proof:
const tx = ledger.Transaction.deserialize('signature', 'proof', 'pre-binding', proofBytes);
tx.wellFormed(state, strictProofsOnly(), proofMintTime);   // throws if the ZK proof is invalid
```

Step by step:

1. **Capture at deploy.** The issuer runtime deploys "with capture": the
   proven deploy transaction is serialized to `data/deploy-proof.bin`
   (`runtime.ts`, `ensureDeployed`). This file is the seed of all later
   off-chain verification.
2. **Replay the deploy on a blank ledger.** `LedgerState.blank` gives an
   empty ledger; `wellFormed` **verifies the deploy transaction's ZK
   proof**; `apply` executes it, producing the post-deploy ledger state.
   Why this dance? Because we need the contract's **verifier keys** (the
   public keys that check circuit proofs), and the obvious API for reading
   chain state — `LedgerState.updateIndex` — **drops operation verifier
   keys**. Replaying the deploy rebuilds a state that has them. (Gotcha from
   the trenches, now in the book.)
3. **Verify the L2 proof against that state.** `wellFormed(state,
   strictness, tblock)` with a strictness object that says: don't check
   balancing, signatures, native proofs, or limits — **only
   `verifyContractProofs = true`**. It re-runs the mathematical
   verification of the ZK proof against the contract's verifier key. Throws
   → invalid. Returns → the proof is real. Total time: **~0.15 s**, entirely
   offline.

**The trust argument — said plainly.** This is an *assembled pattern*, not an
SDK feature with a security proof, so be precise about what you trust:

- You trust the **deploy transaction the chain accepted**. The verifier keys
  come from *your own replay* of that transaction — not from any server's
  say-so. `wellFormed` checking the deploy's proof is what makes the replay
  more than "just executing a file".
- The serialized deploy artifact (`deploy-proof.bin`) travels with the
  deployment. A paranoid verifier can cross-check it against the on-chain
  contract address in the package (the address is part of the public record
  the package already pins).
- Everything after that is pure local cryptography: deserialize → wellFormed.
  No submission, no account, no trusted intermediary.

What you get for this unusual construction: **employer-side verification of a
zero-knowledge predicate in ~0.15 s with zero infrastructure** — the L2 tier
of the "2-second, accountless" promise.

### 1.6 The TTL saga: a submission window is not a soundness clock

The gotcha of the saga, earned over a full day of debugging. Symptoms first:
L2 proofs verified fine right after minting, then started failing hours later
with `Intent TTL has expired` — as if proofs "went stale". Watch the trap
being built:

1. **Midnight.js stamps every transaction intent with a TTL** (time-to-live),
   defaulting to about one hour. Its purpose is **liveness**: a bound on how
   long a *submitted* transaction may sit around waiting to be included —
   a *submission window*.
2. **Our proofs are never submitted.** They are long-lived artifacts, verified
   offline months later. A submission window has no business expiring them —
   TTL is **not a proof-soundness concept**. A year-old proof of a true
   statement is still a proof of a true statement.
3. **But `wellFormed` checks TTL anyway** (it's part of transaction
   well-formedness), so our offline verification kept tripping a clock that
   meant nothing to us.

Theories died in order: "patch the intent's `ttl` field" — **useless**,
because the JS setter mutates the JavaScript view of the transaction but not
the WASM snapshot that validation actually reads. "Freeze the state clock" —
half right, but the decisive discovery came from a probe (`src/ttl-probe.ts`
— the same scientific method as §1.3): **the TTL check is driven by the
`tblock` argument you pass to `wellFormed`, not by your wall clock.**

That one fact yields the three settled recipes, all now in `src/l2.ts` and
`src/premint-l2.ts`:

| Recipe | What we do |
|---|---|
| **Deploy replay** | validate with `tblock = deployedAt + 30 min` — inside the deploy intent's original window |
| **L2 proof check** | validate with `tblock = mintedAt` (stored in the package), and advance the replayed state's clock to mint time via `postBlockUpdate` |
| **Slim intents** | strip the wallet's dust/zswap fee offers from off-chain proofs (they carry their *own* expiring TTLs); keep only the contract-call intent |

And here is the saga as a living fossil: the old research script
`src/verify-l2.ts` still validates against **wall-clock now**. Run it today
against the September 3 deploy and you get the authentic failure:

```
DEPLOY REPLAY FAILED: transaction application error detected during verification:
Intent TTL has expired. TTL: Timestamp(1788475661), Current block: Timestamp(1788599532)
```

1788599532 − 1788475661 ≈ 34.4 hours — the one-hour window, dead by a day and
a half. Meanwhile the production path (`l2.ts`, correct `tblock`) verifies
the same artifacts instantly. **Morals:** (a) probe, don't guess — the docs
didn't say any of this; (b) when a platform conflates a liveness window with
your long-lived artifact, pass the clock explicitly; (c) mutating a JS
wrapper around WASM state may change nothing at all — verify against the
thing that actually executes.

### 1.7 Subset disclosure: course sub-trees and the convergence check

L2 handles hidden *values*. The other selective-disclosure trick needs **no
circuit at all**: revealing a *subset* of courses while the rest stay sealed.
Mechanics (scheme v3, Module 5 §1.11's granular mode):

- Every course is a leaf: `courseLeaf = H("credvault:course:" ‖ code ‖ title
  ‖ credits ‖ grade ‖ salt)`.
- The student's courses form a **sub-tree**; its root (`courseSubRoot`) is
  welded into the master leaf.
- The package carries every course's value, salt, and Merkle path — a fixed
  inventory (~a few KB). Any subset is just a pick from the inventory: Alice
  shares MATH420 + CS460 and leaves the other three sealed.

Verification is reveal-style recompute — plus one extra rule:

> **Every revealed course's path must recompute to the SAME sub-root.**

That **convergence check IS the anti-cherry-picking guarantee**. Watch it
stop two different attacks (both run in Lab 6):

- **Tampered grade** (MATH420 A → B+): the edited course hashes to a different
  leaf → its path recomputes to a different sub-root than CS460's →
  `✗ TAMPERED — course paths do not converge to one sub-root`.
- **Mixed credentials** (stitch *David's* MATH420 A− into *Alice's*
  presentation): David's course leaf + path lead to *David's* sub-root, not
  Alice's → same convergence failure. One student's A can never be sewn into
  another's transcript.

Note the honest subtlety: the same error message catches both attacks,
because cryptographically they are the same attack — "these revealed leaves
do not all belong to one committed set." And since the sub-root then feeds
`masterLeafV3` → cohort root → on-chain anchor, the whole chain of Module 5
still stands behind the two revealed courses.

### 1.8 Redaction and revocation: how the layers compose

Two last pieces make the system whole:

**GPA redaction (the bridge between L1 and L2).** A presentation may *omit*
`values.gpa` (and `salts.gpa`). The verifier then takes `gpaCommit`
straight from the package — the master leaf still recomputes (the commitment
was always the leaf ingredient; the value was only needed to *re-derive* it),
and now **only an L2 proof can say anything about the hidden value**. Show
the transcript, seal the GPA, attach a "≥ 3.50" proof: the employer sees
everything except the number, and the number's claim is ZK-proven.
(`verify-core.ts`'s `gpaRedacted` path; see it exercised in
`src/test-redact.ts`.)

**Layered revocation (settled semantics).** Assert 3 checked revocation **at
mint time**, and an off-chain proof is frozen to that moment — a stale proof
never re-consults the chain. Is that a hole? No, because the layers are
ordered: **the L1 check in `verify-core.ts` always runs first, against
CURRENT chain state** (Module 5, §1.9). Revoke Alice today and every L1 check
fails immediately; the L2 layer is only ever evaluated for credentials whose
L1 layer just passed. Frozen proofs, live revocation — layered and correct.

---

## 2. Hands-on lab

> All labs in `apps/credvault/step1-degree/`. Outputs shown are real
> captures from this devnet.

### Lab 1 — reproduce the probe (15 min)

The probe contract is already compiled (`contracts/managed/probe/`; if
missing: `compact compile contracts/probe.compact contracts/managed/probe`).
Run the extraction and watch the candidate race:

```bash
npx tsx src/probe.ts
```

```
compact pcUint(385, 07..07): a5c8056f0217cb89918487e23326ee8bf6265b5f6113213eced4748ffe599460
compact pcBytes(03.., 07..): 46df2f81386a0f40ecbb003e48324a2cb398375847b9759d20347554f65e8063
compact phPair(03.., 07..):  79064a84d1b8a52270aadd7559c91d055793a4be48eab94aaf1ccd97e96203a2

=== candidates for pcUint ===
...
✅ MATCH  sha256(rand||le64): a5c8056f0217cb89918487e23326ee8bf6265b5f6113213eced4748ffe599460
...
=== candidates for pcBytes ===
✅ MATCH  sha256(rand||b): 46df2f81386a0f40ecbb003e48324a2cb398375847b9759d20347554f65e8063
=== phPair check ===
sha256(l||r) === phPair? ✅ MATCH
```

Now confirm **your** library computes the Compact-identical bytes:

```bash
npx tsx -e "
import * as C from './src/canonical';
const rand = Buffer.alloc(32, 7);
console.log(C.toHex(C.compactCommitUint64(385n, rand)));
console.log('matches the Compact test vector?',
  C.toHex(C.compactCommitUint64(385n, rand)) ===
  'a5c8056f0217cb89918487e23326ee8bf6265b5f6113213eced4748ffe599460');
"
# expect: matches the Compact test vector? true
```

### Lab 2 — pre-mint the L2 proofs (10 min)

```bash
npm run premint
```

On an already-minted workspace you will see the idempotence from Module 5
carrying proofs over — plus the two honest failures:

```
  STU-001: already minted, skipping
  STU-002 @>=3.50: NOT minted (failed assert: GPA below the required minimum)
  STU-003: already minted, skipping
  STU-004 @>=3.50: NOT minted (failed assert: GPA below the required minimum)
  ...
✅ pre-minting complete
```

(On a fresh batch you'll instead watch real minting: `STU-001 @>=3.00:
minted [1.8s]` etc. — ~2 s per proof, no gas.) Read the NOT-minted lines
carefully: Brian (3.42) and David (3.49) **cannot** mint ≥ 3.50. The circuit
said no, locally, before any proving. Open a package and find the
`l2Proofs` array: each entry is `{ minGpa, provenTx (hex), mintedAt }` —
the proven transaction is a few KB of hex. That hex *is* the zero-knowledge
proof.

### Lab 3 — verify L2 through the production path (10 min)

```bash
npm run verifier presentations/STU-001.presentation.json -- --min-gpa 350
```

```
✅ VERIFIED
   ...
   L2:      ✅ ZK PROOF VALID — GPA >= 3.50 (GPA never revealed)
   verify time: 0.2s
```

Behind that line, `verify-core.ts` called `verifyL2ProofHex`, which
replayed the deploy (cached), advanced the state clock to `mintedAt`, and
ran `wellFormed` — the whole §1.5 recipe in ~0.15 s. Now the layering demo:

```bash
npm run verifier presentations/STU-002.presentation.json -- --min-gpa 350
# ✗ L2_UNAVAILABLE — no pre-minted proof for GPA >= 3.50

npm run verifier presentations/STU-002.presentation.json -- --min-gpa 300
# ✅ VERIFIED + L2: ✅ ZK PROOF VALID — GPA >= 3.00
```

Brian is a real graduate (L1 passes), the 3.50 **claim** is what fails, and
the 3.00 claim succeeds. Three different truths, three different verdicts —
the system never blurs them.

### Lab 4 — try to mint a false proof (15 min)

Your turn to be the attacker. Goal: mint "David Kim ≥ 3.50" even though his
GPA is 3.49. Open `src/premint-l2.ts`, and either (a) temporarily add
`350n` to David's thresholds — it already fails — or (b) write a small
script that calls `createUnprovenCallTx` with David's witnesses and
`minGpa = 350n`. Either way the result is the same line you saw in Lab 2:

```
NOT minted (failed assert: GPA below the required minimum)
```

Now the important part — **change tactics**: try to lie about the *witnesses*
instead of the threshold. Set `gpa: 399n` in the private state for David's
call. It dies at **Assert 1** instead:

```
failed assert: GPA/salt do not match the credential commitment
```

because `persistentCommit(399, davidSalt) ≠ davidGpaCommit`. Each assert
guards its own attack: lie about the value → Assert 1; true value, false
predicate → Assert 2; revoked credential → Assert 3. There is no fourth move.
(Soundness, experienced rather than asserted.)

### Lab 5 — the TTL saga, live (15 min)

First, reproduce the original failure with the fossil script (it validates
against wall-clock time):

```bash
npx tsx src/verify-l2.ts
```

```
DEPLOY REPLAY FAILED: transaction application error detected during verification:
Intent TTL has expired. TTL: Timestamp(1788475661), Current block: Timestamp(1788599532)
```

Compute the gap: `(1788599532 − 1788475661) / 3600 ≈ 34.4` hours past the
~1 h window. The deploy proof is still perfectly sound — only the
*submission window* lapsed, and the script foolishly checks it against *now*.

Now open `src/l2.ts` and find the three recipes (§1.6): `replayTime =
deployedAt + 30 min` for the deploy replay; `tblock = mintedAt` plus
`postBlockUpdate` for proof checks; slim intents in `premint-l2.ts`.
Finally, run the *correct* path again (Lab 3) and note it verifies artifacts
from days ago in ~0.15 s. Optional: run `npx tsx src/ttl-probe.ts` — it
validates the deploy at three different `tblock` values and shows the
window opening and closing, proving the check is driven by the argument.

### Lab 6 — subset disclosure and the two attacks (20 min)

**Subset share.** Alice shares only Cryptography and Machine Learning:

```bash
npm run holder STU-001 -- --courses MATH420,CS460
npm run verifier 'presentations/STU-001-MATH420+CS460.presentation.json'
```

```
✅ VERIFIED
   ...
   Courses:  (revealed 2 of 5)
       MATH420  A   Cryptography (3 cr)
       CS460    A-  Machine Learning (3 cr)
      … 3 more course(s) SEALED (not disclosed by holder)
   verify time: 0.1s
```

The verifier learned exactly two courses and *can still prove* they belong to
Alice's anchored credential. That line — "3 more course(s) SEALED" — is
selective disclosure in one sentence.

**Attack 1 — tamper a revealed grade:**

```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('presentations/STU-001-MATH420+CS460.presentation.json'));
p.courses.find(c=>c.code==='MATH420').grade='B+';
fs.writeFileSync('presentations/tampered-course.json', JSON.stringify(p,null,2));"
npm run verifier presentations/tampered-course.json
# ✗ TAMPERED — course paths do not converge to one sub-root (mixed credentials?)
```

**Attack 2 — stitch in another student's course:**

```bash
node -e "const fs=require('fs');
const a=JSON.parse(fs.readFileSync('presentations/STU-001-MATH420+CS460.presentation.json'));
const b=JSON.parse(fs.readFileSync('packages/STU-004.package.json'));
a.courses[0]=b.courses.find(c=>c.code==='MATH420');
fs.writeFileSync('presentations/mixed.json', JSON.stringify(a,null,2));"
npm run verifier presentations/mixed.json
# ✗ TAMPERED — course paths do not converge to one sub-root (mixed credentials?)
```

David's A− cannot be sewn into Alice's transcript: his leaf and path walk up
to *his* sub-root, Alice's to hers, and convergence demands one root. (Yes —
the same message for both attacks; §1.7 explains why they are the same
attack.)

---

## 3. Exercises

**Exercise 1 — classify the players.** In `verifyMinGPA`, list every value
as (a) public input, (b) witness (hidden), or (c) ledger state, and state who
learns it at verification time: `gpa`, `gpaSalt`, `credId`, `gpaCommit`,
`minGpa`, the `revoked` set.

<details>
<summary>Solution</summary>

(a) Public inputs: `credId`, `gpaCommit`, `minGpa` — visible to the
verifier (and they must be: the verifier's check is parameterized by them).
(b) Witnesses: `gpa` (Uint<64>) and `gpaSalt` — hidden; the verifier
learns only that *some* values satisfying the asserts exist. (c) Ledger
state: the `revoked` set membership of `credId` — read at mint time,
public on-chain anyway. The verifier's net new knowledge is exactly one bit:
"the claim held for this credential" — nothing about the GPA itself.
</details>

**Exercise 2 — byte-layout drill.** Using only `canonical.ts`, compute
`persistentCommit<Uint<64>>(300, salt)` for `salt = 0x0707…07` by hand
(well, by node), and state the exact byte concatenation you hashed. Then
check your answer against `compactCommitUint64`.

<details>
<summary>Solution</summary>

The layout is `SHA256(rand ‖ le64(x))` — salt bytes first, then the 8-byte
little-endian encoding of the number:

```ts
import * as C from './src/canonical';
const rand = Buffer.alloc(32, 7);
const manual = C.sha256(rand, C.le64(300n));
const lib    = C.compactCommitUint64(300n, rand);
console.log(C.toHex(manual) === C.toHex(lib));   // true
```

Endianness is the whole game here: `writeBigUInt64LE` — a big-endian or
32-byte-padded encoding silently produces a *different* commitment (that is
exactly what the probe's losing candidates in §1.3 demonstrate).
</details>

**Exercise 3 — why the ledger read?** Give the TWO reasons Assert 3
(`assert(!revoked.member(disclose(credId)))`) exists, and for each, name
what breaks without it.

<details>
<summary>Solution</summary>

(1) **Provability:** pure-computation circuits (witnesses in, hash/compare,
no ledger touch) are not provable in Midnight's transaction pipeline — the
proof needs a contract call with a state dependency to bind to. Without the
read, `verifyMinGPA` can't be proven at all. (2) **Semantics:** it binds
the proof to a live credential at mint time — without it, a revoked
credential's package could still mint fresh threshold proofs (the L1 layer
would still catch them at verification, but the proof artifact itself would
be lying about liveness).
</details>

**Exercise 4 — TTL arithmetic.** Lab 5's error said `TTL:
Timestamp(1788475661), Current block: Timestamp(1788599532)`. (a) How many
hours separate them? (b) The default intent TTL is ~1 hour; what is the
latest wall-clock time at which the fossil script would have succeeded?
(c) Why doesn't "just set a 10-year TTL on the intent" work as a fix — name
the trap.

<details>
<summary>Solution</summary>

(a) (1788599532 − 1788475661) / 3600 ≈ **34.4 hours**. (b) Roughly
`deployedAt + 1 h` — about 33 hours before the observation. (c) Because
the JS `intent.ttl` setter mutates only the JavaScript view of the
transaction, not the WASM snapshot that `wellFormed` validates — the
mutation is invisible to the check (probe-verified during the saga). The
working fix is to pass the validation clock explicitly: `tblock = mintedAt`
(proofs) / `deployedAt + 30 min` (deploy replay), and to slim the intents so
no other expiring offers ride along.
</details>

**Exercise 5 — break convergence (then explain it).** Construct the
mixed-credentials presentation exactly as in Lab 6, then modify **one more
thing** so the failure happens *even earlier* in the pipeline (hint: what
else in the presentation is Alice-specific that David's course entry doesn't
change?). Finally, explain in two sentences why the sub-root convergence
check is sufficient to stop *both* attacks without any per-course on-chain
data.

<details>
<summary>Solution</summary>

Also changing nothing else still fails at convergence; to fail even earlier,
tamper a revealed course *grade* — the edited leaf no longer hashes to its
committed leaf, so its own path recomputes to a different root immediately
(still the convergence error, since that check runs inside the leaf-recompute
stage before the master-leaf compare). Why convergence suffices: every
legitimate course leaf of one student was committed under exactly one
sub-root, so any set of genuine leaves from that student's sub-tree
recomputes to that same root; a foreign or edited leaf hashes differently and
its path leads elsewhere — one root demanded, one root not found. The
on-chain anchor only needs the 32-byte master-leaf chain; the sub-structure
stays entirely in the reveal layer.
</details>

**Exercise 6 — (stretch) design "age ≥ 18" for a license template.** Sketch
the Compact circuit (witnesses, public inputs, asserts) for proving a
birth-year-based age threshold against a committed credential. Name every
gotcha from this module you had to apply.

<details>
<summary>Solution sketch</summary>

```compact
witness birthYear(): Uint<64>;
witness bySalt(): Bytes<32>;
export circuit verifyMinAge(credId: Bytes<32>, byCommit: Bytes<32>, minAge: Uint<64>, currentYear: Uint<64>): [] {
  const by = birthYear();
  assert(persistentCommit<Uint<64>>(by, bySalt()) == byCommit, "birth year/salt do not match the credential commitment");
  assert(currentYear >= by + minAge, "below the required age");   // written to avoid underflow
  assert(!revoked.member(disclose(credId)), "credential is revoked");
}
```

Gotchas applied: Uint<N> comparisons only (no Field, no floats);
persistentCommit (not persistentHash) so the value stays hidden; the
commitment must use the *probed* byte layout so JS and circuit agree
(le64); the ledger read for provability + liveness; arithmetic written to
avoid underflow (`currentYear >= by + minAge` rather than subtracting);
`minAge` and `currentYear` are public inputs chosen at mint time.
</details>

---

## 4. Checkpoint quiz

**Q1.** In one sentence each: what does Assert 1 bind, what does Assert 2
claim, what does Assert 3 buy (two things)?
<details><summary>Answer</summary>Assert 1 binds the hidden (gpa, salt) to the
public, credential-anchored `gpaCommit` — you can only prove about the real
commitment opening. Assert 2 claims the predicate `gpa >= minGpa` for the
public threshold. Assert 3 (a) makes the circuit provable (pure computation
circuits aren't) and (b) binds the proof to a credential that was unrevoked
at mint time.</details>

**Q2.** Why is minting a false proof impossible — and where, mechanically,
does the attempt die?
<details><summary>Answer</summary>Soundness: a ZK proof certifies that
witnesses satisfying all constraints exist; for a false claim they don't.
Mechanically it dies at `createUnprovenCallTx`, which executes the circuit
locally during witness generation — the failing `assert` throws before any
proving ("failed assert: GPA below the required minimum").</details>

**Q3.** Why does the package carry one proof *per threshold* instead of one
"GPA proof"?
<details><summary>Answer</summary>`minGpa` is a public input baked into the
proof; a proof is valid only for the exact threshold it was minted for.
"≥ 3.00" says nothing about "≥ 3.50", so standard thresholds are pre-minted
as separate proofs (300, 350).</details>

**Q4.** Recite the persistentCommit byte layout for `Uint<64>` and for
`Bytes<32>`, and the method we used to discover it.
<details><summary>Answer</summary>`persistentCommit<Uint<64>>(x, rand) =
SHA256(rand ‖ le64(x))`; `persistentCommit<Bytes<32>>(b, rand) =
SHA256(rand ‖ b)`. Method: probe contract exposing the primitive via
`pureCircuits`, call it from JS with known inputs, race candidate
serializations until one matches; pin the result as test vectors.</details>

**Q5.** The off-chain verifier replays the deploy transaction instead of
reading chain state via `updateIndex`. Why?
<details><summary>Answer</summary>`LedgerState.updateIndex` drops the
contract's operation verifier keys, and those keys are required to check
circuit proofs. Replaying the captured, proven deploy tx on a blank ledger
rebuilds a state that contains them — and `wellFormed` on the deploy
verifies its proof first, so the replayed state is self-validated.</details>

**Q6.** "Our month-old L2 proofs suddenly fail verification with Intent TTL
expired." Explain what is actually expiring, why the proof is still sound,
and the two-clock fix.
<details><summary>Answer</summary>Only the intent's ~1-hour submission window
(a liveness bound for on-chain inclusion) lapses — TTL is not a soundness
property, so the proof of a true statement remains true forever. Fix: drive
`wellFormed`'s TTL check with an explicit `tblock` inside the original
window — `deployedAt + 30 min` for deploy replay, `mintedAt` (plus
`postBlockUpdate` on the state clock) for proof checks — and slim off-chain
proofs to the contract-call intent so no expiring fee offers ride
along.</details>

**Q7.** Alice reveals MATH420 and CS460 only. What does the verifier recompute,
and what single rule stops her from mixing in David's better MATH420 grade?
<details><summary>Answer</summary>For each revealed course: the course leaf
(from values + salt) and its Merkle path to a sub-root; then the rule — every
revealed path must converge to the SAME sub-root, which is then welded into
the master leaf and on up to the anchored cohort root. David's course belongs
to David's sub-tree: its path leads to his sub-root, so convergence fails
(mixed credentials).</details>

**Q8.** An L2 proof was minted Monday; the credential is revoked Wednesday; a
verifier checks the package Friday. Walk the exact sequence of checks and
give the final verdict.
<details><summary>Answer</summary>Friday's verification runs the L1 layer
first: recompute commitments/leaf/root (passes), check root in `validRoots`
(passes — historic roots stay), check `credId` in the `revoked` set
against CURRENT chain state — **found** → verdict `REVOKED` immediately.
The frozen L2 proof is never even evaluated; revocation always wins because
the layers are ordered.</details>

---

## Agent teacher notes

**Pacing.** ~5 hours: concepts ~2 h (§1.2 and §1.5–§1.6 deserve the most
time), labs ~90 min, exercises + quiz ~60 min. The emotional arc matters:
students should feel Lab 4 ("I literally cannot mint this lie") and Lab 5
("the error was a clock that means nothing") as victories. Don't skip the
probe story — it is the module's thesis: *extract ground truth, don't guess.*

**Common misconceptions (listen for these).**

1. *"Zero-knowledge means encrypted."* No — nothing here is encrypted; the
   GPA never leaves the minter at all. ZK is about proving statements on
   hidden witnesses, not hiding data in transit. (Redaction — withholding the
   value — is a separate, complementary trick, §1.8.)
2. *"The proof is checked by the blockchain at verification time."* L2
   verification is fully offline: replay + `wellFormed` on the verifier's
   own machine, ~0.15 s. The chain was involved once — when it accepted the
   deploy transaction that anchors the trust.
3. *"A proof can be reused for any threshold."* `minGpa` is a public input;
   proofs are threshold-specific (Q3).
4. *"The NOT-minted lines are errors to fix."* They are the system working —
   soundness made visible. Have students read them aloud in Lab 2.
5. *"TTL means proofs expire."* The saga's whole point: submission window ≠
   soundness. If a student says "the proof expired", send them back to §1.6.
6. *"`disclose(credId)` leaks something private."* `credId` is a public
   input and already an unlinkable hash; `disclose` is the compiler's
   explicit-public marker, not a privacy breach.

**Checking understanding before advancing.** Two gate questions: (1) "Tell me
the three asserts and the attack each one kills" — accept nothing less than
all three pairings (value-lie→A1, false-predicate→A2, revoked→A3). (2) "Why
do we replay the deploy instead of reading state?" — they should answer
"verifier keys" within ten seconds. If both land, Module 6 has done its job.

**FAQ answers.**

- *"If the issuer mints the proofs, can't the issuer forge them?"* The issuer
  can only mint proofs for statements that satisfy the circuit against real
  commitments — they can mint "Brian ≥ 3.00" (true) but never "Brian ≥ 3.50"
  (Lab 4). The issuer's *power* is choosing not to mint, not minting lies.
- *"Why not verify proofs on-chain?"* It would cost a transaction, ~22 s, a
  wallet, and leak metadata (contract, timing, credId) per check — the parked
  "premium tier" in ARCHITECTURE.md §10a. Off-chain verification is the
  default precisely because it's free, instant, and accountless.
- *"What if the proof server is malicious?"* Proofs are verified, not
  trusted — a malicious prover cannot produce a valid proof of a false
  statement; the worst it can do is refuse to prove.
- *"Where did the ~22 s go if proving is 2 s?"* Balancing, submission, and
  finalization in the full on-chain tx loop (ARCHITECTURE.md §15
  benchmarks: raw proving 1.7–2.5 s; full loop ~20–25 s). Off-chain proofs
  skip all of it.
- *"Is this how production Midnight apps verify off-chain proofs?"* Honest
  answer: our recipe is an *assembled* pattern from SDK primitives (§1.5's
  trust argument), born because the cookbook didn't exist. Teach students to
  say that plainly — it's a more credible answer than pretending it's
  boilerplate.

**When to let them struggle.** Lab 4's second half (lie about witnesses, hit
Assert 1) should be discovered, not shown — give the hint "stop attacking the
threshold; attack the inputs" and wait. The TTL arithmetic (Exercise 4) is
worth 10 silent minutes with a calculator. Struggle less on the recipe
mechanics of §1.5 — that material is genuinely non-obvious SDK archaeology;
walk it together. Step in immediately for environment issues (proof server
down → minting hangs; stale `deploy-proof.bin` → "does not have a verifier
key" → re-run `npm run runtime batch`). **Advance when:** the student can
mint, verify, and *invalidate* proofs on demand; can narrate the probe and
TTL stories without notes; and can whiteboard the subset-convergence check.

---

## References

**This workspace (ground truth):**
- `apps/credvault/step1-degree/contracts/degree.compact` — `verifyMinGPA` and its witnesses (lines 62–76)
- `apps/credvault/step1-degree/contracts/probe.compact` + `src/probe.ts` — the layout-cracking probe
- `apps/credvault/step1-degree/src/canonical.ts` — `compactCommitUint64` / `compactCommitBytes32` / `compactHashPair` + pinned test vectors
- `apps/credvault/step1-degree/src/premint-l2.ts` — off-chain minting (thresholds, slim intents, idempotence)
- `apps/credvault/step1-degree/src/l2.ts` — the verification recipe (replay, strictness, tblock recipes)
- `apps/credvault/step1-degree/src/verify-core.ts` — L1-then-L2 layering, gpaRedacted path, convergence check
- `apps/credvault/step1-degree/src/ttl-probe.ts`, `src/verify-l2.ts` — the TTL saga's probe and its fossil
- `apps/credvault/step1-degree/src/test-redact.ts` — GPA redaction paths A/B/C
- `apps/credvault/ARCHITECTURE.md` — §15 (Step-2 report: layout cracked, benchmarks, revocation semantics), §16 (2b: scheme v3 + TTL saga), §18 (proof preservation)
- `apps/credvault/docs/step2-runtime-and-l2-runbook.md` — the 10-test gauntlet + 2b/2c suites
- `midnight-expert/plugins/core-concepts/skills/privacy-patterns/SKILL.md` — commitment table (taint-clearing), selective-disclosure pattern
- `midnight-js/llms.txt` — SDK API surface (contracts, ledger, proof providers)

**Official docs:**
- Compact standard library — persistentCommit / persistentHash / disclose: https://docs.midnight.network/compact/standard-library/exports
- Explicit disclosure in Compact: https://docs.midnight.network/compact/reference/explicit-disclosure
- Compact smart-contract security (witnesses, ledger visibility): https://docs.midnight.network/compact/smart-contract-security
- Version support matrix: https://docs.midnight.network/relnotes/support-matrix
- Midnight.js SDK repository (contracts API, proof providers, testkit wiring): https://github.com/midnightntwrk/midnight-js
