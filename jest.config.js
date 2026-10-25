/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    // Nock's fetch interception can leak across reused ESM VM environments.
    // Recycle workers between suites and bound concurrency locally and in CI.
    maxWorkers: 2,
    workerIdleMemoryLimit: '1MB',
    cache: false,
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            useESM: true,
            tsconfig: 'tsconfig.test.json'
        }],
    },
    transformIgnorePatterns: [
        'node_modules/',
    ],
    testMatch: ['**/tests/**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    verbose: false,
    testTimeout: 10000
};
