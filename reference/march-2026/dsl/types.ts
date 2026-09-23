/**
 * CredVault DSL Schema Types
 * 
 * Core TypeScript interfaces for the DSL schema parser that generates
 * Midnight Compact smart contracts for credential verification.
 */

// ============================================================================
// Field Types
// ============================================================================

export type FieldType = 'uint' | 'int' | 'string' | 'bytes' | 'timestamp' | 'boolean';

export interface FieldDefinition {
  name: string;
  type: FieldType;
  scale?: number;           // For fixed-point arithmetic (e.g., 100 for 2 decimal places)
  verifiable: boolean;
  proofs: ProofRequirement[];
  description?: string;     // Human-readable description
}

// ============================================================================
// Core ZK Proof Patterns
// ============================================================================

export type ProofType = 'merkle_existence' | 'sparse_merkle_non_existence' | 'range' | 'equality';

/**
 * Base interface for all proof requirements
 */
export interface BaseProofRequirement {
  type: ProofType;
  description?: string;
}

/**
 * 1. Merkle Existence Proof
 * Prove credential exists in registry
 */
export interface MerkleExistenceProof extends BaseProofRequirement {
  type: 'merkle_existence';
  tree_depth?: number;      // Defaults to schema's merkle_tree.depth
}

/**
 * 2. Sparse Merkle Non-Existence Proof
 * Prove credential is NOT revoked
 */
export interface SparseMerkleNonExistenceProof extends BaseProofRequirement {
  type: 'sparse_merkle_non_existence';
  sparse_tree_depth?: number;  // Defaults to schema's revocation.sparse_tree_depth
}

/**
 * 3. Range Proof
 * Prove numeric value is in range without revealing it
 */
export interface RangeProof extends BaseProofRequirement {
  type: 'range';
  min?: number | null;      // null = no lower bound
  max?: number | null;      // null = no upper bound
  public_min: boolean;      // Verifier can see min bound
  public_max: boolean;      // Verifier can see max bound
  comparison?: '>=' | '<=' | '>' | '<' | '==' | '!=';  // Comparison operator
}

/**
 * 4. Equality Proof
 * Prove exact match without revealing value
 */
export interface EqualityProof extends BaseProofRequirement {
  type: 'equality';
  hash_algorithm?: 'pedersen' | 'blake2b' | 'sha256';  // Default: pedersen
}

/**
 * Union type for all proof requirements
 */
export type ProofRequirement = 
  | MerkleExistenceProof 
  | SparseMerkleNonExistenceProof 
  | RangeProof 
  | EqualityProof;

// ============================================================================
// Composite Proof Patterns (Boolean Logic)
// ============================================================================

export type CompositeOperator = 'AND' | 'OR' | 'NOT' | 'THRESHOLD';

/**
 * Reference to a field's proof within a composite
 */
export interface FieldProofReference {
  field: string;
  proof: ProofType;
  condition?: string;       // Additional condition (e.g., ">= 350")
}

/**
 * Base interface for composite logic nodes
 */
export interface CompositeNode {
  operator: CompositeOperator;
}

/**
 * AND composite - all conditions must be true
 */
export interface AndComposite extends CompositeNode {
  operator: 'AND';
  conditions: (FieldProofReference | CompositeNode)[];
}

/**
 * OR composite - at least one condition must be true
 */
export interface OrComposite extends CompositeNode {
  operator: 'OR';
  conditions: (FieldProofReference | CompositeNode)[];
}

/**
 * NOT composite - negate a condition
 */
export interface NotComposite extends CompositeNode {
  operator: 'NOT';
  condition: FieldProofReference | CompositeNode;
}

/**
 * THRESHOLD composite - at least N of M conditions must be true
 */
export interface ThresholdComposite extends CompositeNode {
  operator: 'THRESHOLD';
  threshold: number;        // Minimum number of conditions that must be true
  conditions: (FieldProofReference | CompositeNode)[];
}

/**
 * Union type for all composite nodes
 */
export type CompositeCondition = AndComposite | OrComposite | NotComposite | ThresholdComposite;

/**
 * Named composite definition
 */
export interface CompositeDefinition {
  name: string;
  description?: string;
  logic: CompositeCondition;
}

// ============================================================================
// Merkle Tree Configuration
// ============================================================================

export interface MerkleTreeConfig {
  depth: number;            // Supports up to 2^depth leaves
  hash_algorithm?: 'pedersen' | 'blake2b';  // Default: pedersen
}

// ============================================================================
// Revocation Configuration
// ============================================================================

export interface RevocationConfig {
  enabled: boolean;
  sparse_tree_depth: number;  // Usually 160 for Ethereum address space
  update_frequency?: 'immediate' | 'batch' | 'periodic';
}

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Raw schema input (from JSON/YAML)
 */
export interface RawSchema {
  sot_type: string;         // Source of Truth type (e.g., "university", "dmv")
  credential_name: string;  // Credential identifier
  version?: string;         // Schema version (semver)
  description?: string;     // Human-readable description
  fields: RawFieldDefinition[];
  merkle_tree?: Partial<MerkleTreeConfig>;
  revocation?: Partial<RevocationConfig>;
  composites?: RawCompositeDefinition[];
}

/**
 * Raw field definition (from JSON/YAML)
 */
export interface RawFieldDefinition {
  name: string;
  type: string;
  scale?: number;
  verifiable?: boolean;     // Defaults to false
  proofs?: RawProofRequirement[];
  description?: string;
}

/**
 * Raw proof requirement (from JSON/YAML)
 */
export interface RawProofRequirement {
  type: string;
  [key: string]: unknown;   // Additional properties based on proof type
}

/**
 * Raw composite definition (from JSON/YAML)
 */
export interface RawCompositeDefinition {
  name: string;
  description?: string;
  logic: Record<string, unknown>;  // AND, OR, NOT, THRESHOLD
}

// ============================================================================
// AST (Abstract Syntax Tree) Output
// ============================================================================

/**
 * The parsed and validated AST ready for code generation
 */
export interface SchemaAST {
  metadata: {
    sot_type: string;
    credential_name: string;
    version: string;
    description?: string;
  };
  fields: FieldDefinition[];
  merkle_tree: MerkleTreeConfig;
  revocation: RevocationConfig;
  composites: CompositeDefinition[];
}

// ============================================================================
// Validation Results
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationError {
  severity: ValidationSeverity;
  code: string;             // Error code for programmatic handling
  message: string;          // Human-readable message
  path: string;             // JSON path to the error location
  suggestion?: string;      // Optional fix suggestion
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ============================================================================
// Parser Configuration
// ============================================================================

export interface ParserConfig {
  strict_mode?: boolean;    // Reject unknown fields
  default_merkle_depth?: number;
  default_sparse_tree_depth?: number;
  supported_field_types?: FieldType[];
}

export const DEFAULT_PARSER_CONFIG: Required<ParserConfig> = {
  strict_mode: false,
  default_merkle_depth: 8,
  default_sparse_tree_depth: 160,
  supported_field_types: ['uint', 'int', 'string', 'bytes', 'timestamp', 'boolean'],
};

// ============================================================================
// Parser Output
// ============================================================================

export interface ParseResult {
  success: boolean;
  ast?: SchemaAST;
  errors: ValidationError[];
  warnings: ValidationError[];
}
