module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    // Mock obsidian module for tests
    '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
  },
};
