/**
 * Simple Test Runner for Node.js/Deno
 * 
 * This script tests the schema parser without requiring external test frameworks.
 * Run with: node --experimental-strip-types test-runner.ts
 * Or with Deno: deno run test-runner.ts
 */

import { 
  parseSchema, 
  parseJsonSchema,
  validateSchema,
  parseSchemaStrict,
  SchemaParser,
} from './schema-parser.ts';

// Test result tracking
const results = {
  passed: 0,
  failed: 0,
  errors: [] as string[],
};

function test(name: string, fn: () => void) {
  try {
    fn();
    results.passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    results.failed++;
    const message = error instanceof Error ? error.message : String(error);
    results.errors.push(`${name}: ${message}`);
    console.log(`❌ ${name}`);
    console.log(`   ${message}`);
  }
}

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(
      msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertExists(value: unknown, msg?: string) {
  if (value === undefined || value === null) {
    throw new Error(msg || 'Expected value to exist');
  }
}

function assertTrue(value: boolean, msg?: string) {
  if (!value) {
    throw new Error(msg || 'Expected true, got false');
  }
}

// ============================================================================
// Test Data
// ============================================================================

const validMinimalSchema = {
  sot_type: "test",
  credential_name: "test_credential",
  fields: [
    {
      name: "field1",
      type: "uint",
      verifiable: true,
      proofs: [{ type: "range", min: 0, max: 100 }]
    }
  ]
};

const invalidSchemaMissingCredentialName = {
  sot_type: "test",
  // Missing credential_name
  fields: [
    { name: "field1", type: "uint", verifiable: false }
  ]
};

const invalidSchemaBadFieldType = {
  sot_type: "test",
  credential_name: "test",
  fields: [
    { name: "field1", type: "invalid_type", verifiable: true }
  ]
};

const invalidSchemaDuplicateField = {
  sot_type: "test",
  credential_name: "test",
  fields: [
    { name: "field1", type: "uint", verifiable: true },
    { name: "field1", type: "string", verifiable: false }
  ]
};

const invalidSchemaBadRange = {
  sot_type: "test",
  credential_name: "test",
  fields: [
    {
      name: "value",
      type: "uint",
      verifiable: true,
      proofs: [{ type: "range", min: 100, max: 50 }]  // min > max
    }
  ]
};

const compositeSchema = {
  sot_type: "test",
  credential_name: "composite_test",
  fields: [
    { 
      name: "field_a", 
      type: "uint", 
      verifiable: true, 
      proofs: [{ type: "range", min: 0, max: 100, public_min: true, public_max: false }] 
    },
    { 
      name: "field_b", 
      type: "uint", 
      verifiable: true, 
      proofs: [{ type: "range", min: 0, max: 100, public_min: true, public_max: false }] 
    }
  ],
  composites: [
    {
      name: "and_test",
      logic: {
        AND: [
          { field: "field_a", proof: "range" },
          { field: "field_b", proof: "range" }
        ]
      }
    },
    {
      name: "or_test",
      logic: {
        OR: [
          { field: "field_a", proof: "range" },
          { field: "field_b", proof: "range" }
        ]
      }
    }
  ]
};

// ============================================================================
// Tests
// ============================================================================

console.log('\n🧪 Running DSL Parser Tests\n');

// Basic parsing tests
test('parses minimal valid schema', () => {
  const result = parseSchema(validMinimalSchema);
  assertTrue(result.success, 'Expected success to be true');
  assertExists(result.ast, 'Expected AST to exist');
  assertEquals(result.ast?.metadata.sot_type, 'test');
  assertEquals(result.ast?.metadata.credential_name, 'test_credential');
});

test('auto-adds merkle_existence proof', () => {
  const result = parseSchema(validMinimalSchema);
  assertExists(result.ast);
  const field = result.ast?.fields[0];
  assertExists(field);
  const merkleProof = field.proofs.find(p => p.type === 'merkle_existence');
  assertExists(merkleProof, 'Expected merkle_existence proof to be auto-added');
});

test('uses default values for optional fields', () => {
  const result = parseSchema(validMinimalSchema);
  assertExists(result.ast);
  assertEquals(result.ast?.metadata.version, '1.0.0');
  assertEquals(result.ast?.merkle_tree.depth, 8);
  assertEquals(result.ast?.merkle_tree.hash_algorithm, 'pedersen');
  assertEquals(result.ast?.revocation.enabled, false);
});

test('handles all field types', () => {
  const schema = {
    sot_type: "test",
    credential_name: "test",
    fields: [
      { name: "uint_field", type: "uint", verifiable: false },
      { name: "int_field", type: "int", verifiable: false },
      { name: "string_field", type: "string", verifiable: false },
      { name: "bytes_field", type: "bytes", verifiable: false },
      { name: "timestamp_field", type: "timestamp", verifiable: false },
      { name: "boolean_field", type: "boolean", verifiable: false }
    ]
  };
  
  const result = parseSchema(schema);
  assertTrue(result.success);
  assertEquals(result.ast?.fields.length, 6);
});

test('handles all proof types', () => {
  const schema = {
    sot_type: "test",
    credential_name: "test",
    fields: [
      { 
        name: "field1", 
        type: "uint", 
        verifiable: true,
        proofs: [
          { type: "range", min: 0, max: 100, public_min: true, public_max: false },
          { type: "equality", hash_algorithm: "pedersen" },
          { type: "merkle_existence" }
        ]
      }
    ],
    revocation: { enabled: true, sparse_tree_depth: 160 }
  };
  
  const result = parseSchema(schema);
  assertTrue(result.success);
  const field = result.ast?.fields[0];
  assertExists(field);
  assertTrue(field.proofs.some(p => p.type === 'range'));
  assertTrue(field.proofs.some(p => p.type === 'equality'));
  assertTrue(field.proofs.some(p => p.type === 'merkle_existence'));
});

// Validation tests
test('detects missing credential_name', () => {
  const result = validateSchema(invalidSchemaMissingCredentialName);
  assertEquals(result.valid, false);
  const error = result.errors.find(e => e.code === 'E002');
  assertExists(error, 'Expected E002 error for missing credential_name');
});

test('detects invalid field type', () => {
  const result = validateSchema(invalidSchemaBadFieldType);
  assertEquals(result.valid, false);
  const error = result.errors.find(e => e.code === 'E102');
  assertExists(error, 'Expected E102 error for invalid field type');
});

test('detects duplicate field names', () => {
  const result = validateSchema(invalidSchemaDuplicateField);
  assertEquals(result.valid, false);
  const error = result.errors.find(e => e.code === 'E103');
  assertExists(error, 'Expected E103 error for duplicate field name');
});

test('detects invalid range bounds (min > max)', () => {
  const result = validateSchema(invalidSchemaBadRange);
  assertEquals(result.valid, false);
  const error = result.errors.find(e => e.code === 'E202');
  assertExists(error, 'Expected E202 error for invalid range bounds');
});

test('generates warnings for no verifiable fields', () => {
  const schema = {
    sot_type: "test",
    credential_name: "test",
    fields: [
      { name: "field1", type: "string", verifiable: false }
    ]
  };
  
  const result = parseSchema(schema);
  assertTrue(result.success);
  const warning = result.warnings.find(w => w.code === 'W001');
  assertExists(warning, 'Expected W001 warning for no verifiable fields');
});

// Composite tests
test('parses AND composite', () => {
  const result = parseSchema(compositeSchema);
  assertTrue(result.success);
  const composite = result.ast?.composites.find(c => c.name === 'and_test');
  assertExists(composite);
  assertEquals(composite.logic.operator, 'AND');
});

test('parses OR composite', () => {
  const result = parseSchema(compositeSchema);
  assertTrue(result.success);
  const composite = result.ast?.composites.find(c => c.name === 'or_test');
  assertExists(composite);
  assertEquals(composite.logic.operator, 'OR');
});

test('detects undefined field reference in composite', () => {
  const schema = {
    sot_type: "test",
    credential_name: "test",
    fields: [
      { name: "field1", type: "uint", verifiable: true, proofs: [{ type: "range", min: 0, max: 100 }] }
    ],
    composites: [
      {
        name: "bad_composite",
        logic: {
          AND: [
            { field: "nonexistent_field", proof: "range" }
          ]
        }
      }
    ]
  };
  
  const result = validateSchema(schema);
  assertEquals(result.valid, false);
  const error = result.errors.find(e => e.code === 'E302');
  assertExists(error, 'Expected E302 error for undefined field reference');
});

// JSON parsing tests
test('parses valid JSON string', () => {
  const json = JSON.stringify(validMinimalSchema);
  const result = parseJsonSchema(json);
  assertTrue(result.success);
  assertExists(result.ast);
});

test('handles JSON parse errors', () => {
  const result = parseJsonSchema("not valid json");
  assertEquals(result.success, false);
  const error = result.errors.find(e => e.code === 'JSON_PARSE_ERROR');
  assertExists(error, 'Expected JSON_PARSE_ERROR');
});

test('parseSchemaStrict returns AST on success', () => {
  const ast = parseSchemaStrict(validMinimalSchema);
  assertExists(ast);
  assertEquals(ast.metadata.sot_type, 'test');
});

test('parseSchemaStrict throws on failure', () => {
  let threw = false;
  try {
    parseSchemaStrict(invalidSchemaMissingCredentialName);
  } catch (error) {
    threw = true;
  }
  assertTrue(threw, 'Expected parseSchemaStrict to throw on invalid schema');
});

// Scale validation
test('warns about scale on non-numeric types', () => {
  const schema = {
    sot_type: "test",
    credential_name: "test",
    fields: [
      { name: "field1", type: "string", scale: 100, verifiable: false }
    ]
  };
  
  const result = parseSchema(schema);
  assertTrue(result.success);
  const warning = result.warnings.find(w => w.code === 'W003');
  assertExists(warning, 'Expected W003 warning for scale on non-numeric type');
});

// ============================================================================
// Test Results
// ============================================================================

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Results: ${results.passed} passed, ${results.failed} failed`);

if (results.failed > 0) {
  console.log('\n❌ Failed tests:');
  results.errors.forEach(err => console.log(`   - ${err}`));
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
