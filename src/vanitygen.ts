
import * as bech32 from 'bech32';

(async () => {
	
	if(process.argv.length < 4) {
		console.log('ts-node ./vanitygen.ts (bc|tb) STRING');
		return;
	}
	
	const prefix = process.argv[2];
	const str = process.argv[3];
	const map: { [key: string]: string } = {
		0: '0', 1: 'l', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
		a: 'a', b: 'd', c: 'c', d: 'd', e: 'e', f: 'f', g: 'g', h: 'h', i: 'l', j: 'j',
		k: 'k', l: 'l', m: 'm', n: 'n', o: '0', p: 'p', q: 'q', r: 'r', s: 's', t: 't',
		u: 'u', v: 'v', w: 'w', x: 'x', y: 'y', z: 'z'
	};
	const mappedStr = (str.split('').map((c) => map[c] || 'v').join('') + 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx').slice(0, 32);
	console.log(`The target STRING is ${mappedStr}`);
	const bech32chars = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
	const words = mappedStr.split('').map((c) => bech32chars.indexOf(c));
	words.unshift(0);
	const bech32str = bech32.encode(prefix, words);
	console.log(bech32str);
	
})();

