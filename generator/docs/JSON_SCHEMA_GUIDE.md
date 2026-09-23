# CredVault Verification Schema — JSON Authoring Guide

The generator accepts a **Verification Schema AST** (JSON) and turns it into a Midnight Compact contract + off-chain runtime twin. This guide is for power users who prefer authoring the schema directly instead of using the no-code builder.

## Top-level structure

```json
{
  "schemaVersion": "0.3",
  "name": "college-degree",
  "displayName": "Penn State University",
  "issuerType": "university",
  "domainPrefix": "credvault:",
  "packageFormat": "credvault-degree/0.3",
  "privateStateId": "credvaultDegreeState",
  "fields": [ ... ],
  "revocation": { "enabled": true, "cadence": "batch" },
  "issuerRuntime": { "mode": "batch", "preMint": ["L1", "L2"], "novelProofs": "on-request" },
  "fees": { "enabled": false }
}
```

| Field | Required | Description |
|---|---|---|
| `schemaVersion` | yes | `"0.3"` for generator v1 |
| `name` | yes | kebab-case identifier; drives filenames and registry refs |
| `displayName` | yes | human-readable issuer / credential name |
| `issuerType` | yes | `"university"`, `"license-board"`, `"organization"`, etc. |
| `domainPrefix` | yes | `"credvault:"` — domain tag for canonical hashing |
| `packageFormat` | yes | versioned package envelope, e.g. `"credvault-degree/0.3"` |
| `privateStateId` | yes | unique private-state store id |
| `fields` | yes | array of field definitions (see below) |
| `revocation` | yes | `enabled` boolean + `cadence` `"batch"` or `"prompt"` |
| `issuerRuntime` | yes | batch mode, premint levels, novel-proof policy |
| `fees` | yes | `enabled: false` in v1 (fees are future work) |

## Field kinds

### 1. directMatch

A field whose value is revealed or proven equal to a known value.

```json
{
  "kind": "directMatch",
  "name": "fullName",
  "type": "string",
  "disclosure": ["reveal"]
}
```

| Property | Allowed values |
|---|---|
| `type` | `"string"`, `"uint"`, `"boolean"`, `"timestamp"` |
| `disclosure` | array containing any of `"reveal"`, `"equality"` |
| `constant` | optional; issuer-constant value |

### 2. conditional

A uint field with threshold/range proofs (e.g. GPA >= 3.50).

```json
{
  "kind": "conditional",
  "name": "gpa",
  "type": "uint",
  "scale": 100,
  "uintBits": 64,
  "disclosure": ["reveal"],
  "conditional": {
    "operators": ["gte"],
    "criteria": [
      { "op": "gte", "value": "3.00" },
      { "op": "gte", "value": "3.50" }
    ],
    "novelThresholds": "on-request"
  }
}
```

| Property | Description |
|---|---|
| `scale` | multiply raw value by this to get the uint stored in circuits (e.g. 3.85 -> 385) |
| `operators` | `["gt"]`, `["lt"]`, `["gte"]`, `["lte"]`, or combinations |
| `criteria` | pre-minted thresholds; verifiers can also request novel thresholds later |

### 3. matchSet

A list of items that can be disclosed individually or as a whole document.

```json
{
  "kind": "matchSet",
  "name": "courseGrades",
  "maxItems": 40,
  "domainTag": "course",
  "itemFields": [
    { "name": "code", "type": "string" },
    { "name": "title", "type": "string" },
    { "name": "credits", "type": "uint", "scale": 1 },
    { "name": "grade", "type": "string" }
  ],
  "verification": { "individual": true, "group": true, "selected": "individual" },
  "disclosure": ["reveal", "subset"]
}
```

| Property | Description |
|---|---|
| `maxItems` | maximum number of items; determines Merkle tree depth |
| `domainTag` | used in canonical hashing prefix (legacy naming pin) |
| `itemFields` | schema for each list item |
| `verification.selected` | `"individual"` (selective) or `"group"` (all-or-nothing) |

## Validation rules

- Field names must be unique.
- `conditional` fields must be `uint`.
- Every criterion operator must be listed in the field's `operators`.
- `matchSet.maxItems` must be <= 65,536.
- Fees must be disabled in v1 (`fees.enabled: false`).

## Example: complete college-degree schema

See `test/college-degree.ast.json` in the generator project.

## CLI usage with a JSON file

```bash
cd /home/anthony/midnight/apps/credvault/generator
npx tsx src/cli/generate.ts --schema my-schema.json --out ../output/my-credential
```
