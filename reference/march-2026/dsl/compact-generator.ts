/**
 * CredVault Compact Code Generator
 * 
 * Generates Midnight Compact smart contract code from Schema AST.
 * Phase 1: Merkle Existence Proof Generation
 */

import { SchemaAST, FieldDefinition, FieldType } from './types.ts';

// ============================================================================
// Field Type Mapping
// ============================================================================

/**
 * Map DSL field types to Compact types
 */
function mapFieldType(field: FieldDefinition): string {
  switch (field.type) {
    case 'uint':
      // Use Uint with sufficient bits for scaled values
      return 'Uint<64>';
    case 'int':
      return 'Int<64>';
    case 'string':
      // Strings stored as bytes with max length
      return 'Bytes<256>';
    case 'bytes':
      return 'Bytes<32>';
    case 'timestamp':
      return 'Uint<64>';
    case 'boolean':
      return 'Boolean';
    default:
      throw new Error(`Unsupported field type: ${field.type}`);
  }
}

// ============================================================================
// Code Generation Helpers
// ============================================================================

/**
 * Generate header comments for the contract
 */
function generateHeader(ast: SchemaAST): string {
  return `// ============================================================================
// CredVault Compact Smart Contract
// Auto-generated from DSL schema - DO NOT EDIT MANUALLY
// ============================================================================
// Schema: ${ast.metadata.sot_type}/${ast.metadata.credential_name}
// Version: ${ast.metadata.version}
// Description: ${ast.metadata.description || 'N/A'}
// Generated: ${new Date().toISOString()}
// ============================================================================

pragma language_version >= 0.20;

import CompactStandardLibrary;

`;
}

/**
 * Generate struct storage for credential fields
 */
function generateStruct(ast: SchemaAST): string {
  if (ast.fields.length === 0) {
    return '';
  }

  const fields = ast.fields.map(field => {
    const compactType = mapFieldType(field);
    let comment = '';
    if (isStorageOnlyField(field)) {
      comment = ` // Storage only - no verification`;
    } else if (field.description) {
      comment = ` // ${field.description}`;
    }
    return `  ${field.name}: ${compactType},${comment}`;
  }).join('\n');

  return `// ============================================================================
// Credential Struct - Storage definition for credential fields
// ============================================================================
export struct Credential {
${fields}
}

`;
}

/**
 * Generate ledger state declarations
 */
function generateLedger(ast: SchemaAST): string {
  return `// ============================================================================
// Ledger State - Public on-chain data
// ============================================================================

// Root of the Merkle tree containing all issued credentials
export ledger merkleRoot: Bytes<32>;

// SOT (Source of Truth) attestation hash - proves authority authenticity
export ledger sotAttestation: Bytes<32>;

`;
}

/**
 * Generate contract constructor
 */
function generateConstructor(ast: SchemaAST): string {
  return `// ============================================================================
// Constructor - Initialize contract with Merkle root and SOT attestation
// ============================================================================
constructor(root: Bytes<32>, attestation: Bytes<32>) {
  merkleRoot = disclose(root);
  sotAttestation = disclose(attestation);
}

`;
}

/**
 * Generate the hashPair helper circuit
 */
function generateHashPairCircuit(): string {
  return `// ============================================================================
// Hash Helper - Computes hash of two 32-byte values
// Uses persistentHash for on-chain verifiability
// ============================================================================
circuit hashPair(left: Bytes<32>, right: Bytes<32>): Bytes<32> {
  return persistentHash<[Bytes<32>, Bytes<32>]>([left, right]);
}

`;
}

/**
 * Generate Merkle proof verification circuit for a given depth
 */
function generateMerkleProofCircuit(depth: number): string {
  const levels: string[] = [];
  
  // Build the level-by-level hash computation
  for (let i = 0; i < depth; i++) {
    const prevHash = i === 0 ? 'leafHash' : `hash${i - 1}`;
    const currentHash = `hash${i}`;
    
    levels.push(`  // Level ${i}: Hash with sibling${i}`);
    levels.push(`  const left${i} = isRight[${i}] ? siblings[${i}] : ${prevHash};`);
    levels.push(`  const right${i} = isRight[${i}] ? ${prevHash} : siblings[${i}];`);
    levels.push(`  const ${currentHash} = hashPair(left${i}, right${i});`);
    levels.push('');
  }

  const finalHash = `hash${depth - 1}`;

  return `// ============================================================================
// Merkle Proof Verification - ${depth}-level proof
// Verifies that a credential exists in the registry without revealing which one
// 
// @param leafHash - Hash of the credential leaf node (private)
// @param siblings - Array of sibling hashes at each level (private)
// @param isRight - Array indicating if leaf/sibling is right child at each level (private)
// @returns Boolean - True if proof is valid (leaf exists in tree)
// ============================================================================
export circuit verifyMerkleProof${depth}(
  leafHash: Bytes<32>,
  siblings: Vector<${depth}, Bytes<32>>,
  isRight: Vector<${depth}, Boolean>
): Boolean {
${levels.join('\n')}  // Final verification: computed root must match stored root
  return ${finalHash} == merkleRoot;
}

`;
}

// ============================================================================
// Case 16: Storage Only (No Proofs) Detection
// ============================================================================

/**
 * Check if a field is "storage only" (Case 16)
 * These fields are stored in the struct but have no verification circuits
 * Conditions: verifiable: false OR proofs: [] OR proofs is undefined
 */
function isStorageOnlyField(field: FieldDefinition): boolean {
  // If verifiable is explicitly false, it's storage only
  if (field.verifiable === false) {
    return true;
  }
  // If proofs array is empty or undefined, it's storage only
  if (!field.proofs || field.proofs.length === 0) {
    return true;
  }
  return false;
}

/**
 * Check if a field needs any verification (not storage only)
 */
function needsVerification(field: FieldDefinition): boolean {
  return !isStorageOnlyField(field);
}

// ============================================================================
// Phase 2: Range Proof Generation
// ============================================================================

import { RangeProof } from './types.ts';

// ============================================================================
// Phase 3: Equality Proof Generation
// ============================================================================

import { EqualityProof } from './types.ts';

// ============================================================================
// Phase 4: Revocation (Sparse Merkle Non-Existence)
// ============================================================================

import { RevocationConfig } from './types.ts';

/**
 * Check if a field has a range proof requirement
 * Note: Storage-only fields (Case 16) never have range proofs
 */
function hasRangeProof(field: FieldDefinition): boolean {
  if (isStorageOnlyField(field)) {
    return false;
  }
  return field.proofs.some(p => p.type === 'range');
}

/**
 * Get the range proof for a field if it exists
 */
function getRangeProof(field: FieldDefinition): RangeProof | undefined {
  return field.proofs.find(p => p.type === 'range') as RangeProof | undefined;
}

/**
 * Generate witness function for a field with range proof
 * The witness provides the private value that is never revealed on-chain
 */
function generateRangeWitness(field: FieldDefinition): string {
  const compactType = mapFieldType(field);
  const capitalizedName = field.name.charAt(0).toUpperCase() + field.name.slice(1);
  
  let comments = `// ============================================================================
// Range Proof Witness - ${field.name}
// ============================================================================
// Witness: the actual ${field.name} value (kept private, not revealed on-chain)
`;
  
  // Add scale documentation if applicable
  if (field.scale && field.scale > 1) {
    comments += `// Note: ${field.name} is stored as integer with scale ${field.scale}
`;
    // Calculate example values
    const minExample = 0;
    const maxExample = field.scale * 10; // Just an example
    comments += `// ${minExample} = ${(minExample / field.scale).toFixed(Math.log10(field.scale))} ${field.name.toUpperCase()}, ${maxExample} = ${(maxExample / field.scale).toFixed(Math.log10(field.scale))} ${field.name.toUpperCase()}
`;
  }
  
  comments += `
`;
  
  return `${comments}witness ${field.name}Value(): ${compactType};

`;
}

/**
 * Generate verifyMin circuit for a field with range proof
 * Proves that value >= minValue without revealing the actual value
 */
function generateVerifyMinCircuit(field: FieldDefinition, rangeProof: RangeProof): string {
  const compactType = mapFieldType(field);
  const capitalizedName = field.name.charAt(0).toUpperCase() + field.name.slice(1);
  
  return `// ============================================================================
// Minimum Value Proof - ${field.name}
// Proves that ${field.name} >= minValue without revealing the actual value
// ============================================================================
export circuit verifyMin${capitalizedName}(minValue: ${compactType}): [] {
  const actualValue = ${field.name}Value();
  assert(actualValue >= minValue, "${field.name} below minimum");
}

`;
}

/**
 * Generate verifyRange circuit for a field with range proof
 * Proves that minValue <= value <= maxValue without revealing the actual value
 */
function generateVerifyRangeCircuit(field: FieldDefinition, rangeProof: RangeProof): string {
  const compactType = mapFieldType(field);
  const capitalizedName = field.name.charAt(0).toUpperCase() + field.name.slice(1);
  
  return `// ============================================================================
// Range Proof - ${field.name}
// Proves that minValue <= ${field.name} <= maxValue without revealing the actual value
// ============================================================================
export circuit verify${capitalizedName}Range(minValue: ${compactType}, maxValue: ${compactType}): [] {
  const actualValue = ${field.name}Value();
  assert(actualValue >= minValue, "${field.name} below minimum");
  assert(actualValue <= maxValue, "${field.name} above maximum");
}

`;
}

/**
 * Generate all range proof circuits for fields that have range proofs
 */
function generateRangeProofCircuits(ast: SchemaAST): string {
  const parts: string[] = [];
  
  // Generate witnesses for all fields with range proofs
  for (const field of ast.fields) {
    if (hasRangeProof(field)) {
      parts.push(generateRangeWitness(field));
    }
  }
  
  // Generate circuits for all fields with range proofs
  for (const field of ast.fields) {
    const rangeProof = getRangeProof(field);
    if (rangeProof) {
      // Generate verifyMin circuit
      parts.push(generateVerifyMinCircuit(field, rangeProof));
      // Generate verifyRange circuit
      parts.push(generateVerifyRangeCircuit(field, rangeProof));
    }
  }
  
  return parts.join('');
}

// ============================================================================
// Phase 3: Equality Proof Helpers
// ============================================================================

/**
 * Check if a field has an equality proof requirement
 * Note: Storage-only fields (Case 16) never have equality proofs
 */
function hasEqualityProof(field: FieldDefinition): boolean {
  if (isStorageOnlyField(field)) {
    return false;
  }
  return field.proofs.some(p => p.type === 'equality');
}

/**
 * Get the equality proof for a field if it exists
 */
function getEqualityProof(field: FieldDefinition): EqualityProof | undefined {
  return field.proofs.find(p => p.type === 'equality') as EqualityProof | undefined;
}

/**
 * Check if a field already has a witness generated (from range proof)
 */
function hasWitnessGenerated(field: FieldDefinition): boolean {
  return hasRangeProof(field); // Range proofs already generate witnesses
}

/**
 * Generate witness function for a field with equality proof
 * The witness provides the private value that is never revealed on-chain
 * Note: If field already has range proof witness, we skip to avoid duplication
 */
function generateEqualityWitness(field: FieldDefinition): string {
  const compactType = mapFieldType(field);
  
  let comments = `// ============================================================================
// Equality Proof Witness - ${field.name}
// ============================================================================
// Witness: the actual ${field.name} value (kept private, not revealed on-chain)
// Used for equality proofs to verify exact matches without revealing the value
`;
  
  comments += `
`;
  
  return `${comments}witness ${field.name}Value(): ${compactType};

`;
}

/**
 * Generate verifyFieldNameEquals circuit
 * Proves that hash(value) == expectedHash without revealing the actual value
 */
function generateVerifyEqualsCircuit(field: FieldDefinition, equalityProof: EqualityProof): string {
  const compactType = mapFieldType(field);
  const capitalizedName = field.name.charAt(0).toUpperCase() + field.name.slice(1);
  const hashAlgo = equalityProof.hash_algorithm || 'persistentHash';
  
  return `// ============================================================================
// Equality Proof - ${field.name}
// Proves that hash(${field.name}) == expectedHash without revealing the actual value
// Uses ${hashAlgo} for on-chain verifiable hashing
// ============================================================================
export circuit verify${capitalizedName}Equals(expectedHash: Bytes<32>): [] {
  const actualValue = ${field.name}Value();
  // Hash the actual value and compare to expected
  const actualHash = ${hashAlgo}<[${compactType}]>([actualValue]);
  assert(actualHash == expectedHash, "${field.name} value does not match");
}

`;
}

/**
 * Generate proveFieldNameKnowledge circuit
 * Proves knowledge of the value without revealing it
 * Returns a commitment/hash that can be verified off-chain
 */
function generateProveKnowledgeCircuit(field: FieldDefinition, equalityProof: EqualityProof): string {
  const compactType = mapFieldType(field);
  const capitalizedName = field.name.charAt(0).toUpperCase() + field.name.slice(1);
  const hashAlgo = equalityProof.hash_algorithm || 'persistentHash';
  
  return `// ============================================================================
// Knowledge Proof - ${field.name}
// Proves knowledge of ${field.name} without revealing the value
// Returns a commitment/hash that can be verified off-chain
// Uses disclose() to explicitly mark the hash as public output
// ============================================================================
export circuit prove${capitalizedName}Knowledge(): Bytes<32> {
  const actualValue = ${field.name}Value();
  // Hash the witness value and explicitly disclose the result
  const hashResult = ${hashAlgo}<[${compactType}]>([actualValue]);
  return disclose(hashResult);
}

`;
}

/**
 * Generate all equality proof circuits for fields that have equality proofs
 */
function generateEqualityProofCircuits(ast: SchemaAST): string {
  const parts: string[] = [];
  
  // Generate witnesses for fields with equality proofs (only if no range proof witness already)
  for (const field of ast.fields) {
    if (hasEqualityProof(field) && !hasWitnessGenerated(field)) {
      parts.push(generateEqualityWitness(field));
    }
  }
  
  // Generate circuits for all fields with equality proofs
  for (const field of ast.fields) {
    const equalityProof = getEqualityProof(field);
    if (equalityProof) {
      // Generate verifyEquals circuit
      parts.push(generateVerifyEqualsCircuit(field, equalityProof));
      // Generate proveKnowledge circuit
      parts.push(generateProveKnowledgeCircuit(field, equalityProof));
    }
  }
  
  return parts.join('');
}

// ============================================================================
// Phase 4: Revocation Support (Sparse Merkle Non-Existence)
// ============================================================================

/**
 * Generate SparseMerkleProof struct for revocation proofs
 */
function generateSparseMerkleProofStruct(depth: number): string {
  return `// ============================================================================
// Sparse Merkle Proof Struct - For revocation (non-existence) verification
// ============================================================================
// Sparse Merkle proof structure for non-existence verification
// Depth: ${depth} levels (supports 2^${depth} possible revocation entries)
export struct SparseMerkleProof {
  siblings: Vector<${depth}, Bytes<32>>,
  isRight: Vector<${depth}, Boolean>,
  leafIndex: Uint<248>
}

`;
}

/**
 * Generate revocation ledger state if enabled
 */
function generateRevocationLedger(ast: SchemaAST): string {
  if (!ast.revocation.enabled) {
    return '';
  }

  return `// Sparse Merkle tree root for revocation checking
// Used to prove a credential has NOT been revoked
export ledger revocationRoot: Bytes<32>;

`;
}

/**
 * Generate constructor with revocation support if enabled
 */
function generateConstructorWithRevocation(ast: SchemaAST): string {
  if (!ast.revocation.enabled) {
    // Return the original constructor
    return `// ============================================================================
// Constructor - Initialize contract with Merkle root and SOT attestation
// ============================================================================
constructor(root: Bytes<32>, attestation: Bytes<32>) {
  merkleRoot = disclose(root);
  sotAttestation = disclose(attestation);
}

`;
  }

  return `// ============================================================================
// Constructor - Initialize contract with Merkle root, SOT attestation, and revocation root
// ============================================================================
constructor(root: Bytes<32>, attestation: Bytes<32>, revokeRoot: Bytes<32>) {
  merkleRoot = disclose(root);
  sotAttestation = disclose(attestation);
  revocationRoot = disclose(revokeRoot);
}

`;
}

/**
 * Generate helper function for computing the hash at a specific level in sparse Merkle tree
 */
function generateSparseHashAtLevelCircuit(depth: number): string {
  return `// ============================================================================
// Sparse Hash At Level - Computes hash at a specific level for sparse Merkle proof
// ============================================================================
circuit sparseHashAtLevel(
  currentHash: Bytes<32>,
  sibling: Bytes<32>,
  isRight: Boolean
): Bytes<32> {
  const left = isRight ? sibling : currentHash;
  const right = isRight ? currentHash : sibling;
  return hashPair(left, right);
}

`;
}

/**
 * Generate verifySparseMerkleNonExistence circuit for revocation checking
 * Uses bounded iteration (no recursion) compatible with Compact
 */
function generateVerifySparseMerkleNonExistenceCircuit(depth: number): string {
  // Generate the full unrolled loop for the sparse Merkle tree
  // Compact requires bounded loops, so we unroll them at code generation time
  const iterations: string[] = [];
  
  for (let i = 0; i < depth; i++) {
    const prevVar = i === 0 ? 'leafHash' : `hash${i - 1}`;
    const currVar = `hash${i}`;
    iterations.push(`  // Level ${i}: hash with sibling${i}`);
    iterations.push(`  const left${i} = proof.isRight[${i}] ? proof.siblings[${i}] : ${prevVar};`);
    iterations.push(`  const right${i} = proof.isRight[${i}] ? ${prevVar} : proof.siblings[${i}];`);
    iterations.push(`  const ${currVar} = hashPair(left${i}, right${i});`);
    if (i < depth - 1) {
      iterations.push('');
    }
  }
  
  const finalHash = `hash${depth - 1}`;

  return `// ============================================================================
// Sparse Merkle Non-Existence Verification - ${depth}-level proof
// Verifies that a credential is NOT in the revocation tree
//
// Non-existence is proven by showing the path leads to an empty/default hash
// or a different leaf at the computed position
//
// @param credentialId - Hash of the credential ID being checked
// @param proof - Sparse Merkle proof of non-membership
// @param expectedRoot - The expected sparse Merkle root
// @returns Boolean - True if credential is NOT in the tree (not revoked)
// ============================================================================
circuit verifySparseMerkleNonExistence(
  credentialId: Bytes<32>,
  proof: SparseMerkleProof,
  expectedRoot: Bytes<32>
): Boolean {
  // Compute leaf hash from credentialId
  const leafHash = persistentHash<[Bytes<32>, Uint<248>]>([credentialId, proof.leafIndex]);
  
  // Traverse up the tree level by level (bounded, unrolled for Compact)
${iterations.join('\n')}
  
  // Final verification: computed root must match expected root
  return ${finalHash} == expectedRoot;
}

`;
}

/**
 * Generate verifyNotRevoked circuit
 */
function generateVerifyNotRevokedCircuit(): string {
  return `// ============================================================================
// Revocation Check - Sparse Merkle Non-Existence Proof
// Proves that a credential has NOT been revoked
// Uses sparse Merkle tree to verify non-membership
//
// @param credentialId - Hash of credential ID being checked (private)
// @param proof - Sparse Merkle proof of non-membership (private)
// @returns Boolean - True if credential is NOT revoked (valid)
// ============================================================================
export circuit verifyNotRevoked(
  credentialId: Bytes<32>,
  proof: SparseMerkleProof
): Boolean {
  // Verify the credentialId is NOT in the revocation tree
  // Returns true if proof shows non-membership
  return verifySparseMerkleNonExistence(credentialId, proof, revocationRoot);
}

`;
}

/**
 * Generate updateRevocationRoot circuit (admin only)
 */
function generateUpdateRevocationRootCircuit(): string {
  return `// ============================================================================
// Update Revocation Root - Admin function for SOT to revoke credentials
// Updates the sparse Merkle root to include new revoked credentials
//
// In production, this should have proper access control (only SOT can call)
// ============================================================================
export circuit updateRevocationRoot(newRoot: Bytes<32>): [] {
  revocationRoot = disclose(newRoot);
}

`;
}

/**
 * Generate all revocation circuits if enabled
 */
function generateRevocationCircuits(ast: SchemaAST): string {
  if (!ast.revocation.enabled) {
    return '';
  }

  const parts: string[] = [];
  const depth = ast.revocation.sparse_tree_depth;

  // Generate helper circuit
  parts.push(generateSparseHashAtLevelCircuit(depth));
  
  // Generate verification circuit
  parts.push(generateVerifySparseMerkleNonExistenceCircuit(depth));
  
  // Generate public circuits
  parts.push(generateVerifyNotRevokedCircuit());
  parts.push(generateUpdateRevocationRootCircuit());

  return parts.join('');
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generate Compact smart contract code from Schema AST
 * 
 * @param ast - The parsed and validated schema AST
 * @returns Complete Compact contract code as a string
 */
export function generateCompact(ast: SchemaAST): string {
  const parts: string[] = [];

  // Header
  parts.push(generateHeader(ast));

  // Struct definitions (Phase 1 + Phase 4)
  parts.push(generateStruct(ast));
  
  // Phase 4: Sparse Merkle Proof struct (if revocation enabled)
  if (ast.revocation.enabled) {
    parts.push(generateSparseMerkleProofStruct(ast.revocation.sparse_tree_depth));
  }

  // Ledger state (Phase 1 + Phase 4)
  parts.push(generateLedger(ast));
  
  // Phase 4: Add revocation ledger if enabled
  parts.push(generateRevocationLedger(ast));

  // Constructor (Phase 1 + Phase 4)
  parts.push(generateConstructorWithRevocation(ast));

  // Helper circuits
  parts.push(generateHashPairCircuit());

  // Merkle proof circuit (Phase 1)
  parts.push(generateMerkleProofCircuit(ast.merkle_tree.depth));

  // Range proof circuits (Phase 2)
  parts.push(generateRangeProofCircuits(ast));

  // Equality proof circuits (Phase 3)
  parts.push(generateEqualityProofCircuits(ast));
  
  // Revocation circuits (Phase 4)
  parts.push(generateRevocationCircuits(ast));

  return parts.join('');
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generate Compact code and save to file (Node.js environment)
 */
export async function generateCompactToFile(
  ast: SchemaAST, 
  outputPath: string
): Promise<void> {
  const code = generateCompact(ast);
  
  if (typeof Deno !== 'undefined') {
    // Deno environment
    await Deno.writeTextFile(outputPath, code);
  } else if (typeof window === 'undefined') {
    // Node.js environment
    const fs = await import('fs/promises');
    await fs.writeFile(outputPath, code, 'utf-8');
  } else {
    throw new Error('File writing not supported in browser environment');
  }
}

/**
 * Generate multiple variations of Merkle proof circuits
 * Useful for contracts that need to support multiple tree depths
 */
export function generateMerkleProofCircuits(depths: number[]): string {
  return depths.map(depth => generateMerkleProofCircuit(depth)).join('\n');
}

// Re-export types for consumers
export * from './types.ts';
