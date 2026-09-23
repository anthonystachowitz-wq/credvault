# Module 0: Orientation — What Is Midnight, and Why Does Privacy Need a Blockchain?

> Time: ~2 hours | Prerequisites: basic coding (you can run commands and edit JSON)

Welcome. In the next two hours you will go from "I've heard the word blockchain"
to watching a privacy-preserving credential verify in a tenth of a second — and
understanding, roughly, why it worked. Everything after this module is deepening
what you experience here.

## Learning objectives

By the end of this module you can:

1. **Explain** the problem with how credentials (degrees, licenses) are verified
   today, and name the three bad options verifiers currently face.
2. **Explain** what a blockchain buys you in one sentence — and why an ordinary
   *public* blockchain is the worst possible place to put personal data.
3. **Describe** Midnight's dual public/private state in your own words, and what
   "selective disclosure" means, using the GPA example.
4. **Name** the 7 privacy patterns and give a one-line description of each.
5. **Run** the verifier on a real proof package and interpret
   VERIFIED / REVOKED / TAMPERED correctly — including *why* each happened.
6. **State** the CredVault data rules: what goes on-chain, what never does, and
   who generates transactions (spoiler: students don't).

---

## 1. Concepts from scratch

### 1.1 The problem: proving things about yourself is weirdly hard

Meet Alice. Alice just graduated from Penn State with a B.S. in Computer Science
and a 3.85 GPA. She applies for a job. The employer wants to verify her degree
before making an offer. What are the employer's options today?

**Option A — Call the registrar.** Penn State's registrar's office confirms
degrees by phone, email, or mail. This works, but it's slow (days), it only works
while the university exists and its office is open, and it doesn't scale — every
employer, every candidate, every time.

**Option B — Pay a middleman.** In the US, the National Student Clearinghouse
sits in the middle: schools send it student records, employers query it (around
**$19.95 per lookup**; the industry norm is roughly $5–$20). This is faster, but
now there's a **central database full of every student's records** — a breach
target, a consent nightmare, and a toll booth between Alice and her own
achievements.

**Option C — Trust the document.** Alice emails a PDF of her transcript. This is
fast and free — and worthless as proof. A PDF is pixels. Anyone with a free
editor can turn a 2.85 into a 3.85 in ninety seconds. Employers know this, which
is why Options A and B exist at all.

Notice the shape of the problem: **verification requires trusting *someone*.**
The school (must be reachable), the middleman (must be trusted with everyone's
data), or the document (can't be trusted at all).

Now the interesting question: could there be a fourth option where the employer
trusts *mathematics* instead — where Alice herself hands over something that is
instantly checkable, impossible to forge, and doesn't require the school to be
online or a middleman to exist?

That's what you're going to run in this module's lab. But first we need two
ideas: what a blockchain is for, and why privacy needs one with special powers.

### 1.2 What a blockchain actually buys you (the 2-minute version)

Strip away everything you've heard about coins and speculation. A blockchain is:

> **A shared ledger, copied across many independent computers, that anyone can
> read, where new entries can be added but old entries can't be quietly changed
> or deleted — and no single party runs it.**

```
  One ledger, many identical copies (the "chain"):
  +-----------+   +-----------+   +-----------+   +-----------+
  | ledger v. |   | ledger v. |   | ledger v. |   | ledger v. |
  |     1042  |   |     1042  |   |     1042  |   |     1042  |
  +-----------+   +-----------+   +-----------+   +-----------+
   computer A      computer B      computer C      computer D   ... hundreds more
  No computer is "the real one". They continuously agree on the state.
  Changing history on ONE copy is pointless — the others disagree with you.
```

Why does that matter for Alice's degree? Because it gives us a place to put a
**public anchor** — a tiny piece of information that:

- **anyone can check** (the employer doesn't need an account or permission),
- **nobody can forge or erase** (not Penn State, not Alice, not us),
- **outlives any single organization** (the check works even if the registrar's
  office is closed, the server is off, or the vendor is gone).

Think of it as a notary's ledger book that has been photocopied onto thousands of
computers. Once "Penn State anchored the class of 2027" is written in that book,
it's written everywhere, forever, and Penn State itself can't come back and
erase it. That's the entire value. Everything else — coins, tokens, wallets — is
plumbing that makes the book work, and in this course it stays under the floor.
(Full treatment in Module 2.)

### 1.3 Why you can't just put the data on a blockchain

Here's the trap most blockchain pitch decks walk straight into. If the shared
ledger is readable by **everyone**, and entries live there **forever**, then
writing Alice's transcript to it means:

> "ALICE JOHNSON, B.S. COMPUTER SCIENCE, GPA 3.85" — published permanently, to
> the whole world, undeletable.

That is not a product; that is a lawsuit. Privacy law (FERPA in US education,
GDPR in Europe) exists precisely because personal data must be controlled,
purpose-limited, and deletable. A public, immutable ledger is the exact opposite
of those requirements on every axis. "Just encrypt it first" doesn't save you
either: encrypted personal data is still personal data, keys leak, and "forever"
is a long time to keep a ciphertext safe.

So we have a real tension:

- We **want** the public checkability of a shared ledger (kills the middleman).
- We **must not** put personal data on it (law + ethics + common sense).

The resolution is the single most important idea in this course:

> **Keep the data OFF the chain. Put only cryptographic *fingerprints* of the
> data ON the chain.**

The fingerprint (you'll build one yourself in Module 1 — it's called a
*commitment*, made from a hash function) has a magical pair of properties:

1. It **proves the data existed exactly so** — change one character of the data
   and it no longer matches its fingerprint.
2. It **reveals nothing** about the data — you cannot turn the fingerprint back
   into a name, a degree, or a GPA.

The chain stores fingerprints. Verification becomes: "show me data whose
fingerprint matches the one on the chain." Anyone can check it, nobody can fake
it, and nothing private was ever published. This one move is the foundation
under everything you'll build.

### 1.4 Midnight: two states, not one

Most blockchains give you only the public half of that idea, leaving you to
invent the private half yourself. **Midnight is a data-protection blockchain**
built around exactly this split. The official description:

- **Public state** — data stored on-chain, visible to all network participants:
  transaction proofs, contract code, and anything intentionally made public.
- **Private state** — data stored locally by each user, **never exposed to the
  network**: personal information, business data, anything sensitive.

And the bridge between the two is **zero-knowledge cryptography** (zk-SNARKs):
Midnight can verify a computation *without seeing its inputs*, producing small
proofs (about 128 bytes) that validate in milliseconds. You don't need to know
how that works yet — Module 1 builds the intuition from a story about a cave —
you only need the slogan:

> **Prove a fact is true without revealing the data that makes it true.**

```
                 ALICE (holder)                              MIDNIGHT NETWORK
  +----------------------------------+            +-----------------------------+
  | PRIVATE STATE (her machine only) |            | PUBLIC STATE (everyone sees)|
  |  name: Alice Johnson             |            |  contract code              |
  |  degree: B.S. Computer Science   |  ZK proof  |  fingerprints (commitments, |
  |  gpa: 3.85                       | ---------> |  Merkle roots, revoked IDs) |
  |  courses + grades + salts        |  reveals   |  "this fact was proven"     |
  |  (never leaves her hands)        |  NOTHING   |  (no name, no GPA, no PII)  |
  +----------------------------------+            +-----------------------------+
```

Two more facts for orientation (details when you need them):

- Programs that run on Midnight are written in **Compact**, a language that
  looks like TypeScript and compiles into zero-knowledge circuits. You will read
  a real one in Module 4 — it's 76 lines and heavily commented.
- Midnight is its own network (a Cardano partner chain). In this course you'll
  work against a **local devnet** — the whole network running in Docker
  containers on your machine — so everything is free, instant, and yours to
  break.

### 1.5 Selective disclosure: the one vivid example

Here is the capability that makes all of this a product instead of a science
project. Watch the difference between these two questions an employer can ask:

- **Old world:** "Send me Alice's transcript." → Alice hands over *everything*:
  every course, every grade, her GPA — data the employer may not even need, now
  sitting in yet another database.
- **New world:** "Alice, prove your GPA is at least 3.50." → Alice presents a
  proof. The employer learns **exactly one bit**: *GPA >= 3.50: TRUE*. Not the
  GPA. Whether she has a 3.62 or a 3.98 stays invisible. And the employer knows
  the claim is real, because the proof is bound to the fingerprint Penn State
  anchored on-chain.

That is **selective disclosure**: *reveal the minimum, prove the claim, hide the
rest.* The CredVault degree demo you'll run has three disclosure levels:

| Level | Name | What the verifier learns |
|---|---|---|
| **L1** | Instant degree check | "Valid Penn State degree, not revoked" — a binary yes/no plus the issuer's identity |
| **L2** | GPA threshold (ZK) | L1 **plus** "GPA >= X is TRUE" — proven in zero knowledge; the GPA itself is never revealed |
| **L3** | Full transcript, tamper-proof | The complete transcript — every field revealed — with a mathematical guarantee that not one character was altered |

The holder chooses the level per verifier. The employer can *request* a level;
the student decides what to show. Minimum necessary, always.

### 1.6 The 7 privacy patterns at a glance

Everything Midnight applications do with privacy decomposes into **seven
reusable patterns** (this is the canonical enumeration from the midnight-expert
skill library — you'll meet each one properly in later modules). Read this table
once, don't memorize it; it's your map, and we'll revisit it at the end of the
course when you can read it fluently.

| # | Pattern | One-liner | In the degree demo? |
|---|---|---|---|
| 1 | **Commitment** | Hide a value behind randomness while staying bound to it (the fingerprint idea from 1.3) | ✅ every field |
| 2 | **Merkle membership** | Prove "I'm in the issued set" without revealing which member — one root anchors 10,000 people | ✅ the cohort root |
| 3 | **Nullifier** | Prevent double-actions/replay without revealing identity | (used for revocation sets in the pattern library) |
| 4 | **Round-based unlinkability** | Repeated proofs can't be correlated to each other | later |
| 5 | **Commit–reveal** | Two-phase hidden values (sealed bids, hidden offers) | later |
| 6 | **Shielded tokens** | Private value transfer | ❌ out of scope for CredVault v1 |
| 7 | **Selective disclosure** | Disclose a *boolean fact* about hidden data ("x >= 3.50"), never the value | ✅ the L2 level |

Plus the mirror of #2: **non-membership** — proving something is NOT in a set.
That's how revocation works: your credential ID must be *absent* from the
on-chain revoked set.

And here is the punchline — the whole degree verification claim decomposes into
patterns like an arithmetic expression:

```
  "Degree valid  AND  not revoked  AND  GPA >= 3.5"
   = membership  AND  non-membership AND  threshold
   (pattern 2)       (mirror of 2)      (pattern 7)
```

Real privacy applications are *compositions* of a small number of well-understood
primitives. That's good news: it means this is learnable.

### 1.7 What CredVault does with all of this

**CredVault** is the verification platform built on these ideas, and the codebase
you'll live in for this course. The one-paragraph version:

An issuer (mock Penn State) holds all student data on its own server. At
graduation, it commits each student's record into fingerprints, combines a whole
cohort into one Merkle root (pattern 2), and anchors that root on-chain with a
single transaction — 5 students or 10,000, same one transaction. Each student
gets a **proof package** (their values + the cryptographic ingredients to prove
them). An employer receives a **presentation** from the student, recomputes the
fingerprints, and checks them against the on-chain anchors — no account, no fee,
no phone call to the school, about a tenth of a second. Personal data never
touches the chain; CredVault never holds personal data at all; the school is the
only system of record, and it can be switched off at verification time.

The house rules (each one becomes obvious as you build):

- **No PII on-chain, ever.** Anchors only: 32-byte fingerprints.
- **Students generate zero transactions.** No wallet, no tokens, no keys.
- **The chain stores fingerprints, not files.**
- **Verification must work with the issuer offline.** That is the product's
  superpower, not a missing feature.

Enough talk. Let's run the thing.

---

## 2. Hands-on lab: the Penn State demo, guided tour

**Where:** all commands run in the project directory:

```bash
cd /home/anthony/midnight/apps/credvault/step1-degree
```

**What you need:** the local Midnight devnet (three Docker containers: the node,
the indexer, the proof server) and the deployed demo with its pre-made packages.
Your teacher will confirm this with the environment checklist before you start —
if you are self-driving, run:

```bash
cd /home/anthony/midnight/apps/credvault/step0-hello && docker compose ps
# Expect: step0-hello-node, step0-hello-indexer, step0-hello-proof-server
#         all "Up"/"healthy". If not: docker compose up -d --wait
cd /home/anthony/midnight/apps/credvault/step1-degree
```

### Lab 0.1 — Meet the students (5 min)

Open the mock graduating class:

```bash
cat data/cohort.json
```

Five students: **Alice Johnson** (STU-001, B.S. CS, GPA 385), **Brian Smith**
(STU-002), **Carla Reyes** (STU-003), **David Kim** (STU-004), **Erin O'Neill**
(STU-005). GPAs are stored **times 100** (385 = 3.85) because zero-knowledge
circuits do integer arithmetic, not decimals — hold that thought for Module 1.

This file is what Penn State's system of record would export. It lives entirely
**off-chain**. In a moment you'll see what of it (and what *not* of it) reached
the chain.

### Lab 0.2 — The wow moment: verify Alice (5 min)

Alice has already downloaded her **proof package** at "graduation" (it's in
`packages/STU-001.package.json`), and a **presentation** has been prepared from
it — think of the presentation as "the QR-code payload she shows an employer."

You're the employer now:

```bash
npm run verifier presentations/STU-001.presentation.json
```

Expected output (real, from this codebase):

```
✅ VERIFIED
   Issuer:   Penn State University (mock)
   Cohort:   2027-spring
   Name:     Alice Johnson
   Degree:   B.S. Computer Science
   GPA:      3.85
   Courses:  (revealed 5 of 5)
       CS101    A   Intro to Computer Science (3 cr)
       CS240    A   Data Structures (3 cr)
       CS320    A-  Algorithms (3 cr)
       MATH420  A   Cryptography (3 cr)
       CS460    A-  Machine Learning (3 cr)
   verify time: 0.1s
```

**Stop and absorb that.** In ~0.1 seconds, with no account, no phone call, no
$19.95, and Penn State's server *not involved at all*, you confirmed that this
exact transcript is the one Penn State anchored — and you did it against a
blockchain running on your own machine. That is the entire product pitch, and
you just ran it.

### Lab 0.3 — What just happened? (10 min)

The verifier did four things, in order. Follow along in
`src/verify-core.ts` (117 lines — you'll be able to read all of it by Module 5):

```
 presentation.json
      |
      v
 [1] TAMPER CHECK — recompute the fingerprint from the presented values+salts;
     does it reproduce the credential's commitment? (pure math, no network)
      |
      v
 [2] REBUILD THE COHORT ROOT — from Alice's leaf + her Merkle path (Module 1!)
      |
      v
 [3] MEMBERSHIP — is that root in the contract's validRoots set ON-CHAIN?
     (one query to the indexer — the only network read)
      |
      v
 [4] REVOCATION — is her credential ID absent from the on-chain revoked set?
      |
      v
   VERIFIED
```

Peek inside the presentation Alice handed over:

```bash
head -40 presentations/STU-001.presentation.json
```

You'll see: `values` (name, degree, gpa — the *revealed* data), then per-course
entries each carrying a `salt` and a `path` (the cryptographic ingredients).
You don't need to understand those yet — Module 1 is devoted to exactly them.
For now just note: **the data and the proof ingredients travel together, from
the holder, and nothing is fetched from any school database.**

### Lab 0.4 — David: revocation without a phone call (5 min)

David Kim's credential was revoked by the issuer (his record had a serious
error; the corrected-record story is a Module 5 treat). His presentation file is
perfectly well-formed — same shape as Alice's. Verify it:

```bash
npm run verifier presentations/STU-004.presentation.json
```

```
✗ REVOKED — credential was revoked by the issuer
   verify time: 0.1s
```

His credential ID sits in the on-chain `revoked` set. The employer learns that
in a tenth of a second **without contacting Penn State** — step [4] above reads
the revocation set straight from the chain. Also notice what the employer does
*not* learn: why it was revoked, or anything else about David.

### Lab 0.5 — Break it yourself: the doctored transcript attack (10 min)

This is the one you must do with your own hands. Give Alice a better GPA —
3.85 → 3.95 — the classic PDF-forgery move, except here it's a JSON file:

```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('presentations/STU-001.presentation.json'));
p.values.gpa=395;
fs.writeFileSync('presentations/my-tampered.json', JSON.stringify(p,null,2));"
npm run verifier presentations/my-tampered.json
```

```
✗ TAMPERED — presented values do not reproduce the credential commitment
   verify time: 0.0s
```

One changed number — *five* to *nine*, a single digit — and the whole
presentation collapses at step [1], before the chain is even consulted. Why?
Because Penn State's anchored fingerprint was computed over the **real** value
(385). Your edited value (395) recomputes to a *different* fingerprint. They
don't match, and there is no way to make them match without Penn State's
cooperation. **Alter-and-still-verify is mathematically impossible** — and that
impossibility IS the product. (In Module 1 you'll recompute this exact
fingerprint by hand and watch the mismatch happen digit by digit.)

### Lab 0.6 — The magic one: a zero-knowledge proof (10 min)

Now the thing that sounds impossible the first time you hear it. An employer
says: *"I don't need her whole transcript. I just need to know her GPA is at
least 3.50 — and she shouldn't have to show me the number."*

```bash
npm run verifier presentations/STU-001.presentation.json -- --min-gpa 350
```

```
✅ VERIFIED
   ...
   L2:      ✅ ZK PROOF VALID — GPA >= 3.50 (GPA never revealed)
   verify time: 0.2s
```

A zero-knowledge proof, verified in a fifth of a second, off-chain, no
transaction, no gas. Inside Alice's package there are **pre-minted ZK proofs**
(created by the issuer at graduation, ~2 seconds each) that assert "the hidden
GPA committed in this credential is >= 3.00" and "... >= 3.50". The verifier
checks the proof mathematically and learns the one bit it asked for. The GPA —
3.85 — appears nowhere in what the proof reveals.

(Preview of a Module 6 experiment: Brian's GPA is 3.42. Ask your teacher to show
you what happens when the issuer tries to pre-mint "Brian >= 3.50" — the circuit
**refuses to produce the proof**. You cannot prove a false statement. That's not
a policy; it's math.)

### Lab 0.7 — Stretch: seal most of the transcript (5 min)

Alice is applying to a cryptography job and wants to show *only* her two most
relevant courses. She creates a **subset presentation**:

```bash
npm run holder STU-001 -- --courses MATH420,CS460
npm run verifier "presentations/STU-001-MATH420+CS460.presentation.json"
```

```
   Courses:  (revealed 2 of 5)
       MATH420  A   Cryptography (3 cr)
       CS460    A-  Machine Learning (3 cr)
      … 3 more course(s) SEALED (not disclosed by holder)
   verify time: 0.1s
```

Two courses revealed, three sealed — and the revealed two still verify against
the on-chain anchor, because each course carries its own fingerprint and Merkle
path (pattern 2, applied inside the transcript). The verifier also knows
*that* three courses were withheld — sealed means hidden, not deleted — so
cherry-picking is a disclosure choice, not a forgery.

### Lab 0.8 — Optional: see it as a product (5 min)

The same verification engine powers a real web portal:

```bash
npm run portal        # → http://localhost:4050
```

Open **http://localhost:4050/verify.html** — paste the contents of a
presentation file, or drop the file in — and watch the same VERIFIED/REVOKED
page render. The portal, the CLI you just used, and the HTTP service all share
one implementation (`src/verify-core.ts`): one verification logic, many
front-ends. (`/holder.html` is the student app and `/issuer.html` the
registrar console — Module 7 plays with the full flow. Press Ctrl+C to stop
the portal when you're done.)

### What can go wrong (and fixes)

| Symptom | Cause | Fix |
|---|---|---|
| `✗ CONTRACT_NOT_FOUND — contract not found on-chain` | The devnet was reset (`docker compose down -v` wipes the chain) after the demo was deployed | Redeploy: `rm -f data/deployment.json data/manifest.json && npm run runtime batch` (takes ~30 s) |
| Verifier hangs, no output for >60 s | Indexer or node container is down | `cd ../step0-hello && docker compose up -d --wait` |
| `expected instance of StateValue` | Duplicate runtime copies after a reinstall | `npm dedupe` then retry (the Step-0 saga — told properly in Module 4) |
| `npm run holder` says `courses not in package` | Typo in the course code (must be one Alice actually has) | Check `data/cohort.json` for the real course codes |
| L2 says `no pre-minted proof for GPA >= X` | The package only carries proofs for the standard thresholds (3.00, 3.50) | That's the honest-refusal design — a novel threshold needs the issuer to mint it (Module 6) |

---

## 3. Exercises

**Exercise 0.1 (explain it back).** Write five sentences, addressed to a friend
who has never heard of blockchains, explaining what the CredVault chain stores
about you and why your transcript is safe anyway. Show it to your teacher.

**Exercise 0.2 (find it).** Open `presentations/STU-001.presentation.json`.
List every piece of information a verifier learns about Alice *directly from the
file* (no chain). Then list what the file contains that is *not* human-readable
(salts, paths, hashes) and take your best guess at what each is for. You'll
grade your own guesses at the end of Module 1.

**Exercise 0.3 (predict, then run).** Alice's CS320 grade is "A-". Suppose she
edits her presentation to change that one grade to "A" — nothing else. Predict
the verdict and *which check* catches it (step [1], [3], or [4] from Lab 0.3).
Write down your prediction, then do it and run the verifier.

<details>
<summary>Solution</summary>

**Prediction:** `✗ TAMPERED`, caught at step [1] — the recompute check. The
course grade is one of the inputs to the course fingerprint
(`courseLeaf = H(... || code || title || credits || grade || salt)`), so
changing "A-" to "A" changes the course fingerprint → the course sub-root →
Alice's master leaf → it no longer matches the credential commitment. The
mismatch is detected locally, before the chain is even queried.

**Do it:**

```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('presentations/STU-001.presentation.json'));
p.courses.find(c=>c.code==='CS320').grade='A';
fs.writeFileSync('presentations/my-grade-tamper.json', JSON.stringify(p,null,2));"
npm run verifier presentations/my-grade-tamper.json
# → ✗ TAMPERED — presented values do not reproduce the credential commitment
```
</details>

**Exercise 0.4 (the comparison table).** Fill in this table from what you
learned (no code needed) — then defend your answers to your teacher:

| Question | Clearinghouse model | CredVault model |
|---|---|---|
| Who holds the student data? | | |
| Must the school be online at verification time? | | |
| Cost per verification | | |
| Time per verification | | |
| What happens if the middleman is breached? | | |
| Who can quietly rewrite history? | | |

<details>
<summary>Solution</summary>

| Question | Clearinghouse model | CredVault model |
|---|---|---|
| Who holds the student data? | The clearinghouse (a second copy of everyone's records) | The school only (system of record); the student holds a presentation cache; CredVault holds nothing |
| Must the school be online? | Effectively yes (the records feed must be maintained) | **No** — anchors live on-chain; verification is issuer-offline |
| Cost per verification | ~$5–$20 (≈$19.95 typical) | $0 for the verifier |
| Time per verification | Minutes to days (depending on method) | ~0.1 s |
| Breach impact | Every student's records, centrally | There is no central store to breach — packages live with students; the chain holds only 32-byte fingerprints |
| Who can rewrite history? | The middleman (it's their database) | Nobody — anchored roots are on a ledger no single party controls; corrections happen by anchoring *new* records, never editing old ones (Module 5) |
</details>

**Exercise 0.5 (stretch — design thinking).** A landlord wants applicants to
prove *"monthly income >= 3× rent"* without showing pay stubs. Using only the
ideas from this module: which disclosure level (L1/L2/L3) is the right shape,
and which of the 7 patterns would you expect to be involved? What should go
on-chain, and what must never?

<details>
<summary>Solution</summary>

- **Shape: L2** — a threshold fact about a hidden number ("income >= X"),
  exactly like "GPA >= 3.50". The landlord learns one bit; the applicant's
  actual income stays hidden.
- **Patterns:** #1 commitment (the employer/issuer anchors a commitment to the
  income figure), #7 selective disclosure (the threshold proof), and the
  #2-style machinery if there's an issued-set plus revocation (e.g. the
  employment verification is current, not withdrawn).
- **On-chain:** only fingerprints — the issuer's anchored commitment/root and
  any revocation IDs. **Never on-chain:** the salary, the employer's name tied
  to the person, the pay stubs themselves. The applicant carries the package;
  the landlord recomputes and checks the ZK proof.
</details>

---

## 4. Checkpoint quiz

Your teacher will ask these conversationally. Answers are for the teacher.

1. **What does the CredVault chain store about Alice?**
   <details><summary>Answer</summary>Nothing personal. Only 32-byte anchors: the
   cohort Merkle root (one per graduation batch), the revocation set (credential
   IDs), and the issuer's authority key. Her name, degree, GPA, and courses
   never touch the chain.</details>

2. **Why can't an ordinary public blockchain store student records?**
   <details><summary>Answer</summary>Because public means everyone can read it
   and immutable means it can never be deleted — the opposite of what privacy
   law (FERPA/GDPR) and basic ethics require for personal data.</details>

3. **Name Midnight's two states and where each lives.**
   <details><summary>Answer</summary>Public state: on-chain, visible to everyone
   (contract code, proofs, anchors). Private state: on the user's own machine,
   never exposed to the network (the actual personal data + secrets).</details>

4. **Explain selective disclosure using the GPA example.**
   <details><summary>Answer</summary>Proving a fact about hidden data without
   revealing the data: "my GPA >= 3.50" verified as TRUE while the GPA itself
   (3.85? 3.62?) is never disclosed. The verifier learns exactly one bit.</details>

5. **The verifier performs four checks in order. Name them.**
   <details><summary>Answer</summary>(1) Tamper check — recompute the credential
   fingerprint from presented values+salts; (2) rebuild the cohort root from the
   leaf + Merkle path; (3) membership — is that root anchored on-chain;
   (4) revocation — is the credential ID absent from the on-chain revoked set.</details>

6. **David's presentation is perfectly well-formed, yet verification fails. Why?**
   <details><summary>Answer</summary>His credential ID is in the on-chain
   `revoked` set. Well-formed ≠ valid: the chain's current state is consulted
   on every check, so revocation takes effect immediately, issuer offline or not.</details>

7. **Why does changing one digit of the GPA in the JSON fail — what's the
   underlying idea called?**
   <details><summary>Answer</summary>Because the on-chain commitment was computed
   over the real value; the edited value recomputes to a different fingerprint
   that can't match. The idea is a cryptographic **commitment** (pattern 1):
   hiding yet binding.</details>

8. **"Degree valid AND not revoked AND GPA >= 3.5" decomposes into which
   patterns?**
   <details><summary>Answer</summary>Merkle membership (pattern 2), non-membership
   (the revocation-set mirror of pattern 2), and threshold selective disclosure
   (pattern 7).</details>

9. **How many blockchain transactions does a student generate in this system?**
   <details><summary>Answer</summary>Zero. Proofs are verified, not submitted.
   The only on-chain writes are the issuer's: anchoring cohorts and revoking.</details>

10. **What does an employer need in order to verify a credential?**
    <details><summary>Answer</summary>Just the presentation (file/QR/link) and
    ordinary access to the public indexer. No account, no fee, no wallet, no
    contact with the school.</details>

---

## Agent teacher notes

### Pacing (2 hours, typical student)

| Segment | Time | Notes |
|---|---|---|
| 1.1 The problem | 15 min | Make it concrete: ask if they've ever had to prove a degree or transcript. The three bad options should feel *annoying* before you offer the fourth. |
| 1.2 Blockchain in 2 minutes | 10 min | Resist going deeper — Module 2 exists. The notary-photocopied-everywhere analogy is enough. |
| 1.3–1.4 Privacy tension + dual state | 20 min | This is the intellectual core of the module. The "fingerprints on-chain, data off-chain" sentence must land before you proceed. Test it: "So where does Alice's GPA live?" (Answer: her package / the school's server — never the chain.) |
| 1.5–1.6 Selective disclosure + 7 patterns | 15 min | The GPA>=3.5 example first, patterns table second. Do NOT drill the table — say explicitly "this is a map, not a test." |
| Labs 0.1–0.6 | 30 min | Run 0.2 yourself the first time if the student is shy; make THEM run 0.5 (tampering). 0.6 is the emotional peak — pause, ask "why did that just work?" |
| Exercises + quiz | 15 min | 0.1 and 0.3 are the most diagnostic. Quiz conversationally. |

### Misconceptions you WILL hear (and the correction)

- **"Blockchain = Bitcoin = speculation."** → "Forget coins. For us it's a
  notary's ledger photocopied onto hundreds of computers — a place to put public
  anchors nobody can erase. Nothing in this course is for sale or trade."
- **"So the chain stores my data *encrypted*?"** → The most important correction
  in the module. No: the chain stores **hashes/fingerprints**, not ciphertext.
  Nothing on the chain can be "decrypted" back into your data because your data
  was never there in any form. Encryption is reversible-with-a-key; a hash is
  not reversible at all. (Module 1 makes this visceral.)
- **"A ZK proof is like encryption."** → Encryption hides data in transit or at
  rest. A ZK proof is evidence *about* hidden data: it convinces you a claim is
  true while the data stays put. Different tool, different job. Cave story
  coming in Module 1.
- **"The student must need a wallet / pay gas."** → Students generate **zero**
  transactions — you watched verification happen with no wallet anywhere. Only
  the issuer writes to the chain, in batches. This is a deliberate product
  decision (adoption through invisibility), not a limitation.
- **"The verifier must be calling Penn State's API."** → Show Lab 0.3 again:
  step [3] reads the *indexer* (a public read API over chain state), not the
  school. That's why "issuer offline" is the superpower.
- **"Midnight hides everything about every transaction."** → Nuance for sharp
  students: the *data* is private, but metadata exists — which contract was
  called, which circuit, when. The privacy-patterns skill documents the exact
  observer model; CredVault's design (holders never transact) sidesteps most of
  it. Don't teach this proactively in Module 0 unless asked.

### FAQ answers (keep these short)

- **"Why not just call the registrar?"** Slow, manual, requires the school to be
  reachable forever, and doesn't scale to every verifier. The on-chain anchor
  makes the check instant and issuer-independent.
- **"Isn't this just a QR code on a PDF?"** A QR on a PDF points at data someone
  renders; the student could still doctor the PDF behind a valid QR. Here the
  verifier *recomputes* the fingerprint and renders the result itself — the
  student-rendered document is never in the trust path. (You'll see this as the
  portal-rendered transcript in Module 7.)
- **"What stops Penn State from revoking everyone out of spite?"** Nothing,
  technically — revocation is an issuer authority, like a school voiding a
  diploma today. The chain *does* make it transparent: every revocation is a
  public on-chain event. The recourse story (rectification) is Module 5.
- **"Can the employer see my GPA with the L2 proof?"** No — that is precisely
  the point. The proof reveals one bit (>= threshold: true). You'll verify this
  claim properly in Module 6.
- **"What if I lose my package?"** Re-download from the school (it's the system
  of record). The chain anchors are unaffected.
- **"Is this actually used anywhere?"** The *pattern* is the industry direction
  (verifiable credentials, selective disclosure); CredVault is a working
  implementation of it on Midnight, which is why you're learning on real code.

### When to let them struggle vs. help

- **Lab 0.5 (tampering):** students frequently typo the `node -e` one-liner or
  edit the wrong file. Let them fight it for two attempts — debugging JSON edits
  is a course skill. If the error is a JSON parse error, point at the file, not
  the command.
- **"Predict before run" in Exercise 0.3:** if they can't predict, do NOT
  proceed — reteach Lab 0.3's four steps with the diagram. The prediction IS the
  learning objective.
- Help immediately with anything Docker/devnet (that's plumbing, not the
  lesson); use the troubleshooting table.

### Advance-when criteria (all required before Module 1)

The student can, unprompted:

1. Say where Alice's GPA lives and where it does NOT live (her package + the
   school's server; never the chain).
2. Explain in one sentence what the chain stores ("fingerprints/anchors:
   cohort root + revocation set + issuer key").
3. Explain *why* the tampered file failed ("the fingerprint didn't match anymore").
4. Explain the L2 result as "one bit revealed, number hidden."
5. Got ≥ 7/10 on the quiz with the misses corrected in conversation.

If 1–3 are shaky, reteach 1.3 with a live hash demo (run
`node -e "console.log(require('crypto').createHash('sha256').update('Alice').digest('hex'))"`,
change one letter, show the output transform completely) — it previews Module 1
and usually unsticks the whole module.

---

## References

**Code & project (ground truth):**
- `/home/anthony/midnight/apps/credvault/step1-degree/src/verify-core.ts` — the 4-check verification you ran
- `/home/anthony/midnight/apps/credvault/step1-degree/src/verifier.ts` — the CLI front-end
- `/home/anthony/midnight/apps/credvault/step1-degree/src/holder.ts` — presentation/subset creation
- `/home/anthony/midnight/apps/credvault/step1-degree/data/cohort.json` — the mock class
- `/home/anthony/midnight/apps/credvault/step1-degree/contracts/degree.compact` — the on-chain contract (76 lines)
- `/home/anthony/midnight/apps/credvault/ARCHITECTURE.md` — sections 1–3 (thesis, product, 7 patterns), 14–17 (step reports)
- `/home/anthony/midnight/apps/credvault/MVP.md` — product framing, data-flow rules
- `/home/anthony/midnight/apps/credvault/schemas/college-degree.yaml` — disclosure levels L1/L2/L3 spec
- `/home/anthony/midnight/apps/credvault/docs/step1-degree-contract-runbook.md` — the full Step-1 runbook
- `/home/anthony/midnight/midnight-expert/plugins/core-concepts/skills/privacy-patterns/SKILL.md` — the canonical 7 patterns + observer threat model

**Official docs:**
- [What is Midnight? — data protection, dual state, zk-SNARKs](https://docs.midnight.network/what-is-midnight)
- [How privacy blockchains work](https://docs.midnight.network/concepts/how-privacy-blockchains-work)
- [Midnight concepts index](https://docs.midnight.network/concepts)
- [Midnight Network](https://midnight.network/) — project home & blog
