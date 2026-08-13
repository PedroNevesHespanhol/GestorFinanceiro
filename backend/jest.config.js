/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
        module: 'commonjs',
        target: 'ES2020',
      },
    }],
  },
  clearMocks: true,
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/routes/**/*.ts',
    'src/middleware/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 70,
    },
  },
};
