# Quick Start Guide

Get started with the CredVault DSL Schema Parser in 5 minutes.

## Installation

No installation required for testing - just Node.js v22+.

```bash
cd ~/.openclaw/workspace/dsl
node test-node.js
```

## Your First Schema

Create a file called `my-schema.yaml`:

```yaml
sot_type: "university"
credential_name: "transcript"
version: "1.0.0"
description: "Simple university transcript"

fields:
  - name: "gpa"
    type: "uint"
    scale: 100
    verifiable: true
    proofs:
      - type: "range"
        min: 200
        max: 400
        public_min: true
        public_max: false

  - name: "graduated"
    type: "boolean"
    verifiable: true
    proofs:
      - type: "equality"

merkle_tree:
  depth: 8

revocation:
  enabled: true
  sparse_tree_depth: 160
```

## Parse It

Create `parse.js`:

```javascript
import { readFileSync } from 'fs';

// Simple YAML to object (use js-yaml for production)
function simpleYAML(content) {
  // ... (see full parser in examples)
}

// Inline parser (from test-node.js)
function parseSchema(schema) {
  // Returns { success, ast, errors, warnings }
}

const yaml = readFileSync('my-schema.yaml', 'utf-8');
const schema = simpleYAML(yaml);
const result = parseSchema(schema);

if (result.success) {
  console.log('✅ Schema is valid!');
  console.log('AST:', JSON.stringify(result.ast, null, 2));
} else {
  console.error('❌ Validation failed:');
  result.errors.forEach(e => console.error(`  - ${e.path}: ${e.message}`));
}
```

Run it:

```bash
node parse.js
```

## Understanding the Output

The parser produces an AST (Abstract Syntax Tree) like this:

```javascript
{
  metadata: {
    sot_type: "university",
    credential_name: "transcript",
    version: "1.0.0"
  },
  fields: [
    {
      name: "gpa",
      type: "uint",
      scale: 100,
      verifiable: true,
      proofs: [
        { type: "merkle_existence" },  // Auto-added
        { type: "range", min: 200, max: 400, ... }
      ]
    }
  ],
  merkle_tree: { depth: 8, hash_algorithm: "pedersen" },
  revocation: { enabled: true, sparse_tree_depth: 160 },
  composites: []
}
```

This AST is ready for the next step: **Compact code generation**.

## Common Patterns

### Age Verification

```yaml
fields:
  - name: "date_of_birth"
    type: "timestamp"
    verifiable: true
    proofs:
      - type: "range"
        max: null  # Will be current_time - 18 years
        comparison: "<="
        public_max: true  # Verifier sees age threshold
```

### Multi-State License

```yaml
composites:
  - name: "valid_in_us"
    logic:
      OR:
        - field: "issuing_state"
          proof: "equality"
          condition: "CA"
        - field: "issuing_state"
          proof: "equality"
          condition: "TX"
        - field: "issuing_state"
          proof: "equality"
          condition: "NY"
```

### Senior-Level Qualification

```yaml
composites:
  - name: "senior_engineer"
    logic:
      AND:
        - field: "years_experience"
          proof: "range"
          condition: ">= 5"
        - field: "certification"
          proof: "equality"
        - OR:
            - field: "degree"
              proof: "equality"
              condition: "MS"
            - field: "degree"
              proof: "equality"
              condition: "PhD"
```

## Next Steps

1. Read the full [README.md](README.md) for detailed documentation
2. Check the [examples/](examples/) directory for more schemas
3. Review [CHANGELOG.md](CHANGELOG.md) for version history

## Getting Help

- Check validation error codes in the README
- Look at `invalid-schema.yaml` for common mistakes
- Review the test cases in `test-node.js` for usage examples
