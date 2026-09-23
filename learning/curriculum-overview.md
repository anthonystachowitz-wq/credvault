# CredVault Academy — Curriculum Overview

> A hands-on course that takes you from **zero blockchain knowledge** to
> **building and operating privacy-preserving credential verification on
> Midnight**, using the real, working CredVault codebase. Taught one-on-one by
> an AI agent acting as your teacher.

---

## Preface for the student: how this course works with an AI teacher

This course is unusual in two ways, and it is worth understanding both before
you start.

**1. You are taught by an agent, not a video.** Your teacher is an AI agent
that has read every line of the codebase and every design document behind it.
Treat it like a human tutor sitting next to you:

- **Ask questions freely, at any depth.** "Why is it called a salt?" "What
  happens if I skip the salt?" "Show me that again with different numbers."
  There are no dumb questions here — the material assumes *zero* blockchain,
  cryptography, or Midnight background, and the agent has infinite patience.
- **Say when you're lost.** "I don't understand why the verifier trusts the
  root" is a completely valid thing to type. The agent will re-explain with a
  different analogy, a diagram, or a live experiment until it clicks.
- **Say when you're bored.** If you already know what a hash function is, say
  so — the agent will quiz you briefly to confirm, then skip ahead.
- **Do the labs yourself.** The agent *can* run every command for you — and
  for demos it will — but you learn this material by typing it. When a lab
  says "run this," run it. When it says "predict the output before running,"
  actually commit to a prediction. The agent will check.
- **Expect to be quizzed.** Each module ends with a checkpoint quiz. The agent
  administers it conversationally and uses your answers to decide whether
  you're ready to advance. Wrong answers are fine — they tell the agent what
  to reteach.

**2. Everything in this course is real.** The project you learn on — CredVault,
a privacy-preserving credential-verification platform — is working software,
not a toy built for teaching. The mock Penn State demo you run in the first
hour is the same code that anchors 50-student cohorts in one transaction and
verifies a credential in a tenth of a second. When the course makes a claim
("one changed character and verification fails"), you will *watch it fail* with
your own hands. Every command in every lab has been run against this exact
codebase.

One consequence: the codebase has scars — bugs that were fought and fixed,
designs that were revised after measurement. We teach those as **stories with
morals** (the March hash-mismatch wall, the TTL saga, the duplicate-runtime
bug), because the difference between a tutorial and an education is that an
education includes what went wrong.

### The one prerequisite

You can read and write basic code: variables, functions, running a command-line
program, editing a JSON file, some exposure to TypeScript/JavaScript. That's
it. No blockchain, no cryptography, no "web3" anything. If you can open a
terminal and run `node -e "console.log('hi')"`, you're ready.

---

## Who this course is for

| Audience | What you get |
|---|---|
| **Students** learning privacy tech / ZK / blockchain | A from-zero path to real ZK application development, with a portfolio-grade capstone |
| **New CredVault employees** (engineering) | The fastest safe onboarding into the codebase: every design decision, every gotcha, every story behind the architecture |
| **New employees** (non-engineering: product, sales, ops) | Modules 0–2 plus the concepts sections of 5–7 give you a rigorous, honest mental model of what we sell and why it works — enough to answer hard customer questions |
| **Issuer-side developers** (e.g. a university's IT team) | Modules 0–6 cover exactly the runtime and verification flows you would operate |

The course is **thorough by design**. It is not a summary of the documentation;
it is a guided reconstruction of the system, so that by the end you could
explain every line of the core files to a skeptic.

---

## What you will be able to do (course-level outcomes)

By the end of the course you can:

1. **Explain** what Midnight is, what dual public/private state means, and why
   selective disclosure is the enabling idea — in plain language, to a
   non-expert.
2. **Use** the four cryptographic primitives the system is built on — hash
   functions, salted commitments, Merkle trees, zero-knowledge proofs —
   including computing them by hand and in code.
3. **Read and reason about** a Compact smart contract: ledger state, witnesses,
   circuits, `disclose()`, and why each line exists.
4. **Operate** the full CredVault flow: devnet up → compile → deploy →
   batch-anchor a cohort → mint proof packages → present → verify — including
   on a real hosted network (preprod).
5. **Debug** the classic failure modes: tampered packages, revoked credentials,
   unknown anchors, hash mismatches, stale state, duplicate runtimes, TTL
   windows.
6. **Build** the three universal apps' flows (verifier portal, holder PWA,
   issuer console) and explain the stateless-verifier rule.
7. **Design and ship** a new issuer end-to-end: schema, batch, verifier flow,
   operations drill — the capstone.

---

## The project the course is built around

**CredVault** is a verification platform on Midnight. The course uses its first
product — college-degree verification for a mock Penn State — as the running
example everywhere:

```
ISSUER (mock Penn State)              MIDNIGHT CHAIN              VERIFIER (mock employer)
 cohort.json (students)               +------------------+
   -> salted commitments              | validRoots: set  |<-+
   -> one Merkle root per cohort  --> | revoked:   set   |  | query via indexer
   -> anchor root (ONE tx)            | authority: key   |  | (no account, ~0.1 s)
   -> packages/*.json --> HOLDER -----+------------------+  |
                      (student: values + salts + paths)     |
                         +------- presentation.json --------+
                             -> recompute & compare
                             -> VERIFIED / REVOKED / TAMPERED
```

The design rules that make it what it is (you will learn *why* each exists):

- **No personal data on-chain, ever.** The chain stores only 32-byte anchors:
  cohort Merkle roots, revoked credential IDs, and the issuer's authority key.
- **Students generate zero transactions.** Proofs are *verified*, not
  submitted. Holders need no wallet, no tokens, no keys.
- **Verification works with the issuer offline.** The anchors live on-chain;
  the verifier recomputes and compares against them directly.
- **One library, both sides.** Issuer, holder, and verifier all use
  `src/canonical.ts` for hashing — a bug class from an earlier generation of
  the project (JS-vs-contract hash mismatch) is made structurally impossible.
- **Selective disclosure is the product.** A holder can reveal everything
  (full transcript), some things (two courses, the rest sealed), or *a fact
  about hidden things* ("GPA >= 3.50" proven in zero knowledge, GPA never
  shown).

---

## Course map: the 9 modules

Total contact time ≈ **40 hours** for the full engineering track; the agent
adjusts pacing individually. Every module follows the same shape: concepts from
scratch → hands-on lab on the real project → exercises with solutions →
checkpoint quiz → agent teacher notes.

| # | Module | Time | What you master |
|---|---|---|---|
| **0** | **Orientation — What Is Midnight, and Why Does Privacy Need a Blockchain?** | ~2 h | The verification problem, what a blockchain buys, why PII can never go on-chain, dual public/private state, selective disclosure (GPA >= 3.5), the 7 privacy patterns at a glance. **Lab:** guided tour of the working Penn State demo — verify a real package in 0.1 s, watch revoked/tampered fail, see a ZK GPA proof verify, seal courses in a subset. |
| **1** | **Foundations — The Cryptography You'll Actually Use** | ~4 h | Hash functions (avalanche live), salted commitments (hide + bind, dictionary-attack demo), domain separation, Merkle trees (build one by hand), ZK intuition (cave story → what a circuit proves). **Lab:** reproduce Alice's entire commitment chain from her package, byte for byte — you become the verifier. |
| **2** | **The Midnight Stack — Every Moving Part, Named and Explained** | ~4 h | The three services (node, indexer, proof server), network ladder (undeployed/preview/preprod/mainnet), NIGHT/DUST tokens, why the proof server is always local, the compatibility matrix. **Lab:** bring up the devnet, health-check all three services, deploy to it. |
| **3** | **The Compact Language — Contracts That Keep Secrets** | ~6 h | Ledger state + circuits + witnesses; reading `degree.compact` line by line; ledger ADTs; witness taint and `disclose()`; provable vs pure circuits; the 7 patterns as design vocabulary; the authority-gating idiom. |
| **4** | **Midnight.js — The SDK That Talks to the Chain** | ~6 h | The 7 providers, the transaction pipeline (local exec → prove → balance → submit → watch), wallets and private state, reading contract state via the indexer, fixing the duplicate-runtime bug (`StateValue`). **Lab:** a script that deploys/calls a contract end-to-end. |
| **5** | **Issuing and Verifying Credentials (L1) — We Build the Commitment Layer Together** | ~4 h | The full commitment scheme, the issuer runtime batch (including idempotent skip), package anatomy field by field, every verdict case (VERIFIED/TAMPERED/REVOKED/UNKNOWN_ANCHOR/CONTRACT_NOT_FOUND), revocation as the nullifier pattern, monolithic vs granular transcripts. **Lab:** write a minimal verifier from scratch using only `canonical.ts`. |
| **6** | **Zero-Knowledge Predicates (L2) — Proving Without Revealing** | ~5 h | `verifyMinGPA` line by line, the `persistentCommit` byte layout (cracked with real test vectors), pre-minting (~2 s, off-chain, gas-free), trustless off-chain verification via deploy-tx replay, the TTL saga, subset disclosures and sub-root convergence, layered revocation semantics. |
| **7** | **Building the Three Universal Apps** | ~4 h | Why the apps are universal (zero Penn-State-specific code), the portal's request path, the stateless-verifier rule, the presentation-drop TTL pattern, batches as subprocesses, the holder PWA and issuer console. |
| **8** | **Going to Production** | ~4.5 h | The network ladder in practice, hosted networks ("nothing runs but the proof server"), funding a preprod wallet, migration drills, idempotence as an operational property, security rules, the roadmap (fees, receipts, the generator). **Capstone:** a new issuer with its own schema, batch, verifier flow, and operations drill — scored against `learning/assessments/capstone-rubric.md`. |

### Dependency graph (linear — each module assumes the ones before it)

```
Module 0  orientation
   v
Module 1  crypto foundations
   v
Module 2  the Midnight stack (node / indexer / proof server / devnet)
   v
Module 3  the Compact language ----+
   v                               |
Module 4  Midnight.js SDK          |  (3 and 4 are the "platform" pair:
   v                               |   contract language + client SDK)
Module 5  classwork: L1 issuing & verifying  <----+
   v                                               |
Module 6  classwork: L2 zero-knowledge predicates  |  (5 and 6 are the
   v                                               |   "product" pair)
Module 7  the three universal apps
   v
Module 8  going to production + CAPSTONE
```

**Non-engineer track** (product/sales/ops, ~10 h): Modules 0 → 1 → 2, then the
concepts sections of Modules 5, 6, and 7 (skip the deepest labs).

---

## Assessment philosophy

**We assess capability, not coverage.** Nobody passes this course by reading.
Three instruments, used consistently:

1. **Labs are the assessment.** Every lab produces an observable result — a
   hash that matches, a verification that fails on cue, a transaction on the
   devnet. The agent watches for the expected artifact before moving on. If
   your `masterLeaf` doesn't match Alice's, you haven't finished Module 1 yet,
   and that's fine — the agent debugs *with* you until it does.

2. **Checkpoint quizzes are gates, not grades.** 6–10 questions per module,
   administered conversationally. The bar: explain it in your own words,
   correctly enough that you won't build a wrong mental model on top. A wrong
   answer is routed to reteaching, not recorded as failure. **Advance-when
   criteria** in every module's teacher notes make the gate explicit.

3. **The capstone is the exit exam.** Inside Module 8 you design and ship a
   NEW issuer end-to-end — schema, batch, verifier flow, operations drill —
   and defend it. Scoring uses the rubric at
   `learning/assessments/capstone-rubric.md`, the same standard the team uses
   internally to judge "is this person safe to touch the real codebase."

### Capstone rubric (preview)

| Dimension | Passing looks like |
|---|---|
| Correctness | All three security cases behave: valid verifies, revoked fails, tampered fails — demonstrated live |
| Privacy hygiene | No PII on-chain; commitments salted; domain separation used; can *explain* what an observer sees |
| Design judgment | Disclosure levels match a real use case; the size rule respected; issuer cadence chosen sensibly |
| Debugging | Given an injected bug during the defense, localizes it using the recompute-and-compare method |
| Communication | Can explain the whole system to a non-technical listener in 3 minutes |

---

## How the agent teacher should use this course

*(This section is written to the teaching agent. Students: reading it is fine —
there are no secrets here; good teaching works even when you see the strings.)*

### Delivery model

- **Teach conversationally, one module at a time.** Open the module file,
  follow its structure (concepts → lab → exercises → quiz), but adapt wording
  to the student. The module text is your script and your answer key, not
  something to recite verbatim.
- **Run the environment for the student.** You control the terminal and the
  devnet. For demos, run commands yourself and narrate. For labs, give the
  student the command to run (or type it for true beginners) and interpret the
  output together. All commands assume the working directory
  `/home/anthony/midnight/apps/credvault/step1-degree` unless stated otherwise.
- **Every module's "Agent teacher notes" section is load-bearing.** It encodes
  pacing, the misconceptions that *will* show up, FAQ answers, and the
  advance-when criteria. Read it before teaching the module.
- **Check understanding before advancing — always.** The advance-when criteria
  are the contract. If the student can't meet them, reteach with a different
  angle (the notes give alternates). Do not let a student accumulate two
  unmastered modules; confusion compounds.

### Pacing rules

- **Fast students:** compress concept sections, expand exercises (each module
  has stretch items), and let them start the capstone's design doc early as a
  "project track."
- **Struggling students:** slow down at hashes and commitments (Module 1) —
  every later idea sits on those two. It is normal to spend a quarter of the
  course there.
- **Let them struggle productively.** When a lab breaks (and labs break —
  typos in JSON edits are the classic), do NOT instantly fix it. Ask "what do
  you think the error means?" and give hints in escalating specificity.
  Intervene directly only after two failed attempts or visible frustration —
  the per-module notes say when.
- **Celebrate the wow moments.** The 0.1-second verification, the first ZK
  proof, the tampered file dying in 0.0 s, the premint refusing a false claim —
  these are the emotional anchors of the course. Pause on them. Ask "why did
  that just work?"

### Honesty rules

- **Never bluff about the code.** If asked something you don't know, check the
  repo (each module's references list exact paths) or say "let's find out" and
  run the experiment. The codebase is the ground truth; the docs are second;
  your priors are third.
- **Teach the scars.** Where the course tells a story (the March hash-mismatch
  wall, the TTL saga, the `StateValue` duplicate), tell it as a story with the
  moral. These are the lessons that transfer to the student's own future work.
- **Keep the language clean.** No crypto-bro jargon. Say "anchor," not
  "anchor on-chain immutably in a trustless decentralized manner." Say "the
  chain stores fingerprints, not files."

### Environment checklist (before starting Module 0)

```bash
# 1. Devnet running (node + indexer + proof-server):
cd /home/anthony/midnight/apps/credvault/step0-hello && docker compose ps
#    -> all 3 services "Up"/"healthy". If not: docker compose up -d --wait

# 2. The demo is deployed and packages exist:
ls /home/anthony/midnight/apps/credvault/step1-degree/data/deployment.json
ls /home/anthony/midnight/apps/credvault/step1-degree/packages/STU-001.package.json

# 3. Smoke test (should print VERIFIED in ~0.1 s):
cd /home/anthony/midnight/apps/credvault/step1-degree
npm run verifier presentations/STU-001.presentation.json
```

If the smoke test fails, consult the troubleshooting table in Module 0's lab
section (or the runbooks in `apps/credvault/docs/`) before teaching anything —
a broken demo in the first ten minutes is the worst possible start.

### Version note

This course targets the toolchain pinned in `apps/credvault/ARCHITECTURE.md`
(sections 8 and 13): compactc **0.31.1**, Midnight.js **4.1.1**, proof-server
**8.1.0**, indexer **4.3.x** (API v4), on the `undeployed` local devnet. If the
workspace's compatibility matrix (`midnight-docs/docs/relnotes/support-matrix.mdx`)
has moved on, re-verify the labs before teaching them — commands and timings
can drift between generations.

---

## Files in this course

| File | Contents |
|---|---|
| `learning/curriculum-overview.md` | This document |
| `learning/module-00-orientation.md` | What Midnight is, why privacy needs a blockchain, the 7 patterns at a glance, guided demo tour |
| `learning/module-01-foundations.md` | Hashes, salted commitments, Merkle trees, ZK intuition — with live labs on `canonical.ts` |
| `learning/module-02-the-midnight-stack.md` | Node, indexer, proof server; networks; NIGHT/DUST; the devnet |
| `learning/module-03-the-compact-language.md` | Reading and reasoning about Compact contracts |
| `learning/module-04-midnight-js.md` | The SDK: providers, transaction pipeline, wallets, private state |
| `learning/module-05-classwork-issuing-and-verifying.md` | L1 classwork: the commitment layer, issuer runtime, every verdict case |
| `learning/module-06-classwork-zero-knowledge.md` | L2 classwork: ZK predicates, preminting, trustless verification, the TTL saga |
| `learning/module-07-building-the-apps.md` | The three universal apps: verifier portal, holder PWA, issuer console |
| `learning/module-08-going-to-production.md` | Networks ladder, preprod migration, operations, capstone |
| `learning/assessments/capstone-rubric.md` | The capstone scoring rubric |

## References

- `/home/anthony/midnight/apps/credvault/ARCHITECTURE.md` — the platform design
  doc and step reports (benchmarks, gotchas, lessons) — the course's ground truth
- `/home/anthony/midnight/apps/credvault/MVP.md` — the college-degree product framing
- `/home/anthony/midnight/apps/credvault/schemas/college-degree.yaml` — the issuer template spec
- `/home/anthony/midnight/apps/credvault/step1-degree/` — the working project
- `/home/anthony/midnight/apps/credvault/docs/` — runbooks for every step
- `/home/anthony/midnight/midnight-expert/plugins/core-concepts/skills/privacy-patterns/SKILL.md` — the canonical 7 privacy patterns
- [What is Midnight? — official docs](https://docs.midnight.network/what-is-midnight)
- [Midnight compatibility matrix](https://docs.midnight.network/relnotes/support-matrix)
