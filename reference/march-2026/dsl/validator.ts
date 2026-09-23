/**
 * CredVault DSL Schema Validator
 * 
 * Validates raw schema objects before they are parsed into AST.
 * Ensures all required fields are present, types are correct, and
 * references are valid.
 */

import {
  ValidationError,
  ValidationResult,
  RawSchema,
  RawFieldDefinition,
  RawProofRequirement,
  RawCompositeDefinition,
  FieldType,
  ProofType,
  ParserConfig,
  DEFAULT_PARSER_CONFIG,
} from './types.ts';

// ============================================================================
// Error Codes
// ============================================================================

export const ErrorCodes = {
  // Schema-level errors
  MISSING_SOT_TYPE: 'E001',
  MISSING_CREDENTIAL_NAME: 'E002',
  INVALID_VERSION_FORMAT: 'E003',
  
  // Field-level errors
  MISSING_FIELD_NAME: 'E100',
  MISSING_FIELD_TYPE: 'E101',
  INVALID_FIELD_TYPE: 'E102',
  DUPLICATE_FIELD_NAME: 'E103',
  INVALID_SCALE: 'E104',
  
  // Proof-level errors
  INVALID_PROOF_TYPE: 'E200',
  MISSING_PROOF_TYPE: 'E201',
  INVALID_RANGE_BOUNDS: 'E202',
  INVALID_RANGE_COMPARISON: 'E203',
  
  // Composite-level errors
  INVALID_COMPOSITE_OPERATOR: 'E300',
  MISSING_COMPOSITE_NAME: 'E301',
  UNDEFINED_FIELD_REFERENCE: 'E302',
  INVALID_COMPOSITE_LOGIC: 'E303',
  
  // Configuration errors
  INVALID_MERKLE_DEPTH: 'E400',
  INVALID_SPARSE_TREE_DEPTH: 'E401',
  
  // Warning codes
  NO_VERIFIABLE_FIELDS: 'W001',
  MISSING_DESCRIPTION: 'W002',
  UNNECESSARY_SCALE: 'W003',
} as const;

// ============================================================================
// Validator Class
// ============================================================================

export class SchemaValidator {
  private config: Required<ParserConfig>;
  private errors: ValidationError[] = [];
  private warnings: ValidationError[] = [];
  private fieldNames: Set<string> = new Set();

  constructor(config: ParserConfig = {}) {
    this.config = { ...DEFAULT_PARSER_CONFIG, ...config };
  }

  /**
   * Validate a raw schema object
   */
  validate(schema: unknown): ValidationResult {
    this.errors = [];
    this.warnings = [];
    this.fieldNames.clear();

    if (typeof schema !== 'object' || schema === null) {
      this.addError(
        ErrorCodes.MISSING_SOT_TYPE,
        'Schema must be an object',
        '',
        'Provide a valid schema object with sot_type and credential_name'
      );
      return { valid: false, errors: this.errors };
    }

    const rawSchema = schema as RawSchema;

    // Validate required top-level fields
    this.validateRequiredFields(rawSchema);
    
    // Validate fields array
    this.validateFields(rawSchema.fields);
    
    // Validate merkle tree config
    this.validateMerkleTreeConfig(rawSchema.merkle_tree);
    
    // Validate revocation config
    this.validateRevocationConfig(rawSchema.revocation);
    
    // Validate composites
    this.validateComposites(rawSchema.composites, rawSchema.fields);

    // Check for at least one verifiable field
    this.checkVerifiableFields(rawSchema.fields);

    return {
      valid: this.errors.length === 0,
      errors: [...this.errors, ...this.warnings],
    };
  }

  /**
   * Validate required top-level fields
   */
  private validateRequiredFields(schema: RawSchema): void {
    if (!schema.sot_type || typeof schema.sot_type !== 'string') {
      this.addError(
        ErrorCodes.MISSING_SOT_TYPE,
        'Missing or invalid sot_type',
        'sot_type',
        'Provide a string value for sot_type (e.g., "university", "dmv")'
      );
    }

    if (!schema.credential_name || typeof schema.credential_name !== 'string') {
      this.addError(
        ErrorCodes.MISSING_CREDENTIAL_NAME,
        'Missing or invalid credential_name',
        'credential_name',
        'Provide a string value for credential_name'
      );
    }

    if (schema.version && !this.isValidSemver(schema.version)) {
      this.addWarning(
        ErrorCodes.INVALID_VERSION_FORMAT,
        `Version "${schema.version}" is not valid semver`,
        'version',
        'Use semantic versioning format (e.g., "1.0.0")'
      );
    }

    if (!schema.description) {
      this.addWarning(
        ErrorCodes.MISSING_DESCRIPTION,
        'Schema lacks a description',
        'description',
        'Add a description to help users understand this credential type'
      );
    }
  }

  /**
   * Validate fields array
   */
  private validateFields(fields: unknown): void {
    if (!Array.isArray(fields)) {
      this.addError(
        ErrorCodes.MISSING_FIELD_NAME,
        'fields must be an array',
        'fields'
      );
      return;
    }

    if (fields.length === 0) {
      this.addError(
        ErrorCodes.MISSING_FIELD_NAME,
        'At least one field is required',
        'fields'
      );
      return;
    }

    fields.forEach((field, index) => {
      this.validateField(field, index);
    });
  }

  /**
   * Validate a single field definition
   */
  private validateField(field: unknown, index: number): void {
    const path = `fields[${index}]`;

    if (typeof field !== 'object' || field === null) {
      this.addError(
        ErrorCodes.MISSING_FIELD_NAME,
        `Field at index ${index} must be an object`,
        path
      );
      return;
    }

    const rawField = field as RawFieldDefinition;

    // Validate name
    if (!rawField.name || typeof rawField.name !== 'string') {
      this.addError(
        ErrorCodes.MISSING_FIELD_NAME,
        `Field at index ${index} is missing a name`,
        `${path}.name`
      );
      return;
    }

    // Check for duplicates
    if (this.fieldNames.has(rawField.name)) {
      this.addError(
        ErrorCodes.DUPLICATE_FIELD_NAME,
        `Duplicate field name: "${rawField.name}"`,
        `${path}.name`,
        'Use unique field names'
      );
    } else {
      this.fieldNames.add(rawField.name);
    }

    // Validate type
    if (!rawField.type || typeof rawField.type !== 'string') {
      this.addError(
        ErrorCodes.MISSING_FIELD_TYPE,
        `Field "${rawField.name}" is missing a type`,
        `${path}.type`
      );
    } else if (!this.isValidFieldType(rawField.type)) {
      this.addError(
        ErrorCodes.INVALID_FIELD_TYPE,
        `Field "${rawField.name}" has invalid type: "${rawField.type}"`,
        `${path}.type`,
        `Valid types: ${this.config.supported_field_types.join(', ')}`
      );
    }

    // Validate scale (only for numeric types)
    if (rawField.scale !== undefined) {
      if (!['uint', 'int'].includes(rawField.type)) {
        this.addWarning(
          ErrorCodes.UNNECESSARY_SCALE,
          `Scale is only valid for numeric types, field "${rawField.name}" is "${rawField.type}"`,
          `${path}.scale`,
          'Remove scale or change field type to uint/int'
        );
      } else if (!Number.isInteger(rawField.scale) || rawField.scale <= 0) {
        this.addError(
          ErrorCodes.INVALID_SCALE,
          `Invalid scale for field "${rawField.name}": must be a positive integer`,
          `${path}.scale`
        );
      }
    }

    // Validate proofs
    if (rawField.proofs && Array.isArray(rawField.proofs)) {
      rawField.proofs.forEach((proof, proofIndex) => {
        this.validateProof(proof, `${path}.proofs[${proofIndex}]`, rawField.name, rawField.type);
      });
    }
  }

  /**
   * Validate a proof requirement
   */
  private validateProof(
    proof: unknown, 
    path: string, 
    fieldName: string,
    fieldType: string
  ): void {
    if (typeof proof !== 'object' || proof === null) {
      this.addError(
        ErrorCodes.MISSING_PROOF_TYPE,
        `Proof must be an object`,
        path
      );
      return;
    }

    const rawProof = proof as RawProofRequirement;

    if (!rawProof.type || typeof rawProof.type !== 'string') {
      this.addError(
        ErrorCodes.MISSING_PROOF_TYPE,
        `Proof is missing type`,
        `${path}.type`
      );
      return;
    }

    const validProofTypes: ProofType[] = [
      'merkle_existence',
      'sparse_merkle_non_existence', 
      'range',
      'equality'
    ];

    if (!validProofTypes.includes(rawProof.type as ProofType)) {
      this.addError(
        ErrorCodes.INVALID_PROOF_TYPE,
        `Invalid proof type: "${rawProof.type}"`,
        `${path}.type`,
        `Valid types: ${validProofTypes.join(', ')}`
      );
      return;
    }

    // Type-specific validation
    switch (rawProof.type) {
      case 'range':
        this.validateRangeProof(rawProof, path, fieldType);
        break;
      case 'equality':
        // Equality proofs work with any type
        break;
      case 'merkle_existence':
      case 'sparse_merkle_non_existence':
        // These are typically auto-added, but can be explicit
        break;
    }
  }

  /**
   * Validate range proof configuration
   */
  private validateRangeProof(
    proof: RawProofRequirement, 
    path: string,
    fieldType: string
  ): void {
    // Range proofs only work with numeric types
    if (!['uint', 'int', 'timestamp'].includes(fieldType)) {
      this.addWarning(
        ErrorCodes.INVALID_PROOF_TYPE,
        `Range proof on non-numeric field type "${fieldType}"`,
        path,
        'Use uint, int, or timestamp for range proofs'
      );
    }

    // Validate comparison operator
    const validComparisons = ['>=', '<=', '>', '<', '==', '!='];
    if (proof.comparison && !validComparisons.includes(proof.comparison as string)) {
      this.addError(
        ErrorCodes.INVALID_RANGE_COMPARISON,
        `Invalid comparison operator: "${proof.comparison}"`,
        `${path}.comparison`,
        `Valid operators: ${validComparisons.join(', ')}`
      );
    }

    // Validate bounds
    const min = proof.min;
    const max = proof.max;

    if (min !== null && min !== undefined && typeof min !== 'number') {
      this.addError(
        ErrorCodes.INVALID_RANGE_BOUNDS,
        `Invalid min bound: must be a number or null`,
        `${path}.min`
      );
    }

    if (max !== null && max !== undefined && typeof max !== 'number') {
      this.addError(
        ErrorCodes.INVALID_RANGE_BOUNDS,
        `Invalid max bound: must be a number or null`,
        `${path}.max`
      );
    }

    // Check if both bounds are null (invalid)
    if ((min === null || min === undefined) && (max === null || max === undefined)) {
      this.addError(
        ErrorCodes.INVALID_RANGE_BOUNDS,
        `Range proof must have at least one bound (min or max)`,
        path,
        'Specify min, max, or both'
      );
    }

    // Check min <= max
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      this.addError(
        ErrorCodes.INVALID_RANGE_BOUNDS,
        `Invalid range: min (${min}) > max (${max})`,
        path
      );
    }
  }

  /**
   * Validate merkle tree configuration
   */
  private validateMerkleTreeConfig(config: unknown): void {
    if (config === undefined) return;

    const path = 'merkle_tree';

    if (typeof config !== 'object' || config === null) {
      this.addError(
        ErrorCodes.INVALID_MERKLE_DEPTH,
        'merkle_tree must be an object',
        path
      );
      return;
    }

    const merkleConfig = config as { depth?: unknown };

    if (merkleConfig.depth !== undefined) {
      if (!Number.isInteger(merkleConfig.depth) || 
          merkleConfig.depth < 1 || 
          merkleConfig.depth > 256) {
        this.addError(
          ErrorCodes.INVALID_MERKLE_DEPTH,
          `Invalid merkle tree depth: ${merkleConfig.depth}`,
          `${path}.depth`,
          'Depth must be an integer between 1 and 256'
        );
      }
    }
  }

  /**
   * Validate revocation configuration
   */
  private validateRevocationConfig(config: unknown): void {
    if (config === undefined) return;

    const path = 'revocation';

    if (typeof config !== 'object' || config === null) {
      this.addError(
        ErrorCodes.INVALID_SPARSE_TREE_DEPTH,
        'revocation must be an object',
        path
      );
      return;
    }

    const revocationConfig = config as { 
      enabled?: unknown;
      sparse_tree_depth?: unknown;
    };

    if (revocationConfig.sparse_tree_depth !== undefined) {
      if (!Number.isInteger(revocationConfig.sparse_tree_depth) || 
          revocationConfig.sparse_tree_depth < 1 || 
          revocationConfig.sparse_tree_depth > 256) {
        this.addError(
          ErrorCodes.INVALID_SPARSE_TREE_DEPTH,
          `Invalid sparse tree depth: ${revocationConfig.sparse_tree_depth}`,
          `${path}.sparse_tree_depth`,
          'Depth must be an integer between 1 and 256'
        );
      }
    }
  }

  /**
   * Validate composite definitions
   */
  private validateComposites(
    composites: unknown, 
    fields: unknown
  ): void {
    if (composites === undefined) return;

    if (!Array.isArray(composites)) {
      this.addError(
        ErrorCodes.INVALID_COMPOSITE_LOGIC,
        'composites must be an array',
        'composites'
      );
      return;
    }

    composites.forEach((composite, index) => {
      this.validateComposite(composite, `composites[${index}]`);
    });
  }

  /**
   * Validate a single composite definition
   */
  private validateComposite(composite: unknown, path: string): void {
    if (typeof composite !== 'object' || composite === null) {
      this.addError(
        ErrorCodes.INVALID_COMPOSITE_LOGIC,
        'Composite must be an object',
        path
      );
      return;
    }

    const rawComposite = composite as RawCompositeDefinition;

    if (!rawComposite.name || typeof rawComposite.name !== 'string') {
      this.addError(
        ErrorCodes.MISSING_COMPOSITE_NAME,
        'Composite is missing a name',
        `${path}.name`
      );
      return;
    }

    if (!rawComposite.logic || typeof rawComposite.logic !== 'object') {
      this.addError(
        ErrorCodes.INVALID_COMPOSITE_LOGIC,
        `Composite "${rawComposite.name}" is missing logic`,
        `${path}.logic`
      );
      return;
    }

    // Validate the logic structure
    this.validateCompositeLogic(
      rawComposite.logic, 
      `${path}.logic`,
      rawComposite.name
    );
  }

  /**
   * Recursively validate composite logic
   */
  private validateCompositeLogic(
    logic: Record<string, unknown>, 
    path: string,
    compositeName: string
  ): void {
    const operators = Object.keys(logic);
    const validOperators = ['AND', 'OR', 'NOT', 'THRESHOLD'];

    if (operators.length !== 1 || !validOperators.includes(operators[0])) {
      this.addError(
        ErrorCodes.INVALID_COMPOSITE_OPERATOR,
        `Invalid composite operator in "${compositeName}"`,
        path,
        `Use exactly one of: ${validOperators.join(', ')}`
      );
      return;
    }

    const operator = operators[0];
    const value = logic[operator];

    switch (operator) {
      case 'AND':
      case 'OR':
        if (!Array.isArray(value)) {
          this.addError(
            ErrorCodes.INVALID_COMPOSITE_LOGIC,
            `${operator} requires an array of conditions`,
            path
          );
        } else {
          value.forEach((condition, index) => {
            this.validateCompositeCondition(
              condition, 
              `${path}.${operator}[${index}]`,
              compositeName
            );
          });
        }
        break;

      case 'NOT':
        this.validateCompositeCondition(value, path, compositeName);
        break;

      case 'THRESHOLD':
        if (typeof value !== 'object' || value === null || !Array.isArray(value)) {
          this.addError(
            ErrorCodes.INVALID_COMPOSITE_LOGIC,
            'THRESHOLD requires [threshold, ...conditions] format',
            path
          );
        } else {
          const [threshold, ...conditions] = value as [unknown, ...unknown[]];
          if (typeof threshold !== 'number' || !Number.isInteger(threshold)) {
            this.addError(
              ErrorCodes.INVALID_COMPOSITE_LOGIC,
              'THRESHOLD first element must be an integer',
              path
            );
          }
          conditions.forEach((condition, index) => {
            this.validateCompositeCondition(
              condition,
              `${path}.THRESHOLD[${index + 1}]`,
              compositeName
            );
          });
        }
        break;
    }
  }

  /**
   * Validate a single condition within composite logic
   */
  private validateCompositeCondition(
    condition: unknown,
    path: string,
    compositeName: string
  ): void {
    if (typeof condition !== 'object' || condition === null) {
      this.addError(
        ErrorCodes.INVALID_COMPOSITE_LOGIC,
        'Condition must be an object',
        path
      );
      return;
    }

    const cond = condition as Record<string, unknown>;

    // Check if it's a nested composite (has AND, OR, NOT, THRESHOLD)
    const hasOperator = ['AND', 'OR', 'NOT', 'THRESHOLD'].some(op => op in cond);
    
    if (hasOperator) {
      this.validateCompositeLogic(cond, path, compositeName);
      return;
    }

    // Otherwise it should be a field reference
    if (!cond.field || typeof cond.field !== 'string') {
      this.addError(
        ErrorCodes.INVALID_COMPOSITE_LOGIC,
        'Condition must have a "field" property or be a nested composite',
        path
      );
      return;
    }

    // Check if field exists
    if (!this.fieldNames.has(cond.field)) {
      this.addError(
        ErrorCodes.UNDEFINED_FIELD_REFERENCE,
        `Composite "${compositeName}" references undefined field: "${cond.field}"`,
        `${path}.field`,
        `Available fields: ${Array.from(this.fieldNames).join(', ')}`
      );
    }

    // Validate proof type if provided
    if (cond.proof && typeof cond.proof !== 'string') {
      this.addError(
        ErrorCodes.INVALID_PROOF_TYPE,
        'proof must be a string',
        `${path}.proof`
      );
    }
  }

  /**
   * Check if at least one field has verifiable proofs
   */
  private checkVerifiableFields(fields: unknown): void {
    if (!Array.isArray(fields)) return;

    const hasVerifiable = fields.some(
      (f: RawFieldDefinition) => f.verifiable && f.proofs && f.proofs.length > 0
    );

    if (!hasVerifiable) {
      this.addWarning(
        ErrorCodes.NO_VERIFIABLE_FIELDS,
        'No verifiable fields found',
        'fields',
        'Add verifiable: true and proofs to at least one field'
      );
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private isValidFieldType(type: string): type is FieldType {
    return this.config.supported_field_types.includes(type as FieldType);
  }

  private isValidSemver(version: string): boolean {
    // Simple semver validation: major.minor.patch[-prerelease][+build]
    const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?(?:\+([\da-z-]+(?:\.[\da-z-]+)*))?$/i;
    return semverRegex.test(version);
  }

  private addError(
    code: string, 
    message: string, 
    path: string, 
    suggestion?: string
  ): void {
    this.errors.push({
      severity: 'error',
      code,
      message,
      path,
      suggestion,
    });
  }

  private addWarning(
    code: string, 
    message: string, 
    path: string, 
    suggestion?: string
  ): void {
    this.warnings.push({
      severity: 'warning',
      code,
      message,
      path,
      suggestion,
    });
  }
}

/**
 * Convenience function for one-off validation
 */
export function validateSchema(schema: unknown, config?: ParserConfig): ValidationResult {
  const validator = new SchemaValidator(config);
  return validator.validate(schema);
}
