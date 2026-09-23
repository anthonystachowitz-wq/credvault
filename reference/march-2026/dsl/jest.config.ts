/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          allowImportingTsExtensions: true,
        },
      },
    ],
  },
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    '*.ts',
    '!jest.config.ts',
    '!generate-all-cases.ts',
    '!compile-all-cases.ts',
  ],
};
