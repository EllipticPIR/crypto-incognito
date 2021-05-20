
import { createEpir, createDecryptionContext } from 'epir/src_ts/wasm';
import { CryptoIncognito } from './CryptoIncognito';
import { getApiKey, address, expectedUtxos } from './addon.test';

// For WebAssembly tests, we have tests which uses max CPU cores
//   (x2 for main threads and worker threads, x2 for Epir and DecryptionContext).
const testsWithWorkersCount = 1;
process.setMaxListeners(testsWithWorkersCount * 2 * 2 * navigator.hardwareConcurrency);

export const runTests = () => {
	describe('WebAssembly', () => {
		test('findUTXOs', async () => {
			const apiKey = getApiKey();
			const epir = await createEpir();
			const decCtx = await createDecryptionContext(process.env.HOME + '/.EllipticPIR/mG.bin');
			const ci = new CryptoIncognito(epir, decCtx, apiKey.id, apiKey.key);
			const utxos = await ci.findUTXOs(address);
			expect(utxos).toEqual(expectedUtxos);
		}, 60 * 1000);
	});
};

if(require.main === null) {
	runTests();
}

