
module.exports = {
	roots: [
		'<rootDir>/src',
	],
	testMatch: [
		'**/__tests__/**/*.+(ts|tsx|js)',
		'**/?(*.)+(spec|test).+(ts|tsx|js)',
	],
	transform: {
		'^.+\\.worker.[t|j]sx?$': 'workerloader-jest-transformer',
		'^.+\\.(ts|tsx)$': 'ts-jest',
	},
	transformIgnorePatterns: [],
	setupFilesAfterEnv: ['./node_modules/epir/src_ts/__tests__/crypto.setup.ts'],
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/bench_balance.ts',
		'!src/vanitygen.ts',
	],
};

