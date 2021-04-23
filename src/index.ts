
import crypto from 'crypto';
import fetch from 'node-fetch';

import * as bitcoin from 'bitcoinjs-lib';

import epir from 'epir';

const DEBUG = false;

type UTXOPart = 'first' | 'second';

export type Response<T> = {
	error: string | undefined;
	data: T;
};

export type UTXOSetInfo = {
	height: number;
	elemCount: number;
	indexCounts: number[];
	utxoFirstSize: number;
	dimension: number;
	packing: number;
};

export type UTXOEntry = {
	txid: string;
	vout: number;
	value: number;
};

export class CryptoIncognito {
	
	apiID: string;
	apiKey: string;
	privKey: Uint8Array;
	pubKey: Uint8Array;
	apiEndPoint: string;
	
	static createPrivKey(): Uint8Array {
		return epir.create_privkey();
	}
	
	constructor(
		apiID: string, apiKey: string,
		apiEndPoint: string = 'https://api.crypto-incognito/',
		privKey: Uint8Array = CryptoIncognito.createPrivKey()) {
		this.apiID = apiID;
		this.apiKey = apiKey;
		this.privKey = privKey;
		this.pubKey = epir.pubkey_from_privkey(this.privKey);
		this.apiEndPoint = apiEndPoint;
	}
	
	async init() {
		await epir.load_mG(process.env.HOME + '/.EllipticPIR/mG.bin');
	}
	
	createAuth(body: string, nonce: number = new Date().getTime()): { nonce: number, signature: string } {
		const hmac = crypto.createHmac('sha3-256', this.apiKey);
		hmac.update(nonce + ':' + body);
		const digest = hmac.digest('base64');
		return {
			nonce: nonce,
			signature: digest,
		};
	}
	
	async callAPI<T>(path: string, method: string, headers: { [key: string]: string } = {}, body: string | null = null): Promise<T> {
		const url = `${this.apiEndPoint}${path}`;
		headers['Content-Type'] = 'application/json';
		let params: any = {
			method: method,
			headers: headers,
		};
		if(['POST', 'PUT', 'DELETE'].indexOf(method) >= 0) {
			if(!body) throw new Error(`body is required to call this API.`);
			params.body = body;
		}
		const res = await fetch(url, params);
		if(!res.ok) throw new Error((await res.json() as Response<T>).error);
		return (await res.json() as Response<T>).data;
	}
	
	async callAPIPublic<T>(path: string): Promise<T> {
		return await this.callAPI<T>(`pub/${path}`, 'GET');
	}
	
	async callAPIPrivate<T>(path: string, method: string, body: any): Promise<T> {
		const bodyStr = JSON.stringify(body);
		const auth = this.createAuth(bodyStr);
		const headers = {
			'X-Nonce': auth.nonce.toString(),
			'X-API-ID': this.apiID,
			'X-Signature': auth.signature,
		}
		return await this.callAPI<T>(`priv/${path}`, method, headers, bodyStr);
	}
	
	// GET /pub/coins
	async getCoins(): Promise<string[]> {
		return (await this.callAPIPublic<{ coins: string[] }>('coins')).coins;
	}
	
	// GET /pub/utxoSetInfo/:coin/:addrType
	async getUTXOSetInfo(coin: string, addrType: string): Promise<UTXOSetInfo> {
		const path = `utxoSetInfo/${coin}/${addrType}`;
		return await this.callAPIPublic<UTXOSetInfo>(path);
	}
	
	async createSelector(indexCounts: number[], idx: number): Promise<Uint8Array> {
		return await epir.selector_create(this.pubKey, indexCounts, idx);
	}
	
	async createSelectorFast(indexCounts: number[], idx: number): Promise<Uint8Array> {
		return await epir.selector_create_fast(this.privKey, indexCounts, idx);
	}
	
	async getUTXO(part: UTXOPart, coin: string, addrType: string, selector: Uint8Array): Promise<Uint8Array> {
		const path = `utxo/${part}/${coin}/${addrType}`;
		const body = { selector: Buffer.from(selector).toString('base64') };
		const replyStr = (await this.callAPIPrivate<{ reply: string }>(path, 'PUT', body)).reply;
		return new Uint8Array(Buffer.from(replyStr, 'base64'));
	}
	
	// PUT /priv/utxo/first/:coin/:addrType
	async getUTXOFirst(coin: string, addrType: string, selector: Uint8Array): Promise<Uint8Array> {
		return await this.getUTXO('first', coin, addrType, selector);
	}
	
	// PUT /priv/utxo/second/:coin/:addrType
	async getUTXOSecond(coin: string, addrType: string, selector: Uint8Array): Promise<Uint8Array> {
		return await this.getUTXO('second', coin, addrType, selector);
	}
	
	async decryptReply(reply: Uint8Array, dimension: number, packing: number): Promise<Uint8Array> {
		return await epir.reply_decrypt(reply, this.privKey, dimension, packing);
	}
	
	// Conduct a PIR binary search to find the location of the specified address and retrieves all UTXOs matching the address.
	async findUTXOs(coin: string, addrType: string, address: string): Promise<UTXOEntry[]> {
		const time = () => new Date().getTime();
		const addrBuf = (['p2pkh', 'p2sh'].indexOf(addrType) >= 0) ?
			bitcoin.address.fromBase58Check(address).hash :
			bitcoin.address.fromBech32(address).data;
		const utxoSetInfo = await this.getUTXOSetInfo(coin, addrType);
		const findEdge = async (edge: string): Promise<number> => {
			let imin = 0;
			let imax = utxoSetInfo.elemCount - 1;
			const begin = time();
			// FIXME: The number of queries sent to the server is not constant, and will leak some information about the index.
			// FIXME: We should conduct a dummy query to ensure that the number of queries sent to the server is constant
			// FIXME: regardless of the index we are searching.
			let queriesSent = 0;
			for(; imin < imax; queriesSent++) {
				const imid = imin + ((imax - imin) >> 1) + (edge == 'left' ? 0: (imax - imin) % 2);
				const selector = await this.createSelectorFast(utxoSetInfo.indexCounts, imid);
				const utxoFirstReply = await this.getUTXOFirst(coin, addrType, selector);
				const utxoFirst = Buffer.from(await this.decryptReply(utxoFirstReply, utxoSetInfo.dimension, utxoSetInfo.packing));
				const cmp = addrBuf.compare(utxoFirst, 0, utxoSetInfo.utxoFirstSize, 0, utxoSetInfo.utxoFirstSize);
				if(cmp < 0) {
					imax = imid - 1;
				} else if(cmp > 0) {
					imin = imid + 1;
				} else {
					if(edge == 'left') {
						imax = imid;
					} else {
						imin = imid;
					}
				}
			}
			if(DEBUG) {
				console.log(`The ${edge} edge found at ${imin.toLocaleString()} in ${(time() - begin)}ms by sending ${queriesSent} queries.`);
			}
			return imin;
		}
		const begin = time();
		const [leftEdge, rightEdge] = await Promise.all([findEdge('left'), findEdge('right')]);
		if(DEBUG) {
			console.log(`Find edge done in ${(time() - begin).toLocaleString()}ms.`);
		}
		const ret: UTXOEntry[] = [];
		for(let i=leftEdge; i<=rightEdge; i++) {
			const selector = await this.createSelectorFast(utxoSetInfo.indexCounts, i);
			const utxoSecondReply = await this.getUTXOSecond(coin, addrType, selector);
			const utxoSecond = await this.decryptReply(utxoSecondReply, utxoSetInfo.dimension, utxoSetInfo.packing);
			const utxoSecondBuf = Buffer.from(utxoSecond);
			const addrBuf2 = Buffer.concat([
				addrBuf.slice(0, utxoSetInfo.utxoFirstSize),
				utxoSecondBuf.slice(0, addrBuf.length - utxoSetInfo.utxoFirstSize)
			]);
			// Found a different address.
			if(addrBuf.compare(addrBuf2) != 0) continue;
			ret.push({
				txid: utxoSecondBuf.slice(addrBuf.length - utxoSetInfo.utxoFirstSize, 32 + addrBuf.length - utxoSetInfo.utxoFirstSize).toString('hex'),
				vout: utxoSecondBuf.readUInt32LE(32 + addrBuf.length - utxoSetInfo.utxoFirstSize),
				value: parseInt(utxoSecondBuf.readBigUInt64LE(4 + 32 + addrBuf.length - utxoSetInfo.utxoFirstSize).toString()),
			});
		}
		return ret;
	}
	
}

export default CryptoIncognito;

