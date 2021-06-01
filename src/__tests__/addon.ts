
import Redis from 'ioredis';
import Redlock from 'redlock';
import dotenv from 'dotenv';
dotenv.config();

import { SelectorFactoryBase } from 'epir/dist/types';
import { SelectorFactory } from 'epir/dist/addon';
import { createCI } from '../index';
import { CryptoIncognito, NonceGeneratorMutex, NonceGeneratorRedlock } from '../CryptoIncognito';

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

export const getNonceGenerator = async () => {
	if(process.env.REDIS_HOST) {
		const redis = new Redis(process.env.REDIS_HOST);
		await redis.del('com.crypto-incognito.nonce');
		return new NonceGeneratorRedlock(redis);
	} else {
		return new NonceGeneratorMutex();
	}
};

export const runTests = (createSelectorFactory: (privkey: ArrayBuffer) => SelectorFactoryBase) => {
	
	let ci: CryptoIncognito;
	
	beforeAll(async () => {
		const apiKey = getApiKey();
		if(process.env.CI_API_END_POINT) {
			ci = await createCI(apiKey.id, apiKey.key, await getNonceGenerator(), undefined, process.env.CI_API_END_POINT);
		} else {
			ci = await createCI(apiKey.id, apiKey.key, await getNonceGenerator());
		}
	});
	
	test('getCoins', async () => {
		const coins = await ci.getCoins();
		expect(Array.isArray(coins)).toBeTruthy();
	});
	
	describe('findUTXOs', () => {
		test('normal', async () => {
			const utxos = await ci.findUTXOs(address, false);
			expect(utxos).toEqual(expectedUtxos);
		}, 120 * 1000);
		test('fast', async () => {
			const utxos = await ci.findUTXOs(address, true);
			expect(utxos).toEqual(expectedUtxos);
		}, 120 * 1000);
		test('not found', async () => {
			const utxos = await ci.findUTXOs('tb1qn0tf0undxxxxxxxxxxxxxxxxxxxxxxxxry28wm', true);
			expect(utxos).toEqual([]);
		}, 120 * 1000);
		test('with SelectorFactory', async () => {
			ci.selectorFactory = createSelectorFactory(ci.privkey);
			await ci.selectorFactory.fill();
			const utxos = await ci.findUTXOs(address, true);
			expect(utxos).toEqual(expectedUtxos);
		}, 120 * 1000);
	});
	
	afterAll(async () => {
		if(ci.nonceGenerator instanceof NonceGeneratorRedlock) {
			ci.nonceGenerator.redis.disconnect();
		}
	});
	
};

if(require.main === null) {
	runTests((privkey: ArrayBuffer) => new SelectorFactory(true, privkey));
}

