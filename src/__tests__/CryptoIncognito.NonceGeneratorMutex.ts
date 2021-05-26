
import { NonceGeneratorMutex } from '../CryptoIncognito';

test('', async () => {
	const nonceGenerator = new NonceGeneratorMutex();
	const lockA = await nonceGenerator.acquire();
	const nonceA = await nonceGenerator.getNonce();
	await nonceGenerator.release(lockA);
	const lockB = await nonceGenerator.acquire();
	const nonceB = await nonceGenerator.getNonce();
	await nonceGenerator.release(lockB);
	expect(nonceA).toBeLessThan(nonceB);
});

