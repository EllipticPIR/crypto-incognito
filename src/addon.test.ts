
import { createCI } from './index';
import dotenv from 'dotenv';
dotenv.config();

export const address = 'tb1qcrypt0lnc0gnlt0c0mxxxxxxxxxxxxxxg2x2vr';
export const expectedUtxos = [
	{
		txid: '1d52cdcedb23a3d4654012a240220481a67ad3ce7ff82aa9f6763f47a272a8b7',
		vout: 0,
		value: 114514
	},
];

export const getApiKey = () => {
	const apiID = process.env.CI_API_ID;
	const apiKey = process.env.CI_API_KEY;
	if(!apiID || !apiKey) {
		throw new Error('Please define `CI_API_ID` and `CI_API_KEY` in `.env` file.');
	}
	return { id: apiID, key: apiKey };
};

export const runTests = () => {
	describe('Addon', () => {
		test('findUTXOs', async () => {
			const apiKey = getApiKey();
			const ci = await createCI(apiKey.id, apiKey.key);
			const utxos = await ci.findUTXOs(address);
			expect(utxos).toEqual(expectedUtxos);
		}, 30 * 1000);
	});
};

if(require.main === null) {
	runTests();
}
