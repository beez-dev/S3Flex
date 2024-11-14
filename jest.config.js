/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/?(*.)+(spec|test).ts'],
    transform: {
        '^.+.tsx?$': ['ts-jest', {}],
    },
};
