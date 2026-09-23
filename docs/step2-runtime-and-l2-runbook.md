# Step 2 on Your Instance — Issuer Runtime + L2 ZK Proofs Runbook

> **Goal:** run the complete CredVault Step-2 stack on your AWS instance:
> issuer runtime batches, L2 zero-knowledge GPA proofs, off-chain trustless
> verification, and the stateless HTTP verifier service.
> **Prerequisite:** Step-1 runbook completed (devnet running, step1-degree present).
> **Time:** ~25 min. **You will prove things that feel impossible.** Have fun.

---

## 0. What you are about to run (the mental model)

```
ISSUER (runtime.ts)                        VERIFIER (you)
  batch: cohort → ONE anchor tx              L1: recompute root → on-chain? revoked?
  premint: ~2s ZK proof per student          L2: replay deploy tx → wellFormed(proof)
  (off-chain, no gas)                        → "GPA ≥ 3.50: TRUE" — GPA never revealed
```

Key fact to internalize: the ~22s tx loop is balancing/submission overhead.
RAW PROVING is ~2 seconds. On-demand proofs are viable UX.

---

## 1. Refresh the code on the instance

```bash
# FROM YOUR LAPTOP:
cd /home/anthony/midnight/apps/credvault
tar czf /tmp/step1-degree.tgz \
  --exclude=node_modules --exclude=contracts/managed --exclude=.midnight-state.json \
  --exclude=data/deployment.json --exclude=data/manifest.json \
  step1-degree
# (deployment.json/manifest.json are machine-specific — shipping them makes the
#  runtime poll forever for a contract that only exists on the OTHER machine)
scp -i ~/.ssh/YOUR-KEY.pem /tmp/step1-degree.tgz ubuntu@YOUR-INSTANCE-IP:~/

# ON THE INSTANCE (replaces the old copy):
cd ~ && rm -rf step1-degree && tar xzf step1-degree.tgz && cd step1-degree
npm install && npm dedupe
node -e "const l=require('./package-lock.json');
for (const [k,v] of Object.entries(l.packages))
  if (k.includes('onchain-runtime')) console.log(k, '→', v.version)"
# → must be exactly ONE line, version 3.0.0
```

## 2. Devnet up + compile

```bash
cd ~/midnight/step0-hello && docker compose up -d --wait && docker compose ps
cd ~/step1-degree && npm run compile
```

The contract now has THREE circuits: addCohortRoot, revokeCredential, and the
new L2 circuit verifyMinGPA (read it in contracts/degree.compact — the comments
explain why each assert exists).

## 3. Deploy + first batch (issuer runtime)

```bash
npm run runtime batch
```

Watch for: "deployed (with capture)" — the proven DEPLOY transaction is saved
to data/deploy-proof.bin. That file is the key to off-chain verification:
the verifier replays it to rebuild a ledger state WITH the verifier keys
(the why is in the chat notes / ARCHITECTURE.md §15).

## 4. Pre-mint the L2 ZK proofs

```bash
npm run premint
```

Expected output — read it carefully, it tells the whole L2 story:

```
  STU-001 @>=3.00: minted [1.8s]     (Alice 3.85 — passes both)
  STU-001 @>=3.50: minted [1.8s]
  STU-002 @>=3.00: minted [1.7s]
  STU-002 @>=3.50: NOT minted (failed assert: GPA below the required minimum)
                                     (Brian 3.42 — correctly rejected at 3.50)
  STU-004 @>=3.00: NOT minted ...    (David 2.99 — fails BOTH, correctly)
  ...
```

The circuit REJECTS false claims locally, before any proving. A ZK system
cannot produce a proof of a false statement — you are watching why.

---

## 5. THE TESTING SUITE (10 tests — the full Step-2 gauntlet)

### Test 1 — L1: valid student verifies ✓
```bash
npm run holder STU-001
npm run verifier presentations/STU-001.presentation.json
# Expect: ✅ VERIFIED — Alice Johnson, B.S. Computer Science, GPA 3.85 (~0.1s)
```

### Test 2 — L1: revoked student fails ✗
```bash
npm run runtime revoke STU-004        # ~25s — revoke on-chain first
npm run holder STU-004
npm run verifier presentations/STU-004.presentation.json
# Expect: ✗ REVOKED — this credential was revoked by the issuer
```

### Test 3 — L1: tampered package fails ✗
```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('presentations/STU-001.presentation.json'));
p.values.gpa=395; fs.writeFileSync('presentations/tampered.json', JSON.stringify(p,null,2));"
npm run verifier presentations/tampered.json
# Expect: ✗ INVALID — presented values do not match the credential commitment
```

### Test 4 — L2: ZK threshold proof verifies ✓ (THE magic)
```bash
npm run verifier presentations/STU-001.presentation.json -- --min-gpa 350
# Expect: ✅ VERIFIED ...  L2: ✅ ZK PROOF VALID — GPA >= 3.50
#         (threshold proven in zero knowledge, GPA itself never revealed)
#         total ~0.2s, off-chain, no transaction
```

### Test 5 — L2: another student, lower bar ✓
```bash
npm run holder STU-003 && npm run verifier presentations/STU-003.presentation.json -- --min-gpa 300
# Expect: ✅ VERIFIED + L2: ✅ ZK PROOF VALID — GPA >= 3.00
```

### Test 6 — L2: threshold with NO valid proof fails honestly ✗
```bash
npm run holder STU-002 && npm run verifier presentations/STU-002.presentation.json -- --min-gpa 350
# Expect: L1 ✅ VERIFIED (Brian is a real graduate!)
#         L2: ✗ no pre-minted proof for GPA >= 3.50
# Note the layering: his CREDENTIAL is valid; the 3.50 CLAIM is what fails.
```

### Test 7 — L2: the impossible-proof test (think about this one)
```bash
npm run premint 2>&1 | grep STU-002
# Expect: STU-002 @>=3.50: NOT minted (failed assert: GPA below the required minimum)
# There is NO WAY to mint "Brian >= 3.50" — not by him, not by us, not by anyone.
```

### Test 8 — multi-cohort: old packages survive new batches ✓
```bash
cp packages/STU-001.package.json presentations/old-root.json
node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('data/cohort.json'));
c.students.push({id:'STU-006', fullName:'Frank Torres', degree:'B.S. Physics', gpa:392});
fs.writeFileSync('data/cohort.json', JSON.stringify(c,null,2));"
npm run runtime batch            # anchors a SECOND root (~25s)
npm run premint >/dev/null 2>&1  # re-mint for new packages
npm run verifier presentations/old-root.json
# Expect: ✅ VERIFIED — the OLD root is still accepted (historic roots:
# the validRoots set never removes, so old proofs never expire)
npm run holder STU-006 && npm run verifier presentations/STU-006.presentation.json
# Expect: ✅ VERIFIED — new student too
```

### Test 9 — rectification: correct a record, old one stays revoked ✓
```bash
# Scenario: David Kim's GPA was mis-entered (2.99 → should be 3.49).
node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('data/cohort.json'));
c.students.find(s=>s.id==='STU-004').gpa=349;
fs.writeFileSync('data/cohort.json', JSON.stringify(c,null,2));"
npm run runtime batch            # third root anchored
npm run premint >/dev/null 2>&1
npm run holder STU-004 && npm run verifier presentations/STU-004.presentation.json
# Expect: ✅ VERIFIED — GPA 3.49 (the CORRECTED record, new commitment)
# His old revoked credId remains revoked forever — corrections create a new
# anchor, never rewrite history.
```

### Test 10 — the stateless HTTP verifier service (portal precursor)
```bash
npx tsx src/service.ts > service.log 2>&1 &   # starts on :4050, logs to file
sleep 10                                   # tsx + ledger WASM boot can exceed 4s
cat service.log                            # MUST show: "credvault verifier service on :4050"
curl -s localhost:4050/health              # → {"status":"ok",...}
npx tsx src/test-service.ts
# Expect:
#   STU-001 … → 200 VERIFIED — anchored, not revoked, and GPA >= 3.50 proven
#               in zero knowledge (~150ms)
#   STU-004 … → 422 REVOKED — credential was revoked by the issuer (~15ms)
#   old-root  … → 200 VERIFIED (~13ms)
kill %1 2>/dev/null || pkill -f "tsx src/service"
```

---

## 6. Benchmarks to expect

| Operation | Expected |
|---|---|
| runtime batch (deploy + anchor) | ~22-25 s per tx |
| premint per L2 proof | **~2 s** (off-chain, no gas) |
| L1 verification | ~0.1 s |
| L2 verification (off-chain, trustless) | ~0.15-0.2 s |
| HTTP verify | 13-15 ms (L1), ~150 ms (with L2) |

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `expected instance of StateValue` | `npm dedupe` (§1) — two runtime copies |
| `does not have a verifier key` | stale deploy-proof.bin from an OLD contract — re-run `runtime batch` after deleting data/deployment.json |
| `no pre-minted proof` after a new batch | packages were regenerated — re-run `npm run premint`, then re-run `holder` for a fresh presentation |
| `Contract address not set` | code bug — setContractAddress before private-state set (already fixed in repo) |
| verifier says CONTRACT_NOT_FOUND | devnet was wiped (`down -v`) — redeploy: `rm data/deployment.json && npm run runtime batch` |
| `runtime batch` HANGS after printing cohort root | stale data/deployment.json (from the tarball or a wiped chain) — the runtime is polling for a contract that isn't on this chain. `rm -f data/deployment.json data/manifest.json` and rerun (fixed in repo: it now probes + auto-redeploys) |

## 8. Files worth reading (learning order)

1. `contracts/degree.compact` — 3 circuits, heavily commented
2. `src/canonical.ts` — the commitment scheme + the CRACKED persistentCommit layout
3. `src/runtime.ts` — the issuer batch tool
4. `src/premint-l2.ts` — off-chain proof minting
5. `src/l2.ts` — the off-chain verification recipe (deploy replay)
6. `src/verify-core.ts` + `src/service.ts` — the stateless verifier service


---

# ═══════════════════════════════════════════════════════════════════════════
# STEP 2b — Per-course verification (subset presentations)
# ═══════════════════════════════════════════════════════════════════════════

Scheme v3: each student's courses form a Merkle sub-tree committed into their
master leaf. The holder reveals ANY SUBSET of courses; the verifier recomputes
the sub-root from just those leaves + paths. Reveal-style (hash-compare), no
circuits, no gas — and no new transactions.

## Run it (after the Step-2 §1-2 refresh)

```bash
npm run compile 2>/dev/null; npm run runtime batch && npm run premint
```

## The Step-2b test suite

### Test 2b-1 — full reveal: whole transcript verifies
```bash
npm run holder STU-001 && npm run verifier presentations/STU-001.presentation.json
# Expect: ✅ VERIFIED + Courses (revealed 5 of 5), each printed with grade
```

### Test 2b-2 — SUBSET: share only 2 courses
```bash
npm run holder STU-001 -- --courses MATH420,CS460
npm run verifier 'presentations/STU-001-MATH420+CS460.presentation.json'
# Expect: ✅ VERIFIED + "(revealed 2 of 5)" + "… 3 more course(s) SEALED"
# The verifier learns ONLY those 2 courses — and can still prove they belong
# to the anchored credential. THIS is the demo that shows selective disclosure.
```

### Test 2b-3 — tampered course grade fails
```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('presentations/STU-001-MATH420+CS460.presentation.json'));
p.courses.find(c=>c.code==='MATH420').grade='B+';
fs.writeFileSync('presentations/tampered-course.json', JSON.stringify(p,null,2));"
npm run verifier presentations/tampered-course.json
# Expect: ✗ TAMPERED — one changed letter and the sub-root no longer converges
```

### Test 2b-4 — anti-cherry-picking: swap in ANOTHER student's course
```bash
node -e "const fs=require('fs');
const a=JSON.parse(fs.readFileSync('presentations/STU-001-MATH420+CS460.presentation.json'));
const b=JSON.parse(fs.readFileSync('packages/STU-004.package.json'));
a.courses[0]=b.courses.find(c=>c.code==='MATH420');
fs.writeFileSync('presentations/mixed.json', JSON.stringify(a,null,2));"
npm run verifier presentations/mixed.json
# Expect: ✗ TAMPERED — David Kim's A- can't be stitched into Alice's transcript:
# every revealed course path must converge to the SAME sub-root
```

### Test 2b-5 — L2 still works on v3 packages
```bash
npm run verifier presentations/STU-001.presentation.json -- --min-gpa 350
# Expect: ✅ VERIFIED + L2: ✅ ZK PROOF VALID — GPA >= 3.50
```

### Test 2b-6 — revocation unchanged
```bash
npm run runtime revoke STU-004 && npm run holder STU-004
npm run verifier presentations/STU-004.presentation.json
# Expect: ✗ REVOKED
```

## ⚠ TTL gotcha (bit us hard — read before debugging L2)

If L2 verification fails with "Intent TTL has expired": midnight-js stamps
intents with a ~1h TTL (a SUBMISSION-window default), and the ledger checks it
against the **tblock argument** of wellFormed (NOT proof soundness, NOT the
state clock, NOT mutable via the JS ttl setter). Our fixes, already in the repo:
- deploy replay validates with tblock = deployedAt + 30min (inside its window)
- L2 proofs validate with tblock = their mint time (mintedAt in the package)
- off-chain proofs are slimmed to the contract-call intent only (no dust offers)

---

# ═══════════════════════════════════════════════════════════════════════════
# STEP 2c — Monolithic transcript mode (issuer chooses: no per-course entry)
# ═══════════════════════════════════════════════════════════════════════════

Some issuers want whole-transcript verification WITHOUT structuring courses.
They pick transcriptMode: monolithic at onboarding. SAME CSV ingestion, SAME
contract, SAME pipeline — only the commitment policy differs:
  granular   → per-course sub-tree (subsets possible)
  monolithic → whole transcript = ONE docCommit blob (all-or-nothing)

## Run it (demo: a second university with a different policy, same contract)

```bash
npm run runtime batch data/cohort-monolithic.json   # "Monolithic University"
npm run premint                                     # ← REQUIRED after EVERY batch:
                                                    # packages regenerate with empty
                                                    # l2Proofs. Rule: batch → premint → share.
# then regenerate presentations (holder) — stale ones have no proofs
```

## The 2c test suite

### 2c-1 — monolithic transcript verifies whole
```bash
npm run holder MON-001 && npm run verifier presentations/MON-001.presentation.json
# Expect: ✅ VERIFIED + all 4 courses printed (revealed 4 of 4)
```

### 2c-2 — one changed character kills it
```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('presentations/MON-001.presentation.json'));
p.courses.find(c=>c.code==='BIO305').grade='B';
fs.writeFileSync('presentations/mono-tampered.json', JSON.stringify(p,null,2));"
npm run verifier presentations/mono-tampered.json
# Expect: ✗ TAMPERED — transcript document does not match its commitment
```

### 2c-3 — subset on a monolithic issuer = honest refusal
```bash
npm run holder MON-001 -- --courses BIO305
# Expect: ✗ this issuer uses MONOLITHIC mode — subsets are not possible;
#           share the full transcript instead.
```

### 2c-4 — regression: granular issuer subsets still work
```bash
npm run holder STU-001 -- --courses MATH420
npm run verifier presentations/STU-001-MATH420.presentation.json
# Expect: ✅ VERIFIED (revealed 1 of 5, 4 SEALED)
```

## Onboarding note (the PDF question)

Colleges NEVER parse PDFs with us: every SIS (Banner, PeopleSoft, Workday,
PowerSchool) exports CSV/API natively — that is how they feed the
Clearinghouse today. Ingestion ladder: (1) CSV cohort file, (2) SIS API
connector per school, (3) PDF text extraction as best-effort fallback only.
PDFs are something we RENDER from data, never something we trust as input.
## 9. Cleanup

```bash
pkill -f "tsx src/service" 2>/dev/null; cd ~/midnight/step0-hello && docker compose down
# Stop the AWS instance when done. Everything persists for next time.
```