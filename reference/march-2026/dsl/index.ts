/**
 * CredVault DSL Schema Parser
 * 
 * Main entry point for the DSL parser. Export all types, validators, and parsers.
 * 
 * @example
 * ```typescript
 * import { parseSchema, validateSchema, SchemaParser } from './index';
 * 
 * const result = parseSchema(schemaObject);
 * if (result.success) {
 *   console.log('AST:', result.ast);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 * ```
 */

// Export all types
export * from './types.ts';

// Export validator
export { SchemaValidator, validateSchema, ErrorCodes } from './validator.ts';

// Export parser
export {
  SchemaParser,
  parseSchema,
  parseSchemaStrict,
  parseJsonSchema,
  parseYamlSchema,
} from './schema-parser.ts';

// Default export for convenience
export { parseSchema as default } from './schema-parser.ts';
