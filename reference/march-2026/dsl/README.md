# CredVault DSL Schema Parser

A TypeScript-based Domain Specific Language (DSL) parser for generating Midnight Compact smart contracts. This is the foundation of the CredVault project - a universal credential verification platform using zero-knowledge proofs.

## Overview

The DSL schema parser converts human-readable YAML/JSON schema definitions into a typed Abstract Syntax Tree (AST) suitable for code generation. It supports four fundamental ZK proof patterns and composite boolean logic for complex verification requirements.

## The 4 Core ZK Patterns

### 1. Merkle Existence Proof
Proves that a credential exists in the registry.

```yaml
proofs:
  - type: "merkle_existence"
```

**Auto-added** for all verifiable fields unless explicitly disabled.

### 2. Sparse Merkle Non-Existence Proof
Proves that a credential has NOT been revoked.

```yaml
proofs:
  - type: "sparse_merkle_non_existence"
```

Used in conjunction with revocation lists.

### 3. Range Proof
Proves a numeric value falls within a range without revealing the actual value.

```yaml
proofs:
  - type: "range"
    min: 200          # 2.0 GPA (if scale=100)
    max: 400          # 4.0 GPA
    public_min: true  # Verifier knows "GPA >= 2.0"
    public_max: false # Verifier doesn't see max
    comparison: ">="  # Operator
```

**Use cases:** Age verification, GPA thresholds, salary ranges, credit scores.

### 4. Equality Proof
Proves an exact match without revealing the value.

```yaml
proofs:
  - type: "equality"
    hash_algorithm: "pedersen"  # or "blake2b", "sha256"
```

**Use cases:** License number matching, certification ID verification, degree type.

## Composite Patterns

Combine multiple proofs with boolean logic:

### AND
```yaml
composites:
  - name: "qualified"
    logic:
      AND:
        - field: "gpa"
          proof: "range"
          condition: ">= 300"
        - field: "graduation_date"
          proof: "range"
          condition: "not_expired"
```

### OR
```yaml
composites:
  - name: "texas_or_california"
    logic:
      OR:
        - field: "issuing_state"
          proof: "equality"
          condition: "TX"
        - field: "issuing_state"
          proof: "equality"
          condition: "CA"
```

### NOT
```yaml
composites:
  - name: "not_revoked"
    logic:
      NOT:
        field: "revocation_status"
        proof: "equality"
```

### THRESHOLD (N of M)
```yaml
composites:
  - name: "multi_certified"
    logic:
      THRESHOLD: [2,  # At least 2 of 3
        { field: "cert_a", proof: "equality" },
        { field: "cert_b", proof: "equality" },
        { field: "cert_c", proof: "equality" }
      ]
```

### Nested Composites
```yaml
composites:
  - name: "complex"
    logic:
      AND:
        - OR:
            - field: "field_a"
              proof: "range"
            - field: "field_b"
              proof: "range"
        - field: "field_c"
          proof: "equality"
```

## Schema Structure

```yaml
sot_type: "university"                    # Source of Truth type
credential_name: "academic_transcript"    # Credential identifier
version: "1.0.0"                          # Schema version (optional, default: 1.0.0)
description: "University transcript"      # Human-readable description

fields:                                   # Credential fields
  - name: "gpa"
    type: "uint"                          # uint | int | string | bytes | timestamp | boolean
    scale: 100                            # Fixed-point scale (for uint/int only)
    verifiable: true                      # Include in ZK proofs
    description: "Grade point average"    # Field description
    proofs:                               # Proof requirements for this field
      - type: "range"
        min: 0
        max: 400
        public_min: true
        public_max: false

merkle_tree:                              # Merkle tree configuration
  depth: 8                                # Supports 2^8 = 256 fields
  hash_algorithm: "pedersen"              # pedersen | blake2b

revocation:                               # Revocation configuration
  enabled: true
  sparse_tree_depth: 160                  # For sparse Merkle tree
  update_frequency: "batch"               # immediate | batch | periodic

composites:                               # Composite proof definitions
  - name: "honors_graduate"
    description: "GPA >= 3.5"
    logic:
      AND:
        - field: "gpa"
          proof: "range"
          condition: ">= 350"
```

## Field Types

| Type | Description | Supports Range Proof |
|------|-------------|---------------------|
| `uint` | Unsigned integer | ✅ Yes |
| `int` | Signed integer | ✅ Yes |
| `timestamp` | Unix timestamp | ✅ Yes |
| `string` | UTF-8 string | ❌ No (use equality) |
| `bytes` | Raw byte array | ❌ No (use equality) |
| `boolean` | True/false | ❌ No (use equality) |

## Usage

### Basic Parsing

```typescript
import { parseSchema, parseJsonSchema, parseYamlSchema } from './schema-parser';

// Parse an object
const result = parseSchema(schemaObject);

if (result.success) {
  console.log('AST:', result.ast);
} else {
  console.error('Errors:', result.errors);
}

// Parse JSON string
const jsonResult = parseJsonSchema(jsonString);

// Parse YAML string (requires js-yaml)
import * as yaml from 'js-yaml';
const yamlResult = parseYamlSchema(yamlString, { yaml });
```

### Strict Parsing

```typescript
import { parseSchemaStrict } from './schema-parser';

try {
  const ast = parseSchemaStrict(schemaObject);
  // Use AST directly
} catch (error) {
  console.error('Parse failed:', error.message);
}
```

### Validation Only

```typescript
import { validateSchema } from './schema-parser';

const result = validateSchema(schemaObject);
if (!result.valid) {
  result.errors.forEach(error => {
    console.log(`${error.code} at ${error.path}: ${error.message}`);
  });
}
```

### Custom Configuration

```typescript
import { SchemaParser } from './schema-parser';

const parser = new SchemaParser({
  strict_mode: true,
  default_merkle_depth: 10,
  default_sparse_tree_depth: 160,
  supported_field_types: ['uint', 'string', 'timestamp']
});

const result = parser.parse(schemaObject);
```

## Error Codes

| Code | Severity | Description |
|------|----------|-------------|
| E001 | Error | Missing sot_type |
| E002 | Error | Missing credential_name |
| E100 | Error | Missing field name |
| E101 | Error | Missing field type |
| E102 | Error | Invalid field type |
| E103 | Error | Duplicate field name |
| E104 | Error | Invalid scale value |
| E200 | Error | Invalid proof type |
| E201 | Error | Missing proof type |
| E202 | Error | Invalid range bounds |
| E203 | Error | Invalid range comparison operator |
| E300 | Error | Invalid composite operator |
| E301 | Error | Missing composite name |
| E302 | Error | Undefined field reference |
| E303 | Error | Invalid composite logic |
| E400 | Error | Invalid merkle tree depth |
| E401 | Error | Invalid sparse tree depth |
| W001 | Warning | No verifiable fields |
| W002 | Warning | Missing schema description |
| W003 | Warning | Scale on non-numeric type |

## Running Tests

### With Deno
```bash
deno test schema-parser.test.ts
```

### With Node.js
```bash
node --experimental-strip-types test-runner.ts
```

### Expected Output
```
🧪 Running DSL Parser Tests

✅ parses minimal valid schema
✅ auto-adds merkle_existence proof
...

📊 Test Results: 20 passed, 0 failed
✅ All tests passed!
```

## Example Schemas

See the `examples/` directory for complete examples:

- `university-transcript.yaml` - Academic credential verification
- `drivers-license.yaml` - DMV credential with age/range proofs
- `professional-certification.yaml` - Multi-certification threshold proofs
- `medical-license.json` - Healthcare provider verification
- `invalid-schema.yaml` - Schema with intentional errors (for testing)

## Architecture

```
┌─────────────────┐
│  YAML/JSON      │
│  Schema         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Validator      │ ← Validates structure, types, references
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Parser         │ ← Converts to typed AST
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AST Output     │ → Consumed by Compact code generator
└─────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `types.ts` | TypeScript interfaces and type definitions |
| `validator.ts` | Schema validation logic |
| `schema-parser.ts` | Main parser and convenience functions |
| `schema-parser.test.ts` | Comprehensive test suite (Deno) |
| `test-runner.ts` | Simple test runner (Node.js/Deno) |
| `examples/` | Example schemas for various use cases |

## Design Decisions

1. **Immutable Parsing**: The parser produces a new AST object; input schemas are not modified.

2. **Validation First**: Schemas are fully validated before parsing to AST. No partial parses.

3. **Auto-Added Proofs**: Merkle existence proofs are automatically added for verifiable fields. This ensures consistency and reduces boilerplate.

4. **Explicit Over Implicit**: Field types, proof types, and operators must be explicitly specified. No magic strings.

5. **Error Context**: All errors include a path (JSON pointer) to the problematic element.

6. **Warnings for Best Practices**: The validator warns about common issues (no verifiable fields, missing descriptions) without failing.

## Next Steps

This parser is the **first component** of the DSL system. The next steps are:

1. **Compact Code Generator** - Convert AST to `.compact` smart contract code
2. **Proof Circuit Generator** - Generate ZK circuit definitions
3. **CLI Tool** - Command-line interface for schema management
4. **IDE Support** - Language server for autocomplete and validation

## Contributing

This is an open-source tool for the Midnight community. Contributions are welcome!

### Areas for Contribution

- Additional proof types
- More validation rules
- Better error messages
- IDE integrations
- Documentation improvements
- Additional example schemas

## License

[License TBD - Suggest MIT or Apache 2.0]

## Acknowledgments

Built for the Midnight ecosystem - enabling privacy-preserving credential verification through zero-knowledge proofs.
