
import { decodeAddress } from '../CryptoIncognito';

export const printBuffer = (buf: Buffer) => {
	console.log(buf.toString('hex').match(/.{2}/g)!.map((h) => '0x' + h).join(', '));
};

//printBuffer(decodeAddress('ADDRESS')!.buf);

describe('BTC', () => {
	test.concurrent.each([
		['1P5ZEDWTKTFGxQjZphgWPQUpe554WKDfHQ', {
			buf: new Uint8Array([
				0xf2, 0x2f, 0x55, 0x63, 0x83, 0x9b, 0xa6, 0xba,
				0x5a, 0xa8, 0xd3, 0x72, 0x6f, 0xcb, 0xc6, 0x75,
				0xcb, 0x3e, 0x4c, 0x9e
			]),
			coin: 'btc',
			addrType: 'p2pkh',
		}],
		['34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo', {
			buf: new Uint8Array([
				0x23, 0xe5, 0x22, 0xdf, 0xc6, 0x65, 0x6a, 0x8f,
				0xda, 0x3d, 0x47, 0xb4, 0xfa, 0x53, 0xf7, 0x58,
				0x5a, 0xc7, 0x58, 0xcd
			]),
			coin: 'btc',
			addrType: 'p2sh',
		}],
		['bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6', {
			buf: new Uint8Array([
				0xed, 0x1d, 0x64, 0x77, 0x2e, 0x53, 0x6c, 0xca,
				0x6a, 0xc9, 0x64, 0xaa, 0x59, 0x3f, 0xac, 0xa4,
				0xf7, 0xfa, 0xd0, 0xc5
			]),
			coin: 'btc',
			addrType: 'p2wpkh',
		}],
		['bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97', {
			buf: new Uint8Array([
				0x43, 0x64, 0x06, 0x3f, 0xac, 0x88, 0x29, 0xa9,
				0x31, 0xa7, 0x52, 0xec, 0xd9, 0x04, 0x9e, 0x43,
				0x42, 0x5e, 0x2c, 0xeb, 0xf8, 0x36, 0x81, 0x87,
				0x6c, 0x55, 0x60, 0x02, 0xbf, 0x38, 0x9b, 0x00
			]),
			coin: 'btc',
			addrType: 'p2wsh',
		}],
		/*
		['bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0', {
			buf: new Uint8Array([
			]),
			coin: 'btc',
			addrType: 'p2tr',
		}],
		*/
	])('%s', async (address, expected) => {
		const decoded = decodeAddress(address);
		expect(new Uint8Array(decoded.buf)).toEqual(expected.buf);
		expect(decoded.coin).toEqual(expected.coin);
		expect(decoded.addrType).toEqual(expected.addrType);
	});
});

describe('tBTC', () => {
	test.concurrent.each([
		['miner8VH6WPrsQ1Fxqb7MPgJEoFYX2RCkS', {
			buf: new Uint8Array([
				0x23, 0xe0, 0x77, 0xff, 0xac, 0x6f, 0x10, 0x97,
				0x95, 0xa8, 0x20, 0x21, 0xdc, 0x16, 0x98, 0xbd,
				0x9c, 0xe4, 0x01, 0x19
			]),
			coin: 'tbtc',
			addrType: 'p2pkh',
		}],
		['2N9L2MuvxoQpMXXoUR6UcJo5ar966CZdMWR', {
			buf: new Uint8Array([
				0xb0, 0x6a, 0x62, 0xf5, 0x26, 0x3d, 0xb6, 0xee,
				0x8a, 0xea, 0x13, 0x7a, 0xcd, 0xf6, 0xae, 0x9c,
				0x25, 0x07, 0x49, 0x30
			]),
			coin: 'tbtc',
			addrType: 'p2sh',
		}],
		['tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', {
			buf: new Uint8Array([
				0x75, 0x1e, 0x76, 0xe8, 0x19, 0x91, 0x96, 0xd4,
				0x54, 0x94, 0x1c, 0x45, 0xd1, 0xb3, 0xa3, 0x23,
				0xf1, 0x43, 0x3b, 0xd6
			]),
			coin: 'tbtc',
			addrType: 'p2wpkh',
		}],
		['tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', {
			buf: new Uint8Array([
				0x18, 0x63, 0x14, 0x3c, 0x14, 0xc5, 0x16, 0x68,
				0x04, 0xbd, 0x19, 0x20, 0x33, 0x56, 0xda, 0x13,
				0x6c, 0x98, 0x56, 0x78, 0xcd, 0x4d, 0x27, 0xa1,
				0xb8, 0xc6, 0x32, 0x96, 0x04, 0x90, 0x32, 0x62
			]),
			coin: 'tbtc',
			addrType: 'p2wsh',
		}],
		/*
		['tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0', {
			buf: new Uint8Array([
			]),
			coin: 'tbtc',
			addrType: 'p2tr',
		}],
		*/
	])('%s', async (address, expected) => {
		const decoded = decodeAddress(address);
		expect(new Uint8Array(decoded.buf)).toEqual(expected.buf);
		expect(decoded.coin).toEqual(expected.coin);
		expect(decoded.addrType).toEqual(expected.addrType);
	});
});

describe('Invalid', () => {
	test.concurrent.each([
		// Unknown Base58Check version.
		'PKXRrJDoLE4sN7rN27TYWaRwQYYj3jsj8y',
		// Unknown Base58Check payload size.
		'5Kd3NBUAdUnhyzenEwVLy9pBKxSwXvE9FMPyR4UKZvpe6E3AgLr',
		// Invalid Bech32 payload size.
		'bc1qxxxxxxxxxxxxxxxxk45wpq',
		// Unknown Bech32 prefix.
		'mona1q5w6nxlqsh4pdd3rwlkl894w6ykjg3uzylvcl7jwfkep8pvmas73sj4pasd',
		// Unknown Bech32 version.
		'bc1lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxq6htf6q',
	])('%s', async (address, expected) => {
		expect(() => { decodeAddress(address) }).toThrow();
	});
});

