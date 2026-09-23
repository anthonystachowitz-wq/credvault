# March-2026 CredVault Archive — Reference Index

> Salvaged from `~/.openclaw/workspace/` on 2026-09-02 (58 files). Dead credentials redacted.
> **Golden rule: patterns YES, pins NO.** Everything here ran on the March-2026 stack
> (compactc 0.29.0, midnight-js 3.1.0, wallet-sdk 1.0.0, indexer API **v3**, proof-server 7.0.0).
> Today's matrix: compactc 0.31.1, midnight-js 4.1.1, wallet-sdk 1.2.0, indexer **v4**,
> proof-server 8.1.0 — re-verify every workaround before reusing it.

## bug-research/ — the hard-won error→fix knowledge (START HERE when something breaks)

| File | Contents |
|---|---|
| `FIRST_SUCCESSFUL_DEPLOYMENT.md` | The 8 critical success factors + error→fix table for the 6 classic deployment failures (WebSocket global, midnightProvider, signTransactionIntents, key derivation, zkConfig ordering) |
| `CREDVAULT_MIDNIGHT_PREPROD_WORKING_CONFIG.md` | The full validated config: exact package.json pins, docker proof-server, endpoints, working deploy.ts |
| `midnight-compact-smart-contract-new-information.md` | Critical patterns: `globalThis.WebSocket`, `httpClientProofProvider(url, zkConfigProvider)`, string networkId, `unshieldedToken().raw` balance fix |
| `UPGRADE_REPORT.md` | wallet-sdk v1→v2 breaking changes post-mortem (v2 never synced on preprod). Re-evaluate against wallet-sdk 1.2.0 today |
| `CREDVAULT_TEST_SUMMARY.md` + `SESSION_SUMMARY_2026-03-15.md` + `2026-03-18-19-credvault-deployment.md` | E2E test fixes, 8-issue code-fix table, v3 deployment notes |
| `CredVault_Midnight_Reference.md` (38KB) | The living reference: what worked / what didn't, error catalog |

## contracts/ — the transcript contract (our Step-1 design ancestor)

- `transcript.compact`, `transcript-v2.compact` — Merkle membership + GPA threshold/range via
  commitment pattern (witnesses `gpaValue`/`gpaSalt`). pragma 0.21-era syntax — expect
  adjustments for compactc 0.31.1.
- `COMPILER_BUG_REPORT.md` — 0.29.0 bug: witness-calling circuits misclassified as pure → no
  prover/verifier keys. **Verify fixed in 0.31.1 during Step 0/1.**
- `WALLET_INTEGRATION.md`, `INTEGRATION_REPORT.md` — Lace vs headless Wallet SDK, three-part
  wallet (shielded/unshielded/DUST) architecture.
- `witnesses.ts`, `package.json` — the March witness impl + the exact validated version set.

## dsl/ — the March generator (Step 3's ancestor)

`schema-parser.ts` + `compact-generator.ts` (+ `types.ts`, `validator.ts`, tests, docs).
4 patterns (merkle existence, sparse-merkle revocation, range, equality), 16 use cases.
`sample-output/` has 8 generated `.compact` examples. Resume the ideas; rebuild on the
current compiler. **Its known gap: generated the contract but not the off-chain runtime twin.**

## canonical-code/ — working TypeScript (patterns to adapt, not copy)

- `README.md` — 10 canonical patterns (network config, key derivation, wallet init, RxJS sync,
  contract load with/without witnesses, provider setup, deployment, signing workaround)
- `deploy.ts`, `deploy-transcript-v2.ts`, `check-balance.ts` — full working scripts (March APIs)
- `credvault-hash.ts` — JS-side SHA-256 that byte-matches Compact `persistentHash`
  (pair with `research/PERSISTENTHASH_RESEARCH_RESULTS.md`)

## research/ & memory-notes/

- `PERSISTENTHASH_RESEARCH_RESULTS.md` — `persistentHash` = SHA-256 byte-layout for off-chain matching
- `midnight-wallet-sdk-research-report.md` — known wallet bugs (phantom balances, pendingOutputs)
- `compact-doctrine-SOUL.md` — privacy-first contract doctrine (disclose rules, bounded loops, cost heuristics)
- `memory-notes/2026-03-11-merkle-proof-limitations.md` — fixed-depth tree sizing (feeds our cohort-tree design)
- `memory-notes/2026-03-07-midnight-node-logs.md` — node ops Q&A (local node RPC usage)
