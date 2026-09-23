# CredVault Generator — No-Code UI User Guide

This guide explains how to build a verification contract using the CredVault web UI without writing any JSON or Compact code.

## What you can build

The no-code UI creates a **Verification Schema**. From that schema, CredVault automatically produces:

- a Midnight Compact contract (universal `anchor-core` template),
- an **App Descriptor** that drives verifier/holder apps,
- an **Issuer Config** that tells the issuer console how to batch credentials.

In v1 the UI supports three kinds of credential fields:

| Field kind | Use it for | Example |
|---|---|---|
| Direct field | Plain values shown or checked | Name, degree, license number |
| Metric / threshold | Numeric comparisons proven in zero knowledge | GPA ≥ 3.50, age ≥ 21 |
| Item set | Lists disclosed all-at-once or item-by-item | Course grades, certifications |

## Starting the UI

### Production build

    cd /home/anthony/midnight/apps/credvault/generator
    npm install
    npm run web:build
    npm run web:server

Open http://127.0.0.1:4051 in a browser.

### Developer mode (hot reload)

    cd /home/anthony/midnight/apps/credvault/generator/web
    npm install
    npm run dev

The dev server proxies API calls to the generator server on port 4051.

## Building a schema step by step

### 1. Fill in the credential settings

At the top of the visual builder, set:

- **Name** — a short kebab-case identifier (e.g. `college-degree`).
- **Display Name** — the human name shown to users (e.g. `Penn State University`).
- **Issuer Type** — `university`, `license-board`, `organization`, etc.
- **Package Format** — a versioned envelope like `credvault-degree/0.3`.

### 2. Add fields

Use the three buttons below the field list:

- **+ Direct Field** — for plain text/number values.
- **+ Metric / Threshold** — for numeric comparisons.
- **+ Item Set** — for lists of items.

Each field needs a unique **Name**. The name is used inside packages and presentations, so keep it stable after issuance.

### 3. Configure each field

#### Direct field

- **Type**: string, uint, boolean, or timestamp.
- **Disclosure**:
  - `reveal` — holder may show the value.
  - `reveal + equality` — holder may show the value or prove it equals a verifier-supplied value.
  - `equality` — only equality proofs are allowed.

#### Metric / threshold field

- **Scale**: how many decimal places the raw value has.
  - `1` for whole numbers.
  - `100` for two decimal places (e.g. 3.85 → 385 in the circuit).
- **Operators**: which comparisons are allowed, e.g. `gte` (greater-or-equal).
- **Criteria**: pre-defined thresholds the issuer will mint proofs for.
  - Example: `3.00, 3.50` pre-mints proofs for GPA ≥ 3.00 and GPA ≥ 3.50.

#### Item set field

- **Max Items**: the largest number of items the set can hold. This determines the Merkle tree depth.
- **Mode**:
  - `individual` — holder can disclose any subset of items (e.g. show only two courses).
  - `group` — holder must disclose the whole set or nothing.
- **Item Fields**: comma-separated `name:type` pairs describing each item.
  - Example: `code:string, title:string, credits:uint, grade:string`.

### 4. Reorder fields (drag and drop)

Grab the field card by its header and drag it to a new position. The order determines how fields are committed into the credential leaf, so keep it consistent after issuance.

### 5. Review the JSON

Switch to the **JSON Editor** tab to see the schema AST. The JSON and visual builder stay in sync. Power users can edit JSON directly; the visual builder will reflect the changes if the JSON is valid.

### 6. Export or generate

- **Export JSON** — download the schema AST to store or version-control it.
- **Generate Artifacts** — compile the contract and write the descriptor, issuer config, and compiled contract to `generator/output/<schema-name>/`.

## Tips and constraints

- Field names must be unique and should not change after you issue credentials.
- Metric fields must be `uint`. Decimals are handled by the scale setting.
- Fees are disabled in v1 (`fees.enabled: false`).
- For detailed schema rules, see `generator/docs/JSON_SCHEMA_GUIDE.md`.

## What happens next

After generating artifacts:

1. The issuer deploys the compiled contract and runs a batch to anchor cohorts.
2. Holders receive `credvault-package/1.0` files.
3. Verifiers check packages against the on-chain contract using the descriptor.

Deployment and batch anchoring are not yet part of the UI; they are run from the CLI in v1.
