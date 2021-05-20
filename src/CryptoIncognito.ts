
import { createHMAC, createSHA3 } from 'hash-wasm';
import * as bs58check from 'bs58check';
import { bech32 } from 'bech32';

import { EpirBase, DecryptionContextBase } from 'epir/dist/EpirBase';


const time = () => new Date().getTime();

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
	
	//logger: (str: string) => void = console.log;
	logger: (str: string) => void = (str: string) => {};
	
	epir: EpirBase;
	decCtx: DecryptionContextBase;
	
	lastNonce = new Date().getTime();
	apiID: string;
	apiKey: string;
	privkey: Uint8Array;
	pubkey: Uint8Array;
	apiEndPoint: string;
	
	constructor(
		epir: EpirBase, decCtx: DecryptionContextBase,
		apiID: string, apiKey: string,
		privkey: Uint8Array = epir.createPrivkey(),
		apiEndPoint: string = 'https://api.crypto-incognito.com/') {
		this.epir = epir;
		this.decCtx = decCtx;
		this.apiID = apiID;
		this.apiKey = apiKey;
		this.privkey = privkey;
		this.pubkey = this.epir.createPubkey(this.privkey);
		this.apiEndPoint = apiEndPoint;
	}
	
	async createAuth(body: string, nonce: number = ++this.lastNonce): Promise<{ nonce: number, signature: string }> {
		const hmac = await createHMAC(createSHA3(256), this.apiKey);
		hmac.init();
		hmac.update(nonce + ':' + body);
		const digest = Buffer.from(hmac.digest(), 'hex').toString('base64');
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
		const res = await (typeof fetch !== 'undefined' ? fetch : require('node-fetch'))(url, params);
		if(!res.ok) throw new Error((await res.json() as Response<T>).error);
		return (await res.json() as Response<T>).data;
	}
	
	async callAPIPublic<T>(path: string): Promise<T> {
		return await this.callAPI<T>(`pub/${path}`, 'GET');
	}
	
	async callAPIPrivate<T>(path: string, method: string, body: any): Promise<T> {
		const bodyStr = JSON.stringify(body);
		const auth = await this.createAuth(bodyStr);
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
		return await this.epir.createSelector(this.pubkey, indexCounts, idx);
	}
	
	async createSelectorFast(indexCounts: number[], idx: number): Promise<Uint8Array> {
		return await this.epir.createSelectorFast(this.privkey, indexCounts, idx);
	}
	
	async createSelector_(indexCounts: number[], idx: number, isFast: boolean = true): Promise<Uint8Array> {
		if(isFast) {
			return await this.createSelectorFast(indexCounts, idx);
		} else {
			return await this.createSelector(indexCounts, idx);
		}
	}
	
	// PUT /priv/utxo/:coin/:addrType/:searchType
	async getUTXO(coin: string, addrType: string, searchType: string, selector: Uint8Array): Promise<Uint8Array> {
		const path = `utxo/${coin}/${addrType}/${searchType}`;
		const body = { selector: Buffer.from(selector).toString('base64') };
		const replyStr = (await this.callAPIPrivate<{ reply: string }>(path, 'PUT', body)).reply;
		return new Uint8Array(Buffer.from(replyStr, 'base64'));
	}
	
	async decryptReply(reply: Uint8Array, dimension: number, packing: number): Promise<Uint8Array> {
		return await this.decCtx.decryptReply(this.privkey, dimension, packing, reply);
	}
	
	static decodeAddress(address: string): { buf: Buffer, coin: string, addrType: string } | null {
		try {
			const decoded = bs58check.decode(address);
			if(decoded.length != 21) return null;
			switch(decoded[0]) {
				case 0x00:
					return {
						buf: decoded.slice(1),
						coin: 'btc',
						addrType: 'p2pkh',
					};
				case 0x05:
					return {
						buf: decoded.slice(1),
						coin: 'btc',
						addrType: 'p2sh',
					};
				case 0x6f:
					return {
						buf: decoded.slice(1),
						coin: 'tbtc',
						addrType: 'p2pkh',
					};
				case 0xc4:
					return {
						buf: decoded.slice(1),
						coin: 'tbtc',
						addrType: 'p2sh',
					};
				default:
					return null;
			}
		} catch(e) {
			try {
				const decoded = bech32.decode(address);
				const coin = (decoded.prefix == 'bc' ? 'btc' : decoded.prefix == 'tb' ? 'tbtc' : null);
				if(!coin) return null;
				if(decoded.words[0] === 0) {
					const buf = Buffer.from(bech32.fromWords(decoded.words.slice(1)));
					if(buf.length == 20) {
						return {
							buf: buf,
							coin: coin,
							addrType: 'p2wpkh',
						};
					}
					if(buf.length == 32) {
						return {
							buf: buf,
							coin: coin,
							addrType: 'p2wsh',
						};
					}
					return null;
				// P2TR address format is not stale, we do not support it.
				/*
				} else if(bech32.version == 1) {
					if(buf.length < 32) return null;
					return {
						buf: buf.slice(0, 32),
						coin: coin,
						addrType: 'p2tr',
					};
				*/
				} else {
					return null;
				}
			} catch(e) {
				return null;
			}
		}
	}
	
	async findUTXOLocation(coin: string, addrType: string, addrBuf: Buffer, isFast?: boolean): Promise<number> {
		// Fetch UTXOSetInfo.
		const utxoSetInfoAddress = await this.getUTXOSetInfo(coin, addrType, 'address');
		let imin = 0;
		let imax = utxoSetInfoAddress.elemCount - 1;
		const begin = time();
		// Conduct an interpolation search.
		// FIXME: The number of queries sent to the server is not constant, and will leak some information about the index.
		let queriesSent = 0;
		let left = 0;
		let right = 0xffffffff;
		const my = addrBuf.readUInt32BE(0);
		for(; imin <= imax;) {
			//const imid = imin + ((imax - imin) >> 1);
			left = Math.min(left, my);
			right = Math.max(right, my);
			const imid = Math.round(imin + (imax - imin) * (my - left) / (right - left));
			const beginSelector = time();
			const selector = await this.createSelector_(utxoSetInfoAddress.indexCounts, imid, isFast);
			const beginQuery = time();
			const replyEncrypted = await this.getUTXO(coin, addrType, 'address', selector);
			const beginDecrypt = time();
			const reply =
				Buffer.from(await this.decryptReply(replyEncrypted, utxoSetInfoAddress.dimension, utxoSetInfoAddress.packing))
					.slice(0, addrBuf.length);
			queriesSent++;
			this.logger(`Quering at position = ${imid.toLocaleString().padStart(10, ' ')} | Execution time: selector = ${(beginQuery-beginSelector).toLocaleString().padStart(5, ' ')}ms, query = ${(beginDecrypt-beginQuery).toLocaleString().padStart(5, ' ')}ms, decrypt = ${(time()-beginDecrypt).toLocaleString().padStart(5, ' ')}ms.`);
			const cmp = addrBuf.compare(reply);
			if(cmp < 0) {
				imax = imid - 1;
				right = reply.readUInt32BE(0);
			} else if(cmp > 0) {
				imin = imid + 1;
				left = reply.readUInt32BE(0);
			} else {
				this.logger(`The position found at ${imid.toLocaleString()} in ${(time() - begin).toLocaleString()}ms by sending ${queriesSent} queries.`);
				return imid;
			}
		}
		return -1;
	}
	
	async getUTXORangeAt(coin: string, addrType: string, loc: number, isFast?: boolean): Promise<{ begin: number, count: number }> {
		const utxoSetInfoRange = await this.getUTXOSetInfo(coin, addrType, 'range');
		const selector = await this.createSelector_(utxoSetInfoRange.indexCounts, loc, isFast);
		const encrypted = await this.getUTXO(coin, addrType, 'range', selector);
		const decrypted = Buffer.from(await this.decryptReply(encrypted, utxoSetInfoRange.dimension, utxoSetInfoRange.packing));
		const begin = decrypted.readUInt32LE(0);
		const count = decrypted.readUInt32LE(4);
		return { begin, count }
	}
	
	// For browser fallback.
	static readBigUInt64LE(buf: Buffer, pos: number): number {
		if(typeof buf.readBigUInt64LE !== 'undefined') {
			return parseInt(buf.readBigUInt64LE(pos).toString());
		} else {
			const low = buf.readUInt32LE(pos);
			const high = buf.readUInt32LE(pos + 4);
			return low + high * (2 ** 32);
		}
	}
	
	async getUTXOsInRange(coin: string, addrType: string, begin: number, count: number, isFast?: boolean): Promise<UTXOEntry[]> {
		const utxoSetInfoFind = await this.getUTXOSetInfo(coin, addrType, 'find');
		const ret: UTXOEntry[] = [];
		for(let i=begin; i<begin+count; i++) {
			const selector = await this.createSelector_(utxoSetInfoFind.indexCounts, i, isFast);
			const utxoReply = await this.getUTXO(coin, addrType, 'find', selector);
			const utxoBuf = Buffer.from(await this.decryptReply(utxoReply, utxoSetInfoFind.dimension, utxoSetInfoFind.packing));
			ret.push({
				txid: utxoBuf.slice(0, 32).toString('hex'),
				vout: utxoBuf.readUInt32LE(32),
				value: CryptoIncognito.readBigUInt64LE(utxoBuf, 36),
			});
		}
		return ret;
	}
	
	// Conduct a PIR binary search to find the location of the specified address and retrieves all UTXOs matching the address.
	async findUTXOs(address: string, isFast?: boolean): Promise<UTXOEntry[]> {
		const beginFunc = time();
		// Decode address.
		const decodedResult = CryptoIncognito.decodeAddress(address);
		if(!decodedResult) throw new Error('Failed to determine address type.');
		const addrBuf = decodedResult.buf;
		const coin = decodedResult.coin;
		const addrType = decodedResult.addrType;
		// Find the UTXO location.
		const loc = await this.findUTXOLocation(coin, addrType, addrBuf, isFast);
		if(loc < 0) return [];
		// Query the range.
		const { begin, count } = await this.getUTXORangeAt(coin, addrType, loc, isFast);
		// Query for UTXOs.
		const utxos = await this.getUTXOsInRange(coin, addrType, begin, count, isFast);
		this.logger(`Computation done in ${(time() - beginFunc).toLocaleString()}ms.`);
		return utxos;
	}
	
}

