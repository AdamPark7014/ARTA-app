/** Unit tests: colocated *.spec.ts, no DB required. See test/jest-e2e.json for integration tests. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  transform: { '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: { allowJs: true } }] },
  // Transform ESM-only deps used transitively (otplib → @scure/*, @noble/*)
  transformIgnorePatterns: ['node_modules/(?!(otplib|@otplib|@scure|@noble)/)'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coveragePathIgnorePatterns: ['<rootDir>/node_modules/', '.module.ts$'],
  /**
   * Con un worker por núcleo, ts-jest compila 20 suites a la vez y en esta
   * máquina la corrida pasaba de 13 s a 12 min, con suites cayéndose por
   * timeout sin tener nada roto. Dos workers dejan la suite en verde y rápida;
   * quien persiga un fallo de verdad no debería perder la tarde en un fantasma.
   */
  maxWorkers: 2,
};
