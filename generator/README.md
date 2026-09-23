# CredVault Generator v1

Schema-driven generator that produces per-issuer Midnight artifacts from a Verification Schema.

## What v1 does

- Parses a Verification Schema AST (JSON) or the human-friendly college-degree YAML adapter.
- Validates the schema against generator rules (no document bytes in circuits, uint-only metrics, etc.).
- Emits an **App Descriptor** (the generator <-> apps contract) and an **Issuer Config**.
- Compiles the universal **anchor-core** Compact contract (`verifyRange` serves every metric).
- Generates per-holder **credvault-package/1.0** files from cohort data.
- Verifies generated presentations against on-chain anchors via a schema-driven **verify-core**.

## Quick start

### Option A: No-code web UI

1. Start the web server:

       cd /home/anthony/midnight/apps/credvault/generator
       npm run web:build
       npm run web:server

2. Open http://127.0.0.1:4051
3. Use the visual builder to add fields, thresholds, and item sets.
4. Click **Generate Artifacts** to produce descriptor + issuer config + compiled contract.

During development, run the Vite dev server with hot reload:

       cd web
       npm run dev

The dev server proxies `/api` to the generator web server on port 4051.

### Option B: JSON file

See [docs/JSON_SCHEMA_GUIDE.md](docs/JSON_SCHEMA_GUIDE.md) for the full schema format.

       cd /home/anthony/midnight/apps/credvault/generator
       npx tsx src/cli/generate.ts --schema test/college-degree.ast.json --out ../generated-college --cohort ../step1-degree/data/cohort.json
       npx tsx src/cli/verify.ts --descriptor ../generated-college/descriptor.json --package ../generated-college/packages/STU-001.package.json

Expected output:

       VERIFIED - anchored on-chain and not revoked ( ~50 ms )

## Project layout

| Path | Purpose |
|---|---|
| `src/schemas/` | Schema AST types, parser, validator, YAML adapter, descriptor emitter |
| `src/runtime/` | Schema-driven canonical hashing, package generation, verify-core, issuer config |
| `src/cli/` | `generate.ts` and `verify.ts` command-line tools |
| `src/web/` | Express server serving the no-code UI and generator APIs |
| `web/` | Vite + React + Tailwind schema builder |
| `contracts/anchor-core.compact` | Universal per-issuer contract template |
| `docs/JSON_SCHEMA_GUIDE.md` | Power-user guide for authoring schemas in JSON |
| `test/` | Pipeline tests including byte-equality regression against step1-degree |

## Tests

       npx vitest run

## API endpoints

The web server exposes:

- `POST /api/validate-schema` — validate a schema AST
- `POST /api/generate-preview` — emit descriptor + issuer config preview
- `POST /api/generate` — compile contract and write all artifacts to `output/<name>/`

## Known v1 gaps

- Contract deployment / batch anchoring are not yet integrated into the generator CLI. v1 verifies against the pre-existing step1-degree contract. The universal contract template compiles and is ready to be deployed by a future `deploy` / `batch` command.
- Registry service is represented only by the descriptor hash and issuer-config schemaRef; a hosted registry endpoint is a platform-layer next step.
- L2 predicate proof verification in verify-core checks proof presence; full deploy-tx replay verification will be added when the universal contract is deployed and preminted.
