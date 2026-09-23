# Module 1: Foundations — The Cryptography You'll Actually Use

> Time: ~4 hours | Prerequisites: Module 0

Module 0 showed you *that* it works: fingerprints on-chain, data off-chain,
verification in a tenth of a second. This module shows you *how* — the four
primitives the entire system is built from. You will compute every one of them
with your own hands, and by the end you will have personally reproduced Alice's
complete cryptographic chain, byte for byte, from her package. That's the moment
the magic turns into engineering.

Good news: there is no new math beyond "concatenate some bytes and hash them."
Everything here is built from one function, SHA-256, used carefully.

## Learning objectives

By the end of this module you can:

1. **Explain** the five properties of a cryptographic hash function and
   **demonstrate** the avalanche effect with `sha256` on the command line.
2. **Explain** why a bare hash is NOT a commitment for guessable data (run a
   dictionary attack on an unsalted GPA yourself), and **build** a salted
   commitment using `canonical.ts` — hiding + binding.
3. **Explain** domain separation and point to the exact lines of
   `canonical.ts` that implement it (`pad32` prefixes).
4. **Build** a Merkle tree by hand for 4 students, extract a membership proof,
   and verify it — on paper and in code.
5. **Tell** the Ali Baba cave story and **map** it to witness / circuit /
   statement / proof, using the real `verifyMinGPA` circuit as the example.
6. **Reproduce** Alice's full chain — field commitments → master leaf →
   credential ID → cohort root — from `packages/STU-001.package.json`, and
   explain why doing so means "you are now the verifier."

---

## 1. Concepts from scratch

### 1.1 Hash functions: the fingerprint machine

A **hash function** is a program that takes any input — one letter, a name, a
whole library — and produces a fixed-size output called the hash (or digest).
The one used everywhere in this course is **SHA-256**, which always outputs
256 bits, conventionally written as 64 hexadecimal characters.

Run it right now (every lab in this module is real — type these):

```bash
node -e "console.log(require('crypto').createHash('sha256').update('Alice Johnson').digest('hex'))"
# 4fa8c1cdf83eb36e391f810620bfe090be6d41177e9d5dafcdde9de957fd3460
```

Five properties make this useful. Each matters; we'll use every one.

**① Deterministic.** Same input → same output, always, on every computer.

```bash
node -e "console.log(require('crypto').createHash('sha256').update('Alice Johnson').digest('hex'))"
# 4fa8c1cdf83eb36e391f810620bfe090be6d41177e9d5dafcdde9de957fd3460   (identical, forever)
```

This is what makes verification possible at all: Penn State computes the hash
in May; an employer recomputes it three years later; the outputs match exactly.

**② Fixed size.** A 3-letter word and a 10,000-line transcript both produce 64
hex characters. This is why the chain can anchor *any* credential with a single
32-byte value.

**③ Avalanche effect.** Change one bit of the input and the output changes
beyond recognition — about half the output bits flip, unpredictably:

```bash
node -e "const h=s=>require('crypto').createHash('sha256').update(s).digest('hex');
console.log(h('Alice Johnson'));
console.log(h('Alice Johnsn'));"
# 4fa8c1cdf83eb36e391f810620bfe090be6d41177e9d5dafcdde9de957fd3460
# 1957b6e2ac9b7cdf8780aaf5373a7b3c34cb70e8adbe8dc3a0e8209a49721db5
```

One letter deleted ('o' → gone) and not a single hex character survived in
position. This is why Module 0's tampered transcript died instantly: edit
"385" to "395" and the resulting fingerprint isn't slightly wrong, it's
*totally* wrong.

**④ One-way.** Given the output, there's no practical way to recover the input.
The output above tells you nothing about "Alice Johnson" — you'd have to guess
inputs and hash them (that's preimage resistance). There is no "unhash."

**⑤ Collision resistance.** Nobody can find two *different* inputs with the same
hash. The output space is 2²⁵⁶ — a number with 78 digits, vastly more than the
~10⁸⁰ atoms in the observable universe. Finding a collision by guessing would
take longer than the age of the universe on any hardware that obeys physics as
we know it.

**A hash is NOT encryption.** This trips everyone up, so say it plainly:
encryption is a two-way door (ciphertext + key → plaintext, by design); hashing
is a one-way *fingerprinter* (input → fingerprint, and the fingerprint is all
you keep). Nothing to decrypt, no key to leak. When Module 0 said "the chain
stores fingerprints," this is the machine that makes them.

### 1.2 Salted commitments: hide + bind

A hash of a value binds you to that value: hash "385" today, and tomorrow you
can't claim it was "395" — the hashes won't match. But watch what happens when
the possible values are *few*. GPAs (×100) run 0–400. That's 401 possibilities.
Suppose an on-chain commitment were just `sha256("385")`. An attacker who sees
it does this:

```bash
node -e "
const h=s=>require('crypto').createHash('sha256').update(s).digest('hex');
const target=h('385');                    // the 'commitment' the attacker saw
for(let g=0; g<=400; g++){ if(h(String(g))===target){ console.log('CRACKED: gpa =', g); } }"
# CRACKED: gpa = 385      (takes about a millisecond)
```

One millisecond. A bare hash hides a value only if the value is too large to
guess — and most interesting values (GPAs, grades, license types, salaries)
are tiny and guessable. This attack is called a **dictionary attack**, and it's
the reason the second primitive exists.

**The fix: mix in a secret random value — the salt.** A **commitment** is:

```
commitment = HASH( value || salt )        // salt = 32 random bytes, kept private
```

Now the attacker can't enumerate anything: for each guessed GPA they'd also
have to guess a 256-bit salt (2²⁵⁶ possibilities — the atoms-in-the-universe
number again). The commitment **hides** the value.

Meanwhile the committer keeps (value, salt) and can later **open** the
commitment: reveal both, anyone recomputes `HASH(value || salt)` and compares.
You can't open it to a *different* value — that would require finding a
collision (property ⑤). The commitment **binds** the committer.

The classic analogy is an **envelope**: you write a value on paper, seal it in
an envelope, and hand the sealed envelope over (everyone can hold it, nobody can
read it — hiding). Later you open the envelope; the paper inside is provably the
same paper you sealed (binding). The salt is what makes the envelope opaque even
when the message space is small — like stirring a jar of random glitter into
the wax seal: there's no way to reconstruct or precompute what seal corresponds
to "385."

> **Commitment = hide + bind.** Hidden until opened; unchangeable once made.

Three rules the codebase enforces (they're from the canonical mistakes list in
the privacy-patterns skill — people get these wrong in production):

- **Never reuse salts.** Same value + same salt = same commitment (leaks
  equality); reusing one salt across fields lets an attacker correlate them.
  CredVault gives every field of every student its own salt — derived
  deterministically from the issuer secret (`kdfSalt`), so re-running a batch
  reproduces identical commitments (Module 5 tells that story).
- **Salts are private until opening.** They're stored in the student's package —
  the thing only the holder carries.
- **Normalize before hashing.** Commitments bind *exact bytes*. `"Alice"`,
  `"alice "`, and `"ALICE"` hash to three unrelated values. So CredVault
  normalizes first (strings → trimmed, uppercased UTF-8; numbers → decimal
  strings) — see `normalize()` in `canonical.ts`. One canonical form, or
  nothing matches.

**Domain separation.** One more discipline, small but load-bearing. If the same
hash function is used for different purposes — field commitments, tree nodes,
credential IDs — those purposes must never collide with each other. Otherwise a
value from one context could be replayed as a value in another (a tree node
mistaken for a credential ID, say). The fix is to prefix every hash with a
distinct label. CredVault pads a purpose string to 32 bytes and prepends it:

```
fieldCommit = H( pad32("credvault:field:")  || fieldName || normalize(value) || salt )
masterLeaf  = H( pad32("credvault:leaf:")   || fieldCommits... || courseRoot || masterSalt )
credId      = H( pad32("credvault:credid:") || masterLeaf )
treeNode    = H( pad32("credvault:node:")   || left || right )
courseLeaf  = H( pad32("credvault:course:") || code || title || credits || grade || salt )
```

(This is verbatim from the header comment of `src/canonical.ts` — open it,
it's 15 lines that run the whole system.) Even the official codebase warns
about this: Midnight's own zerocash reference has a domain string left over
from an old purpose (`"lares:zerocash:commit"` reused for nullifier
derivation) preserved as a cautionary naming artifact. Get your prefixes right
and never change them casually: a domain prefix is forever.

### 1.3 Story: the March hash-mismatch wall (and the one-library rule)

An earlier generation of this project (March 2026) tried to verify credentials
by having JavaScript code reproduce the *on-chain contract's* hash function
byte-for-byte. Two different languages, two different encodings of "the same"
data — and the hashes disagreed. Not because either was wrong, but because
byte-level agreement across a language boundary is brutally easy to get subtly
wrong, and the failure mode is silent: every honest credential verifies FALSE.

The wall taught the team two lessons, now baked into the architecture:

1. **Minimize the surface where two implementations must agree.** The contract
   stores *opaque* 32-byte anchors (`validRoots`, `revoked`) — values that
   were hashed off-chain and never re-hashed on-chain. Zero cross-language
   matching required.
2. **Where matching is unavoidable, crack the layout and pin it with test
   vectors.** The one place JS *must* match the contract is the GPA commitment,
   because the L2 zero-knowledge circuit recomputes it in-circuit. The team
   probed the compiler directly (`contracts/probe.compact` + `src/probe.ts`)
   and established:

   ```
   persistentCommit<Uint<64>>(x, rand)  = SHA-256( rand || little-endian-64(x) )
   persistentCommit<Bytes<32>>(b, rand) = SHA-256( rand || b )
   persistentHash of a pair [l, r]      = SHA-256( l || r )
   ```

   …and froze the result as test vectors in `canonical.ts` (you'll run one in
   Lab 1.5). If any future compiler update changes the layout, the vector fails
   loudly instead of corrupting credentials silently.

**Moral:** every cross-boundary byte agreement is a bug farm. Eliminate the
boundary where you can; pin it with tests where you can't. And issuer, holder,
and verifier in CredVault all import the *same* `canonical.ts` — so this class
of bug is not merely fixed, it is structurally impossible.

### 1.4 Merkle trees: one fingerprint for ten thousand students

Commitments solve one credential. A graduation is 10,000 credentials. Do we
anchor 10,000 commitments on-chain? We could — but there's a beautiful
construction that anchors *all of them* in a single 32-byte value while still
letting each person prove their own membership. It's a **Merkle tree** (pattern
2 of the 7).

**Build one by hand.** Four students: Alice, Brian, Carla, David.

1. Commit each student into a **leaf**: `L1..L4`.
2. Hash pairs of leaves into **nodes**: `N12 = H(L1 || L2)`, `N34 = H(L3 || L4)`.
3. Hash the nodes into the **root**: `R = H(N12 || N34)`.

```
                    R = H(N12 || N34)          <- the ONLY value anchored on-chain
                   /             \
        N12 = H(L1||L2)      N34 = H(L3||L4)
        /        \            /        \
      L1          L2        L3          L4     <- leaves: one per student
    Alice       Brian     Carla       David
```

The root is a fingerprint of the *entire set*: change any leaf and every node
above it avalanches, so the root changes (properties ①+③ all the way up).

**The membership proof (the clever part).** Carla wants to prove she's in the
set without the verifier knowing anything about the other students. She shows:
her leaf data, plus just the **siblings** along the path from her leaf to the
root — called her **Merkle path**:

```
Carla proves L3 is under R with only 2 sibling hashes:

        R
       / \
    N12*  N34            * = the 2 siblings Carla supplies
          / \
       L3    N34-sibling = L4*
      (Carla)

verify:  N34' = H(L3 || L4)      <- compute from her data + sibling L4
         R'   = H(N12 || N34')   <- compute with sibling N12
         check R' == R (the on-chain root)
```

Two hashes for 4 students. The magic is the scaling: for **10,000 students the
path is about 14 hashes** (log₂10000 ≈ 13.3), because each level halves what
remains. A whole university anchors in one 32-byte root; every graduate carries
a proof the size of a few hundred bytes. (This is why the architecture notes
say "5 students or 10,000 — same one transaction, same cost.")

**Details the code handles for you** (`buildTree`/`getPath`/`recomputeRoot`
in `canonical.ts`):

- **Padding.** Trees need powers of two. 5 students → pad to 8 leaves with a
  defined `EMPTY_LEAF`, depth 3. (Open Alice's package: her `path` has exactly
  3 entries. Now you know why.)
- **Order matters.** `H(a || b) ≠ H(b || a)`, so each path entry records
  `goesLeft` — which side the sibling sits on.
- **Historic roots.** New batches add new roots; the on-chain `validRoots` set
  *never removes*. A 2027 package still verifies after the 2028 batch — the old
  root is still anchored.

### 1.5 Zero-knowledge proofs: from a cave to a circuit

Everything so far proves *"this data matches that fingerprint"* — fine when
you're willing to show the data (L1, L3). But Module 0's L2 proved
*"GPA >= 3.50"* while the GPA stayed hidden. How can you prove a fact about
data you refuse to show? Start with the famous story.

**The cave of Ali Baba.** A cave has a ring-shaped tunnel: entrance forks left
(A) and right (B), and the two paths meet at a magic door deep inside that opens
only for a secret phrase. Peggy claims she knows the phrase. Victor wants proof
— but Peggy won't tell him the phrase.

```
                 entrance
                    |
              Victor stands here
                    |
             _______|_______
            /               \
        path A               path B
            \               /
             ---- door ----    (opens only with the secret phrase)
```

The protocol: Peggy enters (down A or B, her choice) while Victor waits outside.
Victor then walks to the fork and shouts a random demand: *"Come out path A!"*
(or B). If Peggy knows the phrase, she can always comply — if she's behind the
door on the wrong side, she opens it and crosses. If she *doesn't* know the
phrase, she's stuck on whatever side she entered and can only comply when
Victor happens to call that side — a 50% chance. Repeat 20 times: a liar
succeeds with probability ½²⁰ ≈ one in a million. Victor becomes certain Peggy
knows the phrase... and has learned **nothing** about the phrase itself. He
couldn't open the door. He couldn't convince anyone else by replaying a video
(a video could be stitched from lucky takes).

Three properties, which real ZK systems also have:

- **Completeness** — if the claim is true, an honest prover always convinces an
  honest verifier.
- **Soundness** — if the claim is false, no cheating prover can convince the
  verifier (except with negligible probability).
- **Zero-knowledge** — the verifier learns the truth of the claim and *nothing
  else*.

**From story to engineering.** Real ZK systems (Midnight uses zk-SNARKs) replace
the cave with a mathematical claim compiled into a **circuit** — a program whose
execution can be proven. The vocabulary maps like this:

| Cave story | Engineering term | In our GPA proof |
|---|---|---|
| The secret phrase | **Witness** (private input) | Alice's GPA (385) and her GPA salt |
| "I know the phrase" | **Statement** | "There exist gpa, salt such that commit(gpa, salt) = gpaCommit **and** gpa >= minGpa **and** credId is not revoked" |
| The protocol's rules | **Circuit** | the `verifyMinGPA` function, compiled to ZK form |
| Victor's conviction | **Proof verification** | ~0.15 s check, off-chain |
| (nothing) | **Public inputs** | credId, gpaCommit, minGpa — visible to all |

Here's the actual circuit — every line of it (`contracts/degree.compact`):

```compact
export circuit verifyMinGPA(credId: Bytes<32>, gpaCommit: Bytes<32>, minGpa: Uint<64>): [] {
  const gpa = gpaValue();                                                       // witness: the SECRET gpa
  assert(persistentCommit<Uint<64>>(gpa, gpaSalt()) == gpaCommit, "...");       // 1: it's really the committed gpa
  assert(gpa >= minGpa, "GPA below the required minimum");                      // 2: it clears the bar
  assert(!revoked.member(disclose(credId)), "credential is revoked");           // 3: credential still valid
}
```

Read the three asserts as the circuit's whole job: **(1)** "the hidden GPA I'm
using really is the one Penn State committed" (recompute the commitment
in-circuit — *this* is why Lab 1.5's byte-exact layout matters); **(2)** "that
GPA clears the verifier's minimum"; **(3)** "the credential isn't revoked."
The proof convinces anyone that all three held for *some* hidden (gpa, salt) —
revealing neither.

**The mind-bender that makes it click:** you cannot prove a false statement.
When the issuer pre-mints proofs at graduation, the circuit runs locally first —
and for Brian (GPA 3.42) the "prove >= 3.50" run dies at assert 2:
`NOT minted (failed assert: GPA below the required minimum)`. Not "rejected by
a policy." The math cannot produce a proof of a false claim, for Brian, for the
issuer, for anyone. (Module 6 does this live.)

**The size rule (why circuits stay small).** In-circuit computation is
expensive: SHA-256 costs tens of thousands of *constraints* per 64-byte block
inside a circuit, so hashing a 10 KB transcript in-circuit would mean millions
of constraints — never do that. Hence the rule you'll see enforced everywhere:
**circuits only touch small values** (a GPA, a salt, a threshold). Full-document
checks (L3) need no ZK at all — revealing the data and recomputing the hash IS
the proof. ZK is reserved for claims about data that stays hidden.

---

## 2. Hands-on lab

All labs run in the project directory. For the scripted labs, create a scratch
file `lab1.ts` there (delete it when done, or keep it — it's yours).

```bash
cd /home/anthony/midnight/apps/credvault/step1-degree
```

### Lab 1.1 — The avalanche, live (10 min)

**1a.** Hash the same input twice; confirm byte-identical output (determinism):

```bash
node -e "const h=s=>require('crypto').createHash('sha256').update(s).digest('hex');
console.log(h('credvault')); console.log(h('credvault'));"
```

**1b.** Change one character; count how many hex characters stay in the same
position (avalanche):

```bash
node -e "const h=s=>require('crypto').createHash('sha256').update(s).digest('hex');
const a=h('Alice Johnson'), b=h('Alice Johnsn');
let same=0; for(let i=0;i<64;i++) if(a[i]===b[i]) same++;
console.log(a); console.log(b); console.log('same-position matches:', same, 'of 64');"
```

**Predict before you run:** how many matches? (Students usually guess "a few
differ." Reality: typically 0–5 of 64 — about what two *random* strings would
share.)

**1c.** Prove fixed size: hash the entire cohort file — still 64 hex chars:

```bash
node -e "const fs=require('fs');
console.log(require('crypto').createHash('sha256').update(fs.readFileSync('data/cohort.json')).digest('hex'));"
```

*What can go wrong:* quoting hell in `node -e` on some shells — if you get a
syntax error, put the script in a file (`lab1.js`) and `node lab1.js` instead.

### Lab 1.2 — Why salt: the dictionary attack, then salted commitments (25 min)

**2a. Attack an unsalted commitment.** Re-run `1.2's cracker against a
"commitment" that's just `sha256("385")` — watch it fall in ~1 ms. Then try
the same loop against `sha256("385" || salt)` for an unknown 32-byte salt:
your loop has nothing to iterate — 2²⁵⁶ salt possibilities per guess. Feel the
difference; this IS why salted commitments exist.

**2b. Build real commitments with the project's own library.** Create `lab1.ts`:

```typescript
import * as C from './src/canonical';

// --- commitments hide ---
const salt = C.newSalt();                                  // 32 random bytes
const commit1 = C.fieldCommit('gpa', 385, salt);
console.log('commitment :', C.toHex(commit1));

// --- binding: opening works ---
const opened = C.fieldCommit('gpa', 385, salt);
console.log('honest open matches:', C.toHex(opened) === C.toHex(commit1));   // true

// --- binding: opening to a DIFFERENT value fails ---
const lied = C.fieldCommit('gpa', 386, salt);
console.log('lied open matches  :', C.toHex(lied) === C.toHex(commit1));     // false

// --- hiding: same value, different salt => unrelated commitment ---
const commit2 = C.fieldCommit('gpa', 385, C.newSalt());
console.log('same gpa, new salt, same commitment?', C.toHex(commit2) === C.toHex(commit1)); // false

// --- normalization: '385' the string and 385 the number normalize identically;
//     but ' 385 ' with spaces would too (trim) — canonical form is what gets hashed.
console.log('normalize(385)  :', C.normalize(385).toString());
console.log('normalize(" b.s. computer science ") ->', C.normalize(' b.s. computer science ').toString());
```

```bash
npx tsx lab1.ts
```

Expected (your hex values differ — random salts — but the true/false pattern
must be exactly):

```
commitment : <64 hex chars>
honest open matches: true
lied open matches  : false
same gpa, new salt, same commitment? false
normalize(385)  : 385
normalize(" b.s. computer science ") -> B.S. COMPUTER SCIENCE
```

**2c. See the domain prefix.** Print `C.pad32('credvault:field:')` and notice
it's the label padded with zero bytes to 32 bytes. Then compute
`C.fieldCommit('gpa', 385, salt)` and `C.sha256(C.pad32('credvault:kdf:'),
C.normalize(385), salt)` — same value, same salt, different domain → different
output. That separation is deliberate.

*What can go wrong:* forgetting `C.toHex()` and printing a raw Buffer (you'll
see `<Buffer 8f 2a ...>` — harmless); importing from the wrong directory
(run from `step1-degree`, import path `./src/canonical`).

### Lab 1.3 — Build the 4-student Merkle tree yourself (30 min)

**3a. On paper first.** Draw the tree from `1.4 for Alice/Brian/Carla/David.
Label the two siblings Carla needs for her proof. (Answer: L4 — Brian&David's
pair-mate, i.e., David's leaf — and N12.)

**3b. In code.** Extend `lab1.ts`:

```typescript
// --- a Merkle tree for 4 students ---
const names = ['ALICE', 'BRIAN', 'CARLA', 'DAVID'];
const leaves = names.map(n => C.sha256(C.pad32('demo:'), Buffer.from(n)));
const levels = C.buildTree(leaves);
const root = levels[levels.length - 1][0];
console.log('root:', C.toHex(root));

// Carla's membership proof (index 2)
const carlaPath = C.getPath(levels, 2);
console.log('path length for 4 leaves:', carlaPath.length);        // 2 = log2(4)

// verify her proof
const r1 = C.recomputeRoot(leaves[2], carlaPath);
console.log('Carla verifies:', C.toHex(r1) === C.toHex(root));     // true

// an impostor: 'CARLB' in Carla's slot
const fakeLeaf = C.sha256(C.pad32('demo:'), Buffer.from('CARLB'));
const r2 = C.recomputeRoot(fakeLeaf, carlaPath);
console.log('CARLB verifies:', C.toHex(r2) === C.toHex(root));     // false

// padding: 5 students -> 8 leaves -> depth 3 (like the real cohort)
const five = ['A','B','C','D','E'].map(n => C.sha256(C.pad32('demo:'), Buffer.from(n)));
const levels5 = C.buildTree(five);
console.log('depth for 5 students:', levels5.length - 1);          // 3
console.log('path length:', C.getPath(levels5, 0).length);         // 3
```

```bash
npx tsx lab1.ts
```

Now open the real package and connect it to what you just did:

```bash
node -e "const p=require('./packages/STU-001.package.json');
console.log('Alice path length:', p.path.length);       // 3  (5 students padded to 8)
console.log('first path entry:', JSON.stringify(p.path[0]));"
```

Her path entries are `{sibling, goesLeft}` — exactly your `PathEntry` objects,
hex-encoded. The toy you just built IS the production scheme.

### Lab 1.4 — YOU are the verifier: reproduce Alice's entire chain (45 min)

This is the heart of the module. You will redo, by hand, every computation the
verifier does in steps [1]–[2] of Module 0 — and check yourself against the
values Penn State actually packaged. Replace `lab1.ts` with:

```typescript
import * as C from './src/canonical';
import * as fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('packages/STU-001.package.json', 'utf8'));
const check = (label: string, got: Buffer, wantHex: string) =>
  console.log(label.padEnd(22), C.toHex(got) === wantHex ? 'MATCH' : 'MISMATCH');

// 1. field commitments (the three committed fields)
const cName   = C.fieldCommit('fullName', pkg.values.fullName, C.fromHex(pkg.salts.fullName));
const cDegree = C.fieldCommit('degree',   pkg.values.degree,   C.fromHex(pkg.salts.degree));
//    GPA uses the Compact-compatible layout (it must match the on-chain circuit):
const cGpa    = C.compactCommitUint64(pkg.values.gpa, C.fromHex(pkg.salts.gpa));
check('gpaCommit', cGpa, pkg.gpaCommit);

// 2. master leaf = H(leaf-domain || field commits || course sub-root || master salt)
const leaf = C.masterLeafV3([cName, cDegree, cGpa], C.fromHex(pkg.courseSubRoot), C.fromHex(pkg.salts.master));
check('masterLeaf', leaf, pkg.masterLeaf);

// 3. credential ID = H(credid-domain || masterLeaf)  (this is what revocation lists)
const credId = C.credIdFromLeaf(leaf);
check('credId', credId, pkg.credId);

// 4. cohort root = recompute up Alice's Merkle path
const root = C.recomputeRoot(leaf, C.pathFromHex(pkg.path));
check('cohortRoot', root, pkg.cohortRoot);
console.log('\ncohort root:', C.toHex(root));
console.log('(the verifier now checks: is THIS in validRoots on-chain? is credId NOT in revoked?)');

// 5. now BE the forger: bump the GPA and watch the chain collapse
const forged = C.compactCommitUint64(395, C.fromHex(pkg.salts.gpa));
const forgedLeaf = C.masterLeafV3([cName, cDegree, forged], C.fromHex(pkg.courseSubRoot), C.fromHex(pkg.salts.master));
console.log('\nforged gpa 395:');
check('  masterLeaf', forgedLeaf, pkg.masterLeaf);      // MISMATCH — caught here, before any network call
```

```bash
npx tsx lab1.ts
```

Expected output — **every line must say MATCH** (verified against the real
package):

```
gpaCommit              MATCH
masterLeaf             MATCH
credId                 MATCH
cohortRoot             MATCH

cohort root: ef5ecbe47f36421872dce598471f0bccbea476731bfb76cb0c33b69daee29414
(the verifier now checks: is THIS in validRoots on-chain? is credId NOT in revoked?)

forged gpa 395:
  masterLeaf           MISMATCH
```

If all four MATCH: congratulations — you just executed the complete verification
algorithm of the platform, and the only step you didn't do is the on-chain
lookup (Module 2). Open `src/verify-core.ts` lines 41–82 and find each of your
computations in it: same functions, same order. The "magic" verifier from
Module 0 is this file, and you can now read it.

If anything says MISMATCH: the three usual suspects are (1) editing
`pkg.values` before recomputing (don't), (2) forgetting `C.fromHex()` on a
salt (they're hex strings in JSON, Buffers in code), (3) re-ordering the field
commits — the order `[fullName, degree, gpa]` is part of the scheme.

### Lab 1.5 — Stretch: prove JS matches the on-chain circuit (15 min)

The one place JavaScript *must* agree byte-for-byte with the Compact contract is
the GPA commitment (the L2 circuit recomputes it in-circuit). The team cracked
the layout and pinned test vectors. Run the vector:

```typescript
import * as C from './src/canonical';
const rand = Buffer.alloc(32, 0x07);
console.log(C.toHex(C.compactCommitUint64(385, rand)));
console.log('expect: a5c8056f0217cb89918487e23326ee8bf6265b5f6113213eced4748ffe599460');
const b = Buffer.alloc(32, 0x03);
console.log(C.toHex(C.compactCommitBytes32(b, rand)));
console.log('expect: 46df2f81386a0f40ecbb003e48324a2cb398375847b9759d20347554f65e8063');
```

Both lines must equal the pinned expectations (they do — these vectors were
probed against compactc 0.31.1 and are quoted in `canonical.ts`'s comments).
Notice the GPA layout: `SHA-256(rand || le64(x))` — the salt comes FIRST and
the number is little-endian 64-bit. Guessing that ordering is exactly the kind
of thing the March wall was made of; that's why it's pinned by a probe and a
vector, not by hope.

---

## 3. Exercises

**Exercise 1.1 (avalanche intuition).** A colleague claims: "If two inputs
differ by one bit, their SHA-256 outputs will differ by about one bit — that's
why it's called a *bit* hash." Correct them in two sentences, then demonstrate
with code.

<details>
<summary>Solution</summary>

SHA-256 has the avalanche property: a one-bit input change flips each output
bit with ~50% probability, so ~128 of 256 output bits change, unpredictably.
There is no "locality" between input and output changes at all.

```bash
node -e "const h=s=>require('crypto').createHash('sha256').update(s).digest('hex');
console.log(h('A')); console.log(h('B'));"   # 'A' and 'B' differ by one bit; outputs share almost nothing
```
</details>

**Exercise 1.2 (quantify hiding).** (a) An unsalted commitment to a US letter
grade (A, A-, B+, ..., F — 12 values): how many guesses to crack? (b) The same
grade committed with a 32-byte salt: how many? (c) Explain why "but the salt is
in the student's package" doesn't undo the protection — who is the attacker
here, and what do they have?

<details>
<summary>Solution</summary>

(a) 12 guesses — instant. (b) 12 × 2²⁵⁶ ≈ 2²⁵⁹ guesses — physically impossible.
(c) The attacker we're defending against is any *observer* — someone who sees
the on-chain commitment (or a presentation that withholds the field) and wants
to learn the grade. They don't have the package; the salt never leaves the
holder's hands until the holder chooses to open that field. The protection is
against outsiders, not against the holder (the holder already knows their own
grade — it's their data).
</details>

**Exercise 1.3 (Merkle path by hand).** An 8-leaf tree holds students
S1..S8. (a) Draw the tree. (b) List exactly which siblings S6 needs for its
membership proof, and how many hashes the verifier recomputes. (c) How many
leaves would a depth-16 tree hold (the production `HistoricMerkleTree` size
mentioned in the schema)?

<details>
<summary>Solution</summary>

(a) Levels: leaves → 4 nodes → 2 nodes → root.
(b) S6's path: sibling **S5** (leaf level), sibling **H(S7||S8)** (the pair
under S6's pair), sibling **H(H(S1||S2)||H(S3||S4))** (the whole other half).
Three siblings = log₂8. The verifier computes 3 hashes up the path and compares
to the root.
(c) 2¹⁶ = 65,536 leaves — one cohort tree per graduation batch keeps each tree
comfortably small (ARCHITECTURE.md `6).
</details>

**Exercise 1.4 (domain separation bug hunt).** A sloppy app computes both its
credential IDs and its Merkle tree nodes as plain `H(x)` with no domain
prefix. Describe a concrete confusion attack. (Hint: what if a valid tree node
hash equals a value the revocation circuit treats as a credential ID?)

<details>
<summary>Solution</summary>

Without separation, the same 32-byte value is meaningful in two contexts. An
attacker (or an accident of data) can produce a tree node whose hash collides
with the *form* of a credential ID — then inserting that node into the
revocation set (or tricking someone into revoking it) revokes a value that is
actually a legitimate tree node, or a "credential ID" derived from tree data
lets a proof be replayed across contexts. Domain prefixes
(`"credvault:credid:"` vs `"credvault:node:"`) make the two output spaces
non-overlapping by construction: a node hash can never *be* a credId, because
their inputs differ by prefix. That's why every hash in `canonical.ts` carries
its own `pad32` label.
</details>

**Exercise 1.5 (reproduce David's identity).** David Kim (STU-004) was revoked.
Using the technique of Lab 1.4, compute his `credId` from
`packages/STU-004.package.json`. This value — not his name — is what sits in
the on-chain `revoked` set. Why is revoking a *hash* enough, and why is it the
privacy-preserving choice?

<details>
<summary>Solution</summary>

```typescript
import * as C from './src/canonical';
import * as fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync('packages/STU-004.package.json', 'utf8'));
const commits = [
  C.fieldCommit('fullName', pkg.values.fullName, C.fromHex(pkg.salts.fullName)),
  C.fieldCommit('degree', pkg.values.degree, C.fromHex(pkg.salts.degree)),
  C.compactCommitUint64(pkg.values.gpa, C.fromHex(pkg.salts.gpa)),
];
const leaf = C.masterLeafV3(commits, C.fromHex(pkg.courseSubRoot), C.fromHex(pkg.salts.master));
console.log('David credId:', C.toHex(C.credIdFromLeaf(leaf)));
console.log('matches package:', C.toHex(C.credIdFromLeaf(leaf)) === pkg.credId);
```

Revoking the credId is enough because the credential's identity IS the
commitment chain: any presentation of that credential recomputes to that exact
credId, and the verifier checks membership in `revoked` on every check.
It's privacy-preserving because the chain (and every observer of it) sees only
a hash enter the revocation set — not *whose* credential died, not why. Only
someone who already possesses the package can connect the credId to a person.
</details>

**Exercise 1.6 (stretch — design a commitment).** A nursing board wants to
commit a license type ("RN", "LPN", "NP") per licensee. Write (in code, using
`canonical.ts` primitives) the commitment call, choosing: the domain prefix,
the field name, and the salt strategy. Then state what an on-chain observer
learns (nothing beyond the fact a 32-byte value exists) and what a verifier
with (value, salt) can check.

<details>
<summary>Solution</summary>

```typescript
import * as C from './src/canonical';
const salt = C.newSalt();   // production: C.kdfSalt(issuerSecret, licenseeId, 'licenseType')
const commit = C.sha256(C.pad32('credvault:field:'), Buffer.from('licenseType'),
                        C.normalize('RN'), salt);
// equivalently C.fieldCommit('licenseType', 'RN', salt)
```

Choices: domain prefix `credvault:field:` (reuse the established field domain —
a license type is a field like any other); field name `'licenseType'`;
salt unique per licensee+field via `kdfSalt`. An observer sees only a 32-byte
value — the value space (3 license types) is tiny, which is exactly why the
salt is non-negotiable here. A verifier given ('RN', salt) recomputes and
compares: match ⇒ the committed license type really is RN.
</details>

---

## 4. Checkpoint quiz

1. **Name the five hash properties and the one used to catch the tampered
   transcript.**
   <details><summary>Answer</summary>Deterministic, fixed-size, avalanche,
   one-way, collision-resistant. The tamper check rides on determinism
   (honest recompute matches) + avalanche (any edit destroys the match).</details>

2. **"Hashing is like encryption without a key manager." Correct or not?**
   <details><summary>Answer</summary>Not correct in the way that matters:
   encryption is reversible with the key; hashing is not reversible at all.
   There's nothing to "manage" because there's nothing to recover — a hash is a
   one-way fingerprint, not a locked box.</details>

3. **Why does a bare hash fail to hide a GPA, and what fixes it?**
   <details><summary>Answer</summary>Only ~401 possible values → dictionary
   attack in milliseconds. Fix: a salted commitment `H(value || salt)` with a
   random 32-byte salt, so each guess would also need the 2²⁵⁶-space salt.</details>

4. **State the two properties of a commitment and the envelope analogy.**
   <details><summary>Answer</summary>Hiding (sealed: observers can't read it)
   and binding (unchangeable: you can't open it to a different value). The
   sealed envelope holds the value privately yet fixes it irrevocably; opening
   reveals exactly what was sealed.</details>

5. **What is domain separation and what breaks without it?**
   <details><summary>Answer</summary>Giving every hash purpose a unique prefix
   (`pad32("credvault:field:")` etc.) so values from different contexts can't
   collide or be replayed across purposes. Without it: cross-context confusion
   attacks (a tree node treated as a credId, a commitment from one app
   replayed in another).</details>

6. **For 10,000 students, how big is a Merkle membership proof, and why does
   that matter for the product?**
   <details><summary>Answer</summary>~14 sibling hashes (log₂10000 ≈ 13.3) — a
   few hundred bytes. It matters because ONE 32-byte root anchors the whole
   cohort (one transaction), yet every graduate still proves membership
   individually and cheaply.</details>

7. **In the cave story, why does repeating the challenge 20 times convince
   Victor, and which ZK property is that?**
   <details><summary>Answer</summary>A liar guesses the called side with
   probability ½ per round; 20 correct exits in a row happen by luck with
   probability ½²⁰ ≈ 10⁻⁶. That's **soundness** — false claims can't be proven
   (except with negligible probability).</details>

8. **Map the three asserts of `verifyMinGPA` to plain English.**
   <details><summary>Answer</summary>(1) The hidden GPA + salt reproduce the
   credential's committed GPA — the proof is about the REAL value Penn State
   committed. (2) That GPA is >= the verifier's minimum. (3) The credential
   isn't revoked. The proof reveals only that all three hold — never the GPA
   or salt.</details>

9. **Why does L3 (full transcript) need NO zero-knowledge proof?**
   <details><summary>Answer</summary>Because nothing is hidden: the holder
   reveals all values, and recomputing the hash and comparing to the on-chain
   commitment IS the proof. ZK is only needed for claims about data that stays
   hidden — and circuits are expensive, so we never put big documents in them
   (the size rule).</details>

10. **In Lab 1.4, what did the four MATCH lines establish, and what single
    remaining step makes a verification complete?**
    <details><summary>Answer</summary>That the presented values + salts
    reproduce the gpaCommit, the masterLeaf, the credId, and the cohort root
    exactly — i.e., the package is internally consistent and untampered.
    Remaining step: check the cohort root is in the on-chain `validRoots`
    set and the credId is not in `revoked` (Modules 2 and 5).</details>

---

## Agent teacher notes

### Pacing (4 hours, typical student)

| Segment | Time | Notes |
|---|---|---|
| 1.1 Hashes + Lab 1.1 | 45 min | Fast if they've seen `sha256sum`; slow if "hash" is a new word. The 5 properties each get a live demo — don't lecture without a terminal. |
| 1.2 Commitments + Lab 1.2 | 60 min | THE module centerpiece. The dictionary-attack demo must be run, not described. Envelope analogy after the demo, not before. |
| 1.3 March story | 15 min | Tell it as a war story. Moral: cross-language byte agreement is a bug farm. |
| 1.4 Merkle + Lab 1.3 | 50 min | Paper FIRST (draw the 4-leaf tree), then code. Students who skip the drawing get lost at `goesLeft`. |
| 1.5 ZK intuition | 30 min | Tell the cave story well — it's the payoff of the whole module. Then read the real circuit; students are always surprised it's 4 lines. |
| Lab 1.4 | 40 min | The graduation exercise of the module. Guard the "MATCH MATCH MATCH MATCH" moment — it's worth real time. |
| Lab 1.5 + exercises + quiz | 30 min | 1.5 is skippable for non-engineers; required for engineers. |

### Misconceptions you WILL hear (and corrections)

- **"Hash = encryption."** → Back to 1.1's one-way-door framing; demo: "here's
  the hash of a word — decrypt it" (they can't; then dictionary-attack it to
  show the *only* way in is guessing, which is why salt matters).
- **"The salt is like a password."** → Passwords authenticate a person; salts
  de-guess a *value*. Nobody logs in with a salt; it's randomness mixed into a
  hash. Also: salts in packages are *eventually revealed at opening* —
  passwords never are.
- **"Commitments hide forever."** → Only until opened — and opening is the
  point. Hiding is against *observers*, not against the verifier the holder
  chooses to present to.
- **"The Merkle tree is stored on-chain."** → No: only the 32-byte root. The
  tree itself lives off-chain (issuer computes it; holder carries their path).
  This is the same on-chain/off-chain split as everything else.
- **"A bigger tree = a bigger on-chain footprint."** → No: root is 32 bytes
  whether the tree holds 4 or 65,536. Only the *path length* grows
  (logarithmically).
- **"The chain runs the GPA comparison."** → No: the circuit ran OFF-chain when
  the proof was minted (issuer side, ~2 s); what's verified (on-chain or
  off-chain) is the *proof*. This confusion is universal; the premint demo in
  Module 6 cures it permanently.
- **"goesLeft is a bug."** → Students often think order-independence should
  hold. `H(a||b) ≠ H(b||a)` is a *feature*: position is part of the proof.
  Have them verify: swap two leaves on paper, watch the root change.

### FAQ answers

- **"Why SHA-256 and not MD5/SHA-1?"** MD5 and SHA-1 have *broken collision
  resistance* (collisions found in practice) — fatal when collision resistance
  is your tamper-evidence. SHA-256 remains unbroken and is what Midnight's
  `persistentHash`/`persistentCommit` use too.
- **"Why is GPA stored ×100?"** Circuits do integer math; there are no floats
  in a ZK circuit. 3.85 → 385. (Bonus: comparisons like `>=` only work on
  unsigned integer types in Compact — a detail you'll meet in Module 3.)
- **"Why uppercase the names before hashing?"** Commitments bind exact bytes;
  "Alice Johnson" and "alice johnson " must not be two different people. One
  canonical form (`normalize()`: trim + uppercase) is chosen and used by
  everyone, forever.
- **"Why 32 bytes of salt — wouldn't 4 be enough?"** 4 bytes = 4 billion
  possibilities ≈ crackable by a laptop in hours. 32 bytes = 2²⁵⁶, the
  atoms-in-the-universe number. Salts are cheap; use real ones.
- **"Could a quantum computer break this?"** Grover's algorithm would halve
  effective hash security (256→128 bits — still fine). Shor's algorithm breaks
  *public-key* schemes (RSA/ECDSA), not hashes. Keep this short; it's trivia
  at this level, and post-quantum planning is a platform concern.
- **"Why does the GPA use a DIFFERENT commitment layout than the other
  fields?"** Because the L2 ZK circuit recomputes *that one* in-circuit, so it
  must match Compact's `persistentCommit` byte-for-byte (Lab 1.5). The other
  fields never enter a circuit, so they use our own canonical layout. One
  commitment, two jobs: L1 tamper-evidence AND L2 predicates (ARCHITECTURE.md
  `15).

### When to let them struggle vs. help

- **Lab 1.2–1.4 code:** expect Buffer/hex confusion (`fromHex`/`toHex`) and
  import-path typos. Give escalating hints, not fixes: (1) "what type does
  `pkg.salts.gpa` have in the JSON?" (2) "and what type does
  `compactCommitUint64` expect?" (3) point at `fromHex`. Intervene directly
  only after two failed iterations.
- **MISMATCH in Lab 1.4:** this is the single most valuable bug in the module —
  make THEM find it with the three-suspects list in the lab text. A student who
  debugs their own MISMATCH understands the scheme twice as well.
- **Cave story:** if they ask "but why can't Victor just film it?", that's the
  zero-knowledge property clicking — celebrate and explain deniability/
  non-transferability briefly. Don't preempt the question; let it come.

### Advance-when criteria (all required before Module 2)

1. Can state the five hash properties unprompted and has run the avalanche
   demo themselves.
2. Can explain *in one breath*: "a bare hash doesn't hide a GPA because 401
   guesses; the salt makes each guess cost 2²⁵⁶."
3. Has Lab 1.4's four MATCH lines on their own screen — and can walk through
   what each line proves.
4. Can draw the 4-leaf Merkle tree and mark Carla's proof siblings from memory.
5. Can retell the cave story and name witness/circuit/proof in the GPA example.
6. ≥ 8/10 on the quiz, misses corrected.

Criterion 3 is non-negotiable — it's the module's whole point made flesh. If
they're short anywhere else, reteach *with the terminal open*; this module does
not work as pure prose.

---

## References

**Code (ground truth — every lab runs on these):**
- `/home/anthony/midnight/apps/credvault/step1-degree/src/canonical.ts` — the
  whole module in one file: `sha256`, `pad32`, `normalize`, `fieldCommit`,
  `compactCommitUint64`, `buildTree`/`getPath`/`recomputeRoot`,
  `credIdFromLeaf`, `kdfSalt` + the pinned Compact test vectors
- `/home/anthony/midnight/apps/credvault/step1-degree/src/verify-core.ts`
  (lines 41–82) — the production version of Lab 1.4
- `/home/anthony/midnight/apps/credvault/step1-degree/contracts/degree.compact`
  — the `verifyMinGPA` circuit (lines 68–76)
- `/home/anthony/midnight/apps/credvault/step1-degree/packages/STU-001.package.json`
  — Alice's real package
- `/home/anthony/midnight/apps/credvault/step1-degree/contracts/probe.compact`
  + `src/probe.ts` — how the persistentCommit layout was cracked

**Project docs:**
- `/home/anthony/midnight/apps/credvault/ARCHITECTURE.md` — `3 (size rule +
  gotchas), `14 (one-canonical-lib decision), `15 (layout research + benchmarks)
- `/home/anthony/midnight/apps/credvault/schemas/college-degree.yaml` — the
  canonical layout + size-rule spec (search "SIZE RULE")
- `/home/anthony/midnight/apps/credvault/docs/step2-runtime-and-l2-runbook.md`
  — the premint "NOT minted" transcript

**Skill library:**
- `/home/anthony/midnight/midnight-expert/plugins/core-concepts/skills/privacy-patterns/SKILL.md`
  — Pattern 1 (commitments), Pattern 3 (Merkle), the common-mistakes table
- `/home/anthony/midnight/midnight-expert/plugins/core-concepts/skills/privacy-patterns/references/commitment-schemes.md`

**Official docs:**
- [Zero-knowledge proofs — Midnight concepts](https://docs.midnight.network/concepts/zero-knowledge-proofs)
- [Compact standard library (persistentHash / persistentCommit)](https://docs.midnight.network/compact/standard-library)
- [SHA-256 (NIST FIPS 180-4)](https://csrc.nist.gov/publications/detail/fips/180/4/final)
