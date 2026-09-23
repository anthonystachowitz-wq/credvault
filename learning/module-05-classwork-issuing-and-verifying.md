# Module 5: Issuing and Verifying Credentials (L1) — We Build the Commitment Layer Together

> Time: ~4 hours | Prerequisites: Modules 1–4 (devnet running, `step1-degree` installed, contract compiled). You should be comfortable with JSON, the command line, and reading TypeScript.

In this module we build the heart of CredVault **with our own hands**: the
off-chain commitment scheme that lets Penn State anchor 10,000 diplomas in one
32-byte hash, and the recompute-and-compare verification that lets an employer
check a credential in 0.1 seconds with no account. Every command runs against
the real `step1-degree` project. By the end you will have anchored a cohort,
dissected a proof package, revoked a student, caught a tamperer — and written
your own verifier from scratch.

## Learning objectives

By the end of this module:

- You can **explain** why no personal data ever goes on-chain, and what does (opaque 32-byte anchors).
- You can **explain** every ingredient of the commitment scheme: per-field salts, domain separation, canonicalization, and the `normalize()` rules.
- You can **build** the commitment chain by hand: field commitments → master leaf → credential ID → cohort Merkle root.
- You can **run** the issuer runtime batch and narrate every line of its output, including the idempotent-skip path.
- You can **dissect** a proof package JSON field by field and justify why each field exists.
- You can **verify** a presentation and produce every exit case on demand: `VERIFIED`, `TAMPERED`, `REVOKED`, `UNKNOWN_ANCHOR`, `CONTRACT_NOT_FOUND`.
- You can **explain** revocation as the nullifier pattern, including the layered revocation semantics (why L1 always wins).
- You can **compare** monolithic vs granular transcript modes and choose the right one for an issuer.
- You can **write** a minimal verifier from scratch using only `canonical.ts`.
- You can **debug** a real latent bug in the issuer runtime.

---

## 1. Concepts from scratch

### 1.1 The problem: prove something about data without showing the data to the world

Penn State has a database of graduates. Employers want to check "did Alice
Johnson really get a B.S. in CS with a 3.85 GPA?" The boring 1990s answer is a
phone call to the registrar. The boring 2000s answer is a clearinghouse: one
company holds everyone's records and answers lookups for $20 each. Both put a
central database in the trust path — a breach target, a privacy leak, a
bottleneck.

Our answer has three rules, and everything in this module follows from them:

1. **The chain never sees personal data.** No names, no GPAs, no course grades
   on the ledger. Ever. The ledger stores only 32-byte anchors — cryptographic
   fingerprints that reveal nothing.
2. **The issuer holds the data.** Penn State keeps its own records on its own
   server. CredVault (the platform) never touches them.
3. **Students generate zero transactions.** All a student ever does is
   download a file and show it. Verification is recomputation, not a
   blockchain call.

Hold those three rules in your head. Every design decision below is a
consequence of one of them.

### 1.2 Hash functions and commitments (the two-minute version)

A **hash function** (we use SHA-256) turns any input into 32 bytes that look
random, with three properties we rely on:

- **Deterministic:** same input → same output, always.
- **One-way:** given the output, you cannot find the input.
- **Avalanche:** change one character of the input and the output is
  unrecognizable.

A **commitment** is a hash used as a sealed envelope. I hash my secret value
and publish the hash. Later I reveal the value; anyone can re-hash and check
it matches. I cannot change my mind (the hash already fixed the value), and
nobody could read the value before I revealed it.

```
commit = SHA256(value)

publish commit ─────────────► later: reveal value
                                    verifier: SHA256(value) == commit?  ✓
```

But there is a hole. Suppose the "value" is a GPA. There are only ~400
plausible GPAs (0.00–4.00 in hundredths). An attacker who sees
`SHA256(385)` on-chain can just hash all 400 candidates and find the match
in microseconds. This is a **dictionary attack**, and it works on any
low-entropy field: GPAs, degree titles, grades, even names (there are only so
many "Alice Johnson"s).

The fix is a **salt**: 32 random bytes mixed into the hash.

```
commit = SHA256(value || salt)
```

Now the attacker's dictionary is useless — for each candidate value they would
also need the salt, and the salt space is 2²⁵⁶. The commitment still binds
(reveal value + salt later, recompute, compare), but now it also **hides**.

> **Rule: never reuse a salt.** Same salt twice leaks equality (an observer
> sees the two commitments are identical). Fresh randomness per commitment —
> or, as we will see in §1.12, fresh *deterministic* randomness per
> (student, field) pair.

### 1.3 Why *per-field* salts?

CredVault commits each field **separately**, each with its **own** salt:

```ts
// src/canonical.ts
export function fieldCommit(fieldName: string, value: string | number, salt: Buffer): Buffer {
  return sha256(pad32('credvault:field:'), Buffer.from(fieldName, 'utf8'), normalize(value), salt);
}
```

Three commitments per student today: `fullName`, `degree`, `gpa` (the GPA
one is special — §1.6). Why per-field instead of one hash over the whole
record?

- **Independent disclosure.** Alice can reveal her name + degree (with their
  salts) while keeping her GPA sealed (its salt stays hidden). If everything
  were hashed together, revealing anything would require revealing everything.
- **Independent brute-force resistance.** Each field gets the full protection
  of its own 32-byte salt.
- **Field binding.** Notice the `fieldName` goes *into* the hash. A
  commitment to `gpa=385` can never be passed off as a commitment to some
  other field — the name is baked in.

### 1.4 Canonicalization: the `normalize()` function, or "why ' Alice ' is a security bug"

A commitment binds **exact bytes**. "Alice Johnson" and "Alice Johnson "
(trailing space) are different bytes → different hashes → a verifier
recomputing the hash would say TAMPERED on a perfectly honest credential.
Before anything is hashed, every value passes through one canonicalization
function used by issuer, holder, and verifier alike:

```ts
// src/canonical.ts
/** Canonical normalization: strings -> utf8/trim/UPPERCASE; numbers -> decimal string. */
export function normalize(value: string | number): Buffer {
  if (typeof value === 'string') return Buffer.from(value.trim().toUpperCase(), 'utf8');
  return Buffer.from(String(value), 'utf8');
}
```

The rules, all deliberate:

| Rule | Why |
|---|---|
| `trim()` | Kills invisible whitespace differences between systems |
| `toUpperCase()` | "alice johnson" and "Alice Johnson" are the same person |
| UTF-8 | One byte encoding, everywhere, no locale surprises |
| Numbers → decimal string | `385` and `"385"` must hash identically |
| **GPA stored ×100 as an integer** (`385` = 3.85) | Compact circuits have **no floats**. And comparisons (Module 6) only work on `Uint<N>`, never on `Field`. A hundredths-integer is exact, sortable, comparable. |

> **The moral (learned the hard way in March 2026):** the hashing scheme must
> be **one library used by everyone**. CredVault has exactly one
> `canonical.ts`, imported by the issuer runtime, the holder, the CLI
> verifier, and the HTTP service. The March project's worst bug class —
> "the JS hash and the contract hash disagree" — is *structurally* impossible
> here, because there is only one implementation of each hash.

### 1.5 Domain separation: `pad32("credvault:field:")`

Look at the first argument to every hash in `canonical.ts`:

```
fieldCommit  = H(pad32("credvault:field:")  || fieldName || normalize(value) || salt)
masterLeafV3 = H(pad32("credvault:leaf:")   || fieldCommits... || courseRoot || masterSalt)
credId       = H(pad32("credvault:credid:") || masterLeaf)
nodeHash     = H(pad32("credvault:node:")   || left || right)
courseLeaf   = H(pad32("credvault:course:") || code || title || credits || grade || salt)
docCommit    = H(pad32("credvault:doc:")    || canonicalTranscript || docSalt)
```

`pad32` copies the domain string into a 32-byte zero-padded buffer. This is
**domain separation**: every *kind* of hash in the system carries a label, so
a hash computed for one purpose can never be mistaken for (or replayed as) a
hash of another kind. Without it, a course leaf that happened to equal a field
commitment could be swapped across contexts — the cryptographic equivalent of
a type-confusion bug. Domain separation costs us nothing and deletes an entire
attack class. You will see the same discipline inside the Compact contract
(`pad(32, "credvault:authority:")`) in §1.8.

### 1.6 The commitment chain: from one field to one anchor

Here is the full construction for one student (scheme `credvault-degree/0.3`,
the current version):

```
fullName ──normalize──┐
                      ├─► fieldCommit(fn, salt_fn) ──┐
degree ────normalize──┤                              │
                      ├─► fieldCommit(deg, salt_deg) ┤
gpa (×100) ───────────┘                              │
                      └─► persistentCommit(gpa, salt_gpa) ├─► masterLeafV3 ──► credId
courses + course salts ─► course leaves ─► course sub-tree ─► courseSubRoot ──┘   (+ masterSalt)
```

Three layers, three jobs:

1. **Field commitments** hide and bind each individual value. (The GPA
   commitment is a real Compact `persistentCommit` — `SHA256(salt ‖
   le64(gpa))` — so the *same* commitment works for L1 recomputation here and
   the zero-knowledge predicates in Module 6. That story deserves its own
   module; for now just note it is Compact-compatible by design.)
2. **The master leaf** (`masterLeafV3`) welds the field commitments and the
   course sub-root together with a master salt. **This weld is the
   anti-cherry-picking guarantee:** my name and my GPA and my courses are in
   *one* leaf. I cannot present my name with my friend's GPA, because that
   combination hashes to a different leaf.
3. **The credential ID** (`credId = H("credvault:credid:" ‖ masterLeaf)`) is
   the public handle of the credential — what revocation points at (§1.9).
   Change any value (a corrected GPA) and you get a *new* credId; the old one
   can be revoked. Corrections never rewrite history.

### 1.7 Merkle trees: 10,000 students, one 32-byte anchor

One master leaf per student. A spring cohort might have 10,000 of them. Do we
put 10,000 anchors on-chain? No — we build a **Merkle tree** (a hash tree):

```
                 root = H(node ‖ node)            ← ONE 32-byte anchor on-chain
                /                      \
         H(n‖n)                          H(n‖n)
        /      \                        /      \
     H(n‖n)    H(n‖n)                H(n‖n)    H(n‖n)
     /   \      /   \                /   \      /   \
   L0    L1  L2    L3             L4    L5   L6    L7     ← leaves: masterLeaf per student
   │           (L6, L7 = EMPTY_LEAF padding)
```

Built by `buildTree()` in `canonical.ts`:

- Leaves are the student master leaves.
- The tree is padded with a defined `EMPTY_LEAF = H("credvault:empty:")` up
  to the next power of two (5 students → 8 leaves → depth 3).
- Every parent is `nodeHash(left, right) = H("credvault:node:" ‖ left ‖
  right)`. Padding means "size doesn't matter": a 4-student cohort and a
  4,000-student cohort use the same construction.

The magic property: to prove *your* leaf is in the tree, you need only the
log₂(N) sibling hashes along your branch — your **Merkle path** — not the
other 9,999 students. For each level, the path records the sibling's hash and
which side you were on (`goesLeft`):

```ts
// src/canonical.ts — walk the leaf up the tree, hashing with each sibling
export function recomputeRoot(leaf: Buffer, path: PathEntry[]): Buffer {
  let cur = leaf;
  for (const e of path) cur = e.goesLeft ? nodeHash(cur, e.sibling) : nodeHash(e.sibling, cur);
  return cur;
}
```

Leaf + path → root. Three hashes for an 8-leaf tree; 14 for 10,000 students.
The verifier recomputes the root from your package and asks the chain: "is
*this* root anchored?"

### 1.8 What actually lives on-chain: three things

Open `contracts/degree.compact`. The entire on-chain state is:

```compact
export sealed ledger authority: Bytes<32>;    // the issuer's public authority key, set once at deploy
export ledger validRoots: Set<Bytes<32>>;     // every cohort root EVER anchored
export ledger revoked: Set<Bytes<32>>;        // credIds of revoked credentials
```

Three design decisions to internalize:

1. **Opaque anchors, not ADT trees.** We store our own 32-byte roots in a
   plain `Set` instead of using Compact's `HistoricMerkleTree`. Historic
   roots — the property that old packages keep working after new batches — we
   get *for free* by simply **never removing from the set**. Every root ever
   anchored stays valid forever. (Step-2 checkpoint decision; revisit only if
   a future template needs membership proofs evaluated *inside* a circuit.)
2. **Authority is proven in-circuit.** The issuer's secret key never leaves
   their server. At deploy, the constructor derives
   `authority = persistentHash(["credvault:authority:", issuerSecretKey()])`
   and seals it. Every write circuit (`addCohortRoot`, `revokeCredential`)
   re-derives the key from the witness-held secret and asserts equality —
   only the secret holder can write. Notice the `disclose()`: the compiler
   *refuses* to let a witness-derived hash hit the ledger without it
   ("witness taint"), because `persistentHash` binds but does not hide. The
   `disclose()` says "yes, I know this value becomes public" — safe here,
   because it is a public key.
3. **The cost model.** Anchoring a cohort is ONE transaction (~22 s on the
   devnet, dominated by fixed proving overhead — 5 students or 10,000, same
   tx, same cost). Revoking is one tx. Students: zero transactions, forever.
   An issuer's entire year is a handful of transactions.

### 1.9 Revocation: the nullifier pattern, and the layered semantics

Revocation answers: "this credential *was* valid — is it *still* valid?"
Examples: a degree rescinded for fraud, a license suspended.

The mechanism is pattern #3 from the privacy-pattern catalog: a
domain-separated, deterministic ID stored in a public `Set<Bytes<32>>`. Our
"credential nullifier" is simply the `credId` — already a hash, already
unlinkable to any person by looking at it. `revokeCredential(credId)`
inserts it into the on-chain `revoked` set. Checking revocation = a set
membership query against **current chain state**, no issuer contact needed —
that is why verification works even when Penn State's server is off.

The **layered semantics** (settled in Step 2, and Module 6 leans on it hard):

> Revocation is always evaluated against the **current** on-chain state, at
> the L1 layer, **before** any fancier proof is even looked at. A pre-computed
> proof frozen in time can never override a live revocation.

### 1.10 The package: the holder-carried inventory

If the chain holds only anchors, and the school is out of the loop, what does
the student actually *have*? A **proof package** — a few-KB JSON file,
downloaded once at graduation. It is the complete inventory needed to
re-derive every hash on the path from their personal values to the on-chain
root:

- the **values** themselves (their transcript, in structured form),
- the **salts** for every field and course (their secrecy is what keeps
  unrevealed fields hidden),
- the **Merkle paths** (course-level and cohort-level),
- the **linkage** (`masterLeaf`, `credId`, `cohortRoot`,
  `contractAddress`) so a verifier knows what to recompute and where to look.

Because the package *is* the data source, the verifier needs **no credential
database** — it is a pure function: package in, verdict out, plus one read of
the on-chain anchors. That is the deliberate anti-clearinghouse. (In the lab
we will autopsy a real package field by field.)

### 1.11 Monolithic vs granular: one contract, two transcript policies

Issuers choose at onboarding how transcripts are committed
(`transcriptMode` in the cohort file):

| | **granular** (default) | **monolithic** |
|---|---|---|
| Courses become | a per-student Merkle **sub-tree** (`courseSubRoot`) | one whole-document hash (`docCommit`) over the canonical transcript |
| Holder can reveal | the full transcript **or any subset** of courses | the full transcript only (all-or-nothing) |
| Subset request | works (Module 6 deep-dives the mechanics) | **honest refusal**: "subsets are not possible; share the full transcript" |

Both modes write their result into the **same slot** in the master leaf (the
`courseRoot` argument of `masterLeafV3`), so **one contract serves every
issuer** — remember, on-chain anchors are just opaque 32-byte values; the
contract neither knows nor cares which mode produced them.

The monolithic canonical form is worth reading twice, because it shows
canonicalization thinking again:

```ts
// src/canonical.ts — stable, order-independent, size-independent
export function canonicalTranscript(courses: Course[]): Buffer {
  const lines = courses
    .map((c) => [c.code, c.title, String(c.credits), c.grade].map((x) => normalize(x).toString('utf8')).join('|'))
    .sort();
  return Buffer.from(lines.join('\n'), 'utf8');
}
```

Sorted `CODE|TITLE|CREDITS|GRADE` lines: reordering the CSV doesn't change
the hash, 4 courses or 400 doesn't change the scheme, and one edited grade
changes it completely. Also note the onboarding rule that falls out of this:
data flows **downhill** (school system → structured records → commitments →
rendered documents). We never parse PDFs as input — PDFs are *rendered from*
data, never trusted *as* data.

### 1.12 Idempotent batching: deterministic salts, and the moral of the re-run

Early version: every batch used fresh random salts → re-running a batch
re-minted everything (new leaves, new root, another 22 s transaction).
Wasteful and confusing. The fix is beautiful:

```ts
// salt = H("credvault:kdf:" ‖ issuerSecret ‖ studentId ‖ field)
export function kdfSalt(issuerSecret: Buffer, studentId: string, field: string): Buffer {
  return sha256(pad32('credvault:kdf:'), issuerSecret, Buffer.from(studentId, 'utf8'), Buffer.from(field, 'utf8'));
}
```

Salts are **derived**, not rolled. The issuer secret stays server-side (so
salts remain secret and unguessable — §1.3's brute-force protection is fully
intact), but re-running a batch on an *unchanged* record reproduces the
*identical* commitment. That one idea buys three things:

1. **Root-exists skip.** The runtime recomputes the cohort root, checks
   `validRoots` on-chain, and if the exact root is already anchored it skips
   the transaction entirely — "⏭ already anchored", no 22 s wait.
2. **Proof preservation.** Packages regenerated in a re-batch carry over
   their L2 zero-knowledge proofs whenever the `credId` is unchanged
   (deterministic salts make that comparison meaningful — Module 6).
3. **Natural rectification.** A corrected record hashes to a *new* leaf and a
   *new* credId; the old credId gets revoked. History is append-only.

**Moral:** when your privacy scheme needs reproducibility, don't store random
salts in a database you then have to back up and sync — *derive* them from a
held secret with a domain-separated KDF. (And in the lab you'll meet the one
bug this feature shipped with.)

---

## 2. Hands-on lab

> All labs run in `apps/credvault/step1-degree/`. Expected outputs below are
> **real outputs captured on the devnet** — yours should match (hashes will
> match exactly too, thanks to deterministic salts; timestamps and tx ids
> won't).

### Lab 0 — sanity check (2 min)

```bash
cd /home/anthony/midnight/apps/credvault/step1-degree

# 1. Devnet up? (node :9944, indexer :8088, proof-server :6300)
docker ps --format '{{.Names}} {{.Status}}' | grep step0-hello
# expect: step0-hello-node / -indexer / -proof-server, all "Up ... (healthy)"
# if not:  cd ../../step0-hello && docker compose up -d --wait

# 2. Contract compiled?
ls contracts/managed/degree/contract/index.js
# if missing: npm run compile   (needs compactc 0.31.1 on PATH)
```

### Lab 1 — run the issuer batch (10 min)

```bash
npm run runtime batch
```

Read the output like a narrator. On a machine where this exact cohort is
already anchored (deterministic salts!), you will see:

```
cohort file: cohort.json — Penn State University (mock)
transcriptMode: granular
cohort root: ef5ecbe47f36421872dce598471f0bccbea476731bfb76cb0c33b69daee29414
⏭  root ALREADY anchored — unchanged cohort, skipping transaction (idempotent).
/home/anthony/midnight/apps/credvault/step1-degree/src/runtime.ts:195
    anchoredTx: tx.public.txId, anchoredAt: new Date().toISOString(), contractAddress: address,
                ^

ReferenceError: tx is not defined
```

Two lessons in one run:

1. **The idempotence works** — the recomputed root matched the on-chain set,
   so no transaction was sent (§1.12). The packages were rewritten byte-identically.
2. **…and it crashes afterward.** `tx` is declared with `const` *inside*
   the `else` block, but the manifest write after the `if/else` references
   it. Packages are fine (written before the crash); the manifest update and
   clean wallet shutdown never happen. **Keep this bug in your pocket — it is
   Exercise 3.** (On a truly fresh deploy you'd instead see "✅ deployed
   (with capture)" then "✅ root anchored (5 students, ONE tx)" — two ~22 s
   transactions.)

While you're here, open `data/cohort.json`: five mock students with
`gpa` already ×100 (Alice `385` = 3.85).

### Lab 2 — package autopsy (20 min)

`packages/STU-001.package.json` is Alice's whole on-chain life. Walk it
field by field (use `node -e` or just open it — it's ~25 KB with proofs):

| Field | Example / shape | Why it exists |
|---|---|---|
| `schema` | `"credvault-degree/0.3"` | Versioned format — verifiers know which rules to apply |
| `issuer`, `cohort` | "Penn State University (mock)", "2027-spring" | Human-facing display strings (informational; the *binding* identity is the contract address) |
| `studentId` | "STU-001" | Issuer-side record key (used by the KDF for salts) |
| `values` | fullName, degree, gpa (385) | The actual claims — the holder's copy of their data |
| `transcriptMode` | "granular" | Which course-commitment policy the verifier must use |
| `courses[]` | each with `code,title,credits,grade` **plus `salt` and `path`** | The revealable inventory: each course is a leaf; salt hides it until revealed; path proves membership in the sub-tree |
| `courseSubRoot` | 32-byte hex | Root of Alice's course sub-tree (granular mode) — the slot that goes into the master leaf |
| `salts.{fullName,degree,gpa,master}` | 32-byte hex each | The hiding randomness for each field commitment + the leaf weld. Revealing a field = revealing its salt |
| `gpaCommit` | 32-byte hex | The Compact-compatible GPA commitment (`SHA256(salt ‖ le64(gpa))`) — serves L1 recompute *and* Module-6 ZK predicates |
| `masterLeaf` | 32-byte hex | The welded commitment to everything above — the anti-cherry-picking knot |
| `credId` | 32-byte hex | Public credential handle; what the on-chain `revoked` set references |
| `path` | 3 entries of `{sibling, goesLeft}` | Merkle path from Alice's leaf to the cohort root. **Stop and check:** why 3? 5 students → padded to 8 leaves → depth log₂8 = 3. ✓ |
| `cohortRoot` | 32-byte hex | What the issuer anchored; the verifier recomputes it and checks the on-chain set |
| `contractAddress` | 32-byte hex | *Where* on-chain to look (this contract's `validRoots`/`revoked`) |
| `l2Proofs` | array (may be empty until Module 6) | Pre-minted zero-knowledge threshold proofs — next module |

Do a spot check by hand:

```bash
npx tsx -e "
import * as C from './src/canonical';
import * as fs from 'node:fs';
const p = JSON.parse(fs.readFileSync('packages/STU-001.package.json','utf-8'));
// recompute Alice's fullName field commitment from values + salt:
const fc = C.fieldCommit('fullName', p.values.fullName, C.fromHex(p.salts.fullName));
console.log('recomputed fullName commit:', C.toHex(fc));
// recompute the GPA commitment the Compact-compatible way:
const gc = C.compactCommitUint64(p.values.gpa, C.fromHex(p.salts.gpa));
console.log('gpaCommit matches package? ', C.toHex(gc) === p.gpaCommit);
"
# expect: gpaCommit matches package?  true
```

### Lab 3 — the three exit cases, plus two bonus failures (25 min)

**Case 1 — VALID.** Produce Alice's presentation (what her wallet app would
hand an employer) and verify it:

```bash
npm run holder STU-001
npm run verifier presentations/STU-001.presentation.json
```

```
✅ VERIFIED
   Issuer:   Penn State University (mock)
   Cohort:   2027-spring
   Name:     Alice Johnson
   Degree:   B.S. Computer Science
   GPA:      3.85
   Courses:  (revealed 5 of 5)
       CS101    A   Intro to Computer Science (3 cr)
       ...
   verify time: 0.1s
```

0.1 seconds, no account, school not involved. That is the whole product pitch.

**Case 2 — REVOKED.** Revoke David Kim, then verify his (perfectly
well-formed) presentation:

```bash
npm run holder STU-004
npm run verifier presentations/STU-004.presentation.json   # may still VERIFY — he isn't revoked yet
npm run runtime revoke STU-004                             # ~23 s: ✅ revoked STU-004 [22.8s]
npm run verifier presentations/STU-004.presentation.json
```

```
✗ REVOKED — credential was revoked by the issuer
   verify time: 0.1s
```

His package didn't change by one byte. The **chain state** did — and the L1
revocation check always reads *current* state (§1.9).

**Case 3 — TAMPERED.** Give Alice a better GPA (3.85 → 3.95) in a copy:

```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('presentations/STU-001.presentation.json'));
p.values.gpa=395;
fs.writeFileSync('presentations/STU-001-tampered.presentation.json', JSON.stringify(p,null,2));"
npm run verifier presentations/STU-001-tampered.presentation.json
```

```
✗ TAMPERED — presented values do not reproduce the credential commitment
   verify time: 0.0s
```

One edited digit → the recomputed `gpaCommit` differs → the master leaf
doesn't match → dead in 0.0 s. The doctored-transcript attack, extinct.

**Bonus A — FORGED leaf.** Flip one hex character of `masterLeaf` in a copy
of Brian's package. You get the same `TAMPERED` verdict — the verifier
recomputes the leaf from the values *before* ever asking the chain, and your
forged leaf doesn't match the recomputation. (A package whose recomputed root
was never anchored would instead die one step later as
`UNKNOWN_ANCHOR — cohort root is not anchored on-chain`. You cannot invent
a credential the chain does not know about.)

**Bonus B — CONTRACT_NOT_FOUND.** Point a presentation at a contract address
that doesn't exist on this chain (e.g. a stale file from a wiped devnet) and
you'll see `CONTRACT_NOT_FOUND`. Five verdicts, five distinct failure
points in the pipeline — know them all:

| Verdict | Where it fails |
|---|---|
| `TAMPERED` | local recompute (values → commitments → leaf, or course sub-root convergence) |
| `CONTRACT_NOT_FOUND` | indexer has no such contract |
| `UNKNOWN_ANCHOR` | recomputed root not in `validRoots` |
| `REVOKED` | `credId` found in `revoked` (current state) |
| `VERIFIED` | none of the above |

### Lab 4 — monolithic mode: a second university, same contract (15 min)

`data/cohort-monolithic.json` is "Monolithic University" with
`"transcriptMode": "monolithic"`. (Its packages were already anchored on
this devnet; if you ever see `CONTRACT_NOT_FOUND` here, re-anchor:
`npm run runtime batch data/cohort-monolithic.json`.)

```bash
npm run holder MON-001
npm run verifier presentations/MON-001.presentation.json
```

```
✅ VERIFIED
   Issuer:   Monolithic University (mock)
   Name:     Grace Lee
   Degree:   B.S. Biology
   GPA:      3.68
   Courses:  (revealed 4 of 4) ...
```

Note what happened inside `verify-core.ts`: because the presentation carries
`docCommit` (not `courseSubRoot`), the verifier rebuilt the **canonical
transcript blob** from the course list, re-hashed it with `docSalt`, and
compared — all-or-nothing. Now ask for a subset:

```bash
npm run holder MON-001 -- --courses BIO305
# ✗ this issuer uses MONOLITHIC mode — subsets are not possible; share the full transcript instead.
```

An **honest refusal**, not a fake proof. One contract, two policies — the
anchors are opaque either way.

### Lab 5 — write your own tiny verifier (30–45 min) — THE capstone of this module

Everything the CLI verifier does locally reduces to ~30 lines. Write
`src/mini-verify.ts` yourself — recompute the chain from a presentation
file and print PASS/FAIL at each station, **using only `canonical.ts` and
`fs`** (no Midnight imports for the local part):

```ts
// src/mini-verify.ts — your turn. Skeleton:
import * as fs from 'node:fs';
import * as C from './canonical';

const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));

// 1. field commitments (gpa uses the Compact-compatible commitment)
const commits = [
  C.fieldCommit('fullName', p.values.fullName, C.fromHex(p.salts.fullName)),
  C.fieldCommit('degree', p.values.degree, C.fromHex(p.salts.degree)),
  C.compactCommitUint64(p.values.gpa, C.fromHex(p.salts.gpa)),
];

// 2. course sub-root: recompute each revealed course leaf and walk its path;
//    EVERY revealed path must arrive at the SAME root
let subRoot: Buffer | null = null;
for (const c of p.courses ?? []) {
  const leaf = C.courseLeaf({ code: c.code, title: c.title, credits: c.credits, grade: c.grade }, C.fromHex(c.salt));
  const r = C.recomputeRoot(leaf, C.pathFromHex(c.path));
  if (subRoot && C.toHex(r) !== C.toHex(subRoot)) { console.log('FAIL: course sub-roots disagree'); process.exit(1); }
  subRoot = r;
}

// 3. master leaf, credId, cohort root
const leaf = C.masterLeafV3(commits, subRoot ?? C.EMPTY_COURSE_ROOT, C.fromHex(p.salts.master));
console.log('leaf matches package?   ', C.toHex(leaf) === p.masterLeaf);
console.log('credId matches package? ', C.toHex(C.credIdFromLeaf(leaf)) === p.credId);
const root = C.recomputeRoot(leaf, C.pathFromHex(p.path));
console.log('recomputed cohort root: ', C.toHex(root));
console.log('root matches package?   ', C.toHex(root) === p.cohortRoot);
```

```bash
npx tsx src/mini-verify.ts presentations/STU-001.presentation.json
npx tsx src/mini-verify.ts presentations/STU-001-tampered.presentation.json   # watch it say false
```

You have now done everything except the two on-chain lookups. Those are just:
query the contract state via the indexer, decode it with the compiled
contract's `ledger()`, and set-membership-check `validRoots` / `revoked`
— read `verify-core.ts` lines 84–99 and see how little code that is. The
`setHas` helper exists because the decoded Set's shape isn't documented; it
defensively handles member()/iterable/Map/object forms. Real systems are like
that.

---

## 3. Exercises

**Exercise 1 — normalize() collisions.** For each pair, predict whether the
two values produce the same commitment (same salt): (a) `385` vs `"385"`
for `fieldCommit('gpa', …)`; (b) `"B.S. Computer Science"` vs
`"b.s. computer science "` (trailing space) for `fieldCommit('degree', …)`;
(c) `385` vs `386`. Then verify two of your answers with `npx tsx`.

<details>
<summary>Solutions</summary>

(a) **Collide** — numbers stringify: `String(385) === "385"`, so both become
the same bytes. (b) **Collide** — trim + uppercase makes them identical bytes.
(c) **Differ** — different canonical bytes. Quick check:

```bash
npx tsx -e "
import * as C from './src/canonical';
const s = C.newSalt();
console.log(C.toHex(C.fieldCommit('gpa', 385, s)) === C.toHex(C.fieldCommit('gpa', '385', s)));  // true
console.log(C.toHex(C.fieldCommit('gpa', 385, s)) === C.toHex(C.fieldCommit('gpa', 386, s)));    // false
"
```

The lesson cuts both ways: canonicalization prevents false TAMPERED verdicts,
but it also means *the canonical form is what's committed* — "Alice" and
"ALICE" are provably the same name in this system.
</details>

**Exercise 2 — tree math by hand.** A cohort has 5 students. (a) How many
leaves after padding, and what fills the extra slots? (b) What is the depth
(equals the Merkle path length)? (c) How many hashes does a verifier compute
to check one student's cohort path? (d) Same three answers for 10,000
students. (e) Using `canonical.ts`, build a 2-leaf tree from two arbitrary
32-byte values and print the root; then recompute the root from leaf 0 with
`getPath`/`recomputeRoot` and confirm equality.

<details>
<summary>Solutions</summary>

(a) 8 leaves (`nextPow2(5)`), extras filled with `EMPTY_LEAF =
H("credvault:empty:")`. (b) depth 3. (c) 3 `nodeHash` computations.
(d) 16,384 leaves, depth 14, 14 hashes — for 10,000 students. Logarithmic
scaling is why one anchor serves a university.

```ts
import * as C from './src/canonical';
const a = C.sha256(Buffer.from('alice')), b = C.sha256(Buffer.from('brian'));
const levels = C.buildTree([a, b]);                    // already a power of two
const root = levels[levels.length - 1][0];
const again = C.recomputeRoot(a, C.getPath(levels, 0));
console.log(C.toHex(root) === C.toHex(again));         // true
```
</details>

**Exercise 3 — fix the idempotent-batch crash (real bug hunt).** In Lab 1 the
skip path died with `ReferenceError: tx is not defined` at
`src/runtime.ts:195`. Find the scoping bug, explain why TypeScript's
compiler would have caught it but `tsx` doesn't, and fix it so the manifest
write works on both paths. (If your `runtime.ts` has already been fixed by a
previous student, `git diff` it to see the original.)

<details>
<summary>Solution</summary>

`const tx` is declared inside the `else` block, so it is block-scoped and
invisible to the manifest code after the `if/else`. `tsx` (esbuild) strips
types without type-checking, so the error only appears at runtime — and only
on the skip path, which is why it survived. One clean fix:

```ts
let anchoredTxId = '(skipped — already anchored)';
...
} else {
  ...
  const tx = await (deployed as any).callTx.addCohortRoot(root);
  anchoredTxId = tx.public.txId;
  ...
}
// manifest: anchoredTx: anchoredTxId,
```

Moral: **the path you added for efficiency is the path you forgot to test.**
Idempotence short-circuits are classic bug farms — test the no-op path as
deliberately as the active one.
</details>

**Exercise 4 — the dictionary attack, live.** Demonstrate why salts are
non-negotiable: (a) write a script that, given an *unsalted* commitment
`SHA256(le64(gpa))` for some hidden GPA, recovers the GPA by trying all
0–400. (b) Time it. (c) Explain in one sentence why the same attack fails
against `compactCommitUint64(gpa, salt)` when the salt is unknown.

<details>
<summary>Solution</summary>

```ts
import * as C from './src/canonical';
const target = C.sha256(C.le64(385));            // the "leaked" unsalted commitment
const t0 = Date.now();
for (let g = 0; g <= 400; g++) {
  if (C.toHex(C.sha256(C.le64(g))) === C.toHex(target)) {
    console.log('recovered GPA:', g / 100, 'in', Date.now() - t0, 'ms');  // ~instant
  }
}
```

(c) With an unknown 32-byte salt, each candidate GPA requires guessing
2²⁵⁶ salts — the dictionary is useless; the commitment hides.
</details>

**Exercise 5 — choose the mode.** A state nursing board wants to verify
licenses: employers must check "license valid + not suspended", and sometimes
"completed ≥ 30 pharmacology contact hours" from continuing-education course
lists. A university wants "did they graduate + send the transcript". For each,
pick granular or monolithic and justify in two sentences, including which
actor benefits and what breaks if you chose wrong.

<details>
<summary>Solution</summary>

Nursing board: **granular** — specific coursework is a real requirement, so
per-course reveal (with the anti-cherry-picking weld) is the product;
monolithic would force all-or-nothing disclosure of a nurse's entire CE
history to every verifier. University: the market asks "did they graduate?"
or "send the transcript" — **monolithic is sufficient** (and simpler), with
granular kept when course-level disclosure is requested. Choosing monolithic
for the board kills the pharmacology-hours use case; choosing granular for a
school that only ever shares full transcripts adds machinery nobody uses.
Match the commitment policy to the disclosure the market actually performs.
</details>

---

## 4. Checkpoint quiz

**Q1.** The chain stores `validRoots`, `revoked`, and `authority` — all
32-byte values. Why is storing a cohort root not a privacy leak, given the
root is "just a hash of hashes of student data"?
<details><summary>Answer</summary>Every hash on the path from a value to the
root is salted (per-field, per-course, master) or domain-separated. With
unknown 2²⁵⁶ salt spaces, no dictionary/brute-force attack can recover any
input — the anchor reveals nothing and binds everything.</details>

**Q2.** Why does each field get its own salt instead of one salt for the whole
record? Name two reasons.
<details><summary>Answer</summary>(1) Independent disclosure: revealing one
field (value + its salt) doesn't expose the others. (2) Per-field brute-force
resistance and field binding (the field name is inside the hash, so
commitments can't be swapped across fields).</details>

**Q3.** What transformations does `normalize()` apply to strings, and
why is GPA stored as `385` instead of `3.85`?
<details><summary>Answer</summary>UTF-8 bytes, trim, uppercase. GPA is ×100 as
an integer because Compact circuits have no floating point, and comparisons
only work on `Uint<N>` — hundredths-integers are exact and comparable.</details>

**Q4.** A verifier recomputes a cohort root and finds it in `validRoots`,
but the verdict is still not VERIFIED. What else is checked, and against
*which* state (mint-time or current)?
<details><summary>Answer</summary>Revocation: `credId` membership in the
on-chain `revoked` set — always against the CURRENT chain state. (The tamper
recompute of the leaf happens even before the anchor check.)</details>

**Q5.** 5 students or 10,000 students: how many transactions does anchoring
cost, and roughly how long does it take on the devnet? What dominates that time?
<details><summary>Answer</summary>ONE transaction either way (~22–25 s),
because only the 32-byte root is anchored. The time is dominated by fixed
proving/balancing/submission overhead, not by cohort size.</details>

**Q6.** Old proof packages keep verifying after new cohorts are anchored. What
design choice provides this, and what would a single evolving tree root have
done instead?
<details><summary>Answer</summary>`validRoots` is a never-remove set:
historic roots stay anchored forever, so old packages stay valid. A single
evolving root (plain MerkleTree semantics) would invalidate old proofs on
every insertion — the reason the ecosystem has HistoricMerkleTree, which our
opaque-set design sidesteps entirely.</details>

**Q7.** In monolithic mode a holder asks to reveal just one course. What
happens, and why is that the *right* behavior?
<details><summary>Answer</summary>An honest refusal ("subsets are not
possible; share the full transcript"). All-or-nothing is the monolithic
commitment's semantics — a single `docCommit` over the whole canonical
transcript. Faking a subset proof would be a lie; the system refuses instead
of lying.</details>

**Q8.** David's GPA was mis-entered. Describe the correct rectification flow
and why his *old* credId remains on-chain forever.
<details><summary>Answer</summary>Correct the record at the source → re-batch
(deterministic salts give the corrected record a NEW leaf and NEW credId) →
anchor the new root → revoke the OLD credId. The revoked set is append-only:
corrections create new anchors; they never rewrite history, so the old
(revoked) credId stays as a permanent tombstone.</details>

---

## Agent teacher notes

**Pacing.** Total ~4 hours: concepts ~75 min, labs ~90 min, exercises + quiz
~45 min, buffer ~30 min. Do not rush §1.2–§1.4 (hashes, salts,
canonicalization) — every later module assumes them. The single best
checkpoint before moving to labs: ask the student to *whiteboard* the
commitment chain from `fullName` to `cohortRoot` from memory. If they can,
the labs will be pure confirmation; if they can't, lab output will feel like
magic and nothing will stick.

**Common misconceptions (listen for these).**

1. *"The blockchain stores the credentials."* No — anchors only. Have them
   dump the contract state via the indexer and find a single name in it (they
   can't).
2. *"Salts are like passwords to remember."* They're per-commitment
   randomness, derived by KDF in our system; the only secret a human holds is
   the issuer secret (server-side).
3. *"Verification calls the blockchain / the school."* Verification is local
   recomputation plus one indexer *read*. Point at the 0.1 s timing — no
   transaction could be that fast.
4. *"A hash of low-entropy data is safe because hashes are one-way."* The
   dictionary attack (Exercise 4) cures this fast — run it, don't just say it.
5. *"Merkle proofs reveal the other students."* A path reveals only sibling
   *hashes* — ask: "from Alice's path, can you learn Brian's name?" (No —
   only opaque 32-byte siblings.)
6. *"Revoked = deleted."* Revocation is a tombstone in an append-only set;
   history is never rewritten (Q8 reinforces).

**Checking understanding before advancing.** After Lab 3, ask: "I edit one
hex character in `salts.gpa` of a presentation. Which verdict, and why?"
(`TAMPERED` — the recomputed commitment changes → leaf mismatch.) After Lab
4: "Why doesn't the contract need a 'mode' flag?" (Anchors are opaque; mode
lives in the package and verifier logic.) If either answer is shaky, re-walk
`verify-core.ts` lines 41–99 together — the whole module is in those 60
lines.

**FAQ answers.**

- *"Why not just put encrypted data on-chain?"* Then the chain holds PII
  ciphertext forever (GDPR erasure becomes impossible, keys become a
  liability), and verification would need decryption infrastructure. Anchors +
  holder-carried data beats encryption-at-rest on every axis we care about.
- *"What stops Penn State from revoking everyone maliciously?"* Nothing
  cryptographically — the issuer is the authority *by design* (they can do the
  equivalent today with the clearinghouse). The chain makes their actions
  auditable and timestamped; governance, not math, handles a rogue registrar.
- *"Can Alice give Brian her package to use?"* The package proves the
  *credential*, not the *person* — the same as a paper diploma. Binding
  credentials to humans (holder-binding) is a real product question parked in
  ARCHITECTURE.md §10, not a bug in this layer.
- *"Why SHA-256 and not the contract's own hash everywhere?"* One library,
  everyone uses it, zero cross-implementation mismatch (§1.4's moral). The one
  place we *do* match Compact byte-for-byte is the GPA commitment — and that's
  Module 6's opening story.

**When to let them struggle.** Let them fight Exercise 3 (the runtime bug)
for a solid 20 minutes before hinting — it is a real bug with a real stack
trace, and fixing it teaches more than any lecture. Likewise, require the
Lab 5 mini-verifier to be *their* code; review it line by line. Step in early
only for environment problems (devnet down, compile cache, npm dedupe issues)
— those are not the lesson. **Advance when:** the student can produce all
five verdicts on demand, explain the commitment chain without notes, and
their mini-verifier passes the tampered presentation correctly.

---

## References

**This workspace (ground truth):**
- `apps/credvault/step1-degree/contracts/degree.compact` — the three ledger declarations + `addCohortRoot` / `revokeCredential`
- `apps/credvault/step1-degree/src/canonical.ts` — the entire commitment scheme (normalize, pad32, fieldCommit, masterLeafV3, credId, buildTree, paths, canonicalTranscript, kdfSalt)
- `apps/credvault/step1-degree/src/runtime.ts` — issuer runtime (commitStudent, idempotent batch, deploy-with-capture, revoke)
- `apps/credvault/step1-degree/src/verify-core.ts` — the canonical verification pipeline and all verdicts
- `apps/credvault/step1-degree/src/issuer.ts`, `src/holder.ts`, `src/verifier.ts` — the three CLIs
- `apps/credvault/step1-degree/data/cohort.json`, `data/cohort-monolithic.json`, `packages/STU-001.package.json`
- `apps/credvault/ARCHITECTURE.md` — §3 (the 7 patterns + size rule), §11 (college template), §14 (Step-1 report + benchmarks), §16 (2b: scheme v3), §17 (2c: monolithic), §18 (idempotent batching)
- `apps/credvault/schemas/college-degree.yaml` — the design-target schema (canonicalLayout, presentationMechanics)
- `apps/credvault/docs/step1-degree-contract-runbook.md`, `docs/step2-runtime-and-l2-runbook.md`
- `midnight-expert/plugins/core-concepts/skills/privacy-patterns/SKILL.md` — the canonical 7 patterns (commitment, nullifier, Merkle, selective disclosure)

**Official docs:**
- Compact standard library (persistentHash/persistentCommit): https://docs.midnight.network/compact/standard-library/exports
- Explicit disclosure (why `disclose()` exists): https://docs.midnight.network/compact/reference/explicit-disclosure
- Compact smart-contract security: https://docs.midnight.network/compact/smart-contract-security
- Version support matrix: https://docs.midnight.network/relnotes/support-matrix
- Networks & environments (undeployed devnet): https://docs.midnight.network/guides/networks-and-environments
