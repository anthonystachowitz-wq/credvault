# Capstone Rubric — State Board of Physical Therapy Examiners

> **Assesses:** the Module 8 §5 capstone (a licensing-board issuer built end to end on the CredVault stack).
> **Used by:** the agent-teacher or human assessor scoring the capstone.
> **Time:** 6–8 h student effort (two sessions) + ≤10 min live demo. **Mode:** individual or pairs.
> **Related:** `learning/module-08-going-to-production.md` §5 (the brief), `apps/credvault/step1-degree/` (the stack), `learning/glossary.md` (shared vocabulary).

Everything in this rubric is observable. Each dimension lists the exact log lines, verdicts, and behaviors the assessor watches for — quote them back to the student when giving feedback. If a behavior cannot be reproduced on demand, it did not happen.

## 1. Scoring overview

Six dimensions, scored 1–4 each, then weighted:

| # | Dimension | Weight | The one-sentence question |
|---|---|---|---|
| 1 | Schema design | 20% | Did they design a credential a licensing board could actually use? |
| 2 | Working pipeline & idempotence | 20% | Does their issuer pipeline run clean, and do re-runs converge? |
| 3 | Verifier flows | 20% | Do the board's three daily checks work, including the negative cases? |
| 4 | Operations drill | 15% | Can they revoke promptly and correct records without breaking history? |
| 5 | Security analysis | 15% | Do they know what is on-chain, what is not, and why? |
| 6 | Presentation & honesty | 10% | Does the demo run clean and name its own limitations? |

**Level scale (applied to every dimension):**

| Level | Name | Generic meaning |
|---|---|---|
| 4 | Exemplary | Correct *and* explains why; handles the assessor's curveballs; teaches something back. |
| 3 | Proficient | Correct with the brief's guidance; minor wobbles, self-corrected. (This is the bar.) |
| 2 | Developing | Partially correct; needed rescue, or a required case is missing. |
| 1 | Beginning | Missing, broken, or not reproducible. |

**Computation:** `score% = Σ (level ÷ 4 × weight)`. Example: levels 3,4,3,3,4,3 → (0.75×20 + 1.0×20 + 0.75×20 + 0.75×15 + 1.0×15 + 0.75×10) = 83.75% → Merit.

**Thresholds:**

| Outcome | Requirements |
|---|---|
| **Distinction** | ≥ 90%, Tier B complete (§8), no dimension below 3 |
| **Merit** | ≥ 80%, no dimension below 2, dimensions 2 & 3 ≥ 3 |
| **Pass** | ≥ 70%, no dimension at 1, dimensions 2 & 3 ≥ 3 |
| **Resubmit** | anything below Pass — re-assess only the failed dimensions, one re-attempt, within one week |

Dimensions 2 and 3 are the technical core; a beautiful design doc cannot compensate for a pipeline that does not run.

## 2. Dimension 1 — Schema design (weight 20%)

**Evidence:** the design doc (Deliverable 1), reviewed at the midpoint — before any batch runs.

**What the assessor observes:**

- Fields mapped to the three questionnaire kinds: direct-match (`licenseeName` reveal; `licenseType` reveal + equality), conditional (`ceHours` as an unsigned integer with a stated scale), match-set (CE modules `{moduleCode, title, hours, grade}`, max ≤ 40).
- The **×10 scale** is stated and justified ('30.0 hours → 300; no floats, comparisons on `Uint<N>` only').
- The **granular vs monolithic** decision is defended in 3–5 sentences against the alternative — a granular choice must cite the privileging-committee case (proving the ethics module individually); a monolithic choice must explain how that proof happens (it cannot — see §11 fairness rule).
- Revocation: cadence `prompt`, mechanism revocation-set, with one sentence on why a board's runtime must stay reachable (ARCHITECTURE.md §5).
- The holder-visible disclosure story: what each verifier type learns at each level.

| Level | Observable behavior |
|---|---|
| 4 | All of Proficient, plus: anticipates edge cases in the doc (renewal cycles, expired licenses, a licensee with 0 modules), and the granular defense names the anti-cherry-picking convergence check by its mechanism, not just its name. |
| 3 | Three kinds correct; ×10 scale stated with the no-floats reason; mode choice defended against the alternative; prompt-revocation cadence with rationale. |
| 2 | Fields listed but kinds muddled (e.g., `ceHours` as direct-match with no scale); mode chosen with a one-line justification; revocation mentioned without cadence. |
| 1 | Doc is a field list with no kinds, no scale, no mode decision, or no revocation story. |

**Failure modes → feedback:**

- *×10 scale missing or wrong (e.g., ×100 by GPA habit).* Say: 'Show me the integer 300 in your data and tell me what it means in hours. What breaks if a licensee logs 30.05 hours — and does your scale admit 30.05?' Point to Module 8 §5 Deliverable 1 and the `gpa: uint-x100` comment in `schemas/college-degree.yaml` as the pattern to imitate, not copy.
- *Mode chosen with no defense.* Say: 'A hospital asks: did PT-042 complete the ethics module? Walk me through the proof under your choice.' Let the silence do the teaching, then assign the honest-refusal demo (Dimension 3) as the corrective experience.
- *Revocation 'batch' cadence.* Say: 'A therapist is suspended today, effective now. Your runtime is off until May. Who is harmed, and which flag in ARCHITECTURE.md §5 exists because of exactly this?'

## 3. Dimension 2 — Working pipeline & idempotence (weight 20%)

**Evidence:** `data/board-roster.csv`, captured batch + premint logs, `data/manifest.json`, the `packages/` listing, and the idempotent re-run log (Deliverables 2–3).

**What the assessor observes (exact strings — grep the submitted logs for them):**

- Roster meets the brief: ≥ 10 licensees in the 8-column CSV format, with the three planted edge cases — one to-be-revoked (PT-007), one below 30.0 CE hours, one with 8+ modules.
- Batch log shows ONE anchor transaction for the whole roster: `✅ root anchored (10 students, ONE tx): <txId>` and `✅ 10 packages + manifest written`.
- Premint log shows the below-30 licensee correctly **rejected at the circuit**: `PT-xxx @>=3.00: NOT minted (failed assert: GPA below the required minimum)` — two things are checked here: the assert message (from `verifyMinGPA` in `contracts/degree.compact`), and the student's narration of the display — `premint-l2.ts` prints thresholds divided by 100 (the college GPA label), so their 30.0-hour bar renders as 3.00. The mapping note (30.0 h × 10 = 300) must appear in their docs and be said aloud.
- Idempotent re-run: `⏭  root ALREADY anchored — unchanged cohort, skipping transaction (idempotent).` and per-student `already minted, skipping`. (The `⏭` line has two spaces after the symbol when grepping.)
- `cat data/manifest.json` shows the roster's student count and exactly one `anchoredTx`.
- Console-driven batches additionally show the auto-premint chain: `── anchoring done; minting L2 proofs (premint)…`.

| Level | Observable behavior |
|---|---|
| 4 | All of Proficient, plus: explains *why* the re-run is free (deterministic `kdfSalt` → identical commitments → root-exists skip) and what would change it (any edited record → new leaf → new credId → new anchor). Tier-B students reach 4 here by re-running the full matrix after the rename. |
| 3 | Batch, premint, packages, manifest all present and correct; the NOT-minted line for the below-30 licensee is captured; idempotent re-run demonstrated with the two log lines. |
| 2 | Pipeline runs but evidence is incomplete (no premint log, or the idempotence re-run was 'done yesterday' and cannot be reproduced). |
| 1 | Batch fails, packages missing, or logs cannot be produced on demand. |

**Failure modes → feedback:**

- *The re-run anchored a second root.* Their 'unchanged' CSV was not unchanged (or they edited between runs and did not notice). Say: 'Diff the two roster files. A changed record *should* anchor — that is rectification working. Which row moved?' This becomes a teaching moment, not a deduction, if they can find the diff.
- *No NOT-minted line because everyone passed 30.0.* The planted below-threshold licensee is missing. Say: 'Where is the licensee your design doc promised could never hold a 30.0 proof? Re-add them and re-run premint — I want to watch the circuit refuse.'
- *Student verified with a threshold during the premint gap and got `L2_UNAVAILABLE`.* Not a pipeline failure — ask them to explain the batch → premint → share rule and what the portal does about it (Module 7 §1.4). Explaining it well counts toward Dimension 6.

## 4. Dimension 3 — Verifier flows (weight 20%)

**Evidence:** live demo (Deliverable 4) through the apps — portal, holder app, verifier page. CLI (`npm run holder` / `npm run verifier`) is acceptable as backup evidence, never as the primary flow.

**What the assessor observes — all six cases:**

1. **License current (L1):** share a licensee, verifier page 'Degree check only' → `✓ VERIFIED — anchored on-chain and not revoked`.
2. **CE requirement met (L2, hidden value):** holder unchecks 'Show GPA value' (the mapped CE field), shares, verifier selects the ≥ 300 threshold → `✓ VERIFIED — anchored, not revoked, and GPA >= 3.00 proven in zero knowledge`, with the `SEALED by holder` pill and the `GPA ≥ 3.00 — proven without revealing GPA` pill. **The student must say the mapping out loud: '300 is 30.0 hours × 10'** — the page still renders the college wording; explaining that is part of the flow (and a Dimension 6 limitation).
3. **Proof the value never traveled:** open the drop entry or the posted JSON — `values` has no `gpa` key, `salts` has no `gpa` key, `gpaCommit` and `gpaRedacted: true` present. (Module 7 Lab 7.3 step 4 is the procedure.)
4. **Below-threshold honesty:** the below-30 licensee at the ≥ 300 check → `✗ L2_UNAVAILABLE — no pre-minted proof for GPA >= 3.00`, and the student explains *why no proof can exist* (the circuit asserts before proving; a false claim is unprovable by anyone).
5. **Ethics module (subset):** holder shares only `PT-ETH-101` → `✓ VERIFIED` with 'revealed 1 of N' and 'N−1 more course(s) SEALED by the holder'.
6. **Tamper (one demonstrated case):** flip one grade or hour value in a presentation → `✗ TAMPERED — presented values do not reproduce the credential commitment`.

*Monolithic choosers:* cases 1, 2, 4, 6 as above; case 5 becomes the **honest refusal** — the holder app shows 'This credential is whole-document only (issuer policy).' (or the holder CLI exits with the monolithic message) — and the student states what that refusal costs the board.

| Level | Observable behavior |
|---|---|
| 4 | All six cases clean, plus: the student volunteers the convergence explanation for case 5 ('every revealed path must rebuild the same sub-root — that is why a stitched-in module fails') and demonstrates it or describes the `mixed.json` test accurately. |
| 3 | Cases 1–6 (or the monolithic equivalent) all demonstrated live; mapping stated aloud; negative cases shown without prompting. |
| 2 | Happy paths only; assessor had to request the negative cases; or case 3's JSON inspection is hand-waved. |
| 1 | Flows fail, or 'privacy' is claimed while the value is visibly on screen. |

**Failure modes → feedback:**

- *Checked 350 because '3.50'.* The ×10-mapping slip (Module 8's named classic). Say: 'Your data stores hours ×10. What does 350 mean in hours, and which licensees clear it?' Have them re-run at 300 and narrate the difference.
- *Re-shared the link to 'show' revocation.* That is Dimension 4's trap — see §5; here, note that re-sharing proves nothing about the old link.
- *Skipped the tamper case.* Say: 'Show me one character that breaks it.' The one-liner from `docs/step2-runtime-and-l2-runbook.md` (Test 3) is the template; watching `TAMPERED` land in single-digit milliseconds is the point.

## 5. Dimension 4 — Operations drill (weight 15%)

**Evidence:** live or log-captured (Deliverable 5): the prompt revocation, the rectification, the idempotence re-run.

**What the assessor observes:**

1. **Prompt revocation:** PT-007's link is shared and shown `✓ VERIFIED` *first*; the revoke runs (console button or `npm run runtime revoke PT-007`, ~25 s); the **exact same URL** is re-opened → `✗ REVOKED — credential was revoked by the issuer`. The student says the required sentence: **'the same link now says REVOKED.'**
2. **Rectification, in the only correct order:** revoke the mis-entered licensee's *current* credId **first**, *then* fix the roster and re-batch. The student explains why the order is forced: `runtime.ts cmdRevoke` reads the credId from `packages/<ID>.package.json`, and a re-batch rewrites that file with the NEW credId — so revoking after the re-batch would kill the corrected credential and leave the wrong one live.
3. **History preserved:** the corrected record verifies (new leaf, new credId, new anchor); the old credId remains `REVOKED` (re-present a stale package or state it precisely); the student says 'corrections create new anchors; history is never rewritten.'
4. **Idempotence evidence:** the unchanged re-run log from Dimension 2 is referenced here as the operational payoff.

| Level | Observable behavior |
|---|---|
| 4 | All of Proficient, plus: the student articulates why license boards cannot be batch-only (prompt-revocation duty, ARCHITECTURE.md §5) in their own words, and catches the ordering trap *before* the assessor springs it. |
| 3 | Revoke-flip demonstrated on the same URL with the required sentence; rectification done in the correct order with the mechanical explanation; old-stays-revoked shown. |
| 2 | Revocation shown but the link was re-shared; rectification completed but order/explanation wrong (rescued by assessor hint). |
| 1 | Revocation or rectification not demonstrated, or the student believes editing a package 'updates the chain.' |

**Failure modes → feedback:**

- *Re-batched first, then revoked — and killed the NEW credId.* This is the drill's designed trap, and it leaves the system in its worst state: the NEW (correct) credential is revoked and the OLD (wrong) one still verifies. Feedback: 'Read `cmdRevoke` in `runtime.ts` — where does the credId come from? What did your last batch write to that file?' Let them discover it in the code. Full recovery has three parts, and the student should narrate all three: (1) `revoked` is insert-only — `degree.compact` has no un-revoke circuit, so the killed credId is dead forever; (2) the OLD credId must still be revoked — restore the old package file (or hand it to the revoke path), because `cmdRevoke` reads `packages/<ID>.package.json`; (3) a valid credential requires a THIRD credId — make one more real roster change (a newly completed module is realistic), re-batch, re-premint. Hitting the trap and explaining the full recovery earns Developing–Proficient; spotting the trap *before* running anything earns Exemplary.
- *Old credId verifies after rectification.* The old record was never revoked (step skipped). Say: 'A hospital checked the *old* credential an hour ago. What stops it from working today?' Answer: the revoke-first step they skipped.

## 6. Dimension 5 — Security analysis (weight 15%)

**Evidence:** the security write-up (a section of the design doc is fine) plus the assessor's four gate questions, asked live.

**The four gate questions (from Module 8, applied to *their* board):**

1. What, byte for byte, is on the chain for your board? (Expected: 32-byte anchors only — cohort roots in `validRoots`, credIds in `revoked`, the sealed `authority` key. No names, no license numbers, no hours.)
2. A colleague proposes anchoring `H(licenseeName)` 'for lookup.' Why is that a breach? (Expected: dictionary brute-force on low-entropy names; `persistentHash` binds but does not hide; person-linked values need salted commitments — Module 8 §1.7 Rule 1.)
3. Who holds the licensee data, and what does CredVault store? (Expected: the board holds everything — system of record; CredVault stores nothing but transient TTL-drop bundles; the portal is a pure function plus one chain read — Module 7 §1.2.)
4. Which single component ever sees real CE-hour values, and where must it run? (Expected: the proof server, at premint time, on the issuer's private infrastructure — Module 8 §1.2/§1.7 Rule 4.)

Also observed: salt discipline in their own words (never reuse across different data; domain separation; why deterministic `kdfSalt` is the licensed exception), the issuer secret's meaning (it *is* the board on-chain — the dev placeholder in `src/common.ts` must be named as such), and the package-as-capability model (whoever holds the package can present it; localStorage is not a vault; re-issuance is the remedy).

| Level | Observable behavior |
|---|---|
| 4 | Answers all four gates crisply, then volunteers a fifth insight (e.g., why even the *indexer* learns nothing about licensees, or why redaction removes the value from the bundle rather than hiding it). |
| 3 | Four gates answered correctly, in their own words, with the right mechanisms named (salted commitment, TTL drop, proof server). |
| 2 | Two or three gates correct; vague mechanism names ('it's hashed so it's safe' without the entropy caveat). |
| 1 | Believes data is 'encrypted on the blockchain,' or that the portal keeps a credential database, or cannot say where the GPA/CE value goes during verification. |

**Failure modes → feedback:**

- *'It's encrypted on-chain.'* Say: 'Walk me through `verify-core.ts` step 3–5 — what does the verifier read from the indexer, and where are the decryption keys?' (There are none; there is nothing to decrypt — that is the design.) Assign `learning/glossary.md` entries *anchor*, *commitment*, *stateless verifier*.
- *Salts treated as decoration.* Say: 'Two licensees both logged exactly 30.0 hours. Unsalted, what do their hour-commitments look like, and what does that leak?' (Identical commitments → correlation. Salts break it; deterministic salts break it *and* keep batches idempotent.)

## 7. Dimension 6 — Presentation & honesty (weight 10%)

**Evidence:** the ≤10-minute live demo (Deliverable 6) plus Q&A.

**What the assessor observes:**

- Runs without notes, in order (batch → three flows → drill), within time.
- Timings stated from the student's own runs (anchor ≈ 22–25 s, premint ≈ 2 s/proof, verification ≈ 0.1 s devnet / ≈ 1 s hosted indexer) — not recited from the runbook.
- Limitations named unprompted: Tier-A label mismatch ('the page says GPA; it means CE hours — the generator fixes this'), one shared contract (no per-issuer deployment), demo-grade console auth, the verifier-page threshold wording.
- Curveball handling: the assessor asks one unscripted question (e.g., 'what happens if the portal dies mid-batch?' — the subprocess job is unaffected; or 'why is the QR not the credential?').

| Level | Observable behavior |
|---|---|
| 4 | A narrative, not a checklist: the student explains the *why* as they go, names limitations before being asked, and lands the curveball. |
| 3 | Complete, live, on-time, honest about limitations when asked. |
| 2 | Overruns, reads from notes, or one section replayed from a recording without disclosure. |
| 1 | Demo fails and cannot be recovered live, or a failure is concealed (auto-fail of the dimension and an integrity conversation — §11). |

**Failure modes → feedback:**

- *Hides a mid-demo failure.* Name it plainly: 'A demo that shows its scars scores higher than one that pretends not to have them — that is a stated criterion, not a preference.' Re-run the failed segment together and score what you see.
- *Recites runbook timings that don't match their logs.* Say: 'Your anchor took 31 seconds, not 22 — good. Tell me what made yours slower.' (First deploy in the session, a bigger tree, premint load — any grounded answer scores.)

## 8. Tier-A vs Tier-B differentiation guide

The capstone has two implementation tiers (Module 8 §5, Deliverable 2). Both are legitimate completions; they differ in *how real* the schema rename is.

| | **Tier A — field mapping (required baseline)** | **Tier B — true rename (stretch)** |
|---|---|---|
| What changes | Only data + documentation: `fullName` ← licenseeName, `degree` ← licenseType, `gpa` ← ceHours ×10, courses ← CE modules, recorded in a mapping table | The schema's public names change in the code itself, package format bumped to `credvault-ptlicense/0.1` |
| What the verifier page says | 'Degree / GPA' — a declared, documented limitation | 'License type / CE hours' — the real words |
| Effort | ~1 h | ~2–3 h plus a full re-run of the test matrix |
| Scoring effect | Full Pass and Merit available; Dimension 1 capped at 3 unless the design doc is exceptional | **Required for Distinction**; the natural route to 4s in Dimensions 1, 2, and 6 |
| Risk | none | Rename touches commitments → all credIds change → stale presentations fail until the pipeline is fully refreshed (below) |

**The Tier-B rename map (verified against the codebase — these are the places schema names live):**

1. `src/runtime.ts` — `commitStudent`: the `kdfSalt(…, s.id, 'fullName')` field strings, the `C.fieldCommit('fullName'|'degree', …)` calls, and the package writer (`values`, `salts`, and `schema: 'credvault-degree/0.3'` → `'credvault-ptlicense/0.1'`).
2. `src/verify-core.ts` — the `VerifyResult.values` interface, the `values` construction (including the `gpaRedacted` logic), and the matching `C.fieldCommit(…)` calls + `gpaCommit` handling.
3. `src/portal/server.ts` — `/api/issuer/students` (reads `pkg.values.fullName/.degree/.gpa`).
4. `src/portal/public/holder.html` — the credential card and the share-sheet 'Show GPA value' checkbox.
5. `src/portal/public/verify.html` — the result table (Name / Degree / GPA rows, the SEALED pill, the ZK pill wording).
6. `src/portal/public/issuer.html` — the CSV column mapping (`[id, name, degree, gpa, code, title, credits, grade]`), guard-rail banner text, students-table headers, and the filter fields.
7. `src/verifier.ts` — the CLI's printed labels (Name / Degree / GPA).
8. `src/issuer.ts` — the legacy Step-1 issuer CLI (same field names); superseded by `runtime.ts`, so updating it is optional but tidier.

**The discovery Tier B is designed to produce:** `src/canonical.ts` needs **no change at all** — `fieldCommit(fieldName, …)` and `kdfSalt(…, field)` take names as parameters, so the core hashing library is schema-agnostic. A Tier-B student who notices this has understood the 'one canonical library' design — and has just felt, in their hands, why the Step-3 generator emits both sides from one IR: a schema name still lives in ~8 places, and any one of them drifting (e.g., renaming the package writer but not `verify-core.ts`) fails verification with `TAMPERED` or `undefined` values. **The second designed consequence:** renaming a `fieldCommit` name changes every commitment (the name is inside the hash), so all credIds change — the student must re-batch, re-premint, re-import, and re-share, and should expect every pre-rename presentation to fail. That refresh *is* the Tier-B test matrix.

**Fairness rules for tiers:**

- A broken Tier-B attempt costs nothing if the student demos Tier A and says so plainly ('Tier B is half-renamed; here is what drifted') — that honesty is Dimension 6 material, and scope discipline is a professional skill.
- Do not award Tier-B credit for a rename that compiles but was never re-run end to end: the rename's point is the refreshed matrix, not the diff.

## 9. Evidence package (what the student submits)

1. **Design doc** (1–2 pages): schema design (Dimension 1) + security write-up (Dimension 5) + Tier declaration and, for Tier A, the field-mapping table with the label limitation stated.
2. **`data/board-roster.csv`** — the roster as uploaded.
3. **Logs:** batch, premint, idempotent re-run (plain-text captures; the console's job log panel or `npm run … | tee logs/…` both fine).
4. **Demo:** live (preferred) or recorded + live Q&A (§11 infra rule). Either way, the revoke-flip and one verification must be reproducible live on demand.
5. **Tier B only:** the diff summary (which files, why) and the refreshed-matrix evidence.

## 10. Final sign-off checklist

The assessor initials every box; any unchecked box that is not explicitly waived (with reason noted) blocks sign-off. Exact evidence strings are quoted for grepping.

**Schema & data**
- [ ] Design doc: three kinds, ×10 scale with no-floats reason, granular defense (or monolithic + honest-refusal plan), prompt-revocation cadence
- [ ] `board-roster.csv`: ≥ 10 licensees, 8 columns, edge cases planted (PT-007, one < 30.0 h, one ≥ 8 modules)

**Pipeline**
- [ ] Batch log: `✅ root anchored (N students, ONE tx)` and `✅ N packages + manifest written`
- [ ] Premint log: below-30 licensee shows `@>=3.00: NOT minted (failed assert: GPA below the required minimum)` (divided-by-100 display: the college label for their 300)
- [ ] Re-run log: `⏭  root ALREADY anchored — unchanged cohort, skipping transaction (idempotent).` + `already minted, skipping`
- [ ] `data/manifest.json`: correct student count, one `anchoredTx`

**Verifier flows (live)**
- [ ] L1: `✓ VERIFIED — anchored on-chain and not revoked`
- [ ] L2 hidden value: SEALED pill + `GPA ≥ 3.00 — proven without revealing GPA`; student says '300 = 30.0 hours × 10' aloud
- [ ] Bundle inspection: no `gpa` in `values`/`salts`; `gpaCommit` + `gpaRedacted: true` present
- [ ] Below-30 at ≥300: `✗ L2_UNAVAILABLE — no pre-minted proof for GPA >= 3.00` + unprovability explained
- [ ] Subset: PT-ETH-101 only — 'revealed 1 of N', 'N−1 … SEALED by the holder' (or monolithic honest refusal + cost statement)
- [ ] Tamper: one flipped character → `✗ TAMPERED — presented values do not reproduce the credential commitment`

**Operations drill (live)**
- [ ] Revoke-flip on the SAME URL + the sentence 'the same link now says REVOKED'
- [ ] Rectification in correct order (revoke old credId BEFORE re-batch) with the `cmdRevoke`-reads-the-package explanation
- [ ] Corrected record verifies; old credId remains revoked; 'corrections create new anchors' stated

**Security & presentation**
- [ ] Four gate questions answered (anchors-only; H(name) attack; board holds data; proof server private)
- [ ] Demo ≤ 10 min, no notes, own timings, ≥ 2 limitations named unprompted
- [ ] Curveball asked and answered: ______________________

**Tier (check one)**
- [ ] Tier A — mapping table present, label limitation stated
- [ ] Tier B — rename map complete, `credvault-ptlicense/0.1`, matrix re-run

| Dimension (weight) | Level 1–4 | Weighted |
|---|---|---|
| 1. Schema design (20%) | | |
| 2. Pipeline & idempotence (20%) | | |
| 3. Verifier flows (20%) | | |
| 4. Operations drill (15%) | | |
| 5. Security analysis (15%) | | |
| 6. Presentation & honesty (10%) | | |
| **Total** | | **%** |

Outcome (Pass / Merit / Distinction / Resubmit): __________  Assessor: __________  Date: __________

## 11. Assessor notes (for the agent-teacher running the capstone)

**Logistics.** Schedule two sessions plus a demo slot. Hold the **midpoint design-doc review** before any batch runs — Dimensions 1 and 5 are cheap to fix on paper and expensive to fix on-chain. Pre-flight the environment yourself the morning of: devnet up (`docker compose ps` — node, indexer, proof-server all running), `npm run compile` current, portal starts, and one sacrificial batch already anchored so you can sanity-check the student's first run against a known-good log.

**The three reliable stumbles (watch for them before they happen):**

1. **The ×10 mapping slip** — the student checks 350 because the GPA era trained '3.50.' Do not prevent it; it is the best reinforcement of 'your scale, your meaning' in the course. When it happens, use the Dimension 3 feedback line and make them narrate the ÷100 display in the premint log.
2. **Re-sharing instead of re-opening the link** after the revoke. If you see a new token in the URL, stop the demo: the old link's flip is the entire lesson (revocation is read from current chain state, the bundle never changes). Require the exact sentence before you initial the box.
3. **The premint gap** — verifying with a threshold seconds after the anchor, catching `L2_UNAVAILABLE`. Ask what rule they just violated (batch → premint → share) and what the portal does about it (auto-premint chain, Module 7 §1.4). A student who explains it turns a stumble into Dimension 6 credit.

**The rectification ordering trap (Dimension 4) is a designed failure point.** Do not warn about it in advance. A student who revokes the OLD credId before re-batching passes cleanly; a student who re-batches first and then revokes kills their corrected credential — and the full recovery narration (insert-only `revoked` set, old credId still live, third credId needed) is the richest security conversation in the assessment. Grade the *handling*, per the level table, not the stumble.

**Evidence integrity.** All claimed behaviors must be reproducible on demand. 'Show me that again' is always a fair request — particularly for the revoke-flip and the idempotent re-run. Prefer watching the student type; accept `tee`'d logs only alongside a live re-run of at least one flow. Canned output (log text that does not match this machine's packages, a manifest whose `anchoredTx` does not match the batch log) is an integrity conversation, not a scoring deduction: stop, re-run together from `npm run runtime batch`, and score only what you witness.

**Fairness on the granular/monolithic choice.** Granular is the expected answer, but a monolithic choice is *not* an automatic Dimension 1 failure. It earns up to Proficient if the doc honestly confronts the ethics-module requirement (e.g., 'committees must take the whole sealed document and read it — they learn more than they asked for, and that is the cost') and the demo includes the honest refusal ('This credential is whole-document only (issuer policy).') with the cost stated. It cannot reach Exemplary, because the privileging-committee use case is the board's real world — say that in feedback either way.

**Feedback method.** Feedforward, anchored to artifacts: name the exact log line or file, then the module section that teaches it. Two model phrasings:

- Weak: 'Your revocation demo is wrong.' Strong: 'The URL after your revoke has a different token than the one before — you re-shared. Module 8 §5 requires the same link to flip; Module 7 §1.2 step 5 is why it does. Run it again and say the sentence.'
- Weak: 'Security answer too vague.' Strong: 'You said the chain stores hashes of names. Hash `ALICE JOHNSON` with `sha256` right now and compare it to any anchor in your log — Module 8 §1.7 Rule 1 is the fix. Rewrite gate answer 2 in your doc.'

**Do not penalize:** Tier-A label mismatch when it is declared in the design doc (it is the assigned limitation); falling back to the holder/verifier CLIs when a browser glitches mid-demo (the flows are what matter — `verify-core.ts` is one implementation); premint wall-time; slower-than-runbook timings; using `data/cohort.json` directly instead of the console CSV path, provided the console path is also demonstrated once.

**Always penalize (and say why):** any claim of PII or 'encrypted data' on-chain; a hidden demo failure; an unreproducible log; revoking by editing a package file instead of the chain; calling the TTL drop 'the credential database' (it is a handoff cache — Module 7 §1.3).

**Infra-failure fallback.** If the devnet dies mid-demo: `docker compose up -d --wait`, then ask the student whether `deployment.json` still points at a live contract (the probe in `ensureDeployed` answers this — Module 8 Story 3). If the chain was wiped (`down -v`), the recovery is Exercise 8.4 made flesh: delete `data/deployment.json` + `data/deploy-proof.bin`, clear stale `l2Proofs`, re-batch, re-premint. A student who performs that recovery *unprompted* has earned Exemplary in Dimension 4 on the spot. If infra cannot be restored same-day, accept the recorded demo + live Q&A, but the revoke-flip must still be performed live within the resubmission window.

**Calibration.** Proficient means 'did the thing correctly with the brief open' — that is the expected outcome and a good outcome. Reserve Exemplary for students who *explain mechanisms unprompted* (convergence, insert-only revocation, deterministic salts) or survive your curveballs. Reserve Beginning for work that is missing or not reproducible — never for work that is merely inelegant. When scoring pairs, each member answers the four gate questions individually; the demo may be shared, the gates may not.

## References

- `learning/module-08-going-to-production.md` §5 — the capstone brief this rubric scores (deliverables 1–6)
- `learning/module-07-building-the-apps.md` §1.2, §1.4, Labs 7.1–7.3 — the flows and log lines quoted throughout
- `apps/credvault/step1-degree/src/runtime.ts` — batch/idempotence log strings, `cmdRevoke` reading the package credId
- `apps/credvault/step1-degree/src/premint-l2.ts` — `THRESHOLDS = [300n, 350n]`, the ÷100 display, NOT-minted/minted/skip lines
- `apps/credvault/step1-degree/src/verify-core.ts` — verdicts and detail strings
- `apps/credvault/step1-degree/contracts/degree.compact` — the `verifyMinGPA` asserts and the insert-only `revoked` set (no un-revoke circuit)
- `apps/credvault/step1-degree/src/portal/{server.ts, public/{holder,verify,issuer}.html}` — drop TTL, students API, SEALED/ZK pills, monolithic refusal text
- `apps/credvault/docs/step2-runtime-and-l2-runbook.md` — tamper one-liner (Test 3), rectification (Test 9), TTL section
- `apps/credvault/ARCHITECTURE.md` §5 (prompt-revocation duty), §17–18 (monolithic mode, idempotent batching)
- `learning/glossary.md` — shared vocabulary for feedback phrasing
