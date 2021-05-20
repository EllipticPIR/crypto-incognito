
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
	collectCoverageFrom: [
		'src/**/*.ts',
	],
};

