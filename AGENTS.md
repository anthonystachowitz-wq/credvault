# CredVault — Project Agent Guide

> Project root for the CredVault verification platform. Read `ARCHITECTURE.md` first — it is
> the single source of truth for what we're building and why. Also read the workspace root
> `/home/anthony/midnight/AGENTS.md`.

## Status (2026-09-04)

**Phase: Steps 2, 2b, 2c COMPLETE.** Monolithic + granular transcript modes both
live on one contract (§17). Per-course subsets, docCommit blobs, honest refusals.
L2 TTL saga solved. All runbooks in docs/.

**MVP apps BUILT (2026-09-04):** portal server (`step1-degree/src/portal/server.ts`,
`npm run portal` :4050) serving verifier portal UI (/verify.html), holder PWA
(/holder.html — import/subset-share/QR, installable), issuer console (/issuer.html —
CSV batch + revoke + package links). Full QR handoff flow tested; console-issued
packages verify. Guide: docs/mvp-portal-guide.md.

**Next:** phone-test the holder PWA on LAN, then **Step 3** (the generator), or
polish: HTTPS for PWA install, issuer auth, portal-rendered transcript page.

## Status (2026-09-03, evening)

**Phase: Step 2 + 2b COMPLETE.** Per-course selective disclosure working (scheme v3:
course sub-trees in the master leaf; any subset verifiable; anti-cherry-picking via
sub-root convergence). L2 TTL saga solved (tblock windows; slim intents) — §16.
Verifier CLI now on verify-core (shared with the HTTP service). Runbooks for all
steps in docs/.

**Next: MVP build-out** (verifier portal UI on verify-core, holder app PWA,
issuer console) and/or **Step 3** (the generator). See MVP.md.

## Status (2026-09-03, evening)

**Phase: Step 2 COMPLETE.** Issuer runtime v1 + L2 ZK predicates working on undeployed.
L2 = persistentCommit threshold proofs, pre-minted off-chain (~2s/proof, no gas),
verified trustlessly via deploy-tx replay (~0.15s). Stateless HTTP verifier service
(POST /verify) exists — the portal precursor. persistentCommit layout cracked and
recorded (§15). Full test matrix passes. Details: ARCHITECTURE.md §15.

**Next: MVP build-out** (verifier portal UI on verify-core, holder app PWA,
issuer console) and/or **Step 3** (the generator). See MVP.md.

## Status (2026-09-03, later)

**Phase: Step 1 COMPLETE.** degree.compact (membership ∧ non-membership) + issuer/
holder/verifier CLIs working on undeployed. Exit test: valid ✓ / revoked ✗ / tampered ✗.
Verification = 0.1 s, issuer txs ~22 s (proving is fixed-overhead dominated for small
circuits; 1 tx anchors a whole cohort). Details: ARCHITECTURE.md §14. Project: step1-degree/.

**Next: Step 2** — issuer runtime (batched roots, proof service, revocation flow,
pre-minted packages), then L2 GPA-threshold circuits (ZK predicates).

## Status (2026-09-03)

**Phase: Step 0 COMPLETE.** Full compile → deploy → call → read loop verified on the
`undeployed` devnet with current versions. Full tx loop = 20s, sync 0.5s, instant reads.
Scaffold + instrumented driver: `step0-hello/`. Findings + benchmark table + workaround
obsolescence: ARCHITECTURE.md §13. **Key fix recorded:** `onchain-runtime-v3` must be
overridden to 3.0.0 + `npm dedupe` on fresh create-mn-app installs (3.1.0 breaks it).

## Next actions (in order)

1. **Step 1** — hand-write the degree + revocation contract (membership ∧ non-membership) with
   mock-issuer/holder/verifier CLIs. Base it on the step0-hello wiring (deploy.ts, wallet.ts,
   step0-driver.ts), NOT on the March pins. Re-benchmark with a real circuit.
2. Only then the issuer runtime (Step 2) and the generator (Step 3). **Do not build the
   generator before Steps 1–2 are hand-proven.**

## Key decisions so far

- Issuer holds all data (never CredVault); chain stores only commitments/roots/nullifiers.
- Pre-minted proof packages at issuance → issuer server can be batch-only (degrees).
  License-board schemas get flagged as prompt-revocation duty (keep runtime reachable).
- Students generate zero transactions; issuers batch (one tx per cohort batch).
- Per-issuer contracts, generated from a versioned Verification Schema (JSON/YAML).
- Configuration, not code: contracts are compositions of the 7 privacy patterns
  (midnight-expert `core-concepts:privacy-patterns`).
- All network specifics in one `NetworkConfig` with presets; dev on `undeployed`.
- Suggested university template: `schemas/college-degree.yaml` (5 claims, 3 disclosure
  levels, batch issuer runtime, compliance hooks). Verification fees are a FUTURE
  feature — schema carries `fees.enabled: false`; leave paywall/pricing seams, do not build.

## Reference material to consult before writing Compact

- `midnight-expert/plugins/compact-core/` and `compact-examples/` (read the SKILL.md files)
- `midnight-docs/docs/compact/` (language reference + standard library)
- `midnight-js/llms.txt` (SDK API summary) and `midnight-js/testkit-js/testkit-js-e2e/`
  (10 reference contracts + canonical provider wiring in `testkit-js/src/contract/providers.ts`)
- **March archive, salvaged locally: `reference/march-2026/`** (start at its `INDEX.md`) —
  bug research, transcript contracts, DSL, canonical code. Patterns yes, pins no.
- Raw full archive at `~/.openclaw/workspace/` — see ARCHITECTURE.md §9
