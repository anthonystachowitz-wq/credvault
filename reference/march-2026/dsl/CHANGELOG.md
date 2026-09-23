# Changelog

All notable changes to the CredVault DSL Schema Parser will be documented in this file.

## [1.0.0] - 2025-03-11

### Added

- Initial release of the DSL schema parser
- **4 Core ZK Proof Patterns:**
  - Merkle Existence Proof
  - Sparse Merkle Non-Existence Proof  
  - Range Proof
  - Equality Proof
- **Composite Proof Patterns:**
  - AND logic
  - OR logic
  - NOT logic
  - THRESHOLD logic (N of M)
  - Nested composites
- **Full TypeScript Support:**
  - Complete type definitions
  - Strongly-typed AST output
  - Configurable parser options
- **Comprehensive Validation:**
  - 16+ error codes with descriptive messages
  - Field type validation
  - Range bound validation
  - Duplicate field detection
  - Undefined field reference detection
  - Warning system for best practices
- **Multiple Input Formats:**
  - JSON object parsing
  - JSON string parsing
  - YAML string parsing (via js-yaml)
- **Example Schemas:**
  - University transcript
  - Driver's license
  - Professional certification
  - Medical license
  - Invalid schema (for testing)
- **Test Suite:**
  - 16+ unit tests
  - Example schema validation
  - Edge case coverage

### Design Decisions

- Auto-add merkle_existence proofs for verifiable fields
- Validation-first approach (fail fast)
- JSON path error reporting
- Support for scale factors on numeric types
- Configurable hash algorithms (pedersen, blake2b, sha256)

### Architecture

```
YAML/JSON Schema → Validator → Parser → AST
```

The AST output is designed to be consumed by a Compact code generator (next component).

## Roadmap

### Next Components

1. **Compact Code Generator** - Convert AST to `.compact` smart contract code
2. **Proof Circuit Generator** - Generate ZK circuit definitions
3. **CLI Tool** - Command-line interface for schema management
4. **IDE Support** - Language server for autocomplete and validation

### Potential Enhancements

- Additional proof types (membership, set membership)
- More validation rules
- Schema versioning and migration support
- Import/export between schema versions
- IDE plugins (VSCode, Vim, etc.)
