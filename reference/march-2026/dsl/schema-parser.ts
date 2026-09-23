/**
 * CredVault DSL Schema Parser
 * 
 * Parses JSON/YAML schema definitions into a typed AST (Abstract Syntax Tree)
 * ready for Compact smart contract code generation.
 */

import {
  SchemaAST,
  RawSchema,
  RawFieldDefinition,
  RawProofRequirement,
  RawCompositeDefinition,
  FieldDefinition,
  FieldType,
  ProofRequirement,
  ProofType,
  CompositeDefinition,
  CompositeCondition,
  AndComposite,
  OrComposite,
  NotComposite,
  ThresholdComposite,
  FieldProofReference,
  MerkleTreeConfig,
  RevocationConfig,
  ParseResult,
  ParserConfig,
  DEFAULT_PARSER_CONFIG,
  ValidationError,
} from './types.ts';

import { SchemaValidator, validateSchema } from './validator.ts';

// ============================================================================
// Parser Class
// ============================================================================

export class SchemaParser {
  private config: Required<ParserConfig>;
  private validator: SchemaValidator;

  constructor(config: ParserConfig = {}) {
    this.config = { ...DEFAULT_PARSER_CONFIG, ...config };
    this.validator = new SchemaValidator(this.config);
  }

  /**
   * Parse a raw schema into an AST
   */
  parse(schema: unknown): ParseResult {
    // First, validate the schema
    const validation = this.validator.validate(schema);
    
    const errors = validation.errors.filter(e => e.severity === 'error');
    const warnings = validation.errors.filter(e => e.severity === 'warning');

    // If validation failed, return errors
    if (errors.length > 0) {
      return {
        success: false,
        errors,
        warnings,
      };
    }

    try {
      const rawSchema = schema as RawSchema;
      const ast = this.buildAST(rawSchema);

      return {
        success: true,
        ast,
        errors,
        warnings,
      };
    } catch (error) {
      const parseError: ValidationError = {
        severity: 'error',
        code: 'PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown parsing error',
        path: '',
      };

      return {
        success: false,
        errors: [...errors, parseError],
        warnings,
      };
    }
  }

  /**
   * Build the AST from a validated raw schema
   */
  private buildAST(raw: RawSchema): SchemaAST {
    return {
      metadata: this.buildMetadata(raw),
      fields: this.buildFields(raw.fields),
      merkle_tree: this.buildMerkleTreeConfig(raw.merkle_tree),
      revocation: this.buildRevocationConfig(raw.revocation),
      composites: this.buildComposites(raw.composites),
    };
  }

  /**
   * Build metadata section
   */
  private buildMetadata(raw: RawSchema): SchemaAST['metadata'] {
    return {
      sot_type: raw.sot_type,
      credential_name: raw.credential_name,
      version: raw.version || '1.0.0',
      description: raw.description,
    };
  }

  /**
   * Build field definitions
   */
  private buildFields(rawFields: RawFieldDefinition[]): FieldDefinition[] {
    return rawFields.map(rawField => this.buildField(rawField));
  }

  /**
   * Build a single field definition
   */
  private buildField(raw: RawFieldDefinition): FieldDefinition {
    // Determine field type
    const fieldType = raw.type as FieldType;

    // Build proofs
    let proofs: ProofRequirement[] = [];
    
    if (raw.proofs && raw.proofs.length > 0) {
      proofs = raw.proofs.map(rawProof => this.buildProof(rawProof, fieldType));
    }

    // Auto-add merkle_existence proof for verifiable fields
    if (raw.verifiable && !proofs.some(p => p.type === 'merkle_existence')) {
      proofs.unshift({
        type: 'merkle_existence',
        description: `Prove ${raw.name} exists in credential registry`,
      });
    }

    return {
      name: raw.name,
      type: fieldType,
      scale: raw.scale,
      verifiable: raw.verifiable ?? false,
      proofs,
      description: raw.description,
    };
  }

  /**
   * Build a proof requirement
   */
  private buildProof(raw: RawProofRequirement, fieldType: FieldType): ProofRequirement {
    const proofType = raw.type as ProofType;

    switch (proofType) {
      case 'merkle_existence':
        return {
          type: 'merkle_existence',
          tree_depth: raw.tree_depth as number | undefined,
          description: raw.description as string | undefined,
        };

      case 'sparse_merkle_non_existence':
        return {
          type: 'sparse_merkle_non_existence',
          sparse_tree_depth: raw.sparse_tree_depth as number | undefined,
          description: raw.description as string | undefined,
        };

      case 'range':
        return {
          type: 'range',
          min: raw.min !== undefined ? (raw.min as number | null) : undefined,
          max: raw.max !== undefined ? (raw.max as number | null) : undefined,
          public_min: (raw.public_min as boolean) ?? true,
          public_max: (raw.public_max as boolean) ?? false,
          comparison: (raw.comparison as '>=' | '<=' | '>' | '<' | '==' | '!=') ?? '>=',
          description: raw.description as string | undefined,
        };

      case 'equality':
        return {
          type: 'equality',
          hash_algorithm: (raw.hash_algorithm as 'pedersen' | 'blake2b' | 'sha256') ?? 'pedersen',
          description: raw.description as string | undefined,
        };

      default:
        // This should not happen due to validation
        throw new Error(`Unknown proof type: ${proofType}`);
    }
  }

  /**
   * Build merkle tree configuration
   */
  private buildMerkleTreeConfig(raw: Partial<MerkleTreeConfig> | undefined): MerkleTreeConfig {
    return {
      depth: raw?.depth ?? this.config.default_merkle_depth,
      hash_algorithm: raw?.hash_algorithm ?? 'pedersen',
    };
  }

  /**
   * Build revocation configuration
   */
  private buildRevocationConfig(raw: Partial<RevocationConfig> | undefined): RevocationConfig {
    return {
      enabled: raw?.enabled ?? false,
      sparse_tree_depth: raw?.sparse_tree_depth ?? this.config.default_sparse_tree_depth,
      update_frequency: raw?.update_frequency ?? 'batch',
    };
  }

  /**
   * Build composite definitions
   */
  private buildComposites(raw: RawCompositeDefinition[] | undefined): CompositeDefinition[] {
    if (!raw || raw.length === 0) {
      return [];
    }

    return raw.map(rawComposite => this.buildComposite(rawComposite));
  }

  /**
   * Build a single composite definition
   */
  private buildComposite(raw: RawCompositeDefinition): CompositeDefinition {
    return {
      name: raw.name,
      description: raw.description,
      logic: this.buildCompositeLogic(raw.logic),
    };
  }

  /**
   * Build composite logic recursively
   */
  private buildCompositeLogic(logic: Record<string, unknown>): CompositeCondition {
    const operator = Object.keys(logic)[0] as 'AND' | 'OR' | 'NOT' | 'THRESHOLD';
    const value = logic[operator];

    switch (operator) {
      case 'AND':
        return {
          operator: 'AND',
          conditions: (value as unknown[]).map(c => 
            this.buildCompositeCondition(c)
          ),
        } as AndComposite;

      case 'OR':
        return {
          operator: 'OR',
          conditions: (value as unknown[]).map(c => 
            this.buildCompositeCondition(c)
          ),
        } as OrComposite;

      case 'NOT':
        return {
          operator: 'NOT',
          condition: this.buildCompositeCondition(value),
        } as NotComposite;

      case 'THRESHOLD':
        const [threshold, ...conditions] = value as [number, ...unknown[]];
        return {
          operator: 'THRESHOLD',
          threshold,
          conditions: conditions.map(c => this.buildCompositeCondition(c)),
        } as ThresholdComposite;

      default:
        throw new Error(`Unknown composite operator: ${operator}`);
    }
  }

  /**
   * Build a single composite condition (field reference or nested composite)
   */
  private buildCompositeCondition(condition: unknown): FieldProofReference | CompositeCondition {
    if (typeof condition !== 'object' || condition === null) {
      throw new Error('Composite condition must be an object');
    }

    const cond = condition as Record<string, unknown>;

    // Check if it's a nested composite
    if ('AND' in cond || 'OR' in cond || 'NOT' in cond || 'THRESHOLD' in cond) {
      return this.buildCompositeLogic(cond);
    }

    // Otherwise it's a field reference
    return {
      field: cond.field as string,
      proof: cond.proof as ProofType,
      condition: cond.condition as string | undefined,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Parse a schema with default configuration
 */
export function parseSchema(schema: unknown, config?: ParserConfig): ParseResult {
  const parser = new SchemaParser(config);
  return parser.parse(schema);
}

/**
 * Parse a schema and throw on error
 */
export function parseSchemaStrict(schema: unknown, config?: ParserConfig): SchemaAST {
  const result = parseSchema(schema, config);
  
  if (!result.success || !result.ast) {
    const errorMessages = result.errors.map(e => `${e.path}: ${e.message}`).join('\n');
    throw new Error(`Schema parsing failed:\n${errorMessages}`);
  }

  return result.ast;
}

// ============================================================================
// YAML Support (optional)
// ============================================================================

/**
 * Parse YAML string (requires js-yaml package)
 * Usage: 
 *   import * as yaml from 'js-yaml';
 *   const result = parseYamlSchema(yamlContent, { yaml });
 */
export interface YamlParser {
  load(content: string): unknown;
}

/**
 * Parse a YAML schema string
 */
export function parseYamlSchema(
  yamlContent: string, 
  options: { yaml: YamlParser; config?: ParserConfig }
): ParseResult {
  try {
    const parsed = options.yaml.load(yamlContent);
    return parseSchema(parsed, options.config);
  } catch (error) {
    return {
      success: false,
      errors: [{
        severity: 'error',
        code: 'YAML_PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to parse YAML',
        path: '',
      }],
      warnings: [],
    };
  }
}

/**
 * Parse a JSON schema string
 */
export function parseJsonSchema(
  jsonContent: string,
  config?: ParserConfig
): ParseResult {
  try {
    const parsed = JSON.parse(jsonContent);
    return parseSchema(parsed, config);
  } catch (error) {
    return {
      success: false,
      errors: [{
        severity: 'error',
        code: 'JSON_PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to parse JSON',
        path: '',
      }],
      warnings: [],
    };
  }
}

// Re-export types for consumers
export * from './types.ts';
export { SchemaValidator, validateSchema } from './validator.ts';
