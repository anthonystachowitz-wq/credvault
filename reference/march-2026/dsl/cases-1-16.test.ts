import { describe, test, expect } from '@jest/globals';
import { parseSchema, generateCompact } from '../compact-generator';

// Import all 16 test schemas
import case1 from '../test-schemas/case1-merkle-only.json';
import case2 from '../test-schemas/case2-range-only.json';
import case3 from '../test-schemas/case3-equality-only.json';
import case4 from '../test-schemas/case4-revocation-only.json';
import case5 from '../test-schemas/case5-merkle-range.json';
import case6 from '../test-schemas/case6-merkle-equality.json';
import case7 from '../test-schemas/case7-merkle-revocation.json';
import case8 from '../test-schemas/case8-range-equality.json';
import case9 from '../test-schemas/case9-range-revocation.json';
import case10 from '../test-schemas/case10-equality-revocation.json';
import case11 from '../test-schemas/case11-merkle-range-equality.json';
import case12 from '../test-schemas/case12-merkle-range-revocation.json';
import case13 from '../test-schemas/case13-merkle-equality-revocation.json';
import case14 from '../test-schemas/case14-range-equality-revocation.json';
import case15 from '../test-schemas/case15-merkle-range-equality-revocation.json';
import case16 from '../test-schemas/case16-storage-only.json';

describe('CredVault Use Cases 1-16', () => {
  
  test('Case 1: Merkle Only - generates correct code', () => {
    const result = parseSchema(case1);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have Merkle proof circuit
    expect(code).toContain('verifyMerkleProof4');
    expect(code).toContain('merkleRoot');
    
    // Should NOT have range or equality circuits
    expect(code).not.toContain('verifyMin');
    expect(code).not.toContain('verifyEquals');
    expect(code).not.toContain('revocationRoot');
    
    // Should have witness
    expect(code).toContain('witness gpaValue');
  });
  
  test('Case 2: Range Only - generates correct code', () => {
    const result = parseSchema(case2);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have range proof circuits
    expect(code).toContain('witness gpaValue');
    expect(code).toContain('verifyMinGpa');
    expect(code).toContain('verifyGpaRange');
    
    // Should NOT have Merkle or equality
    expect(code).not.toContain('verifyMerkleProof');
    expect(code).not.toContain('verifyGpaEquals');
  });
  
  test('Case 3: Equality Only - generates correct code', () => {
    const result = parseSchema(case3);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have equality proof circuits
    expect(code).toContain('witness licenseNumberValue');
    expect(code).toContain('verifyLicenseNumberEquals');
    expect(code).toContain('proveLicenseNumberKnowledge');
    
    // Should NOT have Merkle or range
    expect(code).not.toContain('verifyMerkleProof');
    expect(code).not.toContain('verifyMin');
    expect(code).not.toContain('verifyRange');
  });
  
  test('Case 4: Revocation Only - generates correct code', () => {
    const result = parseSchema(case4);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have revocation circuits
    expect(code).toContain('revocationRoot');
    expect(code).toContain('verifyNotRevoked');
    expect(code).toContain('SparseMerkleProof');
    expect(code).toContain('updateRevocationRoot');
    
    // Should have Merkle for credential existence
    expect(code).toContain('verifyMerkleProof4');
  });
  
  test('Case 5: Merkle + Range - generates correct code', () => {
    const result = parseSchema(case5);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have both Merkle and range
    expect(code).toContain('verifyMerkleProof4');
    expect(code).toContain('verifyMinGpa');
    expect(code).toContain('verifyGpaRange');
    
    // Should NOT have equality
    expect(code).not.toContain('verifyGpaEquals');
  });
  
  test('Case 6: Merkle + Equality - generates correct code', () => {
    const result = parseSchema(case6);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have both Merkle and equality
    expect(code).toContain('verifyMerkleProof4');
    expect(code).toContain('verifyLicenseNumberEquals');
    expect(code).toContain('proveLicenseNumberKnowledge');
    
    // Should NOT have range
    expect(code).not.toContain('verifyMin');
  });
  
  test('Case 7: Merkle + Revocation - generates correct code', () => {
    const result = parseSchema(case7);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have both Merkle and revocation
    expect(code).toContain('verifyMerkleProof4');
    expect(code).toContain('revocationRoot');
    expect(code).toContain('verifyNotRevoked');
  });
  
  test('Case 8: Range + Equality - generates correct code', () => {
    const result = parseSchema(case8);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have both range and equality
    expect(code).toContain('verifyMinSalary');
    expect(code).toContain('verifyEmployeeIdEquals');
    
    // Should have witnesses for both fields
    expect(code).toContain('witness salaryValue');
    expect(code).toContain('witness employeeIdValue');
    
    // Should NOT have Merkle
    expect(code).not.toContain('verifyMerkleProof');
  });
  
  test('Case 9: Range + Revocation - generates correct code', () => {
    const result = parseSchema(case9);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have both range and revocation
    expect(code).toContain('verifyMinScore');
    expect(code).toContain('revocationRoot');
    expect(code).toContain('verifyNotRevoked');
  });
  
  test('Case 10: Equality + Revocation - generates correct code', () => {
    const result = parseSchema(case10);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have both equality and revocation
    expect(code).toContain('verifyVoterIdHashEquals');
    expect(code).toContain('revocationRoot');
    expect(code).toContain('verifyNotRevoked');
  });
  
  test('Case 11: Merkle + Range + Equality - generates correct code', () => {
    const result = parseSchema(case11);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have all three proof types
    expect(code).toContain('verifyMerkleProof4');
    expect(code).toContain('verifyMinGpa');
    expect(code).toContain('verifyStudentIdEquals');
    
    // Should have both witnesses
    expect(code).toContain('witness gpaValue');
    expect(code).toContain('witness studentIdValue');
    
    // Should NOT have revocation
    expect(code).not.toContain('revocationRoot');
  });
  
  test('Case 12: Merkle + Range + Revocation - generates correct code', () => {
    const result = parseSchema(case12);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have Merkle, range, and revocation
    expect(code).toContain('verifyMerkleProof4');
    expect(code).toContain('verifyMinExpirationDate');
    expect(code).toContain('revocationRoot');
    expect(code).toContain('verifyNotRevoked');
  });
  
  test('Case 13: Merkle + Equality + Revocation - generates correct code', () => {
    const result = parseSchema(case13);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have Merkle, equality, and revocation
    expect(code).toContain('verifyMerkleProof4');
    expect(code).toContain('verifyLicenseNumberEquals');
    expect(code).toContain('revocationRoot');
    expect(code).toContain('verifyNotRevoked');
  });
  
  test('Case 14: Range + Equality + Revocation - generates correct code', () => {
    const result = parseSchema(case14);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have range, equality, and revocation
    expect(code).toContain('verifyMinSalary');
    expect(code).toContain('verifyEmployeeIdEquals');
    expect(code).toContain('revocationRoot');
    
    // Should NOT have Merkle
    expect(code).not.toContain('verifyMerkleProof');
  });
  
  test('Case 15: Merkle + Range + Equality + Revocation - generates correct code', () => {
    const result = parseSchema(case15);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have ALL proof types
    expect(code).toContain('verifyMerkleProof4');
    expect(code).toContain('verifyMinAge');
    expect(code).toContain('verifyIdNumberEquals');
    expect(code).toContain('revocationRoot');
    expect(code).toContain('verifyNotRevoked');
    
    // Should have both witnesses
    expect(code).toContain('witness ageValue');
    expect(code).toContain('witness idNumberValue');
  });
  
  test('Case 16: Storage Only - no verification circuits for non-verifiable fields', () => {
    const result = parseSchema(case16);
    expect(result.success).toBe(true);
    
    const code = generateCompact(result.ast!);
    
    // Should have storage-only fields in struct
    expect(code).toContain('studentName: Bytes<256>');
    expect(code).toContain('graduationDate: Uint<64>');
    
    // Should have verifiable field with Merkle
    expect(code).toContain('witness gpaValue');
    expect(code).toContain('verifyMerkleProof4');
    
    // Should NOT have witnesses or circuits for storage-only fields
    expect(code).not.toContain('witness studentNameValue');
    expect(code).not.toContain('witness graduationDateValue');
    expect(code).not.toContain('verifyStudentName');
    expect(code).not.toContain('verifyGraduationDate');
  });
});

describe('All Cases Parse Successfully', () => {
  const cases = [
    { num: 1, schema: case1 },
    { num: 2, schema: case2 },
    { num: 3, schema: case3 },
    { num: 4, schema: case4 },
    { num: 5, schema: case5 },
    { num: 6, schema: case6 },
    { num: 7, schema: case7 },
    { num: 8, schema: case8 },
    { num: 9, schema: case9 },
    { num: 10, schema: case10 },
    { num: 11, schema: case11 },
    { num: 12, schema: case12 },
    { num: 13, schema: case13 },
    { num: 14, schema: case14 },
    { num: 15, schema: case15 },
    { num: 16, schema: case16 },
  ];
  
  for (const { num, schema } of cases) {
    test(`Case ${num} parses without errors`, () => {
      const result = parseSchema(schema);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.ast).toBeDefined();
    });
  }
});
