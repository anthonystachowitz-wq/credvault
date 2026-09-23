# CredVault MVP — the school project (first issuer template)

> **What this document is:** the MVP plan for the FIRST product built on the
> CredVault platform — college-degree verification. CredVault itself is the
> platform that GENERATES individualized verification applications per issuer
> type (ARCHITECTURE.md §7, Step 3). This MVP validates the whole stack with
> one concrete issuer and lands the first pilot.

## The layers (never confuse them)

- **Platform (the company):** Verification Schema → generator → per-issuer
  contract + per-issuer runtime. The 7 patterns are the menu; each issuer
  type is a recipe.
- **Templates:** college-degree (this MVP), license-authority, employment-
  history, ... — each a schema + generated artifacts.
- **Universal apps (multi-tenant, build ONCE):** verifier portal, holder app,
  issuer console. A presentation file carries its own schema/contract ref, so
  the same apps serve every issuer type forever.
- **This MVP = college-degree hand-built + universal apps v1.** It is the
  reference implementation the Step-3 generator must be able to reproduce
  (that is the generator's first exit test).

## The five pieces

0. **cv-core (shared lib)** — canonical.ts + verification logic + package/
   presentation formats. Frozen data contracts (exists since Step 1).
1. **Verifier Portal** (public web) — scan QR/paste link → POST /verify →
   recompute (STATELESS) → result page (VERIFIED / REVOKED / INVALID +
   portal-rendered transcript for L3). Seams: paywall (fees §12), FCRA
   consent checkbox, privacy-minimal audit log (hashes/IDs only).
2. **Holder App** (PWA first) — magic-link package download, on-device store,
   "Share" → presentation + QR. NO wallet, keys, or on-device proving (L1/L3
   need none). The tap IS the consent.
3. **Issuer Console** (web, registrar) — login → upload cohort CSV → Run
   Batch (one anchor tx) → per-student download links → Revoke button →
   aggregate-only stats.
4. **The chain** — validRoots / revoked / authority. Anchors only.
5. **Issuer Runtime** (Step 2) — console backend: batch anchor + package
   generation. "On in May, off after."

## Data-flow rules (HARD RULES — reviewed 2026-09-03)

1. Holder data goes ONLY to the verifier: app → portal (transient) →
   employer screen. Portal recomputes, renders, DISCARDS. Stateless.
2. NOTHING is sent back to the school after verification. The school is the
   source of truth and is OUT of the loop at verification time — that is the
   product's superpower, not a missing feature.
3. School-facing telemetry, if an issuer wants it, is AGGREGATE ONLY
   ("137 verifications this month"). Never per-event detail: where Alice
   applies to jobs is Alice's private business.
4. No PII on-chain, ever (anchors only). No PII persisted by CredVault,
   anywhere (audit log = hashes/IDs).

## User journeys

- **Registrar:** login → upload class-of-2027.csv → Run Batch (~22 s anchor
  tx) → send download links. Twice a year. Revoke button ~never pressed.
- **Student:** magic link → package in app → Share → QR. No blockchain-shaped
  anything.
- **Employer:** scan → "✓ VERIFIED — Penn State, 2027 — Alice Johnson, B.S.
  CS, GPA 3.85 — not revoked" in ~0.1 s, no account. Portal-rendered
  transcript is the authoritative artifact.

## Deliberate MVP cuts

| Cut | Later |
|---|---|
| PWA, not native | React Native wrapper |
| Magic links | school SSO |
| One issuer | multi-issuer via generator |
| L1 + L3 | L2 threshold proofs in packages |
| No fees (seam in place) | §12 paywall — pair with R1: on-chain receipts + atomic settlement |
| Off-chain verification only | R1 premium tier: on-chain receipts (see ARCHITECTURE.md §10a) |
| Mock school data | real SIS export mapping |
| Manual consent checkbox | full FCRA consent workflow |

## Build order (each piece demo-able alone)

1. ✅ Verifier Portal (verify-core + HTTP + result page, with L2 + courses)
2. ✅ Holder App PWA (import/store/subset-share/QR — no crypto on phone by design)
3. ✅ Issuer Console (CSV batch + revoke + package links; runtime via subprocess)
4. Pilot: "we'll run your next graduation batch for free."

## After the MVP

Step 3 — the generator: schema intake UI → reproduce this template from a
schema (first exit test) → license-authority template (prompt-revocation,
per-course proofs from the pattern library) → onboarding pipeline → preview/
preprod deployment.