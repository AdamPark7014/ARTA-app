/**
 * Integration tests against a real Postgres database (see test/setup-env.js).
 * Run with: npm run test:e2e — needs a reachable Postgres; always targets a
 * dedicated arta_test database (derived from DATABASE_URL), never dev/prod data.
 */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  transform: { '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: { allowJs: true } }] },
  testRegex: '.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  setupFiles: ['<rootDir>/test/setup-env.js'],
  // otplib's transitive @scure/@noble deps ship ESM-only; transform them too instead of
  // letting Jest's default node_modules skip rule choke on their `export` syntax.
  transformIgnorePatterns: ['node_modules/(?!(otplib|@otplib|@scure|@noble)/)'],
};
