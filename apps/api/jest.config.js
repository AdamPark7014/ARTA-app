/** Unit tests: colocated *.spec.ts, no DB required. See test/jest-e2e.json for integration tests. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coveragePathIgnorePatterns: ['<rootDir>/node_modules/', '.module.ts$'],
};
