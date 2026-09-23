# CredVault

Schema-driven verification contract generator for the Midnight blockchain.

CredVault lets issuers create privacy-preserving verification contracts from a questionnaire or JSON schema — no Compact code required. Holders present proof packages, verifiers check in milliseconds, and only issuers write to the chain.

## Quick links

- [Generator README](generator/README.md) — setup, CLI, web UI, tests
- [No-Code UI User Guide](generator/docs/UI_USER_GUIDE.md) — how to use the visual schema builder
- [JSON Schema Authoring Guide](generator/docs/JSON_SCHEMA_GUIDE.md) — power-user reference for the schema AST
- [Architecture](ARCHITECTURE.md) — design decisions, step reports, environment strategy

## Repository layout

| Path | What it is |
|---|---|
| `generator/` | The generator package: parser, descriptor emitter, runtime, CLI, web UI, web server |
| `step0-hello/` | Toolchain sanity project (external embedded repo, not tracked here) |
| `step1-degree/` | Hand-built reference implementation: degree + revocation contract, portal, issuer runtime |
| `schemas/` | Human-readable schema templates, e.g. `college-degree.yaml` |
| `learning/` | Midnight curriculum materials |
| `reference/march-2026/` | Prior project archive — patterns yes, pins no |
| `docs/` | Architecture, runbooks, and build plans |

## What works today

- Parse and validate a Verification Schema AST.
- Emit an App Descriptor and Issuer Config.
- Compile a universal `anchor-core.compact` contract.
- Generate per-holder `credvault-package/1.0` files from cohort data.
- Verify packages against on-chain anchors with a schema-driven engine.
- No-code web UI for building schemas.

## Current limitations

- The schema model supports direct fields, uint thresholds, and item sets. Composite predicates (AND/OR/NOT) and broader verification patterns are planned for v2.
- Contract deployment and batch anchoring currently run through the step1-degree CLI; generator-native deploy/batch commands are the next milestone.
- Verification fees are disabled in v1.

## Contributing workflow

This repo contains only the CredVault project code. The Midnight platform reference repositories (`midnight-docs`, `midnight-js`, `midnight-node`, `midnight-zk`, `midnight-awesome-dapps`, `midnight-expert`) live outside this repo and must not be committed here.

## License

MIT — see individual package.json files.
