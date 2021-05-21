
import { createEpir, createDecryptionContext } from 'epir';

import { CryptoIncognito, NonceGenerator, NonceGeneratorMutex } from './CryptoIncognito';

export const createCI = async (
	apiID: string, apiKey: string,
	nonceGenerator: NonceGenerator<any> = new NonceGeneratorMutex(),
	privkey?: Uint8Array,
	apiEndPoint?: string) => {
	const epir = await createEpir();
	const decCtx = await createDecryptionContext(process.env.HOME + '/.EllipticPIR/mG.bin');
	return new CryptoIncognito(epir, decCtx, apiID, apiKey, nonceGenerator, privkey, apiEndPoint);
};

