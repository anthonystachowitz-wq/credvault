import { parseSchemaStrict } from './schema-parser.ts';
import { generateCompactToFile } from './compact-generator.ts';

const schema = {
  sot_type: 'university',
  credential_name: 'transcript',
  version: '1.0.0',
  description: 'Academic transcript with storage-only fields',
  fields: [
    { name: 'gpa', type: 'uint', scale: 100, verifiable: true, proofs: [{ type: 'merkle_existence' }, { type: 'range', min: 0, max: 400 }] },
    { name: 'studentName', type: 'string', verifiable: false },
    { name: 'graduationDate', type: 'timestamp', verifiable: false }
  ],
  merkle_tree: { depth: 4, hash_algorithm: 'pedersen' },
  revocation: { enabled: false, sparse_tree_depth: 160 }
};

const ast = parseSchemaStrict(schema);
await generateCompactToFile(ast, './output/test-case16.compact');
console.log('Generated: ./output/test-case16.compact');
