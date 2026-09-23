# Module 3: The Compact Language — Contracts That Keep Secrets

> Time: ~6 hours | Prerequisites: Modules 1–2 (you can bring up the devnet; you know what the proof server does); basic TypeScript reading skills.

Compact is the language Midnight contracts are written in. It looks like a shy cousin of TypeScript, but it compiles to something no normal language targets: **zero-knowledge circuits**. This module teaches Compact from zero, using the real, working `degree.compact` — the 76-line contract that runs the whole CredVault degree flow — as the spine. Every concept is demonstrated on code you will compile, break, and fix in the lab.

## Learning objectives

When you finish this module, you can:

- **Explain** what a Compact contract actually is: public ledger state + circuits + witnesses, and what the compiler emits for each.
- **Read** `degree.compact` line by line and defend every design choice in it.
- **Choose** the right ledger ADT (`Counter`, `Map`, `Set`, `List`, `MerkleTree`, `HistoricMerkleTree`) for a given state requirement.
- **Explain witness taint**, predict where `disclose()` is required, and read the compiler's "potential witness-value disclosure" error like a pro.
- **Distinguish** provable from pure circuits, and explain why a circuit that never touches the ledger gets no proving keys.
- **Use the 7 privacy patterns as design vocabulary** — given a product requirement, name the pattern(s) that satisfy it.
- **Implement** the constructor/authority-gating idiom (sealed ledger + in-circuit key derivation + guard circuit).

## 1. Concepts from scratch

### 1.1 What a contract really is

Forget "smart contract" as a vague blob of blockchain code. A Compact contract has exactly **three ingredients**, and keeping them straight is 80% of understanding Midnight:

```
┌──────────────────────────────────────────────────────────────┐
│ 1. LEDGER — the PUBLIC state.                                │
│    Lives on-chain. Everyone can read it (via the indexer).   │
│    In degree.compact: authority, validRoots, revoked.        │
│    Rule of thumb: if it goes here, it is public forever.     │
├──────────────────────────────────────────────────────────────┤
│ 2. CIRCUITS — the RULES.                                     │
│    Functions that read/write the ledger. Each exported one   │
│    compiles to a ZK circuit: callers prove "I ran this       │
│    correctly" instead of the chain re-running it.            │
├──────────────────────────────────────────────────────────────┤
│ 3. WITNESSES — the SECRETS.                                  │
│    Declared in Compact, IMPLEMENTED in TypeScript. They feed │
│    private data into a circuit at proving time. Their values │
│    never touch the chain unless you explicitly disclose().   │
└──────────────────────────────────────────────────────────────┘
```

The mental model that makes everything click: **the ledger is the world's memory, circuits are the world's rules, witnesses are your whispered secrets.** A transaction says: "here is a proof that I followed the rules, using secrets you cannot see, producing this public state change." The chain verifies the proof and applies the state change — without ever learning the secrets.

What the compiler emits (you saw the directory in Module 2; now with meaning):

| Artifact | What it is | Who uses it |
|---|---|---|
| `contract/index.js` + `index.d.ts` | Your contract as a JS/TS class, plus `ledger()` to decode on-chain state | Your DApp (Midnight.js) |
| `keys/<circuit>.prover` | Binary key the **proof server** needs to prove that circuit | Proof server |
| `keys/<circuit>.verifier` | Binary key the **chain** needs to verify that proof | The ledger/nodes |
| `zkir/<circuit>.zkir` / `.bzkir` | ZK intermediate representation — the circuit itself, in prover-speak | Proof server |
| `compiler/contract-info.json` | Manifest: compiler/language/runtime versions + per-circuit `pure`/`proof` flags | Tooling, you when debugging |

Note who holds what: the **prover key leaves with you** (it is used next to your secrets), the **verifier key goes on-chain**. That split is the whole privacy architecture in one sentence.

### 1.2 `degree.compact` — the complete walkthrough

Here is the entire contract, in annotated sections. Open the real file (`apps/credvault/step1-degree/contracts/degree.compact`) and follow along.

```compact
pragma language_version >= 0.18;

import CompactStandardLibrary;
```

Every file starts with a **language-version pragma** (a minimum, no patch number — check yours with `compact compile --language-version`; compactc 0.31.1 supports 0.23.0) and the **standard library import**, which brings `Set`, `Map`, `Counter`, `MerkleTree`, `persistentHash`, `persistentCommit`, `pad`, and friends into scope.

```compact
// Issuer authority key — sealed at construction, never changes.
export sealed ledger authority: Bytes<32>;

// All valid cohort roots (one per graduation batch).
export ledger validRoots: Set<Bytes<32>>;

// Revoked credential IDs.
export ledger revoked: Set<Bytes<32>>;
```

The **ledger**: three fields of public, on-chain state.

- `export` = readable from your TypeScript DApp code (via the compiled `ledger()` decoder).
- `sealed` = settable **only in the constructor** — immutable after deployment. The compiler statically rejects any exported circuit that could write it.
- `Bytes<32>` = a fixed 32-byte array. `Set<Bytes<32>>` = an on-chain set of unique 32-byte values with `insert`/`member`/`remove`.

Notice what is NOT here: no names, no GPAs, no Merkle trees of students. Just 32-byte anchors. The comment block at the top of the real file states the design: *the chain stores ONLY opaque 32-byte anchors — never personal data.* (Why opaque anchors instead of the on-chain `HistoricMerkleTree` ADT is a story told in section 1.4.)

```compact
// The issuer's secret, supplied by the issuer runtime at call time.
witness issuerSecretKey(): Bytes<32>;
```

The first **witness**: a declaration (no body!) saying "at proving time, someone local will supply a 32-byte secret." The body lives in TypeScript — in `src/common.ts` it reads the secret from the caller's **private state** (Module 4 covers that machinery):

```typescript
issuerSecretKey: (ctx) => [ctx.privateState, ctx.privateState.issuerSk],
```

```compact
// Derive the authority key from the secret. In-circuit, so the constructor
// and the guard always agree — no off-chain hashing to match.
circuit authorityKey(): Bytes<32> {
  // The authority key is a PUBLIC key: disclosing the hash reveals nothing
  // about the secret (same reasoning as publishing a nullifier).
  return disclose(persistentHash<Vector<2, Bytes<32>>>([pad(32, "credvault:authority:"), issuerSecretKey()]));
}
```

The heart of the contract — unpack it piece by piece:

- `circuit authorityKey(): Bytes<32>` — an **internal helper circuit** (no `export`), so it can only be called by other circuits, never directly by a transaction.
- `pad(32, "credvault:authority:")` — turns the string into a 32-byte zero-padded value. This is **domain separation**: the hash input is namespaced so the same secret hashed for a *different* purpose yields a different output. Get in this habit from day one.
- `persistentHash<Vector<2, Bytes<32>>>([...])` — SHA-256-based hash of the 2-element vector `[domain, secret]`. "Persistent" = stable across compiler upgrades (safe to store); the alternative, `transientHash`, is cheaper but may change between compiler versions — never store it.
- `disclose(...)` — the value is witness-derived (tainted), and this helper's result gets written to the ledger, so the compiler demands an explicit disclosure marker. **This exact line is the subject of the war story in section 1.5 — and of Lab 2.2, where you'll watch the compiler reject the version without it.**
- Why derive the key **in-circuit** at all? Because then the constructor and the authority guard share *one* function and can never disagree, and nobody has to reproduce Compact's hash byte-for-byte off-chain. (The project's predecessor spent *weeks* matching JS hashing to on-chain hashing. This design makes that class of bug impossible. ARCHITECTURE.md §14, decision 2.)

```compact
constructor() {
  authority = authorityKey();
}
```

The **constructor** runs exactly once, inside the deploy transaction. It seals the issuer's authority key into the ledger. From that moment, "the issuer" *is* "whoever can produce the secret that hashes to this value" — and they prove it in zero knowledge on every privileged call, never revealing the secret.

```compact
// Guard: only the issuer may proceed.
circuit assertAuthority(): [] {
  assert(authorityKey() == authority, "Caller is not the issuer");
}
```

The **guard**. `assert(condition, "message")` is Compact's *only* error-handling mechanism — there is no try/catch; a failed assert aborts the transaction. `[]` is the unit (empty-tuple) return type: this circuit returns nothing. Because the check runs in-circuit, the caller proves "my secret hashes to the sealed key" without the secret appearing anywhere public.

```compact
// Anchor a new cohort root (one call per graduation batch).
export circuit addCohortRoot(root: Bytes<32>): [] {
  assertAuthority();
  validRoots.insert(disclose(root));
}

// Revoke a credential by its credential ID.
export circuit revokeCredential(credId: Bytes<32>): [] {
  assertAuthority();
  revoked.insert(disclose(credId));
}
```

The two **exported circuits** — transaction entry points. Both follow the same shape: guard first, then one ledger write. The `disclose(root)` is required because `root` is an exported-circuit parameter (tainted — section 1.5) and `Set.insert` publishes its argument.

The product meaning: `addCohortRoot` anchors one Merkle root covering an **entire graduation class** (5 students or 10,000 — one call, one transaction). `revoked` gets one 32-byte credential-ID hash per revoked degree. And `validRoots` is *never removed from* — historic roots stay valid, so a diploma packaged in May still verifies after December's batch is anchored. That is the membership (∈ validRoots) ∧ non-membership (∉ revoked) design from the architecture doc, in five lines.

```compact
// ═══ L2: ZK predicate — prove GPA >= min WITHOUT revealing the GPA ═══
witness gpaValue(): Uint<64>;
witness gpaSalt(): Bytes<32>;

export circuit verifyMinGPA(credId: Bytes<32>, gpaCommit: Bytes<32>, minGpa: Uint<64>): [] {
  const gpa = gpaValue();
  assert(persistentCommit<Uint<64>>(gpa, gpaSalt()) == gpaCommit, "GPA/salt do not match the credential commitment");
  assert(gpa >= minGpa, "GPA below the required minimum");
  assert(!revoked.member(disclose(credId)), "credential is revoked");
}
```

The crown jewel — the first true zero-knowledge predicate in the project. Read it as a verifier's checklist:

1. `gpaValue()` / `gpaSalt()` — the holder's *actual* GPA and its commitment salt arrive via witnesses (private inputs; `const gpa = ...` — Compact locals are all `const`, no `let`).
2. `persistentCommit<Uint<64>>(gpa, gpaSalt()) == gpaCommit` — recompute the commitment *in-circuit* and demand it equals the commitment in the credential. This binds the private GPA to the public credential: you cannot claim a GPA of 3.9 when the credential committed to 3.5.
3. `gpa >= minGpa` — the threshold check. Comparisons only work on `Uint<N>`, never `Field` (more in section 1.3).
4. `!revoked.member(disclose(credId))` — a **ledger read**. It binds the proof to a live, unrevoked credential… and it has a second, sneakier job: it makes the circuit provable at all. That story is section 1.6.

The proof that comes out: "the credential with this commitment contains a GPA ≥ the verifier's minimum, and that credential is not revoked" — with the GPA itself never revealed to anyone, including the chain.

### 1.3 The type system in ten minutes (plus a real compiler error)

Compact is statically and strongly typed. The five you'll use daily:

| Type | What it is | Notes |
|---|---|---|
| `Field` | A field element (the ZK system's native number) | No comparisons (`<`, `>=`) allowed; arithmetic wraps mod the field prime |
| `Uint<N>` | N-bit unsigned integer (also `Uint<0..MAX>`) | The *only* type comparisons work on |
| `Bytes<N>` | Fixed N-byte array | `Bytes<32>` is your hash/commitment workhorse |
| `Boolean` | `true`/`false` | `&&`, `||`, `!` — short-circuiting |
| `Opaque<"string">` / `Opaque<"Uint8Array">` | A blob the circuit sees only as a hash, but TypeScript sees in full | For passing strings/byte arrays through circuits without parsing them in-circuit |

Plus `Vector<N, T>` (fixed-size array — `Vector<2, Bytes<32>>` is how you hash two values together), `Maybe<T>`, `Either<L,R>`, enums, structs, and tuples.

Four rules that bite beginners, with the scars to prove them:

1. **There is no division or modulo operator.** Addition, subtraction, multiplication only. (Think about why: circuits must be deterministic and cheap; division in a finite field is neither.)
2. **Arithmetic widens.** `x + y` where both are `Uint<64>` has type `Uint<0..(2^65-2)>` — it does not fit back into `Uint<64>` without a cast. This is not theoretical; here is the *actual* compiler error from a two-line probe contract with `return x + x;`:

   ```
   Exception: pure-probe.compact line 10 char 3:
     mismatch between actual return type Uint<0..36893488147419103231> and declared return type
     Uint<64> of circuit double
   ```

   Fix: cast at the end — `return (x + x) as Uint<64>;` Casts use the `as` keyword (no angle brackets).
3. **Comparisons need `Uint`.** `gpa >= minGpa` compiles because both are `Uint<64>`. On a `Field` it is a type error — cast first: `(f as Uint<64>) > 0`.
4. **Loops must have compile-time-known bounds** (`for (const i of 0..5)`), because the compiler unrolls them into circuit gates. No `while`, no recursion, no `break` — unbounded work cannot be turned into a fixed circuit.

### 1.4 Ledger ADTs — choosing your on-chain data structures

The standard library gives you six abstract data types for ledger state:

| ADT | Operations | On-chain visibility | Use it for |
|---|---|---|---|
| `Counter` | `increment`, `decrement`, `read`, `lessThan` | All public (amounts visible) | Counts: rounds, supply, nonces |
| `Map<K, V>` | `insert`, `lookup`, `member`, `remove` | Keys AND values public | Public key-value state |
| `Set<T>` | `insert`, `member`, `remove` | Elements public | Membership registries of *opaque* values |
| `List<T>` | `pushFront`, `popFront`, `head` | Elements public | Ordered logs/queues |
| `MerkleTree<N, T>` | `insert`, `checkRoot` | **`insert` HIDES the leaf** (only a hash lands on-chain) | Private membership sets |
| `HistoricMerkleTree<N, T>` | same + root history (`checkRoot` accepts *past* roots) | Same hiding | Private membership where old proofs must keep working |

The decision tree that covers 95% of cases:

- Public counter? → `Counter`.
- Public lookup table? → `Map`.
- "Is X registered?" where X is already a hash? → `Set`.
- "Prove membership without revealing *which* member"? → `HistoricMerkleTree` + an off-chain path, verified with `merkleTreePathRoot` + `checkRoot`.
- Single immutable config value? → `sealed ledger` field.

> **Story with a moral — why degree.compact uses `Set<Bytes<32>>` and NOT `HistoricMerkleTree`.** The textbook design for "5,000 issued diplomas" is an on-chain Merkle tree: private leaves, log-size proofs. The team tried the ADT path in the project's first life and hit the wall that ate weeks: to verify a Merkle path *in-circuit*, the off-chain JavaScript that builds the tree must reproduce Compact's internal hashing **byte-for-byte**, and that layout was (at the time) undocumented and version-fragile — the "hash-matching research" saga in the architecture doc. The Step-1 redesign asked: what do we actually need on-chain? Answer: an opaque 32-byte root per cohort, checked for equality. A `Set` of opaque roots gives exactly that — plus historic roots for free (never remove), full control of hashing (our own documented SHA-256 scheme in `src/canonical.ts`), and zero ADT coupling. The privacy cost is nil: a `Set` reveals its elements, but the elements are *hashes*, which reveal nothing. **Moral: pick the ADT for the guarantee you actually need, not the one the textbook diagram shows. And never let two codebases implement the same hash independently — one canonical lib, used by everyone.**

Capacity note for when you do need the ADTs: `HistoricMerkleTree<N, T>` holds 2^N leaves (N=16 → 65,536; N=20 → ~1M) and proofs are N hashes long. And one caveat from the pattern book: if the possible leaf values are few and guessable, an observer can brute-force-verify guesses against the tree — use *commitments* (hashed with randomness) as leaves, not raw values.

### 1.5 `disclose()` and witness taint — the compiler as your privacy bodyguard

Time for the single most important — and most misunderstood — mechanism in Compact.

**Privacy is the default.** Every value that comes out of a `witness`, every parameter of an `export`ed circuit, and every constructor parameter is **tainted** — tagged by the compiler as "potentially private." Taint propagates through arithmetic, casts, struct construction, and circuit calls. The compiler (an abstract interpreter the team calls the *Witness Protection Program*) tracks every tainted value, and when one reaches a **public boundary** — a ledger write, an ADT argument, a conditional with ledger writes inside, an exported return, a cross-contract call — without an explicit `disclose()`, **compilation fails**.

`disclose()` itself does *nothing* at runtime. It is not encryption, not hashing, not a function in any meaningful sense — it is you, the programmer, signing a form that says: "I understand this exact value becomes public here, and I intend that."

The rules, condensed:

| Situation | `disclose()` needed? |
|---|---|
| Write a tainted value to the ledger (`x = ...`, `set.insert(...)`, `map.lookup(...)`) | **Yes** |
| `if (tainted_boolean)` around ledger writes | **Yes** (the branch choice itself leaks a bit) |
| `return` a tainted value from an `export`ed circuit | **Yes** |
| Pure internal computation on tainted values | No |
| Pass tainted values to internal (non-exported) helper circuits | No |
| Feed tainted values into `persistentCommit` | No — **commitment clears taint** (it cryptographically hides its input) |
| Feed tainted values into `persistentHash` | **The OUTPUT is still tainted** — a hash could be brute-forced, so the compiler does not trust it as hiding |

That last pair is the one everyone gets wrong, and it is the actual war story from this codebase.

> **Story with a moral — the `authorityKey` disclosure (ARCHITECTURE.md §14).** The first draft of the contract computed the authority key exactly as now, but *without* the `disclose()`:
>
> ```compact
> return persistentHash<Vector<2, Bytes<32>>>([pad(32, "credvault:authority:"), issuerSecretKey()]);
> ```
>
> "It's hashed!" the author thought. "The secret is safe, surely the compiler is happy." The compiler was not happy:
>
> ```
> Exception: degree-broken.compact line 42 char 13:
>   potential witness-value disclosure must be declared but is not:
>     witness value potentially disclosed:
>       the return value of witness issuerSecretKey at line 31 char 1
>     nature of the disclosure:
>       ledger operation might disclose a hash of the witness value
>     via this path through the program:
>       the argument to persistentHash at line 38 char 10
>       the right-hand side of = at line 42 char 13
> ```
>
> Read that error like a detective novel: **who** is tainted (the witness return at line 31), **what** might leak (a hash of it — brute-forceable in principle, so the compiler counts it), and **the exact path** (into `persistentHash` at line 38, out to the ledger write at line 42). The fix is one word — `return disclose(persistentHash<...>(...))` — and it is *safe* precisely because the authority key is a public key: publishing it reveals nothing about the secret, same reasoning as publishing a nullifier. **Morals: (1) hash ≠ hidden, as far as the compiler is concerned — `persistentCommit` clears taint, `persistentHash` does not; (2) `disclose()` is a conscious act, and the error message always tells you the source and the path — read it before reaching for random `disclose()`s; (3) disclose at the disclosure point, never at the source: wrapping the witness call itself would mark every downstream use public.**

One more subtlety worth saying out loud: **taint is not visibility.** Exported-circuit parameters are private inputs to the proof (`root` in `addCohortRoot` never appears on-chain *as a parameter*). A value only becomes publicly visible if your code carries it across a public boundary. The compiler is watching possibilities, not certainties — which is why it sometimes complains about values "that obviously don't leak." Better a false positive you dismiss with one `disclose()` than a true positive that ships.

### 1.6 Provable vs pure circuits — why `verifyMinGPA` reads the ledger

Compile a contract and inspect `contract-info.json`: every circuit carries two flags, `pure` and `proof`. We probed the compiler with three tiny circuits to make the matrix concrete (you'll reproduce this in the lab's stretch exercise):

| Circuit | Body touches… | `pure` | `proof` | Keys emitted? |
|---|---|---|---|---|
| `export pure circuit double(x)` | nothing (computation only) | true | **false** | No |
| `export circuit bump()` | the ledger (`count.increment`) | false | **true** | `bump.prover` + `bump.verifier` |
| `export circuit commitX(rand)` | a witness + `persistentCommit`, **no ledger** | false | **false** | No |

Two lessons in one table:

1. **`pure` is a promise** ("no ledger, no witnesses, no side effects") that the compiler checks; pure circuits are inlined helpers and get no proving keys.
2. **A circuit that never touches the ledger is not provable — even if it uses witnesses, even if it's exported.** No proving keys are generated for it. Why? A ZK proof in a transaction attests "this circuit ran correctly *against this ledger state*." No ledger access → no state transition to bind the proof to → nothing on-chain to prove. (The proof server literally has no `proof: true` circuit to work on.)

Now the design punchline from ARCHITECTURE.md §15: look at `verifyMinGPA`'s last line — `assert(!revoked.member(disclose(credId)), ...)`. That ledger read does **double duty**: it binds the proof to a live, unrevoked credential *and* it is what makes the circuit provable at all. Without it, the world's most beautiful GPA-threshold circuit would compile to… no keys, no proof, no product. **When you design a ZK predicate circuit, always ask: what is its ledger anchor?** (Membership read, revocation read, nullifier insert — something.)

### 1.7 The 7 privacy patterns — your design vocabulary

Privacy engineering on Midnight is not improvisation; it is composition from a canonical menu (the midnight-expert `privacy-patterns` skill is the authoritative enumeration — CredVault's architecture doc builds its whole "verification algebra" on it). Learn these seven the way you learned design patterns in OOP: by name, by shape, by when-to-use.

**1. Commitment — "hide a value now, prove about it later."**
Shape: `persistentCommit<T>(value, randomSalt)` → 32 bytes that bind you to `value` but reveal nothing. Salt is mandatory and never reused.
When to use: any value that must live on-chain (or in a package) but stay secret until *you* choose to open it.
In CredVault: the GPA field commitment — one `persistentCommit<Uint<64>>(gpa, salt)` serves both L1 tamper-evidence (recompute-and-compare off-chain) and L2 ZK predicates (recompute-and-compare in-circuit).

**2. Merkle membership — "prove ∈ the set, without saying which element."**
Shape: leaves committed into a tree; a log-depth path recomputes the root; `checkRoot` (or an off-chain equivalent) verifies it.
When to use: "is this credential/person/key in the issued set?" at scale, with privacy about *which* member.
In CredVault: the cohort tree — but computed **off-chain** with our own documented hash scheme, anchored as an opaque root (section 1.4's story). The on-chain `HistoricMerkleTree` ADT is the alternative when you need the membership check itself evaluated in-circuit.

**3. Nullifier — "this action can happen once, and no one can tell by whom."**
Shape: `persistentHash([pad(32, "app:purpose:"), secret, context])` — deterministic per secret, so a `Set` membership check catches reuse; reveals nothing about the secret. **Domain-separate every nullifier**, and use a *different* domain than any commitment derived from the same secret, or observers can link them.
When to use: double-spend/double-vote/double-claim prevention, replay protection.
In CredVault: the revocation `Set` is a cousin — credIds are deterministic hashes; the chain learns "this hash is dead" and nothing else.

**4. Round-based unlinkability — "my many actions don't add up to a profile."**
Shape: derive per-round keys (`persistentHash([domain, round, secret])`), rotate the on-chain authority each transaction; a `Counter` tracks the round.
When to use: repeated protocol interactions (voting rounds, periodic check-ins) where correlating them is itself a leak.

**5. Commit–reveal — "everyone locks their choice, then everyone opens."**
Shape: phase 1 store `persistentCommit(choice, salt)`; phase 2 reveal `choice + salt` and verify in-circuit.
When to use: sealed-bid auctions, simultaneous moves, anything where seeing others' inputs early would corrupt the game.

**6. Shielded tokens — "value moves without a public paper trail."**
Shape: the Zswap machinery under Midnight's shielded balances — commitments into trees, nullifiers on spend (you met it in Module 2: DUST fees are paid this way).
When to use: private value transfer. Out of scope for CredVault v1, but it is the reason fee payment doesn't dox the payer.

**7. Selective disclosure — "answer the question, don't show the document."**
Shape: recompute a commitment in-circuit to bind to the credential, then `disclose()` **only the boolean result** of a check — `disclose(gpa >= min)` — never the value. Comparisons on `Uint<N>` only.
When to use: threshold (`age >= 18`), range (`min <= x <= max`), equality claims.
In CredVault: `verifyMinGPA` is the canonical instance; per-course subset reveal (the course sub-tree) is its off-chain sibling.

**Plus the mirror of #2: non-membership.** "Prove X is NOT in the set" (revocation!) — via a nullifier/revocation set check or sparse-Merkle techniques. The architecture's whole security claim is the composition: **degree valid (∈ roots) ∧ not revoked (∉ revoked) ∧ GPA ≥ threshold (pattern 7)**. When you design a new credential type, you are choosing patterns from this menu — configuration, not invention.

### 1.8 Constructor and authority gating — the Compact idiom for "admin only"

Almost every real contract needs "only the owner may do X." The Compact idiom (seen in degree.compact, and in the official examples):

1. `export sealed ledger authority: Bytes<32>;` — a sealed field: settable once, in the constructor, immutable forever after (the compiler enforces this statically).
2. A witness supplies the secret at deploy time; the constructor writes `authority = authorityKey();` — the **derived public key**, not the secret.
3. One in-circuit helper derives the key: constructor and guard call the *same function*, so they cannot drift apart.
4. Every privileged exported circuit begins `assertAuthority();` — the caller proves knowledge of the secret in zero knowledge.

Why not "check the transaction sender" like other chains? Because on Midnight the interesting authorities are *off-chain entities holding secrets*, and the ZK-native way to authenticate is proof-of-knowledge-of-secret, not a public address. The sealed-ledger + in-circuit-derivation pattern gives you: no off-chain hash to keep in sync, no secret ever on the wire, and an authority that survives key custody entirely off-chain.

## 2. Hands-on lab

**Where:** `apps/credvault/step1-degree/`. The devnet from Module 2 should be up (`docker compose ps` in `step0-hello` — three healthy containers). Compiles need the toolchain on PATH: `export PATH="$HOME/.local/bin:$PATH"`.

### Lab 2.1 — Compile degree.compact and tour the artifacts

```bash
cd /home/anthony/midnight/apps/credvault/step1-degree
export PATH="$HOME/.local/bin:$PATH"

npm run compile      # = compact compile contracts/degree.compact contracts/managed/degree
```

Expected output: `Compiling 3 circuits:` (~9 s; the helper circuits `authorityKey`/`assertAuthority` are inlined — only exported, provable circuits count).

Now tour what was made:

```bash
find contracts/managed/degree -type f | sort
# contracts/managed/degree/compiler/contract-info.json
# contracts/managed/degree/contract/index.d.ts
# contracts/managed/degree/contract/index.js        <- your contract as JS
# contracts/managed/degree/keys/addCohortRoot.prover
# contracts/managed/degree/keys/addCohortRoot.verifier
# contracts/managed/degree/keys/revokeCredential.prover
# contracts/managed/degree/keys/revokeCredential.verifier
# contracts/managed/degree/keys/verifyMinGPA.prover
# contracts/managed/degree/keys/verifyMinGPA.verifier
# contracts/managed/degree/zkir/*.zkir / *.bzkir

# The flags from section 1.6, live:
node -e "const ci=require('./contracts/managed/degree/compiler/contract-info.json');
console.log('compiler', ci['compiler-version'], '| language', ci['language-version'], '| runtime', ci['runtime-version']);
for (const c of ci.circuits) console.log(c.name, '| pure:', c.pure, '| proof:', c.proof)"
# compiler 0.31.1 | language 0.23.0 | runtime 0.16.0
# addCohortRoot | pure: false | proof: true
# revokeCredential | pure: false | proof: true
# verifyMinGPA | pure: false | proof: true
```

Three circuits, three prover/verifier key pairs — matching the table in section 1.1. This directory (`contracts/managed/degree`) is exactly what Midnight.js loads in Module 4.

### Lab 2.2 — Break it on purpose: the witness-taint error

Predict first: what happens if you delete the `disclose(` around the `persistentHash` in `authorityKey`? Then do it.

```bash
cp contracts/degree.compact /tmp/degree.compact.bak     # safety copy
# Edit contracts/degree.compact: in authorityKey, change
#   return disclose(persistentHash<Vector<2, Bytes<32>>>([pad(32, "credvault:authority:"), issuerSecretKey()]));
# to
#   return persistentHash<Vector<2, Bytes<32>>>([pad(32, "credvault:authority:"), issuerSecretKey()]);

npm run compile
```

Expected failure (the real error, captured on compactc 0.31.1):

```
Exception: contracts/degree.compact line 42 char 13:
  potential witness-value disclosure must be declared but is not:
    witness value potentially disclosed:
      the return value of witness issuerSecretKey at line 31 char 1
    nature of the disclosure:
      ledger operation might disclose a hash of the witness value
    via this path through the program:
      the argument to persistentHash at line 38 char 10
      the right-hand side of = at line 42 char 13
```

Work the error as a team exercise: find the tainted **source** (line 31: the witness), the **boundary** (line 42: the constructor's write to the sealed ledger), and the **path** (through `persistentHash` at line 38). Answer out loud: why doesn't the hash clear the taint? (Because a hash output can be brute-forced; the compiler only trusts `persistentCommit`'s randomness-backed hiding.) Then restore and confirm green:

```bash
cp /tmp/degree.compact.bak contracts/degree.compact
npm run compile     # Compiling 3 circuits: — fixed
```

### Lab 2.3 — Add a trivial circuit: `hasRoot`

Add a read-only exported circuit to the end of `contracts/degree.compact`:

```compact
// Read-only check: is this root anchored?
export circuit hasRoot(root: Bytes<32>): Boolean {
  return disclose(validRoots.member(disclose(root)));
}
```

**Predict before compiling:** why are there *two* `disclose()` calls? Then:

```bash
npm run compile
node -e "const ci=require('./contracts/managed/degree/compiler/contract-info.json');
for (const c of ci.circuits) console.log(c.name, '| proof:', c.proof)"
# addCohortRoot | proof: true
# hasRoot | proof: true          <- new circuit got keys
# revokeCredential | proof: true
# verifyMinGPA | proof: true
ls contracts/managed/degree/keys/   # hasRoot.prover + hasRoot.verifier appeared
```

Answer key for the prediction: `root` is an exported-circuit parameter → tainted → the `Set.member` argument crosses a ledger-operation boundary (inner `disclose`), and the returned `Boolean` leaves the proof (outer `disclose`). Remove the inner one and compile again to watch the compiler name the parameter as the source:

```
Exception: ... line 50 char 29:
  potential witness-value disclosure must be declared but is not:
    witness value potentially disclosed:
      the value of parameter root of exported circuit hasRoot at line 49 char 24
```

When done, restore the original contract again (`cp /tmp/degree.compact.bak contracts/degree.compact && npm run compile`) — Module 4 deploys the pristine one.

### Lab 2.4 (stretch) — Reproduce the pure/provable matrix

Create `/tmp/probe.compact`:

```compact
pragma language_version >= 0.18;
import CompactStandardLibrary;

export ledger count: Counter;

witness secretX(): Uint<64>;

export pure circuit double(x: Uint<64>): Uint<64> {
  return (x + x) as Uint<64>;      // try WITHOUT the cast first — read the widening error
}

export circuit bump(): [] {
  count.increment(1);
}

export circuit commitX(rand: Bytes<32>): Bytes<32> {
  return persistentCommit<Uint<64>>(secretX(), rand);
}
```

```bash
compact compile /tmp/probe.compact /tmp/probe-out
node -e "const ci=require('/tmp/probe-out/compiler/contract-info.json');
for (const c of ci.circuits) console.log(c.name, '| pure:', c.pure, '| proof:', c.proof)"
# double  | pure: true  | proof: false
# bump    | pure: false | proof: true
# commitX | pure: false | proof: false   <- witness-only, no ledger: NOT provable
```

You have now empirically derived section 1.6. Say the takeaway aloud: **"No ledger touch, no proof."**

## 3. Exercises

**Exercise 1 (taint triage).** For each snippet, say whether it compiles, and if not, where the `disclose()` goes:

```compact
// (a)
circuit helper(sk: Bytes<32>): Bytes<32> { return persistentHash<Bytes<32>>(sk); }
// (b)
export circuit store(h: Bytes<32>): [] { myField = h; }
// (c)
export circuit check(x: Uint<64>): [] { const y = x * 2; assert(y > 10, "small"); }
// (d)
export circuit insertCommit(v: Uint<64>, salt: Bytes<32>): [] { commits.insert(persistentCommit<Uint<64>>(v, salt)); }
```

<details><summary>Solution</summary>

(a) **Compiles** — internal helper, tainted input, but the result stays inside the proof (callers inherit the taint and must deal with it at *their* boundary).
(b) **Fails** — `h` is an exported-circuit parameter (tainted); the ledger write needs `myField = disclose(h);`
(c) **Compiles** — `y` is tainted but never crosses a public boundary; `assert` on a private computation is private. (Note `y` doesn't need a cast here because it's only compared, not returned/assigned.)
(d) **Compiles** — `persistentCommit` clears witness taint on both input and output, so the `insert` needs no `disclose()`. (Contrast with Lab 2.2's `persistentHash`.)

</details>

**Exercise 2 (ADT selection).** Pick the ledger type for each: (a) count of claims filed; (b) "is this 32-byte credId revoked?"; (c) per-student public scores; (d) private membership in a 50,000-member registry where proofs minted last year must still verify; (e) the deployer's immutable authority key.

<details><summary>Solution</summary>

(a) `Counter`. (b) `Set<Bytes<32>>` — elements are opaque hashes, so Set's public visibility is harmless. (c) `Map<Bytes<32>, Uint<64>>` (public lookup). (d) `HistoricMerkleTree<16, Bytes<32>>` — 2^16 = 65,536 capacity, `checkRoot` accepts historic roots; with committed leaves so members aren't guessable. (e) `export sealed ledger authority: Bytes<32>` — constructor-only write, publicly readable.

</details>

**Exercise 3 (pattern vocabulary).** Name the pattern(s) for each requirement: (a) "prove you're over 18 without giving your birthday"; (b) "each registered member may vote once, and no one can tell who voted"; (c) "bidders can't see each other's bids until bidding closes"; (d) "show the employer only my two crypto courses, not my whole transcript"; (e) "the same user must not be linkable across the 12 monthly check-ins."

<details><summary>Solution</summary>

(a) Selective disclosure (threshold: commitment recompute + `disclose(age >= 18)`). (b) Merkle membership (prove ∈ registry) **+ nullifier** (domain-separated, one per ballot) — the classic pair. (c) Commit–reveal (commit phase stores `persistentCommit(bid, salt)`; reveal phase opens and verifies). (d) Selective disclosure via a Merkle sub-tree — reveal only the chosen course leaves + paths; the sub-root convergence proves they belong to the same transcript (CredVault's scheme v3). (e) Round-based unlinkability (per-round derived keys + a `Counter`).

</details>

**Exercise 4 (fix the contract).** This mini-contract has three independent compile-killing mistakes. Find and fix them.

```compact
pragma language_version >= 0.18;
import CompactStandardLibrary;

export enum Status { open, closed }
export ledger status: Status;
export ledger count: Counter;
witness adminSk(): Bytes<32>;
export sealed ledger admin: Bytes<32>;

constructor() { admin = persistentHash<Bytes<32>>(adminSk()); }

export circuit close(): [] {
  assert(status == Status::open, "already closed");
  status = Status.closed;
  count = count.value() + 1;
}
```

<details><summary>Solution</summary>

1. `constructor` writes a tainted `persistentHash` of the witness without `disclose()` → `admin = disclose(persistentHash<Bytes<32>>(adminSk()));`
2. `Status::open` → dot notation: `Status.open` (double colons are a parse error).
3. `count = count.value() + 1` is wrong twice: `.value()` doesn't exist (it's `count.read()`), and ADTs aren't assigned — use the method: `count.increment(1);`

</details>

**Exercise 5 (pure or provable?).** Predict `pure`/`proof` flags and whether keys are emitted: (a) `export pure circuit add(a: Uint<64>, b: Uint<64>): Uint<64> { return (a + b) as Uint<64>; }` (b) `export circuit lookupScore(id: Bytes<32>): Uint<64> { return scores.lookup(disclose(id)); }` (c) `export circuit hashIt(x: Bytes<32>): Bytes<32> { return persistentHash<Bytes<32>>(x); }`

<details><summary>Solution</summary>

(a) `pure: true, proof: false` — declared pure and honors it; no keys.
(b) `pure: false, proof: true` — ledger **read** still counts as touching the ledger; keys emitted. (Reads are part of the state transition the proof binds to.)
(c) `pure: false, proof: false` — computation only, no ledger access: **not provable, no keys**, exactly like the `commitX` probe. If you wanted this checkable on-chain you'd anchor it with a ledger read (the `verifyMinGPA` lesson).

</details>

**Exercise 6 (design).** Penn State asks: "Some employers want to check a *specific degree title* (e.g. 'B.S. Computer Science') without seeing the GPA or courses." Sketch the Compact-side and off-chain-side changes using the pattern vocabulary. You don't need working code — name the moving parts.

<details><summary>Solution</summary>

This is selective disclosure over an equality predicate — the same shape as `verifyMinGPA`:
- **Off-chain (already exists):** the degree title is a committed field (`fieldCommit('degree', title, salt)` inside the master leaf). The package already carries `values.degree` and `salts.degree`.
- **Option A (reveal, no circuit):** the holder's presentation includes the degree value + salt (it already does); the verifier recomputes the field commitment and checks the master leaf — zero new Compact code. This is how the current L3 flow already proves the title.
- **Option B (ZK predicate, when the title must be proven WITHOUT revealing neighboring fields):** a new circuit `verifyDegreeTitle(credId, degreeCommit, expectedTitleHash)`: witnesses supply the title + salt; in-circuit `persistentCommit` recompute binds them to the credential; assert the title equals the expected value (hashed comparison); assert `!revoked.member(disclose(credId))` — the ledger read that binds the proof to a live credential AND makes the circuit provable (the section 1.6 rule). Watch the string handling: titles are hashed to `Bytes<32>` before entering the circuit (circuits don't process strings — hash off-circuit, compare hashes in-circuit).

</details>

## 4. Checkpoint quiz

1. **Name the three ingredients of a Compact contract and which one holds secrets.**
   *Answer:* Ledger (public on-chain state), circuits (rules/logic), witnesses (private inputs, implemented in TypeScript). Witnesses hold the secrets.
2. **What does `sealed` on a ledger field mean, and who enforces it?**
   *Answer:* Settable only in the constructor (directly or via constructor-called helpers); immutable thereafter — enforced statically by the compiler (writing it from an exported circuit is a compile error).
3. **Why does `authorityKey()` need `disclose()` around a `persistentHash` result, when `verifyMinGPA`'s `persistentCommit` equality check doesn't?**
   *Answer:* `persistentHash` does NOT clear witness taint (hash outputs are brute-forceable in principle), so its tainted result needs explicit disclosure at the ledger boundary. `persistentCommit` cryptographically hides its input with randomness, which clears taint on both input and output — no `disclose()` required.
4. **An exported circuit uses witnesses but never touches the ledger. What do its `proof` flag and `keys/` directory say?**
   *Answer:* `proof: false`, and no prover/verifier keys are emitted — circuits with no ledger access are not provable (no state transition to bind the proof to).
5. **Why does `verifyMinGPA` end with `assert(!revoked.member(disclose(credId)), ...)`? Give both reasons.**
   *Answer:* (1) It binds the proof to a live, unrevoked credential (revocation semantics). (2) The ledger read is what makes the circuit provable at all — pure-computation circuits get no proving keys.
6. **Comparisons like `>=` work on which type, and what's the workaround for `Field`?**
   *Answer:* Only on `Uint<N>`. Cast first: `(f as Uint<64>) >= x`.
7. **What goes wrong with `return x + x;` when `x: Uint<64>` and the circuit declares `: Uint<64>`?**
   *Answer:* Arithmetic widens — `x + x` has type `Uint<0..2^65-2>`, a supertype of `Uint<64>`; compile error "mismatch between actual return type … and declared return type". Fix: `return (x + x) as Uint<64>;`
8. **`Set` operations are publicly visible. Why is `Set<Bytes<32>>` still safe for CredVault's `revoked` registry — and when would it NOT be safe?**
   *Answer:* The elements are opaque hashes (credIds); seeing them reveals nothing about any person. It would be unsafe if elements were guessable/identifying values (names, IDs) — then membership tests and inserts would leak who is being checked or revoked; use commitments or a Merkle-based scheme instead.
9. **Name the 7 privacy patterns.**
   *Answer:* Commitments, Merkle membership, nullifiers, round-based unlinkability, commit–reveal, shielded tokens, selective disclosure (plus the non-membership mirror of #2 for revocation).
10. **Why does the constructor and the authority guard share one `authorityKey()` circuit instead of each hashing the secret separately?**
    *Answer:* So the two derivations can never drift apart, and so no off-chain code ever has to reproduce the hash — one in-circuit function is the single source of truth for "who is the issuer."

## Agent teacher notes

**Pacing.** This is the heaviest module — budget two sessions. Session 1: sections 1.1–1.5 + Lab 2.1/2.2 (through witness taint). Session 2: sections 1.6–1.8 + Lab 2.3/2.4 + exercises. Do NOT compress witness taint into the same hour as anything else; it deserves silence and a whiteboard. The line-by-line walkthrough (1.2) works best read *aloud*, alternating reader per section, with the real file open — students should verify every claim against the actual `degree.compact`.

**Check understanding before advancing.**
- After 1.2: "Point at the line that makes May's diploma still verify in December." (`validRoots` is a Set that's never removed from.) "Point at the line that would stop a revoked student." (`revoked.member` — off-chain today, in-circuit in `verifyMinGPA`.)
- After 1.5, before Lab 2.2: have them PREDICT the error and its structure (source/nature/path). Students who predict correctly will read the real error in 10 seconds; students who guessed "it'll work because it's hashed" get the full teaching moment.
- After 1.6: the one-sentence test — "when is a circuit provable?" ("When it touches the ledger.") If they add caveats, they didn't get it; if they say "when it's exported," send them to Exercise 5.

**Common misconceptions.**
- *"Hashing hides data."* The single most persistent error — attack it with the Lab 2.2 story every time it surfaces. Hash = binding fingerprint; commit (with salt) = hiding. The compiler encodes exactly this distinction.
- *"`disclose()` does something cryptographic."* It's a type-system annotation, a no-op at runtime. It doesn't encrypt, hash, or transform — it *permits*.
- *"Tainted = leaked."* No — taint means "the compiler is watching." Plenty of tainted values never leave the proof. The 1.5 corollary (exported params are private inputs) is the antidote.
- *"The ledger is where data lives, so my contract needs fields for everything."* The CredVault design is the counter-lesson: three 32-byte sets/values run a whole credential platform. Data lives off-chain; the chain holds anchors.
- *"Smart contracts have a caller address I check for auth."* On Midnight, authority is proof-of-knowledge-of-secret in-circuit (section 1.8). Students from Ethereum need this reframed early.
- *"More circuits = better contract."* Every exported circuit is a key pair, proving cost, and attack surface. degree.compact does its job in three.

**FAQ answers ready.**
- *"Why not store the GPA on-chain encrypted?"* The chain is public and permanent; encrypted-today is decrypted-in-20-years. Anchors (hashes/commitments) are future-proof because there's nothing to decrypt.
- *"Can a witness lie?"* Witnesses are untrusted inputs — the circuit's asserts are what make lying useless (a wrong GPA fails the commitment recompute). Witness = whispered claim; circuit = bouncer.
- *"Why does Compact have no division?"* Circuits must be cheap and deterministic; teach it as a constraint you design around (scale values — GPA is stored ×100 as `Uint<64>`, which is exactly why the cohort data uses `385` for 3.85).
- *"What runs the TypeScript witness body?"* The caller's own machine, at proving time — via the compiled contract's witness context (Module 4 opens that box).
- *"Is `assert` failure on-chain?"* A failed assert means no valid proof can be constructed, so the transaction never lands. The chain only ever sees passing executions.

**Let them struggle vs. help.** Struggle (productive): predicting Lab 2.2's error; finding Exercise 4's three bugs; the pure/provable predictions in Exercise 5. Help (unproductive to solo): the widening-arithmetic cast rule (just show it — it's arbitrary until you've internalized subtyping), any confusion between `persistentHash` and `persistentCommit` beyond the taint rule (give the decision rule directly: "store-or-hide? commit. fingerprint-of-public-data? hash."), and TypeScript-side witness wiring (that's Module 4's job — defer, don't rabbit-hole).

**Advance when:** the student can (1) walk a stranger through degree.compact without notes, (2) state the taint rules table from memory including the commit/hash asymmetry, (3) compile, break, and repair the contract unaided, and (4) name the pattern(s) for a novel privacy requirement in Exercise-3 style. Then they're ready for Module 4, where the TypeScript half of the brain gets built.

## References

**This repo (ground truth):**
- `apps/credvault/step1-degree/contracts/degree.compact` — the contract this module walks through
- `apps/credvault/step1-degree/contracts/probe.compact` + `src/probe.ts` — the persistentCommit byte-layout research probes
- `apps/credvault/step1-degree/src/canonical.ts` — the off-chain commitment scheme (the "one canonical lib" from the 1.4 story)
- `apps/credvault/step1-degree/src/common.ts` — where witness bodies live on the TypeScript side
- `apps/credvault/ARCHITECTURE.md` §3 (the 7 patterns + size rule), §14 (witness-taint gotcha, opaque-roots decision), §15 (L2 circuit design, provable-circuit rule)

**Reference repos:**
- `midnight-expert/plugins/core-concepts/skills/privacy-patterns/SKILL.md` — the canonical 7 patterns, threat model, common mistakes
- `midnight-expert/plugins/compact-core/skills/compact-privacy-disclosure/SKILL.md` — the Witness Protection Program, disclosure rules, commit-vs-hash taint
- `midnight-expert/plugins/compact-core/skills/compact-ledger/SKILL.md` — ADT operations + per-operation visibility
- `midnight-expert/plugins/compact-core/skills/compact-language-ref/SKILL.md` — types, casts, operators, control flow
- `midnight-expert/plugins/compact-core/skills/compact-structure/SKILL.md` — contract anatomy, circuits, witnesses, constructors
- `midnight-docs/docs/compact/` — official language docs — https://docs.midnight.network/compact/
- `midnight-docs/docs/guides/security-best-practices.mdx` — block-time predicates, simulator testing with `impureCircuits`/`pureCircuits`
