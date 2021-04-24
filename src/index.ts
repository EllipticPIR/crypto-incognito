
import crypto from 'crypto';
import fetch from 'node-fetch';

import * as bitcoin from 'bitcoinjs-lib';

import epir from 'epir';

export type Response<T> = {
	error: string | undefined;
	data: T;
};

export type UTXOSetInfo = {
	height: number;
	elemCount: number;
	indexCounts: number[];
	dimension: number;
	packing: number;
};

export type UTXOEntry = {
	txid: string;
	vout: number;
	value: number;
};

export class CryptoIncognito {
	
	debug: boolean = false;
	
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
		apiEndPoint: string = 'https://api.crypto-incognito.com/',
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
	
	// GET /pub/utxoSetInfo/:coin/:addrType/:searchType
	async getUTXOSetInfo(coin: string, addrType: string, searchType: string): Promise<UTXOSetInfo> {
		const path = `utxoSetInfo/${coin}/${addrType}/${searchType}`;
		return await this.callAPIPublic<UTXOSetInfo>(path);
	}
	
	async createSelector(indexCounts: number[], idx: number): Promise<Uint8Array> {
		return await epir.selector_create(this.pubKey, indexCounts, idx);
	}
	
	async createSelectorFast(indexCounts: number[], idx: number): Promise<Uint8Array> {
		return await epir.selector_create_fast(this.privKey, indexCounts, idx);
	}
	
	// PUT /priv/utxo/:coin/:addrType/:searchType
	async getUTXO(coin: string, addrType: string, searchType: string, selector: Uint8Array): Promise<Uint8Array> {
		const path = `utxo/${coin}/${addrType}/${searchType}`;
		const body = { selector: Buffer.from(selector).toString('base64') };
		const replyStr = (await this.callAPIPrivate<{ reply: string }>(path, 'PUT', body)).reply;
		return new Uint8Array(Buffer.from(replyStr, 'base64'));
	}
	
	async decryptReply(reply: Uint8Array, dimension: number, packing: number): Promise<Uint8Array> {
		return await epir.reply_decrypt(reply, this.privKey, dimension, packing);
	}
	
	static decodeAddress(address: string): { buf: Buffer, coin: string, addrType: string } | null {
		try {
			const base58 = bitcoin.address.fromBase58Check(address);
			const buf = base58.hash;
			switch(base58.version) {
				case 0x00:
					return {
						buf: buf,
						coin: 'btc',
						addrType: 'p2pkh',
					};
				case 0x05:
					return {
						buf: buf,
						coin: 'btc',
						addrType: 'p2sh',
					};
				case 0x6f:
					return {
						buf: buf,
						coin: 'tbtc',
						addrType: 'p2pkh',
					};
				case 0xc4:
					return {
						buf: buf,
						coin: 'tbtc',
						addrType: 'p2sh',
					};
				default:
					return null;
			}
		} catch(e) {
			try {
				const bech32 = bitcoin.address.fromBech32(address);
				const coin = (bech32.prefix == 'bc' ? 'btc' : bech32.prefix == 'tb' ? 'tbtc' : null);
				if(!coin) return null;
				const buf = bech32.data;
				if(bech32.version == 0) {
					const addrType = (buf.length == 20 ? 'p2wpkh' : buf.length == 32 ? 'p2wsh' : null);
					if(!addrType) return null;
					return {
						buf: buf,
						coin: coin,
						addrType: addrType,
					};
				} else if(bech32.version == 1) {
					if(buf.length != 32) return null;
					return {
						buf: buf,
						coin: coin,
						addrType: 'p2tr',
					};
				} else {
					return null;
				}
			} catch(e) {
				return null;
			}
		}
	}
	
	// Conduct a PIR binary search to find the location of the specified address and retrieves all UTXOs matching the address.
	async findUTXOs(address: string): Promise<UTXOEntry[]> {
		const time = () => new Date().getTime();
		// Decode address.
		const decodedResult = CryptoIncognito.decodeAddress(address);
		if(!decodedResult) throw new Error('Failed to determine address type.');
		const addrBuf = decodedResult.buf;
		const coin = decodedResult.coin;
		const addrType = decodedResult.addrType;
		// Fetch UTXOSetInfo.
		const utxoSetInfoAddress = await this.getUTXOSetInfo(coin, addrType, 'address');
		const utxoSetInfoRange = await this.getUTXOSetInfo(coin, addrType, 'range');
		const utxoSetInfoFind = await this.getUTXOSetInfo(coin, addrType, 'find');
		const find = async (): Promise<number> => {
			let imin = 0;
			let imax = utxoSetInfoAddress.elemCount - 1;
			const begin = time();
			// FIXME: The number of queries sent to the server is not constant, and will leak some information about the index.
			// FIXME: We should conduct a dummy query to ensure that the number of queries sent to the server is constant
			// FIXME: regardless of the index we are searching.
			let queriesSent = 0;
			for(; imin <= imax; queriesSent++) {
				const imid = imin + ((imax - imin) >> 1);
				const beginSelector = time();
				const selector = await this.createSelectorFast(utxoSetInfoAddress.indexCounts, imid);
				const beginQuery = time();
				const replyEncrypted = await this.getUTXO(coin, addrType, 'address', selector);
				const beginDecrypt = time();
				const reply =
					Buffer.from(await this.decryptReply(replyEncrypted, utxoSetInfoAddress.dimension, utxoSetInfoAddress.packing))
						.slice(0, addrBuf.length);
				if(this.debug) {
					console.log(`Position: ${imid.toLocaleString()}, Selector: ${beginQuery-beginSelector}ms, Query: ${beginDecrypt-beginQuery}ms, Decrypt: ${time()-beginDecrypt}ms.`);
				}
				const cmp = addrBuf.compare(reply);
				if(cmp < 0) {
					imax = imid - 1;
				} else if(cmp > 0) {
					imin = imid + 1;
				} else {
					if(this.debug) {
						console.log(`The position found at ${imid.toLocaleString()} in ${(time() - begin).toLocaleString()}ms by sending ${queriesSent} queries.`);
					}
					return imid;
				}
			}
			return -1;
		}
		const loc = await find();
		if(loc < 0) return [];
		const selector = await this.createSelectorFast(utxoSetInfoRange.indexCounts, loc);
		const rangeEncrypted = await this.getUTXO(coin, addrType, 'range', selector);
		const rangeBuf = Buffer.from(await this.decryptReply(rangeEncrypted, utxoSetInfoRange.dimension, utxoSetInfoRange.packing));
		const rangeBegin = rangeBuf.readUInt32LE(0);
		const rangeCount = rangeBuf.readUInt32LE(4);
		const ret: Promise<UTXOEntry>[] = [];
		for(let i=rangeBegin; i<rangeBegin+rangeCount; i++) {
			ret.push(new Promise(async (resolve, reject) => {
				const selector = await this.createSelectorFast(utxoSetInfoFind.indexCounts, i);
				const utxoReply = await this.getUTXO(coin, addrType, 'find', selector);
				const utxoBuf = Buffer.from(await this.decryptReply(utxoReply, utxoSetInfoFind.dimension, utxoSetInfoFind.packing));
				resolve({
					txid: utxoBuf.slice(0, 32).toString('hex'),
					vout: utxoBuf.readUInt32LE(32),
					value: parseInt(utxoBuf.readBigUInt64LE(36).toString()),
				});
			}));
		}
		return await Promise.all(ret);
	}
	
}

export default CryptoIncognito;

