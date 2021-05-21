
import { createCI } from '../index';
import { CryptoIncognito } from '../CryptoIncognito';

describe('callAPI', () => {
	let ci: CryptoIncognito;
	beforeAll(async () => {
		ci = await createCI('', '');
	});
	test('POST without body data', async () => {
		await expect(async () => { await ci.callAPI<any>('path', 'POST'); }).rejects.toThrow(/^body is required to call this API\.$/);
	});
	test('failed API call', async () => {
		await expect(async () => { await ci.callAPI<any>('path', 'GET'); }).rejects.toThrow(/^Requested endpoint not found\.$/);
	});
	test('fetch defined globally', async () => {
		Object.defineProperty(global.self, 'fetch', {
			value: async (url: string, params: any) => ({
				ok: true,
				json: async () => ({
					data: { coins: ['btc', 'tbtc'] },
				}),
			}),
		});
		const coins = await ci.getCoins();
		expect(coins).toEqual(['btc', 'tbtc']);
	});
});

