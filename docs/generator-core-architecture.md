# CredVault Generator Core — Architecture (Step 3)

> Status: **DESIGN (2026-09-05)** — the architecture for the Step-3 generator.
> Exit test: regenerate the hand-built college template (`apps/credvault/step1-degree/`)
> from `schemas/college-degree.yaml` and run its full test matrix on the `undeployed`
> devnet. Stack targets: **compactc 0.31.1, Midnight.js 4.1.1, compact-runtime 0.16.0,
> proof-server 8.1.0** (ARCHITECTURE.md §8 — NOT the March pins).
> Inputs: ARCHITECTURE.md §3/§5/§7/§11/§14–17 · MVP.md · schemas/college-degree.yaml ·
> step1-degree (working reference) · reference/march-2026/dsl (prior attempt; Appendix C).

The generator turns an issuer's **questionnaire answers** into two artifacts that must
never disagree: a **Midnight Compact contract** and its **off-chain runtime twin**
(canonical hashing, issuer runtime, pre-minting, verification core, tests). Both are
emitted from **one intermediate representation** — the Verification Schema AST — so the
on-chain and off-chain halves cannot drift. That is the structural fix for the March
DSL's gap (it generated the .compact half only) and for the March hash-mismatch class
of bug (one generated library is used by issuer, holder, and verifier).

Everything the generator emits is a composition of constructs **already hand-proven**
in step1-degree on the current stack. **Configuration, not code** (ARCHITECTURE.md §3):
the constrained menu is what keeps every generated contract compilable, auditable,
and safe.

---

## 0. Design principles

| # | Principle | Consequence |
|---|---|---|
| P1 | **One IR, two emitters.** The Schema AST feeds the Compact emitter and the TypeScript emitter through a shared lowering pass. | Contract and runtime twin cannot drift (§3.1); gate 3 cross-checks them (§4.3). |
| P2 | **Reproduce, don't invent.** Every emitted construct exists in step1-degree and carries a step-report citation. | No unproven code paths; the exit test is meaningful (§5 P7). |
| P3 | **Opaque anchors only.** The chain stores sealed Bytes<32> + Set<Bytes<32>> — never personal data, never ADT internals (§14 decision 1, §15 ADT checkpoint). | Zero off-chain hash-matching against ledger internals; historic roots for free. |
| P4 | **Zero transactions for holders and verifiers.** | Enforced by construction (no wallet code in emitted holder/verifier files) and by a lint (§4.7). |
| P5 | **Idempotent batching.** Deterministic kdf salts → unchanged cohort reproduces the identical root → the anchor tx is skipped. | Re-batches are no-ops; packages and L2 proofs stay valid (§3.4). |
| P6 | **Every generated project self-verifies before it ships.** | Six gates + three lints run on the generated code itself (§4). |

---

## 1. Questionnaire → Verification Schema model

The issuer never writes a schema. They answer the questionnaire; the platform
normalizes the answers into the **Verification Schema AST** below; the AST is what
both emitters consume. The YAML files in schemas/ (e.g. college-degree.yaml) are
the human-readable form of the same model.

### 1.1 The AST (the generator's single source of truth)

~~~ts
// Produced by:  questionnaire answers → normalized JSON → parse + validate → AST
// Consumed by:  the Compact emitter (§2) AND the runtime-twin emitter (§3)

type Operator = 'gt' | 'lt' | 'gte' | 'lte';

interface Criterion {
  op: Operator;            // questionnaire: >  <  >=  <=
  value: string;           // DISPLAY form as answered, e.g. "3.50" — parsed via scale
}

// ── Q1: Single Direct-Match Variables ───────────────────────────────────────
interface DirectMatchField {
  kind: 'directMatch';
  name: string;                       // e.g. fullName, degree
  type: 'string' | 'uint' | 'boolean' | 'timestamp';
  constant?: string;                  // issuer-constant (same value every record)
  disclosure: ('reveal' | 'equality')[];
}

// ── Q2: Conditional Variables ───────────────────────────────────────────────
interface ConditionalField {
  kind: 'conditional';
  name: string;                       // e.g. gpa
  type: 'uint';
  scale: number;                      // number format: "x"→1, "x.x"→10, "x.xx"→100
  uintBits: 64;                       // v1 fixed; comparisons require Uint<N> (R4)
  disclosure: 'reveal'[];             // a conditional var may ALSO be direct-match (§1.3)
  conditional: {
    operators: Operator[];            // normalized to gte/lte at parse time (§2.4 R6)
    criteria: Criterion[];            // the PRE-MINT set, e.g. >=3.00, >=3.50 (§2.3)
    novelThresholds: 'on-request';    // bound is a PUBLIC circuit parameter
  };
  predicateNames?: { gte?: string; lte?: string; range?: string };  // naming pins (§5 P2)
}

// ── Q3: Multiple-Match Variable Sets ────────────────────────────────────────
interface MatchSetItemField { name: string; type: 'string' | 'uint'; scale?: number }

interface MatchSetField {
  kind: 'matchSet';
  name: string;                       // e.g. courseGrades
  maxItems: number;                   // questionnaire "total sets" answer; 1..65536
  itemFields: MatchSetItemField[];    // e.g. courseCode, courseTitle, credits, grade
  domainTag?: string;                 // hash-domain tag for item leaves (default: name)
  verification: {
    individual: boolean;              // Option 1: each set individually verifiable
    group: boolean;                   // Option 2: verified as a group
    selected: 'individual' | 'group'; // issuer's onboarding choice; BOTH are generated
  };
  disclosure: ('reveal' | 'subset')[];
}

type Field = DirectMatchField | ConditionalField | MatchSetField;

interface VerificationSchema {
  schemaVersion: '0.3';
  name: string;                       // kebab-case, e.g. "college-degree"
  displayName: string;                // issuer identity, e.g. "Penn State University"
  issuerType: string;                 // university | license-board | employer | …
  domainPrefix: string;               // default "credvault:<name>:"; college pins "credvault:"
  packageFormat: string;              // e.g. "credvault-degree/0.3"
  privateStateId: string;             // e.g. "credvaultDegreeState"
  fields: Field[];                    // DECLARATION ORDER = commitment order (§3.3)
  revocation: { enabled: boolean; cadence: 'batch' | 'prompt' };
  issuerRuntime: {
    mode: 'batch';                    // v1: batch-only issuers (ARCHITECTURE §5)
    preMint: ('L1' | 'L2')[];
    novelProofs: 'on-request';
  };
  compliance?: Record<string, unknown>;  // pass-through → generated operator runbook
  fees: { enabled: false };              // §12 seam — passed through, never built
}
~~~

**Naming pins.** Every generated identifier is overridable in the schema; defaults
derive by convention (verify + Min|Max + Capitalize(field), "credvault" + Camel(name)
+ "State", etc.). The college schema pins the hand-built names (`verifyMinGPA`,
`credvaultDegreeState`, `credvault-degree/0.3`, domainPrefix `credvault:`, domainTag
`course`) so the exit test reproduces the reference project exactly (§5 P2/P7).

### 1.2 What each question type means in the verification algebra

| Question type | Meaning | Commitment (off-circuit) | Verification mechanism | Level |
|---|---|---|---|---|
| Q1 direct-match | "Is the value what it claims to be?" | canonical fieldCommit: H(domain ‖ name ‖ value ‖ salt) | holder reveals value+salt; verifier recomputes and compares — no ZK, instant | L1/L3 |
| Q2 conditional | "Prove a predicate about a hidden number" | Compact-compatible persistentCommit: SHA-256(salt ‖ le64(v)) | generated ZK predicate circuit; pre-minted per criterion | L2 |
| Q3 set, individual | "These specific items, from MY set" | per-item leaves → sub-tree → sub-root in master leaf | reveal subset + paths; verifier checks convergence to ONE sub-root — no ZK | L3-subset |
| Q3 set, group | "The whole set, untampered" | docCommit blob in the SAME leaf slot | reveal all; recompute blob hash and compare — no ZK | L3-full |

Rule of thumb (schemas/college-degree.yaml, presentationMechanics): **revealing DATA
⇒ hash-compare (no circuit, instant, free). Proving a PREDICATE about hidden data
⇒ ZK circuit (pre-minted standards; novel predicates on-request).**

### 1.3 The merged-field rule (Q1 ∩ Q2)

The questionnaire counts gpa twice: as direct-match variable #3 and as conditional
variable #1. The parser merges by field name into ONE ConditionalField carrying both
capabilities (disclosure: ['reveal'] + conditional). Validation: a name appearing in
both answers must be numeric (uint with a scale) — E-COND-NONNUM otherwise. This is
exactly the step1-degree reality: the gpa field has one commitment
(persistentCommit<Uint<64>>) that serves BOTH L1 reveal-recompute AND L2 predicates
(§15 research win 1).

### 1.4 Match sets: two verification modes, ONE leaf slot

The pivotal reuse (Steps 2b/2c): **individual** mode commits each set item as a leaf
in a per-record sub-tree and puts the sub-root in the master leaf; **group** mode
commits the whole set as one docCommit blob **in the same 32-byte master-leaf slot**.
The contract never learns which mode is in use — anchors are opaque — so ONE contract
and ONE pipeline serve both. "BOTH options required" therefore means: the generator
always emits both commitment policies and both verification paths; the issuer selects
one at onboarding (issuerRuntime config; per-cohort override, as in runtime.ts
`commitStudent`'s `transcriptMode` option). Subset disclosure exists only in
individual mode; a subset request against a group-mode issuer gets an **honest
refusal** (§17 test matrix), generated into the holder app and portal copy.

### 1.5 Derived disclosure levels

| Level | Generated when | Composition (ARCHITECTURE §3) |
|---|---|---|
| L1 instant check | always | membership(anchor) ∧ non-membership(revocation) ∧ issuer identity — 0.1 s |
| L2 threshold | ≥1 conditional field with criteria | L1 ∧ threshold(field ≥ bound) via pre-minted ZK proof — ~0.15 s added |
| L3 full reveal | always | L1 ∧ documentIntegrity(canonical values) — recompute-and-compare, portal-rendered |
| L3 subset | match set with individual mode | L3 on a revealed subset + sealed-count rendering |

These map to the YAML's disclosureLevels block and land in schema.manifest.json (§3.8)
so the universal apps can render the right UI without knowing the schema.

### 1.6 The Penn State answers, mapped

| Questionnaire answer (user's words) | AST result |
|---|---|
| Q1: 3 direct-match vars — fullName, degree, gpa | DirectMatchField fullName(string), degree(string); gpa merged per §1.3 |
| Q2: 1 conditional var — gpa, operator >=, format x.xx, criteria >=3.00 and >=3.50 | ConditionalField gpa: scale 100, operators [gte], criteria [{gte,"3.00"},{gte,"3.50"}] → scaled bounds 300, 350 |
| Q3: sets up to 100; 4 vars per set (courseCode, courseTitle, credits, grade); BOTH verification options | MatchSetField courseGrades: maxItems 40 (registrar policy for the template; validator accepts up to 65,536 — 100 ⇒ sub-tree capacity 128), itemFields ×4, verification {individual:true, group:true, selected:"individual"} |
| Q4: multi-credential holders (degree + license + more in one app) | platform concern — §1.7; zero contract impact |
| (template) university | issuer-constant identity → displayName "Penn State University"; NOT a per-record committed field (matches both the questionnaire's 3-var answer and the hand-built 3-commit master leaf) |

The complete questionnaire-faithful JSON is Appendix A.

### 1.7 Multi-credential holders (the doctor case)

Multi-credential support is a PLATFORM property, deliberately kept out of the
contract layer:

1. **Per-issuer contracts** (isolation, custom rules, issuer ownership — §6). A
   doctor's degree and license live in two different generated contracts, anchored
   by two different issuers.
2. **The package envelope is issuer-agnostic.** Every generated package carries
   schema id, packageFormat, and contractAddress (§3.8). The universal holder app
   stores N packages and groups them by schema id.
3. **schema.manifest.json is the registry entry.** Universal apps (holder PWA,
   verifier portal) load the per-schema generated verify module and capabilities
   from the manifest — one portal serves every issuer type forever (MVP.md layering).
4. **Presentations are self-describing.** The presentation carries its schema ref;
   the portal dispatches to the right generated verify-core. No cross-contract
   coupling anywhere; holder and verifier still generate zero transactions.

Part P8 (§5) proves this with a second fixture schema (license-authority-mini).

---

## 2. Contract generation

### 2.1 The invariant skeleton (emitted for every schema)

The generated contract is a **fixed skeleton plus one predicate circuit family per
conditional field**. Nothing else varies. The skeleton is byte-stable across schemas
(only the domain prefix interpolates):

~~~compact
pragma language_version >= 0.18;

import CompactStandardLibrary;

// Issuer authority key — sealed at construction, never changes.
export sealed ledger authority: Bytes<32>;

// All valid cohort roots, one per batch. NEVER removed: historic roots stay
// valid, so old proof packages survive later batches (§14 decision 1).
export ledger validRoots: Set<Bytes<32>>;

// Revoked credential IDs (credId = H(credid-domain ‖ masterLeaf), §3.3).
export ledger revoked: Set<Bytes<32>>;

// The issuer's secret, supplied by the issuer runtime at call time.
witness issuerSecretKey(): Bytes<32>;

// Authority derived IN-CIRCUIT, so constructor and guard always agree and no
// off-chain hashing must match anywhere (§14 decision 2).
// persistentHash does NOT clear witness taint → disclose() is required (§2.4 R2).
circuit authorityKey(): Bytes<32> {
  return disclose(persistentHash<Vector<2, Bytes<32>>>(
    [pad(32, "<domainPrefix>authority:"), issuerSecretKey()]));
}

constructor() {
  authority = authorityKey();   // no arguments: roots do not exist yet (§2.4 R7)
}

circuit assertAuthority(): [] {
  assert(authorityKey() == authority, "Caller is not the issuer");
}

// Anchor a new cohort root — ONE call per batch, any cohort size (§14 benchmarks).
export circuit addCohortRoot(root: Bytes<32>): [] {
  assertAuthority();
  validRoots.insert(disclose(root));
}

// Revoke a credential by its credId.
export circuit revokeCredential(credId: Bytes<32>): [] {
  assertAuthority();
  revoked.insert(disclose(credId));
}
~~~

Design notes (all proven in step1-degree):

- **Opaque anchors** (`validRoots`, `revoked` as Set<Bytes<32>>) instead of
  `HistoricMerkleTree`: zero off-chain hash-matching against ledger internals, and
  historic roots = never removing from the set (§14 decision 1, §15 ADT checkpoint).
- **In-circuit authority**: the issuer secret is a witness; its derived public key is
  sealed at construction. No off-chain hashing anywhere in the contract (§14 decision 2).
- **Batch anchoring**: one tx anchors a whole cohort — 5 students or 10,000, same one
  tx (~22–25 s, fixed-overhead dominated; §14 benchmarks).

### 2.2 Question type → privacy-pattern mapping (the 7 patterns, ARCHITECTURE §3)

| AST construct | Patterns used | How |
|---|---|---|
| Q1 direct-match | 1 commitment · 7 selective disclosure (reveal) | per-field salted commitment; reveal + off-circuit recompute |
| Q2 conditional | 1 commitment · 7 selective disclosure (threshold) · non-membership (mirror of 2) | Compact-compatible persistentCommit; predicate circuit asserts bound; `revoked.member` read binds the proof to a live credential |
| Q3 individual | 1 commitment · 2 Merkle membership (off-chain sub-tree) · 7 selective disclosure (subset) | item leaves → sub-root in master leaf; path convergence |
| Q3 group | 1 commitment · 7 selective disclosure (all-or-nothing) | docCommit blob in the same slot |
| skeleton anchor | 2 Merkle membership (off-chain cohort tree) | root anchored on-chain; membership checked off-circuit |
| skeleton revocation | non-membership (mirror of 2) | `revoked` Set read against CURRENT state |
| skeleton authority | 3 nullifier-style derivation | domain-separated persistentHash of a secret; disclosed like a nullifier (public key) |
| — not in v1 — | 4 round-based unlinkability · 5 commit–reveal · 6 shielded tokens | 4: verification is off-chain, nothing to unlink · 5: no two-phase flows · 6: fees parked (§12) — seams only |

### 2.3 Circuit inventory per question type

| AST construct | Exported circuits | Witnesses | Ledger ops | Proving cost (§13–15 constants) |
|---|---|---|---|---|
| skeleton (always) | `addCohortRoot`, `revokeCredential` (+constructor at deploy) | `issuerSecretKey` | `Set.insert` ×2 | ~21.5 s deploy; ~22–25 s/tx, any cohort size |
| conditional field × {gte} | `verifyMin<F>(credId, <f>Commit, bound)` | `<f>Value`, `<f>Salt` | reads `revoked.member` | ~1.7–2.5 s/proof, off-chain, no gas |
| conditional field × {lte} | `verifyMax<F>(credId, <f>Commit, bound)` | same pair | same | same |
| conditional field × {gte,lte} + range | `verify<F>Range(credId, <f>Commit, min, max)` | same pair | same | same |
| Q1 direct-match | **none** | — | — | 0 (reveal + recompute) |
| Q3 individual | **none** | — | — | 0 (sub-tree convergence) |
| Q3 group | **none** | — | — | 0 (docCommit recompute) |

**The criterion list does NOT multiply circuits.** The bound is a PUBLIC circuit
parameter of type Uint<64>, so ONE circuit per (field, direction) serves every
criterion and any novel threshold. The questionnaire's criteria (`>=3.00`,
`>=3.50`) only parameterize the generated pre-mint script — step1-degree's
`const THRESHOLDS = [300n, 350n]` — deciding which proofs are minted into each
package at issuance. Novel thresholds are an on-request issuer operation (~3 s,
§15 research win 2), exactly the YAML's `novelProofs: on-request`.

Predicate circuit template (T-MIN shown; T-MAX flips the comparison, T-RANGE asserts both):

~~~compact
// Generated per conditional field <f> with operator >= (values stored × scale):
witness <f>Value(): Uint<64>;
witness <f>Salt(): Bytes<32>;

export circuit verifyMin<F>(credId: Bytes<32>, <f>Commit: Bytes<32>, bound: Uint<64>): [] {
  const v = <f>Value();
  // recompute the SAME commitment the issuer anchored (§3.6) — L1 and L2 share it
  assert(persistentCommit<Uint<64>>(v, <f>Salt>()) == <f>Commit,
         "<f>/salt do not match the credential commitment");
  assert(v >= bound, "<f> below the required minimum");
  // REQUIRED (§2.4 R1): the ledger read makes the circuit provable AND binds the
  // proof to a live (unrevoked-at-prove-time) credential.
  assert(!revoked.member(disclose(credId)), "credential is revoked");
}
~~~

### 2.4 Generation rules that keep every contract inside compactc 0.31.1

Each rule cites where the hand-built code paid for the knowledge.

| # | Rule | Source |
|---|---|---|
| R1 | **Every exported predicate circuit reads the ledger.** Pure-computation circuits are NOT provable; the `revoked.member(disclose(credId))` read is what makes `verifyMinGPA` provable (and double-serves as a freshness bind). | §15 |
| R2 | **persistentHash does not clear witness taint** — derived public values (the authority key) must be `disclose()`-wrapped at the point of use, or compilation fails with "potential witness-value disclosure must be declared". | §14 gotcha; midnight-docs smart-contract-security |
| R3 | **persistentCommit clears taint** (the salt hides the input), but `Set.member/insert` arguments still need `disclose()` when witness-derived. | privacy-patterns skill; §14 |
| R4 | **Comparisons only on `Uint<N>`, never `Field`.** Threshold bounds and values are `Uint<64>`; scaled integers only (gpa 3.85 → 385). Compact has no floats. | §3 gotcha; §11 |
| R5 | **No strings in-circuit, ever.** String fields are committed OFF-circuit with canonical SHA-256; circuits only ever see Bytes<32> and Uint<64>. In-circuit SHA-256 ≈ tens of thousands of constraints per 64-byte block; kilobytes = millions — forbidden (the size rule, §3). | §3 size rule; schemas yaml |
| R6 | **Operator normalization at parse time.** `> v` → `>= (v+1)`; `< v` → `<= (v−1)` on the scaled integer domain. Only GTE/LTE circuit templates exist (+RANGE = both asserts). | generator design |
| R7 | **Argless constructor.** Roots don't exist at deploy time; the issuer anchors after deploy via `addCohortRoot`. (March's constructor(root, attestation, …) is an anti-pattern.) | §2.7 |
| R8 | **Fixed sizes only.** No variable-length vectors in-circuit; match-set capacity is an OFF-chain tree property (padded binary trees in canonical.ts). Validator caps `maxItems`; sub-tree depth = ceil(log2(maxItems)) is documentation, not circuit shape. | §11; March merkle notes |
| R9 | **Opaque-root anchoring profile.** No `MerkleTree`/`HistoricMerkleTree` ADTs in v1 — `validRoots` is a never-remove Set ⇒ historic roots free. (A future "adt-profile" may emit HistoricMerkleTree + `merkleTreePathRoot` + `checkRoot` when on-chain member-proof evaluation is genuinely required.) | §14 decision 1; §15 checkpoint |
| R10 | `pragma language_version >= 0.18`; `import CompactStandardLibrary` only — exactly what the reference contract compiles under 0.31.1. | step1-degree |
| R11 | **Ledger state = sealed Bytes<32> + Set<Bytes<32>> only.** NEVER a struct of personal data (March's `export struct Credential` put PII-shaped fields on the ledger — the worst anti-pattern in the archive). | §2.7 |
| R12 | **One witness per private input, each with a TS default** (`ctx.privateState.gpa ?? 0n`) so deploy/anchor/revoke calls never need per-record private state. | common.ts |

### 2.5 Generated contract, exit-test target: college-degree.compact

With the college schema's naming pins (`predicateNames.gte: "verifyMinGPA"`,
domainPrefix `credvault:`), the emitter produces the reference contract
construct-for-construct — skeleton of §2.1 plus:

~~~compact
// ═══ L2: ZK predicate — prove gpa >= bound WITHOUT revealing the gpa ═══
// (generated from: field gpa, kind=conditional, scale=100, operators=[gte])
witness gpaValue(): Uint<64>;
witness gpaSalt(): Bytes<32>;

export circuit verifyMinGPA(credId: Bytes<32>, gpaCommit: Bytes<32>, minGpa: Uint<64>): [] {
  const gpa = gpaValue();
  assert(persistentCommit<Uint<64>>(gpa, gpaSalt()) == gpaCommit,
         "GPA/salt do not match the credential commitment");
  assert(gpa >= minGpa, "GPA below the required minimum");
  assert(!revoked.member(disclose(credId)), "credential is revoked");
}
~~~

The acceptance check (§5 P2) is an **inventory diff** against the hand-written
`contracts/degree.compact`: identical ledger declarations, witnesses, and circuit
signatures; identical compiled circuit list in `contracts/managed/degree`. Source
text may differ in comments; the cryptographic equivalence is proven separately by
the golden vectors (§4.3, Appendix B).

### 2.6 What varies across templates — license-authority-mini sketch

A license schema with a second conditional field (ceHours, range) shows the
composition rule — one witness pair and one circuit per (field, direction(s)),
everything else inherited:

~~~compact
// (generated from: field ceHours, kind=conditional, scale=1, operators=[gte,lte], range)
witness ceHoursValue(): Uint<64>;
witness ceHoursSalt(): Bytes<32>;

export circuit verifyCeHoursRange(credId: Bytes<32>, ceHoursCommit: Bytes<32>,
                                  minHours: Uint<64>, maxHours: Uint<64>): [] {
  const h = ceHoursValue();
  assert(persistentCommit<Uint<64>>(h, ceHoursSalt()) == ceHoursCommit,
         "ceHours/salt do not match the credential commitment");
  assert(h >= minHours, "ceHours below the required minimum");
  assert(h <= maxHours, "ceHours above the allowed maximum");
  assert(!revoked.member(disclose(credId)), "credential is revoked");
}
~~~

Note what does NOT change: the skeleton, the match-set handling (a second match set
just adds one more opaque 32-byte slot in the master leaf — §3.3 — invisible to the
contract), and the revocation mechanism (cadence: prompt is a runtime-profile flag +
operator-runbook warning, not a circuit). **Contract shape depends only on
{revocation enabled, the list of (conditional field × direction)}; everything else is
runtime twin.**

### 2.7 What the generator never emits (March anti-patterns, closed)

| March DSL construct | Why it fails today | Generated replacement |
|---|---|---|
| `export struct Credential` on the ledger | PII-shaped fields on-chain; violates the size rule and the data-custody model | opaque anchors only (R11); values live in holder-carried packages |
| `pedersen<[Bytes<256>]>(...)` equality | not in the current stdlib surface; 256-byte strings in-circuit | canonical SHA-256 off-circuit; reveal + recompute (R5) |
| `verifyMinGpa` as a pure computation circuit | NOT provable on the current stack | ledger read in every predicate (R1) |
| unguarded `updateRevocationRoot(newRoot)` | anyone can rewrite revocation state | `assertAuthority()` on every state transition (skeleton) |
| single mutable `merkleRoot` ledger cell | every insert invalidates all prior proofs | `validRoots` never-remove Set ⇒ historic roots (R9) |
| `constructor(root, attestation, revokeRoot)` | roots cannot exist before the first batch | argless constructor + anchor circuit (R7) |
| 32-level unrolled sparse-Merkle non-existence circuit | enormous circuit for something the design gets free | revocation = off-circuit Set read against CURRENT state + in-circuit `revoked.member` inside predicates (§15 revocation semantics) |
| `Bytes<256>` string fields | size-rule violation (millions of constraints for KB inputs) | strings never in-circuit (R5) |
| contract-only generation (no twin) | the off-chain half was hand-improvised → the hash-mismatch wall | one IR, two emitters (§3.1) |

---

## 3. Canonical/commitment scheme generation

### 3.1 One IR, two emitters — the anti-drift invariant

The Compact emitter consumes a small projection of the AST: {name, domainPrefix,
revocation.enabled, [(conditional field, directions)], naming pins}. The TS emitter
consumes the whole AST. Both read from a shared **lowered schema** (a lowering pass
computes, once: domain strings, field order, per-field commitment kinds, circuit and
witness names, privateStateId, criteria × scale → bigint bounds, match-set domainTags
and modes). Because the same lowered values produce the .compact source AND the
canonical.ts source, the two cannot silently disagree — and gate 3 (§4.3) proves it
cryptographically on every generation: vectors computed by the generated TS are
checked against the compiled contract's circuits.

This is the March gap, closed structurally: the DSL generated .compact from an AST
and left the off-chain scheme to be hand-improvised later; here the off-chain scheme
is a first-class emitter output of the same pass.

### 3.2 Domain separation table (emitted into canonical.ts)

| Domain constant | College value (pinned) | Used for |
|---|---|---|
| FIELD | `credvault:field:` | direct-match field commitments |
| LEAF | `credvault:leaf:` | master leaf |
| CREDID | `credvault:credid:` | credential id from master leaf |
| NODE | `credvault:node:` | off-chain Merkle node hash |
| EMPTY | `credvault:empty:` | tree padding leaf |
| KDF | `credvault:kdf:` | deterministic salts |
| ITEM(tag) | `credvault:course:` | match-set item leaves — one tag per set (`domainTag`, default = set name; college pins `course`) |
| DOC | `credvault:doc:` | monolithic (group-mode) docCommit |
| EMPTY-ROOT(tag) | `credvault:empty-course-root:` | defined root of an empty item sub-tree |
| AUTHORITY | `credvault:authority:` | in-circuit authority derivation (contract + nothing else) |

All hashing is SHA-256 over `pad32(domain) ‖ parts…` — OUR canonical scheme,
deliberately NOT Compact's persistentHash (canonical.ts header): the contract stores
opaque anchors, so off-chain hashing only has to agree with itself across issuer,
holder, and verifier — one generated library used by all three. New schemas SHOULD
use `domainPrefix: "credvault:<name>:"` so identically-named fields in different
templates can never collide; the college schema pins `credvault:` to reproduce the
hand-built bytes for the exit test.

### 3.3 Leaf layout (the binding spec)

- **Slot order = schema declaration order.** Each direct-match or conditional field
  contributes one 32-byte commitment slot; each match set contributes exactly one
  32-byte slot (sub-root or docCommit) at its declaration position; the master salt
  is always last.
- **Master leaf** (scheme v3): `masterLeaf = H(LEAF ‖ slot₁ ‖ … ‖ slotₙ ‖ masterSalt)`.
  College: `H(credvault:leaf: ‖ c_fullName ‖ c_degree ‖ c_gpa ‖ courseSubRoot ‖ salt_master)`.
- **credId** `= H(CREDID ‖ masterLeaf)` — the revocation handle and the L2 freshness bind.
- **Anti-cherry-picking**: all proven values must belong to the same leaf (§11); for
  match sets this is strengthened to sub-root convergence (§3.5).
- **Per-field commitment kinds** (chosen by the emitter):

  | Field kind | Commitment | Why |
  |---|---|---|
  | direct-match string | `fieldCommit = H(FIELD ‖ name ‖ normalize(value) ‖ salt)` | canonical; never enters a circuit |
  | conditional uint | `compactCommitUint64(v, salt) = SHA-256(salt ‖ le64(v))` | REAL persistentCommit layout (§3.6) — the SAME commitment serves L1 recompute and L2 circuits |
  | (extension, not v1) hidden-equality string | `compactCommitBytes32(H(value), salt)` | keeps strings out of circuits while enabling a future in-circuit equality predicate |

- **Normalization** (commitments bind EXACT bytes — normalize first): strings →
  utf8/trim/UPPERCASE; numbers → decimal string; scaled integers stored scaled
  (3.85 → 385). Absent values → defined zero encoding (YAML `absentField: zero-leaf`;
  v1 fixtures populate all fields).

### 3.4 Deterministic salts and idempotent batching

`kdfSalt(issuerSecret, recordId, tag) = H(KDF ‖ issuerSecret ‖ recordId ‖ tag)` with
tags: field names for scalar fields; `<domainTag>:<itemKey>` per set item (e.g.
`course:CS101`); `doc` for group-mode doc salts; `master` for the master salt.

Consequences (canonical.ts comment, made a generated-runtime behavior):

1. Re-running a batch on UNCHANGED records reproduces identical commitments → the
   identical cohort root.
2. The generated runtime pre-checks `setHas(validRoots, root)` via the indexer and
   **skips the anchor tx when the root is already present** — a re-batch costs ZERO
   transactions.
3. Existing packages and pre-minted L2 proofs stay valid across later batches
   (historic roots; §16 test row "old packages survive new batches").
4. The issuer secret never leaves the runtime; observers cannot derive salts, so
   commitments hide.

Acceptance probe: part P3 includes an idempotent-re-batch test (second run emits no
tx, same root, packages untouched).

### 3.5 Match-set emission

**Individual mode (granular, scheme v3, Step 2b):**
`itemLeaf = H(ITEM(tag) ‖ norm(f₁) ‖ … ‖ norm(fₖ) ‖ saltᵢ)`; the record's items form
a padded binary tree (`buildTree`, nextPow2, EMPTY_LEAF padding); its root occupies
the master-leaf slot. The package carries a FIXED inventory — per item: values + salt
+ path (~maxItems × ~100 B) — and any subset is assembled at presentation time from
that inventory (nothing is pre-computed per subset; 2⁴⁰ subsets never materialize —
YAML presentationMechanics). Verification recomputes each revealed item's leaf and
walks its path: **every revealed path must converge to the SAME sub-root** — that
convergence IS the anti-cherry-picking guarantee (§16). Zero circuits, zero proving.

**Group mode (monolithic, Step 2c):** canonical doc form = one normalized
`F₁|F₂|…|Fₖ` line per item, sorted, joined with `\n` (order-independent,
size-independent); `docCommit = H(DOC ‖ canonicalDoc ‖ docSalt)` into the SAME
master-leaf slot. All-or-nothing verification; a subset request gets an honest
refusal (§17).

Both paths are ALWAYS generated when `verification.{individual,group}` are both
true; issuerRuntime config selects at onboarding. The contract is identical either
way — mode is commitment policy, not contract shape.

### 3.6 Conditional-field commitments (Compact-compatible layouts)

Probe-verified on compactc 0.31.1 (`contracts/probe.compact` + `src/probe.ts`,
§15 research win 1):

| Compact form | Byte layout |
|---|---|
| `persistentCommit<Uint<64>>(x, rand)` | `SHA-256(rand ‖ le64(x))` |
| `persistentCommit<Bytes<32>>(b, rand)` | `SHA-256(rand ‖ b)` |
| `persistentHash<[Bytes<32>,Bytes<32>]>([l,r])` | `SHA-256(l ‖ r)` |

The generated canonical.ts re-implements these (`compactCommitUint64`,
`compactCommitBytes32`, `compactHashPair`, `le64`) and the generated vectors test
FREEZES the probe regression vectors:

- `pcUint(385, 0x0707…07) = a5c8056f0217cb89918487e23326ee8bf6265b5f6113213eced4748ffe599460`
- `pcBytes(0x0303…03, 0x0707…07) = 46df2f81386a0f40ecbb003e48324a2cb398375847b9759d20347554f65e8063`

One commitment, two consumers: L1 tamper-evidence (JS recompute) and L2 ZK predicates
(in-circuit recompute). A conditional field whose value is REDACTED in a presentation
still carries its `gpaCommit`-style commitment; the leaf recomputes and only an L2
proof may speak about the hidden value (verify-core redaction rule, §3.7).

### 3.7 The emitted runtime twin (file tree)

~~~text
<out>/
  package.json                  # pinned deps (midnight-js 4.1.1, compact-runtime 0.16.0,
                                # wallet-sdk 1.2.0) + onchain-runtime-v3 3.0.0 override
                                # (Step-0 rule) — GENERATED
  tsconfig.json                 # TEMPLATE
  contracts/<name>.compact      # GENERATED (§2)
  src/
    canonical.ts                # GENERATED per schema (§3.2–3.6)
    common.ts                   # GENERATED: witness block from conditional fields;
                                # providers + NetworkConfig wiring (template body)
    network.ts / wallet.ts      # TEMPLATE (verbatim from step1-degree)
    runtime.ts                  # GENERATED: commitRecord() per schema layout + batch/revoke
    premint-l2.ts               # GENERATED: THRESHOLDS from criteria × scale
    l2.ts                       # TEMPLATE: deploy-replay verification + TTL recipes (§16)
    verify-core.ts              # GENERATED: verdict pipeline with schema-shaped branches
    holder.ts                   # GENERATED: presentation assembly (subset iff individual)
    service.ts                  # TEMPLATE: stateless POST /verify on verify-core
  schemas/<name>.resolved.json  # the lowered AST (provenance — what was generated from)
  schema.manifest.json          # capabilities for the universal apps (§3.8)
  test/
    vectors.test.ts             # GENERATED: frozen hash vectors (gate 3)
    simulator.test.ts           # GENERATED: local circuit execution (gate 4)
    e2e.test.ts                 # GENERATED: devnet matrix (gate 6)
    fixtures/cohort.json        # the 5-record fixture (+ monolithic variant)
  docs/RUNBOOK.md               # GENERATED operator runbook (batch, revoke, premint,
                                # compliance notes from the schema's compliance block)
  data/ packages/ presentations/   # runtime output dirs (created empty)
~~~

The universal portal apps (`portal/server.ts`, `public/*.html`) are **copied, not
generated** — they are built once and serve every schema via the manifest registry
(MVP.md layering). The per-schema surface they consume is exactly: verify-core module,
schema.manifest.json, package format.

Key generated fragments:

common.ts witness wiring (one pair per conditional field; R12 defaults):

~~~ts
export const PRIVATE_STATE_ID = 'credvaultDegreeState';   // schema pin

const witnesses = {
  issuerSecretKey: (ctx) => [ctx.privateState, ctx.privateState.issuerSk],
  // one pair per conditional field (college: gpa):
  gpaValue: (ctx) => [ctx.privateState, ctx.privateState.gpa ?? 0n],
  gpaSalt:  (ctx) => [ctx.privateState, ctx.privateState.gpaSalt ?? new Uint8Array(32)],
};
~~~

premint-l2.ts threshold table (criteria × scale → bigints):

~~~ts
const THRESHOLDS = [300n, 350n];
// from schema: gpa.conditional.criteria [{gte,"3.00"},{gte,"3.50"}] × scale 100
~~~

verify-core verdict pipeline (order is part of the spec; regression-tested in gate 6):

1. **Recompute the master leaf** from presented values + salts → else TAMPERED.
   Conditional-field redaction rule: a withheld value uses its presented commitment;
   only an L2 proof may then speak about it. Match-set branch: individual ⇒ per-item
   recompute + single-sub-root convergence; group ⇒ docCommit recompute.
2. Recompute the cohort root from the Merkle path.
3. Indexer read → else CONTRACT_NOT_FOUND.
4. `validRoots` membership → else UNKNOWN_ANCHOR (historic roots pass: never-remove set).
5. `revoked` membership against CURRENT chain state → REVOKED. **Always before L2** —
   §15 revocation semantics: L2 proofs are frozen at mint time; revocation lives in L1.
6. Optional L2: find a pre-minted proof for the requested criterion → else
   L2_UNAVAILABLE; `verifyL2ProofHex` → else L2_INVALID; else VERIFIED.

l2.ts (template, near-verbatim — the §16 TTL saga encoded once and inherited by every
schema): deploy-tx capture and replay (`LedgerState.updateIndex` drops verifier keys
— replay the proven DEPLOY tx instead); `strictProofsOnly` (verifyContractProofs
only); tblock recipes (deploy replay at deployedAt+30min; proof check at mint time);
slim intents at premint (drop dust/zswap offers; keep the contract-call intent only);
`Transaction.deserialize('signature','proof','pre-binding', raw)`.

runtime.ts batch flow (generated `commitRecord` per schema layout; the rest is the
hand-proven flow): ingest cohort (JSON/CSV) → commit per record (mode from config) →
`buildTree` → root → idempotency pre-check (§3.4) → `addCohortRoot` (ONE tx, any
cohort size) → packages + manifest; deploy-with-capture (`deploy-proof.bin` for the
L2 replay); revoke companion. Calibrated constants: anchor ~22–25 s/tx; premint
~1.7–2.5 s/proof; 50-record console CSV batch proven (§17, test-batch50).

### 3.8 Package / presentation / manifest formats

**Package** (envelope `credvault-degree/0.3` for the college schema; trimmed real
example from packages/STU-001.package.json):

~~~json
{
  "schema": "credvault-degree/0.3",
  "issuer": "Penn State University (mock)",
  "cohort": "2027-spring",
  "studentId": "STU-001",
  "values": { "fullName": "Alice Johnson", "degree": "B.S. Computer Science", "gpa": 385 },
  "transcriptMode": "granular",
  "courses": [{ "code": "CS101", "title": "…", "credits": 3, "grade": "A",
               "salt": "74ae…", "path": [{ "sibling": "1345…", "goesLeft": true }] }],
  "courseSubRoot": "ce6d99fe…",                // individual mode
  "docSalt": "…", "docCommit": "9a8e…",        // group mode (instead of courseSubRoot)
  "salts": { "fullName": "…", "degree": "…", "gpa": "…", "master": "…" },
  "gpaCommit": "779967ab…",
  "masterLeaf": "ba8d29a9…",
  "credId": "a8d95db6…",
  "path": [{ "sibling": "…", "goesLeft": true }],
  "cohortRoot": "ef5ecbe4…",
  "contractAddress": "…",
  "l2Proofs": [{ "minGpa": 300, "provenTx": "…hex (~9.9 KB)…", "mintedAt": "…" }]
}
~~~

**Presentation** = package + { presentationType, revealed subset, courseCount,
presentedAt } — assembled by holder code from the fixed inventory (never shared:
the package itself stays on the holder's device).

**schema.manifest.json** (the multi-credential glue — NEW artifact):

~~~json
{
  "schemaId": "college-degree",
  "packageFormat": "credvault-degree/0.3",
  "displayName": "Penn State University",
  "capabilities": {
    "levels": ["L1", "L2", "L3"],
    "subsetDisclosure": true,
    "conditionalFields": [
      { "name": "gpa", "scale": 100,
        "criteria": [{ "op": "gte", "value": 300 }, { "op": "gte", "value": 350 }] }
    ],
    "matchSets": [
      { "name": "courseGrades", "modes": ["individual", "group"],
        "selected": "individual", "maxItems": 40 }
    ]
  },
  "verifyModule": "schemas/college-degree/verify-core.js",
  "contractAddress": "<filled at deploy>",
  "fees": { "enabled": false }
}
~~~

The universal holder app renders per-set subset checkboxes from `matchSets`; the
portal renders the threshold dropdown from `criteria`; verification dispatches
through `verifyModule`. A doctor's app holds college-degree and license packages
side by side — questionnaire requirement Q4 answered at platform level, zero contract
cost. The `fees` block passes through untouched (§12 seam; the portal's paywall hook
is a universal-app feature, not generated code).

---

## 4. Validation pipeline

Generated code must **self-verify before it ships**. Six gates + three lints run on
the generated project itself, all-or-nothing; a failure is a GENERATOR bug, never an
issuer-visible error. Command shape: `cvgen generate schema.yaml --out <dir>`
(gate 1 inline) then `cvgen validate <dir>` (gates 2–6 + lints).

### 4.1 Gate 1 — schema validation (static, during generate)

| Code | Rule |
|---|---|
| E-NAME | schema/field names: kebab-case schemas, camelCase fields; no duplicates (E-DUP); not reserved (E-RESERVED: master, doc, authority, root, salt, credId) |
| E-COND-NONNUM | conditional variables must be uint with a scale; the §1.3 merged-field check |
| E-SCALE | scale ∈ {1,10,100,1000,10000}; every criterion string must parse at the scale ("3.50"×100 → 350); scaled max < 2⁶⁴ |
| E-OP | operators ⊆ {gt, lt, gte, lte}; normalized per R6 |
| E-CRITERIA | criteria non-empty when L2 is in preMint; bounds satisfiable after normalization (min ≤ max across pairs) |
| E-CAP | match-set maxItems ∈ 1..65536; itemFields ≥ 1; item field names unique; scale only on uint items |
| E-MODE | verification.selected ∈ modes marked true; at least one mode true |
| E-THRESH-STRING | threshold/range disclosure on a non-numeric field is rejected (pattern-7 gotcha, R4) |
| E-DOMAIN | domainPrefix ends with ":" and is ≤ 24 bytes (pad32 headroom) |
| E-CONST-TYPE | constant fields: value parses as the declared type |
| W-PROMPT-REVOCATION | issuerType ∈ {license-board, employer} + revocation.cadence: batch → warn "prompt-revocation duty: keep the runtime reachable" (ARCHITECTURE §5) |
| W-CONSTANT | direct-match field marked constant → suggest issuer-level metadata instead |
| W-NO-CRITERIA | conditional field with empty criteria → L2 exists but nothing is pre-minted; every request is on-request |

### 4.2 Gate 2 — compile

`compact compile contracts/<name>.compact contracts/managed/<name>` under compactc
0.31.1. Acceptance: zero errors; artifacts exist (zkir, prover/verifier keys, contract
JS/d.ts). Environment note: the compiler writes its zkir cache under $HOME — run
with full filesystem access (workspace AGENTS.md sandbox quirk; step1-degree scripts
already do this).

### 4.3 Gate 3 — hash-consistency vectors (the March wall, structurally closed)

Generated `test/vectors.test.ts`:

1. **Probe vectors**: the §3.6 frozen constants recomputed by the generated
   canonical.ts (pcUint, pcBytes, hashPair). Catches endianness/layout drift instantly.
2. **Golden schema vectors**: commitments recomputed from `test/fixtures/cohort.json`
   must byte-equal frozen hex (for college: the step1-degree values, Appendix B).
3. **Live cross-check**: the generated predicate circuit is executed LOCALLY with the
   same (value, salt) witnesses and its in-circuit `persistentCommit` result must
   equal `canonical.compactCommitUint64(value, salt)`. The generated TS and the
   generated Compact are forced to agree on every generation — one library, both
   sides, plus a live check (§14 decision 3 made executable).

### 4.4 Gate 4 — local circuit execution (no devnet)

Drive the compiled contract JS via compact-runtime local execution (the mechanism
midnight-js testkit uses; seconds, CI-friendly):

- constructor seals `authority`; `addCohortRoot` with a WRONG issuer secret →
  assert fires; with the issuer secret → root present in `validRoots`.
- `revokeCredential` inserts the credId; double-revoke is a harmless no-op insert.
- predicate circuit: correct (value, salt, bound) passes; value < bound → assert
  ("below the required minimum"); wrong salt → commitment-mismatch assert; revoked
  credId → revoked assert.
- mutant detection: these tests fail loudly if the emitter ever drops an assert or
  the ledger read (feeds §5 P6 mutation testing).

### 4.5 Gate 5 — proving-cost estimate

Static inventory + calibrated constants from the step reports (§13–15):

| Quantity | Calibration | Estimate formula |
|---|---|---|
| deploy | ~21.5 s (incl. constructor proving) | 1 per contract |
| anchor tx | ~22.1 s (real circuit, any cohort size) | 1 per batch — 5→10,000 records, same ONE tx |
| revoke tx | ~24.8 s | per revocation event |
| premint proof | ~1.7–2.5 s, off-chain, no gas | records × Σ conditional fields' criteria (10,000 × 2 ≈ 11 CPU-h ≈ 1 h on 12 cores) |
| package size | STU-001: 24.6 KB (5 courses + 2 proofs); proof = 4,936 B serialized (~9.9 KB hex) | ≈ 2 KB + items × ~0.6 KB + proofs × ~9.9 KB |
| verify SLA | L1 13–15 ms (service) / ~0.1 s (CLI); L2 +~0.15 s | per verification, issuer offline |

The report prints per schema at generation time; WARN when premint CPU exceeds a
configured budget or when a circuit deviates from the small-circuit profile
(proving is fixed-overhead dominated — §14 finding — so the estimate is a checklist,
not a solver: any schema passing gates 1–2 lands in the calibrated envelope).

### 4.6 Gate 6 — generated devnet E2E matrix

Generated `test/e2e.test.ts` runs against the local Docker devnet (node :9944,
indexer :8088/api/v4, proof server :6300). Rows are feature-selected from the AST —
exactly the §14/§15/§16/§17 matrices:

- **always**: valid ✓ · revoked ✗ (current chain state) · tampered field ✗ (1 char) ·
  unknown anchor ✗ · historic roots ✓ (old packages survive new batches) ·
  rectification ✓ (correct → re-anchor → new verifies, old stays revoked) ·
  idempotent re-batch ✓ (no second tx, same root) · authority-negative ✓
- **conditional**: L2 valid per criterion ✓ · below-threshold rejected AT THE CIRCUIT
  ASSERT before proving ✓ · L2_UNAVAILABLE for an unminted criterion ✓ ·
  revoked-after-mint → verdict REVOKED (the stale L2 object may still verify
  mathematically; the L1-first ordering is the spec) ✓
- **matchSet individual**: full reveal ✓ · subset + sealed count ✓ · tampered item ✗ ·
  mixed credentials (another record's item stitched in — convergence failure) ✗
- **matchSet group**: verify ✓ · tampered blob ✗ · subset request → honest refusal ✓

### 4.7 Lints (cheap, run on every validate)

- **zero-transaction lint**: generated holder/verifier/portal sources must not import
  wallet/dust modules — students and verifiers generate ZERO transactions, by
  construction and then by lint (ARCHITECTURE §5, §14 decision 4).
- **statelessness lint**: the verifier path persists nothing but hashes/IDs (MVP
  data-flow rules 1–4); the presentation drop is TTL-only; nothing flows back to the
  issuer.
- **size-rule lint**: only `compactCommitUint64` / `compactCommitBytes32` /
  `compactHashPair` may cross the circuit boundary; no variable-length data is
  hashed in-circuit anywhere in the generated tree (R5 made greppable).

---

## 5. Build-in-parts plan

Each part is independently checkable; acceptance tests are executable, not prose.
Order is dependency order (P_n needs P_<n). Implementation language: TypeScript,
`apps/credvault/generator/`, templates as small pure functions per construct
(every template corresponds to a hand-run step1-degree construct); emitted files are
snapshot-tested.

| Part | Deliverable | Acceptance test |
|---|---|---|
| **P0** | Schema IR + parser + validator (§1.1, §4.1) | Appendix A JSON parses to the snapshot AST; round-trip stable; 15 seeded invalid schemas each rejected with the correct error code |
| **P1** | Canonical emitter (§3.2–3.6) | Generated canonical.ts + fixtures reproduce the Appendix B golden vectors BYTE-EQUAL — granular (STU-001) and monolithic (MON-001) — plus the §3.6 probe vectors |
| **P2** | Compact emitter (§2) | Generated college-degree.compact compiles clean under compactc 0.31.1; inventory diff vs the hand-written degree.compact = ∅ (same ledger decls, witnesses, circuit names+signatures; college naming pins applied); compiled circuit list matches `contracts/managed/degree` |
| **P3** | Runtime twin, L1 core (§3.7: common, runtime, verify-core, holder, service) | On undeployed: batch → anchor → packages → verify: valid ✓ / revoked ✗ / tampered ✗; historic roots ✓; rectification ✓; **idempotent re-batch** (no second tx, same root) ✓ |
| **P4** | Conditional variables E2E (§2.3, §3.6) | Premint mints ≥3.00/≥3.50 per record; L2 verify ok; a 3.60 record fails ≥3.75 AT THE CIRCUIT ASSERT (not minted); L2_UNAVAILABLE for unminted criterion; revoked-after-mint → REVOKED verdict ordering ✓ |
| **P5** | Match sets, both modes (§3.5) | Granular: full ✓ / subset ✓ / tampered item ✗ / mixed-credential convergence ✗ / L2-on-v3 ✓. Monolithic: verify ✓ / tampered blob ✗ / subset → honest refusal ✓ / granular regression ✓ |
| **P6** | Validation pipeline gates (§4) | Pipeline green on the college schema; six seeded GENERATOR mutations — (1) drop the predicate ledger read, (2) drop disclose() on the authority key, (3) emit a string in-circuit, (4) flip le64 endianness, (5) non-deterministic salts, (6) drop a domain separator — each caught by a NAMED gate (2: compile; 1,3: compile or simulator; 4: vectors; 5: e2e idempotency; 6: vectors); cost estimate within 2× of the measured college run |
| **P7** | **EXIT TEST** | From `schemas/college-degree.yaml` alone: generate → validate (all gates) → deploy to undeployed → run the FULL §14+§15+§16+§17 matrix including the 50-record console CSV batch — ALL PASS; golden vectors byte-equal; the copied universal portal verifies a console-issued package via the manifest registry |
| **P8** | Multi-credential proof (the doctor) | Generate `license-authority-mini` (direct-match licenseNo; conditional ceHours range; individual match set; revocation cadence: prompt → W-PROMPT-REVOCATION fires); one holder store keeps degree + license packages; the portal dispatches and verifies both; students/verifiers still zero-tx |

**Exit-test equivalence, defined precisely.** "Byte-for-byte-equivalent" is claimed at
three layers: (L0) source — semantic inventory equality (P2); names may differ unless
pinned, and the college schema pins them. (L1) **commitment bytes — byte-equal**
(P1/P7): same fixture cohort + same dev issuer secret ⇒ identical masterLeaf, credId,
gpaCommit, courseSubRoot/docCommit, cohortRoot. This is the cryptographically
meaningful layer. (L2) behavior — the full test matrix passes on the devnet (P7).

---

## 6. Open questions & future extensions

- **Composite predicates** (March DSL's AND/OR/NOT/THRESHOLD): v1 verification is
  conjunctive at the verify-core layer (anchor ∧ ¬revoked ∧ each requested predicate)
  — which covers every template on the roadmap. OR/THRESHOLD need in-circuit boolean
  composition (design seed: disjunction over commitments with index hiding); defer
  until a template demands it.
- **Hidden equality circuits** (pattern 7 equality without reveal):
  `compactCommitBytes32(H(value), salt)` + one circuit per field — respects the size
  rule (§3.3 extension row). Add when a template asks ("is the license number X?"
  without revealing X).
- **ADT anchor profile** (HistoricMerkleTree + `merkleTreePathRoot` + `checkRoot`):
  revisit only if a future template requires on-chain member-proof evaluation
  (§15 checkpoint); the emitter keeps a profile switch (R9).
- **On-chain receipts + atomic fees** (ARCHITECTURE §10a R1, §12): the schema's fees
  seam is already passed through; a `recordVerification` receipt circuit = predicate
  + ledger write on the same skeleton.
- **Holder-binding nullifiers** (parked, ARCHITECTURE §10): an optional app-generated
  holder secret would add one nullifier circuit to the skeleton; no schema change.
- **Schema versioning/migration**: registry + re-anchor story (Step 4); the
  packageFormat field and schema.resolved.json provenance are the hooks.

---

## Appendix A: Penn State schema JSON (complete, questionnaire-faithful)

This is the concrete output of §1.6 — the questionnaire answers (user's words:
3 direct-match vars; 1 conditional var with >=, x.xx, criteria >=3.00/>=3.50; one
match-set family with BOTH verification options; multi-credential holders) normalized
into the AST's JSON form, with the college template's naming pins applied so the exit
test reproduces step1-degree exactly.

~~~json
{
  "schemaVersion": "0.3",
  "name": "college-degree",
  "displayName": "Penn State University",
  "issuerType": "university",
  "domainPrefix": "credvault:",
  "packageFormat": "credvault-degree/0.3",
  "privateStateId": "credvaultDegreeState",
  "fields": [
    {
      "kind": "directMatch",
      "name": "fullName",
      "type": "string",
      "disclosure": ["reveal"]
    },
    {
      "kind": "directMatch",
      "name": "degree",
      "type": "string",
      "disclosure": ["reveal", "equality"]
    },
    {
      "kind": "conditional",
      "name": "gpa",
      "type": "uint",
      "scale": 100,
      "uintBits": 64,
      "disclosure": ["reveal"],
      "conditional": {
        "operators": ["gte"],
        "criteria": [
          { "op": "gte", "value": "3.00" },
          { "op": "gte", "value": "3.50" }
        ],
        "novelThresholds": "on-request"
      },
      "predicateNames": { "gte": "verifyMinGPA" }
    },
    {
      "kind": "matchSet",
      "name": "courseGrades",
      "maxItems": 40,
      "domainTag": "course",
      "itemFields": [
        { "name": "courseCode", "type": "string" },
        { "name": "courseTitle", "type": "string" },
        { "name": "credits", "type": "uint", "scale": 1 },
        { "name": "grade", "type": "string" }
      ],
      "verification": {
        "individual": true,
        "group": true,
        "selected": "individual"
      },
      "disclosure": ["reveal", "subset"]
    }
  ],
  "revocation": { "enabled": true, "cadence": "batch" },
  "issuerRuntime": {
    "mode": "batch",
    "batchTriggers": ["graduation-cohort", "registrar-correction"],
    "preMint": ["L1", "L2"],
    "novelProofs": "on-request"
  },
  "compliance": {
    "ferpa": { "role": "school-official" },
    "fcra": { "consent": "naturally-captured" },
    "gdpr": { "credvaultHoldsNoPII": true, "deletion": "break-link", "dpia": "issuer-obligation" },
    "auditLog": { "immutable": true, "records": "hashes-and-ids-only" }
  },
  "fees": { "enabled": false }
}
~~~

Questionnaire-to-JSON trace (every answer accounted for):

| Answer | Where it landed |
|---|---|
| "3 direct-match variables: fullName, degree, gpa" | fields[0], fields[1], and fields[2] (gpa merged per §1.3 — it is ALSO the conditional var) |
| "1 conditional variable; operator > < >= <= → >=; number format x.xx; name gpa; criteria >=3.00, >=3.50" | fields[2].conditional: operators [gte]; scale 100 ("x.xx"); criteria parsed to scaled bounds 300/350 at lowering |
| "sets up to 100; 4 vars per set; BOTH options" | fields[3]: maxItems 40 for this template (validator accepts ≤ 65,536 — 100 ⇒ capacity 128, depth 7); itemFields ×4; verification.individual AND .group both true; Penn State selects individual (granular) |
| "multi-credential holders (doctor: degree + license + more)" | nothing in the contract — §1.7 platform layer (manifest + registry + universal apps); proven in P8 |
| university identity | displayName (issuer-constant metadata, not a committed field — matches the hand-built 3-commit master leaf; the YAML's "5 claims" reconcile as 4 committed fields + 1 issuer identity) |

## Appendix B: exit-test golden vectors

Fixtures: `data/cohort.json` (5 records, ids STU-001…STU-005, cohort "2027-spring",
granular) and the monolithic variant; dev issuer secret
`sha256(pad32("credvault:dev-issuer-sk:"))` (step1-degree common.ts — generated
projects accept an injected secret; the fixture uses the dev one so bytes match).

Frozen values currently committed in step1-degree (the generated project's vectors
test must reproduce these byte-equal from the same fixtures):

| Vector | Value (hex) |
|---|---|
| STU-001 masterLeaf | `ba8d29a952e0eb40d44f61795aa7b8ca25f96c9774331b23f65f8e647beed485` |
| STU-001 credId | `a8d95db6c84772c3869edd3877ce126b9fa0fc7c727f1c895ecbfa1e7c08e5a6` |
| STU-001 gpaCommit (persistentCommit<Uint<64>>(385, kdfSalt)) | `779967ab2faf5473184e30d67f977b7a11ef5982016fbda08c62872454be18be` |
| STU-001 courseSubRoot (5 courses) | `ce6d99fedeedb86064579cc5e76beb095b09191b6c0466c636bc31850876ca2a` |
| STU-001 cohortRoot (as committed in packages) | `ef5ecbe47f36421872dce598471f0bccbea476731bfb76cb0c33b69daee29414` |
| MON-001 docCommit (group mode, 4 courses) | `9a8e08726f9538517b2ada6d35edda2a7a38486ed0e9467a7ffc359d976aae30` |
| MON-001 masterLeaf | `518632403ca58d5436aaae6892e2b0a43fe3f1811040191818dc9a1b5464d5d4` |
| MON-001 credId | `9610173e62b64a339caf7def127a08a00df0f41ab687157efba4c18886dc244f` |
| probe: pcUint(385, 0x0707…07) | `a5c8056f0217cb89918487e23326ee8bf6265b5f6113213eced4748ffe599460` |
| probe: pcBytes(0x0303…03, 0x0707…07) | `46df2f81386a0f40ecbb003e48324a2cb398375847b9759d20347554f65e8063` |

Byte-equality requires the same fixture inputs and the same issuer secret — both are
committed in the repo, so the vectors are deterministic and CI-reproducible. If the
fixtures ever change, the vectors are regenerated and reviewed in the same commit.

## Appendix C: March DSL — ideas kept, gaps closed

| March DSL asset | Verdict |
|---|---|
| Validate-first parser with error codes and JSON-pointer paths | **Kept** as gate 1's shape (§4.1), with our rule set |
| Typed AST between schema and emitters | **Kept** — but our AST models the questionnaire (direct-match / conditional / match-set), not raw proof primitives |
| Combinatorial conformance suite (16 case schemas) | **Kept as an idea** — reborn as the seeded-mutation suite (P6) and the feature-selected E2E matrix (§4.6) |
| `public_min` / `public_max` concept | **Kept** in spirit: the threshold bound is a PUBLIC circuit parameter (§2.3) |
| Contract-only generation (no off-chain twin) | **Closed** — one IR, two emitters (§3.1) |
| Pure-computation predicate circuits | **Closed** — R1: every predicate reads the ledger (§15 provability finding) |
| PII struct on the ledger; unguarded admin circuit; single mutable root; constructor-time roots; sparse-Merkle non-existence unrolled 32 levels; pedersen/Bytes<256> strings | **Closed** — §2.7 anti-pattern table (R5, R7, R9, R11, skeleton guards, off-circuit revocation reads) |
| March pins (compactc 0.29, midnight-js 3.1.0, indexer v3) | **Not reused** — every pattern re-verified on compactc 0.31.1 / midnight-js 4.1.1 (§13 workaround-obsolescence table; onchain-runtime-v3 3.0.0 override carried into every generated package.json) |

---

*End of document. When Step-3 implementation changes decisions here, update this file
and ARCHITECTURE.md §7 together.*




