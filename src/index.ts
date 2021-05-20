
import { createEpir, createDecryptionContext } from 'epir';

import { CryptoIncognito } from './CryptoIncognito';

export const createCI = async (
	apiID: string, apiKey: string,
	privkey?: Uint8Array,
	apiEndPoint?: string) => {
	const epir = await createEpir();
	const decCtx = await createDecryptionContext(process.env.HOME + '/.EllipticPIR/mG.bin');
	return new CryptoIncognito(epir, decCtx, apiID, apiKey, privkey, apiEndPoint);
};

