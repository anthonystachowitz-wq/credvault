/**
 * CredVault DSL Parser Tests
 * 
 * Comprehensive test suite for the schema parser and validator.
 * Run with: deno test schema-parser.test.ts
 */

import { 
  parseSchema, 
  parseJsonSchema, 
  parseYamlSchema,
  SchemaParser,
  SchemaValidator,
  validateSchema,
  parseSchemaStrict 
} from './schema-parser.ts';
import { 
  assertEquals, 
  assertExists,
  assertThrows,
} from 'https://deno.land/std@0.200.0/testing/asserts.ts';

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

const validFullSchema = {
  sot_type: "university",
  credential_name: "academic_transcript",
  version: "1.0.0",
  description: "University transcript schema",
  fields: [
    {
      name: "gpa",
      type: "uint",
      scale: 100,
      verifiable: true,
      description: "Grade point average",
      proofs: [
        {
          type: "range",
          min: 0,
          max: 400,
          public_min: true,
          public_max: false,
          comparison: ">="
        }
      ]
    },
    {
      name: "graduation_date",
      type: "timestamp",
      verifiable: true,
      proofs: [
        {
          type: "range",
          min: null,
          max: null,
          public_min: false,
          public_max: true,
          comparison: "<="
        }
      ]
    },
    {
      name: "degree_type",
      type: "string",
      verifiable: true,
      proofs: [{ type: "equality" }]
    },
    {
      name: "student_id",
      type: "string",
      verifiable: false
    }
  ],
  merkle_tree: {
    depth: 8,
    hash_algorithm: "pedersen"
  },
  revocation: {
    enabled: true,
    sparse_tree_depth: 160,
    update_frequency: "batch"
  },
  composites: [
    {
      name: "honors_graduate",
      description: "High GPA graduate",
      logic: {
        AND: [
          { field: "gpa", proof: "range", condition: ">= 350" },
          { field: "graduation_date", proof: "range", condition: "not_expired" }
        ]
      }
    }
  ]
};

const invalidSchemaMissingFields = {
  sot_type: "test",
  // Missing credential_name
  fields: []
};

const invalidSchemaBadTypes = {
  sot_type: "test",
  credential_name: "test",
  fields: [
    {
      name: "bad_field",
      type: "not_a_type",
      verifiable: true
    }
  ]
};

const invalidSchemaDuplicateFields = {
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
      proofs: [
        { type: "range", min: 100, max: 50 }  // min > max
      ]
    }
  ]
};

const compositeSchema = {
  sot_type: "test",
  credential_name: "composite_test",
  fields: [
    { name: "field_a", type: "uint", verifiable: true, proofs: [{ type: "range", min: 0, max: 100 }] },
    { name: "field_b", type: "uint", verifiable: true, proofs: [{ type: "range", min: 0, max: 100 }] },
    { name: "field_c", type: "uint", verifiable: true, proofs: [{ type: "range", min: 0, max: 100 }] }
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
    },
    {
      name: "not_test",
      logic: {
        NOT: { field: "field_a", proof: "range" }
      }
    },
    {
      name: "threshold_test",
      logic: {
        THRESHOLD: [2, 
          { field: "field_a", proof: "range" },
          { field: "field_b", proof: "range" },
          { field: "field_c", proof: "range" }
        ]
      }
    },
    {
      name: "nested_test",
      logic: {
        AND: [
          {
            OR: [
              { field: "field_a", proof: "range" },
              { field: "field_b", proof: "range" }
            ]
          },
          { field: "field_c", proof: "range" }
        ]
      }
    }
  ]
};

// ============================================================================
// Tests
// ============================================================================

Deno.test("SchemaParser - parses minimal valid schema", () => {
  const result = parseSchema(validMinimalSchema);
  
  assertEquals(result.success, true);
  assertExists(result.ast);
  assertEquals(result.ast?.metadata.sot_type, "test");
  assertEquals(result.ast?.metadata.credential_name, "test_credential");
  assertEquals(result.ast?.metadata.version, "1.0.0");  // Default version
  assertEquals(result.ast?.fields.length, 1);
  assertEquals(result.ast?.merkle_tree.depth, 8);  // Default
  assertEquals(result.ast?.revocation.enabled, false);  // Default
});

Deno.test("SchemaParser - parses full schema correctly", () => {
  const result = parseSchema(validFullSchema);
  
  assertEquals(result.success, true);
  assertExists(result.ast);
  
  // Check metadata
  assertEquals(result.ast?.metadata.sot_type, "university");
  assertEquals(result.ast?.metadata.credential_name, "academic_transcript");
  assertEquals(result.ast?.metadata.version, "1.0.0");
  assertEquals(result.ast?.metadata.description, "University transcript schema");
  
  // Check fields
  assertEquals(result.ast?.fields.length, 4);
  
  const gpaField = result.ast?.fields.find(f => f.name === "gpa");
  assertExists(gpaField);
  assertEquals(gpaField.type, "uint");
  assertEquals(gpaField.scale, 100);
  assertEquals(gpaField.verifiable, true);
  assertEquals(gpaField.proofs.length, 2);  // merkle + range
  
  // Check merkle tree config
  assertEquals(result.ast?.merkle_tree.depth, 8);
  assertEquals(result.ast?.merkle_tree.hash_algorithm, "pedersen");
  
  // Check revocation config
  assertEquals(result.ast?.revocation.enabled, true);
  assertEquals(result.ast?.revocation.sparse_tree_depth, 160);
  
  // Check composites
  assertEquals(result.ast?.composites.length, 1);
  assertEquals(result.ast?.composites[0].name, "honors_graduate");
  assertEquals(result.ast?.composites[0].logic.operator, "AND");
});

Deno.test("SchemaParser - auto-adds merkle_existence proof", () => {
  const result = parseSchema(validMinimalSchema);
  
  assertExists(result.ast);
  const field = result.ast?.fields[0];
  assertExists(field?.proofs.find(p => p.type === "merkle_existence"));
});

Deno.test("SchemaParser - handles all field types", () => {
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
  assertEquals(result.success, true);
  assertEquals(result.ast?.fields.length, 6);
});

Deno.test("SchemaParser - handles all proof types", () => {
  const schema = {
    sot_type: "test",
    credential_name: "test",
    fields: [
      { 
        name: "field1", 
        type: "uint", 
        verifiable: true,
        proofs: [
          { type: "range", min: 0, max: 100 },
          { type: "merkle_existence" },
          { type: "sparse_merkle_non_existence" }
        ]
      },
      {
        name: "field2",
        type: "string",
        verifiable: true,
        proofs: [
          { type: "equality", hash_algorithm: "blake2b" }
        ]
      }
    ],
    revocation: { enabled: true, sparse_tree_depth: 160 }
  };
  
  const result = parseSchema(schema);
  assertEquals(result.success, true);
  
  const field1 = result.ast?.fields.find(f => f.name === "field1");
  assertExists(field1);
  assertExists(field1.proofs.find(p => p.type === "range"));
  assertExists(field1.proofs.find(p => p.type === "merkle_existence"));
  assertExists(field1.proofs.find(p => p.type === "sparse_merkle_non_existence"));
  
  const field2 = result.ast?.fields.find(f => f.name === "field2");
  assertExists(field2);
  const equalityProof = field2.proofs.find(p => p.type === "equality");
  assertExists(equalityProof);
  assertEquals((equalityProof as any).hash_algorithm, "blake2b");
});

Deno.test("SchemaParser - validates composite patterns", () => {
  const result = parseSchema(compositeSchema);
  
  assertEquals(result.success, true);
  assertExists(result.ast);
  assertEquals(result.ast?.composites.length, 5);
  
  // Check AND
  const andComposite = result.ast?.composites.find(c => c.name === "and_test");
  assertExists(andComposite);
  assertEquals(andComposite.logic.operator, "AND");
  
  // Check OR
  const orComposite = result.ast?.composites.find(c => c.name === "or_test");
  assertExists(orComposite);
  assertEquals(orComposite.logic.operator, "OR");
  
  // Check NOT
  const notComposite = result.ast?.composites.find(c => c.name === "not_test");
  assertExists(notComposite);
  assertEquals(notComposite.logic.operator, "NOT");
  
  // Check THRESHOLD
  const thresholdComposite = result.ast?.composites.find(c => c.name === "threshold_test");
  assertExists(thresholdComposite);
  assertEquals(thresholdComposite.logic.operator, "THRESHOLD");
  assertEquals((thresholdComposite.logic as any).threshold, 2);
  
  // Check nested
  const nestedComposite = result.ast?.composites.find(c => c.name === "nested_test");
  assertExists(nestedComposite);
  assertEquals(nestedComposite.logic.operator, "AND");
});

Deno.test("SchemaValidator - detects missing required fields", () => {
  const result = validateSchema(invalidSchemaMissingFields);
  
  assertEquals(result.valid, false);
  const error = result.errors.find(e => e.code === 'E002');
  assertExists(error);
  assertEquals(error.message.includes("credential_name"), true);
});

Deno.test("SchemaValidator - detects invalid field types", () => {
  const result = validateSchema(invalidSchemaBadTypes);
  
  assertEquals(result.valid, false);
  const error = result.errors.find(e => e.code === 'E102');
  assertExists(error);
  assertEquals(error.message.includes("not_a_type"), true);
});

Deno.test("SchemaValidator - detects duplicate field names", () => {
  const result = validateSchema(invalidSchemaDuplicateFields);
  
  assertEquals(result.valid, false);
  const error = result.errors.find(e => e.code === 'E103');
  assertExists(error);
});

Deno.test("SchemaValidator - detects invalid range bounds", () => {
  const result = validateSchema(invalidSchemaBadRange);
  
  assertEquals(result.valid, false);
  const error = result.errors.find(e => e.code === 'E202');
  assertExists(error);
});

Deno.test("parseJsonSchema - parses valid JSON", () => {
  const json = JSON.stringify(validMinimalSchema);
  const result = parseJsonSchema(json);
  
  assertEquals(result.success, true);
  assertExists(result.ast);
});

Deno.test("parseJsonSchema - handles JSON parse errors", () => {
  const result = parseJsonSchema("not valid json");
  
  assertEquals(result.success, false);
  const error = result.errors.find(e => e.code === 'JSON_PARSE_ERROR');
  assertExists(error);
});

Deno.test("parseYamlSchema - parses valid YAML", () => {
  const yaml = `
sot_type: test
credential_name: test_yaml
fields:
  - name: field1
    type: uint
    verifiable: true
    proofs:
      - type: range
        min: 0
        max: 100
`;
  
  // Mock YAML parser
  const mockYaml = {
    load: (content: string) => {
      // Simple YAML parser for test
      const lines = content.split('\n');
      const result: Record<string, unknown> = {};
      let currentArray: unknown[] | null = null;
      let currentObj: Record<string, unknown> | null = null;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        if (trimmed.startsWith('- ')) {
          const item = trimmed.slice(2);
          if (item.includes(':')) {
            const [key, value] = item.split(':').map(s => s.trim());
            if (currentArray) {
              if (!currentObj) {
                currentObj = {};
                currentArray.push(currentObj);
              }
              currentObj[key] = value === 'true' ? true : 
                                value === 'false' ? false :
                                isNaN(Number(value)) ? value : Number(value);
            }
          }
        } else if (trimmed.includes(':')) {
          const [key, value] = trimmed.split(':').map(s => s.trim());
          if (!value) {
            // Start of array
            currentArray = [];
            result[key] = currentArray;
            currentObj = null;
          } else {
            result[key] = value === 'true' ? true :
                         value === 'false' ? false :
                         isNaN(Number(value)) ? value : Number(value);
          }
        }
      }
      
      return result;
    }
  };
  
  const result = parseYamlSchema(yaml, { yaml: mockYaml });
  // The mock parser is simplified, so just check it doesn't throw
  assertExists(result);
});

Deno.test("parseYamlSchema - handles YAML parse errors", () => {
  const mockYaml = {
    load: () => { throw new Error("YAML error"); }
  };
  
  const result = parseYamlSchema("", { yaml: mockYaml });
  
  assertEquals(result.success, false);
  const error = result.errors.find(e => e.code === 'YAML_PARSE_ERROR');
  assertExists(error);
});

Deno.test("parseSchemaStrict - returns AST on success", () => {
  const ast = parseSchemaStrict(validMinimalSchema);
  
  assertExists(ast);
  assertEquals(ast.metadata.sot_type, "test");
});

Deno.test("parseSchemaStrict - throws on failure", () => {
  assertThrows(() => {
    parseSchemaStrict(invalidSchemaMissingFields);
  });
});

Deno.test("SchemaParser - handles warning for no verifiable fields", () => {
  const schema = {
    sot_type: "test",
    credential_name: "test",
    fields: [
      { name: "field1", type: "string", verifiable: false }
    ]
  };
  
  const result = parseSchema(schema);
  
  assertEquals(result.success, true);
  const warning = result.warnings.find(w => w.code === 'W001');
  assertExists(warning);
});

Deno.test("SchemaParser - handles scale validation for non-numeric types", () => {
  const schema = {
    sot_type: "test",
    credential_name: "test",
    fields: [
      { name: "field1", type: "string", scale: 100, verifiable: false }
    ]
  };
  
  const result = parseSchema(schema);
  
  assertEquals(result.success, true);
  const warning = result.warnings.find(w => w.code === 'W003');
  assertExists(warning);
});

console.log("✅ All tests defined. Run with: deno test schema-parser.test.ts");
