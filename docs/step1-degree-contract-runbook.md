# Step 1 on Your Instance — Degree + Revocation Contract Runbook

> **Goal:** deploy the hand-written CredVault degree contract and run the full
> issuer → holder → verifier flow with 5 mock students, then prove the three
> security cases yourself (valid / revoked / tampered).
> **Prerequisite:** the Step-0 runbook completed on the same instance
> (`step0-hello` exists, its devnet runs). **Time:** ~20 min.

---

## 0. What you are building (the mental model)

```
ISSUER (you, mock Penn State)          CHAIN                 VERIFIER (you, mock employer)
  cohort.json (5 students)              validRoots set ─────────┐
    → commitments + Merkle tree  ──►    revoked set            │ query via indexer
    → anchor root (1 tx, ~22 s)         authority key          │ (0.1 s, no account)
    → packages/*.json  ──►  HOLDER  ──►  presentation.json  ──► recompute & compare
                            (student)                           ✓ VERIFIED / ✗ REVOKED / ✗ INVALID
```

Only 32-byte anchors go on-chain — never names, degrees, or GPAs. Students
generate zero transactions; the only on-chain writes are the issuer's.

---

## 1. Get the step1-degree code onto the instance

The project lives on your laptop at `/home/anthony/midnight/apps/credvault/step1-degree/`.
Copy it (excluding node_modules and build output):

```bash
# FROM YOUR LAPTOP:
cd /home/anthony/midnight/apps/credvault
tar czf /tmp/step1-degree.tgz \
  --exclude=node_modules --exclude=contracts/managed --exclude=.midnight-state.json \
  step1-degree
scp -i ~/.ssh/YOUR-KEY.pem /tmp/step1-degree.tgz ubuntu@YOUR-INSTANCE-IP:~/

# ON THE INSTANCE:
cd ~ && tar xzf step1-degree.tgz && cd step1-degree
npm install && npm dedupe

# Sanity: exactly ONE onchain-runtime line, version 3.0.0 (the §6 fix from
# the Step-0 runbook is already in this package.json — verify it took):
node -e "const l=require('./package-lock.json');
for (const [k,v] of Object.entries(l.packages))
  if (k.includes('onchain-runtime')) console.log(k, '→', v.version)"
```

---

## 2. Make sure the devnet is up

```bash
# NOTE: the devnet lives in the step0-hello project — wherever you scaffolded
# it in the Step-0 runbook (e.g. ~/midnight/step0-hello). Adjust as needed.
cd ~/midnight/step0-hello && docker compose ps
# all 3 services should be "running" (node, indexer, proof-server).
# If not:  docker compose up -d --wait
```

The step1 project points at the same localhost devnet (undeployed) and the
same pre-funded genesis wallet — no faucet, no config needed.

---

## 3. Compile the contract

```bash
cd ~/step1-degree
npm run compile        # compactc 0.31.1 → contracts/managed/degree/{contract,keys,zkir}
```

Read `contracts/degree.compact` while it compiles — 60 lines, and the comments
explain why every piece exists. Note `disclose()` on the authority hash:
that line exists because the compiler REJECTS undisclosed witness-derived
hashes written to the ledger (witness taint).

---

## 4. Deploy + anchor + revoke (the issuer's day)

```bash
npm run issuer deploy          # ~22 s — deploys contract, writes data/deployment.json
npm run issuer add-cohort      # ~22 s — anchors the 5-student cohort root,
                               #         writes packages/STU-00X.package.json
npm run issuer revoke STU-004  # ~25 s — revokes David Kim's credential on-chain
```

What just happened, in learning terms:
- **deploy**: constructor ran in-circuit (issuer secret → authority key) and
  the proof of it was submitted with the deploy tx. ~22 s is mostly proving.
- **add-cohort**: ALL 5 students were committed into ONE Merkle root and
  anchored with ONE transaction. 5 students or 10,000 — same tx, same cost.
- **revoke**: one 32-byte credId went into the on-chain revocation set.
- Open `packages/STU-001.package.json` — this is what a student would download
  once at graduation: values, salts, Merkle path, credId. A few KB.

---

## 5. The tests (prove all three security cases yourself)

### Test 1 — a valid student verifies ✓

```bash
npm run holder STU-001
npm run verifier presentations/STU-001.presentation.json
```

**Expect:** ✅ VERIFIED — Alice Johnson, B.S. Computer Science, GPA 3.85,
not revoked — in ~0.1 s. This is the whole product pitch: instant, no account,
issuer not involved.

### Test 2 — the other valid students also verify ✓

```bash
for s in STU-002 STU-003 STU-005; do npm run holder $s && npm run verifier presentations/$s.presentation.json; done
```

**Expect:** three more ✅ VERIFIED, each with that student's own data.

### Test 3 — the revoked student fails ✗

```bash
npm run verifier presentations/STU-004.presentation.json
```

**Expect:** ✗ REVOKED — this credential was revoked by the issuer.
His package is perfectly well-formed — but his credId sits in the on-chain
revocation set, and that is checkable without calling the school.

### Test 4 — a tampered package fails ✗

```bash
# Give Alice a better GPA (3.85 → 3.95) in a copy of her presentation:
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('presentations/STU-001.presentation.json'));
p.values.gpa=395;
fs.writeFileSync('presentations/STU-001-tampered.presentation.json', JSON.stringify(p,null,2));"
npm run verifier presentations/STU-001-tampered.presentation.json
```

**Expect:** ✗ INVALID — presented values do not match the credential commitment.
One changed character and the hash binding collapses. This is the
doctored-transcript attack dying in 0.0 s.

### Test 5 — a forged package fails ✗ (unknown anchor)

```bash
# Fabricate a package that was never anchored (flip one hex char in masterLeaf):
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('packages/STU-002.package.json'));
p.masterLeaf = 'ff' + p.masterLeaf.slice(2);
p.credId = p.credId; // verifier will recompute from the forged leaf anyway
fs.writeFileSync('presentations/STU-002-forged.presentation.json', JSON.stringify({presentationType:'L3-full-reveal',...p},null,2));"
npm run verifier presentations/STU-002-forged.presentation.json
```

**Expect:** ✗ INVALID — either the values/commitment mismatch or "cohort root
is not anchored on-chain". You cannot invent a credential the chain does not
know about.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `expected instance of StateValue` | runtime duplication | `npm dedupe` (§1), then re-run |
| `No deploy on file` / missing deployment.json | deploy step not run on THIS machine | `npm run issuer deploy` |
| verifier: `contract not found` | devnet was wiped (`down -v`) after deploy | re-run deploy → add-cohort → revoke |
| issuer cmds hang at proof server | proof-server container down | `cd ~/midnight/step0-hello && docker compose up -d --wait` |
| compile errors about `disclose` | witness taint (by design) | see the comment in degree.compact — do not remove the disclose() |

---

## 7. Cleanup

```bash
cd ~/midnight/step0-hello && docker compose down  # stop devnet (volumes kept:
                                               # your contract + anchors persist)
# Stop the AWS instance when done. `docker compose up -d --wait` next time
# resumes the SAME chain — your deployment and revocations are still there.
```

---

## 8. Where this sits in the build

This was **Step 1** of the CredVault plan (ARCHITECTURE.md §7): the hand-written
contract proving membership ∧ non-membership. Next is **Step 2** — the issuer
runtime around this contract (batched roots, proof service, pre-minted
packages) and the first real ZK predicate (L2: "GPA ≥ 3.5" proven WITHOUT
revealing the GPA). Details in ARCHITECTURE.md §14.