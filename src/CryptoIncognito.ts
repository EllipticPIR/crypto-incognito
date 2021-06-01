
import { createHMAC, createSHA3 } from 'hash-wasm';
import * as bs58check from 'bs58check';
import { bech32 } from 'bech32';
import { Mutex } from 'await-semaphore';
import Redis from 'ioredis';
import Redlock from 'redlock';

import { EpirBase, DecryptionContextBase, SelectorFactoryBase } from 'epir/dist/types';
import { time, arrayBufferCompare } from 'epir/dist/util';

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

export interface NonceGenerator<Lock> {
	acquire: () => Promise<Lock>;
	release: (lock: Lock) => Promise<void>;
	getNonce: () => Promise<number>;
}

export class NonceGeneratorMutex implements NonceGenerator<() => void> {
	constructor(public mutex: Mutex = new Mutex(), public currentNonce = new Date().getTime()) {
	}
	async acquire() {
		const release = await this.mutex.acquire();
		this.currentNonce++;
		return release;
	}
	async release(release: () => void) {
		release();
	}
	async getNonce() {
		return this.currentNonce;
	}
}

export class NonceGeneratorRedlock implements NonceGenerator<Redlock.Lock> {
	redlock: Redlock;
	resource: string = 'com.crypto-incognito.nonce-lock';
	key: string = 'com.crypto-incognito.nonce';
	ttl: number = 5000;
	constructor(public redis: Redis.Redis) {
		this.redlock = new Redlock([redis], { retryCount: 100 });
	}
	async acquire() {
		const lock = await this.redlock.lock(this.resource, this.ttl);
		const nonce = await this.redis.get(this.key);
		if(!nonce) {
			await this.redis.set(this.key, time());
		} else {
			await this.redis.set(this.key, Math.max(time(), parseInt(nonce) + 1));
		}
		return lock;
	}
	async release(lock: Redlock.Lock) {
		await lock.unlock();
	}
	async getNonce() {
		const nonce = await this.redis.get(this.key);
		return parseInt(nonce!);
	}
}

export const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
	return btoa(String.fromCharCode(...new Uint8Array(buf)));
};

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
	return new Uint8Array(atob(base64).split('').map((c) => c.charCodeAt(0))).buffer;
};

export const decodeAddressBase58Check = (address: string): { buf: ArrayBuffer, coin: string, addrType: string } => {
	const decoded = bs58check.decode(address);
	if(decoded.length != 21) throw new Error('The address has an invalid base58check payload length.');
	const coinAndType = ((version: number): { coin: string, addrType: string } => {
		if(version === 0x00) return { coin:  'btc', addrType: 'p2pkh' };
		if(version === 0x05) return { coin:  'btc', addrType: 'p2sh' };
		if(version === 0x6f) return { coin: 'tbtc', addrType: 'p2pkh' };
		if(version === 0xc4) return { coin: 'tbtc', addrType: 'p2sh' };
		throw new Error('Unknown Base58Check version.');
	})(decoded[0]);
	return {
		buf: new Uint8Array(decoded.slice(1)).buffer,
		coin: coinAndType.coin,
		addrType: coinAndType.addrType,
	}
};

export const decodeAddressBech32 = (address: string): { buf: ArrayBuffer, coin: string, addrType: string } => {
	const decoded = bech32.decode(address);
	const coin = (decoded.prefix == 'bc' ? 'btc' : decoded.prefix == 'tb' ? 'tbtc' : null);
	if(!coin) throw new Error('Unknown Bech32 prefix.');
	const version = decoded.words[0];
	if(version === 0) {
		const buf = new Uint8Array(bech32.fromWords(decoded.words.slice(1)));
		const addrType = ((len: number): string => {
			if(len == 20) return 'p2wpkh';
			if(len == 32) return 'p2wsh';
			throw new Error('The address has an invalid Bech32 payload length.');
		})(buf.length);
		return {
			buf: buf.buffer,
			coin: coin,
			addrType: addrType,
		};
	}
	// P2TR address format is not stale, we do not support it.
	/*
	if(version == 1) {
		if(buf.length < 32) return null;
		return {
			buf: buf.slice(0, 32),
			coin: coin,
			addrType: 'p2tr',
		};
	}
	*/
	throw new Error('Unknown Bech32 version.');
};

export const decodeAddress = (address: string): { buf: ArrayBuffer, coin: string, addrType: string } => {
	try {
		return decodeAddressBase58Check(address);
	} catch(e) {
		try {
			return decodeAddressBech32(address);
		} catch(e) {
			throw new Error('Failed to decode the input address.');
		}
	}
};

export class CryptoIncognito {
	
	//logger: (str: string) => void = console.log;
	logger: (str: string) => void = (str: string) => {};
	
	pubkey: ArrayBuffer;
	
	selectorFactory: SelectorFactoryBase | null = null;
	
	constructor(
		public epir: EpirBase, public decCtx: DecryptionContextBase,
		public apiID: string, public apiKey: string,
		public nonceGenerator: NonceGenerator<any>,
		public privkey: ArrayBuffer = epir.createPrivkey(),
		public apiEndPoint: string = 'https://api.crypto-incognito.com/') {
		this.pubkey = this.epir.createPubkey(this.privkey);
	}
	
	async createSignature(body: string, nonce: number): Promise<string> {
		const hmac = await createHMAC(createSHA3(256), this.apiKey);
		hmac.init();
		hmac.update(nonce + ':' + body);
		return arrayBufferToBase64(hmac.digest('binary'));
	}
	
	async callAPI<T>(path: string, method: string, headers: { [key: string]: string } = {}, body?: string): Promise<T> {
		const url = `${this.apiEndPoint}${path}`;
		headers['Content-Type'] = 'application/json';
		let params: any = {
			method: method,
			headers: headers,
		};
		if(['POST', 'PUT', 'DELETE'].indexOf(method) >= 0) {
			if(typeof body === 'undefined') throw new Error(`body is required to call this API.`);
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
		const lock = await this.nonceGenerator.acquire();
		const nonce = await this.nonceGenerator.getNonce();
		const signature = await this.createSignature(bodyStr, nonce);
		const headers = {
			'X-Nonce': nonce.toString(),
			'X-API-ID': this.apiID,
			'X-Signature': signature,
		}
		const ret = await this.callAPI<T>(`priv/${path}`, method, headers, bodyStr);
		this.nonceGenerator.release(lock);
		return ret;
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
	
	async createSelector(indexCounts: number[], idx: number): Promise<ArrayBuffer> {
		return await this.epir.createSelector(this.pubkey, indexCounts, idx);
	}
	
	async createSelectorFast(indexCounts: number[], idx: number): Promise<ArrayBuffer> {
		return await this.epir.createSelectorFast(this.privkey, indexCounts, idx);
	}
	
	async createSelector_(indexCounts: number[], idx: number, isFast: boolean = true): Promise<ArrayBuffer> {
		if(this.selectorFactory) {
			return this.selectorFactory.create(indexCounts, idx);
		}
		if(isFast) {
			return await this.createSelectorFast(indexCounts, idx);
		} else {
			return await this.createSelector(indexCounts, idx);
		}
	}
	
	// PUT /priv/utxo/:coin/:addrType/:searchType
	async getUTXO(coin: string, addrType: string, searchType: string, selector: ArrayBuffer): Promise<ArrayBuffer> {
		const path = `utxo/${coin}/${addrType}/${searchType}`;
		const body = { selector: arrayBufferToBase64(selector) };
		const replyStr = (await this.callAPIPrivate<{ reply: string }>(path, 'PUT', body)).reply;
		return base64ToArrayBuffer(replyStr);
	}
	
	async decryptReply(reply: ArrayBuffer, dimension: number, packing: number): Promise<ArrayBuffer> {
		return await this.decCtx.decryptReply(this.privkey, dimension, packing, reply);
	}
	
	async selectorFactoryFill() {
		if(this.selectorFactory) {
			await this.selectorFactory.fill();
		}
	}
	
	async findUTXOLocation(coin: string, addrType: string, addrBuf: ArrayBuffer, isFast?: boolean): Promise<number> {
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
		const my = new DataView(addrBuf).getUint32(0, false);
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
			const reply = await this.decryptReply(replyEncrypted, utxoSetInfoAddress.dimension, utxoSetInfoAddress.packing)
			queriesSent++;
			this.logger(`Quering at position = ${imid.toLocaleString().padStart(10, ' ')} | Execution time: selector = ${(beginQuery-beginSelector).toLocaleString().padStart(5, ' ')}ms, query = ${(beginDecrypt-beginQuery).toLocaleString().padStart(5, ' ')}ms, decrypt = ${(time()-beginDecrypt).toLocaleString().padStart(5, ' ')}ms.`);
			const cmp = arrayBufferCompare(addrBuf, 0, reply, 0, addrBuf.byteLength);
			if(cmp < 0) {
				imax = imid - 1;
				right = new DataView(reply).getUint32(0, false);
			} else if(cmp > 0) {
				imin = imid + 1;
				left = new DataView(reply).getUint32(0, false);
			} else {
				this.logger(`The position found at ${imid.toLocaleString()} in ${(time() - begin).toLocaleString()}ms by sending ${queriesSent} queries.`);
				return imid;
			}
		}
		this.selectorFactoryFill();
		return -1;
	}
	
	async getUTXORangeAt(coin: string, addrType: string, loc: number, isFast?: boolean): Promise<{ begin: number, count: number }> {
		const utxoSetInfoRange = await this.getUTXOSetInfo(coin, addrType, 'range');
		const selector = await this.createSelector_(utxoSetInfoRange.indexCounts, loc, isFast);
		const encrypted = await this.getUTXO(coin, addrType, 'range', selector);
		const decrypted = await this.decryptReply(encrypted, utxoSetInfoRange.dimension, utxoSetInfoRange.packing);
		const dataView = new DataView(decrypted);
		const begin = dataView.getUint32(0, true);
		const count = dataView.getUint32(4, true);
		this.selectorFactoryFill();
		return { begin, count }
	}
	
	async getUTXOAt(utxoSetInfoFind: UTXOSetInfo, coin: string, addrType: string, idx: number, isFast?: boolean): Promise<UTXOEntry> {
		const selector = await this.createSelector_(utxoSetInfoFind.indexCounts, idx, isFast);
		const utxoReply = await this.getUTXO(coin, addrType, 'find', selector);
		const utxoBuf = await this.decryptReply(utxoReply, utxoSetInfoFind.dimension, utxoSetInfoFind.packing);
		const dataView = new DataView(utxoBuf);
		this.selectorFactoryFill();
		return {
			txid: [...new Uint8Array(utxoBuf.slice(0, 32))].map((n) => n.toString(16).padStart(2, '0')).join(''),
			vout: dataView.getUint32(32, true),
			value: parseInt(dataView.getBigUint64(36, true).toString()),
		};
	}
	
	async getUTXOsInRange(coin: string, addrType: string, begin: number, count: number, isFast?: boolean): Promise<UTXOEntry[]> {
		const utxoSetInfoFind = await this.getUTXOSetInfo(coin, addrType, 'find');
		const ret: Promise<UTXOEntry>[] = [];
		for(let i=begin; i<begin+count; i++) {
			ret.push(this.getUTXOAt(utxoSetInfoFind, coin, addrType, i, isFast));
		}
		return await Promise.all(ret);
	}
	
	// Conduct a PIR binary search to find the location of the specified address and retrieves all UTXOs matching the address.
	async findUTXOs(address: string, isFast?: boolean): Promise<UTXOEntry[]> {
		const beginFunc = time();
		// Decode address.
		const decodedResult = decodeAddress(address);
		const addrBuf = decodedResult.buf;
		const coin = decodedResult.coin;
		const addrType = decodedResult.addrType;
		// Find the UTXO location.
		const loc = await this.findUTXOLocation(coin, addrType, addrBuf, isFast);
		if(loc < 0) return [];
		// Query the range.
		const { begin, count } = await this.getUTXORangeAt(coin, addrType, loc, isFast);
		this.logger(`The UTXO range: from: ${begin} to: ${begin + count - 1}, count: ${count}.`);
		// Query for UTXOs.
		const utxos = await this.getUTXOsInRange(coin, addrType, begin, count, isFast);
		this.logger(`Computation done in ${(time() - beginFunc).toLocaleString()}ms.`);
		return utxos;
	}
	
}

