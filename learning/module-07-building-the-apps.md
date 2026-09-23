# Module 7: Building the Three Universal Apps

> Time: ~4 hours | Prerequisites: Modules 1–6 (you have run the issuer/holder/verifier CLIs, anchored a batch, and verified a presentation)

So far you have driven CredVault from the command line: `npm run runtime batch`, `npm run holder`, `npm run verifier`. Real registrars, students, and employers will never open a terminal. This module is about the three **apps** that sit on top of everything you have already built — the **verifier portal**, the **holder PWA**, and the **issuer console** — and the design rules that make them trustworthy: one shared verification implementation, a stateless server, and a QR handoff that never becomes a credential database.

## Learning objectives

By the end of this module you can:

- **Explain** why the three apps are 'universal': they contain zero Penn-State-specific code and will serve every future issuer unchanged.
- **Trace** an HTTP request through the portal from `POST /api/verify` to a verdict, naming every layer it touches.
- **Explain** the stateless-verifier rule — what the server is forbidden to remember, and why that is a product feature, not a limitation.
- **Explain** the presentation-drop TTL pattern: why the QR encodes a short-lived link, why expiry is safe, and why the drop is not a store.
- **Explain** why the portal runs batches as **subprocesses**, and what the automatic batch→premint chain protects against.
- **Describe** the four pieces of the holder PWA (manifest, service worker, localStorage store, share-sheet) and what each one is for.
- **Run** the full QR handoff end-to-end: console CSV batch → package import → selective share → scan → VERIFIED → revoke → REVOKED.
- **Run** a 50-student batch through the console and read the job log.
- **Hide** the GPA in a share and still prove `GPA ≥ 3.50` with a pre-minted threshold proof.
- **Debug** the most common app-level failures: expired links, stale presentations, missing premints, browser cache staleness.

## 1. Concepts from scratch

### 1.1 One server, three apps, zero issuer-specific code

Open `step1-degree/src/portal/server.ts`. It is ~144 lines of plain `node:http` — no Express, no framework — and it serves everything:

```
                        ┌──────────────────────────────────────────────┐
                        │         portal server (:4050)                │
                        │                                              │
   static files ───────►│  /verify.html   verifier portal (employer)   │
   (public/)            │  /holder.html   holder PWA (student)         │
                        │  /issuer.html   issuer console (registrar)   │
                        │                                              │
   JSON API ───────────►│  POST /api/verify           → verify-core    │
                        │  POST /api/presentations    → TTL drop       │
                        │  GET  /api/presentations/:t → TTL drop       │
                        │  GET  /api/packages/:id     → package files  │
                        │  GET  /api/issuer/students  → package files  │
                        │  POST /api/issuer/batch     → subprocess job │
                        │  POST /api/issuer/revoke    → subprocess job │
                        │  GET  /api/issuer/jobs/:id  → job status     │
                        └──────────────────────────────────────────────┘
```

MVP.md calls these the **universal apps**: you build them **once**, and they serve every issuer type forever. How can one verifier page serve a university today and a licensing board next year? Because **the presentation carries its own coordinates**. Look inside any presentation JSON:

```json
{
  "schema": "credvault-degree/0.3",
  "issuer": "Penn State University (mock)",
  "contractAddress": "c3b82a86…",
  "masterLeaf": "…", "path": […], "salts": {…}, "values": {…}
}
```

The verifier never asks 'which issuer is this?' — it reads `contractAddress` out of the bundle and checks **that** contract's anchors. A new issuer is a new contract address and a new package format, **not a new app**. This is the same idea as a web browser: one program, any website, because the content carries its own address.

> **Vocabulary:** *multi-tenant* means one deployment serves many independent customers (issuers). The apps are multi-tenant by construction: there is no `if (issuer === 'Penn State')` anywhere in them.

### 1.2 The stateless verifier: one brain, three faces

The single most important file in the apps layer is `src/verify-core.ts`. It exports one async function:

```ts
verifyPresentation(presentation, minGpa?) → VerifyResult
```

Every way a human can ask 'is this credential real?' ends up in this one function:

| Front-end | File | Who uses it |
|---|---|---|
| CLI | `src/verifier.ts` (`npm run verifier`) | you, in Modules 1–6 |
| Raw HTTP service | `src/service.ts` (`POST /verify`) | API integrators |
| Portal | `src/portal/server.ts` (`POST /api/verify`) + `verify.html` | employers in a browser |

**One implementation, three front-ends.** This is deliberate. In March 2026 the project had the same logic written twice in two places, and the two copies drifted apart (the infamous hash-mismatch saga). The structural fix — one function everyone calls — makes that class of bug impossible: fix it once, all three front-ends are fixed.

What `verifyPresentation` actually does, in order (follow along in the file — the numbers match its section comments):

1. **Tamper check (off-chain).** Recompute the credential's *master leaf* from the presented values and salts. If even one character of one value was altered, the recomputed leaf will not equal `p.masterLeaf` → verdict `TAMPERED`. This is pure hashing; no network, no chain. (If the holder **redacted** the GPA, the value and its salt are absent, and the recomputation uses the package's `gpaCommit` — a precomputed salted hash — in their place. The math still checks out; only a ZK proof may speak about the hidden number.)
2. **Root check (off-chain).** Walk the Merkle `path` from the master leaf up to a cohort root.
3. **Anchor lookup (the one network call).** Ask the indexer for the contract's current state: `pdp.queryContractState(p.contractAddress)`.
4. **Membership.** Is that cohort root in the contract's `validRoots` set? If not → `UNKNOWN_ANCHOR`.
5. **Revocation — always against CURRENT chain state.** Is this credential's `credId` in the `revoked` set *right now*? If yes → `REVOKED`. Note the consequence: a presentation shared yesterday flips from VERIFIED to REVOKED the moment the registrar revokes — the holder does nothing, the link does not change, the answer changes. Revocation lives in the layer that always re-reads the chain, never in a frozen artifact.
6. **Optional L2 threshold proof.** If the verifier asked for `minGpa`, find a pre-minted proof for that exact threshold in the bundle and verify it locally (deploy-tx replay + `wellFormed` — the recipe from the ZK modules). No proof for that threshold → the honest `L2_UNAVAILABLE`, never a guess.

The verdicts are an enum — learn them, they are the whole API:

```ts
'VERIFIED' | 'TAMPERED' | 'REVOKED' | 'UNKNOWN_ANCHOR'
| 'CONTRACT_NOT_FOUND' | 'L2_INVALID' | 'L2_UNAVAILABLE'
```

The HTTP mapping is minimal: **200 for VERIFIED, 422 for everything else** (and 400 for a malformed request). A 422 is not an error — it is a *correct negative answer*, delivered at full speed.

**Why 'stateless' is the whole point.** The portal keeps **no credential database**. The bundle the holder uploads *is* the data source; the server recomputes, renders a page, and **discards** the bundle. Its only external read is the public chain state via the indexer. This is the deliberate anti-Clearinghouse: the traditional model *is* a central credential database (a per-query lookup service and a breach target); CredVault deletes it. If the portal were subpoenaed or breached tomorrow, there would be nothing to hand over — it never stored anything. Stateless also means operationally boring: restart it, run three copies behind a load balancer, lose one — nothing happens, because there is no state to lose.

**One defensive detail worth copying:** the decoded on-chain `Set` shape is not documented, so `setHas()` in verify-core checks membership four ways (`.member()`, iteration, `Map` keys, plain-object keys) before answering 'not present.' Lesson: when an API's return shape is undocumented, decode defensively and never trust one shape.

### 1.3 The presentation drop: a TTL cache, not a store

The QR handoff needs the employer's browser to fetch a bundle the *student's phone* is holding. Phones can't serve HTTP, so the holder app POSTs the bundle to the portal first:

```
POST /api/presentations     { presentation }  →  { token, expiresInSeconds: 900 }
GET  /api/presentations/:t                     →  presentation | 404
```

The server keeps the bundle in an in-memory `Map` for **15 minutes** (`PRESENTATION_TTL_MINUTES`, default 15; a sweeper runs every minute), then deletes it. The QR the student shows encodes only the link:

```
https://portal.example/verify.html?t=9f2c41ab77e013aa
```

Why the expiry is a *feature*, as the comment in server.ts puts it: **the holder can always re-share instantly.** Their app holds the package forever, so minting a fresh link is a tap and costs nothing. A short-lived link means:

- **No durable store to breach.** The drop is a convenience cache, not a database; there is nothing to dump, back up, or leak.
- **Consent is scoped in time.** The student's tap to share *is* the consent act; the 15-minute window bounds how long that consent is exercisable.
- **Honest failure.** After expiry the verifier gets `404 "link expired or unknown — ask the holder to share again"` — instructions, not a stack trace.

(A production system may add *durable shares* with holder-controlled revocation — that is a real product feature needing a real store, and the code comment says so. The default is ephemeral on purpose.)

Also notice what the QR does **not** contain: the credential data. A QR that encoded a multi-KB bundle would be dense, fragile, and unscannable. The QR carries ~50 characters of URL; the payload travels over HTTP once. (The Step-3 apps architecture keeps this property at any bundle size: QR size stays ~90 chars even for multi-credential bundles.)

### 1.4 The issuer console's job runner: subprocesses and the auto-premint

The console's 'Run batch' button does **not** run the batch in the web server. It spawns a child process:

```ts
const child = spawn('npm', ['run', 'runtime', '--silent', 'batch', cohortFile], { cwd: projectRoot });
```

…captures every line of stdout/stderr into a job record, and lets the browser poll `GET /api/issuer/jobs/:id` every 3 seconds. Why a subprocess instead of `import { cmdBatch }`?

1. **Isolation.** A batch loads WASM, opens wallet connections, and calls `process.exit(0)` at the end (runtime.ts does, literally). If that ran inside the portal process, every completed batch would kill the web server. In a subprocess, the worst that happens is a failed job.
2. **Crash containment.** If the runtime crashes or hangs, the portal — and everyone verifying credentials — is unaffected.
3. **Streaming logs for free.** stdout/stderr are already the runtime's UI; the portal just relays them.

And then the detail that exists because people kept getting burned — the **auto-premint chain**. When a *batch* job exits 0, the portal immediately spawns `npm run premint` inside the same job:

```ts
// batch → premint → share: mint L2 proofs automatically so new packages
// are immediately shareable with thresholds (the recurring footgun).
```

The footgun: every batch **regenerates the package files**, and freshly written packages start with empty `l2Proofs`. Anyone who shared in the gap between 'batch done' and 'premint done' handed out a bundle with no threshold proofs, and the verifier got `L2_UNAVAILABLE`. The rule was always *batch → premint → share* — but it lived in humans' heads, so it kept being violated. The fix encodes the ordering in the tool: one button does both, and the job is not 'done' until premint is done. **Moral: if an ordering rule is documented but repeatedly violated, the documentation is the bug — move the rule into the tooling.**

### 1.5 Idempotent batches: why re-running is safe (and cheap)

Before September 5th, re-running a batch **re-minted everything**: fresh random salts meant new commitments, a new root, a new ~22-second anchor transaction, and all proofs invalidated. Running the same CSV twice was wasteful and scary.

The fix is **deterministic salts** (`canonical.ts`):

```ts
kdfSalt = H("credvault:kdf:" || issuerSecret || studentId || field)
```

Same issuer secret + same student ID + same field ⇒ **the same salt, every time.** Re-running an unchanged cohort now reproduces *bit-identical* commitments, which unlocks four idempotence behaviors you can watch in `runtime.ts` and `premint-l2.ts`:

1. **Root-exists skip.** The batch computes the cohort root and checks `validRoots` on-chain *before* transacting. Unchanged cohort → `⏭ root ALREADY anchored — skipping transaction (idempotent)` → no 22-second tx, no fee.
2. **Proof preservation.** When a package is rewritten, its old `l2Proofs` carry over **if the credential identity (`credId`) is unchanged** — which, with deterministic salts, is exactly 'if the record did not change.'
3. **Premint skipping.** Students already holding all standard thresholds are skipped: `already minted, skipping`.
4. **Rectification still works.** A *corrected* record produces a different leaf, hence a new `credId`, hence a new anchor — and the old `credId` should be revoked per the rectification flow. Corrections create new anchors; they never rewrite history.

The salt is derived from the **issuer secret**, which never leaves the issuer's server — so observers can't derive salts or enumerate students, while the issuer gets reproducibility. This is the operational face of a rule from the crypto modules: *never reuse a salt across different data* — and its mirror image: *deriving a salt deterministically from (secret, record, field) is safe, because any change in the data yields a different salt.*

### 1.6 The holder PWA: an app that is secretly a web page

The holder app (`/holder.html`) is a **PWA** — a Progressive Web App. Jargon-free: it is a normal web page plus two small files that let a phone treat it like an installed app.

**Piece 1 — the manifest** (`holder.webmanifest`): a JSON name tag. It tells the phone the app's name ('CredVault — My Credentials'), which page to open when launched (`start_url: /holder.html`), that it should look like a standalone app rather than a browser tab (`display: standalone`), and which icons to put on the home screen. Without a manifest, 'Add to Home Screen' is just a bookmark; with one, it installs.

**Piece 2 — the service worker** (`sw.js`, 8 lines): a tiny proxy script the browser runs between the page and the network. Ours does two things: at install time it caches the app shell (`/holder.html`, `/style.css`, `/`); at fetch time it serves cached files when present and goes to the network otherwise — **except** any URL containing `/api/`, which always hits the network (stale API answers are how you get stale verifications). Result: the app shell loads instantly, even on bad conference Wi-Fi, while every verification is fresh.

**Piece 3 — the localStorage store.** The app keeps imported packages in the browser's `localStorage` under the key `cv-creds` — a simple JSON list with add/remove deduped by `studentId`. No account, no server-side profile: the credential **lives on the device**. This is the distribution model from the architecture doc made concrete: the **school is the system of record** (authoritative copy, corrections, re-issuance); the **student is a presentation cache** (instant, offline-capable, private). Lose the phone → re-download the package from the school. And a candid security note: localStorage is not a vault — the package is a *capability* (whoever holds it can present it), which is exactly the right risk level for a transcript and the wrong level for money. That is why holders have no keys or tokens at all.

**Piece 4 — the share-sheet.** Tap **Share…** and you get the disclosure UI:

- **Course checkboxes** (granular issuers only): uncheck any courses you do not want to reveal. The unshared courses' *commitments* stay sealed but the revealed ones remain verifiable — the verifier sees '3 of 5 courses revealed, 2 SEALED.'
- **The GPA checkbox**: uncheck it and the app **deletes** `values.gpa` and `salts.gpa` from the presentation, keeps `gpaCommit`, and sets `gpaRedacted: true`. The anchor math still verifies (Section 1.2, step 1); the number itself is simply not in the bundle.
- **The threshold dropdown**: 'prove GPA ≥ 3.50 **without showing it**.' This is where the pre-minted L2 proofs come in — the verifier can check a ZK proof about a number it never sees.

Then **Create share QR**: the app POSTs the assembled presentation to the drop, gets a token, builds `location.origin + '/verify.html?t=' + token`, and renders a QR with it. **The tap is the consent** — there is no 'are you sure?' dialog because the entire screen *is* the consent: the student sees exactly what will be shared before the QR exists.

One honest quirk to know (you will fix it in Exercise 7.4): the threshold dropdown currently records the holder's *intent* but the presentation still carries **all** pre-minted proofs — the verifier's own dropdown chooses which threshold to check. Functionally fine; data-minimally sloppy.

### 1.7 The issuer console: CSV in, anchors out

The registrar's page (`/issuer.html`) has three cards: upload CSV, run batch, manage students.

**Why CSV, and why the paranoia about PDFs.** Schools do not parse transcripts to feed verification — they *export data* from the student information system (SIS: Banner, PeopleSoft, Workday, PowerSchool), and that export is CSV or an API. That is how they feed the Clearinghouse today. A PDF is a **rendering**, not data — so the console refuses them, actively:

- Non-`.csv` extension → rejection banner explaining the SIS export path.
- File starts with `%PDF-` or contains binary bytes → 'this file is not text/CSV.'
- Rows must have 8 columns with numeric GPA/credits; if more than 10% of rows fail → 'doesn't look like a cohort CSV' with the expected format spelled out.

The ingestion ladder, settled in Step 2c: **CSV cohort file → per-school SIS connector → PDF extraction as last-resort fallback only.** PDFs are things we *render from data*, never things we trust as input.

**The transcriptMode dropdown and the click-time read.** Next to the file input: *granular* (per-course subsets allowed) vs *monolithic* (whole-document only). Subtle bug that bit us once: the mode was first read when the CSV was parsed; if the registrar changed the dropdown afterwards, the batch used the stale value. The fix is one comment away in the code — `cohort.transcriptMode = $('mode').value` **at click time, not parse time**. (There is a Playwright regression test, `src/test-mode-capture.ts`.) Moral: read user intent at the moment of action.

**The students table** reads `GET /api/issuer/students`, which simply lists the `packages/*.package.json` files — remember, the issuer holds the data; the console is a view over the package directory. Each row offers the **package link** (`/api/packages/STU-101.json` — what the student imports), a copy button, and the **revoke** button (a confirm dialog, then a revoke job — the same subprocess machinery as batch).

### 1.8 The whole flow on one page

```
 REGISTRAR (issuer.html)                STUDENT (holder.html)            EMPLOYER (verify.html)
 upload cohort.csv ─► /api/issuer/batch
   spawn: runtime batch ─► ONE anchor tx ─► 🌙 chain (validRoots)
   spawn: premint ─► L2 proofs into packages
 students table ─► copy package link ────► paste link → Import
                                           packages in localStorage
                                           Share… → pick courses,
                                           hide GPA?, pick threshold
                                           POST /api/presentations ─► TTL drop (15 min)
                                           QR encodes /verify.html?t=TOKEN ─────► scan / open link
                                                                                  GET /api/presentations/:t
                                                                                  POST /api/verify
                                                                                    └► verify-core: recompute →
                                                                                       indexer anchors → revocation
                                                                                       → optional L2 → verdict
                                                                                  ✓ VERIFIED page (~0.1 s)
```

Every arrow you see is either a file read or a stateless HTTP call. The only stateful things in the entire system are the chain (anchors only) and the issuer's own package directory (the system of record).

## 2. Hands-on lab

**Starting state:** devnet running (`docker compose up -d --wait` in your step0-hello project), `step1-degree` compiled and previously deployed (Modules 1–6). All commands run in `apps/credvault/step1-degree`.

### Lab 7.0 — Start the portal and tour the apps (5 min)

```bash
cd apps/credvault/step1-degree
npm run portal
```

Expected:

```
credvault portal on :4050
  verifier portal → http://localhost:4050/verify.html
  holder app      → http://localhost:4050/holder.html
  issuer console  → http://localhost:4050/issuer.html
```

Open all three. The home page (`/`) tiles link to each. Sanity-check the API: `curl -s localhost:4050/api/health` → `{"status":"ok","service":"credvault-portal"}`.

> **If the port is busy:** another portal, or the raw `service.ts` verifier service from an earlier module, is still running. `pkill -f "tsx src/service"` / `pkill -f "tsx src/portal"` and retry, or `PORT=4051 npm run portal`.

### Lab 7.1 — The full QR handoff, end to end (20 min)

This is the demo flow that never fails. You play all three roles.

**① Registrar — anchor a cohort from a CSV.** Open `/issuer.html`. Upload `data/sample-cohort.csv` (Maya Patel STU-101, Tom Becker STU-102 — open the file first and look at it: 8 columns, one row per course, rows grouped by student, GPA ×100). Leave the mode on **granular**. The guard rails parse it and show **✓ file ready** — note that nothing else happens until you act. Click **Run batch**. The log streams:

```
cohort file: cohort-upload.json — Penn State University (mock)
transcriptMode: granular
cohort root: b8fa…
✅ root anchored (2 students, ONE tx): 0074e5… [22.4s]
✅ 2 packages + manifest written
── anchoring done; minting L2 proofs (premint)…
  STU-101 @>=3.00: minted [1.8s]
  STU-101 @>=3.50: minted [1.8s]
  …
```

Wait for `✅ cohort anchored on-chain — 2 students, one transaction`. Notice you never ran premint yourself — the portal chained it (Section 1.4). The students table refreshes, filtered to the new `STU` prefix.

**② Student — import the package.** In the console's students table, click Maya's **package** link and copy its URL (`http://localhost:4050/api/packages/STU-101.json`). Open `/holder.html` — pretend it is a phone; better: use a real phone on the same Wi-Fi at `http://YOUR-LAN-IP:4050/holder.html`. Paste the link into **Add a credential package → Import** → `✓ imported STU-101`. Maya's card appears: name, degree, GPA 3.91, 4 courses. Close the tab and reopen — still there (localStorage).

**③ Student — share selectively.** Click **Share…** on Maya's card. Uncheck one course (any one). Leave **Show GPA** checked. **Create share QR.** A QR and its link appear: `http://localhost:4050/verify.html?t=<16 hex chars>`.

**④ Employer — verify.** Open the link in a *different* browser profile (or your phone), or just open it as-is. The page auto-fetches the bundle from the drop and posts it to `/api/verify`:

```
✓ VERIFIED — anchored on-chain and not revoked
Name: Maya Patel · Degree: B.S. Computer Science · GPA: 3.91
Courses (revealed 3 of 4) …   … 1 more course(s) SEALED by the holder
Trust: Verified cryptographically against the issuer's on-chain anchor in 87 ms.
```

**⑤ Registrar — revoke; watch the same link flip.** First set up the flip: import Tom's package in the holder app and share it (full reveal); open his link and confirm **✓ VERIFIED**. Now, back in the console, click **revoke** on Tom Becker (STU-102), confirm, and wait ~25 s for the job to finish. Re-open that exact same link →

```
✗ REVOKED — credential was revoked by the issuer
```

Then re-open **Maya's** link from step ④. Still VERIFIED — revocation is per-credential. But Tom's URL — same link, same bundle, nothing re-shared — now says REVOKED, because revocation is always checked against current chain state (Section 1.2, step 5).

**What can go wrong:**

| Symptom | Cause / fix |
|---|---|
| `✗ L2_UNAVAILABLE` on a fresh console batch | You verified with a threshold *during* the premint phase — wait for job `done`. |
| Holder import: `fetch failed: 404` | Wrong package URL, or the batch did not finish. Re-copy from the students table. |
| Verifier: `link expired or unknown` | The 15-minute drop TTL lapsed. Holder taps **Create share QR** again — instant, free. |
| Button does nothing at all | A JS error killed the page's script block — open devtools console. (The repo ships `npx tsx src/test-ui.ts`, a Playwright end-to-end drive of the console.) |
| Page looks stale after a code change | Browser cache — hard-refresh with Ctrl+Shift+R. |

### Lab 7.2 — A 50-student console batch (15 min)

One transaction anchors one student or ten thousand — prove it at the 50 scale.

1. Peek at the data: `head -3 data/batch-granular-50.csv` — 50 students (`GRA-001…GRA-050`), 10 courses each, 500 rows. (`src/gen-cohorts.ts` generated it deterministically; you can regenerate any time with `npx tsx src/gen-cohorts.ts`.)
2. Console → upload `batch-granular-50.csv` → granular → **Run batch**.
3. Watch the log. The anchor tx is the usual ~22–25 s — **the same one transaction as for 2 students**. Then the auto-premint mints 100 proofs (50 students × 2 thresholds) at ~2 s each, sequentially — **expect roughly 3–4 minutes total**. Read that gap as a lesson: the *on-chain* cost is flat; the *off-chain* CPU scales linearly and is the parallelizable part (the current script is deliberately simple and sequential).
4. When the job is done: `cat data/manifest.json` → `"students": 50` and one `anchoredTx`.
5. Verify one at random: in the holder app import `http://localhost:4050/api/packages/GRA-001.json`, share a 2-course subset, verify → VERIFIED 'revealed 2 of 10 … 8 SEALED'.
6. **Idempotence check:** run the *same* CSV again. The log now shows `⏭ root ALREADY anchored — unchanged cohort, skipping transaction` — no 22-second tx — and premint reports `already minted, skipping` for all 50. (The console names its cohort `console-upload-<date>`; the idempotence check compares **roots**, and the root depends only on student records — so the same CSV is a clean no-op regardless of the label.)

### Lab 7.3 — Hide the GPA, prove the threshold (10 min)

The selective-disclosure money shot, driven entirely through the apps.

1. Holder app → Maya (STU-101, GPA 3.91) → **Share…**.
2. **Uncheck 'Show GPA value.'** Select **prove GPA ≥ 3.50** in the threshold dropdown. Create share QR.
3. Open the link. The result page shows:

```
✓ VERIFIED — anchored, not revoked, and GPA >= 3.50 proven in zero knowledge
GPA: [SEALED by holder]
ZK proof: GPA ≥ 3.50 — proven without revealing GPA
```

4. Inspect what actually traveled: `curl -s localhost:4050/api/presentations/<token>` (use the token from your link) — `values` has **no `gpa` key**, `salts` has **no `gpa` key**, but `gpaCommit` and `l2Proofs` are present, and `gpaRedacted: true` is set. The employer's browser never received the number — not 'received but hidden': **not received**.
5. Open the same link but choose **Degree check only** on the verifier page and re-verify: still VERIFIED (the L1 anchor does not need the GPA). Choose **+ GPA ≥ 3.00**: VERIFIED — Maya holds both pre-minted thresholds.
6. Try a student whose GPA < 3.50 (e.g. GRA-002 at 3.13 from Lab 7.2) with **+ GPA ≥ 3.50**: `✗ L2_UNAVAILABLE — no pre-minted proof for GPA >= 3.50`. Layered honesty: the *credential* is valid; the *claim* cannot be proven — and no one on earth can mint that proof, because the circuit rejects the false statement before proving.

### Lab 7.4 — Drive the API directly (10 min)

Everything the pages do is plain HTTP. Prove it with curl.

```bash
# 1. wrap a presentation file into the API body and POST it
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('presentations/STU-001.presentation.json'));
fs.writeFileSync('/tmp/body.json', JSON.stringify({ presentation: p, minGpa: 350 }));
"
curl -s -w '\nHTTP %{http_code}\n' -X POST localhost:4050/api/verify \
  -H 'Content-Type: application/json' -d @/tmp/body.json
```

Expected: `"verdict": "VERIFIED"`, `"l2": {"minGpa": 350, "ok": true}`, `HTTP 200`, and `"ms"` around 150. Now tamper:

```bash
node -e "
const fs = require('fs');
const b = JSON.parse(fs.readFileSync('/tmp/body.json'));
b.presentation.values.gpa = 395; delete b.minGpa;
fs.writeFileSync('/tmp/body2.json', JSON.stringify(b));
"
curl -s -w '\nHTTP %{http_code}\n' -X POST localhost:4050/api/verify \
  -H 'Content-Type: application/json' -d @/tmp/body2.json
```

Expected: `"verdict": "TAMPERED"`, **HTTP 422**, and `"ms"` noticeably lower than the full check — the tamper verdict short-circuits before the network call. That is your reminder that 422 is a *correct answer*, not an error.

## 3. Exercises

**Exercise 7.1 (warm-up).** Add a route `GET /api/manifest` to the portal that returns the contents of `data/manifest.json` (404 with a clear message if no batch has ever run). Test with curl.

<details><summary>Solution</summary>

In `src/portal/server.ts`, next to the other GET routes:

```ts
if (req.method === 'GET' && p === '/api/manifest') {
  const f = path.join(projectRoot, 'data', 'manifest.json');
  if (!fs.existsSync(f)) return send(res, 404, { error: 'no batch has run yet' });
  return send(res, 200, fs.readFileSync(f, 'utf-8'));
}
```

`curl -s localhost:4050/api/manifest` → the cohort, root, student count, anchor tx. Restart the portal after editing (there is no hot reload).
</details>

**Exercise 7.2 (warm-up).** Shorten the drop TTL to 1 minute **without editing code**, demonstrate an expired link, then put it back. Which two design facts make expiry harmless?

<details><summary>Solution</summary>

`PRESENTATION_TTL_MINUTES=1 npm run portal`. Share from the holder app, wait 70 s, open the link → `404 link expired or unknown — ask the holder to share again`. Expiry is harmless because (1) the holder's package lives on their device, so re-sharing is a tap, and (2) the drop is a handoff cache, not the system of record — nothing is lost.
</details>

**Exercise 7.3 (medium).** The console hardcodes `issuer: 'Penn State University (mock)'` in `issuer.html`. Add a text input for the issuer name and use it when building the cohort object. Why does nothing downstream (runtime, packages, verifier) need to change?

<details><summary>Solution</summary>

Add `<input type="text" id="issuerName" value="Penn State University (mock)">` near the mode select, and set `cohort.issuer = $('issuerName').value.trim() || 'Penn State University (mock)'` when building the cohort. Downstream, `issuer` is a display string copied into each package (`pkg.issuer`); verification depends on `contractAddress`, `masterLeaf`, `path`, and the on-chain anchors — never on the issuer name. This is the universal-apps property (Section 1.1): content carries its own coordinates.
</details>

**Exercise 7.4 (medium).** Fix the holder-app quirk from Section 1.6: when the holder picks a threshold in `l2pick`, the presentation should carry **only that threshold's proof** (or no proofs when 'no threshold proof' is selected), instead of every pre-minted proof. Edit `holder.html`.

<details><summary>Solution</summary>

In the share button handler, after reading `const l2 = $('l2pick').value;`, add:

```js
presentation.l2Proofs = l2
  ? (presentation.l2Proofs ?? []).filter(x => String(x.minGpa) === l2)
  : [];
```

Now the bundle is data-minimal: an employer can only ever see the proof the holder chose to include. Note the verifier still picks which threshold to *check* — but with a filtered bundle, any other choice honestly reports `L2_UNAVAILABLE`.
</details>

**Exercise 7.5 (harder).** The portal spawns `npm run runtime` instead of importing `cmdBatch` directly. Give **three** concrete failure modes the subprocess design avoids, naming the line or behavior in `runtime.ts` responsible for each.

<details><summary>Solution</summary>

1. **`process.exit(0)` at the end of `cmdBatch`/`cmdRevoke`** — in-process, it would kill the web server after every successful job.
2. **Wallet + WASM lifetime** — `setupWalletAndProviders` opens WebSocket connections and loads the ledger WASM; a hang or crash inside it would wedge or kill the portal event loop. In a subprocess it is one failed job (`status: 'failed (exit N)'`).
3. **Shared on-disk state** — the private-state store and wallet sync write to `midnight-level-db/`; running batches inside the portal process would couple the web server's lifetime to that state and to wallet sync. A subprocess gets its own process lifetime around it, and the portal stays responsive to verifiers throughout. (Bonus: logs stream over stdout/stderr, which the runtime already produces — no logging refactor.)
</details>

**Exercise 7.6 (hard, design).** A pilot school asks: 'We want links that work for 30 days so employers can re-check later, and students must be able to kill a link early.' Sketch the changes: what replaces the in-memory `Map`, what new endpoint appears, who authenticates to it, and what happens to the statelessness claim? You do not need to code it — 8–10 sentences plus an endpoint list.

<details><summary>Solution sketch</summary>

The `Map` becomes a real store (SQLite/Postgres) keyed by token, rows `{token, presentation, createdAt, expiresAt, revokedAt}`. `POST /api/presentations` gains a `ttlDays` option; `GET` checks `revokedAt`/`expiresAt`. New endpoint: `POST /api/presentations/:t/revoke`, authenticated by a **holder secret** minted at share time (a high-entropy `manageKey` returned only to the holder's app — no accounts). The verifier-facing flow is unchanged. Statelessness narrows but the *privacy* claim survives: the store holds only bundles the holder explicitly uploaded, contains nothing the holder did not choose to disclose, and still stores no issuer-side credential database. This is the 'durable shares with holder-controlled revocation' future feature the server.ts comment points at.
</details>

## 4. Checkpoint quiz

**Q1.** The verifier portal serves every issuer CredVault will ever onboard without code changes. What property of the presentation bundle makes that possible?
<details><summary>Answer</summary>The bundle is self-locating: it carries its own `schema` and `contractAddress`, so the verifier reads coordinates from the content instead of hardcoding per-issuer knowledge.</details>

**Q2.** `verify-core.ts` is imported by the CLI, the HTTP service, and the portal. What bug class does this 'one implementation' rule structurally prevent, and what was its March-2026 instance?
<details><summary>Answer</summary>Two copies of the same logic drifting apart — the March hash-mismatch saga, where JS-side and contract-side hashing disagreed. One shared function (and one shared canonical library) makes divergence impossible by construction.</details>

**Q3.** A registrar runs a batch and immediately tells a student to share with a GPA threshold. The verifier gets `L2_UNAVAILABLE`. What happened, and what does the portal do to prevent it?
<details><summary>Answer</summary>The batch regenerated packages with empty `l2Proofs`; premint had not run yet (batch → premint → share was violated). The portal chains `npm run premint` automatically after every successful batch job, inside the same job, so 'done' means 'shareable.'</details>

**Q4.** Why does `GET /api/presentations/:t` return 404 after 15 minutes, and why is that a feature rather than a bug?
<details><summary>Answer</summary>The drop is a TTL handoff cache, not a store. Expiry bounds the consent window and guarantees there is no durable bundle database to breach; the holder re-shares instantly because their package lives on their device.</details>

**Q5.** Name the four files/features that make `holder.html` a PWA-grade app, and the job of each.
<details><summary>Answer</summary>`holder.webmanifest` (name/icons/start_url — installable), `sw.js` service worker (cache-first app shell, network-first for `/api/`), the `cv-creds` localStorage store (on-device package cache; school remains system of record), and the share-sheet UI (course/GPA/threshold disclosure → drop POST → QR).</details>

**Q6.** Revocation is checked against *current* chain state even for a presentation shared yesterday. Where in `verifyPresentation` does that happen, and what user-visible behavior follows?
<details><summary>Answer</summary>Step 5: after fetching the contract state from the indexer, it tests `setHas(ledgerState.revoked, credIdFromLeaf(leaf))`. Consequence: the same share link flips from VERIFIED to REVOKED when the issuer revokes, with no action by the holder.</details>

**Q7.** Re-running an unchanged 50-student CSV batch costs no transaction. Name the mechanism and the visible log lines that prove it worked.
<details><summary>Answer</summary>Deterministic salts (`kdfSalt = H(kdf-domain || issuerSecret || studentId || field)`) reproduce identical commitments → identical root → the root-exists check prints `⏭ root ALREADY anchored … skipping transaction`; the package rewrite preserves `l2Proofs` by `credId`; premint prints `already minted, skipping`.</details>

**Q8.** The console refuses PDF uploads in three different ways. What are they, and what is the ingestion ladder the banner text points to?
<details><summary>Answer</summary>Extension check (`.csv` only), magic-byte/content check (`%PDF-` or binary bytes in the head), and column/type sanity (8 columns, numeric GPA/credits, >10% bad rows rejected). Ladder: CSV cohort file → per-school SIS API connector → PDF extraction as fallback only. PDFs are rendered FROM data, never trusted as input.</details>

**Q9.** Why 422 (not 500, not 200-with-a-flag) for REVOKED/TAMPERED verdicts?
<details><summary>Answer</summary>422 signals a well-formed request whose credential failed verification — a correct negative answer, distinct both from success (200) and from server failure (500). Clients can branch on status alone: 200 = trustworthy, anything else = do not rely.</details>

## Agent teacher notes

**Pacing.** ~4 h total: Concepts ~75 min (students who built Modules 1–6 can skim 1.1–1.2 but must read 1.3–1.6 slowly — those are the new ideas), Labs ~90 min, Exercises ~45 min, quiz + wrap ~20 min. Lab 7.1 is the heart of the module; do not let anyone skip it. Lab 7.2's 50-student premint wait is dead time — start the batch, then teach Exercise 7.4/7.5 during the ~4 minutes it runs.

**Common misconceptions.**

- *'The QR contains the credential.'* No — ~50 characters of URL. Have a student paste their QR into any online decoder; seeing `verify.html?t=…` lands the point instantly.
- *'The portal remembers my transcript.'* Walk the server.ts route table together: the only writes are the TTL drop (self-deleting) and the job map (logs). Ask: 'if this server were imaged tonight, what personal data would leak?' (Answer: whatever sits in the drop for ≤15 min — nothing else.)
- *'REVOKED means the app is broken.'* Students read 422/red as an error. Reframe: a fast, correct NO is the product working perfectly. An unreliable 'yes' is the failure mode.
- *'Re-running a batch is dangerous or expensive.'* After Lab 7.2's idempotence re-run, ask what the second run cost (zero tx, zero new proofs). Then ask *why* (deterministic salts) and what would happen if one grade changed (new leaf → new credId → new anchor; revoke the old one).
- *'Hiding the GPA weakens verification.'* The anchor math is unchanged — `gpaCommit` stands in for the value. What changes is only *what the verifier learns*. The threshold proof is the bridge: a claim about a hidden number, checkable by anyone, mintable only if true.

**Checking understanding before advancing.** Three gate questions: (1) 'Trace the request: an employer opens a `?t=` link — name every function that runs, in order.' (verify.html fetch → drop GET → /api/verify → verifyPresentation's six steps → indexer → verdict.) (2) 'Why can't the registrar run the batch inside the portal process?' (process.exit, WASM/wallet lifetime, isolation.) (3) 'What would it take to break the GPA-hiding guarantee?' (Leak the value or its salt into the bundle — have them grep the redacted presentation for both; absence *is* the guarantee.)

**FAQ answers.**

- *'Why no Express?'* 144 lines, zero dependency surface, and students can read the entire server in one sitting. Frameworks earn their keep when routing and middleware complexity exists; here it does not.
- *'Is localStorage safe enough for real credentials?'* For a transcript, yes — the package is a presentable capability, like carrying a paper transcript, with the school as the re-issuing system of record. It is not where you would put keys or money, and CredVault holders have neither.
- *'Why does premint take minutes for 50 students?'* ~2 s × 100 proofs, sequential by simplicity. It is local CPU, parallelizable across cores or machines; the on-chain cost stayed flat at one tx. That is the scaling story in one sentence.
- *'Can an employer re-verify next week?'* Not from the TTL link (by design). They ask the holder to re-share, or the future durable-share feature (Exercise 7.6) applies.
- *'The page did nothing when I clicked.'* Browser cache after a code change — Ctrl+Shift+R first, devtools console second. This pair solves 90% of 'the app is broken' reports during the course.

**When to let them struggle.** Let students hit the expired-link 404, the premint-gap `L2_UNAVAILABLE`, and a stale-browser-cache moment *on their own* — each is a 60-second recovery and teaches the operational story better than any slide. Intervene quickly on: devnet down (everything fails confusingly), port already in use, and any confusion between *presentation* (the shared, possibly-redacted bundle) and *package* (the holder's full private inventory) — that vocabulary confusion poisons everything downstream.

**Advance-when criteria.** Students can (a) complete Lab 7.1 without the guide, including the revoke-flips-the-link step; (b) explain statelessness as 'the bundle is the database; the server is a pure function plus one chain read'; (c) predict, before running, what happens on a second identical batch; and (d) articulate why batch→premint→share had to become machine-enforced. All four = ready for Module 8.

## References

**Code (read in this order):**
- `apps/credvault/step1-degree/src/portal/server.ts` — the whole portal: routes, TTL drop, subprocess jobs, auto-premint
- `apps/credvault/step1-degree/src/verify-core.ts` — the one verification implementation + verdicts + `setHas`
- `apps/credvault/step1-degree/src/portal/public/holder.html` — PWA store, share-sheet, redaction, QR
- `apps/credvault/step1-degree/src/portal/public/{verify.html, issuer.html, index.html}` — the other two apps
- `apps/credvault/step1-degree/src/portal/public/{holder.webmanifest, sw.js}` — the PWA pieces
- `apps/credvault/step1-degree/src/{runtime.ts, premint-l2.ts, canonical.ts}` — idempotent batching, deterministic salts, proof preservation
- `apps/credvault/step1-degree/src/service.ts` — the bare `POST /verify` service (portal precursor)
- `apps/credvault/step1-degree/data/{sample-cohort.csv, batch-granular-50.csv, manifest.json}` — lab data
- `apps/credvault/step1-degree/src/{test-ui.ts, test-batch50.ts, test-mode-capture.ts}` — automated drives of the same flows

**Project docs:**
- `apps/credvault/docs/mvp-portal-guide.md` — runbook for this module's labs (phone testing + troubleshooting)
- `apps/credvault/MVP.md` — the five pieces, data-flow hard rules, deliberate cuts
- `apps/credvault/ARCHITECTURE.md` §14–18 — step reports: the stateless service, the TTL saga, idempotent batching
- `apps/credvault/docs/generator-apps-architecture.md` §0 — where the universal apps are heading (descriptor-driven, QR size constant)

**Official / external:**
- Midnight networks & environments: https://docs.midnight.network/guides/networks-and-environments
- Web app manifests (MDN): https://developer.mozilla.org/en-US/docs/Web/Manifest
- Service Worker API (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- HTTP 422 status (MDN): https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/422
